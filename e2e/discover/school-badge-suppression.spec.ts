/**
 * E2E: Badge shows school-radius scoped count — Issue #1175 v2
 *
 * v2 product decision: the badge must FOLLOW the active school-radius context
 * and show the scoped listing count (0 or N) rather than being suppressed.
 * This prevents contradiction between the badge and the right panel.
 *
 * SBS-1  School selected + radius=2km + zero nearby listings →
 *        badge IS visible showing "0" (not the unfiltered area total "12")
 * SBS-2  School selected + radius=5km + 2 nearby listings →
 *        badge IS visible showing "2" (scoped count, not area total "12")
 * SBS-3  No school context → badge is visible showing area/city count (regression guard)
 *
 * Run locally:
 *   bash scripts/run-e2e-local.sh --project=full e2e/discover/school-badge-suppression.spec.ts
 */

import { test, expect, type Page, type Route } from '@playwright/test';

// ── Constants ──────────────────────────────────────────────────────────────────

const CITY = 'udupi';
const SCHOOL_ID = '8a4c7543-0ff7-42e9-9fc9-1f1daf4ada6d';
const AREA_KEY = 'IN|KA|Udupi|Manipal';
// Area has 12 unfiltered listings — this is the number that must NOT appear in
// the badge when school-radius is active (it would contradict the scoped panel).
const AREA_LISTING_COUNT = 12;

// School coords — used for haversine filtering client-side.
const SCHOOL_LAT = 13.18911;
const SCHOOL_LON = 75.00151;

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
      listingCount: AREA_LISTING_COUNT,
      schoolCount: 6,
      trendDirection: 'stable',
    },
  ],
};

// SBS-1: zero listings → no listings fall within any radius.
const CITY_LISTINGS_EMPTY_FIXTURE = {
  city: CITY,
  limitPerArea: 50,
  areas: [{ areaKey: AREA_KEY, areaName: 'Manipal', listings: [] }],
};

// SBS-2: 2 listings with coords within 5 km of school (13.18911, 75.00151).
// lat≈13.19, lon≈75.00 → ~0.1 km; lat=13.21, lon=75.01 → ~2.4 km.
// Both are well within radiusKm=5.
const CITY_LISTINGS_WITH_MATCHES_FIXTURE = {
  city: CITY,
  limitPerArea: 50,
  areas: [
    {
      areaKey: AREA_KEY,
      areaName: 'Manipal',
      listings: [
        {
          id: 'listing-near-1',
          title: 'Near School Property 1',
          pricePaise: 500000000,
          bedrooms: 2,
          propertyType: 'apartment',
          listingPurpose: 'sale',
          lat: 13.19,
          lon: 75.00,
        },
        {
          id: 'listing-near-2',
          title: 'Near School Property 2',
          pricePaise: 600000000,
          bedrooms: 3,
          propertyType: 'house',
          listingPurpose: 'sale',
          lat: 13.21,
          lon: 75.01,
        },
      ],
    },
  ],
};

const SCHOOL_FIXTURE = {
  id: SCHOOL_ID,
  name: 'Badge Context Test School',
  board: 'CBSE',
  boardType: null,
  address: 'Manipal, Udupi',
  latitude: SCHOOL_LAT,
  longitude: SCHOOL_LON,
  city: CITY,
  areaKey: AREA_KEY,
  category: 'PRIMARY',
};

// ── Helper ─────────────────────────────────────────────────────────────────────

