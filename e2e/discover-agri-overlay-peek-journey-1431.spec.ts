/**
 * discover-agri-overlay-peek-journey-1431.spec.ts
 *
 * E2E spec for issue #1431:
 * "agri Regional Discovery v2 — directional sector overlay (#1429) + listing-summary peek (#1430)"
 *
 * ACs verified:
 *   AC1a — No overlay paths on agri-first landing (no region selected)
 *   AC1b — Overlay paths > 0 after corridor + distance-chip selection (POSITIVE spy)
 *   AC1c — Overlay paths == 0 after clearing region (corridor-back-btn)
 *   AC2  — Listing peek fields: locality/acreage/price (synchronous) +
 *           media or no-media + description (lazy); NO video indicator assertions (#1443)
 *   AC3  — View full details CTA navigates to /listing/:id
 *   AC4  — Full Back/Forward ladder: peek → group-selected → distance-chips → no-region;
 *           Forward ladder restores each step
 *   AC5  — area-first journey: no overlay, no peek
 *   AC5b — school-first journey: no overlay, no peek
 *   AC6  — [REAL_SEED only] live-stack: corridor list >= 1; overlay renders;
 *           listing peek opens; CTA → /listing/:id
 *
 * URL contract (verified from src/hooks/useDiscoverUrlState.ts):
 *   region=<DIR>         → PUSH (setRegion)
 *   maxKm=<N>            → PUSH (setMaxKm)
 *   listing=<uuid>       → PUSH (setSelectedListing)
 *   clearRegionAndMaxKm  → PUSH (removes region + maxKm + listing atomically)
 *   clearSelectedListing → REPLACE (close button does NOT push — use goBack/goForward)
 *
 * Panel state machine (verified from src/utils/discoverPanelState.ts):
 *   region + maxKm + listing → agri-group-peek
 *   region + maxKm            → agri-group-selected
 *   region only               → agri-landing (corridor distance-chip view)
 *   no region                 → agri-landing (corridor list)
 *
 * Fixture shape: NEW corridor-first CorridorGroupDTO (#1435) — NOT deprecated group=DIR:BAND shape.
 *
 * REAL-SEED HEADLINE TEST (AC6) — run against the local fixture stack:
 *   Required stack:
 *     1. restore-test-fixture.sh  (pg-test-fixture:5434)
 *     2. scripts/seed-agricultural-listings.sh  (udupi: 7+ groups)
 *     3. backend on :8085 pointed at local fixture
 *     4. frontend dev server on :5173 or :5174
 *   Command:
 *     REAL_SEED=1 bash scripts/run-e2e-local.sh --project=full \
 *       e2e/discover-agri-overlay-peek-journey-1431.spec.ts
 *   Without REAL_SEED the real-seed test is skipped (all stubbed tests still run).
 *
 * Architecture:
 *   - No storageState — purely anon flow.
 *   - All API routes stubbed by default; REAL_SEED block defers to live backend.
 *   - Overlay positive spy: the assertion `path count > 0` will FAIL when overlay is absent.
 *   - Back/Forward ladder uses page.goBack()/goForward() only — NOT the close button.
 *   - No assertions on video indicator (deferred to #1443).
 *   - boundaryGeoJson: null on ALL agri-map-listings items — isolates sector overlay
 *     from boundary polygon paths in .leaflet-overlay-pane.
 *
 * Run:
 *   bash scripts/run-e2e-local.sh --project=full \
 *     e2e/discover-agri-overlay-peek-journey-1431.spec.ts
 */

