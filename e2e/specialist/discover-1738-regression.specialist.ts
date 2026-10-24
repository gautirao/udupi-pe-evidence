/**
 * E2E: Issue #1738 — marker popover after school-radius selection (regression),
 * dismiss-cycle + mobile-viewport hardening.
 *
 * IMPORTANT — journey correction vs. the originally-specified procedure:
 * The Mode-3 Stage B procedure for this spec asked for a `journey=school-first`
 * repro. Ground truth in the code says otherwise, and this file follows the code,
 * not the procedure text:
 *
 *   - MarkerPopoverCard is gated by `isAreaFirstPopoverEligible` in
 *     src/pages/MapDiscovery.tsx: `journey === 'area-first' && selectedArea &&
 *     (panelContent === 'area-selected' || panelContent === 'area-school-combined')`.
 *   - school-first is EXPLICITLY excluded ("3 desynced marker tiers... own
 *     tiered/peek marker UI") — this is asserted as a non-regression in AC5 of
 *     the pre-existing e2e/discover/school-radius-marker-click-repro-1738.spec.ts.
 *   - The radius overlay / legend (`school-radius-legend`, SchoolRadiusMapOverlay.
 *     isSchoolRadiusOverlayState) renders whenever a school is selected, in EITHER
 *     journey — so the only state where BOTH the radius legend AND the marker
 *     popover exist is journey=area-first at the area-school-combined step.
 *
 * This file therefore exercises the #1738 procedure (radius overlay + marker +
 * popup open + dismiss-cycle + mobile clipping) against journey=area-first,
 * which is the only journey where the procedure's premises ("school selected AND
 * marker click opens a popup") are both true. AC1/AC2/AC5 (open-state coverage)
 * already exist in school-radius-marker-click-repro-1738.spec.ts and are not
 * duplicated here — this file adds the dismiss-cycle (Escape / background-click /
 * X button), the "radius survives dismiss" assertion, the screenshot capture, and
 * the mobile-viewport variant, none of which the existing file covers.
 *
 * Backend-free: stubs all API calls via page.route (same pattern as
 * e2e/discover/school-radius-marker-click-repro-1738.spec.ts).
 *
 * Run:
 *   npx playwright test e2e/specialist/discover-1738-regression.specialist.ts
 */

import { test, expect } from './support/specialist-test';
import type { Page, Route } from '@playwright/test';

const MANIPAL_AREA_KEY = 'IN|KA|Udupi|Manipal';
const ENCODED_AREA_KEY = encodeURIComponent(MANIPAL_AREA_KEY);

const MIT_SCHOOL_ID = '8c279ab2-5770-44dd-a15e-57526b0b4a91';
const MIT_LAT = 13.3525;
const MIT_LON = 74.79226;
const DEFAULT_RADIUS_KM = 3;

const MIT_SCHOOL = {
  id: MIT_SCHOOL_ID,
  name: 'Manipal Institute of Technology',
  board: 'DEEMED',
  boardType: null,
  address: 'Manipal, Udupi, Karnataka 576104',
  latitude: MIT_LAT,
  longitude: MIT_LON,
  distanceKm: 0.0,
  areaKey: MANIPAL_AREA_KEY,
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
      geoCenterLat: 13.3509,
      geoCenterLon: 74.7932,
      minLat: 13.33,
      maxLat: 13.38,
      minLon: 74.77,
      maxLon: 74.82,
      listingCount: 4,
      schoolCount: 6,
      trendDirection: 'stable',
    },
  ],
};

const LISTING_ID = 'listing-mit-dismiss-1';
const CITY_LISTINGS_FIXTURE = {
  city: 'udupi',
  limitPerArea: 50,
  areas: [
    {
      areaKey: MANIPAL_AREA_KEY,
      areaName: 'Manipal',
      listings: [
        {
          id: LISTING_ID,
          propertyType: 'house',
          title: 'House Near MIT',
          locality: 'Manipal',
          pricePaise: 500000000,
          // Code-review fix (PR #2136, cycle 2) — this test runs anonymous
          // (no auth stub anywhere in this file), so toSelectedListingPreview's
          // anon branch (selectedListingPreview.ts) reads `priceBand`, NOT
          // `pricePaise` — without this field the mobile sheet's price node
          // rendered the generic "Sign in to view price" fallback regardless
          // of which listing was tapped, so the price assertion below proved
          // nothing listing-specific. Set to a band consistent with
          // pricePaise (500000000 paise = ₹50L).
          priceBand: '₹45L-55L',
          lat: MIT_LAT,
          lon: MIT_LON,
          listingPurpose: 'sale',
        },
      ],
    },
  ],
};

