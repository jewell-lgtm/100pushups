// Covers `repository.upsertWeeklyPlan` (the persistence half of Phase
// 4.3) and the read path the Plan screen uses, against a tiny
// in-process fake of the SQLiteDatabase surface. We avoid pulling
// expo-sqlite's native binding into Node, mirroring the strategy in
// `__tests__/db/sync.test.ts`.
//
// The fake grew an in-memory `sessions` table when Phase 11.5
// (calendar grid) needed `getMonthSessions`, `getLongestStreak`, and
// `getRecentSessions` — same shape as production SQLite, just enough
// query routing to keep the repository implementation honest.

import type { SQLiteDatabase } from 'expo-sqlite';
import { createRepository, parseDailyTargets } from '../../src/db/repository';

interface WeeklyPlanRow {
  id: string;
  exercise_id: string;
  week_start: string;
  evaluation_reps: number | null;
  daily_targets: string;
  notes: string | null;
  created_at: string;
}

interface SessionRow {
  id: string;
  exercise_id: string;
  started_at: string;
  total_reps: number | null;
  set_count: number | null;
  user_feedback: string | null;
}

// `started_at` is an ISO timestamp; `date(...)` in production SQLite
// returns the UTC YYYY-MM-DD prefix.
function utcDate(iso: string): string {
  return iso.slice(0, 10);
}

