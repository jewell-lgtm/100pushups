// Verifies that concurrent AuthError-triggered retries coalesce into a
// single registerDevice call. Without the module-level `inflightReauth`
// lock, N parallel 401s would each call registerDevice in parallel — the
// backend handles double-register gracefully but it's wasteful and racy.

// Mock expo-secure-store (pulled in transitively by authStore -> secureStorage).
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => {
      store.set(k, v);
    }),
    deleteItemAsync: jest.fn(async (k: string) => {
      store.delete(k);
    }),
  };
});

// Mock the register client so we can count and slow-down register calls.
jest.mock('../../src/auth/registerClient', () => ({
  registerDevice: jest.fn(),
}));

// Force the EXPO_PUBLIC_REGISTER_API_KEY check inside getApiClient to pass.
process.env.EXPO_PUBLIC_REGISTER_API_KEY = 'test-register-key';
process.env.EXPO_PUBLIC_API_BASE = 'http://test';

import { registerDevice } from '../../src/auth/registerClient';
import { saveAuth, clearAuth } from '../../src/auth/authStore';
import { AuthError } from '../../src/api/client';
import { getApiClient, resetApiClientCache, _resetReauthForTests } from '../../src/api/getApiClient';
import { VoiceRequest } from '../../src/api/types';

const baseRequest: VoiceRequest = {
  transcript: 'go',
  context: {
    appState: 'awaiting_start',
    currentSet: null,
    setsCompleted: [],
    todayTarget: null,
    yesterdayTotal: null,
    personalBest: null,
    streak: 0,
    sessionType: 'regular',
  },
};

describe('getApiClient — concurrent reauth coalescing', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(async () => {
    originalFetch = globalThis.fetch;
    resetApiClientCache();
    _resetReauthForTests();
    await clearAuth();
    await saveAuth({ token: 'stale-token', deviceId: 'dev-1' });
    (registerDevice as jest.Mock).mockReset();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('coalesces N parallel AuthError retries into a single registerDevice call', async () => {
    // Mock registerDevice with a 30ms delay so all three retries pile onto
    // the same inflight promise.
    (registerDevice as jest.Mock).mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 30));
      return { token: 'fresh-token', deviceId: 'dev-1' };
    });

    // Fetch behaviour: voiceRespond returns 401 with the stale token,
    // 200 with the fresh token.
    const fetchMock = jest.fn(async (_url: string, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string> | undefined)?.['Authorization'];
      if (auth === 'Bearer fresh-token') {
        return new Response(
          JSON.stringify({ toolCalls: [], spokenResponse: 'ok' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('', { status: 401 });
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const client = await getApiClient();
    const N = 3;
    const results = await Promise.all(
      Array.from({ length: N }, () => client.voiceRespond(baseRequest)),
    );

    expect(registerDevice).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(N);
    for (const r of results) {
      expect(r.spokenResponse).toBe('ok');
    }
  });

  it('surfaces AuthError if reauth itself fails', async () => {
    (registerDevice as jest.Mock).mockRejectedValue(new Error('register failed: 401'));

    globalThis.fetch = jest.fn(async () => new Response('', { status: 401 })) as unknown as typeof globalThis.fetch;

    const client = await getApiClient();
    await expect(client.voiceRespond(baseRequest)).rejects.toThrow('register failed: 401');
  });

  it('allows a fresh reauth after the previous one resolves', async () => {
    // The inflight promise is cleared in `finally` so a *subsequent* 401
    // burst (after the previous reauth has resolved) should be able to
    // mint a fresh token. Verify by triggering two non-overlapping bursts.
    let registerCount = 0;
    (registerDevice as jest.Mock).mockImplementation(async () => {
      registerCount++;
      return { token: `fresh-token-${registerCount}`, deviceId: 'dev-1' };
    });

    // fetch always 401s with the stale token; succeeds with whatever the
    // latest fresh-token is.
    const fetchMock = jest.fn(async (_url: string, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string> | undefined)?.['Authorization'];
      if (auth === `Bearer fresh-token-${registerCount}`) {
        return new Response(
          JSON.stringify({ toolCalls: [], spokenResponse: `ok-${registerCount}` }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('', { status: 401 });
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const client = await getApiClient();
    const r1 = await client.voiceRespond(baseRequest);
    expect(r1.spokenResponse).toBe('ok-1');
    expect(registerCount).toBe(1);

    // Second burst: force a fresh getApiClient pass by clearing the cache.
    // The wrapper's inner was built with the stale token, so its retry path
    // will trip reauth a second time.
    resetApiClientCache();
    await saveAuth({ token: 'stale-token-2', deviceId: 'dev-1' });
    const client2 = await getApiClient();
    const r2 = await client2.voiceRespond(baseRequest);

    expect(registerCount).toBe(2);
    expect(r2.spokenResponse).toBe('ok-2');
  });
});
