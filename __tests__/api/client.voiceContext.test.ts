// Covers `IApiClient.getVoiceContext` — happy path returns the parsed
// five-field bundle; null/zero fields pass through (empty-DB shape from
// the backend); 401/403 surfaces as AuthError so
// `getApiClient.wrapWithRetry` can trigger a single reauth + retry;
// other non-2xx surfaces as a plain Error. Phase 14.5 — Workout screen
// consumes this via `useVoiceContext` to compose the coach greeting.

import {
  AuthError,
  createApiClient,
  VoiceContextResponse,
} from '../../src/api/client';

describe('getVoiceContext', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('GETs /api/v1/voice/context?exerciseId=... and returns the parsed bundle', async () => {
    const expected: VoiceContextResponse = {
      yesterdayTotal: 75,
      personalBest: 24,
      streak: 3,
      todayTarget: 70,
      sessionType: 'regular',
    };
    const fetchMock = jest.fn(async () =>
      new Response(JSON.stringify(expected), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const client = createApiClient('http://test', { authHeader: 'Bearer t' });
    const out = await client.getVoiceContext({ exerciseId: 'pushups' });

    expect(out).toEqual(expected);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const [url, init] = call;
    expect(url).toBe('http://test/api/v1/voice/context?exerciseId=pushups');
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer t');
  });

  it('passes through null fields so the greeting can skip empty stats', async () => {
    // Empty-DB shape returned by the backend on a fresh device — the
    // hook's greeting composition reads each field independently and
    // skips the corresponding sentence when null.
    const emptyBundle: VoiceContextResponse = {
      yesterdayTotal: null,
      personalBest: null,
      streak: 0,
      todayTarget: null,
      sessionType: 'regular',
    };
    globalThis.fetch = jest.fn(async () =>
      new Response(JSON.stringify(emptyBundle), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as unknown as typeof globalThis.fetch;

    const client = createApiClient('http://test', { authHeader: 'Bearer t' });
    const out = await client.getVoiceContext({ exerciseId: 'pushups' });

    expect(out).toEqual(emptyBundle);
  });

  it('URL-encodes the exerciseId query parameter', async () => {
    const fetchMock = jest.fn(async () =>
      new Response(
        JSON.stringify({
          yesterdayTotal: null,
          personalBest: null,
          streak: 0,
          todayTarget: null,
          sessionType: 'regular',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const client = createApiClient('http://test', { authHeader: 'Bearer t' });
    await client.getVoiceContext({ exerciseId: 'push ups' });

    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe('http://test/api/v1/voice/context?exerciseId=push+ups');
  });

  it('throws AuthError on 401 so the wrapper can reauth + retry', async () => {
    globalThis.fetch = jest.fn(async () =>
      new Response('', { status: 401 }),
    ) as unknown as typeof globalThis.fetch;

    const client = createApiClient('http://test', { authHeader: 'Bearer stale' });
    await expect(
      client.getVoiceContext({ exerciseId: 'pushups' }),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it('throws AuthError on 403', async () => {
    globalThis.fetch = jest.fn(async () =>
      new Response('', { status: 403 }),
    ) as unknown as typeof globalThis.fetch;

    const client = createApiClient('http://test', { authHeader: 'Bearer t' });
    await expect(
      client.getVoiceContext({ exerciseId: 'pushups' }),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it('throws a generic Error on other non-2xx (e.g. 500)', async () => {
    globalThis.fetch = jest.fn(async () =>
      new Response('boom', { status: 500 }),
    ) as unknown as typeof globalThis.fetch;

    const client = createApiClient('http://test', { authHeader: 'Bearer t' });
    await expect(
      client.getVoiceContext({ exerciseId: 'pushups' }),
    ).rejects.toThrow('API error: 500');
  });
});
