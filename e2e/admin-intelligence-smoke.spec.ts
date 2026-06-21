/**
 * Admin Intelligence Validator Smoke — E2E tests for /admin/intelligence.
 *
 * Covers:
 *   AI1 — Admin can load /admin/intelligence; table or empty-state renders (no crash).
 *   AI2 — Demand-events and top-gaps columns render "—" not "0" when data is absent.
 *   AI3 — Unauthenticated user is redirected away from /admin/intelligence to /auth.
 *
 * Auth pattern mirrors admin-smoke.spec.ts:
 *   AI1/AI2 use admin storageState fixture (requires ADMIN_EMAIL / ADMIN_PASSWORD to have
 *            been previously captured into e2e/fixtures/admin-auth.json).
 *   AI3      uses no auth — goes directly to the route and asserts redirect.
 *
 * Run targeted:
 *   npx playwright test e2e/admin-intelligence-smoke.spec.ts
 */

import { test, expect } from '@playwright/test';
import { hasRealCredentials } from './helpers';

const adminEmail    = process.env.ADMIN_EMAIL    ?? '';
const adminPassword = process.env.ADMIN_PASSWORD ?? '';
const hasAdminCreds = hasRealCredentials(adminEmail, adminPassword);

// ---------------------------------------------------------------------------
// AI1 + AI2 — Admin-authenticated tests
// ---------------------------------------------------------------------------
test.describe('@smoke admin-intelligence-authenticated', () => {
  test.use({ storageState: 'e2e/fixtures/admin-auth.json' });

  // -------------------------------------------------------------------------
  // AI1 — Admin can load /admin/intelligence; page renders without crashing.
  // Either a table with >=1 area row OR a defined empty-state is valid.
  // -------------------------------------------------------------------------
  test('AI1 — admin can load /admin/intelligence and page renders (table or empty state)', async ({ page }) => {
    test.skip(!hasAdminCreds, 'ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping AI1');

    await page.goto('/admin/intelligence');
    await page.waitForLoadState('domcontentloaded');

    // Must stay on /admin/intelligence — not redirect to /auth
    await expect(page).toHaveURL(/\/admin\/intelligence/, { timeout: 8_000 });

    // No error boundary
    await expect(
      page.locator('text=Something went wrong. Please refresh the page.'),
    ).toHaveCount(0);

    // Page heading must be visible
    await expect(
      page.getByText(/intelligence validator/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Wait for the async data fetch to resolve before checking table/empty-state.
    // The loading spinner is present while the API call is in flight; once hidden,
    // either the table or the empty-state will have mounted.
    await page.locator('[aria-label="Loading intelligence data"]').waitFor({
      state: 'hidden',
      timeout: 15_000,
    }).catch(() => {
      // Spinner may not appear at all if data loads instantly — that is fine.
    });

    // Either the table OR the empty-state must be present.
    // Both are valid — what is NOT valid is a crash or blank page.
    const tablePresent      = await page.locator('[data-testid="intelligence-table"]').count();
    const emptyStatePresent = await page.locator('[data-testid="intelligence-empty-state"]').count();

    expect(
      tablePresent + emptyStatePresent,
      'Expected either the intelligence table or the empty-state to render — neither found',
    ).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // AI2 — Demand-events and top-gaps cells render "—" not "0".
  // Only assertable when the table is present (skip gracefully if empty state).
  // -------------------------------------------------------------------------
  test('AI2 — demand-events and top-gaps columns render "—" not "0" when data is absent', async ({ page }) => {
    test.skip(!hasAdminCreds, 'ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping AI2');

    await page.goto('/admin/intelligence');
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/\/admin\/intelligence/, { timeout: 8_000 });

    // Wait for loading spinner to disappear
    await page.locator('[aria-label="Loading intelligence data"]').waitFor({
      state: 'hidden',
      timeout: 15_000,
    }).catch(() => {
      // Spinner may not appear at all if data loads instantly — that is fine.
    });

    const tablePresent = await page.locator('[data-testid="intelligence-table"]').count();
    if (tablePresent === 0) {
      // No rows seeded in this environment — demand-events/top-gaps assertion is N/A.
      // The empty-state must still exist (AI1 covers this).
      test.info().annotations.push({
        type: 'note',
        description: 'Table not present (empty state rendered) — AI2 demand-events/top-gaps assertion skipped as no rows to check',
      });
      return;
    }

    // At least one row is present — every demand-events and top-gaps cell must show "—".
    // The implementation always hard-renders "—" for these M30-pending columns.
    const demandCells = page.locator('[data-testid="cell-demand-events"]');
    const topGapCells = page.locator('[data-testid="cell-top-gaps"]');

    const demandCount = await demandCells.count();
    expect(demandCount, 'Expected at least one demand-events cell in the table').toBeGreaterThan(0);

    for (let i = 0; i < demandCount; i++) {
      await expect(demandCells.nth(i))
        .toHaveText('—', { timeout: 5_000 });
    }

    const topGapCount = await topGapCells.count();
    expect(topGapCount, 'Expected at least one top-gaps cell in the table').toBeGreaterThan(0);

    for (let i = 0; i < topGapCount; i++) {
      await expect(topGapCells.nth(i))
        .toHaveText('—', { timeout: 5_000 });
    }
  });
});

// ---------------------------------------------------------------------------
// AI3 — Unauthenticated user is redirected away from /admin/intelligence
// ---------------------------------------------------------------------------
test('AI3 — unauthenticated user is redirected from /admin/intelligence to /auth', async ({ page }) => {
  // No storageState — direct navigation with no credentials.
  await page.goto('/admin/intelligence');

  // ProtectedRoute resolves Supabase auth then redirects unauthenticated users.
  await expect(page).toHaveURL(/\/auth/, { timeout: 10_000 });

  // Admin content must not be rendered for unauthenticated users.
  await expect(page.getByText(/intelligence validator/i)).toHaveCount(0);
});
