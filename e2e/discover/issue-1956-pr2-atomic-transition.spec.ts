/**
 * Issue #1956 PR-2 — Atomic node transition (Slice 5, AC5.9).
 *
 * AC5.9: "map, panel, breadcrumb and URL update atomically without stale
 * child markers or stale listing results." This AC had NO evidence of any
 * kind prior to this spec (WORKDONE_REVIEW rework-request cycle,
 * `.claude/handoffs/issue-1956/rework-request-workdone-review-1.toml`).
 *
 * Validates against the same FIXTURE-ONLY deterministic promoted shallow tree
 * used by the sibling PR-2 specs (see `issue-1956-pr2-guarded-hierarchy-back
 * .spec.ts`'s module doc for full ground truth):
 *
 *   root -> d:w "West Bangalore" -> AREA children directly (Basaveshwara
 *           Nagar 2 listings, Binnipete 0) — no Local Destination level.
 *        -> d:e "East Bangalore" -> CLUSTER "Domlur & C V Raman Nagar"
 *           -> AREA children (Domlur Layout 1, C V Raman Nagar 0).
 *
 * ── WHY ROOT IS THE "COMMITTED" FROM-STATE, NOT THE INITIAL LOAD ──
 * `AreaDestinationMarkerLayer` (`src/components/map/AreaMarkerLayer.tsx`)
 * only ever renders markers when `levelKind === 'directions'` — i.e. ONLY at
 * the true city root, where the two Direction destinations (d:w, d:e) are
 * the children being displayed. At every deeper level (Direction, Cluster,
 * Area) the layer mounts NO markers at all (confirmed directly by reading
 * the component). A transition between two non-root levels therefore has
 * nothing on the map side to go stale — the only transition in this build
 * where the MAP surface has real content to test for staleness is one whose
 * FROM state is the root. Root cannot be re-entered by any in-app control
 * (Direction level has no hierarchy-Back and no breadcrumb ancestor back to
 * City — the sibling guarded-hierarchy-back spec's confirmed live finding),
 * so this spec reaches a genuinely COMMITTED root (not the raw initial page
 * load) via a real browser back-navigation: Direction -> Area -> Back x2,
 * exactly the pattern `issue-1956-pr2-guarded-hierarchy-back.spec.ts`'s
 * AC5.10 test already proves lands back on `node=null`.
 *
 * ── MAP-SURFACE IDENTITY BEYOND MARKERS ──
 * `AreasBreadcrumbTrail` is mounted inside `DiscoverMapContextOverlay` — i.e.
 * it is itself a map-canvas overlay, not a panel element (confirmed by
 * reading the component and by the sibling breadcrumb spec's own module
 * doc). Its terminal crumb always reflects the CURRENT node's own key/label
 * (`chain = [...node.ancestry, currentAsSummary]`), so it doubles as this
 * spec's "map reflects the current node" check anywhere the marker layer
 * itself is silent. CONFIRMED LIVE (do not "fix" this file's assertions to
 * hide it): the true city ROOT is itself a real, server-resolved node
 * (`GET .../navigation/resolve?node=root` returns `displayLabel: "Bangalore"`,
 * `ancestry: []`), so the breadcrumb trail is NOT absent at root — it shows
 * exactly ONE crumb, "Bangalore", as the current/terminal segment. This
 * spec asserts that single-crumb root state explicitly rather than
 * (incorrectly) asserting the trail is absent at root.
 *
 * ── WHY THE STALE-RESPONSE CASE USES BROWSER BACK, NOT A SECOND CARD CLICK ──
 * Confirmed live by reading `DiscoverAreasJourneyPanel.tsx`: the panel
 * renders EITHER a full-skeleton loading state OR the real child list,
 * gated on a single shared `journey.isLoading` — there is no partial/
 * per-card loading state. The instant one child card is clicked, ALL
 * sibling cards (including ones never clicked) unmount from the DOM until
 * that one request resolves. There is therefore no way, through real UI
 * clicks alone, to fire a second navigation to a DIFFERENT sibling while a
 * first sibling's request is still in flight — Playwright cannot click a
 * card that the app itself has just removed from the page. The existing
 * test seam DOES permit a real second navigation while the first is
 * in-flight via the browser's own Back button (`page.goBack()`), which the
 * app's client-side router handles without a full reload: this spec uses
 * that mechanism for the stale-response case, since it is the only
 * trustworthy way this build's current UI allows a second, faster
 * navigation to commit while an earlier one is still pending.
 */
