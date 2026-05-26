/**
 * Discover area-scoped keyword search (q) — E2E anti-regression for issue #1188.
 *
 * Validates that the `q` URL param changes the VISIBLE result context (cards + badge)
 * on the AREA-SCOPED discover path — not just the URL. Covers AC1 (interactive),
 * AC2+AC4 (dismiss chip), AC3 (cold-load), AC5 (empty result), AC6 (auth parity),
 * and AC8 (top-level guard — q ignored when no area/school selected).
 *
 * Endpoint under test: /api/discover/cities/{city}/listings?areaKeys=<key>&q=<term>
 * This endpoint is PUBLIC (skipAuth) — anon and auth behave identically.
 *
 * Stubs: all API endpoints are intercepted — no live backend required (deterministic).
 *
 * Run locally:
 *   bash scripts/run-e2e-local.sh --project=full e2e/discover-area-keyword-search.spec.ts
 */

import { test, expect, type Page, type Route, type Request } from '@playwright/test';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MOCK_CITY = 'udupi';
const MOCK_AREA_KEY = 'IN|KA|Udupi|Manipal';
const MOCK_AREA_KEY_ENCODED = encodeURIComponent(MOCK_AREA_KEY);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TRENDS_OPTIONS_FIXTURE = {
  city: MOCK_CITY,
  defaultAreas: [{ areaKey: MOCK_AREA_KEY, areaLabel: 'Manipal' }],
};

/** Single Manipal area — shape matches DiscoverAreasResponse */
const MOCK_AREAS_RESPONSE = {
  city: MOCK_CITY,
  areas: [
    {
      areaKey: MOCK_AREA_KEY,
      name: 'Manipal',
      geoCenterLat: 13.3525,
      geoCenterLon: 74.7925,
      bbox: [
        [13.32, 74.76],
        [13.38, 74.82],
      ],
      listingCount: 3,
      schoolCount: 3,
      trendDirection: 'stable',
      minLat: 13.32,
      minLon: 74.76,
      maxLat: 13.38,
      maxLon: 74.82,
    },
  ],
};

/**
 * Shape matches DiscoverCityListingsResponse — areas[].areaKey MUST equal the selected
 * area key or areaListings is [] and card assertions silently fail.
 * UNFILTERED: 3 listings (2 villas + 1 apartment).
 */
const UNFILTERED_AREA_LISTINGS = {
  city: MOCK_CITY,
  limitPerArea: 5,
  areas: [
    {
      areaKey: MOCK_AREA_KEY,
      areaName: 'Manipal',
      listings: [
        {
          id: 'lst-villa-1',
          listingNumber: '3001',
          propertyType: 'house',
          title: 'Villa in Manipal',
          locality: 'Manipal',
          areaKey: MOCK_AREA_KEY,
          pricePaise: 800_000 * 100,
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
          listingNumber: '3002',
          propertyType: 'house',
          title: 'Independent Villa, Manipal',
          locality: 'Manipal',
          areaKey: MOCK_AREA_KEY,
          pricePaise: 950_000 * 100,
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
        {
          id: 'lst-apt-1',
          listingNumber: '3003',
          propertyType: 'apartment',
          title: 'Spacious Apartment, Manipal',
          locality: 'Manipal',
          areaKey: MOCK_AREA_KEY,
          pricePaise: 500_000 * 100,
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
    },
  ],
};

/** FILTERED: 2 villa listings — the q='villa' subset. */
const FILTERED_AREA_LISTINGS = {
  city: MOCK_CITY,
  limitPerArea: 5,
  areas: [
    {
      areaKey: MOCK_AREA_KEY,
      areaName: 'Manipal',
      listings: UNFILTERED_AREA_LISTINGS.areas[0].listings.slice(0, 2),
    },
  ],
};

/** EMPTY: area present but no listings match the search term. */
const EMPTY_AREA_LISTINGS = {
  city: MOCK_CITY,
  limitPerArea: 5,
  areas: [
    {
      areaKey: MOCK_AREA_KEY,
      areaName: 'Manipal',
      listings: [],
    },
  ],
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

/**
 * Stubs all endpoints that are always called on the /discover page but are
 * not the subject of a given test.
 */
async function stubCommonEndpoints(page: Page): Promise<void> {
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/trends/options**', (route) =>
    fulfillJson(route, 200, TRENDS_OPTIONS_FIXTURE),
  );
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/discover/areas**', (route) =>
    fulfillJson(route, 200, MOCK_AREAS_RESPONSE),
  );
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/discover/area-groups**', (route) =>
    fulfillJson(route, 200, { groups: [] }),
  );
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/public/schools/popular**', (route) =>
    fulfillJson(route, 200, []),
  );
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/public/schools/search**', (route) =>
    fulfillJson(route, 200, []),
  );
}

