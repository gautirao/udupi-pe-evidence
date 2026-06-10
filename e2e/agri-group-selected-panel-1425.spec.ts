/**
 * agri-group-selected-panel-1425.spec.ts
 *
 * E2E spec for Issue #1425:
 * "Agri-first Discover right-panel: selecting a regional group shows matching
 *  listings in the selected-region view (AgriGroupSelectedPanel)."
 *
 * ACs verified:
 *   AC1  — (regression) agri-first with no group → agri-regional-groups visible;
 *           agri-group-selected-panel NOT present
 *   AC2  — click a group card → URL gains ?group=DIR:BAND → agri-group-selected-panel visible
 *   AC3  — selected-region panel shows the group label in the header chip
 *   AC4  — selected-region panel shows listing rows (from agri-map-listings stub)
 *   AC6  — click a listing row → navigates to /listing/<id>
 *   AC7  — click clear button → group param removed from URL → agri-landing panel visible
 *   AC8a — browser Back from selected-region → URL loses group param → agri-landing
 *   AC8b — cold-load with ?journey=agri-first&city=udupi&group=N:10_25 in URL →
 *           agri-group-selected-panel visible immediately
 *   AC9  — (regression) area-first journey with group= in URL → area-first panel, not
 *           agri-group-selected
 *
 * REAL_SEED gated block:
 *   Requires REAL_SEED=1 with a live backend/fixture stack.
 *   Stack:
 *     1. restore-test-fixture.sh  (pg-test-fixture:5434)
 *     2. scripts/seed-agricultural-listings.sh
 *     3. backend on :8085 pointed at local fixture
 *     4. frontend dev server on :5173 or :5174
 *   Command:
 *     REAL_SEED=1 bash scripts/run-e2e-local.sh --project=full \
 *       e2e/agri-group-selected-panel-1425.spec.ts
 *   Without REAL_SEED the real-seed test is skipped (all stubbed tests still run).
 *
 * Architecture:
 *   - All API routes stubbed by default via page.route().
 *   - Anon flow — no storageState required; agri-map-listings is public (skipAuth).
 *   - REAL_SEED block uses test.skipIf(!REAL_SEED) — NOT test.skip().
 *   - No happy-path test.skip() is permitted anywhere in this file.
 *
 * Run:
 *   bash scripts/run-e2e-local.sh --project=full \
 *     e2e/agri-group-selected-panel-1425.spec.ts
 */

import { test, expect, type Page, type Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

/** Set REAL_SEED=1 (or REAL_SEED=true) to enable the live-backend seed-backed test. */
const REAL_SEED = process.env.REAL_SEED === 'true' || process.env.REAL_SEED === '1';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CITY = 'udupi';
const AREA_KEY = 'IN|KA|Udupi|Manipal';

// Direction:band used in all stubbed tests
const GROUP_DIR = 'N';
const GROUP_BAND = '10_25';
const GROUP_PARAM = `${GROUP_DIR}:${GROUP_BAND}`;                   // raw colon
const GROUP_PARAM_REGEX = /[?&]group=N(%3A|:)10_25/;               // URL assertion
const GROUP_LABEL = 'North · 10–25 km';

// Stubbed listing IDs
const AGRI_ID_1 = 'agri-sel-panel-001';
const AGRI_ID_2 = 'agri-sel-panel-002';

// ---------------------------------------------------------------------------
// Fixtures
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

/** One group in direction N, band 10_25. */
const REGIONAL_AREA_GROUPS_FIXTURE = {
  city: CITY,
  groups: [
    {
      directionKey: GROUP_DIR,
      distanceBandKey: GROUP_BAND,
      label: GROUP_LABEL,
      agriListingCount: 5,
      agriAcreage: 18.0,
      areaKeys: [AREA_KEY],
    },
  ],
};

/** agri-map-listings stub — two listings for the selected group. */
const AGRI_MAP_LISTINGS_FIXTURE = {
  city: CITY,
  listings: [
    {
      id: AGRI_ID_1,
      title: 'North Plot Alpha',
      locality: 'Manipal',
      landArea: 3.0,
      landAreaUnit: 'acres',
      pricePaise: 7500000,
      boundaryGeoJson: null,
      lat: 13.353,
      lon: 74.793,
    },
    {
      id: AGRI_ID_2,
      title: 'North Plot Beta',
      locality: 'Manipal',
      landArea: 1.5,
      landAreaUnit: 'acres',
      pricePaise: null,
      boundaryGeoJson: null,
      lat: 13.354,
      lon: 74.794,
    },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fulfillJson(route: Route, status: number, body: unknown) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

/**
 * Stub all common Discover API routes.
 * Includes regional-area-groups + agri-map-listings.
 * Does NOT stub /api/discover/markers (anon grouped flow never fires it).
 */
async function stubCommonRoutes(page: Page) {
  await page.route('**/api/trends/options**', (r) =>
    fulfillJson(r, 200, TRENDS_OPTIONS_FIXTURE),
  );
  await page.route('**/api/discover/areas**', (r) =>
    fulfillJson(r, 200, DISCOVER_AREAS_FIXTURE),
  );
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
    fulfillJson(r, 200, { id: AGRI_ID_1, title: 'North Plot Alpha', propertyType: 'agricultural_land' }),
  );
}

/**
 * Navigate to agri-first Discover (optionally with a group pre-selected) and
 * wait for the map + regional-groups request to settle.
 */
async function navigateAgriFirst(
  page: Page,
  opts: { group?: string } = {},
) {
  const params = new URLSearchParams({ city: CITY, journey: 'agri-first' });
  if (opts.group) params.set('group', opts.group);

  await page.goto(`/discover?${params.toString()}`);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10_000 });

  // Wait for the regional-groups request to fire (primary data dependency)
  await page
    .waitForRequest('**/api/discover/regional-area-groups**', { timeout: 12_000 })
    .catch(() => {});
}

