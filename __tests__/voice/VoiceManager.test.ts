import { createVoiceManager, VoiceEngine } from '../../src/voice/VoiceManager';

function createMockEngine(): VoiceEngine & {
  simulateResults(results: string[]): void;
  simulateError(error: string): void;
} {
  let resultsCallback: ((results: string[]) => void) | null = null;
  let errorCallback: ((error: string) => void) | null = null;

  return {
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    destroy: jest.fn().mockResolvedValue(undefined),
    removeListeners: jest.fn(),

    onSpeechResults(cb) { resultsCallback = cb; },
    onSpeechError(cb) { errorCallback = cb; },

    simulateResults(results: string[]) { resultsCallback?.(results); },
    simulateError(error: string) { errorCallback?.(error); },
  };
}

describe('VoiceManager', () => {
  it('starts and stops listening via the engine', async () => {
    const engine = createMockEngine();
    const vm = createVoiceManager(engine);

    await vm.start();
    expect(vm.isListening()).toBe(true);
    expect(engine.start).toHaveBeenCalledWith('en-US');

    await vm.stop();
    expect(vm.isListening()).toBe(false);
    expect(engine.stop).toHaveBeenCalled();
  });

  it('forwards speech results to transcript callback', async () => {
    const engine = createMockEngine();
    const vm = createVoiceManager(engine);

    const received: string[] = [];
    vm.onTranscript((text) => received.push(text));

    await vm.start();
    engine.simulateResults(['twenty five']);

    expect(received).toEqual(['twenty five']);
  });

  it('handles errors and resets listening state', async () => {
    const engine = createMockEngine();
    const vm = createVoiceManager(engine);

    const errors: string[] = [];
    vm.onError((err) => errors.push(err));

    await vm.start();
    engine.simulateError('network error');

    expect(vm.isListening()).toBe(false);
    expect(errors).toEqual(['network error']);
  });

  it('ignores start if already listening', async () => {
    const engine = createMockEngine();
    const vm = createVoiceManager(engine);

    await vm.start();
    await vm.start();
    expect(engine.start).toHaveBeenCalledTimes(1);
  });

  it('destroy cleans up engine', () => {
    const engine = createMockEngine();
    const vm = createVoiceManager(engine);

    vm.destroy();
    expect(engine.removeListeners).toHaveBeenCalled();
    expect(engine.destroy).toHaveBeenCalled();
    expect(vm.isListening()).toBe(false);
  });
});
