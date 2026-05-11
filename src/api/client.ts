import { ToolCall, VoiceRequest, VoiceResponse } from './types';

export type StreamFrame =
  | { type: 'token'; text: string }
  | { type: 'done'; toolCalls: ToolCall[]; spokenResponse: string };

// Sync payload shapes mirror backend/src/routes/workouts.ts. `deviceId` is
// intentionally absent from the request — the Bearer header identifies the
// device and the server stamps each session server-side (1.5.7 RBAC).
export interface SyncSet {
  id: string;
  setNumber: number;
  reps: number;
  recordedAt: string;
  restSeconds: number | null;
}

export interface SyncSession {
  id: string;
  exerciseId: string;
  weeklyPlanId: string | null;
  sessionType: string;
  targetReps: number | null;
  startedAt: string;
  endedAt: string;
  totalReps: number;
  setCount: number;
  userFeedback: string | null;
  sets: SyncSet[];
}

export interface SyncRequest {
  sessions: SyncSession[];
}

export interface SyncResponse {
  synced: string[];
}

// Mirror of `backend/src/routes/planning.ts` POST /weekly response. The
// server stamps `weekStart` (next Monday) and persists its own row with
// `device_id`; the client mirrors the row into local SQLite so the Plan
// screen reads stay offline-friendly.
export interface GeneratePlanRequest {
  exerciseId: string;
}

export interface GeneratePlanResponse {
  id: string;
  weekStart: string;
  dailyTargets: Record<string, number>;
  notes: string;
}

// Mirror of `backend/src/routes/sessions.ts` POST /reflect. The server
// scopes the lookup by Bearer-derived deviceId and returns
// `{ reflection: null }` when Ollama is unreachable or returns empty —
// the Complete screen falls back to a static string in either case.
export interface ReflectSessionRequest {
  sessionId: string;
}

export interface ReflectSessionResponse {
  reflection: string | null;
}

// Mirror of `backend/src/routes/stats.ts` GET /. Bundles the four
// sequential reads the Stats screen used to do into one device-scoped
// payload. Shapes must match `backend/src/stats.ts:15-31` exactly so
// the client can render `null` placeholders for empty fields.
export interface StatsBundleRequest {
  exerciseId: string;
}

export interface StatsBundlePersonalBest {
  reps: number;
  date: string;
}

export interface StatsBundleWeekDay {
  /** ISO date `YYYY-MM-DD` for this Mon-Sun slot. */
  date: string;
  totalReps: number;
  target: number | null;
}

export interface StatsBundleTodaySet {
  id: string;
  setNumber: number;
  reps: number;
  recordedAt: string;
}

export interface StatsBundleResponse {
  personalBest: StatsBundlePersonalBest | null;
  secondBestSet: StatsBundlePersonalBest | null;
  streak: number;
  longestStreak: number;
  weekTotals: StatsBundleWeekDay[];
  todaySets: StatsBundleTodaySet[];
  yesterdayTotal: number | null;
  todayTarget: number | null;
}

// Mirror of `backend/src/routes/history.ts` GET /. Bundles the
// month-grid + recent-sessions list the History screen used to do as
// two of its four sequential local-repo reads. Shapes match
// `backend/src/stats.ts:getMonthSessionsForDevice` (days) and
// `backend/src/sessions.ts:getRecentSessionsForDevice` (recent).
export interface HistoryMonthRequest {
  year: number;
  month: number; // 1-indexed; 1..12
  exerciseId: string;
}

export interface HistoryMonthDay {
  day: number;
  totalReps: number;
  target: number | null;
}

export interface HistoryMonthRecent {
  id: string;
  startedAt: string;
  totalReps: number | null;
  setCount: number | null;
  userFeedback: string | null;
}

export interface HistoryMonthResponse {
  days: HistoryMonthDay[];
  recent: HistoryMonthRecent[];
}

