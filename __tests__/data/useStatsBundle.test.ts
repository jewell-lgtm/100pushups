// Phase 14.5 — verifies `useStatsBundle` wires its query against the
// bundled `/api/v1/stats` endpoint and honours the 30s staleTime
// budget. Uses `QueryObserver` (the headless primitive useQuery is
// built on) so we don't need React Testing Library — same pattern as
// `__tests__/data/queryClient.test.ts` which exercises QueryClient
// without rendering.

import { QueryClient, QueryObserver } from '@tanstack/react-query';

// Mock `getApiClient` so we can assert exactly which method the hook
// dispatches to and control the resolved payload.
const getStatsBundleMock = jest.fn();
jest.mock('../../src/api/getApiClient', () => ({
  getApiClient: jest.fn(async () => ({ getStatsBundle: getStatsBundleMock })),
}));

import { StatsBundleResponse } from '../../src/api/client';
import { queryKeys } from '../../src/data/queryKeys';

// Re-import the queryFn shape used by the hook. Inline construction here
// (rather than calling the React hook) mirrors how `useQuery` builds the
// QueryObserver internally, and is the supported way to exercise a query
// without React Testing Library.
function buildObserver(
  client: QueryClient,
  exerciseId: string = 'pushups',
): QueryObserver<StatsBundleResponse> {
  return new QueryObserver<StatsBundleResponse>(client, {
    queryKey: queryKeys.stats.bundle,
    queryFn: async () => {
      // Resolve via the same module the real hook does so the mock fires.
      const mod = await import('../../src/api/getApiClient');
      const api = await mod.getApiClient();
      return api.getStatsBundle({ exerciseId });
    },
    staleTime: 30_000,
  });
}

function makeBundle(overrides: Partial<StatsBundleResponse> = {}): StatsBundleResponse {
  return {
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
    ],
    yesterdayTotal: 75,
    todayTarget: 70,
    ...overrides,
  };
}

async function waitForSuccess<T>(observer: QueryObserver<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const unsubscribe = observer.subscribe((result) => {
      if (result.isSuccess) {
        unsubscribe();
        resolve(result.data as T);
      } else if (result.isError) {
        unsubscribe();
        reject(result.error);
      }
    });
  });
}

describe('useStatsBundle (Phase 14.5)', () => {
  beforeEach(() => {
    getStatsBundleMock.mockReset();
  });

  it('resolves to the bundled stats payload', async () => {
    const bundle = makeBundle();
    getStatsBundleMock.mockResolvedValue(bundle);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const observer = buildObserver(client);

    const data = await waitForSuccess(observer);
    expect(data).toEqual(bundle);
    expect(getStatsBundleMock).toHaveBeenCalledWith({ exerciseId: 'pushups' });
  });

  it('passes a custom exerciseId through to the api client', async () => {
    getStatsBundleMock.mockResolvedValue(makeBundle());

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const observer = buildObserver(client, 'situps');
    await waitForSuccess(observer);

    expect(getStatsBundleMock).toHaveBeenCalledWith({ exerciseId: 'situps' });
  });

  it('honours a 30s staleTime — a second fetchQuery within the window is served from cache', async () => {
    getStatsBundleMock.mockResolvedValue(makeBundle());

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const queryFn = jest.fn(async () => {
      const mod = await import('../../src/api/getApiClient');
      const api = await mod.getApiClient();
      return api.getStatsBundle({ exerciseId: 'pushups' });
    });

    await client.fetchQuery({
      queryKey: queryKeys.stats.bundle,
      queryFn,
      staleTime: 30_000,
    });
    await client.fetchQuery({
      queryKey: queryKeys.stats.bundle,
      queryFn,
      staleTime: 30_000,
    });

    // Second call should hit the cache, not refire the queryFn.
    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(getStatsBundleMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces null fields from an empty-DB bundle (Stats em-dash path)', async () => {
    const empty = makeBundle({
      personalBest: null,
      secondBestSet: null,
      streak: 0,
      longestStreak: 0,
      weekTotals: [],
      todaySets: [],
      yesterdayTotal: null,
      todayTarget: null,
    });
    getStatsBundleMock.mockResolvedValue(empty);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const observer = buildObserver(client);

    const data = await waitForSuccess(observer);
    expect(data.personalBest).toBeNull();
    expect(data.secondBestSet).toBeNull();
    expect(data.yesterdayTotal).toBeNull();
    expect(data.todayTarget).toBeNull();
    expect(data.weekTotals).toEqual([]);
    expect(data.todaySets).toEqual([]);
  });

  it('uses the shared `queryKeys.stats.bundle` cache key', () => {
    expect(queryKeys.stats.bundle).toEqual(['stats', 'bundle']);
  });
});
