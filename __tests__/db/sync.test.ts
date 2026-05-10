import type { SQLiteDatabase } from 'expo-sqlite';
import { createSyncService } from '../../src/db/sync';
import {
  IApiClient,
  StreamFrame,
  SyncRequest,
  SyncResponse,
} from '../../src/api/client';
import { VoiceRequest, VoiceResponse } from '../../src/api/types';

// Tiny in-memory fake covering only the SQLiteDatabase methods sync.ts
// hits. Avoids pulling expo-sqlite's native binding into Node tests.
interface SessionRecord {
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
  synced: number;
}
interface SetRecord {
  id: string;
  session_id: string;
  set_number: number;
  reps: number;
  recorded_at: string;
  rest_seconds: number | null;
}

function makeFakeDb(sessions: SessionRecord[], sets: SetRecord[]): SQLiteDatabase {
  return {
    async getAllAsync(query: string, params?: unknown[]): Promise<unknown[]> {
      if (query.startsWith('SELECT * FROM sessions')) {
        return sessions.filter((s) => s.synced === 0 && s.ended_at !== null);
      }
      if (query.startsWith('SELECT * FROM sets')) {
        const ids = (params ?? []) as string[];
        return sets
          .filter((s) => ids.includes(s.session_id))
          .sort((a, b) => a.set_number - b.set_number);
      }
      return [];
    },
    async runAsync(query: string, params?: unknown[]): Promise<{ changes: number; lastInsertRowId: number }> {
      if (query === 'UPDATE sessions SET synced = 1 WHERE id = ?' && params) {
        const id = params[0] as string;
        const row = sessions.find((s) => s.id === id);
        if (row) row.synced = 1;
        return { changes: row ? 1 : 0, lastInsertRowId: 0 };
      }
      return { changes: 0, lastInsertRowId: 0 };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function makeFakeApi(opts: {
  reachable?: boolean;
  syncImpl?: (req: SyncRequest) => Promise<SyncResponse>;
}): IApiClient & { calls: SyncRequest[] } {
  const calls: SyncRequest[] = [];
  return {
    calls,
    voiceRespond: async (_req: VoiceRequest): Promise<VoiceResponse> => {
      throw new Error('not used');
    },
    // eslint-disable-next-line require-yield
    voiceRespondStream: async function* (
      _req: VoiceRequest,
    ): AsyncGenerator<StreamFrame, void, void> {
      throw new Error('not used');
    },
    async syncWorkouts(req: SyncRequest): Promise<SyncResponse> {
      calls.push(req);
      if (opts.syncImpl) return opts.syncImpl(req);
      return { synced: req.sessions.map((s) => s.id) };
    },
    async generateWeeklyPlan() {
      throw new Error('not used');
    },
    async isReachable(): Promise<boolean> {
      return opts.reachable ?? true;
    },
  };
}

const session = (id: string, synced = 0): SessionRecord => ({
  id,
  exercise_id: 'pushups',
  weekly_plan_id: null,
  session_type: 'regular',
  target_reps: 30,
  started_at: '2026-05-10T10:00:00Z',
  ended_at: '2026-05-10T10:15:00Z',
  total_reps: 40,
  set_count: 2,
  user_feedback: 'felt good',
  synced,
});

const setRow = (id: string, sessionId: string, setNumber: number, reps: number): SetRecord => ({
  id,
  session_id: sessionId,
  set_number: setNumber,
  reps,
  recorded_at: '2026-05-10T10:05:00Z',
  rest_seconds: null,
});

describe('createSyncService.syncPending', () => {
  it('only marks sessions the server confirmed in the synced array', async () => {
    const sessions = [session('s1'), session('s2')];
    const sets = [
      setRow('set1', 's1', 1, 25),
      setRow('set2', 's1', 2, 15),
      setRow('set3', 's2', 1, 20),
    ];
    const db = makeFakeDb(sessions, sets);
    // Server accepts s1, drops s2 (e.g. validation failure server-side).
    const api = makeFakeApi({
      syncImpl: async () => ({ synced: ['s1'] }),
    });

    const svc = createSyncService(db, api);
    const count = await svc.syncPending();

    expect(count).toBe(1);
    expect(sessions.find((s) => s.id === 's1')?.synced).toBe(1);
    expect(sessions.find((s) => s.id === 's2')?.synced).toBe(0);
    expect(api.calls).toHaveLength(1);
    // Both sessions were sent in the request; response decides what gets marked.
    expect(api.calls[0].sessions.map((s) => s.id).sort()).toEqual(['s1', 's2']);
    // s1's sets are nested under the session, ordered by setNumber.
    const s1 = api.calls[0].sessions.find((s) => s.id === 's1')!;
    expect(s1.sets.map((x) => x.setNumber)).toEqual([1, 2]);
    expect(s1.sets.map((x) => x.reps)).toEqual([25, 15]);
  });

  it('returns 0 and does not call syncWorkouts when api.isReachable() is false', async () => {
    const sessions = [session('s1')];
    const db = makeFakeDb(sessions, []);
    const api = makeFakeApi({ reachable: false });

    const svc = createSyncService(db, api);
    const count = await svc.syncPending();

    expect(count).toBe(0);
    expect(api.calls).toHaveLength(0);
    expect(sessions[0].synced).toBe(0);
  });

  it('returns 0 and leaves rows untouched when syncWorkouts throws', async () => {
    const sessions = [session('s1'), session('s2')];
    const db = makeFakeDb(sessions, []);
    const api = makeFakeApi({
      syncImpl: async () => {
        throw new Error('network');
      },
    });

    const svc = createSyncService(db, api);
    // Suppress the expected console.warn for the catch path.
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const count = await svc.syncPending();
    warnSpy.mockRestore();

    expect(count).toBe(0);
    expect(sessions[0].synced).toBe(0);
    expect(sessions[1].synced).toBe(0);
  });
});
