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
  },
  projects: [
    {
      name: 'smoke',
      use: { browserName: 'chromium' },
      testMatch: [
        '**/quick-smoke.spec.ts',
        '**/nav-roles.spec.ts',
        '**/broker-listing-form.spec.ts',
        '**/listing-lifecycle.spec.ts',
      ],
    },
    {
      name: 'full',
      // Intentionally includes the same files as smoke — full suite runs everything.
      use: { browserName: 'chromium' },
    },
  ],
});
