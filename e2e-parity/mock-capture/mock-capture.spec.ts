/**
 * Mock-capture spec for issue #2076 Amendment-1 AC12.
 *
 * Run via playwright.mock-capture.config.ts ONLY — this file is NOT picked up by
 * playwright.config.ts (full/smoke/journey testDir is ./e2e). It WOULD otherwise be picked up by
 * playwright.parity.config.ts too (testDir ./e2e-parity is recursive, so its default testMatch
 * would discover this file) — that config now carries an explicit
 * `testIgnore: '**\/mock-capture/**'` for exactly this reason, so this harness never runs under
 * parity-global-setup.ts's app/backend authentication (see playwright.mock-capture.config.ts's
 * docstring for why the two configs must not share a globalSetup).
 *
 * One `test()` per MOCK_STATES entry, gated to the matching viewport project by
 * `testInfo.project.name` (same pattern e2e-parity/pilot-a01-city-root.spec.ts already uses to
 * branch desktop vs mobile behaviour) — so `playwright test --project=mock-desktop --grep <id>`
 * or `--project=mock-mobile` can run a single capture in isolation.
 *
 * ZERO toHaveScreenshot calls — these are audit captures via `page.screenshot()`, not Playwright
 * snapshot baselines. See runCapture in support/capture-runner.ts for the screenshot call.
 */

import { test } from '@playwright/test';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MOCK_STATES } from './support/manifest-states';
import { runCapture } from './support/capture-runner';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, '../../docs/audit/issue-2076/mock-audit');

for (const state of MOCK_STATES) {
  const expectedProject = state.viewport === 'mobile' ? 'mock-mobile' : 'mock-desktop';

  test(`mock-capture: ${state.id} [${state.viewport}]`, async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== expectedProject,
      `${state.id} is a ${state.viewport} capture; only runs under the ${expectedProject} project (current: ${testInfo.project.name}).`,
    );

    await runCapture(page, state, OUTPUT_DIR);
  });
}
