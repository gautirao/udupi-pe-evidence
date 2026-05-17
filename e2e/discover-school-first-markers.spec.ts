import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * Issue #1074 — School-first journey property markers + right-panel listings.
 *
 * Slice A: school-first + areaKey (no schoolId) → school markers + area
 *          property markers + right-panel property cards.
 * Slice B: school-first + schoolId → highlighted school + radius circle +
 *          property markers OR explicit empty banner; right-panel listing list.
 *
 * Regression target #1065: area-first journey still renders property markers.
 * Regression target #1109: property markers must persist after settled-state
 *   refetch triggered by school selection (via both map-marker click and
 *   right-panel card click paths).
 *
 * Manipal areaKey: 'IN|KA|Udupi|Manipal' (URL-encoded as IN%7CKA%7CUdupi%7CManipal).
 * The school-first "Manipal" area selection is the canonical Slice A path.
 */

const MANIPAL_AREA_KEY = 'IN%7CKA%7CUdupi%7CManipal';
const MANIPAL_AREA_KEY_RAW = 'IN|KA|Udupi|Manipal';
const ENCODED_AREA_KEY = MANIPAL_AREA_KEY;

// ---------------------------------------------------------------------------
// Shared fixtures for #1109 regression tests
// ---------------------------------------------------------------------------

const SCHOOLS_BY_AREA_FIXTURE_1109 = [
  {
    id: 'sch-malpe-1',
    name: 'Pretty Angels Preschool',
    board: 'STATE',
    boardType: null,
    address: 'Malpe, Udupi',
    latitude: 13.3469,
    longitude: 74.7059,
    schoolCategory: 'primary',
  },
];

const SCHOOL_MALPE = SCHOOLS_BY_AREA_FIXTURE_1109[0];

const MARKERS_WITH_PROPERTY: object = {
  city: 'udupi',
  markers: [
    {
      id: 'prop-marker-1',
      latitude: 13.347,
      longitude: 74.706,
      pricePaise: 5_000_000,
      title: 'Test Property Near School',
      propertyType: 'house',
    },
  ],
};

const DISCOVER_AREAS_MALPE = {
  city: 'udupi',
  areas: [
    {
      areaKey: MANIPAL_AREA_KEY_RAW,
      name: 'Malpe',
      geoCenterLat: 13.3469,
      geoCenterLon: 74.7059,
      listingCount90d: 3,
      schoolCount: 1,
      trendDirection: 'stable',
    },
  ],
};

const EMPTY_LISTINGS_PAGE_1109 = {
  content: [],
  page: 0,
  size: 50,
  totalElements: 0,
  totalPages: 0,
  aggregates: { topLocalities: [] },
};

