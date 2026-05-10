import { AppState, ToolCall } from '../api/types';

export interface WorkoutSessionState {
  appState: AppState;
  sessionId: string | null;
  currentSetNumber: number;
  currentSetReps: number;
  currentSetStartedAt: string | null;
  setsCompleted: { setNumber: number; reps: number }[];
  targetReps: number | null;
  totalReps: number;
  userFeedback: string | null;
  startedAt: string | null;
}

export type WorkoutEvent =
  | { type: 'GREETING_DONE' }
  | { type: 'TOOL_CALL'; toolCall: ToolCall }
  | { type: 'SESSION_RESET' };

export type SideEffect =
  | { type: 'SPEAK'; text: string }
  | { type: 'SAVE_SET'; setNumber: number; reps: number }
  | { type: 'SAVE_SESSION' }
  | { type: 'START_LISTENING' }
  | { type: 'STOP_LISTENING' }
  | { type: 'NAVIGATE_HOME' };

export const INITIAL_STATE: WorkoutSessionState = {
  appState: 'idle',
  sessionId: null,
  currentSetNumber: 0,
  currentSetReps: 0,
  currentSetStartedAt: null,
  setsCompleted: [],
  targetReps: null,
  totalReps: 0,
  userFeedback: null,
  startedAt: null,
};

export function reduce(
  state: WorkoutSessionState,
  event: WorkoutEvent,
): { state: WorkoutSessionState; effects: SideEffect[] } {
  switch (event.type) {
    case 'GREETING_DONE':
      return {
        state: { ...state, appState: 'awaiting_start' },
        effects: [{ type: 'START_LISTENING' }],
      };

    case 'SESSION_RESET':
      return { state: { ...INITIAL_STATE }, effects: [] };

    case 'TOOL_CALL':
      return handleToolCall(state, event.toolCall);
  }
}

function handleToolCall(
  state: WorkoutSessionState,
  toolCall: ToolCall,
): { state: WorkoutSessionState; effects: SideEffect[] } {
  switch (toolCall.name) {
    case 'start_set': {
      const setNumber = state.currentSetNumber + 1;
      return {
        state: {
          ...state,
          appState: 'mid_set',
          currentSetNumber: setNumber,
          currentSetReps: 0,
          currentSetStartedAt: Temporal.Now.instant().toString(),
          startedAt: state.startedAt ?? Temporal.Now.instant().toString(),
        },
        effects: [{ type: 'START_LISTENING' }],
      };
    }

    case 'record_reps': {
      return {
        state: { ...state, currentSetReps: toolCall.params.count },
        effects: [],
      };
    }

    case 'complete_set': {
      const { reps } = toolCall.params;
      const completedSet = { setNumber: state.currentSetNumber, reps };
      return {
        state: {
          ...state,
          appState: 'between_sets',
          currentSetReps: 0,
          currentSetStartedAt: null,
          setsCompleted: [...state.setsCompleted, completedSet],
          totalReps: state.totalReps + reps,
        },
        effects: [
          { type: 'SAVE_SET', setNumber: state.currentSetNumber, reps },
        ],
      };
    }

    case 'adjust_target': {
      return {
        state: { ...state, targetReps: toolCall.params.new_target },
        effects: [],
      };
    }

    case 'end_session': {
      return {
        state: { ...state, appState: 'post_workout' },
        effects: [{ type: 'STOP_LISTENING' }],
      };
    }

    case 'record_feedback': {
      return {
        // Reset appState to idle so the workout screen's
        // (idle && userFeedback) effect can navigate home.
        state: { ...state, appState: 'idle', userFeedback: toolCall.params.feedback },
        effects: [{ type: 'SAVE_SESSION' }, { type: 'NAVIGATE_HOME' }],
      };
    }

    default:
      return { state, effects: [] };
  }
}
