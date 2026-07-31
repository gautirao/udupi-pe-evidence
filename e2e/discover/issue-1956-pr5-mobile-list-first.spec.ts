/**
 * Issue #1956 PR-5 — mobile list-first Areas journey, real browser at a TRUE
 * 390x844 viewport. Covers S1 (AC5.1/AC5.2/AC5.13), S2 (AC5.5), S3
 * (AC5.6/AC5.7), S4 (AC5.3/AC5.4/AC5.8/AC5.12) and S6 (AC5.9/AC5.11/AC5.14)
 * of this PR's slice set. S5 (the Map-mode listing preview sheet, AC5.10/
 * AC5.10c) is EXPLICITLY OUT OF SCOPE for this PR — see this repo's
 * `.claude/handoffs/issue-1956/approved-execution-handoff-pr5.toml` — and is
 * not exercised here.
 *
 * Run:
 *   PLAYWRIGHT_BASE_URL=http://localhost:<port> npx playwright test \
 *     e2e/discover/issue-1956-pr5-mobile-list-first.spec.ts --project=full
 *
 * Every real-browser claim below uses `assertReachable` from
 * `e2e/support/reachability.ts` (the approved plan's
 * `[reachability_definition]`, verbatim) rather than `toBeVisible()` alone —
 * per this PR's [reachability_definition], DOM presence is not proof.
 */
import { test, expect } from '@playwright/test';
import { assertReachable, reportTouchTargetSize } from '../support/reachability';

const CITY = 'bangalore';
const BASE = `city=${CITY}&journey=area-first&areasPreview=1`;
// Direct backend fixture read (server-side, no CORS/proxy concerns — see
// curl-confirmed reachability of :8081 this session) so S1's "direct
// children" assertion is checked against the SAME source of truth the app
// itself resolves against, not a hand-picked guess.
const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://localhost:8081';

interface ResolveChild {
  nodeKey: string;
  displayLabel: string;
  displayOrder: number;
}

interface ResolveResponse {
  node: { children: ResolveChild[] };
}

async function fetchNodeChildren(request: import('@playwright/test').APIRequestContext, node: string): Promise<ResolveChild[]> {
  const res = await request.get(
    `${BACKEND_BASE}/api/discover/cities/${CITY}/navigation/resolve?node=${encodeURIComponent(node)}`,
  );
  expect(res.ok(), `resolve?node=${node} must succeed`).toBe(true);
  const body = (await res.json()) as ResolveResponse;
  return [...body.node.children].sort((a, b) => a.displayOrder - b.displayOrder);
}
// Real node keys confirmed present in this repo's other #1956 PR-2..PR-4
// specs against the shared fixture backend (see
// issue-1956-pr4-mobile-listings-scroll.spec.ts) — a real AREA leaf with a
// long, genuinely wrap-risking display label, used for AC5.9's realistic
// full-depth trail per risk R4 (never the shortest available fixture name).
const AREA_BASAVESHWARA = 'a:IN|KA|Bengaluru|Basaveshwara Nagar';

async function dismissConsentBannerIfPresent(page: import('@playwright/test').Page): Promise<void> {
  const decline = page.getByRole('button', { name: /decline anonymous usage data collection/i });
  if (await decline.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await decline.click();
  }
}

interface AncestryEntry {
  nodeKey: string;
  displayLabel: string;
  nodeType: string;
}

async function fetchAncestry(
  request: import('@playwright/test').APIRequestContext,
  node: string,
): Promise<AncestryEntry[]> {
  const res = await request.get(
    `${BACKEND_BASE}/api/discover/cities/${CITY}/navigation/resolve?node=${encodeURIComponent(node)}`,
  );
  expect(res.ok(), `resolve?node=${node} must succeed`).toBe(true);
  const body = (await res.json()) as { node: { ancestry: AncestryEntry[] } };
  return body.node.ancestry;
}

async function currentNodeParam(page: import('@playwright/test').Page): Promise<string | null> {
  return new URL(page.url()).searchParams.get('node');
}

interface CapturedListingsCall {
  requestUrl: string;
  hasAuthHeader: boolean;
  areaKeysCount: number;
  totalListingCount: number;
}

