/**
 * discover-agri-direction-first-1448.spec.ts
 *
 * E2E spec for issue #1448:
 * "v2-map-G — E2E hardening for direction-first 25 km default + in-place chips + sector fit"
 *
 * ACs verified:
 *   AC1  — direction card click opens selected-region in ONE click; no intermediate chip-pick
 *   AC2  — 25 km chip selected by default; listings visible; sector overlay rendered
 *   AC3  — chip switching 25→50→25 updates in place (URL, chip state, overlay, panel stays open)
 *   AC4  — listing peek open/close: close preserves region+maxKm, removes listing=
 *   AC5  — Back from selected-region returns to direction cards (NOT chip-pick intermediate)
 *   AC6  — deep-link ?region=N&maxKm=25 cold-load restores selected-region view
 *   AC7  — legacy ?group=N:10_25 cold-load canonicalises safely (OD-1 REPLACE)
 *   AC8  — agri-group-selected-clear returns to direction cards; all region state cleared
 *   AC9  — area-first journey: no sector overlay, no agri-listing-peek (regression)
 *   AC10 — school-first journey: no sector overlay, no agri-listing-peek (regression)
 *   AC11 — [REAL_SEED only] live-stack: one-click direction, chip switch, peek open/close
 *   AC12 — anon default: peek shows agri-listing-peek-price-signin; numeric price absent
 *
 * KEY CONTRACT (#1445): clicking a direction card calls onSetRegionWithMaxKm(directionCode)
 * which atomically PUSHes region=<DIR>&maxKm=25 in one step. The intermediate
 * corridor-distance-chips view (old two-step flow from pre-#1445) MUST NOT appear.
 * AC1 and AC5 both assert this via hard NOT-visible checks.
 *
 * URL contract (active v2):
 *   region=<DIR>         → PUSH (setRegion + default maxKm=25 atomically)
 *   maxKm=<N>            → PUSH (chip click updates maxKm in place)
 *   listing=<uuid>       → PUSH (row click opens peek)
 *   clearSelectedListing → REPLACE (peek close removes listing= only)
 *   clearRegionAndMaxKm  → PUSH (agri-group-selected-clear, removes region+maxKm+listing)
 *
 * Panel state machine:
 *   no region                 → agri-landing (corridor-landing-list)
 *   region + maxKm            → agri-group-selected (AgriGroupSelectedPanel)
 *   region + maxKm + listing  → agri-group-peek (AgriGroupListingPeek)
 *
 * Sibling specs:
 *   e2e/discover-agri-overlay-peek-journey-1431.spec.ts — overlay + peek, two-step flow reference
 *   e2e/discover-agri-grouped-journey-1412.spec.ts      — regional groups API contract
 *
 * REAL-SEED HEADLINE TEST (AC11):
 *   Required stack:
 *     1. bash scripts/restore-test-fixture.sh       (pg-test-fixture:5434)
 *     2. bash scripts/seed-agricultural-listings.sh (udupi: 7+ groups)
 *     3. backend on :8085 pointed at local fixture
 *     4. frontend dev server on :5174
 *   Command:
 *     REAL_SEED=1 bash scripts/run-e2e-local.sh --project=full \
 *       e2e/discover-agri-direction-first-1448.spec.ts
 *   Without REAL_SEED the real-seed test is skipped (all stubbed tests still run).
 *
 * Stub-only command:
 *   npx playwright test e2e/discover-agri-direction-first-1448.spec.ts --project=chromium
 */

