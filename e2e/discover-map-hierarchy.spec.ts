/**
 * E2E: Issue #1745 Batch B — map-hierarchy fix.
 *
 * `selectDiscoverMapLayer()` (src/utils/discoverLayerRegistry.ts) is the single pure
 * rule deciding which family of map markers MapDiscovery renders for a given URL
 * state + zoom bucket. This spec exercises the cross-layer (URL state → backend
 * fixture → rendered map markers → right-panel) flow the unit/component suites below
 * cannot reach on their own:
 *
 *   - tests/discover/map-layer-derivation.test.ts (27 tests — pure derivation + edge cases)
 *   - src/pages/__tests__/MapDiscovery.issue1745-batchB-overviewClick.test.tsx
 *     (bubble click sets scope not areaKey; region-zone pill sets real areaKey)
 *   - tests/discover/marker-popover-1738-gating.test.ts (#1738 gating contract)
 *
 * MH-4 (#1738 re-verify) is NOT duplicated here — the existing
 * e2e/discover-1738-regression.spec.ts already exercises the exact procedure
 * (radius overlay + marker click + popup + dismiss-cycle) against the ONLY state
 * where it applies (journey=area-first, area-school-combined); see that file's
 * header comment for the ground-truth justification. Re-run it alongside this file.
 *
 * #1956 PR-6 (C10 cleanup): the single Areas-legacy test that used to live here
 * ("area-first group landing renders the same group bubbles…") was removed —
 * its subject (legacy AreaGroup* panels / groupId= drill-down) is deleted.
 * This #1738 pointer note is unrelated to that removal and is preserved as-is;
 * MH-1/MH-2/MH-2b/MH-3, the agri corridor regression, and the 4-level lockstep
 * test below are the surviving non-Areas coverage this file exists for.
 *
 * Backend-free: stubs all API calls via page.route (established repo pattern).
 *
 * Run:
 *   PLAYWRIGHT_BASE_URL=http://localhost:5183 npx playwright test \
 *     e2e/discover-map-hierarchy.spec.ts --project=full
 */

import { test, expect, type Page, type Route } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { grantDiscoverConsent } from './helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SS = (name: string) => path.join(__dirname, `../screenshots/discover-map-hierarchy-${name}.png`);

const CITY = 'udupi';

const MANIPAL_KEY = 'IN|KA|Udupi|Manipal';
const UDYAVAR_KEY = 'IN|KA|Udupi|Udyavar';
const KATAPADI_KEY = 'IN|KA|Udupi|Katapadi';
const MALPE_KEY = 'IN|KA|Udupi|Malpe';

const SOUTH_GROUP = 'south-udupi';
const COASTAL_GROUP = 'coastal-belt';

function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

const TRENDS_OPTIONS_FIXTURE = {
  city: CITY,
  defaultAreas: [{ areaKey: MANIPAL_KEY, areaLabel: 'Manipal' }],
};

// listingCounts: Manipal 5, Udyavar 3, Katapadi 2, Malpe 4 — south-udupi totals 10,
// coastal-belt totals 4. Both are non-zero so both macro-region bubbles render.
const DISCOVER_AREAS_FIXTURE = {
  city: CITY,
  areas: [
    { areaKey: MANIPAL_KEY, name: 'Manipal', geoCenterLat: 13.3509, geoCenterLon: 74.7932, minLat: 13.33, maxLat: 13.38, minLon: 74.77, maxLon: 74.82, listingCount: 5, schoolCount: 6, trendDirection: 'stable' },
    { areaKey: UDYAVAR_KEY, name: 'Udyavar', geoCenterLat: 13.28, geoCenterLon: 74.79, minLat: 13.26, maxLat: 13.30, minLon: 74.77, maxLon: 74.81, listingCount: 3, schoolCount: 2, trendDirection: 'stable' },
    { areaKey: KATAPADI_KEY, name: 'Katapadi', geoCenterLat: 13.33, geoCenterLon: 74.75, minLat: 13.31, maxLat: 13.35, minLon: 74.73, maxLon: 74.77, listingCount: 2, schoolCount: 1, trendDirection: 'stable' },
    { areaKey: MALPE_KEY, name: 'Malpe', geoCenterLat: 13.35, geoCenterLon: 74.70, minLat: 13.33, maxLat: 13.37, minLon: 74.68, maxLon: 74.72, listingCount: 4, schoolCount: 3, trendDirection: 'stable' },
  ],
};

