/**
 * E2E: Issue #1738 — marker popover after school-radius selection (regression),
 * dismiss-cycle + mobile-viewport hardening.
 *
 * IMPORTANT — journey correction vs. the originally-specified procedure:
 * The Mode-3 Stage B procedure for this spec asked for a `journey=school-first`
 * repro. Ground truth in the code says otherwise, and this file follows the code,
 * not the procedure text:
 *
 *   - MarkerPopoverCard is gated by `isAreaFirstPopoverEligible` in
 *     src/pages/MapDiscovery.tsx: `journey === 'area-first' && selectedArea &&
 *     (panelContent === 'area-selected' || panelContent === 'area-school-combined')`.
 *   - school-first is EXPLICITLY excluded ("3 desynced marker tiers... own
 *     tiered/peek marker UI") — this is asserted as a non-regression in AC5 of
 *     the pre-existing e2e/discover/school-radius-marker-click-repro-1738.spec.ts.
 *   - The radius overlay / legend (`school-radius-legend`, SchoolRadiusMapOverlay.
 *     isSchoolRadiusOverlayState) renders whenever a school is selected, in EITHER
 *     journey — so the only state where BOTH the radius legend AND the marker
 *     popover exist is journey=area-first at the area-school-combined step.
 *
 * This file therefore exercises the #1738 procedure (radius overlay + marker +
 * popup open + dismiss-cycle + mobile clipping) against journey=area-first,
 * which is the only journey where the procedure's premises ("school selected AND
 * marker click opens a popup") are both true. AC1/AC2/AC5 (open-state coverage)
 * already exist in school-radius-marker-click-repro-1738.spec.ts and are not
 * duplicated here — this file adds the dismiss-cycle (Escape / background-click /
 * X button), the "radius survives dismiss" assertion, the screenshot capture, and
 * the mobile-viewport variant, none of which the existing file covers.
 *
 * Backend-free: stubs all API calls via page.route (same pattern as
 * e2e/discover/school-radius-marker-click-repro-1738.spec.ts).
 *
 * Run:
 *   PLAYWRIGHT_BASE_URL=http://localhost:5183 npx playwright test \
 *     e2e/discover-1738-regression.spec.ts --project=full
 */

import { test, expect, type Page, type Route } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SS = (name: string) => path.join(__dirname, `../screenshots/discover-1738-regression-${name}.png`);

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

const LISTING_ID = 'listing-mit-dismiss-1';
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
      id: 'sr-1738d-1',
      listingNumber: 9021,
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
  // Registered after the broader /listings glob so its more specific path wins.
  await page.route('**/api/discover/cities/*/school-radius-listings**', (route) =>
    fulfillJson(route, 200, SCHOOL_RADIUS_LISTINGS_FIXTURE),
  );
}

const markerSelector = `[data-listing-id="${LISTING_ID}"] [data-testid="property-marker"]`;

function popoverLocator(page: Page) {
  return page.getByTestId('marker-popover-card');
}

function radiusOverlayLocator(page: Page) {
  return page.locator('.leaflet-overlay-pane path.leaflet-interactive');
}

const combinedUrl =
  `/discover?city=udupi&journey=area-first&areaKey=${ENCODED_AREA_KEY}` +
  `&lat=${MIT_LAT}&lon=${MIT_LON}&zoom=14` +
  `&schoolId=${MIT_SCHOOL_ID}&radiusKm=${DEFAULT_RADIUS_KM}`;

/** Navigate to the area-school-combined step and wait for the radius listings to resolve. */
async function gotoCombinedState(page: Page): Promise<void> {
  const radiusListingsResponse = page.waitForResponse(
    (res) => res.url().includes('/school-radius-listings') && res.status() === 200,
  );
  await page.goto(combinedUrl);
  await radiusListingsResponse;
  await page.waitForLoadState('networkidle');
}

