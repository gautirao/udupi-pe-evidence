/**
 * Broker Journey Smoke — automated with Playwright (real Chromium)
 *
 * Covers:
 *   D1 — broker can access /broker/dashboard
 *   D2 — broker can access /broker/listings
 *   D3 — broker can access /broker/bookings
 *   D4 — non-broker (unauthenticated) is redirected away from /broker/dashboard
 *
 * Run locally:
 *   BROKER_EMAIL=broker@example.com BROKER_PASSWORD=secret npm run test:e2e -- --project=chromium e2e/broker-smoke.spec.ts
 *
 * D1–D3 require broker credentials; D4 runs without credentials.
 */

import { test, expect } from '@playwright/test';
import { hasRealCredentials } from './helpers';

const brokerEmail = process.env.BROKER_EMAIL ?? process.env.DEALER_EMAIL ?? '';
const brokerPassword = process.env.BROKER_PASSWORD ?? process.env.DEALER_PASSWORD ?? '';

const hasBrokerCreds = hasRealCredentials(brokerEmail, brokerPassword);

// ---------------------------------------------------------------------------
// D1–D3 — Broker-authenticated tests
// ---------------------------------------------------------------------------
test.describe('broker-authenticated', () => {
  test.use({ storageState: 'e2e/fixtures/broker-auth.json' });

  // ---------------------------------------------------------------------------
  // D1 — Broker can access /broker/dashboard
  // ---------------------------------------------------------------------------
  test('D1 — broker can access /broker/dashboard', async ({ page }) => {
    test.skip(!hasBrokerCreds, 'BROKER_EMAIL / BROKER_PASSWORD not set — skipping D1');

    await page.goto('/broker/dashboard');
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
  // D2 — Broker can access /broker/listings
  // ---------------------------------------------------------------------------
  test('D2 — broker can access /broker/listings', async ({ page }) => {
    test.skip(!hasBrokerCreds, 'BROKER_EMAIL / BROKER_PASSWORD not set — skipping D2');

    await page.goto('/broker/listings');
    await page.waitForLoadState('domcontentloaded');

    await expect(page).toHaveURL(/\/broker\/listings$/, { timeout: 8_000 });

    // "My Listings" heading must be present
    await expect(
      page.getByRole('heading', { name: /my listings/i }),
    ).toBeVisible({ timeout: 8_000 });
  });

  // ---------------------------------------------------------------------------
  // D3 — Broker can access /broker/bookings
  // ---------------------------------------------------------------------------
  test('D3 — broker can access /broker/bookings', async ({ page }) => {
    test.skip(!hasBrokerCreds, 'BROKER_EMAIL / BROKER_PASSWORD not set — skipping D3');

    await page.goto('/broker/bookings');
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
});

// ---------------------------------------------------------------------------
// D4 — Unauthenticated user is redirected away from /broker/dashboard
// ---------------------------------------------------------------------------
test('D4 — unauthenticated user cannot access /broker/dashboard', async ({ page }) => {
  // No login — go directly to the protected broker route
  await page.goto('/broker/dashboard');

  // ProtectedRoute waits for Supabase auth to initialise, then redirects.
  // Allow up to 10 s for the redirect to /auth to complete.
  await expect(page).toHaveURL(/\/auth(\?.*)?$/, { timeout: 10_000 });

  // Must not show the broker dashboard content
  await expect(
    page.getByRole('heading', { name: /broker dashboard/i }),
  ).toHaveCount(0);
});
