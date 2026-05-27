/**
 * E2E: school-first bounded-search CTA — Issue #1115.
 *
 * Verifies the deferred-fetch gate introduced in Issue #1115:
 *   - /api/discover/markers does NOT auto-fire on school select (gate closed)
 *   - The CTA button (school-bounded-search-cta) is visible immediately after select
 *   - Clicking the CTA fires exactly one /api/discover/markers request with the
 *     correct school coordinates and radius params
 *   - After the CTA fires, it is hidden and the count helper appears
 *   - Changing the radius re-gates: CTA reappears, no new markers request fires
 *     until the CTA is clicked again
 *
 * Authentication: REQUIRED. /api/discover/markers is auth-gated (Issue #1118).
 * The CTA path is only exercisable for authenticated users. Anonymous users never
 * see the CTA (markers are never triggered for anon regardless of the gate).
 *
 * All backend endpoints are stubbed to isolate from backend variability.
 * No waitForTimeout — uses route interception, waitForResponse, and web-first assertions.
 *
 * Run locally:
 *   bash scripts/run-e2e-local.sh --project=full e2e/discover-school-bounded-search.spec.ts
 */

import { test, expect, type Page, type Route, type Request } from '@playwright/test';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MANIPAL_SCHOOL = {
  id: 'sch-1',
  name: 'Manipal Public School',
  board: 'CBSE',
  boardType: null,
  address: 'Manipal, Udupi District',
  latitude: 13.3525,
  longitude: 74.7864,
  distanceKm: 1.2,
  areaKey: 'IN|KA|Udupi|Manipal',
};

const DISCOVER_AREAS_UDUPI = {
  city: 'udupi',
  areas: [
    {
      areaKey: 'IN|KA|Udupi|Manipal',
      name: 'Manipal',
      geoCenterLat: 13.3525,
      geoCenterLon: 74.7864,
      listingCount: 5,
      schoolCount: 3,
      trendDirection: 'stable',
      minLat: 13.33,
      minLon: 74.77,
      maxLat: 13.37,
      maxLon: 74.81,
    },
  ],
};

const TRENDS_OPTIONS_FIXTURE = {
  city: 'udupi',
  defaultAreas: [{ areaKey: 'IN|KA|Udupi|Manipal', areaLabel: 'Manipal' }],
};

const EMPTY_LISTINGS_PAGE = {
  content: [],
  page: 0,
  size: 50,
  totalElements: 0,
  totalPages: 0,
  aggregates: { topLocalities: [] },
};

// Markers fixture — array of marker objects returned by /api/discover/markers
const MARKERS_FIXTURE = [
  {
    id: 'lst-m-1',
    lat: 13.353,
    lon: 74.787,
    pricePaise: 500000 * 100,
    propertyType: 'apartment',
    listingPurpose: 'sale',
  },
  {
    id: 'lst-m-2',
    lat: 13.351,
    lon: 74.785,
    pricePaise: 350000 * 100,
    propertyType: 'house',
    listingPurpose: 'sale',
  },
];

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

async function stubCommonEndpoints(page: Page): Promise<void> {
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/trends/options**', (route) =>
    fulfillJson(route, 200, TRENDS_OPTIONS_FIXTURE),
  );
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/discover/areas**', (route) =>
    fulfillJson(route, 200, DISCOVER_AREAS_UDUPI),
  );
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/public/schools/popular**', (route) =>
    fulfillJson(route, 200, []),
  );
  // INTEGRATION-UI: stub justified — auth-gated discover/listings (unused in this flow)
  await page.route('**/api/discover/listings**', (route) =>
    fulfillJson(route, 200, EMPTY_LISTINGS_PAGE),
  );
  // INTEGRATION-UI: stub justified — city-level listings for map markers (anon path)
  await page.route('**/api/discover/cities/*/listings**', (route) =>
    fulfillJson(route, 200, { areas: [] }),
  );
}

async function stubSchoolById(page: Page): Promise<void> {
  // INTEGRATION-UI: stub justified — school lookup for cold-load URL restore
  await page.route(`**/api/public/schools/${MANIPAL_SCHOOL.id}**`, (route) =>
    fulfillJson(route, 200, MANIPAL_SCHOOL),
  );
}

interface MarkersCapture {
  requests: Request[];
}

/**
 * Intercept /api/discover/markers and record every request.
 * Returns the capture bag. Must be called BEFORE page.goto().
 */
