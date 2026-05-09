/**
 * E2E: school-first journey — Issue #1003 (lean workflow-validation).
 *
 * 8 focused tests covering the school-first discovery state machine:
 *   E2E-1  Journey switcher writes journey=school-first to URL
 *   E2E-2  Area marker badge shows school count, not property count
 *   E2E-3  Area marker click → areaKey in URL + school-card in right panel
 *   E2E-4  Board chip click → board=cbse in URL
 *   E2E-5  School card click → schoolId in URL + combined-chips visible
 *   E2E-6  Clear-school chip → schoolId removed, school-card visible again
 *   E2E-7  Cold-load combined deep link → combined-chips + all 4 params present
 *   E2E-8  (optional) /by-area → [] → empty-state-no-schools-clear-filters visible
 *
 * Anonymous flow throughout — all relevant endpoints are public.
 *
 * Run locally:
 *   bash scripts/run-e2e-local.sh --project=full e2e/discover-school-first-journey.spec.ts
 */

import { test, expect, type Page, type Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MANIPAL_AREA_KEY = 'IN|KA|Udupi|Manipal';
const ENCODED_AREA_KEY = encodeURIComponent(MANIPAL_AREA_KEY);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TRENDS_OPTIONS_FIXTURE = {
  city: 'udupi',
  defaultAreas: [
    { areaKey: MANIPAL_AREA_KEY, areaLabel: 'Manipal' },
    { areaKey: 'IN|KA|Udupi|Kadiyali', areaLabel: 'Kadiyali' },
  ],
};

const DISCOVER_AREAS_UDUPI = {
  city: 'udupi',
  areas: [
    {
      areaKey: MANIPAL_AREA_KEY,
      name: 'Manipal',
      geoCenterLat: 13.3525,
      geoCenterLon: 74.7864,
      listingCount90d: 5,
      schoolCount: 4,
      trendDirection: 'stable',
    },
  ],
};

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
  },
  {
    id: 'sch-2',
    name: 'MIT Vidyaniketan',
    board: 'STATE',
    boardType: null,
    address: 'Manipal, Udupi',
    latitude: 13.351,
    longitude: 74.785,
    distanceKm: 1.5,
  },
];

const SCHOOLS_BY_AREA_FIXTURE = [
  {
    id: 'sch-1',
    name: 'Manipal Public School',
    board: 'CBSE',
    boardType: null,
    address: 'Manipal, Udupi',
    latitude: 13.3525,
    longitude: 74.7864,
    schoolCategory: 'secondary',
  },
  {
    id: 'sch-2',
    name: 'MIT Vidyaniketan',
    board: 'STATE',
    boardType: null,
    address: 'Manipal, Udupi',
    latitude: 13.351,
    longitude: 74.785,
    schoolCategory: 'primary',
  },
];

const MANIPAL_SCHOOL = SCHOOLS_BY_AREA_FIXTURE[0];

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
  await page.route('**/api/trends/options**', (route) =>
    fulfillJson(route, 200, TRENDS_OPTIONS_FIXTURE),
  );
}

async function stubDiscoverAreas(page: Page): Promise<void> {
  await page.route('**/api/discover/areas**', (route) =>
    fulfillJson(route, 200, DISCOVER_AREAS_UDUPI),
  );
}

async function stubPopularSchools(page: Page): Promise<void> {
  await page.route('**/api/public/schools/popular**', (route) =>
    fulfillJson(route, 200, POPULAR_SCHOOLS_FIXTURE),
  );
}

async function stubSchoolsByArea(page: Page, schools: unknown[] = SCHOOLS_BY_AREA_FIXTURE): Promise<void> {
  await page.route('**/api/public/schools/by-area**', (route) =>
    fulfillJson(route, 200, schools),
  );
}

async function stubDiscoverListings(page: Page): Promise<void> {
  await page.route('**/api/discover/listings**', (route) =>
    fulfillJson(route, 200, EMPTY_LISTINGS_PAGE),
  );
}

async function stubSchoolById(page: Page, school: typeof MANIPAL_SCHOOL): Promise<void> {
  await page.route(`**/api/public/schools/${school.id}`, (route) =>
    fulfillJson(route, 200, school),
  );
}

