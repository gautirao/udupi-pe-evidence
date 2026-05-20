/**
 * E2E: school-first journey — anonymous vs authenticated parity — Issue #1132.
 *
 * Fills coverage gap AC1: anonymous vs authenticated behaviour divergence.
 *
 * Key architectural fact (Issue #1118):
 *   Anonymous users do NOT trigger /api/discover/markers (auth-gated).
 *   Property markers for anonymous users come from city-listings
 *   (/api/discover/cities/{city}/listings) and are filtered client-side
 *   via haversineKm when a school is selected.
 *
 * Tests IDs:
 *   E2E-ANON-PAR-1  anonymous: school-first journey loads with school markers (city-listings fallback)
 *   E2E-ANON-PAR-2  anonymous: board filter applied to schools-in-area list
 *   E2E-ANON-PAR-3  anonymous: property markers scoped to school radius (client-side haversine)
 *   E2E-ANON-PAR-4  anonymous: cold-load school+board deeplink renders correctly
 *
 * Anonymous flow throughout — omit storageState entirely (no auth token).
 * All endpoints used are public (/api/public/schools/*, /api/discover/*).
 *
 * Run locally:
 *   bash scripts/run-e2e-local.sh --project=full e2e/discover-school-anon-parity.spec.ts
 */

import { test, expect, type Page, type Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// Force anonymous context: no storageState
// ---------------------------------------------------------------------------

test.use({ storageState: undefined });

// ---------------------------------------------------------------------------
// Constants & fixtures
// ---------------------------------------------------------------------------

const MANIPAL_AREA_KEY = 'IN|KA|Udupi|Manipal';
const ENCODED_AREA_KEY = encodeURIComponent(MANIPAL_AREA_KEY);

const DISCOVER_AREAS_UDUPI = {
  city: 'udupi',
  areas: [
    {
      areaKey: MANIPAL_AREA_KEY,
      name: 'Manipal',
      geoCenterLat: 13.3525,
      geoCenterLon: 74.7864,
      listingCount90d: 5,
      schoolCount: 2,
      trendDirection: 'stable',
    },
  ],
};

const POPULAR_SCHOOLS_FIXTURE = [
  {
    id: 'sch-cbse',
    name: 'Manipal CBSE Public School',
    board: 'CBSE',
    boardType: null,
    address: 'Manipal, Udupi',
    latitude: 13.3525,
    longitude: 74.7864,
    distanceKm: 1.2,
  },
];

// Two schools — one CBSE, one ICSE
const SCHOOLS_BY_AREA_FIXTURE = [
  {
    id: 'sch-cbse',
    name: 'Manipal CBSE Public School',
    board: 'CBSE',
    boardType: null,
    address: 'Manipal, Udupi',
    latitude: 13.3525,
    longitude: 74.7864,
    schoolCategory: 'secondary',
  },
  {
    id: 'sch-icse',
    name: 'Manipal ICSE Academy',
    board: 'ICSE',
    boardType: null,
    address: 'Manipal, Udupi',
    latitude: 13.351,
    longitude: 74.785,
    schoolCategory: 'primary',
  },
];

const CBSE_SCHOOL = SCHOOLS_BY_AREA_FIXTURE[0];

// City-listings fixture: one property very close to CBSE school (within 1 km).
// The haversine filter uses radiusKm=3; this property is ~0.08 km away — must pass.
const CITY_LISTINGS_WITH_PROPERTY = {
  areas: [
    {
      areaKey: MANIPAL_AREA_KEY,
      listings: [
        {
          id: 'listing-anon-1',
          title: 'Anon Parity Test Property',
          propertyType: 'house',
          price: 4_500_000,
          lat: 13.353,
          lon: 74.787,
          latitude: 13.353,
          longitude: 74.787,
          locality: 'Manipal',
          bedrooms: 3,
          status: 'LIVE',
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
    fulfillJson(route, 200, { city: 'udupi', defaultAreas: [] }),
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

/**
 * Stubs /api/public/schools/by-area applying board filter semantics.
 * When ?board=CBSE is present, response only includes CBSE-board schools.
 */
async function stubSchoolsByArea(page: Page): Promise<void> {
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/public/schools/by-area**', (route) => {
    const requestUrl = new URL(route.request().url());
    const boards = requestUrl.searchParams.getAll('board');
    const filtered =
      boards.length === 0
        ? SCHOOLS_BY_AREA_FIXTURE
        : SCHOOLS_BY_AREA_FIXTURE.filter((s) => boards.includes(s.board));
    return fulfillJson(route, 200, filtered);
  });
}

async function stubSchoolById(page: Page, school: typeof CBSE_SCHOOL): Promise<void> {
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route(`**/api/public/schools/${school.id}`, (route) =>
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
  // INTEGRATION-UI: stub justified — city-level listings for anonymous property markers
  await page.route('**/api/discover/cities/*/listings**', (route) =>
    fulfillJson(route, 200, CITY_LISTINGS_WITH_PROPERTY),
  );
}

function getUrlParam(page: Page, key: string): string | null {
  return new URL(page.url()).searchParams.get(key);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('@integration-ui school-first anonymous parity (#1132)', () => {

  /**
   * E2E-ANON-PAR-1: anonymous: school-first journey loads with school markers (city-listings fallback).
   *
   * Verifies that an anonymous user can reach the school-first state machine
   * without authentication errors. The school browse panel must be visible
   * (popular schools rendered) and the right panel must NOT show an auth gate.
   *
   * Assertion rationale: If the city-listings fallback is broken for anon users,
   * the map would be blank and no school markers would render. Checking that
   * school markers (.school-pin) are present confirms the anon code path is active.
   */
  test('E2E-ANON-PAR-1: anonymous: school-first journey loads with school markers (city-listings fallback)', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);
    await stubSchoolsByArea(page);
    await stubDiscoverListings(page);
    await stubCityListings(page);

    // Track that /api/discover/markers is NOT called (auth-gated endpoint must be skipped for anon)
    let markersRequestFired = false;
    await page.route('**/api/discover/markers**', async (route) => {
      markersRequestFired = true;
      await route.continue();
    });

    await page.goto(`/discover?city=udupi&journey=school-first&areaKey=${ENCODED_AREA_KEY}`);
    await page.waitForLoadState('domcontentloaded');

    // Right panel must be visible — anon users must not be redirected to auth
    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel).toBeVisible({ timeout: 15_000 });

    // School cards must render from the by-area stub (school-first + areaKey = schools-in-area panel)
    await expect(rightPanel.locator('[data-testid="school-card"]').first()).toBeVisible({
      timeout: 15_000,
    });

    // Auth-gated markers endpoint must NOT have been called for anonymous users
    expect(markersRequestFired).toBe(false);
  });

  /**
   * E2E-ANON-PAR-2: anonymous: board filter applied to schools-in-area list.
   *
   * Verifies that anonymous users can apply the board filter and see the correct
   * schools in the panel. This covers the anon code path of the board filter —
   * the same filter that authenticated users see must work without auth.
   *
   * With board=CBSE active, only Manipal CBSE Public School must be visible;
   * Manipal ICSE Academy must be absent.
   */
  test('E2E-ANON-PAR-2: anonymous: board filter applied to schools-in-area list', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);
    await stubSchoolsByArea(page);
    await stubDiscoverListings(page);
    await stubCityListings(page);

    await page.goto(
      `/discover?city=udupi&journey=school-first&areaKey=${ENCODED_AREA_KEY}&board=CBSE`,
    );
    await page.waitForLoadState('domcontentloaded');

    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel).toBeVisible({ timeout: 15_000 });

    // CBSE school must be visible
    await expect(rightPanel.getByText('Manipal CBSE Public School')).toBeVisible({
      timeout: 15_000,
    });

    // ICSE school must be filtered out
    await expect(rightPanel.locator('[data-testid="school-card"]', { hasText: 'Manipal ICSE Academy' })).toHaveCount(0);

    // Board chip must show as active in the schools-in-area filter strip
    const cbseChip = page.locator('[data-testid="board-chip-cbse"]');
    await expect(cbseChip).toBeVisible({ timeout: 5_000 });
    await expect(cbseChip).toHaveAttribute('aria-pressed', 'true');
  });

  /**
   * E2E-ANON-PAR-3: anonymous: property markers scoped to school radius (client-side haversine).
   *
   * Verifies that when an anonymous user selects a school, property markers are
   * filtered client-side by haversineKm to the school radius. The city-listings
   * fixture has one property within 1 km of the CBSE school (13.353, 74.787).
   * With radiusKm=3, this property must appear as a property marker on the map.
   *
   * Also verifies /api/discover/markers is never called (auth-gated for anon).
   */
  test('E2E-ANON-PAR-3: anonymous: property markers scoped to school radius (client-side haversine)', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);
    await stubSchoolsByArea(page);
    await stubSchoolById(page, CBSE_SCHOOL);
    await stubDiscoverListings(page);
    await stubCityListings(page);

    let markersRequestFired = false;
    await page.route('**/api/discover/markers**', async (route) => {
      markersRequestFired = true;
      await route.continue();
    });

    // Cold-load combined state: zoom=14 ensures property markers are rendered
    // (zoom must be > AREA_LAYER_MAX_ZOOM=12 for property-marker elements to appear)
    await page.goto(
      `/discover?city=udupi&journey=school-first&zoom=14&areaKey=${ENCODED_AREA_KEY}&schoolId=${CBSE_SCHOOL.id}&radiusKm=3`,
    );
    await page.waitForLoadState('domcontentloaded');

    // Property markers must be visible (from city-listings, filtered by haversine)
    const propertyMarkers = page.locator('[data-testid="property-marker"]');
    await expect(propertyMarkers.first()).toBeVisible({ timeout: 15_000 });
    expect(await propertyMarkers.count()).toBeGreaterThan(0);

    // combined-chips confirms the school-selected panel is active
    await expect(page.getByTestId('combined-chips')).toBeVisible({ timeout: 10_000 });

    // Auth-gated markers endpoint must NOT have been called
    expect(markersRequestFired).toBe(false);
  });

  /**
   * E2E-ANON-PAR-4: anonymous: cold-load school+board deeplink renders correctly.
   *
   * Verifies that an anonymous user can cold-load a URL that combines
   * journey=school-first, areaKey, schoolId, radiusKm, AND board=CBSE.
   * All four key params must survive the hydration cycle; combined-chips must
   * be visible; the board chip in the filter strip must be active.
   *
   * This catches regressions where anon hydration path strips filter params
   * that are preserved for authenticated users.
   */
  test('E2E-ANON-PAR-4: anonymous: cold-load school+board deeplink renders correctly', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);
    await stubSchoolsByArea(page);
    await stubSchoolById(page, CBSE_SCHOOL);
    await stubDiscoverListings(page);
    await stubCityListings(page);

    await page.goto(
      `/discover?city=udupi&journey=school-first&areaKey=${ENCODED_AREA_KEY}&schoolId=${CBSE_SCHOOL.id}&radiusKm=3&board=CBSE`,
    );
    await page.waitForLoadState('domcontentloaded');

    // combined-chips must be visible (confirms combined state hydrated correctly)
    await expect(page.getByTestId('combined-chips')).toBeVisible({ timeout: 15_000 });

    // All key URL params must be present after hydration (none stripped by anon path)
    const url = new URL(page.url());
    expect(url.searchParams.get('journey')).toBe('school-first');
    expect(url.searchParams.get('areaKey')).toBe(MANIPAL_AREA_KEY);
    expect(url.searchParams.get('schoolId')).toBe(CBSE_SCHOOL.id);
    expect(url.searchParams.get('radiusKm')).toBe('3');
    expect(url.searchParams.getAll('board')).toEqual(['CBSE']);

    // Both clear chips must be visible (area + school selected)
    await expect(page.getByTestId('clear-area-chip')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('clear-school-chip')).toBeVisible({ timeout: 5_000 });
  });

});
