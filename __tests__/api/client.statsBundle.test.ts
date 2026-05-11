// Covers `IApiClient.getStatsBundle` — happy path returns the parsed
// bundle; null fields pass through (empty-DB shape from the backend);
// 401/403 surfaces as AuthError so `getApiClient.wrapWithRetry` can
// trigger a single reauth + retry; other non-2xx surfaces as a plain
// Error. Phase 14.5 — Stats screen consumes this via `useStatsBundle`.

import { AuthError, createApiClient, StatsBundleResponse } from '../../src/api/client';

describe('getStatsBundle', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('GETs /api/v1/stats?exerciseId=... and returns the parsed bundle', async () => {
    const expected: StatsBundleResponse = {
      personalBest: { reps: 24, date: '2026-05-10T08:00:00Z' },
      secondBestSet: { reps: 22, date: '2026-05-08T08:00:00Z' },
      streak: 3,
      longestStreak: 7,
      weekTotals: [
        { date: '2026-05-04', totalReps: 60, target: 60 },
        { date: '2026-05-05', totalReps: 0, target: null },
        { date: '2026-05-06', totalReps: 55, target: 55 },
        { date: '2026-05-07', totalReps: 0, target: null },
        { date: '2026-05-08', totalReps: 50, target: 50 },
        { date: '2026-05-09', totalReps: 0, target: null },
        { date: '2026-05-10', totalReps: 75, target: 70 },
      ],
      todaySets: [
        { id: 'set-1', setNumber: 1, reps: 20, recordedAt: '2026-05-11T08:01:00Z' },
        { id: 'set-2', setNumber: 2, reps: 18, recordedAt: '2026-05-11T08:03:30Z' },
      ],
      yesterdayTotal: 75,
      todayTarget: 70,
    };
    const fetchMock = jest.fn(async () =>
      new Response(JSON.stringify(expected), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const client = createApiClient('http://test', { authHeader: 'Bearer t' });
    const out = await client.getStatsBundle({ exerciseId: 'pushups' });

    expect(out).toEqual(expected);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const [url, init] = call;
    expect(url).toBe('http://test/api/v1/stats?exerciseId=pushups');
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer t');
  });

  it('passes through null fields so the Stats screen can render em-dashes', async () => {
    // Empty-DB shape returned by the backend on a fresh device.
    const emptyBundle: StatsBundleResponse = {
      personalBest: null,
      secondBestSet: null,
      streak: 0,
      longestStreak: 0,
      weekTotals: [],
      todaySets: [],
      yesterdayTotal: null,
      todayTarget: null,
    };
    globalThis.fetch = jest.fn(async () =>
      new Response(JSON.stringify(emptyBundle), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as unknown as typeof globalThis.fetch;

    const client = createApiClient('http://test', { authHeader: 'Bearer t' });
    const out = await client.getStatsBundle({ exerciseId: 'pushups' });

    expect(out).toEqual(emptyBundle);
  });

  it('URL-encodes the exerciseId query parameter', async () => {
    const fetchMock = jest.fn(async () =>
      new Response(JSON.stringify({
        personalBest: null,
        secondBestSet: null,
        streak: 0,
        longestStreak: 0,
        weekTotals: [],
        todaySets: [],
        yesterdayTotal: null,
        todayTarget: null,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const client = createApiClient('http://test', { authHeader: 'Bearer t' });
    await client.getStatsBundle({ exerciseId: 'push ups' });

    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe('http://test/api/v1/stats?exerciseId=push+ups');
  });

  it('throws AuthError on 401 so the wrapper can reauth + retry', async () => {
    globalThis.fetch = jest.fn(async () =>
      new Response('', { status: 401 }),
    ) as unknown as typeof globalThis.fetch;

    const client = createApiClient('http://test', { authHeader: 'Bearer stale' });
    await expect(
      client.getStatsBundle({ exerciseId: 'pushups' }),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it('throws AuthError on 403', async () => {
    globalThis.fetch = jest.fn(async () =>
      new Response('', { status: 403 }),
    ) as unknown as typeof globalThis.fetch;

    const client = createApiClient('http://test', { authHeader: 'Bearer t' });
    await expect(
      client.getStatsBundle({ exerciseId: 'pushups' }),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it('throws a generic Error on other non-2xx (e.g. 500)', async () => {
    globalThis.fetch = jest.fn(async () =>
      new Response('boom', { status: 500 }),
    ) as unknown as typeof globalThis.fetch;

    const client = createApiClient('http://test', { authHeader: 'Bearer t' });
    await expect(
      client.getStatsBundle({ exerciseId: 'pushups' }),
    ).rejects.toThrow('API error: 500');
  });
});
