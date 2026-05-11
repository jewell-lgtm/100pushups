/**
 * Analytics smoke tests. We mock `posthog-react-native` so:
 *   - jest doesn't drag the RN runtime in (`testEnvironment: 'node'`),
 *   - we can assert on calls (`new PostHog(...)`, `client.capture(...)`).
 *
 * Reset the env + module registry between cases so each test gets a
 * fresh closure of `posthog.ts`.
 */
const captureMock = jest.fn();
const identifyMock = jest.fn();
const constructorMock = jest.fn();

jest.mock('posthog-react-native', () => {
  class MockPostHog {
    constructor(...args: unknown[]) {
      constructorMock(...args);
    }
    identify = identifyMock;
    capture = captureMock;
  }
  return { __esModule: true, default: MockPostHog };
});

function loadModule() {
  // Fresh import so the module-level `client`/`initialized` flags reset.
  jest.resetModules();
  // posthog.ts reads env at import time for the host fallback — no need
  // to reload that for the per-test behaviour, but the key read happens
  // there too. Reset both before each load.
  return require('../../src/analytics/posthog') as typeof import('../../src/analytics/posthog');
}

describe('analytics/posthog', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    captureMock.mockReset();
    identifyMock.mockReset();
    constructorMock.mockReset();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.EXPO_PUBLIC_POSTHOG_KEY;
    delete process.env.EXPO_PUBLIC_POSTHOG_HOST;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('track is a no-op when EXPO_PUBLIC_POSTHOG_KEY is unset', () => {
    const mod = loadModule();
    mod.initAnalytics('device-123');
    mod.track(mod.EVENT_WORKOUT_STARTED, { todayTarget: 30, hasPlan: true });
    expect(constructorMock).not.toHaveBeenCalled();
    expect(captureMock).not.toHaveBeenCalled();
  });

  it('initAnalytics constructs the SDK once even when called repeatedly', () => {
    process.env.EXPO_PUBLIC_POSTHOG_KEY = 'phc_test';
    const mod = loadModule();
    mod.initAnalytics('device-abc');
    mod.initAnalytics('device-abc');
    mod.initAnalytics('device-different'); // still ignored — already inited
    expect(constructorMock).toHaveBeenCalledTimes(1);
    // First arg is the project key; second arg is the options bag.
    expect(constructorMock.mock.calls[0][0]).toBe('phc_test');
    expect(constructorMock.mock.calls[0][1]).toMatchObject({
      bootstrap: { distinctId: 'device-abc' },
    });
    // identify also stamped exactly once on init.
    expect(identifyMock).toHaveBeenCalledTimes(1);
    expect(identifyMock).toHaveBeenCalledWith('device-abc');
  });

  it('track forwards event + props to the underlying client', () => {
    process.env.EXPO_PUBLIC_POSTHOG_KEY = 'phc_test';
    const mod = loadModule();
    mod.initAnalytics('device-xyz');
    mod.track(mod.EVENT_SET_COMPLETED, { setIndex: 1, reps: 25, targetReps: 30 });
    expect(captureMock).toHaveBeenCalledWith(mod.EVENT_SET_COMPLETED, {
      setIndex: 1,
      reps: 25,
      targetReps: 30,
    });
  });

  it('defaults to PostHog Cloud EU host when EXPO_PUBLIC_POSTHOG_HOST is unset', () => {
    process.env.EXPO_PUBLIC_POSTHOG_KEY = 'phc_test';
    const mod = loadModule();
    mod.initAnalytics('device-xyz');
    expect(constructorMock.mock.calls[0][1]).toMatchObject({
      host: 'https://eu.i.posthog.com',
    });
  });

  it('honours EXPO_PUBLIC_POSTHOG_HOST when set (self-hosted)', () => {
    process.env.EXPO_PUBLIC_POSTHOG_KEY = 'phc_test';
    process.env.EXPO_PUBLIC_POSTHOG_HOST = 'https://posthog.example/';
    const mod = loadModule();
    mod.initAnalytics('device-xyz');
    expect(constructorMock.mock.calls[0][1]).toMatchObject({
      host: 'https://posthog.example/',
    });
  });

  it('track does not throw even if the underlying capture throws', () => {
    process.env.EXPO_PUBLIC_POSTHOG_KEY = 'phc_test';
    captureMock.mockImplementationOnce(() => {
      throw new Error('network down');
    });
    const mod = loadModule();
    mod.initAnalytics('device-xyz');
    expect(() => mod.track(mod.EVENT_SYNC_FAILED, { pendingCount: 1, errorClass: 'TypeError' })).not.toThrow();
  });
});
