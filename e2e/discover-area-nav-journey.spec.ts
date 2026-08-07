/**
 * E-4: Discover area-nav journey — URL state, back/forward, bookmarked-URL fidelity
 *
 * Covers issue #914 journeys that extend beyond the AC12/AC13/AC14 bookmark
 * tests already in discover-url-state.spec.ts:
 *
 *   Journey 1 — Area marker click → history PUSH → browser Back → browser Forward
 *   Journey 2 — Four bookmarked URLs opened in fresh pages (viewport + panel fidelity)
 *   Journey 3 — Panel Back from bookmarked area URL: atomic clear + ViewportWatcher repopulation
 *   Journey 4 — City switch resets area + viewport; browser Back restores full prior state
 *
 * Anonymous flow throughout — no auth fixtures.
 * Run: bash scripts/run-e2e-local.sh --project=full e2e/discover-area-nav-journey.spec.ts
 */

import { test, expect } from '@playwright/test';

// ── Constants ──────────────────────────────────────────────────────────────

const MOCK_AREA_KEY = 'IN|KA|Udupi|Manipal';
const ENCODED_AREA_KEY = encodeURIComponent(MOCK_AREA_KEY); // IN%7CKA%7CUdupi%7CManipal
const MOCK_LISTING_ID = 'nav-journey-listing-abc123';

// Threshold constant — mirrors AREA_LAYER_MAX_ZOOM in the application code.
// Area ring markers are visible when map zoom ≤ this value.
const AREA_LAYER_MAX_ZOOM = 12;

// Explicit bookmarked viewport — zoomed in to area level
const AREA_LAT = '13.34090';
const AREA_LON = '74.74210';
const AREA_ZOOM = '14'; // > AREA_LAYER_MAX_ZOOM → area rings not visible

// City-level viewport (explicit, but still in city overview band)
const CITY_LAT = '13.34090';
const CITY_LON = '74.74210';
const CITY_ZOOM = '11'; // ≤ AREA_LAYER_MAX_ZOOM → area rings visible

// ── Fixture data ───────────────────────────────────────────────────────────

const MOCK_AREAS_RESPONSE = {
  city: 'udupi',
  areas: [
    {
      areaKey: MOCK_AREA_KEY,
      name: 'Manipal',
      geoCenterLat: 13.3525,
      geoCenterLon: 74.7925,
      listingCount90d: 5,
      trendDirection: 'stable',
    },
  ],
};

const MOCK_KUNDAPUR_AREAS_RESPONSE = {
  city: 'kundapur',
  areas: [
    {
      areaKey: 'IN|KA|Udupi|Kundapur',
      name: 'Kundapur Town',
      geoCenterLat: 13.628,
      geoCenterLon: 74.69,
      listingCount90d: 2,
      trendDirection: 'stable',
    },
  ],
};

const MOCK_CITY_LISTINGS_RESPONSE = {
  city: 'udupi',
  limitPerArea: 5,
  areas: [
    {
      areaKey: MOCK_AREA_KEY,
      areaName: 'Manipal',
      listings: [
        {
          id: MOCK_LISTING_ID,
          pricePaise: 250000000,
          propertyType: 'apartment',
          locality: 'Manipal',
          primaryImageUrl: null,
          listingPurpose: 'sale',
        },
      ],
    },
  ],
};

// ── Helper ─────────────────────────────────────────────────────────────────

async function mockDiscoverApis(page: import('@playwright/test').Page) {
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/discover/areas**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        route.request().url().includes('kundapur')
          ? MOCK_KUNDAPUR_AREAS_RESPONSE
          : MOCK_AREAS_RESPONSE,
      ),
    }),
  );

  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/discover/cities/**/listings**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_CITY_LISTINGS_RESPONSE),
    }),
  );
}

// Selector for area ring marker wrappers (set by className: 'area-marker' in AreaMarkerLayer.tsx)
const AREA_MARKER = '.leaflet-marker-icon.area-marker';

// ── Journey 1: Click → Back → Forward ─────────────────────────────────────

