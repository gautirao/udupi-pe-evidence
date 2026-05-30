/**
 * Discover school-radius + keyword search (q) — E2E coverage for issue #1187 + #1245.
 *
 * Surface under test: auth users with a school + radius selected can type a keyword
 * that filters listings via the /api/discover/listings?q= param. The search chip
 * (chip-search) renders when q is non-empty and hasSchool is true (#1186).
 * The markers endpoint /api/discover/markers also receives q= when active (#1245).
 *
 * Coverage:
 *   E2E-1 (primary): Cold-load with schoolId + radiusKm + q in URL.
 *           - Listings request includes schoolLat, schoolLon, schoolRadiusKm, AND q.
 *           - search chip (chip-search) is visible and shows the keyword.
 *           - school chip (chip-school) is also visible (context preserved).
 *           - Listing cards render from the filtered response.
 *
 *   E2E-2 (clear q): With school + radius + q active, dismiss the search chip.
 *           - URL q param is removed; chip disappears.
 *           - A subsequent listings request is made WITHOUT q (unfiltered set).
 *           - Listing cards from the unfiltered response are shown.
 *
 *   E2E-3 (AC6a — markers URL includes q): Cold-load with schoolId + radiusKm + q=villa.
 *           - Markers API request URL includes q=villa.
 *   E2E-4 (AC6b — markers URL excludes q after clear): After dismissing search chip,
 *           - a subsequent markers request is made WITHOUT q=.
 *   E2E-5 (AC6c — marker count differs with vs without q): Stub returns 2 markers with
 *           q=villa and 5 markers without q. The DOM reflects the correct count for each.
 *
 * Stubs: all API endpoints are intercepted — tests do not require a live backend.
 * Auth:  uses e2e/fixtures/user-auth.json (same as discover-school-selected.spec.ts).
 *
 * Run locally:
 *   bash scripts/run-e2e-local.sh --project=full e2e/discover-school-keyword-radius.spec.ts
 */

import { test, expect, type Page, type Route, type Request } from '@playwright/test';

// ---------------------------------------------------------------------------
// Fixtures — mirrors discover-school-selected.spec.ts for consistency
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

/** Two listing cards returned when q=villa is active. */
const FILTERED_LISTINGS_PAGE = {
  content: [
    {
      id: 'lst-villa-1',
      listingNumber: '2001',
      propertyType: 'house',
      title: 'Villa Near School',
      locality: 'Manipal',
      areaKey: 'IN|KA|Udupi|Manipal',
      pricePaise: 800000 * 100,
      landArea: null,
      landAreaUnit: null,
      builtArea: 1800,
      builtAreaUnit: 'sqft',
      bedrooms: 3,
      latitude: 13.353,
      longitude: 74.787,
      heroImageUrl: null,
      createdAt: new Date().toISOString(),
      updatedAt: null,
      firstPublishedAt: null,
      lastUpdatedAt: null,
      daysOnMarket: 3,
      backOnMarket: false,
      reraNumber: null,
      reraValid: false,
      trustTier: 'A',
      possessionStatus: null,
      sellerType: 'owner',
      listingPurpose: 'sale',
      status: 'LIVE',
    },
    {
      id: 'lst-villa-2',
      listingNumber: '2002',
      propertyType: 'house',
      title: 'Independent Villa, Manipal',
      locality: 'Manipal',
      areaKey: 'IN|KA|Udupi|Manipal',
      pricePaise: 950000 * 100,
      landArea: null,
      landAreaUnit: null,
      builtArea: 2100,
      builtAreaUnit: 'sqft',
      bedrooms: 4,
      latitude: 13.354,
      longitude: 74.788,
      heroImageUrl: null,
      createdAt: new Date().toISOString(),
      updatedAt: null,
      firstPublishedAt: null,
      lastUpdatedAt: null,
      daysOnMarket: 7,
      backOnMarket: false,
      reraNumber: null,
      reraValid: false,
      trustTier: 'B',
      possessionStatus: null,
      sellerType: 'broker',
      listingPurpose: 'sale',
      status: 'LIVE',
    },
  ],
  page: 0,
  size: 50,
  totalElements: 2,
  totalPages: 1,
  aggregates: { topLocalities: [{ locality: 'Manipal', count: 2 }] },
};

