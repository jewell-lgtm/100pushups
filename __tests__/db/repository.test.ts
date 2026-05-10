// Covers `repository.upsertWeeklyPlan` (the persistence half of Phase
// 4.3) and the read path the Plan screen uses, against a tiny
// in-process fake of the SQLiteDatabase surface. We avoid pulling
// expo-sqlite's native binding into Node, mirroring the strategy in
// `__tests__/db/sync.test.ts`.

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

function makeFakeDb(rows: WeeklyPlanRow[] = []): SQLiteDatabase {
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
      return null;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
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
