/**
 * Issue #1956 PR-3 — Visual AREA clustering + single-AREA selection.
 *
 * Below a Direction node the map previously rendered nothing (F1). PR-3 adds
 * real-geography markers for AREA/Local-Destination children
 * (`area-single-marker` / `area-destination-marker`), ad-hoc client-side
 * visual AREA clusters (`area-visual-cluster-marker`) for dense AREA
 * children, and a shared cluster-focus surface
 * (`areas-cluster-focus-panel`) owned by ONE piece of state lifted in
 * `MapDiscovery.tsx` (`focusedClusterMemberAreaKeys`) and threaded to both
 * the map (`AreaDestinationMarkerLayer`) and the right panel
 * (`DiscoverAreasJourneyPanel`).
 *
 * ── FIXTURE PROVENANCE (read before "fixing" any assertion below) ──
 * Per issue #2032, the local fixture backend cannot generate/promote a
 * navigation revision from canonical seed inputs (`CityLaunchPromotionService`
 * requires a full sandbox-generate -> validate -> launch admin workflow with
 * no fixture-restore equivalent). A fresh `local-fixture-backend.sh` restore
 * has ZERO rows in `navigation_nodes`, `city_launch_revision` and
 * `property_listings` for Bangalore — confirmed live against this branch's
 * fixture container (`GET .../navigation/resolve?node=d:w` returns
 * `"City has no active navigation hierarchy"` before seeding). This spec
 * therefore extends PR-2's own hand-seeded approach: a deterministic tree was
 * inserted directly into the disposable local fixture Postgres (never
 * committed to the repo, never touching the shared hosted Supabase DB — see
 * `scripts/dev/local-fixture-backend.sh`'s throwaway-container guarantee),
 * mirroring PR-2's `d:w`/Basaveshwara Nagar node exactly and adding ONE new
 * Direction (`d:s`, "South Bangalore") dense enough to force visual
 * clustering:
 *
 *   root
 *     -> d:w "West Bangalore" (DIRECTION)
 *          -> a:...Basaveshwara Nagar (AREA, 2 listings) — REAL geo_center,
 *             the DIRECTION's only child, so it always renders as a lone
 *             `area-single-marker`, never a cluster (AC4.6).
 *     -> d:s "South Bangalore" (DIRECTION, NEW for PR-3)
 *          -> a:...RR Nagar     (AREA, 3 listings)  \
 *          -> a:...Vijayanagar  (AREA, 2 listings)   |- synthetic
 *          -> a:...Nagarbhavi   (AREA, 1 listing)    |  navigation_nodes
 *          -> a:...Hosahalli    (AREA, 0 listings)  /   centre_lat/lon
 *             (NOT each area's real geo_center — navigation_nodes carries its
 *             OWN centre columns, independent of `areas.geo_center_*`)
 *             deliberately ~10-15m apart for RR Nagar/Vijayanagar/Nagarbhavi,
 *             so the client-side pixel-grid clusterer (`areaClustering.ts`)
 *             groups them into exactly ONE visual cluster cell at any
 *             zoom/viewport this suite runs at. Hosahalli carries 0 listings
 *             -> `journeyVisibility`'s eligibility filter runs BEFORE
 *             clustering, so it is excluded from the map entirely (never
 *             part of the cluster), but still renders in the un-focused
 *             panel's normal child list as a "No listings yet" leaf AREA
 *             card (same contract as PR-2's Binnipete).
 *
 * Confirmed live via `GET /api/discover/cities/bangalore/navigation/root/counts`
 * after seeding: `{"nodeKey":"d:w","count":2,"matchingAreaCount":1}`,
 * `{"nodeKey":"d:s","count":6,"matchingAreaCount":3}` — the cluster's 3
 * visible members (3+2+1 listings = 6) sum to the SAME total the map cluster
 * marker and the focused panel both display (AC4.12). NOTE, confirmed live:
 * the map marker's "+N areas with matches" copy caps representative names at
 * `MAX_REPRESENTATIVE_NAMES` (2), so with 3 visible members it reads "+1
 * areas with matches"; the PANEL's focused view passes its own real,
 * uncapped displayed count as the limit (`DiscoverAreasJourneyPanel`'s
 * "REQUIRED CHANGE 2"), so the SAME 3-member cluster reads "3 areas with
 * matches" there — a deliberate, locked divergence between the two
 * surfaces' copy, not a bug. Agreement (AC4.12) is on the underlying member
 * set and listing total, never on the two surfaces sharing one string.
 *
 * The area_keys themselves (`IN|KA|Bengaluru|RR Nagar` etc.) are real
 * Bangalore geography rows already present from the V106 migration — only
 * their `navigation_nodes` position/parentage and their `property_listings`
 * rows are fixture-only, non-committed data.
 */
