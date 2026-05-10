import { ToolCall, VoiceRequest, VoiceResponse, VoiceContext } from './types';

export interface IApiClient {
  voiceRespond(request: VoiceRequest): Promise<VoiceResponse>;
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

  return {
    async voiceRespond(request: VoiceRequest): Promise<VoiceResponse> {
      return fetchJson<VoiceResponse>('/api/v1/voice/respond', request);
    },

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
