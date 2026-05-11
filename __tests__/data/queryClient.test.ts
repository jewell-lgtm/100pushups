import { queryClient } from '../../src/data/queryClient';

describe('queryClient (Phase 14.1)', () => {
  const defaults = queryClient.getDefaultOptions();

  it('configures queries for offline-first networking', () => {
    expect(defaults.queries?.networkMode).toBe('offlineFirst');
  });

  it('retries queries twice on failure', () => {
    expect(defaults.queries?.retry).toBe(2);
  });

  it('applies exponential backoff capped at 30s for query retries', () => {
    const retryDelay = defaults.queries?.retryDelay;
    expect(typeof retryDelay).toBe('function');
    if (typeof retryDelay !== 'function') return;
    // First retry (attempt index 0): 1000 * 2^0 = 1000ms.
    expect(retryDelay(0, new Error('boom'))).toBe(1000);
    // Second retry: 1000 * 2^1 = 2000ms.
    expect(retryDelay(1, new Error('boom'))).toBe(2000);
    // Far enough out that the cap kicks in.
    expect(retryDelay(20, new Error('boom'))).toBe(30_000);
  });

  it('does not retry mutations (outbox handles retry in 14.6)', () => {
    expect(defaults.mutations?.retry).toBe(false);
  });

  it('leaves global staleTime at the library default (per-query staleTime applied at call sites)', () => {
    expect(defaults.queries?.staleTime).toBeUndefined();
  });
});
