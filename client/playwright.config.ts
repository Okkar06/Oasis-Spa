/// <reference types="node" />
import { defineConfig, devices } from '@playwright/test';

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests/e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only - increase to reduce flakiness */
  retries: process.env.CI ? 2 : 0,
  /* Use fewer workers on CI to reduce contention */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */

    /* Run in headless mode by default to avoid XServer issues */
    headless: true,

    /* Capture artifacts useful for CI debugging */
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Use a consistent baseURL from environment when running in CI */
    baseURL: process.env.LOCAL_FRONTEND_URL || process.env.BASE_URL || 'http://localhost:5173',

    /* Per-action timeouts can be increased via testTimeout below */
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    // Firefox and WebKit disabled
  ],

  /* Run your local dev server before starting the tests (keeps behavior if not started externally) */
  webServer: {
    command: 'npm run dev',
    url: process.env.LOCAL_FRONTEND_URL || 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120000,
  },
  /* Increase default test timeout to accommodate slower CI environments */
  timeout: process.env.CI ? 120000 : 60000,
});
