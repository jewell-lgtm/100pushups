import { VoiceRequest, VoiceResponse, VoiceContext } from './types';

export interface IApiClient {
  voiceRespond(request: VoiceRequest): Promise<VoiceResponse>;
  isReachable(): Promise<boolean>;
}

export function createApiClient(baseUrl: string): IApiClient {
  async function fetchJson<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
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
          signal: AbortSignal.timeout(2000),
        });
        return response.ok;
      } catch {
        return false;
      }
    },
  };
}