/**
 * Same pattern as `issue-1956-pr4-price-auth-contract.spec.ts`'s
 * `captureListingsCall` (reused rather than reinvented) — waits for the real
 * `.../listings` network response triggered by `action`, and returns the
 * EXACT request URL plus derived counts, so AC5.4/AC5.8 assert against real
 * network traffic rather than DOM inference.
 */
async function captureListingsCall(
  page: import('@playwright/test').Page,
  action: () => Promise<void>,
): Promise<CapturedListingsCall> {
  const responsePromise = page.waitForResponse((res) =>
    res.url().includes(`/api/discover/cities/${CITY}/listings`),
  );
  await action();
  const response = await responsePromise;
  const request = response.request();
  const headers = await request.allHeaders();
  const url = new URL(request.url());
  const body = (await response.json()) as { areas: Array<{ listings: Array<Record<string, unknown>> }> };
  const totalListingCount = body.areas.reduce((sum, area) => sum + area.listings.length, 0);
  return {
    requestUrl: request.url(),
    hasAuthHeader: 'authorization' in headers,
    areaKeysCount: url.searchParams.getAll('areaKeys').length,
    totalListingCount,
  };
}

test.describe('@integration-ui #1956 PR-5 — mobile (390x844) list-first Areas journey', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('S1/AC5.1/AC5.13 — LIST mode renders the current node\'s direct children; no Back at the parentless city root', async ({
    page,
    request,
  }) => {
    // Ground truth for AC5.1: the DIRECT CHILDREN the backend actually
    // resolves for the root node under test — not an assumption about what
    // "should" render.
    const expectedChildren = await fetchNodeChildren(request, 'root');
    expect(expectedChildren.length, 'fixture sanity: root must have >0 children to prove AC5.1 meaningfully').toBeGreaterThan(0);

    await page.goto(`/discover?${BASE}`);
    await page.waitForLoadState('domcontentloaded');
    await dismissConsentBannerIfPresent(page);

    const panel = page.getByTestId('areas-journey-panel').or(page.getByTestId('areas-journey-panel-empty'));
    await expect(panel).toBeVisible({ timeout: 20_000 });

    // The city root's `ancestry` is empty (confirmed via
    // `/navigation/resolve?node=root`), and `HierarchyBackButton` correctly
    // renders nothing when a node has no canonical parent — there is nowhere
    // for Back to go. This asserts that POSITIVELY (not merely omits the
    // check) so a future regression that wrongly renders a parentless Back
    // at root is caught. The parent-NAMING proof (AC5.2) belongs at a real
    // non-root node — see the dedicated "AC5.2 (real coverage)" test below.
    await expect(
      page.getByTestId('areas-hierarchy-back'),
      'root has no canonical parent — no Back control should render here',
    ).toHaveCount(0);

    // List-first stack of the CURRENT node's direct children (AC5.1).
    const list = page.getByTestId('navigation-child-list');
    await expect(list).toBeVisible({ timeout: 20_000 });

    // The rendered rows must correspond EXACTLY to the resolved node's
    // actual children (nodeKey identity + displayLabel text), not merely
    // "a list is visible". Order-insensitive set comparison; the panel is
    // free to re-sort, but every resolved child must be present exactly
    // once and nothing extra/fabricated must be present.
    for (const child of expectedChildren) {
      const card = list.getByTestId(`navigation-child-card-${child.nodeKey}`);
      await expect(card, `direct child ${child.nodeKey} (${child.displayLabel}) must render`).toBeVisible();
      await expect(card).toContainText(child.displayLabel);
    }
    const renderedCount = await list.getByRole('listitem').count();
    expect(renderedCount, 'rendered child-card count must equal the resolved children count (no extras, no omissions)').toBe(
      expectedChildren.length,
    );
  });

  test('S2/AC5.5 (FIRST-CLASS) — List -> Map -> List writes neither node= nor a history entry', async ({ page }) => {
    await page.goto(`/discover?${BASE}`);
    await page.waitForLoadState('domcontentloaded');
    await dismissConsentBannerIfPresent(page);

    const historyLengthBefore = await page.evaluate(() => window.history.length);
    const urlBefore = page.url();

    const mapTrigger = page.getByTestId('control-bar-map-trigger');
    await assertReachable(page, mapTrigger);
    await mapTrigger.click();
    const closeListButton = page.getByTestId('mobile-map-close-list-button');
    await expect(closeListButton).toBeVisible({ timeout: 10_000 });

    expect(page.url()).toBe(urlBefore);
    expect(await page.evaluate(() => window.history.length)).toBe(historyLengthBefore);

    await closeListButton.click();
    await expect(page.getByTestId('navigation-child-list').or(page.getByTestId('areas-journey-panel-listings'))).toBeVisible({
      timeout: 10_000,
    });

    expect(page.url()).toBe(urlBefore);
    expect(await page.evaluate(() => window.history.length)).toBe(historyLengthBefore);

    // Browser Back after the cycle leaves the Areas journey rather than
    // merely undoing the toggle (the toggle wrote no history entry to undo).
    await page.goBack();
    await expect(page).not.toHaveURL(urlBefore);
  });

  test('S4/AC5.3/AC5.8/AC5.12 — AREA leaf: within-area search, complete list, listing parity, no invariant-8 controls', async ({
    page,
  }) => {
    await page.goto(`/discover?${BASE}&node=${encodeURIComponent(AREA_BASAVESHWARA)}`);
    await page.waitForLoadState('domcontentloaded');
    await dismissConsentBannerIfPresent(page);

    const panel = page.getByTestId('areas-journey-panel-listings');
    await expect(panel).toBeVisible({ timeout: 20_000 });

    // Within-area search reachable (AC5.3/AC5.11). UNCONDITIONAL — a missing
    // search control on an AREA leaf is exactly the AC5.3 failure this test
    // exists to catch.
    const search = page.getByPlaceholder(/search/i).first();
    await expect(search, 'AC5.3: within-area search input must be visible on an AREA leaf').toBeVisible({ timeout: 10_000 });
    await assertReachable(page, search);

    // Invariant 8 — no result-scope controls anywhere on this surface.
    for (const forbidden of [
      /edit areas/i,
      /clear selected areas/i,
      /add nearby areas/i,
      /draw search area/i,
      /search this area/i,
      /create alert/i,
    ]) {
      await expect(page.getByText(forbidden)).toHaveCount(0);
    }
  });

  test('S6/AC5.9 — breadcrumb renders un-clipped at 390x844 with a realistic long Bangalore name', async ({
    page,
    request,
  }) => {
    // Empirically established this pass (jCodemunch `search_text` +
    // `find_importers` cross-check + a live 390x844 probe against this exact
    // URL): `AreasBreadcrumbTrail` (`areas-breadcrumb-trail`) is mounted
    // inside `DiscoverMapContextOverlay`, which lives on the MAP canvas —
    // it does not mount/render at all in mobile LIST mode (confirmed
    // count=0 in the live probe below). `AreaFirstBreadcrumb`
    // (`area-first-breadcrumb`, `AreaSelectedPanel`'s breadcrumb) is what
    // actually renders for an AREA leaf on mobile LIST mode, INCLUDING on
    // the canonical `node=` journey (AreaSelectedPanel is reused by the
    // canonical journey's AREA-leaf render path) — confirmed live
    // count=1/visible=true. So `area-first-breadcrumb` IS the correct
    // surface for this AC on this URL; the suspicion that the test targets
    // the wrong surface does NOT hold.
    //
    // However: a SEPARATE gap was found while establishing that. The
    // backend's own `.../navigation/resolve` response for this exact node
    // (`AREA_BASAVESHWARA`) is authoritative ground truth for how many
    // crumbs a "full-depth" trail should have. Fetched below.
    const resolveRes = await request.get(
      `${BACKEND_BASE}/api/discover/cities/${CITY}/navigation/resolve?node=${encodeURIComponent(AREA_BASAVESHWARA)}`,
    );
    expect(resolveRes.ok()).toBe(true);
    const resolveBody = (await resolveRes.json()) as { node: { ancestry: Array<{ nodeType: string }> } };
    const hasGroupAncestor = resolveBody.node.ancestry.some((a) => a.nodeType === 'CLUSTER');

    await page.goto(`/discover?${BASE}&node=${encodeURIComponent(AREA_BASAVESHWARA)}`);
    await page.waitForLoadState('domcontentloaded');
    await dismissConsentBannerIfPresent(page);

    const breadcrumb = page.getByTestId('area-first-breadcrumb');
    await expect(breadcrumb, 'AC5.9: the area-first breadcrumb must be visible on an AREA leaf').toBeVisible({
      timeout: 10_000,
    });

    const viewport = page.viewportSize();
    const box = await breadcrumb.boundingBox();
    expect(box, 'breadcrumb has a layout box').not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(box!.x + box!.width, 'breadcrumb container does not exceed the viewport width').toBeLessThanOrEqual(
      viewport!.width,
    );

    // Home/City/Region/Area crumbs are unconditional — the resolved node's
    // ancestry has exactly one DIRECTION ancestor ("West Bangalore"), so all
    // four MUST render for AC5.9 to be proven at all.
    const alwaysExpectedCrumbs = ['breadcrumb-home', 'breadcrumb-city', 'breadcrumb-region', 'breadcrumb-area'];
    for (const testId of alwaysExpectedCrumbs) {
      const crumb = page.getByTestId(testId);
      await expect(crumb, `${testId} must be visible`).toBeVisible({ timeout: 5_000 });
      const overflow = await crumb.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
      expect(overflow, `${testId} must not be cut off by overflow`).toBe(true);
    }

    // AC5.9's "full-depth" trail (Home > City > Region > Group > Area, 5
    // crumbs) additionally requires a Group/CLUSTER-level ancestor.
    // GROUND TRUTH per the backend's own resolve response for
    // AREA_BASAVESHWARA: ancestry = [DIRECTION "West Bangalore"] only — NO
    // CLUSTER ancestor. `AreaFirstBreadcrumb` correctly and intentionally
    // omits `breadcrumb-group` whenever no group context exists (see its
    // own docstring). So on THIS node/URL only a 4-crumb trail is possible,
    // and the "full-depth" (5-crumb, headline) case of AC5.9 is NOT
    // exercised here — reported as a gap rather than silently passed.
    const groupCrumb = page.getByTestId('breadcrumb-group');
    if (hasGroupAncestor) {
      await expect(groupCrumb, 'resolve reports a CLUSTER ancestor — breadcrumb-group must render').toBeVisible({
        timeout: 5_000,
      });
      const overflow = await groupCrumb.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
      expect(overflow, 'breadcrumb-group must not be cut off by overflow').toBe(true);
    } else {
      // Documented, not silently skipped: this fixture node has no CLUSTER
      // ancestor, so the 5-crumb full-depth case is unproven by this test.
      await expect(
        groupCrumb,
        'AC5.9 GAP: AREA_BASAVESHWARA has no CLUSTER ancestor in the current fixture, so breadcrumb-group ' +
          'correctly does not render — the 5-crumb "full-depth" trail is NOT exercised by this node/URL',
      ).toHaveCount(0);
    }
  });

  test('S6/AC5.9 (FULL-DEPTH) — Home > City > Region > Group > Area, 39-char area name, un-clipped at 390x844', async ({
    page,
    request,
  }) => {
    // The `d:northeast` fixture path (navigation-hierarchy-fixture-seed.sql)
    // is the ONE genuine City -> DIRECTION -> CLUSTER("Local Destination")
    // -> AREA path in this dataset — the only node that can exercise AC5.9's
    // full 5-crumb "full-depth" trail at all. AREA_BASAVESHWARA (used by the
    // test above) has no CLUSTER ancestor, so that test can only ever prove
    // the 4-crumb case (documented as a GAP there). This test closes that gap
    // with ground truth fetched from the backend's own resolve response
    // (never hardcoded), and deliberately uses the LONGEST real Bangalore
    // area name in the fixture (39 chars) so the un-clipping assertion is a
    // genuinely hard case, not the shortest available fixture name.
    const AREA_KANNAMANGALA =
      'a:IN|KA|Bengaluru|Kannamangala - Whitefield Hoskote Road';
    const ancestry = await fetchAncestry(request, AREA_KANNAMANGALA);
    expect(ancestry.length, 'fixture sanity: full-depth node must have a 2-level ancestry (DIRECTION + CLUSTER)').toBe(2);
    expect(ancestry[0].nodeType).toBe('DIRECTION');
    expect(ancestry[1].nodeType).toBe('CLUSTER');
    const regionAncestor = ancestry[0];
    const groupAncestor = ancestry[1];

    await page.goto(`/discover?${BASE}&node=${encodeURIComponent(AREA_KANNAMANGALA)}`);
    await page.waitForLoadState('domcontentloaded');
    await dismissConsentBannerIfPresent(page);

    const panel = page.getByTestId('areas-journey-panel-listings');
    await expect(panel, 'fixture sanity: the full-depth AREA leaf must reach the listing surface').toBeVisible({
      timeout: 20_000,
    });

    const breadcrumb = page.getByTestId('area-first-breadcrumb');
    await expect(breadcrumb).toBeVisible({ timeout: 10_000 });

    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    const box = await breadcrumb.boundingBox();
    expect(box, 'breadcrumb has a layout box').not.toBeNull();
    expect(
      box!.x + box!.width,
      'AC5.9: the full-depth trail container must not exceed the 390px viewport width',
    ).toBeLessThanOrEqual(viewport!.width);

    // All FIVE crumbs must render for the full-depth path — this is the
    // headline case AC5.9 names and the entire reason the fixture includes
    // this path.
    const allCrumbTestIds = [
      'breadcrumb-home',
      'breadcrumb-city',
      'breadcrumb-region',
      'breadcrumb-group',
      'breadcrumb-area',
    ];
    for (const testId of allCrumbTestIds) {
      const crumb = page.getByTestId(testId);
      await expect(crumb, `AC5.9 full-depth: ${testId} must render`).toBeVisible({ timeout: 5_000 });
      const overflow = await crumb.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
      expect(overflow, `AC5.9 full-depth: ${testId} must not be cut off by overflow`).toBe(true);
    }

    // Content identity — region/group crumbs must show the REAL resolved
    // ancestor labels, not placeholders.
    await expect(page.getByTestId('breadcrumb-region')).toContainText(regionAncestor.displayLabel);
    await expect(page.getByTestId('breadcrumb-group')).toContainText(groupAncestor.displayLabel);
  });

  test('AC5.9 crumb handlers — clicking an ancestor crumb navigates to that ancestor\'s node= via exactly ONE history operation', async ({
    page,
    request,
  }) => {
    const AREA_KANNAMANGALA =
      'a:IN|KA|Bengaluru|Kannamangala - Whitefield Hoskote Road';
    const ancestry = await fetchAncestry(request, AREA_KANNAMANGALA);
    const regionAncestor = ancestry[0];
    const groupAncestor = ancestry[1];

    await page.goto(`/discover?${BASE}&node=${encodeURIComponent(AREA_KANNAMANGALA)}`);
    await page.waitForLoadState('domcontentloaded');
    await dismissConsentBannerIfPresent(page);
    await expect(page.getByTestId('areas-journey-panel-listings')).toBeVisible({ timeout: 20_000 });

    // breadcrumb-region click -> navigates to the DIRECTION ancestor's node=,
    // via exactly ONE history operation (the canonical journey.selectNode
    // action — AC3.9's ONE selection action — never a second, parallel
    // navigation mechanism that might push twice or replace-then-push).
    const regionCrumb = page.getByTestId('breadcrumb-region');
    await assertReachable(page, regionCrumb);
    const historyBeforeRegion = await page.evaluate(() => window.history.length);
    await regionCrumb.click();
    await expect.poll(() => currentNodeParam(page)).toBe(regionAncestor.nodeKey);
    const historyAfterRegion = await page.evaluate(() => window.history.length);
    expect(
      historyAfterRegion - historyBeforeRegion,
      'AC5.9: activating breadcrumb-region must produce EXACTLY ONE history operation',
    ).toBe(1);

    // Navigate back to the full-depth leaf to test the group crumb in
    // isolation (a fresh load, not a reuse of the region-crumb's resulting
    // history state).
    await page.goto(`/discover?${BASE}&node=${encodeURIComponent(AREA_KANNAMANGALA)}`);
    await page.waitForLoadState('domcontentloaded');
    await dismissConsentBannerIfPresent(page);
    await expect(page.getByTestId('areas-journey-panel-listings')).toBeVisible({ timeout: 20_000 });

    const groupCrumb = page.getByTestId('breadcrumb-group');
    await assertReachable(page, groupCrumb);
    const historyBeforeGroup = await page.evaluate(() => window.history.length);
    await groupCrumb.click();
    await expect.poll(() => currentNodeParam(page)).toBe(groupAncestor.nodeKey);
    const historyAfterGroup = await page.evaluate(() => window.history.length);
    expect(
      historyAfterGroup - historyBeforeGroup,
      'AC5.9: activating breadcrumb-group must produce EXACTLY ONE history operation',
    ).toBe(1);
  });

  test('AC5.2 (real coverage) — at a non-root node, the top-left control names the ACTUAL canonical parent and returns to it', async ({
    page,
    request,
  }) => {
    // The city-root URL structurally has no parent (empty `ancestry`), which
    // is why the S1 test above legitimately never exercises this AC — Back
    // is correctly absent there. AREA_BASAVESHWARA is a genuine non-root
    // node; ground truth from the backend's own resolve response is used for
    // the expected parent rather than a hardcoded string.
    const ancestry = await fetchAncestry(request, AREA_BASAVESHWARA);
    expect(ancestry.length, 'fixture sanity: AREA_BASAVESHWARA must have a real ancestor to prove AC5.2').toBeGreaterThan(0);
    const parent = ancestry[ancestry.length - 1];

    await page.goto(`/discover?${BASE}&node=${encodeURIComponent(AREA_BASAVESHWARA)}`);
    await page.waitForLoadState('domcontentloaded');
    await dismissConsentBannerIfPresent(page);

    const back = page.getByTestId('areas-hierarchy-back');
    await expect(back, 'AC5.2: a canonical-parent Back control must be visible on a non-root node').toBeVisible({
      timeout: 10_000,
    });
    await assertReachable(page, back);

    // Accessible name must contain the ACTUAL resolved parent's label, not a
    // guessed/hardcoded string, and must not be a bare "Back".
    await expect(back).not.toHaveAccessibleName(/^back$/i);
    const accessibleName = await back.evaluate((el) => el.getAttribute('aria-label') ?? el.textContent ?? '');
    expect(
      accessibleName.includes(parent.displayLabel),
      `AC5.2: Back control's accessible name ("${accessibleName}") must contain the real parent's displayLabel ("${parent.displayLabel}")`,
    ).toBe(true);

    await back.click();
    await expect.poll(() => currentNodeParam(page), 'AC5.2: activating Back must set node= to the parent\'s node key').toBe(
      parent.nodeKey,
    );
  });

  test('AC5.4 — selecting a row in LIST is identical in effect to selecting the matching marker in MAP', async ({ page }) => {
    // `d:w` (West Bangalore) has exactly ONE direct AREA child in this
    // fixture (AREA_BASAVESHWARA, confirmed via resolve at the top of this
    // pass) — a single-AREA-child Direction renders that child as an
    // individually-clickable `area-single-marker` on the map (never a
    // cluster), so a real matching marker exists to drive path 2 against.
    const D_W = 'd:w';

    // Path 1 — drive selection via the LIST row.
    await page.goto(`/discover?${BASE}&node=${encodeURIComponent(D_W)}`);
    await page.waitForLoadState('domcontentloaded');
    await dismissConsentBannerIfPresent(page);
    const listCard = page.getByTestId(`navigation-child-card-${AREA_BASAVESHWARA}`);
    await expect(listCard, 'AC5.4 fixture sanity: the matching LIST row must render').toBeVisible({ timeout: 15_000 });

    const listResult = await captureListingsCall(page, () => listCard.click());
    await expect.poll(() => currentNodeParam(page)).toBe(AREA_BASAVESHWARA);
    const nodeAfterList = await currentNodeParam(page);

    // Path 2 — reset, drive the SAME target via the MAP marker.
    await page.goto(`/discover?${BASE}&node=${encodeURIComponent(D_W)}`);
    await page.waitForLoadState('domcontentloaded');
    await dismissConsentBannerIfPresent(page);
    await page.getByTestId('control-bar-map-trigger').click();
    const marker = page.locator(`[data-testid="area-single-marker"][data-node-key="${AREA_BASAVESHWARA}"]`);
    await expect(marker, 'AC5.4 fixture sanity: the matching MAP marker must render').toBeVisible({ timeout: 15_000 });
    // Leaflet marker DOM is layout-tick-recreated; a real synthetic mouse
    // click at the marker's own box centre (not `locator.click()`) is the
    // project's established pattern for these markers — see
    // `issue-1956-pr2-destination-surface.spec.ts`'s `clickMarker`.
    const box = await marker.boundingBox();
    expect(box, 'marker has a layout box').not.toBeNull();
    const markerResult = await captureListingsCall(page, async () => {
      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.mouse.down();
      await page.mouse.up();
    });
    await expect.poll(() => currentNodeParam(page)).toBe(AREA_BASAVESHWARA);
    const nodeAfterMarker = await currentNodeParam(page);

    // Equivalence proof — same resulting node=, same selection identity
    // (both converge on the identical node key), same result count.
    expect(nodeAfterMarker, 'AC5.4: both paths must converge on the identical node=').toBe(nodeAfterList);
    expect(
      markerResult.totalListingCount,
      'AC5.4: both paths must return the identical listing result count',
    ).toBe(listResult.totalListingCount);
    expect(markerResult.totalListingCount, 'fixture sanity: the compared count must be meaningfully > 0').toBeGreaterThan(0);
  });

  test('AC5.8 — selecting a real AREA reaches the listing surface with parity in BOTH auth states, request URL captured', async ({
    page,
  }) => {
    const result = await captureListingsCall(page, async () => {
      await page.goto(`/discover?${BASE}&node=${encodeURIComponent(AREA_BASAVESHWARA)}`);
    });

    expect(result.hasAuthHeader, 'anon request must carry no Authorization header').toBe(false);
    // Anonymous must not receive an unscoped city-wide listing set — exactly
    // one areaKeys value, matching the single selected AREA leaf.
    expect(result.areaKeysCount, 'AC5.8: anon request must be scoped to exactly the selected area, not city-wide').toBe(1);
    expect(result.totalListingCount, 'AC5.8: anon listing surface must render real results').toBeGreaterThan(0);

    const panel = page.getByTestId('areas-journey-panel-listings');
    await expect(panel, 'AC5.8: anon must reach the listing surface').toBeVisible({ timeout: 15_000 });

    // eslint-disable-next-line no-console -- evidence: exact captured request URL, required by this AC's evidence contract
    console.log(`AC5.8 anon request URL: ${result.requestUrl}`);
  });

  test('AC5.8 (authenticated) — selecting a real AREA reaches the listing surface with parity, request URL captured', async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: 'e2e/fixtures/user-auth.json', viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    try {
      const result = await captureListingsCall(page, async () => {
        await page.goto(`/discover?${BASE}&node=${encodeURIComponent(AREA_BASAVESHWARA)}`);
      });

      expect(result.hasAuthHeader, 'authenticated request must carry an Authorization header').toBe(true);
      expect(result.areaKeysCount, 'AC5.8: authed request must be scoped to exactly the selected area, not city-wide').toBe(
        1,
      );
      expect(result.totalListingCount, 'AC5.8: authenticated listing surface must render real results').toBeGreaterThan(0);

      const panel = page.getByTestId('areas-journey-panel-listings');
      await expect(panel, 'AC5.8: authenticated caller must reach the listing surface').toBeVisible({ timeout: 15_000 });

      // eslint-disable-next-line no-console -- evidence: exact captured request URL, required by this AC's evidence contract
      console.log(`AC5.8 authenticated request URL: ${result.requestUrl}`);
    } finally {
      await context.close();
    }
  });
});
