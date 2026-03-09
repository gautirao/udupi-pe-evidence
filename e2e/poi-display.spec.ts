/**
 * POI Display — nearby points-of-interest on listing detail
 *
 * Covers:
 *   P1 — NearbyPois section renders when API returns approved POIs
 *   P2 — NearbyPois section is hidden when API returns empty list
 *   P3 — GET /api/listings/{id}/pois requires auth (401 without token)
 *
 * Run locally:
 *   SMOKE_USER_EMAIL=you@example.com SMOKE_USER_PASSWORD=secret npm run test:e2e -- --project=chromium e2e/poi-display.spec.ts
 *
 * All tests skip gracefully when SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD are not set.
 *
 * Implementation notes:
 *   - Supabase property_listings REST endpoint is intercepted to inject a
 *     deterministic listing fixture (avoids live-DB dependency).
 *   - Spring backend POI endpoint is intercepted separately to control the
 *     POI list returned for each test.
 */

import { test, expect } from '@playwright/test';
import { hasRealCredentials } from './helpers';

const userEmail    = process.env.SMOKE_USER_EMAIL    ?? '';
const userPassword = process.env.SMOKE_USER_PASSWORD ?? '';
const hasUserCreds = hasRealCredentials(userEmail, userPassword);

const FIXTURE_LISTING_ID = 'e2e-poi-listing-fixture';

/** Fixture listing with coordinates so NearbyPois can attempt to display. */
const LISTING_FIXTURE = {
  id: FIXTURE_LISTING_ID,
  raw_post_id: null,
  property_type: 'land',
  status: 'LIVE',
  title: 'E2E POI Test Plot',
  locality: 'Udupi',
  price: 5_000_000,
  price_paise: 500_000_000,
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
};

/** Two approved POIs covering two distinct categories. */
const POI_FIXTURES = [
  { id: 'poi-1', name: 'District Hospital', category: 'HOSPITAL',  distanceMeters: 150, latitude: 13.341, longitude: 74.743, pinned: false, approved: true },
  { id: 'poi-2', name: "St. Mary's School",  category: 'SCHOOL',    distanceMeters: 300, latitude: 13.342, longitude: 74.744, pinned: false, approved: true },
];

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

/** Intercept Supabase REST to return a single deterministic listing fixture. */
async function stubListing(page: import('@playwright/test').Page): Promise<void> {
  await page.route('**/rest/v1/property_listings*', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Content-Range': '0-0/1' },
      body: JSON.stringify([LISTING_FIXTURE]),
    });
  });
}

// ---------------------------------------------------------------------------
// P1 — NearbyPois renders when API returns approved POIs
// ---------------------------------------------------------------------------
test('P1 — NearbyPois section renders with approved POIs from backend', async ({ page }) => {
  test.skip(!hasUserCreds, 'SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD not set — skipping P1');

  await stubListing(page);

  // Stub the Spring backend POI endpoint with approved POIs
  await page.route(`**/api/listings/${FIXTURE_LISTING_ID}/pois`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(POI_FIXTURES),
    });
  });

  await loginAsUser(page);
  await page.goto(`/listing/${FIXTURE_LISTING_ID}`);
  await page.waitForLoadState('domcontentloaded');

  // NearbyPois card heading
  await expect(page.getByText('Nearby').first()).toBeVisible({ timeout: 10_000 });

  // Both POI names appear
  await expect(page.getByText('District Hospital').first()).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText("St. Mary's School").first()).toBeVisible({ timeout: 5_000 });

  // OpenStreetMap attribution is present
  await expect(page.getByText('OpenStreetMap').first()).toBeVisible({ timeout: 5_000 });
});

// ---------------------------------------------------------------------------
// P2 — NearbyPois section is hidden when API returns empty list
// ---------------------------------------------------------------------------
test('P2 — NearbyPois section is hidden when backend returns no POIs', async ({ page }) => {
  test.skip(!hasUserCreds, 'SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD not set — skipping P2');

  await stubListing(page);

  // Stub POI endpoint with empty array
  await page.route(`**/api/listings/${FIXTURE_LISTING_ID}/pois`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await loginAsUser(page);
  await page.goto(`/listing/${FIXTURE_LISTING_ID}`);
  await page.waitForLoadState('domcontentloaded');

  // Give NearbyPois time to settle (it renders null on empty list)
  await page.waitForTimeout(2_000);

  // NearbyPois card must not be present
  await expect(page.getByText('Nearby')).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// P3 — GET /api/listings/{id}/pois requires authentication (401 without token)
// ---------------------------------------------------------------------------
test('P3 — POI endpoint returns 401 without Authorization header', async ({ request }) => {
  // This test does not need browser credentials — it hits the backend directly.
  // Skip if no backend URL is configured (CI sets VITE_API_URL or falls back to localhost).
  const backendUrl = process.env.VITE_API_URL ?? 'http://localhost:8080';

  const response = await request.get(
    `${backendUrl}/api/listings/${FIXTURE_LISTING_ID}/pois`,
    { headers: {} }, // deliberately no Authorization header
  );

  expect(response.status()).toBe(401);
});
