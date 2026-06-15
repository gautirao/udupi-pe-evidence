/**
 * Auth Sign-In/Sign-Out Journey — A1–A13 (#1509)
 *
 * Covers the real sign-in/sign-out round-trip:
 *   A1  — logged-out homepage shows Sign In button (not avatar)
 *   A2  — sign in from homepage Sign In link
 *   A3  — after sign-in, navigates back to homepage (/)
 *   A4  — homepage shows signed-in user/avatar
 *   A5  — page refresh keeps signed-in state
 *   A6  — sign out from homepage → Sign In button shown immediately
 *   A7  — page refresh after sign-out stays signed out
 *   A8  — /discover Sign In link carries returnTo param
 *   A9  — sign in from Discover (via returnTo) → returns to same Discover URL
 *   A10 — Discover page shows signed-in state (avatar in AppLayout header)
 *   A11 — sign out from Discover (AppLayout) → navigates to homepage /
 *   A12 — homepage shows Sign In after sign-out-from-Discover
 *   A13 — page refresh after sign-out-from-Discover stays signed out
 *
 * Requires SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD (loaded from .env.e2e).
 * All tests skip gracefully when credentials are absent.
 *
 * Run locally:
 *   npx playwright test e2e/auth-journey-1509.spec.ts --project=full
 */

import { test, expect } from '@playwright/test';
import { hasRealCredentials } from './helpers';

const userEmail = process.env.SMOKE_USER_EMAIL ?? '';
const userPassword = process.env.SMOKE_USER_PASSWORD ?? '';
const hasCreds = hasRealCredentials(userEmail, userPassword);

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/** Sign In link/button visible when logged out */
const signInLink = (page: ReturnType<typeof test['info']> extends never ? never : Parameters<Parameters<typeof test>[1]>[0]['page']) =>
  page.locator('a[href*="/auth"]').filter({ hasText: /sign in/i }).first();

/** Avatar button visible when logged in (rounded-full button containing Avatar) */
const avatarButton = (page: Parameters<Parameters<typeof test>[1]>[0]['page']) =>
  page.locator('button.rounded-full, button[class*="rounded-full"]').first();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sign in via the /auth page form, then wait for redirect away from /auth.
 * Does NOT navigate to /auth first — caller should already be there or call
 * page.goto('/auth') beforehand.
 */
