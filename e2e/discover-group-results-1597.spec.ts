/**
 * E2E — area-first group-results journey (Issue #1597)
 *
 * Covers the new server-filtered group-results state introduced by #1597:
 *   - Select group → click "View all" CTA → URL gains groupResults=1 → results panel
 *   - Cold-load deep-link with groupResults=1 reproduces the state (no whole-city leak)
 *   - Buy/Rent + a property-type filter preserved across the CTA transition
 *   - Back (clearGroupResults) returns to the group drill-down panel
 *
 * All tests are STUB-FIRST: network requests are intercepted via page.route so they
 * run without a seeded backend (shares the same pattern as discover-area-first-grouping-1489.spec.ts).
 *
 * Run locally:
 *   PLAYWRIGHT_BASE_URL=http://localhost:5181 npx playwright test \
 *     e2e/discover-group-results-1597.spec.ts --project=chromium --reporter=list
 */

import { test, expect, type Page } from '@playwright/test';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CITY = 'udupi';
const GROUP_SLUG = 'university-belt';
const AREA_KEY_MANIPAL = 'IN|KA|Udupi|Manipal';
const AREA_KEY_KATAPADI = 'IN|KA|Udupi|Katapadi';
const OUT_OF_GROUP_LISTING_ID = 'coastal-listing-out-of-group-999';
const GROUP_LISTING_ID_1 = 'university-belt-listing-001';
const GROUP_LISTING_ID_2 = 'university-belt-listing-002';

// Backend DTO for /api/discover/area-groups
const MOCK_AREA_GROUPS = {
  city: CITY,
  groups: [
    {
      slug: GROUP_SLUG,
      name: 'University Belt',
      subtitle: 'Manipal and Katapadi campuses',
      description:
        'Home to Manipal University — the densest student-rental hub in Coastal Karnataka.',
      regionLabel: 'Central',
      displayOrder: 1,
      areaKeys: [AREA_KEY_MANIPAL, AREA_KEY_KATAPADI],
      focusLat: 13.35,
      focusLon: 74.79,
      minLat: 13.3,
      minLon: 74.75,
      maxLat: 13.4,
      maxLon: 74.83,
    },
    {
      slug: 'coastal-belt',
      name: 'Coastal Belt',
      subtitle: 'Malpe and Kapu beaches',
      regionLabel: 'West',
      displayOrder: 2,
      areaKeys: ['IN|KA|Udupi|Malpe'],
    },
  ],
};

// Backend DTO for /api/discover/areas (for the Level-2 area rows in AreaGroupSelectedPanel)
const MOCK_AREAS = {
  city: CITY,
  areas: [
    {
      areaKey: AREA_KEY_MANIPAL,
      name: 'Manipal',
      geoCenterLat: 13.3525,
      geoCenterLon: 74.7864,
      listingCount: 12,
      schoolCount: 4,
    },
    {
      areaKey: AREA_KEY_KATAPADI,
      name: 'Katapadi',
      geoCenterLat: 13.3498,
      geoCenterLon: 74.7801,
      listingCount: 6,
      schoolCount: 1,
    },
    {
      areaKey: 'IN|KA|Udupi|Malpe',
      name: 'Malpe',
      geoCenterLat: 13.3568,
      geoCenterLon: 74.7052,
      listingCount: 7,
      schoolCount: 2,
    },
  ],
};

// Paginated listing response for the group-results panel (server-filtered to University Belt areas).
// Critically: must NOT include OUT_OF_GROUP_LISTING_ID.
const MOCK_GROUP_LISTINGS_PAGE = {
  content: [
    {
      id: GROUP_LISTING_ID_1,
      pricePaise: 4500000,
      propertyType: 'apartment',
      locality: 'Manipal',
      primaryImageUrl: null,
      listingPurpose: 'sale',
      city: CITY,
      areaKey: AREA_KEY_MANIPAL,
    },
    {
      id: GROUP_LISTING_ID_2,
      pricePaise: 3800000,
      propertyType: 'apartment',
      locality: 'Katapadi',
      primaryImageUrl: null,
      listingPurpose: 'sale',
      city: CITY,
      areaKey: AREA_KEY_KATAPADI,
    },
  ],
  page: 0,
  size: 50,
  totalElements: 2,
  totalPages: 1,
  aggregates: null,
};

// Paginated listing response for the WHOLE CITY (must NOT appear in group-results state)
const MOCK_WHOLE_CITY_LISTINGS_PAGE = {
  content: [
    {
      id: OUT_OF_GROUP_LISTING_ID,
      pricePaise: 7200000,
      propertyType: 'house',
      locality: 'Malpe',
      primaryImageUrl: null,
      listingPurpose: 'sale',
      city: CITY,
      areaKey: 'IN|KA|Udupi|Malpe',
    },
  ],
  page: 0,
  size: 50,
  totalElements: 1,
  totalPages: 1,
  aggregates: null,
};

// City-level listings for city-overview tiles (DiscoverCityListings — separate endpoint)
const MOCK_CITY_LISTINGS_TILES = {
  city: CITY,
  limitPerArea: 5,
  areas: [],
};

