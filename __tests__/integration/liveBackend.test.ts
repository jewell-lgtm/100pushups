import { reduce, INITIAL_STATE, WorkoutSessionState } from '../../src/state/WorkoutState';
import { fallbackParse } from '../../src/voice/FallbackParser';
import { createApiClient, normalizeToolCall } from '../../src/api/client';
import { ToolCall, VoiceContext, VoiceResponse } from '../../src/api/types';

// Live tests are gated on TEST_API_BASE — when unset, the whole suite
// skips cleanly so `pnpm test` is green without a running backend.
const API_BASE = process.env.TEST_API_BASE;
const REGISTER_KEY = process.env.TEST_REGISTER_KEY;
const liveDescribe = API_BASE ? describe : describe.skip;
let AUTH_HEADER: string | undefined;

const api = () => createApiClient(API_BASE!, { authHeader: AUTH_HEADER });

function buildContext(state: WorkoutSessionState): VoiceContext {
  return {
    appState: state.appState,
    currentSet: state.currentSetStartedAt
      ? { repsRecorded: state.currentSetReps, startedAt: state.currentSetStartedAt }
      : null,
    setsCompleted: state.setsCompleted,
    todayTarget: state.targetReps,
    yesterdayTotal: null,
    personalBest: null,
    streak: 0,
    sessionType: 'regular',
  };
}

async function liveRespond(state: WorkoutSessionState, transcript: string): Promise<VoiceResponse> {
  return api().voiceRespond({ transcript, context: buildContext(state) });
}

