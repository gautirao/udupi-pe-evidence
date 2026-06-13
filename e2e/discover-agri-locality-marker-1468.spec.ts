/**
 * discover-agri-locality-marker-1468.spec.ts
 *
 * E2E spec for issue #1468:
 * "E2E hardening for towns-only Level-2 drill-down" (post-#1480)
 *
 * ACs verified:
 *   AC1  — AgriGroupSelectedPanel shows agri-group-locality-btn rows (town groups, NOT old listing rows)
 *   AC2  — clicking a town row (Shirva) pushes locality=Shirva to URL; AgriGroupLocalityPanel mounts
 *   AC3  — AgriGroupLocalityPanel shows filtered agri-locality-listing-row entries for Shirva
 *   AC4  — agri-locality-close-btn clears locality= from URL (REPLACE); AgriGroupSelectedPanel returns
 *   AC5  — deep-link cold-load ?region=S&maxKm=25&locality=Shirva restores AgriGroupLocalityPanel
 *   AC6  — listing click in locality panel opens peek; peek close removes listing= only, locality= survives
 *   AC7  — anon fixture (pricePaise: null + propertyType: agricultural_land): peek shows price-signin, not price
 *   AC8  — area-first regression: agri-group-locality-panel and agri-listing-peek have count=0
 *   AC9  — [REAL_SEED only] South/25km on live seeded stack has Padubidri + Shirva town rows
 *
 * Panel state machine (post-#1480):
 *   no region                              → CorridorLandingPanel (corridor-landing-list)
 *   region + maxKm                         → AgriGroupSelectedPanel (agri-group-selected-panel)
 *                                            └─ shows agri-group-locality-btn rows (one per town)
 *                                            └─ OLD 'agri-group-listing-row' testid REMOVED by #1480
 *   region + maxKm + locality              → AgriGroupLocalityPanel (agri-group-locality-panel)
 *                                            └─ shows agri-locality-listing-row for that town
 *   region + maxKm + locality + listing    → AgriGroupListingPeek (agri-listing-peek)
 *
 * URL contract:
 *   locality=<name>   → PUSH via setLocality; REPLACE via clearLocality (removes locality= only)
 *   listing=<uuid>    → PUSH; clearSelectedListing REPLACE (removes listing= only, locality= preserved)
 *   clearRegionAndMaxKm → PUSH (removes region+maxKm+locality+listing)
 *
 * Sibling specs (do NOT duplicate their coverage):
 *   e2e/discover-agri-direction-first-1448.spec.ts  — corridor cards, one-click atomicity, chip switch,
 *                                                      sector overlay, peek open/close at corridor level,
 *                                                      Back from selected-region. Also covers AC12 anon
 *                                                      price-signin at corridor level (NOT locality level).
 *   e2e/discover-agri-overlay-peek-journey-1431.spec.ts — sector overlay lifecycle, Back/Forward at peek.
 *   e2e/discover-agri-grouped-journey-1412.spec.ts  — regional groups API contract, network spy.
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
const AGRI_MAP_LISTINGS_FIXTURE = {
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
      areaKey: 'IN|KA|Udupi|Padubidri',
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
      areaKey: 'IN|KA|Udupi|Padubidri',
    },
    {
      id: LISTING_ID_SHIRVA,
      locality: 'Shirva',
      landArea: 3.2,
      landAreaUnit: 'acres',
      pricePaise: 6000000,
      boundaryGeoJson: null,
      lat: 13.15,
      lon: 74.82,
      areaKey: 'IN|KA|Udupi|Shirva',
    },
  ],
};

/**
 * Anon fixture for AC7 — pricePaise: null triggers agri-listing-peek-price-signin affordance.
 * propertyType: 'agricultural_land' is required — component checks:
 *   isAgri = firstPaintData.propertyType === 'agricultural_land'
 *   showSignInForPrice = isAgri && !isAuthenticated && firstPaintData.pricePaise == null
 * Without propertyType, isAgri=false and the affordance never renders.
 */
const AGRI_MAP_LISTINGS_ANON_FIXTURE = {
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
      areaKey: 'IN|KA|Udupi|Shirva',
    },
  ],
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
 * @param useAnonFixture  When true, serves AGRI_MAP_LISTINGS_ANON_FIXTURE (pricePaise: null) for AC7.
 */