import { test, expect, type Page } from '@playwright/test';

const CITY = 'bangalore';
const BASE = `city=${CITY}&journey=area-first&areasPreview=1`;

const D_W = 'd:w';
const D_S = 'd:s';
const AREA_BASAVESHWARA = 'a:IN|KA|Bengaluru|Basaveshwara Nagar';
const AREA_RR_NAGAR = 'a:IN|KA|Bengaluru|RR Nagar';
const AREA_VIJAYANAGAR = 'a:IN|KA|Bengaluru|Vijayanagar';
const AREA_NAGARBHAVI = 'a:IN|KA|Bengaluru|Nagarbhavi';
const AREA_HOSAHALLI = 'a:IN|KA|Bengaluru|Hosahalli';

function cardTestId(nodeKey: string): string {
  return `navigation-child-card-${nodeKey}`;
}

function singleMarkerLocator(page: Page, nodeKey: string) {
  return page.locator(`[data-testid="area-single-marker"][data-node-key="${nodeKey}"]`);
}

function clusterMarkerLocator(page: Page) {
  return page.locator('[data-testid="area-visual-cluster-marker"]');
}

/**
 * Leaflet recreates each marker's DOM element on layout-affecting events
 * (`layoutTick`/zoom recompute in `AreaDestinationMarkerLayer`), which makes
 * Playwright's higher-level `locator.click()` actionability wait unreliable
 * for these markers — confirmed directly in the sibling PR-2 spec
 * (`issue-1956-pr2-destination-surface.spec.ts`): a real synthetic mouse
 * move/down/up at the marker's own bounding-box centre DOES navigate/act
 * correctly, while `locator.click()` on the exact same element intermittently
 * no-ops. Reused verbatim here rather than reimplemented.
 */
async function clickMarker(locator: ReturnType<typeof clusterMarkerLocator>): Promise<void> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('marker has no bounding box');
  }
  await locator.page().mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await locator.page().mouse.down();
  await locator.page().mouse.up();
}

async function currentNodeParam(page: Page): Promise<string | null> {
  return new URL(page.url()).searchParams.get('node');
}

async function historyLength(page: Page): Promise<number> {
  return page.evaluate(() => window.history.length);
}

async function breadcrumbText(page: Page): Promise<string> {
  return (await page.getByTestId('areas-breadcrumb-trail').locator('[aria-current="page"]').textContent()) ?? '';
}

async function openRoot(page: Page) {
  await page.goto(`/discover?${BASE}`);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByTestId('navigation-level-panel')).toBeVisible({ timeout: 15_000 });
}

async function goToDirection(page: Page, nodeKey: string) {
  await page.getByTestId(cardTestId(nodeKey)).click();
  await expect.poll(() => currentNodeParam(page)).toBe(nodeKey);
}

