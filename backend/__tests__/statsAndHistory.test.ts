import { Hono } from 'hono';
import { createDatabase } from '../src/db.js';
import { workoutRoutes } from '../src/routes/workouts.js';
import { authRoutes } from '../src/routes/auth.js';
import { statsRoutes } from '../src/routes/stats.js';
import { historyRoutes } from '../src/routes/history.js';
import { voiceRoutes } from '../src/routes/voice.js';
import { bearerAuth } from '../src/middleware/bearerAuth.js';
import {
  IOllamaClient,
  OllamaResponse,
  StreamFrame,
} from '../src/ollama.js';

const AUTH_SECRET = 'stats-test-secret-32-bytes-or-thereabouts';
const REGISTER_KEY = 'stats-test-register-key';

// The voice route only needs ollama for POST /respond — the new GET
// /context handler is database-only. A minimal stub keeps the test
// rig honest without pulling network mocks in.
function makeFakeOllama(): IOllamaClient {
  return {
    voiceRespond: async (): Promise<OllamaResponse> => ({ toolCalls: [], spokenResponse: '' }),
    // eslint-disable-next-line require-yield
    voiceRespondStream: async function* (): AsyncGenerator<StreamFrame, void, void> {
      return;
    },
    generateSessionReflection: async () => '',
  };
}

function buildApp() {
  const db = createDatabase(':memory:');
  const app = new Hono();
  app.route('/auth', authRoutes(AUTH_SECRET, REGISTER_KEY));
  app.use('/api/*', bearerAuth(AUTH_SECRET));
  app.route('/api/v1/workouts', workoutRoutes(db));
  app.route('/api/v1/stats', statsRoutes(db));
  app.route('/api/v1/history', historyRoutes(db));
  app.route('/api/v1/voice', voiceRoutes(makeFakeOllama(), db));
  return { app, db };
}

async function register(app: Hono): Promise<{ token: string; deviceId: string }> {
  const res = await app.request('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ registerKey: REGISTER_KEY }),
  });
  expect(res.status).toBe(200);
  return res.json() as Promise<{ token: string; deviceId: string }>;
}

async function authedGet(app: Hono, path: string, token: string) {
  return app.request(path, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
}

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

async function syncSessions(app: Hono, token: string, sessions: SyncSession[]) {
  const res = await app.request('/api/v1/workouts/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ sessions }),
  });
  expect(res.status).toBe(200);
}

// Same shape `workouts/sync` accepts. The set rows total to `totalReps`
// so the bundled stats fields cross-check cleanly.
function makeSession(
  id: string,
  startedAt: string,
  sets: Array<{ reps: number; setNumber?: number }>,
): SyncSession {
  const built: SyncSet[] = sets.map((s, i) => ({
    id: `${id}-s${s.setNumber ?? i + 1}`,
    setNumber: s.setNumber ?? i + 1,
    reps: s.reps,
    recordedAt: startedAt,
    restSeconds: null,
  }));
  const totalReps = built.reduce((acc, s) => acc + s.reps, 0);
  return {
    id,
    exerciseId: 'pushups',
    weeklyPlanId: null,
    sessionType: 'regular',
    targetReps: null,
    startedAt,
    endedAt: startedAt,
    totalReps,
    setCount: built.length,
    userFeedback: null,
    sets: built,
  };
}

