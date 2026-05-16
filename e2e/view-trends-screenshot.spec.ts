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
  // ── Step 1: Load Discover with Manipal pre-selected via URL ───────────────
  // The old flow used a Locality combobox that was removed from the filter panel.
  // Area selection is now done via URL params (areaKey) or map marker clicks.
  // Pre-select Manipal directly so the "View Trends" button is immediately
  // visible — this exercises the same button and navigation as before.
  const MANIPAL_KEY = 'IN|KA|Udupi|Manipal';
  await page.goto(`/discover?city=udupi&areaKey=${encodeURIComponent(MANIPAL_KEY)}`);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: SS('01-discover-loaded'), fullPage: false });

  // ── Step 2: "Trends" link appears in area panel header with Manipal selected ─
  // After #887 the area panel header shows a "Trends" link (not a "View Trends" button).
  // Scope to the discover right panel to avoid matching the nav bar "Trends" link.
  const trendsBtn = page.getByTestId('discover-right-panel').getByRole('link', { name: /^Trends$/i });
  await expect(trendsBtn).toBeVisible({ timeout: 12_000 });
  await page.screenshot({ path: SS('02-view-trends-button-visible'), fullPage: false });

  // ── Step 6: Click Trends ─────────────────────────────────────────────────
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
