/**
 * E2E — Discover marker viewport truncation notice (#944)
 *
 * Surface under test: the MarkersTruncationNotice rendered by MapDiscovery when
 * GET /api/discover/markers returns truncated===true.
 *
 * Why E2E (cross-layer): the notice is a cross-layer concern — the backend
 * response metadata (truncated, returnedElements, totalFilteredElements) drives
 * a DOM element that Playwright can assert on. The 300ms debounced bbox send +
 * react-query lifecycle cannot be fully exercised at the unit layer alone.
 *
 * Determinism strategy: /api/discover/markers is route-stubbed via page.route()
 * so the notice appears deterministically without needing a 1000+ row local DB.
 * All supporting endpoints are also stubbed (INTEGRATION-UI pattern from
 * regression-1240-marker-lat-lon.spec.ts and discover-anon-school-radius.spec.ts).
 *
 * markersEnabled gate (MapDiscovery.tsx:580):
 *   isAuthenticated &&
 *   (journey === 'area-first' || (journey === 'school-first' && schoolId && coords && boundedSearchTriggered)) &&
 *   mapZoom > AREA_LAYER_MAX_ZOOM (=12)
 *
 * Test approach: use area-first journey + areaKey deep-link at zoom=14 (> 12) with
 * user auth. This fires markersEnabled on load without any CTA interaction.
 *
 * Test IDs:
 *   MT-1  TRUNCATED: notice visible with correct "Showing 1,000 of 4,200 pins"
 *         copy when backend reports truncated===true (AC1).
 *   MT-2  NOT-TRUNCATED: notice content absent when truncated===false (AC2).
 *         aria-live container stays mounted; only the Card inside is absent.
 *   MT-3  CARDS-INDEPENDENCE: listing card count in the right panel is unaffected
 *         by truncation state — same 2 cards whether truncated or not (AC3).
 *   MT-4  NON-BLOCKING: Leaflet zoom control remains clickable after notice
 *         renders — notice does not overlay/block map interaction (AC4).
 *
 * Run:
 *   bash scripts/run-e2e-local.sh --project=full e2e/discover-viewport-truncation.spec.ts
 */

import { test, expect, type Page, type Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// Auth — markersEnabled requires isAuthenticated (area-first branch)
// ---------------------------------------------------------------------------

test.use({ storageState: 'e2e/fixtures/user-auth.json' });

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MANIPAL_AREA_KEY = 'IN|KA|Udupi|Manipal';
const ENCODED_AREA_KEY = encodeURIComponent(MANIPAL_AREA_KEY);
const AREA_LAT = 13.3509;
const AREA_LON = 74.7932;

// Area-first deep-link at zoom=14 (> AREA_LAYER_MAX_ZOOM=12).
// markersEnabled = isAuthenticated && journey=area-first && zoom > 12 → fires immediately on load.
const DISCOVER_URL =
  `/discover?city=udupi&journey=area-first` +
  `&areaKey=${ENCODED_AREA_KEY}` +
  `&lat=${AREA_LAT}&lon=${AREA_LON}&zoom=14`;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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
      geoCenterLat: AREA_LAT,
      geoCenterLon: AREA_LON,
      listingCount90d: 12,
      schoolCount: 2,
      trendDirection: 'stable',
    },
  ],
};

/**
 * City listings fixture — 2 cards. Used by MT-3 to assert card count is
 * unaffected by marker truncation state.
 * Shape: matches real backend DiscoverCityListingsItem (lat/lon fields).
 */
const CITY_LISTINGS_FIXTURE = {
  city: 'udupi',
  limitPerArea: 50,
  areas: [
    {
      areaKey: MANIPAL_AREA_KEY,
      areaName: 'Manipal',
      listings: [
        {
          id: 'cl-1',
          propertyType: 'house',
          title: 'Manipal House A',
          locality: 'Manipal',
          pricePaise: 500_000_000,
          lat: AREA_LAT + 0.005,
          lon: AREA_LON + 0.005,
          listingPurpose: 'sale',
        },
        {
          id: 'cl-2',
          propertyType: 'house',
          title: 'Manipal House B',
          locality: 'Manipal',
          pricePaise: 450_000_000,
          lat: AREA_LAT - 0.003,
          lon: AREA_LON + 0.003,
          listingPurpose: 'sale',
        },
      ],
    },
  ],
};

