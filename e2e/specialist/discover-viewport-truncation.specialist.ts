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
 * All supporting endpoints are also stubbed.
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
 */

import type { Page, Route } from '@playwright/test';
import { test, expect } from './support/specialist-test';
import { grantDiscoverConsent, loginAsUser } from '../helpers';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MANIPAL_AREA_KEY = 'IN|KA|Udupi|Manipal';
const MANIPAL_NODE_KEY = `a:${MANIPAL_AREA_KEY}`;
const ENCODED_AREA_KEY = encodeURIComponent(MANIPAL_AREA_KEY);
const ENCODED_NODE_KEY = encodeURIComponent(MANIPAL_NODE_KEY);
const AREA_LAT = 13.3509;
const AREA_LON = 74.7932;

// Area-first deep-link at zoom=14 (> AREA_LAYER_MAX_ZOOM=12).
// markersEnabled = isAuthenticated && journey=area-first && zoom > 12 -> fires immediately on load.
const DISCOVER_URL =
  `/discover?city=udupi&journey=area-first` +
  `&node=${ENCODED_NODE_KEY}` +
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

const NAVIGATION_RESOLVE_FIXTURE = {
  requested: MANIPAL_NODE_KEY,
  resolution: 'EXACT',
  revisionId: 1,
  node: {
    nodeKey: MANIPAL_NODE_KEY,
    nodeType: 'AREA',
    displayLabel: 'Manipal',
    depth: 1,
    regionKey: 'coastal',
    ancestry: [
      {
        nodeKey: 'd:coastal',
        nodeType: 'DIRECTION',
        displayLabel: 'Coastal Strip',
        displayOrder: 1,
      },
    ],
    nextLevelType: null,
    children: [],
    revisionId: 1,
    bounds: {
      centreLat: AREA_LAT,
      centreLon: AREA_LON,
      minLat: AREA_LAT - 0.01,
      minLon: AREA_LON - 0.01,
      maxLat: AREA_LAT + 0.01,
      maxLon: AREA_LON + 0.01,
    },
    descendantAreaKeys: [MANIPAL_AREA_KEY],
    areaKey: MANIPAL_AREA_KEY,
  },
};

const NAVIGATION_COUNTS_FIXTURE = {
  city: 'udupi',
  revisionId: 1,
  parentNodeKey: MANIPAL_NODE_KEY,
  counts: {
    [MANIPAL_NODE_KEY]: {
      listingCount: 2,
      schoolCount: 2,
      matchingAreaCount: 1,
    },
  },
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
  await loginAsUser(page, process.env.SMOKE_USER_EMAIL!, process.env.SMOKE_USER_PASSWORD!);
  await grantDiscoverConsent(page);

  await page.route('**/api/trends/options**', (r) =>
    fulfillJson(r, 200, TRENDS_OPTIONS_FIXTURE),
  );
  await page.route('**/api/discover/areas**', (r) =>
    fulfillJson(r, 200, DISCOVER_AREAS_FIXTURE),
  );
  await page.route('**/api/discover/area-groups**', (r) =>
    fulfillJson(r, 200, { groups: [] }),
  );
  await page.route('**/api/discover/cities/*/navigation/resolve**', (r) =>
    fulfillJson(r, 200, NAVIGATION_RESOLVE_FIXTURE),
  );
  await page.route('**/api/discover/cities/*/navigation/counts**', (r) =>
    fulfillJson(r, 200, NAVIGATION_COUNTS_FIXTURE),
  );
  await page.route('**/api/public/schools/popular**', (r) =>
    fulfillJson(r, 200, []),
  );
  await page.route('**/api/discover/cities/*/listings**', (r) =>
    fulfillJson(r, 200, CITY_LISTINGS_FIXTURE),
  );
  await page.route('**/api/discover/listings**', (r) =>
    fulfillJson(r, 200, EMPTY_PAGE),
  );
  await page.route('**/api/dashboard/listings**', (r) =>
    fulfillJson(r, 200, EMPTY_PAGE),
  );
}

/**
 * Navigate to the area-first deep-link and wait for the markers request
 * to confirm markersEnabled fired. Returns the request for inspection.
 */
async function gotoAndWaitForMarkers(page: Page) {
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
  test('MT-1 TRUNCATED: notice visible with correct counts when markers are truncated', async ({
    page,
  }) => {
    await stubSupportingEndpoints(page);
    await page.route('**/api/discover/markers**', (r) =>
      fulfillJson(r, 200, MARKERS_TRUNCATED),
    );

    const markersRequest = gotoAndWaitForMarkers(page);
    await markersRequest;

    const noticeText = page.getByText(/Showing 1,000 of 4,200 pins in this map area/);
    await expect(noticeText).toBeVisible({ timeout: 12_000 });
    await expect(noticeText).toContainText('zoom in to refine');
  });

  test('MT-2 NOT-TRUNCATED: notice content absent when markers are not truncated', async ({
    page,
  }) => {
    await stubSupportingEndpoints(page);
    await page.route('**/api/discover/markers**', (r) =>
      fulfillJson(r, 200, MARKERS_NOT_TRUNCATED),
    );

    const markersRequest = gotoAndWaitForMarkers(page);
    await markersRequest;

    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10_000 });

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

  test('MT-3 CARDS-INDEPENDENCE: listing card count is unchanged by marker truncation state', async ({
    page,
  }) => {
    await stubSupportingEndpoints(page);
    await page.route('**/api/discover/markers**', (r) =>
      fulfillJson(r, 200, MARKERS_TRUNCATED),
    );

    const markersRequest = gotoAndWaitForMarkers(page);
    await markersRequest;

    // Area leaf panel must be visible (settlement signal)
    await expect(page.getByTestId('areas-journey-panel-listings')).toBeVisible({ timeout: 10_000 });

    // Truncation notice IS visible — confirms the truncated stub fired
    await expect(
      page.getByText(/Showing 1,000 of 4,200 pins in this map area/),
    ).toBeVisible({ timeout: 12_000 });

    // CITY_LISTINGS_FIXTURE has exactly 2 cards for the Manipal area.
    await expect(page.getByTestId('listing-card').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('listing-card')).toHaveCount(2);
  });

  test('MT-4 NON-BLOCKING: map zoom control remains clickable after notice renders', async ({
    page,
  }) => {
    await stubSupportingEndpoints(page);
    await page.route('**/api/discover/markers**', (r) =>
      fulfillJson(r, 200, MARKERS_TRUNCATED),
    );

    const markersRequest = gotoAndWaitForMarkers(page);
    await markersRequest;

    await expect(
      page.getByText(/Showing 1,000 of 4,200 pins in this map area/),
    ).toBeVisible({ timeout: 12_000 });

    const zoomIn = page.locator('.leaflet-control-zoom-in');
    await expect(zoomIn).toBeVisible({ timeout: 5_000 });

    await zoomIn.click();

    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 5_000 });
  });
});
