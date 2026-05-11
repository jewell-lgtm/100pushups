import { createOllamaClient, IOllamaClient, VoiceContext, StreamFrame } from '../src/ollama.js';
import { generateSpokenResponse } from '../src/voiceFallback.js';
import { voiceRoutes } from '../src/routes/voice.js';

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

function makeContext(overrides: Partial<VoiceContext> = {}): VoiceContext {
  return {
    appState: 'awaiting_start',
    currentSet: null,
    setsCompleted: [],
    todayTarget: 40,
    yesterdayTotal: 38,
    personalBest: 42,
    streak: 5,
    sessionType: 'regular',
    ...overrides,
  };
}

// Build a ReadableStream that emits the given NDJSON lines as Uint8Array chunks.
function ndjsonStream(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(line + '\n'));
      }
      controller.close();
    },
  });
}

// Drain the generator into separate tokens and the final done frame.
async function drain(
  gen: AsyncGenerator<StreamFrame, void, void>,
): Promise<{ tokens: string[]; done: StreamFrame & { type: 'done' } }> {
  const tokens: string[] = [];
  let done: (StreamFrame & { type: 'done' }) | null = null;
  for await (const frame of gen) {
    if (frame.type === 'token') tokens.push(frame.text);
    else done = frame;
  }
  if (!done) throw new Error('generator finished without a done frame');
  return { tokens, done };
}