function getUrlParam(page: Page, key: string): string | null {
  return new URL(page.url()).searchParams.get(key);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('school-first journey (#1003)', () => {

  /**
   * E2E-1: Journey switcher card click writes journey=school-first to URL.
   * Starts at /discover?city=udupi (no journey param) and clicks the school-first card.
   */
  test('E2E-1: journey-card-school-first click → URL gains journey=school-first', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);
    await stubDiscoverListings(page);

    await page.goto('/discover?city=udupi');
    await page.waitForLoadState('domcontentloaded');

    // Journey switcher card must be visible
    const card = page.locator('[data-testid="journey-card-school-first"]');
    await expect(card).toBeVisible({ timeout: 15_000 });

    await card.click();

    await expect(page).toHaveURL(/journey=school-first/, { timeout: 8_000 });
  });

  /**
   * E2E-2: Area marker badge in school-first journey shows school count, not property count.
   * Cold-load with journey=school-first. Assert badge text matches /\d+ schools/i
   * and does NOT contain "propert".
   */
  test('E2E-2: area marker badge text shows school count, not property count', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);
    await stubDiscoverListings(page);

    await page.goto(`/discover?city=udupi&journey=school-first`);
    await page.waitForLoadState('domcontentloaded');

    // Wait for the area marker to appear
    const marker = page.locator('[data-testid="area-marker"]').first();
    await expect(marker).toBeVisible({ timeout: 15_000 });

    const badgeText = await marker.innerText();
    expect(badgeText).toMatch(/\d+\s*schools/i);
    expect(badgeText).not.toMatch(/propert/i);
  });

  /**
   * E2E-3: Area marker click → URL gains areaKey, school-card visible in right panel.
   */
  test('E2E-3: area marker click → areaKey in URL + school-card visible', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);
    await stubSchoolsByArea(page);
    await stubDiscoverListings(page);

    await page.goto(`/discover?city=udupi&journey=school-first`);
    await page.waitForLoadState('domcontentloaded');

    const marker = page.locator('[data-testid="area-marker"]').first();
    await expect(marker).toBeVisible({ timeout: 15_000 });
    await marker.click({ force: true });

    // URL must gain areaKey for Manipal
    await expect(page).toHaveURL(/areaKey=/, { timeout: 8_000 });
    const areaKeyInUrl = getUrlParam(page, 'areaKey');
    expect(areaKeyInUrl).toBe(MANIPAL_AREA_KEY);

    // School cards must be visible in the right panel
    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel).toBeVisible({ timeout: 5_000 });
    await expect(rightPanel.locator('[data-testid="school-card"]').first()).toBeVisible({ timeout: 15_000 });
  });

  /**
   * E2E-4: Board chip (CBSE) click → URL gains board=cbse.
   * Cold-load with journey=school-first&areaKey already set.
   */
  test('E2E-4: board-chip-cbse click → URL gains board=cbse', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);
    await stubSchoolsByArea(page);
    await stubDiscoverListings(page);

    await page.goto(`/discover?city=udupi&journey=school-first&areaKey=${ENCODED_AREA_KEY}`);
    await page.waitForLoadState('domcontentloaded');

    // Wait for the board chip to be available
    const cbseChip = page.locator('[data-testid="board-chip-cbse"]');
    await expect(cbseChip).toBeVisible({ timeout: 15_000 });

    await cbseChip.click();

    await page.waitForURL(/board=cbse/i, { timeout: 8_000 });
    expect(new URL(page.url()).searchParams.get('board')).toMatch(/cbse/i);
  });

  /**
   * E2E-5: School card click → schoolId in URL + combined-chips and both clear chips visible.
   * Cold-load with areaKey set, click first school-card.
   */
  test('E2E-5: school-card click → schoolId in URL + combined-chips + both clear chips visible', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);
    await stubSchoolsByArea(page);
    await stubSchoolById(page, MANIPAL_SCHOOL);
    await stubDiscoverListings(page);

    await page.goto(`/discover?city=udupi&journey=school-first&areaKey=${ENCODED_AREA_KEY}`);
    await page.waitForLoadState('domcontentloaded');

    // Wait for school card and click it
    const schoolCard = page.locator('[data-testid="school-card"]').first();
    await expect(schoolCard).toBeVisible({ timeout: 15_000 });
    await schoolCard.click();

    // URL must gain schoolId
    await expect.poll(() => getUrlParam(page, 'schoolId'), { timeout: 8_000 }).not.toBeNull();

    // combined-chips container and both clear chips must be visible
    await expect(page.getByTestId('combined-chips')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('clear-area-chip')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('clear-school-chip')).toBeVisible({ timeout: 5_000 });
  });

  /**
   * E2E-6: Clear-school chip → schoolId removed from URL, school-cards visible again.
   * Cold-loads combined state (same as E2E-7) then clears school.
   */
  test('E2E-6: clear-school-chip → URL loses schoolId + school-card visible', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);
    await stubSchoolsByArea(page);
    await stubSchoolById(page, MANIPAL_SCHOOL);
    await stubDiscoverListings(page);

    // Cold-load combined state (both areaKey and schoolId set)
    await page.goto(
      `/discover?city=udupi&journey=school-first&areaKey=${ENCODED_AREA_KEY}&schoolId=${MANIPAL_SCHOOL.id}&radiusKm=3`,
    );
    await page.waitForLoadState('domcontentloaded');

    // Wait for combined-chips to appear
    await expect(page.getByTestId('combined-chips')).toBeVisible({ timeout: 15_000 });

    const clearSchoolChip = page.getByTestId('clear-school-chip');
    await expect(clearSchoolChip).toBeVisible({ timeout: 5_000 });
    await clearSchoolChip.click();

    // schoolId must be removed from URL
    await expect.poll(() => getUrlParam(page, 'schoolId'), { timeout: 8_000 }).toBeNull();

    // School cards must be visible again (schools-in-area panel re-renders)
    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel.locator('[data-testid="school-card"]').first()).toBeVisible({ timeout: 15_000 });
  });

  /**
   * E2E-7: Cold-load combined deep link → combined-chips visible + all 4 params present.
   * Navigates directly to a URL with journey, areaKey, schoolId, and radiusKm.
   */
  test('E2E-7: cold-load combined deep link → combined-chips visible + all 4 params present', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);
    await stubSchoolsByArea(page);
    await stubSchoolById(page, MANIPAL_SCHOOL);
    await stubDiscoverListings(page);

    await page.goto(
      `/discover?city=udupi&journey=school-first&areaKey=${ENCODED_AREA_KEY}&schoolId=${MANIPAL_SCHOOL.id}&radiusKm=3`,
    );
    await page.waitForLoadState('domcontentloaded');

    // combined-chips must be visible after cold-load hydration
    await expect(page.getByTestId('combined-chips')).toBeVisible({ timeout: 15_000 });

    // All 4 required params must be present in the URL
    const url = new URL(page.url());
    expect(url.searchParams.get('journey')).toBe('school-first');
    expect(url.searchParams.get('areaKey')).toBe(MANIPAL_AREA_KEY);
    expect(url.searchParams.get('schoolId')).toBe(MANIPAL_SCHOOL.id);
    expect(url.searchParams.get('radiusKm')).toBe('3');
  });

  /**
   * E2E-8 (optional): /by-area returns [] → empty-state-no-schools-clear-filters visible.
   */
  test('E2E-8: empty /by-area → empty-state-no-schools-clear-filters visible', async ({ page }) => {
    await stubTrendsOptions(page);
    await stubDiscoverAreas(page);
    await stubPopularSchools(page);
    await stubSchoolsByArea(page, []);
    await stubDiscoverListings(page);

    await page.goto(`/discover?city=udupi&journey=school-first&areaKey=${ENCODED_AREA_KEY}`);
    await page.waitForLoadState('domcontentloaded');

    await expect(
      page.getByTestId('empty-state-no-schools-clear-filters'),
    ).toBeVisible({ timeout: 15_000 });
  });

});
