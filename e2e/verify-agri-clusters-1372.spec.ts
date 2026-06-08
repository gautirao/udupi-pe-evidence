/**
 * verify-agri-clusters-1372.spec.ts
 *
 * Phase 7A product-verification for issue #1372:
 * "feat(discover-agri): render agriculture clusters on map"
 *
 * ACs verified (runtime-observable):
 *   AC1 — Agri cluster group is separate from residential (AgriMarkerClusterLayer only in agri mode)
 *   AC4 — Agri cluster icon has 🌾 emoji + 'agri-cluster' CSS class
 *   AC5 — agri-first mode fires GET /api/discover/markers with propertyTypes=agricultural_land
 *   AC7 — area-first (non-agri) mode still renders residential .custom-marker-cluster (unchanged)
 *
 * Gate analysis (from source + run-2 evidence):
 *   markersEnabled = isAuthenticated && mapZoom > AREA_LAYER_MAX_ZOOM (=12)
 *   useDiscoverFilteredMarkers is also gated on selectedArea (the hook's internal enabled flag).
 *   Run-1: wheel zoom failed. Run-2: auth verified + zoom 14 reached; but no area selected →
 *   markers never fired. Fix: navigate with areaKey in URL OR click area marker to select an area,
 *   THEN zoom in via +button to clear AREA_LAYER_MAX_ZOOM.
 *
 * Ordering:
 *   Test 1 — Residential baseline (AC7). If residential ALSO fails → BLOCKED (harness).
 *   Test 2 — Agri AC1/AC4.
 *   Test 3 — Agri AC5 (URL param check).
 *
 * Auth: storageState (user-auth.json) primary; UI login fallback using .env.e2e creds.
 * Endpoints: all stubbed — no seed-data dependency.
 *
 * Run:
 *   bash scripts/run-e2e-local.sh --project=full e2e/verify-agri-clusters-1372.spec.ts
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

// Udupi default zoom ≈ 11. After fitBounds on a selected area, zoom reaches ~13.
// Need zoom > 12 (AREA_LAYER_MAX_ZOOM) but < 16 (disableClusteringAtZoom) to keep clusters.
// 2 clicks from ~13 → zoom 15; still clusters. 4 clicks → zoom 17 → clusters dissolve.
const ZOOM_IN_CLICKS = 2;

// ---------------------------------------------------------------------------
// Fixtures — all endpoints stubbed (no local seed-data dependency)
// ---------------------------------------------------------------------------

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

const TRENDS_OPTIONS_FIXTURE = {
  city: CITY,
  defaultAreas: [{ areaKey: AREA_KEY, areaLabel: 'Manipal' }],
};

const CITY_LISTINGS_FIXTURE = { city: CITY, limitPerArea: 50, areas: [] };

/**
 * 5 agri-land markers tightly clustered (~22 m spacing).
 * At zoom 15: maxClusterRadius=50 px covers ~55 m → all 5 cluster into one icon.
 *
 * NOTE: shape must match DiscoverFilteredMarkersResponse ({ city, markers: [...] })
 * because useDiscoverMapData.ts:294 does `if (!filteredMarkersData?.markers) return []`.
 * A raw array stub would always produce markerListings=[] → no cluster DOM rendered.
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
};

/**
 * 4 residential markers clustered tightly — used for AC7 baseline.
 * Same DiscoverFilteredMarkersResponse shape requirement as AGRI_MARKERS above.
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fulfillJson(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function stubCommonRoutes(page: Page) {
  await page.route('**/api/trends/options**', (r) => fulfillJson(r, 200, TRENDS_OPTIONS_FIXTURE));
  await page.route('**/api/discover/areas**', (r) => fulfillJson(r, 200, DISCOVER_AREAS_FIXTURE));
  await page.route('**/api/discover/cities/*/listings**', (r) => fulfillJson(r, 200, CITY_LISTINGS_FIXTURE));
  await page.route('**/api/discover/listings**', (r) => fulfillJson(r, 200, { content: [], totalElements: 0 }));
  await page.route('**/api/public/schools/**', (r) => fulfillJson(r, 200, []));
  await page.route('**/api/discover/agri-areas**', (r) => fulfillJson(r, 200, DISCOVER_AREAS_FIXTURE));
}

/**
 * Verify auth state is live. Fall back to UI login if storageState didn't restore session.
 * Returns false if auth cannot be established — tests skip gracefully.
 */
async function ensureAuthenticated(page: Page): Promise<boolean> {
  // Check for any auth-indicator element visible to logged-in users (nav items)
  const authIndicator = page.locator(
    'nav a[href="/broker/listings"], nav a[href*="dashboard"], [data-testid="user-menu"], header [aria-label*="menu"]',
  );
  const isLoggedIn = await authIndicator.first().isVisible({ timeout: 5_000 }).catch(() => false);
  if (isLoggedIn) {
    console.log('[1372] Auth verified via nav indicator');
    return true;
  }

  if (!hasSmokeCreds) {
    console.log('[1372] storageState not recognised; no smoke creds — cannot authenticate');
    return false;
  }

  console.log('[1372] Attempting UI login fallback');
  await page.goto('/auth');
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#signin-email').waitFor({ state: 'visible', timeout: 10_000 });
  await page.locator('#signin-email').fill(SMOKE_EMAIL);
  await page.locator('#signin-password').fill(SMOKE_PASSWORD);
  await page.locator('button[type="submit"]').filter({ hasText: /sign in/i }).first().click();
  await expect(page).not.toHaveURL(/\/auth/, { timeout: 15_000 });
  console.log('[1372] UI login succeeded');
  return true;
}

