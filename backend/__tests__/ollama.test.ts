import { createOllamaClient, VoiceContext } from '../src/ollama.js';

// Mock fetch globally
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

describe('OllamaClient', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('sends transcript and context to Ollama chat API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        message: {
          content: 'Go!',
          tool_calls: [{ function: { name: 'start_set', arguments: {} } }],
        },
      }),
    });

    const client = createOllamaClient('http://localhost:11434', 'llama3.2:3b');
    const result = await client.voiceRespond('ready', makeContext());

    expect(result.spokenResponse).toBe('Go!');
    expect(result.toolCalls).toEqual([{ name: 'start_set', params: {} }]);

    const fetchCall = mockFetch.mock.calls[0];
    expect(fetchCall[0]).toBe('http://localhost:11434/api/chat');
    const body = JSON.parse(fetchCall[1].body);
    expect(body.model).toBe('llama3.2:3b');
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[1].content).toBe('ready');
    expect(body.tools.length).toBeGreaterThan(0);
  });

  it('returns empty tool calls when Ollama has none', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        message: { content: 'Keep going, you got this!' },
      }),
    });

    const client = createOllamaClient('http://localhost:11434', 'llama3.2:3b');
    const result = await client.voiceRespond('this is hard', makeContext({ appState: 'mid_set' }));

    expect(result.spokenResponse).toBe('Keep going, you got this!');
    expect(result.toolCalls).toEqual([]);
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const client = createOllamaClient('http://localhost:11434', 'llama3.2:3b');
    await expect(client.voiceRespond('ready', makeContext())).rejects.toThrow('Ollama error: 500');
  });

  it('includes countdown context in system prompt for mid_set', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        message: {
          content: 'Only 25 to go!',
          tool_calls: [{ function: { name: 'record_reps', arguments: { count: 15 } } }],
        },
      }),
    });

    const client = createOllamaClient('http://localhost:11434', 'llama3.2:3b');
    await client.voiceRespond('15', makeContext({
      appState: 'mid_set',
      currentSet: { repsRecorded: 0, startedAt: '2025-01-01T00:00:00Z' },
    }));

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const systemPrompt: string = body.messages[0].content;
    expect(systemPrompt).toContain('mid_set');
    expect(systemPrompt).toContain('target');
  });
});
