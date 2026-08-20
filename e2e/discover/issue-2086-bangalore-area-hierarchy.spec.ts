/**
 * Issue #2086 (S6) — Bangalore area hierarchy: no client-side truncation,
 * a genuine City -> Direction -> Local Destination -> Area drill-down, the
 * smaller-city / sparse direct-to-Areas path, and the `node=` URL cursor +
 * breadcrumb + Back ancestry contract through a real CLUSTER level.
 *
 * ── FIXTURE, READ LIVE from the local fixture backend at spec-design time ──
 * `scripts/db/fixtures/navigation-hierarchy-fixture-seed.sql` (Issue #1956
 * PR-5), applied via `scripts/dev/seed-navigation-hierarchy-fixture.sh`
 * against the disposable local fixture Postgres, PLUS a manually-promoted
 * `city_launch_revision` row for bangalore (the committed fixture seed adds
 * `navigation_nodes` rows only; nothing in this repo's fixture scripts yet
 * promotes a `city_launch_revision` row, and `NavigationCachePreloadRunner`/
 * `PublicActiveCityRevisionReader` only ever preload a city whose
 * `city_launch_revision.lifecycle_status = 'PROMOTED'` — confirmed live
 * against a fresh fixture restore, whose `city_launch_revision` table is
 * empty). See this spec's accompanying QA report for the exact one-off
 * `INSERT` used against the LOCAL fixture database only.
 *
 *   root
 *     -> d:southeast "South-East Bangalore"        (DIRECTION, depth 0)
 *          -> a:...RR Nagar / Vijayanagar / Nagarbhavi   (3 AREA children,
 *             direct — no CLUSTER — the sparse/direct-to-Areas shape, AC2)
 *     -> d:northeast "North-East Bangalore"         (DIRECTION, depth 0)
 *          -> c:northeast:hoskote-kannamangala-whitefield-hoskote-road
 *             "Kannamangala - Hoskote Corridor"     (CLUSTER, depth 1)
 *               -> a:...Hoskote                     (AREA, depth 2, has listings)
 *               -> a:...Kannamangala - Whitefield Hoskote Road (AREA, depth 2)
 *     -> d:southwest "South-West Bangalore"         (DIRECTION, depth 0)
 *          -> 4 AREA children (Deepanjali Nagar, Gnana Bharathi, Chandra
 *             Layout Extension, Avalahalli) — Avalahalli deliberately has
 *             ZERO listings (excluded from the map/cluster, but still
 *             renders as a normal "No listings yet" panel child — proves
 *             AC12's "no server child hidden" even for a zero-listing leaf).
 */
import { test, expect, type Page } from '@playwright/test';

const CITY = 'bangalore';
const BASE = `city=${CITY}&journey=area-first`;

const D_SOUTHEAST = 'd:southeast';
const D_NORTHEAST = 'd:northeast';
const D_SOUTHWEST = 'd:southwest';
const CLUSTER_NE = 'c:northeast:hoskote-kannamangala-whitefield-hoskote-road';
const AREA_HOSKOTE = 'a:IN|KA|Bengaluru|Hoskote';
const AREA_KANNAMANGALA = 'a:IN|KA|Bengaluru|Kannamangala - Whitefield Hoskote Road';
const AREA_AVALAHALLI = 'a:IN|KA|Bengaluru|Avalahalli';

function cardTestId(nodeKey: string): string {
  return `navigation-child-card-${nodeKey}`;
}

async function openJourneyRoot(page: Page) {
  await page.goto(`/discover?${BASE}`);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByTestId('navigation-level-panel')).toBeVisible({ timeout: 15_000 });
}

async function currentNodeParam(page: Page): Promise<string | null> {
  return new URL(page.url()).searchParams.get('node');
}

