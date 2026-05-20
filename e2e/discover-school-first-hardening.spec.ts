/**
 * E2E: school-first journey hardening — Issue #1132.
 *
 * Fills coverage gaps identified in qa-fast audit:
 *   AC10 — board/category chips visible in ActiveContextChips when params in URL
 *   AC2  — board + city + area URL combination
 *   AC3  — in-page Back vs browser Back distinction
 *
 * Tests IDs:
 *   E2E-HRD-1  board filter chip visible in ActiveContextChips when board param in URL
 *   E2E-HRD-2  category filter chip visible in ActiveContextChips when category param in URL
 *   E2E-HRD-3  board + category chips both visible when both filters active
 *   E2E-HRD-4  dismissing board chip in ActiveContextChips removes board param from URL
 *   E2E-HRD-5  board filter persists through area→school→clear-school cycle
 *   E2E-HRD-6  cold-load with board+category deeplink renders chips active on first paint
 *   E2E-HRD-7  Start Over clears board+category filters alongside journey state
 *
 * ActiveContextChips.tsx is fully implemented with board/category chip rendering.
 * The following data-testids are produced by the component:
 *   - data-testid="active-chip-board-{boardName}"  (lowercase board value)
 *   - data-testid="active-chip-category-{categoryName}"  (lowercase category value)
 *   - data-testid="active-chip-board-{boardName}-dismiss"  (dismiss/close button inside chip)
 *   - data-testid="active-chip-category-{categoryName}-dismiss"  (dismiss/close button inside chip)
 * All chips are rendered when the corresponding URL params are set.
 *
 * Anonymous flow throughout — all endpoints used are public.
 *
 * Run locally:
 *   bash scripts/run-e2e-local.sh --project=full e2e/discover-school-first-hardening.spec.ts
 */

import { test, expect, type Page, type Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// Constants & fixtures
// ---------------------------------------------------------------------------

const MANIPAL_AREA_KEY = 'IN|KA|Udupi|Manipal';
const ENCODED_AREA_KEY = encodeURIComponent(MANIPAL_AREA_KEY);

const DISCOVER_AREAS_UDUPI = {
  city: 'udupi',
  areas: [
    {
      areaKey: MANIPAL_AREA_KEY,
      name: 'Manipal',
      geoCenterLat: 13.3525,
      geoCenterLon: 74.7864,
      listingCount90d: 5,
      schoolCount: 2,
      trendDirection: 'stable',
    },
  ],
};

const POPULAR_SCHOOLS_FIXTURE = [
  {
    id: 'sch-cbse',
    name: 'Manipal CBSE Public School',
    board: 'CBSE',
    boardType: null,
    address: 'Manipal, Udupi',
    latitude: 13.3525,
    longitude: 74.7864,
    distanceKm: 1.2,
  },
];

const SCHOOLS_BY_AREA_FIXTURE = [
  {
    id: 'sch-cbse',
    name: 'Manipal CBSE Public School',
    board: 'CBSE',
    boardType: null,
    address: 'Manipal, Udupi',
    latitude: 13.3525,
    longitude: 74.7864,
    schoolCategory: 'secondary',
  },
  {
    id: 'sch-icse',
    name: 'Manipal ICSE Academy',
    board: 'ICSE',
    boardType: null,
    address: 'Manipal, Udupi',
    latitude: 13.351,
    longitude: 74.785,
    schoolCategory: 'primary',
  },
];

const CBSE_SCHOOL = SCHOOLS_BY_AREA_FIXTURE[0];

const EMPTY_LISTINGS_PAGE = {
  content: [],
  page: 0,
  size: 50,
  totalElements: 0,
  totalPages: 0,
  aggregates: { topLocalities: [] },
};

// ---------------------------------------------------------------------------
// Stub helpers
// ---------------------------------------------------------------------------

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
    fulfillJson(route, 200, { city: 'udupi', defaultAreas: [] }),
  );
}

