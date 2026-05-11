import { test, expect, Page } from '@playwright/test';

/**
 * Validates the streaming UX: while the NDJSON stream is in-flight, the
 * pending coach bubble shows an <ActivityIndicator testID="bubble-spinner">.
 *
 * Spinner visibility is naturally race-y — by the time Playwright asserts,
 * tokens have often already arrived and replaced it. We use `page.route()`
 * to delay the streaming endpoint by ~500ms so the spinner stays observable.
 */

async function utter(page: Page, text: string) {
  // Phase 12.6+13.4: TextInput sits inside a Modal opened by the mic
  // button. Tap mic → type → Send (which auto-closes the modal).
  await page.getByTestId('mic-button').click();
  const input = page.getByRole('textbox');
  await input.click();
  await input.fill('');
  await input.pressSequentially(text, { delay: 10 });
  await page.getByText('Send', { exact: true }).click();
}

test.describe('Streaming spinner', () => {
  test('shows the pending bubble spinner while the stream is in-flight', async ({ page }) => {
    test.setTimeout(30_000);

    // Intercept the streaming endpoint and serve a synthesized NDJSON body
    // after a delay long enough for Playwright to assert spinner visibility.
    await page.route('**/api/v1/voice/respond/stream', async (route) => {
      await new Promise((r) => setTimeout(r, 500));
      const body =
        JSON.stringify({ type: 'token', text: 'Got ' }) +
        '\n' +
        JSON.stringify({ type: 'token', text: 'it.' }) +
        '\n' +
        JSON.stringify({
          type: 'done',
          toolCalls: [{ name: 'start_set', params: {} }],
          spokenResponse: 'Got it.',
        }) +
        '\n';
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/x-ndjson' },
        body,
      });
    });

    page.on('console', (msg) => {
      if (msg.type() === 'error') console.error('[browser]', msg.text());
    });
    page.on('pageerror', (err) => console.error('[pageerror]', err));

    await page.goto('/workout');
    await expect(page.getByTestId('bubble-coach').first()).toBeVisible({ timeout: 15_000 });

    // Send a message; the coach bubble starts as `status: 'pending'` and renders
    // the spinner until the first token frame lands.
    await utter(page, 'ready');

    const spinner = page.getByTestId('bubble-spinner');
    await expect(spinner).toBeVisible({ timeout: 1_000 });

    // Once the stream resolves, the bubble transitions to streaming/final and
    // the spinner is replaced with the streamed text.
    await expect(spinner).toHaveCount(0, { timeout: 5_000 });
    await expect(page.getByTestId('bubble-coach').nth(1)).toContainText(/Got it/);
  });
});
