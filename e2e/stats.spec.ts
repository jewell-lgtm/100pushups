import { test, expect } from '@playwright/test';

test.describe('Stats', () => {
  test('renders Stats layout with PB card, week bars, today sets, and Start CTA', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByTestId('stats-screen')).toBeVisible();
    await expect(page.getByTestId('stats-pb-card')).toBeVisible();
    await expect(page.getByTestId('stats-triple')).toBeVisible();
    await expect(page.getByTestId('stats-week-bars')).toBeVisible();
    await expect(page.getByTestId('stats-today-sets')).toBeVisible();
    await expect(page.getByTestId('stats-start-cta')).toBeVisible();
  });

  test('navigates to the workout screen via Start CTA', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('stats-start-cta').click();
    await expect(page).toHaveURL(/\/workout$/);
  });

  test('navigates to history via the history chip', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('stats-history-chip').click();
    await expect(page).toHaveURL(/\/history$/);
  });

  test('settings chip is rendered but inert (Phase 11.6 not landed)', async ({ page }) => {
    await page.goto('/');
    // The chip is present so the layout shape matches the design, but it
    // intentionally has no handler — clicking should not navigate.
    await expect(page.getByTestId('stats-settings-chip')).toBeVisible();
    await page.getByTestId('stats-settings-chip').click({ trial: true });
    await expect(page).toHaveURL(/\/$/);
  });
});
