/**
 * E2E: school-first board-type filter — Issue #1131.
 *
 * Covers AC12 — board filter must be reflected in the URL via REPEATED ?board= params
 * (e.g. ?board=CBSE), schools must be filtered to the selected boards, the filter
 * must survive school-selection → clear-school, and a cold-load deep link with the
 * board param must restore the filter active on the chips and on the schools list.
 *
 * Anonymous flow throughout — all endpoints used are public.
 *
 * Run locally:
 *   bash scripts/run-e2e-local.sh --project=full e2e/discover-school-board-filter.spec.ts
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

// Two schools — one CBSE, one ICSE — so a board=CBSE filter must hide the second one.
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
 * Stubs /api/public/schools/by-area to apply board-filter semantics server-side.
 * The page also applies a client-side board filter, so this stub mirrors the
 * server's REPEATED ?board= contract: when ?board=CBSE is present, the response
 * only includes CBSE-board schools.
 */
async function stubSchoolsByArea(page: Page): Promise<void> {
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/public/schools/by-area**', (route) => {
    const requestUrl = new URL(route.request().url());
    const boards = requestUrl.searchParams.getAll('board');
    const filtered = boards.length === 0
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

async function stubTrendsOptions(page: Page): Promise<void> {
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/trends/options**', (route) =>
    fulfillJson(route, 200, { city: 'udupi', defaultAreas: [] }),
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('@integration-ui school-first board-type filter (#1131)', () => {

  /**
   * AC12-A — Toggling the CBSE chip from the schools-in-area panel writes
   * `?board=CBSE` (as a repeated param) to the URL.
   */
  test('toggling CBSE chip writes board=CBSE to URL as a repeated param', async ({ page }) => {
    await stubAll(page);

    await page.goto(`/discover?city=udupi&journey=school-first&areaKey=${ENCODED_AREA_KEY}`);
    await page.waitForLoadState('domcontentloaded');

    const cbseChip = page.locator('[data-testid="board-chip-cbse"]');
    await expect(cbseChip).toBeVisible({ timeout: 15_000 });
    await cbseChip.click();

    await expect.poll(
      () => new URL(page.url()).searchParams.getAll('board'),
      { timeout: 8_000 },
    ).toEqual(['CBSE']);

    await expect(cbseChip).toHaveAttribute('aria-pressed', 'true');
  });

  /**
   * AC12-B — Once a board chip is active, only matching-board schools render.
   * The ICSE-board school must be filtered out when board=CBSE is active.
   */
  test('only matching-board schools visible after filter applied', async ({ page }) => {
    await stubAll(page);

    await page.goto(
      `/discover?city=udupi&journey=school-first&areaKey=${ENCODED_AREA_KEY}&board=CBSE`,
    );
    await page.waitForLoadState('domcontentloaded');

    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel).toBeVisible({ timeout: 15_000 });

    // CBSE school is visible
    await expect(rightPanel.getByText('Manipal CBSE Public School')).toBeVisible({
      timeout: 15_000,
    });
    // ICSE school is NOT visible
    await expect(rightPanel.getByText('Manipal ICSE Academy')).toHaveCount(0);
  });

  /**
   * AC12-C — The board filter is preserved across a school-selection /
   * clear-school cycle. clearSchoolContext() must NOT delete the board param.
   */
  test('board filter is preserved when a school is selected then cleared', async ({ page }) => {
    await stubAll(page);

    await page.goto(
      `/discover?city=udupi&journey=school-first&areaKey=${ENCODED_AREA_KEY}&board=CBSE`,
    );
    await page.waitForLoadState('domcontentloaded');

    // Sanity: chip is active and only the CBSE school is in the panel.
    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel.getByText('Manipal CBSE Public School')).toBeVisible({
      timeout: 15_000,
    });

    // Click the CBSE school card → schoolId added to URL.
    await rightPanel.getByText('Manipal CBSE Public School').click();
    await expect.poll(
      () => new URL(page.url()).searchParams.get('schoolId'),
      { timeout: 8_000 },
    ).toBe(CBSE_SCHOOL.id);

    // board=CBSE must still be on the URL (combined state).
    expect(new URL(page.url()).searchParams.getAll('board')).toEqual(['CBSE']);

    // Clear the school via the combined-chips clear-school chip.
    const clearSchoolChip = page.getByTestId('clear-school-chip');
    await expect(clearSchoolChip).toBeVisible({ timeout: 10_000 });
    await clearSchoolChip.click();

    // schoolId is removed; board=CBSE survives (AC7 contract).
    await expect.poll(
      () => new URL(page.url()).searchParams.get('schoolId'),
      { timeout: 8_000 },
    ).toBeNull();
    expect(new URL(page.url()).searchParams.getAll('board')).toEqual(['CBSE']);
  });

  /**
   * AC12-D — Cold-load deep-link with `?board=CBSE`: chip is active on first paint
   * and only matching-board schools are shown.
   */
  test('cold-load with ?board=CBSE renders with chip active + only matching schools', async ({ page }) => {
    await stubAll(page);

    await page.goto(
      `/discover?city=udupi&journey=school-first&areaKey=${ENCODED_AREA_KEY}&board=CBSE`,
    );
    await page.waitForLoadState('domcontentloaded');

    // Chip must be present and reflect the active state (aria-pressed=true).
    const cbseChip = page.locator('[data-testid="board-chip-cbse"]');
    await expect(cbseChip).toBeVisible({ timeout: 15_000 });
    await expect(cbseChip).toHaveAttribute('aria-pressed', 'true');

    // Right panel must show CBSE school only.
    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel.getByText('Manipal CBSE Public School')).toBeVisible({
      timeout: 15_000,
    });
    await expect(rightPanel.getByText('Manipal ICSE Academy')).toHaveCount(0);
  });

  /**
   * AC4 — Clicking an active board chip deactivates it: aria-pressed returns to
   * false and the board param is removed from the URL.
   */
  test('clicking active board chip deactivates it (AC4)', async ({ page }) => {
    await stubAll(page);

    await page.goto(
      `/discover?city=udupi&journey=school-first&areaKey=${ENCODED_AREA_KEY}&board=CBSE`,
    );
    await page.waitForLoadState('domcontentloaded');

    const cbseChip = page.locator('[data-testid="board-chip-cbse"]');
    await expect(cbseChip).toBeVisible({ timeout: 15_000 });
    await expect(cbseChip).toHaveAttribute('aria-pressed', 'true');

    // Click to deactivate
    await cbseChip.click();

    await expect.poll(
      () => new URL(page.url()).searchParams.getAll('board'),
      { timeout: 8_000 },
    ).toEqual([]);

    await expect(cbseChip).toHaveAttribute('aria-pressed', 'false');
  });
});
