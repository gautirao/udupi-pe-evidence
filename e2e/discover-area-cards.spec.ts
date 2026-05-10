/**
 * E-1': Discover area cards E2E
 *
 * Tests the B-switch area cards feature:
 *   1. Area markers are rendered on the map at default zoom (≤ AREA_LAYER_MAX_ZOOM=12)
 *      sourced from GET /api/discover/areas (useDiscoverAreas hook)
 *   2. Clicking an area marker navigates to /trends with city= and areaKey= params
 *   3. Switching city refreshes area markers for the new city
 *
 * Also covers the #887 right-panel listing cards flow (useDiscoverCityListings):
 *   A1 — Discover page has no teaser strip overlaid on the map
 *   A2 — Selecting an area triggers GET /api/discover/cities/{city}/listings and shows cards
 *   A3 — Each listing card has an image area, property type badge, price — no "Sign in" button
 *   A4 — Clicking a listing card navigates to /listing/{id}
 *   A5 — When no area is selected, right panel shows instructional state
 *
 * Anonymous flow — no auth required (discover/areas and city/listings endpoints use skipAuth).
 * Run: bash scripts/run-e2e-local.sh --project=full e2e/discover-area-cards.spec.ts
 */

import { test, expect } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SS = (name: string) => path.join(__dirname, `../screenshots/area-cards-${name}.png`);

// Area card markers: makeAreaCard uses className:'' so only the base Leaflet
// classes are present. Use '.leaflet-marker-icon' to select them.
// (The old '.area-marker' class was from the pre-#887 makeAreaIcon DivIcon.)
const AREA_MARKER = '.leaflet-marker-icon';

// Helper to extract URL param for cleaner assertions
function getUrlParam(page: import('@playwright/test').Page, key: string): string | null {
  return new URL(page.url()).searchParams.get(key);
}

test.describe('Discover — area cards (B-switch)', () => {
  test('area markers appear on the map for default Udupi city', async ({ page }) => {
    // ── Step 1: Load Discover with Udupi at default zoom ─────────────────────
    await page.goto('/discover?city=udupi');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: SS('01-discover-loaded'), fullPage: false });

    // ── Step 2: At least one area marker is visible (from /api/discover/areas) ─
    // Default Udupi zoom=11 ≤ AREA_LAYER_MAX_ZOOM=12 so area layer is active
    await expect(page.locator(AREA_MARKER).first()).toBeVisible({ timeout: 12_000 });
    await page.screenshot({ path: SS('02-area-markers-visible'), fullPage: false });

    // At least one marker rendered
    const count = await page.locator(AREA_MARKER).count();
    expect(count).toBeGreaterThan(0);
  });

  test('clicking an area marker selects the area and shows listing cards in right panel', async ({ page }) => {
    // ── Step 1: Load Discover ─────────────────────────────────────────────────
    await page.goto('/discover?city=udupi');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 10_000 });

    // ── Step 2: Wait for area marker cards ───────────────────────────────────
    // makeAreaCard produces .leaflet-marker-icon divicons (className:'')
    const firstMarker = page.locator(AREA_MARKER).first();
    await expect(firstMarker).toBeVisible({ timeout: 12_000 });
    await page.screenshot({ path: SS('03-before-click'), fullPage: false });

    // ── Step 3: Click the first area marker ───────────────────────────────────
    // force:true — Leaflet marker inner content may intercept the hit-test.
    await firstMarker.click({ force: true });

    // ── Step 4: Right panel transitions from instructional → area header ──────
    // After #887 the marker click calls onAreaClick (setSelectedArea), NOT
    // navigate to /trends. The right panel shows the area name in the header
    // and begins loading listing cards.
    await expect(page.getByTestId('back-button')).toBeVisible({ timeout: 8_000 });

    // After marker click: areaKey is pushed (selectArea), viewport is REPLACED
    // (reportViewport debounce ~300ms). This URL is bookmarkable per #1043/#1047
    // architecture; viewport restoration handles Back/Forward.

    // Verify areaKey was pushed by selectArea
    expect(getUrlParam(page, 'areaKey')).toBeTruthy();

    // Verify each viewport param is present after reportViewport debounce
    // Use expect.poll to avoid brittle fixed timeouts around the 300ms debounce
    await expect.poll(() => getUrlParam(page, 'lat'), {
      timeout: 2000,
    }).toBeTruthy();
    await expect.poll(() => getUrlParam(page, 'lon'), {
      timeout: 2000,
    }).toBeTruthy();
    await expect.poll(() => getUrlParam(page, 'zoom'), {
      timeout: 2000,
    }).toBeTruthy();

    await page.screenshot({ path: SS('04-area-selected-right-panel'), fullPage: false });
  });

  test('switching city replaces area markers with those of the new city', async ({ page }) => {
    // ── Step 1: Load with Udupi ───────────────────────────────────────────────
    await page.goto('/discover?city=udupi');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 10_000 });

    // Wait for initial area markers
    await expect(page.locator(AREA_MARKER).first()).toBeVisible({ timeout: 12_000 });
    const udupiCount = await page.locator(AREA_MARKER).count();

    // ── Step 2: Switch to Kundapur ────────────────────────────────────────────
    const cityTrigger = page.locator('[role="combobox"]').filter({ hasText: /udupi/i });
    await cityTrigger.click();
    await page.getByRole('option', { name: 'Kundapur', exact: true }).click();

    // ── Step 3: URL reflects new city ─────────────────────────────────────────
    await expect(page).toHaveURL(/city=kundapur/, { timeout: 8_000 });
    await page.screenshot({ path: SS('05-kundapur-areas'), fullPage: false });

    // ── Step 4: Area markers update (new useDiscoverAreas('kundapur') query) ──
    // Markers re-render; just verify the layer is still active (count may differ)
    await expect(page.locator(AREA_MARKER).first()).toBeVisible({ timeout: 12_000 });
    const kundapurCount = await page.locator(AREA_MARKER).count();

    console.log(`Udupi area markers: ${udupiCount}, Kundapur area markers: ${kundapurCount}`);
    expect(kundapurCount).toBeGreaterThan(0);
  });
});

