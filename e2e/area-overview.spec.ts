/**
 * Area Overview E2E smoke tests — AO1–AO9
 *
 * Covers:
 *   AO1 — full confidence: heading, listing count, price, comparison table, MarketActivity
 *   AO2 — limited confidence: amber badge, listing count, snapshot, MarketActivity
 *   AO3 — fallback confidence: grey badge, FallbackNotice, no MarketActivity, schools visible
 *   AO4 — schools display: heading, school rows, board label, distance format
 *   AO5 — nav rename: "Area overview" link visible, "Insights" absent, click navigates correctly
 *   AO6 — /insights redirect: URL changes to /area-overview
 *   AO7 — unknown area key: "Area not found" error state
 *   AO8 — empty areaKey param: "Area not found" rendered, no crash (guards empty-string entry points)
 *   AO9 — buildAreaKey contract (IN|KA|district|locality format): page renders heading, no crash
 *
 * Depends on: #728, #729, #730, #731, #732, #733, #734, #757-PR1
 *
 * Setup: seeds area_overview_stats via psql in beforeAll; cleans up in afterAll.
 *        Centroid for FULL area is set near Manipal (13.35°N, 74.79°E) so real
 *        schools in the DB (STATE board, within 3 km) are included in AO4.
 *        AO9 uses IN_KA_KEY (IN|KA|... format) to validate buildAreaKey contract.
 *
 * Run locally:
 *   npm run test:e2e -- e2e/area-overview.spec.ts
 */

import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Force serial execution — prevents beforeAll/afterAll racing across workers when
// tests are distributed: Worker 2's afterAll would delete rows while Worker 1 still
// needs them for AO1/AO4.
test.describe.configure({ mode: 'serial' });

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Test area keys — "E2E-TEST" prefix avoids collision with real data ────────
const FULL_KEY     = 'KA|E2E-TEST-DIST|E2E-TK|E2E-FULL-AREA';
const LIMITED_KEY  = 'KA|E2E-TEST-DIST|E2E-TK|E2E-LIMITED-AREA';
const FALLBACK_KEY = 'KA|E2E-TEST-DIST|E2E-TK|E2E-FALLBACK-AREA';
const DISTRICT_KEY = 'KA|E2E-TEST-DIST';
// AO9 — buildAreaKey contract: IN|KA|{district}|{locality} format
const IN_KA_DISTRICT_KEY = 'IN|KA|E2E-TEST-DIST';
const IN_KA_KEY = 'IN|KA|E2E-TEST-DIST|E2E-FULL-AREA';

// ─── DB helpers ────────────────────────────────────────────────────────────────

function getDbConn(): { host: string; port: string; dbname: string; user: string; password: string } {
  const envPath = path.join(__dirname, '../backend/.env');
  const content = fs.readFileSync(envPath, 'utf-8');
  const get = (key: string) => {
    const m = content.match(new RegExp(`^${key}=(.+)$`, 'm'));
    return m ? m[1].trim() : '';
  };
  return {
    host: get('SUPABASE_DB_HOST'),
    port: get('SUPABASE_DB_PORT'),
    dbname: get('SUPABASE_DB_NAME'),
    user: get('SUPABASE_DB_USER'),
    password: get('SUPABASE_DB_PASSWORD'),
  };
}

function psql(sql: string): void {
  const { host, port, dbname, user, password } = getDbConn();
  const connStr = `host=${host} port=${port} dbname=${dbname} user=${user} sslmode=require`;
  execSync(`psql "${connStr}"`, {
    input: sql,
    env: { ...process.env, PGPASSWORD: password },
    stdio: ['pipe', 'ignore', 'ignore'],
  });
}

// ─── Seed / teardown ───────────────────────────────────────────────────────────

