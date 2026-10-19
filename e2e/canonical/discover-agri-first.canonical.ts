/**
 * Discover agri-first canonical specs — T8, T9 (issue #1713, PR-3), T8b (#2750 CANON), T8c (#2860).
 *
 * #2860: T8b/T9 were extended and T8c [canonical-anon] added to carry the per-assertion coverage of the legacy
 * e2e/discover-agri-locality-marker-1468.spec.ts (map: docs/testing/e2e-retirement-map-2860.md). Canonical
 * equivalents: Shirva -> Fixtureville (far town), Padubidri -> RR Nagar.
 *
 * Fixture dependency: the area-first fixture chain PLUS
 * scripts/db/fixtures/navigation-hierarchy-schools-agri-fixture-seed.sql parts (c)/(d) — 2 LIVE
 * [E2E] agricultural_land listings in RR Nagar, and 2 real `agri_destination_classification` rows
 * for Bangalore (RR Nagar -> SW, 8.384km; Vijayanagar -> W, 7.025km). See that seed file's own
 * header for the bearing/distance computation and e2e/canonical/README.md for the full ordered
 * seed sequence.
 *
 * PLAN CORRECTIONS THIS FILE REFLECTS:
 *   c6 — agri-first has NO canonical panel branch. DiscoverPanelSurface.tsx's four branches are
 *        group-focus / area-first / school-first-node-level / legacy fallback — an agri-first URL
 *        satisfies neither of the first three, so it falls through to LegacyRightPanelBridge ->
 *        DiscoverRightPanel, whose root is `data-testid="discover-right-panel"`
 *        (DiscoverRightPanel.tsx:1809). Both tests below assert THAT testid, never a journey
 *        shell.
 *   c7 — `agri_destination_classification` (V125) is EMPTY for every city on a stock fixture; the
 *        backend fails closed with 503 AGRI_DESTINATIONS_NOT_YET_PROMOTED whenever it has zero
 *        rows for an active city, and does NOT fall back to the legacy
 *        `regional_area_classifications` table. Without the seed's part (d), this file's specs
 *        would render an EMPTY panel with NO visible error (an ordinary "count > 0" assertion
 *        would just fail with no diagnostic) — the mandatory waitForResponse+resp.ok() assertion
 *        in both tests converts that silent 503 into a loud, diagnosable failure.
 *
 * IMPLEMENTATION CORRECTION i1 (discovered writing this file, not in team-lead-plan.toml):
 * team-lead-plan.toml's literal T9 URL omits `journey=agri-first` (only
 * `city=bangalore&group=<DIR>:<BAND>`). Read against the real source
 * (src/features/discover/state/url/area.ts:247-254), a URL with NEITHER an explicit `journey=`
 * NOR `scope=` virtual-defaults `journey` to `'area-first'` whenever the city has a resolvable
 * hierarchy (Issue #2088 item 3) — Bangalore always does on this fixture. `group=` alone does not
 * suppress that default (agricultural.ts's OD-1 migration only touches `region`/`group`, never
 * `journey`), so a literal `?group=...` URL with no `journey=` would render the CANONICAL
 * area-first city root, not the legacy agri panel c6 (and T8) expect — contradicting "the result
 * set MATCHES T8's". T9's URL below explicitly carries `journey=agri-first` alongside the legacy
 * `group=` param instead — the realistic shape of a genuinely old shared link from before the
 * region/maxKm rename (which always carried journey=agri-first), and the only shape that
 * actually reaches the legacy agri branch this test exists to verify. This is a test-authoring
 * correction, not a product-code change — src/** is untouched.
 */
import { test, expect } from './support/canonical-test';
import { hasRealCredentials } from '../helpers';

const userEmail = process.env.SMOKE_USER_EMAIL ?? '';
const userPassword = process.env.SMOKE_USER_PASSWORD ?? '';

// Real fixture values — see navigation-hierarchy-schools-agri-fixture-seed.sql part (d).
const DIRECTION = 'SW';
const MAX_KM = 25;
const DESTINATION_TOWN_NAME = 'RR Nagar';

