/**
 * E2E: anonymous school-radius cross-area listings — Issue #1261.
 *
 * Surface under test: the ANONYMOUS school-first journey, where the right-panel
 * listing set is now sourced from the NEW PUBLIC endpoint
 *   GET /api/discover/cities/{city}/school-radius-listings
 * (server-side ST_DWithin), instead of the old single-area client haversine over
 * /api/discover/cities/{city}/listings.
 *
 * Why E2E (cross-layer): the cross-area behaviour cannot be proven at the unit
 * layer — it needs the real endpoint response shape (mapSchoolRadiusCard) +
 * DOM rendering of PropertyCard cards in DiscoverRightPanel. The endpoint is
 * route-stubbed so the scenario is deterministic and backend-agnostic, mirroring
 * how discover-school-anon-parity.spec.ts stubs /api/discover/*.
 *
 * Test IDs:
 *   E2E-ANON-SR-1  CROSS-AREA: anon school-radius cards span MULTIPLE areaKeys
 *                  (AC1) — sourced from the new endpoint, NOT area-scoped.
 *   E2E-ANON-SR-2  NOTE ABSENT: the #1193 limitation note is gone for anon (AC2).
 *   E2E-ANON-SR-3  CLIENT-DERIVED MARKERS (AC11): /api/discover/markers never
 *                  fires for anon and no 401 appears (markers/pins are derived
 *                  CLIENT-SIDE from the school-radius listings, NOT from that
 *                  auth-only endpoint), AND anon property-marker pins ARE present
 *                  on the map for anon school-radius listings that carry coords.
 *   E2E-ANON-SR-4  MORE-HINT: "showing first N" hint renders when hasMore=true
 *                  with no client filter active.
 *
 * Anonymous flow throughout — storageState is omitted (no auth token), so
 * markersEnabled (which requires isAuthenticated) is false and the auth-gated
 * /api/discover/markers query must never fire.
 *
 * Run locally:
 *   bash scripts/run-e2e-local.sh --project=full e2e/discover-anon-school-radius.spec.ts
 */

import { test, expect, type Page, type Route, type Request } from '@playwright/test';

// ---------------------------------------------------------------------------
// Force anonymous context: no storageState (no Authorization token sent).
// ---------------------------------------------------------------------------

test.use({ storageState: undefined });

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MANIPAL_AREA_KEY = 'IN|KA|Udupi|Manipal';
const KATAPADI_AREA_KEY = 'IN|KA|Udupi|Katapadi';

// School the URL ?schoolId= resolves to. /api/public/schools/{id} is public;
// once it resolves, the restore effect writes schoolLat/schoolLon into filters,
// which enables the anon /school-radius-listings query.
const MANIPAL_SCHOOL = {
  id: 'sch-1',
  name: 'Manipal Public School',
  board: 'CBSE',
  boardType: null,
  address: 'Manipal, Udupi District',
  latitude: 13.3525,
  longitude: 74.7864,
  distanceKm: 1.2,
};

const DISCOVER_AREAS_UDUPI = {
  city: 'udupi',
  areas: [
    {
      areaKey: MANIPAL_AREA_KEY,
      name: 'Manipal',
      geoCenterLat: 13.3525,
      geoCenterLon: 74.7864,
      listingCount: 5,
      schoolCount: 3,
      trendDirection: 'stable',
      minLat: 13.33,
      minLon: 74.77,
      maxLat: 13.37,
      maxLon: 74.81,
    },
    {
      areaKey: KATAPADI_AREA_KEY,
      name: 'Katapadi',
      geoCenterLat: 13.38,
      geoCenterLon: 74.74,
      listingCount: 4,
      schoolCount: 1,
      trendDirection: 'stable',
      minLat: 13.36,
      minLon: 74.72,
      maxLat: 13.40,
      maxLon: 74.76,
    },
  ],
};

