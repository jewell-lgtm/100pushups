// Session Complete screen (Phase 11.4.2).
//
// Rendered after a workout is saved. Shows: total reps, per-set mini
// bar chart, a reflection card (loading → backend string OR static
// fallback), and two CTAs (voice reflection coming-soon; "Done for
// today" returns to Stats).
//
// Functional cut only — visual polish (Fraunces serif, sage palette,
// the polished ThinkingDots / SessionBars / PrimaryButton molecules)
// lands in Phase 12.6 once the Phase 12 design system is merged. The
// componentry referenced by the spec lives in `.claude/worktrees/` and
// hasn't been merged to main yet, so this screen uses plain RN
// primitives that match the styling of `app/index.tsx` and
// `app/plan.tsx`.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
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
  //  - loading (query in flight) → ActivityIndicator;
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
        <Text style={styles.kicker}>SESSION COMPLETE</Text>
        <Text style={styles.totalReps} testID="complete-total-reps">
          {totalReps}
        </Text>
        <Text style={styles.caption}>done.</Text>
      </View>

      <View style={styles.barsCard} testID="complete-bars">
        {sets.length === 0 ? (
          <Text style={styles.empty}>No sets recorded.</Text>
        ) : (
          <View style={styles.barsRow}>
            {sets.map((set) => {
              const maxReps = Math.max(...sets.map((s) => s.reps), 1);
              const heightPct = Math.max(0.1, set.reps / maxReps);
              return (
                <View key={set.id} style={styles.barColumn}>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        { height: `${Math.round(heightPct * 100)}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.barLabel}>{set.reps}</Text>
                </View>
              );
            })}
          </View>
        )}
      </View>

      <View style={styles.reflectionCard} testID="complete-reflection-card">
        <Text style={styles.kicker}>COACH</Text>
        {reflectionQuery.isLoading ? (
          <ActivityIndicator
            color="#e94560"
            testID="complete-reflection-loading"
            style={styles.reflectionLoading}
          />
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
      </View>

      <View style={styles.actions}>
        <View style={styles.voiceCtaWrap}>
          <TouchableOpacity
            style={[styles.outlinedButton, styles.disabledButton]}
            disabled
            testID="complete-voice-cta"
          >
            <Text style={styles.outlinedButtonText}>Reflect by voice</Text>
          </TouchableOpacity>
          <View style={styles.soonBadge}>
            <Text style={styles.soonBadgeText}>Coming soon</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={goHome}
          testID="complete-done-cta"
        >
          <Text style={styles.primaryButtonText}>Done for today</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#16213e',
  },
  content: {
    padding: 24,
    paddingBottom: 48,
    gap: 24,
  },
  header: {
    alignItems: 'center',
    gap: 4,
    marginTop: 24,
  },
  kicker: {
    color: '#a0a0b0',
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: '600',
  },
  totalReps: {
    color: '#fff',
    // Falls back to the platform serif when Fraunces isn't loaded —
    // Phase 12.3 wires the real face via expo-font.
    fontFamily: 'serif',
    fontSize: 96,
    fontWeight: '300',
    lineHeight: 100,
    marginTop: 8,
  },
  caption: {
    color: '#a0a0b0',
    fontFamily: 'serif',
    fontStyle: 'italic',
    fontSize: 18,
  },
  barsCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 20,
    minHeight: 140,
    justifyContent: 'center',
  },
  empty: {
    color: '#a0a0b0',
    textAlign: 'center',
    fontSize: 13,
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    height: 100,
    gap: 6,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
    gap: 6,
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
    fontSize: 11,
  },
  reflectionCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 20,
    gap: 12,
    minHeight: 100,
  },
  reflectionLoading: {
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  reflectionText: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 22,
  },
  actions: {
    gap: 12,
    marginTop: 8,
  },
  voiceCtaWrap: {
    alignItems: 'stretch',
    gap: 4,
  },
  outlinedButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#a0a0b0',
    paddingVertical: 14,
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.5,
  },
  outlinedButtonText: {
    color: '#a0a0b0',
    fontSize: 15,
    fontWeight: '600',
  },
  soonBadge: {
    alignSelf: 'center',
  },
  soonBadgeText: {
    color: '#a0a0b0',
    fontSize: 11,
    fontStyle: 'italic',
  },
  primaryButton: {
    backgroundColor: '#e94560',
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
