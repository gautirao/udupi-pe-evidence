/**
 * Playwright config for the Discover-V2 parity harness (issue #2076).
 *
 * This is a SEPARATE config file from playwright.config.ts, not a fifth
 * project inside it — deliberately, because `webServer` and `globalSetup`
 * are CONFIG-level settings in Playwright, not project-level ones, and this
 * harness needs a different globalSetup (parity-global-setup.ts, which
 * never mutates data and fails loudly on auth failure — see that file's
 * docstring) than the existing e2e/global-setup.ts (which creates and
 * approves a real listing and writes an empty storageState on auth
 * failure). Bolting a fifth project onto playwright.config.ts could not
 * express that difference.
 *
 * testDir is `./e2e-parity`, a NEW TOP-LEVEL directory — never `./e2e/parity`.
 * playwright.config.ts's `full` project has no `testMatch`, so it runs
 * EVERYTHING under `./e2e` (testDir); nesting under e2e/ would make the
 * parity specs run twice, once under this config and once (accidentally,
 * un-isolated, without parity-global-setup's guards) under `full`.
 *
 * baseURL trap: unlike playwright.config.ts, this file does NOT default to
 * the deployed site. `PLAYWRIGHT_BASE_URL` must be set explicitly (enforced
 * again, redundantly, inside parity-global-setup.ts — see that file). A
 * config-level default here would be a second silent way to point the whole
 * harness at hosted Bangalore data.
 *
 * Determinism contract (see docs/audit/issue-2076/fixture-environment-manifest.md
 * for the full written rationale for each of these):
 *   - locale en-IN, timezoneId Asia/Kolkata
 *   - deviceScaleFactor 1, colorScheme light, reducedMotion 'reduce'
 *   - two named viewport projects: desktop (1366x768) and mobile (390x844)
 *   - retries: 0, workers: 1 — parallel workers would share the fixture DB
 *     once Stage 2's seed exists, which would make row state a race
 *     condition between workers; disabled from Stage 1 onward so the config
 *     never needs to change under time pressure later.
 */

import { defineConfig, devices } from '@playwright/test';

const PLAYWRIGHT_BASE_URL = process.env.PLAYWRIGHT_BASE_URL;

if (!PLAYWRIGHT_BASE_URL) {
  // Fail at config-load time, before Playwright even attempts to schedule a
  // single test — the loudest possible failure mode. See module docstring
  // and parity-global-setup.ts for why this harness never falls back to the
  // deployed-site default that playwright.config.ts uses.
  throw new Error(
    '[playwright.parity.config.ts] PLAYWRIGHT_BASE_URL is not set. ' +
    'This config never defaults to the deployed site — set PLAYWRIGHT_BASE_URL ' +
    'explicitly (e.g. http://localhost:5174) before running parity specs.',
  );
}

const DESKTOP_VIEWPORT = { width: 1366, height: 768 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };

export default defineConfig({
  testDir: './e2e-parity',
  // e2e-parity/mock-capture/** is a SEPARATE harness (issue #2076 Amendment-1 AC12) with its own
  // config, playwright.mock-capture.config.ts, and its own globalSetup-free webServer against a
  // local static mock server — it must never run under THIS config's globalSetup (which
  // authenticates against the real app/backend, see parity-global-setup.ts). Without this
  // testIgnore, Playwright's default testMatch would still discover
  // e2e-parity/mock-capture/mock-capture.spec.ts here (testDir is recursive) — it happened to
  // no-op today only because none of its per-state tests match the parity-desktop/parity-mobile
  // project names, which is an accident of naming, not a real isolation guarantee. Added on the
  // same day the mock-capture harness was built, verified by an mock-capture-free
  // `--reporter=list` run alongside the unmodified pilot spec.
  testIgnore: '**/mock-capture/**',
  timeout: 30_000,
  retries: 0,
  workers: 1,
  globalSetup: './e2e-parity/parity-global-setup.ts',
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-parity' }]],
  outputDir: 'test-results-parity',
  use: {
    baseURL: PLAYWRIGHT_BASE_URL,
    headless: true,
    screenshot: 'only-on-failure',
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
    deviceScaleFactor: 1,
    colorScheme: 'light',
    reducedMotion: 'reduce',
  },
  projects: [
    {
      name: 'parity-desktop',
      use: { ...devices['Desktop Chrome'], viewport: DESKTOP_VIEWPORT },
    },
    {
      name: 'parity-mobile',
      use: { ...devices['Desktop Chrome'], viewport: MOBILE_VIEWPORT },
    },
  ],
});
