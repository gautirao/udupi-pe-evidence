/**
 * REGRESSION TEST — Issue #1240 (lat/lon mapper fix)
 *
 * Escape analysis finding: PR #984 renamed backend DiscoverMarker JSON fields
 * from latitude/longitude → lat/lon via @JsonProperty, but the frontend
 * DiscoverFilteredMarker interface was never updated. filteredMarkerToPropertyListing
 * read m.latitude/m.longitude (undefined at runtime), so property pins never rendered.
 *
 * Additional escape: the existing DISCOVER_MARKERS_FIXTURE in school-first-map-focus.spec.ts
 * used latitude/longitude (old broken format) AND only asserted the request fires — never
 * that DOM pins appear. This test fixes both gaps.
 *
 * Coverage: stubs /api/discover/markers with real backend field names (lat/lon)
 * and asserts Leaflet marker DOM elements appear after the mapper fix.
 * Would FAIL pre-fix (undefined coords → 0 pins) and PASS post-fix.
 */

import { test, expect, type Page, type Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// Constants — matches MANIPAL school used in MF-9
// ---------------------------------------------------------------------------

const SCHOOL_LAT = 13.3525;
const SCHOOL_LON = 74.7864;
const SCHOOL_ID = 'sch-1';
const MANIPAL_AREA_KEY = 'IN|KA|Udupi|Manipal';
const ENCODED_AREA_KEY = encodeURIComponent(MANIPAL_AREA_KEY);
const DEFAULT_RADIUS_KM = 3;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SCHOOL_FIXTURE = {
  id: SCHOOL_ID,
  name: 'Manipal Public School',
  board: 'CBSE',
  boardType: null,
  address: 'Manipal, Udupi',
  latitude: SCHOOL_LAT,
  longitude: SCHOOL_LON,
  schoolCategory: 'secondary',
};

const TRENDS_OPTIONS_FIXTURE = {
  city: 'udupi',
  defaultAreas: [{ areaKey: MANIPAL_AREA_KEY, areaLabel: 'Manipal' }],
};

const DISCOVER_AREAS_FIXTURE = {
  city: 'udupi',
  areas: [
    {
      areaKey: MANIPAL_AREA_KEY,
      name: 'Manipal',
      geoCenterLat: SCHOOL_LAT,
      geoCenterLon: SCHOOL_LON,
      listingCount90d: 5,
      schoolCount: 1,
      trendDirection: 'stable',
    },
  ],
};

const EMPTY_PAGE = {
  content: [],
  page: 0,
  size: 50,
  totalElements: 0,
  totalPages: 0,
  aggregates: { topLocalities: [] },
};

/**
 * City listings fixture — provides school listings for SchoolMarkerFocusPanner haversine filter.
 * Shape: lat/lon (matching real backend DiscoverCityListingsItem shape).
 */
const CITY_LISTINGS_FIXTURE = {
  city: 'udupi',
  limitPerArea: 50,
  areas: [
    {
      areaKey: MANIPAL_AREA_KEY,
      areaName: 'Manipal',
      listings: [
        { id: 'cl-1', propertyType: 'house', title: 'Near School', locality: 'Manipal', pricePaise: 500_000_000, lat: SCHOOL_LAT + 0.005, lon: SCHOOL_LON + 0.005, listingPurpose: 'sale' },
      ],
    },
  ],
};

/**
 * /api/discover/markers — REAL backend field names: lat/lon (NOT latitude/longitude).
 *
 * Pre-fix: filteredMarkerToPropertyListing read m.latitude/m.longitude → undefined
 *   → PropertyListing had no valid coords → Leaflet discarded pins → 0 DOM elements.
 * Post-fix: mapper reads m.lat/m.lon → valid coords → pins render in viewport.
 *
 * Note: DISCOVER_MARKERS_FIXTURE in school-first-map-focus.spec.ts still uses
 * latitude/longitude (old broken format) but MF-9 only asserts the request fires —
 * not DOM rendering. This fixture uses the correct lat/lon shape.
 */
const MARKERS_FIXTURE_LAT_LON = {
  city: 'udupi',
  markers: [
    { id: 'reg-pin-1', lat: SCHOOL_LAT + 0.003, lon: SCHOOL_LON + 0.003, pricePaise: 500_000_000, locality: 'Manipal' },
    { id: 'reg-pin-2', lat: SCHOOL_LAT - 0.002, lon: SCHOOL_LON + 0.002, pricePaise: 450_000_000, locality: 'Manipal' },
  ],
  truncated: false,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function stubAll(page: Page): Promise<void> {
  await page.route('**/api/trends/options**', (r) => fulfillJson(r, 200, TRENDS_OPTIONS_FIXTURE));
  await page.route('**/api/discover/areas**', (r) => fulfillJson(r, 200, DISCOVER_AREAS_FIXTURE));
  await page.route('**/api/public/schools/popular**', (r) =>
    fulfillJson(r, 200, [{ ...SCHOOL_FIXTURE, distanceKm: 0.5 }]),
  );
  await page.route('**/api/public/schools/by-area**', (r) => fulfillJson(r, 200, [SCHOOL_FIXTURE]));
  await page.route(`**/api/public/schools/${SCHOOL_ID}`, (r) => fulfillJson(r, 200, SCHOOL_FIXTURE));
  // Auth-gated filtered markers — stub with real lat/lon backend shape
  await page.route('**/api/discover/markers**', (r) => fulfillJson(r, 200, MARKERS_FIXTURE_LAT_LON));
  await page.route('**/api/discover/cities/*/listings**', (r) => fulfillJson(r, 200, CITY_LISTINGS_FIXTURE));
  await page.route('**/api/discover/listings**', (r) => fulfillJson(r, 200, EMPTY_PAGE));
  await page.route('**/api/dashboard/listings**', (r) => fulfillJson(r, 200, EMPTY_PAGE));
}

// ---------------------------------------------------------------------------
// Tests — authenticated (storageState required for markersEnabled=true)
// ---------------------------------------------------------------------------

test.describe('@regression #1240 — lat/lon mapper: marker API shape renders as DOM pins', () => {
  // Auth required: markersEnabled gate checks isAuthenticated
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  /**
   * REGRESSION-1240-LATLON-AUTH: signed-in school-radius deep-link where
   * /api/discover/markers returns lat/lon → Leaflet marker pins appear in DOM.
   *
   * Pre-fix: filteredMarkerToPropertyListing read m.latitude/m.longitude (undefined)
   *   → 0 visible Leaflet marker icons.
   * Post-fix: mapper reads m.lat/m.lon → valid coords → markers render.
   */
  test('REGRESSION-1240-LATLON-AUTH: markers endpoint with lat/lon response renders property pins in DOM', async ({
    page,
  }) => {
    await stubAll(page);

    // Pre-arm request waiter before navigation (matches MF-9 pattern)
    const markersRequestPromise = page.waitForRequest(
      (req) => req.url().includes('/api/discover/markers'),
      { timeout: 20_000 },
    );

    // No zoom or areaKey in URL — matches MF-9 cold-load pattern
    await page.goto(
      `/discover?city=udupi&journey=school-first&schoolId=${SCHOOL_ID}&radiusKm=${DEFAULT_RADIUS_KM}`,
    );
    await page.waitForLoadState('domcontentloaded');

    // Confirm markers endpoint was called (isAuthenticated=true + markersEnabled fired)
    await markersRequestPromise;
    console.log('[REGRESSION-1240-LATLON-AUTH] /api/discover/markers request confirmed');

    // Wait for Leaflet container
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10_000 });

    // Property marker pins must appear in DOM.
    // Pre-fix (lat/lon→undefined): 0 pins. Post-fix: ≥1 pin or cluster badge.
    await expect
      .poll(
        async () => {
          const icons = await page.locator('.leaflet-marker-icon').count();
          const clusters = await page.locator('.marker-cluster').count();
          console.log(`[REGRESSION-1240-LATLON-AUTH] icons=${icons} clusters=${clusters}`);
          return icons + clusters;
        },
        {
          timeout: 12_000,
          message: 'Expected ≥1 Leaflet marker icon or cluster badge — pre-fix: 0 (undefined coords)',
        },
      )
      .toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Anon variant (#1261) — anon school-radius markers come from the PUBLIC
// /api/discover/cities/{city}/school-radius-listings endpoint (server-side
// ST_DWithin), derived client-side into pins via deriveAnonSchoolRadiusMarkers.
//
// FIELD-NAME CONTRACT (verified against mapSchoolRadiusCard in
// src/hooks/useSchoolRadiusListings.ts): the school-radius endpoint card
// (PublicSchoolRadiusListingCard) carries coords as `latitude`/`longitude`.
// mapSchoolRadiusCard reads c.latitude / c.longitude → SchoolRadiusListingItem.lat/lon.
// deriveAnonSchoolRadiusMarkers (MapDiscovery.tsx) then filters out any item with
// lat==null || lon==null.
//
//   CORRECT shape (latitude/longitude present) → lat/lon populated → pins render.
//   BROKEN  shape (only lat/lon, no latitude/longitude) → mapper reads
//           undefined → lat/lon null → item filtered out → 0 pins.
//
// NOTE: this is the INVERSE of the auth /api/discover/markers contract above
// (that endpoint's correct field names are lat/lon). The regression class is the
// same — a field-name mismatch between the response shape and the consuming
// mapper silently yields undefined coords and 0 pins.
//
// Anon context: no storageState → markersEnabled (isAuthenticated) is false, so
// /api/discover/markers must NOT fire; the school-radius endpoint is the source.
// ---------------------------------------------------------------------------

const SCHOOL_RADIUS_CARD_CORRECT = {
  id: 'sr-anon-correct-1',
  listingNumber: 7001,
  propertyType: 'house',
  title: 'Anon Radius House (correct coords)',
  locality: 'Manipal',
  areaKey: MANIPAL_AREA_KEY,
  pricePaise: 500_000_000,
  bedrooms: 3,
  // CORRECT for this endpoint: latitude/longitude field names.
  latitude: SCHOOL_LAT + 0.003,
  longitude: SCHOOL_LON + 0.003,
  listingPurpose: 'sale',
  possessionStatus: 'ready_to_move',
  createdAt: '2026-05-01T00:00:00Z',
};

// Same card but with the WRONG (auth-markers) field names lat/lon and NO
// latitude/longitude → mapSchoolRadiusCard reads undefined → null coords → no pin.
const SCHOOL_RADIUS_CARD_BROKEN = {
  id: 'sr-anon-broken-1',
  listingNumber: 7002,
  propertyType: 'house',
  title: 'Anon Radius House (broken coords)',
  locality: 'Manipal',
  areaKey: MANIPAL_AREA_KEY,
  pricePaise: 500_000_000,
  bedrooms: 3,
  // BROKEN: only lat/lon (the auth-markers shape), latitude/longitude absent.
  lat: SCHOOL_LAT + 0.003,
  lon: SCHOOL_LON + 0.003,
  listingPurpose: 'sale',
  possessionStatus: 'ready_to_move',
  createdAt: '2026-05-01T00:00:00Z',
};

function schoolRadiusPage(card: unknown) {
  return { content: [card], page: 0, size: 50, hasMore: false };
}

/**
 * Stub the common public endpoints for the anon school-radius path and the
 * school-radius endpoint with a specific card shape. Tracks whether the auth-only
 * /api/discover/markers endpoint fires (it must not for anon).
 */
async function stubAnonRadius(
  page: Page,
  card: unknown,
): Promise<{ markersFired: () => boolean }> {
  let markersFired = false;
  await page.route('**/api/trends/options**', (r) => fulfillJson(r, 200, TRENDS_OPTIONS_FIXTURE));
  await page.route('**/api/discover/areas**', (r) => fulfillJson(r, 200, DISCOVER_AREAS_FIXTURE));
  await page.route('**/api/public/schools/popular**', (r) =>
    fulfillJson(r, 200, [{ ...SCHOOL_FIXTURE, distanceKm: 0.5 }]),
  );
  await page.route('**/api/public/schools/by-area**', (r) => fulfillJson(r, 200, [SCHOOL_FIXTURE]));
  await page.route(`**/api/public/schools/${SCHOOL_ID}`, (r) => fulfillJson(r, 200, SCHOOL_FIXTURE));
  await page.route('**/api/discover/listings**', (r) => fulfillJson(r, 200, EMPTY_PAGE));
  // Area-scoped public browse — kept empty so it can never be the marker source.
  await page.route('**/api/discover/cities/*/listings**', (r) =>
    fulfillJson(r, 200, { areas: [{ areaKey: MANIPAL_AREA_KEY, listings: [] }] }),
  );
  // Auth-only markers — track that it never fires for anon.
  await page.route('**/api/discover/markers**', async (r) => {
    markersFired = true;
    await r.continue();
  });
  // Register the more-specific school-radius route LAST so it wins over /listings.
  await page.route('**/api/discover/cities/*/school-radius-listings**', (r) =>
    fulfillJson(r, 200, schoolRadiusPage(card)),
  );
  return { markersFired: () => markersFired };
}

test.describe('@regression #1240 anon — school-radius markers use the endpoint coord fields', () => {
  // Anon: no storageState → markersEnabled=false → /api/discover/markers must not fire.
  test.use({ storageState: undefined });

  /**
   * REGRESSION-1240-ANON-CORRECT: anon school-radius card with the CORRECT
   * latitude/longitude field names → client-derived property pins render in DOM,
   * and the auth-only /api/discover/markers endpoint never fires.
   */
  test('regression-1240-anon: anon school-radius markers use latitude/longitude fields (not lat/lon)', async ({
    page,
  }) => {
    const auth = await stubAnonRadius(page, SCHOOL_RADIUS_CARD_CORRECT);

    await page.goto(
      `/discover?city=udupi&journey=school-first&zoom=14&schoolId=${SCHOOL_ID}&radiusKm=${DEFAULT_RADIUS_KM}`,
    );
    await page.waitForLoadState('domcontentloaded');

    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10_000 });

    // Client-derived property pins must appear (correct coords → valid markers).
    const pins = page.locator('[data-testid="property-marker"], .custom-marker-cluster');
    await expect(pins.first()).toBeVisible({ timeout: 15_000 });
    expect(await pins.count()).toBeGreaterThan(0);

    // Auth-only markers endpoint must NOT fire for anon.
    expect(auth.markersFired()).toBe(false);
  });

  /**
   * REGRESSION-1240-ANON-BROKEN: same card but with the WRONG field names
   * (lat/lon only, no latitude/longitude) → mapSchoolRadiusCard reads undefined
   * → coords null → deriveAnonSchoolRadiusMarkers drops it → 0 property pins.
   * Regression guard: proves the mapper depends on latitude/longitude for this
   * endpoint and would FAIL loudly if the field-name contract ever flipped.
   */
  test('regression-1240-anon: broken latitude/longitude field names render 0 markers', async ({
    page,
  }) => {
    const auth = await stubAnonRadius(page, SCHOOL_RADIUS_CARD_BROKEN);

    await page.goto(
      `/discover?city=udupi&journey=school-first&zoom=14&schoolId=${SCHOOL_ID}&radiusKm=${DEFAULT_RADIUS_KM}`,
    );
    await page.waitForLoadState('domcontentloaded');

    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10_000 });

    // Confirm the school-radius flow has settled before asserting absence:
    // the school panel radius selector is the mount signal (school resolved + query ran).
    await expect(page.getByTestId('radius-btn-3')).toBeVisible({ timeout: 15_000 });

    // Broken coords → no client-derived property pins. Assert 0 after the flow
    // settled (not a not-yet-rendered race).
    const pins = page.locator('[data-testid="property-marker"], .custom-marker-cluster');
    await expect(pins).toHaveCount(0);

    // Auth-only markers endpoint must NOT fire for anon (no fallback source).
    expect(auth.markersFired()).toBe(false);
  });
});
