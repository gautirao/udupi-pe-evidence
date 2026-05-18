/**
 * E2E: school-first focus mode and clear-school restore — Issue #1130.
 *
 * Tests covering the school marker focus mode and URL state restore:
 *   E2E-FOCUS-1  Select school → only 1 school marker visible on map
 *   E2E-FOCUS-2  Select school → property markers + panel listings agree (scoped to radius)
 *   E2E-FOCUS-3  Select school, clear chip → URL loses schoolId + right panel shows schools-in-area
 *   E2E-FOCUS-4  URL with school+radius yielding 0 properties → empty-state in right panel
 *   E2E-BACK-1   Select school (URL gains schoolId), browser back, URL loses schoolId
 *
 * NOTE: Issue #1118 limitation — anonymous users do not trigger /api/discover/markers
 * (the endpoint is auth-gated). Property markers for anonymous users come from
 * areaMarkerListings (/api/discover/cities/{city}/listings). E2E-FOCUS-2 stubs
 * the city-listings endpoint so property markers are visible without authentication.
 * The school-proximity filter is applied client-side via haversineKm for anon users.
 *
 * Run locally:
 *   bash scripts/run-e2e-local.sh --project=full e2e/discover-school-first-markers.spec.ts
 */

import { test, expect, type Page, type Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MANIPAL_AREA_KEY = 'IN|KA|Udupi|Manipal';
const ENCODED_AREA_KEY = encodeURIComponent(MANIPAL_AREA_KEY);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TRENDS_OPTIONS_FIXTURE = {
  city: 'udupi',
  defaultAreas: [
    { areaKey: MANIPAL_AREA_KEY, areaLabel: 'Manipal' },
    { areaKey: 'IN|KA|Udupi|Kadiyali', areaLabel: 'Kadiyali' },
  ],
};

const DISCOVER_AREAS_UDUPI = {
  city: 'udupi',
  areas: [
    {
      areaKey: MANIPAL_AREA_KEY,
      name: 'Manipal',
      geoCenterLat: 13.3525,
      geoCenterLon: 74.7864,
      listingCount90d: 5,
      schoolCount: 4,
      trendDirection: 'stable',
    },
  ],
};

// Two schools for the area — used to verify focus mode shows only 1 marker.
const SCHOOLS_BY_AREA_FIXTURE = [
  {
    id: 'sch-1',
    name: 'Manipal Public School',
    board: 'CBSE',
    boardType: null,
    address: 'Manipal, Udupi',
    latitude: 13.3525,
    longitude: 74.7864,
    schoolCategory: 'secondary',
  },
  {
    id: 'sch-2',
    name: 'MIT Vidyaniketan',
    board: 'STATE',
    boardType: null,
    address: 'Manipal, Udupi',
    latitude: 13.351,
    longitude: 74.785,
    schoolCategory: 'primary',
  },
];

const MANIPAL_SCHOOL = SCHOOLS_BY_AREA_FIXTURE[0];

const EMPTY_LISTINGS_PAGE = {
  content: [],
  page: 0,
  size: 50,
  totalElements: 0,
  totalPages: 0,
  aggregates: { topLocalities: [] },
};

// City-listings fixture: one property inside the school radius (1.0 km from sch-1).
// Used by E2E-FOCUS-2 to verify property markers are scoped to the selected school.
const CITY_LISTINGS_FIXTURE = {
  areas: [
    {
      areaKey: MANIPAL_AREA_KEY,
      listings: [
        {
          id: 'listing-focus-1',
          title: 'Focus Test Property',
          propertyType: 'house',
          price: 4500000,
          lat: 13.3530,
          lon: 74.7870,
          latitude: 13.3530,
          longitude: 74.7870,
          locality: 'Manipal',
          bedrooms: 3,
          status: 'LIVE',
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Stub helpers (mirrors discover-school-first-journey.spec.ts conventions)
// ---------------------------------------------------------------------------

function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function stubTrendsOptions(page: Page): Promise<void> {
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/trends/options**', (route) =>
    fulfillJson(route, 200, TRENDS_OPTIONS_FIXTURE),
  );
}

async function stubDiscoverAreas(page: Page): Promise<void> {
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/discover/areas**', (route) =>
    fulfillJson(route, 200, DISCOVER_AREAS_UDUPI),
  );
}

async function stubSchoolsByArea(
  page: Page,
  schools: unknown[] = SCHOOLS_BY_AREA_FIXTURE,
): Promise<void> {
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/public/schools/by-area**', (route) =>
    fulfillJson(route, 200, schools),
  );
}

async function stubSchoolById(
  page: Page,
  school: typeof MANIPAL_SCHOOL,
): Promise<void> {
  // INTEGRATION-UI: stub justified — isolate from backend variability
  // Single-segment wildcard (*) matches /schools/sch-1 but NOT /schools/by-area/...
  // so this stub cannot accidentally intercept the by-area endpoint.
  await page.route('**/api/public/schools/*', (route) =>
    fulfillJson(route, 200, school),
  );
}

async function stubDiscoverListings(page: Page): Promise<void> {
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/discover/listings**', (route) =>
    fulfillJson(route, 200, EMPTY_LISTINGS_PAGE),
  );
}

async function stubCityListings(page: Page): Promise<void> {
  // INTEGRATION-UI: stub justified — city-level listings for anon property markers
  await page.route('**/api/discover/cities/*/listings**', (route) =>
    fulfillJson(route, 200, CITY_LISTINGS_FIXTURE),
  );
}

function getUrlParam(page: Page, key: string): string | null {
  return new URL(page.url()).searchParams.get(key);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('@integration-ui school-first focus mode (#1130)', () => {

  /**
   * E2E-FOCUS-1: Selecting a school collapses the map to exactly 1 school marker.
   *
   * Setup: school-first + areaKey with 2 schools in fixture. Navigate to the
   * combined URL (schoolId set). The SchoolMarkerLayer focus mode must render
   * only 1 .school-pin element on the Leaflet canvas.
   *
   * Note: Leaflet markers are DOM elements with class "school-pin" added by
   * SchoolMarkerLayer's schoolPinIcon. Count must be exactly 1 when schoolId is set.
   * (PropertyMap's schoolCircle overlay uses "school-marker" — a distinct class.)
   */
  test('E2E-FOCUS-1: select school → only 1 school marker visible on map', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubSchoolsByArea(page);
    await stubSchoolById(page, MANIPAL_SCHOOL);
    await stubDiscoverListings(page);
    await stubCityListings(page);

    // Cold-load combined state: journey + areaKey + schoolId (focus mode active)
    await page.goto(
      `/discover?city=udupi&journey=school-first&zoom=14&areaKey=${ENCODED_AREA_KEY}&schoolId=${MANIPAL_SCHOOL.id}&radiusKm=3`,
    );
    await page.waitForLoadState('domcontentloaded');

    // Wait for the map to render school pin markers (SchoolMarkerLayer uses "school-pin")
    const schoolMarkers = page.locator('.school-pin');
    await expect(schoolMarkers.first()).toBeVisible({ timeout: 15_000 });

    // Focus mode: exactly 1 school pin marker when schoolId is set
    await expect(schoolMarkers).toHaveCount(1, { timeout: 5_000 });
  });

  /**
   * E2E-FOCUS-2: Select school → property markers and panel listings agree.
   *
   * Both sources (map property-marker elements and right-panel listing cards)
   * must be scoped to the school radius. For anonymous users this is driven by
   * the haversineKm client-side filter applied to areaListings.
   *
   * The city-listings fixture has 1 property within 1 km of sch-1 (lat 13.353,
   * lon 74.787 ≈ 0.08 km away). With radiusKm=3, it must appear on the map.
   */
  test('E2E-FOCUS-2: select school → property markers and panel listings visible (scoped to radius)', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubSchoolsByArea(page);
    await stubSchoolById(page, MANIPAL_SCHOOL);
    await stubDiscoverListings(page);
    await stubCityListings(page);

    await page.goto(
      `/discover?city=udupi&journey=school-first&zoom=14&areaKey=${ENCODED_AREA_KEY}&schoolId=${MANIPAL_SCHOOL.id}&radiusKm=3`,
    );
    await page.waitForLoadState('domcontentloaded');

    // Property markers on the map (zoom=14 > AREA_LAYER_MAX_ZOOM=12)
    const propertyMarkers = page.locator('[data-testid="property-marker"]');
    await expect(propertyMarkers.first()).toBeVisible({ timeout: 15_000 });
    expect(await propertyMarkers.count()).toBeGreaterThan(0);

    // Right panel must show a school-selected panel with listing cards
    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel).toBeVisible({ timeout: 5_000 });
    // combined-chips visible confirms we are in the combined (school-selected) panel
    await expect(page.getByTestId('combined-chips')).toBeVisible({ timeout: 10_000 });
  });

  /**
   * E2E-FOCUS-3: Select school, clear chip → URL loses schoolId + schools-in-area panel.
   *
   * Clearing the school chip must:
   *   - Remove schoolId from URL (radiusKm may also be removed)
   *   - Show the schools-in-area panel (school-card elements visible, not SchoolSelectedPanel)
   *
   * Note: areaKey remains in URL after clearing school; combined-chips disappear.
   */
  test('E2E-FOCUS-3: select school, clear chip → URL loses schoolId + schools-in-area panel shows', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubSchoolsByArea(page);
    await stubSchoolById(page, MANIPAL_SCHOOL);
    await stubDiscoverListings(page);
    await stubCityListings(page);

    // Start in combined state
    await page.goto(
      `/discover?city=udupi&journey=school-first&areaKey=${ENCODED_AREA_KEY}&schoolId=${MANIPAL_SCHOOL.id}&radiusKm=3`,
    );
    await page.waitForLoadState('domcontentloaded');

    // Wait for combined-chips (confirms combined state loaded)
    await expect(page.getByTestId('combined-chips')).toBeVisible({ timeout: 15_000 });

    // Click the clear-school chip
    const clearSchoolChip = page.getByTestId('clear-school-chip');
    await expect(clearSchoolChip).toBeVisible({ timeout: 5_000 });
    await clearSchoolChip.click();

    // schoolId must be removed from URL
    await expect.poll(() => getUrlParam(page, 'schoolId'), { timeout: 8_000 }).toBeNull();

    // areaKey must remain (school cleared, area context preserved)
    expect(getUrlParam(page, 'areaKey')).toBe(MANIPAL_AREA_KEY);

    // Right panel must show schools-in-area (school-card elements visible)
    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel.locator('[data-testid="school-card"]').first()).toBeVisible({ timeout: 15_000 });
  });

  /**
   * E2E-FOCUS-4: URL with school+radius yielding 0 properties → empty-state in right panel.
   *
   * The city-listings endpoint returns an area with 0 listings. After school selection,
   * the right panel must show an empty-state message (not a blank screen or spinner).
   *
   * This verifies the SchoolSelectedPanel renders correctly when schoolListings is empty.
   */
  test('E2E-FOCUS-4: school+radius with 0 properties → empty-state in right panel', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubSchoolsByArea(page);
    await stubSchoolById(page, MANIPAL_SCHOOL);
    await stubDiscoverListings(page);

    // City-listings stub: no properties in the area
    await page.route('**/api/discover/cities/*/listings**', (route) =>
      fulfillJson(route, 200, { areas: [{ areaKey: MANIPAL_AREA_KEY, listings: [] }] }),
    );

    await page.goto(
      `/discover?city=udupi&journey=school-first&areaKey=${ENCODED_AREA_KEY}&schoolId=${MANIPAL_SCHOOL.id}&radiusKm=3`,
    );
    await page.waitForLoadState('domcontentloaded');

    // Wait for the right panel to be visible
    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel).toBeVisible({ timeout: 15_000 });

    // combined-chips must be visible (confirms combined/school-selected panel)
    await expect(page.getByTestId('combined-chips')).toBeVisible({ timeout: 10_000 });

    // Empty-state message must render in the panel (not blank screen)
    // SchoolSelectedPanel shows "No properties found" when listing count is 0
    await expect(rightPanel.getByText(/no properties/i)).toBeVisible({ timeout: 10_000 });
  });

});