test.describe('@integration-ui #2086 — full-depth drill-down through a real Local Destination (CLUSTER) level', () => {
  test('root -> Direction -> Local Destination -> Area -> listings, with the `node=` URL cursor and breadcrumb tracking every hop', async ({
    page,
  }) => {
    await openJourneyRoot(page);
    expect(await currentNodeParam(page)).toBeNull();

    // Hop 1: City -> Direction (a real group/Direction level, not a
    // DIRECTION-only leaf tree — its nextLevelType is CLUSTER).
    await page.getByTestId(cardTestId(D_NORTHEAST)).click();
    await expect.poll(() => currentNodeParam(page)).toBe(D_NORTHEAST);
    await expect(page.getByTestId(cardTestId(CLUSTER_NE))).toBeVisible();

    // Hop 2: Direction -> Local Destination (CLUSTER).
    await page.getByTestId(cardTestId(CLUSTER_NE)).click();
    await expect.poll(() => currentNodeParam(page)).toBe(CLUSTER_NE);
    await expect(page.getByTestId(cardTestId(AREA_HOSKOTE))).toBeVisible();
    await expect(page.getByTestId(cardTestId(AREA_KANNAMANGALA))).toBeVisible();

    // The breadcrumb at the Local Destination level carries all 3 crumbs
    // resolved so far (City > Direction > Local Destination), with the
    // Local Destination as the current, unlinked terminus.
    const breadcrumb = page.getByTestId('areas-breadcrumb-trail');
    await expect(breadcrumb).toBeVisible();
    await expect(breadcrumb).toHaveText(/North-East Bangalore/);
    await expect(breadcrumb).toHaveText(/Kannamangala - Hoskote Corridor/);
    // The depth-guard alert must never fire for an in-bounds chain.
    await expect(page.getByTestId('areas-breadcrumb-depth-guard')).toHaveCount(0);

    // Hop 3: Local Destination -> Area (the AREA leaf that HAS listings).
    await page.getByTestId(cardTestId(AREA_HOSKOTE)).click();
    await expect.poll(() => currentNodeParam(page)).toBe(AREA_HOSKOTE);

    // Hop 4: Area -> listings — the terminal presentation surface.
    await expect(page.getByTestId('areas-journey-panel-listings')).toBeVisible({ timeout: 15_000 });

    // The breadcrumb now carries the full 4-item chain (City > Direction >
    // Local Destination > Area), still with no depth-guard alert.
    await expect(breadcrumb).toHaveText(/Hoskote/);
    await expect(page.getByTestId('areas-breadcrumb-depth-guard')).toHaveCount(0);
  });

  test('two-hop Back from the Local Destination level: Local Destination -> Direction (GROUP), then Direction -> City — never straight to the root', async ({
    page,
  }) => {
    await openJourneyRoot(page);
    await page.getByTestId(cardTestId(D_NORTHEAST)).click();
    await expect.poll(() => currentNodeParam(page)).toBe(D_NORTHEAST);
    await page.getByTestId(cardTestId(CLUSTER_NE)).click();
    await expect.poll(() => currentNodeParam(page)).toBe(CLUSTER_NE);

    const backButton = page.getByTestId('areas-hierarchy-back');
    await expect(backButton).toBeVisible();

    // Hop back #1: Local Destination -> Direction (the GROUP level). This
    // hop DOES work live — `HierarchyBackButton` renders because the
    // Local Destination's `node.ancestry` is non-empty (it names the
    // Direction as its parent).
    await backButton.click();
    await expect.poll(() => currentNodeParam(page)).toBe(D_NORTHEAST);
    await expect(page.getByTestId(cardTestId(CLUSTER_NE))).toBeVisible();

    // Hop back #2 (Direction -> City root) — the second hop of the
    // approved AC14 two-hop proof.
    //
    // CONFIRMED LIVE FINDING (pre-existing, NOT introduced by #2086 — the
    // identical root cause is already documented in
    // e2e/discover/issue-1956-pr2-guarded-hierarchy-back.spec.ts's own
    // "CONFIRMED LIVE FINDING" comment): `NavigationNodeResponse.ancestry`
    // is empty for every root-of-tree DIRECTION node (confirmed live via
    // `GET .../navigation/resolve?node=d:northeast` returning
    // `"ancestry": []`), and `HierarchyBackButton` renders `null` whenever
    // `node.ancestry.length === 0` (AC5.7's own guard) — so it renders
    // nothing at the Direction level, not only at the true city root.
    // There is therefore NO second in-app hierarchy-Back affordance from
    // Direction to City today; only the browser's native Back/Forward (see
    // the next test) restores that hop. This is asserted here as the
    // CONFIRMED CURRENT STATE, not silently weakened to match it — see the
    // QA report for this file for the explicit REPORT (not edited; no
    // production file is in this leaf's authority).
    await expect(page.getByTestId('areas-hierarchy-back')).toHaveCount(0);
  });

  test('browser Back/Forward through the same 3-hop chain restores every intermediate node, including the Local Destination', async ({
    page,
  }) => {
    await openJourneyRoot(page);
    await page.getByTestId(cardTestId(D_NORTHEAST)).click();
    await expect.poll(() => currentNodeParam(page)).toBe(D_NORTHEAST);
    await page.getByTestId(cardTestId(CLUSTER_NE)).click();
    await expect.poll(() => currentNodeParam(page)).toBe(CLUSTER_NE);
    await page.getByTestId(cardTestId(AREA_HOSKOTE)).click();
    await expect.poll(() => currentNodeParam(page)).toBe(AREA_HOSKOTE);

    await page.goBack();
    await expect.poll(() => currentNodeParam(page)).toBe(CLUSTER_NE);
    await page.goBack();
    await expect.poll(() => currentNodeParam(page)).toBe(D_NORTHEAST);
    await page.goBack();
    expect(await currentNodeParam(page)).toBeNull();

    await page.goForward();
    await expect.poll(() => currentNodeParam(page)).toBe(D_NORTHEAST);
    await page.goForward();
    await expect.poll(() => currentNodeParam(page)).toBe(CLUSTER_NE);
    await page.goForward();
    await expect.poll(() => currentNodeParam(page)).toBe(AREA_HOSKOTE);
  });
});

