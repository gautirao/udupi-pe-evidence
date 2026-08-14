/**
 * discover-agri-locality-marker-1468.spec.ts
 *
 * E2E spec for issue #1468:
 * "E2E hardening for towns-only Level-2 drill-down" (post-#1480)
 *
 * Updated for Issue #2151 PR C (C-F1/C-F2/C-F4) — the destination identity model changed from
 * free-text `locality=<name>` to the canonical `destKey=<areas.area_key>`, and Level-2 town rows
 * moved from client-side grouping over the whole-corridor agri-map-listings fetch to server-computed
 * buckets from GET /api/discover/agri-destinations. See the inline #2151 comments below for what
 * changed per AC. AC5b is new (legacy locality= migration, exactly-once).
 *
 * ACs verified:
 *   AC1  — AgriGroupSelectedPanel shows agri-group-locality-btn rows sourced from agri-destinations
 *          (town groups, NOT old listing rows); displayName rendered, never the raw areaKey
 *   AC2  — clicking a town row (Shirva) pushes destKey=<real areaKey> to URL (not free text);
 *          AgriGroupLocalityPanel mounts; the Level-3 fetch carries that same real areaKey
 *   AC3  — AgriGroupLocalityPanel shows filtered agri-locality-listing-row entries for Shirva;
 *          header renders the resolved displayName, not the raw areaKey
 *   AC4  — agri-locality-close-btn clears destKey= from URL (REPLACE); AgriGroupSelectedPanel returns
 *   AC5  — deep-link cold-load ?region=S&maxKm=25&destKey=<Shirva areaKey> restores AgriGroupLocalityPanel
 *   AC5b — legacy ?locality=<free text> cold-load migrates to destKey= exactly once; never resurrected
 *   AC6  — listing click in locality panel opens peek; peek close removes listing= only, destKey= survives
 *   AC7  — anon fixture (pricePaise: null + propertyType: agricultural_land): peek shows price-signin, not price
 *   AC8  — area-first regression: agri-group-locality-panel and agri-listing-peek have count=0
 *   AC9  — [REAL_SEED only] South/25km on live seeded stack has Padubidri + Shirva town rows
 *
 * Panel state machine (post-#1480, identity updated by #2151 PR C):
 *   no region                              → CorridorLandingPanel (corridor-landing-list)
 *   region + maxKm                         → AgriGroupSelectedPanel (agri-group-selected-panel)
 *                                            └─ shows agri-group-locality-btn rows from agri-destinations
 *                                            └─ OLD 'agri-group-listing-row' testid REMOVED by #1480
 *   region + maxKm + destKey               → AgriGroupLocalityPanel (agri-group-locality-panel)
 *                                            └─ shows agri-locality-listing-row for that destination
 *   region + maxKm + destKey + listing     → AgriGroupListingPeek (agri-listing-peek)
 *
 * URL contract (Issue #2151 PR C — destKey replaces locality/town as canonical):
 *   destKey=<areaKey>  → PUSH via setLocality; REPLACE via clearLocality (removes destKey= only)
 *   locality=/town=    → legacy-only; migrated to destKey= exactly once on cold load, then deleted
 *   listing=<uuid>     → PUSH; clearSelectedListing REPLACE (removes listing= only, destKey= preserved)
 *   clearRegionAndMaxKm → PUSH (removes region+maxKm+destKey+listing)
 *
 * Sibling specs (do NOT duplicate their coverage):
 *   e2e/discover-agri-direction-first-1448.spec.ts  — corridor cards, one-click atomicity, chip switch,
 *                                                      sector overlay, peek open/close at corridor level,
 *                                                      Back from selected-region. Also covers AC12 anon
 *                                                      price-signin at corridor level (NOT locality level).
 *   e2e/discover-agri-overlay-peek-journey-1431.spec.ts — sector overlay lifecycle, Back/Forward at peek.
 *   e2e/discover-agri-grouped-journey-1412.spec.ts  — regional groups API contract, network spy.
 *   e2e/agri-destination-identity-2151.spec.ts — cross-cutting identity coverage added by Issue #2151
 *                                                 PR C: row<->marker identity, viewport parity, browser
 *                                                 Back/Forward, list<->map convergence.
 *
 * REAL_SEED setup (AC9):
 *   1. bash scripts/restore-test-fixture.sh       (pg-test-fixture:5434)
 *   2. bash scripts/seed-agricultural-listings.sh (udupi: seed Padubidri + Shirva agri listings)
 *   3. backend on :8085 pointed at local fixture
 *   4. frontend dev server on :5174
 *
 * Run commands:
 *   Stub only:
 *     npx playwright test e2e/discover-agri-locality-marker-1468.spec.ts --project=chromium
 *   With real seed (AC9):
 *     REAL_SEED=1 bash scripts/run-e2e-local.sh --project=full \
 *       e2e/discover-agri-locality-marker-1468.spec.ts
 */

