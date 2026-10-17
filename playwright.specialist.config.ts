import { defineConfig } from '@playwright/test';
import { assertSpecialistTarget } from './scripts/e2e/specialist-suite.mjs';

/**
 * Playwright config for the SPECIALIST suite (issue #2750 slice S0): browser-only behaviour that no lower layer can
 * prove (hit-testing, paint, layout overflow, real Leaflet, real Radix, real pointer events), kept out of the gate.
 *
 *   npm run test:e2e:specialist     (scripts/run-e2e-gate.sh --suite=specialist)
 *
 * This suite is OPT-IN and LOCAL-ONLY. It is NOT the E2E gate and its results are never E2E evidence; the only
 * authoritative merge gate is `npm run test:e2e:gate` (canonical). It is deliberately not wired into CI or pre-push.
 *
 * Target safety: PLAYWRIGHT_BASE_URL and BACKEND_BASE_URL are REQUIRED and must be loopback; VITE_SUPABASE_URL must be
 * loopback when set. There is no default target and no .env loader, so a missing or production URL fails when this file
 * loads (scripts/e2e/specialist-suite.mjs). The runtime request guard lives in e2e/specialist/support/specialist-test.ts.
 */
const { baseUrl, previewPort } = assertSpecialistTarget(process.env);

if (!previewPort) {
  throw new Error(
    '[playwright.specialist.config.ts] PLAYWRIGHT_BASE_URL must carry an explicit port (e.g. http://localhost:5380); ' +
    'the preview server is started on that port.',
  );
}

export default defineConfig({
  testDir: './e2e/specialist',
  testMatch: '**/*.specialist.ts',
  timeout: 30_000,
  retries: 0,
  workers: 1,
  // Reuses the canonical backend-reachability / CORS / build-sha probes by path (no edit to that file): they need only
  // PLAYWRIGHT_BASE_URL and BACKEND_BASE_URL, which this config also requires.
  globalSetup: './e2e/canonical/canonical-global-setup.ts',
  outputDir: 'test-results/specialist',
  // A LITERAL results path: the gate exports PLAYWRIGHT_JSON_OUTPUT_NAME (the canonical results path) for its own run, and
  // honouring it here would write specialist results over the canonical file, so this config ignores it on purpose.
  reporter: [['list'], ['json', { outputFile: 'test-results/specialist/results.json' }]],
  webServer: {
    // FRONTEND ONLY, same shape as playwright.canonical.config.ts (addresses the workspace directly so --port reaches vite).
    command: `npm --prefix apps/web run preview -- --port ${previewPort} --strictPort`,
    url: baseUrl,
    reuseExistingServer: false,
    timeout: 60_000,
  },
  use: {
    // The legacy baseline the pilot specs were written against (playwright.config.ts), plus a pinned locale/timezone.
    baseURL: baseUrl,
    browserName: 'chromium',
    headless: true,
    screenshot: 'only-on-failure',
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
  },
});
