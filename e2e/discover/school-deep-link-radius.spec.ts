/**
 * E2E: School deep-link radius serialization — Issue #1146
 *
 * Verifies that the `radiusKm` param is correctly round-tripped when a
 * school deep-link is cold-loaded:
 *
 *   DL-RAD-1  Cold-load WITH radiusKm=5 → URL keeps radiusKm=5 after restore
 *   DL-RAD-2  Cold-load WITHOUT radiusKm → URL is backfilled with radiusKm=3
 *             (default) after the restore effect fires
 *
 * Run locally:
 *   bash scripts/run-e2e-local.sh --project=full e2e/discover/school-deep-link-radius.spec.ts
 */

import { test, expect, type Page, type Route } from '@playwright/test';

// ── Constants ──────────────────────────────────────────────────────────────────

const CITY = 'udupi';
const SCHOOL_ID = 'test-school-rad-1';
const AREA_KEY = 'IN|KA|Udupi|Manipal';

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
  name: 'Radius Test School',
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
  await page.route(`**/api/public/schools/${SCHOOL_ID}`, (route) =>
    fulfillJson(route, 200, SCHOOL_FIXTURE),
  );
  await page.route('**/api/discover/markers**', (route) =>
    fulfillJson(route, 200, []),
  );
}

// ── DL-RAD-1: Cold-load WITH radiusKm=5 → URL retains radiusKm=5 ─────────────

test('DL-RAD-1: cold-load with radiusKm=5 keeps radiusKm=5 in URL after restore', async ({ page }) => {
  await stubBaseRoutes(page);

  const url = `/discover?city=${CITY}&journey=school-first&schoolId=${SCHOOL_ID}&radiusKm=5`;
  await page.goto(url);
  await page.waitForLoadState('networkidle');

  // radiusKm=5 must still be present in the URL — the restore must not overwrite it.
  await expect(page).toHaveURL(/radiusKm=5/, { timeout: 10000 });
});

// ── DL-RAD-2: Cold-load WITHOUT radiusKm → URL backfilled with radiusKm=3 ─────

test('DL-RAD-2: cold-load without radiusKm backfills radiusKm=3 into URL', async ({ page }) => {
  await stubBaseRoutes(page);

  // No radiusKm in the URL — simulates a hand-crafted or old-version link.
  const url = `/discover?city=${CITY}&journey=school-first&schoolId=${SCHOOL_ID}`;
  await page.goto(url);
  await page.waitForLoadState('networkidle');

  // Wait for the school panel to fully render (schoolById resolved + panel mounted).
  // The active-radius-chip is rendered by SchoolSelectedPanel only after schoolById
  // resolves and the restore effect fires — it is the earliest reliable signal that
  // the backfill useEffect has run. This avoids a race where networkidle settles
  // before the useEffect that writes radiusKm to the URL.
  await expect(page.getByTestId('active-radius-chip')).toBeVisible({ timeout: 10000 });

  // The restore effect must backfill the default radius into the URL.
  await expect(page).toHaveURL(/radiusKm=3/, { timeout: 5000 });
});