test.describe('@integration-ui #1956 PR-3 — single-AREA marker composition (AC4.6)', () => {
  test('Basaveshwara Nagar (sole child of West Bangalore) renders as a single-AREA marker with name + counts and NO "+N"/nearby-area line', async ({
    page,
  }) => {
    await openRoot(page);
    await goToDirection(page, D_W);

    // Positive: the real single-AREA marker rendered (never a cluster — it
    // is the ONLY child of this Direction).
    const marker = singleMarkerLocator(page, AREA_BASAVESHWARA);
    await expect(marker).toBeVisible();
    await expect(marker).toContainText('Basaveshwara Nagar');
    await expect(marker).toContainText('2 listings');

    // Negative, only now that positive presence is proven: no visual
    // cluster ever appears for a lone child, and the marker itself carries
    // no "+N"/"areas with matches" form (that copy belongs to Direction/
    // Cluster structural cards and to ad-hoc visual clusters, never a leaf
    // single-AREA marker).
    await expect(clusterMarkerLocator(page)).toHaveCount(0);
    await expect(marker).not.toContainText(/\+\d/);
    await expect(marker).not.toContainText('areas with matches');
  });
});

test.describe('@integration-ui #1956 PR-3 — visual AREA cluster tap is presentation-only (AC4.4)', () => {
  test('tapping the South Bangalore visual cluster focuses map/panel WITHOUT changing node=, the breadcrumb, or browser history', async ({
    page,
  }) => {
    await openRoot(page);
    await goToDirection(page, D_S);

    // Positive: the real dense-cluster surface rendered — exactly ONE
    // visual cluster marker (RR Nagar/Vijayanagar/Nagarbhavi collapse into
    // one cell; zero-listing Hosahalli is excluded from the map entirely by
    // eligibility, so it can never inflate this count), never one marker
    // per member.
    const cluster = clusterMarkerLocator(page);
    await expect(cluster).toHaveCount(1);
    await expect(cluster).toContainText('+1 areas with matches');
    await expect(cluster).toContainText('6 listings');
    await expect(page.getByTestId('areas-cluster-focus-panel')).toHaveCount(0);

    const nodeBefore = await currentNodeParam(page);
    const historyBefore = await historyLength(page);
    const breadcrumbBefore = await breadcrumbText(page);
    expect(nodeBefore).toBe(D_S);
    expect(breadcrumbBefore).toBe('South Bangalore');

    await clickMarker(cluster);

    // Positive: the tap really did focus the cluster (the panel swapped to
    // its distinct cluster-focus surface, never `navigation-level-panel`).
    // The panel's OWN count copy legitimately differs from the map marker's:
    // the panel passes its real (uncapped) displayed count as the
    // representative-name limit (`DiscoverAreasJourneyPanel`'s "REQUIRED
    // CHANGE 2"), so with all 3 members shown it reads "3 areas with
    // matches" (hiddenCount=0), never the map's "+1" form — confirmed live,
    // a deliberate divergence, not a bug this spec should paper over.
    const focusPanel = page.getByTestId('areas-cluster-focus-panel');
    await expect(focusPanel).toBeVisible();
    await expect(focusPanel).toContainText('3 areas with matches');

    // Negative, only now that the focus effect is proven real: ALL THREE
    // presentation-only invariants hold — node=, breadcrumb and browser
    // history are completely untouched by a cluster tap (AC4.4). Asserted
    // explicitly (not merely "unchanged by omission") against captured
    // BEFORE values.
    expect(await currentNodeParam(page)).toBe(nodeBefore);
    expect(await historyLength(page)).toBe(historyBefore);
    expect(await breadcrumbText(page)).toBe(breadcrumbBefore);
  });
});

