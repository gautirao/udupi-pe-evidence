/**
 * Issue #2149 — mobile school-first marker tap never opened an info surface.
 *
 * Root cause: the mobile listing-preview sheet (`MobileListingPreviewSheet`,
 * driven by `selectedListingPreview`) was only ever populated by area-first's
 * `AreaLeafListingsSurface`/`NodeListingsSurface`, deriving the preview from
 * the URL-backed `nav.selectedListing`. School-first marker clicks
 * deliberately never write that URL param (#1547-deferred design, #1973
 * rev-2), so on mobile — where the desktop popover is suppressed since #1956
 * PR-5 (`isMarkerPopoverEligible && !mobileMapOpen`) — nothing ever populated
 * `selectedListingPreview` for school-first, and a marker tap did nothing at
 * all. Fixed in `LegacyRightPanelBridge.tsx` (the actual owner of the
 * school-first "school selected + radius" render state, confirmed live —
 * NOT `SchoolFirstJourneyPanel.tsx`, which only owns the node-hierarchy
 * browse state before a school is picked): a new effect derives the preview
 * directly from `selectedMarkerListing` (the local click state
 * `useMarkerSelection` already sets for school-first) via
 * `toSelectedListingPreviewFromMarkerListing` (`selectedListingPreview.ts`)
 * and reports it through the SAME `onSelectedListingPreviewChange` pathway
 * #1956 established.
 *
 * This spec drives the school-first flow with deterministic route stubs for
 * the Bellandur school and its surrounding radius listings so it runs
 * self-contained under the specialist harness without depending on a shared
 * hosted database.
 *
 * School: 'Narayana eTechno (CBSE) School - Bellandur', Bangalore
 * (schoolId 666e457e-1bcc-4d1a-834d-dd250d23865b, areaKey
 * IN|KA|Bengaluru|Bellandur).
 *
 * Run:
 *   npx playwright test e2e/specialist/discover-issue-2149-mobile-school-first-marker-preview.specialist.ts
 */
import { test, expect } from './support/specialist-test';
import type { Page, Locator, Route } from '@playwright/test';

const CITY = 'bangalore';
const SCHOOL_ID = '666e457e-1bcc-4d1a-834d-dd250d23865b';
const AREA_KEY = 'IN|KA|Bengaluru|Bellandur';
const RADIUS_KM = '3';
const SCHOOL_LAT = 12.93147;
const SCHOOL_LON = 77.53048;

const BELLANDUR_SCHOOL = {
  id: SCHOOL_ID,
  name: 'Narayana eTechno (CBSE) School - Bellandur',
  board: 'CBSE',
  boardType: null,
  address: 'Bellandur, Bangalore, Karnataka',
  latitude: SCHOOL_LAT,
  longitude: SCHOOL_LON,
  distanceKm: 0.0,
  areaKey: AREA_KEY,
};

const SCHOOL_RADIUS_LISTINGS = [
  {
    id: '2149a000-0000-4000-8000-000000000001',
    listingNumber: 21491,
    propertyType: 'apartment',
    title: 'Bellandur 2BHK Alpha',
    locality: 'Bellandur',
    areaKey: AREA_KEY,
    pricePaise: 900_000_000,
    priceBand: '₹85L–95L',
    landArea: null,
    landAreaUnit: null,
    builtArea: 1150,
    builtAreaUnit: 'sqft',
    bedrooms: 2,
    latitude: SCHOOL_LAT + 0.012,
    longitude: SCHOOL_LON - 0.015,
    lat: SCHOOL_LAT + 0.012,
    lon: SCHOOL_LON - 0.015,
    heroImageUrl: null,
    listingPurpose: 'sale',
    possessionStatus: 'ready_to_move',
    daysOnMarket: 7,
    backOnMarket: false,
    createdAt: '2026-05-01T00:00:00Z',
  },
  {
    id: '2149b000-0000-4000-8000-000000000002',
    listingNumber: 21492,
    propertyType: 'apartment',
    title: 'Bellandur 3BHK Beta',
    locality: 'Bellandur',
    areaKey: AREA_KEY,
    pricePaise: 1_350_000_000,
    priceBand: '₹1.3Cr–1.4Cr',
    landArea: null,
    landAreaUnit: null,
    builtArea: 1620,
    builtAreaUnit: 'sqft',
    bedrooms: 3,
    latitude: SCHOOL_LAT - 0.012,
    longitude: SCHOOL_LON + 0.015,
    lat: SCHOOL_LAT - 0.012,
    lon: SCHOOL_LON + 0.015,
    heroImageUrl: null,
    listingPurpose: 'sale',
    possessionStatus: 'ready_to_move',
    daysOnMarket: 4,
    backOnMarket: false,
    createdAt: '2026-05-02T00:00:00Z',
  },
];

