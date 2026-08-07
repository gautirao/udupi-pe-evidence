/**
 * Issue #2088 — clusterFocus REPLACE-vs-PUSH history contract (BR3/BR4).
 *
 * BR3: selecting a dashed visual AREA cluster calls `history.replaceState`,
 * never `pushState` — `history.length` is UNCHANGED.
 * BR4: selecting an Area FROM WITHIN a cluster focus PUSHES one new history
 * entry, and browser Back restores the cluster-focused entry — a full
 * round trip in a REAL browser history stack (not a JSDOM/unit-test stand-in
 * — this is exactly the class of behaviour a unit test cannot prove).
 *
 * ── CANDIDATE_FIXTURE ARM ──
 * The live hosted Bangalore revision (8) has ZERO CLUSTER ("Local
 * Destination") nodes and no dense AREA grouping reachable from the public
 * API today, and the real #2113 candidate tree (revision 1, PREPARING) is
 * unpromoted and unreachable from the public API. This spec therefore
 * intercepts the navigation-resolve/-counts API and serves fixture JSON
 * whose real field values (node keys, display labels, region key, real
 * representative area keys) are copied VERBATIM from
 * `src/features/discover/navigation/__fixtures__/candidateNavigationTree.ts`
 * (itself copied verbatim from the merged #2113 candidate,
 * `docs/audit/evidence/issue-2112/candidate-evidence.toml`) — see that
 * module's own doc comment for the full provenance chain. Playwright's test
 * runner does not share tsconfig path-alias resolution with the Vite/
 * Vitest toolchain the fixture module lives in, so the values are inlined
 * here rather than imported; drift between the two is a known, accepted risk
 * of this duplication (flagged, not hidden).
 *
 * ── ONE DELIBERATE FIXTURE-ONLY ADJUSTMENT: co-located coordinates ──
 * The real candidate's 7 Avalahalli-cluster AREA leaves are geographically
 * spread across real Bangalore (the cluster's own bbox spans ~6km lat /
 * ~3km lon) — whether they visually group into ONE dashed client-side
 * cluster in a real browser depends on the exact pixel grid cell at
 * whatever zoom the camera lands on, which this spec cannot control
 * precisely. To make the "dashed cluster forms" precondition DETERMINISTIC
 * (never flaky, never zoom-dependent), every AREA leaf's `centreLat`/
 * `centreLon` here is set to the IDENTICAL coordinate (the cluster's own
 * real centroid) — guaranteeing they land in the same pixel grid cell at
 * ANY zoom level, since `areaClustering.ts` groups by PROJECTED PIXEL
 * position. Every other field (node keys, labels, `areaKey`s,
 * `descendantAreaCount`) is the real candidate value, unmodified.
 */
import { test, expect, type Page, type Route } from '@playwright/test';

const CITY = 'bangalore';
const BASE = `city=${CITY}&journey=area-first`;

// ── Real #2113 candidate values (candidate-evidence.toml, via candidateNavigationTree.ts) ──
const D_CENTRAL_KEY = 'd:central';
const D_CENTRAL_LABEL = 'Langford Gardens & Lavelle Road';
const CLUSTER_KEY = 'c:central:in-ka-bengaluru-avalahalli-in-ka-bengaluru-deepanjali-nagar';
const CLUSTER_LABEL = 'Avalahalli & Deepanjali Nagar';
const CLUSTER_CENTRE_LAT = 12.945136;
const CLUSTER_CENTRE_LON = 77.541264;
const AREA_AVALAHALLI_KEY = 'IN|KA|Bengaluru|Avalahalli';
const AREA_AVALAHALLI_NODE_KEY = 'a:IN|KA|Bengaluru|Avalahalli';

// 7 real member area leaves (2 real representative + 5 DERIVED_TO_COUNT, per
// the fixture module's own accounting) — co-located per the module doc above.
const CLUSTER_MEMBER_LEAVES = [
  { nodeKey: AREA_AVALAHALLI_NODE_KEY, areaKey: AREA_AVALAHALLI_KEY, displayLabel: 'Avalahalli' },
  { nodeKey: 'a:IN|KA|Bengaluru|Deepanjali Nagar', areaKey: 'IN|KA|Bengaluru|Deepanjali Nagar', displayLabel: 'Deepanjali Nagar' },
  { nodeKey: 'a:IN|KA|Bengaluru|DERIVED_TO_COUNT_1', areaKey: 'IN|KA|Bengaluru|DERIVED_TO_COUNT_1', displayLabel: 'Derived-to-count area 1 (synthetic)' },
  { nodeKey: 'a:IN|KA|Bengaluru|DERIVED_TO_COUNT_2', areaKey: 'IN|KA|Bengaluru|DERIVED_TO_COUNT_2', displayLabel: 'Derived-to-count area 2 (synthetic)' },
  { nodeKey: 'a:IN|KA|Bengaluru|DERIVED_TO_COUNT_3', areaKey: 'IN|KA|Bengaluru|DERIVED_TO_COUNT_3', displayLabel: 'Derived-to-count area 3 (synthetic)' },
  { nodeKey: 'a:IN|KA|Bengaluru|DERIVED_TO_COUNT_4', areaKey: 'IN|KA|Bengaluru|DERIVED_TO_COUNT_4', displayLabel: 'Derived-to-count area 4 (synthetic)' },
  { nodeKey: 'a:IN|KA|Bengaluru|DERIVED_TO_COUNT_5', areaKey: 'IN|KA|Bengaluru|DERIVED_TO_COUNT_5', displayLabel: 'Derived-to-count area 5 (synthetic)' },
];