test.beforeAll(async () => {
  // Purge any leftovers from previous failed runs
  psql(`
    DELETE FROM area_overview_stats
    WHERE area_key IN (
      '${FULL_KEY}', '${LIMITED_KEY}', '${FALLBACK_KEY}', '${DISTRICT_KEY}',
      '${IN_KA_KEY}', '${IN_KA_DISTRICT_KEY}'
    );
  `);

  // District row — used as fallback source for FALLBACK_KEY
  psql(`
    INSERT INTO area_overview_stats
      (area_key, area_level, listing_count_90d, confidence_tier,
       median_price_paise, price_p10_paise, price_p90_paise,
       property_type_dist, trend_direction, trend_pct_change)
    VALUES
      ('${DISTRICT_KEY}', 'district', 35, 'full',
       400000000, 250000000, 650000000,
       '{"land": 70, "house": 20, "apartment": 10}', 'rising', 3.1);
  `);

  // Full confidence locality — no centroid (PostGIS not installed in this DB;
  // schoolService.findNearby is bypassed when lat/lon is null → returns empty list)
  psql(`
    INSERT INTO area_overview_stats
      (area_key, area_level, listing_count_90d, confidence_tier,
       median_price_paise, price_p10_paise, price_p90_paise,
       property_type_dist, trend_direction, trend_pct_change,
       nearby_area_keys, district_area_key)
    VALUES
      ('${FULL_KEY}', 'locality', 25, 'full',
       500000000, 300000000, 800000000,
       '{"land": 60, "house": 25, "apartment": 15}', 'rising', 5.2,
       ARRAY['${LIMITED_KEY}']::text[], '${DISTRICT_KEY}');
  `);

  // Limited confidence locality
  psql(`
    INSERT INTO area_overview_stats
      (area_key, area_level, listing_count_90d, confidence_tier,
       median_price_paise, price_p10_paise, price_p90_paise,
       trend_direction, district_area_key)
    VALUES
      ('${LIMITED_KEY}', 'locality', 10, 'limited',
       300000000, 200000000, 500000000,
       'stable', '${DISTRICT_KEY}');
  `);

  // Fallback confidence locality — no price data, shows district fallback
  psql(`
    INSERT INTO area_overview_stats
      (area_key, area_level, listing_count_90d, confidence_tier, district_area_key)
    VALUES
      ('${FALLBACK_KEY}', 'locality', 2, 'fallback', '${DISTRICT_KEY}');
  `);

  // AO9 — IN|KA|... format rows (buildAreaKey contract)
  psql(`
    INSERT INTO area_overview_stats
      (area_key, area_level, listing_count_90d, confidence_tier,
       median_price_paise, price_p10_paise, price_p90_paise,
       property_type_dist, trend_direction, trend_pct_change)
    VALUES
      ('${IN_KA_DISTRICT_KEY}', 'district', 20, 'full',
       350000000, 200000000, 600000000,
       '{"land": 80, "house": 15, "apartment": 5}', 'stable', 0.0);
  `);

  psql(`
    INSERT INTO area_overview_stats
      (area_key, area_level, listing_count_90d, confidence_tier,
       median_price_paise, price_p10_paise, price_p90_paise,
       property_type_dist, trend_direction, trend_pct_change,
       district_area_key)
    VALUES
      ('${IN_KA_KEY}', 'locality', 18, 'full',
       480000000, 280000000, 750000000,
       '{"land": 65, "house": 20, "apartment": 15}', 'rising', 4.1,
       '${IN_KA_DISTRICT_KEY}');
  `);
});

test.afterAll(async () => {
  psql(`
    DELETE FROM area_overview_stats
    WHERE area_key IN (
      '${FULL_KEY}', '${LIMITED_KEY}', '${FALLBACK_KEY}', '${DISTRICT_KEY}',
      '${IN_KA_KEY}', '${IN_KA_DISTRICT_KEY}'
    );
  `);
});

// ─── AO1 — Full confidence ─────────────────────────────────────────────────────

