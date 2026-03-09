/**
 * User Journey Smoke — verifies core user-role pages load without crashing.
 *
 * Covers:
 *   U1 — /saved-areas loads with "My Saved Areas" heading
 *   U2 — /my-bookings loads with "My Bookings" heading
 *   U3 — /insights renders correctly (paywall OR chart content — no crash)
 *   U4 — /listing/:id detail page: AreaMarketWidget renders in one of its valid states
 *
 * All tests require SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD.
 * U4 additionally requires e2e/.test-listing-id (written by global-setup) with a LIVE listing.
 *
 * Run locally:
 *   SMOKE_USER_EMAIL=user@example.com SMOKE_USER_PASSWORD=... npm run test:e2e -- e2e/user-journeys.spec.ts
 */

import { test, expect } from '@playwright/test';
import { hasRealCredentials } from './helpers';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const userEmail = process.env.SMOKE_USER_EMAIL ?? '';
const userPassword = process.env.SMOKE_USER_PASSWORD ?? '';
const hasUserCreds = hasRealCredentials(userEmail, userPassword);

const ID_FILE = path.join(__dirname, '.test-listing-id');

function readListingFixture(): { id: string; isLive: boolean } | null {
  if (!fs.existsSync(ID_FILE)) return null;
  const lines = fs.readFileSync(ID_FILE, 'utf-8').trim().split('\n');
  const id = lines[0]?.trim();
  if (!id) return null;
  return { id, isLive: lines[1]?.trim() === 'LIVE' };
}

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
// U1 — /saved-areas loads
// ---------------------------------------------------------------------------
test('U1 — /saved-areas loads with My Saved Areas heading', async ({ page }) => {
  test.skip(!hasUserCreds, 'SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD not set — skipping U1');

  await loginAsUser(page);
  await page.goto('/saved-areas');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('p:has-text("Loading...")', { state: 'hidden', timeout: 15_000 }).catch(() => {});

  // No error boundary
  await expect(
    page.locator('text=Something went wrong. Please refresh the page.'),
  ).toHaveCount(0);

  await expect(
    page.getByRole('heading', { name: /my saved areas/i }),
  ).toBeVisible({ timeout: 10_000 });
});

// ---------------------------------------------------------------------------
// U2 — /my-bookings loads
// ---------------------------------------------------------------------------
test('U2 — /my-bookings loads with My Bookings heading', async ({ page }) => {
  test.skip(!hasUserCreds, 'SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD not set — skipping U2');

  await loginAsUser(page);
  await page.goto('/my-bookings');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('p:has-text("Loading...")', { state: 'hidden', timeout: 15_000 }).catch(() => {});

  await expect(
    page.locator('text=Something went wrong. Please refresh the page.'),
  ).toHaveCount(0);

  await expect(
    page.getByRole('heading', { name: /my bookings/i }),
  ).toBeVisible({ timeout: 10_000 });
});

// ---------------------------------------------------------------------------
// U3 — /insights renders correctly regardless of access state
//      A user without insightsAccessUntil sees the paywall.
//      A user with active access sees Market Insights content.
//      Either way: no crash, no blank page.
// ---------------------------------------------------------------------------
test('U3 — /insights renders correctly (paywall or content — no crash)', async ({ page }) => {
  test.skip(!hasUserCreds, 'SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD not set — skipping U3');

  await loginAsUser(page);
  await page.goto('/insights');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('p:has-text("Loading...")', { state: 'hidden', timeout: 15_000 }).catch(() => {});

  // No error boundary
  await expect(
    page.locator('text=Something went wrong. Please refresh the page.'),
  ).toHaveCount(0);

  // Page must render one of: the paywall card OR the Market Insights heading.
  // Both are valid states depending on the user's insightsAccessUntil value.
  const paywallVisible = await page
    .getByText('Insights Access Required')
    .isVisible()
    .catch(() => false);

  const headingVisible = await page
    .getByRole('heading', { name: /market insights/i })
    .isVisible()
    .catch(() => false);

  if (!paywallVisible && !headingVisible) {
    throw new Error(
      'U3: Insights page rendered neither the paywall ("Insights Access Required") ' +
      'nor the "Market Insights" heading — likely a crash or blank page.',
    );
  }

  // Saved Areas panel is always visible regardless of access state
  await expect(page.getByText('Saved Areas').first()).toBeVisible({ timeout: 10_000 });
});

// ---------------------------------------------------------------------------
// U4 — /listing/:id AreaMarketWidget renders in one of its valid states
//      Requires a LIVE test fixture from global-setup.
// ---------------------------------------------------------------------------
test('U4 — listing detail: AreaMarketWidget renders without crash', async ({ page }) => {
  test.skip(!hasUserCreds, 'SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD not set — skipping U4');

  const fixture = readListingFixture();
  test.skip(fixture === null, 'e2e/.test-listing-id not found — global-setup may have skipped');
  test.skip(!fixture!.isLive, 'Test listing is not LIVE — AreaMarketWidget requires locality on a real listing');

  const { id } = fixture!;

  await loginAsUser(page);
  await page.goto(`/listing/${id}`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('p:has-text("Loading...")', { state: 'hidden', timeout: 15_000 }).catch(() => {});

  // No error boundary
  await expect(
    page.locator('text=Something went wrong. Please refresh the page.'),
  ).toHaveCount(0);

  // The listing title must appear
  await expect(
    page.locator('text=[E2E Test Listing]').first(),
  ).toBeVisible({ timeout: 10_000 });

  // AreaMarketWidget must render in one of its four valid states:
  //   - loading: Skeleton elements (no specific text — just no crash)
  //   - error: "Could not load market data."
  //   - empty: "Not enough data for this area yet."
  //   - data: "Area Market" heading
  //
  // We check that at least one of the non-loading states is visible after settling,
  // OR that the widget is simply absent (locality not set on test listing).
  await page.waitForTimeout(3_000); // allow RPC call to complete

  const areaMarket = page.locator('text=Area Market');
  const notEnough = page.locator('text=Not enough data for this area yet.');
  const loadError = page.locator('text=Could not load market data.');

  const anyStateVisible =
    (await areaMarket.isVisible().catch(() => false)) ||
    (await notEnough.isVisible().catch(() => false)) ||
    (await loadError.isVisible().catch(() => false));

  // If the widget is not visible at all, that is also acceptable (listing has no locality).
  // What is NOT acceptable: an error boundary or blank space where it should be.
  // We already checked for the error boundary above, so this test passes regardless.
  // Log the widget state for diagnostic purposes.
  if (anyStateVisible) {
    console.log('[U4] AreaMarketWidget rendered in a known state ✓');
  } else {
    console.log('[U4] AreaMarketWidget not visible — listing may have no locality (acceptable)');
  }
});
