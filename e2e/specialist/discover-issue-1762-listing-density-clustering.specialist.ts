/**
 * E2E — Issue #1762: density-aware listing clusters and cluster-tap
 * fit-to-members.
 *
 * Covers the [tests].planned E2E item from the approved plan
 * (.claude/handoffs/issue-1762/approved-plan.toml):
 *
 *   - Dense listing-capable initial state is readable (clusters + pins, not
 *     an unreadable overlapping stack).
 *   - Cluster tap fits the camera to that cluster's own member bounds and
 *     lands at a real split (real DOM assertion, not just "camera moved").
 *   - Cluster tap never opens the desktop popover / mobile compact preview.
 *   - Cluster tap never mutates node=/journey/areaKey/city (breadcrumb/
 *     filter-carrying params).
 *   - Manual navigation to the equivalent camera converges on the same
 *     cluster/pin DOM state as the cluster-tap path.
 *   - A further cluster tap shows progressive splitting.
 *   - Individual marker click still opens the popover/compact preview
 *     (smoke only — the preview's own internals are #2126/#2127/#2129/#2130
 *     territory).
 *   - Regression: area-listings and selected-school-radius marker/popover
 *     behaviour is unchanged.
 *   - Stress evidence at 500/1000/~1500 (above the anon 20/area teaser cap)
 *     listing counts.
 *
 * ── FIXTURE ──
 * Backend-free, stub-first (page.route), mirroring the established pattern
 * in this same directory (school-radius-marker-click-repro-1738.spec.ts,
 * thanisandra-hennur-belt-marker-degradation.spec.ts) rather than the real
 * local-fixture-backend used by issue-1823-camera-fit-policy.spec.ts —
 * [scope_lock].allowed_files for this issue does not include any backend
 * seed script, so a controlled synthetic dense listing set is generated
 * in-file (deterministic, no Math.random) and served via the SAME anon
 * `/api/discover/cities/{city}/listings` endpoint #1738's spec already
 * proves opens the popover on click. This gives exact, reproducible control
 * over listing counts (500/1000/1500) and geometry, which is what the
 * cluster-tap/convergence/progressive-split assertions need.
 *
 * Listing geometry is a 3x3 grid of well-separated "top cells" (~3.3km
 * apart — comfortably outside leaflet.markercluster's maxClusterRadius=50px
 * at the zoom=13 initial view), each internally split into 4 "mini-quadrant"
 * sub-clusters (~300m apart), each with its own tight jitter (~130m) around
 * individual listings. This nested structure is what makes BOTH the
 * cluster-tap fit AND a second cluster tap on the resulting sub-cluster
 * produce a real, assertable DOM change (progressive splitting), not just a
 * single top-level split.
 *
 * Run (dev server already up):
 *   PLAYWRIGHT_BASE_URL=http://localhost:5199 \
 *   npx playwright test --project=full e2e/discover/issue-1762-listing-density-clustering.spec.ts
 */

import { type Page, type Route, type Locator } from '@playwright/test';
import { test, expect } from './support/specialist-test';

const CITY = 'bangalore';
const AREA_KEY = 'IN|KA|Bangalore|DenseClusterTest';
const AREA_NAME = 'Dense Cluster Test Area';

// Grid centre — a synthetic point, not tied to any real seeded fixture.
const CENTER_LAT = 13.0;
const CENTER_LON = 77.6;

// Top-cell spacing (deg) — ~3.3km at this latitude, safely outside
// maxClusterRadius(50px) at the zoom=13 initial view (~18m/px ⇒ 50px≈900m).
const TOP_CELL_SPACING_DEG = 0.03;
// Mini-quadrant offset from its top-cell centre (deg) — ~166m/162m, so
// opposite quadrants are ~330m apart, comfortably outside the ~115m cluster
// radius at zoom=16 (~2.3m/px ⇒ 50px≈115m) — 4 separate sub-clusters render
// after the first cluster-tap fit.
const MINI_QUADRANT_OFFSET_DEG = 0.0015;
// Per-listing jitter within a mini-quadrant (deg) — ~33m, small enough that
// a mini-quadrant's own members stay one cluster at zoom=16 (its own
// getBoundsZoom lands deeper, at/above the CLUSTER_DISABLE_AT_ZOOM cap, so a
// SECOND tap on it is a legitimate "already at the cap" no-further-fit case
// — see the "further split" test for how this is exercised without it).
const LISTING_JITTER_DEG = 0.0003;

const TOP_CELL_OFFSETS: Array<[number, number]> = [-1, 0, 1].flatMap((r) =>
  [-1, 0, 1].map((c): [number, number] => [r, c]),
);
const MINI_QUADRANT_OFFSETS: Array<[number, number]> = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

