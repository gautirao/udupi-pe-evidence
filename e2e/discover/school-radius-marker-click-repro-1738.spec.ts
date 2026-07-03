/**
 * REGRESSION — Issue #1738 (Mode-3 Stage B)
 *
 * Bug: once a school is selected in the area-first Discover journey (a radius
 * circle is drawn on the map for the area+school combined step), clicking a
 * listing marker again no longer opened MarkerPopoverCard. Before school
 * selection, marker clicks opened the popover fine.
 *
 * Root cause: MarkerPopoverCard's render gate (`isAreaFirstSelectedAreaState`,
 * src/pages/MapDiscovery.tsx) and the pixel-position callback guard
 * (`handleMarkerClickWithPosition`) both only recognised the no-school
 * 'area-selected' panel step. derivePanelContent routes BOTH area-first and
 * school-first area+school selections to the same 'area-school-combined'
 * panel content, so once a school was picked the area-first popover flow fell
 * through the same gate as school-first (which never renders this popover —
 * it owns its own tiered/peek marker UI).
 *
 * Fix (already applied, not touched by this spec): both gates were relaxed to
 * `journey === 'area-first' && (panelContent === 'area-selected' ||
 * panelContent === 'area-school-combined')`, restoring the popover in the
 * area-school-combined step while leaving school-first's own marker flows
 * untouched (explicit `journey === 'area-first'` guard).
 *
 * Cases covered:
 *   AC1 (baseline)      — area-first, area selected, no school -> marker click
 *                          opens MarkerPopoverCard.
 *   AC2 (fix)           — same page, school selected (schoolId + radiusKm,
 *                          radius circle drawn) -> marker click still opens
 *                          MarkerPopoverCard.
 *   AC5 (non-regression) — journey=school-first with area+school set (radius
 *                          circle drawn) -> marker click does NOT open a
 *                          popover; proves the explicit journey==='area-first'
 *                          guard holds and school-first's own marker flow is
 *                          untouched.
 *
 * Constants match the issue: school MIT id 8c279ab2-5770-44dd-a15e-57526b0b4a91,
 * areaKey IN|KA|Udupi|Manipal, radiusKm 3, city udupi.
 *
 * Backend-free: stubs all API calls via page.route (same pattern as
 * e2e/discover/school-first-marker-parity.spec.ts). Run against a bare Vite
 * dev server (no Spring Boot backend needed).
 *
 * Run:
 *   PLAYWRIGHT_BASE_URL=http://localhost:5178 npx playwright test \
 *     e2e/discover/school-radius-marker-click-repro-1738.spec.ts --project=full
 */

import { test, expect, type Page, type Route } from '@playwright/test';

const MANIPAL_AREA_KEY = 'IN|KA|Udupi|Manipal';
const ENCODED_AREA_KEY = encodeURIComponent(MANIPAL_AREA_KEY);

const MIT_SCHOOL_ID = '8c279ab2-5770-44dd-a15e-57526b0b4a91';
const MIT_LAT = 13.3525;
const MIT_LON = 74.79226;
const DEFAULT_RADIUS_KM = 3;

const MIT_SCHOOL = {
  id: MIT_SCHOOL_ID,
  name: 'Manipal Institute of Technology',
  board: 'DEEMED',
  boardType: null,
  address: 'Manipal, Udupi, Karnataka 576104',
  latitude: MIT_LAT,
  longitude: MIT_LON,
  distanceKm: 0.0,
  areaKey: MANIPAL_AREA_KEY,
};

const TRENDS_OPTIONS_FIXTURE = {
  city: 'udupi',
  defaultAreas: [{ areaKey: MANIPAL_AREA_KEY, areaLabel: 'Manipal' }],
};

const DISCOVER_AREAS_FIXTURE = {
  city: 'udupi',
  areas: [
    {
      areaKey: MANIPAL_AREA_KEY,
      name: 'Manipal',
      geoCenterLat: 13.3509,
      geoCenterLon: 74.7932,
      minLat: 13.33,
      maxLat: 13.38,
      minLon: 74.77,
      maxLon: 74.82,
      listingCount: 4,
      schoolCount: 6,
      trendDirection: 'stable',
    },
  ],
};

