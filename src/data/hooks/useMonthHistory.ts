/**
 * `useMonthHistory` — single-query hook backing the History screen's
 * month grid and Recent list.
 *
 * Phase 14.5 migration: `app/history.tsx` used to fire four sequential
 * `repo.*` reads on every focus (month grid, streak, longest streak,
 * recent sessions). The streak pair now comes from `useStatsBundle()`
 * and the grid + recent come from this single `GET /api/v1/history`
 * round-trip.
 *
 * staleTime is 30s — same budget as `useStatsBundle`, since History
 * shares the same write/sync cadence (a workout finishes → both the
 * bundle and the current-month query get invalidated on focus).
 */

import { useQuery } from '@tanstack/react-query';
import { getApiClient } from '../../api/getApiClient';
import { HistoryMonthResponse } from '../../api/client';
import { queryKeys } from '../queryKeys';

export function useMonthHistory(
  year: number,
  month: number,
  exerciseId: string = 'pushups',
) {
  return useQuery<HistoryMonthResponse>({
    queryKey: queryKeys.history(year, month),
    queryFn: async () => {
      const client = await getApiClient();
      return client.getHistoryMonth({ year, month, exerciseId });
    },
    staleTime: 30_000,
  });
}