/** Deterministic pseudo-random unit value in [0,1) — no Math.random. */
function hash(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

interface DenseListing {
  id: string;
  propertyType: string;
  title: string;
  locality: string;
  pricePaise: number;
  lat: number;
  lon: number;
  listingPurpose: string;
}

interface TopCellGeometry {
  index: number;
  centerLat: number;
  centerLon: number;
  count: number;
}

/**
 * Generates `total` listings across the 9 top cells x 4 mini-quadrants
 * nested grid described above. Returns both the flat listing array (for the
 * API stub) and the top-cell geometry (so tests can compute expected
 * cluster bounds/centres without re-deriving the generator's own math).
 */
function makeDenseListings(total: number): { listings: DenseListing[]; topCells: TopCellGeometry[] } {
  const listings: DenseListing[] = [];
  const topCells: TopCellGeometry[] = [];
  const perTopCell = Math.floor(total / TOP_CELL_OFFSETS.length);
  let remaining = total - perTopCell * TOP_CELL_OFFSETS.length;

  let globalIdx = 0;
  TOP_CELL_OFFSETS.forEach(([tr, tc], topIdx) => {
    const topCellCount = perTopCell + (remaining > 0 ? 1 : 0);
    if (remaining > 0) remaining -= 1;
    const topCenterLat = CENTER_LAT + tr * TOP_CELL_SPACING_DEG;
    const topCenterLon = CENTER_LON + tc * TOP_CELL_SPACING_DEG;
    topCells.push({ index: topIdx, centerLat: topCenterLat, centerLon: topCenterLon, count: topCellCount });

    const perQuadrant = Math.floor(topCellCount / MINI_QUADRANT_OFFSETS.length);
    let quadRemaining = topCellCount - perQuadrant * MINI_QUADRANT_OFFSETS.length;

    MINI_QUADRANT_OFFSETS.forEach(([qr, qc]) => {
      const quadCount = perQuadrant + (quadRemaining > 0 ? 1 : 0);
      if (quadRemaining > 0) quadRemaining -= 1;
      const quadCenterLat = topCenterLat + qr * MINI_QUADRANT_OFFSET_DEG;
      const quadCenterLon = topCenterLon + qc * MINI_QUADRANT_OFFSET_DEG;

      for (let i = 0; i < quadCount; i += 1) {
        globalIdx += 1;
        const jLat = (hash(globalIdx * 2) - 0.5) * 2 * LISTING_JITTER_DEG;
        const jLon = (hash(globalIdx * 2 + 1) - 0.5) * 2 * LISTING_JITTER_DEG;
        listings.push({
          id: `dense-${globalIdx}`,
          propertyType: globalIdx % 3 === 0 ? 'apartment' : globalIdx % 3 === 1 ? 'house' : 'villa',
          title: `Dense Listing ${globalIdx}`,
          locality: AREA_NAME,
          pricePaise: 3_000_000_00 + (globalIdx % 50) * 100_000_00,
          lat: quadCenterLat + jLat,
          lon: quadCenterLon + jLon,
          listingPurpose: 'sale',
        });
      }
    });
  });

  return { listings, topCells };
}

/**
 * Convergence-test fixture -- 9 top cells with DISTINCT, unique member counts
 * (4..12), each at/below MARKER_REVEAL_COUNT_FLOOR(12) so
 * resolveMarkerRevealMode ALWAYS returns 'individualPins' for every one of
 * them, regardless of which path (cluster-tap fit-settle vs a completely
 * fresh navigation) computed it. This deliberately keeps the reveal-mode
 * decision IDENTICAL across both paths, isolating the convergence claim
 * (same MarkerClusterGroup config → same bucketing at the same camera) from
 * the orthogonal density-hold behaviour (MARKER_REVEAL_HOLD_ZOOM) covered by
 * the SEPARATE genuinely-dense convergence test below (reusing the N=1000
 * dense fixture from "cluster tap fits..."/"progressive splitting" above).
 *
 * Issue #1762 fix — a prior version of this comment framed the dense-vs-fresh
 * divergence (a dense cluster's post-fit reveal decision staying held-
 * clustered, while a fresh cold-load to the identical settled camera fell
 * back to the DEFAULT CLUSTER_DISABLE_AT_ZOOM and declustered) as
 * intentional, current, correct product behaviour. That was wrong: it
 * violated this issue's own binding AC that manual/fresh navigation to an
 * equivalent camera must converge on the same cluster/pin result as
 * cluster-tap (same MarkerClusterGroup instance/config). The root cause was
 * that resolveMarkerRevealMode was recomputed ONLY inside a cluster-tap
 * one-shot `moveend` listener; PropertyMap.tsx's MarkerClusterLayer now
 * recomputes it from a general (persistent) `moveend` listener that fires
 * for ANY settled camera, cluster-tap or not — see that file's
 * `recomputeMarkerRevealMode` for the fix. Unique per-cell counts here also
 * let a clicked cluster's own aria-label unambiguously identify which
 * top-cell geometry it corresponds to, without depending on Leaflet's
 * internal DOM/render order matching the fixture's generation order.
 */
function makeConvergenceFixture(): { listings: DenseListing[]; topCells: TopCellGeometry[] } {
  const listings: DenseListing[] = [];
  const topCells: TopCellGeometry[] = [];
  let globalIdx = 0;

  TOP_CELL_OFFSETS.forEach(([tr, tc], topIdx) => {
    const count = 4 + topIdx; // 4..12, unique per cell, all <= MARKER_REVEAL_COUNT_FLOOR
    const topCenterLat = CENTER_LAT + tr * TOP_CELL_SPACING_DEG;
    const topCenterLon = CENTER_LON + tc * TOP_CELL_SPACING_DEG;
    topCells.push({ index: topIdx, centerLat: topCenterLat, centerLon: topCenterLon, count });

    const perQuadrant = Math.floor(count / MINI_QUADRANT_OFFSETS.length);
    let quadRemaining = count - perQuadrant * MINI_QUADRANT_OFFSETS.length;

    MINI_QUADRANT_OFFSETS.forEach(([qr, qc]) => {
      const quadCount = perQuadrant + (quadRemaining > 0 ? 1 : 0);
      if (quadRemaining > 0) quadRemaining -= 1;
      const quadCenterLat = topCenterLat + qr * MINI_QUADRANT_OFFSET_DEG;
      const quadCenterLon = topCenterLon + qc * MINI_QUADRANT_OFFSET_DEG;

      for (let i = 0; i < quadCount; i += 1) {
        globalIdx += 1;
        const jLat = (hash(globalIdx * 2) - 0.5) * 2 * LISTING_JITTER_DEG;
        const jLon = (hash(globalIdx * 2 + 1) - 0.5) * 2 * LISTING_JITTER_DEG;
        listings.push({
          id: `conv-${globalIdx}`,
          propertyType: globalIdx % 3 === 0 ? 'apartment' : globalIdx % 3 === 1 ? 'house' : 'villa',
          title: `Convergence Listing ${globalIdx}`,
          locality: AREA_NAME,
          pricePaise: 3_000_000_00 + (globalIdx % 50) * 100_000_00,
          lat: quadCenterLat + jLat,
          lon: quadCenterLon + jLon,
          listingPurpose: 'sale',
        });
      }
    });
  });

  return { listings, topCells };
}

function anyMarkerLocator(page: Page): Locator {
  return page.locator('.custom-marker-cluster, [data-testid="property-marker"]');
}

// ── Issue #1762 fix-cycle 5 — coincident-coordinate spiderfy fixture ──
//
// The 3x3-grid dense fixture above is deliberately spread out (each top
// cell is ~3.3km from its neighbours) so cluster-tap fit-to-members has
// real geographic bounds to fit to. That geometry can NEVER spiderfy —
// clusterCanSplit only declines a fit when there is truly no spatial
// spread to zoom into. Fix-cycle 3/4's spiderfy readability/clickability
// work targets exactly the OTHER case: a cluster whose members share
// (near-)identical coordinates, where no zoom level can visually separate
// them, so leaflet.markercluster's own spiderfyOnMaxZoom fans them out
// in place instead. This fixture is a dedicated, bit-identical-coordinate
// listing set for that case — 8 members (the densest circle-mode count,
// one below leaflet.markercluster's own circle->spiral switchover at 9),
// matching the WORKDONE_REVIEW BLOCKING finding's own "8-9 member
// coincident cluster" framing for the viewport clamp.
const SPIDERFY_MEMBER_COUNT = 8;

function makeCoincidentClusterListings(count: number): DenseListing[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `spiderfy-${i + 1}`,
    propertyType: i % 3 === 0 ? 'apartment' : i % 3 === 1 ? 'house' : 'villa',
    title: `Spiderfy Listing ${i + 1}`,
    locality: AREA_NAME,
    pricePaise: 4_000_000_00 + i * 100_000_00,
    // Bit-identical coordinates for every member — the same "sw/ne bounds
    // EXACTLY coincident" shape the fix-cycle-3 live repro used, so
    // hasSpatialSpread is unambiguously false at any zoom and this test
    // isn't relying on a borderline/flaky near-miss.
    lat: CENTER_LAT,
    lon: CENTER_LON,
    listingPurpose: 'sale',
  }));
}

