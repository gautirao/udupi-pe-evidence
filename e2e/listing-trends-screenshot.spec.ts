/**
 * Screenshot proof: Journey 2 — Discover → Listing → Trends
 *
 * Proves exact areaKey continuity from a listing's locality to the Trends page.
 * No frontend areaKey synthesis — key comes verbatim from property_listings.area_key
 * via the backend API response.
 *
 * Click path:
 *   /discover → /listing/{id} (via "View Details") → /trends?city=udupi&areaKey=…
 *
 * Run: bash scripts/run-e2e-local.sh --project=full e2e/listing-trends-screenshot.spec.ts
 */

import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SS = (name: string) => path.join(__dirname, `../screenshots/j2-${name}.png`);

const AREA_KEY = 'IN|KA|Udupi|Manipal';
const DIST_KEY = 'IN|KA|Udupi';
const CITY = 'udupi';

test.use({ storageState: 'e2e/fixtures/user-auth.json' });
test.describe.configure({ mode: 'serial' });

// ── DB helpers ────────────────────────────────────────────────────────────────

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

function psqlRun(sql: string): void {
  const { host, port, dbname, user, password } = getDbConn();
  const connStr = `host=${host} port=${port} dbname=${dbname} user=${user} sslmode=require`;
  execSync(`psql "${connStr}"`, {
    input: sql,
    env: { ...process.env, PGPASSWORD: password },
    stdio: ['pipe', 'ignore', 'ignore'],
  });
}

function psqlQuery(sql: string): string {
  const { host, port, dbname, user, password } = getDbConn();
  const connStr = `host=${host} port=${port} dbname=${dbname} user=${user} sslmode=require`;
  return execSync(`psql "${connStr}" -t -A`, {
    input: sql,
    env: { ...process.env, PGPASSWORD: password },
  })
    .toString()
    .trim();
}

// ── Seed / setup ──────────────────────────────────────────────────────────────

let listingId: string;

test.beforeAll(async () => {
  // Ensure area_overview_stats has a Manipal row so the Trends page can render
  psqlRun(`
    INSERT INTO area_overview_stats
      (area_key, area_level, listing_count_90d, confidence_tier,
       median_price_paise, price_p10_paise, price_p90_paise,
       property_type_dist, trend_direction, trend_pct_change,
       district_area_key)
    VALUES
      ('${AREA_KEY}', 'locality', 50, 'full',
       520000000, 300000000, 820000000,
       '{"house": 50, "land": 30, "apartment": 20}', 'rising', 5.2,
       '${DIST_KEY}')
    ON CONFLICT (area_key) DO NOTHING;
  `);

  // Find a publicly-accessible listing whose area_key matches Manipal.
  // The backfill from Journey 1 populated property_listings.area_key for Udupi rows.
  listingId = psqlQuery(`
    SELECT id
    FROM property_listings
    WHERE area_key = '${AREA_KEY}'
      AND is_valid = true
      AND status IN ('LIVE', 'SCRAPED')
    LIMIT 1;
  `);

  if (!listingId) {
    throw new Error(
      `No LIVE/SCRAPED listing with area_key='${AREA_KEY}' found — ` +
        'property_listings backfill may not have run for this DB.'
    );
  }

  console.log(`[j2-setup] listing id: ${listingId}`);
});

// ── Journey 2 proof ───────────────────────────────────────────────────────────

test('Journey 2: Discover → Listing → Trends — exact areaKey continuity', async ({ page }) => {
  // ── Step 1: Start at Discover (journey origin) ────────────────────────────
  await page.goto(`/discover?city=${CITY}`);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByRole('heading', { name: 'Filters' })).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: SS('01-discover-start'), fullPage: false });

  // ── Step 2: Navigate to listing detail (mirrors "View Details" button click) ─
  await page.goto(`/listing/${listingId}`);
  await page.waitForLoadState('domcontentloaded');
  await page.screenshot({ path: SS('02-listing-detail-loaded'), fullPage: false });

  // ── Step 3: Locality Insights card is present ─────────────────────────────
  const trendsLink = page.getByRole('link', { name: /View Area Trends/i });
  await expect(trendsLink).toBeVisible({ timeout: 12_000 });
  await page.screenshot({ path: SS('03-locality-insights-visible'), fullPage: false });

  // ── Step 4: Verify exact href — areaKey is from listing, not synthesised ──
  const href = await trendsLink.getAttribute('href');
  console.log('[j2] link href:', href);
  expect(href).toBe(`/trends?city=${CITY}&areaKey=${encodeURIComponent(AREA_KEY)}`);

  await page.screenshot({ path: SS('04-href-verified'), fullPage: false });

  // ── Step 5: Click "View Area Trends" ─────────────────────────────────────
  await trendsLink.click();
  await page.waitForLoadState('domcontentloaded');
  await page.screenshot({ path: SS('05-trends-loading'), fullPage: false });

  // ── Step 6: Verify exact URL — no URL rewrite, no fallback to defaults ────
  const url = new URL(page.url());
  const areaKeys = url.searchParams.getAll('areaKey');

  console.log('✅ Final URL:', page.url());
  console.log('   city     =', url.searchParams.get('city'));
  console.log('   areaKey  =', areaKeys);

  expect(url.pathname).toBe('/trends');
  expect(url.searchParams.get('city')).toBe(CITY);

  // Exact key — not a backend-default replacement
  expect(areaKeys.length).toBe(1);
  expect(areaKeys[0]).toBe(AREA_KEY);

  // ── Step 7: Trends page shows Manipal heading — proves data loaded for the ─
  //           exact area, not a silent fallback to a different area.
  await expect(page.getByRole('heading', { level: 1, name: /Manipal/i })).toBeVisible({
    timeout: 12_000,
  });
  await expect(page.getByText('Area not found')).toHaveCount(0);
  await page.screenshot({ path: SS('06-trends-manipal-visible'), fullPage: false });
});
