import { AuthError, createApiClient, IApiClient } from './client';
import { clearAuth, loadAuth, saveAuth } from '../auth/authStore';
import { registerDevice } from '../auth/registerClient';
import { VoiceRequest, VoiceResponse } from './types';

const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE ??
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ((typeof __DEV__ !== 'undefined' && (__DEV__ as any))
    ? 'http://localhost:3000'
    : 'https://pushups.wire.mattjewell.co.uk');

const REGISTER_KEY = process.env.EXPO_PUBLIC_REGISTER_API_KEY;

export function getApiBase(): string {
  return API_BASE;
}

let cached: { token: string; client: IApiClient } | null = null;

function buildClient(token: string): IApiClient {
  return createApiClient(API_BASE, { authHeader: `Bearer ${token}` });
}

// On AuthError, drop the stored token and re-register once. If that also
// 401s, surface the error — the register key may have rotated.
async function reauthenticate(): Promise<IApiClient> {
  if (!REGISTER_KEY) throw new Error('EXPO_PUBLIC_REGISTER_API_KEY not set');
  await clearAuth();
  cached = null;
  const fresh = await registerDevice(API_BASE, REGISTER_KEY);
  await saveAuth(fresh);
  const client = buildClient(fresh.token);
  cached = { token: fresh.token, client };
  return client;
}

function wrapWithRetry(inner: IApiClient): IApiClient {
  // Wraps voiceRespond so a single AuthError triggers reauth + retry.
  // Other errors propagate as-is.
  let retrying = false;
  return {
    async voiceRespond(req: VoiceRequest): Promise<VoiceResponse> {
      try {
        return await inner.voiceRespond(req);
      } catch (err) {
        if (err instanceof AuthError && !retrying) {
          retrying = true;
          try {
            const refreshed = await reauthenticate();
            return await refreshed.voiceRespond(req);
          } finally {
            retrying = false;
          }
        }
        throw err;
      }
    },
    isReachable: () => inner.isReachable(),
  };
}

// Returns an ApiClient configured with the current bearer token. Re-reads
// from secure storage if the token has rotated since the last call.
export async function getApiClient(): Promise<IApiClient> {
  const auth = await loadAuth();
  if (!auth) {
    cached = null;
    return createApiClient(API_BASE);
  }
  if (cached && cached.token === auth.token) return cached.client;
  const client = wrapWithRetry(buildClient(auth.token));
  cached = { token: auth.token, client };
  return client;
}

export function resetApiClientCache(): void {
  cached = null;
}
