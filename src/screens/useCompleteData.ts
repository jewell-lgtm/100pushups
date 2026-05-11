// Data-loading + fallback logic for the Complete screen (Phase 11.4.2).
//
// Split out of `app/complete.tsx` so the fallback behaviour is unit-
// testable without an RN test harness. The pure `loadCompleteData`
// function takes injected api + repo deps and returns the screen's
// view-model; `useCompleteData` is a thin React wrapper that calls it
// once on mount.
//
// Contract:
//   - reflection: backend string when present; null/error → static
//     fallback "Nice work. Same time tomorrow?".
//   - hasReflection: true iff the backend returned a non-null reflection
//     (analytics dimension; the static fallback counts as false).

import { useEffect, useState } from 'react';
import { IApiClient } from '../api/client';
import { IRepository } from '../db/repository';
import { Session, WorkoutSet } from '../api/types';

export const COMPLETE_FALLBACK_REFLECTION = 'Nice work. Same time tomorrow?';

export interface CompleteData {
  session: Session | null;
  sets: WorkoutSet[];
  reflection: string;
  hasReflection: boolean;
}

export interface LoadCompleteDataDeps {
  api: Pick<IApiClient, 'reflectSession'>;
  repo: Pick<IRepository, 'getSessionById' | 'getSetsForSession'>;
  sessionId: string;
}

// Pure-ish: every IO dep is injected. Returns the assembled view-model.
// Errors from `reflectSession` are caught and degraded to the fallback
// string so the screen never has to render an error state — the spec
// treats `null` and `reject` identically.
export async function loadCompleteData(deps: LoadCompleteDataDeps): Promise<CompleteData> {
  const { api, repo, sessionId } = deps;

  // Local DB read and the network call can run in parallel. The DB
  // read is the source of truth for the totals/bars — we never block
  // those on the network.
  const [session, sets, reflectionResult] = await Promise.all([
    repo.getSessionById(sessionId),
    repo.getSetsForSession(sessionId),
    fetchReflection(api, sessionId),
  ]);

  return {
    session,
    sets,
    reflection: reflectionResult.text,
    hasReflection: reflectionResult.hasReflection,
  };
}

async function fetchReflection(
  api: Pick<IApiClient, 'reflectSession'>,
  sessionId: string,
): Promise<{ text: string; hasReflection: boolean }> {
  try {
    const { reflection } = await api.reflectSession({ sessionId });
    if (typeof reflection === 'string' && reflection.length > 0) {
      return { text: reflection, hasReflection: true };
    }
    return { text: COMPLETE_FALLBACK_REFLECTION, hasReflection: false };
  } catch {
    // Any failure (network, auth-after-retry, 5xx) degrades to the
    // static fallback. The backend already coerces Ollama timeouts to
    // `{ reflection: null }`, so this branch covers genuinely broken
    // connectivity — never an exception path the user needs to see.
    return { text: COMPLETE_FALLBACK_REFLECTION, hasReflection: false };
  }
}

export interface UseCompleteDataState {
  // null while the DB read is in flight; populated once both DB and
  // network have resolved (or the network has degraded to the fallback).
  data: CompleteData | null;
  // `true` until the data has resolved at least once. Drives the
  // ThinkingDots placeholder on the reflection card; the totals + bars
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
    // sessionId is the only externally-varying field; api/repo are
    // stable refs in `app/complete.tsx`.
  }, [deps?.sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading };
}