function waitForAgriDestinations(page: import('./support/canonical-test').Page) {
  return page.waitForResponse(
    (resp) => resp.url().includes('/api/discover/agri-destinations') && resp.request().method() === 'GET',
    { timeout: 15_000 },
  );
}

test('[role:user] T8 — region + maxKm renders real agri destination data on the legacy panel', async ({ page }) => {
  if (!hasRealCredentials(userEmail, userPassword)) {
    throw new Error('[T8] SMOKE_USER_EMAIL/PASSWORD absent — this test should not have run.');
  }

  const agriPromise = waitForAgriDestinations(page);
  await page.goto(
    `/discover?city=bangalore&journey=agri-first&region=${DIRECTION}&maxKm=${MAX_KM}`,
  );
  const agriResponse = await agriPromise;
  // MANDATORY per c7's failure_mode_to_watch — a 503 AGRI_DESTINATIONS_NOT_YET_PROMOTED would
  // otherwise surface as a silent empty panel. This is ALSO the session-restore proof (c1).
  expect(agriResponse.ok(), 'agri-destinations must respond 2xx (not the 503 not-yet-promoted code)').toBe(true);

  // Legacy branch — no canonical journey shell exists for agri-first (c6).
  const rightPanel = page.getByTestId('discover-right-panel');
  await expect(rightPanel).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('discover-areas-journey-panel-shell')).toHaveCount(0);
  await expect(page.getByTestId('discover-schools-journey-panel-shell')).toHaveCount(0);

  // NAMED fixture destination: the real areas.name for the RR Nagar bucket (via
  // AgriDestinationPortPostgresAdapter's `a.name AS display_name`), rendered literally by
  // AgriGroupSelectedPanel.tsx's town card (`bucket.displayName`, line ~752).
  await expect(
    page.getByTestId('agri-group-locality-btn').filter({ hasText: DESTINATION_TOWN_NAME }),
  ).toBeVisible({ timeout: 10_000 });

  // EXPLICIT count > 0 — mandatory per team-lead-plan.toml's why_count_is_mandatory: a half-set
  // region/maxKm combination is an INERT journey (useDiscoverAgriController.ts:56-63), and "some
  // element exists" would pass vacuously against that inert state. The real parcel total
  // (AgriGroupSelectedPanel.tsx's agri-group-listing-count, backed by the 2 RR Nagar agri
  // listings seeded in part (c)) must read a real positive digit.
  const countText = await page.getByTestId('agri-group-listing-count').innerText();
  const parsedCount = parseInt(countText.trim(), 10);
  expect(Number.isFinite(parsedCount), `agri-group-listing-count must be a real number, got "${countText}"`).toBe(true);
  expect(parsedCount, 'agri-group-listing-count must be > 0 for a genuinely non-inert journey').toBeGreaterThan(0);
});

// #2750 CANON (c) — fixture town that exists ONLY at 25 < km <= 50 (seed part (f): 'Fixtureville', SW, 29.979 km,
// 2 LIVE agri parcels). It proves a distance-chip switch changes the rendered result set, and gives the drill-in /
// peek / Back legs a destination that is NOT visible at the landing tier.
const FAR_TOWN_NAME = 'Fixtureville';
const FAR_PARCEL_ONE = '[E2E] Fixtureville Fixture Agri Parcel One';
const FAR_PARCEL_TWO = '[E2E] Fixtureville Fixture Agri Parcel Two';
const FAR_PARCEL_ONE_ID = 'f1713004-0000-0000-0000-000000000003';
// #2860 — the far town's raw area_key (seed part (f)); the ONLY value destKey / the Level-3 areaKey may carry.
const FAR_TOWN_AREA_KEY = 'IN|KA|Bengaluru|Fixtureville';

