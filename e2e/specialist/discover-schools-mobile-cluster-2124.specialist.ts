/**
 * Issue #2124 review #4888978918 — regression matrix gap 1 (mobile).
 *
 * MobileClusterSheet (src/features/discover/views/mobile/MobileClusterSheet.tsx)
 * is the MAP-mode counterpart of the desktop cluster-focus panel. The #2124
 * fix rewired MapDiscovery.tsx so it is now driven by `activeAreasNavigationJourney`
 * (whose `selectNode` is `handleCanonicalNodeSelect` — the SAME canonical
 * AREA-leaf selection wrapper the map's `AreaDestinationMarkerLayer` and the
 * desktop panel both use) and `eligibilityJourney={nav.journey === 'school-first'
 * ? 'schools' : 'areas'}` — see the working-tree diff at MapDiscovery.tsx
 * (`journey={areasNavigationJourney}` -> `journey={activeAreasNavigationJourney}`,
 * plus the new `eligibilityJourney` prop). Before this fix, tapping a member
 * inside the mobile cluster sheet during the school-first journey called the
 * PLAIN (non-canonical) `areasNavigationJourney.selectNode`, which for an AREA
 * leaf just navigates the hierarchy node instead of entering the
 * SchoolsInArea/`areaKey=` state a map-marker or panel-row click reaches — a
 * real map/panel/mobile divergence.
 *
 * ── WHY THIS SPEC INTERCEPTS THE NAVIGATION API (fixture, not live data) ──
 * Investigated the real seeded Bangalore navigation tree live (GET
 * .../navigation/c:central:in-ka-bengaluru-btm-layout-in-ka-bengaluru-koramangala/counts
 * against the local fixture backend, port 8085): the BTM Layout/Koramangala
 * cluster's members have MIXED school eligibility (Koramangala schoolCount=4,
 * every sibling schoolCount=0). Live-browser reproduction (5 real synthetic-
 * pointer taps on the real `area-visual-cluster-marker`, verified hit-testable
 * and camera-responsive) showed the `mobile-cluster-sheet` never opens for
 * that real mixed cluster: `AreaDestinationMarkerLayer`'s own focus-
 * reconciliation effect (AreaMarkerLayer.tsx's `stillAllVisible` check, fed by
 * `partitionMembersByJourney(..., 'schools')` in journeyVisibility.ts) treats
 * the zero-school member as journey-ineligible and immediately clears the
 * focus the SAME click just set — a pre-existing eligibility/clustering
 * reconciliation mismatch, NOT part of this diff (`clusterVisibleAreaMembers`
 * still groups the zero-school member INTO the cluster in the first place;
 * only the reconciliation check disagrees). That defect is orthogonal to the
 * #2124 map/panel/mobile SELECTION-ROUTING fix this spec is chartered to
 * cover, and is out of scope for this diff — flagged separately, not fixed
 * here. To prove the #2124 routing fix deterministically (never blocked by
 * that separate defect), every member of the fixture cluster below carries a
 * uniform non-zero schoolCount, so the sheet reliably opens — mirroring the
 * SAME established co-located-fixture technique
 * `e2e/discover-cluster-focus-back.spec.ts` already uses for this exact
 * dashed-cluster/`AreaDestinationMarkerLayer` surface (real node keys/labels
 * copied verbatim from that file's own real #2113 candidate-tree fixture).
 */
import { test, expect } from './support/specialist-test';
import type { Page, Route } from '@playwright/test';

const CITY = 'bangalore';
const MOBILE_VIEWPORT = { width: 390, height: 844 };

const D_CENTRAL_KEY = 'd:central';
const D_CENTRAL_LABEL = 'Langford Gardens & Lavelle Road';
const CLUSTER_KEY = 'c:central:in-ka-bengaluru-avalahalli-in-ka-bengaluru-deepanjali-nagar';
const CLUSTER_LABEL = 'Avalahalli & Deepanjali Nagar';
const CLUSTER_CENTRE_LAT = 12.945136;
const CLUSTER_CENTRE_LON = 77.541264;
const AREA_AVALAHALLI_KEY = 'IN|KA|Bengaluru|Avalahalli';
const AREA_AVALAHALLI_NODE_KEY = 'a:IN|KA|Bengaluru|Avalahalli';
const AREA_DEEPANJALI_KEY = 'IN|KA|Bengaluru|Deepanjali Nagar';
const AREA_DEEPANJALI_NODE_KEY = 'a:IN|KA|Bengaluru|Deepanjali Nagar';

