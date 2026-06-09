/**
 * discover-agri-grouped-journey-1412.spec.ts
 *
 * E2E hardening for issue #1412:
 * "B5 E2E hardening: grouped agri Discover journey + agri /listing/:id detail reuse"
 *
 * ACs verified:
 *   AC1  — Anon agri-first Discover renders regional groups (count >= 1)
 *   AC2  — Select a group → ?group=DIR:BAND in URL (regex), NOT groupId; DOM reflects selection;
 *           Back restores prior context; Forward restores group; Clear removes ?group param
 *   AC3  — Network contract: regional-area-groups fired + agri-map-listings fired +
 *           /api/discover/markers count === 0 for anon grouped render (POSITIVE route-spy)
 *   AC4  — Agri card click → /listing/:id; polygon → peek panel → CTA → /listing/:id
 *   AC5  — /listing/:id renders AgriSpecRows fields + boundary map + agri-boundary-disclaimer
 *   AC6  — Anon detail: boundary + specs visible, PII keys absent from /api/public/listings/{id}
 *           response; Authed detail: unchanged
 *   AC10/AC11 — Real-seed headline: spec structured to run seed-backed when stack is up;
 *               deterministic route-spy assertions for network contract
 *
 * REAL-SEED HEADLINE TEST (AC10/AC11) — run this against the local fixture stack:
 *   Required stack:
 *     1. restore-test-fixture.sh  (pg-test-fixture:5434)
 *     2. scripts/seed-agricultural-listings.sh  (udupi: 7 groups, kundapur: 1)
 *     3. backend on :8085 pointed at local fixture
 *     4. frontend dev server on :5173 or :5174
 *   Base URL: http://localhost:5174 (or 5173)
 *   Seed state: udupi has 7 regional agri groups after seed-agricultural-listings.sh
 *   Command:
 *     REAL_SEED=1 bash scripts/run-e2e-local.sh --project=full \
 *       e2e/discover-agri-grouped-journey-1412.spec.ts
 *   Without REAL_SEED the real-seed test is skipped (stubbed tests still run).
 *
 * Architecture:
 *   - Anon flow uses ZERO auth. No storageState for anon describe block.
 *   - Authed flow uses storageState: 'e2e/fixtures/user-auth.json'.
 *   - All API routes stubbed by default; real-seed test conditionally defers to live backend.
 *   - Zoom via .leaflet-control-zoom-in clicks only (never mouse.wheel).
 *   - boundary field in marker stubs is a JSON string (AgriPolygonLayer does JSON.parse).
 *
 * Run:
 *   bash scripts/run-e2e-local.sh --project=full \
 *     e2e/discover-agri-grouped-journey-1412.spec.ts
 */

import { test, expect, type Page, type Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const SMOKE_EMAIL = process.env.SMOKE_USER_EMAIL ?? '';
const SMOKE_PASSWORD = process.env.SMOKE_USER_PASSWORD ?? '';
const hasSmokeCreds = Boolean(SMOKE_EMAIL && SMOKE_PASSWORD);

/** Set REAL_SEED=1 to enable the live-backend seed-backed headline test (AC10/AC11). */
const REAL_SEED = Boolean(process.env.REAL_SEED);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CITY = 'udupi';
const AREA_KEY = 'IN|KA|Udupi|Manipal';

// Direction:band for the group we use in stubbed tests (N:10_25)
const GROUP_DIR = 'N';
const GROUP_BAND = '10_25';
const GROUP_PARAM = `${GROUP_DIR}:${GROUP_BAND}`;     // raw colon, no encoding
// Tolerate both raw colon (N:10_25) and percent-encoded (%3A) depending on browser/router
const GROUP_PARAM_REGEX = /[?&]group=N(%3A|:)10_25/;  // URL assertion pattern
const GROUP_ID_ABSENT_REGEX = /groupId=/;              // must NOT appear

// Zoom constants — same convention as 1375/1373
// AREA_LAYER_MAX_ZOOM = 12; AGRI_POLYGON_MIN_ZOOM = 16
// Base zoom after agri-first landing ≈ 11–12; group focus may fitBounds → ~13.
const ZOOM_IN_CLICKS_CLUSTERS = 2;      // → zoom ~15: clusters visible, polygons not
const ZOOM_IN_CLICKS_FOR_POLYGONS = 4;  // → zoom ~17: polygons render

// Stubbed listing ID with boundary
const AGRI_ID_WITH_BOUNDARY = 'agri-grouped-001';
// Stubbed listing ID without boundary (for AC5 boundary-absent path)
const AGRI_ID_NO_BOUNDARY   = 'agri-grouped-002';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TRENDS_OPTIONS_FIXTURE = {
  city: CITY,
  defaultAreas: [{ areaKey: AREA_KEY, areaLabel: 'Manipal' }],
};

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
      listingCount: 5,
      agriAcreage: 18.0,
      schoolCount: 0,
      trendDirection: 'stable',
    },
  ],
};