test.describe('@integration-ui Journey 1 — area marker click → back → forward', () => {
  test('clicking area marker pushes areaKey; Back removes it; Forward restores it', async ({
    page,
  }) => {
    await mockDiscoverApis(page);
    // Issue #2088 item 3 — a bare `/discover?city=...` now defaults `journey`
    // to `area-first` (state/url/area.ts), which skips past this test's
    // subject: the journey-SELECTION guided-entry state (`journey-card-
    // area-first` + the LEGACY `.area-marker` ring markers, both of which
    // only render when NO journey has been chosen yet — see MapDiscovery.tsx's
    // `showAreasNavigationJourney = nav.journey === 'area-first'` gate and
    // discoverPanelState.ts's `derivePanelContent`). An explicit `scope=`
    // param is the one thing that suppresses the new default.
    await page.goto('/discover?city=udupi&scope=');
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/[?&]scope=(&|$)/);

    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel).toBeVisible({ timeout: 10_000 });

    // ── Step 1: City overview — area ring markers visible ──────────────────
    // Wait for area markers from mocked /api/discover/areas (className: 'area-marker')
    await expect(page.locator(AREA_MARKER).first()).toBeVisible({ timeout: 12_000 });
    await expect(rightPanel.getByText('Find properties your way')).toBeVisible({ timeout: 8_000 });
    await expect(rightPanel.getByTestId('journey-card-area-first')).toBeVisible();

    // ── Step 2: Click the area ring marker ────────────────────────────────
    // force: true — Leaflet inner card content may intercept the hit-test
    await page.locator(AREA_MARKER).first().click({ force: true });

    // URL must gain ?areaKey= (history PUSH from urlActions.selectArea)
    await expect(page).toHaveURL(new RegExp(`areaKey=${ENCODED_AREA_KEY.replace(/\|/g, '%7C')}`), {
      timeout: 8_000,
    });

    // Right panel transitions to area-selected state
    await expect(page.getByTestId('back-button')).toBeVisible({ timeout: 8_000 });

    // Area ring markers must no longer be visible (zoom > AREA_LAYER_MAX_ZOOM=12, areas=[] passed to AreaMarkerLayer)
    await expect(page.locator(AREA_MARKER)).toHaveCount(0, { timeout: 5_000 });

    // ── Step 3: Browser Back ──────────────────────────────────────────────
    await page.goBack();

    // URL loses areaKey; lat/lon/zoom (written by ViewportWatcher during zoom-in) also cleared
    await expect(page).toHaveURL(/\/discover/, { timeout: 8_000 });
    const urlAfterBack = new URL(page.url());
    expect(urlAfterBack.searchParams.has('areaKey'), 'areaKey must be absent after Back').toBe(
      false,
    );

    // Right panel returns to instructional state
    await expect(rightPanel.getByText('Find properties your way')).toBeVisible({ timeout: 8_000 });
    await expect(rightPanel.getByTestId('journey-card-area-first')).toBeVisible();

    // ── Step 4: Browser Forward ───────────────────────────────────────────
    await page.goForward();

    // URL restores areaKey (the pushed history entry)
    await expect(page).toHaveURL(/areaKey=/, { timeout: 8_000 });

    // Right panel shows area listing cards again
    await expect(page.getByTestId('listing-card').first()).toBeVisible({ timeout: 12_000 });
  });
});

// ── Journey 2: Bookmarked URL fidelity (4 scenarios) ──────────────────────