// Real #2113 candidate values, verbatim (see e2e/discover-cluster-focus-back.spec.ts's
// own module doc for the provenance chain) — co-located coordinates so the
// two members ALWAYS group into one visual cluster regardless of zoom
// (areaClustering.ts groups by projected pixel position).
const CLUSTER_MEMBER_LEAVES = [
  { nodeKey: AREA_AVALAHALLI_NODE_KEY, areaKey: AREA_AVALAHALLI_KEY, displayLabel: 'Avalahalli' },
  { nodeKey: AREA_DEEPANJALI_NODE_KEY, areaKey: AREA_DEEPANJALI_KEY, displayLabel: 'Deepanjali Nagar' },
];

const CLUSTER_ANCESTRY = [
  { nodeKey: D_CENTRAL_KEY, nodeType: 'DIRECTION', displayLabel: D_CENTRAL_LABEL, displayOrder: 1 },
];

function rootWire() {
  return {
    nodeKey: 'root',
    nodeType: 'ROOT',
    displayLabel: 'Bangalore',
    depth: -1,
    regionKey: null,
    ancestry: [],
    nextLevelType: 'DIRECTION',
    children: [
      {
        nodeKey: D_CENTRAL_KEY,
        nodeType: 'DIRECTION',
        displayLabel: D_CENTRAL_LABEL,
        displayOrder: 1,
        descendantAreaCount: 2,
        centreLat: 12.971737,
        centreLon: 77.595829,
      },
    ],
    revisionId: 1,
    bounds: null,
    descendantAreaKeys: null,
    areaKey: null,
  };
}

function clusterWire() {
  return {
    nodeKey: CLUSTER_KEY,
    nodeType: 'CLUSTER',
    displayLabel: CLUSTER_LABEL,
    depth: 1,
    regionKey: 'CENTRAL',
    ancestry: CLUSTER_ANCESTRY,
    nextLevelType: 'AREA',
    children: CLUSTER_MEMBER_LEAVES.map((leaf, i) => ({
      nodeKey: leaf.nodeKey,
      nodeType: 'AREA',
      displayLabel: leaf.displayLabel,
      displayOrder: i + 1,
      areaKey: leaf.areaKey,
      centreLat: CLUSTER_CENTRE_LAT,
      centreLon: CLUSTER_CENTRE_LON,
    })),
    revisionId: 1,
    bounds: {
      centreLat: CLUSTER_CENTRE_LAT, centreLon: CLUSTER_CENTRE_LON,
      minLat: 12.917519, minLon: 77.529864, maxLat: 12.973625, maxLon: 77.562382,
    },
    descendantAreaKeys: CLUSTER_MEMBER_LEAVES.map((l) => l.areaKey),
    areaKey: null,
  };
}

const WIRE_BY_KEY: Record<string, unknown> = {
  root: rootWire(),
  [CLUSTER_KEY]: clusterWire(),
};

function countsForNode(nodeKey: string) {
  const wire = WIRE_BY_KEY[nodeKey] as { children: Array<{ nodeKey: string }> } | undefined;
  // Uniform non-zero schoolCount on every child — see module doc: this
  // sidesteps the separate, pre-existing mixed-eligibility reconciliation
  // defect so the sheet opens deterministically for THIS spec's purpose.
  const children = (wire?.children ?? []).map((c) => ({
    nodeKey: c.nodeKey,
    count: 5,
    schoolCount: 2,
    matchingAreaCount: 1,
  }));
  return {
    nodeKey,
    count: 10,
    schoolCount: 4,
    areaCounts: {},
    areaSchoolCounts: {},
    children,
    revisionId: 1,
  };
}

// Matches DiscoverArea (src/hooks/useDiscoverAreas.ts) — populated so
// MapDiscovery.tsx's `handleCanonicalNodeSelect` takes its REAL
// `handleAreaSelect(match)` branch (discoverAreas.find(...) succeeds), the
// SAME branch a live desktop map-marker/panel-row AREA click exercises in
// discover-schools-canonical-2124.spec.ts — never the degraded
// `actions.selectArea` fallback used only when the area is genuinely absent
// from the loaded city area list.
const DISCOVER_AREAS_FIXTURE = CLUSTER_MEMBER_LEAVES.map((leaf) => ({
  areaKey: leaf.areaKey,
  name: leaf.displayLabel,
  geoCenterLat: CLUSTER_CENTRE_LAT,
  geoCenterLon: CLUSTER_CENTRE_LON,
  listingCount: 5,
  schoolCount: 2,
}));

