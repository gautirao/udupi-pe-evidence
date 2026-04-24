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
 * Auth: tests use storageState from e2e/fixtures/user-auth.json (written by global-setup).
 */

import { test, expect } from '@playwright/test';
import { hasRealCredentials } from './helpers';

const userEmail = process.env.SMOKE_USER_EMAIL ?? '';
const userPassword = process.env.SMOKE_USER_PASSWORD ?? '';
const hasUserCreds = hasRealCredentials(userEmail, userPassword);

// All tests in this file need user auth — start with pre-authenticated session.
test.use({ storageState: 'e2e/fixtures/user-auth.json' });

// ---------------------------------------------------------------------------
// M1 — Map page loads; filter panel and search input visible
// ---------------------------------------------------------------------------
test('M1 — map page loads with filter panel and search input', async ({ page }) => {
  test.skip(!hasUserCreds, 'SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD not set — skipping M1');

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

  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page
    .waitForSelector('p:has-text("Loading...")', { state: 'hidden', timeout: 15_000 })
    .catch(() => {});

  // Wait for BHK section to appear
  await expect(page.getByText('Bedrooms (BHK)').first()).toBeVisible({ timeout: 10_000 });

  // Click the "2" BHK button — scoped to Bedrooms section to avoid matching header badge
  const bhkSection = page.getByText('Bedrooms (BHK)').first().locator('..');
  const btn2 = bhkSection.getByRole('button', { name: '2', exact: true });
  await expect(btn2).toBeVisible({ timeout: 10_000 });
  await btn2.click();

  // Clear button must appear (hasActiveFilters is now true)
  const clearBtn = page.getByRole('button', { name: /clear/i }).first();
  await expect(clearBtn).toBeVisible({ timeout: 10_000 });

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
// M5 — Map renders custom-marker pins for listings with coordinates
// ---------------------------------------------------------------------------
/**
 * Intercepts the Supabase REST endpoint for property_listings and injects a
 * single fixture listing with valid coordinates.  This makes the assertion
 * deterministic — no dependency on live DB data.
 *
 * PropertyMap uses L.divIcon({ className: 'custom-marker', ... }) so markers
 * are rendered as <div class="custom-marker"> elements inside
 * .leaflet-marker-pane (not <img> tags as plain Leaflet would use).
 */
test('M5 — Leaflet map renders at least one custom-marker pin when listings have coordinates', async ({
  page,
}) => {
  test.skip(!hasUserCreds, 'SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD not set — skipping M5');

  // C-switch: the map now sources markers from useDiscoverMarkers (GET /api/listings/markers)
  // rather than the Supabase property_listings REST endpoint. Intercept the skinny-markers
  // endpoint and return a single fixture marker with known coordinates.
  await page.route('**/api/listings/markers*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        city: 'udupi',
        markers: [
          { id: 'e2e-m5-marker-fixture', lat: 13.3409, lon: 74.7421, pricePaise: 500000000 },
        ],
      }),
    });
  });

  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page
    .waitForSelector('p:has-text("Loading...")', { state: 'hidden', timeout: 15_000 })
    .catch(() => {});

  // Leaflet container must be present
  await expect(page.locator('div.leaflet-container')).toBeVisible({ timeout: 15_000 });

  // C-switch: listing markers only render at zoom > 12 (AREA_LAYER_MAX_ZOOM). Default zoom
  // is 11, so we must zoom in before asserting. Five clicks on the + control reaches zoom 16.
  // force:true bypasses the filter-bar overlay (z-[1000]) that covers the Leaflet control.
  const zoomIn = page.locator('.leaflet-control-zoom-in');
  await expect(zoomIn).toBeVisible({ timeout: 5_000 });
  for (let i = 0; i < 5; i++) {
    await zoomIn.click({ force: true });
    await page.waitForTimeout(300);
  }

  // At least one custom-marker div must appear in the marker pane.
  // With a single listing and markercluster, one individual marker renders
  // (clusters only form when count > 1 at a given zoom).
  await expect(
    page.locator('.leaflet-marker-pane .custom-marker'),
  ).toHaveCount(1, { timeout: 10_000 });
});

// ---------------------------------------------------------------------------
// M4 — Insights page loads with heading and no error boundary
// ---------------------------------------------------------------------------
test('M4 — Insights page loads with Market Insights heading and no error', async ({ page }) => {
  test.skip(!hasUserCreds, 'SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD not set — skipping M4');

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