// One listing planted well inside the 3 km radius, close to map center so a
// deterministic pixel click can be computed after load.
const LISTING_ID = 'listing-mit-1';
const CITY_LISTINGS_FIXTURE = {
  city: 'udupi',
  limitPerArea: 50,
  areas: [
    {
      areaKey: MANIPAL_AREA_KEY,
      areaName: 'Manipal',
      listings: [
        {
          id: LISTING_ID,
          propertyType: 'house',
          title: 'House Near MIT',
          locality: 'Manipal',
          pricePaise: 500000000,
          lat: MIT_LAT,
          lon: MIT_LON,
          listingPurpose: 'sale',
        },
      ],
    },
  ],
};

const EMPTY_LISTINGS_PAGE = {
  content: [],
  page: 0,
  size: 50,
  totalElements: 0,
  totalPages: 0,
  aggregates: { topLocalities: [] },
};

const SCHOOL_RADIUS_LISTINGS_FIXTURE = {
  content: [
    {
      id: 'sr-1738-1',
      listingNumber: 9020,
      propertyType: 'house',
      title: 'House Near MIT',
      locality: 'Manipal',
      areaKey: MANIPAL_AREA_KEY,
      pricePaise: 500_000_000,
      landArea: null,
      landAreaUnit: null,
      builtArea: 1200,
      builtAreaUnit: 'sqft',
      bedrooms: 3,
      // Offset ~0.005 deg (~0.55 km) from the school pin (MIT_LAT/MIT_LON) so
      // the two markers don't share pixel coordinates — the school pin's
      // subtree otherwise intercepts pointer events and marker.click() times
      // out. Still comfortably inside the 3 km radius circle.
      latitude: MIT_LAT + 0.005,
      longitude: MIT_LON + 0.005,
      heroImageUrl: null,
      listingPurpose: 'sale',
      possessionStatus: 'ready_to_move',
      daysOnMarket: 5,
      backOnMarket: false,
      createdAt: '2026-05-01T00:00:00Z',
    },
  ],
  page: 0,
  size: 50,
  hasMore: false,
};

function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function stubAll(page: Page): Promise<void> {
  await page.route('**/api/trends/options**', (route) => fulfillJson(route, 200, TRENDS_OPTIONS_FIXTURE));
  await page.route('**/api/discover/areas**', (route) => fulfillJson(route, 200, DISCOVER_AREAS_FIXTURE));
  await page.route('**/api/public/schools/popular**', (route) => fulfillJson(route, 200, []));
  await page.route('**/api/public/schools/search**', (route) => fulfillJson(route, 200, [MIT_SCHOOL]));
  await page.route(`**/api/public/schools/${MIT_SCHOOL_ID}`, (route) => fulfillJson(route, 200, MIT_SCHOOL));
  await page.route('**/api/public/schools/by-area**', (route) => fulfillJson(route, 200, [MIT_SCHOOL]));
  await page.route('**/api/discover/cities/*/listings**', (route) => fulfillJson(route, 200, CITY_LISTINGS_FIXTURE));
  await page.route('**/api/discover/listings**', (route) => fulfillJson(route, 200, EMPTY_LISTINGS_PAGE));
  // Registered after the broader /listings glob so its more specific path wins
  // (Playwright matches the most-recently-added route first).
  await page.route('**/api/discover/cities/*/school-radius-listings**', (route) =>
    fulfillJson(route, 200, SCHOOL_RADIUS_LISTINGS_FIXTURE),
  );
}

const markerSelector = `[data-listing-id="${LISTING_ID}"] [data-testid="property-marker"]`;

// School-first + school selected sources markers from the school-radius
// fallback (SCHOOL_RADIUS_LISTINGS_FIXTURE), not the area-first city-listings
// fixture, so AC5 must target this id instead of LISTING_ID.
const SCHOOL_RADIUS_LISTING_ID = 'sr-1738-1';
const schoolRadiusMarkerSelector = `[data-listing-id="${SCHOOL_RADIUS_LISTING_ID}"] [data-testid="property-marker"]`;

function popoverLocator(page: Page) {
  // Both selectors should agree: MarkerPopoverCard renders role="dialog" AND
  // data-testid="marker-popover-card" on the same root element.
  return page.getByTestId('marker-popover-card');
}

