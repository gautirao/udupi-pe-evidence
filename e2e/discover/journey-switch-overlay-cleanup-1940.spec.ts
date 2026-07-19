/**
 * REGRESSION — Issue #1940
 *
 * Bug: switching Discover journeys via the top nav (e.g. Schools ->
 * Agricultural land, same city, no "Start over") left the previous
 * School journey's map overlays rendered on top of the new journey:
 *   1. the school-radius dashed circle (Leaflet Circle -> SVG path)
 *   2. the selected-school center marker (.school-marker)
 *   3. the "Showing the first N homes near this school" banner
 *      (DiscoverMapStatusHints, data-testid="school-radius-more-hint")
 *
 * Root cause: the top-nav journey switch (src/components/layout/AppLayout.tsx
 * NavItem -> getDiscoverRoute) correctly drops the school URL params
 * (schoolId/radiusKm/groupId/areaKey), but nothing cleared the LOCAL state
 * mirroring them (selectedSchool, filters.schoolLat/schoolLon/schoolRadiusKm).
 * Those local fields — not the URL — are what PropertyMap's schoolCircle
 * overlay and DiscoverMapStatusHints' schoolRadiusActive-gated banner key off,
 * so all three stayed mounted after the journey changed.
 *
 * Fix (already applied, not touched by this spec): a new effect in
 * useDiscoverJourneyTransitions.ts (src/features/discover/state/
 * useDiscoverJourneyTransitions.ts, "Issue #1940" block) tracks the previous
 * urlState.journey in a ref and, on any transition AWAY from 'school-first'
 * (to any other journey), clears selectedSchool and deletes
 * filters.schoolLat/schoolLon/schoolRadiusKm.
 *
 * Cases covered:
 *   AC1  Schools -> Agricultural land (original repro): all three overlays
 *        unmount, each asserted as its own separate expect().
 *   AC2  Schools -> Discover/Area-first (generalization): same three
 *        assertions, proving the teardown isn't agri-specific.
 *   AC3  Control: Udupi + Agricultural land landing (no prior school
 *        selection) renders clean — school-marker absent, banner absent.
 *        Proves the agri layer itself is fine; only the LEAVING-journey
 *        teardown was broken.
 *   AC4  Re-entry (non-regression): after leaving school-first and coming
 *        back via the top nav, re-selecting a school through the real
 *        ScopedSearch UI still draws a fresh radius circle — the fix does
 *        not break the working School journey.
 *   AC5  F1 REWORK (PR #1947 code-review finding F1): combined
 *        area-first + school state (journey=area-first, areaKey set, AND
 *        schoolId set — the AreaSchoolCombinedPanel state) -> Agricultural
 *        land via the top nav. The original fix only keyed teardown off the
 *        SOURCE journey literal ('school-first'), so this combined-state
 *        leak path (prevJourney === 'area-first') was missed. The
 *        generalized fix (useDiscoverJourneyTransitions.ts, "F1 REWORK"
 *        block) keys teardown off urlState.schoolId (destination
 *        ownership) instead, which also covers this path. Same three
 *        DISTINCT overlay-absence assertions as AC1/AC2, preceded by a
 *        precondition proving the overlay was genuinely rendered first.
 *
 * Anonymous flow throughout (storageState omitted) — the "showing first N"
 * banner is gated on !isAuthenticated (DiscoverMapStatusHints.tsx), matching
 * the pattern in e2e/discover-anon-school-radius.spec.ts.
 *
 * Backend-free: every endpoint is route-stubbed (same pattern as
 * e2e/discover/school-radius-marker-click-repro-1738.spec.ts and
 * e2e/discover-anon-school-radius.spec.ts). Run against a bare Vite dev
 * server (no Spring Boot backend needed).
 *
 * Run:
 *   PLAYWRIGHT_BASE_URL=http://localhost:5240 npx playwright test \
 *     e2e/discover/journey-switch-overlay-cleanup-1940.spec.ts --project=full
 */

