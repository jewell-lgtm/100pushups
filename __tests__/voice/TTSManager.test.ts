jest.mock('expo-speech', () => ({
  speak: jest.fn((_text: string, options: { onDone?: () => void; onError?: () => void }) => {
    // Immediately call onDone to simulate instant TTS
    Promise.resolve().then(() => options.onDone?.());
  }),
  stop: jest.fn(),
}));

import { createTTSManager } from '../../src/voice/TTSManager';
import * as Speech from 'expo-speech';

describe('TTSManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('speaks text via expo-speech', async () => {
    const tts = createTTSManager();
    await tts.speak('hello');
    expect(Speech.speak).toHaveBeenCalledWith('hello', expect.objectContaining({
      language: 'en-US',
    }));
  });

  it('high priority calls stop and speaks immediately', async () => {
    const tts = createTTSManager();
    await tts.speak('urgent', 'high');
    expect(Speech.stop).toHaveBeenCalled();
    expect(Speech.speak).toHaveBeenCalledWith('urgent', expect.anything());
  });

  it('reports speaking state', () => {
    const tts = createTTSManager();
    expect(tts.isSpeaking()).toBe(false);
  });

  it('stop() clears everything', () => {
    const tts = createTTSManager();
    tts.stop();
    expect(Speech.stop).toHaveBeenCalled();
    expect(tts.isSpeaking()).toBe(false);
  });
});
