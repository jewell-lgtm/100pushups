import { reduce, INITIAL_STATE, WorkoutSessionState } from '../../src/state/WorkoutState';
import { fallbackParse } from '../../src/voice/FallbackParser';
import { ToolCall } from '../../src/api/types';

function assertToolCall<N extends ToolCall['name']>(
  toolCall: ToolCall,
  name: N,
): asserts toolCall is Extract<ToolCall, { name: N }> {
  expect(toolCall.name).toBe(name);
}

/**
 * Integration test: simulates a full workout flow using the state machine
 * and fallback parser together (no LLM, no native modules).
 *
 * This is the outside-in test that verifies the complete behavior chain:
 * greeting → start → mid-set callouts → complete → another set → end → feedback
 */
describe('Full workout flow (offline/fallback)', () => {
  it('simulates a complete two-set workout with mid-set callouts', () => {
    let state: WorkoutSessionState = { ...INITIAL_STATE, targetReps: 30 };

    // 1. Greeting done → awaiting_start
    let result = reduce(state, { type: 'GREETING_DONE' });
    state = result.state;
    expect(state.appState).toBe('awaiting_start');

    // 2. User says "ready" → fallback parses → start_set tool call
    let voice = fallbackParse('ready', state.appState, state.targetReps);
    assertToolCall(voice.toolCalls[0], 'start_set');
    result = reduce(state, { type: 'TOOL_CALL', toolCall: voice.toolCalls[0] });
    state = result.state;
    expect(state.appState).toBe('mid_set');
    expect(state.currentSetNumber).toBe(1);

    // 3. User calls out "10" mid-set → record_reps + countdown
    voice = fallbackParse('10', state.appState, state.targetReps);
    assertToolCall(voice.toolCalls[0], 'record_reps');
    expect(voice.toolCalls[0].params.count).toBe(10);
    expect(voice.spokenResponse).toBe('Only 20 to go!');
    result = reduce(state, { type: 'TOOL_CALL', toolCall: voice.toolCalls[0] });
    state = result.state;
    expect(state.currentSetReps).toBe(10);

    // 4. User calls out "20" → countdown updates
    voice = fallbackParse('20', state.appState, state.targetReps);
    expect(voice.spokenResponse).toBe('Only 10 to go!');
    result = reduce(state, { type: 'TOOL_CALL', toolCall: voice.toolCalls[0] });
    state = result.state;

    // 5. User says "done 25" → complete_set
    voice = fallbackParse('done 25', state.appState, state.targetReps);
    assertToolCall(voice.toolCalls[0], 'complete_set');
    expect(voice.toolCalls[0].params.reps).toBe(25);
    result = reduce(state, { type: 'TOOL_CALL', toolCall: voice.toolCalls[0] });
    state = result.state;
    expect(state.appState).toBe('between_sets');
    expect(state.totalReps).toBe(25);
    expect(state.setsCompleted).toHaveLength(1);

    // 6. User says "yeah" → another set
    voice = fallbackParse('yeah', state.appState, state.targetReps);
    assertToolCall(voice.toolCalls[0], 'start_set');
    result = reduce(state, { type: 'TOOL_CALL', toolCall: voice.toolCalls[0] });
    state = result.state;
    expect(state.appState).toBe('mid_set');
    expect(state.currentSetNumber).toBe(2);

    // 7. User says "done 15"
    voice = fallbackParse('done 15', state.appState, state.targetReps);
    result = reduce(state, { type: 'TOOL_CALL', toolCall: voice.toolCalls[0] });
    state = result.state;
    expect(state.totalReps).toBe(40);
    expect(state.setsCompleted).toHaveLength(2);

    // 8. User says "no" → end session
    voice = fallbackParse('no', state.appState, state.targetReps);
    assertToolCall(voice.toolCalls[0], 'end_session');
    result = reduce(state, { type: 'TOOL_CALL', toolCall: voice.toolCalls[0] });
    state = result.state;
    expect(state.appState).toBe('post_workout');

    // 9. User gives feedback
    voice = fallbackParse('felt tough but good', state.appState, state.targetReps);
    assertToolCall(voice.toolCalls[0], 'record_feedback');
    expect(voice.toolCalls[0].params.feedback).toBe('felt tough but good');
    result = reduce(state, { type: 'TOOL_CALL', toolCall: voice.toolCalls[0] });
    state = result.state;
    expect(state.userFeedback).toBe('felt tough but good');
    expect(result.effects).toContainEqual({ type: 'SAVE_SESSION' });
    expect(result.effects).toContainEqual({ type: 'NAVIGATE_HOME' });
  });

  it('handles target adjustment mid-workout', () => {
    let state: WorkoutSessionState = { ...INITIAL_STATE, targetReps: 40, appState: 'mid_set', currentSetNumber: 1 };

    // Simulate LLM calling adjust_target (fallback doesn't have this, but state machine does)
    let result = reduce(state, {
      type: 'TOOL_CALL',
      toolCall: { name: 'adjust_target', params: { new_target: 20 } },
    });
    state = result.state;
    expect(state.targetReps).toBe(20);

    // Now countdown uses new target
    const voice = fallbackParse('15', state.appState, state.targetReps);
    expect(voice.spokenResponse).toBe('Only 5 to go!');
  });
});
