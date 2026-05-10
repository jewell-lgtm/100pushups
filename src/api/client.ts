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

export interface IApiClient {
  voiceRespond(request: VoiceRequest): Promise<VoiceResponse>;
  voiceRespondStream(request: VoiceRequest): AsyncGenerator<StreamFrame, void, void>;
  syncWorkouts(request: SyncRequest): Promise<SyncResponse>;
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