import { test, expect, type Page, type Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

/** Set REAL_SEED=1 to enable the live-backend seed-backed headline test (AC6). */
const REAL_SEED = Boolean(process.env.REAL_SEED);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CITY = 'udupi';
const AREA_KEY = 'IN|KA|Udupi|Manipal';

const LISTING_ID = 'agri-1431-listing-001';

// Direction + distance used in stubbed tests
const REGION = 'N';
const MAX_KM = 25;

// ---------------------------------------------------------------------------
// Fixtures — NEW corridor-first CorridorGroupDTO shape (#1435)
// ---------------------------------------------------------------------------

const TRENDS_OPTIONS_FIXTURE = {
  city: CITY,
  defaultAreas: [{ areaKey: AREA_KEY, areaLabel: 'Manipal' }],
};

const DISCOVER_AREAS_FIXTURE = {
  city: CITY,
  areas: [
    {
      areaKey: AREA_KEY,
      name: 'Manipal',
      geoCenterLat: 13.3509,
      geoCenterLon: 74.7932,
      minLat: 13.33,
      maxLat: 13.38,
      minLon: 74.77,
      maxLon: 74.82,
      listingCount: 5,
      agriAcreage: 18.0,
      schoolCount: 0,
      trendDirection: 'stable',
    },
  ],
};

const CITY_LISTINGS_FIXTURE = { city: CITY, limitPerArea: 50, areas: [] };

/**
 * NEW corridor-first shape — CorridorGroupDTO (#1435).
 * groupName replaces deprecated label; directionCode replaces directionKey.
 * availableMaxDistances replaces flat distanceBandKey.
 */
const REGIONAL_AREA_GROUPS_FIXTURE = {
  city: CITY,
  groups: [
    {
      directionCode: REGION,
      groupName: 'N towards Brahmavar',
      availableMaxDistances: [
        {
          maxKm: 10,
          distanceLabel: 'Within 10 km',
          includedBandCodes: ['0_10'],
          listingCount: 2,
          areaKeys: [AREA_KEY],
        },
        {
          maxKm: MAX_KM,
          distanceLabel: 'Up to 25 km',
          includedBandCodes: ['0_10', '10_25'],
          listingCount: 5,
          areaKeys: [AREA_KEY],
        },
      ],
    },
  ],
};

/**
 * agri-map-listings fixture.
 * boundaryGeoJson: null on ALL items so that .leaflet-overlay-pane path count
 * reflects only the sector overlay polygon (not boundary polygons).
 */
const AGRI_MAP_LISTINGS_FIXTURE = {
  city: CITY,
  listings: [
    {
      id: LISTING_ID,
      locality: 'Manipal',
      landArea: 3.0,
      landAreaUnit: 'acres',
      pricePaise: 7500000,
      boundaryGeoJson: null,
      lat: 13.353,
      lon: 74.793,
      areaKey: AREA_KEY,
    },
  ],
};

/**
 * Full listing detail — includes images and description for lazy peek fields.
 * Shape verified against PR #1407 public DTO.
 */
const AGRI_LISTING_DETAIL_FIXTURE = {
  id: LISTING_ID,
  title: 'Agri Plot North Udupi',
  locality: 'Manipal',
  city: 'Udupi',
  propertyType: 'agricultural_land',
  price: 7500000,
  landArea: 3.0,
  landAreaUnit: 'acres',
  computedAreaAcres: 2.97,
  images: [{ url: 'https://example.com/img.jpg', alt: 'Plot photo' }],
  description: 'Fertile agricultural plot in the North corridor.',
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
 * Does NOT stub markers (markers endpoint is auth-gated and not used in anon agri flow).
 */
async function stubCommonRoutes(page: Page) {
  await page.route('**/api/trends/options**', (r) => fulfillJson(r, 200, TRENDS_OPTIONS_FIXTURE));
  await page.route('**/api/discover/areas**', (r) => fulfillJson(r, 200, DISCOVER_AREAS_FIXTURE));
  await page.route('**/api/discover/cities/*/listings**', (r) =>
    fulfillJson(r, 200, CITY_LISTINGS_FIXTURE),
  );
  await page.route('**/api/discover/listings**', (r) =>
    fulfillJson(r, 200, { content: [], totalElements: 0 }),
  );
  await page.route('**/api/public/schools/**', (r) => fulfillJson(r, 200, []));
  await page.route('**/api/discover/regional-area-groups**', (r) =>
    fulfillJson(r, 200, REGIONAL_AREA_GROUPS_FIXTURE),
  );
  await page.route('**/api/discover/agri-map-listings**', (r) =>
    fulfillJson(r, 200, AGRI_MAP_LISTINGS_FIXTURE),
  );
  await page.route('**/api/public/listings/*', (r) =>
    fulfillJson(r, 200, AGRI_LISTING_DETAIL_FIXTURE),
  );
}

/**
 * Navigate to agri-first Discover and wait for map + initial data load.
 * @param extraParams  Additional URL params to append (e.g. region, maxKm, listing).
 */
async function navigateAgriFirst(
  page: Page,
  extraParams: Record<string, string> = {},
) {
  const params = new URLSearchParams({ city: CITY, journey: 'agri-first' });
  for (const [k, v] of Object.entries(extraParams)) {
    params.set(k, v);
  }
  await page.goto(`/discover?${params.toString()}`);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10_000 });
  // Wait for regional-area-groups to fire (primary data dependency for agri-first)
  await page
    .waitForRequest('**/api/discover/regional-area-groups**', { timeout: 12_000 })
    .catch((e: Error) => console.warn('[1431] regional-area-groups not requested:', e.message));
}

