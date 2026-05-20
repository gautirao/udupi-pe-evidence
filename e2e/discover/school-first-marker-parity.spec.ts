/**
 * E2E: school-first marker parity — Issue #1160 Option Y
 *
 * Verifies that selecting a school from the top-level school-first journey
 * (Flow A) produces the same listings and property markers as navigating
 * directly to the school URL with areaKey pre-set (Flow B).
 *
 * Root cause: setSchoolJourney never wrote areaKey to URL state. Without
 * areaKey, useDiscoverCityListings (enabled: areaKeys.length > 0) never
 * fires → 0 listings, 0 markers. Option Y fixes this by resolving areaKey
 * from the school object or from the bbox-containment fallback.
 *
 * Tests:
 *   PAR-1  Flow A: select MIT from top-level → URL gains areaKey + schoolId + radiusKm
 *          + listings API fires with areaKey=Manipal + listing cards > 0 + property markers > 0
 *   PAR-2  Flow B: direct URL with areaKey pre-set → listing cards > 0 + property markers > 0
 *   PAR-3  Parity: Flow A listing-card count == Flow B listing-card count
 *
 * Anonymous flow throughout — all relevant endpoints are public.
 * No waitForTimeout. Uses waitForResponse, waitForLoadState, and locator assertions.
 *
 * Run locally:
 *   bash scripts/run-e2e-local.sh --project=full e2e/discover/school-first-marker-parity.spec.ts
 *
 * Note: spec stubs all backend calls to isolate from backend variability and to run
 * correctly against the local dev server (PLAYWRIGHT_BASE_URL=http://localhost:5174).
 * Uses relative paths — resolves against baseURL in playwright.config.ts.
 */

import { test, expect, type Page, type Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// Constants — MIT coordinates and IDs as confirmed by Issue #1160 diagnostic
// ---------------------------------------------------------------------------

const MANIPAL_AREA_KEY = 'IN|KA|Udupi|Manipal';
const ENCODED_AREA_KEY = encodeURIComponent(MANIPAL_AREA_KEY);

const MIT_SCHOOL_ID = '8c279ab2-5770-44dd-a15e-57526b0b4a91';
const MIT_LAT = 13.35250;
const MIT_LON = 74.79226;
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

// Areas fixture includes bbox so the bbox-containment fallback in setSchoolJourney
// can resolve areaKey even when school.areaKey is null on older backends.
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

// MIT school fixture — areaKey populated (backend Option Z shipped).
// The bbox fallback also covers the case where areaKey is null.
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

// School search results for query "Manipal"
const SCHOOL_SEARCH_FIXTURE = [
  MIT_SCHOOL,
  {
    id: 'sch-mps-1',
    name: 'Manipal Public School',
    board: 'CBSE',
    boardType: null,
    address: 'Manipal, Udupi',
    latitude: 13.351,
    longitude: 74.79,
    distanceKm: 0.5,
    areaKey: MANIPAL_AREA_KEY,
  },
];

// Popular schools (for school-browse panel before search)
const POPULAR_SCHOOLS_FIXTURE = [
  {
    id: 'sch-pop-1',
    name: 'Manipal Public School',
    board: 'CBSE',
    boardType: null,
    address: 'Manipal, Udupi',
    latitude: 13.351,
    longitude: 74.79,
    distanceKm: 0.5,
    nearbyListingCount: 2,
    areaKey: MANIPAL_AREA_KEY,
  },
];

// City listings fixture — 4 properties near MIT within 3 km radius.
// Shape: DiscoverCityListingsResponse — { city, limitPerArea, areas: [{ areaKey, areaName, listings }] }
const CITY_LISTINGS_FIXTURE = {
  city: 'udupi',
  limitPerArea: 50,
  areas: [
    {
      areaKey: MANIPAL_AREA_KEY,
      areaName: 'Manipal',
      listings: [
        {
          id: 'listing-mit-1',
          propertyType: 'house',
          title: 'House Near MIT',
          locality: 'Manipal',
          pricePaise: 500000000,
          lat: MIT_LAT + 0.005,
          lon: MIT_LON + 0.005,
          listingPurpose: 'sale',
        },
        {
          id: 'listing-mit-2',
          propertyType: 'apartment',
          title: 'Apartment Near MIT',
          locality: 'Manipal',
          pricePaise: 350000000,
          lat: MIT_LAT - 0.003,
          lon: MIT_LON + 0.002,
          listingPurpose: 'rent',
        },
        {
          id: 'listing-mit-3',
          propertyType: 'house',
          title: 'House in Manipal',
          locality: 'Manipal',
          pricePaise: 650000000,
          lat: MIT_LAT + 0.008,
          lon: MIT_LON - 0.004,
          listingPurpose: 'sale',
        },
        {
          id: 'listing-mit-4',
          propertyType: 'apartment',
          title: 'Flat Near MIT Campus',
          locality: 'Manipal',
          pricePaise: 280000000,
          lat: MIT_LAT - 0.006,
          lon: MIT_LON - 0.003,
          listingPurpose: 'rent',
        },
      ],
    },
  ],
};

// Empty auth-gated listings page (auth-gated endpoint — anon users get 401 or empty)
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
  // INTEGRATION-UI: stub justified — provides bbox so fallback resolution works
  await page.route('**/api/discover/areas**', (route) =>
    fulfillJson(route, 200, DISCOVER_AREAS_FIXTURE),
  );
}

