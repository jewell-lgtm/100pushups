// Session Complete screen (Phase 11.4.2, re-skinned in Phase 12.6).
//
// Rendered after a workout is saved. Shows: total reps, per-set mini
// bar chart, a reflection card (loading → backend string OR static
// fallback), and two CTAs (voice reflection coming-soon; "Done for
// today" returns to Stats).
//
// Phase 12.6: swapped plain RN primitives for the Phase 12 design
// system — `Card`, `SessionBars`, `ThinkingDots`, `PrimaryButton`,
// `Kicker`, `Waveform` — and the cream / sage / Fraunces palette.
// Data-flow (`useCompleteData`, `useReflection`, `trackedRef` analytics
// gate) is unchanged.

import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getDatabase } from '../src/db/getDatabase';
import { createRepository, IRepository } from '../src/db/repository';
import {
  COMPLETE_FALLBACK_REFLECTION,
  useCompleteData,
} from '../src/screens/useCompleteData';
import { useReflection } from '../src/data/hooks/useReflection';
import {
  EVENT_SESSION_REFLECTION_VIEWED,
  track,
} from '../src/analytics/posthog';
import { colors, font, radii, spacing } from '../src/theme';
import { Card } from '../src/components/Card';
import { SessionBars } from '../src/components/SessionBars';
import { ThinkingDots } from '../src/components/ThinkingDots';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { Kicker } from '../src/components/Kicker';
import { Waveform } from '../src/components/Waveform';

export default function CompleteScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ sessionId?: string }>();
  const sessionId = typeof params.sessionId === 'string' ? params.sessionId : null;

  // Resolve the SQLite singleton post-mount, mirroring `app/plan.tsx` /
  // `app/workout.tsx`. Until it resolves we render the loading state.
  // The api client is no longer touched here — `useReflection` calls
  // `getApiClient()` inside its queryFn.
  const [repo, setRepo] = useState<IRepository | null>(null);

  useEffect(() => {
    (async () => {
      const db = await getDatabase();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setRepo(createRepository(db as any));
    })();
  }, []);

  const deps = useMemo(() => {
    if (!repo || !sessionId) return null;
    return { repo, sessionId };
  }, [repo, sessionId]);

  const { data } = useCompleteData(deps);
  const reflectionQuery = useReflection(sessionId);

  // The reflection card has three render branches:
  //  - loading (query in flight) → ThinkingDots;
  //  - non-empty backend string → render it (testID complete-reflection-text);
  //  - everything else (null reflection, error, no data) → static
  //    fallback (testID complete-reflection-fallback).
  const reflectionText =
    typeof reflectionQuery.data?.reflection === 'string' &&
    reflectionQuery.data.reflection.length > 0
      ? reflectionQuery.data.reflection
      : null;
  const hasReflection = reflectionText !== null;

  // Fire the analytics event exactly once, when the reflection settles
  // (success or error/null). `hasReflection` is the only dimension we
  // send — never the text.
  const trackedRef = useRef(false);
  useEffect(() => {
    if (
      !trackedRef.current &&
      sessionId !== null &&
      !reflectionQuery.isLoading &&
      (reflectionQuery.isSuccess || reflectionQuery.isError)
    ) {
      trackedRef.current = true;
      track(EVENT_SESSION_REFLECTION_VIEWED, { hasReflection });
    }
  }, [
    sessionId,
    reflectionQuery.isLoading,
    reflectionQuery.isSuccess,
    reflectionQuery.isError,
    hasReflection,
  ]);

  const totalReps = data?.session?.totalReps ?? 0;
  const sets = data?.sets ?? [];
  const repsList = sets.map((s) => s.reps);

  const goHome = () => {
    // replace so the back gesture from Stats doesn't re-enter this
    // (already-consumed) screen.
    router.replace('/');
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      testID="complete-screen"
    >
      <View style={styles.header}>
        <Kicker>Session complete</Kicker>
        <View style={styles.totalRow}>
          <Text style={styles.totalReps} testID="complete-total-reps">
            {totalReps}
          </Text>
          <Text style={styles.doneCaption}>done.</Text>
        </View>
      </View>

      <Card style={styles.barsCard} testID="complete-bars">
        {sets.length === 0 ? (
          <Text style={styles.empty}>No sets recorded.</Text>
        ) : (
          <SessionBars reps={repsList} height={64} showLabels />
        )}
      </Card>

      <Card
        variant="sage"
        style={styles.reflectionCard}
        testID="complete-reflection-card"
      >
        <View style={styles.reflectionHeader}>
          <Text style={styles.reflectionKicker}>From your coach</Text>
        </View>
        {reflectionQuery.isLoading ? (
          <View
            style={styles.reflectionLoading}
            testID="complete-reflection-loading"
          >
            <ThinkingDots color="#ffffff" />
          </View>
        ) : (
          <Text
            style={styles.reflectionText}
            testID={
              hasReflection
                ? 'complete-reflection-text'
                : 'complete-reflection-fallback'
            }
          >
            {reflectionText ?? COMPLETE_FALLBACK_REFLECTION}
          </Text>
        )}
        <View style={styles.reflectionWaveform}>
          <Waveform
            active={false}
            color="#ffffff"
            accent={colors.sageSoft}
            width={180}
            height={50}
          />
        </View>
      </Card>

      <View style={styles.actions}>
        <PrimaryButton
          label="Reflect by voice"
          variant="outlined"
          disabled
          style={styles.actionButton}
          testID="complete-voice-cta"
          trailing={
            <View style={styles.soonBadge}>
              <Text style={styles.soonBadgeText}>Coming soon</Text>
            </View>
          }
        />
        <PrimaryButton
          label="Done for today"
          variant="filled"
          onPress={goHome}
          style={styles.actionButton}
          testID="complete-done-cta"
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing[6],
    paddingBottom: 48,
    gap: spacing[5],
  },
  header: {
    gap: spacing[1],
    marginTop: spacing[4],
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing[4],
    marginTop: spacing[2],
  },
  totalReps: {
    color: colors.ink,
    fontFamily: font.serif,
    fontSize: 120,
    lineHeight: 108,
    letterSpacing: -6,
  },
  doneCaption: {
    color: colors.sage,
    fontFamily: font.serifItalic,
    fontStyle: 'italic',
    fontSize: 22,
  },
  empty: {
    color: colors.inkDim,
    textAlign: 'center',
    fontSize: 13,
    fontFamily: font.sans,
  },
  barsCard: {
    padding: spacing[5],
  },
  reflectionCard: {
    padding: spacing[5],
    gap: spacing[3],
    borderRadius: radii.lg,
  },
  reflectionHeader: {
    marginBottom: spacing[1],
  },
  reflectionKicker: {
    color: '#ffffff',
    opacity: 0.7,
    fontFamily: font.sans,
    fontSize: 11,
    letterSpacing: 11 * 0.15,
    textTransform: 'uppercase',
  },
  reflectionLoading: {
    alignSelf: 'flex-start',
    paddingVertical: spacing[2],
  },
  reflectionText: {
    color: '#ffffff',
    fontFamily: font.serif,
    fontSize: 18,
    lineHeight: 25,
  },
  reflectionWaveform: {
    alignItems: 'center',
    marginTop: spacing[2],
  },
  actions: {
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[2],
  },
  actionButton: {
    flex: 1,
  },
  soonBadge: {
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
  },
  soonBadgeText: {
    color: colors.inkDim,
    fontFamily: font.sansItalic,
    fontStyle: 'italic',
    fontSize: 10,
    letterSpacing: 0.4,
  },
});
