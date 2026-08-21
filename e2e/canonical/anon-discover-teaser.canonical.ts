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
