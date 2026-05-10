import { useCallback, useEffect, useRef } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { getDatabase } from '../db/getDatabase';
import { getApiClient } from '../api/getApiClient';
import { createSyncService } from '../db/sync';

// Module-level inflight promise so simultaneous triggers (foreground +
// session-end firing in the same tick) coalesce into one round-trip.
let inflight: Promise<number> | null = null;

async function runSync(): Promise<number> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const [db, api] = await Promise.all([getDatabase(), getApiClient()]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const svc = createSyncService(db as any, api);
      return await svc.syncPending();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('useSync: triggerSync failed', err);
      return 0;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

// Test-only reset hook so jest can clear the module-level inflight
// promise between cases.
export function _resetSyncForTests(): void {
  inflight = null;
}

export interface UseSyncResult {
  triggerSync: () => Promise<number>;
}

// useSync exposes a stable triggerSync() and (when mounted) wires an
// AppState listener that fires sync on foreground transitions. Native
// only — react-native-web's AppState shim never emits 'active', so on
// web we skip the listener entirely and rely on explicit triggers.
export function useSync(): UseSyncResult {
  const triggerSync = useCallback(() => runSync(), []);
  const lastStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', (next) => {
      const prev = lastStateRef.current;
      lastStateRef.current = next;
      // Only fire on background→active transition. 'inactive' is a
      // mid-state on iOS during alerts/notifications and shouldn't
      // trigger sync.
      if (next === 'active' && prev !== 'active') {
        void runSync();
      }
    });
    return () => sub.remove();
  }, []);

  return { triggerSync };
}
