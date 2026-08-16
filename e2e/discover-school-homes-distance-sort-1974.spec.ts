/**
 * E2E: school-radius homes list sorted ascending by distance — Issue #1974.
 *
 * Surface under test: the ANONYMOUS school-first journey's SchoolSelectedPanel,
 * whose right-panel card list is built from
 *   GET /api/discover/cities/{city}/school-radius-listings
 * and is now sorted client-side via sortByDistanceKmAscending() (src/lib/geo.ts)
 * before rendering.
 *
 * Why E2E (cross-layer): unit/component coverage (geo.test.ts,
 * SchoolJourneyPanels.test.tsx) already proves the sort helper and the panel's
 * useMemo wiring in isolation. This spec proves the same behaviour survives the
 * real DOM render path — the endpoint response is fed through routing, React
 * Query, the panel component, and PropertyCard — end to end. The endpoint is
 * route-stubbed (server order deliberately NOT sorted) so the scenario is
 * deterministic; only the UI-level reordering + no-coordinate placement is
 * under test.
 *
 * This file is deliberately self-contained: it duplicates the minimal stub
 * helpers/fixtures from e2e/discover-anon-school-radius.spec.ts (which does not
 * export anything reusable) rather than editing that file.
 *
 * Test IDs:
 *   E2E-SORT-1974-1  ASCENDING ORDER: rendered listing-card sequence's distance
 *                     badges form a non-decreasing sequence, proving the UI
 *                     reorders the (deliberately out-of-order) stubbed response
 *                     rather than coincidentally matching server order.
 *   E2E-SORT-1974-2  NO-COORDINATE LAST: a card with null lat/lon renders last
 *                     in DOM order and carries no distance-badge, while the
 *                     coordinate-bearing cards do.
 *
 * Run locally:
 *   bash scripts/run-e2e-local.sh --project=full e2e/discover-school-homes-distance-sort-1974.spec.ts
 */

import { test, expect, type Page, type Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// Force anonymous context: no storageState (no Authorization token sent).
// ---------------------------------------------------------------------------

test.use({ storageState: undefined });

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MANIPAL_AREA_KEY = 'IN|KA|Udupi|Manipal';

// School the URL ?schoolId= resolves to. /api/public/schools/{id} is public;
// once it resolves, the restore effect writes schoolLat/schoolLon into filters,
// which enables the anon /school-radius-listings query.
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
      areaKey: MANIPAL_AREA_KEY,
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
  defaultAreas: [{ areaKey: MANIPAL_AREA_KEY, areaLabel: 'Manipal' }],
};

const EMPTY_CITY_LISTINGS = {
  areas: [{ areaKey: MANIPAL_AREA_KEY, listings: [] }],
};

function baseCard(over: Partial<Record<string, unknown>>) {
  return {
    id: 'sr-base',
    listingNumber: 9000,
    propertyType: 'house',
    title: 'Base Listing',
    locality: 'Manipal',
    areaKey: MANIPAL_AREA_KEY,
    pricePaise: 5_000_000,
    landArea: null,
    landAreaUnit: null,
    builtArea: 1200,
    builtAreaUnit: 'sqft',
    bedrooms: 3,
    latitude: 13.353,
    longitude: 74.787,
    heroImageUrl: null,
    listingPurpose: 'sale',
    possessionStatus: 'ready_to_move',
    daysOnMarket: 4,
    backOnMarket: false,
    createdAt: '2026-05-01T00:00:00Z',
    ...over,
  };
}

// Three cards at deliberately out-of-server-order distances from
// MANIPAL_SCHOOL (13.3525, 74.7864): FAR is listed first, NEAR second, MID
// third — the server response order is intentionally NOT sorted, so a passing
// ascending-order assertion proves the UI reorders rather than coincidentally
// matching stub order.
const CARD_FAR = baseCard({
  id: 'sr-far',
  title: 'Far From School House',
  latitude: 13.39, // ~4.4km north of the school
  longitude: 74.7864,
});
const CARD_NEAR = baseCard({
  id: 'sr-near',
  title: 'Near The School House',
  latitude: 13.36, // ~0.8km north of the school
  longitude: 74.7864,
});
const CARD_MID = baseCard({
  id: 'sr-mid',
  title: 'Mid Distance House',
  latitude: 13.375, // ~2.5km north of the school
  longitude: 74.7864,
});

