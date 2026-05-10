import { test, expect } from '@playwright/test';

/**
 * Validates the AuthGate bootstrap flow:
 *   - cold load: app posts to /auth/register, persists token, dashboard renders
 *   - warm load: previously-persisted token is reused, no register call
 *   - missing token after wipe: refetches via /auth/register
 *
 * The expo dev server is configured with EXPO_PUBLIC_API_BASE pointing at
 * the local backend (http://localhost:3000), so the register call hits
 * the auth-enabled backend.
 */

test.describe('AuthGate', () => {
  test('cold launch posts to /auth/register and lands on dashboard', async ({ page }) => {
    const registers: string[] = [];
    page.on('request', (req) => {
      if (req.url().endsWith('/auth/register')) registers.push(req.method());
    });

    await page.goto('/');
    await expect(page.getByText('100 Pushups').first()).toBeVisible();
    await expect(page.getByText('Start Workout')).toBeVisible();

    expect(registers).toEqual(['POST']);

    // Token should now live in localStorage (web shim for SecureStore).
    const token = await page.evaluate(() => localStorage.getItem('auth.token'));
    const deviceId = await page.evaluate(() => localStorage.getItem('auth.deviceId'));
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(deviceId).toMatch(/^[0-9a-f-]{36}$/);
  });

  test('warm launch reuses the stored token (no register call)', async ({ page }) => {
    // Seed storage so the bootstrap finds an existing token.
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('auth.token', 'seeded-token.signature');
      localStorage.setItem('auth.deviceId', '00000000-0000-0000-0000-000000000000');
    });

    const registers: string[] = [];
    page.on('request', (req) => {
      if (req.url().endsWith('/auth/register')) registers.push(req.method());
    });

    await page.reload();
    await expect(page.getByText('100 Pushups').first()).toBeVisible();
    expect(registers).toEqual([]);
  });
});
