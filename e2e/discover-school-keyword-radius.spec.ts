/**
 * Discover school-radius + keyword search (q) — E2E coverage for issue #1187.
 *
 * Surface under test: auth users with a school + radius selected can type a keyword
 * that filters listings via the /api/discover/listings?q= param. The search chip
 * (chip-search) renders when q is non-empty and hasSchool is true (#1186).
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
