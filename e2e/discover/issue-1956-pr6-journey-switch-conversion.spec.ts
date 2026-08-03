/**
 * Issue #1956 PR-6 (rework, [rulings.oq_a_v2]) — the areaKey -> canonical
 * node conversion seam.
 *
 * These are the ruling's own proof items (`proof_requirements` in the
 * approved rework handoff), beyond item 1 (verified separately in
 * `issue-1956-pr5-desktop-breadcrumb-regression.spec.ts`):
 *   - A real regression starting from the FULL legacy URL, clicking the
 *     ACTUAL JourneySwitcher, asserting canonical mounts at the SAME AREA
 *     with the full canonical breadcrumb and NO legacy params remaining.
 *   - Browser Back from that transition.
 *   - The unresolved-key failure path.
 *
 * Fixture ground truth (confirmed live against the running backend, not
 * assumed from docs — the D-direction/E-direction naming in older PR-2 specs
 * and #1955-era type docs does NOT match the CURRENT promoted fixture,
 * #2050):
 *   GET /api/discover/cities/bangalore/navigation/root -> d:w, d:s,
 *     d:southeast, d:northeast, d:southwest (NO d:e/d:n/d:central).
 *   GET /api/discover/cities/bangalore/navigation/d:w -> ONE AREA child,
 *     `IN|KA|Bengaluru|Basaveshwara Nagar` (nodeKey
 *     `a:IN|KA|Bengaluru|Basaveshwara Nagar`).
 *   GET /api/discover/cities/bangalore/areas/IN|KA|Bengaluru|Basaveshwara
 *     Nagar/navigation-path -> 200, resolves to that same nodeKey with
 *     ancestry `[d:w]` — this is the SUCCESS-path fixture.
 *   GET .../areas/IN|KA|Bengaluru|Yelahanka/navigation-path -> 404 ("Area not
 *     found in navigation hierarchy") — Yelahanka is a valid LEGACY
 *     `scope`/`macroRegionResolver` area (still rendered by the surviving
 *     `AreaSelectedPanel`) but was never promoted into the canonical
 *     navigation_nodes graph on this fixture, which makes it the natural,
 *     already-live FAILURE-path fixture for the unresolved-key test — no
 *     synthetic/mocked 404 needed.
 */
import { test, expect } from '@playwright/test';

const CITY = 'bangalore';
const SUCCESS_AREA_KEY = 'IN|KA|Bengaluru|Basaveshwara Nagar';
const SUCCESS_GROUP_ID = 'west-fixture-group';
const SUCCESS_NODE_KEY = `a:${SUCCESS_AREA_KEY}`;
const SUCCESS_PARENT_NODE_KEY = 'd:w';

const STALE_AREA_KEY = 'IN|KA|Bengaluru|Yelahanka';
const STALE_GROUP_ID = 'airport-belt';

function legacyUrl(areaKey: string, groupId: string): string {
  return (
    `/discover?city=${CITY}&scope=west&groupId=${encodeURIComponent(groupId)}` +
    `&areaKey=${encodeURIComponent(areaKey)}`
  );
}

async function currentParams(page: import('@playwright/test').Page) {
  return new URL(page.url()).searchParams;
}

