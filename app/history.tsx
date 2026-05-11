import { useCallback, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
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

// Plain-primitive functional cut (Phase 11.5). The sage/sageSoft theme
// tokens, Fraunces font, and CalendarGrid component live on a
// design-system branch that hasn't merged yet — the re-skin lands as
// part of Phase 12.6. Until then we re-use the existing dark palette
// from `app/index.tsx` so this screen feels native to the app:
//   bg            #16213e (matches Stats/Plan)
//   card          #1a1a2e
//   accent        #e94560 (full day)
//   accentMuted   rgba(233,69,96,0.35) (partial day)
//   ink           #fff
//   inkDim        #a0a0b0
//
// "Today" is marked with a 2px white inner border (the design doc
// calls for `ink` 2px — we pick the analogous fg colour from the dark
// palette). When the design-system merges, the CalendarGrid component
// will take over and these literals get dropped.

const DAY_HEADERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
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
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e94560" />
      }
    >
      <MonthHeader
        label={monthLabel(month)}
        onPrev={() => setMonth((m) => shiftMonth(m, -1))}
        onNext={canGoNext ? () => setMonth((m) => shiftMonth(m, 1)) : null}
      />

      <StreakBanner current={streak} longest={longest} />

      <CalendarGrid state={month} days={days} />

      <RecentList sessions={recent} />
    </ScrollView>
  );
}

function MonthHeader({
  label,
  onPrev,
  onNext,
}: {
  label: string;
  onPrev: () => void;
  onNext: (() => void) | null;
}) {
  return (
    <View style={styles.headerRow}>
      <TouchableOpacity
        testID="history-prev-month"
        onPress={onPrev}
        style={styles.chevronButton}
      >
        <Text style={styles.chevron}>‹</Text>
      </TouchableOpacity>
      <Text style={styles.monthLabel}>{label}</Text>
      <TouchableOpacity
        testID="history-next-month"
        onPress={onNext ?? undefined}
        disabled={!onNext}
        style={[styles.chevronButton, !onNext && styles.chevronDisabled]}
      >
        <Text style={[styles.chevron, !onNext && styles.chevronDisabledText]}>›</Text>
      </TouchableOpacity>
    </View>
  );
}

function StreakBanner({ current, longest }: { current: number; longest: number }) {
  return (
    <View style={styles.streakBanner} testID="history-streak-banner">
      <Text style={styles.streakText}>
        {current} day streak — longest {longest}
      </Text>
    </View>
  );
}

function CalendarGrid({
  state,
  days,
}: {
  state: MonthState;
  days: HistoryMonthDay[];
}) {
  const firstOfMonth = Temporal.PlainDate.from({ year: state.year, month: state.month, day: 1 });
  // dayOfWeek: Mon=1 .. Sun=7. We render Mon-first, so leading blank
  // count = dayOfWeek - 1.
  const leadingBlanks = firstOfMonth.dayOfWeek - 1;
  const daysInMonth = firstOfMonth.daysInMonth;
  const today = Temporal.Now.plainDateISO();
  const todayDay =
    today.year === state.year && today.month === state.month ? today.day : null;

  const byDay = new Map<number, HistoryMonthDay>();
  for (const d of days) byDay.set(d.day, d);

  // Pad trailing blanks so the grid renders as full weeks. Total
  // cells = leading + daysInMonth + trailing, rounded up to 7.
  const totalCells = leadingBlanks + daysInMonth;
  const trailingBlanks = (7 - (totalCells % 7)) % 7;

  const cells: ({ kind: 'blank' } | { kind: 'day'; day: number })[] = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push({ kind: 'blank' });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ kind: 'day', day: d });
  for (let i = 0; i < trailingBlanks; i++) cells.push({ kind: 'blank' });

  return (
    <View>
      <View style={styles.weekdayRow}>
        {DAY_HEADERS.map((h, i) => (
          <Text key={i} style={styles.weekdayLabel}>{h}</Text>
        ))}
      </View>
      <View style={styles.grid} testID="history-calendar-grid">
        {cells.map((c, i) => {
          if (c.kind === 'blank') {
            return <View key={`b-${i}`} style={[styles.cell, styles.cellBlank]} />;
          }
          const entry = byDay.get(c.day);
          const isToday = todayDay === c.day;
          let cellStyle = styles.cellEmpty;
          if (entry) {
            const reachedTarget =
              entry.target !== null
                ? entry.totalReps >= entry.target
                : entry.totalReps > 0;
            cellStyle = reachedTarget ? styles.cellFull : styles.cellPartial;
          }
          return (
            <TouchableOpacity
              key={c.day}
              testID={`history-day-${c.day}`}
              activeOpacity={entry ? 0.6 : 1}
              onPress={() => {
                // No-op for this commit — detail navigation is out of
                // scope (Phase 11.5 leaves the tap wired but inert so
                // future commits can hook it up without touching
                // layout).
              }}
              style={[styles.cell, cellStyle, isToday && styles.cellToday]}
            >
              <Text style={styles.cellText}>{c.day}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function RecentList({ sessions }: { sessions: HistoryMonthRecent[] }) {
  if (sessions.length === 0) {
    return (
      <View style={styles.recentSection}>
        <Text style={styles.recentHeader}>Recent</Text>
        <Text style={styles.empty}>No workouts yet. Go do some pushups!</Text>
      </View>
    );
  }
  return (
    <View style={styles.recentSection}>
      <Text style={styles.recentHeader}>Recent</Text>
      {sessions.map((s) => (
        <View key={s.id} style={styles.recentRow}>
          <View style={styles.recentRowTop}>
            <Text style={styles.recentDate}>
              {new Date(s.startedAt).toLocaleDateString()}
            </Text>
            <Text style={styles.recentReps}>
              {s.totalReps ?? 0} <Text style={styles.recentRepsLabel}>reps</Text>
            </Text>
          </View>
          {s.userFeedback && (
            <Text style={styles.recentFeedback}>{s.userFeedback}</Text>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#16213e',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  chevronButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: '#1a1a2e',
  },
  chevronDisabled: {
    opacity: 0.3,
  },
  chevron: {
    color: '#fff',
    fontSize: 22,
    lineHeight: 24,
  },
  chevronDisabledText: {
    color: '#a0a0b0',
  },
  monthLabel: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  streakBanner: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  streakText: {
    color: '#a0a0b0',
    fontSize: 13,
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    color: '#a0a0b0',
    fontSize: 11,
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 24,
  },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  cellBlank: {
    backgroundColor: 'transparent',
  },
  cellEmpty: {
    // No fill — just show the date in dim ink.
  },
  cellPartial: {
    backgroundColor: 'rgba(233,69,96,0.35)',
    borderRadius: 8,
  },
  cellFull: {
    backgroundColor: '#e94560',
    borderRadius: 8,
  },
  cellToday: {
    borderWidth: 2,
    borderColor: '#fff',
    borderRadius: 8,
  },
  cellText: {
    color: '#fff',
    fontSize: 13,
  },
  recentSection: {
    marginTop: 8,
  },
  recentHeader: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  recentRow: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  recentRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  recentDate: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  recentReps: {
    color: '#e94560',
    fontSize: 20,
    fontWeight: 'bold',
  },
  recentRepsLabel: {
    color: '#a0a0b0',
    fontSize: 11,
    fontWeight: 'normal',
  },
  recentFeedback: {
    color: '#a0a0b0',
    fontStyle: 'italic',
    fontSize: 12,
    marginTop: 4,
  },
  empty: {
    color: '#a0a0b0',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
  },
});