import { test, expect, type Page, type Route } from '@playwright/test';

// Force anonymous context throughout — no storageState (no Authorization
// token), so the schoolRadiusHint banner's !isAuthenticated gate is satisfied.
test.use({ storageState: undefined });

// Pre-seed telemetry consent as 'granted' BEFORE the app mounts so
// DiscoverConsentBanner (getConsentState() === 'undecided' check in
// src/components/discover/DiscoverConsentBanner.tsx) never renders. Without
// this, the fixed bottom-4 z-50 consent dialog overlays ScopedSearch controls
// and intercepts pointer events during re-entry flows (e.g. AC4's
// search-mode-school toggle click times out because the banner is on top).
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('discover_telemetry_consent', 'granted');
  });
});

// ---------------------------------------------------------------------------
// Constants — Bangalore (school-first repro city, per the #1940 bug report)
// ---------------------------------------------------------------------------

const BANGALORE_AREA_KEY = 'IN|KA|Bengaluru|Whitefield';
const ENCODED_BANGALORE_AREA_KEY = encodeURIComponent(BANGALORE_AREA_KEY);

const SCHOOL_ID = 'sch-1940-1';
const SCHOOL_LAT = 12.9698;
const SCHOOL_LON = 77.75;
const DEFAULT_RADIUS_KM = 3;

const SCHOOL_FIXTURE = {
  id: SCHOOL_ID,
  name: 'Whitefield Public School',
  board: 'CBSE',
  boardType: null,
  address: 'Whitefield, Bengaluru, Karnataka',
  latitude: SCHOOL_LAT,
  longitude: SCHOOL_LON,
  distanceKm: 0.5,
  areaKey: BANGALORE_AREA_KEY,
};

const BANGALORE_TRENDS_OPTIONS_FIXTURE = {
  city: 'bangalore',
  defaultAreas: [{ areaKey: BANGALORE_AREA_KEY, areaLabel: 'Whitefield' }],
};

const BANGALORE_AREAS_FIXTURE = {
  city: 'bangalore',
  areas: [
    {
      areaKey: BANGALORE_AREA_KEY,
      name: 'Whitefield',
      geoCenterLat: SCHOOL_LAT,
      geoCenterLon: SCHOOL_LON,
      minLat: 12.94,
      maxLat: 13.0,
      minLon: 77.71,
      maxLon: 77.79,
      listingCount: 4,
      schoolCount: 5,
      trendDirection: 'stable',
    },
  ],
};

// Area-scoped public browse fallback — kept empty so the anon school-radius
// endpoint (stubbed separately) is unambiguously the listing source.
const EMPTY_CITY_LISTINGS = { city: 'bangalore', limitPerArea: 50, areas: [] };

const EMPTY_LISTINGS_PAGE = { content: [], page: 0, size: 50, totalElements: 0, totalPages: 0 };

// hasMore=true so the "showing first N" banner condition is satisfiable.
const SCHOOL_RADIUS_LISTINGS_FIXTURE = {
  content: [
    {
      id: 'sr-1940-1',
      listingNumber: 9040,
      propertyType: 'house',
      title: 'House Near Whitefield Public School',
      locality: 'Whitefield',
      areaKey: BANGALORE_AREA_KEY,
      pricePaise: 650_000_000,
      landArea: null,
      landAreaUnit: null,
      builtArea: 1400,
      builtAreaUnit: 'sqft',
      bedrooms: 3,
      // Offset from the school pin so the two markers don't share pixel
      // coordinates (same rationale as the #1738 repro fixture).
      latitude: SCHOOL_LAT + 0.005,
      longitude: SCHOOL_LON + 0.005,
      heroImageUrl: null,
      listingPurpose: 'sale',
      possessionStatus: 'ready_to_move',
      daysOnMarket: 5,
      backOnMarket: false,
      createdAt: '2026-05-01T00:00:00Z',
    },
  ],
  page: 0,
  size: 50,
  hasMore: true,
};

