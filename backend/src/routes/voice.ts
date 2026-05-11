import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import type Database from 'better-sqlite3';
import { IOllamaClient, VoiceContext, OllamaResponse, StreamFrame } from '../ollama.js';
import { generateSpokenResponse } from '../voiceFallback.js';
import { trackVoiceRespond } from '../analytics.js';
import {
  getPersonalBestForDevice,
  getStreakForDevice,
  getYesterdayTotalForDevice,
  getTodayTargetForDevice,
} from '../stats.js';

interface VoiceRequest {
  transcript: string;
  context: VoiceContext;
}

// Server-side `buildVoiceContext`. Returns the same shape the client
// builds in `src/db/repository.ts:buildVoiceContext`, sourced from
// the bearer-scoped session/set history. Phase 14.2 partial — additive,
// the client can keep building its own context until callers migrate.
// `db` is optional so the existing in-memory test rigs that wire voice
// without a database keep working; the route 503s when db is missing.
export function voiceRoutes(ollama: IOllamaClient, db?: Database.Database) {
  const app = new Hono();

  app.get('/context', (c) => {
    if (!db) {
      return c.json({ error: 'voice context unavailable: no db' }, 503);
    }
    const exerciseId = c.req.query('exerciseId') ?? 'pushups';
    const deviceId = c.get('deviceId' as never) as string;

    const pb = getPersonalBestForDevice(db, deviceId, exerciseId);
    return c.json({
      yesterdayTotal: getYesterdayTotalForDevice(db, deviceId, exerciseId),
      personalBest: pb?.reps ?? null,
      streak: getStreakForDevice(db, deviceId, exerciseId),
      todayTarget: getTodayTargetForDevice(db, deviceId, exerciseId),
      sessionType: 'regular' as const,
    });
  });

  app.post('/respond', async (c) => {
    const body = await c.req.json<VoiceRequest>();

    if (!body.transcript || !body.context) {
      return c.json({ error: 'Missing transcript or context' }, 400);
    }

    const reqId = c.get('reqId' as never) as string | undefined;
    const deviceId = c.get('deviceId' as never) as string | undefined;
    const startedAt = Date.now();
    // Privacy: never log the raw transcript — only its length.
    console.log(
      JSON.stringify({
        reqId,
        route: '/api/v1/voice/respond',
        transcriptLen: body.transcript.length,
        appState: body.context.appState,
        deviceId,
      }),
    );

    let result: OllamaResponse;
    let fallbackUsed = false;
    try {
      result = await ollama.voiceRespond(body.transcript, body.context);
    } catch (err) {
      console.error('Ollama error, returning fallback:', err instanceof Error ? err.message : err);
      result = { toolCalls: [], spokenResponse: '' };
      fallbackUsed = true;
    }

    // If LLM didn't provide a spoken response, generate one from the tool calls
    if (!result.spokenResponse && result.toolCalls.length > 0) {
      result.spokenResponse = generateSpokenResponse(result.toolCalls, body.context);
      fallbackUsed = true;
    }

    console.log(
      JSON.stringify({
        reqId,
        route: '/api/v1/voice/respond',
        toolCalls: result.toolCalls.length,
        spokenLen: result.spokenResponse.length,
      }),
    );

    trackVoiceRespond({
      route: '/api/v1/voice/respond',
      latencyMs: Date.now() - startedAt,
      fallbackUsed,
      deviceId,
    });

    return c.json(result);
  });

  app.post('/respond/stream', async (c) => {
    const body = await c.req.json<VoiceRequest>();

    if (!body.transcript || !body.context) {
      return c.json({ error: 'Missing transcript or context' }, 400);
    }

    const reqId = c.get('reqId' as never) as string | undefined;
    const deviceId = c.get('deviceId' as never) as string | undefined;
    const startedAt = Date.now();
    console.log(
      JSON.stringify({
        reqId,
        route: '/api/v1/voice/respond/stream',
        transcriptLen: body.transcript.length,
        appState: body.context.appState,
        deviceId,
      }),
    );

    c.header('Content-Type', 'application/x-ndjson');
    c.header('Cache-Control', 'no-cache');
    c.header('X-Accel-Buffering', 'no');

    return stream(c, async (s) => {
      let doneFrame: StreamFrame & { type: 'done' } = { type: 'done', toolCalls: [], spokenResponse: '' };
      let fallbackUsed = false;

      try {
        for await (const frame of ollama.voiceRespondStream(body.transcript, body.context)) {
          if (frame.type === 'done') {
            doneFrame = frame;
          } else {
            await s.write(JSON.stringify(frame) + '\n');
          }
        }
      } catch (err) {
        console.error('Ollama stream error, returning fallback:', err instanceof Error ? err.message : err);
        fallbackUsed = true;
      }

      // Synthesize a spoken response if the LLM gave tools but no content.
      if (!doneFrame.spokenResponse && doneFrame.toolCalls.length > 0) {
        doneFrame = {
          ...doneFrame,
          spokenResponse: generateSpokenResponse(doneFrame.toolCalls, body.context),
        };
        fallbackUsed = true;
      }

      await s.write(JSON.stringify(doneFrame) + '\n');

      console.log(
        JSON.stringify({
          reqId,
          route: '/api/v1/voice/respond/stream',
          toolCalls: doneFrame.toolCalls.length,
          spokenLen: doneFrame.spokenResponse.length,
        }),
      );

      trackVoiceRespond({
        route: '/api/v1/voice/respond/stream',
        latencyMs: Date.now() - startedAt,
        fallbackUsed,
        deviceId,
      });
    });
  });

  return app;
}
