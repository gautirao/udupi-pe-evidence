/**
 * Screenshot proof: Discover → select Manipal → View Trends → /trends page
 * Captures a screenshot at each interaction step.
 * Run: bash scripts/run-e2e-local.sh --project=full e2e/view-trends-screenshot.spec.ts
 */

import { test, expect } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SS = (name: string) => path.join(__dirname, `../screenshots/${name}.png`);

test.use({ storageState: 'e2e/fixtures/user-auth.json' });

test('View Trends button — Manipal journey with screenshots', async ({ page }) => {
  // ── Step 1: Load Discover page ─────────────────────────────────────────────
  await page.goto('/discover?city=udupi');
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByRole('heading', { name: 'Filters' })).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: SS('01-discover-loaded'), fullPage: false });

  // ── Step 2: Confirm View Trends NOT visible before selection ───────────────
  const trendsBtn = page.getByRole('button', { name: /View Trends/i });
  await expect(trendsBtn).toHaveCount(0, { timeout: 5_000 });
  await page.screenshot({ path: SS('02-no-view-trends-before-selection'), fullPage: false });

  // ── Step 3: Open the Locality dropdown ────────────────────────────────────
  const localityTrigger = page.locator('button[role="combobox"]').filter({ hasText: /localities/i });
  await localityTrigger.click();
  await expect(page.getByRole('option', { name: 'Manipal', exact: true })).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: SS('03-locality-dropdown-open-with-manipal'), fullPage: false });

  // ── Step 4: Select Manipal ────────────────────────────────────────────────
  await page.getByRole('option', { name: 'Manipal', exact: true }).click();
  // Close the dropdown so it doesn't intercept subsequent clicks
  await page.keyboard.press('Escape');
  await page.screenshot({ path: SS('04-manipal-selected'), fullPage: false });

  // ── Step 5: View Trends button appears (waits for /api/trends/options) ─────
  await expect(trendsBtn).toBeVisible({ timeout: 12_000 });
  await page.screenshot({ path: SS('05-view-trends-button-visible'), fullPage: false });

  // ── Step 6: Click View Trends ─────────────────────────────────────────────
  await trendsBtn.click();
  await page.waitForLoadState('domcontentloaded');
  await page.screenshot({ path: SS('06-trends-page-loaded'), fullPage: false });

  // ── Step 7: Assert URL ────────────────────────────────────────────────────
  const url = new URL(page.url());
  const city = url.searchParams.get('city');
  const areaKeys = url.searchParams.getAll('areaKey');

  console.log('✅ Final URL:', page.url());
  console.log('   city =', city);
  console.log('   areaKey =', areaKeys);

  expect(url.pathname).toBe('/trends');
  expect(city).toBe('udupi');
  expect(areaKeys).toContain('IN|KA|Udupi|Manipal');

  await page.screenshot({ path: SS('07-url-verified-manipal'), fullPage: false });
});
