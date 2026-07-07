/**
 * E2E: Issue #1798 PR-B — Thanisandra-Hennur Belt dense-area-group marker
 * degradation stress case.
 *
 * Models the real regression scenario cited in the issue: a 29-area / ~181-
 * property neighbourhood group (Thanisandra-Hennur Belt, north Bangalore)
 * that previously rendered all 29 full labelled area pins stacked on top of
 * each other. After #1798 PR-B, the map should show a spatially-representative
 * SUBSET of full pins plus area-cluster ("+N areas") chips, while the panel
 * still lists every one of the 29 areas with a "Showing X of N areas" note.
 *
 * Everything is stub-first (page.route) — no backend, no shared Supabase.
 *
 * Covers:
 *   E1 — map shows fewer than 29 area pins (degraded), not one-per-area
 *   E2 — at least one area-cluster ("+N areas") chip is present
 *   E3 — clicking an area-cluster chip does NOT navigate to a listing/area URL
 *        (it only flies-to-split; unlike a representative pin click it must
 *        never add areaKey to the URL)
 *   E4 — clicking a marker (representative pin) in the group-results /
 *        dense-area-group state opens the marker popover (Issue #1738 gate
 *        extended by #1798 PR-B's isGroupResultsPopoverEligible)
 *   E5 — the panel lists all 29 areas and shows "Showing X of N areas on the
 *        map" with X < 29
 *   E6 — typing a matching area name into the panel search promotes that
 *        area's pin (forced-always) without navigating
 *   E7 — citySlug scoping: the panel's ScopedSearch is scoped to the deep-
 *        linked city (school-mode search request carries city=bangalore)
 *
 * Run locally (reserved port fe=5196 per Stage-B ports contract):
 *   PLAYWRIGHT_BASE_URL=http://localhost:5196 \
 *   npx playwright test e2e/discover/thanisandra-hennur-belt-marker-degradation.spec.ts --project=chromium
 */

import { test, expect, type Page, type Route } from '@playwright/test';

// ── Fixture constants ─────────────────────────────────────────────────────────

const CITY = 'bangalore';
const GROUP_ID = 'thanisandra-hennur-belt';
const GROUP_NAME = 'Thanisandra-Hennur Belt';

