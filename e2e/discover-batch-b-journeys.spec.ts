/**
 * E2E: Issue #1745 Batch B — unified Discover portal visual-parity journeys.
 *
 * Batch B converted three solid-fill "hero card" summary bands to the shared
 * tinted SummaryBandCard (SchoolsInAreaPanel selected-area band, SchoolSummaryBand
 * in SchoolJourneyPanels, AgriGroupSelectedPanel corridor band) and applied
 * reflow-only responsive hardening across the area-first / school-first /
 * agri-first journeys. Presentational-only — no URL/marker/routing behaviour
 * changed (code-reviewer APPROVED, zero marker/map files touched).
 *
 * This spec exercises the cross-layer, business-meaningful surface of that
 * change: the three journeys' entry + selected states actually render with the
 * unified model's data-testid contract, the landing's Buy/Rent + region-scope
 * controls (Issue #1745 P7/P8, backend-owned counts) actually react to real
 * stubbed refetches, and browser history / mobile reflow remain sane. Every
 * assertion below would FAIL if a panel silently stopped rendering its summary
 * band, a count stopped reacting to Buy/Rent, or a URL-state transition broke —
 * not mere goto+URL checks.
 *
 * Backend-free: all API calls stubbed via page.route (established project
 * pattern — see e2e/discover-agri-direction-first-1448.spec.ts,
 * e2e/agri-group-selected-panel-1425.spec.ts, e2e/discover-school-first-journey.spec.ts).
 * Runs against a bare Vite dev server — no Spring Boot backend needed.
 *
 * Run:
 *   PLAYWRIGHT_BASE_URL=http://localhost:5183 npx playwright test \
 *     e2e/discover-batch-b-journeys.spec.ts --project=full
 */

