/**
 * Discover school-selected panel — E2E coverage for issue #1000.
 *
 * Surface under test: SchoolSelectedPanel rendered inside DiscoverRightPanel
 * when ?schoolId= and ?radiusKm= are present in the URL.
 *
 * Coverage:
 *   1. Cold-load: panel renders with correct school name + active radius button
 *   2. Radius change: clicking a different radius button updates URL param and
 *      triggers a new /api/discover/listings request with updated schoolRadiusKm
 *   3. Empty-state: when listings response is empty, "Increase radius" is shown
 *      and clicking it advances radius to next value
 *   4. Map circle: school circle is rendered on the map (Leaflet SVG path present)
 *
 * Anonymous flow throughout — school-by-id is a public endpoint; listings are
 * auth-gated so the fixture always returns empty (anonymous).
 *
 * Run locally:
 *   bash scripts/run-e2e-local.sh --project=full e2e/discover-school-selected.spec.ts
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

const ONE_LISTING_PAGE = {
  content: [
    {
      id: 'lst-1',
      listingNumber: '1001',
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
      latitude: 13.353,
      longitude: 74.787,
      heroImageUrl: null,
      createdAt: new Date().toISOString(),
      updatedAt: null,
      firstPublishedAt: null,
      lastUpdatedAt: null,
      daysOnMarket: 5,
      backOnMarket: false,
      reraNumber: null,
      reraValid: false,
      // #1567: fixture uses the public trustBadge word (never the raw trustTier
      // letter grade) — 'B' -> 'trusted' per TrustBadge.publicBadge().
      trustBadge: 'trusted',
      possessionStatus: null,
      sellerType: 'owner',
      listingPurpose: 'sale',
      status: 'LIVE',
    },
  ],
  page: 0,
  size: 50,
  totalElements: 1,
  totalPages: 1,
  aggregates: { topLocalities: [{ locality: 'Manipal', count: 1 }] },
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
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/discover/areas**', (route) =>
    fulfillJson(route, 200, DISCOVER_AREAS_UDUPI),
  );
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/public/schools/popular**', (route) =>
    fulfillJson(route, 200, []),
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
  lastRequest: Request | null;
}

async function stubDiscoverListings(
  page: Page,
  fixture: unknown = EMPTY_LISTINGS_PAGE,
): Promise<ListingsCapture> {
  const capture: ListingsCapture = { requests: [], lastRequest: null };
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/discover/listings**', (route) => {
    capture.requests.push(route.request());
    capture.lastRequest = route.request();
    return fulfillJson(route, 200, fixture);
  });
  return capture;
}

// Wait for the SchoolSelectedPanel radius selector to be visible.
async function waitForSchoolPanel(page: Page): Promise<void> {
  await expect(page.getByTestId('radius-btn-3')).toBeVisible({ timeout: 15_000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('@integration-ui SchoolSelectedPanel', () => {
  // Use authenticated user for listing fetches to work
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  test('E2E-1: cold-load renders school name and active radius button', async ({ page }) => {
    await stubCommonEndpoints(page);
    await stubSchoolById(page);
    await stubDiscoverListings(page);

    await page.goto(
      '/discover?city=udupi&journey=school-first&schoolId=sch-1&radiusKm=3',
    );

    // Panel header shows school name
    await expect(
      page.getByRole('heading', { name: 'Manipal Public School' }),
    ).toBeVisible({ timeout: 15_000 });

    // Board badge visible
    await expect(page.getByText('CBSE')).toBeVisible();

    // Radius buttons rendered
    await waitForSchoolPanel(page);
    await expect(page.getByTestId('radius-btn-1')).toBeVisible();
    await expect(page.getByTestId('radius-btn-2')).toBeVisible();
    await expect(page.getByTestId('radius-btn-5')).toBeVisible();

    // Active button is 3 km
    await expect(page.getByTestId('radius-btn-3')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('radius-btn-1')).toHaveAttribute('aria-pressed', 'false');
  });

  test('E2E-2: clicking radius button updates URL and triggers new listings fetch', async ({ page }) => {
    await stubCommonEndpoints(page);
    await stubSchoolById(page);
    const capture = await stubDiscoverListings(page);

    await page.goto(
      '/discover?city=udupi&journey=school-first&schoolId=sch-1&radiusKm=3',
    );

    await waitForSchoolPanel(page);

    // Click 5 km radius
    await page.getByTestId('radius-btn-5').click();

    // URL param updates
    await expect(page).toHaveURL(/radiusKm=5/, { timeout: 5_000 });

    // New listings request fired with schoolRadiusKm=5
    await expect
      .poll(
        () => capture.requests.some(
          (r) => r.url().includes('schoolRadiusKm=5'),
        ),
        { timeout: 8_000 },
      )
      .toBe(true);
  });

  test('E2E-3: empty-state shows Increase radius; clicking it advances radius', async ({ page }) => {
    await stubCommonEndpoints(page);
    await stubSchoolById(page);
    await stubDiscoverListings(page, EMPTY_LISTINGS_PAGE);

    // Start at 3 km — listings empty, so empty-state is shown
    await page.goto(
      '/discover?city=udupi&journey=school-first&schoolId=sch-1&radiusKm=3',
    );

    // Wait for panel to load (school name visible)
    await expect(
      page.getByRole('heading', { name: 'Manipal Public School' }),
    ).toBeVisible({ timeout: 15_000 });

    // Because this is an anonymous session, listings are empty (auth-gated endpoint
    // returns no content). The empty-state should appear.
    await expect(page.getByTestId('increase-radius-btn')).toBeVisible({ timeout: 8_000 });

    // Click Increase radius (3 → 5)
    await page.getByTestId('increase-radius-btn').click();

    // URL updates to 5 km
    await expect(page).toHaveURL(/radiusKm=5/, { timeout: 5_000 });

    // New active radius button is 5
    await expect(page.getByTestId('radius-btn-5')).toHaveAttribute('aria-pressed', 'true');
  });

  test('E2E-4: map circle renders for school when schoolId set', async ({ page }) => {
    await stubCommonEndpoints(page);
    await stubSchoolById(page);
    await stubDiscoverListings(page);

    await page.goto(
      '/discover?city=udupi&journey=school-first&schoolId=sch-1&radiusKm=3',
    );

    // Wait for the panel to confirm school loaded
    await expect(
      page.getByRole('heading', { name: 'Manipal Public School' }),
    ).toBeVisible({ timeout: 15_000 });

    // Leaflet renders the Circle as an SVG <path> inside the map container.
    // The school circle is the only dashed <path> on the map (dashArray: '6 4').
    // We verify a <path> is rendered in the Leaflet SVG overlay layer.
    const mapContainer = page.locator('.leaflet-container');
    await expect(mapContainer).toBeVisible({ timeout: 10_000 });

    // SVG dashed-circle path present (Leaflet renders the school radius Circle
    // as an SVG <path> with a stroke-dasharray attribute; this distinguishes it
    // from other solid paths that may be on the map).
    const dashedCircles = mapContainer.locator('svg path[stroke-dasharray]');
    await expect(dashedCircles).toHaveCount(1, { timeout: 10_000 });
    await expect(dashedCircles.first()).toBeVisible();
  });

  test('E2E-6: listings request includes both school context and property filter params', async ({ page }) => {
    await stubCommonEndpoints(page);
    await stubSchoolById(page);
    const capture = await stubDiscoverListings(page, ONE_LISTING_PAGE);

    // Navigate with schoolId, radiusKm, AND a property filter already in URL.
    // useDiscoverUrlState maps the 'type' URL param → propertyTypes in filters, which
    // useDiscoverListings then appends as propertyTypes= to the API request.
    await page.goto(
      '/discover?city=udupi&journey=school-first&schoolId=sch-1&radiusKm=3&type=house',
    );

    await waitForSchoolPanel(page);

    // All four params must appear in the SAME /api/discover/listings request —
    // a single combined check prevents the split-pass false positive where school
    // params arrive in one request and propertyTypes in a separate one.
    await expect
      .poll(
        () =>
          capture.requests.some(
            (r) =>
              r.url().includes('schoolLat=') &&
              r.url().includes('schoolLon=') &&
              r.url().includes('schoolRadiusKm=3') &&
              r.url().includes('propertyTypes=house'),
          ),
        { timeout: 10_000 },
      )
      .toBe(true);

    // URL must still carry schoolId and radiusKm (school context not wiped by filter).
    await expect(page).toHaveURL(/schoolId=sch-1/);
    await expect(page).toHaveURL(/radiusKm=3/);
  });

  test('E2E-5: default radius is 3 km when radiusKm absent from URL', async ({ page }) => {
    await stubCommonEndpoints(page);
    await stubSchoolById(page);
    const capture = await stubDiscoverListings(page);

    // No radiusKm param
    await page.goto(
      '/discover?city=udupi&journey=school-first&schoolId=sch-1',
    );

    await waitForSchoolPanel(page);

    // Default of 3 km should be active
    await expect(page.getByTestId('radius-btn-3')).toHaveAttribute('aria-pressed', 'true');

    // Listings request uses default 3 km
    await expect
      .poll(
        () => capture.requests.some(
          (r) => r.url().includes('schoolRadiusKm=3'),
        ),
        { timeout: 8_000 },
      )
      .toBe(true);
  });
});
