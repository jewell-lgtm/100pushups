import { ChatMessage, runChatExchange } from '../../src/hooks/chatLog';
import { IApiClient, StreamFrame } from '../../src/api/client';
import { VoiceContext, VoiceRequest } from '../../src/api/types';

const ctx: VoiceContext = {
  appState: 'awaiting_start',
  currentSet: null,
  setsCompleted: [],
  todayTarget: null,
  yesterdayTotal: null,
  personalBest: null,
  streak: 0,
  sessionType: 'regular',
};

function makeIdGen() {
  let n = 0;
  return () => `id-${++n}`;
}

function makeLogStore() {
  let log: ChatMessage[] = [];
  const snapshots: ChatMessage[][] = [];
  const setLog = (updater: (cur: ChatMessage[]) => ChatMessage[]) => {
    log = updater(log);
    snapshots.push(log.map((m) => ({ ...m })));
  };
  return {
    setLog,
    get current() {
      return log;
    },
    snapshots,
  };
}

// Build an async generator from canned StreamFrame yields.
function genFrom(frames: StreamFrame[]): () => AsyncGenerator<StreamFrame, void, void> {
  return async function* () {
    for (const f of frames) yield f;
  };
}

describe('runChatExchange', () => {
  it('streams three tokens and finalizes the coach bubble', async () => {
    const fakeApi: IApiClient = {
      voiceRespond: jest.fn(),
      isReachable: jest.fn().mockResolvedValue(true),
      voiceRespondStream: genFrom([
        { type: 'token', text: 'Go' },
        { type: 'token', text: '!' },
        { type: 'token', text: ' Set' },
        { type: 'done', toolCalls: [{ name: 'start_set', params: {} }], spokenResponse: 'Go! Set' },
      ]) as IApiClient['voiceRespondStream'],
    };

    const store = makeLogStore();
    const response = await runChatExchange({
      api: fakeApi,
      transcript: 'ready',
      context: ctx,
      appState: 'awaiting_start',
      targetReps: null,
      setLog: store.setLog,
      newId: makeIdGen(),
    });

    expect(store.snapshots.length).toBe(5);
    const [pushed, s1, s2, s3, finalSnap] = store.snapshots;

    expect(pushed.map((m) => [m.role, m.status, m.text])).toEqual([
      ['user', 'final', 'ready'],
      ['coach', 'pending', ''],
    ]);

    expect(s1[1].text).toBe('Go');
    expect(s1[1].status).toBe('streaming');
    expect(s2[1].text).toBe('Go!');
    expect(s3[1].text).toBe('Go! Set');
    expect(finalSnap[1].text).toBe('Go! Set');
    expect(finalSnap[1].status).toBe('final');

    expect(response.toolCalls).toEqual([{ name: 'start_set', params: {} }]);
  });

  it('uses spokenResponse when no tokens streamed (backend fallback path)', async () => {
    const fakeApi: IApiClient = {
      voiceRespond: jest.fn(),
      isReachable: jest.fn().mockResolvedValue(true),
      voiceRespondStream: genFrom([
        { type: 'done', toolCalls: [], spokenResponse: 'Say ready when you want to start.' },
      ]) as IApiClient['voiceRespondStream'],
    };

    const store = makeLogStore();
    await runChatExchange({
      api: fakeApi,
      transcript: 'foo',
      context: ctx,
      appState: 'awaiting_start',
      targetReps: null,
      setLog: store.setLog,
      newId: makeIdGen(),
    });

    const last = store.snapshots[store.snapshots.length - 1];
    expect(last[1].text).toBe('Say ready when you want to start.');
    expect(last[1].status).toBe('final');
  });

  it('falls back to deterministic parser on stream error', async () => {
    const fakeApi: IApiClient = {
      voiceRespond: jest.fn(),
      isReachable: jest.fn().mockResolvedValue(true),
      // eslint-disable-next-line require-yield
      voiceRespondStream: (async function* () {
        throw new Error('network');
      }) as IApiClient['voiceRespondStream'],
    };

    const store = makeLogStore();
    const response = await runChatExchange({
      api: fakeApi,
      transcript: 'ready',
      context: ctx,
      appState: 'awaiting_start',
      targetReps: null,
      setLog: store.setLog,
      newId: makeIdGen(),
    });

    expect(response.toolCalls).toEqual([{ name: 'start_set', params: {} }]);
    const last = store.snapshots[store.snapshots.length - 1];
    expect(last[1].text).toBe('Go!');
    expect(last[1].status).toBe('final');
  });

  it('falls back when generator finishes without a done frame', async () => {
    const fakeApi: IApiClient = {
      voiceRespond: jest.fn(),
      isReachable: jest.fn().mockResolvedValue(true),
      voiceRespondStream: genFrom([
        { type: 'token', text: 'partial' },
      ]) as IApiClient['voiceRespondStream'],
    };

    const store = makeLogStore();
    const response = await runChatExchange({
      api: fakeApi,
      transcript: 'ready',
      context: ctx,
      appState: 'awaiting_start',
      targetReps: null,
      setLog: store.setLog,
      newId: makeIdGen(),
    });

    // Stream had a token but no done — fall back to deterministic parser.
    // Coach bubble keeps the streamed 'partial' text since sawToken=true.
    expect(response.toolCalls).toEqual([{ name: 'start_set', params: {} }]);
    const last = store.snapshots[store.snapshots.length - 1];
    expect(last[1].text).toBe('partial');
    expect(last[1].status).toBe('final');
  });

  it('finalizes a prior in-flight coach bubble before pushing the new pair', async () => {
    const fakeApi: IApiClient = {
      voiceRespond: jest.fn(),
      isReachable: jest.fn().mockResolvedValue(true),
      voiceRespondStream: genFrom([
        { type: 'token', text: 'hi' },
        { type: 'done', toolCalls: [], spokenResponse: 'hi' },
      ]) as IApiClient['voiceRespondStream'],
    };

    let log: ChatMessage[] = [
      { id: 'old', role: 'coach', text: 'partial', status: 'streaming' },
    ];
    const setLog = (updater: (cur: ChatMessage[]) => ChatMessage[]) => {
      log = updater(log);
    };

    await runChatExchange({
      api: fakeApi,
      transcript: 'ready',
      context: ctx,
      appState: 'awaiting_start',
      targetReps: null,
      setLog,
      newId: makeIdGen(),
    });

    expect(log[0]).toEqual({
      id: 'old',
      role: 'coach',
      text: 'partial',
      status: 'final',
    });
  });
});