test.describe('@integration-ui #1956 PR-3 — Show all areas restores (AC4.5)', () => {
  test('clearing focus via "Show all areas" restores the full direct-child list and leaves node=/breadcrumb/history untouched', async ({
    page,
  }) => {
    await openRoot(page);
    await goToDirection(page, D_S);
    await clickMarker(clusterMarkerLocator(page));
    await expect(page.getByTestId('areas-cluster-focus-panel')).toBeVisible();

    const nodeBefore = await currentNodeParam(page);
    const historyBefore = await historyLength(page);
    const breadcrumbBefore = await breadcrumbText(page);

    await page.getByTestId('areas-cluster-focus-clear').click();

    // Positive: the normal (un-focused) surface is really back, with the
    // COMPLETE direct-child list — all four AREA children, including the
    // zero-listing Hosahalli leaf that the focused cluster view never shows.
    await expect(page.getByTestId('areas-cluster-focus-panel')).toHaveCount(0);
    const childList = page.getByTestId('navigation-child-list');
    await expect(childList).toBeVisible();
    await expect(page.getByTestId(cardTestId(AREA_RR_NAGAR))).toBeVisible();
    await expect(page.getByTestId(cardTestId(AREA_VIJAYANAGAR))).toBeVisible();
    await expect(page.getByTestId(cardTestId(AREA_NAGARBHAVI))).toBeVisible();
    await expect(page.getByTestId(cardTestId(AREA_HOSAHALLI))).toBeVisible();
    await expect(page.getByTestId(`navigation-child-card-listings-${AREA_HOSAHALLI}`)).toHaveText(
      'No listings yet',
    );

    // Negative: node=/breadcrumb/history are untouched by "Show all areas",
    // exactly as they were untouched by the focusing tap itself.
    expect(await currentNodeParam(page)).toBe(nodeBefore);
    expect(await historyLength(page)).toBe(historyBefore);
    expect(await breadcrumbText(page)).toBe(breadcrumbBefore);
  });
});

test.describe('@integration-ui #1956 PR-3 — map and panel agree while a cluster is focused (AC4.12)', () => {
  test('the focused panel subset is EXACTLY the map cluster\'s member set, and both totals agree', async ({
    page,
  }) => {
    await openRoot(page);
    await goToDirection(page, D_S);

    const cluster = clusterMarkerLocator(page);
    await expect(cluster).toContainText('6 listings');
    await clickMarker(cluster);

    const focusPanel = page.getByTestId('areas-cluster-focus-panel');
    await expect(focusPanel).toBeVisible();

    // Positive: exactly the 3 visible (nonzero) members the map clustered
    // are listed — never the zero-listing Hosahalli, never a partial subset.
    await expect(page.getByTestId(`areas-cluster-focus-member-${AREA_RR_NAGAR}`)).toBeVisible();
    await expect(page.getByTestId(`areas-cluster-focus-member-${AREA_VIJAYANAGAR}`)).toBeVisible();
    await expect(page.getByTestId(`areas-cluster-focus-member-${AREA_NAGARBHAVI}`)).toBeVisible();
    await expect(page.getByTestId(`areas-cluster-focus-member-${AREA_HOSAHALLI}`)).toHaveCount(0);

    const memberButtons = focusPanel.locator('[data-node-key]');
    await expect(memberButtons).toHaveCount(3);

    // The panel's own per-member counts sum to the SAME total (6) the map
    // cluster marker itself displays — never independently derived.
    const listingsTexts = await memberButtons.locator('span.block').allTextContents();
    const summed = listingsTexts
      .map((t) => Number.parseInt(t, 10))
      .reduce((a, b) => a + b, 0);
    expect(summed).toBe(6);
    // The panel's own count copy is "3 areas with matches" (its representative
    // limit is the real, uncapped displayed count — see the sibling AC4.4
    // test's comment); the MAP marker's "+1 areas with matches" (capped at 2
    // representative names) is the SAME underlying 3-member set and 6-listing
    // total, just presented with a different (also-locked) cap. Agreement is
    // asserted on the member set/total above, not on the two surfaces sharing
    // one literal string.
    await expect(focusPanel).toContainText('3 areas with matches');
  });
});

