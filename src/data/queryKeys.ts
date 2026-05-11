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
 */

export const queryKeys = {
  stats: {
    pb: ['stats', 'pb'] as const,
    week: ['stats', 'week'] as const,
    today: ['stats', 'today'] as const,
  },
  history: (year: number, month: number) => ['history', year, month] as const,
  settings: ['settings'] as const,
  plan: { weekly: ['plan', 'weekly'] as const },
  voiceContext: ['voiceContext'] as const,
} as const;
