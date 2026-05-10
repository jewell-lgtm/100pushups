import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
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
import type { ChatMessage } from '../src/hooks/chatLog';

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

export default function WorkoutScreen() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [textInput, setTextInput] = useState('');
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
    isReachable: async () => false,
  };

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

  useEffect(() => {
    if (state.appState === 'idle' && state.userFeedback !== null) {
      router.back();
    }
  }, [state.appState, state.userFeedback]);

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

  const sendText = useCallback(() => {
    if (!textInput.trim()) return;
    engineRef.current?.simulateResults([textInput.trim()]);
    setTextInput('');
  }, [textInput]);

  const stateLabel = {
    idle: 'Starting...',
    awaiting_start: 'Awaiting start',
    mid_set: `Set ${state.currentSetNumber} — ${state.currentSetReps} reps`,
    between_sets: 'Resting',
    post_workout: 'Wrapping up',
  }[state.appState];

  return (
    <View style={styles.container}>
      <View style={styles.topBar} testID="state-indicator">
        <Text style={styles.stateText}>{stateLabel}</Text>
        <View style={styles.topMeta}>
          {state.targetReps !== null && (
            <Text style={styles.metaText}>Target {state.targetReps}</Text>
          )}
          <Text style={styles.metaText}>
            {state.totalReps} reps · {state.setsCompleted.length} sets
          </Text>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.chatScroll}
        contentContainerStyle={styles.chatContent}
        keyboardShouldPersistTaps="handled"
      >
        {chatLog.map((m) => (
          <ChatBubble key={m.id} message={m} />
        ))}
      </ScrollView>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.textInput}
          value={textInput}
          onChangeText={setTextInput}
          onSubmitEditing={sendText}
          placeholder={state.appState === 'awaiting_start' ? 'Type "ready"...' : 'Type command...'}
          placeholderTextColor="#666"
          autoFocus
        />
        <TouchableOpacity style={styles.sendButton} onPress={sendText}>
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const wrapStyle = isUser ? styles.bubbleWrapUser : styles.bubbleWrapCoach;
  const bubbleStyle = isUser ? styles.bubbleUser : styles.bubbleCoach;
  const textStyle = isUser ? styles.bubbleTextUser : styles.bubbleTextCoach;

  return (
    <View style={wrapStyle} testID={`bubble-${message.role}`}>
      <View style={bubbleStyle}>
        {message.status === 'pending' ? (
          <ActivityIndicator color="#e94560" testID="bubble-spinner" />
        ) : (
          <Text style={textStyle}>
            {message.text}
            {message.status === 'streaming' && (
              <Text style={styles.caret}>▍</Text>
            )}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
    paddingTop: 24,
  },
  topBar: {
    paddingHorizontal: 24,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a2e',
  },
  stateText: {
    color: '#e94560',
    fontSize: 16,
    fontWeight: '600',
  },
  topMeta: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 4,
  },
  metaText: {
    color: '#a0a0b0',
    fontSize: 13,
  },
  chatScroll: {
    flex: 1,
  },
  chatContent: {
    padding: 16,
    paddingBottom: 96, // leave room above the pinned input
    gap: 8,
  },
  bubbleWrapUser: {
    alignItems: 'flex-end',
    maxWidth: '100%',
  },
  bubbleWrapCoach: {
    alignItems: 'flex-start',
    maxWidth: '100%',
  },
  bubbleUser: {
    backgroundColor: '#2a2a3e',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    maxWidth: '80%',
  },
  bubbleCoach: {
    backgroundColor: '#1a1a2e',
    borderColor: '#e94560',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    maxWidth: '80%',
    minWidth: 44, // give the spinner some room
  },
  bubbleTextUser: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 20,
  },
  bubbleTextCoach: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 20,
  },
  caret: {
    color: '#e94560',
    fontSize: 15,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    color: '#fff',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
  },
  sendButton: {
    backgroundColor: '#e94560',
    borderRadius: 12,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
