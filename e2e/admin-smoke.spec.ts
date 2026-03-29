/**
 * Admin Route Smoke — verifies the admin persona can reach key admin pages
 * and that unauthenticated users are redirected away.
 *
 * Covers:
 *   A1 — admin can access /admin/listings/pending (Pending Approval queue)
 *   A2 — admin can access /admin/localities (Locality Normalizer — Sprint 12)
 *   A3 — admin can access /admin/listings (all listings view)
 *   A4 — unauthenticated user is redirected away from /admin/listings/pending
 *
 * Run locally:
 *   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=... npm run test:e2e -- e2e/admin-smoke.spec.ts
 *
 * A1–A3 require ADMIN_EMAIL / ADMIN_PASSWORD. A4 requires no credentials.
 */

import { test, expect } from '@playwright/test';
import { hasRealCredentials } from './helpers';

const adminEmail = process.env.ADMIN_EMAIL ?? '';
const adminPassword = process.env.ADMIN_PASSWORD ?? '';
const hasAdminCreds = hasRealCredentials(adminEmail, adminPassword);

// ---------------------------------------------------------------------------
// A1–A3 — Admin-authenticated tests
// ---------------------------------------------------------------------------
test.describe('admin-authenticated', () => {
  test.use({ storageState: 'e2e/fixtures/admin-auth.json' });

  // ---------------------------------------------------------------------------
  // A1 — Admin can access /admin/listings/pending
  // ---------------------------------------------------------------------------
  test('A1 — admin can access /admin/listings/pending (Pending Approval queue)', async ({ page }) => {
    test.skip(!hasAdminCreds, 'ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping A1');

    await page.goto('/admin/listings/pending');
    await page.waitForLoadState('domcontentloaded');

    // Must stay on the admin route (not redirect to /auth)
    await expect(page).toHaveURL(/\/admin\/listings\/pending/, { timeout: 8_000 });

    // No error boundary
    await expect(
      page.locator('text=Something went wrong. Please refresh the page.'),
    ).toHaveCount(0);

    // "Pending Approval" heading must appear
    await expect(
      page.getByText(/pending approval/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  // ---------------------------------------------------------------------------
  // A2 — Admin can access /admin/localities (Locality Normalizer)
  // ---------------------------------------------------------------------------
  test('A2 — admin can access /admin/localities (Locality Normalizer)', async ({ page }) => {
    test.skip(!hasAdminCreds, 'ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping A2');

    await page.goto('/admin/localities');
    await page.waitForLoadState('domcontentloaded');

    await expect(page).toHaveURL(/\/admin\/localities/, { timeout: 8_000 });

    await expect(
      page.locator('text=Something went wrong. Please refresh the page.'),
    ).toHaveCount(0);

    await expect(
      page.getByText(/locality normalizer/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  // ---------------------------------------------------------------------------
  // A3 — Admin can access /admin/listings (all listings view)
  // ---------------------------------------------------------------------------
  test('A3 — admin can access /admin/listings (all listings view)', async ({ page }) => {
    test.skip(!hasAdminCreds, 'ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping A3');

    await page.goto('/admin/listings');
    await page.waitForLoadState('domcontentloaded');

    await expect(page).toHaveURL(/\/admin\/listings$/, { timeout: 8_000 });

    await expect(
      page.locator('text=Something went wrong. Please refresh the page.'),
    ).toHaveCount(0);

    // Page must render some content — either a listings table or an empty state message
    // (either is valid; what is NOT valid is a crash or blank page)
    const bodyText = await page.locator('body').textContent();
    expect(bodyText?.trim().length, 'admin/listings body appears blank').toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// A4 — Unauthenticated user is redirected away from admin route
// ---------------------------------------------------------------------------
test('A4 — unauthenticated user is redirected from /admin/listings/pending to /auth', async ({ page }) => {
  // No login — go directly to an admin route
  await page.goto('/admin/listings/pending');

  // ProtectedRoute resolves Supabase auth then redirects unauthenticated users.
  await expect(page).toHaveURL(/\/auth/, { timeout: 10_000 });

  // Admin content must not be rendered
  await expect(page.getByText(/pending approval/i)).toHaveCount(0);
});
