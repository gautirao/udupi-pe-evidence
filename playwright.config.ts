import { defineConfig } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Load .env.e2e so that `npx playwright test` run directly (without the
// run-e2e-local.sh wrapper) picks up PLAYWRIGHT_BASE_URL and other vars.
// Variables already set in the environment (e.g. from CI) take precedence.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envE2ePath = path.resolve(__dirname, '.env.e2e');
if (fs.existsSync(envE2ePath)) {
  const lines = fs.readFileSync(envE2ePath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

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
