/**
 * Issue #2660 — DiscoverAreasJourneyPanel decomposition (areas-journey/
 * {hierarchy,results,contracts}, {view,commands} public contract). This is a
 * behaviour-preserving refactor; these specs are the DOM-level cross-layer
 * proof that the two gaps `e2e/discover-area-nav-journey.spec.ts` (URL state/
 * Back/Forward/bookmarks only) and `e2e/discover-cluster-focus-back.spec.ts`
 * (clusterFocus history contract only) leave open still work end-to-end after
 * the split:
 *
 *   1. Drilling City root -> Direction -> AREA leaf renders the leaf's own
 *      listing cards (`AreaLeafListingsSurface`, moved out of
 *      `DiscoverAreasJourneyPanel` verbatim per the module's own doc comment),
 *      and the in-panel hierarchy Back control (`HierarchyBackButton`,
 *      `areas-hierarchy-back`) returns to the parent Direction LEVEL panel
 *      (`AreaHierarchyLevelPanel`, also split out in this same issue).
 *   2. School-within-Area: entering school picking from the leaf
 *      (`area-set-schools-tile`) swaps in `SchoolsInAreaPanel`
 *      (`areas-journey-panel-schools-in-area`); exiting via its header Back
 *      control (`panel-header-back-button`) — `handleAreaFirstBack`'s 2nd
 *      rung, `schoolPicking` set with no `schoolId` -> `clearSchoolPicking`
 *      — restores the SAME leaf's listing cards. (A dashed-cluster
 *      focus/back round trip is intentionally NOT duplicated here — that is
 *      already covered live, with real history-length assertions, by
 *      `discover-cluster-focus-back.spec.ts`'s BR3/BR4.)
 *
 * Fixture strategy mirrors `discover-cluster-focus-back.spec.ts`: this repo's
 * canonical Areas hierarchy has no reachable public revision with a shallow,
 * deterministic Direction -> Area tree, so the navigation-resolve/-counts API
 * is intercepted with synthetic (but wire-shape-accurate) fixture JSON. Every
 * field name/shape matches `NavigationNodeResponse` (`navigation/types.ts`)
 * exactly; only the node keys/labels/coordinates are test-owned.
 *
 * Run:
 *   bash scripts/run-e2e-local.sh --project=full e2e/discover/issue-2660-area-leaf-drilldown.spec.ts
 */
import { test, expect, type Page, type Route } from '@playwright/test';

const CITY = 'udupi';

const D_KEY = 'd:south-udupi-2660';
const D_LABEL = 'South Udupi (2660 fixture)';
// A second, never-visited Direction sibling — see rootWire()'s doc comment:
// with only ONE non-leaf child, the map's singleton auto-advance
// (AreaMarkerLayer.tsx, "Issue #1943 singleton auto-advance") REPLACEs
// straight past the level this spec means to drill through by hand.
const D_OTHER_KEY = 'd:north-udupi-2660-unvisited';
const AREA_KEY = 'IN|KA|Udupi|Manipal2660Fixture';
const AREA_NODE_KEY = `a:${AREA_KEY}`;
const AREA_LABEL = 'Manipal (2660 fixture)';
// A second, never-visited Area sibling — same auto-advance guard, one level
// down (Direction -> Area).
const AREA_OTHER_NODE_KEY = 'a:IN|KA|Udupi|OtherArea2660Unvisited';

const LISTING_TITLE_A = 'Sunrise Residency 2660 Fixture';
const LISTING_TITLE_B = 'Copper Court 2660 Fixture';