// Mirror of `backend/src/routes/voice.ts` GET /context. Returns the
// same five fields the client used to derive locally via
// `repo.buildVoiceContext` (yesterday's total, personal best, streak,
// today's plan target, session type) — sourced from the bearer-scoped
// session/set history so the Workout greeting can warm up via
// TanStack Query rather than a SQLite round-trip.
export interface VoiceContextRequest {
  exerciseId: string;
}

export interface VoiceContextResponse {
  yesterdayTotal: number | null;
  personalBest: number | null;
  streak: number;
  todayTarget: number | null;
  sessionType: 'regular' | 'evaluation';
}

export interface IApiClient {
  voiceRespond(request: VoiceRequest): Promise<VoiceResponse>;
  voiceRespondStream(request: VoiceRequest): AsyncGenerator<StreamFrame, void, void>;
  syncWorkouts(request: SyncRequest): Promise<SyncResponse>;
  generateWeeklyPlan(request: GeneratePlanRequest): Promise<GeneratePlanResponse>;
  reflectSession(request: ReflectSessionRequest): Promise<ReflectSessionResponse>;
  getStatsBundle(request: StatsBundleRequest): Promise<StatsBundleResponse>;
  getHistoryMonth(request: HistoryMonthRequest): Promise<HistoryMonthResponse>;
  getVoiceContext(request: VoiceContextRequest): Promise<VoiceContextResponse>;
  isReachable(): Promise<boolean>;
}

export interface ApiClientOptions {
  authHeader?: string;
}

export class AuthError extends Error {
  constructor(public status: number) {
    super(`auth error: ${status}`);
    this.name = 'AuthError';
  }
}