// Markers response: group-filtered (contains only University Belt markers)
const MOCK_GROUP_MARKERS = {
  city: CITY,
  markers: [
    { id: GROUP_LISTING_ID_1, lat: 13.352, lon: 74.786, pricePaise: 4500000 },
    { id: GROUP_LISTING_ID_2, lat: 13.35, lon: 74.78, pricePaise: 3800000 },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5181';

function discoverUrl(params: Record<string, string> = {}) {
  const sp = new URLSearchParams({ city: CITY, journey: 'area-first', ...params });
  return `${BASE_URL}/discover?${sp.toString()}`;
}

/**
 * Register all route stubs. The /api/listings stub is split into two handlers:
 *   1. When areaKeys= is present in the query → return group-filtered listings
 *   2. Otherwise → return whole-city listings (which must NOT appear in group-results panel)
 */
async function setupStubs(page: Page, opts: { rentMode?: boolean; typeFilter?: string } = {}) {
  await page.route('**/api/discover/area-groups**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_AREA_GROUPS),
    }),
  );
  await page.route('**/api/discover/areas**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_AREAS),
    }),
  );

  // /api/discover/listings: branch on areaKeys param presence
  await page.route('**/api/discover/listings**', (route) => {
    const url = new URL(route.request().url());
    const hasAreaKeys = url.searchParams.has('areaKeys');
    const body = hasAreaKeys ? MOCK_GROUP_LISTINGS_PAGE : MOCK_WHOLE_CITY_LISTINGS_PAGE;
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  // /api/discover/markers: always return group-filtered markers for this test
  await page.route('**/api/discover/markers**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_GROUP_MARKERS),
    }),
  );

  // Suppress noise
  await page.route(`**/api/discover/cities/${CITY}/listings**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_CITY_LISTINGS_TILES),
    }),
  );
  await page.route('**/api/discover/regional-area-groups**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ groups: [] }),
    }),
  );
  await page.route('**/api/discover/agri-map-listings**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ listings: [] }),
    }),
  );
  await page.route('**/api/trends/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ city: CITY, defaultAreas: [] }),
    }),
  );
  await page.route('**/api/area-intelligence/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ insights: [] }),
    }),
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Issue #1597 — area-first group-results journey', () => {
  test.beforeEach(async ({ page }) => {
    await setupStubs(page);
  });

  /**
   * GR-1: Select group → click "View all" CTA → URL gains groupResults=1 → results panel visible.
   *
   * Business assertion: if the CTA click does not set groupResults=1, the results panel
   * would not mount and this test fails.
   */
  test('GR-1: CTA click sets groupResults=1 in URL and mounts the group-results panel', async ({ page }) => {
    await page.goto(discoverUrl({ groupId: GROUP_SLUG }));

    // Wait for the Level-2 selected-group panel (AreaGroupSelectedPanel)
    await expect(page.getByTestId('area-group-selected-card')).toBeVisible({ timeout: 12_000 });

    // Click the "View all N properties across University Belt" CTA
    const cta = page.getByTestId('area-group-view-all');
    await expect(cta).toBeVisible({ timeout: 5_000 });
    await cta.click();

    // URL must gain groupResults=1
    await expect(page).toHaveURL(/groupResults=1/, { timeout: 5_000 });
    // groupId must be preserved
    await expect(page).toHaveURL(/groupId=university-belt/);
    // journey must be preserved
    await expect(page).toHaveURL(/journey=area-first/);

    // The group-results panel must mount.
    // group-results-listing-{id} is emitted by ListingCard in AreaGroupResultsPanel.
    // Assert the first in-group listing card directly — confirmed present by the stub.
    await expect(
      page.getByTestId(`group-results-listing-${GROUP_LISTING_ID_1}`),
    ).toBeVisible({ timeout: 10_000 });
  });

  /**
   * GR-2: List results exclude out-of-group listings.
   *
   * Business assertion: if the backend returns listings from /api/listings without
   * areaKeys filtering (or the FE doesn't pass areaKeys), the whole-city listing
   * (OUT_OF_GROUP_LISTING_ID) would appear — this test catches that leak.
   */
  test('GR-2: group-results panel shows ONLY in-group listings (no whole-city leak)', async ({ page }) => {
    await page.goto(
      discoverUrl({ groupId: GROUP_SLUG, groupResults: '1' }),
    );

    // Wait for the group-results state to settle
    await expect(page).toHaveURL(/groupResults=1/, { timeout: 5_000 });

    // In-group listing must be present.
    // group-results-listing-{id} is emitted by ListingCard in AreaGroupResultsPanel.
    // Assert directly on the stable per-card testid; no fallback needed (stub guarantees the card).
    await expect(page.getByTestId(`group-results-listing-${GROUP_LISTING_ID_1}`)).toBeVisible({ timeout: 12_000 });

    // Out-of-group listing (whole-city Malpe result) must NOT appear anywhere in the panel
    await expect(page.getByTestId(`group-results-listing-${OUT_OF_GROUP_LISTING_ID}`)).not.toBeAttached();
  });

  /**
   * GR-3: Cold-load deep-link with groupResults=1 reproduces the group-results state.
   *
   * Business assertion: if the FE does not read the groupResults=1 flag on cold-load,
   * the panel falls back to area-groups-landing and the deep-link is broken.
   */
  test('GR-3: cold-load deep-link with groupResults=1 renders group-results state (not whole-city)', async ({ page }) => {
    const deepLink = discoverUrl({
      groupId: GROUP_SLUG,
      groupResults: '1',
      lat: '13.35',
      lon: '74.79',
      zoom: '14',
    });
    await page.goto(deepLink);

    // Must NOT fall back to the group landing / Level-1 cards
    await expect(page.getByTestId(`area-group-card-${GROUP_SLUG}`)).not.toBeVisible({ timeout: 3_000 });

    // The URL must retain groupResults=1 (no redirect that strips it)
    await expect(page).toHaveURL(/groupResults=1/, { timeout: 5_000 });

    // Out-of-group listing must NOT appear (no whole-city leak on cold-load)
    await expect(page.getByTestId(`group-results-listing-${OUT_OF_GROUP_LISTING_ID}`)).not.toBeAttached();
  });

  /**
   * GR-4: Buy/Rent intent and a property filter are preserved across the CTA transition.
   *
   * Business assertion: if enterGroupResults() drops intent=rent from the URL,
   * the results would default back to buy and the filter chip would disappear.
   */
  test('GR-4: intent=rent and type=apartment filter preserved through CTA transition', async ({ page }) => {
    // Start in the group drill-down with intent=rent and type=apartment
    await page.goto(
      discoverUrl({ groupId: GROUP_SLUG, intent: 'rent', type: 'apartment' }),
    );

    await expect(page.getByTestId('area-group-selected-card')).toBeVisible({ timeout: 12_000 });

    // Click the "View all" CTA
    const cta = page.getByTestId('area-group-view-all');
    await expect(cta).toBeVisible({ timeout: 5_000 });
    await cta.click();

    // URL must retain intent=rent and type=apartment after entering group-results
    await expect(page).toHaveURL(/groupResults=1/, { timeout: 5_000 });
    await expect(page).toHaveURL(/intent=rent/);
    await expect(page).toHaveURL(/type=apartment/);
  });

  /**
   * GR-5: Back from group-results returns to the group drill-down (clearGroupResults).
   *
   * Business assertion: if clearGroupResults() does not work, clicking Back leaves
   * the user stuck in the group-results panel with no way to drill into individual areas.
   */
  test('GR-5: browser Back from group-results returns to the group drill-down panel', async ({ page }) => {
    await page.goto(discoverUrl({ groupId: GROUP_SLUG }));

    // Enter group-results via the CTA
    await expect(page.getByTestId('area-group-selected-card')).toBeVisible({ timeout: 12_000 });
    await page.getByTestId('area-group-view-all').click();
    await expect(page).toHaveURL(/groupResults=1/, { timeout: 5_000 });

    // Press browser Back
    await page.goBack();

    // groupResults=1 must be gone from the URL
    await expect.poll(
      () => new URL(page.url()).searchParams.get('groupResults'),
      { timeout: 5_000 },
    ).toBeNull();

    // The Level-2 group drill-down panel must be visible again (not whole-city landing)
    await expect(page.getByTestId('area-group-selected-card')).toBeVisible({ timeout: 8_000 });
    // groupId must still be present
    await expect(page).toHaveURL(/groupId=university-belt/);
  });
});

test.describe('Issue #1597 — existing journeys not regressed', () => {
  test.beforeEach(async ({ page }) => {
    await setupStubs(page);
  });

  /**
   * GR-REG-1: Area-first drill-down (Udupi → University Belt → Manipal) still works.
   *
   * Regression guard: #1597 changes must not break the pre-existing child-area selection.
   */
  test('GR-REG-1: child-area selection Udupi → University Belt → Manipal still works', async ({ page }) => {
    await page.goto(discoverUrl({ groupId: GROUP_SLUG }));

    // Level-2 area rows must be present
    await expect(page.getByTestId('area-group-level2')).toBeVisible({ timeout: 12_000 });

    const manipalRow = page.getByTestId(`browse-all-area-${AREA_KEY_MANIPAL}`);
    await expect(manipalRow).toBeVisible({ timeout: 5_000 });
    await manipalRow.click();

    // URL must gain areaKey (NOT groupResults)
    await expect(page).toHaveURL(
      new RegExp(`areaKey=${encodeURIComponent(AREA_KEY_MANIPAL)}`),
      { timeout: 5_000 },
    );
    await expect.poll(
      () => new URL(page.url()).searchParams.get('groupResults'),
      { timeout: 3_000 },
    ).toBeNull();

    // groupId must be preserved alongside areaKey
    await expect(page).toHaveURL(/groupId=university-belt/);
  });
});
