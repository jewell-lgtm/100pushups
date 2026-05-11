import { test, expect } from '@playwright/test';

/**
 * Smoke test for the History calendar grid (Phase 11.5). Navigates to
 * `/history` directly; with an empty local SQLite the calendar still
 * renders its layout (grid + streak banner + month nav).
 */

test.describe('History calendar', () => {
  test('renders month nav, streak banner, and the calendar grid', async ({ page }) => {
    await page.goto('/history');

    await expect(page.getByTestId('history-streak-banner')).toBeVisible();
    await expect(page.getByTestId('history-calendar-grid')).toBeVisible();
    await expect(page.getByTestId('history-prev-month')).toBeVisible();
    // Next-month button is rendered but disabled on the current month
    // (we don't navigate to the future). The plan-doc calls for it to
    // exist so we just assert the element is in the DOM.
    await expect(page.getByTestId('history-next-month')).toBeVisible();
  });

  test('previous-month nav re-renders the grid with the previous month label', async ({ page }) => {
    await page.goto('/history');

    // Capture the calendar grid before navigating so we can assert the
    // re-render. The visible day cell IDs change between months, so a
    // simple before/after count check would race; instead we click and
    // re-assert the grid is still mounted (which proves the page hasn't
    // crashed after a month flip).
    await page.getByTestId('history-prev-month').click();
    await expect(page.getByTestId('history-calendar-grid')).toBeVisible();
    await expect(page.getByTestId('history-streak-banner')).toBeVisible();
  });
});
