import { Hono } from 'hono';
import type Database from 'better-sqlite3';
import { IOllamaClient, ReflectionInput, ReflectionRecentSession } from '../ollama.js';
import { getSessionById, getRecentSessionsForDevice } from '../sessions.js';

interface ReflectRequest {
  sessionId?: unknown;
}

export function sessionRoutes(db: Database.Database, ollama: IOllamaClient) {
  const app = new Hono();

  app.post('/reflect', async (c) => {
    const reqId = c.get('reqId' as never) as string | undefined;
    const deviceId = c.get('deviceId' as never) as string;

    let body: ReflectRequest;
    try {
      body = await c.req.json<ReflectRequest>();
    } catch {
      return c.json({ error: 'invalid json' }, 400);
    }

    // Plain validation, matching the convention used elsewhere in routes/.
    // The other routes inline this style; no Zod dependency exists yet so
    // we don't introduce one for one field.
    if (typeof body.sessionId !== 'string' || body.sessionId.length === 0) {
      return c.json({ error: 'missing sessionId' }, 400);
    }
    const sessionId = body.sessionId;

    // RBAC: getSessionById scopes by deviceId, so cross-device fetches
    // return null → 404. The bearer middleware has already stamped the
    // device on the context; we never trust a body-supplied deviceId.
    const session = getSessionById(db, deviceId, sessionId);
    if (!session) {
      return c.json({ error: 'session not found' }, 404);
    }

    // Gather 7-day context for the same device. Exclude the just-completed
    // session from the "recent" list so the model contrasts today against
    // history rather than echoing today's numbers back.
    const recent = getRecentSessionsForDevice(db, deviceId, { days: 7 }).filter(
      (s) => s.id !== sessionId,
    );

    const recentSessions: ReflectionRecentSession[] = recent.map((s) => ({
      date: s.startedAt.slice(0, 10),
      totalReps: s.totalReps ?? 0,
      userFeedback: s.userFeedback,
    }));

    // Derived baselines for the prompt.
    const yesterday = recent
      .slice()
      .reverse()
      .find((s) => s.totalReps !== null);
    const yesterdayTotal = yesterday?.totalReps ?? null;

    // Personal best across single sets for this device — query directly to
    // avoid pulling in the workouts module just for one number.
    const pbRow = db
      .prepare(
        `SELECT MAX(s.reps) as best FROM sets s
         JOIN sessions sess ON s.session_id = sess.id
         WHERE sess.device_id = ?`,
      )
      .get(deviceId) as { best: number | null } | undefined;
    const personalBest = pbRow?.best ?? null;

    const totals = recent
      .map((s) => s.totalReps)
      .filter((n): n is number => typeof n === 'number');
    const averageLast7 = totals.length > 0
      ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length)
      : null;

    const input: ReflectionInput = {
      session: {
        totalReps: session.totalReps,
        setsCount: session.setCount,
        userFeedback: session.userFeedback,
        startedAt: session.startedAt,
      },
      recentSessions,
      yesterdayTotal,
      personalBest,
      averageLast7,
    };

    // Fail-soft: any Ollama failure (fetch reject, non-2xx, parse failure,
    // empty content) returns 200 { reflection: null } so the client can
    // render a static fallback string. We never propagate a 5xx here.
    let reflection: string | null = null;
    try {
      const text = await ollama.generateSessionReflection(input);
      const trimmed = text.trim();
      reflection = trimmed.length > 0 ? trimmed : null;
    } catch (err) {
      console.error(
        JSON.stringify({
          reqId,
          route: '/api/v1/session/reflect',
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      reflection = null;
    }

    return c.json({ reflection });
  });

  return app;
}
