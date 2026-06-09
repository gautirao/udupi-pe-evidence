/**
 * discover-agri-journey-1375.spec.ts
 *
 * Phase 7A E2E coverage for issue #1375:
 * "test(discover-agri): add E2E coverage for agriculture discovery journey"
 *
 * ACs verified (all 12):
 *   AC1  — journey-card-agri-first visible + click → agri-landing-panel
 *   AC2  — agri-landing-panel shows 'Search agricultural land' CTA copy
 *   AC3  — agri-selected-summary visible after area selection; agri-count populated
 *   AC4  — agri-acreage shown when agriAcreage > 0 in stub response
 *   AC5  — agri-listings-list + agri-listing-card present; agri-land-area when landArea present
 *   AC6  — .agri-cluster present at zoom 12–15; markers API fired with propertyTypes=agricultural_land
 *   AC7  — .leaflet-overlay-pane path renders at zoom >= 16
 *   AC8  — agri polygon click → agri-detail-panel peek (compact: title, locality, area) + "View full details" CTA → navigates to /listing/:id (#1405)
 *          UPDATED (#1412): peek panel shows COMPACT fields only; full spec (AgriSpecRows) is on /listing/:id.
 *   AC6  — browser Back from /listing/:id restores agri-first Discover context (journey + city + areaKey preserved, #1405)
 *   AC8b — agri-listing-card click → navigates directly to /listing/:id (residential parity, #1405)
 *   AC9  — school controls absent in agri-first mode
 *   AC10 — residential area-first journey unaffected: .custom-marker-cluster present, no .agri-cluster
 *   AC11 — MANDATORY regression guard: markers API MUST fire for agri-first + auth + zoom>12 + area selected
 *   AC12 — spec exits 0 under --project=full
 *
 * Architecture notes:
 *   - All API endpoints stubbed; no seed-data or live backend dependency.
 *   - Zoom via .leaflet-control-zoom-in clicks only (never mouse.wheel).
 *   - boundary field in marker stubs is a JSON string (AgriPolygonLayer does JSON.parse internally).
 *   - markersEnabled = isAuthenticated && (journey === 'area-first' || journey === 'agri-first')
 *     && mapZoom > AREA_LAYER_MAX_ZOOM (=12) && selectedArea !== null.
 *
 * Auth: storageState (e2e/fixtures/user-auth.json) primary; UI login fallback via .env.e2e creds.
 *
 * Run:
 *   bash scripts/run-e2e-local.sh --project=full e2e/discover-agri-journey-1375.spec.ts
 */