async function stubDiscoverAreas(page: Page): Promise<void> {
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/discover/areas**', (route) =>
    fulfillJson(route, 200, DISCOVER_AREAS_UDUPI),
  );
}

async function stubPopularSchools(page: Page): Promise<void> {
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/public/schools/popular**', (route) =>
    fulfillJson(route, 200, POPULAR_SCHOOLS_FIXTURE),
  );
}

/**
 * Stubs /api/public/schools/by-area applying server-side board filtering semantics.
 * When ?board=CBSE is present, response only includes CBSE-board schools.
 */
async function stubSchoolsByArea(page: Page): Promise<void> {
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/public/schools/by-area**', (route) => {
    const requestUrl = new URL(route.request().url());
    const boards = requestUrl.searchParams.getAll('board');
    const filtered =
      boards.length === 0
        ? SCHOOLS_BY_AREA_FIXTURE
        : SCHOOLS_BY_AREA_FIXTURE.filter((s) => boards.includes(s.board));
    return fulfillJson(route, 200, filtered);
  });
}

async function stubSchoolById(page: Page, school: typeof CBSE_SCHOOL): Promise<void> {
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route(`**/api/public/schools/${school.id}`, (route) =>
    fulfillJson(route, 200, school),
  );
}

async function stubDiscoverListings(page: Page): Promise<void> {
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/discover/listings**', (route) =>
    fulfillJson(route, 200, EMPTY_LISTINGS_PAGE),
  );
}

async function stubAll(page: Page): Promise<void> {
  await stubTrendsOptions(page);
  await stubDiscoverAreas(page);
  await stubPopularSchools(page);
  await stubSchoolsByArea(page);
  await stubSchoolById(page, CBSE_SCHOOL);
  await stubDiscoverListings(page);
}

function getUrlParam(page: Page, key: string): string | null {
  return new URL(page.url()).searchParams.get(key);
}

function getUrlParams(page: Page, key: string): string[] {
  return new URL(page.url()).searchParams.getAll(key);
}

// ---------------------------------------------------------------------------
// Tests — AC10: board/category chips in ActiveContextChips
// ---------------------------------------------------------------------------

