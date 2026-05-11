// Workout screen — re-skin (Phase 12.6) + streaming polish (13.1) +
// mic-button dock (13.4).
//
// Visual layer migrated to the Breath design tokens + molecules. The
// underlying voice / state-machine wiring (`useWorkoutSession`,
// `TTSManager`, `VoiceManager`, chat-log helper) is untouched — this
// file is purely the rendering shell.
//
// Layout (matches `design/direction-b.jsx › B_WorkoutScreen` 19–91):
//   1. Soft header — StreakChip ("Day {n}" from useStatsBundle) +
//      time-of-day badge.
//   2. Hero blob (Waveform, 220px tall) with rep-count / rest-timer
//      overlays driven by `appState`.
//   3. Transcript ScrollView — user utterances render via
//      TranscriptLine (italic muted), coach messages via CoachMessage
//      (serif 22, thinking dots / blinking caret built in). Each
//      message is still wrapped in <View testID="bubble-{role}"> so the
//      e2e suite keeps its selectors. The pending state still mounts a
//      <View testID="bubble-spinner"> around ThinkingDots so
//      `e2e/streaming.spec.ts` remains green.
//   4. Bottom dock — status label + 76×76 MicButton. Tapping the mic
//      surfaces the existing TextInput in a Modal (MVP voice harness).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getDatabase } from '../src/db/getDatabase';
import { createRepository } from '../src/db/repository';
import { createTTSManager } from '../src/voice/TTSManager';
import { createVoiceManager, VoiceEngine } from '../src/voice/VoiceManager';
import { IApiClient } from '../src/api/client';
import { getApiClient } from '../src/api/getApiClient';
import { useWorkoutSession } from '../src/hooks/useWorkoutSession';
import { useSync } from '../src/hooks/useSync';
import { useStatsBundle } from '../src/data/hooks/useStatsBundle';
import type { ChatMessage } from '../src/hooks/chatLog';
import { colors } from '../src/theme/colors';
import { font } from '../src/theme/type';
import { spacing } from '../src/theme/spacing';
import { radii } from '../src/theme/radii';
import { Waveform, type WaveformMode } from '../src/components/Waveform';
import { MicButton, type MicState } from '../src/components/MicButton';
import { RestTimer } from '../src/components/RestTimer';
import { RepCounter } from '../src/components/RepCounter';
import { CoachMessage } from '../src/components/CoachMessage';
import { TranscriptLine } from '../src/components/TranscriptLine';
import { StreakChip } from '../src/components/StreakChip';
import { ThinkingDots } from '../src/components/ThinkingDots';

// Default rest duration in seconds. The state machine doesn't track a
// rest countdown so this is a presentational stand-in — when appState
// transitions to `between_sets` the timer resets and counts down here.
const REST_DURATION_S = 60;

function createPlaceholderEngine(): VoiceEngine & {
  simulateResults(results: string[]): void;
} {
  let resultsCallback: ((results: string[]) => void) | null = null;

  return {
    async start() {},
    async stop() {},
    async destroy() {},
    onSpeechResults(cb) { resultsCallback = cb; },
    onSpeechError() {},
    removeListeners() { resultsCallback = null; },
    simulateResults(results: string[]) { resultsCallback?.(results); },
  };
}

// Time-of-day badge per design ref (header right-side label, e.g.
// "Morning"). Computed at render time off `Date.now`; cheap.
function timeOfDayLabel(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 12) return 'Morning';
  if (h < 18) return 'Afternoon';
  return 'Evening';
}

// "Day 23" — the streak from useStatsBundle, defaulting to 1 when the
// bundle is cold or the user has no streak yet (every workout is at
// least Day 1 of the new streak).
function streakLabel(streak: number): string {
  const day = Math.max(1, streak);
  return `Day ${day}`;
}

