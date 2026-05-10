import { ToolCall, VoiceRequest, VoiceResponse } from './types';

export interface IApiClient {
  voiceRespond(request: VoiceRequest): Promise<VoiceResponse>;
  voiceRespondStream(
    request: VoiceRequest,
    onToken: (text: string) => void,
  ): Promise<VoiceResponse>;
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

interface DoneFrame {
  type: 'done';
  toolCalls: ToolCall[];
  spokenResponse: string;
}

interface TokenFrame {
  type: 'token';
  text: string;
}

type StreamFrame = DoneFrame | TokenFrame;

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

  async function voiceRespondStream(
    request: VoiceRequest,
    onToken: (text: string) => void,
  ): Promise<VoiceResponse> {
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

    // RN fallback: native fetch may not expose a streaming body. Degrade to the
    // non-streaming endpoint and emit one synthetic token with the full text.
    const body = response.body;
    if (!body || typeof body.getReader !== 'function') {
      const full = await voiceRespond(request);
      if (full.spokenResponse) onToken(full.spokenResponse);
      return full;
    }

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let done: DoneFrame | null = null;

    const handleLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let frame: StreamFrame;
      try {
        frame = JSON.parse(trimmed) as StreamFrame;
      } catch {
        return;
      }
      if (frame.type === 'token') {
        onToken(frame.text);
      } else if (frame.type === 'done') {
        done = frame;
      }
    };

    while (true) {
      const { value, done: streamDone } = await reader.read();
      if (value) {
        buffer += decoder.decode(value, { stream: true });
        let idx = buffer.indexOf('\n');
        while (idx !== -1) {
          handleLine(buffer.slice(0, idx));
          buffer = buffer.slice(idx + 1);
          idx = buffer.indexOf('\n');
        }
      }
      if (streamDone) break;
    }
    buffer += decoder.decode();
    if (buffer.length > 0) handleLine(buffer);

    if (!done) {
      throw new Error('Streaming response ended without done frame');
    }
    const finalFrame = done as DoneFrame;
    return {
      toolCalls: finalFrame.toolCalls,
      spokenResponse: finalFrame.spokenResponse,
    };
  }

  return {
    voiceRespond,
    voiceRespondStream,
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