function rootWire() {
  return {
    nodeKey: 'root',
    nodeType: 'ROOT',
    displayLabel: 'Udupi',
    depth: -1,
    regionKey: null,
    ancestry: [],
    nextLevelType: 'DIRECTION',
    // TWO children, deliberately — a lone non-leaf child fires the map's
    // singleton auto-advance (AreaMarkerLayer.tsx "Issue #1943 singleton
    // auto-advance": exactly one interactive cell REPLACEs straight past
    // this level), which would skip the manual drill-down this spec is
    // testing. `D_OTHER_KEY` is never clicked or resolved.
    children: [
      {
        nodeKey: D_KEY,
        nodeType: 'DIRECTION',
        displayLabel: D_LABEL,
        displayOrder: 1,
        descendantAreaCount: 1,
        centreLat: 13.36,
        centreLon: 74.78,
      },
      {
        nodeKey: D_OTHER_KEY,
        nodeType: 'DIRECTION',
        displayLabel: 'North Udupi (2660 fixture, unvisited)',
        displayOrder: 2,
        descendantAreaCount: 1,
        centreLat: 13.55,
        centreLon: 74.82,
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
    nodeKey: D_KEY,
    nodeType: 'DIRECTION',
    displayLabel: D_LABEL,
    depth: 0,
    regionKey: 'SOUTH',
    ancestry: [],
    nextLevelType: 'AREA',
    // TWO children — same singleton-auto-advance guard, one level down
    // (Direction -> Area). `AREA_OTHER_NODE_KEY` is never clicked or resolved.
    children: [
      {
        nodeKey: AREA_NODE_KEY,
        nodeType: 'AREA',
        displayLabel: AREA_LABEL,
        displayOrder: 1,
        areaKey: AREA_KEY,
        centreLat: 13.3525,
        centreLon: 74.7864,
      },
      {
        nodeKey: AREA_OTHER_NODE_KEY,
        nodeType: 'AREA',
        displayLabel: 'Other Area (2660 fixture, unvisited)',
        displayOrder: 2,
        areaKey: 'IN|KA|Udupi|OtherArea2660Unvisited',
        centreLat: 13.41,
        centreLon: 74.71,
      },
    ],
    revisionId: 1,
    bounds: {
      centreLat: 13.36, centreLon: 74.78,
      minLat: 13.3, minLon: 74.7, maxLat: 13.42, maxLon: 74.86,
    },
    descendantAreaKeys: [AREA_KEY, 'IN|KA|Udupi|OtherArea2660Unvisited'],
    areaKey: null,
  };
}

function areaWire() {
  return {
    nodeKey: AREA_NODE_KEY,
    nodeType: 'AREA',
    displayLabel: AREA_LABEL,
    depth: 1,
    regionKey: 'SOUTH',
    ancestry: [{ nodeKey: D_KEY, nodeType: 'DIRECTION', displayLabel: D_LABEL, displayOrder: 1 }],
    nextLevelType: 'LISTINGS',
    children: [],
    revisionId: 1,
    // A real bounds/centre pair is what makes `deriveAreaPointFromNode` resolve
    // a non-null AreaPoint — the exact gate `selectAreasJourneyBranch` uses to
    // choose 'area-leaf' over 'empty-level' (see selectAreasJourneyBranch.ts).
    bounds: {
      centreLat: 13.3525, centreLon: 74.7864,
      minLat: 13.34, minLon: 74.77, maxLat: 13.36, maxLon: 74.80,
    },
    descendantAreaKeys: null,
    areaKey: AREA_KEY,
  };
}

const WIRE_BY_KEY: Record<string, unknown> = {
  root: rootWire(),
  [D_KEY]: directionWire(),
  [AREA_NODE_KEY]: areaWire(),
};

const MOCK_LISTINGS_RESPONSE = {
  city: CITY,
  limitPerArea: 50,
  areas: [
    {
      areaKey: AREA_KEY,
      areaName: AREA_LABEL,
      listings: [
        {
          id: 'listing-2660-a',
          title: LISTING_TITLE_A,
          pricePaise: 4500000 * 100,
          propertyType: 'apartment',
          locality: 'Manipal',
          primaryImageUrl: null,
          listingPurpose: 'sale',
        },
        {
          id: 'listing-2660-b',
          title: LISTING_TITLE_B,
          pricePaise: 6200000 * 100,
          propertyType: 'apartment',
          locality: 'Manipal',
          primaryImageUrl: null,
          listingPurpose: 'sale',
        },
      ],
    },
  ],
};

function countsForNode(nodeKey: string) {
  const wire = WIRE_BY_KEY[nodeKey] as { children: Array<{ nodeKey: string }> } | undefined;
  const children = (wire?.children ?? []).map((c) => ({
    nodeKey: c.nodeKey,
    count: 2,
    schoolCount: 1,
    matchingAreaCount: 1,
  }));
  return {
    nodeKey,
    count: 2,
    schoolCount: 1,
    areaCounts: {},
    areaSchoolCounts: {},
    children,
    revisionId: 1,
  };
}

async function interceptDiscoverApis(page: Page) {
  // Generic fallback FIRST (LIFO route matching — the specific routes
  // registered below take precedence) so any other /api/discover/** call this
  // page mounts on load never surfaces as a console error masking the real
  // assertions. Mirrors discover-cluster-focus-back.spec.ts's own strategy.
  await page.route('**/api/discover/**', (route: Route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ areas: [], markers: [] }) });
  });

  await page.route('**/api/v1/discover/regions/summary**', (route: Route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ regions: [] }) });
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

  // Standalone-caller fallback query (useAreaLeafResultSource's own-query
  // path) — the map's areaBase is never matched here (no legacy `areaKey=`
  // in the URL), so this is the source the leaf actually renders from.
  await page.route(`**/api/discover/cities/${CITY}/listings**`, (route: Route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_LISTINGS_RESPONSE) });
  });

  await page.route('**/api/public/schools/by-area**', (route: Route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });
}

function cardTestId(nodeKey: string): string {
  return `navigation-child-card-${nodeKey}`;
}

async function currentUrlParam(page: Page, name: string): Promise<string | null> {
  return new URL(page.url()).searchParams.get(name);
}

