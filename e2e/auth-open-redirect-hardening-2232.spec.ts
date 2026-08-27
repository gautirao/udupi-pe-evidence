/**
 * Open-redirect hardening regression — getSafeReturnTo (#2232)
 *
 * Real-browser proof that a hostile `returnTo` value can never move the
 * browser off the local app origin once the post-auth redirect fires,
 * covering the 5 bypass variants from issue #2232:
 *   - "/\evil.com"        (backslash-prefixed)
 *   - "/\/evil.com"       (backslash + slash prefixed)
 *   - "/HTTP://evil.com"  (case-variant scheme prefix)
 *   - "//evil.com"        (protocol-relative)
 *   - "https://evil.com"  (absolute URL)
 *
 * This is a browser-origin check, not a mocked-router check: the existing
 * Vitest suites (authUtils.getSafeReturnTo.test.ts, Auth/AuthCallback
 * .consumerInvariant.test.tsx) already prove the sanitiser's return value and
 * that Auth/AuthCallback call it before navigating. This spec instead proves
 * that once react-router's navigate() actually runs in a real browser, the
 * resulting page never lands on a different origin than the app itself.
 *
 * Requires SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD (loaded from .env.e2e) so
 * the Auth page's post-sign-in redirect effect actually fires (it only runs
 * once `user` is truthy). Skips gracefully when credentials are absent —
 * same convention as e2e/auth-journey-1509.spec.ts. No hosted-Supabase
 * dependency is introduced: this spec adds no new credential requirement,
 * it reuses the same SMOKE_USER_* pair already used by other specs in this
 * suite against whichever Supabase project the local stack is wired to.
 *
 * Run locally:
 *   npx playwright test e2e/auth-open-redirect-hardening-2232.spec.ts --project=full
 */

import { test, expect } from '@playwright/test';
import { hasRealCredentials } from './helpers';

const userEmail = process.env.SMOKE_USER_EMAIL ?? '';
const userPassword = process.env.SMOKE_USER_PASSWORD ?? '';
const hasCreds = hasRealCredentials(userEmail, userPassword);

const HOSTILE_RETURN_TO_VALUES = [
  '/\\evil.com',
  '/\\/evil.com',
  '/HTTP://evil.com',
  '//evil.com',
  'https://evil.com',
];

/**
 * Sign in starting from a page already at /auth?returnTo=<hostile>, without
 * calling page.goto('/auth') again first — that would discard the query
 * string under test. Mirrors the T2 pattern in
 * e2e/canonical/auth-session.canonical.ts.
 */
async function signInFromCurrentAuthPage(
  page: Parameters<Parameters<typeof test>[1]>[0]['page'],
  email: string,
  password: string,
): Promise<void> {
  await page.locator('#signin-email').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('#signin-email').fill(email);
  await page.locator('#signin-password').fill(password);
  await page
    .locator('button[type="submit"]')
    .filter({ hasText: /sign in/i })
    .first()
    .click();
}

test.describe('open-redirect hardening (#2232): hostile returnTo never leaves the app origin', () => {
  test.beforeEach(async ({ context }) => {
    // Full isolation between tests; do NOT use addInitScript for storage
    // clearing — it re-runs on every navigation and would wipe the Supabase
    // session (localStorage) mid-journey. Fresh Playwright context per test
    // is isolation enough.
    await context.clearCookies();
  });

  for (const hostile of HOSTILE_RETURN_TO_VALUES) {
    test(`sign-in with returnTo=${hostile} stays on the local app origin`, async ({ page, baseURL }) => {
      test.skip(!hasCreds, 'SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD not configured');

      const expectedOrigin = new URL(baseURL ?? 'http://localhost:5261').origin;

      await page.goto(`/auth?returnTo=${encodeURIComponent(hostile)}`);
      await page.waitForLoadState('domcontentloaded');

      await signInFromCurrentAuthPage(page, userEmail, userPassword);

      // The sanitiser rejects every hostile value, so Auth.tsx falls back to
      // the role-aware default landing (/discover for a plain signed-in
      // user) instead of ever navigating to the hostile target.
      await page.waitForURL(/\/discover/, { timeout: 15_000 });

      const actualOrigin = await page.evaluate(() => window.location.origin);
      expect(actualOrigin).toBe(expectedOrigin);
      expect(page.url()).not.toContain('evil.com');
    });
  }

  test('sign-in with a safe same-origin returnTo IS honoured (control case)', async ({ page, baseURL }) => {
    test.skip(!hasCreds, 'SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD not configured');

    const expectedOrigin = new URL(baseURL ?? 'http://localhost:5261').origin;

    await page.goto('/auth?returnTo=/discover?city=udupi');
    await page.waitForLoadState('domcontentloaded');

    await signInFromCurrentAuthPage(page, userEmail, userPassword);

    await page.waitForURL(/\/discover\?city=udupi/, { timeout: 15_000 });

    const actualOrigin = await page.evaluate(() => window.location.origin);
    expect(actualOrigin).toBe(expectedOrigin);
  });
});