describe('voiceRespondStream', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('streams content tokens and yields a done frame with accumulated response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: ndjsonStream([
        JSON.stringify({ message: { content: 'Hi' } }),
        JSON.stringify({ message: { content: ' there' } }),
        JSON.stringify({ done: true }),
      ]),
    });

    const client = createOllamaClient('http://localhost:11434', 'llama3.2:3b');
    const { tokens, done } = await drain(client.voiceRespondStream('hello', makeContext()));

    expect(tokens).toEqual(['Hi', ' there']);
    expect(done).toEqual({ type: 'done', toolCalls: [], spokenResponse: 'Hi there' });

    const fetchCall = mockFetch.mock.calls[0];
    expect(fetchCall[0]).toBe('http://localhost:11434/api/chat');
    const body = JSON.parse(fetchCall[1].body);
    expect(body.stream).toBe(true);
    expect(body.tools.length).toBeGreaterThan(0);
  });

  it('handles chunks split across multiple reader frames', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"message":{"content":"Hi'));
        controller.enqueue(encoder.encode('"}}\n{"message":{"content":" there"}}\n'));
        controller.enqueue(encoder.encode('{"done":true}\n'));
        controller.close();
      },
    });
    mockFetch.mockResolvedValueOnce({ ok: true, body: stream });

    const client = createOllamaClient('http://localhost:11434', 'llama3.2:3b');
    const { tokens, done } = await drain(client.voiceRespondStream('hello', makeContext()));

    expect(tokens).toEqual(['Hi', ' there']);
    expect(done.spokenResponse).toBe('Hi there');
  });

  it('captures tool_calls emitted on the final frame', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: ndjsonStream([
        JSON.stringify({ message: { content: 'Go!' } }),
        JSON.stringify({
          message: {
            content: '',
            tool_calls: [{ function: { name: 'start_set', arguments: {} } }],
          },
          done: true,
        }),
      ]),
    });

    const client = createOllamaClient('http://localhost:11434', 'llama3.2:3b');
    const { done } = await drain(client.voiceRespondStream('ready', makeContext()));

    expect(done.toolCalls).toEqual([{ name: 'start_set', params: {} }]);
    expect(done.spokenResponse).toBe('Go!');
  });

  it('yields toolCalls with empty content (route falls back via generateSpokenResponse)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: ndjsonStream([
        JSON.stringify({
          message: {
            content: '',
            tool_calls: [{ function: { name: 'start_set', arguments: {} } }],
          },
          done: true,
        }),
      ]),
    });

    const client = createOllamaClient('http://localhost:11434', 'llama3.2:3b');
    const { tokens, done } = await drain(client.voiceRespondStream('ready', makeContext()));

    expect(tokens).toEqual([]);
    expect(done.toolCalls).toEqual([{ name: 'start_set', params: {} }]);
    expect(done.spokenResponse).toBe('');
    expect(generateSpokenResponse(done.toolCalls, makeContext())).toBe('Go!');
  });

  it('yields empty fallback done frame on Ollama 500', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, body: null });

    const client = createOllamaClient('http://localhost:11434', 'llama3.2:3b');
    const { tokens, done } = await drain(client.voiceRespondStream('ready', makeContext()));

    expect(tokens).toEqual([]);
    expect(done).toEqual({ type: 'done', toolCalls: [], spokenResponse: '' });
  });

  it('yields empty fallback done frame on fetch network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network down'));

    const client = createOllamaClient('http://localhost:11434', 'llama3.2:3b');
    const { done } = await drain(client.voiceRespondStream('ready', makeContext()));

    expect(done).toEqual({ type: 'done', toolCalls: [], spokenResponse: '' });
  });

  it('route emits NDJSON token frames followed by a single done frame', async () => {
    const fakeClient: IOllamaClient = {
      async voiceRespond() {
        return { toolCalls: [], spokenResponse: '' };
      },
      async *voiceRespondStream(): AsyncGenerator<StreamFrame, void, void> {
        yield { type: 'token', text: 'Hello' };
        yield { type: 'token', text: ' world' };
        yield { type: 'done', toolCalls: [], spokenResponse: 'Hello world' };
      },
      async generateSessionReflection() {
        return '';
      },
    };
    const app = voiceRoutes(fakeClient);
    const res = await app.request('/respond/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: 'hi', context: makeContext() }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/x-ndjson');
    const text = await res.text();
    const lines = text.trim().split('\n').map(l => JSON.parse(l));
    expect(lines).toEqual([
      { type: 'token', text: 'Hello' },
      { type: 'token', text: ' world' },
      { type: 'done', toolCalls: [], spokenResponse: 'Hello world' },
    ]);
  });

  it('route synthesizes spokenResponse from tool calls when LLM returned none', async () => {
    const fakeClient: IOllamaClient = {
      async voiceRespond() {
        return { toolCalls: [], spokenResponse: '' };
      },
      async *voiceRespondStream(): AsyncGenerator<StreamFrame, void, void> {
        yield { type: 'done', toolCalls: [{ name: 'start_set', params: {} }], spokenResponse: '' };
      },
      async generateSessionReflection() {
        return '';
      },
    };
    const app = voiceRoutes(fakeClient);
    const res = await app.request('/respond/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: 'ready', context: makeContext() }),
    });
    const text = await res.text();
    const lines = text.trim().split('\n').map(l => JSON.parse(l));
    const done = lines[lines.length - 1];
    expect(done.type).toBe('done');
    expect(done.spokenResponse).toBe('Go!');
    expect(done.toolCalls).toEqual([{ name: 'start_set', params: {} }]);
  });

  it('route returns 400 when body is missing fields', async () => {
    const fakeClient: IOllamaClient = {
      async voiceRespond() {
        return { toolCalls: [], spokenResponse: '' };
      },
      async *voiceRespondStream(): AsyncGenerator<StreamFrame, void, void> {
        yield { type: 'done', toolCalls: [], spokenResponse: '' };
      },
      async generateSessionReflection() {
        return '';
      },
    };
    const app = voiceRoutes(fakeClient);
    const res = await app.request('/respond/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('skips malformed JSON lines without crashing', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: ndjsonStream([
        JSON.stringify({ message: { content: 'A' } }),
        '{not valid json',
        JSON.stringify({ message: { content: 'B' } }),
        JSON.stringify({ done: true }),
      ]),
    });

    const client = createOllamaClient('http://localhost:11434', 'llama3.2:3b');
    const { tokens, done } = await drain(client.voiceRespondStream('hello', makeContext()));

    expect(tokens).toEqual(['A', 'B']);
    expect(done.spokenResponse).toBe('AB');
  });
});