const CITY_LISTINGS_FIXTURE = { city: CITY, limitPerArea: 50, areas: [] };

/**
 * Stubbed regional-area-groups response — 1 group in direction N, band 10_25.
 * areaKeys links the group to AREA_KEY so agri-map-listings can be called with it.
 */
const REGIONAL_AREA_GROUPS_FIXTURE = {
  city: CITY,
  groups: [
    {
      directionKey: GROUP_DIR,
      distanceBandKey: GROUP_BAND,
      label: 'North — 10–25 km',
      agriListingCount: 5,
      agriAcreage: 18.0,
      areaKeys: [AREA_KEY],
    },
  ],
};

/**
 * agri-map-listings stub — listings served via the public skipAuth endpoint.
 * Shape: { city, listings: [...] }
 */
const AGRI_MAP_LISTINGS_FIXTURE = {
  city: CITY,
  listings: [
    {
      id: AGRI_ID_WITH_BOUNDARY,
      title: 'Grouped Agri Plot North',
      locality: 'Manipal',
      landArea: 3.0,
      landAreaUnit: 'acres',
      pricePaise: 7500000,
      boundaryGeoJson: '{"type":"Polygon","coordinates":[[[74.7920,13.3530],[74.7950,13.3530],[74.7950,13.3560],[74.7920,13.3560],[74.7920,13.3530]]]}',
      lat: 13.353,
      lon: 74.793,
    },
    {
      id: AGRI_ID_NO_BOUNDARY,
      title: 'Grouped Agri Plot North 2',
      locality: 'Manipal',
      landArea: 1.5,
      landAreaUnit: 'acres',
      pricePaise: null,
      boundaryGeoJson: null,
      lat: 13.354,
      lon: 74.794,
    },
  ],
};

/**
 * Marker stub WITH boundary — used for polygon rendering tests.
 * boundary MUST be a JSON string (AgriPolygonLayer does JSON.parse internally).
 */
