import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { createDatabase } from './db.js';
import { createOllamaClient } from './ollama.js';
import { voiceRoutes } from './routes/voice.js';
import { workoutRoutes } from './routes/workouts.js';
import { planningRoutes } from './routes/planning.js';

const PORT = parseInt(process.env['PORT'] ?? '3000', 10);
const OLLAMA_URL = process.env['OLLAMA_URL'] ?? 'http://localhost:11434';
const OLLAMA_MODEL = process.env['OLLAMA_MODEL'] ?? 'llama3.2:3b';

const db = createDatabase();
const ollama = createOllamaClient(OLLAMA_URL, OLLAMA_MODEL);

const app = new Hono();

app.use('*', logger());
app.use('*', cors());

app.get('/health', (c) => c.json({ ok: true }));
app.get('/heartbeat', (c) => c.json({ ok: true, model: OLLAMA_MODEL }));

app.route('/api/v1/voice', voiceRoutes(ollama));
app.route('/api/v1/workouts', workoutRoutes(db));
app.route('/api/v1/plan', planningRoutes(db, OLLAMA_URL, OLLAMA_MODEL));

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`pushup-api listening on :${info.port} (ollama: ${OLLAMA_URL}, model: ${OLLAMA_MODEL})`);
});