interface CityListingsCapture {
  requests: Request[];
}

/**
 * Stubs /api/discover/cities/{city}/listings to return different fixtures depending
 * on whether a `q` parameter is present in the request URL.
 *
 * - Requests with `q=`    → FILTERED_AREA_LISTINGS  (2 villa listings)
 * - Requests without `q=` → UNFILTERED_AREA_LISTINGS (3 listings)
 *
 * All captured requests are stored in the returned array for API-contract assertions.
 */
async function stubCityListingsWithQRouting(page: Page): Promise<CityListingsCapture> {
  const capture: CityListingsCapture = { requests: [] };
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/discover/cities/*/listings**', (route) => {
    const req = route.request();
    capture.requests.push(req);
    const url = req.url();
    const fixture = url.includes('q=') ? FILTERED_AREA_LISTINGS : UNFILTERED_AREA_LISTINGS;
    return fulfillJson(route, 200, fixture);
  });
  return capture;
}

/**
 * Variant of stubCityListingsWithQRouting that always returns EMPTY_AREA_LISTINGS.
 * Used for the T4 empty-result test.
 */
async function stubCityListingsEmpty(page: Page): Promise<CityListingsCapture> {
  const capture: CityListingsCapture = { requests: [] };
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/discover/cities/*/listings**', (route) => {
    const req = route.request();
    capture.requests.push(req);
    return fulfillJson(route, 200, EMPTY_AREA_LISTINGS);
  });
  return capture;
}

/**
 * Extract the numeric value displayed in the discover-badge.
 * Returns null if the badge is not present or has no digits.
 */
async function getBadgeCount(page: Page): Promise<number | null> {
  const badge = page.getByTestId('discover-badge');
  const visible = await badge.isVisible();
  if (!visible) return null;
  const text = await badge.textContent();
  const match = text?.replace(/,/g, '').match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
}

// ---------------------------------------------------------------------------
// T1–T5: Anonymous tests (no auth required — endpoint is PUBLIC/skipAuth)
// ---------------------------------------------------------------------------

test.describe('@integration-ui Area keyword search (q) — issue #1188 [anon]', () => {
  // T1 — AC3: Cold-load with areaKey + q in URL
  test('T1 (AC3): cold-load area + q=villa sends areaKeys+q in one request, renders filtered cards and badge', async ({
    page,
  }) => {
    await stubCommonEndpoints(page);
    const capture = await stubCityListingsWithQRouting(page);

    await page.goto(
      `/discover?city=${MOCK_CITY}&areaKey=${MOCK_AREA_KEY_ENCODED}&q=villa`,
    );
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 10_000 });

    // ── Chip assertions ────────────────────────────────────────────────────
    // search chip visible and labelled with the keyword
    const searchChip = page.getByTestId('chip-search');
    await expect(searchChip).toBeVisible({ timeout: 10_000 });
    await expect(searchChip).toContainText('villa');

    // area chip visible (context preserved)
    await expect(page.getByTestId('chip-area')).toBeVisible({ timeout: 8_000 });

    // area-search-input reflects the current query
    const searchInput = page.getByTestId('area-search-input');
    await expect(searchInput).toBeVisible({ timeout: 8_000 });
    await expect(searchInput).toHaveValue('villa');

    // ── API contract assertion ─────────────────────────────────────────────
    // A single request must carry BOTH areaKeys= (Manipal key, URL-encoded) AND q=villa.
    // This prevents a split-pass false positive where params arrive in separate requests.
    await expect
      .poll(
        () =>
          capture.requests.some(
            (r) =>
              r.url().includes('areaKeys=') &&
              r.url().includes('q=villa'),
          ),
        { timeout: 12_000 },
      )
      .toBe(true);

    // ── Listing cards (filtered response: 2 villas) ────────────────────────
    await expect(page.getByText('Villa in Manipal')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText('Independent Villa, Manipal')).toBeVisible({ timeout: 8_000 });
    // Apartment must NOT appear (filtered out by q=villa)
    await expect(page.getByText('Spacious Apartment, Manipal')).not.toBeVisible({ timeout: 5_000 });

    // ── Badge / card count consistency ────────────────────────────────────
    // FILTERED_AREA_LISTINGS has 2 items — badge must show 2.
    const badge = page.getByTestId('discover-badge');
    await expect(badge).toBeVisible({ timeout: 8_000 });
    await expect
      .poll(() => getBadgeCount(page), { timeout: 8_000 })
      .toBe(2);
  });

  // T2 — AC1: Interactive type into area-search-input narrows cards + badge
  test('T2 (AC1): typing villa into area-search-input triggers filtered request, narrows cards, updates badge', async ({
    page,
  }) => {
    await stubCommonEndpoints(page);
    const capture = await stubCityListingsWithQRouting(page);

    // Start with area selected but NO q
    await page.goto(
      `/discover?city=${MOCK_CITY}&areaKey=${MOCK_AREA_KEY_ENCODED}`,
    );
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 10_000 });

    // Wait for unfiltered state to settle (all 3 cards present)
    await expect(page.getByText('Spacious Apartment, Manipal')).toBeVisible({ timeout: 12_000 });

    // ── Type into search input ─────────────────────────────────────────────
    const searchInput = page.getByTestId('area-search-input');
    await expect(searchInput).toBeVisible({ timeout: 8_000 });
    await searchInput.fill('villa');

    // ── API contract: poll for debounced q=villa request ──────────────────
    // Debounce is ~300ms; use generous timeout to absorb variation.
    await expect
      .poll(
        () =>
          capture.requests.some(
            (r) =>
              r.url().includes('areaKeys=') &&
              r.url().includes('q=villa'),
          ),
        { timeout: 15_000 },
      )
      .toBe(true);

    // ── Chip appears with keyword ──────────────────────────────────────────
    const searchChip = page.getByTestId('chip-search');
    await expect(searchChip).toBeVisible({ timeout: 8_000 });
    await expect(searchChip).toContainText('villa');

    // ── Cards narrow to 2 ─────────────────────────────────────────────────
    await expect(page.getByText('Villa in Manipal')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText('Independent Villa, Manipal')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText('Spacious Apartment, Manipal')).not.toBeVisible({ timeout: 5_000 });

    // ── Badge consistency: badge === rendered card count (2) ──────────────
    await expect
      .poll(() => getBadgeCount(page), { timeout: 8_000 })
      .toBe(2);
  });

  // T3 — AC2+AC4: Dismiss chip removes q, URL keeps areaKey, cards widen, badge grows
  test('T3 (AC2+AC4): dismissing chip-search clears q from URL, refetches without q, shows unfiltered cards, badge grows', async ({
    page,
  }) => {
    await stubCommonEndpoints(page);
    const capture = await stubCityListingsWithQRouting(page);

    // Cold-load with area + q
    await page.goto(
      `/discover?city=${MOCK_CITY}&areaKey=${MOCK_AREA_KEY_ENCODED}&q=villa`,
    );
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 10_000 });

    // Wait for filtered state to settle
    const searchChip = page.getByTestId('chip-search');
    await expect(searchChip).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Villa in Manipal')).toBeVisible({ timeout: 10_000 });

    // Snapshot request count AFTER filtered state has settled — ensures the
    // "refetch without q" poll only considers requests fired AFTER the dismiss.
    const preDismissCount = capture.requests.length;

    // ── Dismiss the search chip ────────────────────────────────────────────
    await page.getByTestId('chip-search-dismiss').click();

    // chip-search disappears
    await expect(searchChip).not.toBeVisible({ timeout: 5_000 });

    // q removed from URL
    await expect(page).not.toHaveURL(/[?&]q=/, { timeout: 5_000 });

    // areaKey still present in URL (area context preserved)
    await expect(page).toHaveURL(new RegExp('areaKey='));

    // area-search-input cleared
    const searchInput = page.getByTestId('area-search-input');
    await expect(searchInput).toHaveValue('', { timeout: 5_000 });

    // ── API contract: a refetch must arrive WITHOUT q ──────────────────────
    // Only consider requests added after the dismiss click (preDismissCount
    // snapshot prevents old pre-dismiss requests from satisfying this poll).
    await expect
      .poll(
        () =>
          capture.requests
            .slice(preDismissCount)
            .some((r) => r.url().includes('areaKeys=') && !r.url().includes('q=')),
        { timeout: 12_000 },
      )
      .toBe(true);

    // ── Unfiltered cards (3 items) ─────────────────────────────────────────
    await expect(page.getByText('Spacious Apartment, Manipal')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText('Villa in Manipal')).toBeVisible({ timeout: 8_000 });

    // ── Badge consistency: badge grows to 3 ───────────────────────────────
    await expect
      .poll(() => getBadgeCount(page), { timeout: 8_000 })
      .toBe(3);
  });

  // T4 — AC5: Empty result — badge shows 0, empty-state text visible, chip preserved
  test('T4 (AC5): q that matches nothing shows empty-state text, badge=0, chip-search stays visible', async ({
    page,
  }) => {
    await stubCommonEndpoints(page);
    // This stub always returns empty listings regardless of q
    await stubCityListingsEmpty(page);

    await page.goto(
      `/discover?city=${MOCK_CITY}&areaKey=${MOCK_AREA_KEY_ENCODED}&q=zzznomatch`,
    );
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 10_000 });

    // search chip remains visible — q is still active
    const searchChip = page.getByTestId('chip-search');
    await expect(searchChip).toBeVisible({ timeout: 10_000 });

    // Empty-state text must appear
    await expect(
      page.getByText('No listings match this search'),
    ).toBeVisible({ timeout: 10_000 });

    // No property cards rendered (EMPTY_AREA_LISTINGS has 0 listings)
    await expect(page.getByText('Villa in Manipal')).not.toBeVisible();
    await expect(page.getByText('Spacious Apartment, Manipal')).not.toBeVisible();

    // Badge stays visible and shows 0 (confirmed: badge persists with 0 in empty state)
    const badge = page.getByTestId('discover-badge');
    await expect(badge).toBeVisible({ timeout: 8_000 });
    await expect
      .poll(() => getBadgeCount(page), { timeout: 8_000 })
      .toBe(0);
  });

  // T5 — AC8: Top-level guard — q without areaKey/schoolId must NOT render chip or fire q-bearing request
  test('T5 (AC8): q in URL without areaKey/schoolId does not render chip-search and no city-listings q request fires', async ({
    page,
  }) => {
    await stubCommonEndpoints(page);
    const capture: { requests: Request[] } = { requests: [] };
    // INTEGRATION-UI: stub justified — isolate from backend variability
    await page.route('**/api/discover/cities/*/listings**', (route) => {
      capture.requests.push(route.request());
      return fulfillJson(route, 200, UNFILTERED_AREA_LISTINGS);
    });

    // No areaKey, no schoolId — q=villa is in the URL but must be ignored
    await page.goto(`/discover?city=${MOCK_CITY}&q=villa`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 10_000 });

    // chip-search must NOT be rendered (gate: searchTerm !== '' && (hasArea || hasSchool))
    await expect(page.getByTestId('chip-search')).not.toBeVisible({ timeout: 5_000 });

    // area-search-input also absent when no area is selected
    await expect(page.getByTestId('area-search-input')).not.toBeVisible({ timeout: 5_000 });

    // q=villa remains in the URL (not stripped by the app)
    await expect(page).toHaveURL(/[?&]q=villa/);

    // Allow a brief settle window, then assert no q-bearing city-listings request fired.
    // The area query is disabled when areaKeys is empty.
    await page.waitForTimeout(2_000);
    const qRequests = capture.requests.filter((r) => r.url().includes('q='));
    expect(qRequests.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// T6: Auth parity — confirm identical behaviour under authenticated session
// ---------------------------------------------------------------------------

test.describe('@integration-ui Area keyword search (q) — issue #1188 [auth parity]', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  test('T6 (AC6): auth cold-load area + q=villa behaves identically to anon — chip, request, cards, badge', async ({
    page,
  }) => {
    await stubCommonEndpoints(page);
    // Auth path fires /api/discover/markers — stub to prevent hanging requests
    // (mirrors discover-school-keyword-radius.spec.ts lines ~207-225)
    // INTEGRATION-UI: stub justified — isolate from backend variability
    await page.route('**/api/discover/markers**', (route) =>
      fulfillJson(route, 200, []),
    );
    const capture = await stubCityListingsWithQRouting(page);

    await page.goto(
      `/discover?city=${MOCK_CITY}&areaKey=${MOCK_AREA_KEY_ENCODED}&q=villa`,
    );
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 10_000 });

    // ── Chip assertions (same as T1) ───────────────────────────────────────
    const searchChip = page.getByTestId('chip-search');
    await expect(searchChip).toBeVisible({ timeout: 10_000 });
    await expect(searchChip).toContainText('villa');

    await expect(page.getByTestId('chip-area')).toBeVisible({ timeout: 8_000 });

    const searchInput = page.getByTestId('area-search-input');
    await expect(searchInput).toBeVisible({ timeout: 8_000 });
    await expect(searchInput).toHaveValue('villa');

    // ── API contract (same as T1) ──────────────────────────────────────────
    await expect
      .poll(
        () =>
          capture.requests.some(
            (r) =>
              r.url().includes('areaKeys=') &&
              r.url().includes('q=villa'),
          ),
        { timeout: 12_000 },
      )
      .toBe(true);

    // ── Listing cards and badge (same as T1) ──────────────────────────────
    await expect(page.getByText('Villa in Manipal')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText('Independent Villa, Manipal')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText('Spacious Apartment, Manipal')).not.toBeVisible();

    const badge = page.getByTestId('discover-badge');
    await expect(badge).toBeVisible({ timeout: 8_000 });
    await expect
      .poll(() => getBadgeCount(page), { timeout: 8_000 })
      .toBe(2);
  });
});
