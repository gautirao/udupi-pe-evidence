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
 * The ORIGINAL PR-3 fixture (a `d:s`/"South Bangalore" Direction with RR
 * Nagar/Vijayanagar/Nagarbhavi/Hosahalli) was HAND-INSERTED directly into the
 * disposable local fixture Postgres during that session and NEVER COMMITTED
 * to the repo — exactly the anti-pattern ruled out on PR #2056 (comment
 * 5139969300). That data does not survive a fresh fixture restore, so this
 * spec's evidence was not reproducible. It has been repointed (#1956 PR-5) at
 * a COMMITTED, idempotent replacement:
 * `scripts/db/fixtures/navigation-hierarchy-fixture-seed.sql` +
 * `scripts/db/fixtures/navigation-hierarchy-fixture-listings-seed.sql`,
 * applied via `scripts/dev/seed-navigation-hierarchy-fixture.sh`. The
 * pre-existing `d:s` row from the vanished hand-insert is left exactly as
 * found (only ONE stale Hosahalli child, no listings) — additive-only, no
 * UPDATE of that row — so this spec now targets the NEW, committed
 * `d:southeast` Direction instead. `d:w`/Basaveshwara Nagar (PR-2's own
 * fixture) is untouched by this repointing and still exercised by the first
 * test below as-is.
 *
 *   root
 *     -> d:w "West Bangalore" (DIRECTION, PRE-EXISTING, untouched by #1956 PR-5)
 *          -> a:...Basaveshwara Nagar (AREA) — REAL geo_center, the
 *             DIRECTION's only child, so it always renders as a lone
 *             `area-single-marker`, never a cluster (AC4.6). NOTE: its
 *             listing count has drifted from this spec's original "2
 *             listings" expectation in the shared, long-lived fixture
 *             container (other sessions' fixture activity) — a PRE-EXISTING
 *             environmental issue, unrelated to and out of scope for #1956
 *             PR-5's navigation-node seed work. Left as-is; reported, not
 *             fixed, here.
 *     -> d:southeast "South-East Bangalore" (DIRECTION, COMMITTED #1956 PR-5 seed)
 *          -> a:...RR Nagar     (AREA, 1 listing)  \
 *          -> a:...Vijayanagar  (AREA, 1 listing)   |- synthetic navigation_nodes
 *          -> a:...Nagarbhavi   (AREA, 1 listing)  /   centre_lat/lon, deliberately
 *             ~10-15m apart (NOT each area's real geo_center — navigation_nodes
 *             carries its OWN centre columns, independent of
 *             `areas.geo_center_*`), so the client-side pixel-grid clusterer
 *             (`areaClustering.ts`) groups all three into exactly ONE visual
 *             cluster cell at any zoom/viewport this suite runs at.
 *     -> d:southwest "South-West Bangalore" (DIRECTION, COMMITTED #1956 PR-5 seed,
 *        added in a follow-up round specifically to restore invariant-6 coverage)
 *          -> a:...Deepanjali Nagar         (AREA, 1 listing)  \
 *          -> a:...Gnana Bharathi           (AREA, 1 listing)   |- same synthetic
 *          -> a:...Chandra Layout Extension (AREA, 1 listing)  /   ~10-15m-apart
 *             centre_lat/lon technique as d:southeast, so these three collapse
 *             into ONE visual cluster.
 *          -> a:...Avalahalli               (AREA, 0 listings — NO row in
 *             navigation-hierarchy-fixture-listings-seed.sql) — the
 *             `journeyVisibility` eligibility filter (runs BEFORE clustering)
 *             excludes it from the map/cluster entirely, but it still renders
 *             in the un-focused panel's normal child list as a "No listings
 *             yet" leaf AREA card. This is `d:southwest`'s reason for
 *             existing: it is a BRAND-NEW Direction (not a 4th child bolted
 *             onto `d:southeast`) specifically because `d:southeast`'s
 *             `descendant_area_count` was already committed at 3 by an
 *             earlier seed run — adding a 4th child there without an UPDATE
 *             to that existing row would create a DESCENDANT_COUNT_MISMATCH
 *             that fails validation for the WHOLE Bangalore tree on the next
 *             fresh load. A brand-new Direction's `descendant_area_count` is
 *             written correctly in its own first INSERT, so there is no
 *             pre-existing stored value to contradict, and the additive-only
 *             contract holds unconditionally. See
 *             `scripts/db/fixtures/navigation-hierarchy-fixture-seed.sql`
 *             section 3 for the full mechanism.
 *
 * Confirmed live via `GET /api/discover/cities/bangalore/navigation/d:southeast/counts`
 * after seeding: `{"nodeKey":"d:southeast","count":3,"matchingAreaCount":3}`
 * — the cluster's 3 visible members (1+1+1 listings = 3) sum to the SAME
 * total the map cluster marker and the focused panel both display (AC4.12).
 * This is a genuinely different real number from the original fixture's "6
 * listings" (3+2+1, which included a 0 from the now-absent Hosahalli) — the
 * literal count assertions below have been updated from `6` to `3` to match
 * the real committed data, NOT loosened or removed. The "+1 areas with
 * matches" / "3 areas with matches" copy assertions are numerically
 * UNCHANGED from the original spec: `MAX_REPRESENTATIVE_NAMES` (2) still caps
 * the map marker's representative names at 2 of 3 visible members (hiddenCount
 * 1 -> "+1"), and the panel's own uncapped view still shows all 3 members
 * ("3 areas with matches", hiddenCount 0) — the exact same divergence the
 * original spec documented, not a coincidence engineered by this repointing.
 *
 * The area_keys themselves (`IN|KA|Bengaluru|RR Nagar` etc.) are real
 * Bangalore geography rows already present from the V106 migration — only
 * their `navigation_nodes` position/parentage and their `property_listings`
 * rows are fixture-only, COMMITTED data (see the two seed SQL files above).
 *
 * Test allocation: AC4.4 (cluster tap is presentation-only) and the F1 guard
 * (stale-marker removal) run against `d:southeast` — they need only a dense
 * cluster, not a zero-listing sibling, so the smaller/first-seeded fixture is
 * enough. AC4.5 (Show all areas), AC4.12 (map/panel agreement) and the
 * AC4.7-adjacent (focus clears on navigation) tests run against
 * `d:southwest`, because their invariant-6 sub-assertions specifically need a
 * real zero-listing sibling (Avalahalli) alongside the cluster.
 */
import { test, expect, type Page } from '@playwright/test';

const CITY = 'bangalore';
const BASE = `city=${CITY}&journey=area-first&areasPreview=1`;

// Same fallback src/lib/api.ts's own API_BASE_URL uses, and the same env var
// name the isolated Vite process for this suite is started with
// (`VITE_API_BASE_URL=... npx vite --port <port> --strictPort`) — so this
// test asks the SAME backend the page under test is wired to, never a
// hardcoded guess.
const API_BASE_URL = process.env.VITE_API_BASE_URL ?? 'http://localhost:8085';

const D_W = 'd:w';
const D_SE = 'd:southeast';
const D_SW = 'd:southwest';
const AREA_BASAVESHWARA = 'a:IN|KA|Bengaluru|Basaveshwara Nagar';
const AREA_RR_NAGAR = 'a:IN|KA|Bengaluru|RR Nagar';
const AREA_VIJAYANAGAR = 'a:IN|KA|Bengaluru|Vijayanagar';
const AREA_NAGARBHAVI = 'a:IN|KA|Bengaluru|Nagarbhavi';
const AREA_DEEPANJALI_NAGAR = 'a:IN|KA|Bengaluru|Deepanjali Nagar';
const AREA_GNANA_BHARATHI = 'a:IN|KA|Bengaluru|Gnana Bharathi';
const AREA_CHANDRA_LAYOUT = 'a:IN|KA|Bengaluru|Chandra Layout Extension';
const AREA_AVALAHALLI = 'a:IN|KA|Bengaluru|Avalahalli';

interface NavigationCountsChild {
  nodeKey: string;
  count: number;
}

interface NavigationCountsResponse {
  nodeKey: string;
  count: number;
  children: NavigationCountsChild[];
}

/**
 * Ground-truth read of `GET /navigation/{nodeKey}/counts` (the SAME endpoint
 * the app's own `useDiscoverNavigationCounts` hook calls) — used so an
 * assertion tests "the UI shows what the backend reports" instead of a
 * hardcoded literal that ages badly in a shared, long-lived fixture
 * container (exactly the failure mode that made the original "2 listings"
 * assertion on Basaveshwara Nagar go stale).
 */
async function fetchNodeCounts(page: Page, nodeKey: string): Promise<NavigationCountsResponse> {
  const response = await page.request.get(
    `${API_BASE_URL}/api/discover/cities/${CITY}/navigation/${encodeURIComponent(nodeKey)}/counts`,
  );
  expect(response.ok()).toBe(true);
  return response.json();
}

/** Byte-identical to `formatListingCount` in useAreasNavigationJourney.ts / AreaMarkerLayer.tsx. */
function formatListingCount(count: number): string {
  return count > 0 ? `${count} listing${count === 1 ? '' : 's'}` : 'No listings yet';
}

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
    // GROUND-TRUTH count, not a hardcoded literal: this node/area is
    // PRE-EXISTING PR-2 fixture data, untouched by the #1956 PR-5 seed, and
    // its live count has drifted from the original spec's hardcoded "2
    // listings" in this shared, long-lived fixture container (other
    // sessions' fixture activity) — exactly the failure mode a snapshot
    // literal is prone to. Asserting against the SAME counts endpoint the
    // app itself reads tests the real invariant (UI shows what the backend
    // reports) instead of a fixture snapshot that ages badly, and never
    // touches d:w's data to "fix" the drift.
    const dwCounts = await fetchNodeCounts(page, D_W);
    const basaveshwaraCount = dwCounts.children.find((c) => c.nodeKey === AREA_BASAVESHWARA)?.count ?? 0;
    await expect(marker).toContainText(formatListingCount(basaveshwaraCount));

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
  test('tapping the South-East Bangalore visual cluster focuses map/panel WITHOUT changing node=, the breadcrumb, or browser history', async ({
    page,
  }) => {
    await openRoot(page);
    await goToDirection(page, D_SE);

    // Positive: the real dense-cluster surface rendered — exactly ONE
    // visual cluster marker (RR Nagar/Vijayanagar/Nagarbhavi collapse into
    // one cell), never one marker per member.
    const cluster = clusterMarkerLocator(page);
    await expect(cluster).toHaveCount(1);
    await expect(cluster).toContainText('+1 areas with matches');
    // 1+1+1 = 3 (COMMITTED seed data — see the file header for why this is
    // "3", not the original hand-inserted fixture's "6").
    await expect(cluster).toContainText('3 listings');
    await expect(page.getByTestId('areas-cluster-focus-panel')).toHaveCount(0);

    const nodeBefore = await currentNodeParam(page);
    const historyBefore = await historyLength(page);
    const breadcrumbBefore = await breadcrumbText(page);
    expect(nodeBefore).toBe(D_SE);
    expect(breadcrumbBefore).toBe('South-East Bangalore');

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
    await goToDirection(page, D_SW);
    await clickMarker(clusterMarkerLocator(page));
    await expect(page.getByTestId('areas-cluster-focus-panel')).toBeVisible();

    const nodeBefore = await currentNodeParam(page);
    const historyBefore = await historyLength(page);
    const breadcrumbBefore = await breadcrumbText(page);

    await page.getByTestId('areas-cluster-focus-clear').click();

    // Positive: the normal (un-focused) surface is really back, with the
    // COMPLETE direct-child list — all FOUR AREA children, including the
    // zero-listing Avalahalli leaf that the focused cluster view never shows
    // (invariant 6 / journeyVisibility eligibility-exclusion — restored here
    // against d:southwest, a brand-new Direction seeded specifically for this
    // sub-case; see the file header for why it could not be added as a 4th
    // child of d:southeast).
    await expect(page.getByTestId('areas-cluster-focus-panel')).toHaveCount(0);
    const childList = page.getByTestId('navigation-child-list');
    await expect(childList).toBeVisible();
    await expect(page.getByTestId(cardTestId(AREA_DEEPANJALI_NAGAR))).toBeVisible();
    await expect(page.getByTestId(cardTestId(AREA_GNANA_BHARATHI))).toBeVisible();
    await expect(page.getByTestId(cardTestId(AREA_CHANDRA_LAYOUT))).toBeVisible();
    await expect(page.getByTestId(cardTestId(AREA_AVALAHALLI))).toBeVisible();
    await expect(page.getByTestId(`navigation-child-card-listings-${AREA_AVALAHALLI}`)).toHaveText(
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
    await goToDirection(page, D_SW);

    const cluster = clusterMarkerLocator(page);
    // 1+1+1 = 3 (COMMITTED seed data — see the file header).
    await expect(cluster).toContainText('3 listings');
    await clickMarker(cluster);

    const focusPanel = page.getByTestId('areas-cluster-focus-panel');
    await expect(focusPanel).toBeVisible();

    // Positive: exactly the 3 visible (nonzero) members the map clustered
    // are listed — never the zero-listing Avalahalli, never a partial subset.
    await expect(page.getByTestId(`areas-cluster-focus-member-${AREA_DEEPANJALI_NAGAR}`)).toBeVisible();
    await expect(page.getByTestId(`areas-cluster-focus-member-${AREA_GNANA_BHARATHI}`)).toBeVisible();
    await expect(page.getByTestId(`areas-cluster-focus-member-${AREA_CHANDRA_LAYOUT}`)).toBeVisible();
    // Negative, restored (invariant 6 / journeyVisibility eligibility-
    // exclusion): the zero-listing sibling is never a member of the focused
    // cluster, meaningfully so here because d:southwest genuinely HAS this
    // 4th sibling (unlike d:southeast, which never had one to exclude).
    await expect(page.getByTestId(`areas-cluster-focus-member-${AREA_AVALAHALLI}`)).toHaveCount(0);

    const memberButtons = focusPanel.locator('[data-node-key]');
    await expect(memberButtons).toHaveCount(3);

    // The panel's own per-member counts sum to the SAME total (3) the map
    // cluster marker itself displays — never independently derived.
    const listingsTexts = await memberButtons.locator('span.block').allTextContents();
    const summed = listingsTexts
      .map((t) => Number.parseInt(t, 10))
      .reduce((a, b) => a + b, 0);
    expect(summed).toBe(3);
    // The panel's own count copy is "3 areas with matches" (its representative
    // limit is the real, uncapped displayed count — see the sibling AC4.4
    // test's comment); the MAP marker's "+1 areas with matches" (capped at 2
    // representative names) is the SAME underlying 3-member set and 3-listing
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
    await goToDirection(page, D_SW);
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

    // Return to root, then back into South-West Bangalore — the SAME
    // Direction whose cluster was focused a moment ago.
    await page.goBack();
    await expect.poll(() => currentNodeParam(page)).toBeNull();
    await goToDirection(page, D_SW);

    // Positive: the FULL, un-focused child list is what actually renders —
    // never the stale 3-member cluster-focus subset chosen for a PRIOR visit
    // to this same node. This is the literal AC4.7-adjacent failure mode:
    // "returning to an 'areas' node does not re-apply a member set chosen
    // for a different parent" (here, a member set chosen before an
    // intervening visit elsewhere). Restored (invariant 6): the zero-listing
    // Avalahalli leaf is visible again too, exactly as it was before the
    // cluster was ever focused.
    await expect(page.getByTestId('areas-cluster-focus-panel')).toHaveCount(0);
    await expect(page.getByTestId(cardTestId(AREA_DEEPANJALI_NAGAR))).toBeVisible();
    await expect(page.getByTestId(cardTestId(AREA_GNANA_BHARATHI))).toBeVisible();
    await expect(page.getByTestId(cardTestId(AREA_CHANDRA_LAYOUT))).toBeVisible();
    await expect(page.getByTestId(cardTestId(AREA_AVALAHALLI))).toBeVisible();
    await expect(clusterMarkerLocator(page)).toHaveCount(1);
  });
});

test.describe('@integration-ui #1956 PR-3 — no stale AREA/cluster markers after a level change (F1 guard)', () => {
  test('selecting a cluster member (levelKind -> listings) removes the previous level\'s visual-cluster AND single-AREA markers from the map', async ({
    page,
  }) => {
    await openRoot(page);
    await goToDirection(page, D_SE);
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
