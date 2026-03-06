/**
 * Navigation by Role — verifies each persona sees the correct nav links after login,
 * and that the 404 page renders for unknown routes.
 *
 * Covers:
 *   N1 — user role: Insights, My Saved Areas, My Bookings visible; no dealer/admin links
 *   N2 — admin role: Administrator label + admin nav links visible; no dealer links
 *   N3 — 404: navigating to an unknown route renders the Not Found page
 *
 * Run locally:
 *   SMOKE_USER_EMAIL=user@example.com SMOKE_USER_PASSWORD=... \
 *   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=... \
 *   npm run test:e2e -- e2e/nav-roles.spec.ts
 */

import { test, expect } from '@playwright/test';

const userEmail = process.env.SMOKE_USER_EMAIL ?? '';
const userPassword = process.env.SMOKE_USER_PASSWORD ?? '';
const adminEmail = process.env.ADMIN_EMAIL ?? '';
const adminPassword = process.env.ADMIN_PASSWORD ?? '';

const hasUserCreds = Boolean(userEmail && userPassword);
const hasAdminCreds = Boolean(adminEmail && adminPassword);

async function loginAs(
  page: import('@playwright/test').Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto('/auth');
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#signin-email').fill(email);
  await page.locator('#signin-password').fill(password);
  await page
    .locator('button[type="submit"]')
    .filter({ hasText: /sign in/i })
    .first()
    .click();
  await expect(page).not.toHaveURL(/\/auth/, { timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// N1 — User role: correct nav links after login
// ---------------------------------------------------------------------------
test('N1 — user role: Insights, My Saved Areas, My Bookings visible; no dealer or admin links', async ({ page }) => {
  test.skip(!hasUserCreds, 'SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD not set — skipping N1');

  await loginAs(page, userEmail, userPassword);

  // Wait for auth context to settle so nav renders with the correct role
  await page.waitForTimeout(2_000);

  // User nav items must be visible
  await expect(page.getByRole('link', { name: /^insights$/i }).first()).toBeVisible({ timeout: 8_000 });
  await expect(page.getByRole('link', { name: /my saved areas/i })).toBeVisible({ timeout: 8_000 });
  await expect(page.getByRole('link', { name: /my bookings/i })).toBeVisible({ timeout: 8_000 });

  // Dealer-only links must NOT appear
  await expect(page.getByRole('link', { name: /^my listings$/i })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /new listing/i })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /^bookings$/i })).toHaveCount(0);

  // Admin-only links must NOT appear
  await expect(page.getByRole('link', { name: /pending approval/i })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /feed runs/i })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /locality normalizer/i })).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// N2 — Admin role: admin nav + role label visible; no dealer links
// ---------------------------------------------------------------------------
test('N2 — admin role: Administrator label and admin nav links visible; no dealer links', async ({ page }) => {
  test.skip(!hasAdminCreds, 'ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping N2');

  await loginAs(page, adminEmail, adminPassword);
  await page.waitForTimeout(2_000);

  // Role label in the header
  await expect(page.getByText(/administrator/i).first()).toBeVisible({ timeout: 8_000 });

  // Admin nav links must be visible (desktop sidebar — Playwright viewport is 1280px wide)
  await expect(
    page.getByRole('link', { name: /pending approval/i }).first(),
  ).toBeVisible({ timeout: 8_000 });
  await expect(
    page.getByRole('link', { name: /locality normalizer/i }).first(),
  ).toBeVisible({ timeout: 8_000 });
  await expect(
    page.getByRole('link', { name: /feed runs/i }).first(),
  ).toBeVisible({ timeout: 8_000 });

  // Dealer-only links must NOT appear
  await expect(page.getByRole('link', { name: /^my listings$/i })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /new listing/i })).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// N3 — Unknown route renders the 404 Not Found page
//      Does not require authentication (the * route is outside ProtectedRoute).
// ---------------------------------------------------------------------------
test('N3 — unknown route renders 404 Not Found page', async ({ page }) => {
  await page.goto('/this-route-does-not-exist-e2e-abc123');
  await page.waitForLoadState('domcontentloaded');

  await expect(page.getByText('404')).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText(/page not found/i)).toBeVisible({ timeout: 8_000 });
});
