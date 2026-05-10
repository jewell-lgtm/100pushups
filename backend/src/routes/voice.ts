import { Hono } from 'hono';
import { IOllamaClient, VoiceContext, OllamaResponse } from '../ollama.js';
import { generateSpokenResponse } from '../voiceFallback.js';

interface VoiceRequest {
  transcript: string;
  context: VoiceContext;
}

export function voiceRoutes(ollama: IOllamaClient) {
  const app = new Hono();

  app.post('/respond', async (c) => {
    const body = await c.req.json<VoiceRequest>();

    if (!body.transcript || !body.context) {
      return c.json({ error: 'Missing transcript or context' }, 400);
    }

    let result: OllamaResponse;
    try {
      result = await ollama.voiceRespond(body.transcript, body.context);
    } catch (err) {
      console.error('Ollama error, returning fallback:', err instanceof Error ? err.message : err);
      result = { toolCalls: [], spokenResponse: '' };
    }

    // If LLM didn't provide a spoken response, generate one from the tool calls
    if (!result.spokenResponse && result.toolCalls.length > 0) {
      result.spokenResponse = generateSpokenResponse(result.toolCalls, body.context);
    }

    return c.json(result);
  });

  return app;
}