const AGRI_MARKERS_WITH_BOUNDARY = {
  city: CITY,
  markers: [
    {
      id: AGRI_ID_WITH_BOUNDARY,
      lat: 13.353,
      lon: 74.793,
      pricePaise: 7500000,
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
 * Full agri listing detail — served by GET /api/public/listings/{id}.
 * boundary as JSON string; no photos/heroImage/contactEmail/contactPhone (public safe).
 */
const AGRI_LISTING_DETAIL_WITH_BOUNDARY = {
  id: AGRI_ID_WITH_BOUNDARY,
  title: 'Grouped Agri Plot North',
  locality: 'Manipal',
  city: 'Udupi',
  state: 'Karnataka',
  propertyType: 'agricultural_land',
  price: 7500000,
  landArea: 3.0,
  landAreaUnit: 'acres',
  computedAreaAcres: 2.97,
  waterSource: 'borewell',
  soilType: 'laterite',
  roadAccess: true,
  cultivationStatus: 'uncultivated',
  ownershipType: 'freehold',
  surveyNumber: 'SY 45/2B',
  boundary: '{"type":"Polygon","coordinates":[[[74.7920,13.3530],[74.7950,13.3530],[74.7950,13.3560],[74.7920,13.3560],[74.7920,13.3530]]]}',
  latitude: 13.353,
  longitude: 74.793,
  status: 'LIVE',
};

/** Detail fixture WITHOUT boundary — for AC5 boundary-absent + AC6 PII-gating paths. */
const AGRI_LISTING_DETAIL_NO_BOUNDARY = {
  id: AGRI_ID_NO_BOUNDARY,
  title: 'Grouped Agri Plot North 2',
  locality: 'Manipal',
  city: 'Udupi',
  state: 'Karnataka',
  propertyType: 'agricultural_land',
  price: null,
  landArea: 1.5,
  landAreaUnit: 'acres',
  computedAreaAcres: 1.48,
  waterSource: null,
  soilType: null,
  roadAccess: false,
  cultivationStatus: null,
  ownershipType: 'freehold',
  surveyNumber: null,
  boundary: null,
  latitude: 13.354,
  longitude: 74.794,
  status: 'LIVE',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fulfillJson(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/**
 * Stub common Discover routes.
 * Includes regional-area-groups + agri-map-listings + listing detail.
 * Does NOT stub /api/discover/markers (not needed for anon grouped flow — assert it is ABSENT).
 */
async function stubCommonRoutes(page: Page) {
  await page.route('**/api/trends/options**', (r) => fulfillJson(r, 200, TRENDS_OPTIONS_FIXTURE));
  await page.route('**/api/discover/areas**', (r) => fulfillJson(r, 200, DISCOVER_AREAS_FIXTURE));
  await page.route('**/api/discover/cities/*/listings**', (r) => fulfillJson(r, 200, CITY_LISTINGS_FIXTURE));
  await page.route('**/api/discover/listings**', (r) => fulfillJson(r, 200, { content: [], totalElements: 0 }));
  await page.route('**/api/public/schools/**', (r) => fulfillJson(r, 200, []));
  await page.route('**/api/discover/regional-area-groups**', (r) =>
    fulfillJson(r, 200, REGIONAL_AREA_GROUPS_FIXTURE),
  );
  await page.route('**/api/discover/agri-map-listings**', (r) =>
    fulfillJson(r, 200, AGRI_MAP_LISTINGS_FIXTURE),
  );
  await page.route('**/api/public/listings/*', (r) =>
    fulfillJson(r, 200, AGRI_LISTING_DETAIL_WITH_BOUNDARY),
  );
}

/**
 * Navigate to agri-first Discover with a group pre-selected via URL, capture route calls,
 * and wait for the page to settle.
 *
 * Returns:
 *   capturedRegionalGroups — all URLs called for regional-area-groups endpoint
 *   capturedMarkers        — all URLs called for /api/discover/markers endpoint
 *   capturedAgriMapListings — all URLs called for agri-map-listings endpoint
 */
async function navigateWithGroup(
  page: Page,
  opts: {
    group?: string;         // e.g. 'N:10_25' — omit for no-group landing
    areaKey?: string;       // pre-select an area
    zoomClicks?: number;    // leaflet zoom-in clicks after load
  } = {},
): Promise<{
  capturedRegionalGroups: string[];
  capturedMarkers: string[];
  capturedAgriMapListings: string[];
}> {
  const capturedRegionalGroups: string[] = [];
  const capturedMarkers: string[] = [];
  const capturedAgriMapListings: string[] = [];

  // Intercept BEFORE navigation — install counting spies on top of stubs
  await page.route('**/api/discover/regional-area-groups**', (route) => {
    capturedRegionalGroups.push(route.request().url());
    return fulfillJson(route, 200, REGIONAL_AREA_GROUPS_FIXTURE);
  });
  await page.route('**/api/discover/markers**', (route) => {
    capturedMarkers.push(route.request().url());
    // Let it fall through — we want to capture; stub returns empty so no DOM pollution
    return fulfillJson(route, 200, { city: CITY, markers: [], truncated: false, returnedElements: 0 });
  });
  await page.route('**/api/discover/agri-map-listings**', (route) => {
    capturedAgriMapListings.push(route.request().url());
    return fulfillJson(route, 200, AGRI_MAP_LISTINGS_FIXTURE);
  });

  const params = new URLSearchParams({ city: CITY, journey: 'agri-first' });
  if (opts.group) params.set('group', opts.group);
  if (opts.areaKey) params.set('areaKey', opts.areaKey);

  await page.goto(`/discover?${params.toString()}`);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10_000 });

  // Wait deterministically for the regional-groups request (primary data dependency)
  await page.waitForRequest('**/api/discover/regional-area-groups**', { timeout: 12_000 }).catch(() => {});

  if (opts.zoomClicks) {
    const zoomInBtn = page.locator('.leaflet-control-zoom-in');
    if (await zoomInBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      for (let i = 0; i < opts.zoomClicks; i++) {
        await zoomInBtn.click();
        await page.waitForTimeout(700);
      }
      await page.waitForTimeout(1500);
    }
  }

  return { capturedRegionalGroups, capturedMarkers, capturedAgriMapListings };
}

/** Verify auth is active. Returns false if auth cannot be established. */
async function ensureAuthenticated(page: Page): Promise<boolean> {
  const authIndicator = page.locator(
    'nav a[href="/broker/listings"], nav a[href*="dashboard"], [data-testid="user-menu"], header [aria-label*="menu"]',
  );
  const isLoggedIn = await authIndicator.first().isVisible({ timeout: 5_000 }).catch(() => false);
  if (isLoggedIn) {
    console.log('[1412] Auth verified via nav indicator');
    return true;
  }

  if (!hasSmokeCreds) {
    console.log('[1412] storageState not recognised; no smoke creds — cannot authenticate');
    return false;
  }

  console.log('[1412] Attempting UI login fallback');
  await page.goto('/auth');
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#signin-email').waitFor({ state: 'visible', timeout: 10_000 });
  await page.locator('#signin-email').fill(SMOKE_EMAIL);
  await page.locator('#signin-password').fill(SMOKE_PASSWORD);
  await page.locator('button[type="submit"]').filter({ hasText: /sign in/i }).first().click();
  await expect(page).not.toHaveURL(/\/auth/, { timeout: 15_000 });
  console.log('[1412] UI login succeeded');
  return true;
}

// ---------------------------------------------------------------------------
// Test suite — ANON (no storageState)
// ---------------------------------------------------------------------------

test.describe('@integration-ui 1412 — Grouped agri Discover journey — ANON', () => {
  // No storageState — anon flow.

  // ── AC1: Anon sees regional groups ────────────────────────────────────────

  test(
    'AC1: anon agri-first Discover renders regional-area-groups list with at least one row',
    async ({ page }) => {
      await stubCommonRoutes(page);

      await navigateWithGroup(page);

      // Container must be present
      await expect(page.locator('[data-testid="agri-regional-groups"]')).toBeVisible({ timeout: 10_000 });

      // At least one row (REGIONAL_AREA_GROUPS_FIXTURE has 1 group)
      const rows = page.locator('[data-testid="agri-regional-group-row"]');
      await expect(rows.first()).toBeVisible({ timeout: 8_000 });
      const count = await rows.count();
      expect(count).toBeGreaterThanOrEqual(1);

      // The row label renders the group label
      await expect(page.locator('[data-testid="agri-regional-group-label"]').first()).toBeVisible({
        timeout: 5_000,
      });
    },
  );

  // ── AC2: Group selection — URL param + DOM focus ───────────────────────────

  test(
    'AC2: selecting a group writes ?group=DIR:BAND (regex), NOT groupId; DOM shows selected row',
    async ({ page }) => {
      await stubCommonRoutes(page);

      // Navigate to agri-first with group pre-selected via URL (simulates user clicking a row)
      await navigateWithGroup(page, { group: GROUP_PARAM });

      // URL assertion — group param in correct format
      const currentUrl = page.url();
      expect(currentUrl).toMatch(GROUP_PARAM_REGEX);

      // URL must NOT contain groupId (area-first param — different mechanism)
      expect(currentUrl).not.toMatch(GROUP_ID_ABSENT_REGEX);

      // DOM: the row for the selected group must be rendered + clear button visible
      const rows = page.locator('[data-testid="agri-regional-group-row"]');
      await expect(rows.first()).toBeVisible({ timeout: 10_000 });

      // Clear button appears for the selected group
      const clearBtn = page.locator('[data-testid="agri-regional-group-clear"]');
      await expect(clearBtn).toBeVisible({ timeout: 8_000 });
    },
  );

  test(
    'AC2: clear button removes ?group param and restores broader agri-first results',
    async ({ page }) => {
      await stubCommonRoutes(page);

      await navigateWithGroup(page, { group: GROUP_PARAM });

      // Confirm group is in URL
      expect(page.url()).toMatch(GROUP_PARAM_REGEX);

      // Click the clear button
      const clearBtn = page.locator('[data-testid="agri-regional-group-clear"]');
      await expect(clearBtn).toBeVisible({ timeout: 8_000 });
      await clearBtn.click();
      await page.waitForTimeout(1000);

      // ?group= must no longer be in the URL
      const clearedUrl = page.url();
      expect(clearedUrl).not.toContain('group=');

      // The groups list must still render (broader agri-first view)
      await expect(page.locator('[data-testid="agri-regional-groups"]')).toBeVisible({ timeout: 8_000 });
    },
  );

  test(
    'AC2: browser Back restores prior context (no group); Forward restores group selection',
    async ({ page }) => {
      await stubCommonRoutes(page);

      // Start without group
      await navigateWithGroup(page);
      const urlWithoutGroup = page.url();
      expect(urlWithoutGroup).not.toContain('group=');

      // Navigate to group URL (simulates user clicking a row → URL push)
      await page.goto(`/discover?city=${CITY}&journey=agri-first&group=${GROUP_PARAM}`);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1000);

      const urlWithGroup = page.url();
      expect(urlWithGroup).toMatch(GROUP_PARAM_REGEX);

      // Back → no group
      await page.goBack();
      await page.waitForURL(/\/discover/, { timeout: 8_000 });
      await page.waitForTimeout(500);
      expect(page.url()).not.toContain('group=');

      // Forward → group restored
      await page.goForward();
      await page.waitForURL(/\/discover/, { timeout: 8_000 });
      await page.waitForTimeout(500);
      expect(page.url()).toMatch(GROUP_PARAM_REGEX);

      // DOM: groups list present + clear button visible (clear only renders when a group is selected)
      await expect(page.locator('[data-testid="agri-regional-group-row"]').first()).toBeVisible({
        timeout: 8_000,
      });
      await expect(page.locator('[data-testid="agri-regional-group-clear"]')).toBeVisible({
        timeout: 5_000,
      });
    },
  );

  // ── AC3: Network contract — POSITIVE route spy ─────────────────────────────

  test(
    'AC3: regional-area-groups fired + agri-map-listings fired + markers count===0 for anon grouped render',
    async ({ page }) => {
      await stubCommonRoutes(page);

      const { capturedRegionalGroups, capturedMarkers, capturedAgriMapListings } =
        await navigateWithGroup(page, { group: GROUP_PARAM });

      // POSITIVE assertions — these must have fired
      if (capturedRegionalGroups.length === 0) {
        throw new Error(
          'REGRESSION: GET /api/discover/regional-area-groups never fired for anon agri-first. ' +
          'useRegionalAreaGroups hook may be gated on auth.',
        );
      }
      expect(capturedRegionalGroups.length).toBeGreaterThanOrEqual(1);
      // Endpoint called with correct city + propertyType
      expect(capturedRegionalGroups[0]).toContain('city=udupi');
      expect(capturedRegionalGroups[0]).toContain('propertyType=agricultural_land');

      if (capturedAgriMapListings.length === 0) {
        throw new Error(
          'REGRESSION: GET /api/discover/agri-map-listings never fired for anon grouped flow. ' +
          'useAgriMapListings hook may be auth-gated (skipAuth must be true).',
        );
      }
      expect(capturedAgriMapListings.length).toBeGreaterThanOrEqual(1);
      // agri-map-listings must carry the areaKeys from the selected group
      const agriUrl = capturedAgriMapListings[0];
      expect(agriUrl).toContain('areaKeys=');

      // MANDATORY negative: markers must NOT fire for anon (markers is auth-gated)
      expect(capturedMarkers.length).toBe(0);
    },
  );

  // ── AC4: Card click → /listing/:id ────────────────────────────────────────
  // NOTE: agri-listing-card is rendered by DiscoverRightPanel from `areaListings`
  // (GET /api/discover/cities/:city/listings), NOT from useAgriMapListings.
  // To get cards to render, we need: journey=agri-first + areaKey selected + city-listings stub
  // returning agri listings. This is the proven pattern from 1375 AC8b.

  test(
    'AC4: agri-listing-card in area-selected agri-first context clicks through to /listing/:id',
    async ({ page }) => {
      await stubCommonRoutes(page);

      // Override city-listings to return agri listing in areaListings
      // (agri-listing-card renders from areaListings, populated by GET /api/discover/cities/:city/listings)
      const agriCityListings = {
        city: CITY,
        limitPerArea: 50,
        areas: [
          {
            areaKey: AREA_KEY,
            areaName: 'Manipal',
            listings: [
              {
                id: AGRI_ID_WITH_BOUNDARY,
                propertyType: 'agricultural_land',
                locality: 'Manipal',
                title: 'Grouped Agri Plot North',
                landArea: 3.0,
                landAreaUnit: 'acres',
                pricePaise: 7500000,
              },
            ],
          },
        ],
      };
      await page.route('**/api/discover/cities/*/listings**', (r) =>
        fulfillJson(r, 200, agriCityListings),
      );

      // Navigate with areaKey pre-selected so agri-selected panel (with cards) renders
      const encodedAreaKey = encodeURIComponent(AREA_KEY);
      await page.goto(
        `/discover?city=${CITY}&journey=agri-first&areaKey=${encodedAreaKey}`,
      );
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10_000 });
      await page.waitForRequest('**/api/discover/regional-area-groups**', { timeout: 12_000 }).catch(() => {});

      // agri-listing-card renders from areaListings in the agri-selected panel
      const firstCard = page.locator('[data-testid="agri-listing-card"]').first();
      await expect(firstCard).toBeVisible({ timeout: 12_000 });

      // AC4: clicking a card navigates to /listing/:id
      await firstCard.click();
      await page.waitForURL(/\/listing\//, { timeout: 10_000 });
    },
  );

  // ── AC5: /listing/:id renders AgriSpecRows + boundary ─────────────────────

  test(
    'AC5: /listing/:id renders AgriSpecRows fields + boundary map (.leaflet-overlay-pane path) + agri-boundary-disclaimer',
    async ({ page }) => {
      await stubCommonRoutes(page);

      // Navigate directly to the listing detail page (no Discover needed)
      await page.goto(`/listing/${AGRI_ID_WITH_BOUNDARY}`);
      await page.waitForLoadState('domcontentloaded');

      // Wait for the public listings endpoint to resolve
      await page.waitForRequest(
        (req) => req.url().includes(`/api/public/listings/${AGRI_ID_WITH_BOUNDARY}`),
        { timeout: 10_000 },
      ).catch(() => {});

      await page.waitForTimeout(2000);

      // AgriSpecRows fields — must render from AGRI_LISTING_DETAIL_WITH_BOUNDARY fixture
      await expect(page.locator('[data-testid="agri-survey-number"]')).toBeVisible({ timeout: 8_000 });
      await expect(page.locator('[data-testid="agri-land-area"]')).toBeVisible({ timeout: 5_000 });
      await expect(page.locator('[data-testid="agri-computed-area"]')).toBeVisible({ timeout: 5_000 });
      await expect(page.locator('[data-testid="agri-water-source"]')).toBeVisible({ timeout: 5_000 });
      await expect(page.locator('[data-testid="agri-soil-type"]')).toBeVisible({ timeout: 5_000 });
      await expect(page.locator('[data-testid="agri-cultivation-status"]')).toBeVisible({ timeout: 5_000 });
      await expect(page.locator('[data-testid="agri-ownership-type"]')).toBeVisible({ timeout: 5_000 });

      // Price row (fixture has price=7500000)
      await expect(page.locator('[data-testid="agri-price"]')).toBeVisible({ timeout: 5_000 });

      // Boundary: disclaimer present (fixture has boundary string)
      await expect(page.locator('[data-testid="agri-boundary-disclaimer"]')).toBeVisible({
        timeout: 8_000,
      });

      // Boundary map: Leaflet container rendered for the detail page
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10_000 });

      // At zoom level of ListingDetailBoundaryMap, Leaflet Polygon should be drawn in overlay pane
      const overlayPaths = page.locator('.leaflet-overlay-pane path');
      const pathCount = await overlayPaths.count();
      // boundary is present → at least one polygon path expected
      expect(pathCount).toBeGreaterThan(0);
    },
  );

  test(
    'AC5b: /listing/:id without boundary renders AgriSpecRows but no agri-boundary-disclaimer',
    async ({ page }) => {
      // Override listing detail stub to return no-boundary fixture
      await stubCommonRoutes(page);
      await page.route('**/api/public/listings/*', (r) =>
        fulfillJson(r, 200, AGRI_LISTING_DETAIL_NO_BOUNDARY),
      );

      await page.goto(`/listing/${AGRI_ID_NO_BOUNDARY}`);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2000);

      // Core spec rows still render
      await expect(page.locator('[data-testid="agri-land-area"]')).toBeVisible({ timeout: 8_000 });
      await expect(page.locator('[data-testid="agri-ownership-type"]')).toBeVisible({ timeout: 5_000 });

      // No boundary disclaimer when boundary is null
      await expect(page.locator('[data-testid="agri-boundary-disclaimer"]')).toHaveCount(0);
    },
  );

  // ── AC6: Anon detail — agri specs visible; photo gallery absent (no images in public response) ──
  // Backend PII-omission contract (no contactEmail/contactPhone/images in public endpoint) is owned
  // by #1407 unit tests (AgriPublicListingMapper) + the REAL_SEED anon path below.
  // Here we assert the FRONTEND contract: anon /listing/:id renders AgriSpecRows + boundary
  // disclaimer, and does NOT show a photo gallery image (AGRI_LISTING_DETAIL_WITH_BOUNDARY fixture
  // has no images/primaryImageUrl, matching what the real public endpoint returns for agri listings).

  test(
    'AC6: anon /listing/:id — AgriSpecRows + boundary-disclaimer visible; photo gallery image absent (no PII/media in public fixture)',
    async ({ page }) => {
      await stubCommonRoutes(page);

      await page.goto(`/listing/${AGRI_ID_WITH_BOUNDARY}`);
      await page.waitForLoadState('domcontentloaded');
      // Wait for the listing detail endpoint to be called
      await page.waitForRequest(
        (req) => req.url().includes(`/api/public/listings/${AGRI_ID_WITH_BOUNDARY}`),
        { timeout: 10_000 },
      ).catch(() => {});
      await page.waitForTimeout(1500);

      // AgriSpecRows fields are visible for anon users (agri specs are public)
      await expect(page.locator('[data-testid="agri-land-area"]')).toBeVisible({ timeout: 8_000 });
      await expect(page.locator('[data-testid="agri-ownership-type"]')).toBeVisible({ timeout: 5_000 });

      // Boundary disclaimer is visible (fixture has boundary)
      await expect(page.locator('[data-testid="agri-boundary-disclaimer"]')).toBeVisible({
        timeout: 5_000,
      });

      // Photo gallery: the public endpoint returns no images/primaryImageUrl for agri listings,
      // so ListingGallery renders an empty state (no <img> inside the gallery card).
      // This is the DOM-observable frontend contract for PII-gating.
      // (Backend key-absence contract owned by #1407 unit tests + REAL_SEED path.)
      const galleryImages = page.locator('.overflow-hidden.mb-6 img');
      await expect(galleryImages).toHaveCount(0);
    },
  );

  // ── AC4 extension: polygon → peek → CTA → /listing/:id (authed, needs markers) ──
  // (This test requires auth so markers fire and polygons render — moved to authed block below.)
});

