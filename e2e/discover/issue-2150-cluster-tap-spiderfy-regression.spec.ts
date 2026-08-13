import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * PR #2150 review finding A — owner-reported regression: "a listing cluster
 * can render, but tapping it no longer reliably performs the previous
 * progressive reveal behaviour" (no zoom/split, spiderfy fan gone), seen in
 * school-first with the selected-school/radius circle, and suspected in
 * area-first too.
 *
 * issue-1762-listing-density-clustering.spec.ts already covers this
 * extensively, but its cluster-tap/spiderfy tests use the LEGACY
 * `journey=area-first&areaKey=` URL scheme (no `node=`) — that file's own
 * "required browser evidence item 8" comment (~line 1138) documents this as
 * a KNOWN, pre-existing gap: without `node=`, `useAreasNavigationJourney`
 * never resolves an AREA node, so the canonical navigation-driven surfaces
 * (including, empirically, the area-marker layer visible alongside the
 * listing-cluster layer) fall back to city-overview data instead of the
 * stubbed fixture. That gap makes those particular tests unable to prove or
 * disprove today's real cluster-tap/spiderfy contract one way or the other.
 *
 * This spec re-runs the same #1762/#2139 acceptance criteria against the
 * CURRENT canonical URL contract (the same one the owner's own production
 * repro URL uses):
 *   - area-first, desktop, `node=`-qualified (splittable-groups tap-to-fit,
 *     and area-first + selected-school/radius overlay together).
 *   - school-first, MOBILE, with a genuine touch context (`hasTouch: true`
 *     + `isMobile: true` at a real 390x844 viewport, tap performed via
 *     `page.touchscreen.tap()` — not a resized desktop window and not a
 *     synthetic `.click()`/`dispatchEvent`). This is the axis combination
 *     (touch input + `journey=school-first`) the owner's actual regression
 *     report was filed against; the real-touch-tap-with-hit-test mechanism
 *     mirrors `issue-2149-mobile-school-first-marker-preview.spec.ts`'s
 *     `tapMarkerViaTouchscreen`, adapted here to tap a cluster bubble
 *     instead of an individual marker.
 * establishing whether the #1762/#2139 contract genuinely regressed on this
 * PR head, independent of the legacy-URL fixture gap.
 *
 * RESULT: the two area-first (desktop) tests below PASS. The mobile
 * school-first test was originally RED — it failed deterministically,
 * proving a real, confirmed regression, not a fixture or flakiness
 * artifact (see the isolated root-cause axis below). The regression was
 * traced to a false "has spatial spread" verdict in
 * `hasSpatialSpread()` (src/shared/map/areaClusterSplit.ts), whose
 * epsilon (1e-9) was too tight and raced the camera fit-to-bounds against
 * leaflet.markercluster's own spiderfy decision on coincident clusters.
 * Raising EPS to 1e-5 (matching the existing 5-decimal precedent in
 * `zoomPolicy.ts`'s `computeCoincidentMarkerOffsets`) resolved it. All
 * three tests in this file, including the mobile school-first test, now
 * PASS against that fix. See the comment directly above that test's
 * `describe` block for the isolated root-cause axis and confirmation.
 */

const CITY = 'bangalore';
const AREA_KEY = 'IN|KA|Bangalore|Cluster2150Test';
const AREA_NAME = 'Cluster 2150 Test Area';
const NODE_KEY = `a:${AREA_KEY}`;
const ENCODED_NODE_KEY = encodeURIComponent(NODE_KEY);

const CENTER_LAT = 13.05;
const CENTER_LON = 77.65;
const SPREAD_DEG = 0.03; // Well outside cluster radius once split — same order of magnitude as the #1762 spec's own TOP_CELL_SPACING_DEG.

const SCHOOL_ID = 'cluster-2150-school-1';

interface FixtureListing {
  id: string;
  propertyType: string;
  title: string;
  locality: string;
  pricePaise: number;
  lat: number;
  lon: number;
  listingPurpose: string;
}

function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/** `count` listings at effectively identical coordinates — never splittable, must spiderfy. */
function makeCoincidentListings(count: number, baseId: string, lat: number, lon: number): FixtureListing[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${baseId}-${i + 1}`,
    propertyType: 'house',
    title: `${baseId} Listing ${i + 1}`,
    locality: AREA_NAME,
    pricePaise: 5_000_000_00 + i * 10_000_00,
    lat: lat + i * 1e-7, // sub-metre jitter — never a real spatial spread.
    lon: lon + i * 1e-7,
    listingPurpose: 'sale',
  }));
}

/** Two well-separated groups of listings — the union should tap-fit/split, never spiderfy at the initial zoom. */
function makeSplittableGroups(): FixtureListing[] {
  const groupA = Array.from({ length: 4 }, (_, i) => ({
    id: `split-a-${i + 1}`,
    propertyType: 'house',
    title: `Split Group A ${i + 1}`,
    locality: AREA_NAME,
    pricePaise: 4_000_000_00,
    lat: CENTER_LAT - SPREAD_DEG,
    lon: CENTER_LON - SPREAD_DEG,
    listingPurpose: 'sale',
  }));
  const groupB = Array.from({ length: 4 }, (_, i) => ({
    id: `split-b-${i + 1}`,
    propertyType: 'apartment',
    title: `Split Group B ${i + 1}`,
    locality: AREA_NAME,
    pricePaise: 6_000_000_00,
    lat: CENTER_LAT + SPREAD_DEG,
    lon: CENTER_LON + SPREAD_DEG,
    listingPurpose: 'sale',
  }));
  return [...groupA, ...groupB];
}

async function stubAreaFirstFixture(page: Page, listings: FixtureListing[]): Promise<void> {
  const areasFixture = {
    city: CITY,
    areas: [
      {
        areaKey: AREA_KEY,
        name: AREA_NAME,
        geoCenterLat: CENTER_LAT,
        geoCenterLon: CENTER_LON,
        minLat: CENTER_LAT - SPREAD_DEG * 2,
        maxLat: CENTER_LAT + SPREAD_DEG * 2,
        minLon: CENTER_LON - SPREAD_DEG * 2,
        maxLon: CENTER_LON + SPREAD_DEG * 2,
        listingCount: listings.length,
        schoolCount: 0,
        trendDirection: 'stable',
      },
    ],
  };
  const cityListingsFixture = {
    city: CITY,
    limitPerArea: listings.length,
    areas: [{ areaKey: AREA_KEY, areaName: AREA_NAME, listings }],
  };
  const navigationResolveFixture = {
    requested: NODE_KEY,
    resolution: 'EXACT',
    revisionId: 1,
    node: {
      nodeKey: NODE_KEY,
      nodeType: 'AREA',
      displayLabel: AREA_NAME,
      depth: 1,
      regionKey: null,
      ancestry: [],
      nextLevelType: 'LISTINGS',
      children: [],
      revisionId: 1,
      bounds: {
        centreLat: CENTER_LAT,
        centreLon: CENTER_LON,
        minLat: CENTER_LAT - SPREAD_DEG * 2,
        maxLat: CENTER_LAT + SPREAD_DEG * 2,
        minLon: CENTER_LON - SPREAD_DEG * 2,
        maxLon: CENTER_LON + SPREAD_DEG * 2,
      },
      descendantAreaKeys: null,
      areaKey: AREA_KEY,
    },
  };
  const navigationCountsFixture = {
    nodeKey: NODE_KEY,
    count: listings.length,
    schoolCount: 0,
    areaCounts: { [AREA_KEY]: listings.length },
    areaSchoolCounts: { [AREA_KEY]: 0 },
    children: [],
    revisionId: 1,
  };

  await page.route('**/api/discover/areas**', (route) => fulfillJson(route, 200, areasFixture));
  await page.route('**/api/discover/cities/*/listings**', (route) => fulfillJson(route, 200, cityListingsFixture));
  await page.route('**/api/discover/listings**', (route) =>
    fulfillJson(route, 200, { content: [], page: 0, size: 50, totalElements: 0, totalPages: 0, aggregates: { topLocalities: [] } }),
  );
  await page.route('**/api/discover/markers**', (route) => fulfillJson(route, 401, {}));
  await page.route('**/api/discover/area-groups**', (route) => fulfillJson(route, 200, { city: CITY, groups: [] }));
  await page.route('**/api/discover/regional-area-groups**', (route) => fulfillJson(route, 200, { groups: [] }));
  await page.route('**/api/discover/agri-map-listings**', (route) => fulfillJson(route, 200, { listings: [] }));
  await page.route('**/api/discover/summary**', (route) =>
    fulfillJson(route, 200, { city: CITY, regions: [{ regionKey: 'north', label: 'North', areaKeys: [AREA_KEY] }] }),
  );
  await page.route('**/api/trends/options**', (route) =>
    fulfillJson(route, 200, { city: CITY, defaultAreas: [{ areaKey: AREA_KEY, areaLabel: AREA_NAME }] }),
  );
  await page.route('**/api/public/schools/popular**', (route) => fulfillJson(route, 200, []));
  await page.route('**/api/public/schools/search**', (route) => fulfillJson(route, 200, []));
  await page.route('**/api/public/schools/by-area**', (route) => fulfillJson(route, 200, []));
  await page.route('**/api/discover/cities/*/navigation/resolve**', (route) =>
    fulfillJson(route, 200, navigationResolveFixture),
  );
  await page.route('**/api/discover/cities/*/navigation/*/counts**', (route) =>
    fulfillJson(route, 200, navigationCountsFixture),
  );
}

function areaFirstNodeUrl(zoom = 13): string {
  return (
    `/discover?city=${CITY}&journey=area-first&areaKey=${encodeURIComponent(AREA_KEY)}&node=${ENCODED_NODE_KEY}` +
    `&lat=${CENTER_LAT}&lon=${CENTER_LON}&zoom=${zoom}`
  );
}

/**
 * The real production school-first URL shape (per #2149's own REPRO_URL /
 * live-verified contract): `journey=school-first` + `areaKey` + `schoolId` +
 * `radiusKm`, deliberately no `node=`/`lat`/`lon`/`zoom` hint — the
 * school-radius camera auto-fits on load regardless.
 */
function schoolFirstUrl(schoolId: string, radiusKm: string): string {
  return `/discover?city=${CITY}&journey=school-first&areaKey=${encodeURIComponent(AREA_KEY)}&schoolId=${schoolId}&radiusKm=${radiusKm}`;
}

function clusterLocator(page: Page) {
  return page.locator('.custom-marker-cluster');
}
function pinLocator(page: Page) {
  return page.locator('[data-testid="property-marker"]');
}

/**
 * Taps the first visible cluster bubble with a real `page.touchscreen.tap()`
 * — genuine touch input that goes through actual browser hit-testing, not a
 * synthesized DOM event. Adapted from `tapMarkerViaTouchscreen` in
 * issue-2149-mobile-school-first-marker-preview.spec.ts (added there per PR
 * #2150 review): re-measures the cluster's live bounding box on every
 * attempt and, before tapping, verifies via `document.elementFromPoint`
 * that the tap point actually resolves to the cluster element (or a
 * descendant of it) rather than tapping blind.
 */
async function tapClusterViaTouchscreen(page: Page): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 10; attempt++) {
    const cluster = clusterLocator(page).first();
    const visible = await cluster.isVisible().catch(() => false);
    if (!visible) {
      lastError = new Error('No cluster currently visible to tap');
      await page.waitForTimeout(300);
      continue;
    }

    const box = await cluster.boundingBox().catch(() => null);
    if (!box) {
      lastError = new Error('Cluster has no bounding box (not attached/visible)');
      await page.waitForTimeout(300);
      continue;
    }
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    const clusterHandle = await cluster.elementHandle().catch(() => null);
    if (!clusterHandle) {
      lastError = new Error('Cluster elementHandle not resolvable');
      await page.waitForTimeout(300);
      continue;
    }

    const hitsIntendedCluster = await page.evaluate(
      ({ px, py, clusterEl }) => {
        const hit = document.elementFromPoint(px, py);
        if (!hit) return false;
        return hit === clusterEl || clusterEl.contains(hit);
      },
      { px: x, py: y, clusterEl: clusterHandle },
    );
    await clusterHandle.dispose();

    if (!hitsIntendedCluster) {
      lastError = new Error(
        `elementFromPoint(${x}, ${y}) did not resolve to the cluster or a descendant — stale box or an overlay on top of it`,
      );
      await page.waitForTimeout(300);
      continue;
    }

    try {
      await page.touchscreen.tap(x, y);
      return;
    } catch (err) {
      lastError = err;
      await page.waitForTimeout(300);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('tapClusterViaTouchscreen: exhausted retries');
}

async function dismissConsentBannerIfPresent(page: Page): Promise<void> {
  const banner = page.getByTestId('discover-consent-banner');
  if (await banner.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await banner.getByRole('button', { name: /accept/i }).click();
    await expect(banner).not.toBeVisible();
  }
}

async function gotoAreaFirst(page: Page, listings: FixtureListing[], zoom = 13): Promise<void> {
  await stubAreaFirstFixture(page, listings);
  const listingsResponse = page.waitForResponse(
    (res) => res.url().includes('/api/discover/cities/') && res.url().includes('/listings') && res.status() === 200,
  );
  await page.goto(areaFirstNodeUrl(zoom));
  await listingsResponse;
  await dismissConsentBannerIfPresent(page);
  await page.waitForLoadState('networkidle');
}

// NOTE: an area-first-only variant of the coincident-cluster spiderfy case
// below (8 coincident listings as the SOLE content of a freshly cold-
// navigated `node=` AREA, no school/radius involved) was investigated here
// and found to intermittently collapse the spiderfy fan back to zero
// members within ~1s of opening, on BOTH this PR's head AND a pre-#2142
// baseline checkout (commit 698abcee, the parent of the entire #2142
// refactor chain) — byte-identical failure signature on both. That rules
// out #2142 and #2150 as the cause; it is a pre-existing latent issue
// specific to a single area whose ENTIRE listing set is one degenerate
// coincident cluster (a synthetic edge case — real listings are never
// perfectly coincident, and the school-radius+coincident-cluster case
// directly below, which IS representative of the owner's actual repro
// path, spiderfies reliably). Flagged as a separate out-of-scope follow-up
// rather than papered over with a flaky/skipped test here.
test.describe('PR #2150 review finding A — cluster tap / spiderfy, canonical node= contract', () => {
  test('desktop — splittable cluster tap fits/zooms to member bounds, never a no-op', async ({ page }) => {
    await gotoAreaFirst(page, makeSplittableGroups(), 11);

    const cluster = clusterLocator(page);
    await expect(cluster.first()).toBeVisible({ timeout: 15_000 });

    await cluster.first().click();

    // A splittable cluster tap must change the DOM (fit-to-bounds zoom) by
    // actually producing individual member pins — never the exact same
    // single unsplit cluster with no visible change, which is the
    // owner-reported "Tap to zoom in appears ineffective" regression shape.
    // (Previously this also accepted `clusters > beforeCount || clusters <
    // beforeCount`, which is satisfied by almost any cluster-count mutation
    // and doesn't prove a fit/zoom to the tapped cluster's own members —
    // tightened per PR #2150 review finding 2 to require real pins.)
    await expect.poll(async () => pinLocator(page).count(), { timeout: 10_000 }).toBeGreaterThan(0);
  });

  test('desktop — selected-school/radius overlay does not suppress cluster tap/spiderfy', async ({ page }) => {
    const school = {
      id: SCHOOL_ID,
      name: 'Cluster 2150 School',
      board: 'CBSE',
      boardType: null,
      address: 'Bangalore',
      latitude: CENTER_LAT,
      longitude: CENTER_LON,
      distanceKm: 0,
      areaKey: AREA_KEY,
    };
    const coincident = makeCoincidentListings(8, 'sch', CENTER_LAT + 0.001, CENTER_LON + 0.001);
    await stubAreaFirstFixture(page, coincident);
    await page.route('**/api/public/schools/search**', (route) => fulfillJson(route, 200, [school]));
    await page.route(`**/api/public/schools/${SCHOOL_ID}`, (route) => fulfillJson(route, 200, school));
    await page.route('**/api/public/schools/by-area**', (route) => fulfillJson(route, 200, [school]));
    await page.route('**/api/discover/cities/*/school-radius-listings**', (route) =>
      fulfillJson(route, 200, { content: [], page: 0, size: 50, hasMore: false }),
    );

    const radiusUrl =
      `/discover?city=${CITY}&journey=area-first&areaKey=${encodeURIComponent(AREA_KEY)}&node=${ENCODED_NODE_KEY}` +
      `&lat=${CENTER_LAT}&lon=${CENTER_LON}&zoom=14&schoolId=${SCHOOL_ID}&radiusKm=3`;
    const radiusResponse = page.waitForResponse(
      (res) => res.url().includes('/school-radius-listings') && res.status() === 200,
    );
    await page.goto(radiusUrl);
    await radiusResponse;
    await dismissConsentBannerIfPresent(page);
    await page.waitForLoadState('networkidle');

    // Radius circle present — genuinely the school+radius-combined state.
    await expect(page.locator('.leaflet-overlay-pane path.leaflet-interactive')).toHaveCount(1, {
      timeout: 15_000,
    });

    const cluster = clusterLocator(page);
    await expect(cluster.first()).toBeVisible({ timeout: 15_000 });
    await cluster.first().click();

    const spiderfiedMarkers = pinLocator(page);
    await expect(spiderfiedMarkers).toHaveCount(8, { timeout: 10_000 });
    // Radius circle must still be present/unaffected by the cluster interaction.
    await expect(page.locator('.leaflet-overlay-pane path.leaflet-interactive')).toHaveCount(1);
  });
});