async function interceptSchoolsNavigationApi(page: Page) {
  await page.route('**/api/discover/**', (route: Route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ areas: [], markers: [] }) });
  });

  await page.route('**/api/discover/areas**', (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ city: CITY, areas: DISCOVER_AREAS_FIXTURE }),
    });
  });

  await page.route('**/api/discover/cities/*/navigation/resolve**', (route: Route) => {
    const url = new URL(route.request().url());
    const nodeKey = url.searchParams.get('node') ?? 'root';
    const wire = WIRE_BY_KEY[nodeKey];
    if (!wire) {
      route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not found' }) });
      return;
    }
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ requested: nodeKey, resolution: 'EXACT', node: wire, revisionId: 1 }),
    });
  });

  await page.route('**/api/discover/cities/*/navigation/*/counts**', (route: Route) => {
    const url = new URL(route.request().url());
    const match = url.pathname.match(/\/navigation\/([^/]+)\/counts$/);
    const nodeKey = match ? decodeURIComponent(match[1]) : 'root';
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(countsForNode(nodeKey)),
    });
  });
}

test.describe('@integration-ui Issue #2124 — mobile MobileClusterSheet reaches the SAME canonical selection as map/panel', () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test.beforeEach(async ({ page }) => {
    await interceptSchoolsNavigationApi(page);
  });

  test('tapping a cluster member in the school-first mobile sheet drives the SAME handleCanonicalNodeSelect routing a map/panel AREA click uses', async ({
    page,
  }) => {
    await page.goto(`/discover?city=${CITY}&journey=school-first&node=${encodeURIComponent(CLUSTER_KEY)}`);
    await page.waitForLoadState('domcontentloaded');
    const decline = page.getByRole('button', { name: /decline anonymous usage data collection/i });
    if (await decline.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await decline.click();
    }

    // Switch into the mobile MAP overlay — MobileClusterSheet only mounts there.
    const mapTrigger = page.getByTestId('control-bar-map-trigger');
    await expect(mapTrigger).toBeVisible({ timeout: 15_000 });
    await mapTrigger.click();
    await expect(page.getByTestId('mobile-map-close-list-button')).toBeVisible({ timeout: 10_000 });

    // Both members are co-located -> exactly one dashed visual cluster marker.
    const clusterMarker = page.locator('[data-testid="area-visual-cluster-marker"]');
    await expect(clusterMarker).toBeVisible({ timeout: 15_000 });
    await clusterMarker.click();

    const sheet = page.getByTestId('mobile-cluster-sheet');
    await expect(sheet, '#2124: the mobile cluster sheet must open for a school-first canonical cluster tap').toBeVisible({
      timeout: 10_000,
    });

    // Tap the Avalahalli member row — the SAME testid contract
    // `issue-1956-pr5-mobile-cluster-sheet.spec.ts` already exercises for
    // the residential (area-first) journey.
    const memberButton = page.getByTestId(`mobile-cluster-sheet-member-${AREA_AVALAHALLI_NODE_KEY}`);
    await expect(memberButton).toBeVisible();
    await memberButton.click();

    // #2124 fix under test: this AREA-leaf tap must reach the SAME
    // areaKey=/SchoolsInArea state a desktop map-marker or panel-row click
    // reaches (real url state, not a node= hierarchy hop) — see
    // MapDiscovery.tsx's `handleCanonicalNodeSelect` (school-first branch),
    // which activeAreasNavigationJourney.selectNode is now wired to.
    await expect.poll(
      () => new URL(page.url()).searchParams.get('areaKey'),
      { message: '#2124: tapping a mobile cluster-sheet AREA member must write the SAME canonical areaKey= a map/panel click would', timeout: 8_000 },
    ).toBe(AREA_AVALAHALLI_KEY);

    // node= must NOT still be the CLUSTER node — the canonical wrapper
    // routes to the areaKey/SchoolsInArea surface, not a further hierarchy
    // hop, exactly like the map-marker and panel-row cases in
    // discover-schools-canonical-2124.spec.ts.
    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel, '#2124: reaching areaKey= state must surface the SchoolsInArea right panel, same as a map/panel AREA click').toBeVisible({
      timeout: 15_000,
    });
  });
});
