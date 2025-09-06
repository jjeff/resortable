import { defineConfig, devices } from '@playwright/test';

// Use a different port in CI to avoid conflicts with dev server on host
const PORT = process.env.CI ? '4173' : '3000';

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '*.spec.ts',
  /* Set global timeout */
  timeout: 30000,
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: process.env.CI
    ? [
      ['line'],
      ['github'],
      ['junit', { outputFile: 'test-results/junit.xml' }],
    ]
    : [
      ['list'],
    ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: `http://localhost:${PORT}`,
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    /* Take screenshot on failure */
    screenshot: 'only-on-failure',
    /* Record video on failure */
    video: 'retain-on-failure',
  },

  /* Configure projects for major browsers */
  projects: process.env.CI
    ? [
      // In CI, only test Chromium to speed up tests
      {
        name: 'chromium',
        use: { ...devices['Desktop Chrome'] },
      },
    ]
    : [
      // Locally, test all browsers
      {
        name: 'chromium',
        use: { ...devices['Desktop Chrome'] },
      },
      {
        name: 'firefox',
        use: { ...devices['Desktop Firefox'] },
      },
      {
        name: 'webkit',
        use: { ...devices['Desktop Safari'] },
      },
      /* Test against mobile viewports. */
      {
        name: 'Mobile Chrome',
        use: { ...devices['Pixel 5'] },
      },
      {
        name: 'Mobile Safari',
        use: { ...devices['iPhone 12'] },
      },
    ],

  /* Run your local dev server before starting the tests */
  // Allow disabling the dev server in constrained environments (e.g. CI/sandboxes)
  webServer: process.env.PW_DISABLE_WEBSERVER
    ? undefined
    : {
      command: 'npm run dev',
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
});
