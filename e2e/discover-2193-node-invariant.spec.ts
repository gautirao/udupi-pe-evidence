import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * Issue #2193 AC4 — dual-surface node invariant, Playwright E2E (stubbed transport, D3).
 *
 * THE INVARIANT: a listing whose area_key genuinely matches a canonical Area
 * AND whose lat/lon genuinely falls inside that Area, when that Area is
 * selected via the canonical node mechanism (URL `node=`), MUST appear in the
 * results panel AND render its marker on the map.
 *
 * WHAT THIS FILE PROVES / DOES NOT PROVE (honesty requirement, owner ruling D3):
 *   - PROVES: the frontend wiring from a node-scoped resolution through to
 *     BOTH DOM surfaces (the results panel's listing card AND the real
 *     Leaflet marker DOM), plus that the outgoing requests for both surfaces
 *     actually carry the correct, matching geography scope (nodeKey / areaKeys).
 *   - Does NOT prove the backend query itself returns the correct row for a
 *     genuinely-inside-the-boundary listing — that is proved independently,
 *     against a real seeded Postgres/PostGIS fixture, by the Testcontainers
 *     integration test (backend/src/test/java/.../NodeAreaInvariant2193IT.java,
 *     AC1). This file's transport is entirely `page.route`-stubbed (owner
 *     ruling D3) — every fixture value below is asserted to have been SENT
 *     correctly (the request-param spy, N4) and RENDERED correctly from
 *     whatever was returned, but the backend truth of "does this row actually
 *     fall inside this boundary" is out of this file's reach by construction.
 *
 * WHY THE MARKER ASSERTION HERE IS LOAD-BEARING (not merely convenient):
 * every existing PropertyMap.*.test.tsx in this repo mocks the `leaflet`
 * module itself (marker/divIcon reduced to `vi.fn()` stubs), so the frontend
 * vitest layer (AC3, DiscoverDualSurfaceInvariant2193.test.tsx) can prove the
 * PANEL half but explicitly cannot produce a genuine
 * `data-testid="property-marker"` DOM element under JSDOM — that half was
 * honestly reported UNPROVEN there. This spec runs a REAL Chromium browser
 * where Leaflet genuinely paints DOM, so it is the ONLY layer in this issue's
 * evidence set that can prove the marker-render half.
 *
 * D1/D2 (owner rulings): authenticated-only. markersEnabled hard-requires
 * isAuthenticated and GET /api/discover/markers 401s anonymous callers by
 * design (#1118 regression guard) — there is no anonymous arm of this
 * invariant to test. Auth is established via the repo's own storageState
 * fixture (e2e/fixtures/user-auth.json, produced by e2e/global-setup.ts) —
 * no bespoke auth mechanism is invented here.
 *
 * FIXTURE IDENTITY — kept byte-identical to the other three layers' fixtures
 * for this same issue (AC1 IT, AC2/AC3 vitest, per the handoff's shared
 * literal-value contract):
 *   CITY_SLUG          = qa2193audit
 *   TARGET_AREA_KEY     = QA|QA|qa2193audit|TargetArea
 *   OUTSIDE_AREA_KEY    = QA|QA|qa2193audit|OutsideArea      (negative control)
 *   LEAF_NODE_KEY       = a:2193-target
 *   TARGET_LISTING_ID   = 11111111-1111-1111-1111-111111111111
 *   OUTSIDE_LISTING_ID  = 22222222-2222-2222-2222-222222222222 (negative control)
 *   target coords  = 13.00 / 74.00  (inside TargetArea bbox 12.90/73.90 .. 13.10/74.10)
 *   outside coords = 20.00 / 80.00
 *
 * TWO SEPARATE SURFACES, TWO SEPARATE ENDPOINTS (established from source —
 * useDiscoverCityListings.ts / useDiscoverFilteredMarkers.ts / markerScope.ts):
 *   - Panel:   GET /api/discover/cities/<city>/listings?areaKeys=<TARGET_AREA_KEY>...
 *   - Markers: GET /api/discover/markers?...&nodeKey=<LEAF_NODE_KEY>...
 * A resolved canonical AREA leaf's node.areaKey drives the panel query (via
 * deriveAreaPointFromNode -> AreaLeafListingsSurface's useDiscoverCityListings
 * call); the SAME resolved node's nodeKey drives the marker query (via
 * resolveDiscoverMarkerScope, rule 5). These are genuinely two different
 * request-building code paths — this is exactly the divergence class #2193
 * exists to catch, so both are asserted independently (panel card by id,
 * marker DOM by id, AND the outgoing request params for both).
 *
 * NEGATIVE CONTROLS ARE NOT DECORATIVE (N1/N4): both stub route handlers
 * below are CONDITIONAL on the actual incoming request params, not static
 * fixtures. The panel stub only omits OUTSIDE's area from the response when
 * the request's areaKeys genuinely name only TargetArea; the markers stub
 * only omits OUTSIDE's marker when the request's nodeKey genuinely equals
 * LEAF_NODE_KEY. If the app under test ever regresses to an unscoped/
 * mis-scoped request, the OUTSIDE listing/marker WOULD leak into the
 * response and this spec would fail — that is what makes the negative
 * control meaningful rather than tautological (a static "only good listing
 * in the fixture" stub would pass even with completely broken scoping code,
 * since the stub controls the response regardless of what was asked for).
 *
 * ZOOM PRECONDITION (R5): zoom=14 is set on the URL, strictly above
 * AREA_LAYER_MAX_ZOOM=12 (src/lib/map/zoomPolicy.ts, confirmed against
 * useDiscoverMapDataController.test.ts:157 and the #1738/school-first-markers
 * E2E specs' own zoom=14 convention) — shouldShowMarkers(zoom) must be true
 * or markers are legitimately withheld and this spec would fail for the
 * wrong reason.
 *
 * AREA LEAF, NOT A GROUPED NODE (R6): the stubbed navigation/resolve fixture
 * below returns nodeType: 'AREA' with a non-null areaKey and populated
 * bounds — a grouped/CLUSTER/DIRECTION node would leave isTopGroupedLevel
 * true (useDiscoverMapDataController.ts) and disable BOTH the panel and
 * marker fetches entirely.
 *
 * PANEL SHELL TESTID CORRECTION vs. the originally-briefed idiom: read from
 * source (DiscoverPanelSurface.tsx -> AreaFirstJourneyPanel.tsx ->
 * DiscoverJourneyPanelShell.tsx), the canonical `node=` journey's panel shell
 * carries `data-testid="discover-areas-journey-panel-shell"`, NOT
 * `discover-right-panel` — the latter is the LEGACY (non-canonical,
 * areaKey=-driven) panel's own root and is never mounted on this journey
 * (DiscoverPanelSurface renders exactly one of the two, never both). The
 * listing-card-bearing wrapper one level in is
 * `data-testid="areas-journey-panel-listings"` (confirmed against the
 * existing e2e/discover/issue-1956-areas-adaptive-journeys.spec.ts, which
 * exercises this exact same canonical-node AREA-leaf surface against a real
 * backend). `listing-card` itself (PropertyCard.tsx) is unchanged from the
 * brief.
 */

// NOTE ON CITY SLUG (deviation from the AC1/AC2/AC3 literal, deliberate and
// scope-contained): the backend IT and frontend vitest layers use the
// synthetic slug "qa2193audit" throughout, since neither ever passes through
// the REAL APP SHELL's client-side city allowlist. This E2E layer does — the
// city= URL param is checked against the hard-coded CITY_CONFIG map
// (src/lib/localityUtils.ts, forbidden_globs — never edited), and an
// unrecognised slug renders a "City not supported" gate BEFORE any of our
// page.route stubs or Discover UI ever mount, which is not a real invariant
// failure, just a client-side routing allowlist this fixture-only issue was
// never meant to touch. "udupi" (a real, pre-existing supported city) is
// used for the city= URL param and the stub payloads' `city` field ONLY;
// every geography-identifying literal that matters to the invariant itself
// (area key, node key, listing ids, coordinates) is kept byte-identical to
// the other three layers' shared fixture.
const CITY_SLUG = 'udupi';
const TARGET_AREA_KEY = 'QA|QA|qa2193audit|TargetArea';
const OUTSIDE_AREA_KEY = 'QA|QA|qa2193audit|OutsideArea';
const LEAF_NODE_KEY = 'a:2193-target';
const TARGET_LISTING_ID = '11111111-1111-1111-1111-111111111111';
const OUTSIDE_LISTING_ID = '22222222-2222-2222-2222-222222222222';

const TARGET_LAT = 13.0;
const TARGET_LON = 74.0;
const OUTSIDE_LAT = 20.0;
const OUTSIDE_LON = 80.0;

const ZOOM = 14; // > AREA_LAYER_MAX_ZOOM (12) — R5.

function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

// IMPORTANT — the panel's own city-listings payload MUST carry coordinates.
// Read from source (useDiscoverMapData.ts's `areaMarkerListings` derivation):
// for a `selectedArea`-active state (which a resolved canonical AREA leaf
// always is, via effectiveSelectedArea), the map's actual rendered marker set
// is sourced from `areaMarkerListings` — itself filtered/mapped from THIS
// panel query's own `areaListings`, requiring `lat`/`lon` (or `latitude`/
// `longitude`) on each item — NOT from the dedicated nodeKey-scoped
// `markerListings` (`/api/discover/markers`) directly; that endpoint's result
// is only a fallback consulted on an `isErrorAreaListings` panel-query
// failure (resolveMarkerListings.ts:146-168). Omitting coordinates here
// silently empties `areaMarkerListings`, which would have made the marker
// assertion below fail for the WRONG reason (missing fixture field, not a
// scoping defect) — discovered and fixed by reading the real selector rather
// than assumed.
const targetListingItem = {
  id: TARGET_LISTING_ID,
  pricePaise: 5_000_000 * 100,
  propertyType: 'apartment',
  locality: 'TargetArea',
  primaryImageUrl: null,
  lat: TARGET_LAT,
  lon: TARGET_LON,
};

const outsideListingItem = {
  id: OUTSIDE_LISTING_ID,
  pricePaise: 9_000_000 * 100,
  propertyType: 'apartment',
  locality: 'OutsideArea',
  primaryImageUrl: null,
  lat: OUTSIDE_LAT,
  lon: OUTSIDE_LON,
};

const targetMarker = {
  id: TARGET_LISTING_ID,
  lat: TARGET_LAT,
  lon: TARGET_LON,
  pricePaise: 5_000_000 * 100,
  locality: 'TargetArea',
  propertyType: 'apartment',
};

const outsideMarker = {
  id: OUTSIDE_LISTING_ID,
  lat: OUTSIDE_LAT,
  lon: OUTSIDE_LON,
  pricePaise: 9_000_000 * 100,
  locality: 'OutsideArea',
  propertyType: 'apartment',
};

// Canonical navigation/resolve fixture — a resolved AREA leaf (R6), bounds
// populated (deriveAreaPointFromNode requires centreLat/centreLon AND the
// four min/max fields or it returns null and the panel never mounts — see
// src/features/discover/navigation/nodeAreaPoint.ts).
const NAVIGATION_RESOLVE_FIXTURE = {
  requested: LEAF_NODE_KEY,
  resolution: 'EXACT',
  revisionId: 1,
  node: {
    nodeKey: LEAF_NODE_KEY,
    nodeType: 'AREA',
    displayLabel: 'Target Area',
    depth: 1,
    regionKey: null,
    ancestry: [],
    nextLevelType: 'LISTINGS',
    children: [],
    revisionId: 1,
    bounds: {
      centreLat: TARGET_LAT,
      centreLon: TARGET_LON,
      minLat: 12.9,
      minLon: 73.9,
      maxLat: 13.1,
      maxLon: 74.1,
    },
    descendantAreaKeys: null,
    areaKey: TARGET_AREA_KEY,
  },
};

// ROOT_NODE_KEY = 'root' (src/features/discover/navigation/types.ts). Returned
// whenever the resolve request does NOT ask for LEAF_NODE_KEY — this is what
// makes the RED run below a genuine negative case (N4-style): the resolve
// stub is CONDITIONAL on the actual requested `node` query param, not a
// static always-resolved fixture. Without this, stripping `node=` from the
// URL would still resolve to the same fake AREA leaf (since a static stub
// ignores what was actually asked for), and the RED run would pass for the
// WRONG reason (a stub artefact) instead of failing for the RIGHT one (the
// app's own grouped-overview guard disabling both surfaces once nothing
// resolves to a leaf).
const ROOT_RESOLVE_FIXTURE = {
  requested: 'root',
  resolution: 'EXACT',
  revisionId: 1,
  node: {
    nodeKey: 'root',
    nodeType: 'ROOT',
    displayLabel: 'Udupi',
    depth: 0,
    regionKey: null,
    ancestry: [],
    nextLevelType: 'DIRECTION',
    children: [],
    revisionId: 1,
    bounds: null,
    descendantAreaKeys: null,
    areaKey: null,
  },
};

const NAVIGATION_COUNTS_FIXTURE = {
  nodeKey: LEAF_NODE_KEY,
  count: 1,
  schoolCount: 0,
  areaCounts: { [TARGET_AREA_KEY]: 1 },
  areaSchoolCounts: { [TARGET_AREA_KEY]: 0 },
  children: [],
  revisionId: 1,
};

const EMPTY_LISTINGS_PAGE = {
  content: [],
  page: 0,
  size: 50,
  totalElements: 0,
  totalPages: 0,
  aggregates: { topLocalities: [] },
};

interface StubHandles {
  panelRequestUrls: string[];
  markerRequestUrls: string[];
}

/**
 * Registers every stub this journey needs. Two of them (panel, markers) are
 * DELIBERATELY CONDITIONAL on the incoming request's own scoping params —
 * see the module doc's "NEGATIVE CONTROLS ARE NOT DECORATIVE" section for why
 * a static fixture would make N1 vacuous.
 */
async function stubAll(page: Page): Promise<StubHandles> {
  const handles: StubHandles = { panelRequestUrls: [], markerRequestUrls: [] };

  await page.route('**/api/trends/options**', (route) =>
    fulfillJson(route, 200, { city: CITY_SLUG, defaultAreas: [] }),
  );
  await page.route('**/api/discover/areas**', (route) =>
    fulfillJson(route, 200, { city: CITY_SLUG, areas: [] }),
  );
  await page.route('**/api/discover/cities/*/summary**', (route) =>
    fulfillJson(route, 200, { city: CITY_SLUG, regions: [] }),
  );
  await page.route('**/api/public/schools/popular**', (route) => fulfillJson(route, 200, []));
  await page.route('**/api/public/schools/search**', (route) => fulfillJson(route, 200, []));
  await page.route('**/api/public/schools/by-area**', (route) => fulfillJson(route, 200, []));

  // Legacy paginated listings endpoint — not exercised by the canonical node
  // journey's own surfaces, stubbed defensively so any incidental call never
  // hangs the page.
  await page.route('**/api/discover/listings**', (route) => fulfillJson(route, 200, EMPTY_LISTINGS_PAGE));

  // Conditional on the actual requested `node` query param (see
  // ROOT_RESOLVE_FIXTURE's doc comment above) — this is what makes the RED
  // run (node= stripped from the URL) a genuine negative case rather than a
  // stub artefact.
  await page.route('**/api/discover/cities/*/navigation/resolve**', async (route) => {
    const url = new URL(route.request().url());
    const requestedNode = url.searchParams.get('node');
    await fulfillJson(
      route,
      200,
      requestedNode === LEAF_NODE_KEY ? NAVIGATION_RESOLVE_FIXTURE : ROOT_RESOLVE_FIXTURE,
    );
  });
  await page.route('**/api/discover/cities/*/navigation/*/counts**', (route) =>
    fulfillJson(route, 200, NAVIGATION_COUNTS_FIXTURE),
  );

  // ── PANEL surface — GET /api/discover/cities/<city>/listings?areaKeys=... ──
  // Conditional on the request's OWN areaKeys param (N1/N4): only when the
  // request scopes to EXACTLY [TARGET_AREA_KEY] is the OUTSIDE area omitted.
  // Any other observed scoping (missing, wrong key, or a broader/unscoped
  // request) leaks the OUTSIDE area's listing into the response — which
  // would make the panel-card and negative-control assertions below fail,
  // proving the control is load-bearing rather than tautological.
  await page.route('**/api/discover/cities/*/listings**', async (route) => {
    const url = new URL(route.request().url());
    handles.panelRequestUrls.push(url.toString());
    const areaKeys = url.searchParams.getAll('areaKeys');
    const scopedToTargetOnly = areaKeys.length === 1 && areaKeys[0] === TARGET_AREA_KEY;
    const areas = [{ areaKey: TARGET_AREA_KEY, areaName: 'TargetArea', listings: [targetListingItem] }];
    if (!scopedToTargetOnly) {
      areas.push({ areaKey: OUTSIDE_AREA_KEY, areaName: 'OutsideArea', listings: [outsideListingItem] });
    }
    await fulfillJson(route, 200, { city: CITY_SLUG, limitPerArea: 50, areas });
  });

  // ── MARKER surface — GET /api/discover/markers?...&nodeKey=... ──
  // Same conditional-on-request-params shape as the panel stub above (N1/N4).
  await page.route('**/api/discover/markers**', async (route) => {
    const url = new URL(route.request().url());
    handles.markerRequestUrls.push(url.toString());
    const nodeKey = url.searchParams.get('nodeKey');
    const markers = nodeKey === LEAF_NODE_KEY ? [targetMarker] : [targetMarker, outsideMarker];
    await fulfillJson(route, 200, { city: CITY_SLUG, markers });
  });

  return handles;
}

const markerSelector = `[data-listing-id="${TARGET_LISTING_ID}"] [data-testid="property-marker"]`;
const outsideMarkerSelector = `[data-listing-id="${OUTSIDE_LISTING_ID}"] [data-testid="property-marker"]`;

/** Reads the live Leaflet zoom via the page's own E2E debug contract
 * (`window.__debug.mapState.zoom`, published by useDiscoverDebugBridge.ts —
 * an established Playwright contract already relied on by other specs in
 * this repo, e.g. issue-2083-home-breadcrumb-back-camera-race.spec.ts). */
function readDebugZoom(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const w = window as Window & { __debug?: { mapState?: { zoom?: number } } };
    return w.__debug?.mapState?.zoom ?? null;
  });
}