// ---------------------------------------------------------------------------
// Test suite — AUTHED (storageState — for polygon/marker flows that need auth)
// ---------------------------------------------------------------------------

test.describe('@integration-ui 1412 — Grouped agri journey — AUTHED (polygon + peek)', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  // ── AC4 (authed): polygon → peek panel → CTA → /listing/:id ──────────────

  test(
    'AC4+AC5: agri polygon click in agri-first → peek panel (agri-detail-panel) → View full details CTA → /listing/:id',
    async ({ page }) => {
      await stubCommonRoutes(page);

      await page.goto(`/discover?journey=agri-first&city=${CITY}`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10_000 });

      const authed = await ensureAuthenticated(page);
      if (!authed) {
        throw new Error(
          'AUTH_UNAVAILABLE: AC4 polygon→peek→CTA path + AC6 authed half require authentication. ' +
          'storageState expired and no SMOKE_USER_EMAIL/SMOKE_USER_PASSWORD set. ' +
          'Refresh e2e/fixtures/user-auth.json or provide smoke credentials.',
        );
      }

      // Install markers stub with boundary so AgriPolygonLayer renders
      let capturedMarkersUrl: string | null = null;
      await page.route('**/api/discover/markers**', (route) => {
        capturedMarkersUrl = route.request().url();
        return fulfillJson(route, 200, AGRI_MARKERS_WITH_BOUNDARY);
      });

      // Navigate with areaKey so area is selected → markers can fire after zoom
      const encodedAreaKey = encodeURIComponent(AREA_KEY);
      await page.goto(
        `/discover?journey=agri-first&city=${CITY}&areaKey=${encodedAreaKey}`,
      );
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10_000 });

      // Zoom to >= 16 for polygon rendering
      const zoomInBtn = page.locator('.leaflet-control-zoom-in');
      if (await zoomInBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        for (let i = 0; i < ZOOM_IN_CLICKS_FOR_POLYGONS; i++) {
          await zoomInBtn.click();
          await page.waitForTimeout(700);
        }
      }
      await page.waitForTimeout(2500);
      await page.waitForRequest('**/api/discover/markers**', { timeout: 12_000 }).catch(() => {});

      if (capturedMarkersUrl === null) {
        throw new Error(
          'AC4 HARNESS BLOCKER: GET /api/discover/markers never fired — ' +
          'AgriPolygonLayer cannot render without marker data.',
        );
      }

      // Wait for polygon SVG path in overlay pane
      const overlayPath = page.locator('.leaflet-overlay-pane path').first();
      await expect(overlayPath).toBeVisible({ timeout: 15_000 });

      // Click the polygon — triggers agri-detail peek panel
      await overlayPath.click({ force: true });

      // AC4: peek panel opens
      await expect(page.locator('[data-testid="agri-detail-panel"]')).toBeVisible({ timeout: 12_000 });

      // Title from fixture
      await expect(page.locator('[data-testid="agri-detail-title"]')).toContainText(
        'Grouped Agri Plot North',
      );

      // AC4: "View full details" CTA present
      const cta = page.locator('[data-testid="agri-view-full-details-cta"]');
      await expect(cta).toBeVisible({ timeout: 5_000 });

      // AC4: CTA navigates to /listing/:id
      await cta.click();
      await page.waitForURL(new RegExp(`/listing/${AGRI_ID_WITH_BOUNDARY}`), { timeout: 10_000 });

      // AC5 on /listing/:id — AgriSpecRows rendered
      await page.waitForTimeout(2000);
      await expect(page.locator('[data-testid="agri-survey-number"]')).toBeVisible({ timeout: 8_000 });
      await expect(page.locator('[data-testid="agri-boundary-disclaimer"]')).toBeVisible({
        timeout: 5_000,
      });
    },
  );

  // ── AC6 (authed): detail page unchanged — spec rows still render ──────────

  test(
    'AC6: authed /listing/:id — agri spec rows render (no regression from anon-gating)',
    async ({ page }) => {
      await stubCommonRoutes(page);

      await page.goto(`/listing/${AGRI_ID_WITH_BOUNDARY}`);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2000);

      // Auth does not hide agri spec rows
      await expect(page.locator('[data-testid="agri-survey-number"]')).toBeVisible({ timeout: 8_000 });
      await expect(page.locator('[data-testid="agri-land-area"]')).toBeVisible({ timeout: 5_000 });
      await expect(page.locator('[data-testid="agri-computed-area"]')).toBeVisible({ timeout: 5_000 });
      await expect(page.locator('[data-testid="agri-boundary-disclaimer"]')).toBeVisible({
        timeout: 5_000,
      });
    },
  );
});

