import { AuthError, createApiClient, StreamFrame } from '../../src/api/client';
import { VoiceRequest } from '../../src/api/types';

function makeNdjsonResponse(lines: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
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
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('yields token frames per chunk and a done frame at the end', async () => {
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

    const client = createApiClient('http://test');
    const { tokens, done } = await drain(client.voiceRespondStream(baseRequest));

    expect(tokens).toEqual(['Go', '!', ' Set']);
    expect(done.toolCalls).toEqual([{ name: 'start_set', params: {} }]);
    expect(done.spokenResponse).toBe('Go! Set');
  });

  it('handles a chunk that splits a line across reads', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"type":"token","text":"hel'));
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

    const client = createApiClient('http://test');
    const { tokens, done } = await drain(client.voiceRespondStream(baseRequest));

    expect(tokens).toEqual(['hello']);
    expect(done.spokenResponse).toBe('hello');
  });

  it('throws AuthError on 401', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(new Response('', { status: 401 }));
    const client = createApiClient('http://test');
    await expect(drain(client.voiceRespondStream(baseRequest))).rejects.toBeInstanceOf(AuthError);
  });

  it('throws AuthError on 403', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(new Response('', { status: 403 }));
    const client = createApiClient('http://test');
    await expect(drain(client.voiceRespondStream(baseRequest))).rejects.toBeInstanceOf(AuthError);
  });

  it('falls back to non-streaming when response.body is null (RN path)', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
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

    const client = createApiClient('http://test');
    const { tokens, done } = await drain(client.voiceRespondStream(baseRequest));

    expect(tokens).toEqual(['Go!']);
    expect(done.spokenResponse).toBe('Go!');
    expect(done.toolCalls).toEqual([{ name: 'start_set', params: {} }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