test.describe('@integration-ui Issue #2660 — Areas hierarchy decomposition (area-leaf + school-within-area)', () => {
  test.beforeEach(async ({ page }) => {
    // Suppress the telemetry consent banner across every navigation in this
    // spec (it re-prompts on navigation and can intercept clicks) — set the
    // granted flag before any page script runs, rather than dismissing it
    // reactively after each `goto`/history change.
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('discover_telemetry_consent', 'granted');
      } catch {
        /* private-mode / blocked storage — the banner may still appear once; not this spec's concern */
      }
    });
    await interceptDiscoverApis(page);
  });

  test('drilling City -> Direction -> Area renders the leaf listing cards; Back returns to the parent Direction level', async ({
    page,
  }) => {
    await page.goto(`/discover?city=${CITY}&journey=area-first`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('navigation-level-panel')).toBeVisible({ timeout: 15_000 });

    // ── Drill City root -> Direction ──────────────────────────────────────
    await page.getByTestId(cardTestId(D_KEY)).click();
    await expect.poll(() => currentUrlParam(page, 'node'), { timeout: 8_000 }).toBe(D_KEY);
    await expect(page.getByTestId(cardTestId(AREA_NODE_KEY))).toBeVisible({ timeout: 8_000 });

    // ── Drill Direction -> Area (the canonical leaf) ──────────────────────
    await page.getByTestId(cardTestId(AREA_NODE_KEY)).click();
    await expect.poll(() => currentUrlParam(page, 'node'), { timeout: 8_000 }).toBe(AREA_NODE_KEY);

    const leaf = page.getByTestId('areas-journey-panel-listings');
    await expect(leaf).toBeVisible({ timeout: 12_000 });

    // Business-meaningful outcome: the leaf's OWN listing cards render (not a
    // count, not a generic non-empty check) — located by TITLE, never index
    // (card order ties on created_at across this codebase).
    const cards = leaf.getByTestId('listing-card');
    await expect(cards).toHaveCount(2);
    await expect(cards.filter({ hasText: LISTING_TITLE_A })).toBeVisible();
    await expect(cards.filter({ hasText: LISTING_TITLE_B })).toBeVisible();

    // ── Breadcrumb/Back returns to the PARENT level ───────────────────────
    const backButton = leaf.getByTestId('areas-hierarchy-back');
    await expect(backButton).toBeVisible();
    // Plain substring match — D_LABEL contains literal parentheses, which
    // would otherwise be parsed as a regex capture group.
    await expect(backButton).toContainText(`Back to ${D_LABEL}`);
    await backButton.click();

    // State actually changed: node= is the Direction again, the Direction's
    // level panel (with the Area child card) re-renders, and the leaf is gone.
    await expect.poll(() => currentUrlParam(page, 'node'), { timeout: 8_000 }).toBe(D_KEY);
    await expect(page.getByTestId('navigation-level-panel')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId(cardTestId(AREA_NODE_KEY))).toBeVisible();
    await expect(page.getByTestId('areas-journey-panel-listings')).not.toBeAttached();
  });

  test('School-within-Area: entering school picking from the leaf hides the listings; exiting restores the SAME leaf listings', async ({
    page,
  }) => {
    await page.goto(`/discover?city=${CITY}&journey=area-first&node=${encodeURIComponent(AREA_NODE_KEY)}`);
    await page.waitForLoadState('domcontentloaded');

    const leaf = page.getByTestId('areas-journey-panel-listings');
    await expect(leaf).toBeVisible({ timeout: 15_000 });
    await expect(leaf.getByTestId('listing-card')).toHaveCount(2);

    // ── Enter school picking from the leaf's "Schools in {area}" tile ─────
    await leaf.getByTestId('area-set-schools-tile').click();

    await expect.poll(() => currentUrlParam(page, 'schoolPicking'), { timeout: 8_000 }).toBe('1');
    const schoolPicker = page.getByTestId('areas-journey-panel-schools-in-area');
    await expect(schoolPicker).toBeVisible({ timeout: 10_000 });
    // The leaf's own listings surface is gone while picking — a real branch
    // swap, not an overlay.
    await expect(page.getByTestId('areas-journey-panel-listings')).not.toBeAttached();

    // ── Exit school picking via the picker's header Back control ─────────
    const back = schoolPicker.getByTestId('panel-header-back-button');
    await expect(back).toBeVisible();
    await back.click();

    // State actually changed: schoolPicking is cleared from the URL and the
    // AREA leaf's OWN listing cards (same titles, same area) reappear —
    // `handleAreaFirstBack`'s 2nd rung (schoolPicking set, no schoolId ->
    // clearSchoolPicking), never a full area dismissal.
    await expect.poll(() => currentUrlParam(page, 'schoolPicking'), { timeout: 8_000 }).toBeNull();
    await expect.poll(() => currentUrlParam(page, 'node'), { timeout: 8_000 }).toBe(AREA_NODE_KEY);

    const leafAfter = page.getByTestId('areas-journey-panel-listings');
    await expect(leafAfter).toBeVisible({ timeout: 10_000 });
    const cardsAfter = leafAfter.getByTestId('listing-card');
    await expect(cardsAfter).toHaveCount(2);
    await expect(cardsAfter.filter({ hasText: LISTING_TITLE_A })).toBeVisible();
    await expect(cardsAfter.filter({ hasText: LISTING_TITLE_B })).toBeVisible();
    await expect(page.getByTestId('areas-journey-panel-schools-in-area')).not.toBeAttached();
  });
});
