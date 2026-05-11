/**
 * `useReflection` — per-session LLM coach reflection for the Complete
 * screen.
 *
 * Phase 14.5 migration: `app/complete.tsx` used to fire `reflectSession`
 * via a manual try/catch inside `loadCompleteData`, degrading any
 * network error to the static fallback string. The local DB reads
 * (session + sets) stay on the repo (write path is authoritative until
 * Phase 14.7); only the network reflection fetch migrates to TanStack
 * Query here.
 *
 * Design notes:
 *  - `staleTime: Infinity` — once the backend has produced a reflection
 *    for a session, the string is immutable; re-entering the Complete
 *    screen via the back gesture should re-use the cached value rather
 *    than re-asking the LLM (which would also waste tokens).
 *  - `retry: 0` — the backend already coerces Ollama timeouts/errors to
 *    `{ reflection: null }`, so a thrown error here means the server
 *    itself is unreachable. Further retries just delay the fallback
 *    string the user is going to see anyway.
 *  - `enabled: sessionId !== null` — the screen mounts before
 *    `useLocalSearchParams` has resolved the id; we don't want to fire
 *    a request keyed on `null`.
 */

import { useQuery } from '@tanstack/react-query';
import { getApiClient } from '../../api/getApiClient';
import { ReflectSessionResponse } from '../../api/client';
import { queryKeys } from '../queryKeys';

export function useReflection(sessionId: string | null) {
  return useQuery<ReflectSessionResponse>({
    // Cast: the queryKey factory requires a string, but `enabled` below
    // ensures the queryFn never fires while `sessionId` is null. The
    // tuple shape is still `['reflection', <id>]` either way.
    queryKey: queryKeys.reflection(sessionId ?? ''),
    queryFn: async () => {
      const client = await getApiClient();
      // Non-null assertion is safe — `enabled` gates the call.
      return client.reflectSession({ sessionId: sessionId as string });
    },
    enabled: sessionId !== null,
    staleTime: Infinity,
    retry: 0,
  });
}