liveDescribe('Live backend voice harness', () => {
  beforeAll(async () => {
    // If the backend has bearer auth enabled, register first to get a token.
    // Without TEST_REGISTER_KEY we assume the backend is auth-disabled
    // (e.g. an older deployed pod) and proceed without a header.
    if (REGISTER_KEY) {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registerKey: REGISTER_KEY }),
      });
      if (!res.ok) throw new Error(`register failed: ${res.status}`);
      const data = (await res.json()) as { token: string };
      AUTH_HEADER = `Bearer ${data.token}`;
    }
    expect(await api().isReachable()).toBe(true);
  });

  describe('functional contract — state machine driven by fallback parser', () => {
    it('runs a full two-set workout end-to-end', () => {
      // This is the deterministic harness: the same transcripts a user would speak,
      // routed through the fallback parser (which the app uses when LLM fails).
      // It proves the app's voice → state-machine contract.
      let state: WorkoutSessionState = {
        ...INITIAL_STATE,
        targetReps: 30,
        appState: 'awaiting_start',
      };

      const step = (transcript: string) => {
        const parsed = fallbackParse(transcript, state.appState, state.targetReps);
        for (const tc of parsed.toolCalls) {
          state = reduce(state, { type: 'TOOL_CALL', toolCall: normalizeToolCall(tc) }).state;
        }
      };

      step('ready');
      expect(state.appState).toBe('mid_set');
      expect(state.currentSetNumber).toBe(1);

      step('ten');
      expect(state.currentSetReps).toBe(10);

      step('twenty');
      expect(state.currentSetReps).toBe(20);

      step('done 25');
      expect(state.appState).toBe('between_sets');
      expect(state.totalReps).toBe(25);

      step('yeah another');
      expect(state.appState).toBe('mid_set');
      expect(state.currentSetNumber).toBe(2);

      step('done 15');
      expect(state.appState).toBe('between_sets');
      expect(state.totalReps).toBe(40);

      step('no more');
      expect(state.appState).toBe('post_workout');

      step('felt tough but good');
      expect(state.userFeedback).toBe('felt tough but good');
    });
  });

  describe('live LLM diagnostic — what the deployed model actually returns', () => {
    interface Probe {
      transcript: string;
      appState: WorkoutSessionState['appState'];
      expected: ToolCall['name'] | 'no_tool';
      // Optional param check
      paramCheck?: (params: Record<string, unknown>) => boolean;
    }

    const probes: Probe[] = [
      { transcript: 'ready', appState: 'awaiting_start', expected: 'start_set' },
      { transcript: 'go', appState: 'awaiting_start', expected: 'start_set' },
      {
        transcript: 'ten',
        appState: 'mid_set',
        expected: 'record_reps',
        paramCheck: (p) => Number(p.count) === 10,
      },
      {
        transcript: 'twenty five',
        appState: 'mid_set',
        expected: 'record_reps',
        paramCheck: (p) => Number(p.count) === 25,
      },
      {
        transcript: 'done 25',
        appState: 'mid_set',
        expected: 'complete_set',
        paramCheck: (p) => Number(p.reps) === 25,
      },
      {
        transcript: 'done with 25',
        appState: 'mid_set',
        expected: 'complete_set',
        paramCheck: (p) => Number(p.reps) === 25,
      },
      { transcript: 'yes another', appState: 'between_sets', expected: 'start_set' },
      { transcript: 'no more', appState: 'between_sets', expected: 'end_session' },
      {
        transcript: 'felt tough but good',
        appState: 'post_workout',
        expected: 'record_feedback',
      },
    ];

    const results: Array<{ probe: Probe; response: VoiceResponse; ok: boolean; reason: string }> = [];

    afterAll(() => {
      // eslint-disable-next-line no-console
      console.log(
        '\nLive LLM probe results (model: llama3.2:3b via deployed backend):\n' +
          results
            .map((r, i) => {
              const tools = r.response.toolCalls
                .map((t) => `${t.name}(${JSON.stringify(t.params)})`)
                .join(', ') || '(no tools)';
              const status = r.ok ? 'OK ' : 'FAIL';
              return `  ${i + 1}. [${status}] state=${r.probe.appState} "${r.probe.transcript}"\n` +
                `       expected: ${r.probe.expected}\n` +
                `       got:      ${tools}\n` +
                `       said:     ${r.response.spokenResponse || '(empty)'}\n` +
                (r.ok ? '' : `       reason:   ${r.reason}\n`);
            })
            .join('\n'),
      );
      const passed = results.filter((r) => r.ok).length;
      // eslint-disable-next-line no-console
      console.log(`  → ${passed}/${results.length} probes match expected tool routing\n`);
    });

    it.each(probes)('handles "$transcript" (state=$appState)', async (probe) => {
      const state: WorkoutSessionState = {
        ...INITIAL_STATE,
        targetReps: 30,
        appState: probe.appState,
        currentSetNumber: probe.appState === 'mid_set' ? 1 : 0,
        currentSetStartedAt: probe.appState === 'mid_set' ? new Date().toISOString() : null,
      };

      const response = await liveRespond(state, probe.transcript);

      // Diagnostic mode: don't fail the suite on individual probes —
      // record the result so the summary reports model strengths/weaknesses.
      let ok = false;
      let reason = '';
      if (probe.expected === 'no_tool') {
        ok = response.toolCalls.length === 0;
        if (!ok) reason = `expected no tool, got ${response.toolCalls.length}`;
      } else {
        const match = response.toolCalls.find((t) => t.name === probe.expected);
        if (!match) {
          reason = `no ${probe.expected} tool call`;
        } else if (probe.paramCheck && !probe.paramCheck(match.params)) {
          reason = `params off: ${JSON.stringify(match.params)}`;
        } else {
          ok = true;
        }
      }
      results.push({ probe, response, ok, reason });
      // Always pass — this test is a diagnostic, not a contract.
      expect(true).toBe(true);
    }, 30_000);
  });

  describe('persistence — sync + stats round-trip', () => {
    it('syncs a completed session and reads it back via /stats', async () => {
      const sessionId = `harness-${Date.now()}`;
      const setId = `harness-set-${Date.now()}`;
      const startedAt = new Date().toISOString();

      const syncBody = {
        deviceId: 'harness',
        sessions: [
          {
            id: sessionId,
            exerciseId: 'pushups',
            weeklyPlanId: null,
            sessionType: 'regular',
            targetReps: 30,
            startedAt,
            endedAt: startedAt,
            totalReps: 40,
            setCount: 2,
            userFeedback: 'felt tough but good',
            sets: [
              { id: setId, setNumber: 1, reps: 25, recordedAt: startedAt, restSeconds: null },
              { id: setId + '-2', setNumber: 2, reps: 15, recordedAt: startedAt, restSeconds: 90 },
            ],
          },
        ],
      };

      const syncRes = await fetch(`${API_BASE}/api/v1/workouts/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(AUTH_HEADER ? { Authorization: AUTH_HEADER } : {}),

        },
        body: JSON.stringify(syncBody),
      });
      expect(syncRes.status).toBe(200);
      const synced = await syncRes.json();
      expect(synced.synced).toContain(sessionId);

      const statsRes = await fetch(`${API_BASE}/api/v1/workouts/stats?exercise=pushups`, {
        headers: AUTH_HEADER ? { Authorization: AUTH_HEADER } : undefined,
      });
      expect(statsRes.status).toBe(200);
      const stats = await statsRes.json();
      expect(stats.personalBest).not.toBeNull();
      expect(stats.last7Days.length).toBeGreaterThan(0);
    }, 30_000);
  });

  describe('weekly plan generation', () => {
    it('generates a weekly plan from the live LLM', async () => {
      const res = await fetch(`${API_BASE}/api/v1/plan/weekly`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(AUTH_HEADER ? { Authorization: AUTH_HEADER } : {}),

        },
        body: JSON.stringify({ exerciseId: 'pushups' }),
      });
      expect(res.status).toBe(200);
      const plan = await res.json();
      expect(plan.dailyTargets).toEqual(
        expect.objectContaining({
          mon: expect.any(Number),
          tue: expect.any(Number),
          wed: expect.any(Number),
          thu: expect.any(Number),
          fri: expect.any(Number),
          sat: expect.any(Number),
          sun: expect.any(Number),
        }),
      );
    }, 60_000);
  });
});