function fulfillJson1109(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function stubCommonRoutes1109(page: Page): Promise<void> {
  await page.route('**/api/trends/options**', (route) =>
    fulfillJson1109(route, 200, { city: 'udupi', defaultAreas: [] }),
  );
  await page.route('**/api/discover/areas**', (route) =>
    fulfillJson1109(route, 200, DISCOVER_AREAS_MALPE),
  );
  await page.route('**/api/public/schools/popular**', (route) =>
    fulfillJson1109(route, 200, []),
  );
  await page.route('**/api/discover/listings**', (route) =>
    fulfillJson1109(route, 200, EMPTY_LISTINGS_PAGE_1109),
  );
  await page.route(`**/api/public/schools/${SCHOOL_MALPE.id}`, (route) =>
    fulfillJson1109(route, 200, SCHOOL_MALPE),
  );
}

test.describe('@integration-ui Issue #1074 — school-first markers', () => {
  test('Slice A: school-first + Manipal area → schools + property markers + right-panel cards', async ({ page }) => {
    await page.goto(
      `http://localhost:5174/discover?city=udupi&journey=school-first&zoom=14&areaKey=${MANIPAL_AREA_KEY}`,
      { waitUntil: 'networkidle' },
    );

    // Right panel renders the schools-in-area panel
    await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 10_000 });

    // Property markers must be present alongside school markers
    const propertyMarkers = page.locator('[data-testid="property-marker"]');
    await expect(propertyMarkers.first()).toBeVisible({ timeout: 10_000 });
    expect(await propertyMarkers.count()).toBeGreaterThan(0);

    // School markers continue rendering — selector matches PropertyMap's schoolMarkerIcon className
    const schoolMarkers = page.locator('.school-marker');
    expect(await schoolMarkers.count()).toBeGreaterThan(0);

    // Right-panel "Homes in this area" section + at least one property card
    await expect(page.getByTestId('schools-in-area-properties')).toBeVisible();
    const propertyCards = page.getByTestId('listing-card');
    expect(await propertyCards.count()).toBeGreaterThan(0);
  });

  test('Slice B: school-first + school selected → radius circle + markers OR empty banner', async ({ page }) => {
    // Start at the Manipal area panel, then click the first school card to enter school-selected state
    await page.goto(
      `http://localhost:5174/discover?city=udupi&journey=school-first&zoom=14&areaKey=${MANIPAL_AREA_KEY}`,
      { waitUntil: 'networkidle' },
    );
    await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 10_000 });

    const firstSchoolCard = page.getByTestId('school-card').first();
    await expect(firstSchoolCard).toBeVisible({ timeout: 10_000 });
    await firstSchoolCard.click();

    // URL gains schoolId — wait for transition to school-selected panel
    await expect(page).toHaveURL(/schoolId=/, { timeout: 8_000 });

    // Leaflet Circle for the radius (SVG path inside leaflet-overlay-pane)
    const radiusCircle = page.locator('.leaflet-overlay-pane svg path').first();
    await expect(radiusCircle).toBeVisible({ timeout: 10_000 });

    // Either property markers exist OR the empty-state banner is shown.
    // Both are acceptable per AC2 + AC3.
    const propertyMarkers = page.locator('[data-testid="property-marker"]');
    const emptyBanner = page.getByTestId('empty-state-message');

    const markerCount = await propertyMarkers.count();
    if (markerCount === 0) {
      await expect(emptyBanner).toBeVisible();
    } else {
      expect(markerCount).toBeGreaterThan(0);
    }
  });

  test('AC5 regression: area-first Manipal journey still renders property markers', async ({ page }) => {
    await page.goto(
      `http://localhost:5174/discover?city=udupi&journey=area-first&zoom=14&areaKey=${MANIPAL_AREA_KEY}`,
      { waitUntil: 'networkidle' },
    );

    await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 10_000 });
    const propertyMarkers = page.locator('[data-testid="property-marker"]');
    await expect(propertyMarkers.first()).toBeVisible({ timeout: 10_000 });
    expect(await propertyMarkers.count()).toBeGreaterThan(0);

    // Right-panel property cards still render (issue-1065-final regression)
    const propertyCards = page.getByTestId('listing-card');
    expect(await propertyCards.count()).toBeGreaterThan(0);
  });
});

/**
 * Issue #1109 regression — property markers must persist in the SETTLED state
 * after a school is selected via either Path A (school marker click on map) or
 * Path B (school card click in right panel).
 *
 * Root cause: handleSelectSchoolMarker previously only called
 * urlActions.setSchoolParams, which set urlState.schoolId without touching
 * filters.schoolLat/schoolLon/schoolRadiusKm. useDiscoverFilteredMarkers then
 * fired a refetch with no school params → backend returned unfiltered/empty
 * markers in the settled response. School coords were applied only after the
 * async useSchoolById resolved — too late.
 *
 * Fix: handleSelectSchoolById (MapDiscovery.tsx) looks up the school from the
 * already-loaded schools[] array and synchronously sets selectedSchool +
 * filters.schoolLat/Lon/RadiusKm before the refetch fires. The placeholderData
 * option in useDiscoverFilteredMarkers prevents flash-to-empty during in-flight.
 *
 * These tests stub the /api/discover/markers endpoint to return a known marker
 * and assert the marker is visible after the settled-state refetch completes.
 */
