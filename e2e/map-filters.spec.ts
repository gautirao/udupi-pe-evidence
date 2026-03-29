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

  // Inject a single listing with coordinates so the marker renders regardless
  // of live DB state.  All GET requests to the property_listings REST endpoint
  // are intercepted; non-GET (e.g. realtime) are passed through.
  await page.route('**/rest/v1/property_listings*', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Content-Range': '0-0/1' },
      body: JSON.stringify([
        {
          id: 'e2e-m5-marker-fixture',
          raw_post_id: null,
          property_type: 'land',
          status: 'LIVE',
          title: 'E2E Test Land Plot',
          locality: 'Udupi',
          price: 5000000,
          price_paise: 500000000,
          price_unit: 'INR',
          land_area: 10,
          land_area_unit: 'cent',
          built_area: null,
          built_area_unit: null,
          bedrooms: null,
          bathrooms: null,
          contact_info: null,
          contact_phone: null,
          description: null,
          latitude: 13.3409,
          longitude: 74.7421,
          area_key: 'udupi',
          area_label: 'Udupi',
          confidence_score: 90,
          language_detected: null,
          price_per_cent_paise: null,
          is_valid: true,
          is_duplicate: false,
          created_at: '2026-01-01T00:00:00+00:00',
          updated_at: '2026-01-01T00:00:00+00:00',
          raw_posts: null,
        },
      ]),
    });
  });

  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page
    .waitForSelector('p:has-text("Loading...")', { state: 'hidden', timeout: 15_000 })
    .catch(() => {});

  // Leaflet container must be present
  await expect(page.locator('div.leaflet-container')).toBeVisible({ timeout: 15_000 });

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