const TRENDS_OPTIONS_FIXTURE = {
  city: 'udupi',
  defaultAreas: [{ areaKey: MANIPAL_AREA_KEY, areaLabel: 'Manipal' }],
};

// Distinct, recognisable titles — one per area boundary. The presence of BOTH in
// the right panel is the AC1 cross-area proof: a regression to the old area-scoped
// path (single areaKey) could only ever surface the Manipal listing.
const RADIUS_CARD_MANIPAL = {
  id: 'sr-manipal-1',
  listingNumber: 9001,
  propertyType: 'house',
  title: 'Manipal Cross-Area House',
  locality: 'Manipal',
  areaKey: MANIPAL_AREA_KEY,
  pricePaise: 5_000_000,
  landArea: null,
  landAreaUnit: null,
  builtArea: 1200,
  builtAreaUnit: 'sqft',
  bedrooms: 3,
  latitude: 13.353,
  longitude: 74.787,
  heroImageUrl: null,
  listingPurpose: 'sale',
  possessionStatus: 'ready_to_move',
  daysOnMarket: 4,
  backOnMarket: false,
  createdAt: '2026-05-01T00:00:00Z',
};

const RADIUS_CARD_KATAPADI = {
  id: 'sr-katapadi-1',
  listingNumber: 9002,
  propertyType: 'apartment',
  title: 'Katapadi Cross-Area Apartment',
  locality: 'Katapadi',
  areaKey: KATAPADI_AREA_KEY,
  pricePaise: 8_000_000,
  landArea: null,
  landAreaUnit: null,
  builtArea: 1500,
  builtAreaUnit: 'sqft',
  bedrooms: 2,
  latitude: 13.379,
  longitude: 74.742,
  heroImageUrl: null,
  listingPurpose: 'sale',
  possessionStatus: 'under_construction',
  daysOnMarket: 20,
  backOnMarket: false,
  createdAt: '2026-04-15T00:00:00Z',
};

// hasMore=false by default — the more-hint test overrides this per-call.
function schoolRadiusPage(over: { hasMore?: boolean } = {}) {
  return {
    content: [RADIUS_CARD_MANIPAL, RADIUS_CARD_KATAPADI],
    page: 0,
    size: 50,
    hasMore: over.hasMore ?? false,
  };
}

// Area-scoped public browse fallback. Returns NO listings so that if the wiring
// ever regressed to the area-scoped path, the right panel would be EMPTY — the
// AC1 assertion (both cross-area cards present) would then fail loudly rather
// than silently pass off the wrong source.
const EMPTY_CITY_LISTINGS = {
  areas: [
    { areaKey: MANIPAL_AREA_KEY, listings: [] },
    { areaKey: KATAPADI_AREA_KEY, listings: [] },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

interface RadiusCapture {
  requests: Request[];
  /** Status codes the stub fulfilled the school-radius endpoint with (one per call). */
  statuses: number[];
}

async function stubCommonEndpoints(page: Page): Promise<void> {
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/trends/options**', (route) =>
    fulfillJson(route, 200, TRENDS_OPTIONS_FIXTURE),
  );
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/discover/areas**', (route) =>
    fulfillJson(route, 200, DISCOVER_AREAS_UDUPI),
  );
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/public/schools/popular**', (route) =>
    fulfillJson(route, 200, []),
  );
  // School-by-id (public) — resolves the URL ?schoolId=, populating school coords.
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route(`**/api/public/schools/${MANIPAL_SCHOOL.id}**`, (route) =>
    fulfillJson(route, 200, MANIPAL_SCHOOL),
  );
  // Area-scoped public browse — kept empty so it cannot be the listing source.
  // The school-radius endpoint is stubbed separately per-test (it needs request
  // capture and hasMore variation), so order matters: register the more-specific
  // /school-radius-listings route BEFORE this broader /listings route in each test
  // (Playwright matches most-recently-registered first, so the specific route added
  // later in the test wins — see stubSchoolRadiusListings calls below).
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/discover/cities/*/listings**', (route) =>
    fulfillJson(route, 200, EMPTY_CITY_LISTINGS),
  );
}

/**
 * Stub the NEW public school-radius endpoint and capture its requests.
 * Registered AFTER stubCommonEndpoints so this more-specific path wins over the
 * broader /listings glob (Playwright tries the most-recently-added route first).
 */