test.describe('@integration-ui school-first hardening (#1132) — ActiveContextChips', () => {

  /**
   * E2E-HRD-1: board filter chip visible in ActiveContextChips when board param in URL.
   *
   * ActiveContextChips.tsx renders a chip with data-testid="active-chip-board-cbse"
   * when ?board=CBSE is present in the URL.
   */
  test('E2E-HRD-1: board filter chip visible in ActiveContextChips when board param in URL', async ({ page }) => {
    await stubAll(page);

    await page.goto(
      `/discover?city=udupi&journey=school-first&areaKey=${ENCODED_AREA_KEY}&board=CBSE`,
    );
    await page.waitForLoadState('domcontentloaded');

    // Board chip must be visible in the ActiveContextChips component
    const boardChip = page.getByTestId('active-chip-board-cbse');
    await expect(boardChip).toBeVisible({ timeout: 15_000 });
  });

  /**
   * E2E-HRD-2: category filter chip visible in ActiveContextChips when category param in URL.
   *
   * ActiveContextChips.tsx renders a chip with data-testid="active-chip-category-secondary"
   * when ?category=secondary is present in the URL.
   */
  test('E2E-HRD-2: category filter chip visible in ActiveContextChips when category param in URL', async ({ page }) => {
    await stubAll(page);

    await page.goto(
      `/discover?city=udupi&journey=school-first&areaKey=${ENCODED_AREA_KEY}&category=secondary`,
    );
    await page.waitForLoadState('domcontentloaded');

    const categoryChip = page.getByTestId('active-chip-category-secondary');
    await expect(categoryChip).toBeVisible({ timeout: 15_000 });
  });

  /**
   * E2E-HRD-3: board + category chips both visible when both filters active.
   *
   * ActiveContextChips.tsx renders both chips when both ?board=CBSE and ?category=secondary
   * are present in the URL:
   *   data-testid="active-chip-board-cbse"
   *   data-testid="active-chip-category-secondary"
   */
  test('E2E-HRD-3: board + category chips both visible when both filters active', async ({ page }) => {
    await stubAll(page);

    await page.goto(
      `/discover?city=udupi&journey=school-first&areaKey=${ENCODED_AREA_KEY}&board=CBSE&category=secondary`,
    );
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByTestId('active-chip-board-cbse')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('active-chip-category-secondary')).toBeVisible({ timeout: 5_000 });
  });

  /**
   * E2E-HRD-4: dismissing board chip in ActiveContextChips removes board param from URL.
   *
   * ActiveContextChips.tsx renders a dismiss button with data-testid="active-chip-board-cbse-dismiss"
   * inside the board chip. Clicking it removes ?board=CBSE from the URL.
   */
  test('E2E-HRD-4: dismissing board chip in ActiveContextChips removes board param from URL', async ({ page }) => {
    await stubAll(page);

    await page.goto(
      `/discover?city=udupi&journey=school-first&areaKey=${ENCODED_AREA_KEY}&board=CBSE`,
    );
    await page.waitForLoadState('domcontentloaded');

    // Click the dismiss/close button on the board chip
    const dismissBtn = page.getByTestId('active-chip-board-cbse-dismiss');
    await expect(dismissBtn).toBeVisible({ timeout: 15_000 });
    await dismissBtn.click();

    // board param must be removed from URL
    await expect
      .poll(() => getUrlParams(page, 'board'), { timeout: 8_000 })
      .toEqual([]);
  });

  /**
   * E2E-HRD-6: cold-load with board+category deeplink renders chips active on first paint.
   *
   * Both chips must be visible immediately on cold-load — no user interaction required.
   * ActiveContextChips.tsx hydrates from URL params on first render.
   */
  test('E2E-HRD-6: cold-load with board+category deeplink renders chips active on first paint', async ({ page }) => {
    await stubAll(page);

    await page.goto(
      `/discover?city=udupi&journey=school-first&areaKey=${ENCODED_AREA_KEY}&board=CBSE&category=secondary`,
    );
    await page.waitForLoadState('domcontentloaded');

    // Both chips must be present without any user interaction (cold-load hydration)
    await expect(page.getByTestId('active-chip-board-cbse')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('active-chip-category-secondary')).toBeVisible({ timeout: 5_000 });

    // URL params must still be present (no spurious reset on load)
    expect(getUrlParams(page, 'board')).toEqual(['CBSE']);
    expect(getUrlParam(page, 'category')).toBe('secondary');
  });

});

// ---------------------------------------------------------------------------
// Tests — AC2/AC3: board filter persistence across state transitions
// (These tests exercise existing wiring and do NOT require ActiveContextChips)
// ---------------------------------------------------------------------------

