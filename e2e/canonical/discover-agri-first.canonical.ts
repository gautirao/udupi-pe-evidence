/**
 * Discover agri-first canonical specs — T8, T9 (issue #1713, PR-3).
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

test('[role:user] T9 — legacy group=DIR:BAND rewrites to canonical region=/maxKm= and lands on the same result set as T8', async ({ page }) => {
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
});
