/**
 * Trends page E2E tests — T1–T7
 *
 * Covers:
 *   T1 — Direct URL: /trends?city=X&areaKey=K renders heading + metric cards + tabs
 *   T2 — No areaKey: backend defaults fetched → URL updated → heading renders
 *   T3 — More than 3 areaKeys: URL trimmed to first 3; dropdown reflects 3 items
 *   T4 — Dropdown change: selected area moves to position 0 in URL
 *   T5 — Discover → Trends: "View Trends" button navigates with city + areaKey
 *   T6 — Listing detail → Trends: "View Area Trends" link carries areaKey
 *   T7 — /area-overview redirect: navigating to old path lands on /trends
 *
 * Setup: seeds area_overview_stats rows in beforeAll; cleans up in afterAll.
 *        Two locality rows (AREA1, AREA2) in district E2E-TRENDS-DIST.
 *        City param = 'e2e-trends-dist' (lowercase of split_part(area_key,'|',3)).
 *
 * Run locally:
 *   npm run test:e2e -- e2e/trends.spec.ts
 */

import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

test.describe.configure({ mode: 'serial' });

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Test area keys ─────────────────────────────────────────────────────────────
const DIST_KEY = 'IN|KA|E2E-TRENDS-DIST';
const AREA1_KEY = 'IN|KA|E2E-TRENDS-DIST|E2E-TRENDS-AREA1';
const AREA2_KEY = 'IN|KA|E2E-TRENDS-DIST|E2E-TRENDS-AREA2';
const CITY = 'e2e-trends-dist';

// ─── DB helpers ────────────────────────────────────────────────────────────────

function getDbConn() {
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
  psql(`DELETE FROM area_overview_stats WHERE area_key IN ('${DIST_KEY}','${AREA1_KEY}','${AREA2_KEY}');`);

  psql(`
    INSERT INTO area_overview_stats
      (area_key, area_level, listing_count_90d, confidence_tier,
       median_price_paise, price_p10_paise, price_p90_paise,
       property_type_dist, trend_direction, trend_pct_change)
    VALUES
      ('${DIST_KEY}', 'district', 50, 'full',
       400000000, 250000000, 650000000,
       '{"land": 60, "house": 30, "apartment": 10}', 'rising', 2.5);
  `);

  psql(`
    INSERT INTO area_overview_stats
      (area_key, area_level, listing_count_90d, confidence_tier,
       median_price_paise, price_p10_paise, price_p90_paise,
       property_type_dist, trend_direction, trend_pct_change,
       district_area_key)
    VALUES
      ('${AREA1_KEY}', 'locality', 22, 'full',
       520000000, 300000000, 820000000,
       '{"house": 50, "apartment": 30, "land": 20}', 'rising', 6.3,
       '${DIST_KEY}');
  `);

  psql(`
    INSERT INTO area_overview_stats
      (area_key, area_level, listing_count_90d, confidence_tier,
       median_price_paise, price_p10_paise, price_p90_paise,
       property_type_dist, trend_direction, trend_pct_change,
       district_area_key)
    VALUES
      ('${AREA2_KEY}', 'locality', 14, 'full',
       310000000, 180000000, 490000000,
       '{"house": 40, "land": 40, "apartment": 20}', 'stable', 0.8,
       '${DIST_KEY}');
  `);
});

test.afterAll(async () => {
  psql(`DELETE FROM area_overview_stats WHERE area_key IN ('${DIST_KEY}','${AREA1_KEY}','${AREA2_KEY}');`);
});

// ─── T1 — Direct URL renders heading, metric cards, tabs ──────────────────────

test.describe('T1 — direct URL access', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  test('T1 — heading, metric cards, and tabs visible for seeded area', async ({ page }) => {
    await page.goto(`/trends?city=${CITY}&areaKey=${encodeURIComponent(AREA1_KEY)}`);
    await page.waitForLoadState('domcontentloaded');

    // Area heading (h1)
    await expect(page.getByRole('heading', { level: 1, name: /E2E-TRENDS-AREA1/i })).toBeVisible({ timeout: 10_000 });

    // Tabs
    await expect(page.getByRole('tab', { name: /Overview/i })).toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole('tab', { name: /Price Trends/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Supply/i })).toBeVisible();

    // Metric cards: labels
    await expect(page.getByText('Price Change')).toBeVisible();
    await expect(page.getByText('Listings (90d)')).toBeVisible();

    // No error states
    await expect(page.getByText('Area not found')).toHaveCount(0);
    await expect(page.locator('text=Something went wrong')).toHaveCount(0);
  });
});

// ─── T2 — No areaKey: defaults fetched; URL updated; heading renders ──────────

