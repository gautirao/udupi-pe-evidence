/**
 * Issue #2189 — Discover panel fires malformed
 * GET /api/discover/cities//listings (empty city segment, 401) when
 * areaKeys resolve before `city` does.
 *
 * PR #2197 review (id PRR_kwDOQ-NjDM8AAAABJ4eLZg, head f23daa2) required
 * committed, CI-visible real-browser/network evidence rather than a prose
 * PR comment — the fix (`enabled: areaKeys.length > 0 && Boolean(city)` in
 * useDiscoverCityListings.ts) is unit-tested, but #2189's acceptance
 * contract explicitly requires final-head browser/network proof:
 *   - zero /api/discover/cities//listings calls
 *   - the expected /api/discover/cities/{city}/listings call
 *   - panel results remain correct
 *   - no new console/runtime error attributable to this change
 *
 * Run:
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 BACKEND_BASE_URL=http://localhost:8100 \
 *     npx playwright test e2e/discover-city-listings-empty-city-guard-2189.spec.ts --project=full
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

test.describe('#2189 Discover city listings — empty-city query guard evidence', () => {
  test('a direct/cold canonical AREA load never fires the malformed cities//listings request, and the correctly-formed request succeeds', async ({
    page,
  }) => {
    const requestedUrls: string[] = [];
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('/api/discover/cities')) {
        requestedUrls.push(url);
      }
    });

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    await page.goto(AREA_URL);
    await page.waitForLoadState('domcontentloaded');
    await dismissConsentBannerIfPresent(page);

    // Real backend, real listings — matches the representative production URL.
    await page.waitForSelector('[data-testid="listing-card"]', { timeout: 20_000 });
    const cardCount = await page.locator('[data-testid="listing-card"]').count();
    expect(cardCount, 'fixture sanity: JP Nagar must have at least 1 real listing to prove this meaningfully').toBeGreaterThanOrEqual(1);

    // Let any late/racing requests (e.g. a refetch on window focus) settle.
    await page.waitForTimeout(1_000);

    const malformed = requestedUrls.filter((u) => u.includes('/api/discover/cities//listings'));
    expect(malformed, `no request may ever hit the malformed empty-city path; saw: ${JSON.stringify(requestedUrls)}`).toEqual([]);

    const wellFormed = requestedUrls.filter((u) => /\/api\/discover\/cities\/[^/]+\/listings/.test(u) && !u.includes('/cities//listings'));
    expect(wellFormed.length, `exactly the correctly-formed city-scoped request must have fired; saw: ${JSON.stringify(requestedUrls)}`).toBeGreaterThanOrEqual(1);
    expect(wellFormed[0]).toContain('/api/discover/cities/bangalore/listings');

    const attributableErrors = consoleErrors.filter((e) => /discover.*cities|useDiscoverCityListings/i.test(e));
    expect(attributableErrors, `no new console/runtime error attributable to the city-listings guard; saw: ${JSON.stringify(consoleErrors)}`).toEqual([]);
  });

  test('City -> Direction -> Cluster -> AREA in-app navigation never fires the malformed cities//listings request', async ({ page }) => {
    // Real in-app guided navigation (no second page.goto) through the
    // canonical node hierarchy, per PR #2197 review (id
    // PRR_kwDOQ-NjDM8AAAABJ4mFxw, head 1b00204c): a second `page.goto` is a
    // new document navigation and does not exercise the router-driven
    // transition where areaKeys and city can resolve on different renders —
    // the exact #2189 defect shape. This uses real `.click()`s on the
    // canonical `navigation-child-card-${nodeKey}` controls (same idiom as
    // e2e/discover/issue-1956-pr2-atomic-transition.spec.ts and
    // e2e/discover/issue-2083-nav-counts-purpose-badge.spec.ts's
    // goToDirection), against the real backend (no page.route stubs), on a
    // node chain already confirmed live against this same seeded Bangalore
    // fixture by e2e/discover-schools-canonical-2124.spec.ts and
    // e2e/discover/issue-1823-camera-fit-policy.spec.ts (the underlying
    // canonical hierarchy/nodeKeys are journey-agnostic — only which panel
    // component renders differs between journey=area-first and school-first).
    const D_CENTRAL = 'd:central';
    const C_CENTRAL = 'c:central:in-ka-bengaluru-btm-layout-in-ka-bengaluru-koramangala';
    const AREA_KORAMANGALA = 'a:IN|KA|Bengaluru|Koramangala';
    const cardTestId = (nodeKey: string) => `navigation-child-card-${nodeKey}`;
    const nodeParam = () => new URL(page.url()).searchParams.get('node');

    const requestedUrls: string[] = [];
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('/api/discover/cities')) {
        requestedUrls.push(url);
      }
    });

    // Single page.goto: the bare city root under the canonical area-first
    // journey. areaKeys is empty here, so the listings query must stay
    // disabled regardless of city readiness (existing guard leg).
    await page.goto('/discover?city=bangalore&journey=area-first');
    await page.waitForLoadState('domcontentloaded');
    await dismissConsentBannerIfPresent(page);
    await expect(page.getByTestId('navigation-level-panel')).toBeVisible({ timeout: 15_000 });

    // City -> Direction (real click, real router transition).
    const directionCard = page.getByTestId(cardTestId(D_CENTRAL));
    await expect(directionCard, 'Central Bangalore direction card must render at the area-first root').toBeVisible({ timeout: 15_000 });
    await directionCard.click();
    await expect.poll(nodeParam, { timeout: 8_000 }).toBe(D_CENTRAL);

    // Direction -> Cluster (real click).
    const clusterCard = page.getByTestId(cardTestId(C_CENTRAL));
    await expect(clusterCard).toBeVisible({ timeout: 15_000 });
    await clusterCard.click();
    await expect.poll(nodeParam, { timeout: 8_000 }).toBe(C_CENTRAL);

    // Cluster -> AREA leaf (real click) — this is the render where areaKeys
    // resolves for the new node while `city` is already a settled prop from
    // the URL, i.e. the exact in-session transition #2189 and the reviewer
    // asked to be covered by a genuine router transition, not a reload.
    const areaCard = page.getByTestId(cardTestId(AREA_KORAMANGALA));
    await expect(areaCard).toBeVisible({ timeout: 15_000 });
    await areaCard.click();
    await expect.poll(nodeParam, { timeout: 8_000 }).toBe(AREA_KORAMANGALA);

    await expect(page.getByTestId('discover-areas-journey-panel-shell')).toBeVisible({ timeout: 15_000 });
    await page.waitForSelector('[data-testid="listing-card"]', { timeout: 20_000 });

    // Let any late/racing requests (e.g. a refetch on window focus) settle.
    await page.waitForTimeout(1_000);

    const malformed = requestedUrls.filter((u) => u.includes('/api/discover/cities//listings'));
    expect(malformed, `no request may ever hit the malformed empty-city path during in-app navigation; saw: ${JSON.stringify(requestedUrls)}`).toEqual([]);

    const wellFormed = requestedUrls.filter((u) => /\/api\/discover\/cities\/[^/]+\/listings/.test(u) && !u.includes('/cities//listings'));
    expect(wellFormed.length, `exactly the correctly-formed city-scoped request must have fired; saw: ${JSON.stringify(requestedUrls)}`).toBeGreaterThanOrEqual(1);
    expect(wellFormed[0]).toContain('/api/discover/cities/bangalore/listings');
  });
});