import { test, expect, type Page, type Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

/** Set REAL_SEED=1 with a live seeded stack to enable AC9. */
const REAL_SEED = Boolean(process.env.REAL_SEED);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CITY = 'udupi';
const REGION = 'S';
const MAX_KM = '25';
const LISTING_ID_SHIRVA = 'agri-1468-listing-002';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TRENDS_OPTIONS_FIXTURE = {
  city: CITY,
  defaultAreas: [{ areaKey: 'IN|KA|Udupi|Padubidri', areaLabel: 'Padubidri' }],
};

const DISCOVER_AREAS_FIXTURE = {
  city: CITY,
  areas: [{
    areaKey: 'IN|KA|Udupi|Padubidri',
    name: 'Padubidri',
    geoCenterLat: 13.09,
    geoCenterLon: 74.79,
    minLat: 13.07,
    maxLat: 13.11,
    minLon: 74.77,
    maxLon: 74.81,
    listingCount: 2,
    agriAcreage: 4.3,
    schoolCount: 0,
    trendDirection: 'stable',
  }],
};

const CITY_LISTINGS_FIXTURE = { city: CITY, limitPerArea: 50, areas: [] };

/**
 * South corridor, 25 km + 50 km tiers.
 * areaKeys reference both Padubidri and Shirva so the component groups them into 2 town rows.
 */
const REGIONAL_AREA_GROUPS_FIXTURE = {
  city: CITY,
  groups: [{
    directionCode: 'S',
    groupName: 'S towards Udupi',
    availableMaxDistances: [
      {
        maxKm: 25,
        distanceLabel: 'Up to 25 km',
        includedBandCodes: ['0_10', '10_25'],
        listingCount: 3,
        areaKeys: ['IN|KA|Udupi|Padubidri', 'IN|KA|Udupi|Shirva'],
      },
      {
        maxKm: 50,
        distanceLabel: 'Up to 50 km',
        includedBandCodes: ['0_10', '10_25', '25_50'],
        listingCount: 5,
        areaKeys: ['IN|KA|Udupi|Padubidri', 'IN|KA|Udupi|Shirva'],
      },
    ],
  }],
};

/**
 * 3 agri-map listings: 2 Padubidri + 1 Shirva.
 * This produces exactly 2 town rows in AgriGroupSelectedPanel (grouping by locality).
 * boundaryGeoJson: null isolates overlay path counting from polygon paths.
 *
 * FIXTURE PRECONDITION: DISTINCT non-null locality values (Padubidri + Shirva) are
 * required. Without multiple towns, grouping produces only 1 town row and AC1 count>=2 fails.
 */
/**
 * Issue #2151 PR C (C-F4) — server-computed destination buckets for the Level-2 panel.
 * AgriGroupSelectedPanel no longer client-groups the whole-corridor `agri-map-listings` fetch —
 * it renders `agri-group-locality-btn` rows straight from GET /api/discover/agri-destinations.
 * `areaKey` MUST be the real stable areas.area_key (never display text); `displayName` is what
 * the panel is allowed to render as visible text.
 */
const AREA_KEY_PADUBIDRI = 'IN|KA|Udupi|Padubidri';
const AREA_KEY_SHIRVA = 'IN|KA|Udupi|Shirva';

const AGRI_DESTINATIONS_FIXTURE = {
  city: CITY,
  destinations: [
    {
      areaKey: AREA_KEY_PADUBIDRI,
      displayName: 'Padubidri',
      distanceKm: 6.4,
      bearingDeg: 178,
      direction: REGION,
      parcelCount: 2,
      parcelAcreage: 4.3,
    },
    {
      areaKey: AREA_KEY_SHIRVA,
      displayName: 'Shirva',
      distanceKm: 18.9,
      bearingDeg: 182,
      direction: REGION,
      parcelCount: 1,
      parcelAcreage: 3.2,
    },
  ],
};

/**
 * Issue #2151 PR C (C-F2) — Level-3 (AgriGroupLocalityPanel) fetch is now scoped to exactly ONE
 * destination's canonical areaKey via the singular `areaKey` query param (legacy plural
 * `areaKeys` is hard-removed backend-side — 400 area_key_required_legacy_area_keys_param_removed).
 * This fixture is served for whichever single areaKey the currently-selected destination resolves
 * to; both Padubidri- and Shirva-shaped stubs are provided below and the route handler
 * (stubAgriMapListingsForDestKey) picks the right one from the request URL's `areaKey` param.
 */
const AGRI_MAP_LISTINGS_BY_AREA_KEY: Record<string, unknown> = {
  [AREA_KEY_PADUBIDRI]: {
    city: CITY,
    listings: [
      {
        id: 'agri-1468-listing-001',
        locality: 'Padubidri',
        landArea: 2.5,
        landAreaUnit: 'acres',
        pricePaise: 5000000,
        boundaryGeoJson: null,
        lat: 13.09,
        lon: 74.79,
        areaKey: AREA_KEY_PADUBIDRI,
      },
      {
        id: 'agri-1468-listing-003',
        locality: 'Padubidri',
        landArea: 1.8,
        landAreaUnit: 'acres',
        pricePaise: 3500000,
        boundaryGeoJson: null,
        lat: 13.08,
        lon: 74.78,
        areaKey: AREA_KEY_PADUBIDRI,
      },
    ],
  },
  [AREA_KEY_SHIRVA]: {
    city: CITY,
    listings: [
      {
        id: LISTING_ID_SHIRVA,
        locality: 'Shirva',
        landArea: 3.2,
        landAreaUnit: 'acres',
        pricePaise: 6000000,
        boundaryGeoJson: null,
        lat: 13.15,
        lon: 74.82,
        areaKey: AREA_KEY_SHIRVA,
      },
    ],
  },
};

/**
 * Anon fixture for AC7 — pricePaise: null triggers agri-listing-peek-price-signin affordance.
 * propertyType: 'agricultural_land' is required — component checks:
 *   isAgri = firstPaintData.propertyType === 'agricultural_land'
 *   showSignInForPrice = isAgri && !isAuthenticated && firstPaintData.pricePaise == null
 * Without propertyType, isAgri=false and the affordance never renders.
 * Keyed by areaKey (Issue #2151 PR C — Level-3 fetch is scoped to ONE areaKey at a time).
 */
const AGRI_MAP_LISTINGS_ANON_BY_AREA_KEY: Record<string, unknown> = {
  [AREA_KEY_SHIRVA]: {
    city: CITY,
    listings: [
      {
        id: LISTING_ID_SHIRVA,
        locality: 'Shirva',
        landArea: 3.2,
        landAreaUnit: 'acres',
        pricePaise: null,                           // explicit null → price-signin affordance
        propertyType: 'agricultural_land' as const, // required for isAgri guard in component
        boundaryGeoJson: null,
        lat: 13.15,
        lon: 74.82,
        areaKey: AREA_KEY_SHIRVA,
      },
    ],
  },
};

const AGRI_LISTING_DETAIL_FIXTURE = {
  id: LISTING_ID_SHIRVA,
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

/**
 * Stub all common Discover API routes.
 *
 * Issue #2151 PR C:
 *  - `/api/discover/agri-destinations` (Level-2 town rows) is stubbed with AGRI_DESTINATIONS_FIXTURE.
 *  - `/api/discover/agri-map-listings` (Level-3 single-destination fetch) is routed by the request's
 *    singular `areaKey` query param, NOT by a fixed body — this proves the frontend sends the
 *    destination's real areaKey (not free-text) and lets AC-level tests assert on the response for
 *    whichever destination was actually selected. A request with a missing/unknown areaKey gets an
 *    empty-listings body (mirrors the backend's real "unknown area_key" shape) rather than silently
 *    returning fixture data for the wrong destination.
 *
 * @param useAnonFixture  When true, serves the anon (pricePaise: null) shape for AC7.
 */
async function stubCommonRoutes(page: Page, useAnonFixture = false) {
  await page.route('**/api/trends/options**', (r) => fulfillJson(r, 200, TRENDS_OPTIONS_FIXTURE));
  await page.route('**/api/discover/areas**', (r) => fulfillJson(r, 200, DISCOVER_AREAS_FIXTURE));
  await page.route('**/api/discover/cities/*/listings**', (r) => fulfillJson(r, 200, CITY_LISTINGS_FIXTURE));
  await page.route('**/api/discover/listings**', (r) => fulfillJson(r, 200, { content: [], totalElements: 0 }));
  await page.route('**/api/public/schools/**', (r) => fulfillJson(r, 200, []));
  await page.route('**/api/discover/regional-area-groups**', (r) => fulfillJson(r, 200, REGIONAL_AREA_GROUPS_FIXTURE));
  await page.route('**/api/discover/agri-destinations**', (r) => fulfillJson(r, 200, AGRI_DESTINATIONS_FIXTURE));
  await page.route('**/api/discover/agri-map-listings**', (route) => {
    const url = new URL(route.request().url());
    // Hard regression guard: the legacy plural `areaKeys` param must never be sent — backend
    // hard-removed it (400 area_key_required_legacy_area_keys_param_removed, Issue #2151 PR C).
    if (url.searchParams.has('areaKeys')) {
      return fulfillJson(route, 400, { error: 'area_key_required_legacy_area_keys_param_removed' });
    }
    const areaKey = url.searchParams.get('areaKey') ?? '';
    const byKey = useAnonFixture ? AGRI_MAP_LISTINGS_ANON_BY_AREA_KEY : AGRI_MAP_LISTINGS_BY_AREA_KEY;
    const body = byKey[areaKey] ?? { city: CITY, listings: [] };
    return fulfillJson(route, 200, body);
  });
  await page.route('**/api/public/listings/*', (r) => fulfillJson(r, 200, AGRI_LISTING_DETAIL_FIXTURE));
}

/**
 * Navigate to agri-first Discover and wait for map + initial data load.
 * Stubs MUST be installed before calling this helper.
 * @param extraParams  Additional URL params (e.g. region, maxKm, destKey).
 */
async function navigateAgriFirst(
  page: Page,
  extraParams: Record<string, string> = {},
) {
  const params = new URLSearchParams({ city: CITY, journey: 'agri-first' });
  for (const [k, v] of Object.entries(extraParams)) params.set(k, v);
  await page.goto(`/discover?${params.toString()}`);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10_000 });
  // Wait for regional-area-groups to fire — catch to avoid stall if React Query already
  // cached it (e.g. when navigating with pre-set region+maxKm on the same page instance).
  await page
    .waitForRequest('**/api/discover/regional-area-groups**', { timeout: 12_000 })
    .catch((e: Error) => console.warn('[1468] regional-area-groups not requested:', e.message));
}

