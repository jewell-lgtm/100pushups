import { VALID_TOOLS_BY_STATE, filterValidTools } from '../../src/hooks/validTools';
import { ToolCall } from '../../src/api/types';

const TC = {
  start_set: { name: 'start_set', params: {} } as const,
  record_reps: (count: number): ToolCall => ({ name: 'record_reps', params: { count } }),
  complete_set: (reps: number): ToolCall => ({ name: 'complete_set', params: { reps } }),
  adjust_target: { name: 'adjust_target', params: { new_target: 30 } } as const,
  end_session: { name: 'end_session', params: {} } as const,
  record_feedback: { name: 'record_feedback', params: { feedback: 'ok' } } as const,
};

describe('VALID_TOOLS_BY_STATE', () => {
  it('idle accepts no tools', () => {
    expect(VALID_TOOLS_BY_STATE.idle.size).toBe(0);
  });

  it('mid_set excludes start_set so a re-"ready" hallucination is dropped', () => {
    expect(VALID_TOOLS_BY_STATE.mid_set.has('start_set')).toBe(false);
  });

  it('between_sets excludes complete_set so a hallucinated complete is dropped', () => {
    expect(VALID_TOOLS_BY_STATE.between_sets.has('complete_set')).toBe(false);
  });

  it('post_workout only accepts record_feedback', () => {
    expect(Array.from(VALID_TOOLS_BY_STATE.post_workout)).toEqual(['record_feedback']);
  });
});

describe('filterValidTools', () => {
  it('drops start_set when in mid_set (the "ready in mid_set" hallucination case)', () => {
    const calls: ToolCall[] = [TC.start_set, TC.record_reps(10)];
    expect(filterValidTools(calls, 'mid_set')).toEqual([TC.record_reps(10)]);
  });

  it('drops complete_set when in between_sets', () => {
    const calls: ToolCall[] = [TC.complete_set(20), TC.start_set];
    expect(filterValidTools(calls, 'between_sets')).toEqual([TC.start_set]);
  });

  it('passes everything in awaiting_start that fits', () => {
    const calls: ToolCall[] = [TC.start_set, TC.adjust_target];
    expect(filterValidTools(calls, 'awaiting_start')).toEqual([TC.start_set, TC.adjust_target]);
  });

  it('returns empty when no tool fits the current state', () => {
    const calls: ToolCall[] = [TC.start_set, TC.record_feedback];
    expect(filterValidTools(calls, 'mid_set')).toEqual([]);
  });
});