function makeFakeDb(
  rows: WeeklyPlanRow[] = [],
  sessions: SessionRow[] = [],
): SQLiteDatabase {
  return {
    async runAsync(query: string, params?: unknown[]): Promise<{ changes: number; lastInsertRowId: number }> {
      // Match both INSERT and INSERT OR REPLACE on weekly_plans.
      if (/INSERT(?:\s+OR\s+REPLACE)?\s+INTO\s+weekly_plans/i.test(query) && params) {
        const [id, exerciseId, weekStart, evalReps, dailyTargets, notes] = params as [
          string, string, string, number | null, string, string | null,
        ];
        const idx = rows.findIndex((r) => r.id === id);
        const row: WeeklyPlanRow = {
          id,
          exercise_id: exerciseId,
          week_start: weekStart,
          evaluation_reps: evalReps,
          daily_targets: dailyTargets,
          notes,
          created_at: '2026-05-10T00:00:00Z',
        };
        if (idx >= 0) rows[idx] = row;
        else rows.push(row);
        return { changes: 1, lastInsertRowId: 0 };
      }
      return { changes: 0, lastInsertRowId: 0 };
    },
    async getFirstAsync<T>(query: string, params?: unknown[]): Promise<T | null> {
      if (/SELECT \* FROM weekly_plans/i.test(query) && params) {
        const exerciseId = params[0] as string;
        // Mimic the production query: filter by exercise_id, week_start
        // <= today, order by week_start desc.
        const today = new Date().toISOString().slice(0, 10);
        const candidates = rows
          .filter((r) => r.exercise_id === exerciseId && r.week_start <= today)
          .sort((a, b) => b.week_start.localeCompare(a.week_start));
        return (candidates[0] ?? null) as T | null;
      }
      if (/SELECT daily_targets FROM weekly_plans/i.test(query) && params) {
        const exerciseId = params[0] as string;
        const today = new Date().toISOString().slice(0, 10);
        const candidates = rows
          .filter((r) => r.exercise_id === exerciseId && r.week_start <= today)
          .sort((a, b) => b.week_start.localeCompare(a.week_start));
        const r = candidates[0];
        return r ? ({ daily_targets: r.daily_targets } as T) : null;
      }
      return null;
    },
    async getAllAsync<T>(query: string, params?: unknown[]): Promise<T[]> {
      // getMonthSessions: aggregate total_reps per UTC day over a
      // [start, end) window for the given exercise.
      if (/FROM sessions/i.test(query)
          && /GROUP BY date\(started_at\)/i.test(query)
          && params) {
        const [exerciseId, start, end] = params as [string, string, string];
        const buckets = new Map<string, number>();
        for (const s of sessions) {
          if (s.exercise_id !== exerciseId) continue;
          if (s.started_at < start || s.started_at >= end) continue;
          const d = utcDate(s.started_at);
          buckets.set(d, (buckets.get(d) ?? 0) + (s.total_reps ?? 0));
        }
        const out = Array.from(buckets.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([d, total_reps]) => ({ d, total_reps }));
        return out as unknown as T[];
      }
      // getMonthSessions plan lookup.
      if (/SELECT week_start, daily_targets FROM weekly_plans/i.test(query) && params) {
        const [exerciseId, end] = params as [string, string];
        const out = rows
          .filter((r) => r.exercise_id === exerciseId && r.week_start < end)
          .sort((a, b) => b.week_start.localeCompare(a.week_start))
          .map((r) => ({ week_start: r.week_start, daily_targets: r.daily_targets }));
        return out as unknown as T[];
      }
      // getLongestStreak: distinct UTC dates ascending.
      if (/SELECT DISTINCT date\(started_at\) as d FROM sessions/i.test(query)
          && /ORDER BY d ASC/i.test(query)
          && params) {
        const [exerciseId] = params as [string];
        const days = new Set<string>();
        for (const s of sessions) {
          if (s.exercise_id !== exerciseId) continue;
          days.add(utcDate(s.started_at));
        }
        const out = Array.from(days).sort().map((d) => ({ d }));
        return out as unknown as T[];
      }
      // getRecentSessions.
      if (/SELECT id, started_at, total_reps, set_count, user_feedback\s+FROM sessions/i.test(query)
          && params) {
        const [exerciseId, limit] = params as [string, number];
        const out = sessions
          .filter((s) => s.exercise_id === exerciseId)
          .sort((a, b) => b.started_at.localeCompare(a.started_at))
          .slice(0, limit)
          .map((s) => ({
            id: s.id,
            started_at: s.started_at,
            total_reps: s.total_reps,
            set_count: s.set_count,
            user_feedback: s.user_feedback,
          }));
        return out as unknown as T[];
      }
      return [];
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function makeSession(overrides: Partial<SessionRow> & { id: string; started_at: string }): SessionRow {
  return {
    exercise_id: 'pushups',
    total_reps: 30,
    set_count: 3,
    user_feedback: null,
    ...overrides,
  };
}

describe('repository.upsertWeeklyPlan', () => {
  it('inserts a new row and stringifies dailyTargets to JSON', async () => {
    const rows: WeeklyPlanRow[] = [];
    const repo = createRepository(makeFakeDb(rows));

    await repo.upsertWeeklyPlan({
      id: 'plan-1',
      exerciseId: 'pushups',
      weekStart: '2026-01-05',
      dailyTargets: { mon: 20, tue: 22, wed: 24, thu: 22, fri: 26, sat: 0, sun: 28 },
      notes: 'progressive',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('plan-1');
    expect(rows[0].exercise_id).toBe('pushups');
    expect(rows[0].week_start).toBe('2026-01-05');
    expect(rows[0].evaluation_reps).toBeNull();
    expect(rows[0].notes).toBe('progressive');
    expect(parseDailyTargets(rows[0].daily_targets)).toEqual({
      mon: 20, tue: 22, wed: 24, thu: 22, fri: 26, sat: 0, sun: 28,
    });
  });

  it('replaces the existing row when called again with the same id', async () => {
    const rows: WeeklyPlanRow[] = [];
    const repo = createRepository(makeFakeDb(rows));

    await repo.upsertWeeklyPlan({
      id: 'plan-1', exerciseId: 'pushups', weekStart: '2026-01-05',
      dailyTargets: { mon: 10, tue: 10, wed: 10, thu: 10, fri: 10, sat: 0, sun: 10 },
      notes: 'v1',
    });
    await repo.upsertWeeklyPlan({
      id: 'plan-1', exerciseId: 'pushups', weekStart: '2026-01-05',
      dailyTargets: { mon: 30, tue: 30, wed: 30, thu: 30, fri: 30, sat: 0, sun: 30 },
      notes: 'v2',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].notes).toBe('v2');
    expect(parseDailyTargets(rows[0].daily_targets).mon).toBe(30);
  });

  it('preserves the optional evaluationReps when provided', async () => {
    const rows: WeeklyPlanRow[] = [];
    const repo = createRepository(makeFakeDb(rows));

    await repo.upsertWeeklyPlan({
      id: 'plan-1', exerciseId: 'pushups', weekStart: '2026-01-05',
      dailyTargets: { mon: 20 }, notes: null, evaluationReps: 17,
    });

    expect(rows[0].evaluation_reps).toBe(17);
  });
});

describe('repository read after upsert (smoke)', () => {
  it('round-trips a freshly upserted plan through getCurrentWeeklyPlan', async () => {
    const rows: WeeklyPlanRow[] = [];
    const repo = createRepository(makeFakeDb(rows));

    // Use a past weekStart so the production filter (`week_start <= today`)
    // matches without depending on system clock.
    await repo.upsertWeeklyPlan({
      id: 'plan-1',
      exerciseId: 'pushups',
      weekStart: '2026-01-05',
      dailyTargets: { mon: 20, tue: 22, wed: 24, thu: 22, fri: 26, sat: 0, sun: 28 },
      notes: 'progressive',
    });

    const got = await repo.getCurrentWeeklyPlan('pushups');
    expect(got).not.toBeNull();
    expect(got!.id).toBe('plan-1');
    expect(got!.weekStart).toBe('2026-01-05');
    expect(got!.dailyTargets.wed).toBe(24);
    expect(got!.notes).toBe('progressive');
  });

  it('returns null when no plan exists for the exercise', async () => {
    const repo = createRepository(makeFakeDb([]));
    const got = await repo.getCurrentWeeklyPlan('pushups');
    expect(got).toBeNull();
  });
});

// Phase 4.1: first-run flow. A clean install has no sessions, no sets, and
// no weekly_plans. buildVoiceContext must degrade to all-nulls + streak=0
// so the dashboard renders em-dashes and the workout greeting drops to
// the bare "Say ready when you want to start." form.
describe('repository.buildVoiceContext on an empty DB', () => {
  it('returns all-nulls + streak=0 with no sessions or plans', async () => {
    const repo = createRepository(makeFakeDb([]));
    const ctx = await repo.buildVoiceContext('pushups');
    expect(ctx).toEqual({
      todayTarget: null,
      yesterdayTotal: null,
      personalBest: null,
      streak: 0,
      sessionType: 'regular',
    });
  });
});

// Phase 11.5: History calendar grid reads.
describe('repository.getMonthSessions', () => {
  it('returns an empty array when no sessions exist for the month', async () => {
    const repo = createRepository(makeFakeDb([], []));
    const got = await repo.getMonthSessions(2026, 5, 'pushups');
    expect(got).toEqual([]);
  });

  it('aggregates multiple sessions on the same UTC day into a single entry', async () => {
    const sessions: SessionRow[] = [
      makeSession({ id: 's1', started_at: '2026-05-10T08:00:00Z', total_reps: 25 }),
      makeSession({ id: 's2', started_at: '2026-05-10T18:30:00Z', total_reps: 15 }),
      makeSession({ id: 's3', started_at: '2026-05-11T08:00:00Z', total_reps: 20 }),
    ];
    const repo = createRepository(makeFakeDb([], sessions));
    const got = await repo.getMonthSessions(2026, 5, 'pushups');
    expect(got).toEqual([
      { day: 10, totalReps: 40, target: null },
      { day: 11, totalReps: 20, target: null },
    ]);
  });

  it('excludes sessions from adjacent months on either boundary', async () => {
    const sessions: SessionRow[] = [
      // April 30 — just before the May window.
      makeSession({ id: 's-pre', started_at: '2026-04-30T23:59:59Z', total_reps: 99 }),
      // May 1 — first inclusive day.
      makeSession({ id: 's-first', started_at: '2026-05-01T00:00:01Z', total_reps: 11 }),
      // May 31 — last inclusive day.
      makeSession({ id: 's-last', started_at: '2026-05-31T23:00:00Z', total_reps: 22 }),
      // June 1 — first exclusive day on the upper boundary.
      makeSession({ id: 's-post', started_at: '2026-06-01T00:00:01Z', total_reps: 88 }),
    ];
    const repo = createRepository(makeFakeDb([], sessions));
    const got = await repo.getMonthSessions(2026, 5, 'pushups');
    expect(got.map((d) => d.day)).toEqual([1, 31]);
    expect(got.map((d) => d.totalReps)).toEqual([11, 22]);
  });

  it('attaches the weekly_plan target when a plan covers the day', async () => {
    // Plan starts Mon 2026-05-04; targets keyed by weekday short name.
    // 2026-05-10 is a Sunday.
    const plans: WeeklyPlanRow[] = [{
      id: 'plan-1', exercise_id: 'pushups', week_start: '2026-05-04',
      evaluation_reps: null,
      daily_targets: JSON.stringify({ mon: 20, tue: 22, wed: 24, thu: 22, fri: 26, sat: 0, sun: 30 }),
      notes: null, created_at: '2026-05-04T00:00:00Z',
    }];
    const sessions: SessionRow[] = [
      makeSession({ id: 's1', started_at: '2026-05-10T08:00:00Z', total_reps: 28 }),
    ];
    const repo = createRepository(makeFakeDb(plans, sessions));
    const got = await repo.getMonthSessions(2026, 5, 'pushups');
    expect(got).toEqual([{ day: 10, totalReps: 28, target: 30 }]);
  });

  it('December → January handles the year rollover in the upper bound', async () => {
    const sessions: SessionRow[] = [
      makeSession({ id: 's1', started_at: '2026-12-31T20:00:00Z', total_reps: 12 }),
      // January next year must be excluded.
      makeSession({ id: 's2', started_at: '2027-01-01T01:00:00Z', total_reps: 99 }),
    ];
    const repo = createRepository(makeFakeDb([], sessions));
    const got = await repo.getMonthSessions(2026, 12, 'pushups');
    expect(got).toEqual([{ day: 31, totalReps: 12, target: null }]);
  });
});

describe('repository.getLongestStreak', () => {
  it('returns 0 on an empty DB', async () => {
    const repo = createRepository(makeFakeDb([], []));
    expect(await repo.getLongestStreak('pushups')).toBe(0);
  });

  it('returns 1 for a single isolated session', async () => {
    const sessions: SessionRow[] = [
      makeSession({ id: 's1', started_at: '2026-05-10T08:00:00Z' }),
    ];
    const repo = createRepository(makeFakeDb([], sessions));
    expect(await repo.getLongestStreak('pushups')).toBe(1);
  });

  it('returns 5 for five consecutive days', async () => {
    const sessions: SessionRow[] = [
      makeSession({ id: 's1', started_at: '2026-05-10T08:00:00Z' }),
      makeSession({ id: 's2', started_at: '2026-05-11T08:00:00Z' }),
      makeSession({ id: 's3', started_at: '2026-05-12T08:00:00Z' }),
      makeSession({ id: 's4', started_at: '2026-05-13T08:00:00Z' }),
      makeSession({ id: 's5', started_at: '2026-05-14T08:00:00Z' }),
    ];
    const repo = createRepository(makeFakeDb([], sessions));
    expect(await repo.getLongestStreak('pushups')).toBe(5);
  });

  it('resets after a gap and reports the longest run, not the latest', async () => {
    const sessions: SessionRow[] = [
      // Run of 3.
      makeSession({ id: 's1', started_at: '2026-05-01T08:00:00Z' }),
      makeSession({ id: 's2', started_at: '2026-05-02T08:00:00Z' }),
      makeSession({ id: 's3', started_at: '2026-05-03T08:00:00Z' }),
      // Gap (May 4 skipped).
      // Run of 2.
      makeSession({ id: 's4', started_at: '2026-05-05T08:00:00Z' }),
      makeSession({ id: 's5', started_at: '2026-05-06T08:00:00Z' }),
    ];
    const repo = createRepository(makeFakeDb([], sessions));
    expect(await repo.getLongestStreak('pushups')).toBe(3);
  });

  it('collapses multiple sessions on the same day into a single date', async () => {
    const sessions: SessionRow[] = [
      makeSession({ id: 's1', started_at: '2026-05-10T08:00:00Z' }),
      makeSession({ id: 's2', started_at: '2026-05-10T20:00:00Z' }),
      makeSession({ id: 's3', started_at: '2026-05-11T08:00:00Z' }),
    ];
    const repo = createRepository(makeFakeDb([], sessions));
    expect(await repo.getLongestStreak('pushups')).toBe(2);
  });
});

describe('repository.getRecentSessions', () => {
  it('returns the N most recent sessions in descending order', async () => {
    const sessions: SessionRow[] = [
      makeSession({ id: 's1', started_at: '2026-05-10T08:00:00Z', user_feedback: 'felt great' }),
      makeSession({ id: 's2', started_at: '2026-05-09T08:00:00Z', user_feedback: null }),
      makeSession({ id: 's3', started_at: '2026-05-08T08:00:00Z', user_feedback: 'tired' }),
      makeSession({ id: 's4', started_at: '2026-05-07T08:00:00Z', user_feedback: null }),
    ];
    const repo = createRepository(makeFakeDb([], sessions));
    const got = await repo.getRecentSessions(3, 'pushups');
    expect(got.map((s) => s.id)).toEqual(['s1', 's2', 's3']);
    expect(got[0].userFeedback).toBe('felt great');
    expect(got[1].userFeedback).toBeNull();
  });

  it('returns empty when no sessions exist', async () => {
    const repo = createRepository(makeFakeDb([], []));
    expect(await repo.getRecentSessions(3, 'pushups')).toEqual([]);
  });
});