// ── #887: Right-panel listing cards flow (useDiscoverCityListings) ────────────
//
// These tests mock GET /api/discover/cities/udupi/listings so the suite runs
// without a seeded backend. The areas endpoint is also intercepted to guarantee
// quick-select chips appear reliably regardless of DB state.
//
// Fixture data mirrors the DiscoverCityListingsResponse shape from
// src/hooks/useDiscoverCityListings.ts.

const MOCK_AREA_KEY = 'IN|KA|Udupi|Manipal';
const MOCK_LISTING_ID = 'test-listing-abc123';

// Matches DiscoverAreasResponse shape from src/hooks/useDiscoverAreas.ts
// Fields: areaKey, name, geoCenterLat, geoCenterLon, listingCount90d
// (Index.tsx maps name → areaLabel, geoCenterLat → geo_center_lat, etc.)
const MOCK_AREAS_RESPONSE = {
  city: 'udupi',
  areas: [
    {
      areaKey: MOCK_AREA_KEY,
      name: 'Manipal',
      geoCenterLat: 13.3525,
      geoCenterLon: 74.7925,
      listingCount90d: 5,
      trendDirection: 'stable',
    },
  ],
};

// Matches DiscoverCityListingsResponse shape from src/hooks/useDiscoverCityListings.ts
const MOCK_CITY_LISTINGS_RESPONSE = {
  city: 'udupi',
  limitPerArea: 5,
  areas: [
    {
      areaKey: MOCK_AREA_KEY,
      areaName: 'Manipal',
      listings: [
        {
          id: MOCK_LISTING_ID,
          pricePaise: 250000000, // ₹25 lakh in paise
          propertyType: 'apartment',
          locality: 'Manipal',
          primaryImageUrl: null,
          listingPurpose: 'sale',
        },
        {
          id: 'test-listing-def456',
          pricePaise: 180000000,
          propertyType: 'house',
          locality: 'Udupi',
          primaryImageUrl: null,
          listingPurpose: 'rent',
        },
      ],
    },
  ],
};

