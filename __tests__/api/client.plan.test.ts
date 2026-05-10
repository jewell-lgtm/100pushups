// Covers `IApiClient.generateWeeklyPlan` — happy path returns the parsed
// JSON; 401/403 surfaces as AuthError so getApiClient.wrapWithRetry can
// trigger a single reauth + retry.

import { AuthError, createApiClient, GeneratePlanResponse } from '../../src/api/client';

describe('generateWeeklyPlan', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('POSTs the request to /api/v1/plan/weekly and returns the parsed plan', async () => {
    const expected: GeneratePlanResponse = {
      id: 'plan-1',
      weekStart: '2026-05-11',
      dailyTargets: { mon: 20, tue: 22, wed: 24, thu: 22, fri: 26, sat: 0, sun: 28 },
      notes: 'progressive',
    };
    const fetchMock = jest.fn(async () =>
      new Response(JSON.stringify(expected), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const client = createApiClient('http://test', { authHeader: 'Bearer t' });
    const out = await client.generateWeeklyPlan({ exerciseId: 'pushups' });

    expect(out).toEqual(expected);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const [url, init] = call;
    expect(url).toBe('http://test/api/v1/plan/weekly');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ exerciseId: 'pushups' });
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer t');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('throws AuthError on 401 so the wrapper can reauth + retry', async () => {
    globalThis.fetch = jest.fn(async () =>
      new Response('', { status: 401 }),
    ) as unknown as typeof globalThis.fetch;

    const client = createApiClient('http://test', { authHeader: 'Bearer stale' });
    await expect(
      client.generateWeeklyPlan({ exerciseId: 'pushups' }),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it('throws AuthError on 403', async () => {
    globalThis.fetch = jest.fn(async () =>
      new Response('', { status: 403 }),
    ) as unknown as typeof globalThis.fetch;

    const client = createApiClient('http://test', { authHeader: 'Bearer t' });
    await expect(
      client.generateWeeklyPlan({ exerciseId: 'pushups' }),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it('throws a generic Error on other non-2xx (e.g. 500)', async () => {
    globalThis.fetch = jest.fn(async () =>
      new Response('boom', { status: 500 }),
    ) as unknown as typeof globalThis.fetch;

    const client = createApiClient('http://test', { authHeader: 'Bearer t' });
    await expect(
      client.generateWeeklyPlan({ exerciseId: 'pushups' }),
    ).rejects.toThrow('API error: 500');
  });
});