test.describe('Issue #1738 — marker popover after school-radius selection (regression)', () => {
  test('AC1: area-first, area selected, no school -> marker click opens MarkerPopoverCard', async ({ page }) => {
    await stubAll(page);

    const areaOnlyUrl =
      `/discover?city=udupi&journey=area-first&areaKey=${ENCODED_AREA_KEY}` +
      `&lat=${MIT_LAT}&lon=${MIT_LON}&zoom=14`;

    const listingsResponse = page.waitForResponse((res) =>
      res.url().includes('/api/discover/cities/') && res.url().includes('/listings') && res.status() === 200,
    );
    await page.goto(areaOnlyUrl);
    await listingsResponse;
    await page.waitForLoadState('networkidle');

    // No radius circle in this state (no school selected).
    await expect(page.locator('.leaflet-overlay-pane path.leaflet-interactive')).toHaveCount(0);

    const marker = page.locator(markerSelector);
    await expect(marker).toBeVisible({ timeout: 20_000 });

    const popover = popoverLocator(page);
    await expect(popover).toBeHidden();

    await marker.click();

    await expect(popover).toBeVisible({ timeout: 10_000 });
    await expect(popover).toHaveAttribute('role', 'dialog');
  });

  test('AC2: area-first, area+school selected (radius circle drawn) -> marker click opens MarkerPopoverCard (fix)', async ({
    page,
  }) => {
    await stubAll(page);

    const combinedUrl =
      `/discover?city=udupi&journey=area-first&areaKey=${ENCODED_AREA_KEY}` +
      `&lat=${MIT_LAT}&lon=${MIT_LON}&zoom=14` +
      `&schoolId=${MIT_SCHOOL_ID}&radiusKm=${DEFAULT_RADIUS_KM}`;

    const radiusListingsResponse = page.waitForResponse(
      (res) => res.url().includes('/school-radius-listings') && res.status() === 200,
    );
    await page.goto(combinedUrl);
    await radiusListingsResponse;
    await page.waitForLoadState('networkidle');

    // Radius circle must be present, confirming this is genuinely the
    // area-school-combined step (the state the bug regressed in).
    await expect(page.locator('.leaflet-overlay-pane path.leaflet-interactive')).toHaveCount(1, {
      timeout: 15_000,
    });

    const marker = page.locator(markerSelector);
    await expect(marker).toBeVisible({ timeout: 20_000 });

    const popover = popoverLocator(page);
    await expect(popover).toBeHidden();

    await marker.click();

    // THE FIX: popover must open even with a school/radius circle present,
    // because journey === 'area-first' still holds.
    await expect(popover).toBeVisible({ timeout: 10_000 });
    await expect(popover).toHaveAttribute('role', 'dialog');
    await expect(popover).toHaveCount(1);
  });

  test('AC5: journey=school-first, area+school selected -> marker click does NOT open a popover (non-regression)', async ({
    page,
  }) => {
    await stubAll(page);

    const schoolFirstCombinedUrl =
      `/discover?city=udupi&journey=school-first&areaKey=${ENCODED_AREA_KEY}` +
      `&lat=${MIT_LAT}&lon=${MIT_LON}&zoom=14` +
      `&schoolId=${MIT_SCHOOL_ID}&radiusKm=${DEFAULT_RADIUS_KM}`;

    const radiusListingsResponse = page.waitForResponse(
      (res) => res.url().includes('/school-radius-listings') && res.status() === 200,
    );
    await page.goto(schoolFirstCombinedUrl);
    await radiusListingsResponse;
    await page.waitForLoadState('networkidle');

    // Same panel content ('area-school-combined') and radius circle as AC2 —
    // the only difference is journey=school-first.
    await expect(page.locator('.leaflet-overlay-pane path.leaflet-interactive')).toHaveCount(1, {
      timeout: 15_000,
    });

    // School-first sources markers from the school-radius fallback fixture
    // (id 'sr-1738-1'), not the area-first city-listings fixture used by
    // AC1/AC2 (id 'listing-mit-1') — see MapDiscovery.tsx school-first +
    // schoolId marker-source branch.
    const marker = page.locator(schoolRadiusMarkerSelector);
    await expect(marker).toBeVisible({ timeout: 20_000 });

    await marker.click();

    // Journey guard must hold: school-first owns its own tiered/peek marker
    // UI and must never surface the area-first popover, even though the
    // panel content is identical to AC2.
    await expect(popoverLocator(page)).toHaveCount(0);
  });
});
