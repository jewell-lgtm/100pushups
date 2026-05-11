// Covers `IApiClient.getHistoryMonth` — happy path returns the parsed
// month bundle (days + recent); 401/403 surfaces as AuthError so
// `getApiClient.wrapWithRetry` can trigger a single reauth + retry;
// other non-2xx surfaces as a plain Error; URL query params are
// encoded. Phase 14.5 — History screen consumes this via
// `useMonthHistory`.

import {
  AuthError,
  createApiClient,
  HistoryMonthResponse,
} from '../../src/api/client';

describe('getHistoryMonth', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('GETs /api/v1/history?year=&month=&exerciseId=… and returns the parsed bundle', async () => {
    const expected: HistoryMonthResponse = {
      days: [
        { day: 1, totalReps: 30, target: 30 },
        { day: 3, totalReps: 22, target: null },
        { day: 7, totalReps: 60, target: 50 },
      ],
      recent: [
        {
          id: 'sess-1',
          startedAt: '2026-05-11T08:00:00Z',
          totalReps: 60,
          setCount: 3,
          userFeedback: 'felt strong',
        },
        {
          id: 'sess-2',
          startedAt: '2026-05-10T08:00:00Z',
          totalReps: 50,
          setCount: 3,
          userFeedback: null,
        },
      ],
    };
    const fetchMock = jest.fn(async () =>
      new Response(JSON.stringify(expected), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const client = createApiClient('http://test', { authHeader: 'Bearer t' });
    const out = await client.getHistoryMonth({
      year: 2026,
      month: 5,
      exerciseId: 'pushups',
    });

    expect(out).toEqual(expected);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const [url, init] = call;
    expect(url).toBe(
      'http://test/api/v1/history?year=2026&month=5&exerciseId=pushups',
    );
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer t');
  });

  it('passes through empty arrays so the History screen can render the "no workouts yet" state', async () => {
    const emptyBundle: HistoryMonthResponse = { days: [], recent: [] };
    globalThis.fetch = jest.fn(async () =>
      new Response(JSON.stringify(emptyBundle), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as unknown as typeof globalThis.fetch;

    const client = createApiClient('http://test', { authHeader: 'Bearer t' });
    const out = await client.getHistoryMonth({
      year: 2026,
      month: 5,
      exerciseId: 'pushups',
    });
    expect(out).toEqual(emptyBundle);
  });

  it('URL-encodes the exerciseId query parameter', async () => {
    const fetchMock = jest.fn(async () =>
      new Response(JSON.stringify({ days: [], recent: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const client = createApiClient('http://test', { authHeader: 'Bearer t' });
    await client.getHistoryMonth({
      year: 2026,
      month: 12,
      exerciseId: 'push ups',
    });

    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe(
      'http://test/api/v1/history?year=2026&month=12&exerciseId=push+ups',
    );
  });

  it('throws AuthError on 401 so the wrapper can reauth + retry', async () => {
    globalThis.fetch = jest.fn(async () =>
      new Response('', { status: 401 }),
    ) as unknown as typeof globalThis.fetch;

    const client = createApiClient('http://test', { authHeader: 'Bearer stale' });
    await expect(
      client.getHistoryMonth({ year: 2026, month: 5, exerciseId: 'pushups' }),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it('throws AuthError on 403', async () => {
    globalThis.fetch = jest.fn(async () =>
      new Response('', { status: 403 }),
    ) as unknown as typeof globalThis.fetch;

    const client = createApiClient('http://test', { authHeader: 'Bearer t' });
    await expect(
      client.getHistoryMonth({ year: 2026, month: 5, exerciseId: 'pushups' }),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it('throws a generic Error on other non-2xx (e.g. 500)', async () => {
    globalThis.fetch = jest.fn(async () =>
      new Response('boom', { status: 500 }),
    ) as unknown as typeof globalThis.fetch;

    const client = createApiClient('http://test', { authHeader: 'Bearer t' });
    await expect(
      client.getHistoryMonth({ year: 2026, month: 5, exerciseId: 'pushups' }),
    ).rejects.toThrow('API error: 500');
  });
});