export function createApiClient(baseUrl: string, options: ApiClientOptions = {}): IApiClient {
  const authHeaders: Record<string, string> = options.authHeader
    ? { Authorization: options.authHeader }
    : {};

  async function fetchJson<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify(body),
    });
    if (response.status === 401 || response.status === 403) {
      throw new AuthError(response.status);
    }
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    return response.json();
  }

  async function voiceRespond(request: VoiceRequest): Promise<VoiceResponse> {
    return fetchJson<VoiceResponse>('/api/v1/voice/respond', request);
  }

  async function syncWorkouts(request: SyncRequest): Promise<SyncResponse> {
    return fetchJson<SyncResponse>('/api/v1/workouts/sync', request);
  }

  async function generateWeeklyPlan(request: GeneratePlanRequest): Promise<GeneratePlanResponse> {
    return fetchJson<GeneratePlanResponse>('/api/v1/plan/weekly', request);
  }

  async function reflectSession(request: ReflectSessionRequest): Promise<ReflectSessionResponse> {
    return fetchJson<ReflectSessionResponse>('/api/v1/session/reflect', request);
  }

  // GET-with-query — Stats bundle. Mirrors the four sequential reads
  // `app/index.tsx` used to do (PB / second-best / week totals / today
  // sets + voice context fields) in a single device-scoped round-trip.
  async function getStatsBundle(
    request: StatsBundleRequest,
  ): Promise<StatsBundleResponse> {
    const query = new URLSearchParams({ exerciseId: request.exerciseId }).toString();
    const response = await fetch(`${baseUrl}/api/v1/stats?${query}`, {
      method: 'GET',
      headers: { ...authHeaders },
    });
    if (response.status === 401 || response.status === 403) {
      throw new AuthError(response.status);
    }
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    return response.json();
  }

  // GET-with-query — History month bundle. Pairs with
  // `useStatsBundle()` to back the History screen: streak +
  // longestStreak come from the stats bundle, days + recent come from
  // here. URLSearchParams handles encoding for unusual exerciseIds.
  async function getHistoryMonth(
    request: HistoryMonthRequest,
  ): Promise<HistoryMonthResponse> {
    const query = new URLSearchParams({
      year: String(request.year),
      month: String(request.month),
      exerciseId: request.exerciseId,
    }).toString();
    const response = await fetch(`${baseUrl}/api/v1/history?${query}`, {
      method: 'GET',
      headers: { ...authHeaders },
    });
    if (response.status === 401 || response.status === 403) {
      throw new AuthError(response.status);
    }
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    return response.json();
  }

  // GET-with-query — Voice context bundle. Replaces the local
  // `repo.buildVoiceContext` read used to compose the Workout greeting;
  // identical five-field shape so the hook's greeting composition logic
  // stays untouched. Pre-fetched on Stats mount so the Workout screen
  // is warm by the time the user navigates.
  async function getVoiceContext(
    request: VoiceContextRequest,
  ): Promise<VoiceContextResponse> {
    const query = new URLSearchParams({ exerciseId: request.exerciseId }).toString();
    const response = await fetch(`${baseUrl}/api/v1/voice/context?${query}`, {
      method: 'GET',
      headers: { ...authHeaders },
    });
    if (response.status === 401 || response.status === 403) {
      throw new AuthError(response.status);
    }
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    return response.json();
  }

  async function* voiceRespondStream(
    request: VoiceRequest,
  ): AsyncGenerator<StreamFrame, void, void> {
    const response = await fetch(`${baseUrl}/api/v1/voice/respond/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify(request),
    });
    if (response.status === 401 || response.status === 403) {
      throw new AuthError(response.status);
    }
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    // RN fallback: native fetch may not expose a streaming body. Degrade to
    // the non-streaming endpoint and synthesize a single token + done frame.
    const body = response.body;
    if (!body || typeof body.getReader !== 'function') {
      const full = await voiceRespond(request);
      if (full.spokenResponse) yield { type: 'token', text: full.spokenResponse };
      yield { type: 'done', toolCalls: full.toolCalls, spokenResponse: full.spokenResponse };
      return;
    }

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done: streamDone } = await reader.read();
      if (value) {
        buffer += decoder.decode(value, { stream: true });
        let idx = buffer.indexOf('\n');
        while (idx !== -1) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (line) {
            const frame = parseStreamFrame(line);
            if (frame) yield frame;
          }
          idx = buffer.indexOf('\n');
        }
      }
      if (streamDone) break;
    }
    buffer += decoder.decode();
    const tail = buffer.trim();
    if (tail) {
      const frame = parseStreamFrame(tail);
      if (frame) yield frame;
    }
  }

  return {
    voiceRespond,
    voiceRespondStream,
    syncWorkouts,
    generateWeeklyPlan,
    reflectSession,
    getStatsBundle,
    getHistoryMonth,
    getVoiceContext,
    async isReachable(): Promise<boolean> {
      try {
        const response = await fetch(`${baseUrl}/health`, {
          headers: authHeaders,
          signal: AbortSignal.timeout(2000),
        });
        return response.ok;
      } catch {
        return false;
      }
    },
  };
}

function parseStreamFrame(line: string): StreamFrame | null {
  try {
    const frame = JSON.parse(line) as StreamFrame;
    if (frame.type === 'token' || frame.type === 'done') return frame;
    return null;
  } catch {
    return null;
  }
}

// LLMs (notably small ones like llama3.2:3b) sometimes return numeric tool
// arguments as strings — e.g. complete_set({"reps":"12"}). The state machine
// adds them to totals, which would string-concatenate. Coerce at the API
// boundary so downstream code sees real numbers.
export function normalizeToolCall(tc: ToolCall): ToolCall {
  switch (tc.name) {
    case 'record_reps':
      return { name: 'record_reps', params: { count: Number(tc.params.count) } };
    case 'complete_set':
      return { name: 'complete_set', params: { reps: Number(tc.params.reps) } };
    case 'adjust_target':
      return { name: 'adjust_target', params: { new_target: Number(tc.params.new_target) } };
    default:
      return tc;
  }
}
