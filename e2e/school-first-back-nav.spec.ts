/**
 * E2E: school-first in-page Back navigation — Issue #1143.
 *
 * 5 tests covering the Back button state machine:
 *   BN-1  From Level 2 (school selected), in-page Back returns to Level 1 (schools-in-area)
 *   BN-2  From Level 1 (area selected), in-page Back returns to Level 0 (school-browse)
 *   BN-3  At Level 0, no Back button is rendered
 *   BN-4  Browser Back after school selection is NOT silently swallowed (replace→push fix)
 *   BN-5  Start Over still resets the whole journey (AC5 regression guard)
 *
 * Anonymous flow throughout — all relevant endpoints are public.
 *
 * Run locally:
 *   bash scripts/run-e2e-local.sh --project=full e2e/school-first-back-nav.spec.ts
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
];

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
];

const EMPTY_LISTINGS_PAGE = {
  content: [],
  page: 0,
  size: 50,
  totalElements: 0,
  totalPages: 0,
  aggregates: { topLocalities: [] },
};

const MANIPAL_SCHOOL = SCHOOLS_BY_AREA_FIXTURE[0];

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

/** Read a single URL param from the current page URL. */
function getUrlParam(page: Page, key: string): string | null {
  return new URL(page.url()).searchParams.get(key);
}

