/**
 * Single source of truth for TanStack Query cache keys.
 *
 * Centralising the keys here means a mutation can invalidate by
 * `queryKeys.stats.today` rather than re-typing the tuple literal in
 * multiple call sites — typos won't compile-fail, but they will
 * silently miss the cache.
 *
 * Tuples are `as const` so consumers get exhaustive type-safety on
 * `queryKey` and `queryFn` callers.
 *
 * Taxonomies covered (per Phase 14.1 of the plan):
 *   - stats:        pb / week / today
 *   - history:      keyed by year+month grid
 *   - settings:     single bag, server-owned in 14.3
 *   - plan.weekly:  the AI-generated week plan
 *   - voiceContext: cached voice-loop context bundle
 *   - reflection:   per-session LLM coach reflection (immutable per id)
 */

export const queryKeys = {
  stats: {
    pb: ['stats', 'pb'] as const,
    week: ['stats', 'week'] as const,
    today: ['stats', 'today'] as const,
    // `bundle` backs the single-payload `/api/v1/stats` endpoint
    // consumed by `useStatsBundle`. Kept separate from `pb` / `week` /
    // `today` so a future call site can subscribe to a slice without
    // refetching the bundle — invalidating `bundle` covers all four.
    bundle: ['stats', 'bundle'] as const,
  },
  history: (year: number, month: number) => ['history', year, month] as const,
  settings: ['settings'] as const,
  plan: { weekly: ['plan', 'weekly'] as const },
  voiceContext: ['voiceContext'] as const,
  // Per-session reflection key. The backend reflection is deterministic
  // for a given session id (and won't change once generated), so the
  // hook holds it with `staleTime: Infinity` and re-uses the cached
  // string when the user navigates back into the Complete screen.
  reflection: (sessionId: string) => ['reflection', sessionId] as const,
} as const;