async function stubSchoolRadiusListings(
  page: Page,
  opts: { hasMore?: boolean } = {},
): Promise<RadiusCapture> {
  const capture: RadiusCapture = { requests: [], statuses: [] };
  // INTEGRATION-UI: stub justified — exercises the new cross-area endpoint contract
  await page.route('**/api/discover/cities/*/school-radius-listings**', (route) => {
    capture.requests.push(route.request());
    capture.statuses.push(200);
    return fulfillJson(route, 200, schoolRadiusPage(opts));
  });
  return capture;
}

/**
 * Track every /api/discover/markers request (must never fire for anon) and every
 * response with a 401 status across the whole flow (anon must hit no auth wall).
 */
async function trackAuthEndpoints(page: Page): Promise<{
  markersFired: () => boolean;
  unauthorizedUrls: () => string[];
}> {
  let markers = false;
  const unauthorized: string[] = [];

  await page.route('**/api/discover/markers**', async (route) => {
    markers = true;
    await route.continue();
  });

  page.on('response', (res) => {
    if (res.status() === 401) unauthorized.push(res.url());
  });

  return {
    markersFired: () => markers,
    unauthorizedUrls: () => unauthorized,
  };
}

// SchoolSelectedPanel is confirmed mounted when its radius selector is visible.
async function waitForSchoolPanel(page: Page): Promise<void> {
  await expect(page.getByTestId('radius-btn-3')).toBeVisible({ timeout: 15_000 });
}

