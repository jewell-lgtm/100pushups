import { test, expect, Page } from '@playwright/test';

/**
 * End-to-end voice harness test.
 *
 * Drives the workout screen via the on-screen TextInput (the "voice harness"
 * that simulates speech recognition results — see `createPlaceholderEngine`
 * in app/workout.tsx). All API calls go to the deployed backend via the
 * port-forward, so this test exercises:
 *   browser → expo-router → useWorkoutSession → ApiClient
 *
 * The streaming endpoint is mocked via page.route() so this suite does NOT
 * depend on a running Ollama. The non-streaming /respond endpoint is still
 * used by the in-app fallback path, but the chat bubble + state transitions
 * we assert here are driven by the mocked NDJSON stream + the deterministic
 * fallback parser.
 */

async function utter(page: Page, text: string) {
  // Phase 12.6+13.4: the TextInput now lives inside a Modal that opens
  // when the user taps the mic button. The Send button auto-closes the
  // modal on submit, so we re-open per utterance.
  await page.getByTestId('mic-button').click();
  const input = page.getByRole('textbox');
  await input.click();
  // RN-Web's controlled <TextInput> doesn't always pick up Playwright's
  // `fill` (single batched assignment). Type character-by-character so
  // each keystroke fires React's onChangeText.
  await input.fill('');
  await input.pressSequentially(text, { delay: 10 });
  await page.getByText('Send', { exact: true }).click();
}

// Mock NDJSON stream: a couple of token frames followed by a done frame
// with a tool call appropriate to the transcript.
function ndjson(...frames: object[]): string {
  return frames.map((f) => JSON.stringify(f)).join('\n') + '\n';
}

async function mockStream(page: Page) {
  await page.route('**/api/v1/voice/respond/stream', async (route, request) => {
    const body = JSON.parse(request.postData() ?? '{}') as {
      transcript: string;
      context: { appState: string };
    };
    const t = (body.transcript ?? '').toLowerCase().trim();
    const state = body.context?.appState;
    let frames: object[];
    if (state === 'awaiting_start' && /ready|go|start/.test(t)) {
      frames = [
        { type: 'token', text: "Let's " },
        { type: 'token', text: 'go.' },
        { type: 'done', toolCalls: [{ name: 'start_set', params: {} }], spokenResponse: "Let's go." },
      ];
    } else if (state === 'mid_set' && /^\d+|five|ten/.test(t)) {
      frames = [
        { type: 'token', text: 'Keep ' },
        { type: 'token', text: 'going!' },
        { type: 'done', toolCalls: [{ name: 'record_reps', params: { count: 5 } }], spokenResponse: 'Keep going!' },
      ];
    } else {
      frames = [
        { type: 'token', text: 'OK.' },
        { type: 'done', toolCalls: [], spokenResponse: 'OK.' },
      ];
    }
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/x-ndjson' },
      body: ndjson(...frames),
    });
  });
}

test.describe('Workout flow', () => {
  test('drives a workout via the voice harness and renders chat bubbles', async ({ page }) => {
    test.setTimeout(120_000);

    page.on('console', (msg) => {
      if (msg.type() === 'error') console.error('[browser]', msg.text());
    });
    page.on('pageerror', (err) => console.error('[pageerror]', err));

    await mockStream(page);
    await page.goto('/workout');

    // After session start, the coach greeting bubble lands ("Say ready when you want to start.")
    await expect(page.getByTestId('bubble-coach').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('bubble-coach').first()).toContainText(/ready/i);
    // GREETING_DONE has dispatched once the state-indicator reads "Awaiting start" — this
    // guarantees the engine.onTranscript callback is bound before we simulate input.
    await expect(page.getByTestId('state-indicator')).toContainText(/Awaiting start/, { timeout: 15_000 });

    // 1. start the first set — user bubble "ready", state label flips to "Set 1"
    await utter(page, 'ready');
    const userBubbles = page.getByTestId('bubble-user');
    await expect(userBubbles).toHaveCount(1, { timeout: 5_000 });
    await expect(userBubbles.first()).toHaveText('ready');
    await expect(page.getByTestId('state-indicator')).toContainText(/Set 1/, { timeout: 10_000 });
    // A second coach bubble (the streamed response to "ready") appears with non-empty text.
    const coachBubbles = page.getByTestId('bubble-coach');
    await expect(coachBubbles).toHaveCount(2, { timeout: 10_000 });
    await expect(coachBubbles.nth(1)).not.toHaveText('', { timeout: 5_000 });

    // 2. second utterance appends new bubbles below; previous bubbles remain.
    await utter(page, 'five');
    await expect(userBubbles).toHaveCount(2, { timeout: 5_000 });
    await expect(userBubbles.nth(0)).toHaveText('ready');
    await expect(userBubbles.nth(1)).toHaveText('five');
    await expect(coachBubbles).toHaveCount(3, { timeout: 10_000 });
    await expect(coachBubbles.nth(2)).not.toHaveText('', { timeout: 5_000 });

    // User bubbles are right-aligned (matches `bubbleWrapUser` -> alignItems: flex-end).
    // RN-Web translates alignItems on the wrapping View into CSS `align-items`.
    const userWrapAlign = await userBubbles.first().evaluate(
      (el) => getComputedStyle(el).alignItems,
    );
    expect(userWrapAlign).toBe('flex-end');
  });

  test('handles a single set start (smoke)', async ({ page }) => {
    test.setTimeout(60_000);

    await mockStream(page);
    await page.goto('/workout');
    await expect(page.getByTestId('bubble-coach').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('state-indicator')).toContainText(/Awaiting start/, { timeout: 15_000 });

    await utter(page, 'ready');
    await expect(page.getByTestId('state-indicator')).toContainText(/Set 1/, { timeout: 10_000 });
    await expect(page.getByTestId('bubble-user')).toHaveCount(1);
  });
});