// Empty corridor groups for the Bangalore agri-first landing — no agri
// corridor data for Bangalore (per repo memory), so an empty groups[] is the
// honest, real-shaped fixture. The teardown assertions don't depend on
// corridor content, only on the school overlays being gone.
const EMPTY_AGRI_CORRIDOR_GROUPS = { city: 'bangalore', groups: [] };

// ---------------------------------------------------------------------------
// Constants — Udupi (agri control city, per repo memory: real agri data)
// ---------------------------------------------------------------------------

const UDUPI_AREA_KEY = 'IN|KA|Udupi|Manipal';

const UDUPI_TRENDS_OPTIONS_FIXTURE = {
  city: 'udupi',
  defaultAreas: [{ areaKey: UDUPI_AREA_KEY, areaLabel: 'Manipal' }],
};

const UDUPI_AREAS_FIXTURE = {
  city: 'udupi',
  areas: [
    {
      areaKey: UDUPI_AREA_KEY,
      name: 'Manipal',
      geoCenterLat: 13.3509,
      geoCenterLon: 74.7932,
      minLat: 13.33,
      maxLat: 13.38,
      minLon: 74.77,
      maxLon: 74.82,
      listingCount: 6,
      agriAcreage: 12.5,
      schoolCount: 3,
      trendDirection: 'stable',
    },
  ],
};

const UDUPI_CITY_LISTINGS = { city: 'udupi', limitPerArea: 50, areas: [] };

