/**
 * Anon Discover teaser — T10 (issue #1713, PR-2).
 *
 * Per this issue's plan, T10 is "the most vacuously-passable spec in the
 * suite": /api/discover/listings and /api/discover/markers are AUTH-ONLY and
 * render an EMPTY UI for an anonymous caller rather than erroring (see
 * support/canonical-test.ts's module docstring and the harness smoke spec's
 * own citation of this trap). A generic "results container exists" assertion
 * would therefore pass just as happily against a broken/CORS-blocked app as
 * against a working one. Every assertion below is real, specific fixture
 * content or a real, specific anon-vs-authed contract detail — never a
 * generic presence check.
 *
 * SURFACE CHOSEN: useDiscoverCityListings (src/hooks/useDiscoverCityListings.ts) —
 * confirmed from source (not /api/discover/*) to be the genuinely anon-safe
 * "public city listings" path: its own docstring states client freshness
 * "mirrors the endpoint's Cache-Control: max-age=60, public", and its
 * DiscoverCityListingItem type documents an explicit auth-branched price
 * contract (priceBand for anonymous callers, pricePaise only when
 * isAuthenticated) — i.e. this is the real "teaser, not wall" path, not the
 * auth-only surface. AreaSelectedPanel.tsx (src/components/discover/panels/)
 * renders this data via its `area-result-summary`/`area-result-summary-text`
 * testids, which is what this spec asserts on.
 *
 * FIXTURE: RETARGETED at BANGALORE (fix cycle 3). Udupi has ZERO
 * navigation_nodes and no PROMOTED city_launch_revision in this fixture (see
 * scripts/db/fixtures/navigation-active-revision-fixture-seed.sql's header —
 * it deliberately does not seed Udupi), so a node= deep-link into Udupi can
 * never resolve. Bangalore's 'a:IN|KA|Bengaluru|RR Nagar' AREA leaf (depth 1,
 * under d:southeast — scripts/db/fixtures/navigation-hierarchy-fixture-seed.sql)
 * has exactly 2 real [E2E] LIVE listings (navigation-hierarchy-fixture-
 * listings-seed.sql: ids ...0001 apartment, ...0009 house), both
 * price_paise > 0, area_key 'IN|KA|Bengaluru|RR Nagar'.
 *
 * EMPIRICALLY LIVE-VERIFIED (fix cycle 3): both fixture seeds loaded into the
 * shared pg-test-fixture container, a fresh backend started against it (so
 * NavigationCachePreloadRunner picked up the seeded hierarchy — confirmed in
 * its own startup log: "preloaded citySlug=bangalore revisionId=1
 * nodeCount=13"). Direct curl against the running backend confirms the real
 * response shape this spec asserts on:
 *   GET /api/discover/cities/bangalore/listings?areaKeys=IN%7CKA%7CBengaluru%7CRR%20Nagar
 *   -> {"areas":[{"areaKey":"IN|KA|Bengaluru|RR Nagar","areaName":"RR Nagar",
 *       "listings":[{"priceBand":"₹0–25L",...},{"priceBand":"₹0–25L",...}]}]}
 * — 2 listings, both anon priceBand (never pricePaise), areaName "RR Nagar".
 * This spec's own assertions (below) were run against the live app on top of
 * this exact fixture state, not just derived from source reading.
 */

import { test, expect } from './support/canonical-test';

const CITY = 'bangalore';
const RR_NAGAR_AREA_KEY = 'IN|KA|Bengaluru|RR Nagar';
const RR_NAGAR_NODE = `a:${RR_NAGAR_AREA_KEY}`;