const SCHOOL_FIRST_URL =
  '/discover?city=udupi&journey=school-first&schoolId=sch-1&radiusKm=3';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('@integration-ui anonymous school-radius cross-area (#1261)', () => {
  /**
   * E2E-ANON-SR-1 (AC1) — CROSS-AREA: the anon school-radius right-panel cards
   * include results from MULTIPLE area boundaries, proving the listing set is
   * sourced from the new cross-area endpoint and is NOT scoped to a single area.
   *
   * Business meaning: a regression to the old single-area haversine path would
   * surface at most the Manipal listing (the area the school sits in). Asserting
   * BOTH the Manipal AND Katapadi cards render — and that the new endpoint was
   * actually called with the school coordinates — would FAIL under that regression.
   */
  test('E2E-ANON-SR-1: anon school-radius cards span multiple areaKeys (cross-area)', async ({ page }) => {
    await stubCommonEndpoints(page);
    const radiusCapture = await stubSchoolRadiusListings(page);

    await page.goto(SCHOOL_FIRST_URL);
    await waitForSchoolPanel(page);

    // The new cross-area endpoint must have been called (anon path active).
    await expect
      .poll(() => radiusCapture.requests.length, { timeout: 10_000 })
      .toBeGreaterThan(0);

    // It must carry the resolved school coordinates + radius (not an area key).
    const lastUrl = radiusCapture.requests[radiusCapture.requests.length - 1].url();
    expect(lastUrl).toContain('schoolLat=');
    expect(lastUrl).toContain('schoolLon=');
    expect(lastUrl).toContain('schoolRadiusKm=3');

    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel).toBeVisible({ timeout: 15_000 });

    // BOTH cross-area cards must render — the core AC1 cross-area proof.
    await expect(
      rightPanel.getByText('Manipal Cross-Area House'),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      rightPanel.getByText('Katapadi Cross-Area Apartment'),
    ).toBeVisible({ timeout: 15_000 });

    // Exactly the two stubbed cards render (no extra/stale source mixed in).
    await expect(rightPanel.locator('[data-testid="listing-card"]')).toHaveCount(2);
  });

  /**
   * E2E-ANON-SR-2 (AC2) — NOTE ABSENT: the #1193 "Showing homes in this area
   * only" limitation note must NOT be present for anon when a school radius is
   * active, because the cross-area endpoint now makes the radius circle and the
   * listing set consistent.
   *
   * Business meaning: if the note re-appeared it would falsely tell anon users
   * their results are area-scoped — directly contradicting the #1261 behaviour.
   */
  test('E2E-ANON-SR-2: #1193 limitation note is absent for anon school radius', async ({ page }) => {
    await stubCommonEndpoints(page);
    await stubSchoolRadiusListings(page);

    await page.goto(SCHOOL_FIRST_URL);
    await waitForSchoolPanel(page);

    // Confirm we are in the active school-radius state before asserting absence
    // (cards rendered → panel + endpoint settled, not a not-yet-rendered race).
    await expect(
      page.getByText('Manipal Cross-Area House'),
    ).toBeVisible({ timeout: 15_000 });

    await expect(page.getByTestId('anon-school-radius-limit-note')).toHaveCount(0);
  });

  /**
   * E2E-ANON-SR-3 (AC11) — CLIENT-DERIVED MARKERS: anon property pins ARE shown on
   * the map, derived CLIENT-SIDE from the already-fetched school-radius listings —
   * the auth-only /api/discover/markers endpoint must NOT fire for anon (and no 401
   * may appear), because the pins do not come from that endpoint.
   *
   * Business meaning (two-sided guard):
   *   NEGATIVE — firing /api/discover/markers for anon caused the #1118
   *   delayed-marker-disappearance regression + a 401; both stay guarded.
   *   POSITIVE — rev2 (AC11): anon users MUST still see public-safe pins for the
   *   listings they already have. If anon marker rendering regressed to none
   *   (e.g. pins were gated behind isAuthenticated like the markers endpoint),
   *   the property-pin assertion below would FAIL even though the cards still
   *   render — exactly the regression AC11 protects against.
   */
  test('E2E-ANON-SR-3: anon pins are client-derived (no markers endpoint / no 401, pins present)', async ({ page }) => {
    const auth = await trackAuthEndpoints(page);
    await stubCommonEndpoints(page);
    // Stub returns listings WITH lat/lon (RADIUS_CARD_* carry coords) so client-
    // derived pins can render — the precondition for the AC11 positive assertion.
    const radiusCapture = await stubSchoolRadiusListings(page);

    // zoom=14 (> AREA_LAYER_MAX_ZOOM) is exactly the band where an auth user WOULD
    // fetch markers — so if anon gating regressed, the call would fire here.
    await page.goto(`${SCHOOL_FIRST_URL}&zoom=14`);
    await waitForSchoolPanel(page);

    // Wait until the school-radius flow has actually settled (cards rendered),
    // so the assertions reflect the full flow, not an early pre-fetch window.
    await expect(
      page.getByText('Manipal Cross-Area House'),
    ).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(() => radiusCapture.requests.length, { timeout: 10_000 })
      .toBeGreaterThan(0);

    // The public school-radius endpoint (the pins' data source) returned 200.
    expect(radiusCapture.statuses).toContain(200);

    // POSITIVE (AC11): anon property pins render on the map, derived client-side
    // from the radius listings. leaflet.markercluster renders each pin as a
    // `property-marker` DivIcon (PropertyMap.tsx:91); when two nearby pins fall
    // within maxClusterRadius they collapse into a `.custom-marker-cluster`
    // element instead. Either is valid proof that anon markers exist — assert the
    // union so the test is robust to the cluster/no-cluster boundary at zoom 14,
    // while still FAILING if anon markers regressed to none.
    const anonPins = page.locator(
      '[data-testid="property-marker"], .custom-marker-cluster',
    );
    await expect(anonPins.first()).toBeVisible({ timeout: 15_000 });

    // NEGATIVE: the auth-only markers endpoint never fired and no 401 surfaced.
    expect(auth.markersFired()).toBe(false);
    expect(auth.unauthorizedUrls()).toEqual([]);
  });

  /**
   * E2E-ANON-SR-4 — MORE-HINT: when the endpoint reports hasMore=true and no
   * client-side PropertyFilter is active, the non-blocking "showing first N" hint
   * renders. It carries the post-filter shown count (here: the 2 stubbed cards).
   *
   * Business meaning: the hint communicates the single-page cap to anon users.
   * If hasMore wiring regressed, the hint would never show.
   */
  test('E2E-ANON-SR-4: "showing first N" hint renders when hasMore is true', async ({ page }) => {
    await stubCommonEndpoints(page);
    await stubSchoolRadiusListings(page, { hasMore: true });

    await page.goto(SCHOOL_FIRST_URL);
    await waitForSchoolPanel(page);

    // Cards settle first (confirms the radius query resolved with hasMore=true).
    await expect(
      page.getByText('Manipal Cross-Area House'),
    ).toBeVisible({ timeout: 15_000 });

    const hint = page.getByTestId('school-radius-more-hint');
    await expect(hint).toBeVisible({ timeout: 10_000 });
    // The hint reflects the shown post-filter count (2 cards), proving it is
    // wired to the live result, not a hard-coded string.
    await expect(hint).toContainText('Showing the first 2 homes');
  });
});