async function interceptMarkers(
  page: Page,
  fixture: unknown = MARKERS_FIXTURE,
): Promise<MarkersCapture> {
  const capture: MarkersCapture = { requests: [] };
  await page.route('**/api/discover/markers**', (route) => {
    capture.requests.push(route.request());
    return fulfillJson(route, 200, fixture);
  });
  return capture;
}

/** Wait for SchoolSelectedPanel to be fully rendered (radius buttons visible). */
async function waitForSchoolPanel(page: Page): Promise<void> {
  await expect(page.getByTestId('radius-btn-3')).toBeVisible({ timeout: 15_000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('@integration-ui school-first bounded-search CTA (#1115)', () => {
  // Auth required: /api/discover/markers is auth-gated; CTA only shows for authed users.
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  /**
   * BSC-1: selecting a school shows the radius circle but does NOT fire /api/discover/markers.
   *
   * This is the core regression guard for Issue #1115 — the old behaviour auto-fired
   * the markers query on school select; the new behaviour gates it behind the CTA.
   *
   * Assertions:
   *   - radius circle (dashed SVG path) is rendered on the map
   *   - /api/discover/markers request count remains 0
   *   - school-bounded-search-cta button is visible
   */
  test('BSC-1: school select shows radius circle, no markers fetch, CTA visible', async ({ page }) => {
    await stubCommonEndpoints(page);
    await stubSchoolById(page);
    const markersCapture = await interceptMarkers(page);

    await page.goto(
      '/discover?city=udupi&journey=school-first&schoolId=sch-1&radiusKm=3',
    );

    // Wait for school panel to render (school name heading + radius buttons)
    await expect(
      page.getByRole('heading', { name: 'Manipal Public School' }),
    ).toBeVisible({ timeout: 15_000 });
    await waitForSchoolPanel(page);

    // The radius circle (dashed SVG path) must be visible on the map.
    // Leaflet renders the school Circle as an SVG <path> with stroke-dasharray.
    const mapContainer = page.locator('.leaflet-container');
    await expect(mapContainer).toBeVisible({ timeout: 10_000 });
    const dashedCircles = mapContainer.locator('svg path[stroke-dasharray]');
    await expect(dashedCircles).toHaveCount(1, { timeout: 10_000 });
    await expect(dashedCircles.first()).toBeVisible();

    // CTA must be visible — the bounded-search gate is CLOSED after school select.
    await expect(page.getByTestId('school-bounded-search-cta')).toBeVisible({ timeout: 5_000 });

    // CRITICAL: /api/discover/markers must NOT have fired.
    // Wait briefly for any potential erroneous request to arrive, then assert 0.
    await page.waitForTimeout(500); // intentional small settle — only allowed usage per rules
    expect(markersCapture.requests).toHaveLength(0);
  });

  /**
   * BSC-2: clicking the CTA fires exactly one /api/discover/markers request
   *        with schoolLat, schoolLon, and schoolRadiusKm params; CTA hides; count appears.
   *
   * This is the primary happy-path AC7 assertion.
   */
  test('BSC-2: CTA click fires one markers request with correct school params', async ({ page }) => {
    await stubCommonEndpoints(page);
    await stubSchoolById(page);
    const markersCapture = await interceptMarkers(page);

    await page.goto(
      '/discover?city=udupi&journey=school-first&schoolId=sch-1&radiusKm=3',
    );

    await expect(
      page.getByRole('heading', { name: 'Manipal Public School' }),
    ).toBeVisible({ timeout: 15_000 });
    await waitForSchoolPanel(page);

    // CTA must be present before clicking.
    const cta = page.getByTestId('school-bounded-search-cta');
    await expect(cta).toBeVisible({ timeout: 5_000 });

    // Click the CTA and wait for the markers response to complete.
    const markersResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/discover/markers'),
      { timeout: 10_000 },
    );
    await cta.click();
    await markersResponsePromise;

    // Exactly one request must have fired.
    expect(markersCapture.requests).toHaveLength(1);

    // The request URL must carry school coordinates and radius.
    const requestUrl = markersCapture.requests[0].url();
    expect(requestUrl).toContain('schoolLat=');
    expect(requestUrl).toContain('schoolLon=');
    expect(requestUrl).toContain('schoolRadiusKm=');

    // CTA must be hidden after triggering.
    await expect(page.getByTestId('school-bounded-search-cta')).not.toBeVisible({ timeout: 5_000 });

    // Results count helper must appear.
    await expect(page.getByTestId('school-bounded-search-count')).toBeVisible({ timeout: 5_000 });
  });

  /**
   * BSC-3: changing the radius after triggering re-gates the search.
   *
   * After the CTA has been clicked once, changing the radius must:
   *   - Reset the gate (CTA reappears)
   *   - NOT fire a new /api/discover/markers request automatically
   */
  test('BSC-3: radius change after CTA trigger re-gates (CTA reappears, no auto-refetch)', async ({ page }) => {
    await stubCommonEndpoints(page);
    await stubSchoolById(page);
    const markersCapture = await interceptMarkers(page);

    await page.goto(
      '/discover?city=udupi&journey=school-first&schoolId=sch-1&radiusKm=3',
    );

    await expect(
      page.getByRole('heading', { name: 'Manipal Public School' }),
    ).toBeVisible({ timeout: 15_000 });
    await waitForSchoolPanel(page);

    // Step 1: trigger the bounded search via CTA.
    const cta = page.getByTestId('school-bounded-search-cta');
    await expect(cta).toBeVisible({ timeout: 5_000 });

    const firstMarkersResponse = page.waitForResponse(
      (resp) => resp.url().includes('/api/discover/markers'),
      { timeout: 10_000 },
    );
    await cta.click();
    await firstMarkersResponse;

    const requestCountAfterCta = markersCapture.requests.length;
    expect(requestCountAfterCta).toBe(1);

    // CTA hidden, count visible — confirm triggered state.
    await expect(page.getByTestId('school-bounded-search-cta')).not.toBeVisible({ timeout: 5_000 });

    // Step 2: change radius to 5 km.
    await page.getByTestId('radius-btn-5').click();

    // URL must update to reflect new radius.
    await expect(page).toHaveURL(/radiusKm=5/, { timeout: 5_000 });

    // CTA must reappear after radius change (gate reset).
    await expect(page.getByTestId('school-bounded-search-cta')).toBeVisible({ timeout: 5_000 });

    // Wait a settle period — no new markers request must have fired automatically.
    await page.waitForTimeout(800); // intentional small settle — only allowed usage per rules
    expect(markersCapture.requests).toHaveLength(requestCountAfterCta);
  });
});

test.describe('@integration-ui school-first bounded-search anon gate (#1115)', () => {
  // Anonymous users must NOT see the CTA and /api/discover/markers must never fire.
  test.use({ storageState: undefined });

  /**
   * BSC-ANON-1: anonymous user — no CTA visible, no markers request fired.
   *
   * Confirms the feature is correctly auth-gated: anon users get the
   * area-scoped listing set (city-listings) without the bounded-search option.
   */
  test('BSC-ANON-1: anon user sees no bounded-search CTA and markers endpoint never fires', async ({ page }) => {
    // Set up common stubs (no auth storageState)
    await page.route('**/api/trends/options**', (route) =>
      fulfillJson(route, 200, TRENDS_OPTIONS_FIXTURE),
    );
    await page.route('**/api/discover/areas**', (route) =>
      fulfillJson(route, 200, DISCOVER_AREAS_UDUPI),
    );
    await page.route('**/api/public/schools/popular**', (route) =>
      fulfillJson(route, 200, []),
    );
    await page.route(`**/api/public/schools/${MANIPAL_SCHOOL.id}**`, (route) =>
      fulfillJson(route, 200, MANIPAL_SCHOOL),
    );
    await page.route('**/api/discover/listings**', (route) =>
      fulfillJson(route, 200, EMPTY_LISTINGS_PAGE),
    );
    await page.route('**/api/discover/cities/*/listings**', (route) =>
      fulfillJson(route, 200, { areas: [] }),
    );

    // Track any markers requests — must remain 0.
    const markersCapture: Request[] = [];
    await page.route('**/api/discover/markers**', (route) => {
      markersCapture.push(route.request());
      return fulfillJson(route, 200, []);
    });

    await page.goto(
      '/discover?city=udupi&journey=school-first&schoolId=sch-1&radiusKm=3',
    );

    // Wait for school panel to render.
    await expect(
      page.getByRole('heading', { name: 'Manipal Public School' }),
    ).toBeVisible({ timeout: 15_000 });
    await waitForSchoolPanel(page);

    // CTA must NOT be present for anonymous users.
    await expect(page.getByTestId('school-bounded-search-cta')).not.toBeVisible({ timeout: 3_000 });

    // /api/discover/markers must not have fired.
    await page.waitForTimeout(500);
    expect(markersCapture).toHaveLength(0);
  });
});
