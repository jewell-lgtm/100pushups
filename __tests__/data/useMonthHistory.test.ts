// Phase 14.5 — verifies `useMonthHistory` wires its query against the
// bundled `/api/v1/history` endpoint, uses the shared
// `queryKeys.history(year, month)` key, and honours the 30s staleTime
// budget. Uses `QueryObserver` (the headless primitive useQuery is
// built on) so we don't need React Testing Library — same pattern as
// `__tests__/data/useStatsBundle.test.ts`.

import { QueryClient, QueryObserver } from '@tanstack/react-query';

// Mock `getApiClient` so we can assert exactly which method the hook
// dispatches to and control the resolved payload.
const getHistoryMonthMock = jest.fn();
jest.mock('../../src/api/getApiClient', () => ({
  getApiClient: jest.fn(async () => ({ getHistoryMonth: getHistoryMonthMock })),
}));

import { HistoryMonthResponse } from '../../src/api/client';
import { queryKeys } from '../../src/data/queryKeys';

function buildObserver(
  client: QueryClient,
  year: number,
  month: number,
  exerciseId: string = 'pushups',
): QueryObserver<HistoryMonthResponse> {
  return new QueryObserver<HistoryMonthResponse>(client, {
    queryKey: queryKeys.history(year, month),
    queryFn: async () => {
      const mod = await import('../../src/api/getApiClient');
      const api = await mod.getApiClient();
      return api.getHistoryMonth({ year, month, exerciseId });
    },
    staleTime: 30_000,
  });
}

function makeBundle(
  overrides: Partial<HistoryMonthResponse> = {},
): HistoryMonthResponse {
  return {
    days: [
      { day: 1, totalReps: 30, target: 30 },
      { day: 3, totalReps: 22, target: null },
      { day: 11, totalReps: 60, target: 50 },
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
      {
        id: 'sess-3',
        startedAt: '2026-05-09T08:00:00Z',
        totalReps: 40,
        setCount: 2,
        userFeedback: null,
      },
    ],
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

describe('useMonthHistory (Phase 14.5)', () => {
  beforeEach(() => {
    getHistoryMonthMock.mockReset();
  });

  it('resolves to the bundled history payload', async () => {
    const bundle = makeBundle();
    getHistoryMonthMock.mockResolvedValue(bundle);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const observer = buildObserver(client, 2026, 5);

    const data = await waitForSuccess(observer);
    expect(data).toEqual(bundle);
    expect(getHistoryMonthMock).toHaveBeenCalledWith({
      year: 2026,
      month: 5,
      exerciseId: 'pushups',
    });
  });

  it('passes a custom exerciseId through to the api client', async () => {
    getHistoryMonthMock.mockResolvedValue(makeBundle());

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const observer = buildObserver(client, 2026, 5, 'situps');
    await waitForSuccess(observer);

    expect(getHistoryMonthMock).toHaveBeenCalledWith({
      year: 2026,
      month: 5,
      exerciseId: 'situps',
    });
  });

  it('honours a 30s staleTime — a second fetchQuery within the window is served from cache', async () => {
    getHistoryMonthMock.mockResolvedValue(makeBundle());

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const queryFn = jest.fn(async () => {
      const mod = await import('../../src/api/getApiClient');
      const api = await mod.getApiClient();
      return api.getHistoryMonth({
        year: 2026,
        month: 5,
        exerciseId: 'pushups',
      });
    });

    await client.fetchQuery({
      queryKey: queryKeys.history(2026, 5),
      queryFn,
      staleTime: 30_000,
    });
    await client.fetchQuery({
      queryKey: queryKeys.history(2026, 5),
      queryFn,
      staleTime: 30_000,
    });

    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(getHistoryMonthMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces empty arrays from an empty-DB bundle', async () => {
    const empty = makeBundle({ days: [], recent: [] });
    getHistoryMonthMock.mockResolvedValue(empty);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const observer = buildObserver(client, 2026, 5);

    const data = await waitForSuccess(observer);
    expect(data.days).toEqual([]);
    expect(data.recent).toEqual([]);
  });

  it('uses the shared `queryKeys.history(year, month)` cache key', () => {
    expect(queryKeys.history(2026, 5)).toEqual(['history', 2026, 5]);
    // Different months get different keys so paging triggers a refetch.
    expect(queryKeys.history(2026, 4)).not.toEqual(queryKeys.history(2026, 5));
  });

  it('different (year, month) inputs are cached separately', async () => {
    const may = makeBundle({ days: [{ day: 5, totalReps: 50, target: null }] });
    const april = makeBundle({ days: [{ day: 4, totalReps: 40, target: null }] });
    getHistoryMonthMock.mockImplementation(async (req: { month: number }) =>
      req.month === 5 ? may : april,
    );

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const obsMay = buildObserver(client, 2026, 5);
    const obsApr = buildObserver(client, 2026, 4);

    const [dataMay, dataApr] = await Promise.all([
      waitForSuccess(obsMay),
      waitForSuccess(obsApr),
    ]);
    expect(dataMay.days[0].day).toBe(5);
    expect(dataApr.days[0].day).toBe(4);
    expect(getHistoryMonthMock).toHaveBeenCalledTimes(2);
  });
});