test.describe('@integration-ui #2086 — AC12: no server child is ever hidden (rendered count === server count)', () => {
  test('the South-East Direction (3 AREA children) renders exactly 3 cards, matching the section count and the live API child count', async ({
    page,
  }) => {
    const backendBase = process.env.BACKEND_BASE_URL ?? 'http://localhost:8190';
    const apiResponse = await page.request.get(
      `${backendBase}/api/discover/cities/${CITY}/navigation/resolve?node=${encodeURIComponent(D_SOUTHEAST)}`,
    );
    expect(apiResponse.ok()).toBe(true);
    const body = await apiResponse.json();
    const serverChildCount: number = body.node.children.length;
    expect(serverChildCount).toBe(3);

    await openJourneyRoot(page);
    await page.getByTestId(cardTestId(D_SOUTHEAST)).click();
    await expect.poll(() => currentNodeParam(page)).toBe(D_SOUTHEAST);

    // The panel's own section count label must equal the server's child
    // count — the durable, on-screen proof that nothing was capped.
    await expect(page.getByTestId('navigation-level-section-count')).toHaveText(String(serverChildCount));

    for (const child of body.node.children as Array<{ nodeKey: string }>) {
      await expect(page.getByTestId(cardTestId(child.nodeKey))).toBeVisible();
    }
    // No 4th/5th card exists beyond what the server sent.
    // `button[data-testid^=...]`, not a bare attribute selector: each card
    // also renders a NESTED `navigation-child-card-listings-<key>` span
    // (the "N listings" caption), which itself starts with the same
    // "navigation-child-card-" prefix and would double-count otherwise.
    await expect(page.locator('button[data-testid^="navigation-child-card-"]')).toHaveCount(serverChildCount);
  });

  test('the South-West Direction (4 AREA children, including the zero-listing Avalahalli leaf) renders all 4 — the zero-listing sibling is never dropped', async ({
    page,
  }) => {
    await openJourneyRoot(page);
    await page.getByTestId(cardTestId(D_SOUTHWEST)).click();
    await expect.poll(() => currentNodeParam(page)).toBe(D_SOUTHWEST);

    await expect(page.getByTestId('navigation-level-section-count')).toHaveText('4');
    await expect(page.locator('button[data-testid^="navigation-child-card-"]')).toHaveCount(4);
    // The zero-listing leaf itself is present as a normal card, not omitted.
    await expect(page.getByTestId(cardTestId(AREA_AVALAHALLI))).toBeVisible();
  });
});

test.describe('@integration-ui #2086 — AC2: smaller-city / sparse-group direct-to-Areas (no invented intermediate CLUSTER level)', () => {
  test('South-East Direction renders straight to AREA cards — no Local Destination / CLUSTER level is ever synthesized', async ({
    page,
  }) => {
    await openJourneyRoot(page);
    await page.getByTestId(cardTestId(D_SOUTHEAST)).click();
    await expect.poll(() => currentNodeParam(page)).toBe(D_SOUTHEAST);

    // "Areas in South-East Bangalore" — the AREA-level section label, never
    // a "Local destinations in ..." label, proving no CLUSTER hop was
    // invented between the Direction and its AREA children.
    await expect(page.getByTestId('navigation-level-section-label')).toHaveText(/Areas in South-East Bangalore/);

    // Clicking an AREA child goes straight to listings — one hop, not two.
    await page.getByTestId(cardTestId('a:IN|KA|Bengaluru|RR Nagar')).click();
    await expect(page.getByTestId('areas-journey-panel-listings')).toBeVisible({ timeout: 15_000 });
  });
});
