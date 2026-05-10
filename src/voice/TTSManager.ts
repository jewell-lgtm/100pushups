import * as Speech from 'expo-speech';

type Priority = 'high' | 'normal';

interface QueueItem {
  text: string;
  priority: Priority;
  resolve: () => void;
}

export interface ITTSManager {
  speak(text: string, priority?: Priority): Promise<void>;
  stop(): void;
  /** Cancel any in-flight utterance; alias of stop() with intent. */
  cancel(): void;
  isSpeaking(): boolean;
}

export function createTTSManager(): ITTSManager {
  const queue: QueueItem[] = [];
  let speaking = false;

  async function processQueue() {
    if (speaking || queue.length === 0) return;

    const item = queue.shift()!;
    speaking = true;

    return new Promise<void>((resolve) => {
      Speech.speak(item.text, {
        language: 'en-US',
        rate: 1.0,
        onDone: () => {
          speaking = false;
          item.resolve();
          resolve();
          processQueue();
        },
        onError: () => {
          speaking = false;
          item.resolve();
          resolve();
          processQueue();
        },
      });
    });
  }

  return {
    speak(text: string, priority: Priority = 'normal'): Promise<void> {
      return new Promise((resolve) => {
        if (priority === 'high') {
          Speech.stop();
          speaking = false;
          queue.length = 0;
          queue.unshift({ text, priority, resolve });
        } else {
          queue.push({ text, priority, resolve });
        }
        processQueue();
      });
    },

    stop() {
      Speech.stop();
      speaking = false;
      queue.length = 0;
    },

    cancel() {
      Speech.stop();
      speaking = false;
      queue.length = 0;
    },

    isSpeaking() {
      return speaking;
    },
  };
}