import { test, expect, type Page, type Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

/** Set REAL_SEED=1 to enable the live-backend seed-backed headline test (AC11). */
const REAL_SEED = Boolean(process.env.REAL_SEED);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CITY = 'udupi';
const REGION = 'N';
const LISTING_ID = 'agri-1448-listing-001';
const AREA_KEY = 'IN|KA|Udupi|Manipal';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TRENDS_OPTIONS_FIXTURE = {
  city: CITY,
  defaultAreas: [{ areaKey: AREA_KEY, areaLabel: 'Manipal' }],
};

const DISCOVER_AREAS_FIXTURE = {
  city: CITY,
  areas: [{
    areaKey: AREA_KEY, name: 'Manipal',
    geoCenterLat: 13.3509, geoCenterLon: 74.7932,
    minLat: 13.33, maxLat: 13.38, minLon: 74.77, maxLon: 74.82,
    listingCount: 5, agriAcreage: 18.0, schoolCount: 0, trendDirection: 'stable',
  }],
};

const CITY_LISTINGS_FIXTURE = { city: CITY, limitPerArea: 50, areas: [] };

/**
 * CorridorGroupDTO shape (#1435) — all 4 distance tiers (10/25/50/100) required for AC3
 * chip-switch. groupName replaces deprecated label; directionCode replaces directionKey.
 */
const REGIONAL_AREA_GROUPS_FIXTURE = {
  city: CITY,
  groups: [{
    directionCode: 'N',
    groupName: 'N towards Brahmavar',
    availableMaxDistances: [
      { maxKm: 10, distanceLabel: 'Within 10 km', includedBandCodes: ['0_10'], listingCount: 2, areaKeys: [AREA_KEY] },
      { maxKm: 25, distanceLabel: 'Up to 25 km', includedBandCodes: ['0_10', '10_25'], listingCount: 5, areaKeys: [AREA_KEY] },
      { maxKm: 50, distanceLabel: 'Up to 50 km', includedBandCodes: ['0_10', '10_25', '25_50'], listingCount: 8, areaKeys: [AREA_KEY] },
      { maxKm: 100, distanceLabel: 'Up to 100 km', includedBandCodes: ['0_10', '10_25', '25_50', '50_up'], listingCount: 12, areaKeys: [AREA_KEY] },
    ],
  }],
};

/**
 * agri-map-listings fixture.
 * boundaryGeoJson: null on ALL items — isolates sector overlay from boundary polygon paths
 * so that .leaflet-overlay-pane path count reflects only the sector overlay polygon.
 */
const AGRI_MAP_LISTINGS_FIXTURE = {
  city: CITY,
  listings: [{
    id: LISTING_ID,
    locality: 'Manipal',
    landArea: 3.0,
    landAreaUnit: 'acres',
    pricePaise: 7500000,
    boundaryGeoJson: null,
    lat: 13.353,
    lon: 74.793,
    areaKey: AREA_KEY,
  }],
};

/**
 * AC12 anon variant — pricePaise: null triggers agri-listing-peek-price-signin affordance.
 * propertyType: 'agricultural_land' is required — the component checks this field to guard
 * whether the sign-in affordance should render (showSignInForPrice = isAgri && !isAuth && pricePaise == null).
 */
const AGRI_MAP_LISTINGS_ANON_FIXTURE = {
  city: CITY,
  listings: [{
    id: LISTING_ID,
    locality: 'Manipal',
    landArea: 3.0,
    landAreaUnit: 'acres',
    pricePaise: null,                            // explicit null → agri-listing-peek-price-signin renders
    propertyType: 'agricultural_land' as const,  // required for showSignInForPrice guard in component
    boundaryGeoJson: null,
    lat: 13.353,
    lon: 74.793,
    areaKey: AREA_KEY,
  }],
};

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
 * @param anonPrice  When true, serves AGRI_MAP_LISTINGS_ANON_FIXTURE (pricePaise: null) for AC12.
 */
async function stubCommonRoutes(page: Page, anonPrice = false) {
  await page.route('**/api/trends/options**', (r) => fulfillJson(r, 200, TRENDS_OPTIONS_FIXTURE));
  await page.route('**/api/discover/areas**', (r) => fulfillJson(r, 200, DISCOVER_AREAS_FIXTURE));
  await page.route('**/api/discover/cities/*/listings**', (r) => fulfillJson(r, 200, CITY_LISTINGS_FIXTURE));
  await page.route('**/api/discover/listings**', (r) => fulfillJson(r, 200, { content: [], totalElements: 0 }));
  await page.route('**/api/public/schools/**', (r) => fulfillJson(r, 200, []));
  await page.route('**/api/discover/regional-area-groups**', (r) => fulfillJson(r, 200, REGIONAL_AREA_GROUPS_FIXTURE));
  await page.route('**/api/discover/agri-map-listings**', (r) =>
    fulfillJson(r, 200, anonPrice ? AGRI_MAP_LISTINGS_ANON_FIXTURE : AGRI_MAP_LISTINGS_FIXTURE));
  await page.route('**/api/public/listings/*', (r) => fulfillJson(r, 200, AGRI_LISTING_DETAIL_FIXTURE));
}

/**
 * Navigate to agri-first Discover and wait for map + initial data load.
 * @param extraParams  Additional URL params (e.g. region, maxKm, listing).
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
  // Wait for regional-area-groups to fire (primary data dependency for agri-first)
  await page
    .waitForRequest('**/api/discover/regional-area-groups**', { timeout: 12_000 })
    .catch((e: Error) => console.warn('[1448] regional-area-groups not requested:', e.message));
}