// ---------------------------------------------------------------------------
// Authenticated school-radius marker parity (#1261 rev2 — AC12)
//
// Product truth: property markers must be visible for ALL users in school-radius
// mode. Auth state may affect card detail and actions but MUST NOT hide map
// property markers. This describe block overrides storageState to test the auth
// path against the same marker assertion as SR-3.
//
// The test asserts that an authenticated user navigating directly to a school-
// radius deep-link (WITHOUT triggering the #1115 bounded-search CTA) still sees
// map marker pins. Before the rev2 fix, this required the CTA — markers were
// completely absent until the user manually clicked "Search within N km".
// ---------------------------------------------------------------------------

test.describe('@integration-ui authenticated school-radius markers (#1261 rev2 AC12)', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  /**
   * E2E-AUTH-SR-1 (AC12) — AUTH MARKERS: an authenticated user navigating
   * directly to the school-radius deep-link URL sees property marker pins on the
   * map WITHOUT needing to click the bounded-search CTA.
   *
   * Before the rev2 fix this failed: schoolRadiusEnabled was !isAuthenticated,
   * so the public endpoint was never called for auth users, and markerListings
   * stayed empty until the CTA fired markersEnabled=true.
   *
   * Business meaning: anonymous and authenticated users now have symmetric marker
   * visibility — auth state governs data richness, not marker presence.
   */
  test('E2E-AUTH-SR-1: auth user sees map markers in school-radius deep-link without CTA', async ({ page }) => {
    // Stub common endpoints (areas, schools, etc.) to isolate from backend variability.
    await stubCommonEndpoints(page);
    // Stub the school-radius endpoint — now also called for auth users as a marker
    // fallback when markersEnabled=false (CTA not yet triggered).
    const radiusCapture = await stubSchoolRadiusListings(page);

    await page.goto(SCHOOL_FIRST_URL);
    await waitForSchoolPanel(page);

    // The school-radius endpoint must be called for auth user (fallback marker source).
    await expect
      .poll(() => radiusCapture.requests.length, { timeout: 10_000 })
      .toBeGreaterThan(0);

    // Markers must be visible — derived from the stubbed school-radius listings
    // (both cards have valid lat/lon). This is the core AC12 assertion: auth users
    // get markers without needing to trigger the CTA.
    const authPins = page.locator('[data-testid="property-marker"], .custom-marker-cluster');
    await expect(authPins.first()).toBeVisible({ timeout: 15_000 });
  });
});