const EMPTY_PAGE = {
  content: [],
  page: 0,
  size: 50,
  totalElements: 0,
  totalPages: 0,
  aggregates: { topLocalities: [] },
};

/**
 * Markers response with truncated===true.
 * returnedElements=1000, totalFilteredElements=4200.
 * Expected notice text: "Showing 1,000 of 4,200 pins in this map area — zoom in to refine"
 */
const MARKERS_TRUNCATED = {
  city: 'udupi',
  markers: [
    { id: 'pin-1', lat: AREA_LAT + 0.003, lon: AREA_LON + 0.003, pricePaise: 500_000_000, locality: 'Manipal' },
  ],
  truncated: true,
  returnedElements: 1000,
  totalFilteredElements: 4200,
  limit: 1000,
  boundsApplied: true,
};

/**
 * Markers response with truncated===false.
 * Notice content must NOT be rendered.
 */
const MARKERS_NOT_TRUNCATED = {
  city: 'udupi',
  markers: [
    { id: 'pin-1', lat: AREA_LAT + 0.003, lon: AREA_LON + 0.003, pricePaise: 500_000_000, locality: 'Manipal' },
  ],
  truncated: false,
  returnedElements: 1,
  totalFilteredElements: 1,
  limit: 1000,
  boundsApplied: true,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

/**
 * Stub all supporting endpoints before navigation.
 * The /api/discover/markers endpoint is NOT stubbed here — each test registers
 * its own markers stub to control the truncated flag independently.
 */
async function stubSupportingEndpoints(page: Page): Promise<void> {
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/trends/options**', (r) =>
    fulfillJson(r, 200, TRENDS_OPTIONS_FIXTURE),
  );
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/discover/areas**', (r) =>
    fulfillJson(r, 200, DISCOVER_AREAS_FIXTURE),
  );
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/discover/area-groups**', (r) =>
    fulfillJson(r, 200, { groups: [] }),
  );
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/public/schools/popular**', (r) =>
    fulfillJson(r, 200, []),
  );
  // INTEGRATION-UI: stub justified — city listings feed the right-panel cards
  await page.route('**/api/discover/cities/*/listings**', (r) =>
    fulfillJson(r, 200, CITY_LISTINGS_FIXTURE),
  );
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/discover/listings**', (r) =>
    fulfillJson(r, 200, EMPTY_PAGE),
  );
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/dashboard/listings**', (r) =>
    fulfillJson(r, 200, EMPTY_PAGE),
  );
}

/**
 * Navigate to the area-first deep-link and wait for the markers request
 * to confirm markersEnabled fired. Returns the request for inspection.
 */