const MOBILE_VIEWPORT = { width: 390, height: 844 };

// CONFIRMED REGRESSION, NOW FIXED (was not a fixture/flakiness artifact):
// this test originally FAILED deterministically on the pre-fix PR head (3
// consecutive full runs + a --repeat-each=2 run, all identical: 0 property
// markers after the tap, expected 8). Isolated the failing axis by
// bisecting the two variables the owner's report combines:
//   - journey=school-first + a SPLITTABLE (non-coincident) cluster: the tap
//     correctly zoom-fits and reveals members (verified 4/8 revealed from a
//     2-group splittable fixture, both on real mobile touch AND on a plain
//     desktop `.click()` — this half of the contract is NOT broken).
//   - journey=school-first + a perfectly COINCIDENT cluster (the case that
//     requires the spiderfy fan, since it cannot be split by zooming): the
//     tap collapses the cluster (`.custom-marker-cluster` count 1 -> 0
//     within ~200-300ms) and NO spiderfy fan / member pins ever appear —
//     reproduces identically with a real mobile `page.touchscreen.tap()`
//     AND with a plain desktop `.click()` at a desktop viewport, so this is
//     NOT touch/mobile-specific despite the owner's mobile report; it is
//     `journey=school-first`-specific. No network requests fire after the
//     tap (confirmed via request/response listeners), so this is a
//     client-side rendering regression, not a fixture/stub gap. The
//     structurally equivalent desktop test above
//     ("selected-school/radius overlay does not suppress cluster
//     tap/spiderfy", `journey=area-first` + schoolId/radiusKm params) DOES
//     spiderfy correctly with the same coincident-listing shape, which
//     narrows this specifically to `journey=school-first`'s own map/cluster
//     wiring rather than the coincident-cluster case in general.
// Per this repo's bug-fix protocol, this test was left RED on the pre-fix
// PR head (reproduce -> confirm fail) rather than fixed by inspection. The
// fix landed in this same PR: `hasSpatialSpread()`'s EPS was raised from
// 1e-9 to 1e-5 in src/shared/map/areaClusterSplit.ts (see file header for
// details). This test — the actual #2150 regression the owner reported —
// now PASSES against that fix, confirming it resolves the coincident-cluster
// collapse. Assertions below are unchanged/unweakened from the original red
// run; only this comment and the file header were updated to reflect the
// current (fixed) state.
test.describe('PR #2150 review finding A — mobile school-first, real touchscreen tap', () => {
  test.use({ viewport: MOBILE_VIEWPORT, hasTouch: true, isMobile: true });

  test('mobile — school-first radius overlay, real touchscreen.tap spiderfies a coincident cluster', async ({
    page,
  }) => {
    const school = {
      id: SCHOOL_ID,
      name: 'Cluster 2150 School',
      board: 'CBSE',
      boardType: null,
      address: 'Bangalore',
      latitude: CENTER_LAT,
      longitude: CENTER_LON,
      distanceKm: 0,
      areaKey: AREA_KEY,
    };
    const coincident = makeCoincidentListings(8, 'sch-mobile', CENTER_LAT + 0.001, CENTER_LON + 0.001);
    await stubAreaFirstFixture(page, coincident);
    await page.route('**/api/public/schools/search**', (route) => fulfillJson(route, 200, [school]));
    await page.route(`**/api/public/schools/${SCHOOL_ID}`, (route) => fulfillJson(route, 200, school));
    await page.route('**/api/public/schools/by-area**', (route) => fulfillJson(route, 200, [school]));
    // Unlike area-first (whose map is driven by the area's city-listings
    // fixture regardless of school/radius), school-first's map/list are both
    // driven by this endpoint — it must actually carry the coincident
    // listings for a cluster to render. Shape per
    // `PublicSchoolRadiusListingCard`/`useSchoolRadiusListings.ts`: flat
    // `latitude`/`longitude` (not nested), anon `priceBand` (not
    // `pricePaise`).
    const schoolRadiusContent = coincident.map((listing) => ({
      id: listing.id,
      listingNumber: null,
      propertyType: listing.propertyType,
      title: listing.title,
      locality: listing.locality,
      areaKey: AREA_KEY,
      priceBand: 'UNDER_50L',
      landArea: null,
      landAreaUnit: null,
      builtArea: null,
      builtAreaUnit: null,
      bedrooms: null,
      latitude: listing.lat,
      longitude: listing.lon,
      heroImageUrl: null,
      listingPurpose: listing.listingPurpose,
      possessionStatus: null,
      daysOnMarket: null,
      backOnMarket: false,
      createdAt: '2026-08-01T00:00:00Z',
    }));
    await page.route('**/api/discover/cities/*/school-radius-listings**', (route) =>
      fulfillJson(route, 200, { content: schoolRadiusContent, page: 0, size: 50, hasMore: false }),
    );

    const radiusResponse = page.waitForResponse(
      (res) => res.url().includes('/school-radius-listings') && res.status() === 200,
    );
    await page.goto(schoolFirstUrl(SCHOOL_ID, '3'));
    await radiusResponse;
    await dismissConsentBannerIfPresent(page);
    await page.waitForLoadState('networkidle');

    // School-first defaults to the list surface on mobile (same as #2149) —
    // enter Map mode via the same universal control-bar-map-trigger.
    const mapTrigger = page.getByTestId('control-bar-map-trigger');
    await expect(mapTrigger).toBeVisible({ timeout: 15_000 });
    await mapTrigger.click();
    await expect(page.getByTestId('mobile-map-close-list-button')).toBeVisible({ timeout: 10_000 });

    // Radius circle present — genuinely the school+radius-combined state.
    await expect(page.locator('.leaflet-overlay-pane path.leaflet-interactive')).toHaveCount(1, {
      timeout: 15_000,
    });

    const cluster = clusterLocator(page);
    await expect(cluster.first()).toBeVisible({ timeout: 15_000 });

    // The real regression axis: a genuine touch tap (not `.click()`/
    // `dispatchEvent`), at a real mobile viewport, on a school-first cluster
    // with the radius overlay active.
    await tapClusterViaTouchscreen(page);

    const spiderfiedMarkers = pinLocator(page);
    await expect(spiderfiedMarkers).toHaveCount(8, { timeout: 10_000 });
    // Radius circle must still be present/unaffected by the cluster interaction.
    await expect(page.locator('.leaflet-overlay-pane path.leaflet-interactive')).toHaveCount(1);
  });
});
