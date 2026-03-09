/**
 * Map Filters — map page load, BHK filter, text search, insights page
 *
 * Covers:
 *   M1 — Map page loads; filter panel and search input visible
 *   M2 — BHK filter button activates Clear, then Clear resets state
 *   M3 — Text search accepts query and Clear resets it
 *   M4 — Insights page loads with heading and no error boundary
 *
 * Run locally:
 *   SMOKE_USER_EMAIL=you@example.com SMOKE_USER_PASSWORD=secret npm run test:e2e
 *
 * All tests skip gracefully when SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD are not set.
 */

import { test, expect } from '@playwright/test';

const userEmail = process.env.SMOKE_USER_EMAIL ?? '';
const userPassword = process.env.SMOKE_USER_PASSWORD ?? '';
const hasUserCreds = Boolean(userEmail && userPassword);

async function loginAsUser(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/auth');
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#signin-email').fill(userEmail);
  await page.locator('#signin-password').fill(userPassword);
  await page
    .locator('button[type="submit"]')
    .filter({ hasText: /sign in/i })
    .first()
    .click();
  await expect(page).not.toHaveURL(/\/auth/, { timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// M1 — Map page loads; filter panel and search input visible
// ---------------------------------------------------------------------------
test('M1 — map page loads with filter panel and search input', async ({ page }) => {
  test.skip(!hasUserCreds, 'SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD not set — skipping M1');

  await loginAsUser(page);
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page
    .waitForSelector('p:has-text("Loading...")', { state: 'hidden', timeout: 15_000 })
    .catch(() => {});

  // Filters card heading
  await expect(page.getByText('Filters').first()).toBeVisible({ timeout: 10_000 });

  // Search input
  await expect(page.getByPlaceholder('Search listings...')).toBeVisible({ timeout: 10_000 });

  // Property type section — at least the "Land" label is present
  await expect(page.locator('label[for="type-land"]')).toBeVisible({ timeout: 10_000 });

  // Bedrooms section label
  await expect(page.getByText('Bedrooms (BHK)').first()).toBeVisible({ timeout: 10_000 });
});

// ---------------------------------------------------------------------------
// M2 — BHK filter toggle activates Clear, then Clear resets it
// ---------------------------------------------------------------------------
test('M2 — BHK filter toggle activates Clear button, Clear resets state', async ({ page }) => {
  test.skip(!hasUserCreds, 'SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD not set — skipping M2');

  await loginAsUser(page);
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page
    .waitForSelector('p:has-text("Loading...")', { state: 'hidden', timeout: 15_000 })
    .catch(() => {});

  // Wait for BHK section to appear
  await expect(page.getByText('Bedrooms (BHK)').first()).toBeVisible({ timeout: 10_000 });

  // Click the "2" BHK button (exact text "2")
  const btn2 = page.getByRole('button', { name: '2', exact: true }).first();
  await expect(btn2).toBeVisible({ timeout: 10_000 });
  await btn2.click();

  // Clear button must appear (hasActiveFilters is now true)
  const clearBtn = page.getByRole('button', { name: /clear/i }).first();
  await expect(clearBtn).toBeVisible({ timeout: 5_000 });

  // Click Clear — resets all filters
  await clearBtn.click();

  // Clear button must disappear
  await expect(page.getByRole('button', { name: /clear/i })).toHaveCount(0, { timeout: 5_000 });
});

// ---------------------------------------------------------------------------
// M3 — Text search accepts query and Clear resets it
// ---------------------------------------------------------------------------
test('M3 — text search accepts query and Clear resets it', async ({ page }) => {
  test.skip(!hasUserCreds, 'SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD not set — skipping M3');

  await loginAsUser(page);
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page
    .waitForSelector('p:has-text("Loading...")', { state: 'hidden', timeout: 15_000 })
    .catch(() => {});

  const searchInput = page.getByPlaceholder('Search listings...');
  await expect(searchInput).toBeVisible({ timeout: 10_000 });

  // Type a query
  await searchInput.fill('udupi');
  await expect(searchInput).toHaveValue('udupi');

  // Clear button appears (searchQuery is now set → hasActiveFilters = true)
  const clearBtn = page.getByRole('button', { name: /clear/i }).first();
  await expect(clearBtn).toBeVisible({ timeout: 5_000 });

  // Click Clear — resets search
  await clearBtn.click();
  await expect(searchInput).toHaveValue('', { timeout: 5_000 });

  // Clear button must disappear
  await expect(page.getByRole('button', { name: /clear/i })).toHaveCount(0, { timeout: 5_000 });
});

// ---------------------------------------------------------------------------
// M4 — Insights page loads with heading and no error boundary
// ---------------------------------------------------------------------------
test('M4 — Insights page loads with Market Insights heading and no error', async ({ page }) => {
  test.skip(!hasUserCreds, 'SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD not set — skipping M4');

  await loginAsUser(page);
  await page.goto('/insights');
  await page.waitForLoadState('domcontentloaded');
  await page
    .waitForSelector('p:has-text("Loading...")', { state: 'hidden', timeout: 15_000 })
    .catch(() => {});

  // No Sentry/error boundary fallback
  await expect(
    page.locator('text=Something went wrong. Please refresh the page.'),
  ).toHaveCount(0);

  // Page heading
  await expect(
    page.getByRole('heading', { name: /market insights/i }),
  ).toBeVisible({ timeout: 10_000 });

  // Saved Areas panel
  await expect(page.getByText('Saved Areas').first()).toBeVisible({ timeout: 10_000 });
});
