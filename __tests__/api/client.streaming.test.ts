import { AuthError, createApiClient } from '../../src/api/client';
import { VoiceRequest } from '../../src/api/types';

function makeNdjsonResponse(lines: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Push lines as separate chunks so we exercise the buffering path.
      for (const line of lines) {
        controller.enqueue(encoder.encode(line));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status,
    headers: { 'Content-Type': 'application/x-ndjson' },
  });
}

const baseRequest: VoiceRequest = {
  transcript: 'ready',
  context: {
    appState: 'awaiting_start',
    currentSet: null,
    setsCompleted: [],
    todayTarget: null,
    yesterdayTotal: null,
    personalBest: null,
    streak: 0,
    sessionType: 'regular',
  },
};

describe('voiceRespondStream', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('fires onToken per token frame and resolves to the done payload', async () => {
    const lines = [
      JSON.stringify({ type: 'token', text: 'Go' }) + '\n',
      JSON.stringify({ type: 'token', text: '!' }) + '\n',
      JSON.stringify({ type: 'token', text: ' Set' }) + '\n',
      JSON.stringify({
        type: 'done',
        toolCalls: [{ name: 'start_set', params: {} }],
        spokenResponse: 'Go! Set',
      }) + '\n',
    ];
    globalThis.fetch = jest.fn().mockResolvedValue(makeNdjsonResponse(lines));

    const tokens: string[] = [];
    const client = createApiClient('http://test');
    const result = await client.voiceRespondStream(baseRequest, (t) => tokens.push(t));

    expect(tokens).toEqual(['Go', '!', ' Set']);
    expect(result.toolCalls).toEqual([{ name: 'start_set', params: {} }]);
    expect(result.spokenResponse).toBe('Go! Set');
  });

  it('handles a chunk that splits a line across reads', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        // First chunk: half a token frame with no newline
        controller.enqueue(encoder.encode('{"type":"token","text":"hel'));
        // Second chunk: rest of token frame plus done frame
        controller.enqueue(
          encoder.encode(
            'lo"}\n' +
              JSON.stringify({ type: 'done', toolCalls: [], spokenResponse: 'hello' }) +
              '\n',
          ),
        );
        controller.close();
      },
    });
    globalThis.fetch = jest.fn().mockResolvedValue(
      new Response(stream, { status: 200 }),
    );

    const tokens: string[] = [];
    const client = createApiClient('http://test');
    const result = await client.voiceRespondStream(baseRequest, (t) => tokens.push(t));

    expect(tokens).toEqual(['hello']);
    expect(result.spokenResponse).toBe('hello');
  });

  it('throws AuthError on 401', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(new Response('', { status: 401 }));
    const client = createApiClient('http://test');
    await expect(
      client.voiceRespondStream(baseRequest, () => {}),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it('throws AuthError on 403', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(new Response('', { status: 403 }));
    const client = createApiClient('http://test');
    await expect(
      client.voiceRespondStream(baseRequest, () => {}),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it('falls back to non-streaming when response.body is null (RN path)', async () => {
    // First call: streaming endpoint returns body-less response
    // Second call: non-streaming /respond endpoint returns full payload
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        // Body-less Response stand-in: object with status/ok and no .body
        {
          ok: true,
          status: 200,
          body: null,
        } as unknown as Response,
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            toolCalls: [{ name: 'start_set', params: {} }],
            spokenResponse: 'Go!',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    globalThis.fetch = fetchMock;

    const tokens: string[] = [];
    const client = createApiClient('http://test');
    const result = await client.voiceRespondStream(baseRequest, (t) => tokens.push(t));

    expect(tokens).toEqual(['Go!']);
    expect(result.spokenResponse).toBe('Go!');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