async function stubCommon(page: Page): Promise<void> {
  // INTEGRATION-UI: stubs isolate from backend variability
  await page.route('**/api/trends/options**', (route) =>
    fulfillJson(route, 200, TRENDS_OPTIONS_FIXTURE),
  );
  await page.route('**/api/discover/areas**', (route) =>
    fulfillJson(route, 200, DISCOVER_AREAS_UDUPI),
  );
  await page.route('**/api/public/schools/popular**', (route) =>
    fulfillJson(route, 200, POPULAR_SCHOOLS_FIXTURE),
  );
  await page.route('**/api/public/schools/by-area**', (route) =>
    fulfillJson(route, 200, SCHOOLS_BY_AREA_FIXTURE),
  );
  await page.route('**/api/discover/listings**', (route) =>
    fulfillJson(route, 200, EMPTY_LISTINGS_PAGE),
  );
  await page.route(`**/api/public/schools/${MANIPAL_SCHOOL.id}`, (route) =>
    fulfillJson(route, 200, MANIPAL_SCHOOL),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('@integration-ui school-first back navigation (#1143)', () => {

  /**
   * BN-1: From Level 2 (schoolId present), clicking in-page Back clears schoolId + radiusKm
   * and returns to Level 1 (schools-in-area). areaKey must be preserved.
   */
  test('BN-1: from Level 2, in-page Back clears school and returns to Level 1', async ({ page }) => {
    await stubCommon(page);

    // Start at Level 2: journey + areaKey + schoolId
    await page.goto(
      `/discover?city=udupi&journey=school-first&areaKey=${ENCODED_AREA_KEY}&schoolId=sch-1&radiusKm=2`,
    );
    await page.waitForLoadState('domcontentloaded');

    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel).toBeVisible({ timeout: 15_000 });

    // Back button must be visible at Level 2
    const backBtn = page.getByTestId('panel-header-back-button');
    await expect(backBtn).toBeVisible({ timeout: 10_000 });

    await backBtn.click();

    // schoolId and radiusKm must be gone from URL
    await expect.poll(() => getUrlParam(page, 'schoolId'), { timeout: 8_000 }).toBeNull();
    expect(getUrlParam(page, 'radiusKm')).toBeNull();

    // areaKey must be preserved
    expect(getUrlParam(page, 'areaKey')).toBe(MANIPAL_AREA_KEY);

    // journey must be preserved
    expect(getUrlParam(page, 'journey')).toBe('school-first');
  });

  /**
   * BN-2: From Level 1 (areaKey present, no schoolId), clicking in-page Back clears areaKey
   * and returns to Level 0 (school-browse). journey + city must be preserved.
   */
  test('BN-2: from Level 1, in-page Back clears area and returns to Level 0', async ({ page }) => {
    await stubCommon(page);

    // Start at Level 1: journey + areaKey, no schoolId
    await page.goto(
      `/discover?city=udupi&journey=school-first&areaKey=${ENCODED_AREA_KEY}`,
    );
    await page.waitForLoadState('domcontentloaded');

    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel).toBeVisible({ timeout: 15_000 });

    // Back button must be visible at Level 1
    const backBtn = page.getByTestId('panel-header-back-button');
    await expect(backBtn).toBeVisible({ timeout: 10_000 });

    await backBtn.click();

    // areaKey must be gone from URL
    await expect.poll(() => getUrlParam(page, 'areaKey'), { timeout: 8_000 }).toBeNull();

    // journey and city must be preserved
    expect(getUrlParam(page, 'journey')).toBe('school-first');
    expect(getUrlParam(page, 'city')).toBe('udupi');
  });

  /**
   * BN-3: At Level 0 (journey=school-first, no areaKey, no schoolId), no Back button is rendered.
   */
  test('BN-3: at Level 0, no Back button visible', async ({ page }) => {
    await stubCommon(page);

    await page.goto('/discover?city=udupi&journey=school-first');
    await page.waitForLoadState('domcontentloaded');

    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel).toBeVisible({ timeout: 15_000 });

    // AC4: Back button must NOT be in the DOM at Level 0 (not just hidden).
    // not.toBeVisible() would pass if the element exists but is invisible;
    // not.toBeAttached() correctly asserts the element is absent entirely.
    const backBtn = page.getByTestId('panel-header-back-button');
    await expect(backBtn).not.toBeAttached({ timeout: 5_000 });
  });

  /**
   * BN-4: Browser Back after school selection is NOT silently swallowed.
   * setSchoolParams was changed from replace:true to replace:false (push), so
   * browser Back should navigate to the pre-school-selection URL (Level 1).
   */
  test('BN-4: browser Back after school selection is not swallowed', async ({ page }) => {
    await stubCommon(page);

    // Start at Level 1
    await page.goto(
      `/discover?city=udupi&journey=school-first&areaKey=${ENCODED_AREA_KEY}`,
    );
    await page.waitForLoadState('domcontentloaded');

    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel).toBeVisible({ timeout: 15_000 });

    // Click the first school card to select a school (Level 1 → Level 2)
    const schoolCard = page.locator('[data-testid="school-card"]').first();
    await expect(schoolCard).toBeVisible({ timeout: 15_000 });
    await schoolCard.click();

    // Wait for schoolId to appear in URL (Level 2)
    await expect.poll(() => getUrlParam(page, 'schoolId'), { timeout: 8_000 }).not.toBeNull();

    // Press browser Back — must navigate back to Level 1 (no schoolId in URL)
    await page.goBack();

    // schoolId must be gone (browser Back was NOT swallowed)
    await expect.poll(() => getUrlParam(page, 'schoolId'), { timeout: 8_000 }).toBeNull();

    // areaKey must still be present (we are at Level 1)
    expect(getUrlParam(page, 'areaKey')).toBe(MANIPAL_AREA_KEY);
  });

  /**
   * BN-5: Start Over still resets the whole journey (AC5 regression guard).
   * Pressing Start Over from Level 2 must clear journey, areaKey, schoolId, and radiusKm.
   * City must be preserved.
   */
  test('BN-5: Start Over resets whole journey (AC5 regression)', async ({ page }) => {
    await stubCommon(page);

    // Start at Level 2
    await page.goto(
      `/discover?city=udupi&journey=school-first&areaKey=${ENCODED_AREA_KEY}&schoolId=sch-1&radiusKm=2`,
    );
    await page.waitForLoadState('domcontentloaded');

    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel).toBeVisible({ timeout: 15_000 });

    // Start Over button must be visible
    const startOverBtn = page.getByTestId('start-over-button');
    await expect(startOverBtn).toBeVisible({ timeout: 10_000 });

    await startOverBtn.click();

    // journey, areaKey, schoolId, radiusKm must all be gone
    await expect.poll(() => getUrlParam(page, 'journey'), { timeout: 8_000 }).toBeNull();
    expect(getUrlParam(page, 'areaKey')).toBeNull();
    expect(getUrlParam(page, 'schoolId')).toBeNull();
    expect(getUrlParam(page, 'radiusKm')).toBeNull();

    // city must be preserved
    expect(getUrlParam(page, 'city')).toBe('udupi');
  });
});
