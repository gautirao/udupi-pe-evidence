/**
 * Issue #2204 (successor 4/5 of the #2188 legacy-areaKey-removal programme) —
 * HARD-GATE browser/E2E proof that the canonical `node=`-based flows shipped
 * by #2201 (groupId canonicalization), #2202 (preview node-scoping backend)
 * and #2203 (journey-preserving node selection for School-first/Agri-first)
 * actually work end-to-end in a REAL browser against a REAL local-fixture
 * backend (`scripts/dev/local-fixture-backend.sh`) — never the shared hosted
 * Supabase DB. This is the precondition evidence #2205 (legacy removal) must
 * cite before it is allowed to delete anything (owner ruling on #2199).
 *
 * Owner ruling (#2199, cited verbatim in #2204): "Browser/E2E proof before
 * deletion across the important reachable flows: Area-first
 * City→Direction→Cluster→AREA, School-first canonical geography, Agri-first
 * canonical geography, and journeyless/group behaviour. For each, prove URL
 * identity, map scope == panel scope, and no unintended legacy geography
 * param is newly emitted on migrated paths."
 *
 * FIXTURE (local-fixture-backend, NOT the shared hosted DB):
 *   scripts/db/fixtures/navigation-hierarchy-fixture-seed.sql (#1956 PR-5) +
 *   scripts/db/fixtures/navigation-active-revision-fixture-seed.sql (#2083,
 *   PROMOTED pointer for Bangalore) + scripts/db/fixtures/
 *   bangalore-mangalore-schools-seed.sql + scripts/db/fixtures/
 *   agricultural-listings-seed.sql, applied against the disposable
 *   pg-test-fixture Postgres container started by
 *   scripts/dev/local-fixture-backend.sh. Bangalore's live navigation tree
 *   in this fixture (verified live against the running backend):
 *
 *     root
 *       -> d:southeast "South-East Bangalore" (DIRECTION)
 *            -> a:...RR Nagar / Vijayanagar / Nagarbhavi   (3 AREA children, no CLUSTER)
 *       -> d:northeast "North-East Bangalore" (DIRECTION)
 *            -> c:northeast:hoskote-kannamangala-whitefield-hoskote-road (CLUSTER)
 *                 -> a:...Hoskote                          (AREA, has 1 listing)
 *                 -> a:...Kannamangala - Whitefield Hoskote Road (AREA)
 *       -> d:southwest "South-West Bangalore" (DIRECTION)
 *            -> a:...Deepanjali Nagar / Gnana Bharathi / Chandra Layout Extension / Avalahalli
 *
 *   area_groups (pre-existing, base migrations — NOT part of this fixture
 *   seed) for Bangalore include `south-premium` ("South Premium"), whose
 *   members are Koramangala (2 schools, 0 listings), Jayanagar (0/0), HSR
 *   Layout (1 school, 0 listings) — live-verified via
 *   GET /api/discover/areas?city=bangalore against this exact fixture.
 *   Deliberately chosen because it has real schools attached (needed for the
 *   #2188 §C2 school-browse/school-group-areas scenario) and a KNOWN, real,
 *   non-matching neighbour (Hoskote, 1 listing) to use as a stray-legacy-
 *   param negative control.
 *
 * Run (against the local fixture backend/frontend, see this issue's PR body
 * for the exact ports used in this evidence run):
 *   PLAYWRIGHT_BASE_URL=http://localhost:5175 BACKEND_BASE_URL=http://localhost:8088 \
 *     npx playwright test e2e/discover/issue-2204-canonical-node-browser-proof.spec.ts --project=full
 */
import { test, expect, type Page } from '@playwright/test';

const CITY = 'bangalore';

// ── Area-first navigation tree (real, seeded) ───────────────────────────────
const D_NORTHEAST = 'd:northeast';
const CLUSTER_NE = 'c:northeast:hoskote-kannamangala-whitefield-hoskote-road';
const AREA_HOSKOTE_KEY = 'IN|KA|Bengaluru|Hoskote';
const AREA_HOSKOTE_NODE = 'a:IN|KA|Bengaluru|Hoskote';
const AREA_RR_NAGAR_KEY = 'IN|KA|Bengaluru|RR Nagar';
const AREA_RR_NAGAR_NODE = 'a:IN|KA|Bengaluru|RR Nagar';

// ── School-first fixture identity (real, seeded) ────────────────────────────
// bangalore-mangalore-schools-seed.sql inserts every school row via
// gen_random_uuid() (not a literal), so this id is NOT stable across fixture
// reseeds — it is the live id of "Bethany High School" (areaKey=Koramangala,
// live-verified via GET /api/public/schools/{id}) for THIS evidence run's
// fixture instance. Re-verify/refresh on any future reseed.
const SCHOOL_ID_KORAMANGALA = '790808d6-7554-4f1d-a7a3-6863c7e7ecbe';
const AREA_KORAMANGALA_KEY = 'IN|KA|Bengaluru|Koramangala';

// ── Journeyless / school-group area_groups fixture (real, pre-existing) ────
// south-premium's real member areas — Koramangala (2 schools, 0 listings),
// Jayanagar (0/0), HSR Layout (1 school, 0 listings) — live-verified via
// GET /api/discover/areas?city=bangalore against this exact fixture. Sums to
// a deterministic 3 schools / 0 listings, asserted below.
const GROUP_SOUTH_PREMIUM = 'south-premium';
// south-premium's real member areaKeys (V78__seed_area_groups.sql, live-verified) —
// used to assert SchoolGroupAreasPanel's ACTUAL rendered area-card SET (Finding 1),
// not just the aggregate discover-badge count.
const AREA_JAYANAGAR_KEY = 'IN|KA|Bengaluru|Jayanagar';
const AREA_HSR_LAYOUT_KEY = 'IN|KA|Bengaluru|HSR Layout';

async function grantTelemetryConsent(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem('discover_telemetry_consent', 'granted');
  });
}

function currentParam(page: Page, name: string): string | null {
  return new URL(page.url()).searchParams.get(name);
}

async function historyLength(page: Page): Promise<number> {
  return page.evaluate(() => window.history.length);
}

