// Repository helpers for the sessions table. These are scoped by deviceId
// for RBAC — never expose unscoped accessors that could leak cross-device
// data. The existing routes (workouts, planning) inline their own queries;
// these helpers exist because the reflection flow needs the same lookups
// from a different place and we don't want to duplicate the WHERE clauses.
import type Database from 'better-sqlite3';

export interface SessionRow {
  id: string;
  exerciseId: string;
  weeklyPlanId: string | null;
  sessionType: string;
  targetReps: number | null;
  startedAt: string;
  endedAt: string | null;
  totalReps: number | null;
  setCount: number | null;
  userFeedback: string | null;
  deviceId: string;
}

interface SessionDbRow {
  id: string;
  exercise_id: string;
  weekly_plan_id: string | null;
  session_type: string;
  target_reps: number | null;
  started_at: string;
  ended_at: string | null;
  total_reps: number | null;
  set_count: number | null;
  user_feedback: string | null;
  device_id: string;
}

function rowToSession(row: SessionDbRow): SessionRow {
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
    deviceId: row.device_id,
  };
}

// Returns the session iff it belongs to the given device. Cross-device
// lookups (or non-existent ids) return null so callers can map to 404.
export function getSessionById(
  db: Database.Database,
  deviceId: string,
  sessionId: string,
): SessionRow | null {
  const row = db
    .prepare(
      `SELECT id, exercise_id, weekly_plan_id, session_type, target_reps,
              started_at, ended_at, total_reps, set_count, user_feedback,
              device_id
       FROM sessions
       WHERE id = ? AND device_id = ?`,
    )
    .get(sessionId, deviceId) as SessionDbRow | undefined;
  return row ? rowToSession(row) : null;
}

// Device-scoped recent sessions. Two complementary modes:
//
//   { days: N } — sessions whose started_at is within the last N days,
//                 ordered ASC. The reflection prompt path uses this so
//                 the LLM sees a chronological progression.
//
//   { limit: N } — the N most recent sessions, ordered DESC by
//                  started_at. The Stats/History "Recent" rows path
//                  uses this so the most recent workout appears first.
//
// Both modes share the same RBAC filter (`device_id = ?`); never expose
// an unscoped variant.
export interface RecentSessionsOptions {
  days?: number;
  limit?: number;
}

export function getRecentSessionsForDevice(
  db: Database.Database,
  deviceId: string,
  options: RecentSessionsOptions = { days: 7 },
): SessionRow[] {
  if (typeof options.limit === 'number') {
    const rows = db
      .prepare(
        `SELECT id, exercise_id, weekly_plan_id, session_type, target_reps,
                started_at, ended_at, total_reps, set_count, user_feedback,
                device_id
         FROM sessions
         WHERE device_id = ?
         ORDER BY started_at DESC
         LIMIT ?`,
      )
      .all(deviceId, options.limit) as SessionDbRow[];
    return rows.map(rowToSession);
  }
  const days = options.days ?? 7;
  const rows = db
    .prepare(
      `SELECT id, exercise_id, weekly_plan_id, session_type, target_reps,
              started_at, ended_at, total_reps, set_count, user_feedback,
              device_id
       FROM sessions
       WHERE device_id = ? AND started_at >= datetime('now', '-' || ? || ' days')
       ORDER BY started_at ASC`,
    )
    .all(deviceId, days) as SessionDbRow[];
  return rows.map(rowToSession);
}
