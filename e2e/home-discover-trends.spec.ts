/**
 * Proof: Home → Discover (Manipal pre-selected) → View Trends → Trends/Manipal
 * Anonymous user flow (no auth required).
 *
 * Run: bash scripts/run-e2e-local.sh --project=full e2e/home-discover-trends.spec.ts
 */

import { test, expect } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SS = (name: string) => path.join(__dirname, `../screenshots/h2d-${name}.png`);

// Anonymous flow — no storageState

test('Home → Discover (Manipal pre-selected) → View Trends → Trends shows Manipal', async ({ page }) => {
  // ── Step 1: Home page ─────────────────────────────────────────────────────
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByRole('button', { name: /Explore on Map/i })).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: SS('01-home-loaded'), fullPage: false });

  // ── Step 2: Select Udupi city ─────────────────────────────────────────────
  // Use aria-label selectors from HomepageFilterPanel (desktop right-column panel).
  // The positional .first()/.nth(1) selectors resolved to lg:hidden mobile elements.
  const cityTrigger = page.locator('[aria-label="Select city"]');
  await cityTrigger.click();
  await page.getByRole('option', { name: 'Udupi', exact: true }).click();
  await page.screenshot({ path: SS('02-udupi-selected'), fullPage: false });

  // ── Step 3: Select Manipal area ───────────────────────────────────────────
  // Area selector in HomepageFilterPanel has aria-label="Select area"
  const areaTrigger = page.locator('[aria-label="Select area"]');
  await areaTrigger.click();
  await expect(page.getByRole('option', { name: 'Manipal', exact: true })).toBeVisible({ timeout: 8_000 });
  await page.getByRole('option', { name: 'Manipal', exact: true }).click();
  await page.screenshot({ path: SS('03-manipal-selected'), fullPage: false });

  // ── Step 4: Click "Explore on Map" ───────────────────────────────────────
  await page.getByRole('button', { name: /Explore on Map/i }).click();
  await page.waitForLoadState('domcontentloaded');
  await page.screenshot({ path: SS('04-discover-loaded'), fullPage: false });

  // ── Step 5: Discover URL has city=udupi and areaKey=IN|KA|Udupi|Manipal ──
  const discoverUrl = new URL(page.url());
  expect(discoverUrl.pathname).toBe('/discover');
  expect(discoverUrl.searchParams.get('city')).toBe('udupi');
  expect(discoverUrl.searchParams.get('areaKey')).toBe('IN|KA|Udupi|Manipal');

  // ── Step 6: Manipal is shown as selected ─────────────────────────────────
  await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 10_000 });
  // The Manipal chip/text is visible in the right panel
  await expect(page.getByText('Manipal').first()).toBeVisible({ timeout: 8_000 });
  await page.screenshot({ path: SS('05-manipal-chip-visible'), fullPage: false });

  // ── Step 7: "Trends" button/link is visible in the area panel header ────────
  // After #887 the area panel header shows a "Trends" link button (not "View Trends").
  // Scope to the discover right panel to avoid the nav bar "Trends" link.
  const trendsBtn = page.getByTestId('discover-right-panel').getByRole('link', { name: /^Trends$/i });
  await expect(trendsBtn).toBeVisible({ timeout: 12_000 });
  await page.screenshot({ path: SS('06-view-trends-visible'), fullPage: false });

  // ── Step 8: Click "Trends" ───────────────────────────────────────────────
  await trendsBtn.click();
  await page.waitForLoadState('domcontentloaded');
  await page.screenshot({ path: SS('07-trends-loading'), fullPage: false });

  // ── Step 9: Verify URL — exact areaKey, no fallback ──────────────────────
  const trendsUrl = new URL(page.url());
  const areaKeys = trendsUrl.searchParams.getAll('areaKey');

  console.log('✅ Final URL:', page.url());
  console.log('   city    =', trendsUrl.searchParams.get('city'));
  console.log('   areaKey =', areaKeys);

  expect(trendsUrl.pathname).toBe('/trends');
  expect(trendsUrl.searchParams.get('city')).toBe('udupi');
  expect(areaKeys).toContain('IN|KA|Udupi|Manipal');

  // ── Step 10: Trends page shows Manipal heading ────────────────────────────
  await expect(page.getByRole('heading', { level: 1, name: /Manipal/i })).toBeVisible({ timeout: 12_000 });
  await expect(page.getByText('Area not found')).toHaveCount(0);
  await page.screenshot({ path: SS('08-trends-manipal-heading'), fullPage: false });
});