// ---------------------------------------------------------------------------
// Browser history: school selection and back navigation
// ---------------------------------------------------------------------------

test.describe('@integration-ui school-first browser history (#1130)', () => {

  /**
   * E2E-BACK-1: URL gains schoolId → browser back → URL loses schoolId, areaKey preserved.
   *
   * Tests the history PUSH semantics of school selection directly: navigate to
   * the base state (areaKey, no schoolId), then navigate to the combined state
   * (areaKey + schoolId). goBack() must restore the base state.
   *
   * This avoids card-click complexity (stub order, card rendering) and directly
   * validates what matters: browser back removes schoolId while preserving areaKey.
   *
   * The app may issue a history REPLACE on first load to normalise URL params.
   * Using two explicit page.goto() calls guarantees two distinct history entries
   * regardless of that normalisation.
   */
  test('E2E-BACK-1: select school → browser back → URL loses schoolId', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubSchoolsByArea(page);
    await stubSchoolById(page, MANIPAL_SCHOOL);
    await stubDiscoverListings(page);
    await stubCityListings(page);

    // Step 1: establish base history entry — area selected, no school
    await page.goto(
      `/discover?city=udupi&journey=school-first&areaKey=${ENCODED_AREA_KEY}`,
    );
    await page.waitForLoadState('domcontentloaded');

    // Step 2: navigate to combined state — school selected (PUSH new history entry)
    await page.goto(
      `/discover?city=udupi&journey=school-first&areaKey=${ENCODED_AREA_KEY}&schoolId=${MANIPAL_SCHOOL.id}&radiusKm=3`,
    );
    await page.waitForLoadState('domcontentloaded');

    // Step 3: schoolId must be in URL
    expect(getUrlParam(page, 'schoolId')).toBe(MANIPAL_SCHOOL.id);

    // Step 4: press browser back
    await page.goBack();

    // Step 5: schoolId must be absent; areaKey must be preserved
    await expect.poll(() => getUrlParam(page, 'schoolId'), { timeout: 8_000 }).toBeNull();
    expect(getUrlParam(page, 'areaKey')).toBe(MANIPAL_AREA_KEY);
  });

});
