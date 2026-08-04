/**
 * Issue #2083 — RC_B (map badge area-scoping) + RC_C (navigation-counts
 * filters, incl. Buy/Rent) regression coverage. AC6/AC8/AC9/AC10.
 *
 * ── RC_B — the map badge previously read the legacy `selectedArea`
 * (always null under the canonical `node=` journey), so it silently fell
 * back to the city-wide total on an AREA node. Fixed via
 * `resolveEffectiveSelectedArea` (MapDiscovery.tsx) bridging the legacy
 * areaKey and the node-journey's `nodeAreaPoint`.
 *
 * ── RC_C — `useAreasNavigationJourney` was previously called with NO
 * `filters` at all (the hook's EMPTY_FILTERS default), so the navigation
 * counts endpoint was ALWAYS requested blended: Buy and Rent produced
 * byte-identical direction/area counts irrespective of real inventory.
 * Fixed by threading `nav.filters` (purpose + the full filter set) into the
 * hook.
 *
 * ── FIXTURE ──
 * Committed, additive seed (`navigation-hierarchy-fixture-seed.sql` +
 * `navigation-hierarchy-fixture-listings-seed.sql`, both from #1956 PR-5)
 * plus this issue's own rent variant
 * (`navigation-hierarchy-fixture-rent-listings-seed.sql`):
 *
 *   d:southeast (DIRECTION)
 *     -> a:...RR Nagar      1 sale + 2 rent   -> Buy 1 / Rent 2
 *     -> a:...Vijayanagar   1 sale + 0 rent   -> Buy 1 / Rent 0
 *     -> a:...Nagarbhavi    1 sale + 0 rent   -> Buy 1 / Rent 0  (AC9 empty-Rent case)
 *
 * Direction total: Buy 3 vs Rent 2 — genuinely different, never byte-identical.
 *
 * Counts are read live from `GET .../navigation/{node}/counts?purpose=...`
 * (the SAME endpoint the app itself calls, per this directory's established
 * "ground truth over hardcoded literal" convention — see
 * issue-1956-pr3-area-clustering.spec.ts's `fetchNodeCounts`) rather than
 * hardcoded, so a future re-seed cannot silently desync this spec from
 * reality; the *inequality* (Buy != Rent, RR Nagar rent > Nagarbhavi rent)
 * is what RC_C's fix actually guarantees, not one exact literal.
 *
 * Run (dev server + local-fixture backend, WITH the two seeds above applied):
 *   PLAYWRIGHT_BASE_URL=http://localhost:<port> npx playwright test \
 *     --project=full e2e/discover/issue-2083-nav-counts-purpose-badge.spec.ts
 */
import { test, expect, type Page } from '@playwright/test';

const CITY = 'bangalore';
const BASE = `city=${CITY}&journey=area-first`;
const API_BASE_URL = process.env.VITE_API_BASE_URL ?? 'http://localhost:8085';

const D_SE = 'd:southeast';
const AREA_RR_NAGAR = 'a:IN|KA|Bengaluru|RR Nagar';
const AREA_NAGARBHAVI = 'a:IN|KA|Bengaluru|Nagarbhavi';

function cardTestId(nodeKey: string): string {
  return `navigation-child-card-${nodeKey}`;
}

function nodeParam(page: Page): string | null {
  return new URL(page.url()).searchParams.get('node');
}

async function dismissConsentBannerIfPresent(page: Page): Promise<void> {
  const decline = page.getByRole('button', { name: /decline anonymous usage data collection/i });
  if (await decline.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await decline.click();
  }
}

interface NavigationCountsResponse {
  nodeKey: string;
  count: number;
  children: { nodeKey: string; count: number }[];
}

async function fetchNodeCounts(
  page: Page,
  nodeKey: string,
  purpose?: 'sale' | 'rent',
): Promise<NavigationCountsResponse> {
  const qs = purpose ? `?purpose=${purpose}` : '';
  const response = await page.request.get(
    `${API_BASE_URL}/api/discover/cities/${CITY}/navigation/${encodeURIComponent(nodeKey)}/counts${qs}`,
  );
  expect(response.ok(), `counts request for ${nodeKey} (purpose=${purpose ?? 'blended'}) must succeed`).toBe(
    true,
  );
  return response.json();
}

async function openRoot(page: Page) {
  await page.goto(`/discover?${BASE}`);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByTestId('navigation-level-panel')).toBeVisible({ timeout: 15_000 });
  await dismissConsentBannerIfPresent(page);
}

async function goToDirection(page: Page, nodeKey: string) {
  await page.getByTestId(cardTestId(nodeKey)).click();
  await expect.poll(() => nodeParam(page)).toBe(nodeKey);
}

async function switchToRent(page: Page) {
  const rentResponse = page.waitForResponse(
    (res) => res.url().includes('/navigation/') && res.url().includes('purpose=rent'),
    { timeout: 15_000 },
  );
  await page.getByTestId('control-bar-intent-selector').getByTestId('intent-selector-rent').click();
  await expect.poll(() => new URL(page.url()).searchParams.get('intent')).toBe('rent');
  await rentResponse;
}

