import type { SQLiteDatabase } from 'expo-sqlite';
import { IApiClient, SyncSession, SyncSet } from '../api/client';

export interface ISyncService {
  syncPending(): Promise<number>;
}

interface SessionRow {
  id: string;
  exercise_id: string;
  weekly_plan_id: string | null;
  session_type: string;
  target_reps: number | null;
  started_at: string;
  ended_at: string | null;
  total_reps: number | null;
  set_count: number | null;
  user_feedback: string | null;
}

interface SetRow {
  id: string;
  session_id: string;
  set_number: number;
  reps: number;
  recorded_at: string;
  rest_seconds: number | null;
}

// deviceId is intentionally absent — the Bearer header on each /sync
// request identifies the device and the server stamps it server-side.
export function createSyncService(db: SQLiteDatabase, api: IApiClient): ISyncService {
  return {
    async syncPending(): Promise<number> {
      const reachable = await api.isReachable();
      if (!reachable) return 0;

      const sessionRows = await db.getAllAsync<SessionRow>(
        'SELECT * FROM sessions WHERE synced = 0 AND ended_at IS NOT NULL',
      );
      if (sessionRows.length === 0) return 0;

      // Pull all sets for the unsynced sessions in one query, then bucket
      // them by session_id. Avoids N+1 round-trips through expo-sqlite.
      const ids = sessionRows.map((s) => s.id);
      const placeholders = ids.map(() => '?').join(',');
      const setRows = await db.getAllAsync<SetRow>(
        `SELECT * FROM sets WHERE session_id IN (${placeholders}) ORDER BY set_number ASC`,
        ids,
      );
      const setsBySession = new Map<string, SyncSet[]>();
      for (const r of setRows) {
        const arr = setsBySession.get(r.session_id) ?? [];
        arr.push({
          id: r.id,
          setNumber: r.set_number,
          reps: r.reps,
          recordedAt: r.recorded_at,
          restSeconds: r.rest_seconds,
        });
        setsBySession.set(r.session_id, arr);
      }

      const sessions: SyncSession[] = sessionRows.map((s) => ({
        id: s.id,
        exerciseId: s.exercise_id,
        weeklyPlanId: s.weekly_plan_id,
        sessionType: s.session_type,
        targetReps: s.target_reps,
        startedAt: s.started_at,
        // ended_at is non-null because the SELECT filters for it.
        endedAt: s.ended_at as string,
        totalReps: s.total_reps ?? 0,
        setCount: s.set_count ?? 0,
        userFeedback: s.user_feedback,
        sets: setsBySession.get(s.id) ?? [],
      }));

      // Errors here (network down, 5xx, auth refresh failed) bubble up
      // from fetchJson/wrapWithRetry. Catch and return 0 so the caller
      // can retry on the next trigger — never crash the app on sync.
      let synced: string[] = [];
      try {
        const res = await api.syncWorkouts({ sessions });
        synced = res.synced;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('syncPending: backend rejected batch', err);
        return 0;
      }

      // Mark only ids the server actually accepted. A session sent but
      // missing from `synced` (server validation failure, partial txn,
      // etc.) stays synced=0 and will retry next trigger.
      let count = 0;
      for (const id of synced) {
        await db.runAsync('UPDATE sessions SET synced = 1 WHERE id = ?', [id]);
        count++;
      }
      return count;
    },
  };
}