test.describe('Journey 2 — bookmarked URL fidelity', () => {
  // J2a: city-only URL → city overview state
  test('J2a: ?city=udupi → instructional panel, area ring markers visible', async ({ page }) => {
    await mockDiscoverApis(page);
    // Issue #2088 item 3 re-point — see Journey 1's comment above for the
    // full rationale. `scope=` suppresses the new area-first default so this
    // "no journey chosen yet" guided-entry state stays reachable.
    await page.goto('/discover?city=udupi&scope=');
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/[?&]scope=(&|$)/);

    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel).toBeVisible({ timeout: 10_000 });

    // Instructional state — no area selected
    await expect(rightPanel.getByText('Find properties your way')).toBeVisible({ timeout: 8_000 });
    await expect(rightPanel.getByTestId('journey-card-area-first')).toBeVisible();
    await expect(page.getByTestId('listing-card')).toHaveCount(0);

    // Area ring markers visible (zoom ≤ AREA_LAYER_MAX_ZOOM=12 at city default)
    await expect(page.locator(AREA_MARKER).first()).toBeVisible({ timeout: 12_000 });
  });

  // J2b: city + areaKey URL → area-selected state, right panel shows listings
  test('J2b: ?city=udupi&areaKey=... → right panel shows area listings, area markers not visible', async ({
    page,
  }) => {
    await mockDiscoverApis(page);
    await page.goto(`/discover?city=udupi&areaKey=${ENCODED_AREA_KEY}`);
    await page.waitForLoadState('domcontentloaded');

    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel).toBeVisible({ timeout: 10_000 });

    // Area auto-selected from URL → listing cards must appear (no user interaction)
    await expect(page.getByTestId('listing-card').first()).toBeVisible({ timeout: 12_000 });

    // Instructional state must be absent
    await expect(rightPanel.getByText('Select an area to explore')).toHaveCount(0);

    // Back button confirms area-selected mode
    await expect(page.getByTestId('back-button')).toBeVisible();

    // Area ring markers not visible at zoom > AREA_LAYER_MAX_ZOOM
    await expect(page.locator(AREA_MARKER)).toHaveCount(0, { timeout: 5_000 });
  });

  // J2c: city + explicit city-level viewport → city overview state, area markers visible
  test(`J2c: ?city=udupi&lat=${CITY_LAT}&lon=${CITY_LON}&zoom=${CITY_ZOOM} → city overview, area markers visible`, async ({
    page,
  }) => {
    await mockDiscoverApis(page);
    // Issue #2088 item 3 re-point — see Journey 1's comment above for the
    // full rationale. `scope=` suppresses the new area-first default so this
    // "no journey chosen yet" guided-entry state stays reachable.
    await page.goto(
      `/discover?city=udupi&lat=${CITY_LAT}&lon=${CITY_LON}&zoom=${CITY_ZOOM}&scope=`,
    );
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/[?&]scope=(&|$)/);

    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel).toBeVisible({ timeout: 10_000 });

    // Instructional state — no areaKey in URL
    await expect(rightPanel.getByText('Find properties your way')).toBeVisible({ timeout: 8_000 });
    await expect(rightPanel.getByTestId('journey-card-area-first')).toBeVisible();

    // zoom=11 ≤ AREA_LAYER_MAX_ZOOM=12 → area ring markers visible
    await expect(page.locator(AREA_MARKER).first()).toBeVisible({ timeout: 12_000 });

    // URL viewport params honoured — zoom param preserved
    const url = new URL(page.url());
    const zoom = parseInt(url.searchParams.get('zoom') ?? '0', 10);
    expect(zoom).toBeLessThanOrEqual(AREA_LAYER_MAX_ZOOM);
  });

  // J2d: city + area-level viewport + areaKey → area state, URL viewport wins (no override)
  test(`J2d: ?city=udupi&lat=...&zoom=${AREA_ZOOM}&areaKey=... → area listings, URL viewport honoured`, async ({
    page,
  }) => {
    await mockDiscoverApis(page);
    await page.goto(
      `/discover?city=udupi&lat=${AREA_LAT}&lon=${AREA_LON}&zoom=${AREA_ZOOM}&areaKey=${ENCODED_AREA_KEY}`,
    );
    await page.waitForLoadState('domcontentloaded');

    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel).toBeVisible({ timeout: 10_000 });

    // Area auto-selected → listing cards visible
    await expect(page.getByTestId('listing-card').first()).toBeVisible({ timeout: 12_000 });

    // URL viewport params present and honoured (zoom=14 should remain, no AreaPanner override)
    const url = new URL(page.url());
    const zoom = parseInt(url.searchParams.get('zoom') ?? '0', 10);
    // Zoom should remain at the URL-specified level (14), not be overridden by AreaPanner
    expect(zoom).toBeGreaterThan(AREA_LAYER_MAX_ZOOM);
  });
});

// ── Journey 3: Panel Back + ViewportWatcher repopulation ──────────────────