function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function stubSchoolFirstData(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem('discover_telemetry_consent', 'granted');
  });
  await page.route('**/api/discover/areas**', (route) =>
    fulfillJson(route, 200, {
      city: CITY,
      areas: [
        {
          areaKey: AREA_KEY,
          name: 'Bellandur',
          geoCenterLat: SCHOOL_LAT,
          geoCenterLon: SCHOOL_LON,
          minLat: SCHOOL_LAT - 0.02,
          maxLat: SCHOOL_LAT + 0.02,
          minLon: SCHOOL_LON - 0.02,
          maxLon: SCHOOL_LON + 0.02,
          listingCount: 2,
          schoolCount: 1,
          trendDirection: 'stable',
        },
      ],
    }),
  );
  await page.route('**/api/public/schools/popular**', (route) => fulfillJson(route, 200, [BELLANDUR_SCHOOL]));
  await page.route('**/api/public/schools/search**', (route) => fulfillJson(route, 200, [BELLANDUR_SCHOOL]));
  await page.route(`**/api/public/schools/${SCHOOL_ID}**`, (route) => fulfillJson(route, 200, BELLANDUR_SCHOOL));
  await page.route('**/api/public/schools/by-area**', (route) => fulfillJson(route, 200, [BELLANDUR_SCHOOL]));
  await page.route('**/api/discover/cities/*/listings**', (route) =>
    fulfillJson(route, 200, {
      city: CITY,
      limitPerArea: 50,
      areas: [{ areaKey: AREA_KEY, areaName: 'Bellandur', listings: SCHOOL_RADIUS_LISTINGS }],
    }),
  );
  await page.route('**/api/discover/cities/*/school-radius-listings**', (route) =>
    fulfillJson(route, 200, {
      content: SCHOOL_RADIUS_LISTINGS,
      page: 0,
      size: 50,
      hasMore: false,
    }),
  );
}

// Deliberately NO lat/lon/zoom hint — see module doc: `SchoolMarkerFocusPanner`
// (PropertyMap.tsx) imperatively fitBounds-es the camera to
// markerBounds ∩ radiusBounds on cold load regardless of any URL hint, so a
// hand-picked camera hint would just produce a confusing, unrepresentative URL.
const REPRO_URL =
  `/discover?city=${CITY}&journey=school-first` +
  `&areaKey=${encodeURIComponent(AREA_KEY)}&schoolId=${SCHOOL_ID}&radiusKm=${RADIUS_KM}`;
const MOBILE_VIEWPORT = { width: 390, height: 844 };

async function dismissConsentBannerIfPresent(page: Page): Promise<void> {
  const decline = page.getByRole('button', { name: /decline/i });
  if (await decline.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await decline.click();
  }
}

function schoolAndRadiusParams(page: Page): { schoolId: string | null; radiusKm: string | null } {
  const u = new URL(page.url());
  return { schoolId: u.searchParams.get('schoolId'), radiusKm: u.searchParams.get('radiusKm') };
}

/** The single property marker element for a given listing id (established selector precedent, e.g. issue-2089-marker-swap-fixture.spec.ts). */
function markerLocatorFor(page: Page, listingId: string): Locator {
  return page.locator(`[data-listing-id="${listingId}"] [data-testid="property-marker"]`);
}

