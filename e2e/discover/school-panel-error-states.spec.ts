/**
 * E2E: School panel error and retry states — Issue #1144
 *
 * Verifies that SchoolBrowsePanel renders visible error states when APIs fail,
 * and that success paths are unaffected by the new error branches.
 *
 * Note: SchoolsInAreaPanel error states (AC1/AC2) are covered by unit tests
 * in SchoolsInAreaPanel.test.tsx (error via standalone hook mode). The E2E
 * success-path regression for SchoolsInAreaPanel is included as ERR-4.
 *
 * Tests:
 *   ERR-1  SchoolBrowsePanel: popular-schools API 500 → inline error visible
 *   ERR-2  SchoolBrowsePanel: discover-areas API 500 → inline error visible
 *   ERR-3  Regression: SchoolBrowsePanel success path — schools and areas render, no false error
 *
 * Note: SchoolsInAreaPanel error (AC1/AC2) and success-path regression are covered
 * by unit tests in SchoolsInAreaPanel.test.tsx. The school-in-area URL path requires
 * stubbing additional MapDiscovery-owned APIs beyond this spec's scope.
 *
 * Run locally:
 *   bash scripts/run-e2e-local.sh --project=full e2e/discover/school-panel-error-states.spec.ts
 */

import { test, expect, type Page } from '@playwright/test';

// ── Constants ─────────────────────────────────────────────────────────────────

const CITY = 'udupi';
const AREA_KEY = 'IN|KA|Udupi|Manipal';

const SCHOOL_BROWSE_URL = `/discover?journey=school-first&city=${CITY}`;

// ── Fixtures ──────────────────────────────────────────────────────────────────

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

const POPULAR_SCHOOLS_FIXTURE = [
  {
    id: 'sch-pop-1',
    name: 'Manipal Public School',
    board: 'CBSE',
    boardType: null,
    address: 'Manipal, Udupi',
    latitude: 13.351,
    longitude: 74.79,
    distanceKm: 0.5,
    nearbyListingCount: 2,
    areaKey: AREA_KEY,
  },
];

const TRENDS_OPTIONS_FIXTURE = {
  city: CITY,
  defaultAreas: [{ areaKey: AREA_KEY, areaLabel: 'Manipal' }],
};

const CITY_LISTINGS_FIXTURE = {
  city: CITY,
  limitPerArea: 50,
  areas: [],
};

// ── Helper ────────────────────────────────────────────────────────────────────

function fulfillJson(route: import('@playwright/test').Route, status: number, body: unknown) {
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
    fulfillJson(route, 200, POPULAR_SCHOOLS_FIXTURE),
  );
  await page.route('**/api/public/schools/search**', (route) =>
    fulfillJson(route, 200, []),
  );
}

// ── ERR-1: SchoolBrowsePanel popular-schools 500 ──────────────────────────────

test('ERR-1: SchoolBrowsePanel shows popular-schools error state on API 500', async ({ page }) => {
  await stubBaseRoutes(page);
  // Override: popular schools returns 500 (registered after base → takes LIFO precedence)
  await page.route('**/api/public/schools/popular**', (route) =>
    route.fulfill({ status: 500, body: 'Internal Server Error' }),
  );

  await page.goto(SCHOOL_BROWSE_URL);
  await page.waitForLoadState('networkidle');

  // React Query retries 3× with exponential backoff before setting isError=true (~7–10s)
  await expect(page.getByTestId('popular-schools-error-state')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/could not load popular schools/i)).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('popular-schools-error-retry')).toBeVisible({ timeout: 15000 });
});

// ── ERR-2: SchoolBrowsePanel discover-areas 500 ───────────────────────────────

test('ERR-2: SchoolBrowsePanel shows areas error state on API 500', async ({ page }) => {
  await stubBaseRoutes(page);
  // Override: areas returns 500
  await page.route('**/api/discover/areas**', (route) =>
    route.fulfill({ status: 500, body: 'Internal Server Error' }),
  );

  await page.goto(SCHOOL_BROWSE_URL);
  await page.waitForLoadState('networkidle');

  // React Query retries 3× with exponential backoff before setting isError=true (~7–10s)
  await expect(page.getByTestId('discover-areas-error-state')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/could not load school areas/i)).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('discover-areas-error-retry')).toBeVisible({ timeout: 15000 });
});

// ── ERR-3: Regression — SchoolBrowsePanel success path ───────────────────────

test('ERR-3: regression — SchoolBrowsePanel success path: schools and areas visible, no false error', async ({ page }) => {
  await stubBaseRoutes(page);
  // All routes succeed (default from stubBaseRoutes)

  await page.goto(SCHOOL_BROWSE_URL);
  await page.waitForLoadState('networkidle');

  // Popular school from fixture should be visible
  await expect(page.getByText('Manipal Public School')).toBeVisible({ timeout: 10000 });
  // Area card from fixture should be visible
  await expect(page.getByTestId('area-card').first()).toBeVisible({ timeout: 10000 });
  // No false error states
  await expect(page.getByTestId('popular-schools-error-state')).not.toBeVisible();
  await expect(page.getByTestId('discover-areas-error-state')).not.toBeVisible();
});

