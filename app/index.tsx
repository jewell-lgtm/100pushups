// Stats screen (Phase 11.3) — formerly the dashboard. Route name stays
// `/` so deep links and `router.replace('/')` from the Complete screen
// keep working.
//
// Functional cut only. The polished design system (Fraunces serif, sage
// palette, `Kicker` / `SessionBars` / theme tokens) lives on a worktree
// that hasn't merged to main, so this screen uses plain RN primitives
// against the existing dark palette (the same approach taken by
// `app/complete.tsx` at commit f0ab522 and `app/history.tsx` at
// 52db192). Phase 12.6 will re-skin and lift the visual matching into
// component molecules.
//
//   bg          #16213e
//   card        #1a1a2e
//   accent      #e94560
//   ink         #fff
//   inkDim      #a0a0b0
//   muted bar   #2a2a3e   (matches the bar track on `app/complete.tsx`)
//   sageBar     #6b8a6e   (matches the bar fill on `app/complete.tsx`)

import { useCallback, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useStatsBundle } from '../src/data/hooks/useStatsBundle';
import { queryKeys } from '../src/data/queryKeys';
import {
  type StatsBundleTodaySet,
  type StatsBundleWeekDay,
} from '../src/api/client';
import { useSync } from '../src/hooks/useSync';

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const EM_DASH = '—';

function formatDate(iso: string): string {
  // Accept either an ISO date (YYYY-MM-DD) or full timestamp; both feed
  // through the platform `toLocaleDateString` so the user sees a
  // locale-friendly short date.
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export default function StatsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const { triggerSync } = useSync();

  // Phase 14.5: the four sequential `repo.*` reads that used to live
  // here have been collapsed into one TanStack-cached round-trip
  // against `/api/v1/stats`. Local SQLite reads stay on the workout
  // write path (until 14.7 decommissions them) but no longer back the
  // Stats screen.
  const { data } = useStatsBundle();

  // Re-pull when the user returns from a workout — totals/sets for
  // today only become accurate once the Complete screen has saved.
  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.stats.bundle });
    }, [queryClient]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await triggerSync();
      await queryClient.invalidateQueries({ queryKey: queryKeys.stats.bundle });
    } finally {
      setRefreshing(false);
    }
  }, [triggerSync, queryClient]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e94560" />
      }
      testID="stats-screen"
    >
      <Header
        onHistory={() => router.push('/history')}
      />

      <PersonalBestCard pb={data?.personalBest ?? null} second={data?.secondBestSet ?? null} />

      <StatTriple
        yesterday={data?.yesterdayTotal ?? null}
        target={data?.todayTarget ?? null}
        streak={data?.streak ?? 0}
      />

      <WeekBars week={data?.weekTotals ?? []} />

      <TodaySetsCard sets={data?.todaySets ?? []} />

      <TouchableOpacity
        style={styles.startButton}
        onPress={() => router.push('/workout')}
        testID="stats-start-cta"
      >
        <Text style={styles.startButtonText}>Start workout</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Header({ onHistory }: { onHistory: () => void }) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>Stats</Text>
      <View style={styles.chipRow}>
        <TouchableOpacity
          style={styles.chip}
          onPress={onHistory}
          testID="stats-history-chip"
        >
          <Text style={styles.chipText}>History</Text>
        </TouchableOpacity>
        {/* Settings route doesn't exist yet (Phase 11.6). Render as
            display-only with a "soon" pill — same pattern as the
            disabled "Reflect by voice" CTA on app/complete.tsx. */}
        <View style={styles.chipDisabledWrap} testID="stats-settings-chip">
          <View style={[styles.chip, styles.chipDisabled]}>
            <Text style={[styles.chipText, styles.chipTextDisabled]}>Settings</Text>
          </View>
          <Text style={styles.soonPill}>soon</Text>
        </View>
      </View>
    </View>
  );
}

function PersonalBestCard({
  pb,
  second,
}: {
  pb: { reps: number; date: string } | null;
  second: { reps: number; date: string } | null;
}) {
  return (
    <View style={styles.pbCard} testID="stats-pb-card">
      <Text style={styles.kicker}>PERSONAL BEST</Text>
      <View style={styles.pbRow}>
        <Text style={styles.pbReps} testID="stats-pb-reps">
          {pb ? pb.reps : EM_DASH}
        </Text>
        <Text style={styles.pbDate}>
          {pb ? formatDate(pb.date) : EM_DASH}
        </Text>
      </View>
      <Text style={styles.pbSubtitle} testID="stats-pb-previous">
        Previous:{' '}
        {second ? `${second.reps} on ${formatDate(second.date)}` : EM_DASH}
      </Text>
    </View>
  );
}

function StatTriple({
  yesterday,
  target,
  streak,
}: {
  yesterday: number | null;
  target: number | null;
  streak: number;
}) {
  return (
    <View style={styles.tripleRow} testID="stats-triple">
      <StatCell label="Yesterday" value={yesterday ?? EM_DASH} testID="stats-yesterday" />
      <StatCell label="Today's target" value={target ?? EM_DASH} testID="stats-target" />
      <StatCell
        label="Streak"
        value={streak > 0 ? `${streak} ${streak === 1 ? 'day' : 'days'}` : EM_DASH}
        testID="stats-streak"
      />
    </View>
  );
}