import { test, expect, type Page } from '@playwright/test';

const CITY = 'bangalore';
const BASE = `city=${CITY}&journey=area-first&areasPreview=1`;

const D_W = 'd:w';
const D_E = 'd:e';
const AREA_BASAVESHWARA = 'a:IN|KA|Bengaluru|Basaveshwara Nagar';
const AREA_BINNIPETE = 'a:IN|KA|Bengaluru|Binnipete';

function cardTestId(nodeKey: string): string {
  return `navigation-child-card-${nodeKey}`;
}

function markerLocator(page: Page, nodeKey: string) {
  return page.locator(`[data-testid="area-destination-marker"][data-node-key="${nodeKey}"]`);
}

async function currentNodeParam(page: Page): Promise<string | null> {
  return new URL(page.url()).searchParams.get('node');
}

async function openRoot(page: Page) {
  await page.goto(`/discover?${BASE}`);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByTestId('navigation-level-panel')).toBeVisible({ timeout: 15_000 });
}

/**
 * Reaches a genuinely COMMITTED root — via a real navigation (Direction ->
 * Area -> browser Back x2), never the raw initial page load — so the
 * transition tested afterwards starts from a prior committed state that can
 * actually go stale, per the ruling's requirement.
 */
async function commitToRootViaBack(page: Page): Promise<void> {
  await openRoot(page);
  await page.getByTestId(cardTestId(D_W)).click();
  await expect.poll(() => currentNodeParam(page)).toBe(D_W);
  await page.getByTestId(cardTestId(AREA_BASAVESHWARA)).click();
  await expect.poll(() => currentNodeParam(page)).toBe(AREA_BASAVESHWARA);

  await page.goBack();
  await expect.poll(() => currentNodeParam(page)).toBe(D_W);
  await page.goBack();
  await expect.poll(() => currentNodeParam(page)).toBeNull();

  // Positive: this is a REAL committed root, not a blank/broken screen — the
  // full root destination surface (both Direction cards + both markers) is
  // actually back up before we use it as the FROM state.
  await expect(page.getByTestId(cardTestId(D_W))).toBeVisible();
  await expect(page.getByTestId(cardTestId(D_E))).toBeVisible();
  await expect(markerLocator(page, D_W)).toBeVisible();
  await expect(markerLocator(page, D_E)).toBeVisible();
}

