import { Hono } from 'hono';
import type Database from 'better-sqlite3';
import crypto from 'node:crypto';

interface SyncSet {
  id: string;
  setNumber: number;
  reps: number;
  recordedAt: string;
  restSeconds: number | null;
}

interface SyncSession {
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
  sets: SyncSet[];
}

interface SyncRequest {
  deviceId: string;
  sessions: SyncSession[];
}

export function workoutRoutes(db: Database.Database) {
  const app = new Hono();

  const upsertSession = db.prepare(`
    INSERT INTO sessions (id, exercise_id, weekly_plan_id, session_type, target_reps, started_at, ended_at, total_reps, set_count, user_feedback, device_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      ended_at = excluded.ended_at,
      total_reps = excluded.total_reps,
      set_count = excluded.set_count,
      user_feedback = excluded.user_feedback
  `);

  const upsertSet = db.prepare(`
    INSERT INTO sets (id, session_id, set_number, reps, recorded_at, rest_seconds)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `);

  app.post('/sync', async (c) => {
    const body = await c.req.json<SyncRequest>();

    const syncMany = db.transaction((sessions: SyncSession[], deviceId: string) => {
      const synced: string[] = [];
      for (const session of sessions) {
        upsertSession.run(
          session.id, session.exerciseId, session.weeklyPlanId,
          session.sessionType, session.targetReps, session.startedAt,
          session.endedAt, session.totalReps, session.setCount,
          session.userFeedback, deviceId,
        );
        for (const set of session.sets) {
          upsertSet.run(
            set.id, session.id, set.setNumber,
            set.reps, set.recordedAt, set.restSeconds,
          );
        }
        synced.push(session.id);
      }
      return synced;
    });

    const synced = syncMany(body.sessions, body.deviceId);
    return c.json({ synced });
  });

  app.get('/stats', (c) => {
    const exerciseId = c.req.query('exercise') ?? 'pushups';

    const yesterday = db.prepare(`
      SELECT total_reps, set_count FROM sessions
      WHERE exercise_id = ? AND date(started_at) = date('now', '-1 day')
      ORDER BY started_at DESC LIMIT 1
    `).get(exerciseId) as { total_reps: number; set_count: number } | undefined;

    const pb = db.prepare(`
      SELECT s.reps, s.recorded_at FROM sets s
      JOIN sessions sess ON s.session_id = sess.id
      WHERE sess.exercise_id = ?
      ORDER BY s.reps DESC LIMIT 1
    `).get(exerciseId) as { reps: number; recorded_at: string } | undefined;

    const last7 = db.prepare(`
      SELECT date(started_at) as date, SUM(total_reps) as total_reps
      FROM sessions WHERE exercise_id = ? AND started_at >= date('now', '-7 days')
      GROUP BY date(started_at) ORDER BY date DESC
    `).all(exerciseId) as Array<{ date: string; total_reps: number }>;

    return c.json({
      yesterday: yesterday ? { totalReps: yesterday.total_reps, setCount: yesterday.set_count } : null,
      personalBest: pb ? { reps: pb.reps, date: pb.recorded_at } : null,
      last7Days: last7,
    });
  });

  return app;
}
