import { defineConfig, devices } from '@playwright/test';

const APP_URL = process.env.E2E_APP_URL ?? 'http://localhost:8082';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  // The two-set workout test depends on the live LLM giving the right tool
  // for ~9 utterances in a row. llama3.2:3b occasionally misroutes one,
  // and even with the in-app fallback safety net the timing of the LLM
  // miss vs. the test's expectations can differ. Allow one retry.
  retries: 1,
  reporter: [['list']],
  use: {
    baseURL: APP_URL,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
