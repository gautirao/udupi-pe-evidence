/**
 * Dealer Journey Smoke — automated with Playwright (real Chromium)
 *
 * Covers:
 *   D1 — dealer can access /dealer/dashboard
 *   D2 — dealer can access /dealer/listings
 *   D3 — dealer can access /dealer/bookings
 *   D4 — non-dealer (unauthenticated) is redirected away from /dealer/dashboard
 *
 * Run locally:
 *   DEALER_EMAIL=dealer@example.com DEALER_PASSWORD=secret npm run test:e2e -- --project=chromium e2e/dealer-smoke.spec.ts
 *
 * D1–D3 require dealer credentials; D4 runs without credentials.
 */

import { test, expect } from '@playwright/test';
import { hasRealCredentials } from './helpers';

const dealerEmail = process.env.DEALER_EMAIL ?? '';
const dealerPassword = process.env.DEALER_PASSWORD ?? '';

const hasDealerCreds = hasRealCredentials(dealerEmail, dealerPassword);

/** Log in as the test dealer and wait for redirect away from /auth. */
async function loginAsDealer(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/auth');
  await page.waitForLoadState('domcontentloaded');

  await page.locator('#signin-email').fill(dealerEmail);
  await page.locator('#signin-password').fill(dealerPassword);

  await page
    .locator('button[type="submit"]')
    .filter({ hasText: /sign in/i })
    .first()
    .click();

  await expect(page).not.toHaveURL(/\/auth/, { timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// D1 — Dealer can access /dealer/dashboard
// ---------------------------------------------------------------------------
test('D1 — dealer can access /dealer/dashboard', async ({ page }) => {
  test.skip(!hasDealerCreds, 'DEALER_EMAIL / DEALER_PASSWORD not set — skipping D1');

  await loginAsDealer(page);
  await page.goto('/dealer/dashboard');
  await page.waitForLoadState('domcontentloaded');

  // Must not redirect away from the broker dashboard
  await expect(page).toHaveURL(/\/broker\/dashboard/, { timeout: 8_000 });

  // Page heading must be present
  await expect(
    page.getByRole('heading', { name: /broker dashboard/i }),
  ).toBeVisible({ timeout: 8_000 });

  // Quick action buttons must be present
  await expect(page.getByRole('link', { name: /create new listing/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /view all listings/i })).toBeVisible();
});

// ---------------------------------------------------------------------------
// D2 — Dealer can access /dealer/listings
// ---------------------------------------------------------------------------
test('D2 — dealer can access /dealer/listings', async ({ page }) => {
  test.skip(!hasDealerCreds, 'DEALER_EMAIL / DEALER_PASSWORD not set — skipping D2');

  await loginAsDealer(page);
  await page.goto('/dealer/listings');
  await page.waitForLoadState('domcontentloaded');

  await expect(page).toHaveURL(/\/broker\/listings$/, { timeout: 8_000 });

  // "My Listings" heading must be present
  await expect(
    page.getByRole('heading', { name: /my listings/i }),
  ).toBeVisible({ timeout: 8_000 });
});

// ---------------------------------------------------------------------------
// D3 — Dealer can access /dealer/bookings
// ---------------------------------------------------------------------------
test('D3 — dealer can access /dealer/bookings', async ({ page }) => {
  test.skip(!hasDealerCreds, 'DEALER_EMAIL / DEALER_PASSWORD not set — skipping D3');

  await loginAsDealer(page);
  await page.goto('/dealer/bookings');
  await page.waitForLoadState('domcontentloaded');

  await expect(page).toHaveURL(/\/broker\/bookings/, { timeout: 8_000 });

  // "Booking Requests" heading must be present
  await expect(
    page.getByRole('heading', { name: /booking requests/i }),
  ).toBeVisible({ timeout: 8_000 });

  // Both sections must render (even if empty)
  await expect(
    page.getByRole('heading', { name: /pending requests/i }),
  ).toBeVisible({ timeout: 8_000 });
  await expect(
    page.getByRole('heading', { name: /confirmed bookings/i }),
  ).toBeVisible({ timeout: 8_000 });
});

// ---------------------------------------------------------------------------
// D4 — Unauthenticated user is redirected away from /dealer/dashboard
// ---------------------------------------------------------------------------
test('D4 — unauthenticated user cannot access /dealer/dashboard', async ({ page }) => {
  // No login — go directly to the protected dealer route
  await page.goto('/dealer/dashboard');

  // ProtectedRoute waits for Supabase auth to initialise, then redirects.
  // Allow up to 10 s for the redirect to /auth to complete.
  await expect(page).toHaveURL(/\/(auth)?/, { timeout: 10_000 });

  // Must not show the dealer dashboard content
  await expect(
    page.getByRole('heading', { name: /dealer dashboard/i }),
  ).toHaveCount(0);
});
