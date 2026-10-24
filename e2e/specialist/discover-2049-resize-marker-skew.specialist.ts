/**
 * discover-2049-resize-marker-skew.spec.ts
 *
 * E2E diagnostic spec for issue #2049 defect 1 — PropertyMap never calls
 * Leaflet's `map.invalidateSize()`. Confirmed (search_text over
 * src/components/map/PropertyMap.tsx): zero occurrences. The only production
 * occurrence of invalidateSize in the whole app is
 * src/components/broker/AddressPicker.tsx:68, for an unrelated display:none
 * case — it does not touch the Discover map.
 *
 * Leaflet caches the map container's pixel `_size` internally the first time
 * the map initialises (and on any explicit invalidateSize call). All later
 * lat/lng -> pixel projections for markers are computed against that cached
 * size, NOT the container's live DOM box. If the container's actual CSS box
 * changes WHILE THE MAP STAYS MOUNTED (e.g. the viewport is resized, or a
 * sibling panel changes width), Leaflet keeps projecting marker positions
 * using the stale size — so a marker's rendered pixel position drifts away
 * from where it geographically belongs, and its clickable hit-area no longer
 * matches its visible position (or the marker moves outside the container's
 * now-different clipped box altogether).
 *
 * A PRIOR diagnostic attempt measured zero offset and did not reproduce this.
 * That attempt only exercised camera calls (fitBounds/flyTo/setView) after
 * mount — those change the map's lat/lng CENTER, not the container's pixel
 * SIZE, so they cannot invalidate a stale `_size` cache.
 *
 * THIS SPEC'S OWN FIRST ATTEMPT (kept in history via the diagnostic run log,
 * not in this file) tried the seemingly-obvious next axis — resizing the
 * browser viewport with `page.setViewportSize()` while the map stayed
 * mounted — and it ALSO failed to reproduce. Root cause of that miss:
 * Leaflet (confirmed v1.9.4 here, no `trackResize={false}` override on
 * PropertyMap.tsx's <MapContainer>) installs its OWN `window.on('resize', …)`
 * listener that calls `invalidateSize()` automatically on any *native browser
 * window resize* — completely independent of app code. `page.setViewportSize()`
 * fires a real 'resize' event, so Leaflet silently self-heals before this
 * spec ever gets to measure, masking the exact defect it was trying to prove.
 * (Recon also confirmed: on desktop, the map's flex-basis (`lg:w-1/2` on the
 * `mapContainerRef` div in DiscoverMapCanvas.tsx) only ever changes via that
 * same `lg:flex-row` Tailwind breakpoint, which likewise requires an actual
 * viewport resize to engage — so there is no discovered desktop UI control
 * that resizes the map's box WITHOUT a window resize event. The mobile
 * List/Map shell (MapDiscovery.tsx's `mobileMapOpen` full-screen overlay
 * toggle) is state-driven, not viewport-driven, but DiscoverMapMount.tsx
 * documents it as a REAL UNMOUNT/remount on the List<->Map transition, not a
 * resize-while-mounted case — so it doesn't isolate this axis either.)
 *
 * To isolate the axis the issue actually describes — "the container's box
 * changes while the map stays mounted", independent of any window resize
 * event — this spec instead mutates the map's own flex-item wrapper box
 * directly via `page.evaluate` (found by walking the DOM from the
 * `discover-right-panel` sibling — see `shrinkMapContainerWithoutWindowResize`
 * below). This is a browser/DOM-layer harness manipulation (like
 * `setViewportSize`, not an app-code change) that reproduces the exact
 * described precondition without relying on any specific in-app control,
 * since recon found none on desktop and the one that exists on mobile
 * remounts rather than resizes.
 *
 * Fixture: single area ("Whitefield"), single listing, centred exactly on
 * the goto lat/lon so the marker starts dead-center in the map viewport —
 * this makes any post-resize skew unambiguous (a marker that's supposed to
 * still read as "roughly centered" but is instead found near/past an edge,
 * or outside the container's own bounding box entirely).
 *
 * Journey: area-first residential (mirrors the stub shape in
 * e2e/discover-1939-listing-peek-url-restore.spec.ts — page.route-stubbed,
 * no backend dependency).
 *
 * Assertions (both the control arm and the post-resize arm use REAL
 * expect() calls, not just measurement logging):
 *   CONTROL (must PASS) — before any resize, the marker's bounding box is
 *     fully inside the map container's bounding box, AND
 *     document.elementFromPoint() at the marker's own visual center resolves
 *     to the marker element (or a descendant of it). This proves the app and
 *     the stub fixture are healthy BEFORE the resize, so that the post-resize
 *     assertion's outcome is attributable to the resize, not to a broken app.
 *   POST-RESIZE (the actual repro) — after directly shrinking the map's own
 *     flex-item box (~50%-of-1440px down to 380px) via
 *     shrinkMapContainerWithoutWindowResize, with the map still mounted (no
 *     reload/navigation, no window resize event), the SAME two checks are
 *     repeated. On unfixed code (no invalidateSize call anywhere in
 *     PropertyMap.tsx) this is expected to FAIL: the marker's hit area drifts
 *     outside the map container's (now narrower) box, and/or elementFromPoint
 *     at its expected center resolves to a sibling element (e.g. the right
 *     panel) instead of the marker.
 *
 * Run:
 *   npx playwright test \
 *     e2e/specialist/discover-2049-resize-marker-skew.specialist.ts
 */

