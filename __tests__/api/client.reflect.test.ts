// Covers `IApiClient.reflectSession` — happy path returns the parsed
// reflection text; null reflection passes through (backend's fail-soft
// shape); 401/403 surfaces as AuthError so getApiClient.wrapWithRetry
// can trigger a single reauth + retry.

import { AuthError, createApiClient } from '../../src/api/client';

describe('reflectSession', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('POSTs the request to /api/v1/session/reflect and returns the parsed reflection', async () => {
    const fetchMock = jest.fn(async () =>
      new Response(JSON.stringify({ reflection: 'Nice work today.' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const client = createApiClient('http://test', { authHeader: 'Bearer t' });
    const out = await client.reflectSession({ sessionId: 'sess-1' });

    expect(out).toEqual({ reflection: 'Nice work today.' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const [url, init] = call;
    expect(url).toBe('http://test/api/v1/session/reflect');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ sessionId: 'sess-1' });
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer t');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('passes through `{ reflection: null }` so the screen can render the static fallback', async () => {
    globalThis.fetch = jest.fn(async () =>
      new Response(JSON.stringify({ reflection: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as unknown as typeof globalThis.fetch;

    const client = createApiClient('http://test', { authHeader: 'Bearer t' });
    const out = await client.reflectSession({ sessionId: 'sess-1' });

    expect(out).toEqual({ reflection: null });
  });

  it('throws AuthError on 401 so the wrapper can reauth + retry', async () => {
    globalThis.fetch = jest.fn(async () =>
      new Response('', { status: 401 }),
    ) as unknown as typeof globalThis.fetch;

    const client = createApiClient('http://test', { authHeader: 'Bearer stale' });
    await expect(
      client.reflectSession({ sessionId: 'sess-1' }),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it('throws AuthError on 403', async () => {
    globalThis.fetch = jest.fn(async () =>
      new Response('', { status: 403 }),
    ) as unknown as typeof globalThis.fetch;

    const client = createApiClient('http://test', { authHeader: 'Bearer t' });
    await expect(
      client.reflectSession({ sessionId: 'sess-1' }),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it('throws a generic Error on other non-2xx (e.g. 500)', async () => {
    globalThis.fetch = jest.fn(async () =>
      new Response('boom', { status: 500 }),
    ) as unknown as typeof globalThis.fetch;

    const client = createApiClient('http://test', { authHeader: 'Bearer t' });
    await expect(
      client.reflectSession({ sessionId: 'sess-1' }),
    ).rejects.toThrow('API error: 500');
  });
});