test.describe('@integration-ui #2083 RC_C (AC6/AC8/AC10) — Buy vs Rent navigation counts genuinely differ', () => {
  test('ground truth: d:southeast Buy total != Rent total, and RR Nagar rent (2) > Nagarbhavi rent (0)', async ({
    page,
  }) => {
    await openRoot(page);

    const buyCounts = await fetchNodeCounts(page, D_SE, 'sale');
    const rentCounts = await fetchNodeCounts(page, D_SE, 'rent');
    expect(
      rentCounts.count,
      'RC_C ground truth: Rent total at d:southeast must differ from Buy total (pre-fix these were byte-identical)',
    ).not.toBe(buyCounts.count);

    const rrRent = rentCounts.children.find((c) => c.nodeKey === AREA_RR_NAGAR)?.count ?? 0;
    const nagarbhaviRent = rentCounts.children.find((c) => c.nodeKey === AREA_NAGARBHAVI)?.count ?? 0;
    expect(rrRent, 'RR Nagar must carry real rent inventory (fixture-seeded)').toBeGreaterThan(0);
    expect(nagarbhaviRent, 'Nagarbhavi must be the genuine zero-rent AREA (AC9 fixture)').toBe(0);
    expect(rrRent).toBeGreaterThan(nagarbhaviRent);
  });

  test('the LIVE UI direction heading count changes when switching Buy -> Rent, and matches the ground-truth endpoint', async ({
    page,
  }) => {
    await openRoot(page);
    await goToDirection(page, D_SE);

    const buyCounts = await fetchNodeCounts(page, D_SE, 'sale');
    const headingListings = page.getByTestId('navigation-level-heading-listings');
    await expect(headingListings).toBeVisible({ timeout: 10_000 });
    await expect(headingListings).toContainText(String(buyCounts.count));

    await switchToRent(page);

    const rentCounts = await fetchNodeCounts(page, D_SE, 'rent');
    await expect(headingListings).toContainText(String(rentCounts.count));
    // The two numbers really are different text — not the same literal
    // re-rendered because the request was silently ignored (the exact F7
    // failure mode: pre-fix this endpoint was called with no filters, so
    // this second assertion would have observed the SAME number twice).
    expect(rentCounts.count).not.toBe(buyCounts.count);
  });

  test('per-area rows disagree under Rent — RR Nagar keeps real listings, Nagarbhavi goes to "No listings yet"', async ({
    page,
  }) => {
    await openRoot(page);
    await goToDirection(page, D_SE);
    await switchToRent(page);

    const rrRow = page.getByTestId(`navigation-child-card-listings-${AREA_RR_NAGAR}`);
    const nagarbhaviRow = page.getByTestId(`navigation-child-card-listings-${AREA_NAGARBHAVI}`);
    await expect(rrRow).toBeVisible({ timeout: 10_000 });
    await expect(nagarbhaviRow).toBeVisible();

    await expect(rrRow).not.toHaveText('No listings yet');
    await expect(nagarbhaviRow).toHaveText('No listings yet');
  });
});

test.describe('@integration-ui #2083 RC_B (AC8/AC9) — map badge is area-scoped under the canonical node journey, never the city total', () => {
  test('at an AREA leaf, the badge reflects the AREA count, not the city-wide total', async ({ page }) => {
    await openRoot(page);

    const rootCountsBuy = await fetchNodeCounts(page, 'root', 'sale');
    await goToDirection(page, D_SE);
    await page.getByTestId(cardTestId(AREA_RR_NAGAR)).click();
    await expect.poll(() => nodeParam(page)).toBe(AREA_RR_NAGAR);

    const badge = page.getByTestId('discover-badge');
    await expect(badge).toBeVisible({ timeout: 12_000 });

    const areaCountsBuy = await fetchNodeCounts(page, AREA_RR_NAGAR, 'sale');
    // Positive: badge shows the AREA-scoped number.
    await expect(badge).toContainText(String(areaCountsBuy.count));
    // Negative — RC_B's exact regression signature: the badge must NOT show
    // the raw city total instead (guarded against the degenerate case where
    // they happen to coincide, which would make this assertion vacuous).
    if (rootCountsBuy.count !== areaCountsBuy.count) {
      await expect(badge).not.toContainText(String(rootCountsBuy.count));
    }
  });

  test('AC9 — an empty Rent AREA result shows a real zero-scoped state, never falls back to the city-wide total', async ({
    page,
  }) => {
    await openRoot(page);

    const rootCountsRent = await fetchNodeCounts(page, 'root', 'rent');
    expect(
      rootCountsRent.count,
      'precondition: the city must have SOME rent inventory elsewhere, so a fallback-to-city-total ' +
        'regression would be observable (a non-zero number leaking into a genuinely empty AREA badge)',
    ).toBeGreaterThan(0);

    await goToDirection(page, D_SE);
    await switchToRent(page);
    await page.getByTestId(cardTestId(AREA_NAGARBHAVI)).click();
    await expect.poll(() => nodeParam(page)).toBe(AREA_NAGARBHAVI);

    // Real result set is genuinely empty.
    await expect(page.getByTestId('listing-card')).toHaveCount(0, { timeout: 12_000 });

    const badge = page.getByTestId('discover-badge');
    // The badge must never silently show the nonzero city-wide rent total
    // in place of Nagarbhavi's real zero.
    await expect(badge).not.toContainText(String(rootCountsRent.count));
    // Issue #2083 (diagnose-then-fix cycle 3) — corrected, not relaxed: this
    // assertion originally required the badge to name "Nagarbhavi" in a
    // genuine zero-listing, no-filters state. That contradicts this
    // codebase's own established, deliberate zero-empty copy contract —
    // `formatDiscoverBadgeCopy`'s `state === 'zero-empty' && !hasActiveFilters`
    // branch (discoverBadge.ts) returns the fixed literal 'No listings here
    // yet' regardless of scopeLabel, "cause-based copy... replacing the old
    // intent-only wording" (see the identical, pre-existing unit-test
    // expectations in DiscoverRightPanel.test.tsx /
    // DiscoverRightPanel.routing.test.tsx). The badge and the right-panel
    // share this exact same copy formatter specifically so they can never
    // diverge — so an area-named zero-copy was never actually part of the
    // product's contract; the real, provable invariant (asserted above) is
    // that a genuinely empty area never inherits the nonzero city total.
    await expect(badge).toContainText('No listings here yet');
  });
});
