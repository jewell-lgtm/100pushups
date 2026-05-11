// Covers the pure local-DB loading logic for the Complete screen.
// Tests the `loadCompleteData` helper directly — the React wrapper
// (`useCompleteData`) needs an RN harness which we deliberately avoid.
//
// Phase 14.5 update: the reflection fetch has moved out of this module
// and into `src/data/hooks/useReflection.ts` (TanStack Query). The
// reflection-fallback cases formerly covered here now live in
// `__tests__/data/useReflection.test.ts`. What remains here is the
// repo-only contract: session + sets read in parallel, with a
// null-session fallback when the row isn't found.

import { Session, WorkoutSet } from '../../src/api/types';
import { loadCompleteData } from '../../src/screens/useCompleteData';

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
  it('returns the session + sets from the local repo', async () => {
    const repo = makeRepo();

    const out = await loadCompleteData({ repo, sessionId: 'sess-1' });

    expect(out.session).toEqual(fakeSession);
    expect(out.sets).toEqual(fakeSets);
    expect(repo.getSessionById).toHaveBeenCalledWith('sess-1');
    expect(repo.getSetsForSession).toHaveBeenCalledWith('sess-1');
  });

  it('returns null session + empty sets when the local DB has no row', async () => {
    const repo = makeRepo();

    const out = await loadCompleteData({ repo, sessionId: 'unknown' });

    expect(out.session).toBeNull();
    expect(out.sets).toEqual([]);
  });

  it('runs the two repo reads in parallel', async () => {
    // The two reads target different tables and there's no dependency
    // between them — `Promise.all` keeps the worst case bounded by the
    // slower read. Asserted by starting both fakes from a shared promise
    // and resolving them in the opposite order from invocation.
    let resolveSession: (v: Session) => void = () => {};
    let resolveSets: (v: WorkoutSet[]) => void = () => {};
    const sessionP = new Promise<Session>((r) => {
      resolveSession = r;
    });
    const setsP = new Promise<WorkoutSet[]>((r) => {
      resolveSets = r;
    });
    const repo = {
      getSessionById: jest.fn(() => sessionP),
      getSetsForSession: jest.fn(() => setsP),
    };

    const out = loadCompleteData({ repo, sessionId: 'sess-1' });

    // Both fakes have been entered before either resolves — i.e. they
    // were dispatched in parallel, not sequentially.
    expect(repo.getSessionById).toHaveBeenCalledTimes(1);
    expect(repo.getSetsForSession).toHaveBeenCalledTimes(1);

    // Resolve sets first, then session — order-independence.
    resolveSets(fakeSets);
    resolveSession(fakeSession);

    await expect(out).resolves.toEqual({
      session: fakeSession,
      sets: fakeSets,
    });
  });
});