/** Distinct listing ids among the currently-rendered property markers. */
async function visibleMarkerListingIds(page: Page): Promise<string[]> {
  const ids = await page
    .locator('[data-testid="property-marker"]')
    .evaluateAll((nodes) =>
      nodes
        .map((n) => n.closest('[data-listing-id]')?.getAttribute('data-listing-id') ?? null)
        .filter((id): id is string => id != null),
    );
  return [...new Set(ids)];
}

/**
 * Dispatches a real 'click' DOM event directly on a currently-present marker
 * (not `seedIds[0]` blindly — re-reads the live marker set on every attempt,
 * since real map data can re-cluster/virtualize a marker between when it was
 * first seen and when this runs) and returns the listing id it clicked.
 *
 * See module doc "MARKER CLICK MECHANISM" for why `dispatchEvent('click')`
 * is used instead of `locator.click()` / `page.mouse`.
 *
 * DESKTOP-ONLY as of the #2149 PR-review fix-up below: the mobile tests now
 * use `tapMarkerViaTouchscreen`, a real `page.touchscreen.tap()` that passes
 * genuine browser hit-testing, so this dispatchEvent path only remains for
 * the desktop regression test (unflagged by review — desktop never had a
 * hit-testing problem, only school-first mobile did).
 */
async function clickAnyMarker(page: Page, exclude: string[] = []): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    const currentIds = await visibleMarkerListingIds(page);
    const id = currentIds.find((candidate) => !exclude.includes(candidate));
    if (!id) {
      lastError = new Error(`No marker available among [${currentIds.join(', ')}] excluding [${exclude.join(', ')}]`);
      await page.waitForTimeout(300);
      continue;
    }
    try {
      await markerLocatorFor(page, id).dispatchEvent('click');
      return id;
    } catch (err) {
      lastError = err;
      await page.waitForTimeout(300);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('clickAnyMarker: exhausted retries');
}

/**
 * Taps a currently-present marker with a real `page.touchscreen.tap(x, y)` —
 * a genuine touch action that goes through actual browser hit-testing, not a
 * synthesized DOM event. Re-reads the live marker set and re-measures its
 * bounding box on every attempt (real map data can re-cluster/move a marker
 * between when it was first seen and when this runs), and — per PR review —
 * verifies with `document.elementFromPoint(x, y)` that the tap point
 * actually resolves to the intended marker element (or a descendant of it)
 * BEFORE tapping, so a stale/wrong bounding box is caught deterministically
 * instead of silently mis-tapping. If the point resolves to something else
 * (stale box, re-clustering, an overlay on top of the pin), this reacquires
 * a currently-visible marker and retries — it never falls back to a
 * synthetic dispatch.
 */
