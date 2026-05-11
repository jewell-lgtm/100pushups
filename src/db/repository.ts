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

export interface IRepository {
  getYesterdaySession(exerciseId: string): Promise<{ totalReps: number; setCount: number } | null>;
  getPersonalBest(exerciseId: string): Promise<{ reps: number; date: string } | null>;
  getStreak(exerciseId: string): Promise<number>;
  getTodayTarget(exerciseId: string): Promise<number | null>;
  getCurrentWeeklyPlan(exerciseId: string): Promise<WeeklyPlan | null>;
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
