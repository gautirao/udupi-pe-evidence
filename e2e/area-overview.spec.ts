/**
 * Area Overview / Trends redirect smoke tests — AO5–AO9
 *
 * AO1–AO4 removed: they tested confidence-tier UI (comparison tables,
 * FallbackNotice, badges) that no longer exists on the redesigned /trends page.
 * New Trends journey tests live in e2e/trends.spec.ts.
 *
 * Remaining:
 *   AO5 — nav rename: "Trends" link visible, "Insights" absent, click → /trends
 *   AO6 — /insights redirect → /trends without crash
 *   AO7 — unknown area key: "Area not found" error state
 *   AO8 — empty areaKey param: empty state renders ("Select an area to explore")
 *   AO9 — buildAreaKey contract (IN|KA|district|locality): page renders heading
 *
 * Run locally:
 *   npm run test:e2e -- e2e/area-overview.spec.ts
 */

import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

test.describe.configure({ mode: 'serial' });

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Test area keys (AO9) — IN|KA|... format ──────────────────────────────────
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

// ─── Seed / teardown (AO9 data only) ─────────────────────────────────────────

test.beforeAll(async () => {
  psql(`DELETE FROM area_overview_stats WHERE area_key IN ('${IN_KA_KEY}', '${IN_KA_DISTRICT_KEY}');`);

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
  psql(`DELETE FROM area_overview_stats WHERE area_key IN ('${IN_KA_KEY}', '${IN_KA_DISTRICT_KEY}');`);
});

// ─── AO5 — Nav rename ──────────────────────────────────────────────────────────

test.describe('AO5 — nav rename', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  test('AO5 — Trends nav link visible; Insights absent; click navigates to /trends', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('link', { name: /^trends$/i }).first()).toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole('link', { name: /^insights$/i })).toHaveCount(0);

    await page.getByRole('link', { name: /^trends$/i }).first().click();
    await expect(page).toHaveURL(/\/trends/, { timeout: 8_000 });
  });
});

// ─── AO6 — /insights redirect ──────────────────────────────────────────────────

test('AO6 — /insights redirects to /trends without crash', async ({ page }) => {
  await page.goto('/insights');
  await page.waitForLoadState('domcontentloaded');
  await expect(page).toHaveURL(/\/trends/, { timeout: 8_000 });
  await expect(page.locator('text=Something went wrong')).toHaveCount(0);
});

// ─── AO7 — 404 for unknown area key ────────────────────────────────────────────

test.describe('AO7 — unknown area key', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  test('AO7 — invalid area key renders Area not found without crash', async ({ page }) => {
    await page.goto('/trends?areaKey=INVALID%7CKEY%7CTHAT%7CDOES%7CNOT%7CEXIST');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByText('Area not found')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=Something went wrong')).toHaveCount(0);
  });
});

// ─── AO8 — Empty areaKey param ─────────────────────────────────────────────────

test.describe('AO8 — empty areaKey param', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  test('AO8 — /trends?areaKey= (empty string) shows empty state without crash', async ({ page }) => {
    // The new Trends page shows "Select an area to explore" when selectedKey is falsy
    // and options are not being fetched (fetchEnabled = urlAreaKeys.length === 0 = false
    // when URL has areaKey= with an empty string value).
    await page.goto('/trends?areaKey=');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByText(/Select an area to explore/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=Something went wrong')).toHaveCount(0);
  });
});

// ─── AO9 — buildAreaKey contract (IN|KA|district|locality format) ──────────────

test.describe('AO9 — buildAreaKey contract', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  test('AO9 — IN|KA|district|locality key renders heading without crash', async ({ page }) => {
    await page.goto(`/trends?areaKey=${encodeURIComponent(IN_KA_KEY)}`);
    await page.waitForLoadState('domcontentloaded');

    await expect(page).toHaveURL(/areaKey=IN%7CKA%7CE2E-TEST-DIST%7CE2E-FULL-AREA/);
    await expect(page.getByRole('heading', { name: /E2E-FULL-AREA/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Area not found')).toHaveCount(0);
    await expect(page.locator('text=Something went wrong')).toHaveCount(0);
  });
});
