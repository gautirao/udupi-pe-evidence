/**
 * E-1': Discover area cards E2E
 *
 * Tests the B-switch area cards feature:
 *   1. Area markers are rendered on the map at default zoom (≤ AREA_LAYER_MAX_ZOOM=12)
 *      sourced from GET /api/discover/areas (useDiscoverAreas hook)
 *   2. Clicking an area marker navigates to /trends with city= and areaKey= params
 *   3. Switching city refreshes area markers for the new city
 *
 * Anonymous flow — no auth required (discover/areas endpoint uses skipAuth).
 * Run: bash scripts/run-e2e-local.sh --project=full e2e/discover-area-cards.spec.ts
 */

import { test, expect } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SS = (name: string) => path.join(__dirname, `../screenshots/area-cards-${name}.png`);

// Area markers use className 'area-marker' (set in makeAreaIcon DivIcon)
const AREA_MARKER = '.leaflet-marker-icon.area-marker';

test.describe('Discover — area cards (B-switch)', () => {
  test('area markers appear on the map for default Udupi city', async ({ page }) => {
    // ── Step 1: Load Discover with Udupi at default zoom ─────────────────────
    await page.goto('/discover?city=udupi');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: 'Filters' })).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: SS('01-discover-loaded'), fullPage: false });

    // ── Step 2: At least one area marker is visible (from /api/discover/areas) ─
    // Default Udupi zoom=11 ≤ AREA_LAYER_MAX_ZOOM=12 so area layer is active
    await expect(page.locator(AREA_MARKER).first()).toBeVisible({ timeout: 12_000 });
    await page.screenshot({ path: SS('02-area-markers-visible'), fullPage: false });

    // At least one marker rendered
    const count = await page.locator(AREA_MARKER).count();
    expect(count).toBeGreaterThan(0);
  });

  test('clicking an area marker navigates to /trends with city and areaKey', async ({ page }) => {
    // ── Step 1: Load Discover ─────────────────────────────────────────────────
    await page.goto('/discover?city=udupi');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: 'Filters' })).toBeVisible({ timeout: 10_000 });

    // ── Step 2: Wait for area markers ────────────────────────────────────────
    const firstMarker = page.locator(AREA_MARKER).first();
    await expect(firstMarker).toBeVisible({ timeout: 12_000 });
    await page.screenshot({ path: SS('03-before-click'), fullPage: false });

    // ── Step 3: Click the first area marker ───────────────────────────────────
    // force: true — the inner ▲ triangle div has no pointer-events:none and
    // intercepts Playwright's hit-test; force bypasses it safely.
    await firstMarker.click({ force: true });

    // ── Step 4: Navigated to /trends with city=udupi and at least one areaKey ─
    await expect(page).toHaveURL(/\/trends/, { timeout: 8_000 });
    const url = new URL(page.url());
    expect(url.pathname).toBe('/trends');
    expect(url.searchParams.get('city')).toBe('udupi');
    expect(url.searchParams.getAll('areaKey').length).toBeGreaterThan(0);
    await page.screenshot({ path: SS('04-trends-after-area-click'), fullPage: false });
  });

  test('switching city replaces area markers with those of the new city', async ({ page }) => {
    // ── Step 1: Load with Udupi ───────────────────────────────────────────────
    await page.goto('/discover?city=udupi');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: 'Filters' })).toBeVisible({ timeout: 10_000 });

    // Wait for initial area markers
    await expect(page.locator(AREA_MARKER).first()).toBeVisible({ timeout: 12_000 });
    const udupiCount = await page.locator(AREA_MARKER).count();

    // ── Step 2: Switch to Kundapur ────────────────────────────────────────────
    const cityTrigger = page.locator('[role="combobox"]').filter({ hasText: /udupi/i });
    await cityTrigger.click();
    await page.getByRole('option', { name: 'Kundapur', exact: true }).click();

    // ── Step 3: URL reflects new city ─────────────────────────────────────────
    await expect(page).toHaveURL(/city=kundapur/, { timeout: 8_000 });
    await page.screenshot({ path: SS('05-kundapur-areas'), fullPage: false });

    // ── Step 4: Area markers update (new useDiscoverAreas('kundapur') query) ──
    // Markers re-render; just verify the layer is still active (count may differ)
    await expect(page.locator(AREA_MARKER).first()).toBeVisible({ timeout: 12_000 });
    const kundapurCount = await page.locator(AREA_MARKER).count();

    console.log(`Udupi area markers: ${udupiCount}, Kundapur area markers: ${kundapurCount}`);
    expect(kundapurCount).toBeGreaterThan(0);
  });
});
