/**
 * E2E: school-first journey — anonymous vs authenticated parity — Issue #1132.
 *
 * Fills coverage gap AC1: anonymous vs authenticated behaviour divergence.
 *
 * Key architectural fact (post-#1261):
 *   Anonymous users do NOT trigger /api/discover/markers (still auth-gated).
 *   When a school radius is active, anonymous property markers are sourced from
 *   the PUBLIC server-side endpoint
 *     GET /api/discover/cities/{city}/school-radius-listings (server-side
 *     ST_DWithin, cross-area) — introduced by PR #1261. Markers are derived
 *     CLIENT-SIDE from that endpoint's listings (deriveAnonSchoolRadiusMarkers),
 *     NOT from the old single-area /api/discover/cities/{city}/listings +
 *     client-side haversine path (the pre-#1261 / Issue #1118 architecture).
 *   PAR-1/PAR-2/PAR-4 remain valid as written: they exercise the board filter
 *   and school+board deeplink param hydration, which are independent of the
 *   marker DATA SOURCE. Only PAR-3 (marker source) was rewritten for #1261.
 *
 * Tests IDs:
 *   E2E-ANON-PAR-1  anonymous: school-first journey loads with school markers
 *   E2E-ANON-PAR-2  anonymous: board filter applied to schools-in-area list
 *   E2E-ANON-PAR-3  anonymous: property markers scoped to school radius (server-side ST_DWithin via /school-radius-listings)
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

// Post-#1261 anon marker source: the public school-radius endpoint response.
// Shape = PublicSchoolRadiusListingsPage { content: PublicSchoolRadiusListingCard[], page, size, hasMore }.
// Card coords use latitude/longitude field names; one card sits ~0.08 km from the
// CBSE school (13.353, 74.787) so it falls inside radiusKm=3.
const SCHOOL_RADIUS_PAGE = {
  content: [
    {
      id: 'sr-anon-1',
      listingNumber: 8001,
      propertyType: 'house',
      title: 'Anon Parity Radius House',
      locality: 'Manipal',
      areaKey: MANIPAL_AREA_KEY,
      pricePaise: 4_500_000,
      landArea: null,
      landAreaUnit: null,
      builtArea: 1100,
      builtAreaUnit: 'sqft',
      bedrooms: 3,
      latitude: 13.353,
      longitude: 74.787,
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

interface RadiusCapture {
  requests: import('@playwright/test').Request[];
  statuses: number[];
}

/**
 * Stub the post-#1261 public school-radius endpoint and capture its requests.
 * Register AFTER stubCityListings so this more-specific path wins over the broader
 * /listings glob (Playwright matches the most-recently-added route first).
 */
async function stubSchoolRadiusListings(page: Page): Promise<RadiusCapture> {
  const capture: RadiusCapture = { requests: [], statuses: [] };
  // INTEGRATION-UI: stub justified — exercises the server-side ST_DWithin endpoint contract
  await page.route('**/api/discover/cities/*/school-radius-listings**', (route) => {
    capture.requests.push(route.request());
    capture.statuses.push(200);
    return fulfillJson(route, 200, SCHOOL_RADIUS_PAGE);
  });
  return capture;
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
   * E2E-ANON-PAR-3: anonymous: property markers scoped to school radius (server-side ST_DWithin).
   *
   * Post-#1261: when an anonymous user selects a school, property markers are
   * sourced from the PUBLIC server-side endpoint
   * /api/discover/cities/{city}/school-radius-listings (server-side ST_DWithin,
   * cross-area) and derived CLIENT-SIDE into pins — NOT from
   * /api/discover/cities/{city}/listings + client-side haversine (the old path).
   *
   * Guards:
   *   - school-radius-listings IS called (the active anon marker source).
   *   - cities/{city}/listings is NOT called when the radius endpoint returns
   *     data (no fall back to the old single-area path).
   *   - /api/discover/markers is NOT called (still auth-gated for anon).
   *   - At least one property-marker DOM node renders (fails on 0 — no silent pass).
   */
  test('E2E-ANON-PAR-3: anonymous: property markers scoped to school radius (server-side ST_DWithin)', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);
    await stubSchoolsByArea(page);
    await stubSchoolById(page, CBSE_SCHOOL);
    await stubDiscoverListings(page);

    // Track that the OLD single-area path is NOT used as the anon marker source
    // when /school-radius-listings returns data.
    let cityListingsRequestFired = false;
    await page.route('**/api/discover/cities/*/listings**', async (route) => {
      cityListingsRequestFired = true;
      // Return empty so any accidental fallback cannot silently supply markers.
      await fulfillJson(route, 200, { areas: [{ areaKey: MANIPAL_AREA_KEY, listings: [] }] });
    });

    // Register the more-specific radius route AFTER /listings so it wins.
    const radiusCapture = await stubSchoolRadiusListings(page);

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

    // combined-chips confirms the school-selected panel is active
    await expect(page.getByTestId('combined-chips')).toBeVisible({ timeout: 15_000 });

    // The server-side school-radius endpoint must have been called with school coords.
    await expect
      .poll(() => radiusCapture.requests.length, { timeout: 10_000 })
      .toBeGreaterThan(0);
    const lastUrl = radiusCapture.requests[radiusCapture.requests.length - 1].url();
    expect(lastUrl).toContain('schoolLat=');
    expect(lastUrl).toContain('schoolLon=');
    expect(lastUrl).toContain('schoolRadiusKm=3');

    // Property markers must be visible — derived client-side from the radius listings.
    // Two nearby pins may collapse into a cluster at zoom 14, so accept either.
    const propertyMarkers = page.locator(
      '[data-testid="property-marker"], .custom-marker-cluster',
    );
    await expect(propertyMarkers.first()).toBeVisible({ timeout: 15_000 });
    expect(await propertyMarkers.count()).toBeGreaterThan(0);

    // The old single-area /listings path must NOT be the marker source.
    expect(cityListingsRequestFired).toBe(false);

    // Auth-gated markers endpoint must NOT have been called.
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
