/**
 * E2E: School deep-link error handling — Issue #1145
 *
 * Verifies that navigating to /discover?schoolId=<id> when the school lookup
 * API fails does NOT leave the panel in an eternal loading skeleton. Instead:
 *
 *   DL-ERR-1  API 500 → schoolId cleared from URL + destructive toast visible
 *   DL-ERR-2  API 404 → schoolId cleared from URL silently (no toast)
 *   DL-OK-1   API 200 → schoolId stays in URL, no toast, panel loads normally
 *
 * Run locally:
 *   bash scripts/run-e2e-local.sh --project=full e2e/discover/school-deep-link-error.spec.ts
 */

import { test, expect, type Page, type Route } from '@playwright/test';

// ── Constants ──────────────────────────────────────────────────────────────────

const CITY = 'udupi';
const SCHOOL_ID = 'test-school-123';
const AREA_KEY = 'IN|KA|Udupi|Manipal';

const DEEP_LINK_URL = `/discover?city=${CITY}&schoolId=${SCHOOL_ID}&journey=school-first`;

// ── Fixtures ───────────────────────────────────────────────────────────────────

const DISCOVER_AREAS_FIXTURE = {
  city: CITY,
  areas: [
    {
      areaKey: AREA_KEY,
      name: 'Manipal',
      geoCenterLat: 13.3509,
      geoCenterLon: 74.7932,
      minLat: 13.33, maxLat: 13.38,
      minLon: 74.77, maxLon: 74.82,
      listingCount: 4,
      schoolCount: 6,
      trendDirection: 'stable',
    },
  ],
};

const TRENDS_OPTIONS_FIXTURE = {
  city: CITY,
  defaultAreas: [{ areaKey: AREA_KEY, areaLabel: 'Manipal' }],
};

const CITY_LISTINGS_FIXTURE = {
  city: CITY,
  limitPerArea: 50,
  areas: [],
};

const SCHOOL_FIXTURE = {
  id: SCHOOL_ID,
  name: 'Manipal Public School',
  board: 'CBSE',
  boardType: null,
  address: 'Manipal, Udupi',
  latitude: 13.351,
  longitude: 74.79,
  city: CITY,
  areaKey: AREA_KEY,
  category: 'PRIMARY',
};

// ── Helper ─────────────────────────────────────────────────────────────────────

function fulfillJson(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function stubBaseRoutes(page: Page) {
  await page.route('**/api/trends/options**', (route) =>
    fulfillJson(route, 200, TRENDS_OPTIONS_FIXTURE),
  );
  await page.route('**/api/discover/cities/*/listings**', (route) =>
    fulfillJson(route, 200, CITY_LISTINGS_FIXTURE),
  );
  await page.route('**/api/discover/listings**', (route) =>
    fulfillJson(route, 200, { content: [], totalElements: 0 }),
  );
  await page.route('**/api/discover/areas**', (route) =>
    fulfillJson(route, 200, DISCOVER_AREAS_FIXTURE),
  );
  await page.route('**/api/public/schools/popular**', (route) =>
    fulfillJson(route, 200, []),
  );
  await page.route('**/api/public/schools/search**', (route) =>
    fulfillJson(route, 200, []),
  );
}

// ── DL-ERR-1: API 500 → URL cleared + toast shown ─────────────────────────────

test('DL-ERR-1: school lookup 500 clears schoolId from URL and shows error toast', async ({ page }) => {
  await stubBaseRoutes(page);

  // School-by-ID endpoint returns 500.
  await page.route(`**/api/public/schools/${SCHOOL_ID}`, (route) =>
    route.fulfill({ status: 500, body: 'Internal Server Error' }),
  );

  await page.goto(DEEP_LINK_URL);
  await page.waitForLoadState('networkidle');

  // schoolId must be removed from the URL.
  await expect(page).not.toHaveURL(/schoolId/, { timeout: 10000 });

  // Destructive toast must be visible. Target the title <div> specifically
  // to avoid the ambiguous aria-live <span> that also contains the text.
  await expect(
    page.locator('[class*="font-semibold"]').filter({ hasText: /school details unavailable/i }).first(),
  ).toBeVisible({ timeout: 10000 });
});

// ── DL-ERR-2: API 404 → URL cleared silently, no toast ────────────────────────

test('DL-ERR-2: school lookup 404 clears schoolId silently without showing a toast', async ({ page }) => {
  await stubBaseRoutes(page);

  // School-by-ID endpoint returns 404.
  await page.route(`**/api/public/schools/${SCHOOL_ID}`, (route) =>
    fulfillJson(route, 404, { message: 'Not Found' }),
  );

  await page.goto(DEEP_LINK_URL);
  await page.waitForLoadState('networkidle');

  // schoolId must be removed from the URL.
  await expect(page).not.toHaveURL(/schoolId/, { timeout: 10000 });

  // No toast should appear.
  await expect(
    page.getByText(/school details unavailable/i),
  ).not.toBeVisible();
});

// ── DL-OK-1: API 200 → schoolId stays, no toast ───────────────────────────────

test('DL-OK-1: school lookup 200 keeps schoolId in URL and shows no error toast', async ({ page }) => {
  await stubBaseRoutes(page);

  // School-by-ID endpoint returns the school.
  await page.route(`**/api/public/schools/${SCHOOL_ID}`, (route) =>
    fulfillJson(route, 200, SCHOOL_FIXTURE),
  );

  // Also stub proximity markers (may be requested once school coords are injected).
  await page.route('**/api/discover/markers**', (route) =>
    fulfillJson(route, 200, []),
  );

  await page.goto(DEEP_LINK_URL);
  await page.waitForLoadState('networkidle');

  // schoolId must remain in the URL.
  await expect(page).toHaveURL(/schoolId=test-school-123/, { timeout: 10000 });

  // No error toast.
  await expect(
    page.getByText(/school details unavailable/i),
  ).not.toBeVisible();
});