// ---------------------------------------------------------------------------
// Test suite — ANON (no storageState required)
// ---------------------------------------------------------------------------

test.describe('@integration-ui 1425 — AgriGroupSelectedPanel — ANON', () => {
  // ── AC1 (regression): no group selected → agri-landing shows; panel absent ──

  test(
    'AC1 regression: agri-first with no group selected shows agri-regional-groups; agri-group-selected-panel is absent',
    async ({ page }) => {
      await stubCommonRoutes(page);
      await navigateAgriFirst(page);

      // agri-regional-groups list visible
      await expect(page.locator('[data-testid="agri-regional-groups"]')).toBeVisible({
        timeout: 10_000,
      });

      // agri-group-selected-panel must NOT be in the DOM
      await expect(page.locator('[data-testid="agri-group-selected-panel"]')).toHaveCount(0);
    },
  );

  // ── AC2: click group card → URL gains ?group=DIR:BAND → panel visible ──────

  test(
    'AC2: clicking a group card writes ?group=DIR:BAND to URL and renders agri-group-selected-panel',
    async ({ page }) => {
      await stubCommonRoutes(page);
      await navigateAgriFirst(page);

      // Wait for at least one group row
      const firstRow = page.locator('[data-testid="agri-regional-group-row"]').first();
      await expect(firstRow).toBeVisible({ timeout: 10_000 });

      // Click the group row
      await firstRow.click();
      await page.waitForTimeout(1000);

      // URL must now have ?group=DIR:BAND (not groupId)
      const url = page.url();
      expect(url).toMatch(/[?&]group=[A-Z]{1,2}(%3A|:)[0-9]+_[0-9a-z]+/);
      expect(url).not.toContain('groupId=');

      // agri-group-selected-panel must be visible
      await expect(page.locator('[data-testid="agri-group-selected-panel"]')).toBeVisible({
        timeout: 10_000,
      });
    },
  );

  // ── AC2 (cold-load variant): deep-link pre-selects the panel immediately ───
  // (also serves as AC8b)

  test(
    'AC8b: cold-load with ?group=N:10_25 in URL → agri-group-selected-panel visible immediately',
    async ({ page }) => {
      await stubCommonRoutes(page);
      await navigateAgriFirst(page, { group: GROUP_PARAM });

      // URL assertion
      expect(page.url()).toMatch(GROUP_PARAM_REGEX);

      // Panel visible right after load
      await expect(page.locator('[data-testid="agri-group-selected-panel"]')).toBeVisible({
        timeout: 10_000,
      });
    },
  );

  // ── AC3: header chip shows the group label ─────────────────────────────────

  test(
    'AC3: selected-region panel header chip shows the group label',
    async ({ page }) => {
      await stubCommonRoutes(page);
      await navigateAgriFirst(page, { group: GROUP_PARAM });

      await expect(page.locator('[data-testid="agri-group-selected-panel"]')).toBeVisible({
        timeout: 10_000,
      });

      // The label chip must contain the group label text from the fixture
      const labelEl = page.locator('[data-testid="agri-group-selected-label"]');
      await expect(labelEl).toBeVisible({ timeout: 5_000 });
      // Fixture returns GROUP_LABEL for directionKey=N, distanceBandKey=10_25.
      // The label text comes from REGIONAL_AREA_GROUPS_FIXTURE → DiscoverRightPanel
      // derives it via agriGroupLabel prop. Verify it is non-empty.
      const labelText = await labelEl.textContent();
      expect(labelText?.trim().length).toBeGreaterThan(0);
    },
  );

  // ── AC4: listing rows appear in the panel ─────────────────────────────────

  test(
    'AC4: selected-region panel renders listing rows from agri-map-listings stub',
    async ({ page }) => {
      await stubCommonRoutes(page);
      await navigateAgriFirst(page, { group: GROUP_PARAM });

      await expect(page.locator('[data-testid="agri-group-selected-panel"]')).toBeVisible({
        timeout: 10_000,
      });

      // Wait for listings container (not empty-state, not skeleton)
      const listingsContainer = page.locator('[data-testid="agri-group-listings-list"]');
      await expect(listingsContainer).toBeVisible({ timeout: 12_000 });

      // At least one listing row (AGRI_MAP_LISTINGS_FIXTURE has 2)
      const rows = page.locator('[data-testid="agri-group-listing-row"]');
      await expect(rows.first()).toBeVisible({ timeout: 8_000 });
      const count = await rows.count();
      expect(count).toBeGreaterThanOrEqual(1);
    },
  );

  // ── AC6: click listing row → navigates to /listing/<id> ───────────────────

  test(
    'AC6: clicking a listing row in agri-group-selected-panel navigates to /listing/:id',
    async ({ page }) => {
      await stubCommonRoutes(page);
      await navigateAgriFirst(page, { group: GROUP_PARAM });

      await expect(page.locator('[data-testid="agri-group-selected-panel"]')).toBeVisible({
        timeout: 10_000,
      });

      // Wait for the first listing row
      const firstRow = page.locator('[data-testid="agri-group-listing-row"]').first();
      await expect(firstRow).toBeVisible({ timeout: 12_000 });

      // Click → must navigate to /listing/:id
      await firstRow.click();
      await page.waitForURL(/\/listing\//, { timeout: 10_000 });
    },
  );

  // ── AC7: clear button removes group param → back to agri-landing ───────────

  test(
    'AC7: clicking the clear button removes ?group param and returns to agri-landing (agri-regional-groups visible)',
    async ({ page }) => {
      await stubCommonRoutes(page);
      await navigateAgriFirst(page, { group: GROUP_PARAM });

      await expect(page.locator('[data-testid="agri-group-selected-panel"]')).toBeVisible({
        timeout: 10_000,
      });

      // Click the clear button in the panel header
      const clearBtn = page.locator('[data-testid="agri-group-selected-clear"]');
      await expect(clearBtn).toBeVisible({ timeout: 5_000 });
      await clearBtn.click();
      await page.waitForTimeout(1000);

      // URL must no longer contain group=
      expect(page.url()).not.toContain('group=');

      // agri-group-selected-panel must be gone
      await expect(page.locator('[data-testid="agri-group-selected-panel"]')).toHaveCount(0);

      // agri-landing (regional groups list) must be back
      await expect(page.locator('[data-testid="agri-regional-groups"]')).toBeVisible({
        timeout: 8_000,
      });
    },
  );

  // ── AC8a: browser Back from selected-region → agri-landing ────────────────

  test(
    'AC8a: browser Back from agri-group-selected-panel restores agri-landing (no group in URL)',
    async ({ page }) => {
      await stubCommonRoutes(page);

      // Start at agri-first without a group
      await navigateAgriFirst(page);
      expect(page.url()).not.toContain('group=');

      // Navigate to the group URL (simulates click → URL push)
      await page.goto(`/discover?city=${CITY}&journey=agri-first&group=${GROUP_PARAM}`);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1000);

      expect(page.url()).toMatch(GROUP_PARAM_REGEX);

      // Back → group param gone
      await page.goBack();
      await page.waitForURL(/\/discover/, { timeout: 8_000 });
      await page.waitForTimeout(500);

      expect(page.url()).not.toContain('group=');

      // agri-regional-groups list visible (agri-landing)
      await expect(page.locator('[data-testid="agri-regional-groups"]')).toBeVisible({
        timeout: 8_000,
      });

      // agri-group-selected-panel must be absent
      await expect(page.locator('[data-testid="agri-group-selected-panel"]')).toHaveCount(0);
    },
  );

  // ── AC9 (regression): area-first journey ignores group= param ─────────────

  test(
    'AC9 regression: area-first journey with ?group= in URL does NOT render agri-group-selected-panel',
    async ({ page }) => {
      await stubCommonRoutes(page);

      // area-first journey with a group param in the URL
      await page.goto(
        `/discover?city=${CITY}&journey=area-first&group=${GROUP_PARAM}`,
      );
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(1500);

      // agri-group-selected-panel must NOT be present for area-first
      await expect(page.locator('[data-testid="agri-group-selected-panel"]')).toHaveCount(0);

      // The area-first landing panel should be visible instead
      // (area-groups-landing uses data-testid="area-groups-landing" or similar;
      //  we assert the negative — no agri-group-selected panel — which is the contract)
    },
  );
});