function isoDateDaysAgo(days: number): string {
  // Build a `YYYY-MM-DDT12:00:00Z` so `date(started_at)` resolves cleanly
  // to the intended UTC day regardless of the server's local timezone.
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}T12:00:00.000Z`;
}

function todayUtc(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

describe('GET /api/v1/stats', () => {
  it("returns A's bundled stats; B sees the empty shape", async () => {
    const { app } = buildApp();
    const a = await register(app);
    const b = await register(app);
    expect(a.deviceId).not.toBe(b.deviceId);

    // A: a session today (PB 15), a session yesterday (total 20).
    await syncSessions(app, a.token, [
      makeSession('sess-a-today', isoDateDaysAgo(0), [
        { reps: 10 },
        { reps: 15 }, // PB
      ]),
      makeSession('sess-a-yesterday', isoDateDaysAgo(1), [
        { reps: 8 },
        { reps: 12 },
      ]),
    ]);

    const aRes = await authedGet(app, '/api/v1/stats', a.token);
    expect(aRes.status).toBe(200);
    const aJson = (await aRes.json()) as {
      personalBest: { reps: number; date: string } | null;
      secondBestSet: { reps: number } | null;
      streak: number;
      longestStreak: number;
      weekTotals: Array<{ date: string; totalReps: number; target: number | null }>;
      todaySets: Array<{ setNumber: number; reps: number }>;
      yesterdayTotal: number | null;
      todayTarget: number | null;
    };

    expect(aJson.personalBest).not.toBeNull();
    expect(aJson.personalBest?.reps).toBe(15);
    expect(aJson.secondBestSet?.reps).toBe(12);
    // Two consecutive days ending today.
    expect(aJson.streak).toBe(2);
    expect(aJson.longestStreak).toBeGreaterThanOrEqual(2);
    expect(aJson.weekTotals).toHaveLength(7);
    // Today's sets come back ordered by setNumber.
    expect(aJson.todaySets.map((s) => s.reps)).toEqual([10, 15]);
    expect(aJson.yesterdayTotal).toBe(20);
    // No weekly plan → no target.
    expect(aJson.todayTarget).toBeNull();

    // B has no data → empty shape.
    const bRes = await authedGet(app, '/api/v1/stats', b.token);
    expect(bRes.status).toBe(200);
    const bJson = (await bRes.json()) as typeof aJson;
    expect(bJson.personalBest).toBeNull();
    expect(bJson.secondBestSet).toBeNull();
    expect(bJson.streak).toBe(0);
    expect(bJson.longestStreak).toBe(0);
    expect(bJson.weekTotals).toHaveLength(7);
    for (const slot of bJson.weekTotals) {
      expect(slot.totalReps).toBe(0);
      expect(slot.target).toBeNull();
    }
    expect(bJson.todaySets).toEqual([]);
    expect(bJson.yesterdayTotal).toBeNull();
    expect(bJson.todayTarget).toBeNull();
  });

  it('returns 401 without a bearer', async () => {
    const { app } = buildApp();
    const res = await app.request('/api/v1/stats');
    expect(res.status).toBe(401);
  });

  it('picks up todayTarget from the device-scoped weekly plan', async () => {
    const { app, db } = buildApp();
    const a = await register(app);

    // Seed a weekly plan starting ages ago so `week_start <= today` holds
    // regardless of which weekday the test runs on. Targets are equal
    // every day so any `dayKey` lookup resolves to 30.
    db.prepare(
      `INSERT INTO weekly_plans (id, exercise_id, week_start, evaluation_reps, daily_targets, notes, device_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'plan-a',
      'pushups',
      '2020-01-06', // a Monday — guarantees week_start <= today.
      null,
      JSON.stringify({ mon: 30, tue: 30, wed: 30, thu: 30, fri: 30, sat: 30, sun: 30 }),
      null,
      a.deviceId,
    );

    const res = await authedGet(app, '/api/v1/stats', a.token);
    const json = (await res.json()) as { todayTarget: number | null };
    expect(json.todayTarget).toBe(30);
  });
});