// maxKm values MUST be in {10,25,50,100} (useRegionalAreaGroups skips others).
const UDUPI_AGRI_CORRIDOR_GROUPS_FIXTURE = {
  city: 'udupi',
  groups: [
    {
      directionCode: 'N',
      groupName: 'North towards Kundapur',
      availableMaxDistances: [
        {
          maxKm: 10,
          distanceLabel: 'Within 10 km',
          includedBandCodes: ['0_10'],
          listingCount: 3,
          agriAcreage: 12.5,
          areaKeys: [UDUPI_AREA_KEY],
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/** Stub every endpoint needed for a Bangalore school-first + agri/area journey switch. */
async function stubBangalore(page: Page): Promise<void> {
  await page.route('**/api/trends/options**', (route) => fulfillJson(route, 200, BANGALORE_TRENDS_OPTIONS_FIXTURE));
  await page.route('**/api/discover/areas**', (route) => fulfillJson(route, 200, BANGALORE_AREAS_FIXTURE));
  await page.route('**/api/public/schools/popular**', (route) => fulfillJson(route, 200, []));
  await page.route('**/api/public/schools/search**', (route) => fulfillJson(route, 200, [SCHOOL_FIXTURE]));
  await page.route(`**/api/public/schools/${SCHOOL_ID}`, (route) => fulfillJson(route, 200, SCHOOL_FIXTURE));
  await page.route('**/api/public/schools/by-area**', (route) => fulfillJson(route, 200, [SCHOOL_FIXTURE]));
  await page.route('**/api/discover/regional-area-groups**', (route) => fulfillJson(route, 200, EMPTY_AGRI_CORRIDOR_GROUPS));
  await page.route('**/api/discover/markers**', (route) => fulfillJson(route, 200, { city: 'bangalore', markers: [] }));
  await page.route('**/api/discover/cities/*/listings**', (route) => fulfillJson(route, 200, EMPTY_CITY_LISTINGS));
  await page.route('**/api/discover/listings**', (route) => fulfillJson(route, 200, EMPTY_LISTINGS_PAGE));
  // Registered after the broader /listings glob so its more specific path wins
  // (Playwright matches the most-recently-added route first).
  await page.route('**/api/discover/cities/*/school-radius-listings**', (route) =>
    fulfillJson(route, 200, SCHOOL_RADIUS_LISTINGS_FIXTURE),
  );
}

async function stubUdupi(page: Page): Promise<void> {
  await page.route('**/api/trends/options**', (route) => fulfillJson(route, 200, UDUPI_TRENDS_OPTIONS_FIXTURE));
  await page.route('**/api/discover/areas**', (route) => fulfillJson(route, 200, UDUPI_AREAS_FIXTURE));
  await page.route('**/api/public/schools/popular**', (route) => fulfillJson(route, 200, []));
  await page.route('**/api/public/schools/search**', (route) => fulfillJson(route, 200, []));
  await page.route('**/api/discover/regional-area-groups**', (route) => fulfillJson(route, 200, UDUPI_AGRI_CORRIDOR_GROUPS_FIXTURE));
  await page.route('**/api/discover/markers**', (route) => fulfillJson(route, 200, { city: 'udupi', markers: [] }));
  await page.route('**/api/discover/cities/*/listings**', (route) => fulfillJson(route, 200, UDUPI_CITY_LISTINGS));
  await page.route('**/api/discover/listings**', (route) => fulfillJson(route, 200, EMPTY_LISTINGS_PAGE));
}

const SCHOOL_FIRST_RADIUS_URL =
  `/discover?city=bangalore&journey=school-first&areaKey=${ENCODED_BANGALORE_AREA_KEY}` +
  `&lat=${SCHOOL_LAT}&lon=${SCHOOL_LON}&zoom=14&schoolId=${SCHOOL_ID}&radiusKm=${DEFAULT_RADIUS_KM}`;

// F1 REWORK — the combined area-first + school deep link (AreaSchoolCombinedPanel
// state): journey=area-first (NOT school-first) with BOTH areaKey and schoolId set.
// Per src/utils/discoverPanelState.ts derivePanelContent, areaKey+schoolId both
// present -> 'area-school-combined' regardless of the journey param, so this is the
// real DOM/URL shape the leaked-overlay bug (F1) reproduces from, not a synthetic one.
const AREA_FIRST_COMBINED_SCHOOL_RADIUS_URL =
  `/discover?city=bangalore&journey=area-first&areaKey=${ENCODED_BANGALORE_AREA_KEY}` +
  `&lat=${SCHOOL_LAT}&lon=${SCHOOL_LON}&zoom=14&schoolId=${SCHOOL_ID}&radiusKm=${DEFAULT_RADIUS_KM}`;

function radiusCircleLocator(page: Page) {
  // The Leaflet Circle overlay renders as an SVG <path> inside the
  // interactive overlay pane — distinct from the DivIcon .school-marker.
  return page.locator('.leaflet-overlay-pane path.leaflet-interactive');
}

function schoolMarkerLocator(page: Page) {
  return page.locator('.leaflet-marker-icon.school-marker');
}

function moreHintBanner(page: Page) {
  return page.getByTestId('school-radius-more-hint');
}

/** Navigate to the Bangalore school-first radius URL and wait for all three overlays to settle in. */
async function gotoSchoolFirstWithActiveRadius(page: Page): Promise<void> {
  const radiusListingsResponse = page.waitForResponse(
    (res) => res.url().includes('/school-radius-listings') && res.status() === 200,
  );
  await page.goto(SCHOOL_FIRST_RADIUS_URL);
  await radiusListingsResponse;
  await page.waitForLoadState('networkidle');

  // Precondition: genuinely in the school-selected, radius-active state before
  // the journey switch — otherwise a "0 overlays" assertion after switching
  // would be true trivially (they were never rendered) rather than proving
  // the teardown actually fired.
  await expect(radiusCircleLocator(page)).toHaveCount(1, { timeout: 15_000 });
  await expect(schoolMarkerLocator(page)).toHaveCount(1, { timeout: 10_000 });
  await expect(moreHintBanner(page)).toBeVisible({ timeout: 10_000 });
}

/**
 * F1 REWORK — navigate to the Bangalore AREA-FIRST + combined-school deep link
 * and wait for all three overlays to settle in. Mirrors
 * gotoSchoolFirstWithActiveRadius above, but the source journey is 'area-first'
 * (with areaKey set) rather than 'school-first' — this is the combined-state
 * leak path the F1 code-review finding identified as missed by the original fix.
 */
async function gotoAreaFirstCombinedWithActiveRadius(page: Page): Promise<void> {
  const radiusListingsResponse = page.waitForResponse(
    (res) => res.url().includes('/school-radius-listings') && res.status() === 200,
  );
  await page.goto(AREA_FIRST_COMBINED_SCHOOL_RADIUS_URL);
  await radiusListingsResponse;
  await page.waitForLoadState('networkidle');

  // Precondition: genuinely in the combined area-first+school, radius-active
  // state before the journey switch — otherwise a "0 overlays" assertion after
  // switching would be trivially true (never rendered), not proof the teardown
  // actually fired for this (previously missed) combined-state leak path.
  await expect(page).toHaveURL(/journey=area-first/);
  await expect(page).toHaveURL(new RegExp(`schoolId=${SCHOOL_ID}`));
  await expect(radiusCircleLocator(page)).toHaveCount(1, { timeout: 15_000 });
  await expect(schoolMarkerLocator(page)).toHaveCount(1, { timeout: 10_000 });
  await expect(moreHintBanner(page)).toBeVisible({ timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Issue #1940 — journey-switch overlay cleanup (regression)', () => {
  test('AC1: Schools -> Agricultural land clears the radius circle, school marker, and banner', async ({ page }) => {
    await stubBangalore(page);
    await gotoSchoolFirstWithActiveRadius(page);

    await page.getByRole('link', { name: 'Agricultural land' }).click();

    // Sanity: the nav switch actually happened (journey changed, school params dropped).
    await expect(page).toHaveURL(/journey=agri-first/, { timeout: 10_000 });
    await expect(page).not.toHaveURL(/schoolId=/);

    // THE FIX — three DISTINCT overlays, three DISTINCT assertions.
    await expect(radiusCircleLocator(page)).toHaveCount(0, { timeout: 10_000 });
    await expect(schoolMarkerLocator(page)).toHaveCount(0, { timeout: 10_000 });
    await expect(moreHintBanner(page)).toHaveCount(0, { timeout: 10_000 });
  });

  test('AC2: Schools -> Discover (area-first) clears the radius circle, school marker, and banner', async ({ page }) => {
    await stubBangalore(page);
    await gotoSchoolFirstWithActiveRadius(page);

    await page.getByRole('link', { name: 'Discover', exact: true }).click();

    // Sanity: landed on the area-first/no-journey Discover route, school params dropped.
    await expect(page).not.toHaveURL(/journey=school-first/, { timeout: 10_000 });
    await expect(page).not.toHaveURL(/schoolId=/);

    // THE FIX — same three DISTINCT assertions, proving the teardown isn't agri-specific.
    await expect(radiusCircleLocator(page)).toHaveCount(0, { timeout: 10_000 });
    await expect(schoolMarkerLocator(page)).toHaveCount(0, { timeout: 10_000 });
    await expect(moreHintBanner(page)).toHaveCount(0, { timeout: 10_000 });
  });

  test('AC3 (control): Udupi + Agricultural land landing renders clean with no school overlays', async ({ page }) => {
    await stubUdupi(page);

    await page.goto('/discover?city=udupi&journey=agri-first');
    await page.waitForLoadState('networkidle');

    // Confirm the agri landing actually rendered (corridor list mounted), so
    // the absence assertions below reflect a settled page, not a blank one.
    await expect(page.getByTestId('corridor-landing-list')).toBeVisible({ timeout: 15_000 });

    // The agri layer never had a school selected — this is the control proving
    // only the LEAVING-journey teardown was broken, not the agri layer itself.
    await expect(schoolMarkerLocator(page)).toHaveCount(0);
    await expect(moreHintBanner(page)).toHaveCount(0);
    await expect(radiusCircleLocator(page)).toHaveCount(0);
  });

  test('AC4 (non-regression): re-entering School-first and re-selecting a school redraws the radius circle', async ({ page }) => {
    await stubBangalore(page);
    await gotoSchoolFirstWithActiveRadius(page);

    // Leave school-first (triggers the #1940 teardown).
    await page.getByRole('link', { name: 'Agricultural land' }).click();
    await expect(page).toHaveURL(/journey=agri-first/, { timeout: 10_000 });
    await expect(radiusCircleLocator(page)).toHaveCount(0, { timeout: 10_000 });

    // Come back to School-first via the top nav (bare landing — getDiscoverRoute
    // does not carry a schoolId forward).
    await page.getByRole('link', { name: 'Schools' }).click();
    await expect(page).toHaveURL(/journey=school-first/, { timeout: 10_000 });
    await expect(page).not.toHaveURL(/schoolId=/);
    await expect(radiusCircleLocator(page)).toHaveCount(0);

    // Re-select the school through the real search UI (not a URL hack) — proves
    // the fix didn't regress the working School journey (AC5).
    //
    // NOTE: the bare school-first landing renders SchoolBrowsePanel (school
    // zones list), NOT the ScopedSearch component (which only backs the
    // area-first AreaGroupsLandingPanel/AreaGroupSelectedPanel — see
    // src/components/discover/panels/AreaGroupsLandingPanel.tsx and
    // AreaGroupSelectedPanel.tsx). SchoolBrowsePanel already IS school-only,
    // so it has no Area/School mode toggle and no `scoped-search-input` /
    // `search-result-school-*` testids — its inline search box only carries
    // the placeholder "Search school name..." (deliberately kept as the live
    // testing locator per the comment in SchoolJourneyPanels.tsx), and its
    // SchoolCard results render as plain buttons keyed off the school name
    // text (see src/components/discover/panels/SchoolJourneyPanels.tsx
    // SchoolBrowsePanel / SchoolCard). Match the real DOM instead of a
    // testid that doesn't exist on this view.
    await page.getByPlaceholder('Search school name...').fill('Whitefield');
    const suggestion = page.getByText(SCHOOL_FIXTURE.name, { exact: true });
    await expect(suggestion).toBeVisible({ timeout: 10_000 });
    await suggestion.click();

    // Radius circle redraws for the freshly-selected school.
    await expect(radiusCircleLocator(page)).toHaveCount(1, { timeout: 15_000 });
    await expect(page).toHaveURL(new RegExp(`schoolId=${SCHOOL_ID}`), { timeout: 10_000 });
  });

  test('AC5 (F1 rework): combined area-first + school -> Agricultural land (top nav) tears down the leaked school overlay', async ({
    page,
  }) => {
    await stubBangalore(page);

    // Precondition established inside the helper: journey=area-first, areaKey
    // AND schoolId both set (AreaSchoolCombinedPanel state) — radius circle,
    // school marker, and "more homes near this school" banner all rendered.
    await gotoAreaFirstCombinedWithActiveRadius(page);

    // Same top-nav link AC1 uses to switch to agri-first.
    await page.getByRole('link', { name: 'Agricultural land' }).click();

    // Sanity: the nav switch actually happened (journey changed, school params dropped).
    await expect(page).toHaveURL(/journey=agri-first/, { timeout: 10_000 });
    await expect(page).not.toHaveURL(/schoolId=/);

    // THE F1 FIX — same three DISTINCT overlays, three DISTINCT assertions,
    // now proven for the combined area-first+school source state too.
    await expect(radiusCircleLocator(page)).toHaveCount(0, { timeout: 10_000 });
    await expect(schoolMarkerLocator(page)).toHaveCount(0, { timeout: 10_000 });
    await expect(moreHintBanner(page)).toHaveCount(0, { timeout: 10_000 });
  });
});
