/**
 * E2E: school-first journey — Issue #1003 (lean workflow-validation).
 *
 * 8 focused tests covering the school-first discovery state machine:
 *   E2E-1  Journey switcher writes journey=school-first to URL
 *   E2E-2  Area marker badge shows school count, not property count
 *   E2E-3  Area marker click → areaKey in URL + school-card in right panel
 *   E2E-4  Board chip click → board=cbse in URL
 *   E2E-5  School card click → schoolId in URL + combined-chips visible
 *   E2E-6  Clear-school chip → schoolId removed, school-card visible again
 *   E2E-7  Cold-load combined deep link → combined-chips + all 4 params present
 *   E2E-8  (optional) /by-area → [] → empty-state-no-schools-clear-filters visible
 *
 * Anonymous flow throughout — all relevant endpoints are public.
 *
 * Run locally:
 *   bash scripts/run-e2e-local.sh --project=full e2e/discover-school-first-journey.spec.ts
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

const POPULAR_SCHOOLS_FIXTURE = [
  {
    id: 'sch-1',
    name: 'Manipal Public School',
    board: 'CBSE',
    boardType: null,
    address: 'Manipal, Udupi',
    latitude: 13.3525,
    longitude: 74.7864,
    distanceKm: 1.2,
  },
  {
    id: 'sch-2',
    name: 'MIT Vidyaniketan',
    board: 'STATE',
    boardType: null,
    address: 'Manipal, Udupi',
    latitude: 13.351,
    longitude: 74.785,
    distanceKm: 1.5,
  },
];

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

// ---------------------------------------------------------------------------
// Stub helpers
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

async function stubPopularSchools(page: Page): Promise<void> {
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/public/schools/popular**', (route) =>
    fulfillJson(route, 200, POPULAR_SCHOOLS_FIXTURE),
  );
}

async function stubSchoolsByArea(page: Page, schools: unknown[] = SCHOOLS_BY_AREA_FIXTURE): Promise<void> {
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/public/schools/by-area**', (route) =>
    fulfillJson(route, 200, schools),
  );
}

async function stubSchoolSearch(page: Page, results: unknown[] = POPULAR_SCHOOLS_FIXTURE): Promise<void> {
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/public/schools/search**', (route) =>
    fulfillJson(route, 200, results),
  );
}

async function stubDiscoverListings(page: Page): Promise<void> {
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/discover/listings**', (route) =>
    fulfillJson(route, 200, EMPTY_LISTINGS_PAGE),
  );
}

async function stubSchoolById(page: Page, school: typeof MANIPAL_SCHOOL): Promise<void> {
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route(`**/api/public/schools/${school.id}`, (route) =>
    fulfillJson(route, 200, school),
  );
}

function getUrlParam(page: Page, key: string): string | null {
  return new URL(page.url()).searchParams.get(key);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('@integration-ui school-first journey (#1003)', () => {

  /**
   * E2E-1: Journey switcher card click writes journey=school-first to URL.
   * Starts at /discover?city=udupi (no journey param) and clicks the school-first card.
   */
  test('E2E-1: journey-card-school-first click → URL gains journey=school-first', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);
    await stubDiscoverListings(page);

    await page.goto('/discover?city=udupi');
    await page.waitForLoadState('domcontentloaded');

    // Journey switcher card must be visible
    const card = page.locator('[data-testid="journey-card-school-first"]');
    await expect(card).toBeVisible({ timeout: 15_000 });

    await card.click();

    await expect(page).toHaveURL(/journey=school-first/, { timeout: 8_000 });
  });

  /**
   * E2E-2: Area marker badge in school-first journey shows school count, not property count.
   * Cold-load with journey=school-first. Assert badge text matches /\d+ schools/i
   * and does NOT contain "propert".
   */
  test('E2E-2: area marker badge text shows school count, not property count', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);
    await stubDiscoverListings(page);

    await page.goto(`/discover?city=udupi&journey=school-first`);
    await page.waitForLoadState('domcontentloaded');

    // Wait for the area marker to appear
    const marker = page.locator('[data-testid="area-marker"]').first();
    await expect(marker).toBeVisible({ timeout: 15_000 });

    const badgeText = await marker.innerText();
    expect(badgeText).toMatch(/\d+\s*schools/i);
    expect(badgeText).not.toMatch(/propert/i);
  });

  /**
   * E2E-3: Area marker click → URL gains areaKey, school-card visible in right panel.
   */
  test('E2E-3: area marker click → areaKey in URL + school-card visible', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);
    await stubSchoolsByArea(page);
    await stubDiscoverListings(page);

    await page.goto(`/discover?city=udupi&journey=school-first`);
    await page.waitForLoadState('domcontentloaded');

    const marker = page.locator('[data-testid="area-marker"]').first();
    await expect(marker).toBeVisible({ timeout: 15_000 });
    await marker.click({ force: true });

    // URL must gain areaKey for Manipal
    await expect(page).toHaveURL(/areaKey=/, { timeout: 8_000 });
    const areaKeyInUrl = getUrlParam(page, 'areaKey');
    expect(areaKeyInUrl).toBe(MANIPAL_AREA_KEY);

    // School cards must be visible in the right panel
    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel).toBeVisible({ timeout: 5_000 });
    await expect(rightPanel.locator('[data-testid="school-card"]').first()).toBeVisible({ timeout: 15_000 });
  });

  /**
   * E2E-4: Board chip (CBSE) click → URL gains board=cbse.
   * Cold-load with journey=school-first&areaKey already set.
   */
  test('E2E-4: board-chip-cbse click → URL gains board=cbse', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);
    await stubSchoolsByArea(page);
    await stubDiscoverListings(page);

    await page.goto(`/discover?city=udupi&journey=school-first&areaKey=${ENCODED_AREA_KEY}`);
    await page.waitForLoadState('domcontentloaded');

    // Wait for the board chip to be available
    const cbseChip = page.locator('[data-testid="board-chip-cbse"]');
    await expect(cbseChip).toBeVisible({ timeout: 15_000 });

    await cbseChip.click();

    await page.waitForURL(/board=cbse/i, { timeout: 8_000 });
    expect(new URL(page.url()).searchParams.get('board')).toMatch(/cbse/i);
  });

  /**
   * E2E-5: School card click → schoolId in URL + combined-chips and both clear chips visible.
   * Cold-load with areaKey set, click first school-card.
   */
  test('E2E-5: school-card click → schoolId in URL + combined-chips + both clear chips visible', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);
    await stubSchoolsByArea(page);
    await stubSchoolById(page, MANIPAL_SCHOOL);
    await stubDiscoverListings(page);

    await page.goto(`/discover?city=udupi&journey=school-first&areaKey=${ENCODED_AREA_KEY}`);
    await page.waitForLoadState('domcontentloaded');

    // Wait for school card and click it
    const schoolCard = page.locator('[data-testid="school-card"]').first();
    await expect(schoolCard).toBeVisible({ timeout: 15_000 });
    await schoolCard.click();

    // URL must gain schoolId
    await expect.poll(() => getUrlParam(page, 'schoolId'), { timeout: 8_000 }).not.toBeNull();

    // combined-chips container and both clear chips must be visible
    await expect(page.getByTestId('combined-chips')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('clear-area-chip')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('clear-school-chip')).toBeVisible({ timeout: 5_000 });
  });

  /**
   * E2E-6: Clear-school chip → schoolId removed from URL, school-cards visible again.
   * Cold-loads combined state (same as E2E-7) then clears school.
   */
  test('E2E-6: clear-school-chip → URL loses schoolId + school-card visible', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);
    await stubSchoolsByArea(page);
    await stubSchoolById(page, MANIPAL_SCHOOL);
    await stubDiscoverListings(page);

    // Cold-load combined state (both areaKey and schoolId set)
    await page.goto(
      `/discover?city=udupi&journey=school-first&areaKey=${ENCODED_AREA_KEY}&schoolId=${MANIPAL_SCHOOL.id}&radiusKm=3`,
    );
    await page.waitForLoadState('domcontentloaded');

    // Wait for combined-chips to appear
    await expect(page.getByTestId('combined-chips')).toBeVisible({ timeout: 15_000 });

    const clearSchoolChip = page.getByTestId('clear-school-chip');
    await expect(clearSchoolChip).toBeVisible({ timeout: 5_000 });
    await clearSchoolChip.click();

    // schoolId must be removed from URL
    await expect.poll(() => getUrlParam(page, 'schoolId'), { timeout: 8_000 }).toBeNull();

    // School cards must be visible again (schools-in-area panel re-renders)
    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel.locator('[data-testid="school-card"]').first()).toBeVisible({ timeout: 15_000 });
  });

  /**
   * E2E-7: Cold-load combined deep link → combined-chips visible + all 4 params present.
   * Navigates directly to a URL with journey, areaKey, schoolId, and radiusKm.
   */
  test('E2E-7: cold-load combined deep link → combined-chips visible + all 4 params present', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);
    await stubSchoolsByArea(page);
    await stubSchoolById(page, MANIPAL_SCHOOL);
    await stubDiscoverListings(page);

    await page.goto(
      `/discover?city=udupi&journey=school-first&areaKey=${ENCODED_AREA_KEY}&schoolId=${MANIPAL_SCHOOL.id}&radiusKm=3`,
    );
    await page.waitForLoadState('domcontentloaded');

    // combined-chips must be visible after cold-load hydration
    await expect(page.getByTestId('combined-chips')).toBeVisible({ timeout: 15_000 });

    // All 4 required params must be present in the URL
    const url = new URL(page.url());
    expect(url.searchParams.get('journey')).toBe('school-first');
    expect(url.searchParams.get('areaKey')).toBe(MANIPAL_AREA_KEY);
    expect(url.searchParams.get('schoolId')).toBe(MANIPAL_SCHOOL.id);
    expect(url.searchParams.get('radiusKm')).toBe('3');
  });

  /**
   * E2E-9: school-browse panel is visible at /discover?city=udupi&journey=school-first
   * (no areaKey set). Popular schools are rendered; no Milestone2Placeholder text.
   */
  test('E2E-9: school-browse panel visible — shows header and popular schools', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);
    await stubDiscoverListings(page);

    await page.goto('/discover?city=udupi&journey=school-first');
    await page.waitForLoadState('domcontentloaded');

    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel).toBeVisible({ timeout: 15_000 });

    // Header text
    await expect(rightPanel.getByText('Find homes near a school')).toBeVisible({ timeout: 10_000 });

    // Search input
    await expect(rightPanel.getByPlaceholder('Search school name...')).toBeVisible();

    // Popular school cards rendered (no Milestone2Placeholder)
    await expect(rightPanel.getByText('Manipal Public School')).toBeVisible({ timeout: 10_000 });
    await expect(rightPanel.getByText(/coming in milestone 2/i)).not.toBeVisible();
  });

  /**
   * E2E-10: Popular school card click routes to school-selected with schoolId in URL.
   */
  test('E2E-10: popular school card click → schoolId in URL', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);
    await stubSchoolById(page, MANIPAL_SCHOOL);
    await stubDiscoverListings(page);

    await page.goto('/discover?city=udupi&journey=school-first');
    await page.waitForLoadState('domcontentloaded');

    const rightPanel = page.getByTestId('discover-right-panel');
    const schoolCard = rightPanel.getByText('Manipal Public School');
    await expect(schoolCard).toBeVisible({ timeout: 15_000 });
    await schoolCard.click();

    await expect.poll(() => getUrlParam(page, 'schoolId'), { timeout: 8_000 }).toBe(MANIPAL_SCHOOL.id);
  });

  /**
   * E2E-11: Search result school card click routes to school-selected.
   */
  test('E2E-11: school search result click → schoolId in URL', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);
    await stubSchoolSearch(page);
    await stubSchoolById(page, MANIPAL_SCHOOL);
    await stubDiscoverListings(page);

    await page.goto('/discover?city=udupi&journey=school-first');
    await page.waitForLoadState('domcontentloaded');

    const rightPanel = page.getByTestId('discover-right-panel');
    const searchInput = rightPanel.getByPlaceholder('Search school name...');
    await expect(searchInput).toBeVisible({ timeout: 10_000 });
    await searchInput.fill('Manipal');

    // Wait for search result to appear
    await expect(rightPanel.getByText('Manipal Public School').first()).toBeVisible({ timeout: 10_000 });
    await rightPanel.getByText('Manipal Public School').first().click();

    await expect.poll(() => getUrlParam(page, 'schoolId'), { timeout: 8_000 }).toBe(MANIPAL_SCHOOL.id);
  });

  /**
   * E2E-12: Area card click in school-browse panel routes to schools-in-area with areaKey in URL.
   */
  test('E2E-12: area card click in school-browse → areaKey in URL', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);
    await stubSchoolsByArea(page);
    await stubDiscoverListings(page);

    await page.goto('/discover?city=udupi&journey=school-first');
    await page.waitForLoadState('domcontentloaded');

    const rightPanel = page.getByTestId('discover-right-panel');

    // Area card (from discoverAreas fixture — "Manipal" with 4 schools).
    // Use data-testid="area-card" to avoid partial-text collision with school cards
    // that also contain "Manipal" (e.g. "Manipal Public School").
    const areaCard = rightPanel.getByTestId('area-card').first();
    await expect(areaCard).toBeVisible({ timeout: 15_000 });
    await areaCard.click();

    await expect.poll(() => getUrlParam(page, 'areaKey'), { timeout: 8_000 }).toBe(MANIPAL_AREA_KEY);
  });

  /**
   * E2E-8 (optional): /by-area returns [] → empty-state-no-schools-clear-filters visible.
   */
  test('E2E-8: empty /by-area → empty-state-no-schools-clear-filters visible', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);
    await stubSchoolsByArea(page, []);
    await stubDiscoverListings(page);

    await page.goto(`/discover?city=udupi&journey=school-first&areaKey=${ENCODED_AREA_KEY}`);
    await page.waitForLoadState('domcontentloaded');

    await expect(
      page.getByTestId('empty-state-no-schools-clear-filters'),
    ).toBeVisible({ timeout: 15_000 });
  });

  /**
   * E2E-13: cold-load schoolId without journey param → school-selected panel renders.
   * Issue #1038: bare schoolId URL (/discover?city=udupi&schoolId=<id>) should restore
   * the school-selected state via derivePanelContent, even without explicit journey param.
   */
  test('E2E-13: cold-load with bare schoolId (no journey param) → school-selected panel', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);
    await stubSchoolById(page, MANIPAL_SCHOOL);
    await stubDiscoverListings(page);

    // Navigate to bare schoolId URL (no journey param)
    await page.goto(`/discover?city=udupi&schoolId=${MANIPAL_SCHOOL.id}`);
    await page.waitForLoadState('domcontentloaded');

    // Right panel must be visible
    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel).toBeVisible({ timeout: 15_000 });

    // School name must be displayed in the header (heading)
    await expect(rightPanel.getByRole('heading', { name: 'Manipal Public School' })).toBeVisible({ timeout: 10_000 });

    // Radius selector must be visible (confirms school-selected, not placeholder)
    await expect(rightPanel.getByRole('group', { name: /select search radius/i })).toBeVisible({ timeout: 5_000 });

    // Verify the panel is not showing a placeholder message
    await expect(rightPanel.getByText(/coming in milestone 2/i)).not.toBeVisible();
  });

  /**
   * E2E-8a: /by-area API returns 500 error → SchoolMarkerLayer shows error UI.
   * Issue #1045: API diagnostics — error state handling.
   */
  test('E2E-8a: /by-area API error (500) → SchoolMarkerLayer shows error message', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);
    await stubDiscoverListings(page);

    // Intercept /api/public/schools/by-area and return 500 error
    // INTEGRATION-UI: stub justified — force error response to assert error-state UI
    await page.route('/api/public/schools/by-area*', (route) => {
      route.abort('failed');
    });

    await page.goto(`/discover?city=udupi&journey=school-first&areaKey=${ENCODED_AREA_KEY}`);
    await page.waitForLoadState('domcontentloaded');

    // SchoolMarkerLayer should show error message in the map area
    const errorDiv = page.getByTestId('school-marker-error');
    await expect(errorDiv).toBeVisible({ timeout: 15_000 });

    // Error message should be visible (generic or specific API error)
    await expect(errorDiv).toContainText(/failed|error/i);
  });

  /**
   * E2E-8b: /by-area API returns empty array → SchoolMarkerLayer shows empty state UI.
   * Issue #1045: API diagnostics — empty state handling with console.warn.
   */
  test('E2E-8b: /by-area returns empty array → SchoolMarkerLayer shows empty message', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);
    await stubSchoolsByArea(page, []);
    await stubDiscoverListings(page);

    // Listen for console.warn calls
    const warnings: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'warning') {
        warnings.push(msg.text());
      }
    });

    await page.goto(`/discover?city=udupi&journey=school-first&areaKey=${ENCODED_AREA_KEY}`);
    await page.waitForLoadState('domcontentloaded');

    // SchoolMarkerLayer should show empty state message in the map area
    const emptyDiv = page.getByTestId('school-marker-empty');
    await expect(emptyDiv).toBeVisible({ timeout: 15_000 });

    // Empty message should be specific
    await expect(emptyDiv).toContainText(/no schools found/i);

    // Verify console.warn was called for empty state
    // Note: console.warn calls are collected asynchronously, so this is a soft check
    await page.waitForTimeout(500);
    const hasEmptyWarning = warnings.some((w) =>
      w.includes('[SchoolMarkerLayer]') && w.includes('No schools found')
    );
    expect(hasEmptyWarning).toBe(true);
  });

});

// ---------------------------------------------------------------------------
// Issue #1118 regression: property markers must NOT disappear while the
// school-proximity markers request is in-flight after school selection.
//
// Root cause: MapDiscovery.tsx line 516 — when schoolId is set in URL,
// the IIFE returned markerListings which was empty because the query was
// initially disabled. The area markers (areaMarkerListings) were discarded.
// Fix: the IIFE now falls back to areaMarkerListings while the markers
// query is still loading (isLoadingMarkers guard).
//
// Marker source chain:
//   areaMarkerListings  ← /api/discover/cities/{city}/listings  (city-level)
//   markerListings      ← /api/discover/markers                 (school-proximity)
//
// For property-marker elements to render the map zoom must be > 12
// (AREA_LAYER_MAX_ZOOM). URL param zoom=14 satisfies this.
// ---------------------------------------------------------------------------

test.describe('Issue #1118 regression — markers persist during school-proximity in-flight', () => {

  /**
   * E2E-1118: School card click while in school-first+areaKey state must NOT
   * blank the map during the in-flight school-proximity markers request.
   *
   * Strategy:
   *   1. Cold-load with zoom=14 + areaKey set; stub city-listings with a
   *      fixture that has lat/lon so areaMarkerListings is non-empty.
   *   2. Verify property markers are visible before school selection.
   *   3. Intercept the school-proximity /api/discover/markers request and
   *      hold it via a deferred Promise.
   *   4. Click a school card to trigger the in-flight request.
   *   5. While the request is pending, assert markers have NOT disappeared.
   *   6. Release the deferred request and verify settled state.
   */
  test('E2E-1118: markers remain visible while school-proximity request is in-flight', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);
    await stubSchoolsByArea(page);
    await stubSchoolById(page, MANIPAL_SCHOOL);
    await stubDiscoverListings(page);

    // City-listings stub: one listing with lat/lon so areaMarkerListings is non-empty.
    // areaMarkerListings filters by selectedArea.areaKey, so the area key must match.
    const CITY_LISTINGS_FIXTURE = {
      areas: [
        {
          areaKey: MANIPAL_AREA_KEY,
          listings: [
            {
              id: 'listing-1118',
              title: 'Regression Test Property',
              propertyType: 'house',
              price: 4_500_000,
              lat: 13.3525,
              lon: 74.7864,
              latitude: 13.3525,
              longitude: 74.7864,
              locality: 'Manipal',
              bedrooms: 3,
              status: 'LIVE',
            },
          ],
        },
      ],
    };
    await page.route('**/api/discover/cities/*/listings**', (route) =>
      fulfillJson(route, 200, CITY_LISTINGS_FIXTURE),
    );

    // Deferred gate: hold the school-proximity markers request in-flight.
    let releaseInFlightRequest!: () => void;
    const inFlightGate = new Promise<void>((resolve) => {
      releaseInFlightRequest = resolve;
    });
    let markersRequestCount = 0;

    const SCHOOL_PROXIMITY_MARKERS_RESPONSE = {
      city: 'udupi',
      markers: [
        {
          id: 'prop-marker-1118-settled',
          latitude: 13.3525,
          longitude: 74.7864,
          pricePaise: 4_500_000,
          title: 'Regression Test Property',
          propertyType: 'house',
        },
      ],
    };

    await page.route('**/api/discover/markers**', async (route) => {
      markersRequestCount += 1;
      // Hold every markers request in-flight until the gate is released.
      // This simulates the school-proximity fetch latency window.
      await inFlightGate;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(SCHOOL_PROXIMITY_MARKERS_RESPONSE),
      });
    });

    // Cold-load: school-first + areaKey + zoom=14 (above AREA_LAYER_MAX_ZOOM=12).
    // zoom=14 is required for PropertyMap to render property-marker elements.
    await page.goto(
      `/discover?city=udupi&journey=school-first&zoom=14&areaKey=${ENCODED_AREA_KEY}`,
      { waitUntil: 'domcontentloaded' },
    );

    // Step 1: Wait for school cards to confirm the schools-in-area panel is ready.
    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel).toBeVisible({ timeout: 10_000 });
    const schoolCard = rightPanel.locator('[data-testid="school-card"]').first();
    await expect(schoolCard).toBeVisible({ timeout: 15_000 });

    // Step 2: Verify area property markers are visible before school selection.
    // These come from areaMarkerListings (city-listings fixture), not the markers API.
    const propertyMarkers = page.locator('[data-testid="property-marker"]');
    await expect(propertyMarkers.first()).toBeVisible({ timeout: 15_000 });
    expect(await propertyMarkers.count()).toBeGreaterThan(0);

    // Step 3: Register listener for the school-proximity markers request BEFORE clicking.
    const schoolProximityRequestPromise = page.waitForRequest(
      (req) => req.url().includes('/api/discover/markers'),
    );

    // Step 4: Click school card — sets schoolId in URL and enables the markers query.
    await schoolCard.click();

    // Step 5: Wait for the school-proximity request to be intercepted (in-flight, not resolved).
    await schoolProximityRequestPromise;

    // Step 6: While the request is still pending, markers must NOT have disappeared.
    // Prior to the #1118 fix: IIFE returned empty markerListings, blanking the map.
    // After the fix: IIFE falls back to areaMarkerListings while loading.
    expect(await propertyMarkers.count()).toBeGreaterThan(0);

    // Step 7: Release the gate and wait for schoolId to appear in URL.
    releaseInFlightRequest();
    await expect(page).toHaveURL(/schoolId=/, { timeout: 8_000 });

    // Step 8: Settled state — proximity markers now visible (stub returns 1 marker).
    await expect(propertyMarkers.first()).toBeVisible({ timeout: 12_000 });
    expect(await propertyMarkers.count()).toBeGreaterThan(0);
  });

});
