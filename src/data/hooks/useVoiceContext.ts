/**
 * `useVoiceContext` — single-query hook backing the Workout greeting.
 *
 * Phase 14.5 migration: `src/hooks/useWorkoutSession.ts:startSession`
 * used to call `repo.buildVoiceContext(exerciseId)` to derive the five
 * fields the coach greeting reads (yesterday's total, personal best,
 * streak, today's plan target, session type). The same shape now
 * comes from `GET /api/v1/voice/context?exerciseId=` and TanStack
 * Query memoises it across mounts.
 *
 * Pre-fetch design:
 *   - Stats screen mount fires `queryClient.prefetchQuery` against
 *     the same key (see `app/index.tsx`), so by the time the user
 *     taps "Start workout" the bundle is already in cache.
 *   - `startSession` reads via `queryClient.fetchQuery` which serves
 *     from cache when warm and fires a network call otherwise — no
 *     race between hook mount and the imperative call site.
 *   - `staleTime: 30_000` matches the stats/history budget; the
 *     greeting can tolerate up-to-30-second-old data since the
 *     Workout itself hasn't started yet.
 */

import { useQuery } from '@tanstack/react-query';
import { getApiClient } from '../../api/getApiClient';
import { VoiceContextResponse } from '../../api/client';
import { queryKeys } from '../queryKeys';

export function useVoiceContext(exerciseId: string = 'pushups') {
  return useQuery<VoiceContextResponse>({
    queryKey: queryKeys.voiceContext(exerciseId),
    queryFn: async () => {
      const client = await getApiClient();
      return client.getVoiceContext({ exerciseId });
    },
    staleTime: 30_000,
  });
}
