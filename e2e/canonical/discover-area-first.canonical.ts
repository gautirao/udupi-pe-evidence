/**
 * Discover area-first canonical specs — T4-T6 (issue #1713, PR-3).
 *
 * Fixture dependency (all Bangalore, one shared graph):
 *   scripts/db/fixtures/navigation-hierarchy-fixture-seed.sql (nav nodes)
 *   scripts/db/fixtures/navigation-active-revision-fixture-seed.sql (PROMOTED revision)
 *   scripts/db/fixtures/navigation-hierarchy-fixture-listings-seed.sql (9 LIVE [E2E] listings
 *     across the seeded AREA leaves — the residential data this file's T6 asserts on)
 * See e2e/canonical/README.md's "Required seed sequence" for the full ordered list and the
 * mandatory backend restart after seeding (the navigation graph is cached at startup).
 *
 * PLAN CORRECTIONS THIS FILE REFLECTS (see .claude/handoffs/issue-1713/team-lead-plan.toml):
 *   c1 — session-restored wait is waitForResponse+resp.ok() on the real navigation/resolve
 *        request, never a header-control visibility check or networkidle.
 *   c2 — fixture city is BANGALORE (not Udupi) — the only city with a promoted hierarchy AND
 *        (via #1713 PR-3's own new seed) schools/agri data lined up with it.
 *   c4/c5 — T5's assertion is rewritten off real source: MapStatsBar never renders a bare count,
 *        and the real unconditional count surface (JourneySwitcher's `journey-metadata-strip`) is
 *        gated `!isCompact`, which is TRUE only at the area-first city root — so T5 (a Direction
 *        node, non-root) asserts the strip's ABSENCE as a positive density-switch proof, and real
 *        child AREA names instead of a count string that cannot render there.
 *   r5 — Discover URLs are never byte-compared; only param presence/absence and journey-defining
 *        values (city/node) are asserted, since lat/lon/zoom are appended asynchronously by the
 *        camera-sync effect and their last decimal is not stable between renders.
 */
import { test, expect } from './support/canonical-test';
import { hasRealCredentials } from '../helpers';

const userEmail = process.env.SMOKE_USER_EMAIL ?? '';
const userPassword = process.env.SMOKE_USER_PASSWORD ?? '';

function assertNoCredentialsGuard(tag: string) {
  if (!hasRealCredentials(userEmail, userPassword)) {
    throw new Error(`[${tag}] SMOKE_USER_EMAIL/PASSWORD absent — this test should not have run.`);
  }
}

function waitForResolve(page: import('./support/canonical-test').Page, expectedNode: string) {
  return page.waitForResponse(
    (resp) => {
      if (!resp.url().includes('/navigation/resolve')) return false;
      if (resp.request().method() !== 'GET') return false;
      const u = new URL(resp.url());
      return u.searchParams.get('node') === expectedNode;
    },
    { timeout: 15_000 },
  );
}

// ─────────────────────────────────────────────────────────────────────────
// T4 — bare city URL settles to the area-first city root, real hierarchy.
// ─────────────────────────────────────────────────────────────────────────

