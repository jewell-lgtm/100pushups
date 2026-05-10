export interface OllamaToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, { type: string; description: string }>;
      required: string[];
    };
  };
}

export interface ToolCall {
  name: string;
  params: Record<string, unknown>;
}

export interface OllamaResponse {
  toolCalls: ToolCall[];
  spokenResponse: string;
}

const TOOLS: OllamaToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'start_set',
      description: 'Start a new set. Call this when the user says they are ready to begin.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'record_reps',
      description: 'Record reps called out mid-set. The user is reporting how many reps they have done so far in the current set.',
      parameters: {
        type: 'object',
        properties: { count: { type: 'number', description: 'Number of reps done so far' } },
        required: ['count'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'complete_set',
      description: 'Complete the current set. Call when the user says they are done with a set.',
      parameters: {
        type: 'object',
        properties: { reps: { type: 'number', description: 'Total reps completed in this set' } },
        required: ['reps'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'adjust_target',
      description: 'Change today\'s rep target up or down based on user request.',
      parameters: {
        type: 'object',
        properties: { new_target: { type: 'number', description: 'New target rep count' } },
        required: ['new_target'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'end_session',
      description: 'End the workout session. Call when the user says they are done for today.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'record_feedback',
      description: 'Record the user\'s post-workout feedback about how they feel.',
      parameters: {
        type: 'object',
        properties: { feedback: { type: 'string', description: 'User\'s feedback about the workout' } },
        required: ['feedback'],
      },
    },
  },
];

export interface VoiceContext {
  appState: string;
  currentSet: { repsRecorded: number; startedAt: string } | null;
  setsCompleted: { setNumber: number; reps: number }[];
  todayTarget: number | null;
  yesterdayTotal: number | null;
  personalBest: number | null;
  streak: number;
  sessionType: string;
}

function buildSystemPrompt(context: VoiceContext): string {
  const lines = [
    'You are a workout coach in the user\'s ear via Bluetooth headphones.',
    'IMPORTANT: You MUST always respond with a short spoken message (1-2 sentences) AND optionally call tools.',
    'Your spoken response will be read aloud via text-to-speech, so keep it natural and brief.',
    'Sound like a gym buddy, not a robot. Never use emojis.',
    '',
    'RULES:',
    '- When the user says a number during mid_set, they are reporting reps done so far. Call record_reps with that number.',
    '- When the user says "done" with a number, they finished the set. Call complete_set with the total reps.',
    '- When the user says "done" without a number, call complete_set with the last recorded reps count.',
    '- When the user says something like "this is hard" or "struggling", just encourage them. Do NOT call any tool.',
    '- When the user says "ready", "go", or "start", call start_set.',
    '- When the user wants to change their target, call adjust_target.',
    '- When the user says "no more" or "finished" between sets, call end_session.',
    '- In post_workout state, record their feedback with record_feedback.',
    '',
    'Always include a spoken response along with any tool call. The response is what the user hears.',
    '',
    `Current state: ${context.appState}`,
  ];

  if (context.todayTarget !== null) {
    lines.push(`Today's target: ${context.todayTarget} reps`);
  }
  if (context.currentSet) {
    lines.push(`Current set reps so far: ${context.currentSet.repsRecorded}`);
  }
  if (context.setsCompleted.length > 0) {
    const setsSummary = context.setsCompleted.map(s => `Set ${s.setNumber}: ${s.reps}`).join(', ');
    lines.push(`Completed sets: ${setsSummary}`);
    const totalSoFar = context.setsCompleted.reduce((sum, s) => sum + s.reps, 0);
    lines.push(`Total reps so far: ${totalSoFar}`);
  }
  if (context.yesterdayTotal !== null) {
    lines.push(`Yesterday's total: ${context.yesterdayTotal}`);
  }
  if (context.personalBest !== null) {
    lines.push(`Personal best (single set): ${context.personalBest}`);
  }
  if (context.streak > 0) {
    lines.push(`Current streak: ${context.streak} days`);
  }
  lines.push(`Session type: ${context.sessionType}`);

  if (context.appState === 'mid_set' && context.todayTarget !== null) {
    lines.push('');
    lines.push('When the user calls out a number, that is reps done so far. Calculate remaining to target and encourage them.');
  }
  if (context.appState === 'post_workout') {
    lines.push('');
    lines.push('Ask how the workout felt and record their feedback with the record_feedback tool.');
  }

  return lines.join('\n');
}

export interface IOllamaClient {
  voiceRespond(transcript: string, context: VoiceContext): Promise<OllamaResponse>;
  voiceRespondStream(
    transcript: string,
    context: VoiceContext,
    onToken: (text: string) => void,
  ): Promise<OllamaResponse>;
}

interface OllamaStreamFrame {
  message?: {
    content?: string;
    tool_calls?: Array<{
      function: { name: string; arguments: Record<string, unknown> };
    }>;
  };
  done?: boolean;
}

export interface OllamaAuth {
  user: string;
  password: string;
}

function authHeaderFromAuth(auth?: OllamaAuth): Record<string, string> {
  if (!auth) return {};
  const encoded = Buffer.from(`${auth.user}:${auth.password}`, 'utf8').toString('base64');
  return { Authorization: `Basic ${encoded}` };
}

export function createOllamaClient(baseUrl: string, model: string, auth?: OllamaAuth): IOllamaClient {
  const authHeaders = authHeaderFromAuth(auth);
  return {
    async voiceRespond(transcript: string, context: VoiceContext): Promise<OllamaResponse> {
      const systemPrompt = buildSystemPrompt(context);

      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: transcript },
          ],
          tools: TOOLS,
          stream: false,
          options: {
            temperature: 0.7,
            num_predict: 80,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama error: ${response.status}`);
      }

      const data = await response.json() as {
        message: {
          content: string;
          tool_calls?: Array<{
            function: { name: string; arguments: Record<string, unknown> };
          }>;
        };
      };

      const toolCalls: ToolCall[] = (data.message.tool_calls ?? []).map(tc => ({
        name: tc.function.name,
        params: tc.function.arguments,
      }));

      return {
        toolCalls,
        spokenResponse: data.message.content?.trim() ?? '',
      };
    },

    async voiceRespondStream(
      transcript: string,
      context: VoiceContext,
      onToken: (text: string) => void,
    ): Promise<OllamaResponse> {
      const systemPrompt = buildSystemPrompt(context);
      let accumulated = '';
      const toolCalls: ToolCall[] = [];

      try {
        const response = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(15000),
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: transcript },
            ],
            tools: TOOLS,
            stream: true,
            options: {
              temperature: 0.7,
              num_predict: 80,
            },
          }),
        });

        if (!response.ok || !response.body) {
          return { toolCalls: [], spokenResponse: '' };
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        // NDJSON loop: split on \n; keep the trailing partial line in buffer.
        while (true) {
          const { value, done } = await reader.read();
          if (value) {
            buffer += decoder.decode(value, { stream: true });
            let nl = buffer.indexOf('\n');
            while (nl !== -1) {
              const line = buffer.slice(0, nl).trim();
              buffer = buffer.slice(nl + 1);
              if (line) processFrame(line, toolCalls, (delta) => {
                accumulated += delta;
                onToken(delta);
              });
              nl = buffer.indexOf('\n');
            }
          }
          if (done) break;
        }
        // Flush any final non-newline-terminated frame.
        const tail = buffer.trim();
        if (tail) processFrame(tail, toolCalls, (delta) => {
          accumulated += delta;
          onToken(delta);
        });
      } catch {
        return { toolCalls: [], spokenResponse: '' };
      }

      return { toolCalls, spokenResponse: accumulated.trim() };
    },
  };
}

function processFrame(
  line: string,
  toolCalls: ToolCall[],
  emit: (delta: string) => void,
): void {
  let frame: OllamaStreamFrame;
  try {
    frame = JSON.parse(line) as OllamaStreamFrame;
  } catch {
    return;
  }
  const delta = frame.message?.content;
  if (delta) emit(delta);
  if (frame.message?.tool_calls) {
    for (const tc of frame.message.tool_calls) {
      toolCalls.push({ name: tc.function.name, params: tc.function.arguments });
    }
  }
}

// Weekly planning prompt
export async function generateWeeklyPlan(
  baseUrl: string,
  model: string,
  input: {
    evaluationReps: number | null;
    weeklyHistory: Array<{ date: string; totalReps: number; feedback: string | null }>;
    currentStreak: number;
    previousTargets: Record<string, number> | null;
  },
  auth?: OllamaAuth,
): Promise<{ dailyTargets: Record<string, number>; notes: string }> {
  const authHeaders = authHeaderFromAuth(auth);
  const prompt = `You are a fitness coach creating a weekly pushup plan.

Rules:
- Progress slowly: ~2-5% increase per week maximum
- If feedback mentions pain or strain, reduce targets by 10-20%
- If feedback says "easy", increase by 3-5%
- Rest day (Sunday) should be ~60% of peak day
- Evaluation days (typically Monday) can be slightly lower to allow recovery

${input.evaluationReps !== null ? `Latest evaluation (max reps in one set): ${input.evaluationReps}` : 'No evaluation data yet.'}

${input.previousTargets ? `Last week's targets: ${JSON.stringify(input.previousTargets)}` : 'No previous plan.'}

This week's sessions:
${input.weeklyHistory.map(d => `${d.date}: ${d.totalReps} reps${d.feedback ? ` — "${d.feedback}"` : ''}`).join('\n') || 'No sessions this week.'}

Current streak: ${input.currentStreak} days

Generate a JSON object with daily targets for next week. Use keys: mon, tue, wed, thu, fri, sat, sun.
Also include a brief "notes" field explaining your reasoning.

Respond with ONLY valid JSON in this format:
{"dailyTargets": {"mon": N, "tue": N, ...}, "notes": "..."}`;

  const response = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      format: 'json',
      options: { temperature: 0.3, num_predict: 200 },
    }),
  });

  const data = await response.json() as { response: string };
  const parsed = JSON.parse(data.response) as { dailyTargets: Record<string, number>; notes: string };
  return parsed;
}