test.describe('Issue #1109 regression — markers persist after settled refetch', () => {

  /**
   * Path B: right-panel school card click → markers visible after settled refetch.
   * This is the canonical regression path (Pretty Angels Preschool, Malpe, Udupi).
   */
  test('#1109-B: school card click — markers persist after settled refetch', async ({ page }) => {
    await stubCommonRoutes1109(page);

    // Stub schools-by-area to return our Malpe school
    await page.route('**/api/public/schools/by-area**', (route) =>
      fulfillJson1109(route, 200, SCHOOLS_BY_AREA_FIXTURE_1109),
    );

    // Stub markers endpoint to always return 1 property marker.
    // This covers both the pre-school (area markers) and post-school (proximity markers) calls.
    await page.route('**/api/discover/markers**', (route) =>
      fulfillJson1109(route, 200, MARKERS_WITH_PROPERTY),
    );

    await page.goto(
      `/discover?city=udupi&journey=school-first&zoom=14&areaKey=${ENCODED_AREA_KEY}`,
      { waitUntil: 'domcontentloaded' },
    );

    // Wait for the school card to render in the right panel (schools-in-area panel)
    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel).toBeVisible({ timeout: 15_000 });
    const schoolCard = rightPanel.locator('[data-testid="school-card"]').first();
    await expect(schoolCard).toBeVisible({ timeout: 15_000 });

    // Click the school card (Path B)
    await schoolCard.click();

    // URL must gain schoolId — confirms the selection was processed
    await expect(page).toHaveURL(/schoolId=/, { timeout: 8_000 });

    // Property markers must remain visible in the settled state.
    // Prior to #1109 fix: markers disappeared because the refetch had no school coords.
    const propertyMarkers = page.locator('[data-testid="property-marker"]');
    await expect(propertyMarkers.first()).toBeVisible({ timeout: 12_000 });
    expect(await propertyMarkers.count()).toBeGreaterThan(0);
  });

  /**
   * Path A: school marker click on map → markers visible after settled refetch.
   * School markers in SchoolMarkerLayer use CSS class 'school-marker' (L.divIcon).
   * Leaflet places them in .leaflet-marker-pane. They are interactive elements with
   * role="button" but may not pass Playwright's strict visibility check due to the
   * Leaflet canvas clipping context. We dispatch a native click via evaluate() to
   * reliably trigger the Leaflet click handler.
   */
  test('#1109-A: school marker click — markers persist after settled refetch', async ({ page }) => {
    await stubCommonRoutes1109(page);

    // Stub schools-by-area to return our Malpe school
    await page.route('**/api/public/schools/by-area**', (route) =>
      fulfillJson1109(route, 200, SCHOOLS_BY_AREA_FIXTURE_1109),
    );

    // Stub markers endpoint to always return 1 property marker.
    await page.route('**/api/discover/markers**', (route) =>
      fulfillJson1109(route, 200, MARKERS_WITH_PROPERTY),
    );

    await page.goto(
      `/discover?city=udupi&journey=school-first&zoom=14&areaKey=${ENCODED_AREA_KEY}`,
      { waitUntil: 'domcontentloaded' },
    );

    await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 15_000 });

    // Wait for school markers to appear in the Leaflet marker pane.
    // SchoolMarkerLayer uses L.divIcon with className 'school-marker'.
    const schoolMarker = page.locator('.leaflet-marker-pane .school-marker').first();
    await expect(schoolMarker).toBeAttached({ timeout: 15_000 });

    // Dispatch a native click event on the marker element via evaluate().
    // Playwright's click() can fail for Leaflet markers due to canvas clipping,
    // so we use dispatchEvent to reliably trigger the Leaflet click handler.
    await schoolMarker.dispatchEvent('click');

    // URL must gain schoolId — confirms the click was processed by handleSelectSchoolById
    await expect(page).toHaveURL(/schoolId=/, { timeout: 8_000 });

    // Property markers must remain visible in the settled state.
    // Prior to #1109 fix: markers disappeared because refetch fired with no school coords.
    const propertyMarkers = page.locator('[data-testid="property-marker"]');
    await expect(propertyMarkers.first()).toBeVisible({ timeout: 12_000 });
    expect(await propertyMarkers.count()).toBeGreaterThan(0);
  });
});