test.describe('Journey 3 — panel Back from bookmarked area URL', () => {
  test('panel Back clears areaKey+viewport atomically; ViewportWatcher repopulates lat/lon/zoom', async ({
    page,
  }) => {
    await mockDiscoverApis(page);

    // Load a bookmarked URL with both areaKey and explicit viewport at zoom=14
    await page.goto(
      `/discover?city=udupi&areaKey=${ENCODED_AREA_KEY}&lat=${AREA_LAT}&lon=${AREA_LON}&zoom=${AREA_ZOOM}`,
    );
    await page.waitForLoadState('domcontentloaded');

    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel).toBeVisible({ timeout: 10_000 });

    // Area auto-selected — listing cards visible
    await expect(page.getByTestId('listing-card').first()).toBeVisible({ timeout: 12_000 });

    const backButton = page.getByTestId('back-button');
    await expect(backButton).toBeVisible();

    // ── Click panel Back ───────────────────────────────────────────────────
    await backButton.click();

    // (a) areaKey removed from URL (replace, not navigate(-1))
    await expect(page).toHaveURL(/^(?!.*areaKey).*$/, { timeout: 8_000 });

    // (a-ii) lat, lon, zoom cleared atomically (deselectArea removes viewport params)
    const urlAfterBack = new URL(page.url());
    expect(urlAfterBack.searchParams.has('lat'), 'lat must be absent immediately after Back').toBe(
      false,
    );
    expect(urlAfterBack.searchParams.has('lon'), 'lon must be absent immediately after Back').toBe(
      false,
    );
    expect(
      urlAfterBack.searchParams.has('zoom'),
      'zoom must be absent immediately after Back',
    ).toBe(false);

    // (b) Right panel shows instructional state
    await expect(rightPanel.getByText('Find properties your way')).toBeVisible({ timeout: 8_000 });
    await expect(rightPanel.getByTestId('journey-card-area-first')).toBeVisible();

    // (c) Still on /discover (deselectArea uses replace, not navigate(-1))
    await expect(page).toHaveURL(/\/discover/);

    // (d) ViewportWatcher repopulates lat/lon/zoom with city-level coords after map settles
    // The watcher fires within ~500ms of the map settling at city zoom.
    await page.waitForURL((url) => new URL(url).searchParams.has('lat'), { timeout: 3_000 });

    const urlAfterRepopulate = new URL(page.url());
    const repopulatedZoom = parseInt(urlAfterRepopulate.searchParams.get('zoom') ?? '0', 10);
    expect(
      repopulatedZoom,
      'repopulated zoom must be city-level (≤ AREA_LAYER_MAX_ZOOM)',
    ).toBeLessThanOrEqual(AREA_LAYER_MAX_ZOOM);
  });
});

// ── Journey 4: City switch resets area + viewport ─────────────────────────

test.describe('Journey 4 — city switch resets area; Back restores prior state', () => {
  test('switching city clears areaKey+viewport; browser Back restores Udupi + Manipal selection', async ({
    page,
  }) => {
    await mockDiscoverApis(page);

    // Load Udupi with area selected and zoomed viewport
    await page.goto(
      `/discover?city=udupi&areaKey=${ENCODED_AREA_KEY}&zoom=${AREA_ZOOM}`,
    );
    await page.waitForLoadState('domcontentloaded');

    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel).toBeVisible({ timeout: 10_000 });

    // Area auto-selected — listing cards visible
    await expect(page.getByTestId('listing-card').first()).toBeVisible({ timeout: 12_000 });

    // ── Switch city to Kundapur ───────────────────────────────────────────
    const cityTrigger = page.locator('[role="combobox"]').filter({ hasText: /udupi/i });
    await expect(cityTrigger).toBeVisible({ timeout: 8_000 });
    await cityTrigger.click();
    await page.getByRole('option', { name: 'Kundapur', exact: true }).click();

    // URL gains city=kundapur (history PUSH), loses areaKey and stale zoom
    await expect(page).toHaveURL(/city=kundapur/, { timeout: 8_000 });

    const urlAfterSwitch = new URL(page.url());
    expect(
      urlAfterSwitch.searchParams.has('areaKey'),
      'areaKey must be cleared after city switch',
    ).toBe(false);
    // zoom/lat/lon may repopulate for kundapur city level — just verify areaKey is gone

    // Right panel returns to instructional state for new city
    await expect(rightPanel.getByText('Find properties your way')).toBeVisible({ timeout: 8_000 });
    await expect(rightPanel.getByTestId('journey-card-area-first')).toBeVisible();

    // ── Browser Back: restores Udupi + Manipal selection ────────────────
    await page.goBack();

    // URL restores city=udupi + areaKey (the history entry before the city switch PUSH)
    await expect(page).toHaveURL(/city=udupi/, { timeout: 8_000 });
    await expect(page).toHaveURL(
      new RegExp(`areaKey=${ENCODED_AREA_KEY.replace(/\|/g, '%7C')}`),
      { timeout: 8_000 },
    );

    // Right panel shows Manipal listings again (areaKey re-resolved on popstate)
    await expect(page.getByTestId('listing-card').first()).toBeVisible({ timeout: 16_000 });
  });
});
