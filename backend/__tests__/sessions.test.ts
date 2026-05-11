import { Hono } from 'hono';
import { createDatabase } from '../src/db.js';
import { workoutRoutes } from '../src/routes/workouts.js';
import { sessionRoutes } from '../src/routes/sessions.js';
import { authRoutes } from '../src/routes/auth.js';
import { bearerAuth } from '../src/middleware/bearerAuth.js';
import {
  IOllamaClient,
  OllamaResponse,
  ReflectionInput,
  StreamFrame,
  VoiceContext,
} from '../src/ollama.js';

const AUTH_SECRET = 'sessions-test-secret-32-bytes-or-thereabouts';
const REGISTER_KEY = 'sessions-test-register-key';

function makeFakeOllama(impl: {
  generateSessionReflection?: (input: ReflectionInput) => Promise<string>;
}): IOllamaClient {
  return {
    voiceRespond: async (): Promise<OllamaResponse> => ({ toolCalls: [], spokenResponse: '' }),
    // eslint-disable-next-line require-yield
    voiceRespondStream: async function* (): AsyncGenerator<StreamFrame, void, void> {
      return;
    },
    generateSessionReflection:
      impl.generateSessionReflection ??
      (async () => 'Solid effort today. Tomorrow, aim for one extra set to push past your baseline.'),
  };
}

function buildApp(ollama: IOllamaClient) {
  const db = createDatabase(':memory:');
  const app = new Hono();
  app.route('/auth', authRoutes(AUTH_SECRET, REGISTER_KEY));
  app.use('/api/*', bearerAuth(AUTH_SECRET));
  app.route('/api/v1/workouts', workoutRoutes(db));
  app.route('/api/v1/session', sessionRoutes(db, ollama));
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

function makeSession(id: string, startedAt: string, totalReps = 25) {
  return {
    id,
    exerciseId: 'pushups',
    weeklyPlanId: null,
    sessionType: 'regular',
    targetReps: 30,
    startedAt,
    endedAt: startedAt,
    totalReps,
    setCount: 2,
    userFeedback: 'felt good',
    sets: [
      { id: `${id}-s1`, setNumber: 1, reps: 12, recordedAt: startedAt, restSeconds: 60 },
      { id: `${id}-s2`, setNumber: 2, reps: totalReps - 12, recordedAt: startedAt, restSeconds: null },
    ],
  };
}

async function syncSession(app: Hono, token: string, session: ReturnType<typeof makeSession>) {
  const res = await app.request('/api/v1/workouts/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ sessions: [session] }),
  });
  expect(res.status).toBe(200);
}

async function postReflect(app: Hono, token: string, body: unknown) {
  return app.request('/api/v1/session/reflect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

describe('POST /api/v1/session/reflect', () => {
  it('returns a reflection string on the happy path', async () => {
    const ollamaSpy = jest.fn(
      async (_input: ReflectionInput) =>
        'Strong day. Tomorrow try splitting into 3 sets to even the load.',
    );
    const { app } = buildApp(makeFakeOllama({ generateSessionReflection: ollamaSpy }));
    const a = await register(app);

    const startedAt = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    await syncSession(app, a.token, makeSession('sess-happy', startedAt, 28));

    const res = await postReflect(app, a.token, { sessionId: 'sess-happy' });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { reflection: string | null };
    expect(json.reflection).toBe(
      'Strong day. Tomorrow try splitting into 3 sets to even the load.',
    );

    expect(ollamaSpy).toHaveBeenCalledTimes(1);
    const passed = ollamaSpy.mock.calls[0][0];
    expect(passed.session.totalReps).toBe(28);
    expect(passed.session.setsCount).toBe(2);
    expect(passed.session.userFeedback).toBe('felt good');
    expect(passed.personalBest ?? 0).toBeGreaterThanOrEqual(12);
  });

  it("returns 404 when the session belongs to another device (cross-device RBAC)", async () => {
    const ollamaSpy = jest.fn(async (_input: ReflectionInput) => 'should not be called');
    const { app } = buildApp(makeFakeOllama({ generateSessionReflection: ollamaSpy }));
    const a = await register(app);
    const b = await register(app);
    expect(a.deviceId).not.toBe(b.deviceId);

    const startedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    await syncSession(app, a.token, makeSession('sess-a-private', startedAt));

    // B tries to reflect on A's session.
    const res = await postReflect(app, b.token, { sessionId: 'sess-a-private' });
    expect(res.status).toBe(404);
    expect(ollamaSpy).not.toHaveBeenCalled();
  });

  it('returns { reflection: null } when Ollama throws', async () => {
    const ollamaSpy = jest.fn(async (_input: ReflectionInput): Promise<string> => {
      throw new Error('connect ECONNREFUSED');
    });
    const { app } = buildApp(makeFakeOllama({ generateSessionReflection: ollamaSpy }));
    const a = await register(app);

    const startedAt = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    await syncSession(app, a.token, makeSession('sess-fail', startedAt));

    const res = await postReflect(app, a.token, { sessionId: 'sess-fail' });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { reflection: string | null };
    expect(json.reflection).toBeNull();
    expect(ollamaSpy).toHaveBeenCalledTimes(1);
  });

  it('returns { reflection: null } when Ollama returns an empty string', async () => {
    const ollamaSpy = jest.fn(async (_input: ReflectionInput) => '   ');
    const { app } = buildApp(makeFakeOllama({ generateSessionReflection: ollamaSpy }));
    const a = await register(app);

    const startedAt = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    await syncSession(app, a.token, makeSession('sess-empty', startedAt));

    const res = await postReflect(app, a.token, { sessionId: 'sess-empty' });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { reflection: string | null };
    expect(json.reflection).toBeNull();
  });

  it('returns 400 when sessionId is missing or non-string', async () => {
    const { app } = buildApp(makeFakeOllama({}));
    const a = await register(app);

    const res1 = await postReflect(app, a.token, {});
    expect(res1.status).toBe(400);

    const res2 = await postReflect(app, a.token, { sessionId: 123 });
    expect(res2.status).toBe(400);
  });

  it('returns 401 without a bearer token', async () => {
    const { app } = buildApp(makeFakeOllama({}));
    const res = await app.request('/api/v1/session/reflect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'anything' }),
    });
    expect(res.status).toBe(401);
  });

  it("ignores a body-supplied deviceId; server scopes by Bearer's device", async () => {
    // Mirrors the spoof test from rbac.test.ts: even if the client tries
    // to address another device's session via the body, the server's
    // c.get('deviceId') is the only thing the route trusts.
    const ollamaSpy = jest.fn(async (_input: ReflectionInput) => 'reflection text');
    const { app } = buildApp(makeFakeOllama({ generateSessionReflection: ollamaSpy }));
    const a = await register(app);
    const b = await register(app);

    const startedAt = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    await syncSession(app, a.token, makeSession('sess-a-only', startedAt));

    // B uses their own token but tries to add a deviceId field too.
    const res = await app.request('/api/v1/session/reflect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${b.token}` },
      body: JSON.stringify({ sessionId: 'sess-a-only', deviceId: a.deviceId }),
    });
    // B's deviceId scoping still applies → 404 (A's session is invisible).
    expect(res.status).toBe(404);
    expect(ollamaSpy).not.toHaveBeenCalled();
  });
});