test('[role:user] T8b — corridor card, distance-chip 25->50, town drill-in, listing peek, Back from the listing detail restores the peek, then peek-close on the far fixture town, a cold destKey load and the locality close', async ({ page }) => {
  if (!hasRealCredentials(userEmail, userPassword)) {
    throw new Error('[T8b] SMOKE_USER_EMAIL/PASSWORD absent — this test should not have run.');
  }

  const localityBtns = page.getByTestId('agri-group-locality-btn');

  // 1. Corridor landing (no region): the SW card is the one-click entry to region=SW&maxKm=25.
  const landingPromise = waitForAgriDestinations(page);
  await page.goto('/discover?city=bangalore&journey=agri-first');
  expect((await landingPromise).ok(), 'landing agri-destinations must respond 2xx').toBe(true);
  await expect(page.getByTestId('corridor-landing-list')).toBeVisible({ timeout: 10_000 });
  // The SW card is identified by its RR Nagar town chip (the W card carries Vijayanagar instead).
  const swCard = page.getByTestId('corridor-card').filter({ hasText: DESTINATION_TOWN_NAME });
  await expect(swCard).toHaveCount(1);
  await swCard.click();
  await expect(page).toHaveURL((u) => u.searchParams.get('region') === DIRECTION && u.searchParams.get('maxKm') === String(MAX_KM), { timeout: 10_000 });
  await expect(page.getByTestId('distance-chip-25')).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });

  // 2. S1 (25 km tier): RR Nagar present, the far town ABSENT (paired with S2 below).
  await expect(localityBtns.filter({ hasText: DESTINATION_TOWN_NAME })).toBeVisible({ timeout: 10_000 });
  await expect(localityBtns.filter({ hasText: FAR_TOWN_NAME })).toHaveCount(0);
  const countAt25 = await readAgriParcelCount(page);

  // 3. Switch the distance chip to 50: URL, pressed state AND result set must all change.
  const at50Promise = waitForAgriDestinations(page);
  await page.getByTestId('distance-chip-50').click();
  expect((await at50Promise).ok(), 'maxKm=50 agri-destinations must respond 2xx').toBe(true);
  await expect(page).toHaveURL((u) => u.searchParams.get('maxKm') === '50', { timeout: 10_000 });
  await expect(page.getByTestId('distance-chip-50')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('distance-chip-25')).toHaveAttribute('aria-pressed', 'false');
  // #2860 (1468-01): the selected-group panel is the surface that hosts the town rows at region+maxKm.
  const selectedPanel = page.getByTestId('agri-group-selected-panel');
  await expect(selectedPanel).toBeVisible({ timeout: 10_000 });
  // #2860 (1468-03): the near AND the far town rows are both listed at 50 km.
  await expect
    .poll(() => localityBtns.count(), { timeout: 10_000, message: 'at maxKm=50 the SW panel lists at least RR Nagar + Fixtureville' })
    .toBeGreaterThanOrEqual(2);
  // #2860 (1468-04, then 1468-05) — MASKING ORDER: asserted BEFORE the named-town checks below. A town row must
  // render the display name, never the raw area_key: a row rendering 'IN|KA|Bengaluru|Fixtureville' would still
  // satisfy the hasText:'Fixtureville' filters (substring match), so only this check discriminates.
  const townRowTexts = await localityBtns.allTextContents();
  for (const t of townRowTexts) {
    expect(t, `town row "${t}" must render a display name, not a raw area_key (no '|')`).not.toContain('|');
  }
  for (const t of townRowTexts) {
    expect(t, `town row "${t}" must not render the 'IN|KA' area_key prefix`).not.toContain('IN|KA');
  }
  // #2860 (1468-08): the pre-#1480 flat listing rows are gone from the selected panel (negative guard).
  await expect(page.getByTestId('agri-group-listing-row')).toHaveCount(0);
  await expect(localityBtns.filter({ hasText: FAR_TOWN_NAME })).toBeVisible({ timeout: 10_000 });
  await expect(localityBtns.filter({ hasText: DESTINATION_TOWN_NAME })).toBeVisible();
  const countAt50 = await readAgriParcelCount(page);
  expect(countAt50, 'widening 25->50 must add the far town\'s 2 seeded parcels to the total').toBeGreaterThanOrEqual(countAt25 + 2);

  // 4. Drill into the far town: destKey (not locality) in the URL, locality panel with both seeded rows.
  // #2860 (1468-16/17): the Level-3 listings request waiter is ARMED BEFORE the click and awaited after it.
  const level3Promise = page.waitForRequest(
    (req) => req.method() === 'GET' && new URL(req.url()).pathname.endsWith('/api/discover/agri-map-listings'),
    { timeout: 15_000 },
  );
  await localityBtns.filter({ hasText: FAR_TOWN_NAME }).click();
  await expect(page).toHaveURL((u) => (u.searchParams.get('destKey') ?? '') !== '' && !u.searchParams.has('locality'), { timeout: 10_000 });
  // #2860 (1468-10): the EXACT raw area_key, not merely non-empty (a display-name write would pass the line above).
  const drilledParams = new URL(page.url()).searchParams;
  expect(drilledParams.get('destKey'), 'destKey must be the far town\'s raw area_key').toBe(FAR_TOWN_AREA_KEY);
  // #2860 (1468-12, 1468-13): the drill-in preserves region and maxKm.
  expect(drilledParams.get('region'), 'region survives the town drill-in').toBe(DIRECTION);
  expect(drilledParams.get('maxKm'), 'maxKm=50 survives the town drill-in').toBe('50');
  await expect(page.getByTestId('agri-group-locality-panel')).toBeVisible({ timeout: 10_000 });
  // #2860 (1468-15): the locality panel REPLACES the selected-group panel.
  await expect(selectedPanel).toHaveCount(0);
  // #2860 (1468-16, 1468-17): Level-3 fetch carries the singular areaKey = the raw key, never the plural areaKeys.
  const level3Url = new URL((await level3Promise).url());
  expect(level3Url.searchParams.get('areaKey'), 'agri-map-listings must be requested for the far town\'s raw area_key').toBe(FAR_TOWN_AREA_KEY);
  expect(level3Url.searchParams.has('areaKeys'), 'agri-map-listings must not carry a plural areaKeys param').toBe(false);
  // #2860 (1468-19, then 1468-20): the header renders the display name, never the key.
  const localityName = page.getByTestId('agri-locality-name');
  await expect(localityName).toHaveText(FAR_TOWN_NAME, { timeout: 10_000 });
  expect(await localityName.innerText(), 'locality header must not render a raw area_key').not.toContain('|');
  const rows = page.getByTestId('agri-locality-listing-row');
  await expect(rows.filter({ hasText: FAR_PARCEL_ONE })).toHaveCount(1, { timeout: 10_000 });
  await expect(rows.filter({ hasText: FAR_PARCEL_TWO })).toHaveCount(1);
  // #2860 (1468-22): exactly the 2 seeded Fixtureville parcels.
  await expect(rows).toHaveCount(2);

  // 5. Row click opens the in-panel peek WITHOUT leaving /discover.
  await rows.filter({ hasText: FAR_PARCEL_ONE }).click();
  await expect(page.getByTestId('agri-listing-peek')).toBeVisible({ timeout: 10_000 });
  expect(new URL(page.url()).pathname, 'peek must not navigate away from /discover').toBe('/discover');
  // The peek is URL state (listing=<id>) and REPLACES the locality list in the panel while open, so it is the
  // state Back has to restore.
  await expect(page).toHaveURL((u) => u.searchParams.get('listing') === FAR_PARCEL_ONE_ID, { timeout: 10_000 });

  // 6. Peek -> detail is a PUSH navigation (rightPanelContract.ts viewDetails -> routing.navigate('/listing/:id')),
  // so browser Back must restore the whole agri drill-in: URL params AND rendered state.
  await page.getByTestId('agri-listing-peek-view-details').click();
  await expect(page).toHaveURL(new RegExp(`/listing/${FAR_PARCEL_ONE_ID}$`), { timeout: 10_000 });
  await page.goBack();
  await expect(page).toHaveURL(
    (u) =>
      u.pathname === '/discover' &&
      u.searchParams.get('journey') === 'agri-first' &&
      u.searchParams.get('region') === DIRECTION &&
      u.searchParams.get('maxKm') === '50' &&
      (u.searchParams.get('destKey') ?? '') !== '' &&
      u.searchParams.get('listing') === FAR_PARCEL_ONE_ID,
    { timeout: 10_000 },
  );
  // RENDERED state, not just the URL: the peek for the same parcel is back ...
  await expect(page.getByTestId('agri-listing-peek')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('agri-listing-peek-title')).toHaveText(FAR_PARCEL_ONE);
  // ... and closing it reveals the restored drill-in list with both far-town rows (paired with step 4).
  await page.getByTestId('agri-listing-peek-close').click();
  await expect(page.getByTestId('agri-listing-peek')).toHaveCount(0);
  await expect(page.getByTestId('agri-group-locality-panel')).toBeVisible({ timeout: 10_000 });
  await expect(rows.filter({ hasText: FAR_PARCEL_ONE })).toHaveCount(1, { timeout: 10_000 });
  await expect(rows.filter({ hasText: FAR_PARCEL_TWO })).toHaveCount(1);
  expect(new URL(page.url()).searchParams.get('maxKm'), 'maxKm=50 survives the round trip').toBe('50');
  // #2860 (1468-45): peek close removes listing= ...
  await expect(page).toHaveURL((u) => !u.searchParams.has('listing'), { timeout: 10_000 });
  const afterPeekClose = new URL(page.url()).searchParams;
  // #2860 (1468-46): ... and keeps the drill-in identity (destKey) ...
  expect(afterPeekClose.get('destKey'), 'peek close must keep destKey').toBe(FAR_TOWN_AREA_KEY);
  // #2860 (1468-47): ... and the region.
  expect(afterPeekClose.get('region'), 'peek close must keep region').toBe(DIRECTION);

  // 8. #2860 (1468-18, 1468-30..32): a COLD load of the destKey deep link mounts the locality panel directly,
  // without any town click.
  const coldParams = new URLSearchParams({
    city: 'bangalore',
    journey: 'agri-first',
    region: DIRECTION,
    maxKm: '50',
    destKey: FAR_TOWN_AREA_KEY,
  });
  await page.goto(`/discover?${coldParams.toString()}`);
  await expect(page.getByTestId('agri-group-locality-panel'), 'cold destKey deep link mounts the locality panel').toBeVisible({ timeout: 15_000 });
  await expect(rows.filter({ hasText: FAR_PARCEL_ONE })).toHaveCount(1, { timeout: 10_000 });
  await expect(rows.filter({ hasText: FAR_PARCEL_TWO })).toHaveCount(1);
  await expect(selectedPanel).toHaveCount(0);

  // 9. #2860 (1468-23..29): closing the locality panel drops destKey, never resurrects locality=, keeps
  // region+maxKm, and returns to the selected-group panel.
  const closeBtn = page.getByTestId('agri-locality-close-btn');
  await expect(closeBtn).toBeVisible({ timeout: 10_000 });
  await closeBtn.click();
  await expect(page).toHaveURL((u) => !u.searchParams.has('destKey'), { timeout: 10_000 });
  const afterClose = new URL(page.url()).searchParams;
  expect(afterClose.has('locality'), 'locality close must not resurrect a legacy locality= param').toBe(false);
  expect(afterClose.get('region'), 'region survives the locality close').toBe(DIRECTION);
  expect(afterClose.get('maxKm'), 'maxKm survives the locality close').toBe('50');
  await expect(page.getByTestId('agri-group-locality-panel')).toHaveCount(0);
  await expect(selectedPanel).toBeVisible({ timeout: 10_000 });
});