import { test, expect, type Page, type Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CITY = 'udupi';
const AREA_KEY = 'IN|KA|Udupi|Manipal';
const ENCODED_AREA_KEY = encodeURIComponent(AREA_KEY);
const GROUP_ID = 'south-udupi';

const MIT_SCHOOL_ID = '8c279ab2-5770-44dd-a15e-57526b0b4a91';
const MIT_LAT = 13.3525;
const MIT_LON = 74.79226;

const AGRI_DIRECTION = 'N';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TRENDS_OPTIONS_FIXTURE = {
  city: CITY,
  defaultAreas: [{ areaKey: AREA_KEY, areaLabel: 'Manipal' }],
};

const DISCOVER_AREAS_FIXTURE = {
  city: CITY,
  areas: [
    {
      areaKey: AREA_KEY,
      name: 'Manipal',
      geoCenterLat: 13.3509,
      geoCenterLon: 74.7932,
      minLat: 13.33,
      maxLat: 13.38,
      minLon: 74.77,
      maxLon: 74.82,
      listingCount: 7,
      agriAcreage: 18.0,
      schoolCount: 6,
      trendDirection: 'stable',
    },
  ],
};

const AREA_GROUPS_FIXTURE = {
  city: CITY,
  groups: [
    {
      slug: GROUP_ID,
      name: 'South Udupi',
      subtitle: 'Manipal',
      regionLabel: 'South',
      displayOrder: 1,
      areaKeys: [AREA_KEY],
      focusLat: 13.19,
      focusLon: 74.79,
      minLat: 13.0,
      minLon: 74.6,
      maxLat: 13.4,
      maxLon: 75.0,
    },
  ],
};

const MIT_SCHOOL = {
  id: MIT_SCHOOL_ID,
  name: 'Manipal Institute of Technology',
  board: 'DEEMED',
  boardType: null,
  address: 'Manipal, Udupi, Karnataka 576104',
  latitude: MIT_LAT,
  longitude: MIT_LON,
  distanceKm: 0.0,
  areaKey: AREA_KEY,
};

const CITY_LISTINGS_FIXTURE = {
  city: CITY,
  limitPerArea: 50,
  areas: [
    {
      areaKey: AREA_KEY,
      areaName: 'Manipal',
      listings: [
        {
          id: 'listing-mit-1',
          propertyType: 'house',
          title: 'House Near MIT',
          locality: 'Manipal',
          pricePaise: 500000000,
          lat: MIT_LAT + 0.005,
          lon: MIT_LON + 0.002,
          listingPurpose: 'sale',
        },
      ],
    },
  ],
};

const SCHOOL_RADIUS_LISTINGS_FIXTURE = {
  content: [
    {
      id: 'sr-batchb-1',
      listingNumber: 9030,
      propertyType: 'house',
      title: 'House Near MIT',
      locality: 'Manipal',
      areaKey: AREA_KEY,
      pricePaise: 500_000_000,
      landArea: null,
      landAreaUnit: null,
      builtArea: 1200,
      builtAreaUnit: 'sqft',
      bedrooms: 3,
      latitude: MIT_LAT + 0.001,
      longitude: MIT_LON + 0.001,
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

const REGIONAL_AREA_GROUPS_FIXTURE = {
  city: CITY,
  groups: [
    {
      directionCode: AGRI_DIRECTION,
      groupName: 'N towards Brahmavar',
      availableMaxDistances: [
        { maxKm: 10, distanceLabel: 'Within 10 km', includedBandCodes: ['0_10'], listingCount: 2, areaKeys: [AREA_KEY] },
        { maxKm: 25, distanceLabel: 'Up to 25 km', includedBandCodes: ['0_10', '10_25'], listingCount: 5, areaKeys: [AREA_KEY] },
        { maxKm: 50, distanceLabel: 'Up to 50 km', includedBandCodes: ['0_10', '10_25', '25_50'], listingCount: 8, areaKeys: [AREA_KEY] },
        { maxKm: 100, distanceLabel: 'Up to 100 km', includedBandCodes: ['0_10', '10_25', '25_50', '50_up'], listingCount: 12, areaKeys: [AREA_KEY] },
      ],
    },
  ],
};

const AGRI_MAP_LISTINGS_FIXTURE = {
  city: CITY,
  listings: [
    {
      id: 'agri-batchb-1',
      title: 'North Plot Alpha',
      locality: 'Manipal',
      landArea: 3.0,
      landAreaUnit: 'acres',
      pricePaise: 7500000,
      boundaryGeoJson: null,
      lat: 13.4,
      lon: 74.79,
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

/** GET /api/discover/summary — regions differ between sale and rent so Buy/Rent is a real refetch. */
function summaryFixture(listingPurpose: 'sale' | 'rent') {
  const isRent = listingPurpose === 'rent';
  return {
    city: CITY,
    propertyType: null,
    groupBy: 'area_group',
    totalActiveListings: isRent ? 12 : 42,
    regions: [
      { regionKey: 'south', regionLabel: 'South', listingCount: isRent ? 5 : 18 },
      { regionKey: 'north', regionLabel: 'North', listingCount: isRent ? 4 : 15 },
      { regionKey: 'central', regionLabel: 'Central', listingCount: isRent ? 3 : 9 },
    ],
    hotspots: [],
    generatedAt: '2026-07-01T00:00:00Z',
  };
}

function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/** Register all common stubs. Summary reacts to listingPurpose query param. */
async function stubAll(page: Page): Promise<void> {
  await page.route('**/api/trends/options**', (route) => fulfillJson(route, 200, TRENDS_OPTIONS_FIXTURE));
  await page.route('**/api/discover/areas**', (route) => fulfillJson(route, 200, DISCOVER_AREAS_FIXTURE));
  await page.route('**/api/discover/area-groups**', (route) => fulfillJson(route, 200, AREA_GROUPS_FIXTURE));
  await page.route('**/api/discover/regional-area-groups**', (route) =>
    fulfillJson(route, 200, REGIONAL_AREA_GROUPS_FIXTURE),
  );
  await page.route('**/api/discover/agri-map-listings**', (route) => fulfillJson(route, 200, AGRI_MAP_LISTINGS_FIXTURE));
  await page.route('**/api/public/schools/popular**', (route) => fulfillJson(route, 200, []));
  await page.route('**/api/public/schools/search**', (route) => fulfillJson(route, 200, [MIT_SCHOOL]));
  await page.route(`**/api/public/schools/${MIT_SCHOOL_ID}`, (route) => fulfillJson(route, 200, MIT_SCHOOL));
  await page.route('**/api/public/schools/by-area**', (route) => fulfillJson(route, 200, [MIT_SCHOOL]));
  await page.route('**/api/discover/cities/*/listings**', (route) => fulfillJson(route, 200, CITY_LISTINGS_FIXTURE));
  await page.route('**/api/discover/listings**', (route) => fulfillJson(route, 200, EMPTY_LISTINGS_PAGE));
  await page.route('**/api/discover/markers**', (route) => fulfillJson(route, 401, { error: 'Unauthorized' }));
  // Registered after the broader /listings glob so its more specific path wins.
  await page.route('**/api/discover/cities/*/school-radius-listings**', (route) =>
    fulfillJson(route, 200, SCHOOL_RADIUS_LISTINGS_FIXTURE),
  );
  await page.route('**/api/discover/summary**', (route) => {
    const url = new URL(route.request().url());
    const listingPurpose = url.searchParams.get('listingPurpose') === 'rent' ? 'rent' : 'sale';
    return fulfillJson(route, 200, summaryFixture(listingPurpose));
  });
}

function discoverUrl(params: Record<string, string> = {}): string {
  const sp = new URLSearchParams({ city: CITY, ...params });
  return `/discover?${sp.toString()}`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('@integration-ui Issue #1745 Batch B — unified Discover portal journeys', () => {
  // ── Landing: unified model + Buy/Rent reactivity + scope select/clear ──────

  test('Landing renders unified guided-entry model with all three journey cards and backend-owned region counts', async ({
    page,
  }) => {
    await stubAll(page);

    const summaryResponse = page.waitForResponse(
      (res) => res.url().includes('/api/discover/summary') && res.status() === 200,
    );
    await page.goto(discoverUrl());
    await summaryResponse;

    await expect(page.getByTestId('guided-entry-panel')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('journey-card-area-first')).toBeVisible();
    await expect(page.getByTestId('journey-card-school-first')).toBeVisible();
    await expect(page.getByTestId('journey-card-agri-first')).toBeVisible();

    // Backend-owned region counts actually rendered (not fabricated client aggregation).
    const regionsGrid = page.getByTestId('guided-entry-regions-grid');
    await expect(regionsGrid).toBeVisible({ timeout: 8_000 });
    await expect(regionsGrid).toContainText('South');
    await expect(regionsGrid).toContainText('18 properties');
  });

  test('Buy/Rent toggle triggers a real refetch — region counts change to the rent fixture values', async ({
    page,
  }) => {
    await stubAll(page);
    await page.goto(discoverUrl());
    await expect(page.getByTestId('guided-entry-regions-grid')).toContainText('18 properties', {
      timeout: 10_000,
    });

    const rentSummaryResponse = page.waitForResponse(
      (res) => res.url().includes('/api/discover/summary') && res.url().includes('listingPurpose=rent'),
    );
    await page.getByTestId('intent-selector-rent').click();
    await rentSummaryResponse;

    // Business assertion: the SAME region card now shows the rent-fixture count (5), not the
    // stale sale-fixture count (18) — proves listingPurpose is wired end-to-end, not cosmetic.
    await expect(page.getByTestId('guided-entry-regions-grid')).toContainText('5 properties', {
      timeout: 8_000,
    });
    await expect(page.getByTestId('guided-entry-regions-grid')).not.toContainText('18 properties');
    await expect(page).toHaveURL(/intent=rent/);
  });

  test('Scope select highlights the chosen region and persists in URL; Clear removes it', async ({ page }) => {
    await stubAll(page);
    await page.goto(discoverUrl());
    await expect(page.getByTestId('guided-entry-regions-grid')).toBeVisible({ timeout: 10_000 });

    const southCard = page.getByTestId('guided-entry-regions-grid').getByRole('button', { name: /South/ });
    await southCard.click();

    await expect(southCard).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(/scope=south/);

    await page.getByRole('button', { name: /clear/i }).click();

    await expect(southCard).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => new URL(page.url()).searchParams.get('scope'), { timeout: 5_000 }).toBeNull();
  });

  // ── Area-first: entry (Level-2 group) -> selected (Level-3 area) ───────────

  test('Area-first: Level-2 group rows -> selecting an area renders area-selected-panel', async ({ page }) => {
    await stubAll(page);

    await page.goto(discoverUrl({ journey: 'area-first', groupId: GROUP_ID }));
    await expect(page.getByTestId('area-group-level2')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId(`browse-all-area-${AREA_KEY}`).click();

    await expect(page).toHaveURL(new RegExp(`areaKey=${ENCODED_AREA_KEY}`), { timeout: 5_000 });
    await expect(page.getByTestId('area-selected-panel')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId('add-school-cta')).toBeVisible();
    await expect(page.getByTestId('area-group-level2')).not.toBeAttached();
  });

  // ── School-first: entry (search) -> selected (summary band + radius legend) ─

  test('School-first: entry search -> selecting MIT renders school-summary-band, radius legend, and property markers', async ({
    page,
  }) => {
    await stubAll(page);

    await page.goto(discoverUrl({ journey: 'school-first' }));
    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel).toBeVisible({ timeout: 15_000 });

    const searchInput = rightPanel
      .locator('input[type="text"], input[placeholder*="school" i], input[placeholder*="search" i]')
      .first();
    await expect(searchInput).toBeVisible({ timeout: 10_000 });
    await searchInput.fill('Manipal');

    const mitOption = page.getByText('Manipal Institute of Technology').first();
    await expect(mitOption).toBeVisible({ timeout: 10_000 });

    const [radiusListingsResponse] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/school-radius-listings') && res.status() === 200, {
        timeout: 15_000,
      }),
      mitOption.click(),
    ]);
    expect(radiusListingsResponse.status()).toBe(200);

    // Batch B's converted tinted SummaryBandCard for the selected school.
    await expect(page.getByTestId('school-summary-band')).toBeVisible({ timeout: 10_000 });
    // Radius legend must coexist with the summary band (not one replacing the other).
    await expect(page.getByTestId('school-radius-legend')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('school-radius-legend-radius')).toContainText('km radius');

    const propertyMarkers = page.locator('[data-testid="property-marker"]');
    await expect(propertyMarkers.first()).toBeVisible({ timeout: 15_000 });
    expect(await propertyMarkers.count()).toBeGreaterThan(0);
  });

  // ── Agri-first: entry (corridor cards) -> selected (corridor summary band) ──

  test('Agri-first: corridor-landing entry -> selecting a corridor renders agri-group-summary-band with real listing count', async ({
    page,
  }) => {
    await stubAll(page);

    await page.goto(discoverUrl({ journey: 'agri-first' }));
    const landingPanel = page.getByTestId('agri-landing-panel');
    await expect(landingPanel).toBeVisible({ timeout: 10_000 });

    const corridorCard = page.getByTestId('corridor-card').first();
    await expect(corridorCard).toBeVisible({ timeout: 10_000 });
    await corridorCard.click();

    await expect(page).toHaveURL(/region=N/, { timeout: 5_000 });
    await expect(page).toHaveURL(/maxKm=25/);

    const summaryBand = page.getByTestId('agri-group-summary-band');
    await expect(summaryBand).toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId('agri-group-selected-label')).toContainText('N towards Brahmavar');
    // Batch B's Stat row uses the SAME backend-owned count already wired pre-Batch-B — must
    // still be the real fixture value (5 for maxKm=25), not a fabricated/stale number.
    await expect(page.getByTestId('agri-group-listing-count')).toHaveText('5');
  });

  // ── Back/forward across landing -> scope -> journey entry -> selected state ─

  test('Back/forward: landing(scope) -> area-first entry -> area-selected round-trips correctly', async ({
    page,
  }) => {
    await stubAll(page);

    // 1. Landing
    await page.goto(discoverUrl());
    await expect(page.getByTestId('guided-entry-regions-grid')).toBeVisible({ timeout: 10_000 });

    // 2. Scope select (REPLACE semantics — does not push a history entry, Issue #1745 P8)
    await page.getByTestId('guided-entry-regions-grid').getByRole('button', { name: /South/ }).click();
    await expect(page).toHaveURL(/scope=south/);

    // 3. Enter area-first journey at the group (Level-2) step — a real navigation (PUSH),
    // carrying the scope= set in step 2 forward (mirrors clicking journey-card-area-first
    // then a group card, without depending on an intermediate group-cards fixture).
    await page.goto(discoverUrl({ journey: 'area-first', groupId: GROUP_ID, scope: 'south' }));
    await expect(page.getByTestId('area-group-level2')).toBeVisible({ timeout: 10_000 });

    // 4. Select an area — PUSH
    await page.getByTestId(`browse-all-area-${AREA_KEY}`).click();
    await expect(page.getByTestId('area-selected-panel')).toBeVisible({ timeout: 8_000 });
    await expect(page).toHaveURL(new RegExp(`areaKey=${ENCODED_AREA_KEY}`));

    // 5. Back — returns to Level-2 group rows; scope survives (it was set before any PUSH).
    await page.goBack();
    await expect(page.getByTestId('area-group-level2')).toBeVisible({ timeout: 8_000 });
    await expect.poll(() => new URL(page.url()).searchParams.get('areaKey'), { timeout: 5_000 }).toBeNull();
    await expect(page).toHaveURL(/scope=south/);

    // 6. Forward — returns to the selected area state.
    await page.goForward();
    await expect(page.getByTestId('area-selected-panel')).toBeVisible({ timeout: 8_000 });
    await expect(page).toHaveURL(new RegExp(`areaKey=${ENCODED_AREA_KEY}`));
  });

  // ── Mobile viewport: reflow only, no nested-scroll regression ──────────────

  test('Mobile viewport (390x844): school-first selected state reflows without horizontal overflow or double-scroll', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubAll(page);

    await page.goto(
      discoverUrl({
        journey: 'school-first',
        areaKey: ENCODED_AREA_KEY,
        lat: String(MIT_LAT),
        lon: String(MIT_LON),
        zoom: '14',
        schoolId: MIT_SCHOOL_ID,
        radiusKm: '3',
      }),
    );

    const summaryBand = page.getByTestId('school-summary-band');
    await expect(summaryBand).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('school-radius-legend')).toBeVisible({ timeout: 10_000 });

    // No horizontal page-level overflow introduced by the reflow.
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(hasHorizontalOverflow).toBe(false);

    // The summary band must fit within the viewport width (not clipped off-screen).
    const box = await summaryBand.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390 + 1);
    }

    // No page-level (document) vertical scroll — only the right panel itself should scroll,
    // proving the reflow did not introduce a second/nested scroll surface.
    const documentScrolls = await page.evaluate(
      () => document.documentElement.scrollHeight > document.documentElement.clientHeight + 1,
    );
    expect(documentScrolls).toBe(false);
  });
});
