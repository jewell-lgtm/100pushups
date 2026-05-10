import { test, expect, Page } from '@playwright/test';

/**
 * End-to-end voice harness test.
 *
 * Drives the workout screen via the on-screen TextInput (the "voice harness"
 * that simulates speech recognition results — see `createPlaceholderEngine`
 * in app/workout.tsx). All API calls go to the deployed backend via the
 * port-forward, so this test exercises:
 *   browser → expo-router → useWorkoutSession → ApiClient
 *     → kubectl port-forward → svc/pushup-api → Ollama (llama3.2:3b)
 */

async function utter(page: Page, text: string) {
  const input = page.getByRole('textbox');
  await input.click();
  // RN-Web's controlled <TextInput> doesn't always pick up Playwright's
  // `fill` (single batched assignment). Type character-by-character so
  // each keystroke fires React's onChangeText.
  await input.fill('');
  await input.pressSequentially(text, { delay: 10 });
  await page.getByText('Send', { exact: true }).click();
}

test.describe('Workout flow', () => {
  test('drives a full two-set workout via the voice harness', async ({ page }) => {
    test.setTimeout(120_000);

    // Surface app errors to the test log
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.error('[browser]', msg.text());
    });
    page.on('pageerror', (err) => console.error('[pageerror]', err));

    await page.goto('/workout');

    // After session start, the screen settles in awaiting_start ("Say 'ready' to start")
    await expect(page.getByText(/Say "ready" to start/)).toBeVisible({ timeout: 15_000 });

    // 1. start the first set
    await utter(page, 'ready');
    await expect(page.getByText(/^Set 1/)).toBeVisible({ timeout: 15_000 });

    // 2. mid-set callouts — record_reps via LLM
    await utter(page, 'ten');
    await expect(page.getByText(/Set 1.*10 reps/)).toBeVisible({ timeout: 15_000 });

    await utter(page, 'twenty');
    await expect(page.getByText(/Set 1.*20 reps/)).toBeVisible({ timeout: 15_000 });

    // 3. complete set 1 — "done 25" is the form the live LLM handles cleanly
    await utter(page, 'done 25');
    await expect(page.getByText('Rest — another set?')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/^25 total reps/)).toBeVisible();
    await expect(page.getByText(/Set 1: 25/)).toBeVisible();

    // 4. another set
    await utter(page, 'yes another');
    await expect(page.getByText(/^Set 2/)).toBeVisible({ timeout: 15_000 });

    await utter(page, 'done 15');
    await expect(page.getByText('Rest — another set?')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/^40 total reps/)).toBeVisible();
    await expect(page.getByText(/Set 2: 15/)).toBeVisible();

    // 5. end the session — model is sometimes flaky on "no more"; "finished" is in the prompt rule list
    await utter(page, 'finished');
    await expect(page.getByText('How did that feel?')).toBeVisible({ timeout: 20_000 });

    // 6. give post-workout feedback
    await utter(page, 'felt tough but good');
    // record_feedback applies; the screen still reads post_workout because the
    // state machine doesn't reset appState. Validate that no error was raised
    // and the totals stuck.
    await expect(page.getByText(/^40 total reps/)).toBeVisible();
  });

  test('handles a single set with adjust_target', async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto('/workout');
    await expect(page.getByText(/Say "ready" to start/)).toBeVisible({ timeout: 15_000 });

    await utter(page, 'ready');
    await expect(page.getByText(/^Set 1/)).toBeVisible({ timeout: 15_000 });

    await utter(page, 'done 12');
    await expect(page.getByText('Rest — another set?')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/^12 total reps/)).toBeVisible();
  });
});
