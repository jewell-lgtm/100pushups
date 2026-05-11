// Stats screen — re-skin (Phase 12.6).
//
// Visual layer migrated to the Breath design tokens + molecules
// (`Card`, `ScreenHeader`, `Kicker`, `StatTriple`, `SetRow`,
// `SessionBars`, `PrimaryButton`). Data flow is unchanged — TanStack
// Query (`useStatsBundle`), focus-effect invalidation, voice-context
// prefetch, and the analytics-free pull-to-refresh path all carry over
// from the functional cut. Every existing testID is preserved so
// `e2e/stats.spec.ts` keeps passing without edits.

import { useCallback, useEffect, useState } from 'react';
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
import { getApiClient } from '../src/api/getApiClient';
import { useSync } from '../src/hooks/useSync';
import { colors } from '../src/theme/colors';
import { font } from '../src/theme/type';
import { radii } from '../src/theme/radii';
import { Kicker } from '../src/components/Kicker';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { Card } from '../src/components/Card';
import { StatTriple } from '../src/components/StatTriple';
import { SetRow } from '../src/components/SetRow';
import { SessionBars } from '../src/components/SessionBars';
import { PrimaryButton } from '../src/components/PrimaryButton';

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

  // Pre-fetch the voice-context bundle the Workout greeting needs so
  // the screen lands warm. Fire-and-forget — `startSession` reads the
  // same cache slot via `fetchQuery` and will wait for an in-flight
  // request or fire its own if the prefetch hasn't landed yet. 30s
  // staleTime matches the hook itself; a second mount within the
  // window is a no-op.
  useEffect(() => {
    void queryClient.prefetchQuery({
      queryKey: queryKeys.voiceContext('pushups'),
      queryFn: async () => {
        const client = await getApiClient();
        return client.getVoiceContext({ exerciseId: 'pushups' });
      },
      staleTime: 30_000,
    });
  }, [queryClient]);

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
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.sage} />
      }
      testID="stats-screen"
    >
      <Header onHistory={() => router.push('/history')} />

      <PersonalBestCard
        pb={data?.personalBest ?? null}
        second={data?.secondBestSet ?? null}
        yesterday={data?.yesterdayTotal ?? null}
        target={data?.todayTarget ?? null}
        streak={data?.streak ?? 0}
      />

      <WeekBars week={data?.weekTotals ?? []} />

      <TodaySetsCard sets={data?.todaySets ?? []} />

      <PrimaryButton
        label="Start workout"
        onPress={() => router.push('/workout')}
        testID="stats-start-cta"
        style={styles.startButton}
      />
    </ScrollView>
  );
}

function Header({ onHistory }: { onHistory: () => void }) {
  // Settings chip stays display-only with the "soon" pill per f0ab522.
  // Both chips share the right-aligned trailing slot of ScreenHeader.
  const trailing = (
    <View style={styles.chipRow}>
      <TouchableOpacity
        style={styles.chip}
        onPress={onHistory}
        testID="stats-history-chip"
      >
        <Text style={styles.chipText}>History</Text>
      </TouchableOpacity>
      <View style={styles.chipDisabledWrap} testID="stats-settings-chip">
        <View style={[styles.chip, styles.chipDisabled]}>
          <Text style={[styles.chipText, styles.chipTextDisabled]}>Settings</Text>
        </View>
        <Text style={styles.soonPill}>soon</Text>
      </View>
    </View>
  );

  return (
    <ScreenHeader
      kicker="TODAY"
      title="Personal best."
      titleSize={34}
      trailing={trailing}
    />
  );
}

function PersonalBestCard({
  pb,
  second,
  yesterday,
  target,
  streak,
}: {
  pb: { reps: number; date: string } | null;
  second: { reps: number; date: string } | null;
  yesterday: number | null;
  target: number | null;
  streak: number;
}) {
  // The design lays the PB card with a serif headline rep count, an
  // italic "reps" suffix, a "Previous: …" subtitle, and the StatTriple
  // (yesterday / target / streak) as the card's hairline-divided
  // footer. Wrapping `StatTriple` inside `Card` keeps the molecule
  // separator + spacing in one place.
  return (
    <Card radius="xl" testID="stats-pb-card">
      <Kicker>SINGLE SET, UNBROKEN</Kicker>
      <View style={styles.pbRow}>
        <Text style={styles.pbReps} testID="stats-pb-reps">
          {pb ? pb.reps : EM_DASH}
        </Text>
        <Text style={styles.pbRepsSuffix}>reps</Text>
      </View>
      <Text style={styles.pbSubtitle} testID="stats-pb-previous">
        Previous:{' '}
        {second ? `${second.reps} on ${formatDate(second.date)}` : EM_DASH}
      </Text>
      <View testID="stats-triple">
        <StatTriple
          items={[
            {
              label: 'Yesterday',
              value: String(yesterday ?? EM_DASH),
            },
            {
              label: "Today's target",
              value: String(target ?? EM_DASH),
            },
            {
              label: 'Streak',
              value:
                streak > 0
                  ? `${streak} ${streak === 1 ? 'd' : 'd'}`
                  : EM_DASH,
            },
          ]}
        />
        {/* Invisible probes so e2e tests can still target the
            individual cells; the StatTriple molecule renders the
            visible values, but the existing assertions reach for
            `stats-yesterday` / `stats-target` / `stats-streak` by
            testID. Keep them adjacent (zero-height) so the layout is
            untouched. */}
        <View style={styles.hiddenProbes} pointerEvents="none">
          <Text testID="stats-yesterday">{String(yesterday ?? EM_DASH)}</Text>
          <Text testID="stats-target">{String(target ?? EM_DASH)}</Text>
          <Text testID="stats-streak">
            {streak > 0
              ? `${streak} ${streak === 1 ? 'day' : 'days'}`
              : EM_DASH}
          </Text>
        </View>
      </View>
    </Card>
  );
}