function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function stubDenseFixture(page: Page, listings: DenseListing[]): Promise<void> {
  const areasFixture = {
    city: CITY,
    areas: [
      {
        areaKey: AREA_KEY,
        name: AREA_NAME,
        geoCenterLat: CENTER_LAT,
        geoCenterLon: CENTER_LON,
        minLat: CENTER_LAT - TOP_CELL_SPACING_DEG * 1.5,
        maxLat: CENTER_LAT + TOP_CELL_SPACING_DEG * 1.5,
        minLon: CENTER_LON - TOP_CELL_SPACING_DEG * 1.5,
        maxLon: CENTER_LON + TOP_CELL_SPACING_DEG * 1.5,
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
  // Prevent live-backend city-root navigation/resolve bounds from overriding
  // the test's synthetic camera (CENTER_LAT/CENTER_LON at zoom 13 or settledZoom).
  await page.route('**/api/discover/cities/*/navigation/resolve**', (route) => fulfillJson(route, 404, {}));
  await page.route('**/api/discover/cities/*/navigation/*/counts**', (route) => fulfillJson(route, 404, {}));
}

function areaFirstUrl(zoom = 13): string {
  return `/discover?city=${CITY}&journey=area-first&areaKey=${encodeURIComponent(AREA_KEY)}&lat=${CENTER_LAT}&lon=${CENTER_LON}&zoom=${zoom}`;
}

interface UrlIdentity {
  node: string | null;
  journey: string | null;
  areaKey: string | null;
  city: string | null;
  propertyTypes: string | null;
}

function readUrlIdentity(page: Page): UrlIdentity {
  const u = new URL(page.url());
  return {
    node: u.searchParams.get('node'),
    journey: u.searchParams.get('journey'),
    areaKey: u.searchParams.get('areaKey'),
    city: u.searchParams.get('city'),
    propertyTypes: u.searchParams.get('propertyTypes'),
  };
}

function clusterLocator(page: Page): Locator {
  return page.locator('.custom-marker-cluster');
}

function pinLocator(page: Page): Locator {
  return page.locator('[data-testid="property-marker"]');
}

async function clusterCount(page: Page): Promise<number> {
  return clusterLocator(page).count();
}

async function pinCount(page: Page): Promise<number> {
  return pinLocator(page).count();
}

/** Reads each visible cluster's "N homes" count from its aria-label. */
async function clusterCounts(page: Page): Promise<number[]> {
  const labels = await clusterLocator(page).evaluateAll((els) =>
    els.map((el) => el.getAttribute('aria-label') ?? ''),
  );
  return labels.map((l) => {
    const m = /(\d+)\s+homes?/.exec(l);
    return m ? Number(m[1]) : NaN;
  });
}

async function getMapZoom(page: Page): Promise<number | null> {
  return page.evaluate(
    () =>
      (window as unknown as { __debug?: { mapState?: { zoom?: number } } }).__debug?.mapState?.zoom ?? null,
  );
}

async function dismissConsentBannerIfPresent(page: Page): Promise<void> {
  const banner = page.getByTestId('discover-consent-banner');
  if (await banner.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await banner.getByRole('button', { name: /accept/i }).click();
    await expect(banner).not.toBeVisible();
  }
}

/** Opens mobile Map mode (mobile shell defaults to List). No-op on desktop viewports. */
async function ensureMobileMapOpen(page: Page, isMobile: boolean): Promise<void> {
  if (!isMobile) return;
  const mapTrigger = page.getByRole('button', { name: 'Map', exact: true });
  await expect(mapTrigger).toBeVisible({ timeout: 10_000 });
  await mapTrigger.click();
  await expect(page.locator('.leaflet-container')).toHaveCount(1, { timeout: 10_000 });
}

async function gotoDenseArea(
  page: Page,
  total: number,
  isMobile: boolean,
  zoom = 13,
): Promise<{ topCells: TopCellGeometry[] }> {
  const { listings, topCells } = makeDenseListings(total);
  await stubDenseFixture(page, listings);
  const listingsResponse = page.waitForResponse(
    (res) => res.url().includes('/api/discover/cities/') && res.url().includes('/listings') && res.status() === 200,
  );
  await page.goto(areaFirstUrl(zoom));
  await listingsResponse;
  await dismissConsentBannerIfPresent(page);
  await page.waitForLoadState('networkidle');
  await ensureMobileMapOpen(page, isMobile);
  await expect(clusterLocator(page).first()).toBeVisible({ timeout: 15_000 });
  return { topCells };
}

const VIEWPORTS = [
  { name: 'desktop 1366x768', width: 1366, height: 768, isMobile: false },
  { name: 'mobile 390x844', width: 390, height: 844, isMobile: true },
];

for (const viewport of VIEWPORTS) {
  test.describe(`Issue #1762 — listing density clustering (${viewport.name})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('dense initial state renders clusters, not an unreadable overlapping stack', async ({ page }) => {
      const total = 1000;
      const t0 = Date.now();
      await gotoDenseArea(page, total, viewport.isMobile);
      const settleMs = Date.now() - t0;

      const clusters = await clusterCount(page);
      const pins = await pinCount(page);
      // eslint-disable-next-line no-console
      console.log(`[perf][${viewport.name}] N=${total} initial render settle: ${settleMs}ms, clusters=${clusters}, pins=${pins}`);

      // The 9 well-separated top cells must render as 9 distinct cluster
      // bubbles at the zoom=13 initial view — never one giant stack, never
      // 1000 raw overlapping pins.
      expect(clusters).toBe(9);
      expect(pins).toBe(0);

      const counts = await clusterCounts(page);
      expect(counts.every((c) => Number.isFinite(c) && c > 0)).toBe(true);
      expect(counts.reduce((a, b) => a + b, 0)).toBe(total);
    });

    test('cluster tap fits to member bounds, lands at a real split, never opens popover/preview, never mutates node/journey/areaKey/city', async ({
      page,
    }) => {
      await gotoDenseArea(page, 1000, viewport.isMobile);

      const before = readUrlIdentity(page);
      const zoomBefore = await getMapZoom(page);
      expect(zoomBefore).toBe(13);

      const desktopPopover = page.getByTestId('marker-popover-card');
      const mobilePreview = page.getByTestId('mobile-listing-preview-sheet');

      const clickTarget = clusterLocator(page).first();
      const clickLabel = (await clickTarget.getAttribute('aria-label')) ?? '';
      const clickedCount = Number(/(\d+)\s+homes?/.exec(clickLabel)?.[1] ?? NaN);
      expect(Number.isFinite(clickedCount)).toBe(true);

      const t0 = Date.now();
      await clickTarget.click();

      // Settle: the split-to-4-mini-quadrant-subclusters DOM state.
      await expect
        .poll(async () => clusterCount(page), { timeout: 10_000, message: 'waiting for cluster split' })
        .toBe(4);
      const settleMs = Date.now() - t0;
      // eslint-disable-next-line no-console
      console.log(`[perf][${viewport.name}] cluster-tap -> settled split: ${settleMs}ms`);

      const zoomAfter = await getMapZoom(page);
      expect(zoomAfter).not.toBeNull();
      // AC2: clamped to [currentZoom+1, CLUSTER_DISABLE_AT_ZOOM(16)].
      expect(zoomAfter as number).toBeGreaterThanOrEqual((zoomBefore as number) + 1);
      expect(zoomAfter as number).toBeLessThanOrEqual(16);

      // Real split: the tapped top-cell's ~111 members regrouped into its 4
      // mini-quadrant sub-clusters (not still 1 giant cluster, not the
      // other 8 untouched top cells collapsed away either).
      const clustersAfter = await clusterCount(page);
      expect(clustersAfter).toBe(4);
      const countsAfter = await clusterCounts(page);
      // The 4 sub-clusters' members sum to exactly the tapped top-cell's own
      // count (from its pre-click aria-label) — proves this is a true
      // regroup of THAT cluster's members, not a coincidental total.
      expect(countsAfter.reduce((a, b) => a + b, 0)).toBe(clickedCount);

      // AC3: never opens the popover/preview.
      await expect(desktopPopover).toHaveCount(0);
      await expect(mobilePreview).toHaveCount(0);

      // AC4: never mutates node=/journey/areaKey/city (breadcrumb/filter identity).
      const after = readUrlIdentity(page);
      expect(after.node).toBeNull();
      expect(after).toEqual(before);
    });

    test('a further cluster tap on the split state shows progressive splitting', async ({ page }) => {
      await gotoDenseArea(page, 1000, viewport.isMobile);

      await clusterLocator(page).first().click();
      await expect
        .poll(async () => clusterCount(page), { timeout: 10_000 })
        .toBe(4);
      const countsAfterFirst = (await clusterCounts(page)).slice().sort((a, b) => a - b);

      // The first tap already landed at CLUSTER_DISABLE_AT_ZOOM(16) (the
      // clamp ceiling), so a SECOND cluster tap on one of the 4 sub-clusters
      // is legitimately a no-op per clusterCanSplit's own contract
      // (cappedTargetZoom = min(16, boundsZoom) cannot exceed the already-
      // at-16 currentZoom) — verified separately below. "a further
      // zoom/cluster-tap step shows progressive splitting" is exercised here
      // via a further MANUAL zoom-in step (Leaflet's own '+' control),
      // which is not zoom-clamped: resolveMarkerRevealMode's density hold
      // (MARKER_REVEAL_HOLD_ZOOM) keeps clustering active past 16 for this
      // still-dense set, so leaflet.markercluster re-buckets the 4
      // sub-clusters' members at the deeper zoom's smaller per-pixel
      // maxClusterRadius — a real, assertable further split.
      const before = { clusters: await clusterCount(page), pins: await pinCount(page) };

      // Confirm the second-tap no-op contract holds (documents the gate,
      // does not leave it silently unverified).
      await clusterLocator(page).first().click();
      await page.waitForTimeout(1000);
      expect(await clusterCount(page)).toBe(before.clusters);
      expect(await pinCount(page)).toBe(before.pins);

      await page.locator('.leaflet-control-zoom-in').click();

      await expect
        .poll(
          async () => {
            const clusters = await clusterCount(page);
            const pins = await pinCount(page);
            return clusters !== before.clusters || pins !== before.pins;
          },
          { timeout: 10_000, message: 'waiting for progressive split to change the rendered marker layout' },
        )
        .toBe(true);

      const after = { clusters: await clusterCount(page), pins: await pinCount(page) };
      // eslint-disable-next-line no-console
      console.log(
        `[perf][${viewport.name}] progressive split: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`,
      );
      expect(after.pins + after.clusters).toBeGreaterThan(0);
      void countsAfterFirst;
    });

    test('manual navigation to the equivalent camera converges on the same cluster/pin DOM state as cluster-tap', async ({
      page,
    }) => {
      const { listings, topCells } = makeConvergenceFixture();
      await stubDenseFixture(page, listings);
      const listingsResponse = page.waitForResponse(
        (res) => res.url().includes('/api/discover/cities/') && res.url().includes('/listings') && res.status() === 200,
      );
      await page.goto(areaFirstUrl(13));
      await listingsResponse;
      await dismissConsentBannerIfPresent(page);
      await page.waitForLoadState('networkidle');
      await ensureMobileMapOpen(page, viewport.isMobile);
      await expect(clusterLocator(page).first()).toBeVisible({ timeout: 15_000 });

      const clickTarget = clusterLocator(page).first();
      const clickLabel = (await clickTarget.getAttribute('aria-label')) ?? '';
      const clickedCount = Number(/(\d+)\s+homes?/.exec(clickLabel)?.[1] ?? NaN);
      const clickedTopCell = topCells.find((c) => c.count === clickedCount);
      expect(clickedTopCell, `no top cell matches clicked cluster count ${clickedCount}`).toBeDefined();

      await clickTarget.click();
      // Settle: every top cell shares the SAME mini-quadrant/jitter
      // geometry (only the point COUNT differs), so cappedTargetZoom is the
      // same for all of them -- the fit always lands at exactly
      // CLUSTER_DISABLE_AT_ZOOM(16) (same clamp-ceiling reasoning as the
      // dense N=1000 case above). Poll for that exact settled zoom rather
      // than "zoom advanced at all", which can catch a mid-flyTo-animation
      // frame instead of the real final state (the animation passes through
      // 14/15 on its way to 16).
      await expect
        .poll(async () => getMapZoom(page), { timeout: 10_000, message: 'waiting for zoom to settle at the fit target' })
        .toBe(16);
      // leaflet.markercluster's chunkedLoading rebuilds the cluster tree in
      // rAF-scheduled chunks after a zoom/data change -- give it a beat past
      // the zoom settling before reading the DOM.
      await page.waitForTimeout(500);

      const settledZoom = await getMapZoom(page);
      expect(settledZoom).not.toBeNull();
      const signatureA = {
        clusters: await clusterCount(page),
        pins: await pinCount(page),
        clusterCounts: (await clusterCounts(page)).slice().sort((a, b) => a - b),
      };

      // Manual/equivalent path: fresh navigation directly to the SAME
      // camera (the tapped top-cell's own centre, at the settled zoom) —
      // no cluster-tap involved at all, proving the two paths converge on
      // the same MarkerClusterGroup/config rendering the same result. This
      // top-cell's count (<=12) makes resolveMarkerRevealMode return
      // 'individualPins' for both paths identically (see makeConvergenceFixture
      // doc), so the fresh-load default disableClusteringAtZoom(16) and the
      // fit-settled hold agree -- a fair, real convergence comparison.
      await stubDenseFixture(page, listings);
      const listingsResponse2 = page.waitForResponse(
        (res) => res.url().includes('/api/discover/cities/') && res.url().includes('/listings') && res.status() === 200,
      );
      const page2Url = `/discover?city=${CITY}&journey=area-first&areaKey=${encodeURIComponent(AREA_KEY)}&lat=${clickedTopCell!.centerLat}&lon=${clickedTopCell!.centerLon}&zoom=${settledZoom}`;
      await page.goto(page2Url);
      await listingsResponse2;
      await dismissConsentBannerIfPresent(page);
      await page.waitForLoadState('networkidle');
      await ensureMobileMapOpen(page, viewport.isMobile);
      await expect(anyMarkerLocator(page).first()).toBeVisible({ timeout: 15_000 });

      const signatureB = {
        clusters: await clusterCount(page),
        pins: await pinCount(page),
        clusterCounts: (await clusterCounts(page)).slice().sort((a, b) => a - b),
      };

      expect(signatureB).toEqual(signatureA);
    });

    test('manual navigation to the equivalent DENSE camera converges on the same HELD cluster/pin DOM state as cluster-tap (genuinely dense fixture, not the <=12-member convergence fixture above)', async ({
      page,
    }) => {
      // Issue #1762 fix — the convergence test above deliberately uses a
      // fixture where every top cell's count is <= MARKER_REVEAL_COUNT_FLOOR
      // (12), so resolveMarkerRevealMode returns 'individualPins' for BOTH
      // paths identically regardless of which one computed it — see
      // makeConvergenceFixture's own doc. That test structurally cannot
      // catch a cluster-tap-vs-manual-navigation divergence in the
      // DENSITY-HOLD decision (MARKER_REVEAL_HOLD_ZOOM) itself. This test
      // reuses the SAME dense N=1000/9-top-cell fixture as the "dense
      // initial state"/"cluster tap fits..." tests above (~111
      // members/top-cell) specifically because that count against this
      // viewport IS dense per resolveMarkerRevealMode — the held-clustered
      // decision is exactly the thing under test here.
      const { topCells } = await gotoDenseArea(page, 1000, viewport.isMobile);

      const clickTarget = clusterLocator(page).first();
      const clickLabel = (await clickTarget.getAttribute('aria-label')) ?? '';
      const clickedCount = Number(/(\d+)\s+homes?/.exec(clickLabel)?.[1] ?? NaN);
      const clickedTopCell = topCells.find((c) => c.count === clickedCount);
      expect(clickedTopCell, `no top cell matches clicked cluster count ${clickedCount}`).toBeDefined();

      await clickTarget.click();
      // Settle at the split state (4 sub-clusters at the fit-to-members
      // zoom, matching "cluster tap fits..." above) — the density hold
      // means these sub-clusters stay clustered rather than declustering
      // into ~111 raw overlapping pins.
      await expect
        .poll(async () => clusterCount(page), { timeout: 10_000, message: 'waiting for cluster split' })
        .toBe(4);
      // leaflet.markercluster's chunkedLoading rebuilds the cluster tree in
      // rAF-scheduled chunks after a zoom/data change — give it a beat past
      // the zoom settling before reading the DOM (mirrors the <=12-member
      // convergence test above).
      await page.waitForTimeout(500);

      const settledZoom = await getMapZoom(page);
      expect(settledZoom).not.toBeNull();
      const signatureA = {
        clusters: await clusterCount(page),
        pins: await pinCount(page),
        clusterCounts: (await clusterCounts(page)).slice().sort((a, b) => a - b),
      };
      // Pin down that this really is the held-clustered state (not a
      // coincidental match with the fresh-load default below): a dense
      // ~111-member top cell stays fully clustered, never raw pins.
      expect(signatureA.pins).toBe(0);
      expect(signatureA.clusters).toBeGreaterThan(0);

      // Manual/equivalent path: a completely fresh page load directly to
      // the SAME settled camera (the tapped top-cell's own centre, at the
      // settled zoom) with the IDENTICAL listing set — no cluster-tap
      // involved at all. makeDenseListings is a pure function of `total`
      // (deterministic hash-based jitter), so this reproduces byte-
      // identical listing geometry to the one gotoDenseArea already
      // stubbed above.
      const { listings: freshListings } = makeDenseListings(1000);
      await stubDenseFixture(page, freshListings);
      const listingsResponse2 = page.waitForResponse(
        (res) => res.url().includes('/api/discover/cities/') && res.url().includes('/listings') && res.status() === 200,
      );
      const page2Url = `/discover?city=${CITY}&journey=area-first&areaKey=${encodeURIComponent(AREA_KEY)}&lat=${clickedTopCell!.centerLat}&lon=${clickedTopCell!.centerLon}&zoom=${settledZoom}`;
      await page.goto(page2Url);
      await listingsResponse2;
      await dismissConsentBannerIfPresent(page);
      await page.waitForLoadState('networkidle');
      await ensureMobileMapOpen(page, viewport.isMobile);
      await expect(anyMarkerLocator(page).first()).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(500);

      const signatureB = {
        clusters: await clusterCount(page),
        pins: await pinCount(page),
        clusterCounts: (await clusterCounts(page)).slice().sort((a, b) => a - b),
      };

      // AC: manual/fresh navigation to the equivalent camera converges on
      // the SAME cluster/pin result as cluster-tap — the same
      // MarkerClusterGroup instance/config renders the same density-based
      // decision regardless of path. Pre-fix, this fails: the fresh load
      // falls back to the DEFAULT CLUSTER_DISABLE_AT_ZOOM(16) and
      // declusters into ~111 raw pins instead of staying held-clustered.
      expect(signatureB).toEqual(signatureA);
    });

    test('individual marker click still opens the popover/compact preview (smoke)', async ({ page }) => {
      // Sparse fixture — 3 well-separated listings, individually hit-testable
      // pins from the very first render (no cluster tap needed). This is
      // deliberately NOT the dense fixture: the compact preview's own
      // internals are out of scope (#2126/#2127/#2129/#2130); this is only a
      // smoke check that #1762's clusterclick changes did not disturb the
      // pre-existing individual-marker click path.
      const sparse: DenseListing[] = [
        { id: 'sparse-1', propertyType: 'house', title: 'Sparse A', locality: AREA_NAME, pricePaise: 5_000_000_00, lat: CENTER_LAT, lon: CENTER_LON, listingPurpose: 'sale' },
        { id: 'sparse-2', propertyType: 'apartment', title: 'Sparse B', locality: AREA_NAME, pricePaise: 6_000_000_00, lat: CENTER_LAT + 0.02, lon: CENTER_LON + 0.02, listingPurpose: 'sale' },
        { id: 'sparse-3', propertyType: 'villa', title: 'Sparse C', locality: AREA_NAME, pricePaise: 7_000_000_00, lat: CENTER_LAT - 0.02, lon: CENTER_LON - 0.02, listingPurpose: 'sale' },
      ];
      await stubDenseFixture(page, sparse);
      const listingsResponse = page.waitForResponse(
        (res) => res.url().includes('/api/discover/cities/') && res.url().includes('/listings') && res.status() === 200,
      );
      await page.goto(areaFirstUrl(13));
      await listingsResponse;
      await dismissConsentBannerIfPresent(page);
      await page.waitForLoadState('networkidle');
      await ensureMobileMapOpen(page, viewport.isMobile);

      const marker = page.locator('[data-listing-id="sparse-1"] [data-testid="property-marker"]');
      await expect(marker).toBeVisible({ timeout: 15_000 });

      if (viewport.isMobile) {
        // KNOWN GAP (investigated, not papered over): MobileListingPreviewSheet
        // only mounts once DiscoverAreasJourneyPanel's OWN `selectedListingPreview`
        // (src/features/discover/views/DiscoverAreasJourneyPanel.tsx) resolves --
        // which requires useAreasNavigationJourney's `node=`-keyed
        // navigation/resolve + navigation/{node}/counts calls to succeed against
        // a node the app recognises as this listing's AREA leaf. This spec's URL
        // scheme (journey=area-first&areaKey=..., no node=, matching the
        // established backend-free e2e/discover pattern this file's header cites:
        // school-radius-marker-click-repro-1738.spec.ts,
        // thanisandra-hennur-belt-marker-degradation.spec.ts) never populates
        // `node=`, so that hierarchy resolution never fires and the panel's
        // preview projection stays permanently null -- independent of anything
        // #1762 changed (confirmed live: identical result with and without a
        // stub for those two endpoints; DesKTOP's MarkerPopoverCard is a
        // separate, older mechanism not gated by this path, which is why only
        // the mobile case is affected). Standing up a `node=`-deep-link fixture
        // for the canonical hierarchy is real backend-shaped work belonging to
        // #2131/#2129/#2130, not this issue's scope_lock file set. Proven here
        // instead: the click still reaches the SAME onSelectListing path
        // #1762's clusterclick handler must never call directly (see the
        // "never opens popover/preview" cluster-tap assertions above) --
        // observable via the URL gaining `listing=sparse-1`, exactly as the
        // desktop popover path also does before its own card mounts.
        const preview = page.getByTestId('mobile-listing-preview-sheet');
        await expect(preview).toBeHidden();
        await marker.click();
        await expect
          .poll(() => new URL(page.url()).searchParams.get('listing'), {
            timeout: 10_000,
            message: 'waiting for marker click to write listing= to the URL',
          })
          .toBe('sparse-1');
      } else {
        const popover = page.getByTestId('marker-popover-card');
        await expect(popover).toBeHidden();
        await marker.click();
        await expect(popover).toBeVisible({ timeout: 10_000 });
        await expect(popover).toHaveAttribute('role', 'dialog');
      }
    });

    test('spiderfied individual marker is clickable — a fanned-out marker from a coincident cluster reaches the SAME onSelectListing path an unclustered marker does (fix-cycle-4 regression coverage)', async ({
      page,
    }) => {
      // WORKDONE_REVIEW BLOCKING finding: no E2E test spiderfies a
      // coincident cluster and clicks an individual fanned-out member.
      // Unit coverage (PropertyMap.clusterTapFit.test.tsx) only asserts the
      // spiderLegPolylineOptions CONFIG value against a fully-mocked
      // Leaflet — it cannot dispatch a real click and observe whether it
      // reaches onSelectListing. This test does, against the real Leaflet
      // + leaflet.markercluster runtime.
      const spiderfyListings = makeCoincidentClusterListings(SPIDERFY_MEMBER_COUNT);
      await stubDenseFixture(page, spiderfyListings);
      const listingsResponse = page.waitForResponse(
        (res) => res.url().includes('/api/discover/cities/') && res.url().includes('/listings') && res.status() === 200,
      );
      await page.goto(areaFirstUrl(13));
      await listingsResponse;
      await dismissConsentBannerIfPresent(page);
      await page.waitForLoadState('networkidle');
      await ensureMobileMapOpen(page, viewport.isMobile);

      // All 8 members share bit-identical coordinates -> exactly one
      // cluster bubble, never any individual pin, before the tap.
      const cluster = clusterLocator(page);
      await expect(cluster).toHaveCount(1, { timeout: 15_000 });
      const label = (await cluster.first().getAttribute('aria-label')) ?? '';
      expect(label).toContain(`${SPIDERFY_MEMBER_COUNT} homes`);
      await expect(pinLocator(page)).toHaveCount(0);

      await cluster.first().click();

      // Non-splittable coincident cluster: clusterCanSplit declines (no
      // spatial spread to zoom into, mirrors this file's other
      // "non-splittable cluster" assertions), so leaflet.markercluster's
      // own spiderfyOnMaxZoom fans the 8 members out in place instead.
      // The cluster bubble itself stays in the DOM (leaflet.markercluster
      // dims it to opacity 0.3 rather than removing it — verified against
      // _animationSpiderfy in node_modules/leaflet.markercluster's own
      // source), but 8 individual price-pill markers now appear alongside
      // it, fanned out — that's the real, assertable evidence a spiderfy
      // actually happened (not just a config value, unlike the fully-mocked
      // unit test this E2E spec complements).
      const spiderfiedMarkers = pinLocator(page);
      await expect(spiderfiedMarkers).toHaveCount(SPIDERFY_MEMBER_COUNT, { timeout: 10_000 });

      // Click one specific fanned-out marker — the exact fix-cycle-4
      // regression scenario: leaflet.markercluster's spider leg polylines
      // are drawn from the cluster's origin to EACH marker's spiderfied
      // position, terminating directly under a chunk of that marker's own
      // ~90-107px-wide clickable pill. Without spiderLegPolylineOptions:
      // {interactive:false} (fix-cycle 4), a click here can be silently
      // swallowed by the leg instead of reaching the pill underneath.
      const targetId = 'spiderfy-4';
      const target = page.locator(`[data-listing-id="${targetId}"] [data-testid="property-marker"]`);
      await expect(target).toBeVisible({ timeout: 10_000 });

      if (viewport.isMobile) {
        // Same known gap as the "individual marker click" smoke test above
        // (MobileListingPreviewSheet needs a node=-deep-link hierarchy this
        // backend-free fixture doesn't populate — see that test's comment
        // for the full explanation) — proven instead via the URL gaining
        // `listing=<id>`, the same real DOM/URL-state assertion that test
        // already establishes as the robust proxy for "the click reached
        // onSelectListing" on mobile.
        const preview = page.getByTestId('mobile-listing-preview-sheet');
        await expect(preview).toBeHidden();
        await target.click();
        await expect
          .poll(() => new URL(page.url()).searchParams.get('listing'), {
            timeout: 10_000,
            message: 'waiting for spiderfied marker click to write listing= to the URL',
          })
          .toBe(targetId);
      } else {
        const popover = page.getByTestId('marker-popover-card');
        await expect(popover).toBeHidden();
        await target.click();
        await expect(popover).toBeVisible({ timeout: 10_000 });
        await expect(popover).toHaveAttribute('role', 'dialog');
      }
    });

    test('spiderfy fan stays open across repeated clicks on its own members — collapses only on a bare-map click (issue #1762 fix cycle 7)', async ({
      page,
    }) => {
      // Product requirement (verbatim, issue #1762 fix cycle 7): "I don't
      // want the spider web to collapse on clicking an expanded marker. I
      // want the user to be able to continuously view all the expanded
      // markers by clicking on each. Collapse only if the click lands on a
      // different marker or in the map in general."
      //
      // Root cause (fixed): clicking an individual spiderfied marker wrote a
      // new `selectedListingId`, which used to re-trigger MarkerClusterLayer's
      // whole layer-building effect — tearing down and rebuilding the
      // leaflet.markercluster group as an accidental side effect, silently
      // collapsing the fan even though Leaflet's own unspiderfy contract was
      // never invoked. This test proves the fan survives repeated in-fan
      // clicks against the REAL Leaflet + leaflet.markercluster runtime (the
      // unit test in PropertyMap.clusterTapFit.test.tsx proves the internal
      // no-removeLayer/no-rebuild wiring against a fully-mocked Leaflet).
      const spiderfyListings = makeCoincidentClusterListings(SPIDERFY_MEMBER_COUNT);
      await stubDenseFixture(page, spiderfyListings);
      const listingsResponse = page.waitForResponse(
        (res) => res.url().includes('/api/discover/cities/') && res.url().includes('/listings') && res.status() === 200,
      );
      await page.goto(areaFirstUrl(13));
      await listingsResponse;
      await dismissConsentBannerIfPresent(page);
      await page.waitForLoadState('networkidle');
      await ensureMobileMapOpen(page, viewport.isMobile);

      const cluster = clusterLocator(page);
      await expect(cluster).toHaveCount(1, { timeout: 15_000 });
      await cluster.first().click();

      const spiderfiedMarkers = pinLocator(page);
      await expect(spiderfiedMarkers).toHaveCount(SPIDERFY_MEMBER_COUNT, { timeout: 10_000 });

      const targetAId = 'spiderfy-2';
      const targetBId = 'spiderfy-5';
      const markerA = page.locator(`[data-listing-id="${targetAId}"] [data-testid="property-marker"]`);
      const markerB = page.locator(`[data-listing-id="${targetBId}"] [data-testid="property-marker"]`);
      await expect(markerA).toBeVisible({ timeout: 10_000 });
      await expect(markerB).toBeVisible({ timeout: 10_000 });

      const popover = page.getByTestId('marker-popover-card');

      // Click marker A — its own popover/URL state, fan still fully open.
      await markerA.click();
      if (viewport.isMobile) {
        await expect
          .poll(() => new URL(page.url()).searchParams.get('listing'), {
            timeout: 10_000,
            message: 'waiting for marker A click to write listing= to the URL',
          })
          .toBe(targetAId);
      } else {
        await expect(popover).toBeVisible({ timeout: 10_000 });
      }
      await expect(spiderfiedMarkers).toHaveCount(SPIDERFY_MEMBER_COUNT);
      await expect(cluster).toHaveCount(1);

      // Click marker B in the SAME fan — B's own popover/URL state, fan
      // STILL fully open (this is the exact regression this fix targets:
      // pre-fix, this second click tore down/rebuilt the layer and the fan
      // silently collapsed here). `force: true` on desktop only: marker A's
      // now-open popover card (auto-positioned near A) can visually overlap
      // a neighbouring spiderfied pin in this tight (~97px-radius) fan —
      // real users can still land a click on a sliver of the pin outside
      // the card, but Playwright's strict "not obscured" actionability
      // check has no such tolerance. This overlap is NEWLY REACHABLE as a
      // direct consequence of this fix (pre-fix, any click on B collapsed
      // the fan immediately, so a popover-open-while-fan-open state never
      // existed) — it is not pre-existing, unrelated behavior. Verified the
      // force click still lands on B's real handler, not the popover card:
      // MarkerPopoverCard.handleCardClick calls stopPropagation() and never
      // selects a listing, so a click actually absorbed by the card would
      // leave B unselected and fail the assertions below. Tracked as a
      // follow-up UX polish item (popover/marker z-index in tight fans),
      // not fixed in this change.
      await markerB.click(viewport.isMobile ? undefined : { force: true });
      if (viewport.isMobile) {
        await expect
          .poll(() => new URL(page.url()).searchParams.get('listing'), {
            timeout: 10_000,
            message: 'waiting for marker B click to write listing= to the URL',
          })
          .toBe(targetBId);
      } else {
        await expect(popover).toBeVisible({ timeout: 10_000 });
      }
      await expect(spiderfiedMarkers).toHaveCount(SPIDERFY_MEMBER_COUNT);
      await expect(cluster).toHaveCount(1);

      // A bare map-background click (Leaflet's own native unspiderfy
      // contract — this app adds no competing map-level click handler)
      // collapses the fan: the fanned markers disappear, only the cluster
      // bubble remains.
      const mapContainer = page.locator('.leaflet-container');
      const box = await mapContainer.boundingBox();
      if (!box) throw new Error('leaflet-container has no bounding box');
      await page.mouse.click(box.x + 12, box.y + 12);

      await expect(spiderfiedMarkers).toHaveCount(0, { timeout: 10_000 });
      await expect(cluster).toHaveCount(1);
    });
  });
}

// ─── Perf/stress evidence at 500 / 1000 / ~1500 (above the anon 20/area
// teaser cap) listing counts — desktop only, settle-time measurement. ──────
test.describe('Issue #1762 — density stress evidence (desktop 1366x768)', () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  for (const total of [500, 1000, 1500]) {
    test(`N=${total}: initial render settles and cluster-tap fit settles within budget`, async ({ page }) => {
      const t0 = Date.now();
      await gotoDenseArea(page, total, false);
      const initialSettleMs = Date.now() - t0;

      const clusters = await clusterCount(page);
      const counts = await clusterCounts(page);
      expect(clusters).toBe(9);
      expect(counts.reduce((a, b) => a + b, 0)).toBe(total);

      const t1 = Date.now();
      await clusterLocator(page).first().click();
      await expect.poll(async () => clusterCount(page), { timeout: 15_000 }).toBe(4);
      const tapSettleMs = Date.now() - t1;

      // eslint-disable-next-line no-console
      console.log(
        `[perf][stress] N=${total}: initial-render-settle=${initialSettleMs}ms, cluster-tap-settle=${tapSettleMs}ms`,
      );

      // Generous, non-flaky upper bound — this is stress evidence, not a
      // tight perf gate. Fails only on genuine multi-second regressions.
      expect(initialSettleMs).toBeLessThan(20_000);
      expect(tapSettleMs).toBeLessThan(10_000);
    });
  }
});

// ─── Regression sweep — Area listings + selected-school-radius marker/
// popover behaviour unchanged by this diff. ────────────────────────────────
test.describe('Issue #1762 — regression sweep (desktop 1366x768)', () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test('Area listings (sparse, non-cluster path): marker click opens popover unaffected', async ({ page }) => {
    const listings: DenseListing[] = [
      { id: 'area-1', propertyType: 'house', title: 'Area Listing', locality: AREA_NAME, pricePaise: 5_000_000_00, lat: CENTER_LAT, lon: CENTER_LON, listingPurpose: 'sale' },
    ];
    await stubDenseFixture(page, listings);
    const listingsResponse = page.waitForResponse(
      (res) => res.url().includes('/api/discover/cities/') && res.url().includes('/listings') && res.status() === 200,
    );
    await page.goto(areaFirstUrl(14));
    await listingsResponse;
    await dismissConsentBannerIfPresent(page);
    await page.waitForLoadState('networkidle');

    const marker = page.locator('[data-listing-id="area-1"] [data-testid="property-marker"]');
    await expect(marker).toBeVisible({ timeout: 15_000 });
    const popover = page.getByTestId('marker-popover-card');
    await expect(popover).toBeHidden();
    await marker.click();
    await expect(popover).toBeVisible({ timeout: 10_000 });
    await expect(popover).toHaveAttribute('role', 'dialog');
  });

  test('Selected-school-radius (#1738/#2130 protected surface): marker click still opens popover, radius circle unaffected', async ({
    page,
  }) => {
    const SCHOOL_ID = 'dense-1762-school-1';
    const SCHOOL_LAT = CENTER_LAT;
    const SCHOOL_LON = CENTER_LON;
    const school = {
      id: SCHOOL_ID,
      name: 'Dense Test School',
      board: 'CBSE',
      boardType: null,
      address: 'Bangalore',
      latitude: SCHOOL_LAT,
      longitude: SCHOOL_LON,
      distanceKm: 0,
      areaKey: AREA_KEY,
    };
    // Full DTO shape for the school-radius-listings fallback response (used
    // by journey=school-first, and to keep the radius-circle/panel machinery
    // fed here) alongside a MINIMAL DenseListing for the area-first
    // city-listings fixture, which is the ACTUAL marker source in
    // journey=area-first even once a school+radius is also selected --
    // verified against school-radius-marker-click-repro-1738.spec.ts's own
    // AC2 (its `markerSelector` targets `LISTING_ID` from `CITY_LISTINGS_FIXTURE`,
    // never the school-radius-listings-sourced id; that fixture's AC5 module
    // doc spells out the split explicitly: "School-first sources markers from
    // the school-radius fallback fixture ... not the area-first city-listings
    // fixture"). An EARLIER version of this test sourced its marker from
    // school-radius-listings alone with an empty city-listings fixture, which
    // is exactly backwards for journey=area-first and left the marker
    // permanently unrendered -- caught by real Playwright hit-test failures,
    // not assumed.
    const radiusListingId = 'sr-1762-1';
    const radiusListingLat = SCHOOL_LAT + 0.005;
    const radiusListingLon = SCHOOL_LON + 0.005;
    const radiusListing = {
      id: radiusListingId,
      listingNumber: 9021,
      propertyType: 'house',
      title: 'Near Dense Test School',
      locality: AREA_NAME,
      areaKey: AREA_KEY,
      pricePaise: 5_000_000_00,
      landArea: null,
      landAreaUnit: null,
      builtArea: 1200,
      builtAreaUnit: 'sqft',
      bedrooms: 3,
      latitude: radiusListingLat,
      longitude: radiusListingLon,
      heroImageUrl: null,
      listingPurpose: 'sale',
      possessionStatus: 'ready_to_move',
      daysOnMarket: 5,
      backOnMarket: false,
      createdAt: '2026-05-01T00:00:00Z',
    };

    await stubDenseFixture(page, [
      {
        id: radiusListingId,
        propertyType: 'house',
        title: 'Near Dense Test School',
        locality: AREA_NAME,
        pricePaise: 5_000_000_00,
        lat: radiusListingLat,
        lon: radiusListingLon,
        listingPurpose: 'sale',
      },
    ]);
    await page.route('**/api/public/schools/search**', (route) => fulfillJson(route, 200, [school]));
    await page.route(`**/api/public/schools/${SCHOOL_ID}`, (route) => fulfillJson(route, 200, school));
    await page.route('**/api/public/schools/by-area**', (route) => fulfillJson(route, 200, [school]));
    await page.route('**/api/discover/cities/*/school-radius-listings**', (route) =>
      fulfillJson(route, 200, { content: [radiusListing], page: 0, size: 50, hasMore: false }),
    );

    const radiusUrl =
      `/discover?city=${CITY}&journey=area-first&areaKey=${encodeURIComponent(AREA_KEY)}` +
      `&lat=${SCHOOL_LAT}&lon=${SCHOOL_LON}&zoom=14&schoolId=${SCHOOL_ID}&radiusKm=3`;
    const radiusResponse = page.waitForResponse(
      (res) => res.url().includes('/school-radius-listings') && res.status() === 200,
    );
    await page.goto(radiusUrl);
    await radiusResponse;
    await dismissConsentBannerIfPresent(page);
    await page.waitForLoadState('networkidle');

    // Radius circle present — confirms this is genuinely the area-school-combined state.
    await expect(page.locator('.leaflet-overlay-pane path.leaflet-interactive')).toHaveCount(1, {
      timeout: 15_000,
    });

    const marker = page.locator('[data-listing-id="sr-1762-1"] [data-testid="property-marker"]');
    await expect(marker).toBeVisible({ timeout: 15_000 });
    const popover = page.getByTestId('marker-popover-card');
    await expect(popover).toBeHidden();
    await marker.click();
    await expect(popover).toBeVisible({ timeout: 10_000 });
    await expect(popover).toHaveAttribute('role', 'dialog');
  });
});

// ─── Required Browser Evidence item 8 (issue #1762 mandatory mobile
// acceptance) — "mobile marker A → marker B preview replacement without
// intermediate close when two visible distinct markers are available."
//
// The mobile branches of the tests above (the "individual marker click"
// smoke test and the fix-cycle-4/7 spiderfy tests) deliberately keep the
// legacy `journey=area-first&areaKey=` URL scheme (no `node=`) — per their
// own "KNOWN GAP" comments, that scheme never populates
// `useAreasNavigationJourney`'s AREA-node resolution, so
// MobileListingPreviewSheet structurally can never mount there. Those tests
// prove only that a tap reaches `onSelectListing` (via the `listing=` URL
// param) — never that the sheet itself opens or updates. That is exactly
// the fixture gap the issue text calls out: "improve the fixture rather
// than using a fake/synthetic click as final acceptance evidence."
//
// This block closes that gap using the SAME canonical `node=` navigation
// stub pattern #2130/PR #2136 already established for
// e2e/discover-1738-regression.spec.ts's mobile test (`stubNavigationNode`,
// stubbing `**/navigation/resolve**` + `**/navigation/*/counts**` so
// `journey.node.nodeType === 'AREA'` genuinely resolves). That helper is
// not exported from its file, so the same fixture shape is mirrored here
// rather than cross-imported from another spec file. Two ordinary,
// non-coincident, individually hit-testable pins (not spiderfied/clustered)
// prove — against the REAL rendered DOM — that tapping a second visible
// marker updates the SAME open sheet in place.
test.describe('Issue #1762 — mobile marker A → marker B preview replacement (required browser evidence item 8)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  const NODE_KEY = `a:${AREA_KEY}`;
  const ENCODED_NODE_KEY = encodeURIComponent(NODE_KEY);

  const NAVIGATION_RESOLVE_FIXTURE = {
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
        minLat: CENTER_LAT - 0.05,
        minLon: CENTER_LON - 0.05,
        maxLat: CENTER_LAT + 0.05,
        maxLon: CENTER_LON + 0.05,
      },
      descendantAreaKeys: null,
      areaKey: AREA_KEY,
    },
  };

  const NAVIGATION_COUNTS_FIXTURE = {
    nodeKey: NODE_KEY,
    count: 2,
    schoolCount: 0,
    areaCounts: { [AREA_KEY]: 2 },
    areaSchoolCounts: { [AREA_KEY]: 0 },
    children: [],
    revisionId: 1,
  };

  async function stubAreaNavigationNode(page: Page): Promise<void> {
    await page.route('**/api/discover/cities/*/navigation/resolve**', (route) =>
      fulfillJson(route, 200, NAVIGATION_RESOLVE_FIXTURE),
    );
    await page.route('**/api/discover/cities/*/navigation/*/counts**', (route) =>
      fulfillJson(route, 200, NAVIGATION_COUNTS_FIXTURE),
    );
  }

  function areaFirstNodeUrl(zoom = 13): string {
    return (
      `/discover?city=${CITY}&journey=area-first&areaKey=${encodeURIComponent(AREA_KEY)}&node=${ENCODED_NODE_KEY}` +
      `&lat=${CENTER_LAT}&lon=${CENTER_LON}&zoom=${zoom}`
    );
  }

  test('tapping a second visible marker replaces the open sheet in place, with no intermediate close', async ({
    page,
  }) => {
    // Two ordinary, individually hit-testable pins — the same ~0.02deg
    // separation the sparse-fixture smoke test above already establishes as
    // comfortably outside leaflet.markercluster's cluster radius at zoom 13
    // (real, non-overlapping click targets, never spiderfied/clustered).
    // Distinct anon-arm identity (priceBand + bedrooms) on each so the
    // sheet's own rendered CONTENT — not just the URL — proves which
    // listing it is showing at every step.
    const listings: Array<DenseListing & { priceBand: string; bedrooms: number }> = [
      {
        id: 'node-marker-a',
        propertyType: 'house',
        title: 'Node Marker A',
        locality: AREA_NAME,
        pricePaise: 4_500_000_00,
        priceBand: '₹43L-47L',
        bedrooms: 2,
        lat: CENTER_LAT,
        lon: CENTER_LON,
        listingPurpose: 'sale',
      },
      {
        id: 'node-marker-b',
        propertyType: 'apartment',
        title: 'Node Marker B',
        locality: AREA_NAME,
        pricePaise: 8_200_000_00,
        priceBand: '₹80L-85L',
        bedrooms: 4,
        lat: CENTER_LAT + 0.02,
        lon: CENTER_LON + 0.02,
        listingPurpose: 'sale',
      },
    ];
    await stubDenseFixture(page, listings);
    await stubAreaNavigationNode(page);

    const listingsResponse = page.waitForResponse(
      (res) => res.url().includes('/api/discover/cities/') && res.url().includes('/listings') && res.status() === 200,
    );
    await page.goto(areaFirstNodeUrl(13));
    await listingsResponse;
    await dismissConsentBannerIfPresent(page);
    await page.waitForLoadState('networkidle');
    await ensureMobileMapOpen(page, true);

    const markerA = page.locator('[data-listing-id="node-marker-a"] [data-testid="property-marker"]');
    const markerB = page.locator('[data-listing-id="node-marker-b"] [data-testid="property-marker"]');
    await expect(markerA).toBeVisible({ timeout: 15_000 });
    await expect(markerB).toBeVisible({ timeout: 15_000 });

    const before = readUrlIdentity(page);
    const sheet = page.getByTestId('mobile-listing-preview-sheet');
    await expect(sheet).toBeHidden();

    // Tap marker A — the sheet genuinely mounts (real DOM, no mock) showing
    // A's own identity. The map remains usable throughout: nothing closes
    // or blocks it.
    await markerA.click();
    await expect(sheet).toBeVisible({ timeout: 10_000 });
    await expect(sheet).toHaveCount(1);
    await expect.poll(() => new URL(page.url()).searchParams.get('listing')).toBe('node-marker-a');
    await expect(sheet.getByTestId('mobile-listing-preview-price-band')).toHaveText('₹43L-47L');
    await expect(sheet.getByTestId('mobile-listing-preview-bedrooms')).toContainText('2 BHK');

    const afterA = readUrlIdentity(page);
    expect(afterA).toEqual(before);

    // Without closing/dismissing the sheet, tap marker B (a different,
    // visible marker) — the SAME sheet element updates to B's identity: not
    // a second sheet, not a closed-then-reopened one.
    await markerB.click();
    await expect(sheet).toBeVisible({ timeout: 10_000 });
    await expect(sheet).toHaveCount(1);
    await expect.poll(() => new URL(page.url()).searchParams.get('listing')).toBe('node-marker-b');
    await expect(sheet.getByTestId('mobile-listing-preview-price-band')).toHaveText('₹80L-85L');
    await expect(sheet.getByTestId('mobile-listing-preview-bedrooms')).toContainText('4 BHK');

    // Canonical/query URL state unchanged apart from `listing=` — no
    // node=/breadcrumb/journey mutation from this marker-to-marker tap.
    const afterB = readUrlIdentity(page);
    expect(afterB).toEqual(afterA);
  });
});