// ---------------------------------------------------------------------------
// Suite — STUBBED
// ---------------------------------------------------------------------------

test.describe('@integration-ui 1448 — direction-first v2.1 — stubbed', () => {
  // Explicit anon flow — override any project-level storageState (e.g. user-auth.json from
  // global-setup) so that isAuthenticated=false in the component. Required for AC12 which
  // asserts the agri-listing-peek-price-signin affordance (only renders when !isAuthenticated).
  test.use({ storageState: undefined });

  // ── AC1: One-click direction → selected-region (NO intermediate chip-pick) ───

  test(
    'AC1: direction card click opens selected-region in ONE click; corridor-distance-chips must NOT appear',
    async ({ page }) => {
      await stubCommonRoutes(page);
      await navigateAgriFirst(page);

      // Corridor landing list must be visible before any click
      await expect(page.locator('[data-testid="corridor-landing-list"]')).toBeVisible({
        timeout: 10_000,
      });

      // agri-group-selected-panel must NOT be present before the click
      await expect(page.locator('[data-testid="agri-group-selected-panel"]')).toHaveCount(0);

      // Click the first corridor card
      const corridorCard = page.locator('[data-testid="corridor-card"]').first();
      await expect(corridorCard).toBeVisible({ timeout: 8_000 });
      await corridorCard.click();

      // URL must atomically contain BOTH region=N AND maxKm=25 (one-click contract)
      await page.waitForURL(
        new RegExp(`region=${REGION}.*maxKm=25|maxKm=25.*region=${REGION}`),
        { timeout: 8_000 },
      );
      const url = page.url();
      expect(url).toContain(`region=${REGION}`);
      expect(url).toContain('maxKm=25');

      // agri-group-selected-panel must be visible (one-click lands here)
      await expect(page.locator('[data-testid="agri-group-selected-panel"]')).toBeVisible({
        timeout: 10_000,
      });

      // HARD REGRESSION GUARD: corridor-distance-chips must NOT appear after a one-click
      // direction selection. If this assertion fails, the old two-step flow has regressed.
      await expect(page.locator('[data-testid="corridor-distance-chips"]')).not.toBeVisible();
    },
  );

  // ── AC2: 25 km chip selected by default; listings visible; sector overlay > 0 ─

  test(
    'AC2: 25 km chip selected by default; agri-group-listing-row visible; sector overlay paths > 0',
    async ({ page }) => {
      await stubCommonRoutes(page);
      await navigateAgriFirst(page, { region: REGION, maxKm: '25' });

      // agri-group-selected-panel must be visible
      await expect(page.locator('[data-testid="agri-group-selected-panel"]')).toBeVisible({
        timeout: 10_000,
      });

      // 25 km chip must have aria-pressed="true" (string form, not boolean)
      const chip25 = page.locator('[data-testid="distance-chip-25"]');
      await expect(chip25).toHaveAttribute('aria-pressed', 'true');

      // 50 km chip must have aria-pressed="false"
      const chip50 = page.locator('[data-testid="distance-chip-50"]');
      await expect(chip50).toHaveAttribute('aria-pressed', 'false');

      // At least one listing row must be visible from the fixture
      const listingRows = page.locator('[data-testid="agri-group-listing-row"]');
      const rowCount = await listingRows.count();
      if (rowCount === 0) {
        throw new Error('FIXTURE PRECONDITION FAILED: no listing rows rendered — check AGRI_MAP_LISTINGS_FIXTURE');
      }
      await expect(listingRows.first()).toBeVisible({ timeout: 8_000 });

      // Sector overlay must render at least one path (POSITIVE spy).
      // Use waitForFunction to avoid a fixed sleep as the sole gate.
      await page.waitForFunction(
        () => document.querySelectorAll('.leaflet-overlay-pane path').length > 0,
        { timeout: 8_000 },
      );
      const overlayCount = await page.locator('.leaflet-overlay-pane path').count();
      expect(
        overlayCount,
        'REGRESSION: no sector overlay paths after region+maxKm=25 selection. ' +
        'Sector overlay component may not be mounted or the stub did not trigger render.',
      ).toBeGreaterThan(0);
    },
  );

  // ── AC3: Chip switch 25→50→25 updates in place ───────────────────────────────

  test(
    'AC3: chip switching 25→50→25 updates URL, chip aria-pressed, overlay, panel stays open',
    async ({ page }) => {
      await stubCommonRoutes(page);
      await navigateAgriFirst(page, { region: REGION, maxKm: '25' });

      // Verify initial state
      await expect(page.locator('[data-testid="agri-group-selected-panel"]')).toBeVisible({
        timeout: 10_000,
      });

      // ── Switch to 50 km ──────────────────────────────────────────────────────
      const chip50 = page.locator('[data-testid="distance-chip-50"]');
      await expect(chip50).toBeVisible({ timeout: 5_000 });
      await chip50.click();

      await page.waitForURL(/maxKm=50/, { timeout: 8_000 });
      expect(page.url()).toContain('maxKm=50');

      // Panel must stay open (agri-group-selected-panel persists across chip switches)
      await expect(page.locator('[data-testid="agri-group-selected-panel"]')).toBeVisible({
        timeout: 5_000,
      });

      // aria-pressed state updated
      await expect(page.locator('[data-testid="distance-chip-50"]')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('[data-testid="distance-chip-25"]')).toHaveAttribute('aria-pressed', 'false');

      // Listings still present
      await expect(page.locator('[data-testid="agri-group-listing-row"]').first()).toBeVisible({
        timeout: 8_000,
      });

      // Sector overlay still present after switching to 50 km
      await page.waitForFunction(
        () => document.querySelectorAll('.leaflet-overlay-pane path').length > 0,
        { timeout: 8_000 },
      );
      expect(
        await page.locator('.leaflet-overlay-pane path').count(),
        'REGRESSION: sector overlay absent after switching to maxKm=50',
      ).toBeGreaterThan(0);

      // ── Switch back to 25 km ─────────────────────────────────────────────────
      const chip25 = page.locator('[data-testid="distance-chip-25"]');
      await chip25.click();

      await page.waitForURL(/maxKm=25/, { timeout: 8_000 });
      expect(page.url()).toContain('maxKm=25');

      // aria-pressed back to 25 km
      await expect(page.locator('[data-testid="distance-chip-25"]')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('[data-testid="distance-chip-50"]')).toHaveAttribute('aria-pressed', 'false');

      // Listing row still visible
      await expect(page.locator('[data-testid="agri-group-listing-row"]').first()).toBeVisible({
        timeout: 8_000,
      });

      // Overlay still present after switching back to 25 km
      await page.waitForFunction(
        () => document.querySelectorAll('.leaflet-overlay-pane path').length > 0,
        { timeout: 8_000 },
      );
      expect(
        await page.locator('.leaflet-overlay-pane path').count(),
        'REGRESSION: sector overlay absent after switching back to maxKm=25',
      ).toBeGreaterThan(0);
    },
  );

  // ── AC4: Peek open/close — close preserves region+maxKm, removes listing= ──

  test(
    'AC4: listing peek open/close — close preserves region+maxKm, removes listing=',
    async ({ page }) => {
      await stubCommonRoutes(page);
      await navigateAgriFirst(page, { region: REGION, maxKm: '25' });

      await expect(page.locator('[data-testid="agri-group-selected-panel"]')).toBeVisible({
        timeout: 10_000,
      });

      // Wait for listing rows to appear
      await expect(page.locator('[data-testid="agri-group-listing-row"]').first()).toBeVisible({
        timeout: 12_000,
      });

      // Install detail response fence BEFORE click to avoid missing fast stub response
      const detailResponsePromise = page.waitForResponse('**/api/public/listings/*', {
        timeout: 10_000,
      });

      // Click first listing row → PUSH listing= into URL
      await page.locator('[data-testid="agri-group-listing-row"]').first().click();

      // URL must contain listing= param
      await page.waitForURL(/listing=/, { timeout: 8_000 });
      expect(page.url()).toContain('listing=');

      // Peek container must be visible
      await expect(page.locator('[data-testid="agri-listing-peek"]')).toBeVisible({
        timeout: 10_000,
      });

      // Must still be on /discover (not auto-navigated to /listing/:id)
      expect(page.url()).toContain('/discover');

      // CTA and close buttons must be present
      await expect(page.locator('[data-testid="agri-listing-peek-view-details"]')).toBeVisible({
        timeout: 5_000,
      });
      await expect(page.locator('[data-testid="agri-listing-peek-close"]')).toBeVisible({
        timeout: 5_000,
      });

      // Await the detail response to ensure lazy fields have loaded before close
      await detailResponsePromise;

      // Click close — REPLACE removes listing= only, preserving region+maxKm
      await page.locator('[data-testid="agri-listing-peek-close"]').click();

      // listing= must be absent after close
      await page.waitForURL((url) => !url.toString().includes('listing='), { timeout: 5_000 });
      const urlAfterClose = page.url();
      expect(urlAfterClose).not.toContain('listing=');

      // region and maxKm must be preserved
      expect(urlAfterClose).toContain(`region=${REGION}`);
      expect(urlAfterClose).toContain('maxKm=25');

      // Panel returns to agri-group-selected (peek gone)
      await expect(page.locator('[data-testid="agri-group-selected-panel"]')).toBeVisible({
        timeout: 5_000,
      });
      await expect(page.locator('[data-testid="agri-listing-peek"]')).toHaveCount(0);
    },
  );

  // ── AC5: Back from selected-region → direction cards (NOT chip-pick) ──────────

  test(
    'AC5: Back from selected-region returns to corridor-landing-list; corridor-distance-chips must NOT appear',
    async ({ page }) => {
      await stubCommonRoutes(page);
      await navigateAgriFirst(page);

      // Start at landing — corridor list visible
      await expect(page.locator('[data-testid="corridor-landing-list"]')).toBeVisible({
        timeout: 10_000,
      });

      // Click first corridor card (one-click atomically sets region + maxKm=25)
      const corridorCard = page.locator('[data-testid="corridor-card"]').first();
      await expect(corridorCard).toBeVisible({ timeout: 8_000 });
      await corridorCard.click();

      // Wait for one-click transition (both region and maxKm set atomically)
      await page.waitForURL(
        new RegExp(`region=${REGION}.*maxKm=25|maxKm=25.*region=${REGION}`),
        { timeout: 8_000 },
      );
      await expect(page.locator('[data-testid="agri-group-selected-panel"]')).toBeVisible({
        timeout: 10_000,
      });

      // Navigate Back
      await page.goBack();
      // Wait for URL to drop region= — deterministic gate vs fixed sleep
      await page.waitForURL((u) => !u.href.includes('region='), { timeout: 8_000 });

      // URL must not have region or maxKm
      const urlAfterBack = page.url();
      expect(urlAfterBack).not.toContain('region=');
      expect(urlAfterBack).not.toContain('maxKm=');

      // Corridor landing list must be visible again
      await expect(page.locator('[data-testid="corridor-landing-list"]')).toBeVisible({
        timeout: 8_000,
      });

      // HARD REGRESSION GUARD: corridor-distance-chips must NOT be visible after Back.
      // If this fails, Back has stranded the user on the old intermediate chip-pick state.
      await expect(page.locator('[data-testid="corridor-distance-chips"]')).not.toBeVisible();

      // agri-group-selected-panel must not be present
      await expect(page.locator('[data-testid="agri-group-selected-panel"]')).toHaveCount(0);
    },
  );

  // ── AC6: Deep-link ?region=N&maxKm=25 cold-load restores selected-region ─────

  test(
    'AC6: deep-link ?region=N&maxKm=25 cold-load restores agri-group-selected-panel',
    async ({ page }) => {
      await stubCommonRoutes(page);
      await navigateAgriFirst(page, { region: REGION, maxKm: '25' });

      // agri-group-selected-panel must be visible on cold load with these params
      await expect(page.locator('[data-testid="agri-group-selected-panel"]')).toBeVisible({
        timeout: 10_000,
      });

      // 25 km chip must be pre-selected
      await expect(page.locator('[data-testid="distance-chip-25"]')).toHaveAttribute('aria-pressed', 'true');

      // Listing rows must be populated from fixture
      const listingRows = page.locator('[data-testid="agri-group-listing-row"]');
      const rowCount = await listingRows.count();
      if (rowCount === 0) {
        throw new Error('FIXTURE PRECONDITION FAILED: no listing rows on deep-link cold load');
      }

      // Sector overlay must render (waitForFunction instead of blind timeout)
      await page.waitForFunction(
        () => document.querySelectorAll('.leaflet-overlay-pane path').length > 0,
        { timeout: 8_000 },
      );
      expect(
        await page.locator('.leaflet-overlay-pane path').count(),
        'REGRESSION: sector overlay absent on deep-link cold load with region+maxKm',
      ).toBeGreaterThan(0);
    },
  );

  // ── AC7: Legacy ?group=N:10_25 cold-load canonicalises safely (OD-1 REPLACE) ─

  test(
    'AC7: legacy ?group=N:10_25 cold-load canonicalises to region=N; group= param removed',
    async ({ page }) => {
      await stubCommonRoutes(page);

      // Navigate with the legacy group= param format (pre-#1445 shape)
      await page.goto(`/discover?city=${CITY}&journey=agri-first&group=N:10_25`);
      await page.waitForLoadState('domcontentloaded');
      // Allow Leaflet to mount before checking URL
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10_000 });

      // OD-1 useEffect REPLACE fires on mount → URL should canonicalise to region=N
      await page.waitForURL(/region=N/, { timeout: 8_000 });

      // Legacy group= param must have been removed from the URL
      expect(page.url()).not.toContain('group=');

      // Canonical region=N must be present
      expect(page.url()).toContain('region=N');

      // OD-1 canonicalisation also sets maxKm=25 default — confirm full URL contract
      expect(page.url()).toContain('maxKm=');

      // Journey must not be broken — either landing list or selected panel must be visible
      const landingVisible = await page.locator('[data-testid="corridor-landing-list"]').isVisible({ timeout: 5_000 }).catch(() => false);
      const selectedVisible = await page.locator('[data-testid="agri-group-selected-panel"]').isVisible({ timeout: 5_000 }).catch(() => false);
      expect(
        landingVisible || selectedVisible,
        'REGRESSION: neither corridor-landing-list nor agri-group-selected-panel is visible after legacy group= canonicalisation',
      ).toBe(true);

      // Must still be on /discover (not redirected away)
      expect(page.url()).toContain('/discover');
    },
  );

  // ── AC8: agri-group-selected-clear returns to direction cards ─────────────────

  test(
    'AC8: agri-group-selected-clear removes all region state and returns to corridor-landing-list',
    async ({ page }) => {
      await stubCommonRoutes(page);
      await navigateAgriFirst(page, { region: REGION, maxKm: '25' });

      await expect(page.locator('[data-testid="agri-group-selected-panel"]')).toBeVisible({
        timeout: 10_000,
      });

      // Clear button must be visible in the selected-region panel
      const clearBtn = page.locator('[data-testid="agri-group-selected-clear"]');
      await expect(clearBtn).toBeVisible({ timeout: 5_000 });
      await clearBtn.click();

      // Wait for URL to drop region= — deterministic gate vs fixed sleep
      await page.waitForURL((u) => !u.href.includes('region='), { timeout: 8_000 });

      // URL must have no region, maxKm, or listing params
      const urlAfterClear = page.url();
      expect(urlAfterClear).not.toContain('region=');
      expect(urlAfterClear).not.toContain('maxKm=');
      expect(urlAfterClear).not.toContain('listing=');

      // Corridor landing list must be visible
      await expect(page.locator('[data-testid="corridor-landing-list"]')).toBeVisible({
        timeout: 8_000,
      });

      // agri-group-selected-panel must be gone
      await expect(page.locator('[data-testid="agri-group-selected-panel"]')).toHaveCount(0);
    },
  );

  // ── AC9: area-first journey — no sector overlay, no agri-listing-peek ─────────

  test(
    'AC9: area-first journey has no sector overlay and no agri-listing-peek (regression)',
    async ({ page }) => {
      await stubCommonRoutes(page);
      await page.goto(`/discover?city=${CITY}&journey=area-first`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10_000 });
      // Confirm Leaflet overlay pane is attached before asserting zero paths
      await expect(page.locator('.leaflet-overlay-pane')).toBeAttached({ timeout: 5_000 });
      await page.waitForLoadState('networkidle');

      const overlayCount = await page.locator('.leaflet-overlay-pane path').count();
      expect(overlayCount).toBe(0);

      const peekCount = await page.locator('[data-testid="agri-listing-peek"]').count();
      expect(peekCount).toBe(0);

      const selectedCount = await page.locator('[data-testid="agri-group-selected-panel"]').count();
      expect(selectedCount).toBe(0);
    },
  );

  // ── AC10: school-first journey — no sector overlay, no agri-listing-peek ──────

  test(
    'AC10: school-first journey has no sector overlay and no agri-listing-peek (regression)',
    async ({ page }) => {
      await stubCommonRoutes(page);
      await page.goto(`/discover?city=${CITY}&journey=school-first`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10_000 });
      // Confirm Leaflet overlay pane is attached before asserting zero paths
      await expect(page.locator('.leaflet-overlay-pane')).toBeAttached({ timeout: 5_000 });
      await page.waitForLoadState('networkidle');

      const overlayCount = await page.locator('.leaflet-overlay-pane path').count();
      expect(overlayCount).toBe(0);

      const peekCount = await page.locator('[data-testid="agri-listing-peek"]').count();
      expect(peekCount).toBe(0);
    },
  );

  // ── AC12: Anon — peek shows price-signin affordance; numeric price absent ──────

  test(
    'AC12: anon default (pricePaise: null) — peek shows agri-listing-peek-price-signin; numeric price absent',
    async ({ page }) => {
      // Stubs must be set up BEFORE navigation — use anonPrice=true for null pricePaise
      await stubCommonRoutes(page, true);
      await navigateAgriFirst(page, { region: REGION, maxKm: '25' });

      await expect(page.locator('[data-testid="agri-group-selected-panel"]')).toBeVisible({
        timeout: 10_000,
      });

      // Wait for listing rows from the anon fixture
      await expect(page.locator('[data-testid="agri-group-listing-row"]').first()).toBeVisible({
        timeout: 12_000,
      });

      // Click first listing row to open peek
      await page.locator('[data-testid="agri-group-listing-row"]').first().click();

      // URL must contain listing= param
      await page.waitForURL(/listing=/, { timeout: 8_000 });

      // Peek container must be visible
      await expect(page.locator('[data-testid="agri-listing-peek"]')).toBeVisible({
        timeout: 10_000,
      });

      // Price sign-in affordance must be visible (pricePaise: null → Lock + "Sign in to view price")
      await expect(page.locator('[data-testid="agri-listing-peek-price-signin"]')).toBeVisible({
        timeout: 8_000,
      });

      // Numeric price element must NOT be present for anon with null pricePaise
      await expect(page.locator('[data-testid="agri-listing-peek-price"]')).toHaveCount(0);

      // Note: survey field is not present in AgriGroupListingPeek at all — no survey testid to assert
    },
  );
});

