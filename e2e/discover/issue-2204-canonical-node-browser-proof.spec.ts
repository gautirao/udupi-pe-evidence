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
// FAIL CLOSED (PR #2217 review) — unlike e2e/journey/*.spec.ts's hosted-URL
// fallback convention, this hard-gate spec must NEVER silently talk to any
// hosted/production backend: this whole PR exists because the gate's
// evidence was previously contaminated by an accidental non-fixture
// connection. An unset BACKEND_BASE_URL here must fail loudly, not default
// to production, or a dynamic identity resolution (e.g. resolveSchoolIdByAreaKey)
// could silently mix identities from a different environment than the one
// the browser is actually exercising.
const BACKEND = (() => {
  const url = process.env.BACKEND_BASE_URL;
  if (!url) {
    throw new Error(
      'issue-2204-canonical-node-browser-proof.spec.ts requires BACKEND_BASE_URL to be set ' +
        'to the local fixture backend (e.g. http://localhost:8090) — this hard-gate spec must ' +
        'never fall back to any hosted/production backend.',
    );
  }
  return url;
})();

// ── Area-first navigation tree (real, seeded) ───────────────────────────────
const D_NORTHEAST = 'd:northeast';
const CLUSTER_NE = 'c:northeast:hoskote-kannamangala-whitefield-hoskote-road';
const AREA_HOSKOTE_KEY = 'IN|KA|Bengaluru|Hoskote';
const AREA_HOSKOTE_NODE = 'a:IN|KA|Bengaluru|Hoskote';
const AREA_RR_NAGAR_KEY = 'IN|KA|Bengaluru|RR Nagar';
const AREA_RR_NAGAR_NODE = 'a:IN|KA|Bengaluru|RR Nagar';

// ── School-first fixture identity (real, seeded) ────────────────────────────
// bangalore-mangalore-schools-seed.sql inserts every school row via
// gen_random_uuid() (not a literal), so no fixed UUID is reseed-stable —
// resolved dynamically below via the public search-by-name endpoint (the
// seeded school's `name`, unlike its `id`, is a stable fixture literal) in
// this describe block's beforeAll, never hardcoded.
const SCHOOL_NAME_KORAMANGALA_QUERY = 'Bethany';
const AREA_KORAMANGALA_KEY = 'IN|KA|Bengaluru|Koramangala';