async function stubPopularSchools(page: Page): Promise<void> {
  // INTEGRATION-UI: stub justified — school-browse panel population
  await page.route('**/api/public/schools/popular**', (route) =>
    fulfillJson(route, 200, POPULAR_SCHOOLS_FIXTURE),
  );
}

async function stubSchoolSearch(page: Page): Promise<void> {
  // INTEGRATION-UI: stub justified — search autocomplete for "Manipal"
  await page.route('**/api/public/schools/search**', (route) =>
    fulfillJson(route, 200, SCHOOL_SEARCH_FIXTURE),
  );
}

async function stubSchoolById(page: Page): Promise<void> {
  // INTEGRATION-UI: stub justified — cold-load URL restoration for schoolId
  // Pattern '**/api/public/schools/*' uses a single-segment wildcard so it does
  // NOT accidentally intercept /schools/by-area or /schools/search endpoints.
  await page.route(`**/api/public/schools/${MIT_SCHOOL_ID}`, (route) =>
    fulfillJson(route, 200, MIT_SCHOOL),
  );
}

async function stubSchoolsByArea(page: Page): Promise<void> {
  // INTEGRATION-UI: stub justified — schools-in-area panel (not needed in school-only path)
  await page.route('**/api/public/schools/by-area**', (route) =>
    fulfillJson(route, 200, []),
  );
}

async function stubCityListings(page: Page): Promise<void> {
  // INTEGRATION-UI: stub justified — public city-listings endpoint (anon property markers)
  await page.route('**/api/discover/cities/*/listings**', (route) =>
    fulfillJson(route, 200, CITY_LISTINGS_FIXTURE),
  );
}

async function stubAuthGatedListings(page: Page): Promise<void> {
  // INTEGRATION-UI: stub justified — auth-gated discover/listings returns empty for anon
  await page.route('**/api/discover/listings**', (route) =>
    fulfillJson(route, 200, EMPTY_LISTINGS_PAGE),
  );
}

function getUrlParam(page: Page, key: string): string | null {
  return new URL(page.url()).searchParams.get(key);
}