/**
 * Navigate to the discover page with area pre-selected via URL areaKey.
 * Falls back to clicking an area marker if areaKey URL restoration is not supported.
 *
 * After area selection, zooms in via the Leaflet +button so mapZoom > 12.
 * Returns the captured markers URL (first markers request after setup, or null).
 */
async function navigateAndSetupMarkers(
  page: Page,
  journeyParam: string,
  markersFixture: unknown[],
): Promise<string | null> {
  let capturedMarkersUrl: string | null = null;

  // Install markers route BEFORE navigation so stub is in place from the start
  await page.route('**/api/discover/markers**', (route) => {
    capturedMarkersUrl = route.request().url();
    return fulfillJson(route, 200, markersFixture);
  });

  // Navigate with areaKey in URL — many Discover pages restore selectedArea from URL
  const url = journeyParam
    ? `/discover?city=${CITY}&journey=${journeyParam}&areaKey=${ENCODED_AREA_KEY}`
    : `/discover?city=${CITY}&areaKey=${ENCODED_AREA_KEY}`;

  await page.goto(url);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10_000 });

  // Check if area panel loaded (area selection restored from URL)
  const areaSelected = await page.locator('[data-testid="area-selected-panel"], [data-testid="agri-area-panel"]')
    .isVisible({ timeout: 4_000 })
    .catch(() => false);

  if (!areaSelected) {
    // Area not restored from URL — click an area marker manually
    console.log('[1372] Area not restored from URL — clicking area marker');
    const areaMarker = page.locator('.leaflet-marker-icon.area-marker').first();
    const markerVisible = await areaMarker.isVisible({ timeout: 8_000 }).catch(() => false);
    if (markerVisible) {
      await areaMarker.click();
      await page.waitForTimeout(1500);
    } else {
      console.log('[1372] No area marker visible — continuing without explicit area selection');
    }
  }

  // Zoom in using Leaflet + button (AREA_LAYER_MAX_ZOOM=12; we zoom to 15)
  const zoomInBtn = page.locator('.leaflet-control-zoom-in');
  if (await zoomInBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    for (let i = 0; i < ZOOM_IN_CLICKS; i++) {
      await zoomInBtn.click();
      await page.waitForTimeout(700);
    }
  }

  // Allow TanStack Query + React re-render time after mapZoom state update
  await page.waitForTimeout(2500);

  // Try to capture the markers URL if not yet set (route may fire asynchronously)
  await page.waitForRequest('**/api/discover/markers**', { timeout: 12_000 }).catch(() => {});

  return capturedMarkersUrl;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('@integration-ui 1372 — Agri cluster map rendering (Phase 7A)', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  // ── TEST 1: Residential baseline (AC7) ──────────────────────────────────────

  test(
    'AC7 (residential baseline): area-first mode fires markers request and renders .custom-marker-cluster',
    async ({ page }) => {
      await stubCommonRoutes(page);

      // Use explicit journey=area-first: urlState.journey must be 'area-first' for the
      // markersEnabled gate (isAuthenticated && journey==='area-first' && zoom>12).
      // Navigating without a journey param yields urlState.journey=null which fails the gate.
      await page.goto(`/discover?city=${CITY}&journey=area-first`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10_000 });

      const authed = await ensureAuthenticated(page);
      if (!authed) {
        test.skip(true, 'Authentication unavailable (storageState expired + no smoke creds)');
        return;
      }

      // Navigate with area pre-selected and explicit area-first journey
      const capturedUrl = await navigateAndSetupMarkers(page, 'area-first', RESIDENTIAL_MARKERS);

      if (capturedUrl === null) {
        // Markers never fired — harness/data blocker (NOT a #1372 product regression)
        throw new Error(
          'HARNESS BLOCKER: GET /api/discover/markers never fired in area-first mode even with ' +
          'journey=area-first + auth + zoom>12. Possible causes: bbox null; Leaflet zoom state ' +
          'did not propagate to React; auth not recognised despite storageState.',
        );
      }

      // Residential cluster DOM
      await expect(page.locator('.custom-marker-cluster').first()).toBeVisible({ timeout: 12_000 });
      // No agri cluster in non-agri mode
      await expect(page.locator('.agri-cluster')).toHaveCount(0);
    },
  );

  // ── TEST 2: AC1 / AC4 — agri cluster DOM ──────────────────────────────────

  test(
    'AC1/AC4: agri-first mode renders .agri-cluster with 🌾 icon, not .custom-marker-cluster',
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

      const capturedUrl = await navigateAndSetupMarkers(page, 'agri-first', AGRI_MARKERS);

      if (capturedUrl === null) {
        throw new Error('HARNESS BLOCKER: markers endpoint never called in agri-first mode after area selection + zoom-in.');
      }

      // AC1: agri cluster must be present
      await expect(page.locator('.agri-cluster').first()).toBeVisible({ timeout: 12_000 });

      // AC4: 🌾 emoji in cluster icon
      const clusterText = await page.locator('.agri-cluster').first().textContent();
      expect(clusterText).toContain('🌾');

      // AC1 inverse: no residential cluster in agri mode
      await expect(page.locator('.custom-marker-cluster')).toHaveCount(0);
    },
  );

  // ── TEST 3: AC5 — markers request URL ──────────────────────────────────────

  test(
    'AC5: agri-first mode fires GET /api/discover/markers with propertyTypes=agricultural_land',
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

      const capturedUrl = await navigateAndSetupMarkers(page, 'agri-first', AGRI_MARKERS);

      if (capturedUrl === null) {
        throw new Error('HARNESS BLOCKER: markers endpoint never called — cannot verify propertyTypes param.');
      }

      expect(capturedUrl).toContain('propertyTypes=agricultural_land');
    },
  );
});
