import { reduce, INITIAL_STATE, WorkoutSessionState } from '../../src/state/WorkoutState';

describe('WorkoutState', () => {
  describe('full workout flow', () => {
    it('walks through a complete session: greeting → start → reps → complete → another set → end → feedback', () => {
      // Start from idle
      let { state, effects } = reduce(INITIAL_STATE, { type: 'GREETING_DONE' });
      expect(state.appState).toBe('awaiting_start');
      expect(effects).toContainEqual({ type: 'START_LISTENING' });

      // LLM calls start_set
      ({ state, effects } = reduce(state, {
        type: 'TOOL_CALL',
        toolCall: { name: 'start_set', params: {} },
      }));
      expect(state.appState).toBe('mid_set');
      expect(state.currentSetNumber).toBe(1);
      expect(state.startedAt).toBeTruthy();

      // User calls out reps mid-set
      ({ state, effects } = reduce(state, {
        type: 'TOOL_CALL',
        toolCall: { name: 'record_reps', params: { count: 15 } },
      }));
      expect(state.currentSetReps).toBe(15);
      expect(state.appState).toBe('mid_set'); // still in set

      // User finishes set
      ({ state, effects } = reduce(state, {
        type: 'TOOL_CALL',
        toolCall: { name: 'complete_set', params: { reps: 25 } },
      }));
      expect(state.appState).toBe('between_sets');
      expect(state.setsCompleted).toHaveLength(1);
      expect(state.setsCompleted[0]).toEqual({ setNumber: 1, reps: 25 });
      expect(state.totalReps).toBe(25);
      expect(effects).toContainEqual({ type: 'SAVE_SET', setNumber: 1, reps: 25 });

      // Another set
      ({ state, effects } = reduce(state, {
        type: 'TOOL_CALL',
        toolCall: { name: 'start_set', params: {} },
      }));
      expect(state.appState).toBe('mid_set');
      expect(state.currentSetNumber).toBe(2);

      ({ state, effects } = reduce(state, {
        type: 'TOOL_CALL',
        toolCall: { name: 'complete_set', params: { reps: 18 } },
      }));
      expect(state.totalReps).toBe(43);
      expect(state.setsCompleted).toHaveLength(2);

      // End session
      ({ state, effects } = reduce(state, {
        type: 'TOOL_CALL',
        toolCall: { name: 'end_session', params: {} },
      }));
      expect(state.appState).toBe('post_workout');
      expect(effects).toContainEqual({ type: 'STOP_LISTENING' });

      // Record feedback
      ({ state, effects } = reduce(state, {
        type: 'TOOL_CALL',
        toolCall: { name: 'record_feedback', params: { feedback: 'felt great' } },
      }));
      expect(state.userFeedback).toBe('felt great');
      // appState must reset to 'idle' so workout.tsx's (idle && userFeedback)
      // effect fires the navigate-home transition.
      expect(state.appState).toBe('idle');
      expect(effects).toContainEqual({ type: 'SAVE_SESSION' });
      expect(effects).toContainEqual({ type: 'NAVIGATE_HOME' });
    });
  });

  describe('adjust_target', () => {
    it('changes target reps mid-workout', () => {
      const midSet: WorkoutSessionState = {
        ...INITIAL_STATE,
        appState: 'mid_set',
        currentSetNumber: 1,
        targetReps: 40,
      };

      const { state } = reduce(midSet, {
        type: 'TOOL_CALL',
        toolCall: { name: 'adjust_target', params: { new_target: 25 } },
      });
      expect(state.targetReps).toBe(25);
      expect(state.appState).toBe('mid_set'); // stays in set
    });
  });

  describe('complete_set with reps=0', () => {
    it('falls back to currentSetReps when LLM passes 0 ("done without a number")', () => {
      const midSet: WorkoutSessionState = {
        ...INITIAL_STATE,
        appState: 'mid_set',
        currentSetNumber: 1,
        currentSetReps: 18,
        currentSetStartedAt: '2026-05-10T12:00:00Z',
      };

      const { state, effects } = reduce(midSet, {
        type: 'TOOL_CALL',
        toolCall: { name: 'complete_set', params: { reps: 0 } },
      });

      expect(state.appState).toBe('between_sets');
      expect(state.setsCompleted).toEqual([{ setNumber: 1, reps: 18 }]);
      expect(state.totalReps).toBe(18);
      expect(effects).toContainEqual({ type: 'SAVE_SET', setNumber: 1, reps: 18 });
    });

    it('drops the call entirely when both reps and currentSetReps are 0', () => {
      const midSet: WorkoutSessionState = {
        ...INITIAL_STATE,
        appState: 'mid_set',
        currentSetNumber: 1,
        currentSetReps: 0,
        currentSetStartedAt: '2026-05-10T12:00:00Z',
      };

      const { state, effects } = reduce(midSet, {
        type: 'TOOL_CALL',
        toolCall: { name: 'complete_set', params: { reps: 0 } },
      });

      // No 0-rep set recorded; state unchanged.
      expect(state).toEqual(midSet);
      expect(effects).toEqual([]);
    });
  });

  describe('session_reset', () => {
    it('returns to initial state', () => {
      const dirty: WorkoutSessionState = {
        ...INITIAL_STATE,
        appState: 'post_workout',
        totalReps: 50,
        setsCompleted: [{ setNumber: 1, reps: 50 }],
      };

      const { state } = reduce(dirty, { type: 'SESSION_RESET' });
      expect(state).toEqual(INITIAL_STATE);
    });
  });

});