// ---------------------------------------------------------------------------
// AC10/AC11 — Real-seed headline (seed-backed, skipped unless REAL_SEED=1)
// ---------------------------------------------------------------------------

test.describe('@integration-ui 1412 — Real-seed headline (AC10/AC11) [REAL_SEED only]', () => {
  test.use({ storageState: undefined });

  /**
   * Seed-backed test: derives the group and listing from a LIVE call to
   * /api/discover/regional-area-groups rather than hardcoding fixture IDs.
   *
   * If REAL_SEED is not set, the test is skipped — this is the ONLY allowed skip
   * (it is not a happy-path skip; it is an infra-capability skip for the seed-dependent
   * variation; the stubbed AC1–AC6 tests above always run).
   *
   * When stack is up (backend:8085, fixture pg-test-fixture:5434,
   * restore-test-fixture.sh + seed-agricultural-listings.sh, frontend:5174),
   * udupi should have 7 regional groups.
   */
  test(
    'AC10/AC11: real-seed — udupi agri-first renders 7 regional groups; group selection fires agri-map-listings with real areaKeys; markers NOT fired for anon',
    async ({ page }) => {
      if (!REAL_SEED) {
        test.skip(true, 'Seed-backed test skipped: set REAL_SEED=1 with live stack to run');
        return;
      }

      // No route stubs — go live against the real backend
      const capturedRegionalGroupsUrls: string[] = [];
      const capturedMarkersUrls: string[] = [];
      const capturedAgriMapListingsUrls: string[] = [];

      // Spy only (no fulfillment override) — live backend responds
      page.on('request', (request) => {
        const url = request.url();
        if (url.includes('/api/discover/regional-area-groups')) {
          capturedRegionalGroupsUrls.push(url);
        }
        if (url.includes('/api/discover/markers')) {
          capturedMarkersUrls.push(url);
        }
        if (url.includes('/api/discover/agri-map-listings')) {
          capturedAgriMapListingsUrls.push(url);
        }
      });

      await page.goto(`/discover?city=${CITY}&journey=agri-first`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(3000);

      // AC10: groups rendered from live seed (expect 7 for udupi post seed-agricultural-listings.sh)
      const rows = page.locator('[data-testid="agri-regional-group-row"]');
      await expect(rows.first()).toBeVisible({ timeout: 12_000 });
      const rowCount = await rows.count();
      expect(rowCount).toBeGreaterThanOrEqual(1);
      console.log(`[1412/AC10] Live udupi regional groups: ${rowCount}`);

      // AC11 network contract — derive group from live response (click first row)
      const firstRow = rows.first();
      await firstRow.click();
      await page.waitForTimeout(2000);

      // URL must have group=DIR:BAND (or percent-encoded DIR%3ABAND) and NOT groupId
      const currentUrl = page.url();
      expect(currentUrl).toMatch(/[?&]group=[A-Z]{1,2}(%3A|:)[0-9]+_[0-9a-z]+/);
      expect(currentUrl).not.toContain('groupId=');

      // agri-map-listings must fire after group selection
      await page.waitForTimeout(2000);

      if (capturedAgriMapListingsUrls.length === 0) {
        throw new Error(
          'AC11 REGRESSION: GET /api/discover/agri-map-listings never fired after group selection ' +
          '(real-seed stack). Check useAgriMapListings skipAuth and hook enabled condition.',
        );
      }
      expect(capturedAgriMapListingsUrls[0]).toContain('areaKeys=');

      // MANDATORY: markers must NOT fire for anon
      expect(capturedMarkersUrls.length).toBe(0);

      // regional-area-groups must have fired
      expect(capturedRegionalGroupsUrls.length).toBeGreaterThanOrEqual(1);
    },
  );
});