function StatCell({
  label,
  value,
  testID,
}: {
  label: string;
  value: string | number;
  testID: string;
}) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statValue} testID={testID}>{String(value)}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function WeekBars({ week }: { week: StatsBundleWeekDay[] }) {
  // Bars scale to the per-day plan target when set; fall back to the
  // week's max reps so a target-less week still produces a sensible
  // chart. Today's bar renders at 0.5 opacity per design.
  const todayIso = Temporal.Now.plainDateISO().toString();
  const weekMaxReps = Math.max(0, ...week.map((d) => d.totalReps));

  return (
    <View style={styles.weekCard} testID="stats-week-bars">
      <Text style={styles.kicker}>THIS WEEK</Text>
      <View style={styles.weekRow}>
        {week.length === 0
          ? DAY_LABELS.map((label, i) => (
              <WeekBar
                key={`placeholder-${i}`}
                label={label}
                heightPct={0}
                isToday={false}
              />
            ))
          : week.map((d, i) => {
              const isToday = d.date === todayIso;
              const scaleTo = d.target ?? weekMaxReps;
              const heightPct =
                scaleTo > 0 ? Math.min(1, d.totalReps / scaleTo) : 0;
              return (
                <WeekBar
                  key={d.date}
                  label={DAY_LABELS[i]}
                  heightPct={heightPct}
                  isToday={isToday}
                />
              );
            })}
      </View>
    </View>
  );
}

function WeekBar({
  label,
  heightPct,
  isToday,
}: {
  label: string;
  heightPct: number;
  isToday: boolean;
}) {
  // Floor visible bars at 8% so a 1-rep day still reads as "I trained";
  // a truly zero day stays empty so the user can spot rest days.
  const visiblePct = heightPct > 0 ? Math.max(0.08, heightPct) : 0;
  return (
    <View style={[styles.barColumn, isToday && styles.barColumnToday]}>
      <View style={styles.barTrack}>
        {visiblePct > 0 && (
          <View
            style={[
              styles.barFill,
              { height: `${Math.round(visiblePct * 100)}%` },
            ]}
          />
        )}
      </View>
      <Text style={styles.barLabel}>{label}</Text>
    </View>
  );
}

function TodaySetsCard({ sets }: { sets: StatsBundleTodaySet[] }) {
  // Cap at 5 rows per design; if a user did more, the slice truncates
  // and the rest live in Complete/History.
  const visible = sets.slice(0, 5);
  const maxReps = Math.max(1, ...visible.map((s) => s.reps));

  return (
    <View style={styles.todayCard} testID="stats-today-sets">
      <Text style={styles.kicker}>TODAY</Text>
      {visible.length === 0 ? (
        <Text style={styles.empty}>No sets today</Text>
      ) : (
        visible.map((s) => {
          const pct = Math.round((s.reps / maxReps) * 100);
          return (
            <View key={s.id} style={styles.setRow} testID={`stats-today-set-${s.setNumber}`}>
              <Text style={styles.setIndex}>Set {s.setNumber}</Text>
              <View style={styles.setBarTrack}>
                <View style={[styles.setBarFill, { width: `${pct}%` }]} />
              </View>
              <Text style={styles.setReps}>{s.reps}</Text>
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#16213e',
  },
  content: {
    padding: 20,
    paddingBottom: 48,
    gap: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  chip: {
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  chipText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
  chipDisabledWrap: {
    alignItems: 'center',
    gap: 2,
  },
  chipDisabled: {
    opacity: 0.5,
  },
  chipTextDisabled: {
    color: '#a0a0b0',
  },
  soonPill: {
    color: '#a0a0b0',
    fontSize: 9,
    fontStyle: 'italic',
    letterSpacing: 1,
  },
  kicker: {
    color: '#a0a0b0',
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: '600',
  },
  pbCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 20,
    gap: 8,
  },
  pbRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
  },
  pbReps: {
    color: '#fff',
    fontSize: 56,
    fontWeight: '300',
    fontFamily: 'serif',
    lineHeight: 60,
  },
  pbDate: {
    color: '#a0a0b0',
    fontSize: 14,
  },
  pbSubtitle: {
    color: '#a0a0b0',
    fontSize: 12,
  },
  tripleRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCell: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  statLabel: {
    color: '#a0a0b0',
    fontSize: 11,
    textAlign: 'center',
  },
  weekCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 90,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
    gap: 4,
    paddingHorizontal: 2,
  },
  barColumnToday: {
    opacity: 0.5,
  },
  barTrack: {
    width: '60%',
    flex: 1,
    backgroundColor: '#2a2a3e',
    borderRadius: 4,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    backgroundColor: '#6b8a6e',
    borderRadius: 4,
  },
  barLabel: {
    color: '#a0a0b0',
    fontSize: 10,
  },
  todayCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  empty: {
    color: '#a0a0b0',
    fontSize: 13,
    fontStyle: 'italic',
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  setIndex: {
    color: '#a0a0b0',
    fontSize: 12,
    width: 48,
  },
  setBarTrack: {
    flex: 1,
    height: 6,
    backgroundColor: '#2a2a3e',
    borderRadius: 3,
    overflow: 'hidden',
  },
  setBarFill: {
    height: '100%',
    backgroundColor: '#6b8a6e',
    borderRadius: 3,
  },
  setReps: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    width: 36,
    textAlign: 'right',
  },
  startButton: {
    backgroundColor: '#e94560',
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  startButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