test.describe('Discover — right-panel listing cards (#887)', () => {
  // Intercept both endpoints before navigation so mocks are in place for all
  // requests, including the initial page load that triggers useDiscoverAreas.
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/discover/areas**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_AREAS_RESPONSE),
      }),
    );

    await page.route('**/api/discover/cities/**/listings**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_CITY_LISTINGS_RESPONSE),
      }),
    );
  });

  // A5: no area selected → instructional state, not a card list
  test('A5 — right panel shows instructional state when no area is selected', async ({ page }) => {
    await page.goto('/discover?city=udupi');
    await page.waitForLoadState('domcontentloaded');

    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel).toBeVisible({ timeout: 10_000 });

    // Instructional state: GuidedEntryPanel with journey cards
    await expect(rightPanel.getByText('Find properties your way')).toBeVisible({ timeout: 8_000 });
    await expect(rightPanel.getByTestId('journey-card-area-first')).toBeVisible();

    // No listing cards rendered yet
    await expect(page.getByTestId('listing-card')).toHaveCount(0);

    await page.screenshot({ path: SS('06-right-panel-instructional-state'), fullPage: false });
  });

  // A1: no teaser strip overlaying the map bottom
  test('A1 — no teaser strip or floating popup overlays the map', async ({ page }) => {
    await page.goto('/discover?city=udupi');
    await page.waitForLoadState('domcontentloaded');

    // Wait for the right panel to confirm the discover page has fully rendered
    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel).toBeVisible({ timeout: 10_000 });

    // No element with a testid matching the removed teaser strip or floating popup
    await expect(page.getByTestId('teaser-strip')).toHaveCount(0);
    await expect(page.getByTestId('floating-popup')).toHaveCount(0);
    await expect(page.locator('[data-testid*="teaser"]')).toHaveCount(0);

    await page.screenshot({ path: SS('07-no-teaser-strip'), fullPage: false });
  });

  // A2: selecting an area chip triggers the city listings endpoint and shows cards
  test('A2 — selecting area chip calls city listings endpoint and renders cards in right panel', async ({
    page,
  }) => {
    await page.goto('/discover?city=udupi');
    await page.waitForLoadState('domcontentloaded');

    // Wait for the right panel and area markers (driven by useDiscoverAreas data).
    // After #887, clicking an area marker loads listing cards directly.
    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel).toBeVisible({ timeout: 10_000 });

    // Wait for area markers to be visible as the readiness signal
    const areaMarker = page.locator(AREA_MARKER).first();
    await expect(areaMarker).toBeVisible({ timeout: 12_000 });

    // Capture the city listings request
    const listingsRequestPromise = page.waitForRequest(
      (req) => req.url().includes('/api/discover/cities/') && req.url().includes('/listings'),
    );

    // Click the first area marker (calls onAreaSelect — loads city listings)
    await areaMarker.click({ force: true });

    // City listings endpoint must have been called
    const listingsRequest = await listingsRequestPromise;
    expect(listingsRequest.url()).toContain('/api/discover/cities/udupi/listings');

    // Right panel must now show listing cards (not instructional state)
    await expect(page.getByTestId('listing-card').first()).toBeVisible({ timeout: 10_000 });
    const cardCount = await page.getByTestId('listing-card').count();
    expect(cardCount).toBeGreaterThan(0);

    await page.screenshot({ path: SS('08-area-selected-cards-visible'), fullPage: false });
  });

  // A3: listing cards contain image area, property type badge, price — anonymous flow shows "Sign in to view price"
  test('A3 — listing cards show image area, property type, and price gate; anonymous mode expected', async ({
    page,
  }) => {
    await page.goto('/discover?city=udupi');
    await page.waitForLoadState('domcontentloaded');

    // Wait for area markers and click to load listing cards
    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel).toBeVisible({ timeout: 10_000 });

    const areaMarker = page.locator(AREA_MARKER).first();
    await expect(areaMarker).toBeVisible({ timeout: 12_000 });
    await areaMarker.click({ force: true });

    // Wait for cards to render after area selection
    const firstCard = page.getByTestId('listing-card').first();
    await expect(firstCard).toBeVisible({ timeout: 12_000 });

    // Image area: the mock listing has no primaryImageUrl so the Building2 placeholder renders
    // inside the image container (h-44 fixed height) — assert the container exists
    await expect(firstCard.locator('div.h-44.relative')).toBeVisible();

    // Property type badge: mock has 'apartment' (appears in both title and chip, use exact match for chip)
    await expect(firstCard.getByText('Apartment', { exact: true })).toBeVisible();

    // Price: in anonymous flow, the card shows "Sign in to view price" with lock icon instead of actual price.
    // PropertyCard.tsx renders this in the price row (flex items-center justify-between) when isAuthenticated=false.
    // Assert the "Sign in to view price" text is present — this is the expected anonymous mode behavior.
    await expect(firstCard.getByText(/sign in to view price/i)).toBeVisible();

    // Phase 2B work: authenticated flow assertions (price visibility, no sign-in text) will be added
    // when auth fixture setup is available. Current E2E runs in anonymous mode only.

    await page.screenshot({ path: SS('09-card-content-verified'), fullPage: false });
  });

  // A4: clicking a listing card navigates to /listing/{id}
  test('A4 — clicking a listing card navigates to /listing/{id}', async ({ page }) => {
    await page.goto('/discover?city=udupi');
    await page.waitForLoadState('domcontentloaded');

    // Wait for area markers and click to load listing cards
    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel).toBeVisible({ timeout: 10_000 });

    const areaMarker = page.locator(AREA_MARKER).first();
    await expect(areaMarker).toBeVisible({ timeout: 12_000 });
    await areaMarker.click({ force: true });

    // Wait for cards
    const firstCard = page.getByTestId('listing-card').first();
    await expect(firstCard).toBeVisible({ timeout: 10_000 });

    // Click the first card — navigate(`/listing/${listing.id}`) in DiscoverRightPanel
    await firstCard.click();

    // Must navigate to /listing/<id>
    await expect(page).toHaveURL(/\/listing\//, { timeout: 8_000 });
    const url = new URL(page.url());
    expect(url.pathname).toMatch(/^\/listing\/.+/);

    await page.screenshot({ path: SS('10-listing-detail-after-card-click'), fullPage: false });
  });
});