test.describe('T10 — anon Discover teaser', () => {
  test('anon RR Nagar area view shows real teaser content, not an empty/wall state', async ({ page }) => {
    await page.goto(`/discover?city=${CITY}&node=${encodeURIComponent(RR_NAGAR_NODE)}`);
    await page.waitForLoadState('domcontentloaded');

    // Must not be a sign-in wall — Discover is a genuinely public route
    // (src/lib/routeAccess.ts:7).
    await expect(page).not.toHaveURL(/\/auth/, { timeout: 10_000 });

    // Genuinely anonymous session, not an accidentally-authenticated one
    // that would leak real prices/contact data and make every assertion
    // below pass for the wrong reason. RoleAwareHeader's anon-only "Sign in"
    // link only renders when `!user` (src/components/layout/AppLayout.tsx:445-455).
    await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible({ timeout: 10_000 });

    // POSITIVE presence of the real listings branch, not the empty-state
    // branch — AreaSelectedPanel.tsx:566-580 renders `area-empty-state`
    // INSTEAD OF `area-result-summary` when there is nothing to show; these
    // two testids are mutually exclusive by construction.
    await expect(page.getByTestId('area-empty-state')).toHaveCount(0, { timeout: 15_000 });
    const summaryText = page.getByTestId('area-result-summary-text');
    await expect(summaryText).toBeVisible({ timeout: 15_000 });

    // Real fixture area name AND the honest "verified" framing
    // (AreaSelectedPanel.tsx:589-590's own template literal:
    // "{count} verified {property|properties} for {intent} in {areaLabel}").
    await expect(summaryText).toContainText('RR Nagar');
    await expect(summaryText).toContainText('verified');

    // At least one real teaser price band renders in the results grid —
    // anon callers receive DiscoverCityListingItem.priceBand (e.g. "₹0–25L"),
    // never pricePaise. This could not render against an empty/broken page
    // (no grid items -> no price text at all).
    await expect(page.locator('text=/₹[\\d,]/').first()).toBeVisible({ timeout: 15_000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// T10b — #2860: anonymous legacy deep links (legacy e2e/discover/issue-1956-pr6-no-blank-panel.spec.ts and the
// anon half of e2e/issue-1065-final.spec.ts). Each arm loads one legacy URL shape anonymously and proves it renders
// exactly ONE non-blank primary surface, is not gated, and (via the auto consoleGuard fixture) raises no pageerror,
// console.error or undocumented 4xx/5xx. Map: docs/testing/e2e-retirement-map-2860.md.
//
// NOTE: the module docstring above ("Udupi has ZERO navigation_nodes") predates #2581; the canonical restore chain
// now seeds a PROMOTED Udupi revision with Manipal/Brahmavar/Kaup nodes (area-trends-2581-udupi-navigation-seed.sql),
// which is what arm C relies on.
// ─────────────────────────────────────────────────────────────────────────

const PRIMARY_SURFACE_TESTIDS = [
  'area-group-focus-panel',
  'discover-areas-journey-panel-shell',
  'discover-schools-journey-panel-shell',
  'discover-right-panel',
] as const;

function primarySurfaceTotal(page: import('./support/canonical-test').Page): Promise<number> {
  return Promise.all(PRIMARY_SURFACE_TESTIDS.map((id) => page.getByTestId(id).count())).then((cs) =>
    cs.reduce((a, b) => a + b, 0),
  );
}

async function expectOneSurfaceMounted(page: import('./support/canonical-test').Page) {
  // Neutral settle: SOME primary surface has mounted (whichever branch), and exactly one. Placed before the
  // branch-specific assertions so a mis-routed branch fails on the branch line, not on a render race.
  await expect
    .poll(() => primarySurfaceTotal(page), { timeout: 15_000, message: 'exactly one primary right-panel surface must mount' })
    .toBe(1);
}

async function expectExactlyOneSurfaceAfterSettle(page: import('./support/canonical-test').Page) {
  // SETTLED recount, run AFTER the branch-specific content assertions: re-counts all four mutually exclusive
  // surfaces and requires the total to be exactly 1 on 5 CONSECUTIVE samples 500 ms apart (a >= 2 s window). Any
  // sample != 1 resets the run, so a second surface that mounts after the content settled keeps the run below 5 and
  // fails this poll at its timeout. (The first-match poll above stops at the first sample == 1 and cannot see it.)
  let consecutiveOnes = 0;
  let lastTotal = -1;
  await expect
    .poll(
      async () => {
        lastTotal = await primarySurfaceTotal(page);
        consecutiveOnes = lastTotal === 1 ? consecutiveOnes + 1 : 0;
        return consecutiveOnes;
      },
      {
        timeout: 10_000,
        intervals: [500],
        message: 'after content settled, exactly one primary surface must STAY mounted (5 consecutive samples == 1)',
      },
    )
    .toBeGreaterThanOrEqual(5);
  expect(lastTotal, 'settled primary-surface total').toBe(1);
}

test.describe('T10b — anon legacy Discover deep links render exactly one non-blank, ungated surface', () => {
  test('arm A — journey-less unknown groupId falls back to the area-first root, not a blank panel', async ({ page }) => {
    await page.goto(`/discover?city=${CITY}&groupId=no-such-group-2860`);
    await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible({ timeout: 10_000 });
    await expectOneSurfaceMounted(page);
    // SUPERSEDED legacy placeholder (D2): an unresolved groupId no longer reaches the legacy AreaSelectionPanel; it
    // virtual-defaults to area-first (area.ts) and mounts the canonical areas shell.
    await expect(page.getByTestId('discover-right-panel')).toHaveCount(0);
    await expect(page.getByTestId('area-group-focus-panel')).toHaveCount(0);
    await expect(page.getByTestId('discover-schools-journey-panel-shell')).toHaveCount(0);
    await expect(page.getByTestId('discover-areas-journey-panel-shell')).toBeVisible({ timeout: 10_000 });
    // 1956-01r: non-blank — a real fixture Direction label renders inside it.
    await expect(page.getByText('South-East Bangalore', { exact: true })).toBeVisible({ timeout: 15_000 });
    // 1956-01r exclusivity, re-proven after the content settled.
    await expectExactlyOneSurfaceAfterSettle(page);
    await expect(page.getByTestId('discover-areas-journey-panel-shell')).toBeVisible();
  });

  test('arm B — explicit journey=area-first with no areaKey mounts the canonical root, never the legacy panel', async ({ page }) => {
    await page.goto(`/discover?city=${CITY}&journey=area-first`);
    await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible({ timeout: 10_000 });
    await expectOneSurfaceMounted(page);
    // 1956-06 (asserted first after the neutral settle).
    await expect(page.getByTestId('discover-right-panel')).toHaveCount(0);
    // 1956-07, 1956-08.
    await expect(page.getByTestId('discover-areas-journey-panel-shell')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('South-East Bangalore', { exact: true })).toBeVisible({ timeout: 15_000 });
    // 1956-06 exclusivity, re-proven after the content settled.
    await expectExactlyOneSurfaceAfterSettle(page);
    await expect(page.getByTestId('discover-areas-journey-panel-shell')).toBeVisible();
  });

  test('arm C — anon Udupi areaKey= deep link is not gated and renders the area surface', async ({ page }) => {
    const params = new URLSearchParams({ city: 'udupi', zoom: '14', areaKey: 'IN|KA|Udupi|Manipal' });
    await page.goto(`/discover?${params.toString()}`);
    // 1065-05r: genuinely anonymous AND still on /discover (not redirected to /auth).
    await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page, 'an anon areaKey= deep link must stay on /discover').toHaveURL((u) => u.pathname === '/discover', { timeout: 10_000 });
    await expect(page).not.toHaveURL(/\/auth/);
    // 1065-06: exactly one primary surface, the canonical areas shell (journey virtual-defaults to area-first
    // because Udupi now resolves a hierarchy).
    await expectOneSurfaceMounted(page);
    const udupiShell = page.getByTestId('discover-areas-journey-panel-shell');
    await expect(udupiShell).toBeVisible({ timeout: 10_000 });
    // 1065-06 non-blank: seeded Udupi navigation content renders INSIDE the shell. The only Udupi hierarchy is the
    // #2581 navigation seed (area-trends-2581-udupi-navigation-seed.sql: 'Manipal Direction' > 'Manipal'), so a
    // blank shell, or a shell showing another city's hierarchy, fails here. Substring 'Manipal' covers both the city
    // root (the 'Manipal Direction' card) and an exact areaKey resolve to the 'Manipal' leaf.
    await expect(udupiShell, 'the Udupi areas shell renders seeded Manipal navigation content').toContainText('Manipal', {
      timeout: 15_000,
    });
    // 1065-06 exclusivity, re-proven after the content settled.
    await expectExactlyOneSurfaceAfterSettle(page);
    await expect(udupiShell).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in', exact: true }), 'still anonymous after the page settles').toBeVisible();
  });
});
