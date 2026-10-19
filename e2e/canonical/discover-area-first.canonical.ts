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

// ─────────────────────────────────────────────────────────────────────────
// T24 — Back from listing detail restores the area-first leaf (issue #2750 CANON b).
// ─────────────────────────────────────────────────────────────────────────

test('[role:user] T24 — Back from a listing detail restores the area-first leaf: Rent cards, pressed Rent control, summary and breadcrumb', async ({ page }) => {
  assertNoCredentialsGuard('T24');

  // RR Nagar leaf carries BOTH sale and rent inventory (same fixture as T6/T23).
  const rrNagarNodeKey = 'a:IN|KA|Bengaluru|RR Nagar';
  const buyOnlyTitle = '[E2E] RR Nagar Fixture Apartment';
  const rentTitles = ['[E2E] RR Nagar Fixture Rent Apartment A', '[E2E] RR Nagar Fixture Rent House B'];
  const cardTitles = () =>
    page.getByTestId('listing-card').locator('h3').allInnerTexts().then((ts) => ts.map((t) => t.trim()).sort());
  const rentButton = page.getByTestId('control-bar-intent-selector').getByTestId('intent-selector-rent');
  const summary = page.getByTestId('area-result-summary-text');
  const breadcrumbRrNagar = page.locator('[data-testid^="breadcrumb-seg-"]').filter({ hasText: 'RR Nagar' });
  const cardFor = (title: string) => page.getByTestId('listing-card').filter({ hasText: title });

  // 1. Buy leaf (default).
  await page.goto('/discover?city=bangalore&node=' + encodeURIComponent(rrNagarNodeKey) + '&nodeListings=1');
  await expect(summary).toContainText('RR Nagar', { timeout: 15_000 });
  await expect(cardFor(buyOnlyTitle).first(), 'POSITIVE CONTROL: the Buy-only listing is shown under Buy').toBeVisible({ timeout: 15_000 });
  const titleSetBuy = await cardTitles();
  expect(titleSetBuy.length, 'Buy leaf must render cards').toBeGreaterThan(0);
  expect(titleSetBuy).toContain(buyOnlyTitle);

  // 2. Rent (non-default leaving state); assert the state really changed.
  await rentButton.click();
  await expect.poll(() => new URL(page.url()).searchParams.get('intent'), { timeout: 10_000 }).toBe('rent');
  await expect(rentButton).toHaveAttribute('aria-pressed', 'true');
  await expect(summary).toContainText(/rent/i, { timeout: 15_000 });
  for (const t of rentTitles) await expect(cardFor(t).first(), `Rent renders ${t}`).toBeVisible({ timeout: 15_000 });
  await expect(cardFor(buyOnlyTitle), 'the Buy-only listing must be gone under Rent').toHaveCount(0);
  const titleSetRent = await cardTitles();
  expect(titleSetRent, 'the Rent title set must differ from the Buy title set').not.toEqual(titleSetBuy);
  const before = new URL(page.url()).searchParams;
  const beforeParams = { city: before.get('city'), node: before.get('node'), intent: before.get('intent') };
  expect(beforeParams).toEqual({ city: 'bangalore', node: rrNagarNodeKey, intent: 'rent' });

  // 3. Open a Rent card -> listing detail (PUSH navigation).
  await cardFor(rentTitles[0]).first().click();
  await page.waitForURL(/\/listing\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(rentTitles[0], { timeout: 15_000 });
  const clickedListingId = new URL(page.url()).pathname.split('/').pop() ?? '';
  expect(clickedListingId, 'the opened listing id is read from the detail URL').toMatch(/^[0-9a-f-]{36}$/);

  // 4. Back.
  await page.goBack();
  await page.waitForURL(/\/discover\?/, { timeout: 15_000 });

  // 4b. The Back TARGET is the Discover history entry the card click left behind (#2750 B1
  // diagnosis, evidence/b1-diagnosis.txt): a card click first PUSHES a selection entry
  // (`&listing=<id>`) and then the detail route. If the Discover -> /listing navigation REPLACED
  // that entry (navigate(..., { replace: true })), Back would land one entry earlier, on a URL
  // WITHOUT the selection. Rent, node and the rendered cards survive that (they are re-derived
  // from the URL either way), so only the selection on the Back target discriminates.
  await expect
    .poll(() => new URL(page.url()).searchParams.get('listing'), {
      timeout: 15_000,
      message: 'Back must land on the Discover entry that carries the clicked card selection (listing=<id>)',
    })
    .toBe(clickedListingId);
  await expect(
    cardFor(rentTitles[0]).first(),
    'the clicked card is rendered as the selected card after Back',
  ).toHaveAttribute('data-selected', 'true', { timeout: 15_000 });

  // 5. The RENDERED leaf is restored, not just the URL.
  await expect(summary).toContainText('RR Nagar', { timeout: 15_000 });
  await expect(summary).toContainText(/rent/i);
  await expect(rentButton, 'the Rent control must still be pressed after Back').toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
  for (const t of rentTitles) await expect(cardFor(t).first(), `after Back ${t} is rendered`).toBeVisible({ timeout: 15_000 });
  await expect(cardFor(buyOnlyTitle), 'the Buy-only listing must NOT reappear after Back').toHaveCount(0);
  await expect
    .poll(cardTitles, { timeout: 15_000, message: 'rendered card h3 set after Back must equal the pre-navigation Rent set' })
    .toEqual(titleSetRent);
  await expect(breadcrumbRrNagar.first(), 'breadcrumb shows RR Nagar after Back').toBeVisible({ timeout: 10_000 });
  const after = new URL(page.url()).searchParams;
  expect(
    { city: after.get('city'), node: after.get('node'), intent: after.get('intent') },
    'journey-defining params are unchanged (param-wise, never byte-wise)',
  ).toEqual(beforeParams);
});

// ─────────────────────────────────────────────────────────────────────────
// T25 — #2860: a legacy area-first areaKey= deep link (Udupi / Manipal) — legacy e2e/issue-1065-final.spec.ts
// test 1. Fixture: discover-smoke-seed.sql's 4 LIVE [E2E] Manipal sale listings (area_key 'IN|KA|Udupi|Manipal')
// + the promoted Udupi revision (area-trends-2581-udupi-navigation-seed.sql).
//
// OBSERVED ON THE #2860 DEV RUN (37a019cf, screenshot + aria snapshot in the handoff evidence): the panel mounts the
// canonical areas shell at the Udupi CITY ROOT ("Where do you want to explore?", Direction cards), while the map is
// in the area-first selected-area state for Manipal (status pill "4 verified properties in Manipal"); the map draws
// the Direction area markers, and NO listing markers (property-marker) and NO listing cards render. The legacy
// oracles "listing cards > 0" and "listing markers > 0" are therefore NOT asserted here: they are recorded as
// RETAIN (product question, decision D8) in docs/testing/e2e-retirement-map-2860.md rather than weakened or
// re-pointed.
//
// MARKERS ARE NOT ASSERTED (fix cycle 2, row 1065-03 RETAIN under decision D9): the /api/discover/markers fetch is
// gated on the LIVE map zoom (> 12, useDiscoverMapDataController markersEnabled), and this zoom=14 deep link does not
// hold that zoom deterministically - on DEV RUN 2 and mutation run M5 the camera settled at the Udupi overview and
// the markers request was never sent. Neither the markers response nor the .leaflet-marker-icon count is asserted.
// This test asserts only: one areas shell, and the Manipal area listings resolved for the areaKey (status-pill
// count >= 4); the auto console guard covers 1065-04.
// ─────────────────────────────────────────────────────────────────────────

const T25_SURFACE_TESTIDS = [
  'area-group-focus-panel',
  'discover-areas-journey-panel-shell',
  'discover-schools-journey-panel-shell',
  'discover-right-panel',
] as const;

test('[role:user] T25 — legacy area-first areaKey= deep link (Udupi Manipal) mounts one areas shell and shows the Manipal status-pill count (cards and markers not asserted)', async ({ page }) => {
  assertNoCredentialsGuard('T25');

  const params = new URLSearchParams({ city: 'udupi', journey: 'area-first', zoom: '14', areaKey: 'IN|KA|Udupi|Manipal' });
  await page.goto(`/discover?${params.toString()}`);

  // 1065-01: exactly one primary surface, and it is the canonical areas shell (explicit journey=area-first).
  await expect
    .poll(
      () => Promise.all(T25_SURFACE_TESTIDS.map((id) => page.getByTestId(id).count())).then((cs) => cs.reduce((a, b) => a + b, 0)),
      { timeout: 15_000, message: 'exactly one primary right-panel surface must mount' },
    )
    .toBe(1);
  await expect(page.getByTestId('discover-areas-journey-panel-shell')).toBeVisible({ timeout: 10_000 });

  // 1065-02 (listing source): the areaKey resolves Manipal's own listings — the selected-area status pill renders the
  // same areaResultSummaryText the area panel would ("N verified properties in Manipal"), backed by the 4 seeded
  // LIVE Manipal sale listings (>= 4: sibling lifecycle tests may only add listings, never remove these).
  const manipalSummary = page.getByRole('status').filter({ hasText: /verified propert(?:y|ies) in Manipal/ }).first();
  await expect(manipalSummary, 'the Manipal area listings resolve for the areaKey= deep link').toBeVisible({ timeout: 15_000 });
  const summaryText = (await manipalSummary.innerText()).trim();
  const summaryMatch = summaryText.match(/(\d+)\s+verified propert(?:y|ies) in Manipal/);
  expect(summaryMatch, `summary must carry a parseable count, got "${summaryText}"`).not.toBeNull();
  expect(parseInt(summaryMatch![1], 10), 'Manipal resolves at least its 4 seeded LIVE sale listings').toBeGreaterThanOrEqual(4);

  // 1065-01 exclusivity, re-proven AFTER the content settled: re-count all four surfaces and require the total to be
  // exactly 1 on 5 CONSECUTIVE samples 500 ms apart (a >= 2 s window); any sample != 1 resets the run, so a second
  // surface mounting after the content fails here. The first-match poll above stops at its first sample == 1.
  let consecutiveOnes = 0;
  let lastTotal = -1;
  await expect
    .poll(
      async () => {
        lastTotal = await Promise.all(T25_SURFACE_TESTIDS.map((id) => page.getByTestId(id).count())).then((cs) =>
          cs.reduce((a, b) => a + b, 0),
        );
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
  await expect(page.getByTestId('discover-areas-journey-panel-shell')).toBeVisible();
});
