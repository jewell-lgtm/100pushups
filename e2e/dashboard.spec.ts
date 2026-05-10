import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test('renders title and stat cards and start button', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('100 Pushups').first()).toBeVisible();
    await expect(page.getByText('Start Workout')).toBeVisible();

    // Stat labels render even when values are em-dash placeholders
    await expect(page.getByText("Today's Target")).toBeVisible();
    await expect(page.getByText('Personal Best')).toBeVisible();
    await expect(page.getByText('Streak')).toBeVisible();
    await expect(page.getByText('Yesterday')).toBeVisible();

    await expect(page.getByText('History')).toBeVisible();
    await expect(page.getByText('Weekly Plan')).toBeVisible();
  });

  test('navigates to the workout screen', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Start Workout').click();
    await expect(page).toHaveURL(/\/workout$/);
  });

  test('navigates to history and plan', async ({ page }) => {
    await page.goto('/');
    await page.getByText('History').click();
    await expect(page).toHaveURL(/\/history$/);
    await page.goBack();
    await page.getByText('Weekly Plan').click();
    await expect(page).toHaveURL(/\/plan$/);
  });
});
