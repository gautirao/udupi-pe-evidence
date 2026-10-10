// playwright.deployed.config.ts - issue #2750 (PR-2)
//
// Post-deploy REACHABILITY check: secondary — not the E2E gate; the gate is npm run test:e2e:gate.
//
// What this proves: the deployed frontend renders, a protected route redirects to /auth, an unknown route renders
// NotFound, the backend answers /actuator/health with status UP, one public discover endpoint answers 200 JSON and an
// authenticated endpoint refuses an anonymous GET. It proves NOTHING about the merged backend (Render autoDeploy is
// OFF) and exercises no signed-in flow.
//
// Invariants (pinned by scripts/e2e/check-deployed-reachability.mjs, FC-29..FC-33):
//  - BOTH target URLs are explicit INPUTS. There is no fallback literal: an unset or non-http(s) URL throws at load.
//  - Auth-free and write-free: no global hooks, no web server, no saved sign-in state, no credentials, no env-file read.
//    Write-freedom is enforced inside the test file by a context.route guard, not merely observed.
//  - retries 0 (a flaky reachability check must be seen), workers 1, forbidOnly true, service workers blocked.
import { defineConfig } from '@playwright/test';

function requireHttpUrl(name: 'PLAYWRIGHT_BASE_URL' | 'BACKEND_BASE_URL'): string {
  const value = process.env[name];
  if (!value || !/^https?:\/\//.test(value)) {
    throw new Error(
      `playwright.deployed.config.ts: ${name} must be set to an explicit http(s):// URL (got ${value === undefined ? 'unset' : JSON.stringify(value)}). There is deliberately no default.`,
    );
  }
  return value.replace(/\/+$/, '');
}

const baseURL = requireHttpUrl('PLAYWRIGHT_BASE_URL');
requireHttpUrl('BACKEND_BASE_URL');

export default defineConfig({
  testDir: './e2e/deployed',
  testMatch: '**/*.reachability.ts',
  timeout: 60_000,
  retries: 0,
  workers: 1,
  forbidOnly: true,
  outputDir: 'test-results-deployed',
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-deployed' }]],
  use: {
    baseURL,
    browserName: 'chromium',
    headless: true,
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
  },
});