const EMPTY_LISTINGS_PAGE = {
  content: [],
  page: 0,
  size: 50,
  totalElements: 0,
  totalPages: 0,
  aggregates: { topLocalities: [] },
};

const SCHOOL_RADIUS_LISTINGS_FIXTURE = {
  content: [
    {
      id: 'sr-1738d-1',
      listingNumber: 9021,
      propertyType: 'house',
      title: 'House Near MIT',
      locality: 'Manipal',
      areaKey: MANIPAL_AREA_KEY,
      pricePaise: 500_000_000,
      landArea: null,
      landAreaUnit: null,
      builtArea: 1200,
      builtAreaUnit: 'sqft',
      bedrooms: 3,
      latitude: MIT_LAT + 0.005,
      longitude: MIT_LON + 0.005,
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
  hasMore: false,
};

function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function stubAll(page: Page): Promise<void> {
  await page.route('**/api/trends/options**', (route) => fulfillJson(route, 200, TRENDS_OPTIONS_FIXTURE));
  await page.route('**/api/discover/areas**', (route) => fulfillJson(route, 200, DISCOVER_AREAS_FIXTURE));
  await page.route('**/api/public/schools/popular**', (route) => fulfillJson(route, 200, []));
  await page.route('**/api/public/schools/search**', (route) => fulfillJson(route, 200, [MIT_SCHOOL]));
  await page.route(`**/api/public/schools/${MIT_SCHOOL_ID}`, (route) => fulfillJson(route, 200, MIT_SCHOOL));
  await page.route('**/api/public/schools/by-area**', (route) => fulfillJson(route, 200, [MIT_SCHOOL]));
  await page.route('**/api/discover/cities/*/listings**', (route) => fulfillJson(route, 200, CITY_LISTINGS_FIXTURE));
  await page.route('**/api/discover/listings**', (route) => fulfillJson(route, 200, EMPTY_LISTINGS_PAGE));
  // Registered after the broader /listings glob so its more specific path wins.
  await page.route('**/api/discover/cities/*/school-radius-listings**', (route) =>
    fulfillJson(route, 200, SCHOOL_RADIUS_LISTINGS_FIXTURE),
  );
}

/**
 * Additional stubs for the canonical `node=` navigation subsystem
 * (`useAreasNavigationJourney` — see the module doc above `MANIPAL_NODE_KEY`).
 * Only the mobile test below uses these; the other 4 tests in this file keep
 * the legacy `journey=area-first&areaKey=` scheme and never call this.
 */
async function stubNavigationNode(page: Page): Promise<void> {
  await page.route('**/api/discover/cities/*/navigation/resolve**', (route) =>
    fulfillJson(route, 200, NAVIGATION_RESOLVE_FIXTURE),
  );
  await page.route('**/api/discover/cities/*/navigation/*/counts**', (route) =>
    fulfillJson(route, 200, NAVIGATION_COUNTS_FIXTURE),
  );
}

const markerSelector = `[data-listing-id="${LISTING_ID}"] [data-testid="property-marker"]`;

function popoverLocator(page: Page) {
  return page.getByTestId('marker-popover-card');
}

function radiusOverlayLocator(page: Page) {
  return page.locator('.leaflet-overlay-pane path.leaflet-interactive');
}

const combinedUrl =
  `/discover?city=udupi&journey=area-first&areaKey=${ENCODED_AREA_KEY}` +
  `&lat=${MIT_LAT}&lon=${MIT_LON}&zoom=14` +
  `&schoolId=${MIT_SCHOOL_ID}&radiusKm=${DEFAULT_RADIUS_KM}`;

// ── Canonical node= fixtures (PR #2136 review fix) ──
// The mobile test below needs `journey.node.nodeType === 'AREA'` to resolve
// (MapDiscovery.tsx's `nodeAreaPoint`/`selectedListingPreview` bridge — see
// nodeAreaPoint.ts and useAreasNavigationJourney.ts) so
// MobileListingPreviewSheet can actually mount. That resolution is driven by
// a SEPARATE subsystem from the legacy `areaKey=` journey used above:
// `useAreasNavigationJourney`'s two requests,
// `GET .../navigation/resolve?node=<key>` (contract: NavigationResolveResponseWire,
// src/features/discover/navigation/types.ts) and
// `GET .../navigation/<nodeKey>/counts` (contract: NavigationCountsResponse,
// same file) — read from source, not assumed. The node-key prefix
// convention (`a:` + the raw pipe-delimited areaKey, e.g.
// `a:IN|KA|Bengaluru|RR Nagar`) is confirmed against
// e2e/discover/issue-1956-pr3-area-clustering.spec.ts and
// src/features/discover/navigation/__tests__/staticSweep.test.ts.
const MANIPAL_NODE_KEY = `a:${MANIPAL_AREA_KEY}`;
const ENCODED_MANIPAL_NODE_KEY = encodeURIComponent(MANIPAL_NODE_KEY);

const NAVIGATION_RESOLVE_FIXTURE = {
  requested: MANIPAL_NODE_KEY,
  resolution: 'EXACT',
  revisionId: 1,
  node: {
    nodeKey: MANIPAL_NODE_KEY,
    nodeType: 'AREA',
    displayLabel: 'Manipal',
    depth: 1,
    regionKey: null,
    ancestry: [],
    nextLevelType: 'LISTINGS',
    children: [],
    revisionId: 1,
    bounds: {
      centreLat: DISCOVER_AREAS_FIXTURE.areas[0].geoCenterLat,
      centreLon: DISCOVER_AREAS_FIXTURE.areas[0].geoCenterLon,
      minLat: DISCOVER_AREAS_FIXTURE.areas[0].minLat,
      minLon: DISCOVER_AREAS_FIXTURE.areas[0].minLon,
      maxLat: DISCOVER_AREAS_FIXTURE.areas[0].maxLat,
      maxLon: DISCOVER_AREAS_FIXTURE.areas[0].maxLon,
    },
    descendantAreaKeys: null,
    areaKey: MANIPAL_AREA_KEY,
  },
};

const NAVIGATION_COUNTS_FIXTURE = {
  nodeKey: MANIPAL_NODE_KEY,
  count: 1,
  schoolCount: 6,
  areaCounts: { [MANIPAL_AREA_KEY]: 1 },
  areaSchoolCounts: { [MANIPAL_AREA_KEY]: 6 },
  children: [],
  revisionId: 1,
};

// KEEPS `areaKey=` alongside the new `node=` param — read from source
// (discoverLayerRegistry.ts's `computeDiscoverLayer`/`derivePanelContent`):
// the legacy panel-content state machine that gates `school-radius-legend`
// (`isSchoolRadiusOverlayState`, SchoolRadiusMapOverlay.tsx) dispatches on
// `input.selection.areaKey` — i.e. the URL's legacy `areaKey=` field, NOT
// `node=`/`nodeAreaPoint`. Dropping `areaKey=` broke the existing legend/
// radius-overlay assertions (confirmed live: panelContent never reached
// 'area-school-combined' without it, timing out on `school-radius-legend`).
// Both params name the SAME Manipal area, so this adds the canonical-node
// resolution the sheet needs without touching the legacy behaviour the
// other 4 tests in this file (and this test's own legend/radius assertions)
// already depend on.
const combinedNodeUrl =
  `/discover?city=udupi&journey=area-first&areaKey=${ENCODED_AREA_KEY}&node=${ENCODED_MANIPAL_NODE_KEY}` +
  `&lat=${MIT_LAT}&lon=${MIT_LON}&zoom=14` +
  `&schoolId=${MIT_SCHOOL_ID}&radiusKm=${DEFAULT_RADIUS_KM}`;

/** Navigate to the area-school-combined step and wait for the radius listings to resolve. */
async function gotoCombinedState(page: Page, url: string = combinedNodeUrl): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem('discover_telemetry_consent', 'granted');
  });
  await stubNavigationNode(page);
  const radiusListingsResponse = page.waitForResponse(
    (res) => res.url().includes('/school-radius-listings') && res.status() === 200,
  );
  await page.goto(url);
  await radiusListingsResponse;
  await page.waitForLoadState('networkidle');
}