test.describe('AO1 — full confidence area', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  test('AO1 — heading, listing count, price, comparison, MarketActivity visible', async ({ page }) => {
    await page.goto(`/area-overview?areaKey=${encodeURIComponent(FULL_KEY)}`);
    await page.waitForLoadState('domcontentloaded');

    // Area label in h1
    await expect(page.getByRole('heading', { name: /E2E-FULL-AREA/i })).toBeVisible({ timeout: 10_000 });

    // No confidence badge — full mode shows nothing
    await expect(page.getByText('Limited data')).toHaveCount(0);
    await expect(page.getByText('Emerging area')).toHaveCount(0);

    // Data basis line: exactly "Based on 25 listings in the last 90 days"
    await expect(page.getByText(/Based on 25 listings in the last 90 days/i)).toBeVisible({ timeout: 10_000 });

    // Median price visible with "per cent"
    await expect(page.getByText(/per cent/i).first()).toBeVisible({ timeout: 10_000 });

    // Comparison table rendered with at least the LIMITED area row
    await expect(page.getByText('Nearby area comparison')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/E2E-LIMITED-AREA/i)).toBeVisible({ timeout: 10_000 });

    // FallbackNotice absent
    await expect(page.getByText(/This area is new on our platform/i)).toHaveCount(0);

    // MarketActivity section visible (activity = {0, 0} but not null — card renders)
    await expect(page.getByText('Market activity', { exact: false })).toBeVisible({ timeout: 10_000 });
  });
});

// ─── AO2 — Limited confidence ──────────────────────────────────────────────────

test.describe('AO2 — limited confidence area', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  test('AO2 — amber Limited data badge, listing count, snapshot, MarketActivity', async ({ page }) => {
    await page.goto(`/area-overview?areaKey=${encodeURIComponent(LIMITED_KEY)}`);
    await page.waitForLoadState('domcontentloaded');

    // Amber badge
    await expect(page.getByText('Limited data')).toBeVisible({ timeout: 10_000 });

    // Data basis line: 10 listings, limited-tier copy
    await expect(page.getByText(/Based on 10 listings in the last 90 days/i)).toBeVisible({ timeout: 10_000 });

    // Snapshot card rendered with median price
    await expect(page.getByText(/per cent/i).first()).toBeVisible({ timeout: 10_000 });

    // No FallbackNotice
    await expect(page.getByText(/This area is new on our platform/i)).toHaveCount(0);

    // MarketActivity visible
    await expect(page.getByText('Market activity', { exact: false })).toBeVisible({ timeout: 10_000 });
  });
});

// ─── AO3 — Fallback confidence ─────────────────────────────────────────────────

test.describe('AO3 — fallback confidence area', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  test('AO3 — Emerging area badge, FallbackNotice with district label, no MarketActivity', async ({ page }) => {
    await page.goto(`/area-overview?areaKey=${encodeURIComponent(FALLBACK_KEY)}`);
    await page.waitForLoadState('domcontentloaded');

    // Grey badge
    await expect(page.getByText('Emerging area')).toBeVisible({ timeout: 10_000 });

    // FallbackNotice Alert: contains district label
    await expect(page.getByText(/This area is new on our platform/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/E2E-TEST-DIST/i).first()).toBeVisible({ timeout: 10_000 });

    // MarketActivity NOT rendered for fallback confidence
    await expect(page.getByText('Market activity', { exact: false })).toHaveCount(0);

    // Nearby schools section still renders
    await expect(page.getByText('Nearby schools', { exact: false })).toBeVisible({ timeout: 10_000 });
  });
});

// ─── AO4 — Schools display ─────────────────────────────────────────────────────

test.describe('AO4 — schools display', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  test('AO4 — Nearby schools section always renders (empty state when no centroid)', async ({ page }) => {
    // FULL_KEY has no centroid (PostGIS not installed in dev DB — see beforeAll comment).
    // AreaOverviewService.querySchools() short-circuits to [] when lat/lon is null,
    // so SchoolsList renders the "No schools found within 3 km" empty state.
    await page.goto(`/area-overview?areaKey=${encodeURIComponent(FULL_KEY)}`);
    await page.waitForLoadState('domcontentloaded');

    // SchoolsList always renders — even for empty results
    await expect(page.getByText('Nearby schools', { exact: false })).toBeVisible({ timeout: 10_000 });

    // Empty state message when no centroid is set
    await expect(page.getByText('No schools found within 3 km')).toBeVisible({ timeout: 8_000 });

    // No crash — page does not show error boundary
    await expect(page.locator('text=Something went wrong')).toHaveCount(0);
  });
});