describe('GET /api/v1/history', () => {
  it("returns A's month grid; B sees empty", async () => {
    const { app } = buildApp();
    const a = await register(app);
    const b = await register(app);

    // Pin to a deterministic month using a session 0 days ago — then
    // query the same year/month.
    const today = todayUtc();
    const [yearStr, monthStr] = today.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);

    await syncSessions(app, a.token, [
      makeSession('sess-a-month-1', isoDateDaysAgo(0), [{ reps: 10 }, { reps: 12 }]),
    ]);

    const aRes = await authedGet(
      app,
      `/api/v1/history?year=${year}&month=${month}`,
      a.token,
    );
    expect(aRes.status).toBe(200);
    const aJson = (await aRes.json()) as {
      days: Array<{ day: number; totalReps: number; target: number | null }>;
      recent: Array<{ id: string; totalReps: number | null }>;
    };
    expect(aJson.days.length).toBe(1);
    expect(aJson.days[0].totalReps).toBe(22);
    // The session synced above also appears in `recent`.
    expect(aJson.recent.length).toBe(1);
    expect(aJson.recent[0].id).toBe('sess-a-month-1');
    expect(aJson.recent[0].totalReps).toBe(22);

    const bRes = await authedGet(
      app,
      `/api/v1/history?year=${year}&month=${month}`,
      b.token,
    );
    expect(bRes.status).toBe(200);
    const bJson = (await bRes.json()) as { days: unknown[]; recent: unknown[] };
    expect(bJson.days).toEqual([]);
    expect(bJson.recent).toEqual([]);
  });

  it("recent is device-scoped — A's rows don't leak to B", async () => {
    const { app } = buildApp();
    const a = await register(app);
    const b = await register(app);

    await syncSessions(app, a.token, [
      makeSession('sess-a-rec-1', isoDateDaysAgo(2), [{ reps: 10 }]),
      makeSession('sess-a-rec-2', isoDateDaysAgo(1), [{ reps: 12 }]),
      makeSession('sess-a-rec-3', isoDateDaysAgo(0), [{ reps: 14 }]),
    ]);
    // B syncs nothing.

    const today = todayUtc();
    const [yearStr, monthStr] = today.split('-');
    const path = `/api/v1/history?year=${yearStr}&month=${parseInt(monthStr, 10)}`;

    const aRes = await authedGet(app, path, a.token);
    const aJson = (await aRes.json()) as {
      recent: Array<{ id: string }>;
    };
    expect(aJson.recent.map((r) => r.id).sort()).toEqual(
      ['sess-a-rec-1', 'sess-a-rec-2', 'sess-a-rec-3'].sort(),
    );

    const bRes = await authedGet(app, path, b.token);
    const bJson = (await bRes.json()) as { recent: unknown[] };
    expect(bJson.recent).toEqual([]);
  });

  it('recent is capped at 3 — even with 10 synced sessions only the 3 most recent come back, ordered DESC by startedAt', async () => {
    const { app } = buildApp();
    const a = await register(app);

    // Sync 10 sessions spread across 10 distinct days. `daysAgo` of 9
    // is the oldest; 0 is the most recent. The endpoint must return
    // days 0, 1, 2 only — in DESC order.
    const sessions: SyncSession[] = [];
    for (let i = 9; i >= 0; i--) {
      sessions.push(
        makeSession(`sess-rec-${i}`, isoDateDaysAgo(i), [{ reps: 10 + i }]),
      );
    }
    await syncSessions(app, a.token, sessions);

    const today = todayUtc();
    const [yearStr, monthStr] = today.split('-');
    const path = `/api/v1/history?year=${yearStr}&month=${parseInt(monthStr, 10)}`;

    const res = await authedGet(app, path, a.token);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      recent: Array<{ id: string; startedAt: string }>;
    };

    expect(json.recent.length).toBe(3);
    // Most recent first: days-ago 0, 1, 2 → ids sess-rec-0, sess-rec-1, sess-rec-2.
    expect(json.recent.map((r) => r.id)).toEqual([
      'sess-rec-0',
      'sess-rec-1',
      'sess-rec-2',
    ]);
    // Strictly DESC by startedAt.
    for (let i = 0; i < json.recent.length - 1; i++) {
      expect(json.recent[i].startedAt >= json.recent[i + 1].startedAt).toBe(true);
    }
  });

  it('rejects malformed year/month with 400', async () => {
    const { app } = buildApp();
    const a = await register(app);

    const cases = [
      '/api/v1/history',
      '/api/v1/history?year=20&month=5',
      '/api/v1/history?year=abcd&month=5',
      '/api/v1/history?year=2026',
      '/api/v1/history?year=2026&month=0',
      '/api/v1/history?year=2026&month=13',
      '/api/v1/history?year=2026&month=foo',
    ];

    for (const path of cases) {
      const res = await authedGet(app, path, a.token);
      expect(res.status).toBe(400);
    }
  });

  it('returns 401 without a bearer', async () => {
    const { app } = buildApp();
    const res = await app.request('/api/v1/history?year=2026&month=5');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/voice/context', () => {
  it("returns A's voice bundle; B sees empty fields", async () => {
    const { app, db } = buildApp();
    const a = await register(app);
    const b = await register(app);

    // Same data fixture as the stats test for cross-shape consistency.
    await syncSessions(app, a.token, [
      makeSession('sess-a-voice-today', isoDateDaysAgo(0), [
        { reps: 10 },
        { reps: 15 },
      ]),
      makeSession('sess-a-voice-yesterday', isoDateDaysAgo(1), [
        { reps: 8 },
        { reps: 12 },
      ]),
    ]);
    db.prepare(
      `INSERT INTO weekly_plans (id, exercise_id, week_start, evaluation_reps, daily_targets, notes, device_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'plan-a-voice',
      'pushups',
      '2020-01-06',
      null,
      JSON.stringify({ mon: 40, tue: 40, wed: 40, thu: 40, fri: 40, sat: 40, sun: 40 }),
      null,
      a.deviceId,
    );

    const aRes = await authedGet(app, '/api/v1/voice/context', a.token);
    expect(aRes.status).toBe(200);
    const aJson = (await aRes.json()) as {
      yesterdayTotal: number | null;
      personalBest: number | null;
      streak: number;
      todayTarget: number | null;
      sessionType: string;
    };
    expect(aJson.yesterdayTotal).toBe(20);
    expect(aJson.personalBest).toBe(15);
    expect(aJson.streak).toBe(2);
    expect(aJson.todayTarget).toBe(40);
    expect(aJson.sessionType).toBe('regular');

    const bRes = await authedGet(app, '/api/v1/voice/context', b.token);
    expect(bRes.status).toBe(200);
    const bJson = (await bRes.json()) as typeof aJson;
    expect(bJson.yesterdayTotal).toBeNull();
    expect(bJson.personalBest).toBeNull();
    expect(bJson.streak).toBe(0);
    expect(bJson.todayTarget).toBeNull();
    expect(bJson.sessionType).toBe('regular');
  });

  it('returns 401 without a bearer', async () => {
    const { app } = buildApp();
    const res = await app.request('/api/v1/voice/context');
    expect(res.status).toBe(401);
  });
});
