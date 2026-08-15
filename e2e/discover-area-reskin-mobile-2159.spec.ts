/**
 * Issue #2159 — Discover selected-Area result-page reskin, mobile (390x844)
 * evidence. PR #2180 review (id 4944924188, head 9a04c4d) required committed,
 * CI-visible proof rather than a prose PR comment + screenshots — a reviewer
 * bot cannot inspect claims made outside the repo. This spec is the committed
 * counterpart of that manual verification, run against the real dev backend
 * (no page.route() mocks), following this repo's established real-data
 * pattern (e2e/discover-real-data-smoke.spec.ts) and mobile-viewport pattern
 * (e2e/discover/issue-1956-pr5-mobile-list-first.spec.ts — `test.use({
 * viewport })`, `control-bar-map-trigger` / `mobile-map-close-list-button`
 * for the List<->Map toggle, and the "toggle writes neither node= nor
 * history" invariant proven there at the state-mechanism level (`mobile-
 * ToggleHistorySafety.integration.test.tsx`: `mobileView` is plain
 * `useState` inside `DiscoverProvider`, never serialised to the URL).
 *
 * Covers the DoD items the reviewer flagged as inspectable-proof-required:
 *   1. No horizontal overflow at 390px (list remains reachable, nothing
 *      forces the page wider than the viewport).
 *   2. The reskinned card grid (`.area-listings-grid`, AreaSelectedPanel.tsx)
 *      renders single-column below the 560px container-query threshold —
 *      390px is well under that, so this also guards the container-query
 *      fix itself (see index.css `.area-panel-container` / `.area-listings-
 *      grid`) from silently regressing to 2 columns on mobile.
 *   3. The canonical `node=` identity (#1823 camera authority, #2142
 *      dependency direction) survives a List -> Map toggle.
 *
 * Run:
 *   PLAYWRIGHT_BASE_URL=http://localhost:5230 npx playwright test \
 *     e2e/discover-area-reskin-mobile-2159.spec.ts --project=full
 */
import { test, expect } from '@playwright/test';

const AREA_NODE = 'a:IN|KA|Bengaluru|JP Nagar';
const AREA_URL =
  `/discover?city=bangalore&node=${encodeURIComponent(AREA_NODE)}` +
  `&lat=12.90755&lon=77.58744&zoom=14`;

async function dismissConsentBannerIfPresent(page: import('@playwright/test').Page): Promise<void> {
  const decline = page.getByRole('button', { name: /decline anonymous usage data collection/i });
  if (await decline.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await decline.click();
  }
}

function currentNodeParam(page: import('@playwright/test').Page): string | null {
  return new URL(page.url()).searchParams.get('node');
}

test.describe('#2159 Discover area reskin — mobile (390x844) evidence', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('list-first layout has no horizontal overflow, cards render single-column, and node= survives the List<->Map toggle', async ({
    page,
  }) => {
    await page.goto(AREA_URL);
    await page.waitForLoadState('domcontentloaded');
    await dismissConsentBannerIfPresent(page);

    // Real backend, real listings — matches the representative production URL.
    await page.waitForSelector('[data-testid="listing-card"]', { timeout: 20_000 });
    const cardCount = await page.locator('[data-testid="listing-card"]').count();
    expect(cardCount, 'fixture sanity: JP Nagar must have at least 1 real listing to prove this meaningfully').toBeGreaterThanOrEqual(1);

    // 1. No horizontal overflow at the 390px mobile target — "list remains
    // reachable, nothing forces the page wider than the viewport" DoD item.
    const scrollWidths = await page.evaluate(() => ({
      documentElement: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    expect(scrollWidths.documentElement, 'document.documentElement must not overflow the 390px viewport').toBeLessThanOrEqual(390);
    expect(scrollWidths.body, 'document.body must not overflow the 390px viewport').toBeLessThanOrEqual(390);

    // 2. The reskinned grid is single-column at this width — the container
    // query threshold is 560px (see index.css), so 390px must never trigger
    // the 2-column layout meant for desktop.
    const grid = page.locator('.area-listings-grid');
    await expect(grid).toBeVisible({ timeout: 10_000 });
    const trackCount = await grid.evaluate((el) => {
      const cols = getComputedStyle(el).gridTemplateColumns.trim();
      return cols.split(/\s+/).filter(Boolean).length;
    });
    expect(trackCount, 'card grid must render exactly one column below the 560px container-query threshold').toBe(1);

    // 3. node= identity survives the List -> Map toggle (#1823 camera
    // authority / #2142 dependency direction: MapDiscovery stays thin and
    // downstream of this canonical identity, never a second source of it).
    const nodeBeforeToggle = currentNodeParam(page);
    expect(nodeBeforeToggle, 'fixture sanity: the representative URL must carry the JP Nagar node').toBe(AREA_NODE);

    const mapTrigger = page.getByTestId('control-bar-map-trigger');
    await expect(mapTrigger).toBeVisible({ timeout: 10_000 });
    await mapTrigger.click();

    // Confirms the toggle actually fired (Map mode's "back to list" control
    // appears) before asserting on the URL it left behind.
    const closeListButton = page.getByTestId('mobile-map-close-list-button');
    await expect(closeListButton).toBeVisible({ timeout: 10_000 });

    expect(currentNodeParam(page), 'node= must be unchanged after toggling to Map — the toggle is state-only, never a second URL writer').toBe(
      AREA_NODE,
    );
  });
});