async function resolveSchoolIdByAreaKey(query: string, areaKey: string): Promise<string> {
  const res = await fetch(
    `${BACKEND}/api/public/schools/search?q=${encodeURIComponent(query)}&city=${CITY}&limit=10`,
  );
  if (!res.ok) {
    throw new Error(`resolveSchoolIdByAreaKey: search failed with ${res.status}`);
  }
  const results = (await res.json()) as Array<{ id: string; areaKey: string | null }>;
  const match = results.find((r) => r.areaKey === areaKey);
  if (!match) {
    throw new Error(
      `resolveSchoolIdByAreaKey: no school matching q="${query}" areaKey="${areaKey}" in fixture — reseed may have changed fixture data`,
    );
  }
  return match.id;
}

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
  let schoolIdKoramangala: string;

  test.beforeAll(async () => {
    schoolIdKoramangala = await resolveSchoolIdByAreaKey(
      SCHOOL_NAME_KORAMANGALA_QUERY,
      AREA_KORAMANGALA_KEY,
    );
  });

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
      `/discover?city=${CITY}&journey=school-first&schoolId=${schoolIdKoramangala}&areaKey=${encodeURIComponent(
        AREA_KORAMANGALA_KEY,
      )}`,
    );
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('control-bar-area-input')).toBeVisible({ timeout: 20_000 });
    expect(currentParam(page, 'schoolId')).toBe(schoolIdKoramangala);
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
    expect(currentParam(page, 'schoolId')).toBe(schoolIdKoramangala);
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

  test('journeyless groupId= producer-equivalent state: groupId is the only group identity, the panel now renders the SAME group scope the map narrows to (Issue #2213 fix), and a real subsequent nav hop cannot be poisoned by the stale groupId', async ({
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
    // is no first hop to click. `page.goto` remains the only way to reach the
    // producer-equivalent URL state itself; per the ruling, that is accepted
    // and sufficient to prove the state's contract directly, without the
    // first-hop click.
    //
    // Issue #2088 item 3 (`src/features/discover/state/url/area.ts:61-95`)
    // still makes a bare `/discover` with NO explicit `journey=` param
    // VIRTUALLY default to `journey: 'area-first'` for any city with an
    // active canonical hierarchy (Bangalore has one), applied ONCE at the
    // single URL-read layer (`useAreaUrlDomain`) — so `nav.journey` is never
    // a raw `null` here even though the URL itself is never rewritten
    // (confirmed below: `journey` stays absent from the address bar).
    //
    // Issue #2213 FIX (this pass) — `DiscoverPanelSurface.tsx` now checks
    // `resolveIsSelectedGroupState(resolvedPanelContent, focusedGroup,
    // selectedArea)` BEFORE `isAreaFirstJourneyActive`. Before this fix, that
    // ordering meant `isAreaFirstJourneyActive` (true here via the #2088
    // virtual default) always won, mounting the canonical
    // `AreaFirstJourneyPanel` GROUP-BLIND — the exact same 3 Direction cards
    // Flow 1 renders from a bare root, with `groupId` having zero effect —
    // while the map's marker fetch (`groupAreaKeysForMapData`, journey-
    // independent, resolved off `groupId` alone) already narrowed to
    // south-premium's 3 member areas once zoomed past the area-overview band.
    // A real, live-reproduced #1806-class map/panel scope divergence.
    //
    // The fix makes the group-focus branch win first: `AreaGroupFocusPanel`
    // now mounts, rendering the group's REAL member areas
    // (Koramangala/Jayanagar/HSR Layout) — the SAME `group.area_keys` the
    // map's `groupAreaKeysForMapData` already narrows the marker fetch to —
    // so panel and (post-zoom) map now describe the identical geography.
    // Selecting a member area resolves it through the SAME sanctioned
    // `.../navigation-path` server endpoint `handleSelectJourney` already
    // uses (never a client-fabricated `node=`), and "All areas" clears the
    // stale `groupId` via the SAME atomic `enterAreasJourney(null)` path
    // #1956 PR 6 already established — no new URL-write mechanism.
    const areaGroupsResponse = page.waitForResponse((r) => r.url().includes('/api/discover/area-groups'));
    // Track EVERY /api/discover/markers response for the full test lifetime,
    // registered before navigation so no response (whether fired during
    // initial load, during the badge-settle wait, or from an explicit zoom
    // click below) can race past an unregistered listener. Mirrors Flow 3's
    // own marker-response-array pattern (Finding 3 fix rationale applies
    // identically here).
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

    // ── (2a) PANEL side (Issue #2213 fix): `AreaGroupFocusPanel` mounts —
    // group-SCOPED, not the group-blind canonical Directions tree — showing
    // exactly south-premium's 3 real member areas. The group-blind hierarchy
    // panel (`navigation-level-panel`) never mounts for this state. ──
    await expect(page.getByTestId('area-group-focus-panel')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('area-group-focus-heading')).toHaveText('South Premium');
    expect(
      await page.getByTestId('navigation-level-panel').count(),
      'the group-blind canonical hierarchy panel no longer mounts for this state',
    ).toBe(0);
    const memberTestIds = await page
      .locator('[data-testid^="area-group-focus-member-"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')).sort());
    expect(
      memberTestIds,
      'the panel renders exactly south-premium\'s 3 real member areas — no more, no fewer',
    ).toEqual(
      [
        `area-group-focus-member-${AREA_KORAMANGALA_KEY}`,
        `area-group-focus-member-${AREA_JAYANAGAR_KEY}`,
        `area-group-focus-member-${AREA_HSR_LAYOUT_KEY}`,
      ].sort(),
    );

    // ── (2b) The panel's member set is backed by the SAME live
    // `/api/discover/area-groups` payload the map/badge already read pre-fix —
    // one server-owned identity, never re-derived. ──
    const areaGroupsBody = await areaGroupsRes.json();
    const southPremiumGroup = (areaGroupsBody?.groups ?? []).find(
      (g: { slug?: string }) => g.slug === GROUP_SOUTH_PREMIUM,
    );
    expect(southPremiumGroup, 'south-premium group is present in the real /api/discover/area-groups payload').toBeTruthy();
    expect(
      new Set(southPremiumGroup.areaKeys),
      'south-premium resolves to exactly its 3 real member areaKeys, backing both the panel and the badge',
    ).toEqual(new Set([AREA_KORAMANGALA_KEY, AREA_JAYANAGAR_KEY, AREA_HSR_LAYOUT_KEY]));
    const badge = page.getByTestId('discover-badge');
    await expect(badge).toBeVisible({ timeout: 15_000 });
    await expect(badge).toHaveText('No listings here yet');

    // ── (2c) MAP side after an ordinary zoom (the `.leaflet-control-zoom-in`
    // control, no click producer needed): `markersEnabled` flips true past
    // AREA_LAYER_MAX_ZOOM=12 and `groupAreaKeysForMapData` (journey-
    // independent, resolved off `groupId` alone) narrows the marker fetch to
    // south-premium's 3 member areas — THE SAME 3 areaKeys the panel already
    // renders in (2a). This is the coherence Issue #2213 exists to prove: one
    // shared geography, not the #1806-class divergence Flow 4 used to
    // document. ──
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
    // LATEST captured response.
    await page.waitForTimeout(1_500);
    void markerResponseCountBeforeZoom; // documents intent; not asserted directly — see comment above
    const scopedMarkersRes = markerResponses[markerResponses.length - 1];
    const scopedMarkersUrl = new URL(scopedMarkersRes.url());
    expect(
      new Set(scopedMarkersUrl.searchParams.getAll('areaKeys')),
      'Issue #2213 fix verified: the map marker fetch narrows to south-premium\'s 3 member areaKeys — the SAME set the panel already rendered in (2a)',
    ).toEqual(new Set([AREA_KORAMANGALA_KEY, AREA_JAYANAGAR_KEY, AREA_HSR_LAYOUT_KEY]));

    // The panel is unaffected by the zoom — it was already showing this exact
    // scope before the map caught up, and stays on it afterward. Coherent
    // both before and after zoom, per the acceptance criteria.
    const memberTestIdsAfterZoom = await page
      .locator('[data-testid^="area-group-focus-member-"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')).sort());
    expect(memberTestIdsAfterZoom, 'the panel keeps rendering the identical group-scoped member set after the zoom').toEqual(
      memberTestIds,
    );

    // ── (3) An honest fixture-limitation proof, not masked: south-premium's
    // member areas live only in the base `area_groups` fixture table, NOT in
    // the navigation-hierarchy fixture seed (#1956 PR-5) — live-verified
    // (`GET .../areas/{areaKey}/navigation-path` 404s "Area not found in
    // navigation hierarchy" for Koramangala against this exact fixture).
    // Clicking a member area therefore cannot complete a real node= hop here
    // — but it MUST still be wired through the real sanctioned server
    // resolver (never a client-fabricated node=) and must never corrupt the
    // URL on the honest-failure path. ──
    await page.getByTestId(`area-group-focus-member-${AREA_KORAMANGALA_KEY}`).click();
    await page.waitForTimeout(1_000);
    expect(currentParam(page, 'node'), 'an unresolved member area never fabricates a node=').toBeNull();
    expect(currentParam(page, 'groupId'), 'an unresolved member area click leaves groupId untouched').toBe(
      GROUP_SOUTH_PREMIUM,
    );
    await expect(page.getByTestId('area-group-focus-panel')).toBeVisible();

    // ── (4) A REAL subsequent canonical navigation hop — "All areas" clears
    // the stale groupId via the SAME atomic `enterAreasJourney(null)` write
    // #1956 PR 6 already established (never a second, ad-hoc clear
    // mechanism), mounting the canonical hierarchy at city root; a
    // Direction-card click then proves a genuine node= hop still works
    // cleanly from there, and Back/Forward round-trips exactly. ──
    const historyBefore = await historyLength(page);
    await page.getByTestId('area-group-focus-back').click();
    await expect(page.getByTestId('navigation-level-panel')).toBeVisible({ timeout: 15_000 });
    expect(
      currentParam(page, 'groupId'),
      '"All areas" clears the stale groupId as part of its atomic entry write',
    ).toBeNull();
    expect(currentParam(page, 'node')).toBeNull();

    await page.getByTestId(`navigation-child-card-${D_NORTHEAST}`).click();
    await expect.poll(() => currentParam(page, 'node')).toBe(D_NORTHEAST);
    expect(currentParam(page, 'areaKey'), 'the node= hop never writes a legacy areaKey').toBeNull();
    expect(currentParam(page, 'groupId'), 'groupId stays cleared — no resurrection by the node= hop').toBeNull();

    const historyAfter = await historyLength(page);
    expect(
      historyAfter - historyBefore,
      'exactly 2 PUSH entries: the "All areas" atomic entry + the 1 deliberate Direction-card hop',
    ).toBe(2);

    // Back/Forward round-trip — every leg lands on the exact state its
    // forward counterpart produced, never resurrecting a legacy areaKey.
    await page.goBack();
    await expect.poll(() => currentParam(page, 'node')).toBeNull();
    expect(currentParam(page, 'groupId')).toBeNull();
    expect(currentParam(page, 'areaKey')).toBeNull();
    await expect(page.getByTestId('navigation-level-panel')).toBeVisible({ timeout: 15_000 });

    await page.goBack();
    await expect(page.getByTestId('area-group-focus-panel')).toBeVisible({ timeout: 15_000 });
    expect(currentParam(page, 'groupId'), 'Back restores the EXACT original group-focus entry state').toBe(
      GROUP_SOUTH_PREMIUM,
    );
    expect(currentParam(page, 'node')).toBeNull();

    await page.goForward();
    await expect(page.getByTestId('navigation-level-panel')).toBeVisible({ timeout: 15_000 });
    expect(currentParam(page, 'groupId')).toBeNull();

    await page.goForward();
    await expect.poll(() => currentParam(page, 'node')).toBe(D_NORTHEAST);
    expect(currentParam(page, 'groupId')).toBeNull();
    expect(currentParam(page, 'areaKey')).toBeNull();

    // ── VERDICT (Issue #2213 fix, this pass) — recorded verbatim: groupId
    // remains the sole group identity ever WRITTEN to the URL (journey/node/
    // areaKey are never fabricated for the group-focus state itself); the
    // panel and the (post-zoom) map now describe the IDENTICAL geography —
    // south-premium's 3 real member areas — closing the #1806-class
    // divergence this Flow used to document; a member-area selection is wired
    // through the real sanctioned `.../navigation-path` server resolver
    // (proven via its honest, fixture-limited 404 path, never a fabricated
    // node=); "All areas" clears the stale groupId through the SAME atomic
    // `enterAreasJourney(null)` write #1956 PR 6 already established; a real
    // subsequent node= hop (Direction-card click) resolves correctly
    // afterward; and Back/Forward round-trips exactly across all 4 legs. ──
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
    // CORRECTION (2026-08-19, re-verified against a genuinely clean local
    // fixture — see this issue's PR body for the incident that produced the
    // prior, incorrect finding below): the previous version of this comment
    // claimed the `discover-badge` testid never appears in the DOM at this
    // URL. That finding was produced against an environment that was later
    // discovered to be misconfigured (the browser was calling a stale/wrong
    // backend for part of that verification pass), not a genuinely clean
    // fixture. Re-run against a confirmed-clean local fixture + backend, the
    // badge DOES render here: `DiscoverMapCountBadge.tsx`'s school-first
    // LANDING branch renders "Showing N schools" city-wide once
    // `discoverAreas` settles, exactly as the source trace
    // (`deriveSchoolFirstLandingSchoolCount` in schoolFirstCounts.ts)
    // predicts — `focusedGroup`/`selectedArea` are both null here, and
    // `schoolFirstLandingSchoolCount` resolves to a real, deterministic,
    // non-null city-wide sum (32 for this fixture — the sum of every
    // Bangalore area's `schoolCount` from `GET /api/discover/areas`,
    // independent of groupId/area scoping). So the map/canvas surface IS
    // mounted here, same as the with-groupId leg (Step 1) — there is no
    // groupId-driven mounting difference after all. Wait for the real
    // `/api/discover/areas` response (a genuine settle signal) before
    // asserting, rather than asserting on whatever the DOM happens to look
    // like immediately after `domcontentloaded`.
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

    // THE INVARIANT this leg exists to prove (re-verified against a clean
    // fixture, settle-wait above closes the same race the badge assertion in
    // Step 1 is immune to): the page-level badge renders the SAME
    // deterministic city-wide school count regardless of whether a stale
    // groupId is present — groupId has no effect on this badge's own
    // school-first LANDING branch, exactly as `deriveSchoolFirstLandingSchoolCount`
    // predicts. Not a #1806-class divergence: both legs show a real,
    // backend-derived count, just scoped differently (group members vs.
    // city-wide) by the SAME source data.
    const badgeWithoutGroupId = page.getByTestId('discover-badge');
    await expect(badgeWithoutGroupId).toBeVisible({ timeout: 15_000 });
    await expect(badgeWithoutGroupId).toHaveText('Showing 32 schools');

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