export default function WorkoutScreen() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [micSheetOpen, setMicSheetOpen] = useState(false);
  // Lazy refs — useRef evaluates its argument on every render. createVoiceManager
  // has the side effect of engine.onSpeechResults(...), so calling it more than
  // once would re-bind the engine listener to an unused manager and the first
  // (used) manager would never hear results.
  const ttsRef = useRef<ReturnType<typeof createTTSManager> | null>(null);
  if (!ttsRef.current) ttsRef.current = createTTSManager();
  const engineRef = useRef<ReturnType<typeof createPlaceholderEngine> | null>(null);
  if (!engineRef.current) engineRef.current = createPlaceholderEngine();
  const voiceRef = useRef<ReturnType<typeof createVoiceManager> | null>(null);
  if (!voiceRef.current) voiceRef.current = createVoiceManager(engineRef.current);
  const apiRef = useRef<IApiClient | null>(null);
  const dbRef = useRef<any>(null);
  const repoRef = useRef<any>(null);
  const scrollRef = useRef<ScrollView | null>(null);

  // Stable stub used until the real API client is loaded post-mount.
  // Voice calls in those first few ms will throw and the hook will fall
  // back to FallbackParser — that's fine. syncWorkouts also throws so the
  // sync service's fetch-error path returns 0 rather than silently lying.
  const stubApi: IApiClient = {
    voiceRespond: async () => { throw new Error('api not ready'); },
    // eslint-disable-next-line require-yield
    voiceRespondStream: async function* () { throw new Error('api not ready'); },
    syncWorkouts: async () => { throw new Error('api not ready'); },
    generateWeeklyPlan: async () => { throw new Error('api not ready'); },
    reflectSession: async () => { throw new Error('api not ready'); },
    getStatsBundle: async () => { throw new Error('api not ready'); },
    getHistoryMonth: async () => { throw new Error('api not ready'); },
    getVoiceContext: async () => { throw new Error('api not ready'); },
    isReachable: async () => false,
  };

  const { triggerSync } = useSync();
  // useStatsBundle is the same cached query the Stats screen reads —
  // mounting it here just attaches another subscriber, no extra fetch
  // when the cache is warm (30s staleTime).
  const { data: stats } = useStatsBundle();

  const { state, chatLog, startSession } = useWorkoutSession({
    tts: ttsRef.current!,
    voice: voiceRef.current!,
    api: apiRef.current ?? stubApi,
    repo: repoRef.current ?? {
      buildVoiceContext: async () => ({ todayTarget: null, yesterdayTotal: null, personalBest: null, streak: 0, sessionType: 'regular' as const }),
      insertSession: async () => {},
      updateSession: async () => {},
      insertSet: async () => {},
    },
    exerciseId: 'pushups',
    onSessionSaved: (sessionId: string) => {
      // Fire-and-forget — the inflight lock in useSync coalesces with
      // the foreground listener, and sync errors are caught internally.
      void triggerSync();
      // Route to the Complete screen. `replace` (not `push`) so the
      // hardware back gesture lands on Stats, not back into the
      // already-ended workout.
      router.replace({ pathname: '/complete', params: { sessionId } });
    },
  });

  useEffect(() => {
    (async () => {
      const [db, api] = await Promise.all([getDatabase(), getApiClient()]);
      dbRef.current = db;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      repoRef.current = createRepository(db as any);
      apiRef.current = api;
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (ready) {
      startSession();
    }
  }, [ready]);

  // Navigation away from this screen happens in `onSessionSaved` above
  // — once SAVE_SESSION lands we `router.replace('/complete?...')`, which
  // also covers the case where the reducer transitions to idle via
  // record_feedback. No second effect needed here.

  // Auto-scroll on new messages or token streaming. Tracking the latest
  // coach message text means we re-scroll as deltas arrive.
  const lastCoachText = chatLog
    .slice()
    .reverse()
    .find((m) => m.role === 'coach')?.text ?? '';
  useEffect(() => {
    // setTimeout 0 lets layout settle before scroll
    const t = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 0);
    return () => clearTimeout(t);
  }, [chatLog.length, lastCoachText]);

  // Rest countdown — local presentational state. Resets to
  // REST_DURATION_S whenever the workout enters `between_sets`; ticks
  // down once per second and clamps at 0. Not surfaced back into the
  // state machine, just driving the RestTimer overlay.
  const [restSecondsLeft, setRestSecondsLeft] = useState(REST_DURATION_S);
  useEffect(() => {
    if (state.appState !== 'between_sets') {
      setRestSecondsLeft(REST_DURATION_S);
      return;
    }
    setRestSecondsLeft(REST_DURATION_S);
    const interval = setInterval(() => {
      setRestSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [state.appState]);

  const sendText = useCallback(() => {
    if (!textInput.trim()) return;
    engineRef.current?.simulateResults([textInput.trim()]);
    setTextInput('');
    setMicSheetOpen(false);
  }, [textInput]);

  const stateLabel = {
    idle: 'Starting...',
    awaiting_start: 'Awaiting start',
    mid_set: `Set ${state.currentSetNumber} — ${state.currentSetReps} reps`,
    between_sets: 'Resting',
    post_workout: 'Wrapping up',
  }[state.appState];

  // Status label for the bottom dock — mirrors the design ref's three
  // states. Last coach message determines whether the coach is talking;
  // otherwise we look at the chat tail.
  const lastMsg = chatLog[chatLog.length - 1];
  const coachIsActive =
    lastMsg?.role === 'coach' &&
    (lastMsg.status === 'pending' || lastMsg.status === 'streaming');
  const userJustReplied = lastMsg?.role === 'user' && !coachIsActive;
  const dockStatusLabel = coachIsActive
    ? 'Coach is speaking'
    : userJustReplied
      ? 'Listening'
      : 'Tap when ready';
  // The MicButton and Waveform share the same turn-state vocabulary —
  // one `turnMode` powers both so they stay perfectly in sync.
  // `speaking` (coach mid-response) dims the mic + contracts the iris;
  // `listening` (user replied last) pulses the mic + dilates the iris;
  // `idle` is the calm between-turns state.
  const turnMode: MicState & WaveformMode = coachIsActive
    ? 'speaking'
    : userJustReplied
      ? 'listening'
      : 'idle';
  const micState: MicState = turnMode;

  // Memoise the time-of-day label so we don't recompute on every render
  // (it can stay stable until the screen remounts; the user isn't going
  // to cross noon during a single workout).
  const todBadge = useMemo(() => timeOfDayLabel(), []);

  // Hero overlay — pick the right component based on appState.
  let heroOverlay: React.ReactNode = null;
  if (state.appState === 'mid_set') {
    heroOverlay = (
      <RepCounter reps={state.currentSetReps} target={state.targetReps ?? undefined} />
    );
  } else if (state.appState === 'between_sets' || state.appState === 'post_workout') {
    heroOverlay = <RestTimer secondsLeft={restSecondsLeft} />;
  }

  return (
    <View style={styles.container}>
      {/* Soft header — streak chip + time-of-day badge */}
      <View style={styles.header}>
        <StreakChip label={streakLabel(stats?.streak ?? 0)} />
        <Text style={styles.timeBadge}>{todBadge}</Text>
      </View>

      {/* State indicator — visually subtle (small ink-dim label) but
          carries the e2e-relied-upon testID. Tests assert text like
          "Awaiting start" / "Set 1" so the format stays the same. */}
      <View testID="state-indicator" style={styles.stateRow}>
        <Text style={styles.stateLabel}>{stateLabel}</Text>
      </View>

      {/* Hero blob — Waveform + overlay (rep counter / rest timer) */}
      <View style={styles.hero}>
        <Waveform
          mode={turnMode}
          color={colors.sage}
          accent={colors.sageSoft}
          width={260}
          height={220}
        />
        {heroOverlay !== null && (
          <View style={styles.heroOverlay} pointerEvents="none">
            {heroOverlay}
          </View>
        )}
      </View>

      {/* Transcript */}
      <ScrollView
        ref={scrollRef}
        style={styles.chatScroll}
        contentContainerStyle={styles.chatContent}
        keyboardShouldPersistTaps="handled"
      >
        {chatLog.map((m) => (
          <ChatRow key={m.id} message={m} />
        ))}
      </ScrollView>

      {/* Bottom dock — status + mic button */}
      <View style={styles.dock}>
        <Text style={styles.dockStatus}>{dockStatusLabel}</Text>
        <MicButton state={micState} testID="mic-button" onPress={() => setMicSheetOpen(true)} />
      </View>

      {/* TextInput sheet — MVP voice harness. Tapping the mic button
          surfaces this modal; the existing simulateResults() call still
          drives useWorkoutSession via the placeholder engine. */}
      <Modal
        visible={micSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setMicSheetOpen(false)}
      >
        <Pressable
          style={styles.sheetBackdrop}
          onPress={() => setMicSheetOpen(false)}
        >
          {/* Inner pressable swallows the tap so the textInput area
              doesn't dismiss the sheet. */}
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.sheetKeyboard}
          >
            <Pressable style={styles.sheet} onPress={() => {}}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>Type to speak</Text>
              <TextInput
                style={styles.textInput}
                value={textInput}
                onChangeText={setTextInput}
                onSubmitEditing={sendText}
                placeholder={
                  state.appState === 'awaiting_start'
                    ? 'Type "ready"...'
                    : 'Type command...'
                }
                placeholderTextColor={colors.inkFaint}
                autoFocus
                returnKeyType="send"
              />
              <Pressable style={styles.sendButton} onPress={sendText}>
                <Text style={styles.sendButtonText}>Send</Text>
              </Pressable>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </View>
  );
}

// One transcript row. User → italic muted TranscriptLine; coach →
// serif CoachMessage with built-in thinking-dots + blinking caret.
// We keep the original `bubble-user` / `bubble-coach` testIDs on the
// wrapping View so existing e2e selectors keep working, and preserve
// `bubble-spinner` on the thinking slot so the streaming test stays
// addressable.
function ChatRow({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const wrapStyle = isUser ? styles.rowUser : styles.rowCoach;

  if (isUser) {
    return (
      <View style={wrapStyle} testID="bubble-user">
        <TranscriptLine text={message.text} />
      </View>
    );
  }

  const isPending = message.status === 'pending';
  return (
    <View style={wrapStyle} testID="bubble-coach">
      {isPending ? (
        // Preserve the bubble-spinner testID. Wrapping View carries it;
        // ThinkingDots replaces the old ActivityIndicator visually.
        <View testID="bubble-spinner" style={styles.spinnerSlot}>
          <ThinkingDots />
        </View>
      ) : (
        <CoachMessage
          text={message.text}
          streaming={message.status === 'streaming'}
          thinking={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingTop: 18,
    paddingHorizontal: 22,
    paddingBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeBadge: {
    fontFamily: font.sans,
    fontSize: 12,
    color: colors.inkFaint,
    letterSpacing: 12 * 0.06,
  },
  stateRow: {
    paddingHorizontal: 22,
    paddingBottom: 2,
  },
  stateLabel: {
    fontFamily: font.sans,
    fontSize: 11,
    color: colors.inkFaint,
    letterSpacing: 11 * 0.12,
    textTransform: 'uppercase',
  },
  hero: {
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    paddingTop: 8,
  },
  heroOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatScroll: {
    flex: 1,
  },
  chatContent: {
    paddingHorizontal: 28,
    paddingTop: 14,
    paddingBottom: 8,
    gap: 14,
  },
  rowUser: {
    // Right-aligned user transcripts — `e2e/workout.spec.ts` asserts
    // `alignItems: flex-end` on the wrapper, so this stays.
    alignItems: 'flex-end',
    maxWidth: '100%',
  },
  rowCoach: {
    alignItems: 'flex-start',
    maxWidth: '100%',
  },
  spinnerSlot: {
    minHeight: 30,
    justifyContent: 'center',
    paddingVertical: 2,
  },
  dock: {
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 22,
    alignItems: 'center',
    gap: 10,
  },
  dockStatus: {
    fontFamily: font.sans,
    fontSize: 11,
    color: colors.inkFaint,
    letterSpacing: 11 * 0.15,
    textTransform: 'uppercase',
  },
  // --- Mic sheet (Phase 13.4) ---
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(42,37,32,0.35)',
    justifyContent: 'flex-end',
  },
  sheetKeyboard: {
    width: '100%',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing[6],
    paddingBottom: spacing[7],
    gap: spacing[3],
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceAlt,
    marginBottom: spacing[2],
  },
  sheetTitle: {
    fontFamily: font.sansMedium,
    fontSize: 14,
    color: colors.ink,
    letterSpacing: 0.2,
  },
  textInput: {
    backgroundColor: colors.surfaceAlt,
    color: colors.ink,
    borderRadius: radii.md,
    padding: 14,
    fontSize: 16,
    fontFamily: font.sans,
  },
  sendButton: {
    backgroundColor: colors.ink,
    borderRadius: radii.pill,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonText: {
    color: colors.bg,
    fontSize: 15,
    fontFamily: font.sansMedium,
    letterSpacing: 0.3,
  },
});