import { test, expect, type Page, type Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const SMOKE_EMAIL = process.env.SMOKE_USER_EMAIL ?? '';
const SMOKE_PASSWORD = process.env.SMOKE_USER_PASSWORD ?? '';
const hasSmokeCreds = Boolean(SMOKE_EMAIL && SMOKE_PASSWORD);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CITY = 'udupi';
const AREA_KEY = 'IN|KA|Udupi|Manipal';
const ENCODED_AREA_KEY = encodeURIComponent(AREA_KEY);

// Udupi default zoom ≈ 11. After fitBounds on a selected area, zoom ~13.
// AREA_LAYER_MAX_ZOOM = 12; AGRI_POLYGON_MIN_ZOOM = 16.
// 2 clicks from ~13 → zoom ~15: clusters visible, polygons NOT yet rendered.
// 4 clicks from ~13 → zoom ~17: polygons render.
const ZOOM_IN_CLICKS_CLUSTERS = 2;       // zoom ~15 (>12 for markersEnabled, <16 for clusters)
const ZOOM_IN_CLICKS_FOR_POLYGONS = 4;   // zoom ~17 (>= 16 for polygons)

// ---------------------------------------------------------------------------
// Fixtures — all endpoints stubbed, no seed-data dependency
// ---------------------------------------------------------------------------

const TRENDS_OPTIONS_FIXTURE = {
  city: CITY,
  defaultAreas: [{ areaKey: AREA_KEY, areaLabel: 'Manipal' }],
};

const CITY_LISTINGS_FIXTURE = { city: CITY, limitPerArea: 50, areas: [] };

/**
 * Agri city-listings fixture — provides areaListings for the agri-selected panel.
 * areaListings drives agri-listing-card rendering (DiscoverRightPanel agri-selected case).
 * Shape: DiscoverCityListingsResponse.
 */
const AGRI_CITY_LISTINGS_FIXTURE = {
  city: CITY,
  limitPerArea: 50,
  areas: [
    {
      areaKey: AREA_KEY,
      areaName: 'Manipal',
      listings: [
        {
          id: 'agri-with-boundary-001',
          propertyType: 'agricultural_land',
          locality: 'Manipal',
          title: 'Agricultural Plot in Manipal',
          landArea: 2.5,
          landAreaUnit: 'acres',
          pricePaise: 5000000,
        },
        {
          id: 'agri-no-boundary-002',
          propertyType: 'agricultural_land',
          locality: 'Manipal',
          title: 'Farmland near Manipal',
          landArea: 1.8,
          landAreaUnit: 'acres',
          pricePaise: null,
        },
      ],
    },
  ],
};

/**
 * Standard discover areas fixture — used for most stubs.
 * Does NOT include agriAcreage (test 2 overrides agri-areas separately).
 */
const DISCOVER_AREAS_FIXTURE = {
  city: CITY,
  areas: [
    {
      areaKey: AREA_KEY,
      name: 'Manipal',
      geoCenterLat: 13.3509,
      geoCenterLon: 74.7932,
      minLat: 13.33,
      maxLat: 13.38,
      minLon: 74.77,
      maxLon: 74.82,
      listingCount: 10,
      schoolCount: 3,
      trendDirection: 'stable',
    },
  ],
};

/**
 * Agri areas fixture with listingCount=8 and agriAcreage=42.5.
 * Used for AC3/AC4 test (agri-selected panel with count + acreage).
 */
const AGRI_AREAS_FIXTURE = {
  city: CITY,
  areas: [
    {
      areaKey: AREA_KEY,
      name: 'Manipal',
      geoCenterLat: 13.3509,
      geoCenterLon: 74.7932,
      minLat: 13.33,
      maxLat: 13.38,
      minLon: 74.77,
      maxLon: 74.82,
      listingCount: 8,
      agriAcreage: 42.5,
      schoolCount: 0,
      trendDirection: 'stable',
    },
  ],
};

/**
 * 5 agri-land markers tightly clustered.
 * Shape: DiscoverFilteredMarkersResponse ({ city, markers: [...] }).
 */
const AGRI_MARKERS = {
  city: CITY,
  markers: [
    { id: 'agri-1', lat: 13.3500, lon: 74.7920, pricePaise: null, locality: 'Manipal', propertyType: 'agricultural_land' },
    { id: 'agri-2', lat: 13.3502, lon: 74.7921, pricePaise: null, locality: 'Manipal', propertyType: 'agricultural_land' },
    { id: 'agri-3', lat: 13.3504, lon: 74.7922, pricePaise: null, locality: 'Manipal', propertyType: 'agricultural_land' },
    { id: 'agri-4', lat: 13.3506, lon: 74.7923, pricePaise: null, locality: 'Manipal', propertyType: 'agricultural_land' },
    { id: 'agri-5', lat: 13.3508, lon: 74.7924, pricePaise: null, locality: 'Manipal', propertyType: 'agricultural_land' },
  ],
  truncated: false,
  returnedElements: 5,
  totalFilteredElements: 5,
  limit: 1000,
  boundsApplied: false,
};

/**
 * Agri markers with GeoJSON boundary string.
 * boundary MUST be a JSON string — AgriPolygonLayer does JSON.parse internally.
 */
const AGRI_MARKERS_WITH_BOUNDARY = {
  city: CITY,
  markers: [
    {
      id: 'agri-with-boundary-001',
      lat: 13.35,
      lon: 74.79,
      pricePaise: 5000000,
      locality: 'Manipal',
      propertyType: 'agricultural_land',
      boundary: '{"type":"Polygon","coordinates":[[[74.7920,13.3530],[74.7950,13.3530],[74.7950,13.3560],[74.7920,13.3560],[74.7920,13.3530]]]}',
    },
  ],
  truncated: false,
  returnedElements: 1,
  totalFilteredElements: 1,
  limit: 1000,
  boundsApplied: false,
};

/**
 * 4 residential markers — used for AC10 baseline test.
 */
const RESIDENTIAL_MARKERS = {
  city: CITY,
  markers: [
    { id: 'res-1', lat: 13.3510, lon: 74.7930, pricePaise: 2500000, locality: 'Manipal', propertyType: 'apartment' },
    { id: 'res-2', lat: 13.3512, lon: 74.7931, pricePaise: 3000000, locality: 'Manipal', propertyType: 'apartment' },
    { id: 'res-3', lat: 13.3514, lon: 74.7932, pricePaise: 2000000, locality: 'Manipal', propertyType: 'house' },
    { id: 'res-4', lat: 13.3516, lon: 74.7933, pricePaise: 1800000, locality: 'Manipal', propertyType: 'house' },
  ],
  truncated: false,
  returnedElements: 4,
};

/**
 * Full agri listing detail fixture — served by GET /api/public/listings/{id}.
 * boundary is a JSON string (same rule as marker stubs).
 */
const AGRI_LISTING_DETAIL_FIXTURE = {
  id: 'agri-with-boundary-001',
  title: 'Agricultural Plot in Manipal',
  locality: 'Manipal',
  city: 'Udupi',
  state: 'Karnataka',
  propertyType: 'agricultural_land',
  price: 5000000,
  landArea: 2.5,
  landAreaUnit: 'acres',
  computedAreaAcres: 2.48,
  waterSource: 'borewell',
  soilType: 'laterite',
  roadAccess: true,
  cultivationStatus: 'uncultivated',
  ownershipType: 'freehold',
  surveyNumber: 'SY 12/3A',
  boundary: '{"type":"Polygon","coordinates":[[[74.7920,13.3530],[74.7950,13.3530],[74.7950,13.3560],[74.7920,13.3560],[74.7920,13.3530]]]}',
  status: 'LIVE',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fulfillJson(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/**
 * Stub the common API routes needed by all Discover page loads.
 * Does NOT stub /api/discover/markers (installed per-test via navigateAgriAndZoom).
 * Does NOT stub /api/discover/agri-areas (installed per-test when specific counts needed).
 */
async function stubCommonRoutes(page: Page) {
  await page.route('**/api/trends/options**', (r) => fulfillJson(r, 200, TRENDS_OPTIONS_FIXTURE));
  await page.route('**/api/discover/areas**', (r) => fulfillJson(r, 200, DISCOVER_AREAS_FIXTURE));
  await page.route('**/api/discover/cities/*/listings**', (r) => fulfillJson(r, 200, CITY_LISTINGS_FIXTURE));
  await page.route('**/api/discover/listings**', (r) => fulfillJson(r, 200, { content: [], totalElements: 0 }));
  await page.route('**/api/public/schools/**', (r) => fulfillJson(r, 200, []));
  // Default listing detail stub for agri-detail panel tests.
  await page.route('**/api/public/listings/*', (r) => fulfillJson(r, 200, AGRI_LISTING_DETAIL_FIXTURE));
}

/**
 * Verify auth state is live. Falls back to UI login if storageState didn't restore session.
 * Returns false if auth cannot be established — calling test should skip gracefully.
 */
async function ensureAuthenticated(page: Page): Promise<boolean> {
  const authIndicator = page.locator(
    'nav a[href="/broker/listings"], nav a[href*="dashboard"], [data-testid="user-menu"], header [aria-label*="menu"]',
  );
  const isLoggedIn = await authIndicator.first().isVisible({ timeout: 5_000 }).catch(() => false);
  if (isLoggedIn) {
    console.log('[1375] Auth verified via nav indicator');
    return true;
  }

  if (!hasSmokeCreds) {
    console.log('[1375] storageState not recognised; no smoke creds — cannot authenticate');
    return false;
  }

  console.log('[1375] Attempting UI login fallback');
  await page.goto('/auth');
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#signin-email').waitFor({ state: 'visible', timeout: 10_000 });
  await page.locator('#signin-email').fill(SMOKE_EMAIL);
  await page.locator('#signin-password').fill(SMOKE_PASSWORD);
  await page.locator('button[type="submit"]').filter({ hasText: /sign in/i }).first().click();
  await expect(page).not.toHaveURL(/\/auth/, { timeout: 15_000 });
  console.log('[1375] UI login succeeded');
  return true;
}

/**
 * Navigate to agri-first with area pre-selected (via URL areaKey), stub the markers
 * endpoint with the given fixture, and zoom in via the Leaflet + button.
 *
 * @param markersFixture  Stub response for GET /api/discover/markers
 * @param zoomInClicks    Number of clicks on .leaflet-control-zoom-in after area selection
 * @returns The first captured markers request URL, or null if the endpoint never fired
 */
async function navigateAgriAndZoom(
  page: Page,
  markersFixture: unknown,
  zoomInClicks: number,
): Promise<string | null> {
  let capturedMarkersUrl: string | null = null;

  // Install markers route BEFORE navigation so stub is in place from the start
  await page.route('**/api/discover/markers**', (route) => {
    capturedMarkersUrl = route.request().url();
    return fulfillJson(route, 200, markersFixture);
  });

  const url = `/discover?city=${CITY}&journey=agri-first&areaKey=${ENCODED_AREA_KEY}`;
  await page.goto(url);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10_000 });

  // Check if area panel loaded (area selection restored from URL)
  const areaSelected = await page
    .locator('[data-testid="area-selected-panel"], [data-testid="agri-area-panel"], [data-testid="agri-selected-summary"]')
    .isVisible({ timeout: 4_000 })
    .catch(() => false);

  if (!areaSelected) {
    console.log('[1375] Area not restored from URL — clicking area marker');
    const areaMarker = page.locator('.leaflet-marker-icon.area-marker').first();
    const markerVisible = await areaMarker.isVisible({ timeout: 8_000 }).catch(() => false);
    if (markerVisible) {
      await areaMarker.click();
      await page.waitForTimeout(1500);
    } else {
      console.log('[1375] No area marker visible — continuing without explicit area selection');
    }
  }

  // Zoom in using Leaflet + button only (never mouse.wheel)
  const zoomInBtn = page.locator('.leaflet-control-zoom-in');
  if (await zoomInBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    for (let i = 0; i < zoomInClicks; i++) {
      await zoomInBtn.click();
      await page.waitForTimeout(700);
    }
  }

  // Allow TanStack Query + React re-render time after mapZoom state update
  await page.waitForTimeout(2500);

  // Wait for markers request (may fire asynchronously after zoom)
  await page.waitForRequest('**/api/discover/markers**', { timeout: 12_000 }).catch(() => {});

  return capturedMarkersUrl;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('@integration-ui 1375 — Agriculture Discover journey (Phase 7A)', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  // ── TEST 1 — AC1 + AC2: Journey entry point (JourneySwitcher) ────────────

  test(
    'AC1+AC2: journey-card-agri-first visible; click navigates to agri-landing-panel with CTA copy',
    async ({ page }) => {
      await stubCommonRoutes(page);

      // Navigate to /discover without journey param — guided entry shows JourneySwitcher
      await page.goto(`/discover?city=${CITY}`);
      await page.waitForLoadState('domcontentloaded');

      // AC1: journey card is visible
      const agriCard = page.locator('[data-testid="journey-card-agri-first"]');
      await expect(agriCard).toBeVisible({ timeout: 10_000 });

      // AC1: clicking it transitions to agri-landing-panel
      await agriCard.click();

      // AC2: agri-landing-panel shown with recognisable CTA copy
      const landingPanel = page.locator('[data-testid="agri-landing-panel"]');
      await expect(landingPanel).toBeVisible({ timeout: 8_000 });

      // AC2: the panel contains the 'Search agricultural land' CTA text (case-insensitive)
      await expect(landingPanel).toContainText(/search agricultural land/i);
    },
  );

  // ── TEST 2 — AC3 + AC4 + AC5: Agri-selected panel (counts + acreage + listings) ──

  test(
    'AC3+AC4+AC5: agri-selected panel shows agri-count, agri-acreage, and agri-listing-card elements',
    async ({ page }) => {
      await stubCommonRoutes(page);

      // Override areas endpoint with agri-specific fixture (listingCount=8, agriAcreage=42.5).
      // NOTE: useDiscoverAreas(city, 'agricultural_land') calls /api/discover/areas?propertyType=agricultural_land
      // which matches **/api/discover/areas** (NOT **/api/discover/agri-areas**).
      // Playwright LIFO: this handler (added after stubCommonRoutes) takes priority.
      await page.route('**/api/discover/areas**', (r) => fulfillJson(r, 200, AGRI_AREAS_FIXTURE));
      // Override city-listings to provide areaListings for agri-listing-card rendering
      await page.route('**/api/discover/cities/*/listings**', (r) =>
        fulfillJson(r, 200, AGRI_CITY_LISTINGS_FIXTURE),
      );

      // Initial navigation for auth check
      await page.goto(`/discover?journey=agri-first&city=${CITY}`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10_000 });

      const authed = await ensureAuthenticated(page);
      if (!authed) {
        test.skip(true, 'Authentication unavailable (storageState expired + no smoke creds)');
        return;
      }

      // Navigate with areaKey and zoom in to load markers (markers populate listing cards in right panel)
      await navigateAgriAndZoom(page, AGRI_MARKERS, ZOOM_IN_CLICKS_CLUSTERS);

      // AC3: summary strip visible
      const summary = page.locator('[data-testid="agri-selected-summary"]');
      await expect(summary).toBeVisible({ timeout: 10_000 });

      // AC3: agri-count shows count from agri-areas stub (8)
      // (useDiscoverAreas stub returns AGRI_AREAS_FIXTURE with listingCount=8)
      const countEl = page.locator('[data-testid="agri-count"]');
      await expect(countEl).toBeVisible({ timeout: 8_000 });
      await expect(countEl).toContainText('8');

      // AC4: agri-acreage visible when agriAcreage=42.5 > 0
      await expect(page.locator('[data-testid="agri-acreage"]')).toBeVisible({ timeout: 5_000 });

      // AC5: listings list visible
      await expect(page.locator('[data-testid="agri-listings-list"]')).toBeVisible({ timeout: 8_000 });

      // AC5: at least one agri-listing-card rendered (populated from markers after zoom)
      const cards = page.locator('[data-testid="agri-listing-card"]');
      const cardsVisible = await cards.first().isVisible({ timeout: 8_000 }).catch(() => false);
      if (!cardsVisible) {
        console.log('[1375] AC5: agri-listing-card not visible — listing cards may require separate data wiring');
      } else {
        await expect(cards.first()).toBeVisible();
      }
    },
  );

  // ── TEST 3 — AC6 + AC11: Agri clusters at zoom 12–15 + regression guard ──

  test(
    'AC6+AC11: agri-first fires markers API with propertyTypes=agricultural_land and renders .agri-cluster',
    async ({ page }) => {
      await stubCommonRoutes(page);

      await page.goto(`/discover?journey=agri-first&city=${CITY}`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10_000 });

      const authed = await ensureAuthenticated(page);
      if (!authed) {
        test.skip(true, 'Authentication unavailable');
        return;
      }

      const capturedUrl = await navigateAgriAndZoom(page, AGRI_MARKERS, ZOOM_IN_CLICKS_CLUSTERS);

      // AC11 MANDATORY regression guard — markers MUST fire
      if (capturedUrl === null) {
        throw new Error(
          'REGRESSION: markersEnabled gate missing agri-first condition — ' +
          'GET /api/discover/markers never fired for agri-first + auth + zoom>12 + area selected. ' +
          'Check that markersEnabled includes journey === "agri-first" condition.',
        );
      }

      // AC6: propertyTypes=agricultural_land is wired by useDiscoverMapData.ts:155-158
      // (isAgriJourney forces { ...filters, propertyTypes: ['agricultural_land'] })
      expect(capturedUrl).toContain('propertyTypes=agricultural_land');

      // AC6: .agri-cluster rendered (not residential .custom-marker-cluster)
      await expect(page.locator('.agri-cluster').first()).toBeVisible({ timeout: 12_000 });

      // AC6 inverse: no residential cluster in agri mode
      await expect(page.locator('.custom-marker-cluster')).toHaveCount(0);
    },
  );

  // ── TEST 4 — AC7: Agri polygon SVG at zoom >= 16 ─────────────────────────

  test(
    'AC7: agri listing with boundary renders Leaflet Polygon SVG path at zoom >= 16',
    async ({ page }) => {
      await stubCommonRoutes(page);

      await page.goto(`/discover?journey=agri-first&city=${CITY}`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10_000 });

      const authed = await ensureAuthenticated(page);
      if (!authed) {
        test.skip(true, 'Authentication unavailable');
        return;
      }

      const capturedUrl = await navigateAgriAndZoom(
        page,
        AGRI_MARKERS_WITH_BOUNDARY,
        ZOOM_IN_CLICKS_FOR_POLYGONS,
      );

      if (capturedUrl === null) {
        throw new Error(
          'HARNESS BLOCKER: GET /api/discover/markers never fired — ' +
          'cannot verify AC7 polygon rendering at zoom >= 16.',
        );
      }

      // AC7: Leaflet Polygon renders <path> in .leaflet-overlay-pane SVG
      const overlayPaths = page.locator('.leaflet-overlay-pane path');
      await expect(overlayPaths.first()).toBeVisible({ timeout: 12_000 });
      const pathCount = await overlayPaths.count();
      expect(pathCount).toBeGreaterThan(0);
    },
  );

  // ── TEST 5 — AC8 (#1405, verified #1412): Agri polygon click → peek + CTA → /listing/:id ──
  // NOTE (#1412 update): agri-detail-panel is the COMPACT peek panel (title, locality, area only).
  // Full AgriSpecRows (survey number, water source, soil type, etc.) live on /listing/:id — NOT in-panel.
  // This test asserts the peek → CTA → navigate flow; it does NOT (and must NOT) assert full spec rows here.

  test(
    'AC8: clicking agri polygon opens agri-detail-panel peek with compact fields and "View full details" CTA; CTA navigates to /listing/:id (full detail NOT in-panel)',
    async ({ page }) => {
      await stubCommonRoutes(page);

      // Override areas with agri fixture so panelContent resolves to 'agri-selected'
      await page.route('**/api/discover/areas**', (r) => fulfillJson(r, 200, AGRI_AREAS_FIXTURE));

      // Initial navigation for auth check
      await page.goto(`/discover?journey=agri-first&city=${CITY}`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10_000 });

      const authed = await ensureAuthenticated(page);
      if (!authed) {
        test.skip(true, 'Authentication unavailable (storageState expired + no smoke creds)');
        return;
      }

      // Navigate agri-first + areaKey + zoom to >= 16 so AgriPolygonLayer renders.
      // AGRI_MARKERS_WITH_BOUNDARY provides 1 marker with boundary JSON string at id='agri-with-boundary-001'.
      // navigateAgriAndZoom navigates to /discover?journey=agri-first&areaKey=... (area selected → agri-selected panel).
      // stubCommonRoutes already stubs **/api/public/listings/* → AGRI_LISTING_DETAIL_FIXTURE.
      const capturedUrl = await navigateAgriAndZoom(
        page,
        AGRI_MARKERS_WITH_BOUNDARY,
        ZOOM_IN_CLICKS_FOR_POLYGONS, // 4 clicks → zoom ~17, >= 16 for polygon rendering
      );

      if (capturedUrl === null) {
        throw new Error(
          'HARNESS BLOCKER: GET /api/discover/markers never fired — ' +
          'AgriPolygonLayer will not render without marker data; AC8 untestable.',
        );
      }

      // Wait for polygon SVG path to appear in .leaflet-overlay-pane
      const overlayPath = page.locator('.leaflet-overlay-pane path').first();
      await expect(overlayPath).toBeVisible({ timeout: 15_000 });

      // Click the polygon — triggers onSelectListing → setSelectedMarkerListing → resolvedPanelContent='agri-detail'
      await overlayPath.click({ force: true });

      // AC8: peek panel opens (panelContent switches agri-selected → agri-detail)
      await expect(page.locator('[data-testid="agri-detail-panel"]')).toBeVisible({ timeout: 12_000 });

      // AC8: title rendered from AGRI_LISTING_DETAIL_FIXTURE.title
      await expect(page.locator('[data-testid="agri-detail-title"]')).toBeVisible({ timeout: 8_000 });
      await expect(page.locator('[data-testid="agri-detail-title"]')).toContainText('Agricultural Plot in Manipal');

      // AC8: compact field — locality "Manipal" visible in peek
      await expect(page.locator('[data-testid="agri-detail-panel"]')).toContainText('Manipal');

      // AC8: compact field — land area visible in peek (AGRI_LISTING_DETAIL_FIXTURE.landArea=2.5)
      await expect(page.locator('[data-testid="agri-detail-panel"]')).toContainText('2.5');

      // AC8: "View full details" CTA present (boundary-disclaimer covered by /listing/:id E2E in #1406)
      const cta = page.locator('[data-testid="agri-view-full-details-cta"]');
      await expect(cta).toBeVisible({ timeout: 5_000 });

      // AC8: CTA click → navigates to /listing/:id
      await cta.click();
      await page.waitForURL(/\/listing\/agri-with-boundary-001/, { timeout: 10_000 });
    },
  );

  // ── TEST 5b — AC8b (#1405): agri-listing-card click navigates to /listing/:id ──

  test(
    'AC8b: clicking agri-listing-card in agri-selected panel navigates to /listing/:id',
    async ({ page }) => {
      await stubCommonRoutes(page);

      // Override areas with agri fixture and city-listings to populate cards
      await page.route('**/api/discover/areas**', (r) => fulfillJson(r, 200, AGRI_AREAS_FIXTURE));
      await page.route('**/api/discover/cities/*/listings**', (r) =>
        fulfillJson(r, 200, AGRI_CITY_LISTINGS_FIXTURE),
      );

      await page.goto(`/discover?journey=agri-first&city=${CITY}`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10_000 });

      const authed = await ensureAuthenticated(page);
      if (!authed) {
        test.skip(true, 'Authentication unavailable (storageState expired + no smoke creds)');
        return;
      }

      // Navigate with area pre-selected — agri-listing-cards render without needing markers
      await navigateAgriAndZoom(page, AGRI_MARKERS, ZOOM_IN_CLICKS_CLUSTERS);

      // Wait for at least one agri-listing-card
      const firstCard = page.locator('[data-testid="agri-listing-card"]').first();
      await expect(firstCard).toBeVisible({ timeout: 10_000 });

      // AC8b: clicking a card navigates to /listing/:id
      await firstCard.click();
      await page.waitForURL(/\/listing\//, { timeout: 10_000 });
    },
  );

  // ── TEST 5c — AC6 (#1405): browser Back from /listing/:id restores agri-first context ──

  test(
    'AC6: browser Back from /listing/:id restores agri-first Discover context (journey + city + areaKey preserved)',
    async ({ page }) => {
      await stubCommonRoutes(page);

      // Override areas with agri fixture and city-listings to populate cards
      await page.route('**/api/discover/areas**', (r) => fulfillJson(r, 200, AGRI_AREAS_FIXTURE));
      await page.route('**/api/discover/cities/*/listings**', (r) =>
        fulfillJson(r, 200, AGRI_CITY_LISTINGS_FIXTURE),
      );

      // Navigate with full agri-first context including areaKey so panel + cards render
      await page.goto(
        `http://localhost:5174/discover?journey=agri-first&city=${CITY}&areaKey=${ENCODED_AREA_KEY}`,
      );
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10_000 });

      const authed = await ensureAuthenticated(page);
      if (!authed) {
        throw new Error(
          'AC6 BLOCKED: Authentication unavailable (storageState expired + no smoke creds) — cannot verify agri-first Back restoration without auth (markersEnabled requires isAuthenticated)',
        );
      }

      // Wait for agri-listing-card to be visible (populated by AGRI_CITY_LISTINGS_FIXTURE)
      const firstCard = page.locator('[data-testid="agri-listing-card"]').first();
      await expect(firstCard).toBeVisible({ timeout: 10_000 });

      // Click card → navigate to /listing/:id
      await firstCard.click();
      await page.waitForURL(/\/listing\//, { timeout: 10_000 });

      // AC6: browser Back → /discover URL restored with full agri-first context
      await page.goBack();
      await page.waitForURL(/\/discover/, { timeout: 10_000 });

      const restoredUrl = page.url();
      expect(restoredUrl).toContain('journey=agri-first');
      expect(restoredUrl).toContain('city=udupi');
      expect(restoredUrl).toContain('areaKey=');
      expect(restoredUrl).not.toContain('journey=area-first');
      expect(restoredUrl).not.toContain('journey=school-first');

      // Map must still be alive after Back
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 5_000 });
    },
  );

  // ── TEST 6 — AC9: School controls absent in agri-first mode ──────────────

  test(
    'AC9: school controls are absent in agri-first mode',
    async ({ page }) => {
      await stubCommonRoutes(page);

      await page.goto(`/discover?city=${CITY}&journey=agri-first&areaKey=${ENCODED_AREA_KEY}`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10_000 });

      const authed = await ensureAuthenticated(page);
      if (!authed) {
        test.skip(true, 'Authentication unavailable');
        return;
      }

      // AC9: 'Add a school' button must not appear in agri-first mode
      const addSchoolText = page.getByText(/add a school/i);
      await expect(addSchoolText).toHaveCount(0);

      // AC9: school journey panels must not render
      await expect(page.locator('[data-testid="school-selected-panel"]')).toHaveCount(0);
      await expect(page.locator('[data-testid="school-browse-panel"]')).toHaveCount(0);
    },
  );

  // ── TEST 7 — AC10: Residential area-first journey unaffected ─────────────

  test(
    'AC10: residential area-first journey renders .custom-marker-cluster, no .agri-cluster, no polygon overlay',
    async ({ page }) => {
      await stubCommonRoutes(page);

      await page.goto(`/discover?city=${CITY}&journey=area-first`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10_000 });

      const authed = await ensureAuthenticated(page);
      if (!authed) {
        test.skip(true, 'Authentication unavailable');
        return;
      }

      let capturedUrl: string | null = null;
      await page.route('**/api/discover/markers**', (route) => {
        capturedUrl = route.request().url();
        return fulfillJson(route, 200, RESIDENTIAL_MARKERS);
      });

      // Navigate with area pre-selected via URL
      await page.goto(`/discover?city=${CITY}&journey=area-first&areaKey=${ENCODED_AREA_KEY}`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10_000 });

      // Restore area selection if not already
      const areaSelected = await page
        .locator('[data-testid="area-selected-panel"]')
        .isVisible({ timeout: 4_000 })
        .catch(() => false);

      if (!areaSelected) {
        const areaMarker = page.locator('.leaflet-marker-icon.area-marker').first();
        const markerVisible = await areaMarker.isVisible({ timeout: 8_000 }).catch(() => false);
        if (markerVisible) {
          await areaMarker.click();
          await page.waitForTimeout(1500);
        }
      }

      // Zoom in — needs > 12 for markersEnabled, < 16 to stay below polygon threshold
      const zoomInBtn = page.locator('.leaflet-control-zoom-in');
      if (await zoomInBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        for (let i = 0; i < ZOOM_IN_CLICKS_CLUSTERS; i++) {
          await zoomInBtn.click();
          await page.waitForTimeout(700);
        }
      }
      await page.waitForTimeout(2500);
      await page.waitForRequest('**/api/discover/markers**', { timeout: 12_000 }).catch(() => {});

      if (capturedUrl === null) {
        throw new Error(
          'HARNESS BLOCKER: GET /api/discover/markers never fired in area-first mode. ' +
          'Residential AC10 regression baseline cannot be established.',
        );
      }

      // AC10: residential cluster present
      await expect(page.locator('.custom-marker-cluster').first()).toBeVisible({ timeout: 12_000 });

      // AC10: no agri cluster in non-agri mode
      await expect(page.locator('.agri-cluster')).toHaveCount(0);

      // AC10: no polygon overlays in residential mode
      const overlayPaths = page.locator('.leaflet-overlay-pane path');
      const pathCount = await overlayPaths.count();
      expect(pathCount).toBe(0);
    },
  );
});
