/**
 * Popular Schools — E2E coverage for issue #968 (Figma-polish re-point).
 *
 * ── Surface change ──────────────────────────────────────────────────────────
 * Originally this suite drove the "Popular schools" grid inside the NearSchoolSheet
 * popup, opened by the on-map "Near a school" button. The Figma Discover polish
 * removed that button, so the popup surface is unreachable from the product UI.
 *
 * The popular-schools FLOW is NOT gone — it now lives in SchoolBrowsePanel, the
 * school-first journey landing reached via the "Search by school area" journey card
 * (journey-card-school-first / journey=school-first). SchoolBrowsePanel renders a
 * "Popular schools" heading + SchoolCard list; clicking a card calls setSchoolJourney
 * (writes schoolId + radiusKm to the URL). This suite is re-pointed (Option A) at
 * that supported surface.
 *
 * Surface under test now:
 *   1. User enters school-first via the journey card → SchoolBrowsePanel
 *   2. GET /api/public/schools/popular populates the "Popular schools" list
 *   3. SchoolCards render name + board + address, with NO listing-count badge
 *      (the #968 product constraint — SchoolCard never renders a count)
 *   4. Clicking a card writes schoolId (+ radiusKm) to the URL (filter applied)
 *
 * Coverage intentionally NOT reproduced here (popup-only, no supported product path):
 *   - In-popup "Filter by area" dropdown that narrowed results WITHOUT writing the
 *     URL: SchoolBrowsePanel's area/zone browse writes areaKey by design, so there is
 *     no local-only narrowing control to assert.
 *   - In-popup card aria-pressed selection + close/reopen-preserves-selection: the
 *     modern flow writes selection to the URL (schoolId) instead of in-popup state.
 *   - Empty-state "No popular schools found near {city}" copy: SchoolBrowsePanel
 *     renders nothing when popular results are empty (no dedicated empty copy).
 *   - Popular-schools error + Retry: covered for this surface by
 *     e2e/discover/school-panel-error-states.spec.ts (ERR-1, popular-schools-error-state).
 * The NearSchoolSheet / PopularSchoolCard components remain unit-tested
 * (src/components/map/__tests__/{PopularSchoolCard,NearSchoolSheet}.test.tsx).
 *
 * No auth required — discover schools popular endpoint is public (skipAuth).
 *
 * Run locally:
 *   bash scripts/run-e2e-local.sh --project=full e2e/popular-schools.spec.ts
 */

import { test, expect, type Page, type Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const POPULAR_SCHOOLS_FIXTURE = [
  {
    id: 'sch-1',
    name: 'Manipal Public School',
    board: 'CBSE',
    boardType: null,
    address: 'Manipal, Udupi',
    latitude: 13.3525,
    longitude: 74.7864,
    distanceKm: 1.2,
    // #968: a count is present in the payload but must NOT be rendered on the card.
    nearbyListingCount: 7,
  },
  {
    id: 'sch-2',
    name: 'Sharada Vidyalaya',
    board: 'ICSE',
    boardType: null,
    address: 'Kadiyali, Udupi',
    latitude: 13.3409,
    longitude: 74.7421,
    distanceKm: 2.4,
    nearbyListingCount: 3,
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
    nearbyListingCount: 0,
  },
];

const SHARADA_SCHOOL = POPULAR_SCHOOLS_FIXTURE[1];

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
      schoolCount: 4,
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** JSON-fulfill helper preserving content-type. */
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
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/discover/areas**', (route) =>
    fulfillJson(route, 200, DISCOVER_AREAS_UDUPI),
  );
}

async function stubDiscoverListings(page: Page): Promise<void> {
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/discover/listings**', (route) =>
    fulfillJson(route, 200, EMPTY_LISTINGS_PAGE),
  );
}

async function stubPopularSchools(page: Page, schools: unknown[] = POPULAR_SCHOOLS_FIXTURE): Promise<void> {
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/public/schools/popular**', (route) =>
    fulfillJson(route, 200, schools),
  );
}

/** Cold-load schoolId restoration uses GET /api/public/schools/{id}. */
async function stubSchoolByIdLookup(page: Page, school: { id: string }): Promise<void> {
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route(`**/api/public/schools/${school.id}**`, (route) =>
    fulfillJson(route, 200, school),
  );
}

/**
 * Enter the school-first journey via the supported "Search by school area"
 * journey card and wait for SchoolBrowsePanel's Popular schools list.
 */
async function openSchoolBrowseViaCard(page: Page): Promise<void> {
  await page.goto('/discover?city=udupi');
  await page.waitForLoadState('domcontentloaded');

  const card = page.getByTestId('journey-card-school-first');
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.click();
  await expect(page).toHaveURL(/journey=school-first/, { timeout: 8_000 });

  await expect(
    page.getByRole('heading', { name: /popular schools/i }),
  ).toBeVisible({ timeout: 15_000 });
}

function getUrlParam(page: Page, key: string): string | null {
  return new URL(page.url()).searchParams.get(key);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('@journey Popular schools in school-first browse (#968)', () => {
  test('cards render name + board + address with no listing-count badge', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubDiscoverListings(page);
    await stubPopularSchools(page);

    await openSchoolBrowseViaCard(page);

    // SchoolCard exposes its content as the button's accessible name. There is one
    // popular card per fixture school; locate the first by its name.
    const firstCard = page.getByRole('button', { name: /Manipal Public School/ });
    await expect(firstCard).toBeVisible({ timeout: 10_000 });
    await expect(firstCard).toContainText('Manipal Public School');
    await expect(firstCard).toContainText('CBSE');
    await expect(firstCard).toContainText('Manipal, Udupi');

    // #968 constraint: the card must NOT render a nearby-listing count, even though
    // the payload carries one (nearbyListingCount: 7).
    await expect(firstCard.getByText(/\d+\s+listings?/i)).toHaveCount(0);
    await expect(firstCard.getByText(/\b7\b/)).toHaveCount(0);
    await expect(firstCard.locator('[data-testid="nearby-listing-count"]')).toHaveCount(0);
  });

  test('clicking a popular school card writes schoolId + radiusKm to the URL', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubDiscoverListings(page);
    await stubPopularSchools(page);
    await stubSchoolByIdLookup(page, SHARADA_SCHOOL);

    await openSchoolBrowseViaCard(page);

    // Pick the second card so we assert "this specific school" was selected.
    await page.getByRole('button', { name: /Sharada Vidyalaya/ }).click();

    // setSchoolJourney writes schoolId + radiusKm (DEFAULT_SCHOOL_RADIUS_KM = 3).
    await expect.poll(() => getUrlParam(page, 'schoolId'), { timeout: 8_000 }).toBe(SHARADA_SCHOOL.id);
    expect(getUrlParam(page, 'radiusKm')).toBe('3');
  });
});