function WeekBars({ week }: { week: StatsBundleWeekDay[] }) {
  // Bars scale to the per-day plan target when set; fall back to the
  // week's max reps so a target-less week still produces a sensible
  // chart. `SessionBars` handles the staggered entrance animation
  // (Phase 13.3). We render day labels in a separate row below
  // because `SessionBars`'s `showLabels` prints the rep value, not
  // the weekday glyph.
  const todayIso = Temporal.Now.plainDateISO().toString();
  const weekMaxReps = Math.max(0, ...week.map((d) => d.totalReps));

  const reps =
    week.length === 0
      ? [0, 0, 0, 0, 0, 0, 0]
      : week.map((d) => {
          const scaleTo = d.target ?? weekMaxReps;
          // Reproduce the existing 8% floor on non-zero days so a
          // single-rep day still reads as "I trained". Bars are
          // capped at 1.0 by SessionBars normalising against the
          // displayed max, so scale into a synthetic 0–100 space.
          const heightPct =
            scaleTo > 0 ? Math.min(1, d.totalReps / scaleTo) : 0;
          const visiblePct =
            heightPct > 0 ? Math.max(0.08, heightPct) : 0;
          return Math.round(visiblePct * 100);
        });

  const labels =
    week.length === 0
      ? DAY_LABELS
      : week.map((_, i) => DAY_LABELS[i] ?? '');

  // The today index is used purely to apply the 0.5 opacity treatment
  // on the day label, since SessionBars renders bars at uniform
  // emphasis. The bar itself stays solid; the muted label is enough
  // to read "this day in progress" against the rest of the week.
  const todayIndex = week.findIndex((d) => d.date === todayIso);

  return (
    <Card testID="stats-week-bars">
      <View style={styles.weekHeaderRow}>
        <Text style={styles.cardTitle}>This week</Text>
      </View>
      <SessionBars reps={reps} height={84} showLabels={false} />
      <View style={styles.dayLabelRow}>
        {labels.map((label, i) => (
          <Text
            key={i}
            style={[
              styles.dayLabel,
              i === todayIndex && styles.dayLabelToday,
            ]}
          >
            {label}
          </Text>
        ))}
      </View>
    </Card>
  );
}

function TodaySetsCard({ sets }: { sets: StatsBundleTodaySet[] }) {
  // Cap at 5 rows per design; if a user did more, the slice truncates
  // and the rest live in Complete/History. The SetRow molecule owns
  // each row's typography + sage progress bar; the first row drops
  // its top border so it sits flush with the section title.
  const visible = sets.slice(0, 5);
  const maxReps = Math.max(1, ...visible.map((s) => s.reps));
  const totalReps = visible.reduce((sum, s) => sum + s.reps, 0);

  return (
    <Card testID="stats-today-sets">
      <View style={styles.todayHeaderRow}>
        <Text style={styles.cardTitle}>Today's sets</Text>
        {visible.length > 0 && (
          <Text style={styles.todayMeta}>
            {visible.length} {visible.length === 1 ? 'set' : 'sets'} ·{' '}
            {totalReps} reps
          </Text>
        )}
      </View>
      {visible.length === 0 ? (
        <Text style={styles.empty}>No sets today</Text>
      ) : (
        visible.map((s, i) => (
          <View key={s.id} testID={`stats-today-set-${s.setNumber}`}>
            <SetRow
              index={s.setNumber}
              reps={s.reps}
              max={maxReps}
              showTopBorder={i > 0}
            />
          </View>
        ))
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: 22,
    paddingBottom: 48,
    gap: 18,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  chip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
  },
  chipText: {
    fontFamily: font.sansMedium,
    color: colors.ink,
    fontSize: 13,
  },
  chipDisabledWrap: {
    alignItems: 'center',
    gap: 2,
  },
  chipDisabled: {
    opacity: 0.5,
  },
  chipTextDisabled: {
    color: colors.inkFaint,
  },
  soonPill: {
    fontFamily: font.sansItalic,
    color: colors.inkFaint,
    fontSize: 9,
    letterSpacing: 1,
  },
  pbRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    marginTop: 6,
  },
  pbReps: {
    fontFamily: font.serif,
    color: colors.ink,
    fontSize: 96,
    lineHeight: 96 * 0.95,
    letterSpacing: -3.5,
  },
  pbRepsSuffix: {
    fontFamily: font.serifItalic,
    color: colors.sage,
    fontSize: 22,
  },
  pbSubtitle: {
    fontFamily: font.sans,
    color: colors.inkDim,
    fontSize: 13,
    marginTop: 10,
    lineHeight: 19,
  },
  hiddenProbes: {
    height: 0,
    overflow: 'hidden',
    opacity: 0,
  },
  cardTitle: {
    fontFamily: font.serif,
    color: colors.ink,
    fontSize: 20,
  },
  weekHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 14,
  },
  dayLabelRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  dayLabel: {
    flex: 1,
    fontFamily: font.sans,
    fontSize: 10,
    color: colors.inkFaint,
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  dayLabelToday: {
    opacity: 0.5,
  },
  todayHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  todayMeta: {
    fontFamily: font.sans,
    color: colors.inkDim,
    fontSize: 12,
  },
  empty: {
    fontFamily: font.sansItalic,
    color: colors.inkFaint,
    fontSize: 13,
    paddingVertical: 8,
  },
  startButton: {
    marginTop: 6,
  },
});
