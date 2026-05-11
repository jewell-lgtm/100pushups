import type { SQLiteDatabase, SQLiteBindValue } from 'expo-sqlite';
import { Session, WorkoutSet, WeeklyPlan, VoiceContext } from '../api/types';

export function parseDailyTargets(json: string): Record<string, number> {
  const parsed: unknown = JSON.parse(json);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {};
  }
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === 'number') {
      result[key] = value;
    }
  }
  return result;
}

export interface UpsertWeeklyPlanInput {
  id: string;
  exerciseId: string;
  weekStart: string;
  dailyTargets: Record<string, number>;
  notes: string | null;
  evaluationReps?: number | null;
}

export interface MonthSessionDay {
  day: number;
  totalReps: number;
  target: number | null;
}

export interface RecentSessionRow {
  id: string;
  startedAt: string;
  totalReps: number | null;
  setCount: number | null;
  userFeedback: string | null;
}

export interface WeekDayTotal {
  /** ISO date `YYYY-MM-DD` for this Mon-Sun slot. */
  date: string;
  totalReps: number;
  target: number | null;
}

export interface TodaySetRow {
  id: string;
  setNumber: number;
  reps: number;
  recordedAt: string;
}

export interface IRepository {
  getYesterdaySession(exerciseId: string): Promise<{ totalReps: number; setCount: number } | null>;
  getPersonalBest(exerciseId: string): Promise<{ reps: number; date: string } | null>;
  getSecondBestSet(exerciseId: string): Promise<{ reps: number; date: string } | null>;
  getStreak(exerciseId: string): Promise<number>;
  getLongestStreak(exerciseId: string): Promise<number>;
  getTodayTarget(exerciseId: string): Promise<number | null>;
  getCurrentWeeklyPlan(exerciseId: string): Promise<WeeklyPlan | null>;
  getMonthSessions(year: number, month: number, exerciseId: string): Promise<MonthSessionDay[]>;
  getCurrentWeekTotals(exerciseId: string): Promise<WeekDayTotal[]>;
  getTodaySets(exerciseId: string): Promise<TodaySetRow[]>;
  getRecentSessions(limit: number, exerciseId: string): Promise<RecentSessionRow[]>;
  getSessionById(sessionId: string): Promise<Session | null>;
  getSetsForSession(sessionId: string): Promise<WorkoutSet[]>;
  insertSession(session: Omit<Session, 'synced'>): Promise<void>;
  updateSession(id: string, updates: Partial<Session>): Promise<void>;
  insertSet(set: WorkoutSet): Promise<void>;
  upsertWeeklyPlan(plan: UpsertWeeklyPlanInput): Promise<void>;
  buildVoiceContext(exerciseId: string): Promise<Omit<VoiceContext, 'appState' | 'currentSet' | 'setsCompleted'>>;
}