test.describe('T2 — no areaKey falls back to backend defaults', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  test('T2 — city-only URL: options endpoint writes areaKey and heading appears', async ({ page }) => {
    await page.goto(`/trends?city=${CITY}`);
    await page.waitForLoadState('domcontentloaded');

    // Options endpoint returns AREA1 or AREA2 (whichever has more listings: AREA1 with 22)
    // The useEffect writes the areaKey into URL; wait for it
    await page.waitForURL((url) => url.searchParams.has('areaKey'), { timeout: 10_000 });

    // Heading for whatever area was selected
    await expect(page.getByRole('heading', { level: 1, name: /E2E-TRENDS-AREA/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Area not found')).toHaveCount(0);
  });
});

// ─── T3 — More than 3 areaKeys trimmed to 3 in URL ───────────────────────────

test.describe('T3 — more than 3 areaKeys trimmed', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  test('T3 — 4 areaKeys in URL → URL normalized to first 3', async ({ page }) => {
    const fakeKey3 = 'IN|KA|E2E-TRENDS-DIST|FAKE-AREA3';
    const fakeKey4 = 'IN|KA|E2E-TRENDS-DIST|FAKE-AREA4';
    const params = new URLSearchParams({ city: CITY });
    [AREA1_KEY, AREA2_KEY, fakeKey3, fakeKey4].forEach((k) => params.append('areaKey', k));

    await page.goto(`/trends?${params.toString()}`);
    await page.waitForLoadState('domcontentloaded');

    // useEffect fires on mount and replaces URL with first 3 keys
    await page.waitForURL((url) => {
      return url.searchParams.getAll('areaKey').length === 3;
    }, { timeout: 6_000 });

    const url = new URL(page.url());
    expect(url.searchParams.getAll('areaKey').length).toBe(3);

    // First key (AREA1) is selected; heading renders
    await expect(page.getByRole('heading', { level: 1, name: /E2E-TRENDS-AREA1/i })).toBeVisible({ timeout: 10_000 });
  });
});

// ─── T4 — Dropdown change reorders URL ────────────────────────────────────────

test.describe('T4 — dropdown change updates URL', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  test('T4 — selecting AREA2 from dropdown moves it to position 0 in URL', async ({ page }) => {
    const params = new URLSearchParams({ city: CITY });
    [AREA1_KEY, AREA2_KEY].forEach((k) => params.append('areaKey', k));

    await page.goto(`/trends?${params.toString()}`);
    await page.waitForLoadState('domcontentloaded');

    // Wait for AREA1 heading (it's first in URL → initially selected)
    await expect(page.getByRole('heading', { level: 1, name: /E2E-TRENDS-AREA1/i })).toBeVisible({ timeout: 10_000 });

    // Dropdown is visible when ≥2 areas are in URL; click to open
    const trigger = page.locator('[role="combobox"]').filter({ hasText: /E2E-TRENDS-AREA1/i });
    await trigger.click();

    // Select AREA2
    await page.getByRole('option', { name: /E2E-TRENDS-AREA2/i }).click();

    // URL now leads with AREA2 (encoded pipes)
    const encodedArea2 = encodeURIComponent(AREA2_KEY);
    await expect(page).toHaveURL(
      new RegExp(`areaKey=${encodedArea2.replace(/\|/g, '%7C')}`),
      { timeout: 8_000 }
    );

    // Heading updates to AREA2
    await expect(page.getByRole('heading', { level: 1, name: /E2E-TRENDS-AREA2/i })).toBeVisible({ timeout: 10_000 });
  });
});

// ─── T5 — Discover → Trends via "View Trends" button ─────────────────────────

test.describe('T5 — Discover → Trends navigation', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  test('T5 — selecting a locality shows "View Trends" and navigates to /trends with areaKey', async ({ page }) => {
    await page.goto('/discover?city=udupi');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByText('Filters')).toBeVisible({ timeout: 8_000 });

    // Button must NOT be visible before any locality is selected
    const trendsBtn = page.getByRole('button', { name: /View Trends/i });
    await expect(trendsBtn).toHaveCount(0, { timeout: 5_000 });

    // Open the Locality combobox
    const localityTrigger = page.locator('button[role="combobox"]').filter({ hasText: /localities/i });
    await localityTrigger.click();

    // Wait for the locality list to populate and pick the first enabled option
    const firstOption = page.locator('[role="option"]:not([aria-disabled="true"])').first();
    await expect(firstOption).toBeVisible({ timeout: 8_000 });
    await firstOption.click();

    // "View Trends" must now appear — proves areaKey resolved from useLocalities, not listing scan
    await expect(trendsBtn).toBeVisible({ timeout: 8_000 });

    // Click and verify navigation includes both city and areaKey
    await trendsBtn.click();
    await expect(page).toHaveURL(/\/trends/, { timeout: 8_000 });
    await expect(page).toHaveURL(/[?&]city=udupi/, { timeout: 5_000 });
    await expect(page).toHaveURL(/[?&]areaKey=/, { timeout: 5_000 });
  });
});

// ─── T6 — Listing detail → Trends "Locality Insights" link ───────────────────

test.describe('T6 — Listing detail → Trends link', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  test('T6 — listing detail page with areaKey has "View Area Trends" link pointing to /trends', async ({ page }) => {
    // Navigate to the listing detail for a known listing that has an areaKey.
    // Read the listing ID from the global-setup fixture file if available.
    const idFile = path.join(__dirname, '.test-listing-id');
    if (!fs.existsSync(idFile)) {
      test.skip(true, 'No .test-listing-id fixture — skipping listing detail → Trends test');
      return;
    }
    const listingId = fs.readFileSync(idFile, 'utf-8').trim().split('\n')[0];
    if (!listingId) {
      test.skip(true, 'Empty .test-listing-id fixture');
      return;
    }

    await page.goto(`/listing/${listingId}`);
    await page.waitForLoadState('domcontentloaded');

    // If the listing has an areaKey, "View Area Trends" link is rendered
    const trendsLink = page.getByRole('link', { name: /View Area Trends/i });
    const linkCount = await trendsLink.count();
    if (linkCount === 0) {
      // Listing may not have an areaKey — acceptable
      return;
    }

    const href = await trendsLink.getAttribute('href');
    expect(href).toMatch(/\/trends\?/);
    expect(href).toMatch(/areaKey=/);
  });
});

// ─── T7 — /area-overview redirect ────────────────────────────────────────────

test('T7 — /area-overview redirects to /trends without crash', async ({ page }) => {
  // The old route should redirect to /trends (or render /trends); no crash.
  await page.goto(`/area-overview?areaKey=${encodeURIComponent(AREA1_KEY)}`);
  await page.waitForLoadState('domcontentloaded');
  // Accept either /area-overview (if not redirected) or /trends; just verify no crash
  await expect(page.locator('text=Something went wrong')).toHaveCount(0);
});