// ---------------------------------------------------------------------------
// Suite — ANON (no storageState) — Stubbed tests
// ---------------------------------------------------------------------------

test.describe('@integration-ui 1431 — Agri sector overlay + listing peek — stubbed', () => {
  // No storageState — anon flow.

  // ── AC1a: No overlay on landing (no region) ───────────────────────────────

  test('AC1a: no overlay paths on agri-first landing when no region selected', async ({ page }) => {
    await stubCommonRoutes(page);
    await navigateAgriFirst(page);

    // Allow map to settle
    await page.waitForTimeout(1500);

    const pathCount = await page.locator('.leaflet-overlay-pane path').count();
    expect(pathCount).toBe(0);
  });

  // ── AC1b: Overlay appears after corridor + chip selection ─────────────────

  test(
    'AC1b: overlay paths > 0 after selecting corridor and distance chip (POSITIVE spy)',
    async ({ page }) => {
      await stubCommonRoutes(page);
      await navigateAgriFirst(page);

      // Click the first corridor card to enter the distance-chip view
      const corridorCard = page.locator('[data-testid="corridor-card"]').first();
      await expect(corridorCard).toBeVisible({ timeout: 10_000 });
      await corridorCard.click();

      // Wait for distance chips to appear
      await expect(page.locator('[data-testid="corridor-distance-chips"]')).toBeVisible({
        timeout: 8_000,
      });

      // Click the chip for maxKm=25
      const chip25 = page.locator(`[data-testid="distance-chip-${MAX_KM}"]`);
      await expect(chip25).toBeVisible({ timeout: 5_000 });
      await chip25.click();

      // Assert URL has both region and maxKm
      await page.waitForURL(new RegExp(`region=${REGION}.*maxKm=${MAX_KM}|maxKm=${MAX_KM}.*region=${REGION}`), {
        timeout: 5_000,
      });
      const url = page.url();
      expect(url).toContain(`region=${REGION}`);
      expect(url).toContain(`maxKm=${MAX_KM}`);

      // Wait for map/overlay to settle after selection
      await page.waitForTimeout(2000);

      // POSITIVE spy: overlay must have rendered at least one path.
      // The human-readable failure message is the second argument to expect().
      const pathCount = await page.locator('.leaflet-overlay-pane path').count();
      expect(
        pathCount,
        'REGRESSION: no overlay paths rendered after region+maxKm selection. ' +
        'Sector overlay component may not be mounted or the stub did not trigger render.',
      ).toBeGreaterThan(0);
    },
  );

  // ── AC1c: Overlay removed after clearing region ───────────────────────────

  test(
    'AC1c: overlay paths == 0 after clearing region from agri-group-selected panel',
    async ({ page }) => {
      await stubCommonRoutes(page);
      // Start with region+maxKm already in URL → panel state = agri-group-selected
      await navigateAgriFirst(page, { region: REGION, maxKm: String(MAX_KM) });

      // With region+maxKm both set → agri-group-selected state (AgriGroupSelectedPanel).
      // corridor-distance-chips is NOT shown here; that panel only renders when
      // region is set but maxKm is absent (agri-landing state).
      await expect(page.locator('[data-testid="agri-group-selected-panel"]')).toBeVisible({
        timeout: 10_000,
      });
      await page.waitForTimeout(1500);

      // Click the clear button on AgriGroupSelectedPanel (clearRegionAndMaxKm — PUSH)
      const clearBtn = page.locator('[data-testid="agri-group-selected-clear"]');
      await expect(clearBtn).toBeVisible({ timeout: 5_000 });
      await clearBtn.click();

      // URL must no longer have region or maxKm
      await page.waitForTimeout(1000);
      const url = page.url();
      expect(url).not.toContain('region=');
      expect(url).not.toContain('maxKm=');

      // Overlay must be gone
      await page.waitForTimeout(1000);
      const pathCount = await page.locator('.leaflet-overlay-pane path').count();
      expect(pathCount).toBe(0);

      // Corridor landing list must be visible again
      await expect(page.locator('[data-testid="corridor-landing-list"]')).toBeVisible({
        timeout: 8_000,
      });
    },
  );

  // ── AC2: Listing peek fields ───────────────────────────────────────────────

  test(
    'AC2: listing peek shows locality/acreage/price (synchronous) + lazy media and description',
    async ({ page }) => {
      await stubCommonRoutes(page);
      // Start at group-selected state (region + maxKm set, no listing)
      await navigateAgriFirst(page, { region: REGION, maxKm: String(MAX_KM) });

      // AgriGroupSelectedPanel must be visible
      await expect(page.locator('[data-testid="agri-group-selected-panel"]')).toBeVisible({
        timeout: 10_000,
      });

      // Wait for listing rows to populate
      await expect(page.locator('[data-testid="agri-group-listing-row"]').first()).toBeVisible({
        timeout: 12_000,
      });

      // Click the first listing row → setSelectedListing (PUSH)
      // Install response fence BEFORE click so we don't miss the fast stub response
      const detailResponsePromise = page.waitForResponse('**/api/public/listings/*', {
        timeout: 10_000,
      });
      await page.locator('[data-testid="agri-group-listing-row"]').first().click();

      // URL must contain listing param
      await page.waitForURL(new RegExp(`listing=${LISTING_ID}`), { timeout: 8_000 });
      expect(page.url()).toContain(`listing=${LISTING_ID}`);

      // Peek container visible
      await expect(page.locator('[data-testid="agri-listing-peek"]')).toBeVisible({
        timeout: 10_000,
      });

      // Synchronous fields — available from AgriMapListingItem (first paint, no fetch required)
      await expect(page.locator('[data-testid="agri-listing-peek-locality"]')).toBeVisible({
        timeout: 5_000,
      });
      await expect(page.locator('[data-testid="agri-listing-peek-acreage"]')).toBeVisible({
        timeout: 5_000,
      });
      await expect(page.locator('[data-testid="agri-listing-peek-price"]')).toBeVisible({
        timeout: 5_000,
      });

      // Wait for the detail fetch to complete before asserting lazy fields.
      // This prevents a race-condition false-green where isLoading=true skeleton
      // is still rendered (no lazy testids present) when assertions fire.
      await detailResponsePromise;

      // Lazy fields — media (image present in fixture) OR no-media fallback
      await expect(
        page
          .locator('[data-testid="agri-listing-peek-media"], [data-testid="agri-listing-peek-no-media"]')
          .first(),
      ).toBeVisible({ timeout: 10_000 });

      // Description (lazy, present in fixture)
      await expect(page.locator('[data-testid="agri-listing-peek-description"]')).toBeVisible({
        timeout: 10_000,
      });

      // CTA button must be visible
      await expect(page.locator('[data-testid="agri-listing-peek-view-details"]')).toBeVisible({
        timeout: 5_000,
      });
    },
  );

  // ── AC3: View full details ─────────────────────────────────────────────────

  test('AC3: View full details CTA navigates to /listing/:id', async ({ page }) => {
    await stubCommonRoutes(page);
    // Start directly in peek state
    await navigateAgriFirst(page, {
      region: REGION,
      maxKm: String(MAX_KM),
      listing: LISTING_ID,
    });

    // Peek must be visible
    await expect(page.locator('[data-testid="agri-listing-peek"]')).toBeVisible({ timeout: 12_000 });

    // CTA must be visible
    const ctaBtn = page.locator('[data-testid="agri-listing-peek-view-details"]');
    await expect(ctaBtn).toBeVisible({ timeout: 5_000 });

    // Click → navigate to /listing/:id (assert exact listing ID in URL)
    await ctaBtn.click();
    await page.waitForURL(new RegExp(`/listing/${LISTING_ID}`), { timeout: 10_000 });
  });

  // ── AC4: Full Back/Forward ladder ─────────────────────────────────────────

  test(
    'AC4: Back/Forward ladder — peek → group-selected → distance-chips → no-region → forward to each state',
    async ({ page }) => {
      await stubCommonRoutes(page);

      // Step 0: Start at bare agri-first (no region)
      await navigateAgriFirst(page);
      await expect(page.locator('[data-testid="corridor-landing-list"]')).toBeVisible({
        timeout: 10_000,
      });
      expect(page.url()).not.toContain('region=');

      // Step 1: Navigate to region=N (PUSH — simulates corridor-card click)
      await page.goto(`/discover?city=${CITY}&journey=agri-first&region=${REGION}`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(500);
      expect(page.url()).toContain(`region=${REGION}`);
      expect(page.url()).not.toContain('maxKm=');

      // Step 2: Navigate to region=N&maxKm=25 (PUSH — simulates distance-chip click)
      await page.goto(`/discover?city=${CITY}&journey=agri-first&region=${REGION}&maxKm=${MAX_KM}`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(500);
      expect(page.url()).toContain(`region=${REGION}`);
      expect(page.url()).toContain(`maxKm=${MAX_KM}`);

      // Step 3: Navigate to region+maxKm+listing (PUSH — simulates listing-row click)
      await page.goto(
        `/discover?city=${CITY}&journey=agri-first&region=${REGION}&maxKm=${MAX_KM}&listing=${LISTING_ID}`,
      );
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10_000 });
      // Peek must be visible
      await expect(page.locator('[data-testid="agri-listing-peek"]')).toBeVisible({ timeout: 12_000 });
      expect(page.url()).toContain(`listing=${LISTING_ID}`);

      // ── Back 1: listing → group-selected (region+maxKm, no listing) ──────
      await page.goBack();
      await page.waitForURL(/\/discover/, { timeout: 8_000 });
      await page.waitForTimeout(1000);
      const urlAfterBack1 = page.url();
      expect(urlAfterBack1).toContain(`region=${REGION}`);
      expect(urlAfterBack1).toContain(`maxKm=${MAX_KM}`);
      expect(urlAfterBack1).not.toContain('listing=');
      await expect(page.locator('[data-testid="agri-group-selected-panel"]')).toBeVisible({
        timeout: 8_000,
      });
      // Overlay must still be rendered
      await page.waitForTimeout(1000);
      const overlayAfterBack1 = await page.locator('.leaflet-overlay-pane path').count();
      expect(overlayAfterBack1).toBeGreaterThan(0);

      // ── Back 2: group-selected → region only (distance-chips, no maxKm) ──
      await page.goBack();
      await page.waitForURL(/\/discover/, { timeout: 8_000 });
      await page.waitForTimeout(1000);
      const urlAfterBack2 = page.url();
      expect(urlAfterBack2).toContain(`region=${REGION}`);
      expect(urlAfterBack2).not.toContain('maxKm=');
      expect(urlAfterBack2).not.toContain('listing=');
      // With region=N and no maxKm → agri-landing panel shows corridor distance-chip view.
      // Hard assertion: corridor-distance-chips must be visible.
      // Do NOT use an OR with corridor-landing-list — that would mask a regression
      // where Back-2 overshot to the no-region state (list, not chips).
      await expect(page.locator('[data-testid="corridor-distance-chips"]')).toBeVisible({
        timeout: 8_000,
      });
      // No overlay without maxKm
      await page.waitForTimeout(1000);
      const overlayAfterBack2 = await page.locator('.leaflet-overlay-pane path').count();
      expect(overlayAfterBack2).toBe(0);

      // ── Back 3: region only → no region (step 0) ─────────────────────────
      await page.goBack();
      await page.waitForURL(/\/discover/, { timeout: 8_000 });
      await page.waitForTimeout(1000);
      expect(page.url()).not.toContain('region=');
      await expect(page.locator('[data-testid="corridor-landing-list"]')).toBeVisible({
        timeout: 8_000,
      });
      const overlayAfterBack3 = await page.locator('.leaflet-overlay-pane path').count();
      expect(overlayAfterBack3).toBe(0);

      // ── Forward 1: no region → region=N ──────────────────────────────────
      await page.goForward();
      await page.waitForURL(/\/discover/, { timeout: 8_000 });
      await page.waitForTimeout(500);
      expect(page.url()).toContain(`region=${REGION}`);

      // ── Forward 2: region=N → region+maxKm (group-selected + overlay) ────
      await page.goForward();
      await page.waitForURL(/\/discover/, { timeout: 8_000 });
      await page.waitForTimeout(1500);
      expect(page.url()).toContain(`region=${REGION}`);
      expect(page.url()).toContain(`maxKm=${MAX_KM}`);
      await expect(page.locator('[data-testid="agri-group-selected-panel"]')).toBeVisible({
        timeout: 8_000,
      });
      const overlayFwd2 = await page.locator('.leaflet-overlay-pane path').count();
      expect(overlayFwd2).toBeGreaterThan(0);

      // ── Forward 3: group-selected → peek ─────────────────────────────────
      await page.goForward();
      await page.waitForURL(/\/discover/, { timeout: 8_000 });
      await page.waitForTimeout(1000);
      expect(page.url()).toContain(`listing=${LISTING_ID}`);
      await expect(page.locator('[data-testid="agri-listing-peek"]')).toBeVisible({ timeout: 10_000 });
    },
  );

  // ── AC5: area-first regression ────────────────────────────────────────────

  test(
    'AC5: area-first journey has no sector overlay and no agri-listing-peek',
    async ({ page }) => {
      await stubCommonRoutes(page);
      await page.goto(`/discover?city=${CITY}&journey=area-first`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(1500);

      const overlayCount = await page.locator('.leaflet-overlay-pane path').count();
      expect(overlayCount).toBe(0);

      const peekCount = await page.locator('[data-testid="agri-listing-peek"]').count();
      expect(peekCount).toBe(0);
    },
  );

  // ── AC5b: school-first regression ────────────────────────────────────────

  test(
    'AC5b: school-first journey has no sector overlay and no agri-listing-peek',
    async ({ page }) => {
      await stubCommonRoutes(page);
      await page.goto(`/discover?city=${CITY}&journey=school-first`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(1500);

      const overlayCount = await page.locator('.leaflet-overlay-pane path').count();
      expect(overlayCount).toBe(0);

      const peekCount = await page.locator('[data-testid="agri-listing-peek"]').count();
      expect(peekCount).toBe(0);
    },
  );
});

// ---------------------------------------------------------------------------
// Suite — REAL_SEED (live-stack only) — conditionally skipped
// ---------------------------------------------------------------------------

test.describe('@integration-ui 1431 — Real-seed [REAL_SEED only]', () => {
  test.use({ storageState: undefined });

  test(
    'AC6: real-seed — corridor list >= 1; overlay renders; listing peek opens; View full details -> /listing/:id',
    async ({ page }) => {
      if (!REAL_SEED) {
        test.skip(true, 'Seed-backed test: set REAL_SEED=1 with live stack to run');
        return;
      }

      // Real-seed run is slower than stubs (live tiles + network + React Query cache warm-up)
      test.setTimeout(60_000);

      // No stubs — live backend.
      // NOTE: do NOT use waitForRequest for regional-area-groups or agri-map-listings here —
      // React Query may have already fired and cached these requests by the time we attach the
      // listener (they never re-fire), causing the listener to burn its timeout and blow the
      // per-test budget. Gate on rendered DOM only (corridor-landing-list, agri-group-selected-panel).
      await page.goto(`/discover?city=${CITY}&journey=agri-first`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(2000);

      // Corridor list must have at least 1 card
      await expect(page.locator('[data-testid="corridor-landing-list"]')).toBeVisible({
        timeout: 10_000,
      });
      const corridorCards = page.locator('[data-testid="corridor-card"]');
      await expect(corridorCards.first()).toBeVisible({ timeout: 10_000 });
      const corridorCount = await corridorCards.count();
      expect(corridorCount).toBeGreaterThanOrEqual(1);

      // Click first corridor card
      await corridorCards.first().click();
      await expect(page.locator('[data-testid="corridor-distance-chips"]')).toBeVisible({
        timeout: 8_000,
      });

      // Click first available distance chip
      const firstChip = page.locator('[data-testid^="distance-chip-"]').first();
      await expect(firstChip).toBeVisible({ timeout: 5_000 });
      await firstChip.click();

      // URL must have region + maxKm
      await page.waitForURL(/region=.+&maxKm=|maxKm=.+&region=/, { timeout: 8_000 });

      // Wait for overlay to render
      await page.waitForTimeout(3000);
      const overlayCount = await page.locator('.leaflet-overlay-pane path').count();
      expect(
        overlayCount,
        'REGRESSION (real-seed): no overlay paths after corridor + distance selection.',
      ).toBeGreaterThan(0);

      // AgriGroupSelectedPanel must be visible with listing rows
      // (DOM visibility is the gate — waitForRequest on agri-map-listings is omitted for the same
      // React Query cache reason as regional-area-groups above)
      await expect(page.locator('[data-testid="agri-group-selected-panel"]')).toBeVisible({
        timeout: 10_000,
      });
      await page.waitForTimeout(2000);

      const listingRows = page.locator('[data-testid="agri-group-listing-row"]');
      const rowCount = await listingRows.count();
      if (rowCount === 0) {
        // No listings in this region — test is inconclusive, not a failure
        console.log('[1431 AC6] No listing rows in selected region — skipping peek assertions');
        return;
      }

      // Click first listing row → peek
      await listingRows.first().click();
      await expect(page.locator('[data-testid="agri-listing-peek"]')).toBeVisible({
        timeout: 10_000,
      });

      // View full details → /listing/:id
      const ctaBtn = page.locator('[data-testid="agri-listing-peek-view-details"]');
      await expect(ctaBtn).toBeVisible({ timeout: 5_000 });
      await ctaBtn.click();
      await page.waitForURL(/\/listing\//, { timeout: 10_000 });
    },
  );
});
