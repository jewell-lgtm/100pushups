import { test, expect } from '@playwright/test';

/**
 * Smoke test for the Complete screen (Phase 11.4.2). We navigate to
 * `/complete?sessionId=<fake>` directly. The local SQLite read returns
 * null for an unknown sessionId, and `useCompleteData` degrades the
 * unreachable backend reflection call to the static fallback, so the
 * screen renders the empty-state shape end-to-end without a live
 * backend reachable.
 */

test.describe('Complete screen', () => {
  test('renders layout, totals=0 fallback, and the static reflection on a fake sessionId', async ({ page }) => {
    // Mock the reflect endpoint so the test stays deterministic. The
    // client treats network failure and 404 identically — both produce
    // the static fallback string.
    await page.route('**/api/v1/session/reflect', async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'session not found' }),
      });
    });

    await page.goto('/complete?sessionId=does-not-exist');

    await expect(page.getByTestId('complete-screen')).toBeVisible();
    await expect(page.getByTestId('complete-total-reps')).toHaveText('0');
    await expect(page.getByTestId('complete-bars')).toBeVisible();
    // The unknown sessionId path hits the static-fallback branch.
    await expect(page.getByTestId('complete-reflection-fallback')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('complete-voice-cta')).toBeVisible();
    await expect(page.getByTestId('complete-done-cta')).toBeVisible();
  });

  test('"Done for today" replaces back to Stats (`/`)', async ({ page }) => {
    await page.route('**/api/v1/session/reflect', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ reflection: null }),
      }),
    );

    await page.goto('/complete?sessionId=does-not-exist');
    await page.getByTestId('complete-done-cta').click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('stats-screen')).toBeVisible();
  });
});
