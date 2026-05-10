import { ToolCall, VoiceContext } from './ollama.js';

export function generateSpokenResponse(toolCalls: ToolCall[], context: VoiceContext): string {
  if (toolCalls.length === 0) return '';

  const tool = toolCalls[0];
  switch (tool.name) {
    case 'start_set':
      return 'Go!';
    case 'record_reps': {
      const count = Number(tool.params.count);
      if (context.todayTarget && count > 0) {
        const remaining = context.todayTarget - count;
        if (remaining > 0) return `Only ${remaining} to go!`;
        if (remaining === 0) return "That's your target! Keep going if you can!";
        return `${Math.abs(remaining)} past your target, nice!`;
      }
      return `${count}, keep going!`;
    }
    case 'complete_set': {
      const reps = Number(tool.params.reps);
      return `${reps} reps, nice work. Another set?`;
    }
    case 'adjust_target': {
      const target = Number(tool.params.new_target);
      return `Got it, target is now ${target}.`;
    }
    case 'end_session': {
      const total = context.setsCompleted.reduce((sum, s) => sum + s.reps, 0);
      return `Good session, ${total} total reps. How did that feel?`;
    }
    case 'record_feedback':
      return 'Got it. Nice work today.';
    default:
      return '';
  }
}