// ─────────────────────────────────────────────────────────────────────────
// FLOW 1 — Area-first City -> Direction -> Cluster -> AREA
// ─────────────────────────────────────────────────────────────────────────
test.describe('@integration-ui #2204 — Area-first canonical node= drill-down', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  test.beforeEach(async ({ page }) => {
    await grantTelemetryConsent(page);
  });

  test('City -> Direction -> Cluster -> AREA: node= identity, map scope == panel scope, Back/Forward round-trip', async ({
    page,
  }) => {
    await page.goto(`/discover?city=${CITY}&journey=area-first`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('navigation-level-panel')).toBeVisible({ timeout: 20_000 });
    expect(currentParam(page, 'node'), 'root: no node= yet').toBeNull();
    expect(currentParam(page, 'areaKey'), 'root: never a legacy areaKey').toBeNull();
    expect(currentParam(page, 'groupId'), 'root: never a legacy groupId').toBeNull();

    // ── #2212 Gap 2 fix (4th reviewer-bot pass) — active LISTING FILTER
    // (Buy/Rent `intent`) survives a Back/Forward round-trip ALONGSIDE
    // canonical node= navigation, not just bare node/journey state. `intent`
    // is a real filter on the blended listing predicate
    // (DiscoverListingPredicateBuilder's listingPurpose clause — the exact
    // same server-side filter as `propertyTypes`/`bedrooms`), driven by a
    // real UI control (`intent-selector-rent`, asserted live by the
    // pre-existing #1956 PR-2 `issue-1956-pr2-filters-survive-navigation.spec.ts`
    // to persist via a URL REPLACE — "preference change, not navigation" —
    // never its own PUSH history entry). Set it BEFORE the drill-down so
    // every subsequent PUSH/Back/Forward step below carries it, then close
    // the loop with an explicit re-assertion at each Back/Forward leg.
    const rentButton = page.getByTestId('intent-selector-rent');
    await expect(rentButton).toBeVisible();
    expect(currentParam(page, 'intent'), 'root: intent defaults to Buy, omitted from the URL').toBeNull();
    await rentButton.click();
    await expect.poll(() => currentParam(page, 'intent')).toBe('rent');
    await expect(rentButton).toHaveAttribute('aria-pressed', 'true');

    const baseHistoryLen = await historyLength(page);

    // Hop 1: City -> Direction (d:northeast)
    await page.getByTestId(`navigation-child-card-${D_NORTHEAST}`).click();
    await expect.poll(() => currentParam(page, 'node')).toBe(D_NORTHEAST);
    expect(currentParam(page, 'areaKey'), 'Direction hop never writes areaKey').toBeNull();
    expect(currentParam(page, 'intent'), 'the active Rent filter survives the node= PUSH').toBe('rent');

    // Hop 2: Direction -> Cluster (Local Destination)
    await page.getByTestId(`navigation-child-card-${CLUSTER_NE}`).click();
    await expect.poll(() => currentParam(page, 'node')).toBe(CLUSTER_NE);
    expect(currentParam(page, 'intent'), 'the active Rent filter survives a second node= PUSH').toBe('rent');

    // Hop 3: Cluster -> AREA leaf (Hoskote) — capture BOTH the map marker
    // request and the panel listings request from the SAME click so the
    // map-scope==panel-scope proof is against the real, live pair, not two
    // independently-timed fetches.
    //
    // Finding 3 fix (PR #2212 review): a URL-substring-only predicate
    // registered right before the click can be satisfied by a STALE in-flight
    // request from hop 2 (the Cluster click) that just hasn't resolved yet —
    // Playwright's waitForResponse fires on any matching response received
    // after registration, not only ones triggered after it. Two mitigations:
    // (1) drain any in-flight requests from the prior hop before registering
    // the listeners, and (2) narrow the predicate to the query params THIS
    // hop must produce (nodeKey=a:Hoskote / areaKeys=Hoskote) — a stale hop-2
    // response would carry the CLUSTER's nodeKey, never the AREA's, so it
    // cannot satisfy the narrowed predicate even if it slips through (1).
    await page.waitForLoadState('networkidle').catch(() => {});
    const markersPromise = page.waitForResponse(
      (r) => r.url().includes('/api/discover/markers') && new URL(r.url()).searchParams.get('nodeKey') === AREA_HOSKOTE_NODE,
    );
    const listingsPromise = page.waitForResponse(
      (r) =>
        r.url().includes(`/api/discover/cities/${CITY}/listings`) &&
        new URL(r.url()).searchParams.getAll('areaKeys').includes(AREA_HOSKOTE_KEY),
    );
    await page.getByTestId(`navigation-child-card-${AREA_HOSKOTE_NODE}`).click();
    const [markersRes, listingsRes] = await Promise.all([markersPromise, listingsPromise]);

    expect(currentParam(page, 'node'), 'AREA leaf: canonical node= is the resolved AREA key').toBe(
      AREA_HOSKOTE_NODE,
    );
    expect(currentParam(page, 'areaKey'), 'AREA leaf: no legacy areaKey= is ever written').toBeNull();
    expect(currentParam(page, 'groupId'), 'AREA leaf: no legacy groupId= is ever written').toBeNull();
    expect(currentParam(page, 'intent'), 'the active Rent filter survives the AREA-leaf node= PUSH too').toBe(
      'rent',
    );

    const markersUrl = new URL(markersRes.url());
    const listingsUrl = new URL(listingsRes.url());
    expect(
      markersUrl.searchParams.get('nodeKey'),
      'map marker fetch is scoped by the SAME resolved node= the URL carries',
    ).toBe(AREA_HOSKOTE_NODE);
    expect(
      listingsUrl.searchParams.getAll('areaKeys'),
      'panel listings fetch is scoped to exactly the resolved AREA leaf key',
    ).toEqual([AREA_HOSKOTE_KEY]);
    // THE INVARIANT: map scope == panel scope. The node the map fetched is
    // exactly "a:" + the area the panel fetched — never two different
    // geographies (the #1806 defect class).
    expect(markersUrl.searchParams.get('nodeKey')).toBe(`a:${listingsUrl.searchParams.get('areaKeys')}`);

    // ── Back/Forward round-trip — one history entry per deliberate hop, no
    // double-pushes, state after Back-x3/Forward-x3 matches the original.
    // ALSO (#2212 Gap 2 fix): the active `intent=rent` filter — set via a
    // REPLACE on the ROOT entry before any of the 3 node= PUSHes below —
    // must read back as 'rent' at EVERY step of the round-trip, not just the
    // bare node=/journey= state proven elsewhere in this flow. ──
    const afterDrilldownLen = await historyLength(page);
    expect(afterDrilldownLen - baseHistoryLen, 'exactly 3 PUSH entries for 3 deliberate hops').toBe(3);

    await page.goBack();
    await expect.poll(() => currentParam(page, 'node')).toBe(CLUSTER_NE);
    expect(currentParam(page, 'intent'), 'Back 1: Rent filter still active alongside the Cluster node').toBe(
      'rent',
    );
    await page.goBack();
    await expect.poll(() => currentParam(page, 'node')).toBe(D_NORTHEAST);
    expect(currentParam(page, 'intent'), 'Back 2: Rent filter still active alongside the Direction node').toBe(
      'rent',
    );
    await page.goBack();
    await expect.poll(() => currentParam(page, 'node')).toBeNull();
    expect(currentParam(page, 'intent'), 'Back 3: Rent filter still active back at city root').toBe('rent');

    await page.goForward();
    await expect.poll(() => currentParam(page, 'node')).toBe(D_NORTHEAST);
    expect(currentParam(page, 'intent'), 'Forward 1: Rent filter still active').toBe('rent');
    await page.goForward();
    await expect.poll(() => currentParam(page, 'node')).toBe(CLUSTER_NE);
    expect(currentParam(page, 'intent'), 'Forward 2: Rent filter still active').toBe('rent');
    await page.goForward();
    await expect.poll(() => currentParam(page, 'node')).toBe(AREA_HOSKOTE_NODE);
    expect(
      currentParam(page, 'intent'),
      'Forward 3: Rent filter still active at the resolved AREA leaf — the FULL round-trip (3x Back + 3x Forward) never drops or resets the active listing filter alongside canonical node= state',
    ).toBe('rent');
    await expect(page.getByTestId('intent-selector-rent')).toHaveAttribute('aria-pressed', 'true');

    // Forward landed on the exact same node the drill-down produced — no
    // legacy param resurrected by the round-trip either.
    expect(currentParam(page, 'areaKey')).toBeNull();
    expect(currentParam(page, 'groupId')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// FLOW 2 — School-first canonical geography (#2203)
// ─────────────────────────────────────────────────────────────────────────
test.describe('@integration-ui #2204 — School-first canonical geography selection', () => {
  test.beforeEach(async ({ page }) => {
    await grantTelemetryConsent(page);
  });

  test('picking a new Area from the shared search preserves journey, writes node=, clears schoolId AND stale areaKey', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    // Cold-load with schoolId AND a stale legacy areaKey already present —
    // the exact PR #2211 reviewer-bot-caught defect (a stale legacy areaKey
    // surviving a canonical node= write) must stay fixed.
    await page.goto(
      `/discover?city=${CITY}&journey=school-first&schoolId=${SCHOOL_ID_KORAMANGALA}&areaKey=${encodeURIComponent(
        AREA_KORAMANGALA_KEY,
      )}`,
    );
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('control-bar-area-input')).toBeVisible({ timeout: 20_000 });
    expect(currentParam(page, 'schoolId')).toBe(SCHOOL_ID_KORAMANGALA);
    expect(currentParam(page, 'journey')).toBe('school-first');

    const historyBefore = await historyLength(page);

    // Finding 1 fix (PR #2212 reviewer-bot pass): the original version of
    // this test stopped at URL-state assertions (node=/schoolId/areaKey)
    // and never inspected a real network request the way Flow 1 (Area-first)
    // and Flow 3 (Agri-first) do — leaving map scope == panel scope
    // unproven for School-first.
    //
    // Investigated and confirmed LIVE (against this exact fixture/backend,
    // both via browser and via `useDiscoverMapDataController.ts`'s own
    // `markersEnabled` gate, current HEAD): for `journey === 'school-first'`,
    // markers are enabled ONLY while `!!nav.schoolId` is true ("top-level
    // school-first browsing without schoolId leaves markers disabled since
    // useDiscoverFilteredMarkers needs schoolLat/schoolLon to be meaningful"
    // — the exact source comment). This re-pick clears schoolId in the SAME
    // atomic write that resolves node=, so `/api/discover/markers` is NEVER
    // requested here — confirmed live: this exact interaction against this
    // fixture fires ONLY `/api/discover/cities/bangalore/listings?areaKeys=…`,
    // no markers call at all. So School-first's map/panel-scope invariant is
    // NOT "the same nodeKey" (Flow 1's shape) — there is no marker fetch to
    // compare — it is the same shape as Flow 3's inverse proof: the panel's
    // listings fetch is scoped to exactly the resolved AREA leaf, AND no
    // marker request (scoped or unscoped) ever fires to leak a stale/city-
    // wide fallback once schoolId is gone (mirrors Flow 5's own
    // `unscopedMarkersFired` negative control for the identical
    // markers-disabled state).
    let markersFired = false;
    page.on('request', (req) => {
      if (req.url().includes('/api/discover/markers')) markersFired = true;
    });

    const listingsPromise = page.waitForResponse(
      (r) =>
        r.url().includes(`/api/discover/cities/${CITY}/listings`) &&
        new URL(r.url()).searchParams.getAll('areaKeys').includes(AREA_RR_NAGAR_KEY),
    );

    // Real UI interaction: type into the shared control-bar area search and
    // pick a DIFFERENT canonical Area (RR Nagar — a nav-tree AREA leaf).
    await page.getByTestId('control-bar-area-input').fill('RR Nagar');
    await expect(page.getByTestId('control-bar-area-listbox')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId(`control-bar-area-option-${AREA_RR_NAGAR_KEY}`).click();
    const listingsRes = await listingsPromise;

    await expect.poll(() => currentParam(page, 'node')).toBe(AREA_RR_NAGAR_NODE);
    expect(currentParam(page, 'journey'), 'journey is NEVER converted away from school-first').toBe(
      'school-first',
    );
    expect(currentParam(page, 'schoolId'), 'schoolId is cleared in the SAME atomic write').toBeNull();
    expect(currentParam(page, 'areaKey'), 'the stale legacy areaKey is cleared in the SAME write (PR #2211 fix)').toBeNull();
    expect(currentParam(page, 'groupId'), 'groupId is never touched by an Area re-pick').toBeNull();

    // THE INVARIANT: panel scope is exactly the resolved AREA leaf, proven
    // directly off the real captured network request (not just URL state —
    // the same standard Flow 1/Flow 3 hold themselves to), AND no marker
    // request of any scope leaks once schoolId (the only thing that enables
    // school-first markers) is gone.
    const listingsUrl = new URL(listingsRes.url());
    expect(
      listingsUrl.searchParams.getAll('areaKeys'),
      'panel listings fetch is scoped to exactly the resolved AREA leaf key',
    ).toEqual([AREA_RR_NAGAR_KEY]);
    expect(
      markersFired,
      'no /api/discover/markers request (scoped or unscoped) fires once schoolId is cleared — school-first markers require an active schoolId',
    ).toBe(false);

    // Exactly ONE PUSH for this single deliberate re-pick — never a
    // double-history-entry regression.
    const historyAfter = await historyLength(page);
    expect(historyAfter - historyBefore).toBe(1);

    // Back/Forward round-trip.
    await page.goBack();
    await expect.poll(() => currentParam(page, 'node')).toBeNull();
    expect(currentParam(page, 'schoolId')).toBe(SCHOOL_ID_KORAMANGALA);
    await page.goForward();
    await expect.poll(() => currentParam(page, 'node')).toBe(AREA_RR_NAGAR_NODE);
    expect(currentParam(page, 'schoolId')).toBeNull();
    expect(currentParam(page, 'journey')).toBe('school-first');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// FLOW 3 — Agri-first canonical geography (#2203)
// ─────────────────────────────────────────────────────────────────────────
test.describe('@integration-ui #2204 — Agri-first canonical geography selection', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  test.beforeEach(async ({ page }) => {
    await grantTelemetryConsent(page);
  });

  test('picking a new Area preserves journey + region/maxKm, clears selectedLocality AND stale areaKey, map scope == panel scope', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    // Cold-load with a corridor (region/maxKm), a destKey-based locality, AND
    // a stale legacy areaKey already present.
    await page.goto(
      `/discover?city=${CITY}&journey=agri-first&region=E&maxKm=25&destKey=${encodeURIComponent(
        AREA_KORAMANGALA_KEY,
      )}&areaKey=${encodeURIComponent(AREA_KORAMANGALA_KEY)}`,
    );
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('control-bar-area-input')).toBeVisible({ timeout: 20_000 });
    expect(currentParam(page, 'region')).toBe('E');
    expect(currentParam(page, 'maxKm')).toBe('25');
    expect(currentParam(page, 'destKey')).toBe(AREA_KORAMANGALA_KEY);

    // Finding 3 fix (PR #2212 review): unlike Flow 1's marker fetch, agri-
    // first's marker request never carries a distinguishing query param
    // (rule 3 keeps it unscoped regardless of node=), so a stale prior-hop
    // in-flight request can't be ruled out via URL params here. Rather than
    // an outright `waitForLoadState('networkidle')` — this page keeps enough
    // low-level background traffic (map tiles, telemetry) that "idle" is
    // never reached and the wait silently eats the whole test timeout —
    // collect every /api/discover/markers response for the FULL test
    // lifetime into an array, snapshot its length right before the click,
    // then require the length to grow. Any response counted after the
    // snapshot is guaranteed to have arrived strictly after the click was
    // issued, which a stale hop response already resolved earlier could not.
    const markerResponses: Awaited<ReturnType<typeof page.waitForResponse>>[] = [];
    page.on('response', (r) => {
      if (r.url().includes('/api/discover/markers')) markerResponses.push(r);
    });

    const historyBefore = await historyLength(page);

    await page.getByTestId('control-bar-area-input').fill('RR Nagar');
    await expect(page.getByTestId('control-bar-area-listbox')).toBeVisible({ timeout: 10_000 });
    // markerScope.ts rule 3 ("agri-first -> city. Byte-identical to
    // pre-existing behaviour", verified from source) means agri-first's map
    // fetch is DELIBERATELY unscoped city-wide REGARDLESS of node= — it never
    // reaches rule 5's node-scope. So the map/panel "scope" proof for
    // agri-first is the INVERSE of area-first's: the marker fetch must carry
    // NEITHER nodeKey NOR areaKeys even once a canonical Area is resolved —
    // proving the migrated node= write never accidentally narrows/leaks the
    // map's documented city-wide agri scope (the "no unintended geography
    // param newly emitted" half of the owner ruling, applied to the marker
    // fetch itself rather than the URL).
    // Finding 2 fix (PR #2212 review): the map-side proof above (markers stay
    // unscoped) never established the PANEL side of "map scope == panel
    // scope" — only the URL `node=` param proved the write happened, not
    // that the real listings query actually requested that scope. Mirror
    // Flow 1/Flow 2's exact pattern: capture the real
    // `/api/discover/cities/${CITY}/listings` response fired by this SAME
    // click and assert its `areaKeys` param equals the resolved RR Nagar
    // area key — the exact #1806 defect class (URL says one thing, actual
    // fetch scope says another) this whole suite exists to catch.
    const listingsPromise = page.waitForResponse(
      (r) =>
        r.url().includes(`/api/discover/cities/${CITY}/listings`) &&
        new URL(r.url()).searchParams.getAll('areaKeys').includes(AREA_RR_NAGAR_KEY),
    );

    const markerResponseCountBeforeClick = markerResponses.length;
    const option = page.getByTestId(`control-bar-area-option-${AREA_RR_NAGAR_KEY}`);
    await option.waitFor({ state: 'visible', timeout: 10_000 });
    await option.click();
    const [, listingsRes] = await Promise.all([
      expect.poll(() => markerResponses.length, { timeout: 45_000 }).toBeGreaterThan(
        markerResponseCountBeforeClick,
      ),
      listingsPromise,
    ]);
    const markersRes = markerResponses[markerResponses.length - 1];

    await expect.poll(() => currentParam(page, 'node')).toBe(AREA_RR_NAGAR_NODE);
    expect(currentParam(page, 'journey'), 'journey is NEVER converted away from agri-first').toBe('agri-first');
    expect(currentParam(page, 'region'), 'selectedRegion is PRESERVED across an Area re-pick').toBe('E');
    expect(currentParam(page, 'maxKm'), 'selectedMaxKm is PRESERVED across an Area re-pick').toBe('25');
    expect(currentParam(page, 'destKey'), 'the geography-dependent selectedLocality leaf is cleared').toBeNull();
    expect(currentParam(page, 'locality'), 'the legacy locality alias is also cleared').toBeNull();
    expect(currentParam(page, 'town'), 'the legacy town alias is also cleared').toBeNull();
    expect(currentParam(page, 'areaKey'), 'the stale legacy areaKey is cleared in the SAME write').toBeNull();

    const markersUrl = new URL(markersRes.url());
    expect(markersUrl.searchParams.get('nodeKey'), 'agri-first marker fetch stays unscoped (rule 3) even after a node= resolves').toBeNull();
    expect(markersUrl.searchParams.getAll('areaKeys'), 'agri-first marker fetch never narrows to areaKeys either').toEqual([]);

    // THE PANEL-SIDE HALF of "map scope == panel scope" (Finding 2 fix):
    // unlike Flow 1 (where map+panel share the same node-derived scope),
    // agri-first's map is deliberately unscoped (proven above) — but the
    // PANEL must still be genuinely scoped to the resolved AREA leaf. Proven
    // directly off the real captured network request, not just the URL's
    // node= param (the exact #1806 defect class: URL says one thing, actual
    // fetch scope says another).
    const listingsUrl = new URL(listingsRes.url());
    expect(
      listingsUrl.searchParams.getAll('areaKeys'),
      'agri-first panel listings fetch is scoped to exactly the resolved AREA leaf key',
    ).toEqual([AREA_RR_NAGAR_KEY]);

    const historyAfter = await historyLength(page);
    expect(historyAfter - historyBefore, 'exactly one PUSH for one deliberate Area re-pick').toBe(1);

    // Back/Forward round-trip.
    await page.goBack();
    await expect.poll(() => currentParam(page, 'node')).toBeNull();
    expect(currentParam(page, 'destKey')).toBe(AREA_KORAMANGALA_KEY);
    expect(currentParam(page, 'region')).toBe('E');
    await page.goForward();
    await expect.poll(() => currentParam(page, 'node')).toBe(AREA_RR_NAGAR_NODE);
    expect(currentParam(page, 'destKey')).toBeNull();
    expect(currentParam(page, 'region')).toBe('E');
    expect(currentParam(page, 'maxKm')).toBe('25');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// FLOW 4 — Journeyless / group overview behaviour (#2201)
// ─────────────────────────────────────────────────────────────────────────
test.describe('@integration-ui #2204 — Journeyless group overview (#2201 canonical groupId identity)', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  test.beforeEach(async ({ page }) => {
    await grantTelemetryConsent(page);
  });

  test('journeyless groupId= producer-equivalent state: groupId is the only group identity, panel/map coherence is honestly proven (or its absence documented), and a real subsequent nav hop cannot be poisoned by the stale groupId', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    // OWNER RULING CORRECTION (PR #2212, 2026-08-18) — the prior version of
    // this Flow deep-loaded `journey=area-first&groupId=south-premium`, which
    // the owner ruled is a DIFFERENT, stale/compatibility state from the
    // issue's actual journeyless/group requirement. The real PRODUCER
    // (`useDiscoverOverviewNavigationController.ts`'s `handleOverviewAreaClick`,
    // wired as `onAreaClick` on the map overview layer, calling
    // `actions.selectGroup(...)` while `journey` is still absent) never writes
    // an explicit `journey=` param — it lands at `groupId=south-premium` with
    // no `node=`, no `areaKey`, no `journey=` in the URL. Corrected entry URL
    // below matches that producer-equivalent URL SHAPE exactly (narrowed
    // Option A, direct-load ACCEPTED_DEVIATION for the ENTRY mechanism only —
    // see this file's PR body for the full ruling).
    //
    // ENVIRONMENT LIMITATION (carried forward, still accurate) — the real
    // first hop of that producer chain (a macro-region bubble click) is
    // categorically unreachable against this fixture: `city_regions` /
    // `city_region_memberships` are BOTH EMPTY for every city (live-verified,
    // `SELECT count(*)` = 0), so `useDiscoverMapPresentation.ts`'s
    // `'macro-region-bubbles'` layer never renders a clickable bubble — there
    // is no first hop to click. Populating those tables for real requires the
    // heavyweight `CityRegionOnboardingService` city-launch job against the
    // SAME shared, concurrently-used `pg-test-fixture` container (out of
    // scope for this QA pass — a deliberate, separate fixture-onboarding
    // change, not a code change). A prior investigation pass also tried
    // seeding one real listing onto an `area_groups` member area to make the
    // group-bubble level reachable; that single-listing seed was reverted in
    // full (row + fixture file removed, `totalActiveListings` confirmed back
    // to 0) after it caused Flow 3/Flow 5 regressions in a live full-suite
    // run — this fixture is in its known-clean state. `page.goto` remains the
    // only way to reach the producer-equivalent URL state itself; per the
    // ruling, that is accepted and sufficient to prove the state's contract
    // directly, without the first-hop click.
    //
    // WHAT ACTUALLY MOUNTS HERE — investigated live (this pass), and it is a
    // genuinely different mechanism than either party had assumed. Issue
    // #2088 item 3 (`src/features/discover/state/url/area.ts:61-95`) made a
    // bare `/discover` with NO explicit `journey=` param VIRTUALLY default to
    // `journey: 'area-first'` for any city with an active canonical
    // hierarchy (Bangalore has one) — UNLESS an explicit `scope=` param is
    // also present (the legacy-landing suppression escape hatch). This
    // default is applied ONCE at the single URL-read layer
    // (`useAreaUrlDomain`), so EVERY consumer of `nav.journey` — the panel
    // router's `isAreaFirstJourneyActive`, `derivePanelContent`'s badge
    // derivation, the JourneySwitcher's `aria-selected` — sees the SAME
    // virtually-resolved `'area-first'` value, never a raw `null`. The URL
    // ITSELF is never rewritten (confirmed live: `journey` stays absent from
    // the address bar throughout), so this flow's requirement — "no journey
    // param is ever fabricated in the URL" — still holds and is asserted
    // below; what changes is that `nav.journey` (the in-memory value every
    // component reads) is NOT `null` the way the ruling's "journey=null"
    // shorthand implied for a bare-city fixture like this one.
    //
    // CONSEQUENCE, live-verified via `navigation-level-panel`'s testid and
    // `journey-card-area-first`'s `aria-selected="true"`: the CANONICAL
    // `AreaFirstJourneyPanel` mounts directly (the same component/tree Flow 1
    // starts from), NOT `LegacyRightPanelBridge`/`AreaSelectionPanel`. This
    // component's own doc comment (quoted in this file's git history)
    // states it "ignores the stale params" (`groupId`/`areaKey`) and always
    // mounts the canonical Directions tree at city root — confirmed live
    // below: `groupId` has ZERO effect on the rendered tree, which is
    // byte-identical to Flow 1's bare `journey=area-first` root. This is
    // the SAME "server-owned compatibility identity with no live PANEL
    // consumer" pattern already established for Flow 5's school-first case —
    // proven directly here, not assumed.
    //
    // The MAP-layer badge is a SEPARATE consumer that DOES resolve `groupId`:
    // `focusedGroup` (`useDiscoverAreaGroupsController.ts`) resolves from
    // `groupId` ALONE (`resolveActiveDiscoverGroup`, journey-independent —
    // #2201's "groupId is the sole group-identity signal" invariant), and
    // `derivePanelContent`'s area-first branch (fed the SAME virtually-
    // resolved `journey: 'area-first'`, `areaKey: null`) returns
    // `'area-groups-landing'` — so `DiscoverMapCountBadge`'s
    // `resolvedPanelContent === 'area-groups-landing' && focusedGroup &&
    // !selectedArea` branch fires, rendering south-premium's real "No
    // listings here yet" copy off the live `/api/discover/area-groups`
    // payload — proven below against the real network response, not stubbed.
    const areaGroupsResponse = page.waitForResponse((r) => r.url().includes('/api/discover/area-groups'));
    // (2c) prep — track EVERY /api/discover/markers response for the full
    // test lifetime, registered before navigation so no response (whether
    // fired during initial load, during the badge-settle wait, or from an
    // explicit zoom click below) can race past an unregistered listener.
    // Mirrors Flow 3's own marker-response-array pattern (Finding 3 fix
    // rationale there applies identically here).
    const markerResponses: Awaited<ReturnType<typeof page.waitForResponse>>[] = [];
    page.on('response', (r) => {
      if (r.url().includes('/api/discover/markers')) markerResponses.push(r);
    });
    await page.goto(`/discover?city=${CITY}&groupId=${GROUP_SOUTH_PREMIUM}`);
    await page.waitForLoadState('domcontentloaded');
    const areaGroupsRes = await areaGroupsResponse;

    // ── (1) groupId is the ONLY group identity ever WRITTEN to the URL —
    // the virtual journey default above never rewrites the address bar. ──
    expect(currentParam(page, 'journey'), 'no journey param is ever fabricated in the URL itself').toBeNull();
    expect(currentParam(page, 'node'), 'no canonical node= is ever fabricated for a group focus').toBeNull();
    expect(currentParam(page, 'areaKey'), 'no legacy areaKey is written for a pure group focus').toBeNull();
    expect(new URL(page.url()).searchParams.getAll('areaKeys'), 'no legacy areaKeys= plural alias either').toEqual([]);
    expect(currentParam(page, 'groupId')).toBe(GROUP_SOUTH_PREMIUM);

    // ── (2a) PANEL side: the CANONICAL Directions tree mounts (#2088's
    // virtual area-first default) and is proven GROUP-BLIND — the exact same
    // 3 Direction cards Flow 1 renders from a bare journey=area-first root,
    // with no group-scoped affordance anywhere in it. ──
    await expect(page.getByTestId('navigation-level-panel')).toBeVisible({ timeout: 20_000 });
    const navCards = await page
      .locator('[data-testid^="navigation-child-card-"]:not([data-testid*="-listings-"]):not([data-testid*="-count-"])')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')).sort());
    expect(
      navCards,
      'the canonical tree is byte-identical to Flow 1s bare area-first root — groupId has zero effect on it',
    ).toEqual([
      'navigation-child-card-d:northeast',
      'navigation-child-card-d:southeast',
      'navigation-child-card-d:southwest',
    ]);
    expect(
      await page.getByTestId('area-group-card-south-premium').count(),
      'no group-scoped card content renders — the canonical panel never reads groupId at all',
    ).toBe(0);

    // ── (2b) MAP/BADGE side: the real, journey-independent groupId consumer
    // DOES resolve south-premium off the live backend payload — a genuinely
    // DIFFERENT consumer than the panel, proven separately rather than
    // conflated. ──
    const areaGroupsBody = await areaGroupsRes.json();
    const southPremiumGroup = (areaGroupsBody?.groups ?? []).find(
      (g: { slug?: string }) => g.slug === GROUP_SOUTH_PREMIUM,
    );
    expect(southPremiumGroup, 'south-premium group is present in the real /api/discover/area-groups payload').toBeTruthy();
    expect(
      new Set(southPremiumGroup.areaKeys),
      'south-premium resolves to exactly its 3 real member areaKeys, backing the badge total',
    ).toEqual(new Set([AREA_KORAMANGALA_KEY, AREA_JAYANAGAR_KEY, AREA_HSR_LAYOUT_KEY]));
    const badge = page.getByTestId('discover-badge');
    await expect(badge).toBeVisible({ timeout: 15_000 });
    await expect(badge).toHaveText('No listings here yet');

    // ── (2c) REVIEWER-BOT "Reading B" RULING (2026-08-18) — investigated and
    // LIVE-CONFIRMED this pass, correcting the prior QA pass's premise. The
    // prior pass only checked the page-level BADGE (2b above) and treated it
    // as the same class of asymmetry as Flow 5's badge-only case (no marker
    // fetch ever fires there). That premise is WRONG for Flow 4: at THIS
    // journeyless groupId= state, once the map is zoomed in past the
    // area-overview band (AREA_LAYER_MAX_ZOOM=12 — a completely ordinary user
    // gesture, the `.leaflet-control-zoom-in` control, requiring NO click
    // producer and no drill-down), `markersEnabled` in
    // `useDiscoverMapDataController.ts` flips true (isTopGroupedLevel is
    // FALSE here specifically because `nav.groupId` is set — see that file's
    // `isTopGroupedLevel` derivation), and `useDiscoverAreaGroupsController
    // .ts`'s `groupAreaKeysForMapData` (line 91: `if (!groupId) return
    // undefined`) resolves off `groupId` ALONE, journey-independent. That
    // feeds `resolveDiscoverMarkerScope`'s live-mode rule 6 (`markerScope.ts`)
    // to `{ kind: 'areas', areaKeys: group.area_keys }` — a REAL, live
    // `/api/discover/markers` request narrows to exactly south-premium's 3
    // member areas, live-verified below off the actual network response —
    // while the panel (proven group-blind in (2a) above) keeps rendering the
    // 3 unrelated Direction cards (northeast/southeast/southwest), which have
    // no relationship to south-premium's own areas (Koramangala/Jayanagar/HSR
    // Layout, all south Bangalore). This IS a genuine #1806-class map/panel
    // scope divergence — NOT the same asymmetry as Flow 5's badge-only case,
    // where no marker fetch ever fires in any of that flow's states so there
    // is no map SCOPE to disagree with the panel about. Confirming the
    // reviewer-bot's Reading B ruling was correct on the merits, not merely
    // asserted.
    //
    // #2204 SCOPE BOUNDARY: this PR is evidence-only (every prior owner
    // ruling on this issue forbids product-code changes here). This divergence
    // is a genuine PRODUCT bug in `useDiscoverAreaGroupsController.ts`'s
    // `groupAreaKeysForMapData` / `markerScope.ts` rule 6 — group-scoping the
    // map's marker fetch off raw `groupId` regardless of which panel actually
    // mounts — and is out of scope for this PR to fix. It is documented here,
    // precisely and with live network evidence, and escalated in the PR body
    // as a found regression risk for a follow-up issue.
    const zoomInBtn = page.locator('.leaflet-control-zoom-in');
    await zoomInBtn.waitFor({ state: 'visible', timeout: 10_000 });
    // Snapshot count BEFORE clicking — any response counted after this point
    // is guaranteed to reflect the post-click map state, whether it was
    // triggered by an earlier camera intent (e.g. a group-focus fitBounds
    // already zoomed the map in during the badge-settle wait above — live-
    // observed to happen) or strictly by the clicks below.
    const markerResponseCountBeforeZoom = markerResponses.length;
    // 3 clicks: zoom 11 (Bangalore default) -> 14, safely past the
    // AREA_LAYER_MAX_ZOOM=12 threshold (live-verified: 2 clicks already
    // crosses it). Button clicks only, matching this repo's existing
    // zoom-simulation convention (never mouse.wheel — see
    // e2e/discover-agri-journey-1375.spec.ts).
    await zoomInBtn.click();
    await page.waitForTimeout(600);
    await zoomInBtn.click();
    await page.waitForTimeout(600);
    await zoomInBtn.click();
    await page.waitForTimeout(600);
    // If a group-focus camera intent already zoomed the map in (and fired a
    // scoped marker fetch) BEFORE these clicks, markerResponses already holds
    // it — the poll below tolerates that by falling back to the newest
    // /api/discover/markers response seen so far once no NEW one arrives
    // shortly after the clicks (React Query may not refire on an unchanged
    // bbox/query-key if zoom was already past the threshold pre-click).
    await expect
      .poll(() => markerResponses.length, { timeout: 15_000 })
      .toBeGreaterThan(0);
    // Give any in-flight post-click fetch a moment to land, then use the
    // LATEST captured response — this proves the divergence exists at the
    // current (zoomed-in) map state regardless of exactly which click/intent
    // triggered the fetch that produced it.
    await page.waitForTimeout(1_500);
    void markerResponseCountBeforeZoom; // documents intent; not asserted directly — see comment above
    const scopedMarkersRes = markerResponses[markerResponses.length - 1];
    const scopedMarkersUrl = new URL(scopedMarkersRes.url());
    expect(
      new Set(scopedMarkersUrl.searchParams.getAll('areaKeys')),
      'FOUND DIVERGENCE (documented, not fixed here): once zoomed in, the map marker fetch genuinely narrows to south-premium\'s 3 member areaKeys off groupId alone',
    ).toEqual(new Set([AREA_KORAMANGALA_KEY, AREA_JAYANAGAR_KEY, AREA_HSR_LAYOUT_KEY]));

    // Meanwhile the panel's OWN rendered tree is UNCHANGED by the zoom — still
    // the same group-blind, unrelated Direction-card set proven in (2a). The
    // map is now showing south-premium-scoped pins while the panel shows
    // navigation cards for a completely different (unrelated) geography — the
    // divergence, made concrete.
    const navCardsAfterZoom = await page
      .locator('[data-testid^="navigation-child-card-"]:not([data-testid*="-listings-"]):not([data-testid*="-count-"])')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')).sort());
    expect(
      navCardsAfterZoom,
      'the panel never reacts to the now-scoped map — it keeps rendering the same group-blind Direction tree, confirming the divergence is real (map narrows, panel does not)',
    ).toEqual(navCards);

    // ── (3) A REAL subsequent navigation step — click into a Direction card
    // (the ruling's own first-listed example, directly available here since
    // the canonical tree is already mounted) — then Back/Forward. This is
    // THE canonical node= producer Flow 1 also uses; here it proves the
    // stale `groupId` sitting in the URL cannot poison it. ──
    const historyBefore = await historyLength(page);
    await page.getByTestId(`navigation-child-card-${D_NORTHEAST}`).click();
    await expect.poll(() => currentParam(page, 'node')).toBe(D_NORTHEAST);
    expect(currentParam(page, 'areaKey'), 'the node= hop never writes a legacy areaKey').toBeNull();
    // groupId is NOT cleared by a plain node hop (verified live: goToNode only
    // ever writes/deletes the node param) — it keeps sitting inert in the URL,
    // exactly as it did before the hop. That inertness (proven in (2a) above:
    // the canonical panel never reads it) IS the "cannot poison" proof — a
    // stale compatibility param surviving unread is categorically different
    // from it corrupting the resolved scope, which the map/panel assertions
    // below rule out directly.
    expect(currentParam(page, 'groupId'), 'groupId survives inertly; it never re-routes or corrupts the node= scope').toBe(
      GROUP_SOUTH_PREMIUM,
    );
    expect(currentParam(page, 'journey'), 'journey stays virtually-defaulted, never literally written').toBeNull();

    const historyAfter = await historyLength(page);
    expect(historyAfter - historyBefore, 'exactly 1 PUSH entry for the 1 deliberate Direction-card hop').toBe(1);

    // Back returns to the EXACT original journeyless(+virtual-area-first)
    // groupId entry state; Forward re-enters the node= hop correctly — and
    // neither leg ever resurrects a legacy areaKey.
    await page.goBack();
    await expect.poll(() => currentParam(page, 'node')).toBeNull();
    expect(currentParam(page, 'groupId'), 'Back restores the EXACT original entry state, groupId included').toBe(
      GROUP_SOUTH_PREMIUM,
    );
    expect(currentParam(page, 'areaKey')).toBeNull();
    await expect(page.getByTestId('navigation-level-panel')).toBeVisible({ timeout: 15_000 });

    await page.goForward();
    await expect.poll(() => currentParam(page, 'node')).toBe(D_NORTHEAST);
    expect(currentParam(page, 'groupId'), 'Forward re-enters the node= hop; groupId still just sits inert').toBe(
      GROUP_SOUTH_PREMIUM,
    );
    expect(currentParam(page, 'areaKey'), 'Forward never resurrects a legacy areaKey either').toBeNull();

    // ── VERDICT (this pass, CORRECTED per reviewer-bot Reading B) — recorded
    // verbatim: canonical AreaFirstJourneyPanel mounts (via #2088's virtual
    // area-first default, live-discovered this pass — not the ruling's
    // literal "journey=null" shorthand, which does not hold for a city with
    // an active hierarchy like this fixture's Bangalore); groupId is the sole
    // group identity ever WRITTEN to the URL (journey/node/areaKey are never
    // fabricated); the canonical panel is proven group-blind (byte-identical
    // Direction-card set with or without groupId, unchanged even after the
    // map is zoomed in); the map/badge layer IS a real, separate groupId
    // consumer, proven against the live /api/discover/area-groups payload;
    // AND — the corrected finding — once the map is zoomed in past the
    // area-overview band (an ordinary user gesture, no click producer
    // required), the map's OWN marker fetch genuinely narrows to
    // south-premium's 3 member areaKeys while the panel stays on its
    // unrelated Direction-card tree: a REAL, live-reproduced #1806-class
    // map/panel scope divergence (2c above), NOT the same asymmetry as Flow
    // 5's badge-only case. This is a genuine PRODUCT bug in
    // `useDiscoverAreaGroupsController.ts`'s `groupAreaKeysForMapData` /
    // `markerScope.ts` rule 6 (group-scopes the map off raw `groupId`
    // regardless of which panel actually mounts) — documented here with live
    // network evidence and escalated in the PR body as out-of-scope for this
    // evidence-only PR to fix. Separately: a real node= hop (Direction-card
    // click) resolves correctly and groupId neither poisons nor is cleared by
    // it — it survives purely inertly; and Back/Forward round-trips exactly,
    // never resurrecting a legacy areaKey. ──
  });
});

// ─────────────────────────────────────────────────────────────────────────
// FLOW 5 — School-browse / school-group-areas (no schoolId) — #2188 §C2
// ─────────────────────────────────────────────────────────────────────────
test.describe('@integration-ui #2204 — School-browse / school-group-areas (no schoolId) — #2188 §C2', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  test.beforeEach(async ({ page }) => {
    await grantTelemetryConsent(page);
  });

  // #2205 BOUNDARY (owner ruling, PR #2212, 2026-08-18) — this flow proves the
  // legacy `SchoolGroupAreasPanel` is unreachable AND that direct-loading the
  // `groupId` compatibility state is handled safely by the canonical school
  // navigation surface. It does NOT prove `groupAreaKeysForMapData`
  // (src/features/discover/...) or `markerScope.ts`'s live-mode `areas` rule
  // 6 are dead code — those are a distinct scope-DERIVATION concern from the
  // panel-MOUNTING concern this flow tests, and #2205 must independently
  // re-verify their reachability/consumers on its own deletion head rather
  // than inferring deadness from this flow's panel finding.
  //
  // REVISED CONTRACT (owner ruling, PR #2212, 2026-08-18) — supersedes the
  // original #2188 §C2 "school-browse -> school-group-areas" design this test
  // used to target. The owner independently confirmed the architecture: the
  // legacy `SchoolGroupAreasPanel` (reached via `school-zone-card-*` clicks)
  // is unreachable on the live `/discover` route because
  // `isSchoolsNavNodeLevel` (`useDiscoverNavigationController.ts`) never
  // checks `groupId` and pre-empts `LegacyRightPanelBridge` in
  // `DiscoverPanelSurface.tsx`'s branch order — but a dead PANEL does not
  // prove the legacy scope-derivation machinery is dead too. Do NOT restore
  // the panel, do NOT add fixture data to force reachability, do NOT drop
  // this flow as not-applicable. Instead, prove the actual REACHABLE
  // compatibility state: `journey=school-first&groupId=south-premium` with no
  // `schoolId`/`areaKey`/`node`. A direct URL load is acceptable here ONLY
  // because no shipped UI producer of this exact state exists (confirmed
  // below) — every in-app zone-card/group affordance that used to write
  // `groupId` for school-first was itself part of the now-unreachable legacy
  // panel, so there is no live click path INTO this combination either.
  test('direct-load groupId compatibility state: canonical school navigation mounts, legacy panel absent, no fabricated node=/areaKey, no map/panel divergence, groupId cannot poison a real canonical nav hop', async ({
    page,
  }) => {
    test.setTimeout(60_000);

    // Track every /api/discover/markers request for the FULL test lifetime —
    // reused across both the with-groupId and without-groupId legs below.
    const markerRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/discover/markers')) markerRequests.push(req.url());
    });

    // ── Step 1 — the reachable compatibility state: groupId present, no
    // schoolId/areaKey/node. Live-verified (this exact fixture/backend, both
    // browser probe and source): there is no live click path that produces
    // this combination — every affordance that used to write `groupId` while
    // in school-first belonged to the now-unreachable `SchoolBrowsePanel`
    // zone cards. Direct URL load is the only way to reach it, matching the
    // ruling's stated exception. ──
    markerRequests.length = 0;
    await page.goto(`/discover?city=${CITY}&journey=school-first&groupId=${GROUP_SOUTH_PREMIUM}`);
    await page.waitForLoadState('domcontentloaded');

    // (1) Canonical panel mounts; legacy panel is absent from the DOM.
    await expect(page.getByTestId('discover-schools-journey-panel-shell')).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId('schools-journey-panel')).toBeVisible();
    expect(
      await page.getByTestId('school-group-areas-list').count(),
      'legacy SchoolGroupAreasPanel never mounts for this URL',
    ).toBe(0);
    expect(
      await page.getByTestId('school-zones-list').count(),
      'legacy SchoolBrowsePanel zone-card list never mounts for this URL either',
    ).toBe(0);

    // (2) URL retains groupId (server-owned compatibility identity) but no
    // fabricated node=, and no legacy areaKey/areaKeys is ever emitted.
    expect(currentParam(page, 'groupId'), 'groupId is retained verbatim').toBe(GROUP_SOUTH_PREMIUM);
    expect(currentParam(page, 'node'), 'no canonical node= is fabricated for a group-only load').toBeNull();
    expect(currentParam(page, 'areaKey'), 'no legacy areaKey is emitted').toBeNull();
    expect(currentParam(page, 'schoolId')).toBeNull();
    expect(new URL(page.url()).searchParams.getAll('areaKeys')).toEqual([]);
    expect(currentParam(page, 'journey')).toBe('school-first');

    // The canonical nav-tree renders the SAME 3 Direction cards a groupId-less
    // load renders (captured for the direct with/without-groupId comparison
    // in Step 2 below) — groupId is not consulted by the mounted panel's own
    // tree content.
    const navCardsWithGroupId = await page
      .locator('[data-testid^="navigation-child-card-"]:not([data-testid*="-listings-"]):not([data-testid*="-count-"])')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')).sort());
    expect(navCardsWithGroupId).toEqual([
      'navigation-child-card-d:northeast',
      'navigation-child-card-d:southeast',
      'navigation-child-card-d:southwest',
    ]);

    // Live-verified: the school-first markers gate requires an active
    // schoolId (same finding as Flow 2/Flow 5's old negative control) — no
    // /api/discover/markers request of any scope fires while browsing this
    // groupId-present state, so there is no map-vs-panel node/area scope to
    // compare.
    await page.waitForTimeout(2_000);
    expect(markerRequests, 'no /api/discover/markers request fires (schoolId absent)').toEqual([]);

    // ── Honest, non-#1806-class page-level difference (NOT part of the
    // canonical panel's own content, and NOT a map-scope leak): the
    // page-level `DiscoverMapCountBadge` independently resolves `focusedGroup`
    // off the raw `groupId` param — the exact "scope-derivation machinery"
    // the #2205-boundary note above says this flow does NOT prove dead. It
    // renders `Showing 3 schools` (south-premium's real member schoolCount
    // sum: Koramangala 2 + Jayanagar 0 + HSR Layout 1 = 3, live-verified via
    // GET /api/discover/areas?city=bangalore against this fixture, same value
    // this file's docblock documents), even though the mounted panel's OWN
    // tree content is groupId-blind (proven identical above/below). This is
    // NOT a map/panel scope divergence in the #1806 sense — no marker or
    // listings request carries a mismatched scope, since no marker request
    // fires at all (asserted above) — it is a real, deterministic,
    // backend-derived badge that a live shopper would see alongside the
    // canonical (not legacy) tree. Recorded explicitly rather than glossed
    // over or asserted away. ──
    const badgeWithGroupId = page.getByTestId('discover-badge');
    await expect(badgeWithGroupId).toBeVisible({ timeout: 15_000 });
    await expect(badgeWithGroupId).toHaveText('Showing 3 schools');

    // ── Step 2 — the equivalent School-first root state WITHOUT groupId. ──
    // Finding 1 fix (PR #2212 review): the original version of this leg
    // asserted `toBeHidden()` on the badge immediately after the panel
    // became visible — before the async `/api/discover/areas` fetch behind
    // `discoverAreas`/`schoolFirstLandingSchoolCount` had settled. That is a
    // race-condition false-pass shape, even though (see below) it happens to
    // land on the correct outcome here.
    //
    // Source trace (`DiscoverMapCountBadge.tsx`'s school-first LANDING
    // branch, `deriveSchoolFirstLandingSchoolCount` in schoolFirstCounts.ts)
    // predicted this branch WOULD render "Showing N schools" city-wide once
    // `discoverAreas` settles, since `focusedGroup`/`selectedArea` are both
    // null here and `schoolFirstLandingSchoolCount` is a real non-null sum
    // once loaded. Empirically re-run against this exact fixture/backend
    // (3 consecutive full runs), that prediction does NOT hold: the
    // `discover-badge` testid never appears in the DOM at all at this exact
    // URL, even after `/api/discover/areas` has resolved and the panel is
    // fully settled — `getByTestId('discover-badge')` reports 0 matches, not
    // a hidden/off-screen element. `DiscoverMapCountBadge` is rendered
    // inside `DiscoverMapCanvas.tsx`, so the map/canvas surface itself is
    // evidently not mounted (or not in a state that reaches that branch) for
    // this plain school-first root the way it is once a groupId is present
    // (Step 1, which DOES find and render the badge). The exact reason a
    // groupId presence changes map-canvas mounting is outside this flow's
    // scope (#2205-boundary note above) — what matters for THIS flow's
    // contract is the observable outcome: no badge, so no map/panel scope to
    // compare, exactly like the with-groupId leg's marker negative control.
    // So the original assertion's OUTCOME was correct; only the missing wait
    // was the defect. Fixed below: wait for the real `/api/discover/areas`
    // response (a genuine settle signal) before asserting, rather than
    // asserting on whatever the DOM happens to look like immediately after
    // `domcontentloaded`.
    const areasResponsePromise = page.waitForResponse(
      (r) => r.url().includes('/api/discover/areas') && new URL(r.url()).searchParams.get('city') === CITY,
    );
    markerRequests.length = 0;
    await page.goto(`/discover?city=${CITY}&journey=school-first`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('schools-journey-panel')).toBeVisible({ timeout: 20_000 });
    expect(currentParam(page, 'groupId')).toBeNull();
    expect(currentParam(page, 'node')).toBeNull();
    expect(currentParam(page, 'areaKey')).toBeNull();

    // Real settle signal — the same live `/api/discover/areas` fetch that
    // drives `schoolFirstLandingSchoolCount` — awaited BEFORE the badge
    // assertion below, closing the race the original version had.
    await areasResponsePromise;

    // THE INVARIANT this step exists to prove: the canonical panel's OWN
    // rendered geography (the Direction-card tree) is byte-identical whether
    // or not a stale groupId is present — groupId has no effect on the
    // canonical router's own content, exactly as the owner ruling states.
    const navCardsWithoutGroupId = await page
      .locator('[data-testid^="navigation-child-card-"]:not([data-testid*="-listings-"]):not([data-testid*="-count-"])')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')).sort());
    expect(
      navCardsWithoutGroupId,
      'canonical panel renders the identical Direction-card set with or without a stale groupId',
    ).toEqual(navCardsWithGroupId);

    await page.waitForTimeout(2_000);
    expect(
      markerRequests,
      'no /api/discover/markers request fires here either (schoolId absent) — same negative control as the with-groupId leg',
    ).toEqual([]);

    // THE INVARIANT this leg exists to prove (post-fix, empirically
    // confirmed after waiting for the real `/api/discover/areas` settle
    // signal above, across 3 consecutive full runs): the page-level badge
    // does NOT render at this plain root — genuinely absent from the DOM,
    // not merely CSS-hidden — unlike the with-groupId leg above. This is now
    // proven with a real settle-wait behind it rather than an assertion that
    // happened to run before any async data had a chance to change the
    // outcome.
    await expect(page.getByTestId('discover-badge')).toBeHidden();

    // ── Step 3 — a REAL canonical nav hop from the groupId-present state,
    // then Back/Forward, proving the stale groupId cannot poison the
    // resulting canonical node= navigation and never resurrects areaKey. ──
    await page.goto(`/discover?city=${CITY}&journey=school-first&groupId=${GROUP_SOUTH_PREMIUM}`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId(`navigation-child-card-${D_NORTHEAST}`)).toBeVisible({
      timeout: 20_000,
    });
    const historyBefore = await historyLength(page);

    await page.getByTestId(`navigation-child-card-${D_NORTHEAST}`).click();
    await expect.poll(() => currentParam(page, 'node')).toBe(D_NORTHEAST);
    // `enterSchoolsJourney` (state/url/navigation.ts) clears the stale
    // groupId in the SAME atomic write that resolves the canonical node= —
    // the groupId compatibility param does not survive into (and therefore
    // cannot poison) real canonical navigation.
    expect(currentParam(page, 'groupId'), 'the stale groupId is cleared by the real canonical nav hop').toBeNull();
    expect(currentParam(page, 'areaKey'), 'no areaKey is ever resurrected by the hop').toBeNull();
    expect(currentParam(page, 'journey')).toBe('school-first');

    const historyAfter = await historyLength(page);
    expect(historyAfter - historyBefore, 'exactly one PUSH for the one deliberate Direction-card click').toBe(1);

    // Back returns to the groupId-present state; Forward returns to the
    // resolved node= — neither leg ever carries areaKey.
    await page.goBack();
    await expect.poll(() => currentParam(page, 'groupId')).toBe(GROUP_SOUTH_PREMIUM);
    expect(currentParam(page, 'node'), 'Back never resurrects the node= the hop produced').toBeNull();
    expect(currentParam(page, 'areaKey')).toBeNull();

    await page.goForward();
    await expect.poll(() => currentParam(page, 'node')).toBe(D_NORTHEAST);
    expect(currentParam(page, 'groupId'), 'Forward does not resurrect the stale groupId either').toBeNull();
    expect(currentParam(page, 'areaKey')).toBeNull();

    // ── VERDICT (owner's exact required wording, PR #2212 ruling,
    // 2026-08-18) — recorded verbatim, not paraphrased: "legacy
    // `school-group-areas` panel unreachable; direct-load `groupId`
    // compatibility state handled by canonical school navigation; no
    // #1806-class divergence observed." ──
  });
});
