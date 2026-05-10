import { IApiClient } from '../api/client';
import { VoiceContext, VoiceResponse } from '../api/types';
import { fallbackParse } from '../voice/FallbackParser';
import { AppState } from '../api/types';

export type ChatRole = 'user' | 'coach';
export type ChatStatus = 'pending' | 'streaming' | 'final';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  status: ChatStatus;
}

export type SetLog = (updater: (log: ChatMessage[]) => ChatMessage[]) => void;

interface RunExchangeArgs {
  api: IApiClient;
  transcript: string;
  context: VoiceContext;
  appState: AppState;
  targetReps: number | null;
  setLog: SetLog;
  newId: () => string;
}

// Runs one user→coach exchange against the streaming generator API,
// mutating chatLog via setLog. Pure orchestration: no TTS, no state
// machine, no React. Returns the final VoiceResponse so the caller can
// dispatch tools + speak. On stream error or missing done frame, falls
// back to deterministic parsing.
export async function runChatExchange({
  api,
  transcript,
  context,
  appState,
  targetReps,
  setLog,
  newId,
}: RunExchangeArgs): Promise<VoiceResponse> {
  const userMsg: ChatMessage = {
    id: newId(),
    role: 'user',
    text: transcript,
    status: 'final',
  };
  const coachId = newId();
  const coachMsg: ChatMessage = {
    id: coachId,
    role: 'coach',
    text: '',
    status: 'pending',
  };

  // Finalize any prior in-flight coach bubble before pushing the new pair.
  setLog((log) => {
    const finalized = log.map((m) =>
      m.role === 'coach' && m.status !== 'final'
        ? { ...m, status: 'final' as const }
        : m,
    );
    return [...finalized, userMsg, coachMsg];
  });

  let sawToken = false;
  let response: VoiceResponse | null = null;
  try {
    for await (const frame of api.voiceRespondStream({ transcript, context })) {
      if (frame.type === 'token') {
        sawToken = true;
        setLog((log) =>
          log.map((m) =>
            m.id === coachId
              ? { ...m, text: m.text + frame.text, status: 'streaming' }
              : m,
          ),
        );
      } else {
        response = { toolCalls: frame.toolCalls, spokenResponse: frame.spokenResponse };
      }
    }
  } catch {
    response = null;
  }

  if (!response) {
    response = fallbackParse(transcript, appState, targetReps);
  }

  // Settle the coach bubble: keep streamed text if any, else use the final
  // spokenResponse from the done frame (or the fallback).
  const settled = response;
  setLog((log) =>
    log.map((m) => {
      if (m.id !== coachId) return m;
      const finalText = sawToken ? m.text : settled.spokenResponse;
      return { ...m, text: finalText, status: 'final' };
    }),
  );

  return response;
}
