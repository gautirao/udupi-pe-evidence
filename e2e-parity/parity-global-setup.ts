/**
 * Playwright global setup for the Discover-V2 parity harness (issue #2076,
 * Stage 1) — playwright.parity.config.ts's `globalSetup`.
 *
 * This is DELIBERATELY narrower than e2e/global-setup.ts, which this file
 * must never be confused with:
 *
 *   - e2e/global-setup.ts authenticates AND creates/approves a real listing
 *     (a data MUTATION) AND writes an EMPTY storageState + continues on auth
 *     failure (a silent degrade-to-anonymous).
 *   - parity-global-setup.ts does storageState minting ONLY — no listing
 *     creation, no PATCH/POST/PUT of any kind against the backend — and
 *     FAILS FAST AND LOUD (throws, aborting the whole run) if a configured
 *     role's token cannot be obtained. It never writes an empty storageState
 *     for a role that has credentials configured; that would file an
 *     anonymous render as an authenticated parity baseline, a false MATCH
 *     nothing downstream would catch (see the handoff's EMPTY-STORAGESTATE
 *     TRAP note).
 *
 * It also guards the baseURL trap: playwright.config.ts's default baseURL
 * silently falls back to the DEPLOYED site
 * (https://udupi-property-explorer.pages.dev) when PLAYWRIGHT_BASE_URL is
 * unset. A parity run that silently did the same thing would produce
 * baselines against hosted Bangalore data while believing it was testing a
 * local fixture. This file requires PLAYWRIGHT_BASE_URL to be set
 * explicitly and throws if it is absent — see requireExplicitBaseUrl below.
 *
 * A role with NO credentials configured at all (e.g. no ADMIN_EMAIL set
 * because a given parity run genuinely never needs an admin arm) is fine —
 * that role is simply not resolved and any spec that needs it will fail
 * loudly when it tries to load a fixture file that does not exist, which is
 * itself a correct "you asked for auth this run doesn't have" signal. What
 * this file refuses to do is accept a *configured but failing* role and
 * paper over it.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

interface ParityRole {
  name: 'anon' | 'broker' | 'admin' | 'user';
  email: string;
  password: string;
}

/** Throws loudly if PLAYWRIGHT_BASE_URL / BACKEND_BASE_URL are not explicitly set. See module docstring. */
function requireExplicitEnvironment(): { frontend: string; backend: string } {
  const frontend = process.env.PLAYWRIGHT_BASE_URL;
  const backend = process.env.BACKEND_BASE_URL;

  const missing: string[] = [];
  if (!frontend) missing.push('PLAYWRIGHT_BASE_URL');
  if (!backend) missing.push('BACKEND_BASE_URL');

  if (missing.length > 0) {
    throw new Error(
      `[parity-global-setup] Missing required environment variable(s): ${missing.join(', ')}. ` +
      'The parity harness NEVER falls back to the deployed site default the way ' +
      'e2e/global-setup.ts does — a silent fallback here would file baselines ' +
      'against the wrong environment. Set both explicitly (e.g. via .env.e2e or ' +
      'the shell) before running playwright.parity.config.ts.',
    );
  }

  // Non-null by construction above.
  return { frontend: frontend as string, backend: backend as string };
}

export default async function parityGlobalSetup(): Promise<void> {
  const { frontend, backend } = requireExplicitEnvironment();

  // Log the resolved URLs BEFORE any test runs, per the handoff's explicit
  // requirement — this is the mechanism that makes a wrong-environment run
  // visible in the test log rather than discovered after the fact.
  console.log(`[parity-global-setup] Resolved frontend base URL: ${frontend}`);
  console.log(`[parity-global-setup] Resolved backend base URL: ${backend}`);

  await saveStorageStates(frontend);
}

/**
 * Mints storageState for each configured role by logging in through the
 * real UI (same mechanism as e2e/global-setup.ts's saveStorageStates, but
 * WITHOUT the "write empty state and continue" fallback for a role that has
 * credentials configured).
 *
 * A role with no credentials at all is skipped (no fixture file written for
 * it) — this is a legitimate "this run doesn't exercise that auth arm"
 * configuration, not a failure.
 *
 * A role WITH credentials that fails to authenticate is a hard failure: this
 * function throws and the whole run aborts. See module docstring for why.
 */
async function saveStorageStates(frontend: string): Promise<void> {
  if (!fs.existsSync(FIXTURES_DIR)) {
    fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  }

  const roles: ParityRole[] = [
    {
      name: 'broker',
      email: process.env.PARITY_BROKER_EMAIL ?? '',
      password: process.env.PARITY_BROKER_PASSWORD ?? '',
    },
    {
      name: 'admin',
      email: process.env.PARITY_ADMIN_EMAIL ?? '',
      password: process.env.PARITY_ADMIN_PASSWORD ?? '',
    },
    {
      name: 'user',
      email: process.env.PARITY_USER_EMAIL ?? '',
      password: process.env.PARITY_USER_PASSWORD ?? '',
    },
  ];

  const configuredRoles = roles.filter(role => role.email && role.password);

  if (configuredRoles.length === 0) {
    console.log(
      '[parity-global-setup] No PARITY_*_EMAIL/PASSWORD pairs configured — ' +
      'this run will only be able to exercise anon-arm parity states. ' +
      'No storageState fixture files were written.',
    );
    return;
  }

  const browser = await chromium.launch();
  try {
    for (const role of configuredRoles) {
      const filePath = path.join(FIXTURES_DIR, `${role.name}-auth.json`);
      const context = await browser.newContext({ baseURL: frontend });
      const page = await context.newPage();

      try {
        await page.goto('/auth');
        await page.waitForLoadState('domcontentloaded');
        await page.locator('#signin-email').waitFor({ state: 'visible', timeout: 15_000 });
        await page.locator('#signin-email').fill(role.email);
        await page.locator('#signin-password').fill(role.password);
        await page
          .locator('button[type="submit"]')
          .filter({ hasText: /sign in/i })
          .first()
          .click();
        await page.waitForURL((url) => !url.pathname.startsWith('/auth'), { timeout: 15_000 });
        await context.storageState({ path: filePath });
        console.log(`[parity-global-setup] Saved storageState for ${role.name}: ${filePath}`);
      } catch (err) {
        // FAIL FAST AND LOUD — never write an empty storageState here.
        // A configured-but-failing role must abort the run, not silently
        // downgrade every spec that requests it to an anonymous render
        // filed as an authenticated baseline.
        throw new Error(
          `[parity-global-setup] Authentication FAILED for configured role "${role.name}" ` +
          `(${role.email}): ${String(err)}. This is a hard failure by design — ` +
          'the parity harness never substitutes an empty storageState for a role ' +
          'that has credentials configured. Fix the credentials/environment, or ' +
          'unset PARITY_' + role.name.toUpperCase() + '_EMAIL/PASSWORD if this run ' +
          'genuinely does not need this role.',
        );
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
