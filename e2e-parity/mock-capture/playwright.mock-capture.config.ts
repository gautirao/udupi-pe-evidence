/**
 * Playwright config for the frozen-mock capture harness (issue #2076 Amendment-1, AC12).
 *
 * This is a SEPARATE config from both playwright.config.ts and playwright.parity.config.ts,
 * deliberately — not a project bolted onto either:
 *
 *   - playwright.parity.config.ts's `globalSetup` (parity-global-setup.ts) authenticates against
 *     the real app / real backend (see that file). This harness captures a static design mock
 *     served by a throwaway local file server — it has no backend, no auth, and no
 *     PLAYWRIGHT_BASE_URL/BACKEND_BASE_URL of its own. Adding a project to
 *     playwright.parity.config.ts would force every mock capture through app auth setup for no
 *     reason, and would make this harness fail whenever the app parity harness's env vars are
 *     unset — the two concerns must not share a config's globalSetup.
 *   - playwright.config.ts's `full` project has no `testMatch`, so it runs everything under its
 *     own testDir (./e2e). Nesting this harness's spec under ./e2e would make it run twice, once
 *     correctly here and once accidentally there.
 *
 * webServer starts e2e-parity/mock-capture/mock-server.mjs, a dependency-free static file server
 * that serves docs/design/retrends-design-system/ AS THE DOCUMENT ROOT (see that file's docstring
 * for why this is a hard requirement, not a preference) on MOCK_CAPTURE_PORT (default 8927 — not
 * 5173/5174/3000/8085/5434/8811, all of which are used elsewhere in this repo's dev/test/CI
 * tooling per the task brief for this step). Playwright starts and stops this server itself for
 * every run (`reuseExistingServer: false`) — callers never need to manage it by hand.
 *
 * Two projects, `mock-desktop` (1366x768) and `mock-mobile` (390x844), mirror
 * playwright.parity.config.ts's `parity-desktop`/`parity-mobile` naming convention. Viewport is
 * set at the PROJECT level (Playwright's own viewport control), never via a browser resize
 * primitive — resize_window was independently verified unreliable at 390x844 in this same step's
 * task brief (window snapped back to full screen). mock-capture.spec.ts additionally hard-asserts
 * `page.viewportSize()` against the requested size before every capture, so a silently-wrong-size
 * screenshot is not possible even if a future edit to this config changes that.
 */

import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MOCK_CAPTURE_PORT = process.env.MOCK_CAPTURE_PORT ?? '8927';
const MOCK_SERVER_URL = `http://127.0.0.1:${MOCK_CAPTURE_PORT}`;

export default defineConfig({
  testDir: '.',
  testMatch: 'mock-capture.spec.ts',
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  outputDir: path.resolve(__dirname, '../../test-results-mock-capture'),
  // Aggregates every capture's JSON metadata into docs/audit/issue-2076/mock-audit/index.{md,json}
  // after the run — see build-index.ts's docstring.
  globalTeardown: path.join(__dirname, 'build-index.ts'),
  webServer: {
    command: `node ${path.join(__dirname, 'mock-server.mjs')}`,
    url: `${MOCK_SERVER_URL}/ui_kits/new_discover/index.html`,
    reuseExistingServer: false,
    timeout: 15_000,
    env: { MOCK_CAPTURE_PORT },
  },
  use: {
    baseURL: MOCK_SERVER_URL,
    headless: true,
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
    deviceScaleFactor: 1,
    colorScheme: 'light',
    reducedMotion: 'reduce',
  },
  projects: [
    {
      name: 'mock-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } },
    },
    {
      name: 'mock-mobile',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } },
    },
  ],
});