function fulfillJson(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function stubBaseRoutes(page: Page, listingsFixture = CITY_LISTINGS_EMPTY_FIXTURE) {
  await page.route('**/api/trends/options**', (route) =>
    fulfillJson(route, 200, {
      city: CITY,
      defaultAreas: [{ areaKey: AREA_KEY, areaLabel: 'Manipal' }],
    }),
  );
  await page.route('**/api/discover/areas**', (route) =>
    fulfillJson(route, 200, DISCOVER_AREAS_FIXTURE),
  );
  await page.route('**/api/discover/cities/*/listings**', (route) =>
    fulfillJson(route, 200, listingsFixture),
  );
  await page.route('**/api/discover/listings**', (route) =>
    fulfillJson(route, 200, { content: [], totalElements: 0, totalPages: 0, aggregates: { topLocalities: [] } }),
  );
  await page.route('**/api/discover/markers**', (route) =>
    fulfillJson(route, 200, []),
  );
  await page.route('**/api/public/schools/popular**', (route) =>
    fulfillJson(route, 200, []),
  );
  await page.route('**/api/public/schools/search**', (route) =>
    fulfillJson(route, 200, []),
  );
  // Single-school lookup — used by school-selected and area-school-combined panels.
  await page.route(`**/api/public/schools/${SCHOOL_ID}`, (route) =>
    fulfillJson(route, 200, SCHOOL_FIXTURE),
  );
  // Schools-in-area lookup — required by area-school-combined panel (areaKey + schoolId).
  await page.route('**/api/public/schools/by-area**', (route) =>
    fulfillJson(route, 200, []),
  );
  await page.route('**/api/discover/area-groups**', (route) =>
    fulfillJson(route, 200, { groups: [] }),
  );
}

// ── SBS-1: School + radius + zero nearby listings → badge shows 0 ─────────────

test('SBS-1: school-radius active with zero nearby listings → badge IS visible showing 0 (not area total)', async ({ page }) => {
  await stubBaseRoutes(page, CITY_LISTINGS_EMPTY_FIXTURE);

  // Repro URL from issue #1175 — school selected, radius=2km, zero listings in radius
  const url = `/discover?city=${CITY}&journey=school-first&schoolId=${SCHOOL_ID}&radiusKm=2&lat=${SCHOOL_LAT}&lon=${SCHOOL_LON}&zoom=14`;
  await page.goto(url);

  // Wait for the school panel to mount (school-name heading is the stable signal)
  await expect(
    page.getByRole('heading', { name: 'Badge Context Test School' }),
  ).toBeVisible({ timeout: 10_000 });

  // Badge MUST be visible — v2 shows scoped count rather than suppressing (Issue #1175)
  const badge = page.getByTestId('discover-badge');
  await expect(badge).toBeVisible({ timeout: 8_000 });

  // Badge must show "0" — the school-scoped count, not the unfiltered area total "12"
  await expect(badge).toContainText('0', { timeout: 5_000 });
  const badgeText = await badge.textContent();
  expect(badgeText).not.toMatch(/12/);
});

// ── SBS-2: School + radius + N matches → badge shows N ───────────────────────

test('SBS-2: school-radius active with 2 nearby listings → badge IS visible showing 2 (scoped count)', async ({ page }) => {
  await stubBaseRoutes(page, CITY_LISTINGS_WITH_MATCHES_FIXTURE);

  // Include areaKey so selectedArea gets populated → areaListings is fetched and
  // the haversine filter in schoolListings useMemo can count the 2 nearby listings.
  // Without areaKey, selectedArea is null and areaListings = [] (see useDiscoverMapData.ts:202).
  const encodedAreaKey = encodeURIComponent(AREA_KEY);
  const url = `/discover?city=${CITY}&journey=school-first&schoolId=${SCHOOL_ID}&radiusKm=5&lat=${SCHOOL_LAT}&lon=${SCHOOL_LON}&zoom=12&areaKey=${encodedAreaKey}`;
  await page.goto(url);

  // Wait for the right panel and network to settle.
  // With areaKey+schoolId, the panel is 'area-school-combined' (not 'school-selected').
  // Use the right-panel mount + networkidle as the stable signal.
  await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 10_000 });
  await page.waitForLoadState('networkidle');

  // Badge MUST be visible with the scoped count
  const badge = page.getByTestId('discover-badge');
  await expect(badge).toBeVisible({ timeout: 10_000 });

  // Badge must show "2" (the two listings within radius), not "12" (area total)
  await expect(badge).toContainText('2', { timeout: 8_000 });
  const badgeText = await badge.textContent();
  expect(badgeText).not.toMatch(/12/);
});

// ── SBS-3: Non-school baseline — badge still works ────────────────────────────

test('SBS-3: no school context + area with listings → badge IS shown with area/city count (regression guard)', async ({ page }) => {
  await stubBaseRoutes(page);

  // Plain city browse — no school context, no radius filter
  await page.goto(`/discover?city=${CITY}`);
  await page.waitForLoadState('domcontentloaded');

  await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 10_000 });

  // cityTotal = AREA_LISTING_COUNT (12) from mock → badge should be visible
  const badge = page.getByTestId('discover-badge');
  await expect(badge).toBeVisible({ timeout: 12_000 });

  const badgeText = await badge.textContent();
  expect(badgeText).toBeTruthy();
  const match = badgeText!.replace(/,/g, '').match(/\d+/);
  expect(match).not.toBeNull();
  const displayedCount = parseInt(match![0], 10);
  expect(displayedCount).toBe(AREA_LISTING_COUNT);

  // No school panel elements should be present in the non-school path
  // (the school-selected panel's school-name heading is absent).
  await expect(
    page.getByRole('heading', { name: 'Badge Context Test School' }),
  ).not.toBeVisible();
});
