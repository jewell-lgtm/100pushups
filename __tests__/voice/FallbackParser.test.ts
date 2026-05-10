import { fallbackParse, parseTranscriptWords } from '../../src/voice/FallbackParser';

describe('parseTranscriptWords', () => {
  it('parses digit strings', () => {
    expect(parseTranscriptWords('25')).toBe(25);
    expect(parseTranscriptWords('I did 10')).toBe(10);
  });

  it('parses word numbers', () => {
    expect(parseTranscriptWords('twenty five')).toBe(25);
    expect(parseTranscriptWords('fifteen')).toBe(15);
    expect(parseTranscriptWords('forty two')).toBe(42);
  });

  it('returns null for no number', () => {
    expect(parseTranscriptWords('this is hard')).toBeNull();
    expect(parseTranscriptWords('ready')).toBeNull();
  });
});

describe('fallbackParse', () => {
  describe('awaiting_start', () => {
    it('"ready" triggers start_set', () => {
      const result = fallbackParse('ready', 'awaiting_start', null);
      expect(result.toolCalls).toEqual([{ name: 'start_set', params: {} }]);
      expect(result.spokenResponse).toBe('Go!');
    });

    it('"go" triggers start_set', () => {
      const result = fallbackParse('Go!', 'awaiting_start', null);
      expect(result.toolCalls).toEqual([{ name: 'start_set', params: {} }]);
    });

    it('unrecognized text prompts again', () => {
      const result = fallbackParse('banana', 'awaiting_start', null);
      expect(result.toolCalls).toEqual([]);
    });
  });

  describe('mid_set', () => {
    it('bare number records reps with countdown', () => {
      const result = fallbackParse('10', 'mid_set', 40);
      expect(result.toolCalls).toEqual([{ name: 'record_reps', params: { count: 10 } }]);
      expect(result.spokenResponse).toBe('Only 30 to go!');
    });

    it('"done 25" completes set', () => {
      const result = fallbackParse('done 25', 'mid_set', 40);
      expect(result.toolCalls).toEqual([{ name: 'complete_set', params: { reps: 25 } }]);
    });

    it('encourages on unrecognized speech', () => {
      const result = fallbackParse('this is hard', 'mid_set', 40);
      expect(result.toolCalls).toEqual([]);
      expect(result.spokenResponse).toBe('Keep pushing!');
    });

    it('bare number without target still records reps', () => {
      const result = fallbackParse('15', 'mid_set', null);
      expect(result.toolCalls).toEqual([{ name: 'record_reps', params: { count: 15 } }]);
      expect(result.spokenResponse).toContain('15');
    });
  });

  describe('between_sets', () => {
    it('"yes" starts another set', () => {
      const result = fallbackParse('yes', 'between_sets', null);
      expect(result.toolCalls).toEqual([{ name: 'start_set', params: {} }]);
    });

    it('"no" ends session', () => {
      const result = fallbackParse('no', 'between_sets', null);
      expect(result.toolCalls).toEqual([{ name: 'end_session', params: {} }]);
    });

    it('"another" starts another set', () => {
      const result = fallbackParse('another', 'between_sets', null);
      expect(result.toolCalls).toEqual([{ name: 'start_set', params: {} }]);
    });
  });

  describe('post_workout', () => {
    it('captures free-form feedback', () => {
      const result = fallbackParse('felt great today', 'post_workout', null);
      expect(result.toolCalls).toEqual([
        { name: 'record_feedback', params: { feedback: 'felt great today' } },
      ]);
    });
  });
});