// ---------------------------------------------------------------------------
// Suite — REAL_SEED (live-stack only, skipped unless REAL_SEED=1)
// ---------------------------------------------------------------------------

test.describe('@integration-ui 1448 — Real-seed [REAL_SEED only]', () => {
  test.use({ storageState: undefined });

  test(
    'AC11: real-seed — one-click direction, chip switch 25→50, listing peek open/close',
    async ({ page }) => {
      if (!REAL_SEED) {
        test.skip(true, 'Set REAL_SEED=1 with live stack to run');
        return;
      }

      // Real-seed run is slower than stubs (live tiles + network + React Query warm-up)
      test.setTimeout(60_000);

      // No stubs — live backend.
      // NOTE: do NOT use waitForRequest for regional-area-groups or agri-map-listings here —
      // React Query may have already fired and cached these before the listener attaches,
      // causing 30s timeout though the product works. Gate on rendered DOM only.
      await page.goto(`/discover?city=${CITY}&journey=agri-first`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 15_000 });
      // Allow React Query cache warm-up and map tiles to settle
      await page.waitForTimeout(2000);

      // Corridor landing must be visible with at least 1 card
      await expect(page.locator('[data-testid="corridor-landing-list"]')).toBeVisible({
        timeout: 10_000,
      });
      const corridorCards = page.locator('[data-testid="corridor-card"]');
      await expect(corridorCards.first()).toBeVisible({ timeout: 10_000 });

      const corridorCount = await corridorCards.count();
      if (corridorCount === 0) {
        throw new Error(
          'FIXTURE PRECONDITION FAILED: no corridor cards rendered — ' +
          'ensure restore-test-fixture.sh + seed-agricultural-listings.sh have been run',
        );
      }

      // Click first corridor card — one-click atomically sets region + maxKm=25
      await corridorCards.first().click();
      await page.waitForURL(/region=.+&maxKm=25|maxKm=25&.*region=/, { timeout: 10_000 });

      // agri-group-selected-panel must appear directly (no intermediate chip-pick)
      await expect(page.locator('[data-testid="agri-group-selected-panel"]')).toBeVisible({
        timeout: 10_000,
      });

      // 25 km chip must be pre-selected by default
      await expect(page.locator('[data-testid="distance-chip-25"]')).toHaveAttribute('aria-pressed', 'true');

      // Allow agri-map-listings to load listing rows from live backend
      await page.waitForTimeout(2000);

      const listingRows = page.locator('[data-testid="agri-group-listing-row"]');
      const rowCount = await listingRows.count();
      if (rowCount === 0) {
        throw new Error(
          'FIXTURE PRECONDITION FAILED: no agri listings found for selected corridor — ' +
          'seed may be incomplete or backend not pointed at local fixture',
        );
      }

      // Sector overlay must be present after loading region data
      await page.waitForFunction(
        () => document.querySelectorAll('.leaflet-overlay-pane path').length > 0,
        { timeout: 8_000 },
      );
      expect(
        await page.locator('.leaflet-overlay-pane path').count(),
        'REGRESSION (real-seed): sector overlay absent after one-click corridor selection',
      ).toBeGreaterThan(0);

      // ── Switch to 50 km chip ─────────────────────────────────────────────────
      const chip50 = page.locator('[data-testid="distance-chip-50"]');
      await expect(chip50).toBeVisible({ timeout: 5_000 });
      await chip50.click();

      await page.waitForURL(/maxKm=50/, { timeout: 8_000 });
      await expect(page.locator('[data-testid="distance-chip-50"]')).toHaveAttribute('aria-pressed', 'true');

      // Allow listing rows and overlay to update for the wider 50 km band
      await page.waitForTimeout(1500);
      expect(
        await page.locator('.leaflet-overlay-pane path').count(),
        'REGRESSION (real-seed): sector overlay absent after chip switch to maxKm=50',
      ).toBeGreaterThan(0);

      // ── Open listing peek ────────────────────────────────────────────────────
      const firstRow = listingRows.first();
      await expect(firstRow).toBeVisible({ timeout: 5_000 });
      await firstRow.click();

      await expect(page.locator('[data-testid="agri-listing-peek"]')).toBeVisible({
        timeout: 10_000,
      });

      // Must still be on /discover — no auto-navigation to /listing/:id
      expect(page.url()).toContain('/discover');

      // ── Close peek — region and maxKm must be preserved ─────────────────────
      await page.locator('[data-testid="agri-listing-peek-close"]').click();

      // Allow React to settle after close (REPLACE removes listing= only)
      await page.waitForTimeout(1000);

      const urlAfterClose = page.url();
      expect(urlAfterClose).not.toContain('listing=');

      // region and maxKm must be preserved after close
      expect(urlAfterClose).toContain('region=');
      expect(urlAfterClose).toContain('maxKm=');

      // agri-group-selected-panel must still be visible
      await expect(page.locator('[data-testid="agri-group-selected-panel"]')).toBeVisible({
        timeout: 5_000,
      });
    },
  );
});
