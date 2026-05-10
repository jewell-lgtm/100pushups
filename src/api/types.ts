// --- Workout domain types ---

export interface Exercise {
  id: string;
  name: string;
  unit: 'reps' | 'seconds' | 'meters';
}

export interface WorkoutSet {
  id: string;
  sessionId: string;
  setNumber: number;
  reps: number;
  recordedAt: string;
  restSeconds: number | null;
}

export interface Session {
  id: string;
  exerciseId: string;
  weeklyPlanId: string | null;
  sessionType: 'regular' | 'evaluation';
  targetReps: number | null;
  startedAt: string;
  endedAt: string | null;
  totalReps: number | null;
  setCount: number | null;
  userFeedback: string | null;
  synced: boolean;
}

export interface WeeklyPlan {
  id: string;
  exerciseId: string;
  weekStart: string;
  evaluationReps: number | null;
  dailyTargets: Record<string, number>;
  notes: string | null;
  createdAt: string;
}

// --- Voice/LLM types ---

export type AppState =
  | 'idle'
  | 'awaiting_start'
  | 'mid_set'
  | 'between_sets'
  | 'post_workout';

export interface VoiceContext {
  appState: AppState;
  currentSet: { repsRecorded: number; startedAt: string } | null;
  setsCompleted: { setNumber: number; reps: number }[];
  todayTarget: number | null;
  yesterdayTotal: number | null;
  personalBest: number | null;
  streak: number;
  sessionType: 'regular' | 'evaluation';
}

export interface VoiceRequest {
  transcript: string;
  context: VoiceContext;
}

export type ToolCall =
  | { name: 'start_set'; params: Record<string, never> }
  | { name: 'record_reps'; params: { count: number } }
  | { name: 'complete_set'; params: { reps: number } }
  | { name: 'adjust_target'; params: { new_target: number } }
  | { name: 'end_session'; params: Record<string, never> }
  | { name: 'record_feedback'; params: { feedback: string } };

export interface VoiceResponse {
  toolCalls: ToolCall[];
  spokenResponse: string;
}

// --- API types ---

export interface SyncRequest {
  deviceId: string;
  sessions: (Session & { sets: WorkoutSet[] })[];
}

export interface StatsResponse {
  yesterday: { totalReps: number; setCount: number } | null;
  personalBest: { reps: number; date: string } | null;
  last7Days: { date: string; totalReps: number }[];
  streak: number;
}
