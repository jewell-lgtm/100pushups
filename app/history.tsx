import { useCallback, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useStatsBundle } from '../src/data/hooks/useStatsBundle';
import { useMonthHistory } from '../src/data/hooks/useMonthHistory';
import { queryKeys } from '../src/data/queryKeys';
import type {
  HistoryMonthDay,
  HistoryMonthRecent,
} from '../src/api/client';
import { useSync } from '../src/hooks/useSync';
import { colors } from '../src/theme/colors';
import { font } from '../src/theme/type';
import { radii } from '../src/theme/radii';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { Card } from '../src/components/Card';
import { MonthNav } from '../src/components/MonthNav';
import { CalendarGrid, type CalendarDay } from '../src/components/CalendarGrid';

// Phase 12.6 re-skin: cream/sage Breath tokens replace the previous
// dark `#16213e` palette. Visual contract follows
// `design/direction-b.jsx › B_HistoryScreen` (lines 231-330):
//   - ScreenHeader with kicker "PROGRESS" and Fraunces month label
//   - Sage streak banner card (current streak big serif + longest)
//   - 7-column calendar grid (sage = full, sageSoft = partial, faded
//     surfaceAlt = empty, 2px ink border = today)
//   - Recent rows separated by hairline borders inside a Card
const EXERCISE_ID = 'pushups';

interface MonthState {
  year: number;
  month: number; // 1-indexed
}

function todayYearMonth(): MonthState {
  const today = Temporal.Now.plainDateISO();
  return { year: today.year, month: today.month };
}

function isCurrentMonth(state: MonthState): boolean {
  const t = todayYearMonth();
  return t.year === state.year && t.month === state.month;
}

function shiftMonth(state: MonthState, delta: number): MonthState {
  const next = Temporal.PlainDate.from({ year: state.year, month: state.month, day: 1 })
    .add({ months: delta });
  return { year: next.year, month: next.month };
}

function monthLabel(state: MonthState): string {
  const d = Temporal.PlainDate.from({ year: state.year, month: state.month, day: 1 });
  return d.toLocaleString(undefined, { month: 'long', year: 'numeric' });
}

// Build the cells array the `CalendarGrid` molecule expects. Sunday-first
// (matches the molecule's `DEFAULT_WEEKDAYS`); pads the first week with
// nulls so the 1st lines up under its weekday column, and pads the
// trailing week so every row has 7 cells.
function buildCalendarCells(
  state: MonthState,
  days: HistoryMonthDay[],
): (CalendarDay | null)[] {
  const firstOfMonth = Temporal.PlainDate.from({
    year: state.year,
    month: state.month,
    day: 1,
  });
  // `dayOfWeek` is Mon=1..Sun=7; Sunday-first padding = `dayOfWeek % 7`.
  const leadingBlanks = firstOfMonth.dayOfWeek % 7;
  const daysInMonth = firstOfMonth.daysInMonth;
  const today = Temporal.Now.plainDateISO();
  const todayDay =
    today.year === state.year && today.month === state.month ? today.day : null;

  const byDay = new Map<number, HistoryMonthDay>();
  for (const d of days) byDay.set(d.day, d);

  const totalCells = leadingBlanks + daysInMonth;
  const trailingBlanks = (7 - (totalCells % 7)) % 7;

  const cells: (CalendarDay | null)[] = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const entry = byDay.get(d);
    let value = 0; // 0 = rest, 100 = full, in-between = partial
    if (entry) {
      const reachedTarget =
        entry.target !== null
          ? entry.totalReps >= entry.target
          : entry.totalReps > 0;
      value = reachedTarget
        ? 100
        : entry.totalReps > 0
        ? 50
        : 0;
    }
    cells.push({ day: d, value, isToday: todayDay === d });
  }
  for (let i = 0; i < trailingBlanks; i++) cells.push(null);
  return cells;
}

export default function HistoryScreen() {
  const [month, setMonth] = useState<MonthState>(todayYearMonth());
  const [refreshing, setRefreshing] = useState(false);
  const { triggerSync } = useSync();
  const queryClient = useQueryClient();

  // Phase 14.5: the four sequential `repo.*` reads that used to live
  // here have been collapsed into two TanStack-cached round-trips —
  // the streak pair from the stats bundle, the month grid + recent
  // from the history endpoint. Local SQLite reads stay on the workout
  // write path (until 14.7 decommissions them) but no longer back the
  // History screen.
  const { data: stats } = useStatsBundle();
  const { data: history } = useMonthHistory(month.year, month.month, EXERCISE_ID);

  const days: HistoryMonthDay[] = history?.days ?? [];
  const recent: HistoryMonthRecent[] = history?.recent ?? [];
  const streak = stats?.streak ?? 0;
  const longest = stats?.longestStreak ?? 0;

  // Re-pull both bundles when the user returns from a workout —
  // totals/sets for today (stats) and the day's grid entry / recent
  // row only become accurate once the Complete screen has saved.
  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.history(month.year, month.month),
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.stats.bundle });
    }, [queryClient, month.year, month.month]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await triggerSync();
      await queryClient.invalidateQueries({
        queryKey: queryKeys.history(month.year, month.month),
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.stats.bundle });
    } finally {
      setRefreshing(false);
    }
  }, [triggerSync, queryClient, month.year, month.month]);

  const canGoNext = !isCurrentMonth(month);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.sage}
        />
      }
    >
      <ScreenHeader
        kicker="PROGRESS"
        title={monthLabel(month)}
        trailing={
          <MonthNav
            onPrev={() => setMonth((m) => shiftMonth(m, -1))}
            onNext={canGoNext ? () => setMonth((m) => shiftMonth(m, 1)) : undefined}
            prevTestID="history-prev-month"
            nextTestID="history-next-month"
          />
        }
      />

      <StreakBanner current={streak} longest={longest} />

      <View style={styles.gridWrap}>
        <CalendarGrid
          cells={buildCalendarCells(month, days)}
          testID="history-calendar-grid"
          cellTestID={(day) => `history-day-${day}`}
        />
      </View>

      <RecentList sessions={recent} />
    </ScrollView>
  );
}