// #2860 — T8c [canonical-anon]: the anonymous agri peek withholds the price and offers a sign-in instead
// (legacy e2e/discover-agri-locality-marker-1468.spec.ts AC7). Same far fixture town as T8b, cold destKey link.
test('T8c — anon agri listing peek withholds the price and shows the sign-in affordance instead', async ({ page }) => {
  const anonParams = new URLSearchParams({
    city: 'bangalore',
    journey: 'agri-first',
    region: DIRECTION,
    maxKm: '50',
    destKey: FAR_TOWN_AREA_KEY,
  });
  await page.goto(`/discover?${anonParams.toString()}`);
  await expect(page).not.toHaveURL(/\/auth/, { timeout: 10_000 });
  // Genuinely anonymous: the header's anon-only Sign in link (same proof as T10).
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('agri-group-locality-panel')).toBeVisible({ timeout: 15_000 });
  const row = page.getByTestId('agri-locality-listing-row').filter({ hasText: FAR_PARCEL_ONE });
  await expect(row).toHaveCount(1, { timeout: 10_000 });
  await row.click();
  await expect(page.getByTestId('agri-listing-peek')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('agri-listing-peek-title')).toHaveText(FAR_PARCEL_ONE, { timeout: 10_000 });
  // MASKING ORDER: 1468-51 (no price string for anon) BEFORE 1468-50 (sign-in affordance).
  await expect(page.getByTestId('agri-listing-peek-price'), 'anon peek must not render a price').toHaveCount(0);
  await expect(page.getByTestId('agri-listing-peek-price-signin'), 'anon peek shows the sign-in-for-price affordance').toBeVisible();
});