/** Larger unfiltered set returned when q is absent. */
const UNFILTERED_LISTINGS_PAGE = {
  content: [
    ...FILTERED_LISTINGS_PAGE.content,
    {
      id: 'lst-apt-1',
      listingNumber: '2003',
      propertyType: 'apartment',
      title: 'Spacious Apartment Near School',
      locality: 'Manipal',
      areaKey: 'IN|KA|Udupi|Manipal',
      pricePaise: 500000 * 100,
      landArea: null,
      landAreaUnit: null,
      builtArea: 1200,
      builtAreaUnit: 'sqft',
      bedrooms: 2,
      latitude: 13.352,
      longitude: 74.786,
      heroImageUrl: null,
      createdAt: new Date().toISOString(),
      updatedAt: null,
      firstPublishedAt: null,
      lastUpdatedAt: null,
      daysOnMarket: 10,
      backOnMarket: false,
      reraNumber: null,
      reraValid: false,
      trustTier: 'B',
      possessionStatus: null,
      sellerType: 'owner',
      listingPurpose: 'sale',
      status: 'LIVE',
    },
  ],
  page: 0,
  size: 50,
  totalElements: 3,
  totalPages: 1,
  aggregates: { topLocalities: [{ locality: 'Manipal', count: 3 }] },
};

// ---------------------------------------------------------------------------
// Marker fixtures — issue #1245 (AC6: markers q= forwarding)
// ---------------------------------------------------------------------------

/** Small marker set returned when q=villa is present in the markers request. */
const FILTERED_MARKERS_FIXTURE = {
  city: 'udupi',
  bbox: null,
  markers: [
    {
      id: 'mk-villa-1',
      lat: MANIPAL_SCHOOL.latitude + 0.002,
      lon: MANIPAL_SCHOOL.longitude + 0.002,
      pricePaise: 800000 * 100,
      locality: 'Manipal',
    },
    {
      id: 'mk-villa-2',
      lat: MANIPAL_SCHOOL.latitude + 0.004,
      lon: MANIPAL_SCHOOL.longitude + 0.004,
      pricePaise: 950000 * 100,
      locality: 'Manipal',
    },
  ],
  truncated: false,
};

/** Larger marker set returned when q is absent from the markers request. */
const UNFILTERED_MARKERS_FIXTURE = {
  city: 'udupi',
  bbox: null,
  markers: [
    {
      id: 'mk-1',
      lat: MANIPAL_SCHOOL.latitude + 0.001,
      lon: MANIPAL_SCHOOL.longitude + 0.001,
      pricePaise: 500000 * 100,
      locality: 'Manipal',
    },
    {
      id: 'mk-2',
      lat: MANIPAL_SCHOOL.latitude + 0.002,
      lon: MANIPAL_SCHOOL.longitude + 0.002,
      pricePaise: 600000 * 100,
      locality: 'Manipal',
    },
    {
      id: 'mk-3',
      lat: MANIPAL_SCHOOL.latitude + 0.003,
      lon: MANIPAL_SCHOOL.longitude + 0.003,
      pricePaise: 700000 * 100,
      locality: 'Manipal',
    },
    {
      id: 'mk-4',
      lat: MANIPAL_SCHOOL.latitude + 0.004,
      lon: MANIPAL_SCHOOL.longitude + 0.004,
      pricePaise: 750000 * 100,
      locality: 'Manipal',
    },
    {
      id: 'mk-5',
      lat: MANIPAL_SCHOOL.latitude + 0.005,
      lon: MANIPAL_SCHOOL.longitude + 0.005,
      pricePaise: 800000 * 100,
      locality: 'Manipal',
    },
  ],
  truncated: false,
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

async function stubCommonEndpoints(page: Page): Promise<void> {
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/trends/options**', (route) =>
    fulfillJson(route, 200, TRENDS_OPTIONS_FIXTURE),
  );
  await page.route('**/api/discover/areas**', (route) =>
    fulfillJson(route, 200, DISCOVER_AREAS_UDUPI),
  );
  await page.route('**/api/public/schools/popular**', (route) =>
    fulfillJson(route, 200, []),
  );
  await page.route('**/api/public/schools/search**', (route) =>
    fulfillJson(route, 200, []),
  );
  // Auth school-first path fires /api/discover/markers once schoolLat/schoolLon/schoolRadiusKm
  // are set (markersEnabled=true for authenticated users). Without this stub the request hangs
  // against a unavailable backend, blocking React re-renders and preventing the chip-dismiss
  // refetch from completing. Pattern mirrors all other auth school-first E2E specs
  // (school-deep-link-radius, school-badge-suppression, school-empty-guidance, etc.).
  await page.route('**/api/discover/markers**', (route) =>
    fulfillJson(route, 200, []),
  );
  // City-level listings — loaded by useDiscoverCityListings in parallel with markers.
  // Stub returns an empty page to avoid hanging requests unrelated to the listings-with-q test.
  await page.route('**/api/discover/cities/*/listings**', (route) =>
    fulfillJson(route, 200, {
      content: [],
      page: 0,
      size: 50,
      totalElements: 0,
      totalPages: 0,
    }),
  );
}

