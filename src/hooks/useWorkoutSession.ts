import { useCallback, useEffect, useRef, useState } from 'react';
import * as Crypto from 'expo-crypto';
import {
  WorkoutSessionState,
  INITIAL_STATE,
  reduce,
  SideEffect,
} from '../state/WorkoutState';
import { ITTSManager } from '../voice/TTSManager';
import { IVoiceManager } from '../voice/VoiceManager';
import { IApiClient, normalizeToolCall } from '../api/client';
import { IRepository } from '../db/repository';
import { VoiceContext, VoiceResponse } from '../api/types';
import { fallbackParse } from '../voice/FallbackParser';
import { ChatMessage, runChatExchange } from './chatLog';
import { filterValidTools } from './validTools';

export type { ChatMessage, ChatRole, ChatStatus } from './chatLog';

interface UseWorkoutSessionOptions {
  tts: ITTSManager;
  voice: IVoiceManager;
  api: IApiClient;
  repo: IRepository;
  exerciseId: string;
  // Optional sync trigger called fire-and-forget after SAVE_SESSION
  // lands. Wired in `app/workout.tsx`; tests omit it to keep the hook
  // independent from the singleton db/api modules.
  onSessionSaved?: () => void;
}

export function useWorkoutSession({
  tts,
  voice,
  api,
  repo,
  exerciseId,
  onSessionSaved,
}: UseWorkoutSessionOptions) {
  const [state, setState] = useState<WorkoutSessionState>(INITIAL_STATE);
  const [chatLog, setChatLog] = useState<ChatMessage[]>([]);
  const stateRef = useRef(state);
  stateRef.current = state;
  const sessionIdRef = useRef<string | null>(null);

  const processEffects = useCallback(
    async (effects: SideEffect[]) => {
      for (const effect of effects) {
        switch (effect.type) {
          case 'START_LISTENING':
            await voice.start();
            break;
          case 'STOP_LISTENING':
            await voice.stop();
            break;
          case 'SAVE_SET':
            if (sessionIdRef.current) {
              await repo.insertSet({
                id: Crypto.randomUUID(),
                sessionId: sessionIdRef.current,
                setNumber: effect.setNumber,
                reps: effect.reps,
                recordedAt: Temporal.Now.instant().toString(),
                restSeconds: null,
              });
            }
            break;
          case 'SAVE_SESSION':
            if (sessionIdRef.current) {
              const s = stateRef.current;
              await repo.updateSession(sessionIdRef.current, {
                endedAt: Temporal.Now.instant().toString(),
                totalReps: s.totalReps,
                setCount: s.setsCompleted.length,
                userFeedback: s.userFeedback,
              });
              // Fire-and-forget: don't await — the user is already
              // navigating home and we don't want to block on the
              // network round-trip. The sync service handles its own
              // errors and inflight coalescing.
              onSessionSaved?.();
            }
            break;
          case 'NAVIGATE_HOME':
            break;
        }
      }
    },
    [voice, repo, onSessionSaved],
  );

  const dispatch = useCallback(
    async (event: Parameters<typeof reduce>[1]) => {
      const current = stateRef.current;
      const result = reduce(current, event);
      setState(result.state);
      stateRef.current = result.state;
      await processEffects(result.effects);
    },
    [processEffects],
  );

  const handleTranscript = useCallback(
    async (transcript: string) => {
      const s = stateRef.current;

      // If TTS is mid-speech when a new utterance lands, cut it off so the
      // chat UI's bubble lifecycle doesn't lag behind audio.
      if (tts.isSpeaking()) {
        tts.cancel();
      }

      const voiceContext: VoiceContext = {
        appState: s.appState,
        currentSet: s.currentSetStartedAt
          ? { repsRecorded: s.currentSetReps, startedAt: s.currentSetStartedAt }
          : null,
        setsCompleted: s.setsCompleted,
        todayTarget: s.targetReps,
        yesterdayTotal: null,
        personalBest: null,
        streak: 0,
        sessionType: 'regular',
      };

      let response: VoiceResponse = await runChatExchange({
        api,
        transcript,
        context: voiceContext,
        appState: s.appState,
        targetReps: s.targetReps,
        setLog: setChatLog,
        newId: () => Crypto.randomUUID(),
      });

      // Filter out tool calls the LLM hallucinated for the current state.
      // Small models (e.g. llama3.2:3b) sometimes return complete_set from
      // between_sets, which corrupts state. If filtering leaves nothing —
      // or the LLM returned no tools at all — try the deterministic
      // fallback parser before giving up.
      const validCalls = filterValidTools(response.toolCalls, s.appState);
      if (validCalls.length === 0) {
        const fallback = fallbackParse(transcript, s.appState, s.targetReps);
        const fallbackValid = filterValidTools(fallback.toolCalls, s.appState);
        if (fallbackValid.length > 0) {
          validCalls.push(...fallbackValid);
          if (fallback.spokenResponse) {
            response = { ...response, spokenResponse: fallback.spokenResponse };
            // Keep the chat bubble in sync with what TTS will actually say.
            setChatLog((log) => {
              for (let i = log.length - 1; i >= 0; i--) {
                if (log[i].role === 'coach') {
                  return log.map((m, idx) =>
                    idx === i ? { ...m, text: fallback.spokenResponse, status: 'final' as const } : m,
                  );
                }
              }
              return log;
            });
          }
        }
      }

      // Execute tool calls through state machine. Normalize first — LLMs
      // sometimes return numeric tool args as strings.
      for (const toolCall of validCalls) {
        await dispatch({ type: 'TOOL_CALL', toolCall: normalizeToolCall(toolCall) });
      }

      // Speak only the final spokenResponse — partial tokens would clip
      // mid-word at Ollama's chunk size.
      if (response.spokenResponse) {
        await tts.speak(response.spokenResponse);
      }
    },
    [api, dispatch, tts],
  );

  const startSession = useCallback(async () => {
    const id = Crypto.randomUUID();
    sessionIdRef.current = id;

    const context = await repo.buildVoiceContext(exerciseId);

    setState((prev) => ({
      ...prev,
      sessionId: id,
      targetReps: context.todayTarget,
    }));

    await repo.insertSession({
      id,
      exerciseId,
      weeklyPlanId: null,
      sessionType: 'regular',
      targetReps: context.todayTarget,
      startedAt: Temporal.Now.instant().toString(),
      endedAt: null,
      totalReps: null,
      setCount: null,
      userFeedback: null,
    });

    const parts: string[] = [];
    if (context.yesterdayTotal !== null) {
      parts.push(`Yesterday you did ${context.yesterdayTotal} reps.`);
    }
    if (context.personalBest !== null) {
      parts.push(`Your personal best is ${context.personalBest}.`);
    }
    if (context.todayTarget !== null) {
      parts.push(`Today's target is ${context.todayTarget}.`);
    }
    if (context.streak > 1) {
      parts.push(`That's ${context.streak} days in a row.`);
    }
    parts.push('Say ready when you want to start.');

    const greeting = parts.join(' ');
    setChatLog((log) => [
      ...log,
      {
        id: Crypto.randomUUID(),
        role: 'coach',
        text: greeting,
        status: 'final',
      },
    ]);
    await tts.speak(greeting);
    await dispatch({ type: 'GREETING_DONE' });
  }, [repo, exerciseId, tts, dispatch]);

  // Wire the transcript handler. We deliberately do NOT call voice.destroy()
  // in cleanup: createVoiceManager binds its engine.onSpeechResults listener
  // once at construction, and removeListeners() inside destroy() can't be
  // re-bound from here. React Strict Mode (dev) would otherwise tear it
  // down on first-pass unmount and leave the engine deaf. The engine is a
  // closure with no native resources, so leaking the listener is fine.
  useEffect(() => {
    voice.onTranscript(handleTranscript);
  }, [voice, handleTranscript]);

  return {
    state,
    chatLog,
    startSession,
  };
}
