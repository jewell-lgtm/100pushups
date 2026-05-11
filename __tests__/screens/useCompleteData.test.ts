// Covers the pure data-loading + fallback logic for the Complete
// screen. Tests the `loadCompleteData` helper directly — the React
// wrapper (`useCompleteData`) needs an RN harness which we deliberately
// avoid; the spec calls this out (Phase 11.4.2 test plan).

import { Session, WorkoutSet } from '../../src/api/types';
import {
  COMPLETE_FALLBACK_REFLECTION,
  loadCompleteData,
} from '../../src/screens/useCompleteData';

const fakeSession: Session = {
  id: 'sess-1',
  exerciseId: 'pushups',
  weeklyPlanId: null,
  sessionType: 'regular',
  targetReps: 40,
  startedAt: '2026-05-11T10:00:00Z',
  endedAt: '2026-05-11T10:12:00Z',
  totalReps: 42,
  setCount: 4,
  userFeedback: 'good',
  synced: false,
};

const fakeSets: WorkoutSet[] = [
  { id: 's1', sessionId: 'sess-1', setNumber: 1, reps: 12, recordedAt: '2026-05-11T10:01:00Z', restSeconds: null },
  { id: 's2', sessionId: 'sess-1', setNumber: 2, reps: 11, recordedAt: '2026-05-11T10:04:00Z', restSeconds: null },
  { id: 's3', sessionId: 'sess-1', setNumber: 3, reps: 10, recordedAt: '2026-05-11T10:07:00Z', restSeconds: null },
  { id: 's4', sessionId: 'sess-1', setNumber: 4, reps: 9, recordedAt: '2026-05-11T10:10:00Z', restSeconds: null },
];

function makeRepo() {
  return {
    getSessionById: jest.fn(async (id: string) =>
      id === fakeSession.id ? fakeSession : null,
    ),
    getSetsForSession: jest.fn(async (id: string) =>
      id === fakeSession.id ? fakeSets : [],
    ),
  };
}

describe('loadCompleteData', () => {
  it('returns the reflection text + hasReflection=true on a backend string', async () => {
    const repo = makeRepo();
    const api = {
      reflectSession: jest.fn(async () => ({
        reflection: 'You smashed today — try four sets of twelve tomorrow.',
      })),
    };

    const out = await loadCompleteData({ api, repo, sessionId: 'sess-1' });

    expect(out.session).toEqual(fakeSession);
    expect(out.sets).toEqual(fakeSets);
    expect(out.reflection).toBe(
      'You smashed today — try four sets of twelve tomorrow.',
    );
    expect(out.hasReflection).toBe(true);
    expect(api.reflectSession).toHaveBeenCalledWith({ sessionId: 'sess-1' });
  });

  it('falls back to the static string on `{ reflection: null }`', async () => {
    const repo = makeRepo();
    const api = {
      reflectSession: jest.fn(async () => ({ reflection: null })),
    };

    const out = await loadCompleteData({ api, repo, sessionId: 'sess-1' });

    expect(out.reflection).toBe(COMPLETE_FALLBACK_REFLECTION);
    expect(out.hasReflection).toBe(false);
  });

  it('falls back to the static string when `reflectSession` rejects', async () => {
    const repo = makeRepo();
    const api = {
      reflectSession: jest.fn(async () => {
        throw new Error('network down');
      }),
    };

    const out = await loadCompleteData({ api, repo, sessionId: 'sess-1' });

    expect(out.reflection).toBe(COMPLETE_FALLBACK_REFLECTION);
    expect(out.hasReflection).toBe(false);
    // DB reads still succeed — totals/bars must render even when the
    // network is broken.
    expect(out.session).toEqual(fakeSession);
    expect(out.sets).toEqual(fakeSets);
  });

  it('falls back when the backend returns an empty-string reflection', async () => {
    // Defensive: the backend currently coerces "" → null at the route,
    // but the contract is stringly-typed and the screen treats both as
    // fallback.
    const repo = makeRepo();
    const api = {
      reflectSession: jest.fn(async () => ({ reflection: '' })),
    };

    const out = await loadCompleteData({ api, repo, sessionId: 'sess-1' });

    expect(out.reflection).toBe(COMPLETE_FALLBACK_REFLECTION);
    expect(out.hasReflection).toBe(false);
  });

  it('returns null session + empty sets when the local DB has no row', async () => {
    const repo = makeRepo();
    const api = {
      reflectSession: jest.fn(async () => ({ reflection: 'hi' })),
    };

    const out = await loadCompleteData({ api, repo, sessionId: 'unknown' });

    expect(out.session).toBeNull();
    expect(out.sets).toEqual([]);
    // Network still resolves — we don't gate the reflection on the
    // local DB lookup, they run in parallel.
    expect(out.hasReflection).toBe(true);
  });
});