// ---------------------------------------------------------------------------
// Suite — STUBBED
// ---------------------------------------------------------------------------

test.describe('@integration-ui 1468 — locality-L2 + anon-gating — stubbed', () => {
  // Explicit anon — override any project-level storageState (e.g. user-auth.json from
  // global-setup) so that isAuthenticated=false in all components (required for AC7).
  test.use({ storageState: undefined });

  // ── AC1: AgriGroupSelectedPanel shows locality-btn rows sourced from agri-destinations ─

  test(
    'AC1: region+maxKm shows agri-group-locality-btn rows (2 towns) from agri-destinations (Issue #2151 PR C — server-computed, not client-grouped); displayName rendered, never raw areaKey',
    async ({ page }) => {
      await stubCommonRoutes(page);
      await navigateAgriFirst(page, { region: REGION, maxKm: MAX_KM });

      // AgriGroupSelectedPanel must be visible
      await expect(page.locator('[data-testid="agri-group-selected-panel"]')).toBeVisible({
        timeout: 10_000,
      });

      // Wait for town buttons to render from the agri-destinations fixture
      await expect(page.locator('[data-testid="agri-group-locality-btn"]').first()).toBeVisible({
        timeout: 12_000,
      });

      // Must have exactly 2 town rows (Padubidri + Shirva from AGRI_DESTINATIONS_FIXTURE)
      const localityBtns = page.locator('[data-testid="agri-group-locality-btn"]');
      const localityBtnCount = await localityBtns.count();
      if (localityBtnCount < 2) {
        throw new Error(
          `FIXTURE PRECONDITION FAILED: expected >=2 agri-group-locality-btn rows but found ${localityBtnCount}. ` +
          'Ensure AGRI_DESTINATIONS_FIXTURE has 2 distinct destinations (Padubidri + Shirva).',
        );
      }
      expect(localityBtnCount).toBeGreaterThanOrEqual(2);

      // Issue #2151 PR C (g) — the UI must render the human displayName, never the raw
      // pipe-delimited area_key (e.g. 'IN|KA|Udupi|Padubidri').
      const rowsText = await localityBtns.allTextContents();
      for (const text of rowsText) {
        expect(text).not.toContain('|');
        expect(text).not.toContain('IN|KA');
      }
      expect(rowsText.some((t) => t.includes('Padubidri'))).toBe(true);
      expect(rowsText.some((t) => t.includes('Shirva'))).toBe(true);

      // HARD REGRESSION GUARD: 'agri-group-listing-row' was REMOVED by #1480 and stays removed
      // under #2151 PR C's server-computed destination model.
      await expect(page.locator('[data-testid="agri-group-listing-row"]')).toHaveCount(0);
    },
  );

  // ── AC2: Click Shirva town row → destKey=<areaKey> in URL; AgriGroupLocalityPanel mounts ─

  test(
    'AC2: clicking Shirva agri-group-locality-btn pushes destKey=<real areaKey> to URL (Issue #2151 PR C — stable-key identity, not free text); agri-group-locality-panel mounts',
    async ({ page }) => {
      await stubCommonRoutes(page);
      await navigateAgriFirst(page, { region: REGION, maxKm: MAX_KM });

      await expect(page.locator('[data-testid="agri-group-selected-panel"]')).toBeVisible({
        timeout: 10_000,
      });

      // Wait for locality buttons to appear
      await expect(page.locator('[data-testid="agri-group-locality-btn"]').first()).toBeVisible({
        timeout: 12_000,
      });

      // Find the Shirva town row by its text content
      const shirvaBtn = page.locator('[data-testid="agri-group-locality-btn"]', { hasText: 'Shirva' });
      await expect(shirvaBtn).toBeVisible({ timeout: 5_000 });

      // Capture the agri-map-listings request fired by the drill-down to prove the FRONTEND
      // sends the destination's real areaKey, not the display text "Shirva".
      const mapListingsRequestPromise = page.waitForRequest('**/api/discover/agri-map-listings**', {
        timeout: 10_000,
      });
      await shirvaBtn.click();

      // URL must contain the canonical destKey=<areaKey> (never legacy locality=) after click (PUSH)
      await page.waitForURL(/destKey=/, { timeout: 8_000 });
      const urlAfterClick = page.url();
      expect(urlAfterClick).toContain(`destKey=${encodeURIComponent(AREA_KEY_SHIRVA)}`);
      expect(urlAfterClick).not.toContain('locality=');
      // Region and maxKm must still be present
      expect(urlAfterClick).toContain(`region=${REGION}`);
      expect(urlAfterClick).toContain(`maxKm=${MAX_KM}`);

      // AgriGroupLocalityPanel must mount
      await expect(page.locator('[data-testid="agri-group-locality-panel"]')).toBeVisible({
        timeout: 10_000,
      });

      // AgriGroupSelectedPanel must no longer be visible (locality panel replaces it)
      await expect(page.locator('[data-testid="agri-group-selected-panel"]')).toHaveCount(0);

      // The listings request scoping this drill-down must carry the real areaKey.
      const mapListingsRequest = await mapListingsRequestPromise;
      const requestUrl = new URL(mapListingsRequest.url());
      expect(requestUrl.searchParams.get('areaKey')).toBe(AREA_KEY_SHIRVA);
      expect(requestUrl.searchParams.has('areaKeys')).toBe(false);
    },
  );

  // ── AC3: AgriGroupLocalityPanel shows filtered listing rows for Shirva ─────────────

  test(
    'AC3: AgriGroupLocalityPanel shows agri-locality-listing-row for Shirva; count=1 from fixture; header shows displayName not raw key',
    async ({ page }) => {
      await stubCommonRoutes(page);
      // Deep-link directly to Shirva locality (by its real areaKey) to bypass click journey
      await navigateAgriFirst(page, { region: REGION, maxKm: MAX_KM, destKey: AREA_KEY_SHIRVA });

      // AgriGroupLocalityPanel must be visible
      await expect(page.locator('[data-testid="agri-group-locality-panel"]')).toBeVisible({
        timeout: 10_000,
      });

      // Locality name must be shown in header, as the resolved displayName — never the raw
      // pipe-delimited areaKey used in the URL (Issue #2151 PR C, g).
      const nameEl = page.locator('[data-testid="agri-locality-name"]');
      await expect(nameEl).toBeVisible({ timeout: 5_000 });
      await expect(nameEl).toHaveText('Shirva');
      const nameText = await nameEl.textContent();
      expect(nameText).not.toContain('|');

      // Wait for listing rows to render
      await expect(page.locator('[data-testid="agri-locality-listing-row"]').first()).toBeVisible({
        timeout: 12_000,
      });

      const rowCount = await page.locator('[data-testid="agri-locality-listing-row"]').count();
      if (rowCount === 0) {
        throw new Error(
          'FIXTURE PRECONDITION FAILED: no agri-locality-listing-row entries for Shirva. ' +
          'Ensure AGRI_MAP_LISTINGS_BY_AREA_KEY[Shirva] contains at least 1 listing.',
        );
      }
      // Fixture has exactly 1 Shirva listing
      expect(rowCount).toBe(1);
    },
  );

  // ── AC4: agri-locality-close-btn clears destKey= (REPLACE); selected-panel returns ─

  test(
    'AC4: agri-locality-close-btn removes destKey= from URL (REPLACE); region+maxKm preserved; agri-group-selected-panel returns',
    async ({ page }) => {
      await stubCommonRoutes(page);
      await navigateAgriFirst(page, { region: REGION, maxKm: MAX_KM, destKey: AREA_KEY_SHIRVA });

      await expect(page.locator('[data-testid="agri-group-locality-panel"]')).toBeVisible({
        timeout: 10_000,
      });

      const closeBtn = page.locator('[data-testid="agri-locality-close-btn"]');
      await expect(closeBtn).toBeVisible({ timeout: 5_000 });
      await closeBtn.click();

      // Wait for destKey= to be removed from URL (REPLACE — no new history entry)
      await page.waitForURL((u) => !u.toString().includes('destKey='), { timeout: 8_000 });

      const urlAfterClose = page.url();

      // destKey= must be absent (and no legacy locality= must have been resurrected)
      expect(urlAfterClose).not.toContain('destKey=');
      expect(urlAfterClose).not.toContain('locality=');

      // region and maxKm must be preserved (REPLACE only removes destKey=)
      expect(urlAfterClose).toContain(`region=${REGION}`);
      expect(urlAfterClose).toContain(`maxKm=${MAX_KM}`);

      // AgriGroupLocalityPanel must be gone
      await expect(page.locator('[data-testid="agri-group-locality-panel"]')).toHaveCount(0);

      // AgriGroupSelectedPanel must be visible again
      await expect(page.locator('[data-testid="agri-group-selected-panel"]')).toBeVisible({
        timeout: 8_000,
      });
    },
  );

  // ── AC5: Deep-link cold-load ?region=S&maxKm=25&destKey=<areaKey> restores LocalityPanel ─

  test(
    'AC5: deep-link ?region=S&maxKm=25&destKey=<Shirva areaKey> cold-load restores agri-group-locality-panel directly',
    async ({ page }) => {
      await stubCommonRoutes(page);
      await navigateAgriFirst(page, { region: REGION, maxKm: MAX_KM, destKey: AREA_KEY_SHIRVA });

      // AgriGroupLocalityPanel must mount without any intermediate click
      await expect(page.locator('[data-testid="agri-group-locality-panel"]')).toBeVisible({
        timeout: 10_000,
      });

      // Listing rows must be present from fixture
      await expect(page.locator('[data-testid="agri-locality-listing-row"]').first()).toBeVisible({
        timeout: 12_000,
      });

      const rowCount = await page.locator('[data-testid="agri-locality-listing-row"]').count();
      if (rowCount === 0) {
        throw new Error(
          'FIXTURE PRECONDITION FAILED: no agri-locality-listing-row on deep-link cold load with destKey=Shirva areaKey.',
        );
      }
      expect(rowCount).toBeGreaterThanOrEqual(1);

      // AgriGroupSelectedPanel must NOT be mounted (locality panel is active)
      await expect(page.locator('[data-testid="agri-group-selected-panel"]')).toHaveCount(0);
    },
  );

  // ── AC5b: legacy locality=<free-text> deep-link migrates to destKey= exactly once ────

  test(
    'AC5b: legacy ?locality=Shirva cold-load is rewritten to destKey=<Shirva areaKey> exactly once; legacy param is gone; a later interaction does not resurrect it (Issue #2151 PR C)',
    async ({ page }) => {
      await stubCommonRoutes(page);
      // Cold-load with the OLD free-text `locality=` param — the shape historically written
      // by the pre-PR-C client-side grouping and still present in any previously shared link.
      await navigateAgriFirst(page, { region: REGION, maxKm: MAX_KM, locality: AREA_KEY_SHIRVA });

      // The one-time migration effect (state/url/agricultural.ts) REPLACEs `locality=` with
      // `destKey=` on mount.
      await page.waitForURL(/destKey=/, { timeout: 8_000 });
      const urlAfterMigration = page.url();
      expect(urlAfterMigration).toContain(`destKey=${encodeURIComponent(AREA_KEY_SHIRVA)}`);
      expect(urlAfterMigration).not.toContain('locality=');
      expect(urlAfterMigration).not.toContain('town=');

      // The migrated identity must still resolve to the correct destination panel.
      await expect(page.locator('[data-testid="agri-group-locality-panel"]')).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.locator('[data-testid="agri-locality-name"]')).toHaveText('Shirva');

      // A subsequent interaction (close, then reopen via a fresh drill-down) must not resurrect
      // `locality=` — the migration is a one-time cold-load effect, not a persistent rewrite rule.
      const closeBtn = page.locator('[data-testid="agri-locality-close-btn"]');
      await expect(closeBtn).toBeVisible({ timeout: 5_000 });
      await closeBtn.click();
      await page.waitForURL((u) => !u.toString().includes('destKey='), { timeout: 8_000 });
      expect(page.url()).not.toContain('locality=');

      const localityBtn = page.locator('[data-testid="agri-group-locality-btn"]').first();
      await expect(localityBtn).toBeVisible({ timeout: 10_000 });
      await localityBtn.click();
      await page.waitForURL(/destKey=/, { timeout: 8_000 });
      expect(page.url()).not.toContain('locality=');
    },
  );

  // ── AC6: Listing click opens peek; peek close removes listing= only; destKey= survives ─

  test(
    'AC6: listing row click → listing= in URL → peek visible; peek close removes listing= only; destKey= preserved',
    async ({ page }) => {
      await stubCommonRoutes(page);
      await navigateAgriFirst(page, { region: REGION, maxKm: MAX_KM, destKey: AREA_KEY_SHIRVA });

      await expect(page.locator('[data-testid="agri-group-locality-panel"]')).toBeVisible({
        timeout: 10_000,
      });

      // Wait for listing rows to render
      await expect(page.locator('[data-testid="agri-locality-listing-row"]').first()).toBeVisible({
        timeout: 12_000,
      });

      // Install detail response fence BEFORE click
      const detailResponsePromise = page.waitForResponse('**/api/public/listings/*', {
        timeout: 10_000,
      });

      // Click first listing row → PUSH listing= into URL
      await page.locator('[data-testid="agri-locality-listing-row"]').first().click();

      // URL must contain listing= after click
      await page.waitForURL(/listing=/, { timeout: 8_000 });
      expect(page.url()).toContain('listing=');

      // AgriGroupListingPeek must be visible
      await expect(page.locator('[data-testid="agri-listing-peek"]')).toBeVisible({
        timeout: 10_000,
      });

      // Must still be on /discover (no auto-navigation to /listing/:id)
      expect(page.url()).toContain('/discover');

      // Close button and view-details CTA must be present
      await expect(page.locator('[data-testid="agri-listing-peek-close"]')).toBeVisible({
        timeout: 5_000,
      });
      await expect(page.locator('[data-testid="agri-listing-peek-view-details"]')).toBeVisible({
        timeout: 5_000,
      });

      // Await detail response to ensure lazy fields are loaded before close
      await detailResponsePromise;

      // Click close — REPLACE removes listing= only
      await page.locator('[data-testid="agri-listing-peek-close"]').click();

      // listing= must be absent after close
      await page.waitForURL((u) => !u.toString().includes('listing='), { timeout: 5_000 });

      const urlAfterClose = page.url();
      expect(urlAfterClose).not.toContain('listing=');

      // destKey= must STILL be present (REPLACE removes listing= only, not destKey=)
      expect(urlAfterClose).toContain('destKey=');

      // region and maxKm must also be preserved
      expect(urlAfterClose).toContain(`region=${REGION}`);
      expect(urlAfterClose).toContain(`maxKm=${MAX_KM}`);

      // Peek must be gone; locality panel must be visible again
      await expect(page.locator('[data-testid="agri-listing-peek"]')).toHaveCount(0);
      await expect(page.locator('[data-testid="agri-group-locality-panel"]')).toBeVisible({
        timeout: 5_000,
      });
    },
  );

  // ── AC7: Anon fixture → peek shows price-signin; numeric price absent ──────────────

  test.describe('AC7 — anon affordance', () => {
    // Explicit anon override for this describe block (belt-and-suspenders — outer describe
    // already sets storageState: undefined, but repeating here makes the intent explicit).
    test.use({ storageState: undefined });

    test(
      'AC7: anon (pricePaise: null + propertyType: agricultural_land) → agri-listing-peek-price-signin visible; agri-listing-peek-price absent',
      async ({ page }) => {
        // Use the anon fixture (pricePaise: null) for agri-map-listings
        await stubCommonRoutes(page, true);
        await navigateAgriFirst(page, { region: REGION, maxKm: MAX_KM, destKey: AREA_KEY_SHIRVA });

        await expect(page.locator('[data-testid="agri-group-locality-panel"]')).toBeVisible({
          timeout: 10_000,
        });

        // Wait for the single Shirva listing row from the anon fixture
        await expect(page.locator('[data-testid="agri-locality-listing-row"]').first()).toBeVisible({
          timeout: 12_000,
        });

        // Click the listing row to open peek
        await page.locator('[data-testid="agri-locality-listing-row"]').first().click();

        // URL must contain listing= param
        await page.waitForURL(/listing=/, { timeout: 8_000 });

        // Peek must be visible
        await expect(page.locator('[data-testid="agri-listing-peek"]')).toBeVisible({
          timeout: 10_000,
        });

        // Price sign-in affordance must be visible (pricePaise: null + propertyType: agricultural_land)
        await expect(page.locator('[data-testid="agri-listing-peek-price-signin"]')).toBeVisible({
          timeout: 8_000,
        });

        // Numeric price element must NOT be present (pricePaise is null — no formatted price)
        await expect(page.locator('[data-testid="agri-listing-peek-price"]')).toHaveCount(0);

        // NOTE: There is intentionally NO survey testid assertion here — AgriGroupListingPeek
        // does not render a survey field (it is intentionally absent from the peek panel).
      },
    );
  });

  // ── AC8: area-first journey — locality panel and peek are absent (regression) ───────

  test(
    'AC8: area-first journey has no agri-group-locality-panel and no agri-listing-peek (regression)',
    async ({ page }) => {
      await stubCommonRoutes(page);
      await page.goto(`/discover?city=${CITY}&journey=area-first`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10_000 });
      // Confirm overlay pane is attached before asserting absence of panels
      await expect(page.locator('.leaflet-overlay-pane')).toBeAttached({ timeout: 5_000 });
      await page.waitForLoadState('networkidle');

      // Use .toHaveCount(0) — "must not be mounted" check (stronger than .not.toBeVisible())
      await expect(page.locator('[data-testid="agri-group-locality-panel"]')).toHaveCount(0);
      await expect(page.locator('[data-testid="agri-listing-peek"]')).toHaveCount(0);
      await expect(page.locator('[data-testid="agri-group-selected-panel"]')).toHaveCount(0);
    },
  );
});

