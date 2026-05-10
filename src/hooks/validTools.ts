import { AppState, ToolCall } from '../api/types';

// Which tool names are valid in each app state. Used to filter out LLM
// hallucinations — small models (e.g. llama3.2:3b) sometimes return
// complete_set from between_sets, or start_set from mid_set, which would
// corrupt the state machine. Tools not in this set for the current state
// get dropped before dispatch.
export const VALID_TOOLS_BY_STATE: Record<AppState, ReadonlySet<ToolCall['name']>> = {
  idle: new Set(),
  awaiting_start: new Set(['start_set', 'adjust_target']),
  mid_set: new Set(['record_reps', 'complete_set', 'adjust_target', 'end_session']),
  between_sets: new Set(['start_set', 'end_session', 'adjust_target']),
  post_workout: new Set(['record_feedback']),
};

export function filterValidTools(toolCalls: ToolCall[], appState: AppState): ToolCall[] {
  const valid = VALID_TOOLS_BY_STATE[appState];
  return toolCalls.filter((tc) => valid.has(tc.name));
}