// Backend DTO shape for /api/discover/area-groups (raw camelCase fields — see
// AreaGroupDTO in src/hooks/useAreaGroups.ts). 2 groups: south-udupi (3 member areas)
// and coastal-belt (1 member area) — chosen so the region-zone-areas drill-down
// (3 pills) is strictly MORE than the macro-region-bubble count (2 pills).
const AREA_GROUPS_FIXTURE = {
  city: CITY,
  groups: [
    {
      slug: SOUTH_GROUP,
      name: 'South Udupi',
      areaKeys: [MANIPAL_KEY, UDYAVAR_KEY, KATAPADI_KEY],
      focusLat: 13.31,
      focusLon: 74.78,
    },
    {
      slug: COASTAL_GROUP,
      name: 'Coastal Belt',
      areaKeys: [MALPE_KEY],
      focusLat: 13.35,
      focusLon: 74.70,
    },
  ],
};

// Backend-owned region counts (Issue #1745 P5/P7 — /api/discover/summary). Counts are
// NOT client-summed — deliberately distinct from any naive sum a regression could
// reintroduce (10 and 4 do coincide with the area listingCount sums above, which is
// the CORRECT backend behaviour being asserted; the point is the bubble reads THESE
// values, not a frontend recomputation — see AC7 in discoverLayerRegistry.ts).
const SUMMARY_FIXTURE = {
  city: CITY,
  propertyType: null,
  groupBy: 'area_group',
  totalActiveListings: 14,
  regions: [
    { regionKey: SOUTH_GROUP, regionLabel: 'South Udupi', listingCount: 10 },
    { regionKey: COASTAL_GROUP, regionLabel: 'Coastal Belt', listingCount: 4 },
  ],
  hotspots: [],
  generatedAt: '2026-07-01T00:00:00Z',
};

const CITY_LISTINGS_FIXTURE = { city: CITY, limitPerArea: 50, areas: [] };
const EMPTY_LISTINGS_PAGE = { content: [], page: 0, size: 50, totalElements: 0, totalPages: 0, aggregates: { topLocalities: [] } };

async function stubResidentialRoutes(page: Page): Promise<void> {
  await grantDiscoverConsent(page);
  await page.route('**/api/trends/options**', (r) => fulfillJson(r, 200, TRENDS_OPTIONS_FIXTURE));
  await page.route('**/api/discover/areas**', (r) => fulfillJson(r, 200, DISCOVER_AREAS_FIXTURE));
  await page.route('**/api/discover/area-groups**', (r) => fulfillJson(r, 200, AREA_GROUPS_FIXTURE));
  await page.route('**/api/discover/summary**', (r) => fulfillJson(r, 200, SUMMARY_FIXTURE));
  await page.route('**/api/discover/cities/*/listings**', (r) => fulfillJson(r, 200, CITY_LISTINGS_FIXTURE));
  await page.route('**/api/discover/listings**', (r) => fulfillJson(r, 200, EMPTY_LISTINGS_PAGE));
  await page.route('**/api/discover/markers**', (r) => fulfillJson(r, 200, { city: CITY, markers: [], truncated: false, returnedElements: 0 }));
  await page.route('**/api/public/schools/popular**', (r) => fulfillJson(r, 200, []));
  await page.route('**/api/public/schools/search**', (r) => fulfillJson(r, 200, []));
  await page.route('**/api/public/schools/by-area**', (r) => fulfillJson(r, 200, []));
}

const AREA_MARKER = '[data-testid="area-marker"]';

function landingUrl(extra: Record<string, string> = {}): string {
  const sp = new URLSearchParams({ city: CITY, ...extra });
  return `/discover?${sp.toString()}`;
}

