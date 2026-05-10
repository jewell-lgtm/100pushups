import { AppState, VoiceResponse } from '../api/types';

const WORD_TO_NUMBER: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90, hundred: 100,
};

const START_WORDS = ['ready', 'go', 'start', 'begin', 'lets go', "let's go"] as const;
const DONE_WORDS = ['done', 'finished', 'stop', 'complete'] as const;
const YES_WORDS = ['yes', 'yeah', 'yep', 'sure', 'another', 'again', 'one more'] as const;
const NO_WORDS = ['no', 'nope', 'nah', 'enough', 'im done', "i'm done"] as const;

export function parseTranscriptWords(text: string): number | null {
  const normalized = text.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();

  // Try digit match first
  const digitMatch = normalized.match(/\d+/);
  if (digitMatch) return parseInt(digitMatch[0], 10);

  // Try word-to-number
  const words = normalized.split(/\s+/);
  let total = 0;
  let found = false;
  for (const word of words) {
    if (WORD_TO_NUMBER[word] !== undefined) {
      const val = WORD_TO_NUMBER[word];
      if (val === 100) {
        total = (total || 1) * 100;
      } else if (val >= 20) {
        total += val;
      } else {
        total += val;
      }
      found = true;
    }
  }
  return found ? total : null;
}

function matchesAny(text: string, keywords: readonly string[]): boolean {
  const normalized = text.toLowerCase().replace(/[^a-z0-9' ]/g, '').trim();
  return keywords.some((kw) => normalized.includes(kw));
}

export function fallbackParse(
  transcript: string,
  appState: AppState,
  targetReps: number | null,
): VoiceResponse {
  const text = transcript.toLowerCase().trim();
  const number = parseTranscriptWords(text);

  switch (appState) {
    case 'awaiting_start': {
      if (matchesAny(text, START_WORDS)) {
        return {
          toolCalls: [{ name: 'start_set', params: {} }],
          spokenResponse: 'Go!',
        };
      }
      return { toolCalls: [], spokenResponse: 'Say ready when you want to start.' };
    }

    case 'mid_set': {
      const isDone = matchesAny(text, DONE_WORDS);
      if (isDone && number !== null) {
        return {
          toolCalls: [{ name: 'complete_set', params: { reps: number } }],
          spokenResponse: `${number} reps, nice.`,
        };
      }
      if (isDone) {
        return {
          toolCalls: [{ name: 'complete_set', params: { reps: 0 } }],
          spokenResponse: 'Got it. How many reps?',
        };
      }
      if (number !== null) {
        const remaining = targetReps ? targetReps - number : null;
        const response = remaining && remaining > 0
          ? `Only ${remaining} to go!`
          : number > 0
            ? `${number}, keep going!`
            : '';
        return {
          toolCalls: [{ name: 'record_reps', params: { count: number } }],
          spokenResponse: response,
        };
      }
      return { toolCalls: [], spokenResponse: 'Keep pushing!' };
    }

    case 'between_sets': {
      if (matchesAny(text, YES_WORDS)) {
        return {
          toolCalls: [{ name: 'start_set', params: {} }],
          spokenResponse: 'Go!',
        };
      }
      if (matchesAny(text, NO_WORDS)) {
        return {
          toolCalls: [{ name: 'end_session', params: {} }],
          spokenResponse: 'Good session. How did that feel?',
        };
      }
      return { toolCalls: [], spokenResponse: 'Another set? Say yes or no.' };
    }

    case 'post_workout': {
      if (text.length > 0) {
        return {
          toolCalls: [{ name: 'record_feedback', params: { feedback: text } }],
          spokenResponse: 'Got it. Nice work today.',
        };
      }
      return { toolCalls: [], spokenResponse: 'How did that feel?' };
    }

    default:
      return { toolCalls: [], spokenResponse: '' };
  }
}