const CLUSTER_ANCESTRY = [
  { nodeKey: D_CENTRAL_KEY, nodeType: 'DIRECTION', displayLabel: D_CENTRAL_LABEL, displayOrder: 1 },
];
const AVALAHALLI_ANCESTRY = [
  ...CLUSTER_ANCESTRY,
  { nodeKey: CLUSTER_KEY, nodeType: 'CLUSTER', displayLabel: CLUSTER_LABEL, displayOrder: 1 },
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
        descendantAreaCount: 57,
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

function directionWire() {
  return {
    nodeKey: D_CENTRAL_KEY,
    nodeType: 'DIRECTION',
    displayLabel: D_CENTRAL_LABEL,
    depth: 0,
    regionKey: 'CENTRAL',
    ancestry: [],
    nextLevelType: 'CLUSTER',
    children: [
      {
        nodeKey: CLUSTER_KEY,
        nodeType: 'CLUSTER',
        displayLabel: CLUSTER_LABEL,
        displayOrder: 1,
        descendantAreaCount: 7,
        representativeAreaKeys: [AREA_AVALAHALLI_KEY, 'IN|KA|Bengaluru|Deepanjali Nagar'],
        centreLat: CLUSTER_CENTRE_LAT,
        centreLon: CLUSTER_CENTRE_LON,
      },
    ],
    revisionId: 1,
    bounds: {
      centreLat: 12.971737, centreLon: 77.595829,
      minLat: 12.89392, minLon: 77.522663, maxLat: 13.047239, maxLon: 77.663592,
    },
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
      // Deliberately CO-LOCATED — see module doc's "ONE DELIBERATE
      // FIXTURE-ONLY ADJUSTMENT" section.
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

function areaWire() {
  return {
    nodeKey: AREA_AVALAHALLI_NODE_KEY,
    nodeType: 'AREA',
    displayLabel: 'Avalahalli',
    depth: 2,
    regionKey: 'CENTRAL',
    ancestry: AVALAHALLI_ANCESTRY,
    nextLevelType: 'LISTINGS',
    children: [],
    revisionId: 1,
    bounds: null,
    descendantAreaKeys: null,
    areaKey: AREA_AVALAHALLI_KEY,
  };
}

const WIRE_BY_KEY: Record<string, unknown> = {
  root: rootWire(),
  [D_CENTRAL_KEY]: directionWire(),
  [CLUSTER_KEY]: clusterWire(),
  [AREA_AVALAHALLI_NODE_KEY]: areaWire(),
};

function countsForNode(nodeKey: string) {
  const wire = WIRE_BY_KEY[nodeKey] as { children: Array<{ nodeKey: string }> } | undefined;
  const children = (wire?.children ?? []).map((c) => ({
    nodeKey: c.nodeKey,
    count: 5,
    schoolCount: 1,
    matchingAreaCount: 1,
  }));
  return {
    nodeKey,
    count: 20,
    schoolCount: 2,
    areaCounts: {},
    areaSchoolCounts: {},
    children,
    revisionId: 1,
  };
}

async function interceptNavigationApi(page: Page) {
  // Generic fallback for any OTHER /api/discover/** call this page mounts on
  // load (blended areas, filtered markers, trends options, etc.) — returns a
  // minimal, well-shaped empty success payload so those calls never surface
  // as console errors that could mask the real assertions below. Registered
  // FIRST so the more specific routes below (registered after) take
  // precedence per Playwright's LIFO route-matching order.
  await page.route('**/api/discover/**', (route: Route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ areas: [], markers: [] }) });
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

function cardTestId(nodeKey: string): string {
  return `navigation-child-card-${nodeKey}`;
}

async function currentNodeParam(page: Page): Promise<string | null> {
  return new URL(page.url()).searchParams.get('node');
}

async function driveToClusterLevel(page: Page): Promise<void> {
  await page.goto(`/discover?${BASE}`);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByTestId('navigation-level-panel')).toBeVisible({ timeout: 15_000 });

  await page.getByTestId(cardTestId(D_CENTRAL_KEY)).click();
  await expect.poll(() => currentNodeParam(page)).toBe(D_CENTRAL_KEY);
  await expect(page.getByTestId(cardTestId(CLUSTER_KEY))).toBeVisible();

  await page.getByTestId(cardTestId(CLUSTER_KEY)).click();
  await expect.poll(() => currentNodeParam(page)).toBe(CLUSTER_KEY);
}

test.describe('@integration-ui Issue #2088 — clusterFocus history contract (CANDIDATE_FIXTURE arm)', () => {
  test.beforeEach(async ({ page }) => {
    await interceptNavigationApi(page);
  });

  test('BR3 (+ CONTROL): selecting a dashed visual cluster REPLACEs (history.length unchanged); selecting an Area PUSHes (history.length increments)', async ({
    page,
  }) => {
    await driveToClusterLevel(page);

    // At the CLUSTER node's 'areas' level, all 7 co-located member leaves
    // group into ONE dashed visual cluster marker (real normalizeNavigationNode
    // parse path, real areaClustering.ts grouping — see module doc).
    const visualClusterMarker = page.locator('[data-testid="area-visual-cluster-marker"]');
    await expect(visualClusterMarker).toBeVisible({ timeout: 15_000 });

    const lengthBeforeClusterClick = await page.evaluate(() => window.history.length);
    await visualClusterMarker.click();

    // BR1/BR2: clicking the dashed cluster never changes node= — still the
    // CLUSTER node's own key, and the URL now carries clusterFocus=.
    await expect.poll(() => currentNodeParam(page)).toBe(CLUSTER_KEY);
    await expect.poll(() => new URL(page.url()).searchParams.has('clusterFocus')).toBe(true);

    // BR3 — REPLACE, never PUSH: history.length is UNCHANGED.
    const lengthAfterClusterClick = await page.evaluate(() => window.history.length);
    expect(lengthAfterClusterClick).toBe(lengthBeforeClusterClick);

    // The cluster-focus panel surface is now showing exactly the (co-located,
    // therefore all-clustered) 7 members.
    await expect(page.getByTestId('areas-cluster-focus-panel')).toBeVisible();
    const memberButton = page.getByTestId(`areas-cluster-focus-member-${AREA_AVALAHALLI_NODE_KEY}`);
    await expect(memberButton).toBeVisible();

    // CONTROL — selecting an Area FROM WITHIN the cluster focus is a REAL
    // node navigation: it PUSHes exactly one new entry. Comparing against the
    // REPLACE above (same page, same session) is what makes this a genuine
    // control rather than an assumption about Playwright's counting.
    const lengthBeforeAreaClick = await page.evaluate(() => window.history.length);
    await memberButton.click();

    await expect.poll(() => currentNodeParam(page)).toBe(AREA_AVALAHALLI_NODE_KEY);
    const lengthAfterAreaClick = await page.evaluate(() => window.history.length);
    expect(lengthAfterAreaClick).toBe(lengthBeforeAreaClick + 1);

    // The pushed entry also cleared clusterFocus (BR5, already unit-tested;
    // reconfirmed live here since it is directly relevant to what Back must
    // restore below).
    expect(new URL(page.url()).searchParams.has('clusterFocus')).toBe(false);
  });

  test('BR4: selecting an Area from within a cluster focus pushes one entry; browser Back restores the CLUSTER-FOCUSED entry (full round trip)', async ({
    page,
  }) => {
    await driveToClusterLevel(page);

    const visualClusterMarker = page.locator('[data-testid="area-visual-cluster-marker"]');
    await expect(visualClusterMarker).toBeVisible({ timeout: 15_000 });
    await visualClusterMarker.click();
    await expect.poll(() => new URL(page.url()).searchParams.has('clusterFocus')).toBe(true);
    const urlAfterClusterFocus = page.url();

    const memberButton = page.getByTestId(`areas-cluster-focus-member-${AREA_AVALAHALLI_NODE_KEY}`);
    await expect(memberButton).toBeVisible();
    await memberButton.click();
    await expect.poll(() => currentNodeParam(page)).toBe(AREA_AVALAHALLI_NODE_KEY);

    // Real browser Back — the whole point of BR4 (a JSDOM/unit-test harness
    // cannot exercise the actual browser history stack this way).
    await page.goBack();

    // The cluster-focused entry is restored EXACTLY: same node= (the CLUSTER,
    // unchanged by BR2), same clusterFocus= value, same rendered surface.
    await expect.poll(() => currentNodeParam(page)).toBe(CLUSTER_KEY);
    await expect.poll(() => page.url()).toBe(urlAfterClusterFocus);
    await expect(page.getByTestId('areas-cluster-focus-panel')).toBeVisible();
    await expect(page.getByTestId(`areas-cluster-focus-member-${AREA_AVALAHALLI_NODE_KEY}`)).toBeVisible();
  });
});