function fulfillJson(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

// 6 tight spatial clusters (5+5+5+5+5+4 = 29 areas) spread across a north-
// Bangalore bounding box, so the grid-bucketing quadrant guarantee has real
// NE/NW/SE/SW spread to work with — mirrors the unit-test fixture in
// AreaMarkerLayer.test.tsx (DENSE_GROUP_AREAS), but with plausible real
// coordinates instead of a synthetic pixel-projection mock.
type AreaFixture = { areaKey: string; name: string; lat: number; lon: number; listingCount: number };

function makeCluster(
  anchorLat: number,
  anchorLon: number,
  namePrefix: string,
  count: number,
  startCount: number,
): AreaFixture[] {
  return Array.from({ length: count }, (_, i) => ({
    areaKey: `IN|KA|Bangalore|${namePrefix}-${i + 1}`,
    name: `${namePrefix.replace(/-/g, ' ')} ${i + 1}`,
    // ~100m jitter — tightly bunched, same neighbourhood.
    lat: anchorLat + i * 0.001,
    lon: anchorLon + i * 0.001,
    listingCount: startCount + i,
  }));
}

const AREA_FIXTURES: AreaFixture[] = [
  ...makeCluster(13.1, 77.7, 'ThanisandraNE', 5, 10),
  ...makeCluster(13.1, 77.55, 'HennurNW', 5, 8),
  ...makeCluster(12.98, 77.7, 'KothanurSE', 5, 6),
  ...makeCluster(12.98, 77.55, 'JakkurSW', 5, 4),
  ...makeCluster(13.06, 77.65, 'BagaluruCentreNE', 5, 20),
  ...makeCluster(12.96, 77.53, 'YelahankaSW', 4, 2),
];

const TOTAL_AREAS = AREA_FIXTURES.length; // 29
const TOTAL_PROPERTIES = AREA_FIXTURES.reduce((sum, a) => sum + a.listingCount, 0); // 181

const MOCK_AREA_GROUPS = {
  city: CITY,
  groups: [
    {
      slug: GROUP_ID,
      name: GROUP_NAME,
      subtitle: `${TOTAL_AREAS} localities`,
      regionLabel: 'North',
      displayOrder: 1,
      areaKeys: AREA_FIXTURES.map((a) => a.areaKey),
      focusLat: 13.03,
      focusLon: 77.62,
      minLat: 12.95,
      minLon: 77.5,
      maxLat: 13.12,
      maxLon: 77.72,
    },
  ],
};

const MOCK_AREAS = {
  city: CITY,
  areas: AREA_FIXTURES.map((a) => ({
    areaKey: a.areaKey,
    name: a.name,
    geoCenterLat: a.lat,
    geoCenterLon: a.lon,
    minLat: a.lat - 0.002,
    maxLat: a.lat + 0.002,
    minLon: a.lon - 0.002,
    maxLon: a.lon + 0.002,
    listingCount: a.listingCount,
    schoolCount: 0,
    trendDirection: 'stable',
  })),
};

const MOCK_CITY_LISTINGS = {
  city: CITY,
  limitPerArea: 5,
  areas: [],
};

const MOCK_GROUP_RESULTS_LISTINGS = {
  content: AREA_FIXTURES.slice(0, 3).map((a, i) => ({
    id: `listing-${i + 1}`,
    pricePaise: 500_0000 + i * 10_0000,
    propertyType: 'apartment',
    locality: a.name,
    primaryImageUrl: null,
    listingPurpose: 'sale',
    areaKey: a.areaKey,
    latitude: a.lat,
    longitude: a.lon,
  })),
  totalElements: TOTAL_PROPERTIES,
};

// ── Stub helpers ──────────────────────────────────────────────────────────────

async function stubDiscoverApis(page: Page) {
  await page.route('**/api/discover/area-groups**', (route) => fulfillJson(route, MOCK_AREA_GROUPS));
  await page.route('**/api/discover/areas**', (route) => fulfillJson(route, MOCK_AREAS));
  await page.route(`**/api/discover/cities/${CITY}/listings**`, (route) =>
    fulfillJson(route, MOCK_CITY_LISTINGS),
  );
  await page.route('**/api/discover/listings**', (route) => fulfillJson(route, MOCK_GROUP_RESULTS_LISTINGS));
  await page.route('**/api/discover/regional-area-groups**', (route) => fulfillJson(route, { groups: [] }));
  await page.route('**/api/discover/agri-map-listings**', (route) => fulfillJson(route, { listings: [] }));
  await page.route('**/api/discover/markers**', (route) => fulfillJson(route, [], 401));
  await page.route('**/api/discover/summary**', (route) =>
    fulfillJson(route, { city: CITY, regions: [{ regionKey: 'north', label: 'North', areaKeys: AREA_FIXTURES.map((a) => a.areaKey) }] }),
  );
  await page.route('**/api/trends/options**', (route) =>
    fulfillJson(route, { city: CITY, defaultAreas: AREA_FIXTURES.slice(0, 1).map((a) => ({ areaKey: a.areaKey, areaLabel: a.name })) }),
  );
  await page.route('**/api/public/schools/popular**', (route) => fulfillJson(route, []));
  await page.route('**/api/public/schools/search**', (route) => fulfillJson(route, []));
}

function groupResultsUrl(): string {
  return `/discover?city=${CITY}&journey=area-first&groupId=${GROUP_ID}`;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('@integration-ui Issue #1798 PR-B — Thanisandra-Hennur Belt dense-group degradation', () => {
  test('E1+E2: dense group (29 areas) → map shows fewer than 29 area pins + at least one area-cluster chip', async ({ page }) => {
    await stubDiscoverApis(page);

    await page.goto(groupResultsUrl());
    await page.waitForLoadState('networkidle');

    // Level-2 dense-group state: panel lists all member areas.
    await expect(page.getByTestId('area-group-level2')).toBeVisible({ timeout: 10_000 });

    // Wait for the map's area markers to settle.
    const pins = page.locator('[data-testid="area-marker"]');
    await expect(pins.first()).toBeVisible({ timeout: 10_000 });

    const pinCount = await pins.count();
    expect(pinCount).toBeGreaterThan(0);
    // Core degradation contract: never one pin per area for a 29-area group.
    expect(pinCount).toBeLessThan(TOTAL_AREAS);
    // Generous upper bound matching the design-spec label cap (12) with slack
    // for environment/zoom variance — still proves real degradation, not just
    // "fewer than 29".
    expect(pinCount).toBeLessThanOrEqual(15);

    const clusterChips = page.locator('[data-testid="area-cluster-marker"]');
    await expect(clusterChips.first()).toBeVisible({ timeout: 5_000 });
    const chipText = await clusterChips.first().innerText();
    expect(chipText).toMatch(/\+\d+ areas?/);
  });

  test('E3: clicking an area-cluster chip does NOT navigate to a listing/area URL (fly-to-split only)', async ({ page }) => {
    await stubDiscoverApis(page);

    await page.goto(groupResultsUrl());
    await page.waitForLoadState('networkidle');
    const clusterChips = page.locator('[data-testid="area-cluster-marker"]');
    await expect(clusterChips.first()).toBeVisible({ timeout: 10_000 });

    const urlBefore = page.url();
    await clusterChips.first().click();
    // Give the fly-to animation a moment; the URL must never gain areaKey.
    await page.waitForTimeout(500);

    expect(page.url()).not.toContain('areaKey=');
    // Still on the same group-results/Level-2 route (city + groupId preserved).
    expect(page.url()).toContain(`groupId=${GROUP_ID}`);
    void urlBefore;
  });

  test('E4: clicking a representative area marker in the dense-group state opens the marker popover (Issue #1738 gate extended by #1798 PR-B)', async ({ page }) => {
    await stubDiscoverApis(page);

    await page.goto(groupResultsUrl());
    await page.waitForLoadState('networkidle');
    const pins = page.locator('[data-testid="area-marker"]');
    await expect(pins.first()).toBeVisible({ timeout: 10_000 });

    await pins.first().click();

    // MarkerPopoverCard is gated by isMarkerPopoverEligible (isAreaFirstPopoverEligible
    // || isGroupResultsPopoverEligible) — clicking a rep pin in this dense-group state
    // must open it, not silently no-op.
    await expect(page.getByTestId('marker-popover-card')).toBeVisible({ timeout: 5_000 });
  });

  test('E5: panel lists all 29 areas and shows "Showing X of N areas on the map" with X < 29', async ({ page }) => {
    await stubDiscoverApis(page);

    await page.goto(groupResultsUrl());
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('area-group-level2')).toBeVisible({ timeout: 10_000 });

    for (const area of AREA_FIXTURES) {
      await expect(page.getByTestId(`browse-all-area-${area.areaKey}`)).toBeAttached();
    }

    const note = page.getByTestId('area-marker-shown-of-total-note');
    await expect(note).toBeVisible({ timeout: 10_000 });
    const text = await note.innerText();
    const match = /Showing (\d+) of (\d+) areas on the map/.exec(text);
    expect(match).not.toBeNull();
    const shown = Number(match?.[1]);
    const total = Number(match?.[2]);
    expect(total).toBe(TOTAL_AREAS);
    expect(shown).toBeLessThan(total);
  });

  test('E6: typing a matching area name in panel search promotes that area pin (forced-always) without navigating', async ({ page }) => {
    await stubDiscoverApis(page);

    await page.goto(groupResultsUrl());
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('area-group-level2')).toBeVisible({ timeout: 10_000 });

    // Pick an area that is NOT already a representative pin — search for a
    // low-rank member of the JakkurSW cluster (JakkurSW 1, listingCount=4,
    // the weakest member of that cell, per makeCluster's ascending counts).
    const target = AREA_FIXTURES.find((a) => a.name === 'JakkurSW 1');
    expect(target).toBeDefined();

    const searchInput = page.getByTestId('scoped-search-input');
    await searchInput.fill('JakkurSW 1');

    // Forced promotion is map-only (no camera move, no navigation) — URL must
    // stay on the same groupId route.
    await page.waitForTimeout(500);
    expect(page.url()).not.toContain('areaKey=');
    expect(page.url()).toContain(`groupId=${GROUP_ID}`);

    // The promoted area's full labelled pin becomes visible on the map.
    const promotedPin = page.locator('[data-testid="area-marker"]', { hasText: target!.name });
    await expect(promotedPin).toBeVisible({ timeout: 5_000 });
  });

  test('E7: citySlug scoping — school-mode panel search scopes requests to the deep-linked city', async ({ page }) => {
    await stubDiscoverApis(page);

    let schoolSearchCityParam: string | null = null;
    await page.route('**/api/public/schools/search**', (route) => {
      const url = new URL(route.request().url());
      schoolSearchCityParam = url.searchParams.get('city');
      return fulfillJson(route, []);
    });

    await page.goto(groupResultsUrl());
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('area-group-level2')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('search-mode-school').click();
    await page.getByTestId('scoped-search-input').fill('Delhi Public');

    await expect
      .poll(() => schoolSearchCityParam, { timeout: 5_000 })
      .toBe(CITY);
  });
});
