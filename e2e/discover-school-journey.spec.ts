/**
 * Discover school-first journey — E2E coverage for issue #970.
 *
 * Surface under test: end-to-end school-first discovery on /discover. Covers
 * URL state preservation, filter-strip chip wiring, the local area dropdown
 * inside NearSchoolSheet, the cold-load restoration path, and the listings
 * API request shape when a school is selected.
 *
 * Anonymous flow throughout — all relevant endpoints are public (skipAuth).
 * The /api/discover/listings call is auth-gated in production; this spec
 * still routes the endpoint defensively (capturing the last request) so any
 * future change that surfaces it for anonymous users is exercised here.
 *
 * Out of scope (per #970 carve-outs — UI not implemented):
 *   - "Schools near you" title swap
 *   - Fallback banner for empty popular results
 *   - Area chip in the filter strip
 *   - PopularSchoolCard internals (covered by e2e/popular-schools.spec.ts)
 *
 * Run locally:
 *   bash scripts/run-e2e-local.sh --project=full e2e/discover-school-journey.spec.ts
 */

import { test, expect, type Page, type Request, type Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// Fixtures — mirror e2e/popular-schools.spec.ts shapes for consistency.
// ---------------------------------------------------------------------------

const MANIPAL_SCHOOL = {
  id: 'sch-1',
  name: 'Manipal Public School',
  board: 'CBSE',
  boardType: null,
  address: 'Manipal, Udupi',
  latitude: 13.3525,
  longitude: 74.7864,
  distanceKm: 1.2,
};

const POPULAR_SCHOOLS_FIXTURE = [
  MANIPAL_SCHOOL,
  {
    id: 'sch-2',
    name: 'Sharada Vidyalaya',
    board: 'ICSE',
    boardType: null,
    address: 'Kadiyali, Udupi',
    latitude: 13.3409,
    longitude: 74.7421,
    distanceKm: 2.4,
  },
  {
    id: 'sch-3',
    name: "St. Cecily's High School",
    board: 'STATE',
    boardType: null,
    address: 'Udupi Town',
    latitude: 13.3389,
    longitude: 74.7479,
    distanceKm: 3.1,
  },
  {
    id: 'sch-4',
    name: 'Christian Vidyaniketan',
    board: 'CBSE',
    boardType: null,
    address: 'Brahmagiri, Udupi',
    latitude: 13.3500,
    longitude: 74.7500,
    distanceKm: 0.8,
  },
];

const POPULAR_SCHOOLS_MANIPAL_FIXTURE = [
  { ...MANIPAL_SCHOOL, distanceKm: 0.4 },
];

const TRENDS_OPTIONS_FIXTURE = {
  city: 'udupi',
  defaultAreas: [
    { areaKey: 'IN|KA|Udupi|Manipal', areaLabel: 'Manipal' },
    { areaKey: 'IN|KA|Udupi|Kadiyali', areaLabel: 'Kadiyali' },
  ],
};

const DISCOVER_AREAS_UDUPI = {
  city: 'udupi',
  areas: [
    {
      areaKey: 'IN|KA|Udupi|Manipal',
      name: 'Manipal',
      geoCenterLat: 13.3525,
      geoCenterLon: 74.7864,
      listingCount90d: 5,
      trendDirection: 'stable',
    },
  ],
};

const DISCOVER_AREAS_BANGALORE = {
  city: 'bangalore',
  areas: [
    {
      areaKey: 'IN|KA|Bengaluru|Indiranagar',
      name: 'Indiranagar',
      geoCenterLat: 12.9716,
      geoCenterLon: 77.5946,
      listingCount90d: 3,
      trendDirection: 'stable',
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

const MANIPAL_AREA_KEY = 'IN|KA|Udupi|Manipal';

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

async function stubTrendsOptions(page: Page): Promise<void> {
  await page.route('**/api/trends/options**', (route) =>
    fulfillJson(route, 200, TRENDS_OPTIONS_FIXTURE),
  );
}

async function stubPopularSchools(
  page: Page,
  opts: { all?: unknown[]; manipal?: unknown[] } = {},
): Promise<void> {
  const all = opts.all ?? POPULAR_SCHOOLS_FIXTURE;
  const manipal = opts.manipal ?? POPULAR_SCHOOLS_MANIPAL_FIXTURE;
  await page.route('**/api/public/schools/popular**', (route) => {
    const url = route.request().url();
    const hasAreaKey = /[?&]areaKey=/.test(url);
    return fulfillJson(route, 200, hasAreaKey ? manipal : all);
  });
}

async function stubDiscoverAreas(page: Page): Promise<void> {
  await page.route('**/api/discover/areas**', (route) => {
    const url = route.request().url();
    if (/city=bangalore/.test(url)) return fulfillJson(route, 200, DISCOVER_AREAS_BANGALORE);
    return fulfillJson(route, 200, DISCOVER_AREAS_UDUPI);
  });
}

interface ListingsCapture {
  lastRequest: Request | null;
  count: number;
}

/** Stub /api/discover/listings and capture the most recent request URL/params. */
async function stubDiscoverListings(page: Page): Promise<ListingsCapture> {
  const capture: ListingsCapture = { lastRequest: null, count: 0 };
  await page.route('**/api/discover/listings**', (route) => {
    capture.lastRequest = route.request();
    capture.count += 1;
    return fulfillJson(route, 200, EMPTY_LISTINGS_PAGE);
  });
  return capture;
}

/**
 * Stub the school-by-id endpoint for cold-load schoolId restoration.
 * Production code (MapDiscovery.tsx) correctly uses useSchoolById(urlSchoolId) which calls
 * the dedicated GET /api/public/schools/{id} endpoint (not name-search).
 * This stub provides the school detail response for exact ID lookup.
 */
async function stubSchoolByIdLookup(page: Page, school: typeof MANIPAL_SCHOOL): Promise<void> {
  await page.route(`**/api/public/schools/${school.id}**`, (route) =>
    fulfillJson(route, 200, school),
  );
}

/** Open the NearSchoolSheet by clicking the "Near a school" button. */
async function openNearSchoolSheet(page: Page): Promise<void> {
  const trigger = page.getByRole('button', { name: /near a school/i });
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  await trigger.click();
  await expect(
    page.getByRole('heading', { name: /popular schools/i }),
  ).toBeVisible({ timeout: 10_000 });
}

/**
 * Open the right-panel Filters sheet (where active filter chips render). The
 * chip strip is gated behind this Sheet so we must open it before asserting
 * chip presence/absence.
 */
async function openFiltersSheet(page: Page): Promise<void> {
  const filtersBtn = page.getByRole('button', { name: /^Filters$/ });
  await expect(filtersBtn).toBeVisible({ timeout: 10_000 });
  await filtersBtn.click();
  await expect(
    page.getByRole('heading', { name: /filters/i }).first(),
  ).toBeVisible({ timeout: 5_000 });
}

function getUrlParam(page: Page, key: string): string | null {
  return new URL(page.url()).searchParams.get(key);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Discover school-first journey (#970)', () => {
  test('happy path — narrowing area in sheet, picking school writes URL state and chip', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);
    const listings = await stubDiscoverListings(page);

    await page.goto('/discover?city=udupi');
    await page.waitForLoadState('domcontentloaded');
    await openNearSchoolSheet(page);

    const grid = page.locator('section[aria-labelledby="popular-schools-heading"]');
    await expect(grid.getByRole('button', { name: /^Select / })).toHaveCount(
      POPULAR_SCHOOLS_FIXTURE.length,
      { timeout: 10_000 },
    );

    const narrowed = page.waitForResponse(
      (r) => r.url().includes('/api/public/schools/popular') && r.url().includes('areaKey='),
      { timeout: 10_000 },
    );
    await page.locator('#popular-schools-area').click();
    await page.getByRole('option', { name: 'Manipal', exact: true }).click();
    await narrowed;

    await expect(grid.getByRole('button', { name: /^Select / })).toHaveCount(
      POPULAR_SCHOOLS_MANIPAL_FIXTURE.length,
    );

    await grid.getByRole('button', { name: /^Select Manipal Public School$/ }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: /popular schools/i })).toHaveCount(0);

    await expect.poll(() => getUrlParam(page, 'schoolId'), { timeout: 5_000 }).toBe(MANIPAL_SCHOOL.id);
    expect(getUrlParam(page, 'radiusKm')).toBe('3');

    await expect(
      page.getByRole('button', { name: /near a school/i }),
    ).toHaveAttribute('aria-pressed', 'true');

    await openFiltersSheet(page);
    await expect(
      page.getByRole('button', { name: /^Remove Near school filter$/ }),
    ).toBeVisible({ timeout: 5_000 });

    if (listings.lastRequest) {
      const url = new URL(listings.lastRequest.url());
      expect(url.searchParams.get('schoolLat')).toBe(String(MANIPAL_SCHOOL.latitude));
      expect(url.searchParams.get('schoolLon')).toBe(String(MANIPAL_SCHOOL.longitude));
      expect(url.searchParams.get('schoolRadiusKm')).toBe('3');
      expect(url.searchParams.get('localities')).toBeNull();
    }
  });

  test('cold-load restoration — direct URL with schoolId hydrates chip and filters', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);
    await stubSchoolByIdLookup(page, MANIPAL_SCHOOL);
    const listings = await stubDiscoverListings(page);

    await page.goto(`/discover?city=udupi&schoolId=${MANIPAL_SCHOOL.id}&radiusKm=3`);
    await page.waitForLoadState('domcontentloaded');

    const trigger = page.getByRole('button', { name: /near a school/i });
    await expect(trigger).toBeVisible({ timeout: 15_000 });
    await expect(trigger).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });

    await openFiltersSheet(page);
    await expect(
      page.getByRole('button', { name: /^Remove Near school filter$/ }),
    ).toBeVisible({ timeout: 10_000 });

    expect(getUrlParam(page, 'schoolId')).toBe(MANIPAL_SCHOOL.id);
    expect(getUrlParam(page, 'radiusKm')).toBe('3');

    if (listings.lastRequest) {
      const url = new URL(listings.lastRequest.url());
      expect(url.searchParams.get('schoolLat')).toBe(String(MANIPAL_SCHOOL.latitude));
      expect(url.searchParams.get('schoolLon')).toBe(String(MANIPAL_SCHOOL.longitude));
      expect(url.searchParams.get('schoolRadiusKm')).toBe('3');
    }
  });

  test('clearing the school chip removes schoolId and radiusKm from URL', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);
    await stubSchoolByIdLookup(page, MANIPAL_SCHOOL);
    const listings = await stubDiscoverListings(page);

    await page.goto(`/discover?city=udupi&schoolId=${MANIPAL_SCHOOL.id}&radiusKm=3`);
    await page.waitForLoadState('domcontentloaded');

    const trigger = page.getByRole('button', { name: /near a school/i });
    await expect(trigger).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });

    await openFiltersSheet(page);
    const chip = page.getByRole('button', { name: /^Remove Near school filter$/ });
    await expect(chip).toBeVisible({ timeout: 5_000 });

    await chip.click();

    await expect.poll(() => getUrlParam(page, 'schoolId'), { timeout: 5_000 }).toBeNull();
    expect(getUrlParam(page, 'radiusKm')).toBeNull();
    await expect(chip).toHaveCount(0);

    if (listings.lastRequest) {
      const url = new URL(listings.lastRequest.url());
      expect(url.searchParams.get('schoolLat')).toBeNull();
      expect(url.searchParams.get('schoolLon')).toBeNull();
      expect(url.searchParams.get('schoolRadiusKm')).toBeNull();
    }
  });

  test('city change clears areaKey while preserving Discover navigation', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);
    await stubSchoolByIdLookup(page, MANIPAL_SCHOOL);
    await stubDiscoverListings(page);

    await page.goto(`/discover?city=udupi&schoolId=${MANIPAL_SCHOOL.id}&radiusKm=3&areaKey=${encodeURIComponent(MANIPAL_AREA_KEY)}`);
    await page.waitForLoadState('domcontentloaded');

    await expect(
      page.getByRole('button', { name: /near a school/i }),
    ).toBeVisible({ timeout: 15_000 });

    expect(getUrlParam(page, 'areaKey')).toBe(MANIPAL_AREA_KEY);

    const cityTrigger = page.locator('[role="combobox"]').filter({ hasText: /udupi/i });
    await cityTrigger.click();
    await page.getByRole('option', { name: 'Bangalore', exact: true }).click();

    await expect(page).toHaveURL(/city=bangalore/, { timeout: 8_000 });
    await expect.poll(() => getUrlParam(page, 'areaKey'), { timeout: 5_000 }).toBeNull();
  });

  test('local area dropdown narrows popular results without writing areaKey to URL', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);

    let popularRequestsWithAreaKey = 0;
    page.on('request', (req) => {
      const u = req.url();
      if (u.includes('/api/public/schools/popular') && /[?&]areaKey=/.test(u)) {
        popularRequestsWithAreaKey += 1;
      }
    });

    await page.goto('/discover?city=udupi');
    await page.waitForLoadState('domcontentloaded');
    await openNearSchoolSheet(page);

    const grid = page.locator('section[aria-labelledby="popular-schools-heading"]');
    await expect(grid.getByRole('button', { name: /^Select / })).toHaveCount(
      POPULAR_SCHOOLS_FIXTURE.length,
      { timeout: 10_000 },
    );

    const urlAreaKeyBefore = getUrlParam(page, 'areaKey');

    const narrowed = page.waitForResponse(
      (r) => r.url().includes('/api/public/schools/popular') && r.url().includes('areaKey='),
      { timeout: 10_000 },
    );
    await page.locator('#popular-schools-area').click();
    await page.getByRole('option', { name: 'Manipal', exact: true }).click();
    await narrowed;

    expect(getUrlParam(page, 'areaKey')).toBe(urlAreaKeyBefore);
    expect(popularRequestsWithAreaKey).toBeGreaterThan(0);
  });

  test('error and empty states — Retry refetches; empty payload renders empty copy', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);

    let failNext = true;
    await page.route('**/api/public/schools/popular**', (route) => {
      if (failNext) {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'boom' }),
        });
      }
      return fulfillJson(route, 200, []);
    });

    await page.goto('/discover?city=udupi');
    await page.waitForLoadState('domcontentloaded');
    await openNearSchoolSheet(page);

    await expect(page.getByText(/couldn.?t load schools/i)).toBeVisible({ timeout: 20_000 });

    failNext = false;
    await page.getByRole('button', { name: /retry/i }).click();

    const grid = page.locator('section[aria-labelledby="popular-schools-heading"]');
    await expect(grid).toContainText(/no popular schools found near udupi/i, { timeout: 10_000 });
    await expect(grid.getByRole('button', { name: /^Select / })).toHaveCount(0);
  });

  // ─── Issue #999: SchoolMarkerLayer + prop-threading tests ────────────────

  /**
   * E2E-7: schools-in-area panel renders school cards from the stubbed API.
   *
   * Navigating to school-first with an areaKey triggers the schools-in-area
   * panel. The panel should show school cards loaded from /api/public/schools/by-area.
   * Property marker listings should NOT be loaded (the page omits markerListings
   * for school-first when no schoolId is set — see MapDiscovery listings guard).
   */
  test('E2E-7: schools-in-area panel renders school cards when browsing school-first', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);
    await stubDiscoverListings(page);

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
        latitude: 13.3510,
        longitude: 74.7850,
        schoolCategory: 'primary',
      },
    ];

    // Count calls to by-area before navigation — asserted as exactly 1 after load.
    let schoolsByAreaCallCount = 0;
    page.on('request', (req) => {
      if (req.url().includes('/api/public/schools/by-area')) {
        schoolsByAreaCallCount++;
      }
    });

    await page.route('**/api/public/schools/by-area**', (route) =>
      fulfillJson(route, 200, SCHOOLS_BY_AREA_FIXTURE),
    );

    await page.goto(
      `/discover?city=udupi&journey=school-first&areaKey=${encodeURIComponent(MANIPAL_AREA_KEY)}`,
    );
    await page.waitForLoadState('domcontentloaded');

    // Panel heading confirms schools-in-area state
    await expect(
      page.getByText(/schools in manipal/i),
    ).toBeVisible({ timeout: 15_000 });

    // School cards are rendered
    const schoolCards = page.locator('[data-testid="school-card"]');
    await expect(schoolCards).toHaveCount(SCHOOLS_BY_AREA_FIXTURE.length, { timeout: 10_000 });

    // First card shows the school name
    await expect(schoolCards.first()).toContainText('Manipal Public School');

    // Assert exactly one by-area call — no duplicate requests from prop-threading split.
    await page.waitForLoadState('networkidle');
    expect(schoolsByAreaCallCount).toBe(1);

    // No schoolId in URL — property markers are suppressed. Capture any listings
    // request with schoolLat to detect false positives reliably.
    let listingsWithSchoolReqFired = false;
    page.on('request', (req) => {
      if (req.url().includes('/api/discover/listings') && req.url().includes('schoolLat')) {
        listingsWithSchoolReqFired = true;
      }
    });
    await page.waitForLoadState('networkidle');
    expect(listingsWithSchoolReqFired).toBe(false);
  });

  /**
   * E2E-8: clicking a school card in schools-in-area panel writes schoolId to URL
   * and transitions to school-selected panel.
   *
   * This verifies the handleSelectSchool path inside SchoolsInAreaPanel and
   * confirms the URL state machine routes to school-selected.
   */
  test('E2E-8: clicking school card in schools-in-area panel sets schoolId in URL', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);

    // Capture any listings request that carries schoolLat before navigation so
    // we can reliably assert it was not fired during the panel transition.
    // (The card-click path goes straight to URL state — no school-by-ID lookup
    // is needed here since the school data comes from the by-area list, not a
    // separate /api/public/schools/:id fetch.)
    let listingsWithSchoolReqFired = false;
    page.on('request', (req) => {
      if (req.url().includes('/api/discover/listings') && req.url().includes('schoolLat')) {
        listingsWithSchoolReqFired = true;
      }
    });

    await stubDiscoverListings(page);

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
    ];

    await page.route('**/api/public/schools/by-area**', (route) =>
      fulfillJson(route, 200, SCHOOLS_BY_AREA_FIXTURE),
    );
    // Note: stubSchoolByIdLookup is intentionally omitted. The card-click path
    // reads school data from the by-area list already in memory — it does not
    // trigger a /api/public/schools/:id lookup.

    await page.goto(
      `/discover?city=udupi&journey=school-first&areaKey=${encodeURIComponent(MANIPAL_AREA_KEY)}`,
    );
    await page.waitForLoadState('domcontentloaded');

    // Wait for the school card to appear
    const schoolCard = page.locator('[data-testid="school-card"]').first();
    await expect(schoolCard).toBeVisible({ timeout: 15_000 });

    // Click the card — SchoolsInAreaPanel calls urlActions.setSchoolParams
    await schoolCard.click();

    // URL should now contain schoolId=sch-1 and radiusKm=3 (DEFAULT_SCHOOL_RADIUS_KM)
    await expect.poll(() => getUrlParam(page, 'schoolId'), { timeout: 5_000 }).toBe('sch-1');
    expect(getUrlParam(page, 'radiusKm')).toBe('3');

    // The right panel is still visible (state machine transitions to area-school-combined
    // since both areaKey and schoolId are now set — the panel content changes).
    await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 5_000 });

    // No listings request with schoolLat should have fired during the panel
    // transition (school-selected panel renders only after URL settles).
    await page.waitForLoadState('networkidle');
    expect(listingsWithSchoolReqFired).toBe(false);
  });

  /**
   * E2E-9: area-first journey does not render schools-in-area panel or school cards.
   *
   * Regression guard: SchoolMarkerLayer and schools-in-area panel are only
   * active in school-first journey. Area-first with an areaKey should show the
   * area-selected panel, not school cards.
   */
  test('E2E-9: area-first journey with areaKey shows area-selected panel, not school cards', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);
    await stubDiscoverListings(page);

    // Stub by-area just in case — it must NOT be called in area-first
    let byAreaCallCount = 0;
    await page.route('**/api/public/schools/by-area**', (route) => {
      byAreaCallCount += 1;
      return fulfillJson(route, 200, []);
    });

    await page.goto(
      `/discover?city=udupi&journey=area-first&areaKey=${encodeURIComponent(MANIPAL_AREA_KEY)}`,
    );
    await page.waitForLoadState('domcontentloaded');

    // Area-selected panel heading should be visible
    await expect(
      page.getByText(/manipal/i).first(),
    ).toBeVisible({ timeout: 15_000 });

    // No school cards should be rendered
    await expect(page.locator('[data-testid="school-card"]')).toHaveCount(0);

    // /api/public/schools/by-area must NOT have been called — MapDiscovery only
    // enables schoolsQuery when journey === 'school-first'
    expect(byAreaCallCount).toBe(0);
  });

});
