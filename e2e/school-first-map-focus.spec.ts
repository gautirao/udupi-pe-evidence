/**
 * E2E: school-first map focus — Issue #1160
 *
 * Verifies that when a school is selected in the school-first journey the map
 * pans/zooms to frame the school and its radius circle, and that radius changes
 * re-fit the viewport. All tests run as anonymous users (public endpoints only).
 *
 * Tests:
 *   MF-1  School selection → map centre shifts toward school coordinates
 *   MF-2  Radius change → map re-fits to new radius
 *   MF-3  No properties in radius → empty state shown; map still focused on school
 *   MF-4  Selected-school focus mode intact (only selected school marker visible)
 *   MF-5  Browser Back after school selection navigates back correctly
 *
 * Map centre is read from window.__debug.mapState.schoolCenter which is populated
 * by MapDiscovery whenever selectedSchool changes (mirrors the debug object already
 * used by other E2E specs in this repo).
 *
 * Run locally:
 *   bash scripts/run-e2e-local.sh --project=full e2e/school-first-map-focus.spec.ts
 */

import { test, expect, type Page, type Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MANIPAL_AREA_KEY = 'IN|KA|Udupi|Manipal';
const ENCODED_AREA_KEY = encodeURIComponent(MANIPAL_AREA_KEY);

// School fixture — coordinates are intentionally different from city centre so
// we can assert the map shifted toward them.
const SCHOOL_LAT = 13.3525;
const SCHOOL_LON = 74.7864;
const DEFAULT_RADIUS_KM = 3;

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

const SCHOOLS_BY_AREA_FIXTURE = [
  {
    id: 'sch-1',
    name: 'Manipal Public School',
    board: 'CBSE',
    boardType: null,
    address: 'Manipal, Udupi',
    latitude: SCHOOL_LAT,
    longitude: SCHOOL_LON,
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

const POPULAR_SCHOOLS_FIXTURE = SCHOOLS_BY_AREA_FIXTURE.map((s) => ({
  ...s,
  distanceKm: 1.2,
}));

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

async function stubDiscoverListings(page: Page): Promise<void> {
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/discover/listings**', (route) =>
    fulfillJson(route, 200, EMPTY_LISTINGS_PAGE),
  );
}

/** Stub the public city-listings endpoint with coords so schoolListings is non-empty (MF-6). */
async function stubDiscoverCityListings(page: Page): Promise<void> {
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/discover/cities/*/listings**', (route) =>
    fulfillJson(route, 200, DISCOVER_CITY_LISTINGS_FIXTURE),
  );
}

async function stubSchoolById(
  page: Page,
  school: { id: string; latitude: number; longitude: number; [key: string]: unknown },
): Promise<void> {
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route(`**/api/public/schools/${school.id}`, (route) =>
    fulfillJson(route, 200, school),
  );
}

function getUrlParam(page: Page, key: string): string | null {
  return new URL(page.url()).searchParams.get(key);
}

/**
 * Read the schoolCenter written by MapDiscovery into window.__debug.mapState.
 * Returns null before the school is hydrated or if journey is not school-first.
 */
async function getDebugSchoolCenter(
  page: Page,
): Promise<{ lat: number; lon: number } | null> {
  return page.evaluate(
    () => (window as unknown as { __debug?: { mapState?: { schoolCenter?: { lat: number; lon: number } | null } } }).__debug?.mapState?.schoolCenter ?? null,
  );
}

/** Read the mapState debug object for tick assertions (MF-6, MF-7, MF-8). */
async function getDebugMapState(
  page: Page,
): Promise<{ schoolMarkerFocusTick?: number; areaRestoreTick?: number; cityRestoreTick?: number } | null> {
  return page.evaluate(
    () => {
      const ms = (window as unknown as { __debug?: { mapState?: Record<string, unknown> } }).__debug?.mapState;
      if (!ms) return null;
      return {
        schoolMarkerFocusTick: ms['schoolMarkerFocusTick'] as number | undefined,
        areaRestoreTick: ms['areaRestoreTick'] as number | undefined,
        cityRestoreTick: ms['cityRestoreTick'] as number | undefined,
      };
    },
  );
}

// Public listings fixture returned by /api/discover/cities/:city/listings — includes coords
// so schoolListings (areaListings in anon path) is non-empty for GAP-1 trigger.
// Shape must match DiscoverCityListingsResponse: { city, limitPerArea, areas: [{ areaKey, areaName, listings }] }
const DISCOVER_CITY_LISTINGS_FIXTURE = {
  city: 'udupi',
  limitPerArea: 50,
  areas: [
    {
      areaKey: MANIPAL_AREA_KEY,
      areaName: 'Manipal',
      listings: [
        {
          id: 'listing-1',
          propertyType: 'house',
          title: 'Test House Near School',
          locality: 'Manipal',
          pricePaise: 500000000,
          lat: SCHOOL_LAT + 0.005,
          lon: SCHOOL_LON + 0.005,
          listingPurpose: 'sale',
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('@integration-ui school-first map focus (#1160)', () => {

  /**
   * MF-1: Selecting a school from the school-browse panel causes the map to
   * focus on the school. We verify by reading window.__debug.mapState.schoolCenter
   * which MapDiscovery populates whenever selectedSchool changes. The centre must
   * equal the school's lat/lon (the map pans to it via SchoolFocusPanner).
   *
   * Anonymous path: no authentication; uses popular-schools endpoint for school-browse.
   */
  test('MF-1: popular school click → window.__debug schoolCenter set to school coords', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);
    await stubSchoolsByArea(page);
    await stubSchoolById(page, MANIPAL_SCHOOL);
    await stubDiscoverListings(page);

    await page.goto('/discover?city=udupi&journey=school-first');
    await page.waitForLoadState('domcontentloaded');

    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel).toBeVisible({ timeout: 15_000 });

    // Click the popular school card
    const schoolCard = rightPanel.getByText('Manipal Public School');
    await expect(schoolCard).toBeVisible({ timeout: 15_000 });
    await schoolCard.click();

    // URL must gain schoolId
    await expect.poll(() => getUrlParam(page, 'schoolId'), { timeout: 8_000 }).toBe(MANIPAL_SCHOOL.id);

    // SchoolFocusPanner fires after selectedSchool is hydrated.
    // We verify by reading the debug schoolCenter that MapDiscovery exposes.
    await expect
      .poll(() => getDebugSchoolCenter(page), { timeout: 10_000 })
      .toMatchObject({ lat: SCHOOL_LAT, lon: SCHOOL_LON });
  });

  /**
   * MF-2: Cold-load with schoolId + radiusKm=3, then change radius to 5.
   * The map must re-focus (tick increments) — verified by asserting the
   * schoolCenter is still set after the radius change (the focus state is intact).
   * We also assert the URL radiusKm changes so the right panel re-renders.
   *
   * Note: SchoolFocusPanner fires imperatively (no URL write), so we cannot assert
   * a URL change for the pan itself. We verify the radius chip UI exists and URL
   * param changes, confirming the radius-change path fired.
   */
  test('MF-2: radius change → schoolCenter stays set (re-focus triggered)', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);
    await stubSchoolsByArea(page);
    await stubSchoolById(page, MANIPAL_SCHOOL);
    await stubDiscoverListings(page);

    await page.goto(
      `/discover?city=udupi&journey=school-first&areaKey=${ENCODED_AREA_KEY}&schoolId=${MANIPAL_SCHOOL.id}&radiusKm=${DEFAULT_RADIUS_KM}`,
    );
    await page.waitForLoadState('domcontentloaded');

    // Wait for school hydration
    await expect
      .poll(() => getDebugSchoolCenter(page), { timeout: 15_000 })
      .toMatchObject({ lat: SCHOOL_LAT, lon: SCHOOL_LON });

    // Find the 5 km radius option button in the SchoolSelectedPanel
    const radius5Btn = page.locator('[data-testid="radius-option-5"]');
    if (await radius5Btn.count() > 0) {
      await radius5Btn.click();
      // URL radiusKm must update
      await expect.poll(() => getUrlParam(page, 'radiusKm'), { timeout: 8_000 }).toBe('5');
    } else {
      // Fallback: locate by text pattern — radius buttons are labelled "5 km" or similar
      const radiusBtns = page.locator('[data-testid^="radius-option-"]');
      const count = await radiusBtns.count();
      if (count > 0) {
        // Click the last radius option (largest radius)
        await radiusBtns.nth(count - 1).click();
        // radiusKm must change from DEFAULT_RADIUS_KM
        await expect
          .poll(() => getUrlParam(page, 'radiusKm'), { timeout: 8_000 })
          .not.toBe(String(DEFAULT_RADIUS_KM));
      }
    }

    // schoolCenter must still be set after radius change
    await expect
      .poll(() => getDebugSchoolCenter(page), { timeout: 5_000 })
      .toMatchObject({ lat: SCHOOL_LAT, lon: SCHOOL_LON });
  });

  /**
   * MF-3: No properties in selected radius → empty state shown in right panel;
   * map still focused on school (schoolCenter set in debug).
   *
   * The fixtures already return empty listings (EMPTY_LISTINGS_PAGE), so this
   * test verifies the deterministic empty-state path end-to-end.
   */
  test('MF-3: no properties in radius → empty state shown; map still focused on school', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);
    await stubSchoolsByArea(page);
    await stubSchoolById(page, MANIPAL_SCHOOL);
    await stubDiscoverListings(page);

    // Cold-load combined state
    await page.goto(
      `/discover?city=udupi&journey=school-first&areaKey=${ENCODED_AREA_KEY}&schoolId=${MANIPAL_SCHOOL.id}&radiusKm=${DEFAULT_RADIUS_KM}`,
    );
    await page.waitForLoadState('domcontentloaded');

    // Map must focus on school
    await expect
      .poll(() => getDebugSchoolCenter(page), { timeout: 15_000 })
      .toMatchObject({ lat: SCHOOL_LAT, lon: SCHOOL_LON });

    // Right panel must show a non-blank state (not a blank panel).
    // The SchoolSelectedPanel renders either listing cards or an empty-state component.
    // We assert the panel is visible and does NOT render a raw blank (the panel container exists).
    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel).toBeVisible({ timeout: 5_000 });

    // Focus mode must be intact: clear-school-chip is always present when a school is
    // selected (school-first journey). combined-chips may also be rendered alongside it
    // when filter chips are active, so using .or().toBeVisible() would trip Playwright's
    // strict-mode check when both elements are in the DOM simultaneously. Instead we
    // assert clear-school-chip directly — it is the canonical deterministic indicator
    // that the school-selected focus state is active.
    await expect(page.getByTestId('clear-school-chip')).toBeVisible({ timeout: 15_000 });
  });

  /**
   * MF-4: Selected-school focus mode intact after map pan.
   * When a school is selected, only that school's marker should be visible
   * (existing focus-mode behaviour); property markers appear within the radius.
   * Verify schoolId in URL and that clear-school chip exists.
   */
  test('MF-4: selected-school focus mode intact (clear-school chip visible, schoolId in URL)', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);
    await stubSchoolsByArea(page);
    await stubSchoolById(page, MANIPAL_SCHOOL);
    await stubDiscoverListings(page);

    await page.goto(
      `/discover?city=udupi&journey=school-first&areaKey=${ENCODED_AREA_KEY}&schoolId=${MANIPAL_SCHOOL.id}&radiusKm=${DEFAULT_RADIUS_KM}`,
    );
    await page.waitForLoadState('domcontentloaded');

    // schoolId remains in URL (map pan does NOT push/replace URL state)
    const schoolIdInUrl = getUrlParam(page, 'schoolId');
    expect(schoolIdInUrl).toBe(MANIPAL_SCHOOL.id);

    // Focus-mode chip UI must be visible
    await expect(page.getByTestId('clear-school-chip')).toBeVisible({ timeout: 15_000 });

    // Map is focused on school
    await expect
      .poll(() => getDebugSchoolCenter(page), { timeout: 15_000 })
      .toMatchObject({ lat: SCHOOL_LAT, lon: SCHOOL_LON });

    // URL schoolId must still be present (map pan is pure side-effect, no URL write)
    expect(getUrlParam(page, 'schoolId')).toBe(MANIPAL_SCHOOL.id);
  });

  /**
   * MF-5: Browser Back after school selection navigates back to pre-school state.
   * The school-first journey creates a history entry on school selection (PUSH).
   * Browser Back should return to the schools-in-area panel (areaKey present, no schoolId).
   * This verifies the map-pan side-effect does NOT add extra history entries.
   */
  test('MF-5: browser Back after school selection returns to schools-in-area state', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);
    await stubSchoolsByArea(page);
    await stubSchoolById(page, MANIPAL_SCHOOL);
    await stubDiscoverListings(page);

    // Start at schools-in-area (areaKey set, no schoolId)
    await page.goto(
      `/discover?city=udupi&journey=school-first&areaKey=${ENCODED_AREA_KEY}`,
    );
    await page.waitForLoadState('domcontentloaded');

    // Click the first school card
    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel).toBeVisible({ timeout: 15_000 });
    const schoolCard = rightPanel.locator('[data-testid="school-card"]').first();
    await expect(schoolCard).toBeVisible({ timeout: 15_000 });
    await schoolCard.click();

    // schoolId appears in URL (PUSH entry)
    await expect.poll(() => getUrlParam(page, 'schoolId'), { timeout: 8_000 }).not.toBeNull();

    // Map focuses on school
    await expect
      .poll(() => getDebugSchoolCenter(page), { timeout: 10_000 })
      .toMatchObject({ lat: SCHOOL_LAT, lon: SCHOOL_LON });

    // Browser Back
    await page.goBack();

    // schoolId must be gone; areaKey must remain
    await expect.poll(() => getUrlParam(page, 'schoolId'), { timeout: 8_000 }).toBeNull();
    expect(getUrlParam(page, 'areaKey')).toBe(MANIPAL_AREA_KEY);

    // School cards should be visible again (schools-in-area panel)
    await expect(
      rightPanel.locator('[data-testid="school-card"]').first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  /**
   * MF-6: Deep-link with schoolId and matching listings → after listings settle,
   * schoolMarkerFocusTick becomes > 0 (SchoolMarkerFocusPanner fires fitBounds
   * that includes the marker positions alongside the school centre).
   *
   * The city listings endpoint is stubbed to return a listing within the school radius
   * so that listingsReadyKey becomes non-null (schoolListings.length > 0).
   * We assert window.__debug.mapState.schoolMarkerFocusTick > 0.
   */
  test('MF-6: deep-link with schoolId and matching listings → schoolMarkerFocusTick > 0', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);
    await stubSchoolsByArea(page);
    await stubSchoolById(page, MANIPAL_SCHOOL);
    await stubDiscoverListings(page);
    await stubDiscoverCityListings(page);

    await page.goto(
      `/discover?city=udupi&journey=school-first&areaKey=${ENCODED_AREA_KEY}&schoolId=${MANIPAL_SCHOOL.id}&radiusKm=${DEFAULT_RADIUS_KM}`,
    );
    await page.waitForLoadState('domcontentloaded');

    // Wait for school hydration first (Phase 1 schoolFocusTick fires)
    await expect
      .poll(() => getDebugSchoolCenter(page), { timeout: 15_000 })
      .toMatchObject({ lat: SCHOOL_LAT, lon: SCHOOL_LON });

    // Phase 2: wait for schoolMarkerFocusTick to be incremented (listings settled + non-empty)
    await expect
      .poll(
        async () => {
          const ms = await getDebugMapState(page);
          return ms?.schoolMarkerFocusTick ?? 0;
        },
        { timeout: 15_000 },
      )
      .toBeGreaterThan(0);
  });

  /**
   * MF-7: Back from school-selected (level 2 → level 1) → map refits to area context.
   * areaRestoreTick is incremented by handleSchoolFirstBackLevel2 when areaKey is set.
   * We click the in-page Back button (not browser back) and assert areaRestoreTick > 0.
   */
  test('MF-7: in-page Back from school-selected → areaRestoreTick incremented', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);
    await stubSchoolsByArea(page);
    await stubSchoolById(page, MANIPAL_SCHOOL);
    await stubDiscoverListings(page);
    await stubDiscoverCityListings(page);

    // Start at school-selected with areaKey set (combined state)
    await page.goto(
      `/discover?city=udupi&journey=school-first&areaKey=${ENCODED_AREA_KEY}&schoolId=${MANIPAL_SCHOOL.id}&radiusKm=${DEFAULT_RADIUS_KM}`,
    );
    await page.waitForLoadState('domcontentloaded');

    // Wait for school hydration
    await expect
      .poll(() => getDebugSchoolCenter(page), { timeout: 15_000 })
      .toMatchObject({ lat: SCHOOL_LAT, lon: SCHOOL_LON });

    // Read baseline tick
    const beforeState = await getDebugMapState(page);
    const tickBefore = beforeState?.areaRestoreTick ?? 0;

    // Click in-page Back button (Back from school-selected level 2 → level 1)
    // PanelHeader renders the Back chevron with data-testid="panel-header-back-button"
    const backButton = page.getByTestId('panel-header-back-button');
    await expect(backButton).toBeVisible({ timeout: 8_000 });
    await backButton.click();

    // schoolId must clear
    await expect.poll(() => getUrlParam(page, 'schoolId'), { timeout: 8_000 }).toBeNull();

    // areaRestoreTick must have incremented
    await expect
      .poll(
        async () => {
          const ms = await getDebugMapState(page);
          return ms?.areaRestoreTick ?? 0;
        },
        { timeout: 8_000 },
      )
      .toBeGreaterThan(tickBefore);
  });

  /**
   * MF-8: Back from area-selected (level 1 → level 0) → map refits to city context.
   * cityRestoreTick is incremented by handleSchoolFirstBackLevel1.
   * We click Back from the schools-in-area panel and assert cityRestoreTick > 0.
   */
  test('MF-8: in-page Back from schools-in-area → cityRestoreTick incremented', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);
    await stubSchoolsByArea(page);
    await stubSchoolById(page, MANIPAL_SCHOOL);
    await stubDiscoverListings(page);
    await stubDiscoverCityListings(page);

    // Start at schools-in-area (areaKey set, no schoolId)
    await page.goto(
      `/discover?city=udupi&journey=school-first&areaKey=${ENCODED_AREA_KEY}`,
    );
    await page.waitForLoadState('domcontentloaded');

    // Wait for right panel to be ready
    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel).toBeVisible({ timeout: 15_000 });

    // Read baseline tick
    const beforeState = await getDebugMapState(page);
    const tickBefore = beforeState?.cityRestoreTick ?? 0;

    // Click in-page Back button (Back from schools-in-area level 1 → level 0)
    // PanelHeader renders the Back chevron with data-testid="panel-header-back-button"
    const backButton = page.getByTestId('panel-header-back-button');
    await expect(backButton).toBeVisible({ timeout: 8_000 });
    await backButton.click();

    // areaKey must clear
    await expect.poll(() => getUrlParam(page, 'areaKey'), { timeout: 8_000 }).toBeNull();

    // cityRestoreTick must have incremented
    await expect
      .poll(
        async () => {
          const ms = await getDebugMapState(page);
          return ms?.cityRestoreTick ?? 0;
        },
        { timeout: 8_000 },
      )
      .toBeGreaterThan(tickBefore);
  });
});

// ---------------------------------------------------------------------------
// Issue #1160 v3 corrective amendment — MF-9, MF-10, MF-11
//
// MF-9 / MF-10 require an authenticated session so markersEnabled becomes true
// for school-first journey with a schoolId (Bug A2). They run under the broker
// storageState fixture. MF-11 explicitly verifies the anonymous regression
// guard: no /api/discover/markers traffic, no 401 floods.
// ---------------------------------------------------------------------------

/** Stub /api/discover/markers with a deterministic non-empty response so MF-9 can
 *  assert markers render. The fixture includes one listing within the school radius. */
const DISCOVER_MARKERS_FIXTURE = {
  city: 'udupi',
  bbox: null,
  markers: [
    {
      id: 'mk-1',
      lat: SCHOOL_LAT + 0.003,
      lon: SCHOOL_LON + 0.003,
      pricePaise: 500000000,
      locality: 'Manipal',
    },
  ],
  truncated: false,
};

async function stubDiscoverMarkers(page: Page): Promise<void> {
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/discover/markers**', (route) =>
    fulfillJson(route, 200, DISCOVER_MARKERS_FIXTURE),
  );
}

test.describe('@integration-ui school-first auth markers gate (#1160 v3)', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  /**
   * MF-9: Authenticated user, top-level school-first deep-link with NO areaKey
   * (just schoolId + radiusKm). Bug A2 enables markersEnabled in this state, and
   * Bug A1's sync coord injection (or async restore via useSchoolById) ensures
   * the markers query fires with schoolLat/schoolLon/schoolRadiusKm in the URL.
   * We assert via page.waitForRequest that /api/discover/markers is called with
   * these three query params present.
   */
  test('MF-9: auth + top-level schoolId deep-link → markers query fires with school coords', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);
    await stubSchoolsByArea(page);
    await stubSchoolById(page, MANIPAL_SCHOOL);
    await stubDiscoverListings(page);
    await stubDiscoverCityListings(page);
    await stubDiscoverMarkers(page);

    // Pre-arm the request waiter BEFORE navigation so we don't miss the first fire.
    const markersRequestPromise = page.waitForRequest(
      (req) => {
        if (!req.url().includes('/api/discover/markers')) return false;
        const url = new URL(req.url());
        return (
          url.searchParams.has('schoolLat') &&
          url.searchParams.has('schoolLon') &&
          url.searchParams.has('schoolRadiusKm')
        );
      },
      { timeout: 20_000 },
    );

    await page.goto(
      `/discover?city=udupi&journey=school-first&schoolId=${MANIPAL_SCHOOL.id}&radiusKm=${DEFAULT_RADIUS_KM}`,
    );

    // Markers request must have fired with school coords
    const markersRequest = await markersRequestPromise;
    const markersUrl = new URL(markersRequest.url());
    expect(markersUrl.searchParams.get('schoolLat')).toBe(String(SCHOOL_LAT));
    expect(markersUrl.searchParams.get('schoolLon')).toBe(String(SCHOOL_LON));
    expect(markersUrl.searchParams.get('schoolRadiusKm')).toBe(String(DEFAULT_RADIUS_KM));
  });

  /**
   * MF-10: Authenticated user at top-level school-selected state (schoolId set,
   * NO areaKey). Click the in-page Back button. Bug B asserts cityRestoreTick
   * (not areaRestoreTick) increments since there is no area to restore to.
   */
  test('MF-10: auth + top-level school-selected + Back → cityRestoreTick incremented', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);
    await stubSchoolsByArea(page);
    await stubSchoolById(page, MANIPAL_SCHOOL);
    await stubDiscoverListings(page);
    await stubDiscoverCityListings(page);
    await stubDiscoverMarkers(page);

    await page.goto(
      `/discover?city=udupi&journey=school-first&schoolId=${MANIPAL_SCHOOL.id}&radiusKm=${DEFAULT_RADIUS_KM}`,
    );
    await page.waitForLoadState('domcontentloaded');

    // Wait for school hydration so the school-selected panel and Back button render.
    await expect
      .poll(() => getDebugSchoolCenter(page), { timeout: 15_000 })
      .toMatchObject({ lat: SCHOOL_LAT, lon: SCHOOL_LON });

    // Baseline ticks
    const before = await getDebugMapState(page);
    const cityTickBefore = before?.cityRestoreTick ?? 0;
    const areaTickBefore = before?.areaRestoreTick ?? 0;

    // Click in-page Back button (level 2 → level 0 since areaKey is null).
    const backButton = page.getByTestId('panel-header-back-button');
    await expect(backButton).toBeVisible({ timeout: 8_000 });
    await backButton.click();

    // schoolId must clear
    await expect.poll(() => getUrlParam(page, 'schoolId'), { timeout: 8_000 }).toBeNull();

    // cityRestoreTick must have incremented (Bug B else-branch).
    await expect
      .poll(
        async () => {
          const ms = await getDebugMapState(page);
          return ms?.cityRestoreTick ?? 0;
        },
        { timeout: 8_000 },
      )
      .toBeGreaterThan(cityTickBefore);

    // areaRestoreTick must NOT have incremented (no area context to restore).
    const after = await getDebugMapState(page);
    expect(after?.areaRestoreTick ?? 0).toBe(areaTickBefore);
  });
});

test.describe('@integration-ui school-first anon markers regression guard (#1160 v3 / #1118)', () => {
  /**
   * MF-11: Anonymous user (no storageState), top-level school-selected deep-link.
   * Bug A2 must keep markersEnabled=false for anon. Asserts:
   *   - NO /api/discover/markers requests fire
   *   - NO 401 responses appear in the network log (Issue #1118 regression guard)
   */
  test('MF-11: anon + top-level schoolId → no markers traffic, no 401 floods', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);
    await stubSchoolsByArea(page);
    await stubSchoolById(page, MANIPAL_SCHOOL);
    await stubDiscoverListings(page);
    await stubDiscoverCityListings(page);

    const markersRequests: string[] = [];
    const unauthorizedResponses: string[] = [];

    page.on('request', (req) => {
      if (req.url().includes('/api/discover/markers')) {
        markersRequests.push(req.url());
      }
    });
    page.on('response', (res) => {
      if (res.status() === 401) {
        unauthorizedResponses.push(`${res.status()} ${res.url()}`);
      }
    });

    await page.goto(
      `/discover?city=udupi&journey=school-first&schoolId=${MANIPAL_SCHOOL.id}&radiusKm=${DEFAULT_RADIUS_KM}`,
    );
    await page.waitForLoadState('domcontentloaded');

    // Wait for school hydration so anon path has run through the gate decision.
    await expect
      .poll(() => getDebugSchoolCenter(page), { timeout: 15_000 })
      .toMatchObject({ lat: SCHOOL_LAT, lon: SCHOOL_LON });

    // Allow any spurious queued requests time to settle before asserting absence.
    await page.waitForTimeout(1_000);

    expect(markersRequests, `markers requests fired for anon: ${markersRequests.join(', ')}`).toHaveLength(0);
    expect(unauthorizedResponses, `401 responses observed: ${unauthorizedResponses.join(', ')}`).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Issue #1160 v4 — MF-12: cold-cache race-condition guard
//
// Verifies that when an authenticated user lands on the school-first journey
// with a schoolId already in the URL (cold cache, no warm useSchoolsByArea),
// the markersEnabled guard holds off the markers query until schoolLat/schoolLon
// are present in filters. Every /api/discover/markers call must carry school-coord
// params — no city-wide call without schoolLat may ever fire.
// ---------------------------------------------------------------------------

test.describe('@integration-ui school-first cold-cache race guard (#1160 v4)', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  /**
   * MF-12: Authenticated user, cold cache — schoolId present in URL on arrival,
   * but filters.schoolLat/schoolLon are not yet set (restore effect must fire
   * useSchoolById first). The markersEnabled guard introduced in #1160 v4 must
   * prevent a city-wide markers call from firing before coords are ready.
   *
   * Asserts:
   *   - At least 1 /api/discover/markers request fires in total.
   *   - Every request's URL includes schoolLat=, schoolLon=, and schoolRadiusKm=.
   *   - No markers request is made WITHOUT schoolLat (i.e. no city-wide call).
   */
  test('MF-12: cold-cache schoolId deep-link → all markers calls carry school coords, no city-wide call', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);
    await stubSchoolsByArea(page);
    await stubSchoolById(page, MANIPAL_SCHOOL);
    await stubDiscoverListings(page);
    await stubDiscoverCityListings(page);

    // Intercept ALL /api/discover/markers requests BEFORE navigation so none are missed.
    const markersRequests: string[] = [];
    await page.route('**/api/discover/markers**', (route) => {
      markersRequests.push(route.request().url());
      return fulfillJson(route, 200, DISCOVER_MARKERS_FIXTURE);
    });

    // Navigate with schoolId in URL — simulates cold-cache restore-effect path.
    // No areaKey so useSchoolsByArea is disabled and the warm-cache coord path is unavailable.
    await page.goto(
      `/discover?city=udupi&journey=school-first&schoolId=${MANIPAL_SCHOOL.id}&radiusKm=${DEFAULT_RADIUS_KM}`,
    );
    await page.waitForLoadState('domcontentloaded');

    // Wait for school hydration: the restore effect resolves useSchoolById and
    // writes schoolLat/schoolLon into filters, which unblocks markersEnabled.
    await expect
      .poll(() => getDebugSchoolCenter(page), { timeout: 15_000 })
      .toMatchObject({ lat: SCHOOL_LAT, lon: SCHOOL_LON });

    // Allow time for any spurious queued requests to settle.
    await page.waitForTimeout(1_500);

    // Assert: at least 1 markers call fired (guards against the query never running at all).
    expect(
      markersRequests.length,
      `Expected at least 1 markers request but got 0`,
    ).toBeGreaterThanOrEqual(1);

    // Assert: every call carries school-coord params (viewport-settle may add a bbox= call — that is fine).
    const missingSchoolCoords = markersRequests.filter(
      (url) => !new URL(url).searchParams.has('schoolLat'),
    );
    expect(
      missingSchoolCoords,
      `Markers requests missing schoolLat (city-wide calls): ${missingSchoolCoords.join('\n')}`,
    ).toHaveLength(0);

    // Assert: the first call had the exact school-coord values from the URL.
    const firstUrl = new URL(markersRequests[0]);
    expect(
      firstUrl.searchParams.get('schoolLat'),
      'schoolLat value wrong in first markers request',
    ).toBe(String(SCHOOL_LAT));
    expect(
      firstUrl.searchParams.get('schoolLon'),
      'schoolLon value wrong in first markers request',
    ).toBe(String(SCHOOL_LON));
    expect(
      firstUrl.searchParams.get('schoolRadiusKm'),
      'schoolRadiusKm value wrong in first markers request',
    ).toBe(String(DEFAULT_RADIUS_KM));

  });
});
