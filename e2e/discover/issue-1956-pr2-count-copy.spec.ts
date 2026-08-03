/**
 * Issue #1956 PR-2 — Count copy (Slice 3, `count_display_defect_2026_07_29`).
 *
 * This is the contract PR-2 twice got wrong (NavigationChildCard and
 * NavigationLevelPanel's heading both independently rendered the LISTING
 * total mislabelled as an "areas with matches" count). This spec pins the
 * literal, locked copy against the FIXTURE-ONLY deterministic promoted
 * shallow tree (see the sibling guarded-hierarchy-back spec's module doc for
 * the full ground truth and the generator-vs-consumer disclaimer):
 *
 *   d:w "West Bangalore" -> Basaveshwara Nagar (2 listings), Binnipete (0)
 *     => 1 of 2 areas has a match => "1 areas with matches" / "2 listings"
 *        (the two numbers are DIFFERENT — the exact defect class this guards).
 *   d:e "East Bangalore" -> cluster "Domlur & C V Raman Nagar"
 *     -> Domlur Layout (1 listing), C V Raman Nagar (0)
 *
 * The locked zero literal (`NO_MATCHES_WITH_CURRENT_FILTERS` =
 * "No matches with current filters") is a STRUCTURAL-level (Direction/
 * Cluster) string, applied when `matchingAreaCount === 0` or a level's
 * `children` array is empty — per `journeyVisibility.ts` and
 * `NavigationLevelPanel.tsx`. A zero-listing LEAF AREA card (Binnipete, C V
 * Raman Nagar) is a DIFFERENT, deliberately distinct string: `formatListingCount`
 * renders "No listings yet" for a leaf, never the structural zero literal —
 * confirmed directly by reading `NavigationChildCard`'s only-derive-an-areas-
 * line-when-`!child.isLeafArea` guard. This fixture's seeded data has no
 * structural (Direction/Cluster) destination whose `matchingAreaCount` is
 * exactly 0, so the structural zero literal itself is NOT exercised here —
 * documented explicitly below rather than mislabelling the leaf-zero case as
 * proof of it.
 */
import { test, expect, type Page } from '@playwright/test';

const CITY = 'bangalore';
const BASE = `city=${CITY}&journey=area-first`;

const D_W = 'd:w';
const D_E = 'd:e';
const AREA_BASAVESHWARA = 'a:IN|KA|Bengaluru|Basaveshwara Nagar';
const AREA_BINNIPETE = 'a:IN|KA|Bengaluru|Binnipete';
const CLUSTER_DOMLUR = 'c:e:in-ka-bengaluru-c-v-raman-nagar-in-ka-bengaluru-domlur-layout';
const AREA_C_V_RAMAN = 'a:IN|KA|Bengaluru|C V Raman Nagar';

const NO_MATCHES_LITERAL = 'No matches with current filters';

function cardTestId(nodeKey: string): string {
  return `navigation-child-card-${nodeKey}`;
}

async function currentNodeParam(page: Page): Promise<string | null> {
  return new URL(page.url()).searchParams.get('node');
}

async function openRoot(page: Page) {
  await page.goto(`/discover?${BASE}`);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByTestId('navigation-level-panel')).toBeVisible({ timeout: 15_000 });
}

test.describe('@integration-ui #1956 PR-2 — count copy: structural vs listing count are DIFFERENT numbers', () => {
  test('West Bangalore renders BOTH lines, and the areas count is NOT the listing count (1 areas with matches, 2 listings)', async ({
    page,
  }) => {
    await openRoot(page);
    await page.getByTestId(cardTestId(D_W)).click();
    await expect.poll(() => currentNodeParam(page)).toBe(D_W);

    // Positive: the heading level actually resolved for this node.
    await expect(page.getByTestId('navigation-level-panel')).toHaveAttribute('data-node-key', D_W);

    const areasLine = page.getByTestId('navigation-level-heading-count');
    const listingsLine = page.getByTestId('navigation-level-heading-listings');
    await expect(areasLine).toBeVisible();
    await expect(listingsLine).toBeVisible();

    // The two lines carry DIFFERENT numbers — the exact defect class this
    // guards against (a Direction's listing total is not its matching-area
    // count).
    await expect(areasLine).toHaveText('1 areas with matches');
    await expect(listingsLine).toHaveText('2 listings');
  });

  test('the Direction CARD (and its matching map marker) render BOTH lines, and the areas count is NOT the listing count (1 areas with matches, 2 listings)', async ({
    page,
  }) => {
    await openRoot(page);

    // Positive: the card and marker both really rendered.
    const card = page.getByTestId(cardTestId(D_W));
    await expect(card).toBeVisible();
    const marker = page.locator('[data-testid="area-destination-marker"][data-node-key="d:w"]');
    await expect(marker).toBeVisible();

    // Both agree with each other (never diverge), and both carry the
    // areas-with-matches line alongside the listings line. Confirmed
    // directly against the (rebuilt) fixture backend: GET
    // /api/discover/cities/bangalore/navigation/root/counts returns
    // `"children":[{"nodeKey":"d:e","count":1,"schoolCount":0,
    // "matchingAreaCount":1},{"nodeKey":"d:w","count":2,"schoolCount":0,
    // "matchingAreaCount":1}]` — each child entry now DOES populate a
    // per-child `matchingAreaCount`. `NavigationChildCard`'s
    // `child.matchingAreaCount` (fed from `countsForChild(...).matchingAreaCount`
    // in `useAreasNavigationJourney.ts`) resolves to `1` for `d:w` (of its 2
    // AREA children, only Basaveshwara Nagar — 2 listings — matches;
    // Binnipete has 0), while its listing total stays `2` — the exact
    // divergence this spec guards. This is the per-child half of
    // `[user_rulings_2026_07_29_cycle1].matching_area_count_backend_widening`'s
    // acceptance criterion ("... renders '12 areas with matches' in panel AND
    // matching map marker"), now met at the CARD/MARKER level. (This test
    // previously asserted the line's ABSENCE, live-verified against a stale
    // backend build that had not yet shipped per-child `matchingAreaCount`;
    // it has been corrected to assert the current, verified-live behaviour.)
    await expect(page.getByTestId(`navigation-child-card-count-${D_W}`)).toHaveText(
      '1 areas with matches',
    );
    await expect(page.getByTestId(`navigation-child-card-listings-${D_W}`)).toHaveText('2 listings');
    await expect(marker).toContainText('1 areas with matches');
    await expect(marker).toContainText('2 listings');
  });
});