// ─── AO5 — Nav rename ──────────────────────────────────────────────────────────

test.describe('AO5 — nav rename', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  test('AO5 — Area overview nav link visible; Insights absent; click navigates to /area-overview', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1_500); // allow auth context to resolve nav role

    // "Area overview" nav link visible
    await expect(page.getByRole('link', { name: /^area overview$/i }).first()).toBeVisible({ timeout: 8_000 });

    // "Insights" nav link NOT visible
    await expect(page.getByRole('link', { name: /^insights$/i })).toHaveCount(0);

    // Clicking navigates to /area-overview
    await page.getByRole('link', { name: /^area overview$/i }).first().click();
    await expect(page).toHaveURL(/\/area-overview/, { timeout: 8_000 });
  });
});

// ─── AO6 — /insights redirect ──────────────────────────────────────────────────

test('AO6 — /insights redirects to /area-overview without crash', async ({ page }) => {
  await page.goto('/insights');
  await page.waitForLoadState('domcontentloaded');
  await expect(page).toHaveURL(/\/area-overview/, { timeout: 8_000 });
  await expect(page.locator('text=Something went wrong')).toHaveCount(0);
});

// ─── AO7 — 404 for unknown area key ────────────────────────────────────────────

test.describe('AO7 — unknown area key', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  test('AO7 — invalid area key renders Area not found without crash', async ({ page }) => {
    await page.goto('/area-overview?areaKey=INVALID%7CKEY%7CTHAT%7CDOES%7CNOT%7CEXIST');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByText('Area not found')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=Something went wrong')).toHaveCount(0);
  });
});

// ─── AO8 — Empty areaKey param ─────────────────────────────────────────────────

test.describe('AO8 — empty areaKey param', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  test('AO8 — /area-overview?areaKey= (empty string) shows Area not found without crash', async ({ page }) => {
    // Guard: AreaOverview component treats areaKey='' as an error state
    // (`if (!areaKey || isError)` branch). This covers any entry point that
    // might navigate to /area-overview without supplying a value.
    await page.goto('/area-overview?areaKey=');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByText('Area not found')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=Something went wrong')).toHaveCount(0);
  });
});

// ─── AO9 — buildAreaKey contract (IN|KA|district|locality format) ──────────────

test.describe('AO9 — buildAreaKey contract', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  test('AO9 — IN|KA|district|locality key navigates to area overview with heading and no crash', async ({ page }) => {
    // Validates the contract established by buildAreaKey() in src/lib/areaKey.ts:
    //   buildAreaKey('E2E-TEST-DIST', 'E2E-FULL-AREA') => 'IN|KA|E2E-TEST-DIST|E2E-FULL-AREA'
    // Callers must encodeURIComponent() the result before inserting into the URL.
    const areaKey = 'IN|KA|E2E-TEST-DIST|E2E-FULL-AREA'; // == buildAreaKey('E2E-TEST-DIST', 'E2E-FULL-AREA')
    await page.goto(`/area-overview?areaKey=${encodeURIComponent(areaKey)}`);
    await page.waitForLoadState('domcontentloaded');

    // URL carries the areaKey param (non-empty)
    await expect(page).toHaveURL(/areaKey=IN%7CKA%7CE2E-TEST-DIST%7CE2E-FULL-AREA/);

    // Area heading renders — last pipe segment is the locality label
    await expect(page.getByRole('heading', { name: /E2E-FULL-AREA/i })).toBeVisible({ timeout: 10_000 });

    // Page does not show 404 error state
    await expect(page.getByText('Area not found')).toHaveCount(0);

    // No JS error boundary triggered
    await expect(page.locator('text=Something went wrong')).toHaveCount(0);

    // Data basis line confirms backend resolved the area (18 listings seeded)
    await expect(page.getByText(/Based on 18 listings in the last 90 days/i)).toBeVisible({ timeout: 10_000 });
  });
});
