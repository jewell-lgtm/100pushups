/**
 * `useStatsBundle` — single-query hook backing the Stats screen.
 *
 * Phase 14.5 migration: `app/index.tsx` used to fire four sequential
 * `repo.*` reads (PB / second-best / week totals / today sets + voice
 * context fields) in a `useEffect`. This hook collapses that into a
 * single `GET /api/v1/stats` round-trip and lets TanStack Query
 * memoise the result across mounts.
 *
 * staleTime is 30s per the plan doc's stats-read budget — the screen
 * re-renders from cache on every nav, and `useFocusEffect` invalidates
 * `queryKeys.stats.bundle` after a workout so the data freshens.
 */

import { useQuery } from '@tanstack/react-query';
import { getApiClient } from '../../api/getApiClient';
import { StatsBundleResponse } from '../../api/client';
import { queryKeys } from '../queryKeys';

export function useStatsBundle(exerciseId: string = 'pushups') {
  return useQuery<StatsBundleResponse>({
    queryKey: queryKeys.stats.bundle,
    queryFn: async () => {
      const client = await getApiClient();
      return client.getStatsBundle({ exerciseId });
    },
    staleTime: 30_000,
  });
}
