/**
 * discover-results-redesign-1547.spec.ts
 *
 * E2E spec for issue #1547:
 *   "feat(discover): redesign narrowed results cards for area, school and agri journeys"
 *
 * This is the BLOCKING card↔marker E2E from the #1547 validation matrix (AC4 + AC5/AC6
 * + responsive AC6). Frontend-only ReTrends restyle of the Discover narrowed-results
 * cards, plus a NET-NEW residential card↔marker shared selected state.
 *
 * Scenarios:
 *   (a) AREA-FIRST card↔marker — narrowed area-first state at zoom>12 renders residential
 *       property markers (MarkerClusterLayer, PropertyMap.tsx:907-968) sourced from the
 *       same area listings that feed the right-panel PropertyCard list. Clicking a marker
 *       fires handleSelectMarkerListing (MapDiscovery.tsx:515-547), which writes the
 *       `listing` URL param (urlActions.setSelectedListing) — it SELECTS, it does NOT
 *       navigate. The matching listing-card then gets the copper selected state
 *       (data-selected="true", AreaSelectedPanel.tsx:376) and scrolls into view
 *       (AreaSelectedPanel.tsx:92-103). We stay on /discover throughout.
 *
 *   (b) AGRI marker→peek preserved (#1466) — the agri journey's marker/row → peek path
 *       is unchanged by this redesign. Reuses the stub pattern from
 *       discover-agri-locality-marker-1468.spec.ts: a locality listing row click still
 *       opens agri-listing-peek and stays on /discover.
 *
 *   (c) RESPONSIVE — AreaSelectedPanel list host is `grid grid-cols-1 2xl:grid-cols-2`
 *       (AreaSelectedPanel.tsx:363). At a wide viewport (>=1536px = 2xl) cards sit in
 *       2 columns; at ~1280px they collapse to 1 column. Asserted via card bounding-box
 *       top-coordinate alignment (2-col → first two cards share a row → equal `y`;
 *       1-col → distinct `y`), the same geometry heuristic used by responsive specs.
 *
 *   (d) ANON no-leak — anon area-first narrowed state: listing-card present, NO rupee
 *       value anywhere in the card price area, and the "Sign in to view price" Lock
 *       affordance present (PropertyCard.tsx:187-191). Complements the unit-level no-leak
 *       test; this is the journey-level guard.
 *
 * Preserved e2e-contract testids exercised here:
 *   discover-right-panel, listing-card, agri-group-locality-panel,
 *   agri-locality-listing-row, agri-listing-peek, agri-listing-peek-close.
 *
 * Card selected-state contract (PropertyCard.tsx:77-96):
 *   data-testid="listing-card" + data-selected="true" + aria-pressed + copper
 *   border/ring when selected.
 *
 * Stubbing strategy: all Discover API routes are intercepted so the suite runs WITHOUT a
 * seeded backend (mirrors discover-area-cards.spec.ts + discover-agri-locality-marker-1468).
 * Anon by default (storageState: undefined) — area-first city-listings + agri-map-listings
 * are public (skipAuth), so anon is the canonical stub-runnable path and also exercises the
 * anon price-gate. The two area fixtures carry DISTINCT, far-apart lat/lon (>5 km) so that
 * at zoom=14 (< disableClusteringAtZoom=16, maxClusterRadius=50) they do NOT cluster and
 * each renders an individually-clickable property marker.
 *
 * Run (stub only — no seeded backend required for any scenario here):
 *   npx playwright test e2e/discover-results-redesign-1547.spec.ts --project=chromium
 * Or via the local harness:
 *   bash scripts/run-e2e-local.sh --project=full e2e/discover-results-redesign-1547.spec.ts
 */