async function tapMarkerViaTouchscreen(page: Page, exclude: string[] = []): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 10; attempt++) {
    const currentIds = await visibleMarkerListingIds(page);
    const id = currentIds.find((candidate) => !exclude.includes(candidate));
    if (!id) {
      lastError = new Error(`No marker available among [${currentIds.join(', ')}] excluding [${exclude.join(', ')}]`);
      await page.waitForTimeout(300);
      continue;
    }

    const marker = markerLocatorFor(page, id);
    const box = await marker.boundingBox().catch(() => null);
    if (!box) {
      lastError = new Error(`Marker ${id} has no bounding box (not attached/visible)`);
      await page.waitForTimeout(300);
      continue;
    }
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    const markerHandle = await marker.elementHandle().catch(() => null);
    if (!markerHandle) {
      lastError = new Error(`Marker ${id} elementHandle not resolvable`);
      await page.waitForTimeout(300);
      continue;
    }

    const hitsIntendedMarker = await page.evaluate(
      ({ px, py, markerEl }) => {
        const hit = document.elementFromPoint(px, py);
        if (!hit) return false;
        return hit === markerEl || markerEl.contains(hit);
      },
      { px: x, py: y, markerEl: markerHandle },
    );
    await markerHandle.dispose();

    if (!hitsIntendedMarker) {
      lastError = new Error(
        `elementFromPoint(${x}, ${y}) did not resolve to marker ${id} or a descendant — stale box, re-clustering, or an overlay on top of the pin`,
      );
      await page.waitForTimeout(300);
      continue;
    }

    try {
      await page.touchscreen.tap(x, y);
      return id;
    } catch (err) {
      lastError = err;
      await page.waitForTimeout(300);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('tapMarkerViaTouchscreen: exhausted retries');
}

/**
 * Splits any remaining leaflet.markercluster bubbles (the library's own
 * well-tested unclustering affordance) until at least `minDistinctMarkers`
 * independent `property-marker` pins are present, or no more clusters remain
 * to split.
 */
async function unclusterMarkers(page: Page, minDistinctMarkers: number): Promise<string[]> {
  const clusterBubble = page.getByRole('button', { name: /homes? in this cluster/i }).first();

  for (let attempt = 0; attempt < 8; attempt++) {
    const ids = await visibleMarkerListingIds(page);
    if (ids.length >= minDistinctMarkers) return ids;

    if (!(await clusterBubble.isVisible().catch(() => false))) {
      // No more clusters to split and still not enough independent markers.
      break;
    }
    await clusterBubble.click();
    await page.waitForTimeout(1500);
  }

  return visibleMarkerListingIds(page);
}

/** The sheet's own displayed identity text — price + bedrooms + area label, whichever are present. Used to prove a marker swap actually changed the displayed listing, without depending on `data-selected` (see module doc). */
async function sheetIdentityText(page: Page): Promise<string> {
  const sheet = page.getByTestId('mobile-listing-preview-sheet');
  const parts = await Promise.all(
    [
      'mobile-listing-preview-price',
      'mobile-listing-preview-price-band',
      'mobile-listing-preview-bedrooms',
      'mobile-listing-preview-area-label',
    ].map((testId) => sheet.getByTestId(testId).textContent().catch(() => '')),
  );
  return parts.join('|');
}

test.describe('@integration-ui #2149 — mobile school-first marker tap opens the preview sheet', () => {
  test.use({ viewport: MOBILE_VIEWPORT, hasTouch: true, isMobile: true });

  /** Shared setup: load the repro URL, enter mobile Map mode, wait for markers to attach and the network to settle. Returns the currently-visible marker ids (>= 2). */
  async function setUpMapWithMarkers(page: Page): Promise<string[]> {
    await stubSchoolFirstData(page);
    await page.goto(REPRO_URL);
    await page.waitForLoadState('domcontentloaded');
    await dismissConsentBannerIfPresent(page);

    const before = schoolAndRadiusParams(page);
    expect(before.schoolId, 'schoolId must be present on initial load').toBe(SCHOOL_ID);
    expect(before.radiusKm, 'radiusKm must be present on initial load').toBe(RADIUS_KM);

    // School-first defaults to the list surface on mobile — enter Map mode via
    // the same universal control-bar-map-trigger every other mobile map spec uses.
    const mapTrigger = page.getByTestId('control-bar-map-trigger');
    await expect(mapTrigger).toBeVisible({ timeout: 15_000 });
    await mapTrigger.click();
    // Established pattern (e.g. issue-2089-marker-swap-fixture.spec.ts,
    // issue-1956-pr5-s5-mobile-listing-preview.spec.ts): confirm the mobile
    // Map overlay actually mounted before looking for markers.
    await expect(page.getByTestId('mobile-map-close-list-button')).toBeVisible({ timeout: 10_000 });

    // Real live-data markers can take a beat to attach after the map-mode
    // transition; poll rather than a single snapshot.
    await expect
      .poll(async () => (await visibleMarkerListingIds(page)).length, {
        message: '#2149: property markers must attach after entering Map mode',
        timeout: 15_000,
      })
      .toBeGreaterThanOrEqual(1);

    // This school's 7-within-3km live listings mostly render as independent
    // pins already, but split any remaining clusters until 2 are present.
    const ids = await unclusterMarkers(page, 2);
    expect(ids.length, '#2149: need at least 2 distinct property markers near the seeded school after unclustering').toBeGreaterThanOrEqual(2);

    // Live-verified necessary: this live data's map keeps fetching/settling
    // for a few seconds after the first markers attach (e.g. the wider-than-
    // radius city inventory arriving); interacting before that settles has
    // live-verified to silently drop a tap (the click lands, nothing throws,
    // no state changes). Let the network settle before interacting.
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    return ids;
  }

  test('tap marker A opens the info sheet with real listing content; schoolId/radiusKm survive the tap', async ({ page }) => {
    await setUpMapWithMarkers(page);

    const sheet = page.getByTestId('mobile-listing-preview-sheet');
    const idA = await tapMarkerViaTouchscreen(page);
    await expect(sheet, '#2149: the info sheet must open on a real touchscreen.tap on a school-first marker').toBeVisible({
      timeout: 10_000,
    });
    const identityA = await sheetIdentityText(page);
    expect(identityA.trim(), 'the sheet must show real listing content, not an empty preview').not.toBe('|||');
    expect(idA).toBeTruthy();

    const afterA = schoolAndRadiusParams(page);
    expect(afterA.schoolId, 'schoolId must survive the marker tap').toBe(SCHOOL_ID);
    expect(afterA.radiusKm, 'radiusKm must survive the marker tap').toBe(RADIUS_KM);
  });

  /**
   * NOT part of the #2149 fix under test — kept as its own test so a defect
   * here never masks the core fix's PASS above (see that test) nor gets
   * silently dropped from coverage.
   */
  test('tap marker B while the sheet is open updates it to B without requiring a prior dismiss', async ({ page }) => {
    const ids = await setUpMapWithMarkers(page);

    const sheet = page.getByTestId('mobile-listing-preview-sheet');
    const idA = await tapMarkerViaTouchscreen(page);
    await expect(sheet, 'precondition: marker A must open the sheet').toBeVisible({ timeout: 10_000 });
    const identityA = await sheetIdentityText(page);

    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const idB = await tapMarkerViaTouchscreen(page, [idA]);
    expect(idB, 'sanity: the second tap must have hit a different marker than the first').not.toBe(idA);
    expect(ids.length).toBeGreaterThanOrEqual(2);

    await expect(sheet, 'the sheet must remain open across the marker swap, never dismissed').toBeVisible({
      timeout: 5_000,
    });
    await expect
      .poll(() => sheetIdentityText(page), {
        message: "the sheet content must update to marker B's listing, not stay on marker A's",
        timeout: 10_000,
      })
      .not.toBe(identityA);

    // PR-review AC4: the swap must not have perturbed the school-first URL
    // contract, and the mobile sheet must remain the sole mobile info
    // surface (no desktop popover rendering alongside it).
    const afterB = schoolAndRadiusParams(page);
    expect(afterB.schoolId, 'schoolId must be unchanged after the marker-B tap').toBe(SCHOOL_ID);
    expect(afterB.radiusKm, 'radiusKm must be unchanged after the marker-B tap').toBe(RADIUS_KM);
    await expect(
      page.getByTestId('marker-popover-card'),
      'the desktop popover must never render alongside the mobile sheet',
    ).toHaveCount(0);
  });
});

test.describe('@integration-ui #2149 — desktop regression: popover unchanged, no mobile double-render', () => {
  test('desktop marker tap still opens the popover (DiscoverMapMarkerPopover), and the mobile sheet never mounts', async ({
    page,
  }) => {
    await stubSchoolFirstData(page);
    await page.goto(REPRO_URL);
    await page.waitForLoadState('domcontentloaded');
    await dismissConsentBannerIfPresent(page);

    await expect
      .poll(async () => (await visibleMarkerListingIds(page)).length, {
        message: '#2149 desktop: property markers must attach',
        timeout: 15_000,
      })
      .toBeGreaterThanOrEqual(1);

    const ids = await unclusterMarkers(page, 1);
    expect(ids.length, '#2149 desktop: need at least 1 property marker near the seeded school').toBeGreaterThanOrEqual(1);

    await clickAnyMarker(page);

    const popover = page.getByTestId('marker-popover-card');
    await expect(popover, 'desktop must still show the marker popover for school-first').toBeVisible({
      timeout: 10_000,
    });

    // #1956 PR-5 invariant, re-asserted here in the school-first context this
    // fix touches: the two surfaces must never render simultaneously.
    await expect(page.getByTestId('mobile-listing-preview-sheet')).toHaveCount(0);
  });
});