test.describe('Issue #1738 — marker popover dismiss-cycle + mobile hardening (area-first, area-school-combined)', () => {
  test('procedure steps 1-7,10: radius overlay + legend + marker present, click opens popover with listing content, screenshot captured', async ({
    page,
  }) => {
    await stubAll(page);
    await gotoCombinedState(page);

    // Step 4: radius overlay visible (both the drawn circle and the school-radius legend).
    await expect(radiusOverlayLocator(page)).toHaveCount(1, { timeout: 15_000 });
    await expect(page.getByTestId('school-radius-legend')).toBeVisible({ timeout: 10_000 });

    // Step 5: at least one listing marker present.
    const marker = page.locator(markerSelector);
    await expect(marker).toBeVisible({ timeout: 20_000 });

    const popover = popoverLocator(page);
    await expect(popover).toBeHidden();

    // Step 6: click the listing marker.
    await marker.click();

    // Step 7: popover visible AND shows listing content (title + price row), not just an
    // empty dialog shell.
    await expect(popover).toBeVisible({ timeout: 10_000 });
    await expect(popover).toHaveAttribute('role', 'dialog');
    await expect(popover).toContainText('House Near MIT');
    await expect(popover.getByTestId('popover-price')).toBeVisible();

    // Step 10: screenshot at the popup-open step.
    await page.screenshot({ path: SS('popup-open'), fullPage: false });
  });

  test('dismiss via Escape: popover closes; radius overlay + legend remain visible', async ({ page }) => {
    await stubAll(page);
    await gotoCombinedState(page);

    const marker = page.locator(markerSelector);
    await expect(marker).toBeVisible({ timeout: 20_000 });
    await marker.click();

    const popover = popoverLocator(page);
    await expect(popover).toBeVisible({ timeout: 10_000 });

    await page.keyboard.press('Escape');
    await expect(popover).toBeHidden({ timeout: 5_000 });

    // Step 9: radius overlay + legend must still be present after dismiss — the popover
    // lifecycle must not tear down the school-radius state.
    await expect(radiusOverlayLocator(page)).toHaveCount(1);
    await expect(page.getByTestId('school-radius-legend')).toBeVisible();
  });

  test('dismiss via background click: popover closes; radius overlay + legend remain visible', async ({ page }) => {
    await stubAll(page);
    await gotoCombinedState(page);

    const marker = page.locator(markerSelector);
    await expect(marker).toBeVisible({ timeout: 20_000 });
    await marker.click();

    const popover = popoverLocator(page);
    await expect(popover).toBeVisible({ timeout: 10_000 });

    // Click a corner of the Leaflet map container, away from any marker/pin, so the click
    // bubbles to the mapContainerRef div's onClick (background-click dismiss) rather than
    // hitting a marker or the popover card itself (which stopPropagation()s its own clicks).
    const mapBox = await page.locator('.leaflet-container').boundingBox();
    expect(mapBox).not.toBeNull();
    if (mapBox) {
      await page.mouse.click(mapBox.x + 8, mapBox.y + 8);
    }

    await expect(popover).toBeHidden({ timeout: 5_000 });
    await expect(radiusOverlayLocator(page)).toHaveCount(1);
    await expect(page.getByTestId('school-radius-legend')).toBeVisible();
  });

  test('dismiss via X (close) button: popover closes; radius overlay + legend remain visible', async ({ page }) => {
    await stubAll(page);
    await gotoCombinedState(page);

    const marker = page.locator(markerSelector);
    await expect(marker).toBeVisible({ timeout: 20_000 });
    await marker.click();

    const popover = popoverLocator(page);
    await expect(popover).toBeVisible({ timeout: 10_000 });

    await popover.getByTestId('marker-popover-close').click();

    await expect(popover).toBeHidden({ timeout: 5_000 });
    await expect(radiusOverlayLocator(page)).toHaveCount(1);
    await expect(page.getByTestId('school-radius-legend')).toBeVisible();
  });

  test('mobile viewport (390x844): popover is not clipped off-screen and the radius legend remains visible', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubAll(page);
    await gotoCombinedState(page);

    await expect(page.getByTestId('school-radius-legend')).toBeVisible({ timeout: 10_000 });

    const marker = page.locator(markerSelector);
    await expect(marker).toBeVisible({ timeout: 20_000 });
    await marker.click();

    const popover = popoverLocator(page);
    await expect(popover).toBeVisible({ timeout: 10_000 });

    const box = await popover.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      // Not clipped: fully within the 390px-wide mobile viewport on both edges.
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390 + 1);
    }

    // Radius legend must still coexist with the popover on the mobile layout.
    await expect(page.getByTestId('school-radius-legend')).toBeVisible();

    await page.screenshot({ path: SS('mobile-popup-open'), fullPage: false });
  });
});