// ---------------------------------------------------------------------------
// Suite — REAL_SEED (live-stack only, skipped unless REAL_SEED=1)
// ---------------------------------------------------------------------------

test.describe('@integration-ui 1468 — Real-seed [REAL_SEED only]', () => {
  test.use({ storageState: undefined });

  test(
    'AC9: real-seed South/25km — town rows include Padubidri + Shirva; click Shirva → locality panel mounts; listing rows >= 1',
    async ({ page }) => {
      if (!REAL_SEED) {
        test.skip(true, 'Set REAL_SEED=1 with live seeded stack to run');
        return;
      }

      // Real-seed is slower than stubs (live tiles + network + React Query warm-up)
      test.setTimeout(60_000);

      // No stubs — live backend.
      // Gate on rendered DOM only — do NOT use waitForRequest for regional-area-groups or
      // agri-map-listings (React Query may have already fired and cached before listener attaches).
      await page.goto(`/discover?city=${CITY}&journey=agri-first&region=${REGION}&maxKm=${MAX_KM}`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 15_000 });
      // Allow React Query cache warm-up and map tiles to settle
      await page.waitForTimeout(2000);

      // AgriGroupSelectedPanel must be visible (South/25km deep-link)
      await expect(page.locator('[data-testid="agri-group-selected-panel"]')).toBeVisible({
        timeout: 15_000,
      });

      // Allow agri-map-listings to load and town rows to render
      await page.waitForTimeout(2000);

      // Must have locality buttons from the live seed
      const localityBtns = page.locator('[data-testid="agri-group-locality-btn"]');
      await expect(localityBtns.first()).toBeVisible({ timeout: 15_000 });

      const btnCount = await localityBtns.count();
      if (btnCount === 0) {
        throw new Error(
          'FIXTURE PRECONDITION FAILED: no agri-group-locality-btn rows on live seeded stack. ' +
          'Ensure restore-test-fixture.sh + seed-agricultural-listings.sh have been run ' +
          'and that agri listings for South corridor exist.',
        );
      }

      // Collect locality names from the town rows
      const localityNames: string[] = [];
      for (let i = 0; i < btnCount; i++) {
        const text = await localityBtns.nth(i).textContent();
        if (text) localityNames.push(text.trim());
      }

      // Assert Padubidri and Shirva are both present in the live seed
      expect(
        localityNames.some((n) => n.includes('Padubidri')),
        `SEED CHECK FAILED: 'Padubidri' not found in town rows. Found: [${localityNames.join(', ')}]`,
      ).toBe(true);
      expect(
        localityNames.some((n) => n.includes('Shirva')),
        `SEED CHECK FAILED: 'Shirva' not found in town rows. Found: [${localityNames.join(', ')}]`,
      ).toBe(true);

      // Click the Shirva town row
      const shirvaBtn = localityBtns.filter({ hasText: 'Shirva' }).first();
      await expect(shirvaBtn).toBeVisible({ timeout: 5_000 });
      await shirvaBtn.click();

      // Issue #2151 PR C — destKey=<real areaKey> must appear in URL (legacy locality= no longer used)
      await page.waitForURL(/destKey=/, { timeout: 10_000 });
      expect(page.url()).not.toContain('locality=');

      // AgriGroupLocalityPanel must mount
      await expect(page.locator('[data-testid="agri-group-locality-panel"]')).toBeVisible({
        timeout: 15_000,
      });

      // Allow listing rows to load from live backend
      await page.waitForTimeout(2000);

      const listingRows = page.locator('[data-testid="agri-locality-listing-row"]');
      await expect(listingRows.first()).toBeVisible({ timeout: 15_000 });

      const rowCount = await listingRows.count();
      if (rowCount === 0) {
        throw new Error(
          'FIXTURE PRECONDITION FAILED: no agri-locality-listing-row for Shirva on live seeded stack. ' +
          'Seed may be incomplete.',
        );
      }
      expect(rowCount).toBeGreaterThanOrEqual(1);

      // If exactly 3 Shirva rows are present (as per seed scripts), assert count=3
      if (rowCount === 3) {
        expect(rowCount).toBe(3);
      }
    },
  );
});
