// Data-loading for the Complete screen.
//
// Split out of `app/complete.tsx` so the local-DB logic is unit-testable
// without an RN test harness. The pure `loadCompleteData` function takes
// an injected repo dep and returns the screen's local-DB view-model;
// `useCompleteData` is a thin React wrapper that calls it once on mount.
//
// Phase 14.5 update: the network reflection fetch moved out of this
// module and into `src/data/hooks/useReflection.ts` (TanStack Query, so
// the reflection caches per-session and survives the back gesture). The
// local-DB reads (session + sets) stay here — the write path is
// authoritative until Phase 14.7.
//
// Contract:
//   - Returns `{ session, sets }` from local SQLite. Session is `null`
//     when the row isn't found (e.g. an unknown sessionId param).

import { useEffect, useState } from 'react';
import { IRepository } from '../db/repository';
import { Session, WorkoutSet } from '../api/types';

// The static fallback string still lives here so the Complete screen
// can import it alongside the data hook — the reflection-card render
// branch in `app/complete.tsx` substitutes this when the backend
// returns null / errors / hasn't resolved yet.
export const COMPLETE_FALLBACK_REFLECTION = 'Nice work. Same time tomorrow?';

export interface CompleteData {
  session: Session | null;
  sets: WorkoutSet[];
}

export interface LoadCompleteDataDeps {
  repo: Pick<IRepository, 'getSessionById' | 'getSetsForSession'>;
  sessionId: string;
}

// Pure-ish: every IO dep is injected. Returns the local-DB view-model.
// Errors propagate — the Complete screen treats a missing row as
// `{ session: null, sets: [] }` (handled by the repo returning null /
// []), not as a thrown error.
export async function loadCompleteData(deps: LoadCompleteDataDeps): Promise<CompleteData> {
  const { repo, sessionId } = deps;

  // The two DB reads run in parallel — they target different tables and
  // SQLite has no contention between them.
  const [session, sets] = await Promise.all([
    repo.getSessionById(sessionId),
    repo.getSetsForSession(sessionId),
  ]);

  return { session, sets };
}

export interface UseCompleteDataState {
  // null while the DB read is in flight; populated once both reads
  // resolve.
  data: CompleteData | null;
  // `true` until the data has resolved at least once. The totals + bars
  // render synchronously off `data.session` once it lands.
  loading: boolean;
}

export function useCompleteData(deps: LoadCompleteDataDeps | null): UseCompleteDataState {
  const [data, setData] = useState<CompleteData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!deps) return;
    let cancelled = false;
    (async () => {
      const result = await loadCompleteData(deps);
      if (cancelled) return;
      setData(result);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // sessionId is the only externally-varying field; repo is a stable
    // ref in `app/complete.tsx`.
  }, [deps?.sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading };
}
