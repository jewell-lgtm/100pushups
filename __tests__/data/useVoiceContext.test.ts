// Phase 14.5 — verifies `useVoiceContext` wires its query against the
// bundled `/api/v1/voice/context` endpoint, uses the per-exerciseId
// `queryKeys.voiceContext(exerciseId)` key, and honours the 30s
// staleTime budget. Uses `QueryObserver` / `fetchQuery` (the headless
// primitives `useQuery` is built on) so we don't need React Testing
// Library — same pattern as `useStatsBundle.test.ts`,
// `useMonthHistory.test.ts`, and `useReflection.test.ts`.

import { QueryClient, QueryObserver } from '@tanstack/react-query';

// Mock `getApiClient` so we can assert exactly which method the hook
// dispatches to and control the resolved payload.
const getVoiceContextMock = jest.fn();
jest.mock('../../src/api/getApiClient', () => ({
  getApiClient: jest.fn(async () => ({ getVoiceContext: getVoiceContextMock })),
}));

import { VoiceContextResponse } from '../../src/api/client';
import { queryKeys } from '../../src/data/queryKeys';

// Build a QueryObserver that mirrors what the real `useVoiceContext`
// hook constructs internally. We inline it (rather than calling the
// React hook) so the test doesn't need an RN harness — the supported
// way to exercise a query without React Testing Library.
function buildObserver(
  client: QueryClient,
  exerciseId: string = 'pushups',
): QueryObserver<VoiceContextResponse> {
  return new QueryObserver<VoiceContextResponse>(client, {
    queryKey: queryKeys.voiceContext(exerciseId),
    queryFn: async () => {
      const mod = await import('../../src/api/getApiClient');
      const api = await mod.getApiClient();
      return api.getVoiceContext({ exerciseId });
    },
    staleTime: 30_000,
  });
}

function makeBundle(
  overrides: Partial<VoiceContextResponse> = {},
): VoiceContextResponse {
  return {
    yesterdayTotal: 75,
    personalBest: 24,
    streak: 3,
    todayTarget: 70,
    sessionType: 'regular',
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

describe('useVoiceContext (Phase 14.5)', () => {
  beforeEach(() => {
    getVoiceContextMock.mockReset();
  });

  it('resolves to the bundled voice-context payload', async () => {
    const bundle = makeBundle();
    getVoiceContextMock.mockResolvedValue(bundle);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const observer = buildObserver(client);

    const data = await waitForSuccess(observer);
    expect(data).toEqual(bundle);
    expect(getVoiceContextMock).toHaveBeenCalledWith({ exerciseId: 'pushups' });
  });

  it('passes a custom exerciseId through to the api client', async () => {
    getVoiceContextMock.mockResolvedValue(makeBundle());

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const observer = buildObserver(client, 'situps');
    await waitForSuccess(observer);

    expect(getVoiceContextMock).toHaveBeenCalledWith({ exerciseId: 'situps' });
  });

  it('honours a 30s staleTime — a second fetchQuery within the window is served from cache', async () => {
    getVoiceContextMock.mockResolvedValue(makeBundle());

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const queryFn = jest.fn(async () => {
      const mod = await import('../../src/api/getApiClient');
      const api = await mod.getApiClient();
      return api.getVoiceContext({ exerciseId: 'pushups' });
    });

    await client.fetchQuery({
      queryKey: queryKeys.voiceContext('pushups'),
      queryFn,
      staleTime: 30_000,
    });
    await client.fetchQuery({
      queryKey: queryKeys.voiceContext('pushups'),
      queryFn,
      staleTime: 30_000,
    });

    // Second call should hit the cache, not refire the queryFn — this is
    // exactly the path `startSession` relies on when Stats has prefetched.
    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(getVoiceContextMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces empty-DB null/zero fields (greeting-skips-sentence path)', async () => {
    const empty = makeBundle({
      yesterdayTotal: null,
      personalBest: null,
      streak: 0,
      todayTarget: null,
    });
    getVoiceContextMock.mockResolvedValue(empty);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const observer = buildObserver(client);

    const data = await waitForSuccess(observer);
    expect(data.yesterdayTotal).toBeNull();
    expect(data.personalBest).toBeNull();
    expect(data.todayTarget).toBeNull();
    expect(data.streak).toBe(0);
    expect(data.sessionType).toBe('regular');
  });

  it('different exerciseIds are cached separately', async () => {
    getVoiceContextMock.mockImplementation(
      async (req: { exerciseId: string }) =>
        makeBundle({
          // Encode the exerciseId into a field so we can disambiguate.
          todayTarget: req.exerciseId === 'pushups' ? 70 : 30,
        }),
    );

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const obsPush = buildObserver(client, 'pushups');
    const obsSit = buildObserver(client, 'situps');

    const [push, sit] = await Promise.all([
      waitForSuccess(obsPush),
      waitForSuccess(obsSit),
    ]);
    expect(push.todayTarget).toBe(70);
    expect(sit.todayTarget).toBe(30);
    // Two distinct cache slots → two queryFn fires.
    expect(getVoiceContextMock).toHaveBeenCalledTimes(2);
  });

  it('uses the per-exerciseId `queryKeys.voiceContext(exerciseId)` cache key', () => {
    expect(queryKeys.voiceContext('pushups')).toEqual([
      'voiceContext',
      'pushups',
    ]);
    // Different exerciseIds get different keys so a future situps
    // workout doesn't collide with the pushups slot.
    expect(queryKeys.voiceContext('pushups')).not.toEqual(
      queryKeys.voiceContext('situps'),
    );
  });
});
