/**
 * REGRESSION TEST — Issue #1240
 *
 * Signed-in school-radius deep-link must NOT over-zoom after markers settle.
 * Before the fix, SchoolMarkerFocusPanner.fitBounds over a tight marker cluster
 * (all within ~1.5 km of school) intersected with the 5 km radius produced
 * zoom ~15-17 (repro captured zoom=17) with NO maxZoom cap, pushing the 5 km
 * radius circle off-screen.
 *
 * The fix caps SchoolMarkerFocusPanner fitBounds/flyTo at
 * SCHOOL_MARKER_FOCUS_MAX_ZOOM=13 so the radius circle stays visible.
 * This spec asserts the final Leaflet zoom is ≤ 13 for the repro scenario.
 *
 * NOTE: A single cluster badge at the capped zoom is ACCEPTABLE and correct
 * (AC1 radius-visibility is prioritised over AC3 de-clustering;
 * disableClusteringAtZoom stays 16). This test therefore does NOT assert
 * forced marker de-clustering.
 *
 * Key insight from MF-6 in school-first-map-focus.spec.ts:
 *   - schoolMarkerFocusTick is driven by schoolListings (city-listings + haversine),
 *     NOT by /api/discover/markers. The tick fires when school listings are non-empty.
 *   - The auth /api/discover/markers populates markerListings (map pins), but
 *     SchoolMarkerFocusPanner takes its markerPositions from schoolMarkerPositions
 *     which is derived from schoolListings (the city-listing path).
 */

