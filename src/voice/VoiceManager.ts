export interface IVoiceManager {
  start(): Promise<void>;
  stop(): Promise<void>;
  isListening(): boolean;
  onTranscript(callback: (text: string) => void): void;
  onError(callback: (error: string) => void): void;
  destroy(): void;
}

// Platform implementation — wraps @react-native-voice/voice or expo-speech-recognition
// Injected at runtime so the module is testable without native deps
export type VoiceEngine = {
  start(locale: string): Promise<void>;
  stop(): Promise<void>;
  destroy(): Promise<void>;
  onSpeechResults(callback: (results: string[]) => void): void;
  onSpeechError(callback: (error: string) => void): void;
  removeListeners(): void;
};

export function createVoiceManager(engine: VoiceEngine): IVoiceManager {
  let listening = false;
  let transcriptCallback: ((text: string) => void) | null = null;
  let errorCallback: ((error: string) => void) | null = null;

  engine.onSpeechResults((results) => {
    const text = results[0]?.trim();
    if (text && transcriptCallback) {
      transcriptCallback(text);
    }
  });

  engine.onSpeechError((error) => {
    listening = false;
    errorCallback?.(error);
  });

  return {
    async start() {
      if (listening) return;
      listening = true;
      await engine.start('en-US');
    },

    async stop() {
      if (!listening) return;
      listening = false;
      await engine.stop();
    },

    isListening() {
      return listening;
    },

    onTranscript(callback) {
      transcriptCallback = callback;
    },

    onError(callback) {
      errorCallback = callback;
    },

    destroy() {
      listening = false;
      transcriptCallback = null;
      errorCallback = null;
      engine.removeListeners();
      engine.destroy();
    },
  };
}
