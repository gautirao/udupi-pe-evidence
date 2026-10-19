import { defineConfig } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { assertSpecialistTarget, denyLabelFor, isLoopbackHostname } from './scripts/e2e/specialist-suite.mjs';

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

// LEGACY config, LOOPBACK-ONLY by CONFIG-LOAD ENV FENCE (#2850 PR-7, Codex r1 F2). There is no default target: PLAYWRIGHT_BASE_URL and
// BACKEND_BASE_URL are REQUIRED and must be loopback, and every other target env var the kept legacy specs / global-setup /
// global-teardown read must ALSO be loopback WHEN SET (VITE_SUPABASE_URL, FRONTEND_BASE_URL, VITE_API_BASE_URL, OPENSEARCH_URL,
// SUPABASE_DB_HOST); otherwise this file throws at load, which also refuses `playwright test --list`. Unset is allowed (the specs
// fall back to loopback defaults for those). WHAT THIS DOES NOT ENFORCE: it is a config-load check on env vars only, not a runtime
// request guard. Hard-coded hosts inside the (non-editable) spec files, and DB connection details a spec reads from a FILE, are not
// covered; they are listed in docs/testing/e2e-pr7-specialist-amendment.md and tracked in #2854. The authoritative gate is
// `npm run test:e2e:gate`.
assertSpecialistTarget(process.env, 'playwright.config.ts');

// Alternate legacy targets consumed independently of the two required base URLs (enumeration + method:
// .claude/handoffs/issue-2850/evidence/codex1-f2-env-enumeration.txt). URL-valued vars and a bare-host var are checked separately.
const LEGACY_ALIAS_URL_VARS = ['FRONTEND_BASE_URL', 'VITE_API_BASE_URL', 'OPENSEARCH_URL'] as const;
const LEGACY_ALIAS_HOST_VARS = ['SUPABASE_DB_HOST'] as const;

function assertLegacyAliasTargets(env: NodeJS.ProcessEnv, tag: string): void {
  const refuse = (name: string, raw: string, host: string, why: string): never => {
    throw new Error(
      `[${tag}] ${name} ("${raw}") has host "${host}", which ${why}. The legacy Playwright config is LOOPBACK-ONLY: ` +
      `unset ${name} or point it at localhost / 127.0.0.0/8 / [::1].`,
    );
  };
  const checkHost = (name: string, raw: string, host: string): void => {
    const deny = denyLabelFor(host);
    if (deny) refuse(name, raw, host, `is a production/shared/hosted target (${deny})`);
    if (!isLoopbackHostname(host)) refuse(name, raw, host, 'is not a recognised loopback address');
  };
  for (const name of LEGACY_ALIAS_URL_VARS) {
    const raw = env[name];
    if (raw === undefined || raw.trim() === '') continue;
    let u: URL;
    try {
      u = new URL(raw.trim());
    } catch (err) {
      throw new Error(`[${tag}] ${name} ("${raw}") is not a parseable URL (${String(err)}). Unset it or use an explicit loopback URL.`);
    }
    if (!/^https?:$/.test(u.protocol)) throw new Error(`[${tag}] ${name} ("${raw}") must be an http(s) URL.`);
    checkHost(name, raw, u.hostname);
  }
  for (const name of LEGACY_ALIAS_HOST_VARS) {
    const raw = env[name];
    if (raw === undefined || raw.trim() === '') continue;
    checkHost(name, raw, raw.trim().replace(/^\[|\]$/g, ''));
  }
}
assertLegacyAliasTargets(process.env, 'playwright.config.ts');

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/specialist/**'],
  timeout: 30_000,
  retries: 0,
  workers: 2,
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL,
    headless: true,
    screenshot: 'only-on-failure',
    ...(process.env.SLOW_MO ? { launchOptions: { slowMo: Number(process.env.SLOW_MO) } } : {}),
  },
  projects: [
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