async function fillSignInForm(
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
  await expect(page).not.toHaveURL(/\/auth/, { timeout: 15_000 });
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

test.describe('auth-journey-1509: real sign-in/sign-out journey', () => {
  test.beforeEach(async ({ page: _page, context }) => {
    // Clear cookies for full isolation between tests.
    // NOTE: Do NOT use addInitScript for storage clearing — it re-runs on every navigation,
    // which wipes the Supabase auth session (stored in localStorage) on page.reload() and
    // page.goto(), breaking multi-step sign-in journeys. Playwright contexts are already
    // isolated per test, so no further clearing is needed.
    await context.clearCookies();
  });

  // ── A1 ──────────────────────────────────────────────────────────────────
  test('A1 — logged-out homepage shows Sign In button (not avatar)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Sign In link must be visible
    await expect(signInLink(page)).toBeVisible({ timeout: 10_000 });

    // Avatar (rounded-full button) must NOT be present
    await expect(avatarButton(page)).toHaveCount(0);
  });

  // ── A2 + A3 + A4 ────────────────────────────────────────────────────────
  test('A2–A4 — sign in from homepage, lands on /, avatar shown', async ({ page }) => {
    test.skip(!hasCreds, 'SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD not configured');

    // A1 precondition: start from homepage
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // A2: click Sign In link
    const link = page.locator('a[href*="/auth"]').filter({ hasText: /sign in/i }).first();
    await expect(link).toBeVisible({ timeout: 10_000 });
    await link.click();

    // Should arrive at /auth
    await page.waitForURL(/\/auth/, { timeout: 10_000 });

    // Fill credentials and submit
    await fillSignInForm(page, userEmail, userPassword);

    // A3: after sign-in, navigates to homepage (returnTo=/ from homepage Sign In link)
    await page.waitForURL('/', { timeout: 15_000 });

    // A4: homepage shows avatar (not Sign In button)
    await expect(avatarButton(page)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('a[href*="/auth"]').filter({ hasText: /sign in/i })).toHaveCount(0);
  });

  // ── A5 ──────────────────────────────────────────────────────────────────
  test('A5 — page refresh keeps signed-in state (avatar still shown)', async ({ page }) => {
    test.skip(!hasCreds, 'SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD not configured');

    // Sign in first
    await page.goto('/auth');
    await fillSignInForm(page, userEmail, userPassword);
    await page.waitForURL('/', { timeout: 15_000 });

    // Reload
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // Avatar must still be present after reload
    await expect(avatarButton(page)).toBeVisible({ timeout: 10_000 });
  });

  // ── A6 + A7 ─────────────────────────────────────────────────────────────
  test('A6–A7 — sign out from homepage: Sign In shown immediately, persists after refresh', async ({ page }) => {
    test.skip(!hasCreds, 'SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD not configured');

    // Sign in
    await page.goto('/auth');
    await fillSignInForm(page, userEmail, userPassword);
    await page.waitForURL('/', { timeout: 15_000 });

    // A6: open avatar dropdown and click Sign out
    const avatar = avatarButton(page);
    await expect(avatar).toBeVisible({ timeout: 10_000 });
    await avatar.click();

    const signOutItem = page.locator('[role="menuitem"]').filter({ hasText: /sign out/i }).first();
    await expect(signOutItem).toBeVisible({ timeout: 5_000 });
    await signOutItem.click();

    // After sign-out the fix navigates to /
    await page.waitForURL('/', { timeout: 10_000 });

    // Sign In button must be visible immediately
    await expect(signInLink(page)).toBeVisible({ timeout: 10_000 });

    // A7: page refresh stays signed out
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await expect(signInLink(page)).toBeVisible({ timeout: 10_000 });
    await expect(avatarButton(page)).toHaveCount(0);
  });

  // ── A8 ──────────────────────────────────────────────────────────────────
  test('A8 — /discover Sign In link carries returnTo with Discover URL', async ({ page }) => {
    const discoverUrl = '/discover?city=udupi&journey=area-first';
    await page.goto(discoverUrl);
    await page.waitForLoadState('domcontentloaded');

    // Find any Sign In link that includes returnTo
    const link = page.locator('a[href*="/auth?returnTo"]').filter({ hasText: /sign in/i }).first();
    await expect(link).toBeVisible({ timeout: 10_000 });

    const href = await link.getAttribute('href');
    const decoded = decodeURIComponent(href ?? '');
    expect(decoded).toContain('/auth?returnTo=/discover');
    expect(decoded).toContain('city=udupi');
  });

  // ── A9 + A10 ────────────────────────────────────────────────────────────
  test('A9–A10 — sign in from Discover returnTo link returns to same Discover URL with avatar', async ({ page }) => {
    test.skip(!hasCreds, 'SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD not configured');

    const discoverUrl = '/discover?city=udupi&journey=area-first';
    await page.goto(discoverUrl);
    await page.waitForLoadState('domcontentloaded');

    // A8/A9 precondition: click the Sign In link with returnTo
    const link = page.locator('a[href*="/auth?returnTo"]').filter({ hasText: /sign in/i }).first();
    await expect(link).toBeVisible({ timeout: 10_000 });
    await link.click();

    await page.waitForURL(/\/auth/, { timeout: 10_000 });

    // Sign in
    await fillSignInForm(page, userEmail, userPassword);

    // A9: should navigate back to /discover with all query params preserved
    await page.waitForURL(/\/discover/, { timeout: 15_000 });
    const currentUrl = page.url();
    expect(currentUrl).toContain('city=udupi');
    expect(currentUrl).toContain('journey=area-first');

    // A10: AppLayout avatar visible on Discover page
    await expect(avatarButton(page)).toBeVisible({ timeout: 10_000 });
  });

  // ── A11 + A12 + A13 ─────────────────────────────────────────────────────
  test('A11–A13 — sign out from Discover: navigates to homepage, Sign In shown, persists', async ({ page }) => {
    test.skip(!hasCreds, 'SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD not configured');

    // Sign in first
    await page.goto('/auth');
    await fillSignInForm(page, userEmail, userPassword);
    await page.waitForURL('/', { timeout: 15_000 });

    // Navigate to Discover
    await page.goto('/discover?city=udupi&journey=area-first');
    await page.waitForLoadState('domcontentloaded');

    // Avatar in AppLayout header
    const avatar = avatarButton(page);
    await expect(avatar).toBeVisible({ timeout: 10_000 });
    await avatar.click();

    const signOutItem = page.locator('[role="menuitem"]').filter({ hasText: /sign out/i }).first();
    await expect(signOutItem).toBeVisible({ timeout: 5_000 });
    await signOutItem.click();

    // A11: fix — sign-out from /discover must navigate to / (not stay on /discover)
    await page.waitForURL('/', { timeout: 10_000 });

    // A12: homepage shows Sign In button
    await expect(signInLink(page)).toBeVisible({ timeout: 10_000 });

    // A13: page refresh stays signed out
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await expect(signInLink(page)).toBeVisible({ timeout: 10_000 });
    await expect(avatarButton(page)).toHaveCount(0);
  });
});