async function gotoAndWaitForMarkers(page: Page) {
  // Pre-arm before navigation so we catch the request regardless of timing
  const markersRequest = page.waitForRequest(
    (req) => req.url().includes('/api/discover/markers'),
    { timeout: 20_000 },
  );
  await page.goto(DISCOVER_URL);
  await page.waitForLoadState('domcontentloaded');
  return markersRequest;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('@integration-ui Discover — marker viewport truncation notice (#944)', () => {
  /**
   * MT-1: When the markers response has truncated===true, the notice is visible
   * with the exact localised counts: "Showing 1,000 of 4,200 pins in this map area — zoom in to refine".
   * Verifies AC1.
   */
  test('MT-1 TRUNCATED: notice visible with correct counts when markers are truncated', async ({
    page,
  }) => {
    await stubSupportingEndpoints(page);
    // INTEGRATION-UI: stub justified — controls truncated===true deterministically
    await page.route('**/api/discover/markers**', (r) =>
      fulfillJson(r, 200, MARKERS_TRUNCATED),
    );

    const markersRequest = gotoAndWaitForMarkers(page);
    await markersRequest;

    // The component renders: "Showing {shown} of {total} pins in this map area — zoom in to refine"
    // where shown = returnedElements.toLocaleString() = "1,000" and total = "4,200"
    const noticeText = page.getByText(/Showing 1,000 of 4,200 pins in this map area/);
    await expect(noticeText).toBeVisible({ timeout: 12_000 });

    // Full copy must include the zoom guidance
    await expect(noticeText).toContainText('zoom in to refine');
  });

  /**
   * MT-2: When the markers response has truncated===false, the notice content
   * is absent. The aria-live container stays mounted in the DOM but the Card
   * inside it is not rendered.
   * Verifies AC2.
   */
  test('MT-2 NOT-TRUNCATED: notice content absent when markers are not truncated', async ({
    page,
  }) => {
    await stubSupportingEndpoints(page);
    // INTEGRATION-UI: stub justified — controls truncated===false deterministically
    await page.route('**/api/discover/markers**', (r) =>
      fulfillJson(r, 200, MARKERS_NOT_TRUNCATED),
    );

    const markersRequest = gotoAndWaitForMarkers(page);
    await markersRequest;

    // Wait for page to settle: Leaflet container must be visible
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10_000 });

    // Allow react-query to settle then assert notice text is absent.
    // expect.poll gives the component a fair window before asserting 0.
    await expect
      .poll(
        () => page.getByText(/pins in this map area/).count(),
        {
          timeout: 8_000,
          message: 'Expected truncation notice text to be absent when truncated===false',
        },
      )
      .toBe(0);
  });

  /**
   * MT-3: Listing cards in the right panel are NOT affected by truncation state.
   * The CITY_LISTINGS_FIXTURE returns 2 cards. The markers endpoint returns
   * MARKERS_TRUNCATED (truncated===true). Assert card count is 2 regardless.
   * Verifies AC3 — marker truncation does not perturb the listing panel.
   */
  test('MT-3 CARDS-INDEPENDENCE: listing card count is unchanged by marker truncation state', async ({
    page,
  }) => {
    await stubSupportingEndpoints(page);
    // INTEGRATION-UI: stub justified — controls truncated===true deterministically
    await page.route('**/api/discover/markers**', (r) =>
      fulfillJson(r, 200, MARKERS_TRUNCATED),
    );

    const markersRequest = gotoAndWaitForMarkers(page);
    await markersRequest;

    // Right panel must be visible (settlement signal)
    await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 10_000 });

    // Truncation notice IS visible — confirms the truncated stub fired
    await expect(
      page.getByText(/Showing 1,000 of 4,200 pins in this map area/),
    ).toBeVisible({ timeout: 12_000 });

    // CITY_LISTINGS_FIXTURE has exactly 2 cards for the Manipal area.
    // Card count must be exactly 2 — not 0, not inflated by truncation metadata.
    // This proves the markers endpoint response does NOT alter the listing panel.
    await expect(page.getByTestId('listing-card').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('listing-card')).toHaveCount(2);
  });

  /**
   * MT-4: The truncation notice is non-blocking — the Leaflet zoom control
   * remains clickable after the notice renders.
   * The notice sits at z-index:1000 (same as Leaflet controls) bottom-center.
   * If it overflowed its container or had a wrong z-index it could block clicks.
   * Verifies AC4.
   */
  test('MT-4 NON-BLOCKING: map zoom control remains clickable after notice renders', async ({
    page,
  }) => {
    await stubSupportingEndpoints(page);
    // INTEGRATION-UI: stub justified — controls truncated===true deterministically
    await page.route('**/api/discover/markers**', (r) =>
      fulfillJson(r, 200, MARKERS_TRUNCATED),
    );

    const markersRequest = gotoAndWaitForMarkers(page);
    await markersRequest;

    // Wait for the notice to render (truncated===true path confirmed active)
    await expect(
      page.getByText(/Showing 1,000 of 4,200 pins in this map area/),
    ).toBeVisible({ timeout: 12_000 });

    // The Leaflet zoom-in button must be visible and clickable.
    // '.leaflet-control-zoom-in' is the standard Leaflet zoom+ button.
    const zoomIn = page.locator('.leaflet-control-zoom-in');
    await expect(zoomIn).toBeVisible({ timeout: 5_000 });

    // click() would throw if the element is blocked/overlaid
    await zoomIn.click();

    // Post-click: Leaflet container must still be alive (map not unmounted)
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 5_000 });
  });
});