test.describe('@integration-ui school-first hardening (#1132) — filter persistence', () => {

  /**
   * E2E-HRD-5: board filter persists through area→school→clear-school cycle.
   *
   * Contract verified: board param must survive school selection and clear-school.
   * This test does NOT require ActiveContextChips — it only asserts URL state.
   * Equivalent to AC12-C in discover-school-board-filter.spec.ts but extended
   * to verify the full area→school→clear cycle with an explicit URL check at each step.
   *
   * Step sequence:
   *   1. Cold-load: journey=school-first + areaKey + board=CBSE (area-selected state)
   *   2. Assert board=CBSE in URL
   *   3. Click CBSE school card → schoolId added to URL
   *   4. Assert board=CBSE still in URL (school selection must not strip board)
   *   5. Click clear-school chip → schoolId removed
   *   6. Assert board=CBSE still in URL (clear-school must not strip board)
   *   7. Assert areaKey still in URL (school cleared, area context preserved)
   */
  test('E2E-HRD-5: board filter persists through area→school→clear-school cycle', async ({ page }) => {
    await stubAll(page);

    // Step 1: cold-load with board=CBSE (area-selected state)
    await page.goto(
      `/discover?city=udupi&journey=school-first&areaKey=${ENCODED_AREA_KEY}&board=CBSE`,
    );
    await page.waitForLoadState('domcontentloaded');

    // Step 2: board param present on initial load
    await expect
      .poll(() => getUrlParams(page, 'board'), { timeout: 5_000 })
      .toEqual(['CBSE']);

    // Step 3: click the CBSE school card → schoolId added to URL
    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel).toBeVisible({ timeout: 15_000 });
    const cbseCard = rightPanel.getByText('Manipal CBSE Public School');
    await expect(cbseCard).toBeVisible({ timeout: 15_000 });
    await cbseCard.click();

    // Step 4: school selected — schoolId in URL, board=CBSE must still be present
    await expect
      .poll(() => getUrlParam(page, 'schoolId'), { timeout: 8_000 })
      .not.toBeNull();
    expect(getUrlParams(page, 'board')).toEqual(['CBSE']);

    // Step 5: click clear-school chip → schoolId removed
    const clearSchoolChip = page.getByTestId('clear-school-chip');
    await expect(clearSchoolChip).toBeVisible({ timeout: 10_000 });
    await clearSchoolChip.click();

    // Step 6: schoolId removed, board=CBSE survives clear-school
    await expect
      .poll(() => getUrlParam(page, 'schoolId'), { timeout: 8_000 })
      .toBeNull();
    expect(getUrlParams(page, 'board')).toEqual(['CBSE']);

    // Step 7: areaKey still present (area context preserved after school cleared)
    expect(getUrlParam(page, 'areaKey')).toBe(MANIPAL_AREA_KEY);
  });

  /**
   * E2E-HRD-7: Start Over clears board+category filters alongside journey state.
   *
   * Contract: the Start Over action must atomically clear journey, areaKey, schoolId,
   * radiusKm, board, and category params. None of the filter params must survive.
   *
   * Does NOT require ActiveContextChips — only URL state is asserted.
   */
  test('E2E-HRD-7: Start Over clears board+category filters alongside journey state', async ({ page }) => {
    await stubAll(page);

    // Cold-load with all params set: journey + areaKey + board + category
    await page.goto(
      `/discover?city=udupi&journey=school-first&areaKey=${ENCODED_AREA_KEY}&board=CBSE&category=secondary`,
    );
    await page.waitForLoadState('domcontentloaded');

    // Sanity: all params present before Start Over
    await expect
      .poll(() => getUrlParam(page, 'journey'), { timeout: 5_000 })
      .toBe('school-first');
    expect(getUrlParam(page, 'areaKey')).toBe(MANIPAL_AREA_KEY);
    expect(getUrlParams(page, 'board')).toEqual(['CBSE']);
    expect(getUrlParam(page, 'category')).toBe('secondary');

    // Click Start Over button (data-testid="start-over-button" in PanelHeader.tsx)
    const startOverBtn = page.getByTestId('start-over-button');
    await expect(startOverBtn).toBeVisible({ timeout: 15_000 });
    await startOverBtn.click();

    // All journey + filter params must be cleared after Start Over
    await expect
      .poll(() => getUrlParam(page, 'journey'), { timeout: 8_000 })
      .toBeNull();
    await expect
      .poll(() => getUrlParam(page, 'areaKey'), { timeout: 5_000 })
      .toBeNull();
    await expect
      .poll(() => getUrlParams(page, 'board'), { timeout: 5_000 })
      .toEqual([]);
    expect(getUrlParam(page, 'category')).toBeNull();

    // city param must be preserved (Start Over does not change city)
    expect(getUrlParam(page, 'city')).toBe('udupi');
  });

});