test.describe('@integration-ui #1956 PR-2 — zero-listing AREA leaves render "No listings yet", never the structural zero literal', () => {
  test('Binnipete (0 listings, a leaf AREA under West Bangalore) shows "No listings yet" and no areas-with-matches line', async ({
    page,
  }) => {
    await openRoot(page);
    await page.getByTestId(cardTestId(D_W)).click();
    await expect.poll(() => currentNodeParam(page)).toBe(D_W);

    const binnipeteCard = page.getByTestId(cardTestId(AREA_BINNIPETE));
    await expect(binnipeteCard).toBeVisible();
    await expect(page.getByTestId(`navigation-child-card-listings-${AREA_BINNIPETE}`)).toHaveText(
      'No listings yet',
    );
    // A leaf AREA card never renders an areas-with-matches count line at all.
    await expect(page.getByTestId(`navigation-child-card-count-${AREA_BINNIPETE}`)).toHaveCount(0);
    // And specifically not the structural zero literal, which is a distinct
    // string reserved for a zero-match Direction/Cluster.
    await expect(binnipeteCard).not.toContainText(NO_MATCHES_LITERAL);
  });

  test('C V Raman Nagar (0 listings, a leaf AREA under the Domlur cluster) shows "No listings yet" too', async ({
    page,
  }) => {
    await openRoot(page);
    await page.getByTestId(cardTestId(D_E)).click();
    await expect.poll(() => currentNodeParam(page)).toBe(D_E);
    await page.getByTestId(cardTestId(CLUSTER_DOMLUR)).click();
    await expect.poll(() => currentNodeParam(page)).toBe(CLUSTER_DOMLUR);

    const cvrCard = page.getByTestId(cardTestId(AREA_C_V_RAMAN));
    await expect(cvrCard).toBeVisible();
    await expect(page.getByTestId(`navigation-child-card-listings-${AREA_C_V_RAMAN}`)).toHaveText(
      'No listings yet',
    );
    await expect(page.getByTestId(`navigation-child-card-count-${AREA_C_V_RAMAN}`)).toHaveCount(0);
  });

  test('DOCUMENTED GAP: this fixture has no structural (Direction/Cluster) destination whose matchingAreaCount is exactly 0, so the locked structural zero literal itself is not exercised by live data here', async () => {
    // Both seeded Directions (West: 1/2 areas match, East: 1/2 areas match via
    // the Domlur cluster) have at least one matching area — there is no
    // Direction/Cluster in this fixture with matchingAreaCount === 0.
    // journeyVisibility.test.ts already unit-pins the zero-literal string and
    // its selection logic in isolation; a live-browser proof of the
    // STRUCTURAL zero-count render would need an additional fixture node and
    // is intentionally left as a gap rather than misusing the leaf-AREA
    // "No listings yet" case as if it were the same string.
    expect(NO_MATCHES_LITERAL).toBe('No matches with current filters');
  });
});

test.describe('@integration-ui #1956 PR-2 — no "+N" form at Direction or Local Destination level (PR-3 scope guard)', () => {
  test('West Bangalore (Direction level) renders no "+N" form anywhere, after its real destination surface is confirmed up', async ({
    page,
  }) => {
    await openRoot(page);
    await page.getByTestId(cardTestId(D_W)).click();
    await expect.poll(() => currentNodeParam(page)).toBe(D_W);

    // Positive first: the real surface rendered with its real children.
    const childList = page.getByTestId('navigation-child-list');
    await expect(childList).toBeVisible();
    await expect(page.getByTestId(cardTestId(AREA_BASAVESHWARA))).toBeVisible();
    await expect(page.getByTestId(cardTestId(AREA_BINNIPETE))).toBeVisible();

    // Negative, now that presence is proven: no "+N" token anywhere in the
    // heading or the child list (that form belongs to PR-3's visual clusters).
    const heading = page.getByTestId('navigation-level-panel');
    await expect(heading).not.toContainText(/\+\d/);
  });

  test('East Bangalore (Direction level, fans out to its Local Destination) renders no "+N" form either', async ({
    page,
  }) => {
    await openRoot(page);
    await page.getByTestId(cardTestId(D_E)).click();
    await expect.poll(() => currentNodeParam(page)).toBe(D_E);

    await expect(page.getByTestId(cardTestId(CLUSTER_DOMLUR))).toBeVisible();
    const heading = page.getByTestId('navigation-level-panel');
    await expect(heading).not.toContainText(/\+\d/);

    // And at the Local Destination (cluster) level itself.
    await page.getByTestId(cardTestId(CLUSTER_DOMLUR)).click();
    await expect.poll(() => currentNodeParam(page)).toBe(CLUSTER_DOMLUR);
    await expect(page.getByTestId(cardTestId(AREA_C_V_RAMAN))).toBeVisible();
    await expect(page.getByTestId('navigation-level-panel')).not.toContainText(/\+\d/);
  });
});