test('[role:user] T4 — bare city URL settles to the area-first city root against a real resolved hierarchy', async ({ page }) => {
  assertNoCredentialsGuard('T4');

  // Flake defence (c1): arm the wait BEFORE navigating. The exact template is
  // `/api/discover/cities/${city}/navigation/resolve?node=${ROOT_NODE_KEY}` (area.ts:202) —
  // ROOT_NODE_KEY is the literal string 'root', live-verified via
  // `GET /api/discover/cities/bangalore/navigation/resolve?node=root` against this fixture.
  const resolvePromise = waitForResolve(page, 'root');
  await page.goto('/discover?city=bangalore');
  const resolveResponse = await resolvePromise;
  // This response 2xx is ALSO the session-restore proof per c1 — a pre-session request racing
  // ahead of Supabase auth restoration would 401 here, not silently succeed.
  expect(resolveResponse.ok(), 'root navigation/resolve must respond 2xx').toBe(true);

  // Area-first shell mounted (AreaFirstJourneyPanel.tsx:115, via DiscoverJourneyPanelShell).
  await expect(page.getByTestId('discover-areas-journey-panel-shell')).toBeVisible({ timeout: 10_000 });

  // Real fixture Direction labels — navigation-hierarchy-fixture-seed.sql.
  await expect(page.getByText('South-East Bangalore', { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('North-East Bangalore', { exact: true })).toBeVisible({ timeout: 10_000 });

  // Counts RESOLVED, not stuck loading (per c5 — JourneySwitcher.tsx:200-203 never coerces a null
  // count to 0, so a real digit here proves both fetches actually settled).
  const metadataStrip = page.getByTestId('journey-metadata-strip');
  await expect(metadataStrip).toBeVisible({ timeout: 10_000 });
  await expect(metadataStrip).toHaveText(/\d+\s*areas?/i);
  await expect(metadataStrip).toHaveText(/\d+\s*propert(y|ies)/i);
  await expect(metadataStrip).not.toContainText('Loading areas');
  await expect(metadataStrip).not.toContainText('Loading properties');

  // ABSENCE proof (c5/r5): Bangalore HAS a promoted hierarchy, so the #2088 root probe
  // (area.ts:225-245) must never CONFIRM hierarchy-unavailable and must never write scope=''.
  // A regression here would silently strand the panel on the legacy landing.
  const settledUrl = new URL(page.url());
  expect(settledUrl.searchParams.has('scope'), 'a healthy Bangalore hierarchy must never write scope=').toBe(false);
});

// ─────────────────────────────────────────────────────────────────────────
// T5 — selecting a Direction node writes canonical node= and renders real children.
// ─────────────────────────────────────────────────────────────────────────

test('[role:user] T5 — a Direction node writes canonical node= and renders its real AREA children', async ({ page }) => {
  assertNoCredentialsGuard('T5');

  const resolvePromise = waitForResolve(page, 'd:southeast');
  await page.goto('/discover?city=bangalore&node=' + encodeURIComponent('d:southeast'));
  const resolveResponse = await resolvePromise;
  expect(resolveResponse.ok(), 'd:southeast navigation/resolve must respond 2xx').toBe(true);

  // Canonical node= carried on the settled URL (r5 — only the journey-defining param, never a
  // byte compare of the whole URL, since lat/lon/zoom are async camera-sync enrichment).
  await expect(page).toHaveURL(/[?&]node=d(%3A|:)southeast/, { timeout: 10_000 });
  expect(new URL(page.url()).searchParams.get('node')).toBe('d:southeast');

  // Still the area-first shell — not stranded on the city root, not fallen through to legacy.
  await expect(page.getByTestId('discover-areas-journey-panel-shell')).toBeVisible({ timeout: 10_000 });

  // Real child AREA names for d:southeast (navigation-hierarchy-fixture-seed.sql).
  await expect(page.getByText('RR Nagar', { exact: true }).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Vijayanagar', { exact: true }).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Nagarbhavi', { exact: true }).first()).toBeVisible({ timeout: 10_000 });

  // DENSITY/ABSENCE proof (c4/c5): the metadata strip is root-only
  // (JourneySwitcher.tsx:562, `{!isCompact && (...)}`, density = AreaFirstJourneyPanel.tsx:121
  // `compact={!isAreaFirstCityRoot}`). Its ABSENCE here is the positive proof that the panel
  // correctly switched to compact for a deeper node rather than staying stranded at city-root
  // density — the pre-#2213 class of bug this replaces the impossible count-band assertion with.
  await expect(page.getByTestId('journey-metadata-strip')).toHaveCount(0);
});

// ─────────────────────────────────────────────────────────────────────────
// T6 — bounded browse: PAIRED positive + negative (absence-discipline core).
// ─────────────────────────────────────────────────────────────────────────

test('[role:user] T6 — bounded node browse shows the node\'s own listing and excludes a listing from a different Direction', async ({ page }) => {
  assertNoCredentialsGuard('T6');

  // RR Nagar (d:southeast leaf) — 2 LIVE fixture listings
  // (navigation-hierarchy-fixture-listings-seed.sql, ids f1956005-...0001/0009).
  const rrNagarNodeKey = 'a:IN|KA|Bengaluru|RR Nagar';
  const positiveTitle = '[E2E] RR Nagar Fixture Apartment';
  // Genuinely exists in the fixture, but under a DIFFERENT Direction (d:northeast) —
  // navigation-hierarchy-fixture-listings-seed.sql, id f1956005-...0004. A vacuous "absent
  // title" check (one that doesn't exist anywhere) would pass against an empty panel too; this
  // one only passes if the panel correctly SCOPED to RR Nagar rather than showing everything.
  const negativeTitleFromOtherDirection = '[E2E] Hoskote Fixture House';

  const listingsPromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/discover/listings') && resp.request().method() === 'GET',
    { timeout: 15_000 },
  );
  await page.goto(
    '/discover?city=bangalore&node=' + encodeURIComponent(rrNagarNodeKey) + '&nodeListings=1',
  );
  const listingsResponse = await listingsPromise;
  // 2xx here is the session-restore proof (c1) — this is the authenticated
  // /api/discover/listings endpoint (JwtConfig permitAll exclusion list), so a pre-session
  // request racing ahead of Supabase auth restoration would 401 here.
  expect(listingsResponse.ok(), 'node-scoped /api/discover/listings must respond 2xx').toBe(true);

  // Live-verified (this test run): navigating directly to a resolved AREA LEAF node auto-renders
  // AreaSelectedPanel (nodeAreaPoint bridge, useDiscoverNavigationController.ts's
  // isNodeAreaLeafActive) — `nodeListings=1` is not required for a leaf. The container has no
  // single root testid; 'area-result-summary-text' (AreaSelectedPanel.tsx) is the real,
  // node-scoped result-count line ("2 verified properties for sale in RR Nagar" — live-verified
  // text) and is used here as the scoping anchor for the paired assertion below.
  const resultSummary = page.getByTestId('area-result-summary-text');
  await expect(resultSummary).toBeVisible({ timeout: 10_000 });
  await expect(resultSummary).toContainText('RR Nagar');

  // GUARD: the panel is non-empty overall, so the negative assertion below can never pass
  // against a blank render.
  await expect(page.getByRole('heading', { name: positiveTitle, exact: true })).toBeVisible({ timeout: 10_000 });

  // NEGATIVE: a real, differently-scoped fixture listing must not leak into this node's browse.
  await expect(page.getByRole('heading', { name: negativeTitleFromOtherDirection, exact: true })).toHaveCount(0);
});
