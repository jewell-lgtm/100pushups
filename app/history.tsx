import { useCallback, useState } from 'react';
import {
  Pressable,
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

// Phase 12.6 re-skin: cream/sage Breath tokens replace the previous
// dark `#16213e` palette. Visual contract follows
// `design/direction-b.jsx › B_HistoryScreen` (lines 231-330):
//   - ScreenHeader with kicker "PROGRESS" and Fraunces month label
//   - Sage streak banner card (current streak big serif + longest)
//   - 7-column calendar grid (sage = full, sageSoft = partial, faded
//     surfaceAlt = empty, 2px ink border = today)
//   - Recent rows separated by hairline borders inside a Card
//
// The `MonthNav` and `CalendarGrid` molecules exist on main but don't
// expose the per-button / per-cell `testID` props the Playwright suite
// (`e2e/history.spec.ts`) plus integration-tests rely on. Per Phase
// 12.6 guidance (don't edit molecules), this screen re-implements
// both visually inline using the exact same tokens and dimensions so
// the design is identical but testIDs (`history-prev-month`,
// `history-next-month`, `history-day-N`) stay addressable.

// Sunday-first week labels per design ref (B_HistoryScreen line 279).
const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
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
          <MonthChevrons
            onPrev={() => setMonth((m) => shiftMonth(m, -1))}
            onNext={canGoNext ? () => setMonth((m) => shiftMonth(m, 1)) : null}
          />
        }
      />

      <StreakBanner current={streak} longest={longest} />

      <CalendarGridInline state={month} days={days} />

      <RecentList sessions={recent} />
    </ScrollView>
  );
}

// MonthNav-equivalent — see top-of-file rationale. Two 34px circle
// buttons matching `src/components/MonthNav.tsx` styling, with the
// per-button testIDs Playwright + e2e tests rely on.
function MonthChevrons({
  onPrev,
  onNext,
}: {
  onPrev: () => void;
  onNext: (() => void) | null;
}) {
  return (
    <View style={styles.chevronRow}>
      <Pressable
        testID="history-prev-month"
        accessibilityRole="button"
        accessibilityLabel="Previous month"
        onPress={onPrev}
        style={({ pressed }) => [
          styles.chevronButton,
          pressed && styles.chevronPressed,
        ]}
      >
        <Text style={styles.chevronGlyph}>‹</Text>
      </Pressable>
      <Pressable
        testID="history-next-month"
        accessibilityRole="button"
        accessibilityLabel="Next month"
        accessibilityState={{ disabled: onNext == null }}
        onPress={onNext ?? undefined}
        disabled={onNext == null}
        style={({ pressed }) => [
          styles.chevronButton,
          onNext == null && styles.chevronDisabled,
          pressed && onNext != null && styles.chevronPressed,
        ]}
      >
        <Text style={styles.chevronGlyph}>›</Text>
      </Pressable>
    </View>
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

// CalendarGrid-equivalent — same visual contract as
// `src/components/CalendarGrid.tsx` but rendered inline so each cell
// can carry the `history-day-N` testID and the whole grid carries
// `history-calendar-grid`. Sunday-first; pads the first row so the
// 1st lines up under its weekday column.
function CalendarGridInline({
  state,
  days,
}: {
  state: MonthState;
  days: HistoryMonthDay[];
}) {
  const firstOfMonth = Temporal.PlainDate.from({
    year: state.year,
    month: state.month,
    day: 1,
  });
  // `dayOfWeek` is Mon=1..Sun=7; the design grid is Sunday-first so a
  // Sunday-start needs 0 leading blanks, Monday needs 1, etc.
  const leadingBlanks = firstOfMonth.dayOfWeek % 7;
  const daysInMonth = firstOfMonth.daysInMonth;
  const today = Temporal.Now.plainDateISO();
  const todayDay =
    today.year === state.year && today.month === state.month ? today.day : null;

  const byDay = new Map<number, HistoryMonthDay>();
  for (const d of days) byDay.set(d.day, d);

  // Pad trailing blanks so the grid renders as full 7-cell weeks.
  const totalCells = leadingBlanks + daysInMonth;
  const trailingBlanks = (7 - (totalCells % 7)) % 7;

  type Cell = { kind: 'blank' } | { kind: 'day'; day: number };
  const cells: Cell[] = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push({ kind: 'blank' });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ kind: 'day', day: d });
  for (let i = 0; i < trailingBlanks; i++) cells.push({ kind: 'blank' });

  return (
    <View style={styles.gridWrap}>
      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((label, i) => (
          <Text key={i} style={styles.weekdayLabel}>
            {label}
          </Text>
        ))}
      </View>
      <View style={styles.grid} testID="history-calendar-grid">
        {cells.map((c, i) => {
          if (c.kind === 'blank') {
            return <View key={`b-${i}`} style={styles.cellSlot} />;
          }
          const entry = byDay.get(c.day);
          const isToday = todayDay === c.day;
          // Match `CalendarGrid` semantics: full = totalReps ≥ target
          // (or any reps if no target), partial = some reps below
          // target, empty = no entry.
          let isComplete = false;
          let isPartial = false;
          if (entry) {
            const reachedTarget =
              entry.target !== null
                ? entry.totalReps >= entry.target
                : entry.totalReps > 0;
            isComplete = reachedTarget;
            isPartial = !reachedTarget && entry.totalReps > 0;
          }
          return (
            <View key={c.day} style={styles.cellSlot}>
              <Pressable
                testID={`history-day-${c.day}`}
                accessibilityRole="button"
                onPress={() => {
                  // Tap is wired but inert (detail navigation out of
                  // scope — same as 11.5).
                }}
                style={[
                  styles.cell,
                  isComplete && styles.cellComplete,
                  isPartial && styles.cellPartial,
                  !isComplete && !isPartial && styles.cellRest,
                  isToday && styles.cellToday,
                ]}
              >
                <Text
                  style={[
                    styles.cellNumber,
                    isComplete && styles.cellNumberComplete,
                  ]}
                >
                  {c.day}
                </Text>
                {isPartial && <View style={styles.partialDot} />}
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
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

const CELL_GAP = 6;

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

  // ── MonthChevrons ──────────────────────────────────────────
  chevronRow: {
    flexDirection: 'row',
    gap: 4,
  },
  chevronButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  chevronDisabled: {
    opacity: 0.4,
  },
  chevronPressed: {
    backgroundColor: colors.surfaceAlt,
  },
  chevronGlyph: {
    fontFamily: font.sans,
    fontSize: 16,
    color: colors.ink,
    lineHeight: 18,
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

  // ── CalendarGrid ───────────────────────────────────────────
  gridWrap: {
    marginTop: 14,
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: CELL_GAP,
  },
  weekdayLabel: {
    flex: 1,
    fontFamily: font.sans,
    fontSize: 10,
    color: colors.inkFaint,
    textAlign: 'center',
    letterSpacing: 10 * 0.1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cellSlot: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    padding: CELL_GAP / 2,
  },
  cell: {
    flex: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  cellComplete: {
    backgroundColor: colors.sage,
  },
  cellPartial: {
    backgroundColor: colors.sageSoft,
  },
  cellRest: {
    backgroundColor: colors.surfaceAlt,
    opacity: 0.4,
  },
  cellToday: {
    borderWidth: 2,
    borderColor: colors.ink,
  },
  cellNumber: {
    fontFamily: font.serif,
    fontSize: 14,
    color: colors.ink,
  },
  cellNumberComplete: {
    color: colors.surface,
  },
  partialDot: {
    position: 'absolute',
    bottom: 3,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.ink,
    opacity: 0.4,
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