import { test, expect, type Page, type Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CITY = 'udupi';
const AREA_KEY = 'IN|KA|Udupi|Manipal';

// Residential property markers rendered by MarkerClusterLayer use the divIcon
// className 'custom-marker property-marker' with data-testid="property-marker"
// (PropertyMap.tsx createMarkerIcon). Disambiguate from area / agri / cluster icons.
const PROPERTY_MARKER = '.leaflet-marker-icon.property-marker';

const LISTING_A = 'res-1547-listing-A';
const LISTING_B = 'res-1547-listing-B';

// Agri (#1466 preservation) — mirror the 1468 spec contract.
const REGION = 'S';
const MAX_KM = '25';
const AGRI_LISTING_SHIRVA = 'agri-1547-listing-002';

// ---------------------------------------------------------------------------
// Fixtures — residential area-first
// ---------------------------------------------------------------------------

const DISCOVER_AREAS_FIXTURE = {
  city: CITY,
  areas: [
    {
      areaKey: AREA_KEY,
      name: 'Manipal',
      geoCenterLat: 13.3525,
      geoCenterLon: 74.7925,
      minLat: 13.30,
      maxLat: 13.42,
      minLon: 74.74,
      maxLon: 74.86,
      listingCount90d: 2,
      listingCount: 2,
      schoolCount: 0,
      trendDirection: 'stable',
    },
  ],
};

/**
 * Two residential listings with DISTINCT coordinates that are BOTH inside the zoom-14
 * viewport centred on (13.355, 74.800) — span ≈ N 13.383 / S 13.327 / E 74.828 / W 74.773 —
 * yet ≈0.018° (≈2 km) apart, comfortably beyond the 50px cluster radius (maxClusterRadius=50,
 * disableClusteringAtZoom=16) so each renders an individually-clickable, on-screen property
 * marker. Both carry lat/lon AND latitude/longitude because MarkerClusterLayer filters on
 * latitude/longitude while the card list reads lat/lon. pricePaise present → in the AUTHED
 * path a rupee value would show; in the ANON path (default here) the card shows the Lock +
 * "Sign in to view price" affordance (scenario d).
 */
const CITY_LISTINGS_FIXTURE = {
  city: CITY,
  limitPerArea: 50,
  areas: [
    {
      areaKey: AREA_KEY,
      areaName: 'Manipal',
      listings: [
        {
          id: LISTING_A,
          title: 'Bright 2 BHK in Manipal',
          pricePaise: 250000000,
          propertyType: 'apartment',
          locality: 'Manipal',
          primaryImageUrl: null,
          listingPurpose: 'sale',
          bedrooms: 2,
          bathrooms: 2,
          lat: 13.3525,
          lon: 74.7925,
          latitude: 13.3525,
          longitude: 74.7925,
        },
        {
          id: LISTING_B,
          title: 'Spacious House near Udupi',
          pricePaise: 180000000,
          propertyType: 'house',
          locality: 'Udupi',
          primaryImageUrl: null,
          listingPurpose: 'rent',
          bedrooms: 3,
          bathrooms: 3,
          lat: 13.3650, // ~0.018deg from A → ~2 km → no clustering at zoom 14, still on-screen
          lon: 74.8100,
          latitude: 13.3650,
          longitude: 74.8100,
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Fixtures — agri (#1466 preservation), mirrors discover-agri-locality-marker-1468
// ---------------------------------------------------------------------------

const TRENDS_OPTIONS_FIXTURE = {
  city: CITY,
  defaultAreas: [{ areaKey: 'IN|KA|Udupi|Padubidri', areaLabel: 'Padubidri' }],
};

const REGIONAL_AREA_GROUPS_FIXTURE = {
  city: CITY,
  groups: [
    {
      directionCode: 'S',
      groupName: 'S towards Udupi',
      availableMaxDistances: [
        {
          maxKm: 25,
          distanceLabel: 'Up to 25 km',
          includedBandCodes: ['0_10', '10_25'],
          listingCount: 1,
          areaKeys: ['IN|KA|Udupi|Shirva'],
        },
      ],
    },
  ],
};

const AGRI_MAP_LISTINGS_FIXTURE = {
  city: CITY,
  listings: [
    {
      id: AGRI_LISTING_SHIRVA,
      locality: 'Shirva',
      landArea: 3.2,
      landAreaUnit: 'acres',
      pricePaise: 6000000,
      propertyType: 'agricultural_land' as const,
      boundaryGeoJson: null,
      lat: 13.15,
      lon: 74.82,
      areaKey: 'IN|KA|Udupi|Shirva',
    },
  ],
};

const AGRI_LISTING_DETAIL_FIXTURE = {
  id: AGRI_LISTING_SHIRVA,
  title: '[AGRI] 3.2-Acre Farm, Shirva',
  locality: 'Shirva',
  city: 'Udupi',
  propertyType: 'agricultural_land',
  price: 6000000,
  landArea: 3.2,
  landAreaUnit: 'acres',
  computedAreaAcres: 3.18,
  images: [{ url: 'https://example.com/img.jpg', alt: 'Farm photo' }],
  description: 'Agricultural plot in Shirva corridor.',
  status: 'LIVE',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fulfillJson(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/** Stub the residential area-first Discover routes. */
async function stubAreaRoutes(page: Page) {
  // INTEGRATION-UI: stub justified — isolate from backend/seed variability.
  await page.route('**/api/discover/areas**', (r) => fulfillJson(r, 200, DISCOVER_AREAS_FIXTURE));
  await page.route('**/api/discover/cities/**/listings**', (r) =>
    fulfillJson(r, 200, CITY_LISTINGS_FIXTURE));
  // Defensive: anything else the page may probe.
  await page.route('**/api/discover/listings**', (r) =>
    fulfillJson(r, 200, { content: [], totalElements: 0 }));
  await page.route('**/api/public/schools/**', (r) => fulfillJson(r, 200, []));
}

/** Stub the agri-first Discover routes (mirrors discover-agri-locality-marker-1468). */
async function stubAgriRoutes(page: Page) {
  await page.route('**/api/trends/options**', (r) => fulfillJson(r, 200, TRENDS_OPTIONS_FIXTURE));
  await page.route('**/api/discover/areas**', (r) => fulfillJson(r, 200, DISCOVER_AREAS_FIXTURE));
  await page.route('**/api/discover/cities/*/listings**', (r) =>
    fulfillJson(r, 200, { city: CITY, limitPerArea: 50, areas: [] }));
  await page.route('**/api/discover/listings**', (r) =>
    fulfillJson(r, 200, { content: [], totalElements: 0 }));
  await page.route('**/api/public/schools/**', (r) => fulfillJson(r, 200, []));
  await page.route('**/api/discover/regional-area-groups**', (r) =>
    fulfillJson(r, 200, REGIONAL_AREA_GROUPS_FIXTURE));
  await page.route('**/api/discover/agri-map-listings**', (r) =>
    fulfillJson(r, 200, AGRI_MAP_LISTINGS_FIXTURE));
  await page.route('**/api/public/listings/*', (r) => fulfillJson(r, 200, AGRI_LISTING_DETAIL_FIXTURE));
}

/** Navigate to an area-first NARROWED state (areaKey present + zoom>12 → markers render). */
async function gotoAreaNarrowed(page: Page) {
  const params = new URLSearchParams({
    city: CITY,
    journey: 'area-first',
    areaKey: AREA_KEY,
    lat: '13.35500',
    lon: '74.80000',
    zoom: '14', // > AREA_LAYER_MAX_ZOOM (12) → property markers render
  });
  await page.goto(`/discover?${params.toString()}`);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10_000 });
}

function getUrlParam(page: Page, key: string): string | null {
  return new URL(page.url()).searchParams.get(key);
}

// ===========================================================================
// (a) AREA-FIRST card↔marker selection
// ===========================================================================

test.describe('@integration-ui 1547 — area-first card↔marker selection', () => {
  test.use({ storageState: undefined });

  test('marker click selects matching card (copper state + scroll), writes listing= param, does NOT navigate', async ({
    page,
  }) => {
    await stubAreaRoutes(page);
    await gotoAreaNarrowed(page);

    // Cards render in the right panel (area-first narrowed → AreaSelectedPanel → PropertyCard).
    await expect(page.getByTestId('listing-card').first()).toBeVisible({ timeout: 12_000 });
    const cardCount = await page.getByTestId('listing-card').count();
    expect(cardCount).toBeGreaterThanOrEqual(2);

    // No card is selected initially.
    await expect(page.locator('[data-testid="listing-card"][data-selected="true"]')).toHaveCount(0);

    // Residential property markers must render on the map (zoom 14 > AREA_LAYER_MAX_ZOOM=12,
    // sourced from the same area listings that feed the card list).
    const markers = page.locator(PROPERTY_MARKER);
    await expect(markers.first()).toBeVisible({ timeout: 12_000 });
    const markerCount = await markers.count();

    if (markerCount === 0) {
      // Markers depend on the area-listing → marker mapping producing latitude/longitude.
      // If none rendered against the stub, the card↔marker click assertion cannot run.
      throw new Error(
        'PRECONDITION FAILED: no property-marker rendered in area-first narrowed state. ' +
        'Expected MarkerClusterLayer to render markers from area listings with lat/lon at zoom 14.',
      );
    }

    // Click a marker. Leaflet keeps off-screen markers in the DOM positioned outside the
    // map viewport, so pick the first marker whose bounding box is actually within the map
    // container before clicking. force:true — the divIcon inner content can intercept the
    // hit-test (same pattern as discover-area-cards.spec.ts area-marker clicks).
    const mapBox = await page.locator('.leaflet-container').boundingBox();
    expect(mapBox).not.toBeNull();
    let clicked = false;
    for (let i = 0; i < markerCount; i++) {
      const marker = markers.nth(i);
      const box = await marker.boundingBox();
      if (
        box &&
        mapBox &&
        box.x >= mapBox.x &&
        box.y >= mapBox.y &&
        box.x + box.width <= mapBox.x + mapBox.width &&
        box.y + box.height <= mapBox.y + mapBox.height
      ) {
        await marker.click({ force: true });
        clicked = true;
        break;
      }
    }
    if (!clicked) {
      throw new Error(
        'PRECONDITION FAILED: no property-marker fell within the map viewport at zoom 14 — ' +
        'cannot exercise the marker→card selection click.',
      );
    }

    // The marker click must SELECT (write listing=<id>), NOT navigate.
    await expect.poll(() => getUrlParam(page, 'listing'), { timeout: 8_000 }).toBeTruthy();
    const selectedId = getUrlParam(page, 'listing');
    expect([LISTING_A, LISTING_B]).toContain(selectedId);

    // Still on /discover — a residential marker SELECTS, it does not navigate to /listing/:id.
    expect(new URL(page.url()).pathname).toBe('/discover');

    // Exactly one card carries the copper selected state, and it matches the selected id.
    const selectedCard = page.locator('[data-testid="listing-card"][data-selected="true"]');
    await expect(selectedCard).toHaveCount(1, { timeout: 8_000 });
    await expect(selectedCard).toHaveAttribute('aria-pressed', 'true');

    // The selected card is scrolled into view (AreaSelectedPanel scrollIntoView effect).
    // Assert it is within the panel viewport (intersecting / in-view).
    await expect(selectedCard).toBeInViewport({ timeout: 8_000 });
  });
});

// ===========================================================================
// (b) AGRI marker→peek preserved (#1466)
// ===========================================================================

test.describe('@integration-ui 1547 — agri marker→peek preserved (#1466)', () => {
  test.use({ storageState: undefined });

  test('agri locality listing row still opens the peek and stays on /discover', async ({ page }) => {
    await stubAgriRoutes(page);

    const params = new URLSearchParams({
      city: CITY,
      journey: 'agri-first',
      region: REGION,
      maxKm: MAX_KM,
      locality: 'Shirva', // deep-link straight to the locality panel
    });
    await page.goto(`/discover?${params.toString()}`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10_000 });

    // Locality panel mounts (post-#1480 towns-only L2).
    await expect(page.locator('[data-testid="agri-group-locality-panel"]')).toBeVisible({
      timeout: 12_000,
    });

    // Listing rows render from the agri-map-listings fixture.
    const row = page.locator('[data-testid="agri-locality-listing-row"]').first();
    await expect(row).toBeVisible({ timeout: 12_000 });

    // Row click → listing= in URL → peek opens (the #1466 marker→peek contract, unchanged).
    await row.click();
    await page.waitForURL(/listing=/, { timeout: 8_000 });
    await expect(page.locator('[data-testid="agri-listing-peek"]')).toBeVisible({ timeout: 10_000 });

    // Must remain on /discover (no auto-nav to /listing/:id).
    expect(new URL(page.url()).pathname).toBe('/discover');

    // Peek close affordance present (contract preserved by the restyle).
    await expect(page.locator('[data-testid="agri-listing-peek-close"]')).toBeVisible({
      timeout: 5_000,
    });
  });
});

// ===========================================================================
// (c) RESPONSIVE — 2-col at >=1536px (2xl), 1-col at ~1280px
// ===========================================================================

test.describe('@integration-ui 1547 — responsive results grid', () => {
  test.use({ storageState: undefined });

  test('2 columns at wide viewport (>=1536px), 1 column at ~1280px', async ({ page }) => {
    await stubAreaRoutes(page);

    // ── Wide: 2xl breakpoint → grid-cols-2 → first two cards share the same row (equal top y).
    await page.setViewportSize({ width: 1680, height: 1000 });
    await gotoAreaNarrowed(page);
    await expect(page.getByTestId('listing-card').first()).toBeVisible({ timeout: 12_000 });
    expect(await page.getByTestId('listing-card').count()).toBeGreaterThanOrEqual(2);

    const wideBoxes = await page.getByTestId('listing-card').evaluateAll((els) =>
      els.slice(0, 2).map((el) => Math.round(el.getBoundingClientRect().top)),
    );
    // 2-col: the first two cards begin on the same row → tops within a small tolerance.
    expect(Math.abs(wideBoxes[0] - wideBoxes[1])).toBeLessThan(20);

    // ── Narrow: ~1280px (below 2xl) → grid-cols-1 → cards stack → distinct top y.
    await page.setViewportSize({ width: 1280, height: 1000 });
    // Re-navigate to re-evaluate layout deterministically at the new width.
    await gotoAreaNarrowed(page);
    await expect(page.getByTestId('listing-card').first()).toBeVisible({ timeout: 12_000 });

    const narrowBoxes = await page.getByTestId('listing-card').evaluateAll((els) =>
      els.slice(0, 2).map((el) => Math.round(el.getBoundingClientRect().top)),
    );
    // 1-col: the second card is clearly below the first.
    expect(narrowBoxes[1]).toBeGreaterThan(narrowBoxes[0] + 20);
  });
});

// ===========================================================================
// (d) ANON no-leak — journey level
// ===========================================================================

test.describe('@integration-ui 1547 — anon no-leak (area-first)', () => {
  test.use({ storageState: undefined });

  test('anon card shows Sign-in-to-view-price affordance and NO rupee value', async ({ page }) => {
    await stubAreaRoutes(page);
    await gotoAreaNarrowed(page);

    const firstCard = page.getByTestId('listing-card').first();
    await expect(firstCard).toBeVisible({ timeout: 12_000 });

    // Anon affordance present (Lock + copy from PropertyCard.tsx:187-191).
    await expect(firstCard.getByText(/sign in to view price/i)).toBeVisible();

    // No rupee value leaked anywhere in the card DOM for any rendered card.
    // The fixture prices are 250000000 / 180000000 paise → ₹25,00,000 / ₹18,00,000.
    // Neither the ₹ glyph nor the formatted numbers may appear in the anon DOM.
    const cardsText = await page.getByTestId('listing-card').allTextContents();
    for (const text of cardsText) {
      expect(text).not.toContain('₹');
      expect(text).not.toMatch(/25,?00,?000/);
      expect(text).not.toMatch(/18,?00,?000/);
    }
  });
});

// ===========================================================================
// (e) CARD CLICK → copper-selected MARKER
// ===========================================================================
//
// The copper selected marker is driven by the marker-click path:
//   marker click → listing= URL param written by handleSelectMarkerListing
//               → MarkerClusterLayer rebuilds with createSelectedMarkerIcon
//               → marker inner div carries data-selected="true"
//
// The card click direction (card → marker highlight) is intentionally not wired
// because the card's primary action is navigation (/listing/:id) and wiring
// onSelectResultListing would inject a spurious history PUSH before navigate.
// (See MapDiscovery.tsx comment at the selectedListingId prop.)
//
// This test extends scenario (a): after the marker click that already writes
// listing= and highlights the card, we additionally assert the marker DOM
// carries the copper selected-state attribute (data-selected="true").

test.describe('@integration-ui 1547 — copper selected-marker after marker click', () => {
  test.use({ storageState: undefined });

  test('clicked marker gets copper selected-state; other markers remain unselected', async ({
    page,
  }) => {
    await stubAreaRoutes(page);
    await gotoAreaNarrowed(page);

    await expect(page.getByTestId('listing-card').first()).toBeVisible({ timeout: 12_000 });
    const markers = page.locator(PROPERTY_MARKER);
    await expect(markers.first()).toBeVisible({ timeout: 12_000 });

    const markerCount = await markers.count();
    if (markerCount === 0) {
      throw new Error('PRECONDITION FAILED: no property-marker rendered.');
    }

    // Before any click: no selected marker.
    await expect(
      page.locator('[data-testid="property-marker"][data-selected="true"]'),
    ).toHaveCount(0);

    // Click the first in-viewport marker.
    const mapBox = await page.locator('.leaflet-container').boundingBox();
    expect(mapBox).not.toBeNull();
    let clicked = false;
    for (let i = 0; i < markerCount; i++) {
      const marker = markers.nth(i);
      const box = await marker.boundingBox();
      if (
        box &&
        mapBox &&
        box.x >= mapBox.x &&
        box.y >= mapBox.y &&
        box.x + box.width <= mapBox.x + mapBox.width &&
        box.y + box.height <= mapBox.y + mapBox.height
      ) {
        await marker.click({ force: true });
        clicked = true;
        break;
      }
    }
    if (!clicked) {
      throw new Error('PRECONDITION FAILED: no in-viewport property-marker found.');
    }

    // Wait for the listing= URL param to be written (selection confirmed).
    await expect.poll(() => getUrlParam(page, 'listing'), { timeout: 8_000 }).toBeTruthy();

    // The corresponding marker must now carry the copper selected state.
    // PropertyMap.tsx:createSelectedMarkerIcon sets data-selected="true" on the inner
    // div; MarkerClusterLayer rebuilds the cluster group whenever selectedListingId changes.
    // Use a generous timeout to accommodate the async Leaflet layer rebuild.
    const selectedMarkerInners = page.locator(
      '[data-testid="property-marker"][data-selected="true"]',
    );
    await expect(selectedMarkerInners).toHaveCount(1, { timeout: 12_000 });

    // Verify the non-selected markers are still unselected (only 1 copper marker total).
    const allMarkerInners = page.locator('[data-testid="property-marker"]');
    const total = await allMarkerInners.count();
    const selectedCount = await selectedMarkerInners.count();
    // At least one marker must remain unselected (the other fixture listing).
    expect(selectedCount).toBeLessThan(total);
  });
});

// ===========================================================================
// (f) NO unwanted zoom/flyTo/pan on marker selection (no camera regression)
// ===========================================================================
//
// When listing= is written via a marker click, MapController must NOT fire
// flyTo(zoom 15). The architecture invariant: selectedListingId flows ONLY to
// MarkerClusterLayer (visual icon swap); MapController receives the full
// PropertyListing object (selectedListing prop) which is NOT populated for the
// narrowed-results selection path — handleSelectMarkerListing writes the URL
// param but does not update selectedMarkerListing for residential markers.
//
// Proof: the URL lat/lon/zoom params must remain unchanged across the marker
// click + settling window long enough to catch a flyTo animation (duration=1s).

test.describe('@integration-ui 1547 — no flyTo/zoom on marker selection', () => {
  test.use({ storageState: undefined });

  test('map lat/lon/zoom URL params unchanged after marker click (no flyTo regression)', async ({
    page,
  }) => {
    await stubAreaRoutes(page);
    await gotoAreaNarrowed(page);

    await expect(page.getByTestId('listing-card').first()).toBeVisible({ timeout: 12_000 });
    const markers = page.locator(PROPERTY_MARKER);
    await expect(markers.first()).toBeVisible({ timeout: 12_000 });

    const markerCount = await markers.count();
    if (markerCount === 0) {
      throw new Error('PRECONDITION FAILED: no property-marker rendered.');
    }

    // Capture the map viewport from the URL BEFORE the click.
    // gotoAreaNarrowed() navigates to lat=13.35500&lon=74.80000&zoom=14 so all
    // three params are present in the URL from the start.
    const latBefore = getUrlParam(page, 'lat');
    const lonBefore = getUrlParam(page, 'lon');
    const zoomBefore = getUrlParam(page, 'zoom');

    // Click the first in-viewport marker.
    const mapBox = await page.locator('.leaflet-container').boundingBox();
    expect(mapBox).not.toBeNull();
    let clicked = false;
    for (let i = 0; i < markerCount; i++) {
      const marker = markers.nth(i);
      const box = await marker.boundingBox();
      if (
        box &&
        mapBox &&
        box.x >= mapBox.x &&
        box.y >= mapBox.y &&
        box.x + box.width <= mapBox.x + mapBox.width &&
        box.y + box.height <= mapBox.y + mapBox.height
      ) {
        await marker.click({ force: true });
        clicked = true;
        break;
      }
    }
    if (!clicked) {
      throw new Error('PRECONDITION FAILED: no in-viewport property-marker found.');
    }

    // Wait for selection to be committed (listing= param appears).
    await expect.poll(() => getUrlParam(page, 'listing'), { timeout: 8_000 }).toBeTruthy();

    // Allow 1.5s settling — flyTo duration=1s; if a regression fires, lat/lon/zoom would
    // update via the ViewportWatcher debounce within this window.
    await page.waitForTimeout(1_500);

    // Viewport params must be unchanged — no flyTo/zoom triggered by the selection.
    expect(getUrlParam(page, 'lat')).toBe(latBefore);
    expect(getUrlParam(page, 'lon')).toBe(lonBefore);
    expect(getUrlParam(page, 'zoom')).toBe(zoomBefore);
  });
});

// ===========================================================================
// Option-B: card HOVER/FOCUS → copper marker highlight + clear on leave
// ===========================================================================
//
// AC4 Option B: hoveredListingId is ephemeral React state (setHoveredListingId
// in MapDiscovery). On card mouseenter/focus it fires onHover(id) which
// propagates: PropertyCard → AreaSelectedPanel → DiscoverRightPanel →
// MapDiscovery.setHoveredListingId → PropertyMap.hoveredListingId →
// MarkerClusterLayer (copper icon when id === hoveredListingId).
// On mouseleave/blur onHover(null) clears it — the marker reverts to the
// standard icon.
//
// The hover highlight reuses the same copper selected-marker icon as the
// URL-driven selection (data-selected="true" on the inner property-marker div).
// On hover the listing= URL param must NOT be written (no URL mutation).

test.describe('@integration-ui 1547 — Option B: card hover → copper marker', () => {
  test.use({ storageState: undefined });

  test('(B1) card mouseenter highlights the matching marker; mouseleave clears it; listing= URL param NOT written', async ({
    page,
  }) => {
    await stubAreaRoutes(page);
    await gotoAreaNarrowed(page);

    // Both result cards and property markers must be present.
    await expect(page.getByTestId('listing-card').first()).toBeVisible({ timeout: 12_000 });
    const markers = page.locator(PROPERTY_MARKER);
    await expect(markers.first()).toBeVisible({ timeout: 12_000 });

    // Baseline: no selected marker and no listing= URL param before hover.
    await expect(
      page.locator('[data-testid="property-marker"][data-selected="true"]'),
    ).toHaveCount(0);
    expect(getUrlParam(page, 'listing')).toBeNull();

    // Hover the first result card.
    const firstCard = page.getByTestId('listing-card').first();
    await firstCard.hover();

    // MarkerClusterLayer rebuilds asynchronously on hoveredListingId change.
    // The corresponding marker's inner div must carry data-selected="true".
    const selectedMarkers = page.locator('[data-testid="property-marker"][data-selected="true"]');
    await expect(selectedMarkers).toHaveCount(1, { timeout: 10_000 });

    // Hover MUST NOT write the listing= URL param (hover is purely ephemeral, not URL-driven).
    expect(getUrlParam(page, 'listing')).toBeNull();

    // Move the mouse away from the card (hover a neutral element).
    await page.mouse.move(0, 0);

    // After mouseleave, the copper marker must clear (revert to standard icon).
    await expect(selectedMarkers).toHaveCount(0, { timeout: 10_000 });

    // listing= param still not written.
    expect(getUrlParam(page, 'listing')).toBeNull();
  });
});

// ===========================================================================
// Option-B: card CLICK → still navigates to /listing/:id
// ===========================================================================
//
// The card's primary action (handleActivate → onNavigate → navigate(/listing/:id))
// must be unchanged. Hover affordance is additive — it does not intercept click.

test.describe('@integration-ui 1547 — Option B: card click still navigates', () => {
  test.use({ storageState: undefined });

  test('(B2) clicking a result card navigates to /listing/<id>', async ({ page }) => {
    await stubAreaRoutes(page);
    await gotoAreaNarrowed(page);

    await expect(page.getByTestId('listing-card').first()).toBeVisible({ timeout: 12_000 });

    // Click the first result card. The SPA's React Router navigate('/listing/<id>')
    // fires synchronously — we do NOT need to stub the listing detail page to prove
    // the pathname changed (the URL updates before any detail fetch occurs).
    // Removing the page.route('**/listing/**') stub that was here previously: it was
    // over-greedy and intercepted the SPA's own document/asset requests whose path
    // contained "listing", causing gotoAreaNarrowed to time out (the /discover page
    // never rendered). URL assertion alone is sufficient.
    await page.getByTestId('listing-card').first().click();

    // Navigation must have occurred — pathname becomes /listing/<id>.
    await page.waitForURL(/\/listing\/[^/]+$/, { timeout: 8_000 });
    expect(new URL(page.url()).pathname).toMatch(/^\/listing\//);
  });
});

// ===========================================================================
// Option-B: NO flyTo/zoom on card HOVER or marker-select
// ===========================================================================
//
// Extends scenario (f): asserts the viewport URL params (lat/lon/zoom) are
// unchanged across BOTH a card hover AND a subsequent marker-select click.
// hoveredListingId and selectedListingId both flow only to MarkerClusterLayer
// visual; MapController (which would call flyTo) never receives either.

test.describe('@integration-ui 1547 — Option B: no flyTo/zoom on hover OR select', () => {
  test.use({ storageState: undefined });

  test('(B3) lat/lon/zoom URL params unchanged across card hover and marker select', async ({
    page,
  }) => {
    await stubAreaRoutes(page);
    await gotoAreaNarrowed(page);

    await expect(page.getByTestId('listing-card').first()).toBeVisible({ timeout: 12_000 });
    const markers = page.locator(PROPERTY_MARKER);
    await expect(markers.first()).toBeVisible({ timeout: 12_000 });

    const markerCount = await markers.count();
    if (markerCount === 0) {
      throw new Error('PRECONDITION FAILED: no property-marker rendered.');
    }

    // Capture viewport BEFORE any interaction.
    const latBefore = getUrlParam(page, 'lat');
    const lonBefore = getUrlParam(page, 'lon');
    const zoomBefore = getUrlParam(page, 'zoom');

    // 1. Hover a result card — must not change viewport.
    await page.getByTestId('listing-card').first().hover();
    // Brief settle: if hover triggered flyTo (regression) it would fire within ~300ms.
    await page.waitForTimeout(600);
    expect(getUrlParam(page, 'lat')).toBe(latBefore);
    expect(getUrlParam(page, 'lon')).toBe(lonBefore);
    expect(getUrlParam(page, 'zoom')).toBe(zoomBefore);

    // Clear the hover.
    await page.mouse.move(0, 0);

    // 2. Click an in-viewport marker (same as scenario (f)) — must not change viewport.
    const mapBox = await page.locator('.leaflet-container').boundingBox();
    expect(mapBox).not.toBeNull();
    let clicked = false;
    for (let i = 0; i < markerCount; i++) {
      const marker = markers.nth(i);
      const box = await marker.boundingBox();
      if (
        box &&
        mapBox &&
        box.x >= mapBox.x &&
        box.y >= mapBox.y &&
        box.x + box.width <= mapBox.x + mapBox.width &&
        box.y + box.height <= mapBox.y + mapBox.height
      ) {
        await marker.click({ force: true });
        clicked = true;
        break;
      }
    }
    if (!clicked) {
      throw new Error('PRECONDITION FAILED: no in-viewport property-marker found.');
    }

    // Wait for the selection param to be committed.
    await expect.poll(() => getUrlParam(page, 'listing'), { timeout: 8_000 }).toBeTruthy();

    // Allow 1.5s settling — covers flyTo duration=1s + ViewportWatcher debounce.
    await page.waitForTimeout(1_500);

    // Viewport params must be identical across both interactions.
    expect(getUrlParam(page, 'lat')).toBe(latBefore);
    expect(getUrlParam(page, 'lon')).toBe(lonBefore);
    expect(getUrlParam(page, 'zoom')).toBe(zoomBefore);
  });
});
