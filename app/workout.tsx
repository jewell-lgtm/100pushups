import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { getDatabase } from '../src/db/getDatabase';
import { createRepository } from '../src/db/repository';
import { createTTSManager } from '../src/voice/TTSManager';
import { createVoiceManager, VoiceEngine } from '../src/voice/VoiceManager';
import { createApiClient } from '../src/api/client';
import { useWorkoutSession } from '../src/hooks/useWorkoutSession';

const API_BASE = __DEV__ ? 'http://localhost:3000' : 'http://pushups.wire.mattjewell.co.uk';

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
  const apiRef = useRef<ReturnType<typeof createApiClient> | null>(null);
  if (!apiRef.current) apiRef.current = createApiClient(API_BASE);
  const dbRef = useRef<any>(null);
  const repoRef = useRef<any>(null);

  const { state, startSession } = useWorkoutSession({
    tts: ttsRef.current!,
    voice: voiceRef.current!,
    api: apiRef.current!,
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
      const db = await getDatabase();
      dbRef.current = db;
      repoRef.current = createRepository(db as any);
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

  const sendText = useCallback(() => {
    if (!textInput.trim()) return;
    engineRef.current?.simulateResults([textInput.trim()]);
    setTextInput('');
  }, [textInput]);

  const stateLabel = {
    idle: 'Starting...',
    awaiting_start: 'Say "ready" to start',
    mid_set: `Set ${state.currentSetNumber} — ${state.currentSetReps} reps`,
    between_sets: 'Rest — another set?',
    post_workout: 'How did that feel?',
  }[state.appState];

  return (
    <View style={styles.container}>
      <View style={styles.stateIndicator}>
        <Text style={styles.stateText}>{stateLabel}</Text>
      </View>

      {state.targetReps !== null && state.appState === 'mid_set' && (
        <Text style={styles.targetText}>
          Target: {state.targetReps}
        </Text>
      )}

      <Text style={styles.totalText}>
        {state.totalReps} total reps
      </Text>

      {state.setsCompleted.length > 0 && (
        <View style={styles.setsContainer}>
          {state.setsCompleted.map((s) => (
            <Text key={s.setNumber} style={styles.setText}>
              Set {s.setNumber}: {s.reps}
            </Text>
          ))}
        </View>
      )}

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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  stateIndicator: {
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 32,
    marginBottom: 32,
  },
  stateText: {
    color: '#e94560',
    fontSize: 18,
    fontWeight: '600',
  },
  targetText: {
    color: '#a0a0b0',
    fontSize: 16,
    marginBottom: 16,
  },
  totalText: {
    color: '#fff',
    fontSize: 48,
    fontWeight: 'bold',
    marginBottom: 24,
  },
  setsContainer: {
    gap: 8,
    marginBottom: 24,
  },
  setText: {
    color: '#a0a0b0',
    fontSize: 16,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
    position: 'absolute',
    bottom: 40,
    left: 24,
    right: 24,
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