test.describe('Issue #1745 Batch B — map hierarchy (macro-region bubbles / region-zone drill-down)', () => {
  test('MH-1: journeyless city landing renders a BOUNDED set of macro-region bubbles, not the full area set', async ({ page }) => {
    await stubResidentialRoutes(page);
    await page.goto(landingUrl());
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByTestId('guided-entry-panel')).toBeVisible({ timeout: 10_000 });

    const markers = page.locator(AREA_MARKER);
    await expect(markers.first()).toBeVisible({ timeout: 15_000 });

    // Bounded: exactly the 2 macro-region groups, never the 4 individual areas
    // (the pre-fix bug fell through to ~100 area pills on the real city).
    await expect(markers).toHaveCount(2);
    expect(await markers.count()).toBeLessThanOrEqual(10);

    // Labels + counts on the map must match the backend-owned summary regions shown
    // in the right panel (not a frontend recomputation).
    await expect(page.locator(AREA_MARKER, { hasText: 'South Udupi' })).toContainText('10 properties');
    await expect(page.locator(AREA_MARKER, { hasText: 'Coastal Belt' })).toContainText('4 properties');

    const regionsGrid = page.getByTestId('guided-entry-regions-grid');
    await expect(regionsGrid).toBeVisible({ timeout: 10_000 });
    await expect(regionsGrid.getByRole('button', { name: /South Udupi/ })).toContainText('10 properties');
    await expect(regionsGrid.getByRole('button', { name: /Coastal Belt/ })).toContainText('4 properties');

    await page.screenshot({ path: SS('mh1-before-macro-bubbles'), fullPage: false });
  });

  test('MH-2: selecting a region via the right-panel card sets scope=, drills into that region\'s member-area pills, and does not change panel routing', async ({ page }) => {
    await stubResidentialRoutes(page);
    await page.goto(landingUrl());
    await page.waitForLoadState('domcontentloaded');

    await expect(page.locator(AREA_MARKER)).toHaveCount(2, { timeout: 15_000 });
    await page.screenshot({ path: SS('mh2-before-bubbles'), fullPage: false });

    const regionsGrid = page.getByTestId('guided-entry-regions-grid');
    await regionsGrid.getByRole('button', { name: /South Udupi/ }).click();

    await expect(page).toHaveURL(/[?&]scope=south-udupi\b/, { timeout: 10_000 });

    // Region-zone drill-down: the 3 real member-area pills, strictly MORE than the
    // 2-bubble macro view, and bounded to south-udupi only (Coastal Belt/Malpe absent).
    const markers = page.locator(AREA_MARKER);
    await expect(markers).toHaveCount(3, { timeout: 10_000 });
    await expect(page.locator(AREA_MARKER, { hasText: 'Manipal' })).toBeVisible();
    await expect(page.locator(AREA_MARKER, { hasText: 'Udyavar' })).toBeVisible();
    await expect(page.locator(AREA_MARKER, { hasText: 'Katapadi' })).toBeVisible();
    await expect(page.locator(AREA_MARKER, { hasText: 'Malpe' })).toHaveCount(0);
    await expect(page.locator(AREA_MARKER, { hasText: 'Coastal Belt' })).toHaveCount(0);

    // Panel routing must NOT leak from scope selection — still the guided-entry panel,
    // not some new "scoped" panel variant.
    await expect(page.getByTestId('guided-entry-panel')).toBeVisible();

    await page.screenshot({ path: SS('mh2-after-region-zone'), fullPage: false });
  });

  test('MH-2b: clicking a macro-region bubble directly on the map also sets scope= (not areaKey) and drills into that region', async ({ page }) => {
    await stubResidentialRoutes(page);
    await page.goto(landingUrl());
    await page.waitForLoadState('domcontentloaded');

    const bubble = page.locator(AREA_MARKER, { hasText: 'South Udupi' });
    await expect(bubble).toBeVisible({ timeout: 15_000 });
    await bubble.click({ force: true });

    await expect(page).toHaveURL(/[?&]scope=south-udupi\b/, { timeout: 10_000 });
    // Not routed through the areaKey path — no real areaKey should ever be
    // 'south-udupi' (that's a group id, not a discoverAreas areaKey).
    await expect(page).not.toHaveURL(/[?&]areaKey=/);

    await expect(page.locator(AREA_MARKER)).toHaveCount(3, { timeout: 10_000 });
  });

  test('MH-3: back-navigation clears scope and the map reverts to macro-region bubbles', async ({ page }) => {
    await stubResidentialRoutes(page);

    // Entry A: no scope — macro-region bubbles.
    await page.goto(landingUrl());
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator(AREA_MARKER)).toHaveCount(2, { timeout: 15_000 });

    // Entry B: a full navigation (separate history entry) to scope=south-udupi —
    // region-zone-areas drill-down.
    await page.goto(landingUrl({ scope: SOUTH_GROUP }));
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator(AREA_MARKER)).toHaveCount(3, { timeout: 15_000 });

    // Back: scope cleared, bubbles restored.
    await page.goBack();
    await page.waitForLoadState('domcontentloaded');
    await expect(page).not.toHaveURL(/[?&]scope=/);
    await expect(page.locator(AREA_MARKER)).toHaveCount(2, { timeout: 15_000 });
    await expect(page.locator(AREA_MARKER, { hasText: 'South Udupi' })).toBeVisible();
    await expect(page.locator(AREA_MARKER, { hasText: 'Coastal Belt' })).toBeVisible();

    await page.screenshot({ path: SS('mh3-after-back-macro-bubbles'), fullPage: false });
  });

  test('journey regression — agri corridor landing shows corridor bubbles only, no residential region/area pills', async ({ page }) => {
    await stubResidentialRoutes(page);
    // Empty residential groups/summary for this test — any area-marker present must
    // come from the agri corridor branch, never a residential-region leak.
    await page.route('**/api/discover/area-groups**', (r) => fulfillJson(r, 200, { city: CITY, groups: [] }));
    await page.route('**/api/discover/summary**', (r) => fulfillJson(r, 200, { ...SUMMARY_FIXTURE, regions: [] }));

    const AGRI_AREA_KEY = 'IN|KA|Udupi|Herga';
    await page.route('**/api/discover/regional-area-groups**', (r) =>
      fulfillJson(r, 200, {
        city: CITY,
        groups: [
          {
            directionKey: 'N',
            distanceBandKey: '10_25',
            label: 'North Corridor — 10–25 km',
            agriListingCount: 6,
            agriAcreage: 12.5,
            areaKeys: [AGRI_AREA_KEY],
          },
        ],
      }),
    );
    await page.route('**/api/discover/agri-areas**', (r) =>
      fulfillJson(r, 200, [{ areaKey: AGRI_AREA_KEY, name: 'Herga', geoCenterLat: 13.4, geoCenterLon: 74.8, listingCount: 6 }]),
    );
    await page.route('**/api/discover/agri-map-listings**', (r) => fulfillJson(r, 200, { content: [], totalElements: 0 }));

    await page.goto(landingUrl({ journey: 'agri-first' }));
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10_000 });

    // No residential region/area pills leak into the agri corridor landing.
    await expect(page.locator(AREA_MARKER, { hasText: 'South Udupi' })).toHaveCount(0);
    await expect(page.locator(AREA_MARKER, { hasText: 'Coastal Belt' })).toHaveCount(0);
    await expect(page.locator(AREA_MARKER, { hasText: 'Manipal' })).toHaveCount(0);
  });

  test('4-level hierarchy lockstep (Bangalore) — city -> macro-region -> zone/corridor -> area', async ({ page }) => {
    const BLR_YEL = 'IN|KA|Bangalore|Yelahanka';
    const BLR_DEV = 'IN|KA|Bangalore|Devanahalli';
    const BLR_HEB = 'IN|KA|Bangalore|Hebbal';

    await page.route('**/api/trends/options**', (r) => fulfillJson(r, 200, { city: 'bangalore', defaultAreas: [] }));
    await page.route('**/api/discover/areas**', (r) =>
      fulfillJson(r, 200, {
        city: 'bangalore',
        areas: [
          { areaKey: BLR_YEL, name: 'Yelahanka', geoCenterLat: 13.1, geoCenterLon: 77.59, minLat: 13.08, maxLat: 13.12, minLon: 77.57, maxLon: 77.61, listingCount: 15, schoolCount: 2, trendDirection: 'stable' },
          { areaKey: BLR_DEV, name: 'Devanahalli', geoCenterLat: 13.25, geoCenterLon: 77.7, minLat: 13.23, maxLat: 13.27, minLon: 77.68, maxLon: 77.72, listingCount: 10, schoolCount: 1, trendDirection: 'stable' },
          { areaKey: BLR_HEB, name: 'Hebbal', geoCenterLat: 13.03, geoCenterLon: 77.58, minLat: 13.01, maxLat: 13.05, minLon: 77.56, maxLon: 77.6, listingCount: 5, schoolCount: 3, trendDirection: 'stable' },
        ],
      }),
    );
    await page.route('**/api/discover/area-groups**', (r) =>
      fulfillJson(r, 200, {
        city: 'bangalore',
        groups: [
          { slug: 'airport-belt', name: 'Airport Belt', regionLabel: 'North Bangalore', areaKeys: [BLR_YEL, BLR_DEV], focusLat: 13.17, focusLon: 77.64 },
          { slug: 'hebbal-belt', name: 'Hebbal Belt', regionLabel: 'North Bangalore', areaKeys: [BLR_HEB], focusLat: 13.03, focusLon: 77.58 },
        ],
      }),
    );
    await page.route('**/api/discover/summary**', (r) =>
      fulfillJson(r, 200, {
        city: 'bangalore',
        propertyType: null,
        groupBy: 'area_group',
        totalActiveListings: 30,
        regions: [{ regionKey: 'north', regionLabel: 'North Bangalore', listingCount: 30 }],
        hotspots: [],
        generatedAt: '2026-07-01T00:00:00Z',
      }),
    );
    await page.route('**/api/discover/cities/*/listings**', (r) => fulfillJson(r, 200, { city: 'bangalore', limitPerArea: 50, areas: [] }));
    await page.route('**/api/discover/listings**', (r) => fulfillJson(r, 200, EMPTY_LISTINGS_PAGE));
    await page.route('**/api/discover/markers**', (r) => fulfillJson(r, 200, { city: 'bangalore', markers: [], truncated: false, returnedElements: 0 }));

    // Level 1: City Landing -> Macro-region bubbles only
    await page.goto('/discover?city=bangalore');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator(AREA_MARKER, { hasText: 'North Bangalore' })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(AREA_MARKER, { hasText: 'Airport Belt' })).toHaveCount(0);
    await expect(page.locator(AREA_MARKER, { hasText: 'Hebbal Belt' })).toHaveCount(0);
    await expect(page.locator(AREA_MARKER, { hasText: 'Yelahanka' })).toHaveCount(0);

    // Level 2: Click macro-region -> Zone/corridor bubbles inside North Bangalore
    await page.locator(AREA_MARKER, { hasText: 'North Bangalore' }).click();
    await expect(page.locator(AREA_MARKER, { hasText: 'Airport Belt' })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(AREA_MARKER, { hasText: 'Hebbal Belt' })).toBeVisible();
    await expect(page.locator(AREA_MARKER, { hasText: 'North Bangalore' })).toHaveCount(0);
    await expect(page.locator(AREA_MARKER, { hasText: 'Yelahanka' })).toHaveCount(0);

    // Level 3: Click zone/corridor -> Area pills inside Airport Belt
    await page.locator(AREA_MARKER, { hasText: 'Airport Belt' }).click();
    await expect(page.locator(AREA_MARKER, { hasText: 'Yelahanka' })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(AREA_MARKER, { hasText: 'Devanahalli' })).toBeVisible();
    await expect(page.locator(AREA_MARKER, { hasText: 'Hebbal Belt' })).toHaveCount(0);
  });
});
