import { createOllamaClient, IOllamaClient, VoiceContext, OllamaResponse } from '../src/ollama.js';
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

describe('voiceRespondStream', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('streams content tokens and resolves with accumulated response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: ndjsonStream([
        JSON.stringify({ message: { content: 'Hi' } }),
        JSON.stringify({ message: { content: ' there' } }),
        JSON.stringify({ done: true }),
      ]),
    });

    const client = createOllamaClient('http://localhost:11434', 'llama3.2:3b');
    const tokens: string[] = [];
    const result = await client.voiceRespondStream('hello', makeContext(), (t) => tokens.push(t));

    expect(tokens).toEqual(['Hi', ' there']);
    expect(result).toEqual({ toolCalls: [], spokenResponse: 'Hi there' });

    const fetchCall = mockFetch.mock.calls[0];
    expect(fetchCall[0]).toBe('http://localhost:11434/api/chat');
    const body = JSON.parse(fetchCall[1].body);
    expect(body.stream).toBe(true);
    expect(body.tools.length).toBeGreaterThan(0);
  });

  it('handles chunks split across multiple reader frames', async () => {
    // Simulate one fetch chunk containing partial JSON, the next completing it.
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
    const tokens: string[] = [];
    const result = await client.voiceRespondStream('hello', makeContext(), (t) => tokens.push(t));

    expect(tokens).toEqual(['Hi', ' there']);
    expect(result.spokenResponse).toBe('Hi there');
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
    const result = await client.voiceRespondStream('ready', makeContext(), () => {});

    expect(result.toolCalls).toEqual([{ name: 'start_set', params: {} }]);
    expect(result.spokenResponse).toBe('Go!');
  });

  it('returns toolCalls with empty content (route falls back via generateSpokenResponse)', async () => {
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
    const tokens: string[] = [];
    const result = await client.voiceRespondStream('ready', makeContext(), (t) => tokens.push(t));

    expect(tokens).toEqual([]);
    expect(result.toolCalls).toEqual([{ name: 'start_set', params: {} }]);
    expect(result.spokenResponse).toBe('');

    // The route layer composes the fallback; verify that helper does the right thing.
    expect(generateSpokenResponse(result.toolCalls, makeContext())).toBe('Go!');
  });

  it('returns empty fallback on Ollama 500', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, body: null });

    const client = createOllamaClient('http://localhost:11434', 'llama3.2:3b');
    const tokens: string[] = [];
    const result = await client.voiceRespondStream('ready', makeContext(), (t) => tokens.push(t));

    expect(tokens).toEqual([]);
    expect(result).toEqual({ toolCalls: [], spokenResponse: '' });
  });

  it('returns empty fallback on fetch network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network down'));

    const client = createOllamaClient('http://localhost:11434', 'llama3.2:3b');
    const result = await client.voiceRespondStream('ready', makeContext(), () => {});

    expect(result).toEqual({ toolCalls: [], spokenResponse: '' });
  });

  it('route emits NDJSON token frames followed by a single done frame', async () => {
    const fakeClient: IOllamaClient = {
      async voiceRespond(): Promise<OllamaResponse> {
        return { toolCalls: [], spokenResponse: '' };
      },
      async voiceRespondStream(_t, _c, onToken): Promise<OllamaResponse> {
        onToken('Hello');
        onToken(' world');
        return { toolCalls: [], spokenResponse: 'Hello world' };
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
      async voiceRespond(): Promise<OllamaResponse> {
        return { toolCalls: [], spokenResponse: '' };
      },
      async voiceRespondStream(): Promise<OllamaResponse> {
        return { toolCalls: [{ name: 'start_set', params: {} }], spokenResponse: '' };
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
      async voiceRespond(): Promise<OllamaResponse> {
        return { toolCalls: [], spokenResponse: '' };
      },
      async voiceRespondStream(): Promise<OllamaResponse> {
        return { toolCalls: [], spokenResponse: '' };
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
    const tokens: string[] = [];
    const result = await client.voiceRespondStream('hello', makeContext(), (t) => tokens.push(t));

    expect(tokens).toEqual(['A', 'B']);
    expect(result.spokenResponse).toBe('AB');
  });
});