test.describe('@integration-ui #1956 PR-2 — atomic node transition (AC5.9)', () => {
  test('committed root -> child Direction (d:e): URL, breadcrumb, panel and map ALL converge on the SAME new identity, with no stale root markers or stale panel content left behind', async ({
    page,
  }) => {
    await commitToRootViaBack(page);

    // BEFORE, at the committed root: the breadcrumb trail is up with exactly
    // ONE crumb — the root itself ("Bangalore") — and the URL carries no
    // node param. Asserted explicitly (positive) rather than assumed absent.
    const trailBefore = page.getByTestId('areas-breadcrumb-trail');
    await expect(trailBefore).toBeVisible();
    await expect(trailBefore.locator('li')).toHaveCount(1);
    await expect(trailBefore.locator('[aria-current="page"]')).toHaveText('Bangalore');
    expect(await currentNodeParam(page)).toBeNull();

    // The transition under test: committed root -> its child Direction d:e.
    await page.getByTestId(cardTestId(D_E)).click();

    // Positive presence FIRST, on every surface, before any staleness check.
    await expect.poll(() => currentNodeParam(page)).toBe(D_E);
    await expect(page.getByTestId('navigation-level-panel')).toHaveAttribute('data-node-key', D_E);
    await expect(page.getByTestId('navigation-level-heading')).toContainText('East Bangalore');
    const trail = page.getByTestId('areas-breadcrumb-trail');
    await expect(trail).toBeVisible();
    const currentCrumb = trail.locator('[aria-current="page"]');
    await expect(currentCrumb).toHaveText('East Bangalore');

    // URL, panel data-node-key and breadcrumb current crumb all agree on the
    // SAME final identity.
    expect(await currentNodeParam(page)).toBe(D_E);

    // Negative, now that the new identity is proven present on every surface:
    // no stale root-level markers survive the transition (AC5.9's literal
    // "no stale child markers" — the two Direction markers that were visible
    // on the committed root a moment ago must be gone, not left overlaid on
    // the new panel/breadcrumb state).
    await expect(markerLocator(page, D_W)).toHaveCount(0);
    await expect(markerLocator(page, D_E)).toHaveCount(0);
    await expect(page.locator('[data-testid="area-destination-marker"]')).toHaveCount(0);

    // Negative: the breadcrumb no longer shows the stale root crumb
    // ("Bangalore") or a duplicated/second current crumb — it is REPLACED by
    // the new identity, not appended to.
    await expect(trail.getByText('Bangalore', { exact: true })).toHaveCount(0);
    await expect(trail.locator('li')).toHaveCount(1);

    // Negative: the panel shows East Bangalore's own child (the Local
    // Destination cluster), never any West-Bangalore-scoped content.
    await expect(page.getByTestId(cardTestId(AREA_BASAVESHWARA))).toHaveCount(0);
    await expect(page.getByTestId(cardTestId(AREA_BINNIPETE))).toHaveCount(0);
  });

  test('delayed stale prior response: a slow first navigation (d:e) must not repaint URL/panel/breadcrumb after the user backs out and a second, faster navigation has already re-committed', async ({
    page,
  }) => {
    // NOTE ON WHY THIS USES page.goBack() FOR THE SECOND NAVIGATION: confirmed
    // live by reading `DiscoverAreasJourneyPanel.tsx` — the panel is gated on
    // one shared `journey.isLoading` and swaps its ENTIRE body to a skeleton
    // (unmounting every sibling child card, not just the clicked one) the
    // instant any single navigation's resolve request goes in flight. That
    // means a second UI click on a DIFFERENT sibling card cannot be driven
    // while the first is pending — the app itself removes that card from the
    // DOM first. The browser's own Back button is the one real, trustworthy
    // mechanism this build's current UI allows for a second, faster
    // navigation to commit while an earlier one is still outstanding, so this
    // case uses `page.goBack()` rather than a second card click.
    await commitToRootViaBack(page);

    // Delay ONLY the resolve response for d:e (a real pass-through, not a
    // mocked payload — `route.continue()` after a fixed delay).
    const DELAY_MS = 2_500;
    await page.route('**/api/discover/cities/**/navigation/resolve?**', async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('node') === D_E) {
        await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
      }
      try {
        await route.continue();
      } catch {
        // The in-flight request may already have been aborted client-side by
        // the browser-Back navigation superseding it — that is an equally
        // valid, even stronger, proof that the stale response never lands.
      }
    });

    // First (slow) navigation: click the East Bangalore Direction card. Its
    // resolve response is now delayed and has NOT returned yet.
    await page.getByTestId(cardTestId(D_E)).click();

    // Positive: this really is a genuine in-flight request, not a no-op —
    // the panel has swapped to its real loading state.
    await expect(page.getByTestId('areas-journey-panel-loading')).toBeVisible();
    expect(await currentNodeParam(page)).toBe(D_E);

    // Second (fast) navigation, fired immediately, before d:e's delayed
    // response can possibly have arrived: the user backs out to the
    // committed root, whose resolve was already fetched moments ago in
    // `commitToRootViaBack` and settles near-instantly.
    await page.goBack();

    // Positive presence FIRST: the second navigation's own real identity
    // (the committed root) is actually back up everywhere.
    await expect.poll(() => currentNodeParam(page)).toBeNull();
    await expect(page.getByTestId(cardTestId(D_W))).toBeVisible();
    await expect(page.getByTestId(cardTestId(D_E))).toBeVisible();
    const trail = page.getByTestId('areas-breadcrumb-trail');
    await expect(trail).toBeVisible();
    await expect(trail.locator('[aria-current="page"]')).toHaveText('Bangalore');

    // Now wait past the delayed d:e response's arrival window, so the stale
    // response has had every opportunity to repaint the app if it were going
    // to.
    await page.waitForTimeout(DELAY_MS + 500);

    // Negative, only now: the late-arriving d:e response must NOT have
    // overwritten anything — URL, panel and breadcrumb must still show the
    // committed root's own identity, not a reversion to East Bangalore.
    expect(await currentNodeParam(page)).toBeNull();
    await expect(page.getByTestId(cardTestId(D_W))).toBeVisible();
    await expect(page.getByTestId(cardTestId(D_E))).toBeVisible();
    await expect(trail.locator('[aria-current="page"]')).toHaveText('Bangalore');
    await expect(trail.getByText('East Bangalore')).toHaveCount(0);
    await expect(markerLocator(page, D_W)).toBeVisible();
    await expect(markerLocator(page, D_E)).toBeVisible();
  });
});