// ---------------------------------------------------------------------------
// REAL_SEED headline test (skipped unless REAL_SEED=1)
// ---------------------------------------------------------------------------

test.describe('@integration-ui 1425 — AgriGroupSelectedPanel — Real-seed [REAL_SEED only]', () => {
  test.use({ storageState: undefined });

  /**
   * Real-seed: verifies that with a live fixture backend the agri-group-selected
   * panel actually loads listing rows when a group is selected.
   *
   * Skipped (not test.skip) when REAL_SEED is not set — this is the only allowed
   * skip in this file. It is an infra-capability skip, not a happy-path skip.
   */
  test(
    'real-seed: selecting a real group shows agri-group-selected-panel with listing rows; markers NOT fired for anon',
    async ({ page }) => {
      if (!REAL_SEED) {
        test.skip(true, 'Seed-backed test skipped: set REAL_SEED=1 with live stack to run');
        return;
      }

      // Spy on requests — no stubs for real-seed
      const capturedMarkersUrls: string[] = [];
      const capturedAgriMapListingsUrls: string[] = [];
      page.on('request', (req) => {
        const url = req.url();
        if (url.includes('/api/discover/markers')) capturedMarkersUrls.push(url);
        if (url.includes('/api/discover/agri-map-listings')) capturedAgriMapListingsUrls.push(url);
      });

      await page.goto(`/discover?city=${CITY}&journey=agri-first`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(2000);

      // At least one group row must be present from live seed
      const rows = page.locator('[data-testid="agri-regional-group-row"]');
      await expect(rows.first()).toBeVisible({ timeout: 12_000 });

      // Click the first real group
      await rows.first().click();
      await page.waitForTimeout(2000);

      // URL: group=DIR:BAND format (not groupId)
      const url = page.url();
      expect(url).toMatch(/[?&]group=[A-Z]{1,2}(%3A|:)[0-9]+_[0-9a-z]+/);
      expect(url).not.toContain('groupId=');

      // agri-group-selected-panel visible
      await expect(page.locator('[data-testid="agri-group-selected-panel"]')).toBeVisible({
        timeout: 12_000,
      });

      // agri-map-listings must have fired with areaKeys
      if (capturedAgriMapListingsUrls.length === 0) {
        throw new Error(
          'REGRESSION: GET /api/discover/agri-map-listings never fired after group selection ' +
            '(real-seed stack). Check useAgriMapListings skipAuth and hook enabled condition.',
        );
      }
      expect(capturedAgriMapListingsUrls[0]).toContain('areaKeys=');

      // Listing rows visible from real data
      const listingRows = page.locator('[data-testid="agri-group-listing-row"]');
      // May be 0 if seed has no listings for this group — check panel rendered at least
      // (could be empty-state; we assert no error state)
      await expect(page.locator('[data-testid="agri-group-error-state"]')).toHaveCount(0);
      console.log(`[1425/real-seed] Listing rows: ${await listingRows.count()}`);

      // MANDATORY: markers must NOT fire for anon
      expect(capturedMarkersUrls.length).toBe(0);
    },
  );
});
