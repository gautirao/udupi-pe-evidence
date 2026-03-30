import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  workers: 2,
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'https://udupi-property-explorer.pages.dev',
    headless: true,
    screenshot: 'only-on-failure',
    ...(process.env.SLOW_MO ? { launchOptions: { slowMo: Number(process.env.SLOW_MO) } } : {}),
  },
  projects: [
    {
      name: 'smoke',
      use: { browserName: 'chromium' },
      testMatch: [
        '**/quick-smoke.spec.ts',
        '**/nav-roles.spec.ts',
        '**/broker-smoke.spec.ts',
        '**/admin-smoke.spec.ts',
        '**/user-journeys.spec.ts',
      ],
    },
    {
      name: 'journey',
      use: { browserName: 'chromium' },
      testMatch: ['**/e2e/journey/**/*.spec.ts'],
    },
    {
      name: 'integration-ui',
      use: { browserName: 'chromium' },
      testMatch: [
        '**/broker-listing-form.spec.ts',
        '**/map-filters.spec.ts',
        '**/poi-display.spec.ts',
      ],
    },
    {
      name: 'full',
      // No testMatch — runs all specs under testDir (e2e/**/*.spec.ts).
      use: { browserName: 'chromium' },
    },
  ],
});