// Sage Card with the current streak as a big Fraunces number plus a
// muted "Longest {n}" caption on the right. Mirrors the design ref
// layout (`B_HistoryScreen` lines 262-274).
function StreakBanner({ current, longest }: { current: number; longest: number }) {
  return (
    <Card
      variant="sage"
      testID="history-streak-banner"
      style={styles.streakCard}
    >
      <View style={styles.streakInner}>
        <View style={styles.streakLeft}>
          <Text style={styles.streakKicker}>CURRENT STREAK</Text>
          <View style={styles.streakNumberRow}>
            <Text style={styles.streakNumber}>{current}</Text>
            <Text style={styles.streakUnit}>{current === 1 ? 'day' : 'days'}</Text>
          </View>
        </View>
        <View style={styles.streakRight}>
          <Text style={styles.streakRightLabel}>Longest</Text>
          <Text style={styles.streakRightValue}>{longest} d</Text>
        </View>
      </View>
    </Card>
  );
}

// Three most-recent sessions stacked inside a single surface Card,
// separated by hairline borders per the design ref (`B_HistoryScreen`
// lines 309-327). `user_feedback` (when present) renders as italic
// muted text below the date/reps row.
function RecentList({ sessions }: { sessions: HistoryMonthRecent[] }) {
  const top = sessions.slice(0, 3);

  return (
    <View style={styles.recentWrap}>
      <Text style={styles.recentHeader}>Recent</Text>
      {top.length === 0 ? (
        <Card>
          <Text style={styles.empty}>No workouts yet. Go do some pushups.</Text>
        </Card>
      ) : (
        <Card style={styles.recentCard}>
          {top.map((s, i) => (
            <View
              key={s.id}
              style={[
                styles.recentRow,
                i < top.length - 1 && styles.recentRowDivider,
              ]}
            >
              <View style={styles.recentRowTop}>
                <Text style={styles.recentDate}>
                  {new Date(s.startedAt).toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                </Text>
                <Text style={styles.recentReps}>{s.totalReps ?? 0}</Text>
              </View>
              <View style={styles.recentRowBottom}>
                {s.userFeedback ? (
                  <Text style={styles.recentFeedback} numberOfLines={2}>
                    {s.userFeedback}
                  </Text>
                ) : (
                  <View style={{ flex: 1 }} />
                )}
                <Text style={styles.recentMeta}>
                  {s.setCount ?? 0} {s.setCount === 1 ? 'set' : 'sets'}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 40,
  },

  // ── StreakBanner ───────────────────────────────────────────
  streakCard: {
    marginTop: 14,
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: radii.lg,
  },
  streakInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  streakLeft: {
    flexShrink: 1,
  },
  streakKicker: {
    fontFamily: font.sans,
    fontSize: 11,
    color: colors.surface,
    opacity: 0.7,
    letterSpacing: 11 * 0.15,
    textTransform: 'uppercase',
  },
  streakNumberRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 4,
  },
  streakNumber: {
    fontFamily: font.serif,
    fontSize: 44,
    color: colors.surface,
    lineHeight: 44,
  },
  streakUnit: {
    fontFamily: font.serifItalic,
    fontSize: 18,
    color: colors.surface,
    opacity: 0.85,
  },
  streakRight: {
    alignItems: 'flex-end',
  },
  streakRightLabel: {
    fontFamily: font.sans,
    fontSize: 12,
    color: colors.surface,
    opacity: 0.85,
  },
  streakRightValue: {
    fontFamily: font.serif,
    fontSize: 22,
    color: colors.surface,
    marginTop: 2,
  },

  // ── CalendarGrid wrap ──────────────────────────────────────
  gridWrap: {
    marginTop: 14,
  },

  // ── RecentList ─────────────────────────────────────────────
  recentWrap: {
    marginTop: 20,
  },
  recentHeader: {
    fontFamily: font.serif,
    fontSize: 18,
    color: colors.ink,
    marginBottom: 10,
  },
  recentCard: {
    paddingVertical: 4,
  },
  recentRow: {
    paddingVertical: 14,
  },
  recentRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  recentRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  recentDate: {
    fontFamily: font.sansMedium,
    fontSize: 14,
    color: colors.ink,
  },
  recentReps: {
    fontFamily: font.serif,
    fontSize: 22,
    color: colors.ink,
  },
  recentRowBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 4,
    gap: 12,
  },
  recentFeedback: {
    flexShrink: 1,
    fontFamily: font.sansItalic,
    fontSize: 12,
    color: colors.inkDim,
  },
  recentMeta: {
    fontFamily: font.sans,
    fontSize: 11,
    color: colors.inkFaint,
  },
  empty: {
    fontFamily: font.sans,
    fontSize: 14,
    color: colors.inkDim,
    textAlign: 'center',
  },
});
