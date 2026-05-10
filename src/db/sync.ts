import type { SQLiteDatabase } from 'expo-sqlite';
import { IApiClient } from '../api/client';

export interface ISyncService {
  syncPending(): Promise<number>;
}

export function createSyncService(db: SQLiteDatabase, api: IApiClient, deviceId: string): ISyncService {
  return {
    async syncPending(): Promise<number> {
      const reachable = await api.isReachable();
      if (!reachable) return 0;

      const sessions = await db.getAllAsync<{
        id: string; exercise_id: string; weekly_plan_id: string | null;
        session_type: string; target_reps: number | null;
        started_at: string; ended_at: string | null;
        total_reps: number | null; set_count: number | null;
        user_feedback: string | null;
      }>('SELECT * FROM sessions WHERE synced = 0 AND ended_at IS NOT NULL');

      if (sessions.length === 0) return 0;

      // TODO: Implement actual sync via api.syncWorkouts()
      // For now, mark as synced
      for (const session of sessions) {
        await db.runAsync('UPDATE sessions SET synced = 1 WHERE id = ?', [session.id]);
      }

      return sessions.length;
    },
  };
}