import { test, expect } from './support/specialist-test';
import type { Page, Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// Fixture constants
// ---------------------------------------------------------------------------

const CITY = 'bangalore';
const AREA_KEY = 'IN|KA|Bengaluru|Whitefield';
const NODE_KEY = `a:${AREA_KEY}`;
const GROUP_ID = 'tech-corridor';
const GROUP_NAME = 'Tech Corridor';
const LISTING_ID = 'c3f1a9e0-2049-4a1b-9c7d-2049205920491';
const LAT = '12.97';
const LON = '77.75';
const ZOOM = '15';
const LISTING_TITLE = 'Resize Skew 3BHK Apartment';

const DISCOVER_AREAS_FIXTURE = {
  city: CITY,
  areas: [
    {
      areaKey: AREA_KEY,
      name: 'Whitefield',
      geoCenterLat: 12.97,
      geoCenterLon: 77.75,
      minLat: 12.94,
      maxLat: 13.0,
      minLon: 77.71,
      maxLon: 77.79,
      listingCount90d: 1,
      listingCount: 1,
      schoolCount: 0,
      trendDirection: 'stable',
    },
  ],
};

const AREA_GROUPS_FIXTURE = {
  city: CITY,
  groups: [
    {
      slug: GROUP_ID,
      name: GROUP_NAME,
      subtitle: '1 locality',
      regionLabel: 'East',
      displayOrder: 1,
      areaKeys: [AREA_KEY],
      focusLat: 12.97,
      focusLon: 77.75,
      minLat: 12.94,
      minLon: 77.71,
      maxLat: 13.0,
      maxLon: 77.79,
    },
  ],
};

const CITY_LISTINGS_FIXTURE = {
  city: CITY,
  limitPerArea: 50,
  areas: [
    {
      areaKey: AREA_KEY,
      areaName: 'Whitefield',
      listings: [
        {
          id: LISTING_ID,
          title: LISTING_TITLE,
          pricePaise: 750000000,
          priceBand: '₹70L–80L',
          propertyType: 'apartment',
          locality: 'Whitefield',
          primaryImageUrl: null,
          listingPurpose: 'sale',
          bedrooms: 3,
          bathrooms: 3,
          // Centred exactly on the goto lat/lon — the marker should start
          // dead-center of the map viewport.
          lat: 12.97,
          lon: 77.75,
          latitude: 12.97,
          longitude: 77.75,
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/** Stub every Discover route this journey touches (mirrors e2e/discover-1939-*'s stubAll). */
async function stubAll(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem('discover_telemetry_consent', 'granted');
  });
  // INTEGRATION-UI: stubs isolate from backend/seed variability.
  await page.route('**/api/discover/areas**', (r) => fulfillJson(r, 200, DISCOVER_AREAS_FIXTURE));
  await page.route('**/api/discover/area-groups**', (r) => fulfillJson(r, 200, AREA_GROUPS_FIXTURE));
  await page.route('**/api/discover/regional-area-groups**', (r) => fulfillJson(r, 200, { groups: [] }));
  await page.route('**/api/discover/cities/*/navigation/resolve**', (r) =>
    fulfillJson(r, 200, {
      requested: NODE_KEY,
      resolution: 'EXACT',
      revisionId: 1,
      node: {
        nodeKey: NODE_KEY,
        nodeType: 'AREA',
        displayLabel: 'Whitefield',
        depth: 1,
        regionKey: null,
        ancestry: [],
        nextLevelType: 'LISTINGS',
        children: [],
        revisionId: 1,
        bounds: {
          centreLat: 12.97,
          centreLon: 77.75,
          minLat: 12.94,
          minLon: 77.71,
          maxLat: 13.0,
          maxLon: 77.79,
        },
        descendantAreaKeys: null,
        areaKey: AREA_KEY,
      },
    }),
  );
  await page.route('**/api/discover/cities/*/navigation/*/counts**', (r) =>
    fulfillJson(r, 200, {
      nodeKey: NODE_KEY,
      count: 1,
      schoolCount: 0,
      areaCounts: { [AREA_KEY]: 1 },
      areaSchoolCounts: { [AREA_KEY]: 0 },
      children: [],
      revisionId: 1,
    }),
  );
  await page.route('**/api/discover/cities/*/listings**', (r) => fulfillJson(r, 200, CITY_LISTINGS_FIXTURE));
  await page.route('**/api/discover/listings**', (r) => fulfillJson(r, 200, EMPTY_LISTINGS_PAGE));
  await page.route('**/api/discover/markers**', (r) => fulfillJson(r, 200, []));
  await page.route('**/api/discover/agri-map-listings**', (r) => fulfillJson(r, 200, { listings: [] }));
  await page.route('**/api/trends/options**', (r) =>
    fulfillJson(r, 200, { city: CITY, defaultAreas: [{ areaKey: AREA_KEY, areaLabel: 'Whitefield' }] }),
  );
  await page.route('**/api/public/schools/popular**', (r) => fulfillJson(r, 200, []));
  await page.route('**/api/public/schools/search**', (r) => fulfillJson(r, 200, []));
  await page.route('**/api/public/schools/by-area**', (r) => fulfillJson(r, 200, []));
}

/** Deep-link URL for the area-first journey, centred exactly on the listing. */
function repoUrl(): string {
  const params = new URLSearchParams({
    city: CITY,
    journey: 'area-first',
    groupId: GROUP_ID,
    lat: LAT,
    lon: LON,
    zoom: ZOOM,
    areaKey: AREA_KEY,
    node: NODE_KEY,
  });
  return `/discover?${params.toString()}`;
}

function mapContainerLocator(page: Page) {
  return page.locator('.leaflet-container');
}

/**
 * Shrinks the map's own flex-item box (the `mapContainerRef` div in
 * DiscoverMapCanvas.tsx, className `lg:w-1/2 h-64 lg:h-full relative
 * order-1 lg:order-1`) directly via inline style, WITHOUT changing the
 * browser viewport and therefore WITHOUT firing a native `window.resize`
 * event. This is the only way found (see this file's header comment) to
 * change the map container's live CSS box while isolating the exact axis
 * the issue describes — Leaflet 1.9.4's own built-in window-resize listener
 * would otherwise auto-call invalidateSize() and self-heal before this test
 * could ever observe the defect.
 *
 * DOM path: the `mapContainerRef` div has no stable testid/class hook of its
 * own, but it is a guaranteed DOM sibling of `[data-testid="discover-right-panel"]`
 * (both rendered directly inside MapDiscovery.tsx's
 * `"min-h-0 flex-1 flex flex-col lg:flex-row relative"` row — see
 * MapDiscovery.tsx ~L1899-2033). The immediate previous sibling is the
 * `contents`-display wrapper div (invisible to the flex layout on desktop);
 * its own first element child is the `mapContainerRef` div itself, which the
 * `display:contents` wrapper promotes to a first-class flex item.
 */
async function shrinkMapContainerWithoutWindowResize(
  page: Page,
  widthPx: number,
): Promise<void> {
  const applied = await page.evaluate((width) => {
    const rightPanel = document.querySelector(
      '[data-testid="discover-right-panel"], [data-testid="discover-areas-journey-panel-shell"]',
    );
    const wrapper = rightPanel?.previousElementSibling as HTMLElement | null;
    const mapHalf = wrapper?.firstElementChild as HTMLElement | null;
    if (!mapHalf) return false;
    mapHalf.style.setProperty('width', `${width}px`, 'important');
    mapHalf.style.setProperty('max-width', `${width}px`, 'important');
    mapHalf.style.setProperty('flex', `0 0 ${width}px`, 'important');
    return true;
  }, widthPx);
  if (!applied) {
    throw new Error(
      'shrinkMapContainerWithoutWindowResize: could not locate the map half wrapper via ' +
        'discover-right-panel\'s previous sibling — DOM structure may have changed.',
    );
  }
}

/** The visible marker pill element (data-testid="property-marker"), for the single fixture listing. */
function markerLocator(page: Page) {
  return page
    .locator(`[data-listing-id="${LISTING_ID}"] [data-testid="property-marker"]`)
    .first();
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Measures the marker pill against the map container, both:
 *   (a) whether the marker's bounding box is fully contained within the map
 *       container's bounding box, and
 *   (b) whether document.elementFromPoint() at the marker's own visual
 *       center resolves to the marker element itself (or a descendant of
 *       it) — i.e. whether the marker's clickable hit-area still matches
 *       its visible position.
 * Returns raw measurements so the caller can log offsets AND assert on them.
 */
async function measureMarkerAlignment(
  page: Page,
): Promise<{
  mapBox: Rect;
  markerBox: Rect;
  markerCenter: { x: number; y: number };
  insideContainer: boolean;
  offsetRightPx: number;
  offsetBottomPx: number;
  elementFromPointIsMarker: boolean;
  elementFromPointTag: string | null;
}> {
  const mapBox = await mapContainerLocator(page).boundingBox();
  const markerBox = await markerLocator(page).boundingBox();
  if (!mapBox || !markerBox) {
    throw new Error(
      `measureMarkerAlignment: missing bounding box (mapBox=${JSON.stringify(
        mapBox,
      )}, markerBox=${JSON.stringify(markerBox)})`,
    );
  }

  const markerCenter = {
    x: markerBox.x + markerBox.width / 2,
    y: markerBox.y + markerBox.height / 2,
  };

  const insideContainer =
    markerBox.x >= mapBox.x &&
    markerBox.y >= mapBox.y &&
    markerBox.x + markerBox.width <= mapBox.x + mapBox.width &&
    markerBox.y + markerBox.height <= mapBox.y + mapBox.height;

  // How far the marker's right/bottom edge sits past the container's own
  // right/bottom edge (positive = spilling out; negative/zero = comfortably inside).
  const offsetRightPx = markerBox.x + markerBox.width - (mapBox.x + mapBox.width);
  const offsetBottomPx = markerBox.y + markerBox.height - (mapBox.y + mapBox.height);

  const elementFromPointResult = await page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      if (!el) return { isMarker: false, tag: null as string | null };
      const markerEl = el.closest('[data-testid="property-marker"]');
      return {
        isMarker: markerEl !== null,
        tag: el.tagName + (el.getAttribute('data-testid') ? `[data-testid=${el.getAttribute('data-testid')}]` : ''),
      };
    },
    markerCenter,
  );

  return {
    mapBox,
    markerBox,
    markerCenter,
    insideContainer,
    offsetRightPx,
    offsetBottomPx,
    elementFromPointIsMarker: elementFromPointResult.isMarker,
    elementFromPointTag: elementFromPointResult.tag,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('@integration-ui Issue #2049 (defect 1) — resize-while-mounted marker/hit-area skew', () => {
  test.use({ storageState: undefined, viewport: { width: 1440, height: 900 } });

  test('marker hit-area stays aligned with its visible position after the map container resizes', async ({
    page,
  }) => {
    await stubAll(page);

    await page.goto(repoUrl());
    await page.waitForLoadState('networkidle');

    await expect(mapContainerLocator(page)).toBeVisible({ timeout: 15_000 });
    await expect(markerLocator(page)).toBeVisible({ timeout: 20_000 });
    // Give the initial camera settle (setView/fitBounds from the URL lat/lon/zoom)
    // a moment to fully finish before the control-arm measurement.
    await page.waitForTimeout(300);

    // ------------------------------------------------------------------
    // CONTROL ARM (mandatory) — proves the app + fixture are healthy BEFORE
    // any resize. Must PASS regardless of the #2049 defect.
    // ------------------------------------------------------------------
    const before = await measureMarkerAlignment(page);
    console.log('[#2049] control (pre-resize) measurement:', JSON.stringify(before));

    expect(
      before.insideContainer,
      `Control arm: marker box ${JSON.stringify(before.markerBox)} must start inside map container ${JSON.stringify(
        before.mapBox,
      )}`,
    ).toBe(true);
    expect(
      before.elementFromPointIsMarker,
      `Control arm: elementFromPoint at marker center ${JSON.stringify(
        before.markerCenter,
      )} must resolve to the marker (got: ${before.elementFromPointTag})`,
    ).toBe(true);

    // ------------------------------------------------------------------
    // RESIZE — shrink the map's own flex-item box directly (large change:
    // from its natural ~50%-of-1440px width down to 380px) while the map
    // instance stays mounted (no page.reload/goto, no viewport change, so
    // NO native window 'resize' event fires — see
    // shrinkMapContainerWithoutWindowResize's JSDoc for why this specific
    // mechanism, rather than page.setViewportSize, is required to isolate
    // the defect). There is no invalidateSize call anywhere in
    // PropertyMap.tsx, so Leaflet will NOT self-correct here.
    // ------------------------------------------------------------------
    await shrinkMapContainerWithoutWindowResize(page, 380);
    // Let CSS layout/reflow settle. Purely for reflow — there is no
    // (nonexistent) map recovery to wait for.
    await page.waitForTimeout(500);

    // ------------------------------------------------------------------
    // POST-RESIZE ARM — the actual #2049 defect-1 repro.
    // ------------------------------------------------------------------
    const after = await measureMarkerAlignment(page);
    console.log('[#2049] post-resize measurement:', JSON.stringify(after));
    console.log(
      `[#2049] offset right=${after.offsetRightPx}px bottom=${after.offsetBottomPx}px ` +
        `(positive = marker spills outside the container's own box)`,
    );

    expect(
      after.insideContainer,
      `Post-resize: marker box ${JSON.stringify(after.markerBox)} must remain inside its own map ` +
        `container's box ${JSON.stringify(after.mapBox)} (offsetRight=${after.offsetRightPx}px, ` +
        `offsetBottom=${after.offsetBottomPx}px) — Leaflet's cached _size was never invalidated ` +
        `after the container resized.`,
    ).toBe(true);
    expect(
      after.elementFromPointIsMarker,
      `Post-resize: elementFromPoint at the marker's own projected center ` +
        `${JSON.stringify(after.markerCenter)} must resolve to the marker itself, not a sibling ` +
        `element (got: ${after.elementFromPointTag}) — the marker's clickable hit-area has drifted ` +
        `away from its visible/expected position.`,
    ).toBe(true);
  });
});
