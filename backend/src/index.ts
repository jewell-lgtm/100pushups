import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { createDatabase } from './db.js';
import { createOllamaClient } from './ollama.js';
import { voiceRoutes } from './routes/voice.js';
import { workoutRoutes } from './routes/workouts.js';
import { planningRoutes } from './routes/planning.js';
import { sessionRoutes } from './routes/sessions.js';
import { authRoutes } from './routes/auth.js';
import { bearerAuth } from './middleware/bearerAuth.js';
import { requestId } from './middleware/requestId.js';
import { shutdownAnalytics } from './analytics.js';

const PORT = parseInt(process.env['PORT'] ?? '3000', 10);
// Default to the Docker/OrbStack-internal host alias. Inside the cluster
// the deployment overrides this via env to point at an OrbStack `.local`
// hostname (see Phase 1.5.6 in README — Ollama transport). Outside the
// cluster (e.g. backend dev on the laptop) `host.docker.internal` is the
// portable name the host kernel exposes to containers.
const OLLAMA_URL = process.env['OLLAMA_URL'] ?? 'http://host.docker.internal:11434';
const OLLAMA_MODEL = process.env['OLLAMA_MODEL'] ?? 'llama3.2:3b';
const OLLAMA_USER = process.env['OLLAMA_USER'];
const OLLAMA_PASSWORD = process.env['OLLAMA_PASSWORD'];
const AUTH_SECRET = process.env['AUTH_SECRET'];
const REGISTER_API_KEY = process.env['REGISTER_API_KEY'];
const NODE_ENV = process.env['NODE_ENV'] ?? 'development';

const ollamaAuth =
  OLLAMA_USER && OLLAMA_PASSWORD ? { user: OLLAMA_USER, password: OLLAMA_PASSWORD } : undefined;

if (NODE_ENV === 'production' && (!AUTH_SECRET || !REGISTER_API_KEY)) {
  console.error('FATAL: AUTH_SECRET and REGISTER_API_KEY must be set in production');
  process.exit(1);
}

// In dev, fall back to a deterministic placeholder so contributors can
// run the backend without setting envs. Tokens minted here are obviously
// not safe for production — the production check above prevents that.
const authSecret = AUTH_SECRET ?? 'dev-auth-secret-change-me';
const registerApiKey = REGISTER_API_KEY ?? 'dev-register-key-change-me';

const db = createDatabase();
const ollama = createOllamaClient(OLLAMA_URL, OLLAMA_MODEL, ollamaAuth);

const app = new Hono();

// requestId runs first so the id is present on the context (and response
// header) before Hono's access logger emits its line.
app.use('*', requestId());
app.use('*', logger());
app.use('*', cors());

app.get('/health', (c) => c.json({ ok: true }));
app.get('/heartbeat', (c) => c.json({ ok: true, model: OLLAMA_MODEL }));

app.route('/auth', authRoutes(authSecret, registerApiKey));

// Bearer guard everything under /api/*. Public routes above are unaffected.
app.use('/api/*', bearerAuth(authSecret));

app.route('/api/v1/voice', voiceRoutes(ollama));
app.route('/api/v1/workouts', workoutRoutes(db));
app.route('/api/v1/plan', planningRoutes(db, OLLAMA_URL, OLLAMA_MODEL, ollamaAuth));
app.route('/api/v1/session', sessionRoutes(db, ollama));

const server = serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`pushup-api listening on :${info.port} (ollama: ${OLLAMA_URL}, model: ${OLLAMA_MODEL})`);
});

// Graceful shutdown: flush PostHog so the last few captures aren't lost
// when k8s rolls the pod. SIGTERM is the deployment signal; SIGINT covers
// `Ctrl-C` during local `tsx watch` runs.
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  console.log(`received ${signal}, flushing analytics + closing server`);
  await shutdownAnalytics();
  server.close(() => process.exit(0));
  // Defensive timeout: if `server.close` hangs (open keep-alive
  // connections), exit anyway so the orchestrator's grace window doesn't
  // kill -9 us mid-flush. The flush has already completed by here.
  setTimeout(() => process.exit(0), 5_000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