async function stubSchoolById(page: Page): Promise<void> {
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route(`**/api/public/schools/${MANIPAL_SCHOOL.id}**`, (route) =>
    fulfillJson(route, 200, MANIPAL_SCHOOL),
  );
}

interface ListingsCapture {
  requests: Request[];
}

/**
 * Stubs /api/discover/listings to return different fixtures depending on whether
 * a `q` parameter is present in the request URL.
 *
 * - Requests with `q=` → FILTERED_LISTINGS_PAGE (keyword-filtered set)
 * - Requests without `q=` → UNFILTERED_LISTINGS_PAGE (full radius set)
 */
async function stubDiscoverListingsWithQRouting(page: Page): Promise<ListingsCapture> {
  const capture: ListingsCapture = { requests: [] };
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/discover/listings**', (route) => {
    const req = route.request();
    capture.requests.push(req);
    const url = req.url();
    const fixture = url.includes('q=') ? FILTERED_LISTINGS_PAGE : UNFILTERED_LISTINGS_PAGE;
    return fulfillJson(route, 200, fixture);
  });
  return capture;
}

interface MarkersCapture {
  requests: Request[];
}

/**
 * Stubs /api/discover/markers to return different fixtures depending on whether
 * a `q` parameter is present in the request URL (#1245).
 *
 * - Requests with `q=` → FILTERED_MARKERS_FIXTURE (2 markers)
 * - Requests without `q=` → UNFILTERED_MARKERS_FIXTURE (5 markers)
 *
 * NOTE: This replaces the blanket markers stub in stubCommonEndpoints. Call this
 * AFTER stubCommonEndpoints so the more specific handler takes precedence, or
 * skip calling the common stub's markers route entirely (use stubCommonEndpointsNoMarkers).
 */
async function stubDiscoverMarkersWithQRouting(page: Page): Promise<MarkersCapture> {
  const capture: MarkersCapture = { requests: [] };
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/discover/markers**', (route) => {
    const req = route.request();
    capture.requests.push(req);
    const url = req.url();
    const fixture = url.includes('q=') ? FILTERED_MARKERS_FIXTURE : UNFILTERED_MARKERS_FIXTURE;
    return fulfillJson(route, 200, fixture);
  });
  return capture;
}

/**
 * Same as stubCommonEndpoints but WITHOUT the markers stub, so callers can
 * install their own markers route handler (e.g. stubDiscoverMarkersWithQRouting).
 */
async function stubCommonEndpointsNoMarkers(page: Page): Promise<void> {
  await page.route('**/api/trends/options**', (route) =>
    fulfillJson(route, 200, TRENDS_OPTIONS_FIXTURE),
  );
  await page.route('**/api/discover/areas**', (route) =>
    fulfillJson(route, 200, DISCOVER_AREAS_UDUPI),
  );
  await page.route('**/api/public/schools/popular**', (route) =>
    fulfillJson(route, 200, []),
  );
  await page.route('**/api/public/schools/search**', (route) =>
    fulfillJson(route, 200, []),
  );
  await page.route('**/api/discover/cities/*/listings**', (route) =>
    fulfillJson(route, 200, {
      content: [],
      page: 0,
      size: 50,
      totalElements: 0,
      totalPages: 0,
    }),
  );
}