// DEFAULT_MAX_KM — the product constant agricultural.ts's cold-load canonicalisation backfills
// maxKm to when a URL carries region= without an explicit maxKm= (src/features/discover/state/
// url/agricultural.ts, `export const DEFAULT_MAX_KM = 25`). This is deliberately a PINNED literal
// (unlike a fixture magnitude — see F1's rationale in discover-school-first.canonical.ts): 25 is
// product behaviour, not data a sibling Mode-3 track sharing this fixture could ever shift.
// Numerically equal to this file's own MAX_KM (both happen to be 25), but asserted here for an
// independent reason — MAX_KM is a deliberate T8 URL choice; DEFAULT_MAX_KM is what T9's legacy
// URL (which carries no maxKm= at all) must be backfilled TO.
const DEFAULT_MAX_KM = 25;

async function readAgriParcelCount(page: import('./support/canonical-test').Page): Promise<number> {
  const countText = await page.getByTestId('agri-group-listing-count').innerText();
  const parsed = parseInt(countText.trim(), 10);
  expect(Number.isFinite(parsed), `agri-group-listing-count must be a real number, got "${countText}"`).toBe(true);
  return parsed;
}

test('[role:user] T9 — legacy group=DIR:BAND rewrites to canonical region=/maxKm= and lands on the same result set as T8, and legacy locality= migrates to destKey=', async ({ page }) => {
  if (!hasRealCredentials(userEmail, userPassword)) {
    throw new Error('[T9] SMOKE_USER_EMAIL/PASSWORD absent — this test should not have run.');
  }

  // STEP 1 — load the canonical, T8-shaped URL first and capture its rendered parcel count
  // WITHIN THIS TEST. This is what makes the "same result set as T8" claim in this test's own
  // title an equivalence PROOF rather than two independent positive checks that happen to both
  // read >0 — a regression that changed T9's count while keeping it positive would fail this
  // comparison even though it would pass a standalone >0 assertion.
  const canonicalAgriPromise = waitForAgriDestinations(page);
  await page.goto(`/discover?city=bangalore&journey=agri-first&region=${DIRECTION}&maxKm=${MAX_KM}`);
  const canonicalAgriResponse = await canonicalAgriPromise;
  expect(canonicalAgriResponse.ok(), 'canonical-URL agri-destinations must respond 2xx').toBe(true);
  await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByTestId('agri-group-locality-btn').filter({ hasText: DESTINATION_TOWN_NAME }),
  ).toBeVisible({ timeout: 10_000 });
  const canonicalCount = await readAgriParcelCount(page);
  expect(canonicalCount, 'canonical-URL parcel count must be > 0 (the baseline this test compares against)').toBeGreaterThan(0);

  // STEP 2 — now navigate to the legacy group=DIR:BAND URL and let the rewrite settle.
  // See module docstring "IMPLEMENTATION CORRECTION i1" for why journey=agri-first is included
  // explicitly alongside the legacy group= param.
  const legacyAgriPromise = waitForAgriDestinations(page);
  await page.goto(`/discover?city=bangalore&journey=agri-first&group=${DIRECTION}:0_10`);
  const legacyAgriResponse = await legacyAgriPromise;
  expect(legacyAgriResponse.ok(), 'legacy-URL agri-destinations must respond 2xx after the rewrite settles').toBe(true);

  // Double-REPLACE hazard (agricultural.ts's OD-1 migration, then the maxKm cold-load backfill) —
  // wait for the SECOND replace to land before capturing the URL, per team-lead-plan.toml's
  // double_replace_hazard mitigation.
  await expect(page).toHaveURL(/[?&]maxKm=/, { timeout: 10_000 });

  const settledUrl = new URL(page.url());
  // PRESENCE + EXACT VALUE: canonical params landed with the RIGHT values, not merely present.
  expect(settledUrl.searchParams.get('region'), 'region= must be the migrated direction').toBe(DIRECTION);
  // EXACT VALUE (not just .has('maxKm')): a regression that backfilled the wrong constant (e.g.
  // maxKm=50) would still satisfy a bare presence check. Asserting the literal DEFAULT_MAX_KM also
  // positively demonstrates the documented "band is DISCARDED, never mapped" behaviour (c7 /
  // agricultural.ts's OD-1 Option A) — the legacy URL's own band segment is '0_10', so landing on
  // 25 (not 10) proves the band was dropped rather than translated into a maxKm tier.
  expect(
    settledUrl.searchParams.get('maxKm'),
    `maxKm= must be backfilled to DEFAULT_MAX_KM (${DEFAULT_MAX_KM}), proving the legacy URL's own '0_10' band segment was DISCARDED rather than mapped to a maxKm tier`,
  ).toBe(String(DEFAULT_MAX_KM));
  // ABSENCE: the legacy param must not survive the rewrite.
  expect(settledUrl.searchParams.has('group'), 'legacy group= must be removed by the OD-1 migration').toBe(false);

  // Same result set as T8/the canonical URL above — WITHIN-TEST EQUIVALENCE, not two independent
  // positive checks. Same real destination town, and the same rendered parcel count captured in
  // STEP 1.
  await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByTestId('agri-group-locality-btn').filter({ hasText: DESTINATION_TOWN_NAME }),
  ).toBeVisible({ timeout: 10_000 });
  const legacyCount = await readAgriParcelCount(page);
  expect(legacyCount, 'legacy-URL parcel count must be > 0').toBeGreaterThan(0);
  expect(legacyCount, 'legacy-URL and canonical-URL parcel counts must be EQUAL — this is the actual equivalence proof').toBe(canonicalCount);

  // STEP 3 — #2860 (1468-33..39): a legacy locality=<area_key> link is migrated to destKey=<area_key>
  // (agricultural.ts locality migration), mounts the locality panel, and neither close nor re-drill resurrects it.
  const legacyLocalityParams = new URLSearchParams({
    city: 'bangalore',
    journey: 'agri-first',
    region: DIRECTION,
    maxKm: '50',
    locality: FAR_TOWN_AREA_KEY,
  });
  await page.goto(`/discover?${legacyLocalityParams.toString()}`);
  // 1468-33: promoted to the exact canonical destKey.
  await expect(page, 'legacy locality=<area_key> must migrate to destKey=<area_key>').toHaveURL(
    (u) => u.searchParams.get('destKey') === FAR_TOWN_AREA_KEY,
    { timeout: 10_000 },
  );
  const migrated = new URL(page.url()).searchParams;
  expect(migrated.has('locality'), 'legacy locality= must be removed by the migration').toBe(false);
  expect(migrated.has('town'), 'legacy town= must not appear after the migration').toBe(false);
  await expect(page.getByTestId('agri-group-locality-panel')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('agri-locality-name')).toHaveText(FAR_TOWN_NAME, { timeout: 10_000 });
  // 1468-38: closing does not resurrect locality=.
  await page.getByTestId('agri-locality-close-btn').click();
  await expect(page, 'locality close must drop destKey and never write locality= back').toHaveURL(
    (u) => !u.searchParams.has('destKey') && !u.searchParams.has('locality'),
    { timeout: 10_000 },
  );
  // 1468-39: a re-drill writes destKey again, still no locality=.
  await page.getByTestId('agri-group-locality-btn').filter({ hasText: FAR_TOWN_NAME }).click();
  await expect(page).toHaveURL(
    (u) => u.searchParams.get('destKey') === FAR_TOWN_AREA_KEY && !u.searchParams.has('locality'),
    { timeout: 10_000 },
  );
});