/** Register all common stubs needed for both Flow A and Flow B. */
async function stubAll(page: Page): Promise<void> {
  await stubTrendsOptions(page);
  await stubDiscoverAreas(page);
  await stubPopularSchools(page);
  await stubSchoolSearch(page);
  await stubSchoolById(page);
  await stubSchoolsByArea(page);
  await stubCityListings(page);
  await stubAuthGatedListings(page);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('@integration-ui school-first marker parity (#1160)', () => {

  /**
   * PAR-1: Flow A — navigate to top-level school-first journey, search for MIT,
   * click the school card. Assert:
   *   - URL gains areaKey=IN|KA|Udupi|Manipal, schoolId, radiusKm
   *   - GET /api/discover/cities/udupi/listings?areaKeys=*Manipal* fires and returns 200
   *   - [data-testid="listing-card"] count > 0
   *   - [data-testid="property-marker"] count > 0 (property markers, not school pins)
   */
  test('PAR-1: Flow A — top-level school selection writes areaKey and produces listings + markers', async ({ page }) => {
    await stubAll(page);

    await page.goto('/discover?city=udupi&journey=school-first');
    await page.waitForLoadState('domcontentloaded');

    // Wait for school-browse right panel to be visible
    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel).toBeVisible({ timeout: 15_000 });

    // Type "Manipal" in the school search input to trigger autocomplete
    const searchInput = rightPanel.locator('input[type="text"], input[placeholder*="school" i], input[placeholder*="search" i]').first();
    await expect(searchInput).toBeVisible({ timeout: 10_000 });
    await searchInput.fill('Manipal');

    // Wait for autocomplete results and click MIT
    const mitOption = page.getByText('Manipal Institute of Technology').first();
    await expect(mitOption).toBeVisible({ timeout: 10_000 });

    // Wait for city listings API call triggered by school selection writing areaKey to URL
    const [listingsResponse] = await Promise.all([
      page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/discover/cities/') &&
          resp.url().includes('/listings') &&
          resp.url().toLowerCase().includes('manipal'),
        { timeout: 15_000 },
      ),
      mitOption.click(),
    ]);
    expect(listingsResponse.status()).toBe(200);

    // URL must contain areaKey, schoolId, and radiusKm
    await expect.poll(() => getUrlParam(page, 'areaKey'), { timeout: 8_000 }).toBe(MANIPAL_AREA_KEY);
    await expect.poll(() => getUrlParam(page, 'schoolId'), { timeout: 5_000 }).toBe(MIT_SCHOOL_ID);
    await expect.poll(() => getUrlParam(page, 'radiusKm'), { timeout: 5_000 }).not.toBeNull();

    // Listing cards must appear in right panel
    const listingCards = page.locator('[data-testid="listing-card"]');
    await expect(listingCards.first()).toBeVisible({ timeout: 15_000 });
    expect(await listingCards.count()).toBeGreaterThan(0);

    // Property markers must appear on map (zoom=14 > AREA_LAYER_MAX_ZOOM=12 after school focus)
    const propertyMarkers = page.locator('[data-testid="property-marker"]');
    await expect(propertyMarkers.first()).toBeVisible({ timeout: 15_000 });
    expect(await propertyMarkers.count()).toBeGreaterThan(0);
  });

  /**
   * PAR-2: Flow B — navigate directly to the school URL with areaKey pre-set.
   * Assert listing cards > 0 and property markers > 0 (regression: Flow B must
   * continue working exactly as before).
   */
  test('PAR-2: Flow B — direct URL with areaKey pre-set produces listings + markers', async ({ page }) => {
    await stubAll(page);

    const directUrl =
      `/discover?city=udupi&journey=school-first` +
      `&areaKey=${ENCODED_AREA_KEY}` +
      `&lat=${MIT_LAT}&lon=${MIT_LON}&zoom=14` +
      `&schoolId=${MIT_SCHOOL_ID}&radiusKm=${DEFAULT_RADIUS_KM}`;

    await page.goto(directUrl);
    await page.waitForLoadState('networkidle');

    // Listing cards must appear in right panel
    const listingCards = page.locator('[data-testid="listing-card"]');
    await expect(listingCards.first()).toBeVisible({ timeout: 20_000 });
    expect(await listingCards.count()).toBeGreaterThan(0);

    // Property markers must appear on map
    const propertyMarkers = page.locator('[data-testid="property-marker"]');
    await expect(propertyMarkers.first()).toBeVisible({ timeout: 15_000 });
    expect(await propertyMarkers.count()).toBeGreaterThan(0);
  });

  /**
   * PAR-3: Parity — Flow A and Flow B must produce the same listing-card count.
   * Uses two separate browser contexts so state does not leak between flows.
   */
  test('PAR-3: Parity — Flow A and Flow B listing-card counts are equal', async ({ browser }) => {
    // ── Flow A ──
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();

    await stubAll(pageA);

    await pageA.goto('/discover?city=udupi&journey=school-first');
    await pageA.waitForLoadState('domcontentloaded');

    const rightPanelA = pageA.getByTestId('discover-right-panel');
    await expect(rightPanelA).toBeVisible({ timeout: 15_000 });

    const searchInputA = rightPanelA.locator('input[type="text"], input[placeholder*="school" i], input[placeholder*="search" i]').first();
    await expect(searchInputA).toBeVisible({ timeout: 10_000 });
    await searchInputA.fill('Manipal');

    const mitOptionA = pageA.getByText('Manipal Institute of Technology').first();
    await expect(mitOptionA).toBeVisible({ timeout: 10_000 });

    await Promise.all([
      pageA.waitForResponse(
        (resp) =>
          resp.url().includes('/api/discover/cities/') &&
          resp.url().includes('/listings') &&
          resp.url().toLowerCase().includes('manipal'),
        { timeout: 15_000 },
      ),
      mitOptionA.click(),
    ]);

    const listingCardsA = pageA.locator('[data-testid="listing-card"]');
    await expect(listingCardsA.first()).toBeVisible({ timeout: 15_000 });
    const countA = await listingCardsA.count();

    await ctxA.close();

    // ── Flow B ──
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();

    await stubAll(pageB);

    const directUrl =
      `/discover?city=udupi&journey=school-first` +
      `&areaKey=${ENCODED_AREA_KEY}` +
      `&lat=${MIT_LAT}&lon=${MIT_LON}&zoom=14` +
      `&schoolId=${MIT_SCHOOL_ID}&radiusKm=${DEFAULT_RADIUS_KM}`;

    await pageB.goto(directUrl);
    await pageB.waitForLoadState('networkidle');

    const listingCardsB = pageB.locator('[data-testid="listing-card"]');
    await expect(listingCardsB.first()).toBeVisible({ timeout: 20_000 });
    const countB = await listingCardsB.count();

    await ctxB.close();

    // ── Parity assertion ──
    expect(countA).toBeGreaterThan(0);
    expect(countB).toBeGreaterThan(0);
    expect(countA).toBe(countB);
  });

});
