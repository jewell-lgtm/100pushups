import { AuthError, createApiClient, IApiClient, StreamFrame } from './client';
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

// Module-level promise so two concurrent AuthError-triggered retries (e.g.
// a voice call and a stats fetch both 401ing at once) coalesce into a
// single registerDevice round-trip. Without this each wrapped client has
// its own `retrying` flag and they race — backend tolerates the double
// register, but it's wasteful and orders unpredictably.
let inflightReauth: Promise<IApiClient> | null = null;

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

// Coalesce concurrent reauth attempts. First caller does the work; everyone
// else awaits the same promise. Cleared in `finally` so the next 401 burst
// can trigger a fresh attempt.
function reauthOnce(): Promise<IApiClient> {
  if (!inflightReauth) {
    inflightReauth = reauthenticate().finally(() => {
      inflightReauth = null;
    });
  }
  return inflightReauth;
}

// Test-only hook to reset the module-level state between tests.
export function _resetReauthForTests(): void {
  inflightReauth = null;
}

function wrapWithRetry(inner: IApiClient): IApiClient {
  // Wraps voiceRespond/voiceRespondStream so a single AuthError triggers
  // reauth + retry. Stream retry only fires before the first yielded frame
  // — partial-stream auth failures would corrupt the consumer's state.
  // Concurrency is handled by the module-level `inflightReauth` promise:
  // a burst of parallel 401s coalesces into one registerDevice call, and
  // the second pass through the inner client uses the refreshed token.
  return {
    async voiceRespond(req: VoiceRequest): Promise<VoiceResponse> {
      try {
        return await inner.voiceRespond(req);
      } catch (err) {
        if (err instanceof AuthError) {
          const refreshed = await reauthOnce();
          return await refreshed.voiceRespond(req);
        }
        throw err;
      }
    },
    async *voiceRespondStream(req: VoiceRequest): AsyncGenerator<StreamFrame, void, void> {
      let yielded = 0;
      try {
        for await (const frame of inner.voiceRespondStream(req)) {
          yielded++;
          yield frame;
        }
      } catch (err) {
        if (err instanceof AuthError && yielded === 0) {
          const refreshed = await reauthOnce();
          yield* refreshed.voiceRespondStream(req);
          return;
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
