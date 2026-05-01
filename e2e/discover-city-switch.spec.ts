/**
 * E-2': Discover city-switch E2E
 *
 * Tests the A-5 city-switching feature wired in Index.tsx + MapFilters:
 *   1. ?city= URL param is reflected in the City selector on load
 *   2. Switching city updates ?city= in the URL
 *   3. Stale ?areaKey= params are removed from the URL after city change (authenticated path)
 *
 * Run: bash scripts/run-e2e-local.sh --project=full e2e/discover-city-switch.spec.ts
 */

import { test, expect } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SS = (name: string) => path.join(__dirname, `../screenshots/city-switch-${name}.png`);

const MANIPAL_AREA_KEY = encodeURIComponent('IN|KA|Udupi|Manipal');

// ── Anonymous tests (no auth required) ──────────────────────────────────────

test.describe('Discover — city switch (anonymous)', () => {
  test('?city= URL param is reflected in the City selector', async ({ page }) => {
    // ── Step 1: Load with city=kundapur ───────────────────────────────────────
    await page.goto('/discover?city=kundapur');
    await page.waitForLoadState('domcontentloaded');

    // ── Step 2: City select trigger shows Kundapur ────────────────────────────
    // (City combobox is the always-visible anchor; "Filters" is now sr-only after
    //  the right-panel relocation in #960.)
    await expect(
      page.locator('[role="combobox"]').filter({ hasText: /kundapur/i })
    ).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: SS('01-kundapur-loaded'), fullPage: false });
  });

  test('switching city to Mangalore updates URL and City selector display', async ({ page }) => {
    // ── Step 1: Load with Udupi ───────────────────────────────────────────────
    await page.goto('/discover?city=udupi');
    await page.waitForLoadState('domcontentloaded');

    const cityTrigger = page.locator('[role="combobox"]').filter({ hasText: /udupi/i });
    await expect(cityTrigger).toBeVisible({ timeout: 10_000 });

    // ── Step 2: Switch to Mangalore ───────────────────────────────────────────
    await cityTrigger.click();
    await page.getByRole('option', { name: 'Mangalore', exact: true }).click();

    // ── Step 3: URL and selector both reflect Mangalore ───────────────────────
    await expect(page).toHaveURL(/city=mangalore/, { timeout: 8_000 });
    await expect(
      page.locator('[role="combobox"]').filter({ hasText: /mangalore/i })
    ).toBeVisible({ timeout: 6_000 });
    await page.screenshot({ path: SS('02-mangalore-selected'), fullPage: false });
  });
});

// ── Authenticated tests: URL write-back after city switch ───────────────────
// Switching city clears filters.localities (still forwarded to backend queries)
// so stale ?areaKey= params are properly removed from the URL.
// LocalityChipsBar was removed in #969; locality combobox assertions are gone.

test.describe('Discover — city switch (authenticated)', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  test('switching city clears ?areaKey= from URL', async ({ page }) => {
    // ── Step 1: Load with Udupi + Manipal areaKey pre-set in URL ─────────────
    await page.goto(`/discover?city=udupi&areaKey=${MANIPAL_AREA_KEY}`);
    await page.waitForLoadState('domcontentloaded');

    // ── Step 2: City selector shows Udupi ────────────────────────────────────
    const cityTrigger = page.locator('[role="combobox"]').filter({ hasText: /udupi/i });
    await expect(cityTrigger).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: SS('03-udupi-manipal-loaded'), fullPage: false });

    // ── Step 3: Switch city to Kundapur ──────────────────────────────────────
    await cityTrigger.click();
    await page.getByRole('option', { name: 'Kundapur', exact: true }).click();
    await page.screenshot({ path: SS('04-after-city-switch'), fullPage: false });

    // ── Step 4: URL reflects city=kundapur ───────────────────────────────────
    await expect(page).toHaveURL(/city=kundapur/, { timeout: 8_000 });

    // ── Step 5: No stale areaKey param remains ────────────────────────────────
    const url = new URL(page.url());
    expect(url.searchParams.get('city')).toBe('kundapur');
    expect(url.searchParams.getAll('areaKey')).toHaveLength(0);

    await page.screenshot({ path: SS('05-localities-cleared'), fullPage: false });
  });
});
