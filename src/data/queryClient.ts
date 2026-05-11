/**
 * TanStack Query singleton for the app.
 *
 * Phase 14.1 foundation — purely additive. No screen consumes this yet;
 * existing data fetching in Stats / History / Complete / Workout / Plan
 * keeps its current `useState` + `useEffect` flow until a future commit
 * migrates each hot path individually.
 *
 * Disk-persistence deferred. The plan calls for
 *   - `@tanstack/query-async-storage-persister`
 *   - `@tanstack/react-query-persist-client`
 *   - an AsyncStorage backend (web: localStorage shim; native:
 *     `@react-native-async-storage/async-storage`)
 * so a cold launch can paint the last-seen Stats/History data before the
 * refetch lands. That decision is cross-platform (RN AsyncStorage is not
 * currently a dependency) and is left for a follow-up. Once
 * `@react-native-async-storage/async-storage` is installed, wrap the
 * provider in `_layout.tsx` with `PersistQueryClientProvider` instead of
 * `QueryClientProvider`. Nothing here needs to change.
 *
 * Defaults rationale:
 *   - `networkMode: 'offlineFirst'` — queries fire from cache first and
 *     do not error out when the device is offline.
 *   - `retry: 2` with exponential backoff capped at 30s — matches the
 *     plan's resilience target without thrashing.
 *   - `mutations.retry: false` — mutation retry will be handled by the
 *     outbox layer landing in 14.6; retrying here would double-fire
 *     side-effects (POST /sessions etc.).
 *   - No global `staleTime` — per-query staleTime (30s for stats /
 *     history, 0 for sessions / sets) is set on each query when the
 *     hook lands, so the default stays at the library default of 0.
 */

import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: 'offlineFirst',
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
    },
    mutations: {
      retry: false,
    },
  },
});