function nodeUrl(node: string | null): string {
  const params = new URLSearchParams({
    city: CITY_SLUG,
    journey: 'area-first',
    lat: String(TARGET_LAT),
    lon: String(TARGET_LON),
    zoom: String(ZOOM),
  });
  if (node != null) params.set('node', node);
  return `/discover?${params.toString()}`;
}

test.describe('Issue #2193 AC4 — node invariant (dual-surface, stubbed transport)', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  test('GREEN: a resolved AREA leaf renders the target listing on BOTH surfaces, by id, with correctly-scoped outgoing requests, and excludes the outside listing from both', async ({
    page,
  }) => {
    const handles = await stubAll(page);

    await page.goto(nodeUrl(LEAF_NODE_KEY));
    await page.waitForLoadState('domcontentloaded');

    // ── PANEL surface ──
    const panelShell = page.getByTestId('discover-areas-journey-panel-shell');
    await expect(panelShell).toBeVisible({ timeout: 15_000 });

    const listingsWrapper = page.getByTestId('areas-journey-panel-listings');
    await expect(listingsWrapper).toBeVisible({ timeout: 15_000 });

    // By listing id, not a bare count (R7): exactly one card, and it must be
    // the TARGET listing's own card (there is only one card in the
    // correctly-scoped fixture, but we still assert scoped-inside-panel
    // structurally rather than a top-level count alone).
    const cards = panelShell.getByTestId('listing-card');
    await expect(cards).toHaveCount(1, { timeout: 15_000 });
    await expect(panelShell).toContainText('TargetArea');

    // ── ZOOM PRECONDITION (R5) ──
    // The URL's own `zoom=14` (R5's intended precondition) is legitimately
    // OVERRIDDEN once, on cold-load, by the canonical node journey's own
    // fitBounds-to-node-bounds camera effect (`canonicalNodeFitCount`,
    // useDiscoverCameraOrchestration.ts) — a genuine product behaviour (a
    // deep link into a resolved AREA leaf recentres/refits the map to that
    // area's bounds), not a defect. Confirmed live via the page's own
    // Playwright debug contract (`window.__debug.mapState.zoom`,
    // useDiscoverDebugBridge.ts): it settles at 11 after the fit, not the
    // URL's 14. Real Leaflet zoom is therefore driven up EXPLICITLY here,
    // through the actual "Zoom in" map control (a genuine user action, not a
    // state injection), until it is strictly above AREA_LAYER_MAX_ZOOM (12)
    // — the real precondition `shouldShowMarkers` reads — and asserted via
    // the same debug contract before proceeding.
    const zoomInButton = page.getByRole('button', { name: 'Zoom in' });
    for (let attempt = 0; attempt < 6; attempt++) {
      const zoom = await readDebugZoom(page);
      if (zoom != null && zoom > 12) break;
      await zoomInButton.click();
      await page.waitForTimeout(300);
    }
    await expect.poll(() => readDebugZoom(page), { timeout: 10_000 }).toBeGreaterThan(12);

    // ── MARKER surface (the centrepiece — real Leaflet DOM) ──
    const targetMarkerLocator = page.locator(markerSelector);
    await expect(targetMarkerLocator).toBeVisible({ timeout: 20_000 });
    await expect(targetMarkerLocator).toHaveCount(1);

    // ── N1: negative control — the OUTSIDE listing/marker must be absent
    // from BOTH surfaces for this correctly node-scoped fixture. ──
    await expect(page.locator(outsideMarkerSelector)).toHaveCount(0);
    await expect(panelShell).not.toContainText('OutsideArea');

    // ── N4: request-param spy — the outgoing requests actually carried the
    // correct scope. A stubbed transport can otherwise pass DOM assertions
    // purely because the stub returns the fixture regardless of what was
    // asked for — this is what stops the spec being tautological. ──
    expect(handles.markerRequestUrls.length, 'at least one markers request was made').toBeGreaterThan(0);
    const markerUrl = new URL(handles.markerRequestUrls[handles.markerRequestUrls.length - 1]);
    expect(markerUrl.searchParams.get('nodeKey'), `nodeKey missing/wrong in: ${markerUrl}`).toBe(LEAF_NODE_KEY);

    expect(handles.panelRequestUrls.length, 'at least one panel listings request was made').toBeGreaterThan(0);
    const panelUrl = new URL(handles.panelRequestUrls[handles.panelRequestUrls.length - 1]);
    expect(panelUrl.searchParams.getAll('areaKeys'), `areaKeys missing/wrong in: ${panelUrl}`).toEqual([
      TARGET_AREA_KEY,
    ]);

    // Both requests name the SAME geography (the map/panel divergence #2193
    // exists to catch): the marker's resolved nodeKey and the panel's
    // areaKeys both trace back to the identical navigation/resolve fixture
    // node (LEAF_NODE_KEY <-> TARGET_AREA_KEY).
  });

  /**
   * Companion regression guard (not itself the AC6 red-first proof — see
   * this file's PR/validation-matrix note for the actual red-run capture,
   * which was performed by temporarily reverting the GREEN test above to
   * navigate with `node=` stripped and observing a genuine failure before
   * this file reached its current state). Kept here as a permanent, honest,
   * ALWAYS-PASSING assertion of the inverse case: with no `node=` at all,
   * per useDiscoverMapDataController.ts's isTopGroupedLevel guard, an
   * area-first journey with no groupId/areaKey/effectiveSelectedArea/
   * schoolId/nodeListings is the grouped-overview state, which disables BOTH
   * the panel's listings fetch and the map's markers fetch entirely — so
   * neither surface should ever resolve the target listing without a node.
   */
  test('negative case: no node= in the URL — neither surface resolves the target listing/marker', async ({
    page,
  }) => {
    await stubAll(page);

    await page.goto(nodeUrl(null));
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByTestId('areas-journey-panel-listings')).not.toBeVisible();
    await expect(page.locator(markerSelector)).toHaveCount(0);
  });
});