// No-coordinate-last fixture: two coordinate-bearing cards + one with null
// lat/lon, deliberately placed FIRST in server order so a passing "renders
// last" assertion proves the UI, not the stub, controls placement.
const CARD_NO_COORDS = baseCard({
  id: 'sr-no-coords',
  title: 'No Coordinates House',
  latitude: null,
  longitude: null,
});
const CARD_WITH_COORDS_A = baseCard({
  id: 'sr-coords-a',
  title: 'Coordinate Bearing House A',
  latitude: 13.36,
  longitude: 74.7864,
});
const CARD_WITH_COORDS_B = baseCard({
  id: 'sr-coords-b',
  title: 'Coordinate Bearing House B',
  latitude: 13.39,
  longitude: 74.7864,
});

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
  // School-by-id (public) — resolves the URL ?schoolId=, populating school coords.
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route(`**/api/public/schools/${MANIPAL_SCHOOL.id}**`, (route) =>
    fulfillJson(route, 200, MANIPAL_SCHOOL),
  );
  // Area-scoped public browse — kept empty so it cannot be the listing source.
  // The school-radius endpoint is stubbed separately per-test and registered
  // AFTER this route so it wins (Playwright matches most-recently-registered
  // first).
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/discover/cities/*/listings**', (route) =>
    fulfillJson(route, 200, EMPTY_CITY_LISTINGS),
  );
}

// Stub the public school-radius endpoint with a fixed, deliberately-unsorted
// server response (the ordering under test is entirely client-side).
async function stubSchoolRadiusListings(page: Page, content: unknown[]): Promise<void> {
  // INTEGRATION-UI: stub justified — exercises the sort-on-render contract (#1974)
  await page.route('**/api/discover/cities/*/school-radius-listings**', (route) =>
    fulfillJson(route, 200, { content, page: 0, size: 50, hasMore: false }),
  );
}

// SchoolSelectedPanel is confirmed mounted when its radius selector is visible.
async function waitForSchoolPanel(page: Page): Promise<void> {
  await expect(page.getByTestId('radius-btn-3')).toBeVisible({ timeout: 15_000 });
}

const SCHOOL_FIRST_URL =
  '/discover?city=udupi&journey=school-first&schoolId=sch-1&radiusKm=3';

// Parses "1.6 km from school" -> 1.6
function parseBadgeDistanceKm(text: string | null): number {
  const match = text?.match(/([\d.]+)\s*km/);
  if (!match) throw new Error(`could not parse distance from badge text: ${text}`);
  return Number(match[1]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('@integration-ui school-radius homes ascending distance sort (#1974)', () => {
  /**
   * E2E-SORT-1974-1 — ASCENDING ORDER: the rendered listing-card sequence's
   * distance badges form a non-decreasing sequence, even though the stubbed
   * server response is in FAR, NEAR, MID order (not sorted).
   *
   * Business meaning: if the client-side sort regressed (e.g. removed, or
   * applied to the wrong data), cards would render in raw server order and
   * this monotonic-sequence assertion would fail.
   */
  test('E2E-SORT-1974-1: rendered card distances are non-decreasing (ascending)', async ({ page }) => {
    await stubCommonEndpoints(page);
    // Deliberately unsorted server order: FAR, NEAR, MID.
    await stubSchoolRadiusListings(page, [CARD_FAR, CARD_NEAR, CARD_MID]);

    await page.goto(SCHOOL_FIRST_URL);
    await waitForSchoolPanel(page);

    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel).toBeVisible({ timeout: 15_000 });

    // All three cards must be present before reading order.
    await expect(rightPanel.locator('[data-testid="listing-card"]')).toHaveCount(3, {
      timeout: 15_000,
    });

    const badges = rightPanel.locator('[data-testid="distance-badge"]');
    await expect(badges).toHaveCount(3);

    const badgeTexts = await badges.allTextContents();
    const distances = badgeTexts.map(parseBadgeDistanceKm);

    // Genuine non-decreasing-sequence assertion across all three cards, built
    // from the ACTUAL rendered badge text (not a hardcoded expectation).
    for (let i = 1; i < distances.length; i++) {
      expect(
        distances[i],
        `card ${i} distance (${distances[i]}km) must be >= card ${i - 1} distance (${distances[i - 1]}km); full sequence: ${JSON.stringify(distances)}`,
      ).toBeGreaterThanOrEqual(distances[i - 1]);
    }
  });

  /**
   * E2E-SORT-1974-2 — NO-COORDINATE LAST: a card with null lat/lon renders
   * last in DOM order and carries no distance-badge, while the coordinate-
   * bearing cards do carry one. Stubbed server order deliberately places the
   * no-coordinate card FIRST, so a passing "renders last" assertion proves
   * the client-side stability rule (non-finite distances sort last), not
   * coincidental stub order.
   */
  test('E2E-SORT-1974-2: no-coordinate card renders last with no distance badge', async ({ page }) => {
    await stubCommonEndpoints(page);
    // Deliberately places the no-coordinate card FIRST in server order.
    await stubSchoolRadiusListings(page, [
      CARD_NO_COORDS,
      CARD_WITH_COORDS_A,
      CARD_WITH_COORDS_B,
    ]);

    await page.goto(SCHOOL_FIRST_URL);
    await waitForSchoolPanel(page);

    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel).toBeVisible({ timeout: 15_000 });

    const cards = rightPanel.locator('[data-testid="listing-card"]');
    await expect(cards).toHaveCount(3, { timeout: 15_000 });

    // No-coordinate card is LAST in DOM order.
    const lastCard = cards.last();
    await expect(lastCard.locator('h3')).toHaveText('No Coordinates House');
    await expect(lastCard.locator('[data-testid="distance-badge"]')).toHaveCount(0);

    // The other two (coordinate-bearing) cards DO have a distance badge.
    const firstCard = cards.nth(0);
    const secondCard = cards.nth(1);
    await expect(firstCard.locator('[data-testid="distance-badge"]')).toHaveCount(1);
    await expect(secondCard.locator('[data-testid="distance-badge"]')).toHaveCount(1);
  });
});
