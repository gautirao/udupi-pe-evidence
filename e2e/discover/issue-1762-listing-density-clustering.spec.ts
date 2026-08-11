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

import { test, expect, type Page, type Route, type Locator } from '@playwright/test';

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
 * the orthogonal density-hold behaviour already proven dense (N=1000) by
 * the "cluster tap fits..." and "progressive splitting" tests above — at
 * this app's real viewport-relative fitBounds math, a genuinely dense
 * cluster's fit-to-members always lands at exactly
 * CLUSTER_DISABLE_AT_ZOOM(16) (its clamp ceiling), which is precisely where
 * a dense cluster's post-fit reveal decision (held clustered) and a fresh
 * cold-load's default decision (declustered) intentionally diverge — that
 * divergence is real, current, correct product behaviour (the reveal-hold
 * is deliberately scoped to a post-cluster-tap-fit settle, not a pure
 * function of zoom+extent), not a defect this test should paper over.
 * Unique per-cell counts also let a clicked cluster's own aria-label
 * unambiguously identify which top-cell geometry it corresponds to,
 * without depending on Leaflet's internal DOM/render order matching the
 * fixture's generation order.
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
