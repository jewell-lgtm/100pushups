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
import { IApiClient } from '../api/client';
import { IRepository } from '../db/repository';
import { VoiceContext, VoiceResponse } from '../api/types';
import { fallbackParse } from '../voice/FallbackParser';

interface UseWorkoutSessionOptions {
  tts: ITTSManager;
  voice: IVoiceManager;
  api: IApiClient;
  repo: IRepository;
  exerciseId: string;
}

export function useWorkoutSession({
  tts,
  voice,
  api,
  repo,
  exerciseId,
}: UseWorkoutSessionOptions) {
  const [state, setState] = useState<WorkoutSessionState>(INITIAL_STATE);
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
            }
            break;
          case 'NAVIGATE_HOME':
            // Caller handles this via state.appState check
            break;
        }
      }
    },
    [voice, repo],
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

      const voiceContext: VoiceContext = {
        appState: s.appState,
        currentSet: s.currentSetStartedAt
          ? { repsRecorded: s.currentSetReps, startedAt: s.currentSetStartedAt }
          : null,
        setsCompleted: s.setsCompleted,
        todayTarget: s.targetReps,
        yesterdayTotal: null, // filled by repo on session start
        personalBest: null,
        streak: 0,
        sessionType: 'regular',
      };

      let response: VoiceResponse;
      try {
        response = await api.voiceRespond({
          transcript,
          context: voiceContext,
        });
      } catch {
        response = fallbackParse(transcript, s.appState, s.targetReps);
      }

      // Execute tool calls through state machine
      for (const toolCall of response.toolCalls) {
        await dispatch({ type: 'TOOL_CALL', toolCall });
      }

      // Speak the response
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

    // Build greeting
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
    await tts.speak(greeting);
    await dispatch({ type: 'GREETING_DONE' });
  }, [repo, exerciseId, tts, dispatch]);

  // Wire up voice transcript handler
  useEffect(() => {
    voice.onTranscript(handleTranscript);
    return () => {
      voice.destroy();
    };
  }, [voice, handleTranscript]);

  return {
    state,
    startSession,
  };
}