test.describe('@integration-ui #1956 PR-3 — focused-cluster state clears on node navigation (AC4.7-adjacent, E2E-ONLY coverage)', () => {
  test('focusing a cluster, navigating to a DIFFERENT node, then returning to the same Direction shows the FULL child list again, never the stale focused subset', async ({
    page,
  }) => {
    // There is no unit-test seam for this: `MapDiscovery.tsx` (which owns
    // `focusedClusterMemberAreaKeys` and the `useEffect` that resets it on
    // `areasNavigationJourney.node?.nodeKey` change) is outside this PR's
    // permitted file globs, so this real-browser navigation sequence is the
    // ONLY coverage this defect class has.
    await openRoot(page);
    await goToDirection(page, D_S);
    await clickMarker(clusterMarkerLocator(page));
    await expect(page.getByTestId('areas-cluster-focus-panel')).toBeVisible();

    // Navigate AWAY to a completely different node (West Bangalore) via a
    // real browser Back to root, then a real card click — never editing
    // `focusedClusterMemberAreaKeys` directly (this must be provably a
    // consequence of the app's own navigation, not a test shortcut).
    await page.goBack();
    await expect.poll(() => currentNodeParam(page)).toBeNull();
    await goToDirection(page, D_W);
    await expect(singleMarkerLocator(page, AREA_BASAVESHWARA)).toBeVisible();

    // Return to root, then back into South Bangalore — the SAME Direction
    // whose cluster was focused a moment ago.
    await page.goBack();
    await expect.poll(() => currentNodeParam(page)).toBeNull();
    await goToDirection(page, D_S);

    // Positive: the FULL, un-focused child list is what actually renders —
    // never the stale 3-member cluster-focus subset chosen for a PRIOR visit
    // to this same node. This is the literal AC4.7-adjacent failure mode:
    // "returning to an 'areas' node does not re-apply a member set chosen
    // for a different parent" (here, a member set chosen before an
    // intervening visit elsewhere).
    await expect(page.getByTestId('areas-cluster-focus-panel')).toHaveCount(0);
    await expect(page.getByTestId(cardTestId(AREA_RR_NAGAR))).toBeVisible();
    await expect(page.getByTestId(cardTestId(AREA_VIJAYANAGAR))).toBeVisible();
    await expect(page.getByTestId(cardTestId(AREA_NAGARBHAVI))).toBeVisible();
    await expect(page.getByTestId(cardTestId(AREA_HOSAHALLI))).toBeVisible();
    await expect(clusterMarkerLocator(page)).toHaveCount(1);
  });
});

test.describe('@integration-ui #1956 PR-3 — no stale AREA/cluster markers after a level change (F1 guard)', () => {
  test('selecting a cluster member (levelKind -> listings) removes the previous level\'s visual-cluster AND single-AREA markers from the map', async ({
    page,
  }) => {
    await openRoot(page);
    await goToDirection(page, D_S);
    await clickMarker(clusterMarkerLocator(page));

    const focusPanel = page.getByTestId('areas-cluster-focus-panel');
    await expect(focusPanel).toBeVisible();
    const rrNagarButton = page.getByTestId(`areas-cluster-focus-member-${AREA_RR_NAGAR}`);
    await expect(rrNagarButton).toBeVisible();

    // The real navigation under test: selecting one cluster member drills
    // into its LISTINGS level (a real node change, unlike the presentation-
    // only cluster tap above).
    await rrNagarButton.click();
    await expect.poll(() => currentNodeParam(page)).toBe(AREA_RR_NAGAR);

    // Negative, only after the new (listings) level is confirmed reached:
    // the previous 'areas' level's markers are GONE, not merely covered —
    // this is the exact F1 defect `AreaDestinationMarkerLayer`'s dedicated
    // stale-removal diff loop guards against (a level change out of
    // areas/clusters is most commonly reached by exactly this path).
    await expect(clusterMarkerLocator(page)).toHaveCount(0);
    await expect(page.locator('[data-testid="area-single-marker"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="area-destination-marker"]')).toHaveCount(0);
  });
});