export function createRepository(db: SQLiteDatabase): IRepository {
  return {
    async getYesterdaySession(exerciseId) {
      const row = await db.getFirstAsync<{ total_reps: number; set_count: number }>(
        `SELECT total_reps, set_count FROM sessions
         WHERE exercise_id = ? AND date(started_at) = date('now', '-1 day')
         ORDER BY started_at DESC LIMIT 1`,
        [exerciseId],
      );
      return row ? { totalReps: row.total_reps, setCount: row.set_count } : null;
    },

    async getPersonalBest(exerciseId) {
      const row = await db.getFirstAsync<{ reps: number; recorded_at: string }>(
        `SELECT s.reps, s.recorded_at FROM sets s
         JOIN sessions sess ON s.session_id = sess.id
         WHERE sess.exercise_id = ?
         ORDER BY s.reps DESC LIMIT 1`,
        [exerciseId],
      );
      return row ? { reps: row.reps, date: row.recorded_at } : null;
    },

    // Second-highest single-set reps for the exercise. Used by the Stats
    // screen's "Previous" subtitle row under the personal best. Tie-break
    // on started_at ASC so the earliest set wins (the historic claim is
    // what gets dethroned by a later tie). LIMIT 2 OFFSET 1 pulls the
    // runner-up directly; we return null when fewer than 2 sets exist.
    async getSecondBestSet(exerciseId) {
      const row = await db.getFirstAsync<{ reps: number; recorded_at: string }>(
        `SELECT s.reps, s.recorded_at FROM sets s
         JOIN sessions sess ON s.session_id = sess.id
         WHERE sess.exercise_id = ?
         ORDER BY s.reps DESC, sess.started_at ASC
         LIMIT 2 OFFSET 1`,
        [exerciseId],
      );
      return row ? { reps: row.reps, date: row.recorded_at } : null;
    },

    async getStreak(exerciseId) {
      const rows = await db.getAllAsync<{ d: string }>(
        `SELECT DISTINCT date(started_at) as d FROM sessions
         WHERE exercise_id = ? ORDER BY d DESC`,
        [exerciseId],
      );
      let streak = 0;
      const today = Temporal.Now.plainDateISO();
      for (let i = 0; i < rows.length; i++) {
        const expected = today.subtract({ days: i });
        if (rows[i].d === expected.toString()) {
          streak++;
        } else {
          break;
        }
      }
      return streak;
    },

    // SQLite has no window functions on the version we ship, so the
    // run-walk happens in JS. Pull distinct session dates ascending,
    // walk pairs, track the longest consecutive run. Each `date(...)`
    // value is a plain `YYYY-MM-DD` string interpreted as UTC.
    async getLongestStreak(exerciseId) {
      const rows = await db.getAllAsync<{ d: string }>(
        `SELECT DISTINCT date(started_at) as d FROM sessions
         WHERE exercise_id = ? ORDER BY d ASC`,
        [exerciseId],
      );
      if (rows.length === 0) return 0;
      let longest = 1;
      let current = 1;
      for (let i = 1; i < rows.length; i++) {
        const prev = Temporal.PlainDate.from(rows[i - 1].d);
        const curr = Temporal.PlainDate.from(rows[i].d);
        if (curr.since(prev).days === 1) {
          current++;
          if (current > longest) longest = current;
        } else {
          current = 1;
        }
      }
      return longest;
    },

    async getTodayTarget(exerciseId) {
      const dayNames = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
      const today = dayNames[Temporal.Now.plainDateISO().dayOfWeek - 1];

      const plan = await db.getFirstAsync<{ daily_targets: string }>(
        `SELECT daily_targets FROM weekly_plans
         WHERE exercise_id = ? AND week_start <= date('now')
         ORDER BY week_start DESC LIMIT 1`,
        [exerciseId],
      );
      if (!plan) return null;

      const targets = parseDailyTargets(plan.daily_targets);
      return targets[today] ?? null;
    },

    async getCurrentWeeklyPlan(exerciseId) {
      const row = await db.getFirstAsync<{
        id: string; exercise_id: string; week_start: string;
        evaluation_reps: number | null; daily_targets: string;
        notes: string | null; created_at: string;
      }>(
        `SELECT * FROM weekly_plans
         WHERE exercise_id = ? AND week_start <= date('now')
         ORDER BY week_start DESC LIMIT 1`,
        [exerciseId],
      );
      if (!row) return null;
      return {
        id: row.id,
        exerciseId: row.exercise_id,
        weekStart: row.week_start,
        evaluationReps: row.evaluation_reps,
        dailyTargets: parseDailyTargets(row.daily_targets),
        notes: row.notes,
        createdAt: row.created_at,
      };
    },

    // Aggregates total reps per UTC day across the requested
    // calendar month, joined left against the weekly_plan that
    // covers each day so the calendar can colour cells against the
    // plan target (null when no plan covers that day). `month` is
    // 1-indexed (Jan=1, Dec=12); we build the half-open window
    // [first-of-month, first-of-next-month) so the cross-month
    // boundary stays exclusive.
    async getMonthSessions(year, month, exerciseId) {
      const monthStr = String(month).padStart(2, '0');
      const start = `${year}-${monthStr}-01`;
      // Compute first-of-next-month as an exclusive upper bound.
      const next = Temporal.PlainDate.from(start).add({ months: 1 });
      const end = next.toString();

      const rows = await db.getAllAsync<{ d: string; total_reps: number }>(
        `SELECT date(started_at) as d, COALESCE(SUM(total_reps), 0) as total_reps
         FROM sessions
         WHERE exercise_id = ? AND started_at >= ? AND started_at < ?
         GROUP BY date(started_at)
         ORDER BY d ASC`,
        [exerciseId, start, end],
      );

      if (rows.length === 0) return [];

      // Resolve the target for each day from the most recent
      // weekly_plan whose week_start is <= that day. Cheaper to pull
      // all plans for this exercise once than to issue N subqueries.
      const plans = await db.getAllAsync<{ week_start: string; daily_targets: string }>(
        `SELECT week_start, daily_targets FROM weekly_plans
         WHERE exercise_id = ? AND week_start < ?
         ORDER BY week_start DESC`,
        [exerciseId, end],
      );
      const parsedPlans = plans.map((p) => ({
        weekStart: p.week_start,
        targets: parseDailyTargets(p.daily_targets),
      }));

      const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

      return rows.map((r) => {
        const date = Temporal.PlainDate.from(r.d);
        const dayKey = dayKeys[date.dayOfWeek - 1];
        // First plan whose weekStart <= this date wins (plans are
        // already sorted desc by weekStart).
        const plan = parsedPlans.find((p) => p.weekStart <= r.d);
        const target = plan ? (plan.targets[dayKey] ?? null) : null;
        return {
          day: date.day,
          totalReps: r.total_reps ?? 0,
          target,
        };
      });
    },

    // Mon-Sun totals for the current ISO week, length 7. Empty days
    // surface as `{ totalReps: 0, target: <plan|null> }` so the Stats
    // screen's week bars can render a placeholder track. Mirrors the
    // weekly_plan join pattern from `getMonthSessions` but over a
    // 7-day window instead of a full month.
    async getCurrentWeekTotals(exerciseId) {
      const today = Temporal.Now.plainDateISO();
      // ISO week: Mon=1..Sun=7.
      const monday = today.subtract({ days: today.dayOfWeek - 1 });
      const sunday = monday.add({ days: 6 });
      const start = monday.toString();
      // Half-open upper bound: first day after Sunday.
      const endExclusive = sunday.add({ days: 1 }).toString();

      const rows = await db.getAllAsync<{ d: string; total_reps: number }>(
        `SELECT date(started_at) as d, COALESCE(SUM(total_reps), 0) as total_reps
         FROM sessions
         WHERE exercise_id = ? AND started_at >= ? AND started_at < ?
         GROUP BY date(started_at)
         ORDER BY d ASC`,
        [exerciseId, start, endExclusive],
      );
      const byDate = new Map<string, number>();
      for (const r of rows) byDate.set(r.d, r.total_reps ?? 0);

      // Same plan-target join pattern as getMonthSessions: pull all
      // plans whose week_start precedes the upper bound, then pick the
      // most recent plan covering each day.
      const plans = await db.getAllAsync<{ week_start: string; daily_targets: string }>(
        `SELECT week_start, daily_targets FROM weekly_plans
         WHERE exercise_id = ? AND week_start < ?
         ORDER BY week_start DESC`,
        [exerciseId, endExclusive],
      );
      const parsedPlans = plans.map((p) => ({
        weekStart: p.week_start,
        targets: parseDailyTargets(p.daily_targets),
      }));

      const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
      const out: WeekDayTotal[] = [];
      for (let i = 0; i < 7; i++) {
        const d = monday.add({ days: i });
        const dateStr = d.toString();
        const dayKey = dayKeys[d.dayOfWeek - 1];
        const plan = parsedPlans.find((p) => p.weekStart <= dateStr);
        const target = plan ? (plan.targets[dayKey] ?? null) : null;
        out.push({
          date: dateStr,
          totalReps: byDate.get(dateStr) ?? 0,
          target,
        });
      }
      return out;
    },

    // Sets from today's most-recent session, ordered by set_number ASC.
    // The Stats screen renders these in the per-set progress card. We
    // resolve "today" via `date('now')` for consistency with the rest
    // of the SQLite-side date math (`getYesterdaySession` etc).
    async getTodaySets(exerciseId) {
      const session = await db.getFirstAsync<{ id: string }>(
        `SELECT id FROM sessions
         WHERE exercise_id = ? AND date(started_at) = date('now')
         ORDER BY started_at DESC LIMIT 1`,
        [exerciseId],
      );
      if (!session) return [];

      const rows = await db.getAllAsync<{
        id: string; set_number: number; reps: number; recorded_at: string;
      }>(
        `SELECT id, set_number, reps, recorded_at
         FROM sets WHERE session_id = ? ORDER BY set_number ASC`,
        [session.id],
      );
      return rows.map((r) => ({
        id: r.id,
        setNumber: r.set_number,
        reps: r.reps,
        recordedAt: r.recorded_at,
      }));
    },

    async getRecentSessions(limit, exerciseId) {
      const rows = await db.getAllAsync<{
        id: string;
        started_at: string;
        total_reps: number | null;
        set_count: number | null;
        user_feedback: string | null;
      }>(
        `SELECT id, started_at, total_reps, set_count, user_feedback
         FROM sessions WHERE exercise_id = ?
         ORDER BY started_at DESC LIMIT ?`,
        [exerciseId, limit],
      );
      return rows.map((r) => ({
        id: r.id,
        startedAt: r.started_at,
        totalReps: r.total_reps,
        setCount: r.set_count,
        userFeedback: r.user_feedback,
      }));
    },

    // Local SQLite has no device_id column — Bearer-derived scoping
    // happens server-side (sync.ts comment, RBAC 1.5.7). The session
    // and its sets are the user's own data, so a single-PK lookup is
    // sufficient here; cross-device leakage is impossible on-device.
    async getSessionById(sessionId) {
      const row = await db.getFirstAsync<{
        id: string; exercise_id: string; weekly_plan_id: string | null;
        session_type: 'regular' | 'evaluation'; target_reps: number | null;
        started_at: string; ended_at: string | null; total_reps: number | null;
        set_count: number | null; user_feedback: string | null; synced: number;
      }>(
        `SELECT id, exercise_id, weekly_plan_id, session_type, target_reps,
                started_at, ended_at, total_reps, set_count, user_feedback,
                synced
         FROM sessions WHERE id = ?`,
        [sessionId],
      );
      if (!row) return null;
      return {
        id: row.id,
        exerciseId: row.exercise_id,
        weeklyPlanId: row.weekly_plan_id,
        sessionType: row.session_type,
        targetReps: row.target_reps,
        startedAt: row.started_at,
        endedAt: row.ended_at,
        totalReps: row.total_reps,
        setCount: row.set_count,
        userFeedback: row.user_feedback,
        synced: row.synced === 1,
      };
    },

    async getSetsForSession(sessionId) {
      const rows = await db.getAllAsync<{
        id: string; session_id: string; set_number: number; reps: number;
        recorded_at: string; rest_seconds: number | null;
      }>(
        `SELECT id, session_id, set_number, reps, recorded_at, rest_seconds
         FROM sets WHERE session_id = ? ORDER BY set_number ASC`,
        [sessionId],
      );
      return rows.map((r) => ({
        id: r.id,
        sessionId: r.session_id,
        setNumber: r.set_number,
        reps: r.reps,
        recordedAt: r.recorded_at,
        restSeconds: r.rest_seconds,
      }));
    },

    async insertSession(session) {
      await db.runAsync(
        `INSERT INTO sessions (id, exercise_id, weekly_plan_id, session_type, target_reps, started_at, ended_at, total_reps, set_count, user_feedback, synced)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [session.id, session.exerciseId, session.weeklyPlanId, session.sessionType,
         session.targetReps, session.startedAt, session.endedAt,
         session.totalReps, session.setCount, session.userFeedback],
      );
    },

    async updateSession(id, updates) {
      const fields: string[] = [];
      const values: SQLiteBindValue[] = [];
      if (updates.endedAt !== undefined) { fields.push('ended_at = ?'); values.push(updates.endedAt); }
      if (updates.totalReps !== undefined) { fields.push('total_reps = ?'); values.push(updates.totalReps); }
      if (updates.setCount !== undefined) { fields.push('set_count = ?'); values.push(updates.setCount); }
      if (updates.userFeedback !== undefined) { fields.push('user_feedback = ?'); values.push(updates.userFeedback); }
      if (fields.length === 0) return;
      values.push(id);
      await db.runAsync(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`, values);
    },

    async insertSet(set) {
      await db.runAsync(
        `INSERT INTO sets (id, session_id, set_number, reps, recorded_at, rest_seconds)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [set.id, set.sessionId, set.setNumber, set.reps, set.recordedAt, set.restSeconds],
      );
    },

    // Mirrors the backend `weekly_plans` row into local SQLite. The
    // backend response only carries `id/weekStart/dailyTargets/notes`
    // (see `backend/src/routes/planning.ts:78-83`), so `evaluationReps`
    // is optional and defaults to null when re-mirroring. INSERT OR
    // REPLACE on the PK lets re-generation overwrite the same row
    // without a separate UPDATE path.
    async upsertWeeklyPlan(plan) {
      await db.runAsync(
        `INSERT OR REPLACE INTO weekly_plans
           (id, exercise_id, week_start, evaluation_reps, daily_targets, notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          plan.id,
          plan.exerciseId,
          plan.weekStart,
          plan.evaluationReps ?? null,
          JSON.stringify(plan.dailyTargets),
          plan.notes,
        ],
      );
    },

    async buildVoiceContext(exerciseId) {
      const [yesterday, pb, streak, todayTarget] = await Promise.all([
        this.getYesterdaySession(exerciseId),
        this.getPersonalBest(exerciseId),
        this.getStreak(exerciseId),
        this.getTodayTarget(exerciseId),
      ]);

      return {
        todayTarget: todayTarget,
        yesterdayTotal: yesterday?.totalReps ?? null,
        personalBest: pb?.reps ?? null,
        streak,
        sessionType: 'regular' as const,
      };
    },
  };
}