import { test, expect, Route, Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Constants — school coords from the real repro URL
// ---------------------------------------------------------------------------
const SCHOOL_LAT = 13.36616;
const SCHOOL_LON = 74.76797;
const RADIUS_KM = 5;
const SCHOOL_ID = 'probe-1240-school';
const AREA_KEY = 'IN|KA|Udupi|Katapadi';
const ENCODED_AREA_KEY = encodeURIComponent(AREA_KEY);

// ---------------------------------------------------------------------------
// Fixtures — shapes match the working MF-series tests exactly
// ---------------------------------------------------------------------------

const SCHOOL_FIXTURE = {
  id: SCHOOL_ID,
  name: 'Katapadi Probe School',
  board: 'CBSE',
  boardType: null,
  address: 'Katapadi, Udupi',
  latitude: SCHOOL_LAT,
  longitude: SCHOOL_LON,
  schoolCategory: 'secondary',
};

const TRENDS_OPTIONS_FIXTURE = {
  city: 'udupi',
  defaultAreas: [{ areaKey: AREA_KEY, areaLabel: 'Katapadi' }],
};

const DISCOVER_AREAS_FIXTURE = {
  city: 'udupi',
  areas: [
    {
      areaKey: AREA_KEY,
      name: 'Katapadi',
      geoCenterLat: SCHOOL_LAT,
      geoCenterLon: SCHOOL_LON,
      listingCount90d: 10,
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

// City listings fixture — 4 items clustered ~330 m from school (within 5 km radius).
// Uses lat/lon field names (matches DISCOVER_CITY_LISTINGS_FIXTURE shape in MF tests).
// These listings are within RADIUS_KM=5 km so the haversine filter passes them through
// to schoolListings, which triggers schoolMarkerFocusTick > 0.
// SchoolMarkerFocusPanner then fitBounds to these tight positions (span ~0.006 deg),
// intersects with 5 km radius box (~0.09 deg), result = tight marker bounds → zoom ~15.
const DISCOVER_CITY_LISTINGS_FIXTURE = {
  city: 'udupi',
  limitPerArea: 50,
  areas: [
    {
      areaKey: AREA_KEY,
      areaName: 'Katapadi',
      listings: [
        { id: 'mk-1', propertyType: 'house', title: 'Prop 1', locality: 'Katapadi', pricePaise: 500_000_000, lat: SCHOOL_LAT + 0.003, lon: SCHOOL_LON + 0.003, listingPurpose: 'sale' },
        { id: 'mk-2', propertyType: 'house', title: 'Prop 2', locality: 'Katapadi', pricePaise: 450_000_000, lat: SCHOOL_LAT - 0.003, lon: SCHOOL_LON + 0.002, listingPurpose: 'sale' },
        { id: 'mk-3', propertyType: 'house', title: 'Prop 3', locality: 'Katapadi', pricePaise: 600_000_000, lat: SCHOOL_LAT + 0.002, lon: SCHOOL_LON - 0.003, listingPurpose: 'sale' },
        { id: 'mk-4', propertyType: 'house', title: 'Prop 4', locality: 'Katapadi', pricePaise: 550_000_000, lat: SCHOOL_LAT - 0.002, lon: SCHOOL_LON - 0.002, listingPurpose: 'sale' },
      ],
    },
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

/** Stub all routes before navigation — matches MF-6 pattern exactly */
async function stubAll(page: Page): Promise<void> {
  await page.route('**/api/trends/options**', (r) => fulfillJson(r, 200, TRENDS_OPTIONS_FIXTURE));
  await page.route('**/api/discover/areas**', (r) => fulfillJson(r, 200, DISCOVER_AREAS_FIXTURE));
  await page.route('**/api/public/schools/popular**', (r) =>
    fulfillJson(r, 200, [{ ...SCHOOL_FIXTURE, distanceKm: 0.5 }]),
  );
  await page.route('**/api/public/schools/by-area**', (r) => fulfillJson(r, 200, [SCHOOL_FIXTURE]));
  await page.route(`**/api/public/schools/${SCHOOL_ID}`, (r) => fulfillJson(r, 200, SCHOOL_FIXTURE));
  await page.route('**/api/discover/cities/*/listings**', (r) =>
    fulfillJson(r, 200, DISCOVER_CITY_LISTINGS_FIXTURE),
  );
  await page.route('**/api/dashboard/listings**', (r) => fulfillJson(r, 200, EMPTY_PAGE));
}

/** Read schoolCenter from window.__debug.mapState — exact path used by MF-6 */
async function getDebugSchoolCenter(page: Page): Promise<{ lat: number; lon: number } | null> {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          __debug?: { mapState?: { schoolCenter?: { lat: number; lon: number } | null } };
        }
      ).__debug?.mapState?.schoolCenter ?? null,
  );
}

/** Read schoolMarkerFocusTick from window.__debug.mapState — exact path used by MF-6 */
async function getDebugMapState(
  page: Page,
): Promise<{ schoolMarkerFocusTick?: number } | null> {
  return page.evaluate(() => {
    const ms = (
      window as unknown as { __debug?: { mapState?: Record<string, unknown> } }
    ).__debug?.mapState;
    if (!ms) return null;
    return {
      schoolMarkerFocusTick: ms['schoolMarkerFocusTick'] as number | undefined,
    };
  });
}

/** Read mapZoom from window.__debug.mapState.zoom (set by MapDiscovery useEffect) */
async function getDebugMapZoom(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const ms = (
      window as unknown as { __debug?: { mapState?: { zoom?: number | null } } }
    ).__debug?.mapState;
    return ms?.zoom ?? null;
  });
}

// ---------------------------------------------------------------------------
// Regression spec — signed-in path (issue #1240)
// ---------------------------------------------------------------------------

test.describe('issue-1240 school-radius zoom-too-tight (regression)', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  /**
   * REGRESSION-1240: Signed-in school-radius deep-link with 4 markers clustered
   * ~330 m from school and radiusKm=5.
   *
   * SchoolMarkerFocusPanner intersects:
   *   markerBounds  (~0.006 deg span → covers ~670 m)
   *   radiusBounds  (~0.09 deg span → covers ~10 km)
   * Intersection = markerBounds (tighter on all sides).
   *
   * Pre-fix: fitBounds had NO maxZoom → zoom ~15-17 (repro captured 17),
   *          radius circle off-screen.
   * Post-fix: fitBounds capped at SCHOOL_MARKER_FOCUS_MAX_ZOOM=13 → zoom ≤ 13,
   *          radius circle visible.
   */
  test(
    'REGRESSION-1240: auth school-radius 5km + 4 tight markers → SchoolMarkerFocusPanner caps final zoom ≤ 13 so the radius circle stays visible',
    async ({ page }) => {
      await stubAll(page);

      // Repro URL — matches issue description structure:
      // journey=school-first, areaKey set, schoolId, radiusKm=5, zoom=13 in URL
      const REPRO_URL =
        `/discover?city=udupi&journey=school-first` +
        `&lat=${SCHOOL_LAT}&lon=${SCHOOL_LON}&zoom=13` +
        `&areaKey=${ENCODED_AREA_KEY}` +
        `&schoolId=${SCHOOL_ID}&radiusKm=${RADIUS_KM}`;

      await page.goto(REPRO_URL);
      await page.waitForLoadState('domcontentloaded');

      // Check no crash first
      const hasCrash = await page.locator('text=Something went wrong').count();
      if (hasCrash > 0) {
        await page.screenshot({ path: '.claude/handoffs/issue-1240/probe-crash.png' });
        throw new Error('App crashed — check probe-crash.png');
      }

      // Phase 1: wait for school hydration (schoolCenter written by MapDiscovery)
      await expect
        .poll(() => getDebugSchoolCenter(page), {
          timeout: 15_000,
          message: 'School center never hydrated — useSchoolById stub may not have matched',
        })
        .toMatchObject({ lat: SCHOOL_LAT, lon: SCHOOL_LON });

      // Phase 2: wait for schoolMarkerFocusTick > 0 (fires when school listings are non-empty)
      await expect
        .poll(
          async () => {
            const ms = await getDebugMapState(page);
            return ms?.schoolMarkerFocusTick ?? 0;
          },
          {
            timeout: 15_000,
            message:
              'schoolMarkerFocusTick never incremented — city listings may not have populated schoolListings',
          },
        )
        .toBeGreaterThan(0);

      // No crash after the focus pan settles.
      expect(
        await page.locator('text=Something went wrong').count(),
        'App crashed after SchoolMarkerFocusPanner ran',
      ).toBe(0);

      // --- Regression assertion (poll-until-stable to avoid Leaflet settle flake) ---
      // A 5 km radius spans ~0.09 deg lat. At zoom 13 the viewport covers ~0.15 deg
      // (radius circle fits). At zoom 15+ the viewport covers ≤ ~0.04 deg, so the
      // radius circle is off-screen. The fix caps SchoolMarkerFocusPanner fitBounds
      // at SCHOOL_MARKER_FOCUS_MAX_ZOOM=13.
      //
      // Pre-fix this read zoom=17 (uncapped fitBounds over the tight marker cluster).
      // Polling lets the fitBounds animation settle without a brittle fixed timeout.
      await expect
        .poll(() => getDebugMapZoom(page), {
          timeout: 8_000,
          message:
            'SchoolMarkerFocusPanner final zoom should settle ≤ SCHOOL_MARKER_FOCUS_MAX_ZOOM (13) ' +
            'so the 5 km radius circle stays visible (issue #1240). Pre-fix this was 17. ' +
            'A single cluster badge at the capped zoom is acceptable (AC1 > AC3).',
        })
        .toBeLessThanOrEqual(13);

      const finalZoom = await getDebugMapZoom(page);
      const clusterBadges = await page.locator('.marker-cluster').count();
      const allMarkerIcons = await page.locator('.leaflet-marker-icon').count();

      console.log(`[REGRESSION-1240] schoolMarkerFocusTick fired`);
      console.log(`[REGRESSION-1240] final Leaflet zoom: ${finalZoom} (must be ≤ 13)`);
      console.log(`[REGRESSION-1240] cluster badges (.marker-cluster): ${clusterBadges} (a single badge is OK at capped zoom)`);
      console.log(`[REGRESSION-1240] all marker icons: ${allMarkerIcons}`);

      await page.screenshot({
        path: '.claude/handoffs/issue-1240/regression-1240-final-state.png',
        fullPage: false,
      });
    },
  );
});