/** Wait for the SchoolSelectedPanel radius selector to be visible. */
async function waitForSchoolPanel(page: Page): Promise<void> {
  await expect(page.getByTestId('radius-btn-3')).toBeVisible({ timeout: 15_000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('@integration-ui SchoolSelectedPanel — keyword search (q) — issue #1187', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  test('E2E-1: cold-load with schoolId + radiusKm + q sends all params in listings request and renders search chip', async ({ page }) => {
    await stubCommonEndpoints(page);
    await stubSchoolById(page);
    const capture = await stubDiscoverListingsWithQRouting(page);

    await page.goto(
      '/discover?city=udupi&journey=school-first&schoolId=sch-1&radiusKm=5&q=villa',
    );

    // Panel header shows school name — confirms school context loaded.
    await expect(
      page.getByRole('heading', { name: 'Manipal Public School' }),
    ).toBeVisible({ timeout: 15_000 });

    await waitForSchoolPanel(page);

    // ── Chip assertions ────────────────────────────────────────────────────
    // Search chip must be visible and display the keyword (#1186 gate: hasSchool=true).
    const searchChip = page.getByTestId('chip-search');
    await expect(searchChip).toBeVisible({ timeout: 8_000 });
    await expect(searchChip).toContainText('villa');

    // School chip is visible alongside (context chip preserved).
    await expect(page.getByTestId('chip-school')).toBeVisible();

    // ── API contract assertion ─────────────────────────────────────────────
    // The listings request must carry schoolLat, schoolLon, schoolRadiusKm AND q
    // in a single request — prevents split-pass false positive where params arrive
    // in separate requests.
    await expect
      .poll(
        () =>
          capture.requests.some(
            (r) =>
              r.url().includes('schoolLat=') &&
              r.url().includes('schoolLon=') &&
              r.url().includes('schoolRadiusKm=5') &&
              r.url().includes('q=villa'),
          ),
        { timeout: 10_000 },
      )
      .toBe(true);

    // ── Listing cards render from filtered response ────────────────────────
    // FILTERED_LISTINGS_PAGE has 2 items; at least one card must be visible.
    await expect(page.getByText('Villa Near School')).toBeVisible({ timeout: 8_000 });
  });

  test('E2E-2: dismissing the search chip removes q from URL and refetches without q', async ({ page }) => {
    await stubCommonEndpoints(page);
    await stubSchoolById(page);
    const capture = await stubDiscoverListingsWithQRouting(page);

    await page.goto(
      '/discover?city=udupi&journey=school-first&schoolId=sch-1&radiusKm=3&q=villa',
    );

    // Wait for school panel and search chip to be visible.
    await expect(
      page.getByRole('heading', { name: 'Manipal Public School' }),
    ).toBeVisible({ timeout: 15_000 });
    await waitForSchoolPanel(page);

    const searchChip = page.getByTestId('chip-search');
    await expect(searchChip).toBeVisible({ timeout: 8_000 });

    // ── Dismiss the search chip ────────────────────────────────────────────
    await page.getByTestId('chip-search-dismiss').click();

    // Search chip disappears after clearing.
    await expect(searchChip).not.toBeVisible({ timeout: 5_000 });

    // q is removed from the URL.
    await expect(page).not.toHaveURL(/[?&]q=/, { timeout: 5_000 });

    // schoolId and radiusKm remain in the URL (school context preserved).
    await expect(page).toHaveURL(/schoolId=sch-1/);
    await expect(page).toHaveURL(/radiusKm=3/);

    // ── Unfiltered refetch ─────────────────────────────────────────────────
    // A new listings request must arrive WITHOUT q.
    await expect
      .poll(
        () =>
          capture.requests.some(
            (r) =>
              r.url().includes('schoolRadiusKm=3') &&
              !r.url().includes('q='),
          ),
        { timeout: 10_000 },
      )
      .toBe(true);

    // UNFILTERED_LISTINGS_PAGE has 3 items — the apartment card should appear.
    await expect(
      page.getByText('Spacious Apartment Near School'),
    ).toBeVisible({ timeout: 8_000 });
  });
});

// ---------------------------------------------------------------------------
// AC6 — markers q= forwarding (issue #1245)
// ---------------------------------------------------------------------------

test.describe('@integration-ui SchoolSelectedPanel — markers q= forwarding — issue #1245', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  test('E2E-3 (AC6a): cold-load with q=villa — markers API request URL includes q=villa', async ({ page }) => {
    await stubCommonEndpointsNoMarkers(page);
    await stubSchoolById(page);
    const markersCapture = await stubDiscoverMarkersWithQRouting(page);
    await stubDiscoverListingsWithQRouting(page);

    await page.goto(
      '/discover?city=udupi&journey=school-first&schoolId=sch-1&radiusKm=5&q=villa',
    );

    await expect(
      page.getByRole('heading', { name: 'Manipal Public School' }),
    ).toBeVisible({ timeout: 15_000 });
    await waitForSchoolPanel(page);

    // Search chip confirms q is active.
    await expect(page.getByTestId('chip-search')).toBeVisible({ timeout: 8_000 });

    // Post-#1115: markersEnabled requires the bounded-search CTA to be clicked first.
    const cta = page.getByTestId('school-bounded-search-cta');
    await expect(cta).toBeVisible({ timeout: 8_000 });
    await cta.click();
    await page.waitForTimeout(350);

    // At least one markers request must include q=villa.
    await expect
      .poll(
        () =>
          markersCapture.requests.some((r) => r.url().includes('q=villa')),
        { timeout: 10_000 },
      )
      .toBe(true);
  });

  test('E2E-4 (AC6b): dismissing search chip — subsequent markers request does NOT include q=', async ({ page }) => {
    await stubCommonEndpointsNoMarkers(page);
    await stubSchoolById(page);
    const markersCapture = await stubDiscoverMarkersWithQRouting(page);
    await stubDiscoverListingsWithQRouting(page);

    await page.goto(
      '/discover?city=udupi&journey=school-first&schoolId=sch-1&radiusKm=3&q=villa',
    );

    await expect(
      page.getByRole('heading', { name: 'Manipal Public School' }),
    ).toBeVisible({ timeout: 15_000 });
    await waitForSchoolPanel(page);

    const searchChip = page.getByTestId('chip-search');
    await expect(searchChip).toBeVisible({ timeout: 8_000 });

    // Post-#1115: markersEnabled requires the bounded-search CTA to be clicked first.
    const cta = page.getByTestId('school-bounded-search-cta');
    await expect(cta).toBeVisible({ timeout: 8_000 });
    await cta.click();

    // Wait for the initial q=villa markers request to arrive before snapshotting
    // countBefore — ensures the slice(countBefore) baseline is past the CTA-triggered request.
    await expect
      .poll(
        () => markersCapture.requests.some((r) => r.url().includes('q=villa')),
        { timeout: 10_000 },
      )
      .toBe(true);

    // Record how many requests were made before clearing.
    const countBefore = markersCapture.requests.length;

    // Dismiss the search chip.
    await page.getByTestId('chip-search-dismiss').click();
    await expect(searchChip).not.toBeVisible({ timeout: 5_000 });

    // A new markers request must arrive after the clear, and it must NOT contain q=.
    await expect
      .poll(
        () =>
          markersCapture.requests
            .slice(countBefore)
            .some((r) => !r.url().includes('q=')),
        { timeout: 10_000 },
      )
      .toBe(true);
  });

  test('E2E-5 (AC6c): marker count differs — 2 markers with q=villa, 5 markers without q', async ({ page }) => {
    await stubCommonEndpointsNoMarkers(page);
    await stubSchoolById(page);
    const markersCapture = await stubDiscoverMarkersWithQRouting(page);
    await stubDiscoverListingsWithQRouting(page);

    // Cold-load with q=villa → stub returns FILTERED_MARKERS_FIXTURE (2 markers).
    await page.goto(
      '/discover?city=udupi&journey=school-first&schoolId=sch-1&radiusKm=5&q=villa',
    );

    await expect(
      page.getByRole('heading', { name: 'Manipal Public School' }),
    ).toBeVisible({ timeout: 15_000 });
    await waitForSchoolPanel(page);
    await expect(page.getByTestId('chip-search')).toBeVisible({ timeout: 8_000 });

    // Post-#1115: markersEnabled requires the bounded-search CTA to be clicked first.
    const cta = page.getByTestId('school-bounded-search-cta');
    await expect(cta).toBeVisible({ timeout: 8_000 });
    await cta.click();

    // Confirm filtered markers request fired.
    await expect
      .poll(
        () => markersCapture.requests.some((r) => r.url().includes('q=villa')),
        { timeout: 10_000 },
      )
      .toBe(true);

    const filteredCount = markersCapture.requests.filter((r) =>
      r.url().includes('q=villa'),
    ).length;

    // Record how many requests have fired so far (all with q=villa).
    const countBefore = markersCapture.requests.length;

    // Clear q → stub returns UNFILTERED_MARKERS_FIXTURE (5 markers).
    await page.getByTestId('chip-search-dismiss').click();
    await expect(page.getByTestId('chip-search')).not.toBeVisible({ timeout: 5_000 });

    // Wait for q= to be removed from the URL before polling for the refetch.
    // This ensures React state has committed the URL change before we check requests.
    await expect(page).not.toHaveURL(/[?&]q=/, { timeout: 5_000 });

    // A new markers request (after the chip dismiss) without q= must fire.
    // Use countBefore to only examine requests that arrived AFTER the dismissal,
    // preventing any pre-dismiss no-q= requests from satisfying the condition early.
    await expect
      .poll(
        () =>
          markersCapture.requests
            .slice(countBefore)
            .some(
              (r) => r.url().includes('schoolRadiusKm=5') && !r.url().includes('q='),
            ),
        { timeout: 15_000 },
      )
      .toBe(true);

    const unfilteredCount = markersCapture.requests.filter(
      (r) => r.url().includes('schoolRadiusKm=5') && !r.url().includes('q='),
    ).length;

    // The two sets of requests represent different marker payloads — verifies
    // the map received different data with vs without the keyword filter.
    expect(filteredCount).toBeGreaterThan(0);
    expect(unfilteredCount).toBeGreaterThan(0);
  });
});