async function clickMarkerAndOpenPopover(page: Page): Promise<void> {
  const marker = page.locator(markerSelector);
  await expect(marker).toBeVisible({ timeout: 20_000 });
  const popover = popoverLocator(page);
  for (let attempt = 0; attempt < 4; attempt++) {
    await marker.click();
    if (await popover.isVisible({ timeout: 2_500 }).catch(() => false)) {
      return;
    }
    await page.waitForTimeout(300);
  }
  await expect(popover).toBeVisible({ timeout: 10_000 });
}

test.describe('Issue #1738 — marker popover dismiss-cycle + mobile hardening (area-first, area-school-combined)', () => {
  test('procedure steps 1-7: radius overlay + legend + marker present, click opens popover with listing content', async ({
    page,
  }) => {
    await stubAll(page);
    await gotoCombinedState(page);

    // Step 4: radius overlay visible (both the drawn circle and the school-radius legend).
    await expect(radiusOverlayLocator(page)).toHaveCount(1, { timeout: 15_000 });
    await expect(page.getByTestId('school-radius-legend')).toBeVisible({ timeout: 10_000 });

    // Step 5: at least one listing marker present.
    const marker = page.locator(markerSelector);
    await expect(marker).toBeVisible({ timeout: 20_000 });

    const popover = popoverLocator(page);
    await expect(popover).toBeHidden();

    // Step 6: click the listing marker.
    await clickMarkerAndOpenPopover(page);

    // Step 7: popover visible AND shows listing content (title + price row), not just an
    // empty dialog shell.
    await expect(popover).toBeVisible({ timeout: 10_000 });
    await expect(popover).toHaveAttribute('role', 'dialog');
    await expect(popover).toContainText('House Near MIT');
    await expect(popover.getByTestId('popover-price')).toBeVisible();
  });

  test('dismiss via Escape: popover closes; radius overlay + legend remain visible', async ({ page }) => {
    await stubAll(page);
    await gotoCombinedState(page);

    await clickMarkerAndOpenPopover(page);

    const popover = popoverLocator(page);
    await expect(popover).toBeVisible({ timeout: 10_000 });

    await page.keyboard.press('Escape');
    await expect(popover).toBeHidden({ timeout: 5_000 });

    // Step 9: radius overlay + legend must still be present after dismiss — the popover
    // lifecycle must not tear down the school-radius state.
    await expect(radiusOverlayLocator(page)).toHaveCount(1);
    await expect(page.getByTestId('school-radius-legend')).toBeVisible();
  });

  test('dismiss via background click: popover closes; radius overlay + legend remain visible', async ({ page }) => {
    await stubAll(page);
    await gotoCombinedState(page);

    await clickMarkerAndOpenPopover(page);

    const popover = popoverLocator(page);
    await expect(popover).toBeVisible({ timeout: 10_000 });

    // Click an unobstructed edge of the Leaflet map container, away from any marker/pin or
    // top-left context overlay, so the click bubbles to the mapContainerRef div's onClick
    // (background-click dismiss) rather than hitting a marker or the popover card itself.
    const mapBox = await page.locator('.leaflet-container').boundingBox();
    expect(mapBox).not.toBeNull();
    if (mapBox) {
      await page.mouse.click(mapBox.x + mapBox.width - 24, mapBox.y + mapBox.height / 2);
    }

    await expect(popover).toBeHidden({ timeout: 5_000 });
    await expect(radiusOverlayLocator(page)).toHaveCount(1);
    await expect(page.getByTestId('school-radius-legend')).toBeVisible();
  });

  test('dismiss via X (close) button: popover closes; radius overlay + legend remain visible', async ({ page }) => {
    await stubAll(page);
    await gotoCombinedState(page);

    await clickMarkerAndOpenPopover(page);

    const popover = popoverLocator(page);
    await expect(popover).toBeVisible({ timeout: 10_000 });

    await popover.getByTestId('marker-popover-close').click();

    await expect(popover).toBeHidden({ timeout: 5_000 });
    await expect(radiusOverlayLocator(page)).toHaveCount(1);
    await expect(page.getByTestId('school-radius-legend')).toBeVisible();
  });

  test('mobile viewport (390x844): the occluded property marker is the one that actually gets tapped, and the radius legend remains visible', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubAll(page);
    // PR #2136 review fix: ADDS the canonical `node=` param (see
    // MANIPAL_NODE_KEY's module doc) alongside the existing legacy
    // `areaKey=` so `journey.node.nodeType === 'AREA'` genuinely resolves
    // and MobileListingPreviewSheet can mount — the prior URL (areaKey=
    // only, no node=) left `selectedListingPreview` permanently null, so
    // sheet-visibility could never be asserted here (see git history for
    // the removed disclosure comment this replaces). `areaKey=` stays
    // because it (not `node=`) is what the legacy panelContent state
    // machine still keys the `school-radius-legend` gate on.
    await stubNavigationNode(page);
    await gotoCombinedState(page, combinedNodeUrl);

    // Issue #2130 fixture fix: LIST is the default mobile view (#1953/#1956) —
    // the map (and everything on it, including the radius legend and
    // markers) only mounts after switching into the mobile MAP overlay via
    // control-bar-map-trigger. This is the same established pattern every
    // other mobile-viewport Discover spec already uses (e.g.
    // e2e/discover/issue-2129-mobile-marker-occlusion.spec.ts's
    // gotoAreaLeafMapModeNoPreview, issue-1956-pr5-mobile-list-first.spec.ts).
    // This spec previously omitted it and asserted directly against the LIST
    // view, where the legend/map never render — unrelated to marker z-order.
    const mapTrigger = page.getByTestId('control-bar-map-trigger');
    await expect(mapTrigger).toBeVisible({ timeout: 15_000 });
    await mapTrigger.click();
    await expect(page.getByTestId('mobile-map-close-list-button')).toBeVisible({ timeout: 10_000 });

    await expect(page.getByTestId('school-radius-legend')).toBeVisible({ timeout: 10_000 });

    const marker = page.locator(markerSelector);
    await expect(marker).toBeVisible({ timeout: 20_000 });
    await marker.click();

    // THE #2130 FIX, proven on mobile: the tap must resolve to the PROPERTY
    // marker's own listing (`listing=` pushed to the URL by
    // onMarkerClickWithPosition — see MarkerClusterLayer.tsx), not be
    // swallowed by the overlapping selected-school marker sitting on top of
    // it. Before the pane-separation fix in PropertyMap.tsx/
    // SchoolMarkerLayer.tsx, the school marker intercepted this exact click
    // and `listing=` never appeared.
    await expect.poll(() => new URL(page.url()).searchParams.get('listing')).toBe(LISTING_ID);

    // PR #2136 REVIEW FIX (BLOCKING): the URL updating is necessary but not
    // sufficient — prove the compact preview actually MOUNTS and reflects the
    // correct listing, not just that the URL param changed underneath an
    // apparently-ineffective tap. Now that the canonical `node=` journey is
    // wired above, `journey.node.nodeType === 'AREA'` resolves and
    // `AreaLeafListingsSurface` derives `selectedListingPreview` from
    // `nav.selectedListing` against its own already-fetched
    // `CITY_LISTINGS_FIXTURE` set (see nodeAreaPoint.ts /
    // useAreasNavigationJourney.ts), so MobileListingPreviewSheet mounts for
    // real, not via a mock.
    const previewSheet = page.getByTestId('mobile-listing-preview-sheet');
    await expect(previewSheet).toBeVisible({ timeout: 10_000 });
    // Identity: the sheet has no raw listing-id text node (established
    // pattern in e2e/discover/issue-2129-mobile-marker-occlusion.spec.ts), so
    // identity is proven by combining the `listing=` URL poll above with
    // sheet CONTENT derived from this test's own stubbed fixture data — the
    // area label AND the exact `priceBand` string (see CITY_LISTINGS_FIXTURE's
    // code-review-fix comment) render from the SAME listing this test tapped,
    // not a generic/empty shell. This test runs anonymous (no auth stub in
    // this file), so the sheet's anon arm renders `priceBand` inside
    // `mobile-listing-preview-price-band` (MobileListingPreviewSheet.tsx) —
    // asserting its exact text, not just `.toBeVisible()`, is what makes this
    // listing-specific rather than passing regardless of which listing/price
    // state was hit.
    await expect(previewSheet.getByTestId('mobile-listing-preview-area-label')).toContainText('Manipal');
    await expect(previewSheet.getByTestId('mobile-listing-preview-price-band')).toHaveText('₹45L-55L');

    // Radius legend must still be visible after the tap.
    await expect(page.getByTestId('school-radius-legend')).toBeVisible();
  });
});