test.describe('@integration-ui #1956 PR-6 — JourneySwitcher areaKey->node conversion seam', () => {
  test('resolvable legacy areaKey: clicking "Explore by area" converts to canonical at the SAME area, full canonical breadcrumb, legacy params cleared in ONE transition', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem('discover_telemetry_consent', 'granted');
    });

    // Start on the legacy area page (no `journey=` param — the pre-cutover
    // shape a real shopper's bookmark/deep-link would have).
    await page.goto(legacyUrl(SUCCESS_AREA_KEY, SUCCESS_GROUP_ID));
    await page.waitForLoadState('domcontentloaded');

    // Positive: the legacy surface is really up before the click (the
    // shared, surviving AreaSelectedPanel — never the deleted panels).
    const legacyBreadcrumb = page.getByTestId('area-first-breadcrumb');
    await expect(legacyBreadcrumb).toBeVisible({ timeout: 15_000 });

    const historyLengthBefore = await page.evaluate(() => window.history.length);

    // The ACTUAL in-app control, not a synthetic URL change.
    await page.getByTestId('journey-card-area-first').click();

    // Canonical mounts at the SAME area — the resolved node, not the city
    // root — with its own breadcrumb trail.
    const trail = page.getByTestId('areas-breadcrumb-trail');
    await expect(trail).toBeVisible({ timeout: 15_000 });
    const currentCrumb = trail.locator('[aria-current="page"]');
    await expect(currentCrumb).toHaveText('Basaveshwara Nagar');
    // Full canonical breadcrumb: the Direction ancestor is present too, not
    // just the terminal AREA crumb.
    await expect(trail.locator('li')).toHaveCount(2);
    await expect(trail).toContainText('West Bangalore');

    const params = await currentParams(page);
    expect(params.get('journey')).toBe('area-first');
    expect(params.get('node')).toBe(SUCCESS_NODE_KEY);
    // NO legacy params remaining.
    expect(params.get('groupId')).toBeNull();
    expect(params.get('areaKey')).toBeNull();

    // The legacy WRAPPER is genuinely gone, not merely overlaid — note
    // `area-first-breadcrumb` itself is NOT a legacy-only signal: canonical's
    // AREA-leaf view reuses the shared `AreaSelectedPanel.tsx` internally
    // (confirmed live — the panel content and its own breadcrumb are
    // identical whether reached via legacy or via this conversion), which is
    // exactly why that component's survival makes this fallback coherent.
    // `discover-right-panel` is the legacy `DiscoverRightPanel` wrapper's OWN
    // testid, never emitted by `DiscoverAreasJourneyPanel` — that is the
    // genuine "old surface gone" signal.
    await expect(page.getByTestId('discover-right-panel')).toHaveCount(0);

    // ONE intentional navigation transition — exactly one new history entry
    // for the one click (no double-push: an intermediate `journey=area-first`
    // without `node=`, followed by a second push adding `node=`, would show
    // up here as +2).
    const historyLengthAfter = await page.evaluate(() => window.history.length);
    expect(historyLengthAfter - historyLengthBefore).toBe(1);

    // Browser Back from the conversion returns to the exact legacy state the
    // click started from — full context restored, not a further/different
    // navigation.
    await page.goBack();
    await expect(page.getByTestId('area-first-breadcrumb')).toBeVisible({ timeout: 15_000 });
    const paramsAfterBack = await currentParams(page);
    expect(paramsAfterBack.get('groupId')).toBe(SUCCESS_GROUP_ID);
    expect(paramsAfterBack.get('areaKey')).toBe(SUCCESS_AREA_KEY);
    expect(paramsAfterBack.get('journey')).toBeNull();
    expect(paramsAfterBack.get('node')).toBeNull();
  });

  test('unresolved/stale legacy areaKey: clicking "Explore by area" retains the current legacy state — no navigation, context never dropped', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem('discover_telemetry_consent', 'granted');
    });

    await page.goto(legacyUrl(STALE_AREA_KEY, STALE_GROUP_ID));
    await page.waitForLoadState('domcontentloaded');

    const legacyBreadcrumb = page.getByTestId('area-first-breadcrumb');
    await expect(legacyBreadcrumb).toBeVisible({ timeout: 15_000 });
    await expect(legacyBreadcrumb).toContainText('Yelahanka');

    const paramsBefore = await currentParams(page);
    const historyLengthBefore = await page.evaluate(() => window.history.length);

    await page.getByTestId('journey-card-area-first').click();

    // Give the failed round trip (404) a real chance to settle before
    // asserting nothing changed — an honest toast is the expected surface,
    // never a silent instant no-op indistinguishable from the button not
    // working at all.
    await expect(
      page.getByText(/couldn.?t switch to area view/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Context is NOT dropped: the exact same legacy area page is still up,
    // canonical never mounted, and no history entry was consumed.
    await expect(page.getByTestId('area-first-breadcrumb')).toBeVisible();
    await expect(page.getByTestId('area-first-breadcrumb')).toContainText('Yelahanka');
    await expect(page.getByTestId('areas-breadcrumb-trail')).toHaveCount(0);

    const paramsAfter = await currentParams(page);
    expect(paramsAfter.get('groupId')).toBe(paramsBefore.get('groupId'));
    expect(paramsAfter.get('areaKey')).toBe(paramsBefore.get('areaKey'));
    expect(paramsAfter.get('journey')).toBeNull();
    expect(paramsAfter.get('node')).toBeNull();

    const historyLengthAfter = await page.evaluate(() => window.history.length);
    expect(historyLengthAfter).toBe(historyLengthBefore);
  });
});