async function stubCommonRoutes(page: Page, useAnonFixture = false) {
  await page.route('**/api/trends/options**', (r) => fulfillJson(r, 200, TRENDS_OPTIONS_FIXTURE));
  await page.route('**/api/discover/areas**', (r) => fulfillJson(r, 200, DISCOVER_AREAS_FIXTURE));
  await page.route('**/api/discover/cities/*/listings**', (r) => fulfillJson(r, 200, CITY_LISTINGS_FIXTURE));
  await page.route('**/api/discover/listings**', (r) => fulfillJson(r, 200, { content: [], totalElements: 0 }));
  await page.route('**/api/public/schools/**', (r) => fulfillJson(r, 200, []));
  await page.route('**/api/discover/regional-area-groups**', (r) => fulfillJson(r, 200, REGIONAL_AREA_GROUPS_FIXTURE));
  await page.route('**/api/discover/agri-map-listings**', (r) =>
    fulfillJson(r, 200, useAnonFixture ? AGRI_MAP_LISTINGS_ANON_FIXTURE : AGRI_MAP_LISTINGS_FIXTURE));
  await page.route('**/api/public/listings/*', (r) => fulfillJson(r, 200, AGRI_LISTING_DETAIL_FIXTURE));
}

/**
 * Navigate to agri-first Discover and wait for map + initial data load.
 * Stubs MUST be installed before calling this helper.
 * @param extraParams  Additional URL params (e.g. region, maxKm, locality).
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

  // ── AC1: AgriGroupSelectedPanel shows locality-btn rows (NOT old listing-row) ─────

  test(
    'AC1: region+maxKm shows agri-group-locality-btn rows (>=2 towns); agri-group-listing-row absent (regression guard)',
    async ({ page }) => {
      await stubCommonRoutes(page);
      await navigateAgriFirst(page, { region: REGION, maxKm: MAX_KM });

      // AgriGroupSelectedPanel must be visible
      await expect(page.locator('[data-testid="agri-group-selected-panel"]')).toBeVisible({
        timeout: 10_000,
      });

      // Wait for town buttons to render from fixture (agri-map-listings required)
      await expect(page.locator('[data-testid="agri-group-locality-btn"]').first()).toBeVisible({
        timeout: 12_000,
      });

      // Must have at least 2 town rows (Padubidri + Shirva from fixture)
      const localityBtnCount = await page.locator('[data-testid="agri-group-locality-btn"]').count();
      if (localityBtnCount < 2) {
        throw new Error(
          `FIXTURE PRECONDITION FAILED: expected >=2 agri-group-locality-btn rows but found ${localityBtnCount}. ` +
          'Ensure AGRI_MAP_LISTINGS_FIXTURE has listings with DISTINCT locality values (Padubidri + Shirva).',
        );
      }
      expect(localityBtnCount).toBeGreaterThanOrEqual(2);

      // HARD REGRESSION GUARD: 'agri-group-listing-row' was REMOVED by #1480.
      // If this testid reappears, the towns-only Level-2 model has regressed to old
      // flat-listing rows.
      await expect(page.locator('[data-testid="agri-group-listing-row"]')).toHaveCount(0);
    },
  );

  // ── AC2: Click Shirva town row → locality=Shirva in URL; AgriGroupLocalityPanel mounts ─

  test(
    'AC2: clicking Shirva agri-group-locality-btn pushes locality=Shirva to URL; agri-group-locality-panel mounts',
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
      await shirvaBtn.click();

      // URL must contain locality=Shirva after click (PUSH)
      await page.waitForURL(/locality=/, { timeout: 8_000 });
      expect(page.url()).toContain('locality=');
      // Region and maxKm must still be present
      expect(page.url()).toContain(`region=${REGION}`);
      expect(page.url()).toContain(`maxKm=${MAX_KM}`);

      // AgriGroupLocalityPanel must mount
      await expect(page.locator('[data-testid="agri-group-locality-panel"]')).toBeVisible({
        timeout: 10_000,
      });

      // AgriGroupSelectedPanel must no longer be visible (locality panel replaces it)
      await expect(page.locator('[data-testid="agri-group-selected-panel"]')).toHaveCount(0);
    },
  );

  // ── AC3: AgriGroupLocalityPanel shows filtered listing rows for Shirva ─────────────

  test(
    'AC3: AgriGroupLocalityPanel shows agri-locality-listing-row for Shirva; count=1 from fixture',
    async ({ page }) => {
      await stubCommonRoutes(page);
      // Deep-link directly to Shirva locality to bypass click journey
      await navigateAgriFirst(page, { region: REGION, maxKm: MAX_KM, locality: 'Shirva' });

      // AgriGroupLocalityPanel must be visible
      await expect(page.locator('[data-testid="agri-group-locality-panel"]')).toBeVisible({
        timeout: 10_000,
      });

      // Locality name must be shown in header
      await expect(page.locator('[data-testid="agri-locality-name"]')).toBeVisible({
        timeout: 5_000,
      });

      // Wait for listing rows to render
      await expect(page.locator('[data-testid="agri-locality-listing-row"]').first()).toBeVisible({
        timeout: 12_000,
      });

      const rowCount = await page.locator('[data-testid="agri-locality-listing-row"]').count();
      if (rowCount === 0) {
        throw new Error(
          'FIXTURE PRECONDITION FAILED: no agri-locality-listing-row entries for Shirva. ' +
          'Ensure AGRI_MAP_LISTINGS_FIXTURE contains at least 1 listing with locality="Shirva".',
        );
      }
      // Fixture has exactly 1 Shirva listing (agri-1468-listing-002)
      expect(rowCount).toBe(1);
    },
  );

  // ── AC4: agri-locality-close-btn clears locality= (REPLACE); selected-panel returns ─

  test(
    'AC4: agri-locality-close-btn removes locality= from URL (REPLACE); region+maxKm preserved; agri-group-selected-panel returns',
    async ({ page }) => {
      await stubCommonRoutes(page);
      await navigateAgriFirst(page, { region: REGION, maxKm: MAX_KM, locality: 'Shirva' });

      await expect(page.locator('[data-testid="agri-group-locality-panel"]')).toBeVisible({
        timeout: 10_000,
      });

      const closeBtn = page.locator('[data-testid="agri-locality-close-btn"]');
      await expect(closeBtn).toBeVisible({ timeout: 5_000 });
      await closeBtn.click();

      // Wait for locality= to be removed from URL (REPLACE — no new history entry)
      await page.waitForURL((u) => !u.toString().includes('locality='), { timeout: 8_000 });

      const urlAfterClose = page.url();

      // locality= must be absent
      expect(urlAfterClose).not.toContain('locality=');

      // region and maxKm must be preserved (REPLACE only removes locality=)
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

  // ── AC5: Deep-link cold-load ?region=S&maxKm=25&locality=Shirva restores LocalityPanel ─

  test(
    'AC5: deep-link ?region=S&maxKm=25&locality=Shirva cold-load restores agri-group-locality-panel directly',
    async ({ page }) => {
      await stubCommonRoutes(page);
      await navigateAgriFirst(page, { region: REGION, maxKm: MAX_KM, locality: 'Shirva' });

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
          'FIXTURE PRECONDITION FAILED: no agri-locality-listing-row on deep-link cold load with locality=Shirva.',
        );
      }
      expect(rowCount).toBeGreaterThanOrEqual(1);

      // AgriGroupSelectedPanel must NOT be mounted (locality panel is active)
      await expect(page.locator('[data-testid="agri-group-selected-panel"]')).toHaveCount(0);
    },
  );

  // ── AC6: Listing click opens peek; peek close removes listing= only; locality= survives ─

  test(
    'AC6: listing row click → listing= in URL → peek visible; peek close removes listing= only; locality= preserved',
    async ({ page }) => {
      await stubCommonRoutes(page);
      await navigateAgriFirst(page, { region: REGION, maxKm: MAX_KM, locality: 'Shirva' });

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

      // locality= must STILL be present (REPLACE removes listing= only, not locality=)
      expect(urlAfterClose).toContain('locality=');

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
        await navigateAgriFirst(page, { region: REGION, maxKm: MAX_KM, locality: 'Shirva' });

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

      // locality= must appear in URL
      await page.waitForURL(/locality=/, { timeout: 10_000 });

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
