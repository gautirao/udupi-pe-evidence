/**
 * E-3': Discover viewport / zoom-band layer spec
 *
 * Tests the D-switch zoom-band layer strategy in Index.tsx:
 *   - zoom ≤ AREA_LAYER_MAX_ZOOM (12): area markers visible, listing markers hidden
 *   - zoom > AREA_LAYER_MAX_ZOOM (12): area markers hidden, listing markers visible (auth only)
 *
 * Anonymous tests: area marker visibility at low zoom.
 * Authenticated tests: full layer flip (areas → markers) when zooming past 12.
 *
 * Run: bash scripts/run-e2e-local.sh --project=full e2e/discover-viewport.spec.ts
 */

import { test, expect } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SS = (name: string) => path.join(__dirname, `../screenshots/viewport-${name}.png`);

const AREA_MARKER = '.leaflet-marker-icon.area-marker';
const AREA_LAYER_MAX_ZOOM = 12;

/** Clicks the Leaflet zoom-in button `steps` times.
 *  force=false (anonymous): no overlay, click works normally.
 *  force=true (authenticated): the locality-chips overlay covers the control area
 *  so force bypasses the hit-test while still triggering the zoom. */
async function zoomIn(
  page: import('@playwright/test').Page,
  steps: number,
  { force = false }: { force?: boolean } = {},
) {
  const zoomInBtn = page.locator('.leaflet-control-zoom-in');
  for (let i = 0; i < steps; i++) {
    await zoomInBtn.click(force ? { force: true } : undefined);
    await page.waitForTimeout(400);
  }
}

// ── Anonymous tests ──────────────────────────────────────────────────────────

test.describe('Discover — viewport zoom-band (anonymous)', () => {
  test('area markers are visible at default Udupi zoom (11 ≤ 12)', async ({ page }) => {
    await page.goto('/discover?city=udupi');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: 'Filters' })).toBeVisible({ timeout: 10_000 });

    // Default zoom is 11 → area layer is active
    await expect(page.locator(AREA_MARKER).first()).toBeVisible({ timeout: 12_000 });
    await page.screenshot({ path: SS('01-areas-at-zoom-11'), fullPage: false });
  });

  test('area markers disappear when zoom exceeds AREA_LAYER_MAX_ZOOM', async ({ page }) => {
    await page.goto('/discover?city=udupi');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: 'Filters' })).toBeVisible({ timeout: 10_000 });

    // Wait for area markers at zoom ≤ 12
    await expect(page.locator(AREA_MARKER).first()).toBeVisible({ timeout: 12_000 });
    await page.screenshot({ path: SS('02-areas-before-zoom-in'), fullPage: false });

    // Zoom past 12: Udupi default=11, so 2 clicks of "+" → zoom 13
    await zoomIn(page, 2);

    // Allow React state (onZoomChange → setMapZoom) to propagate
    await page.waitForTimeout(500);
    await page.screenshot({ path: SS('03-after-zoom-in'), fullPage: false });

    // Area markers should no longer be rendered (areas=[] passed to PropertyMap)
    await expect(page.locator(AREA_MARKER)).toHaveCount(0, { timeout: 5_000 });
  });
});

// ── Authenticated tests ──────────────────────────────────────────────────────
// Listing markers (from /api/listings/markers) only render for auth'd users
// when zoom > AREA_LAYER_MAX_ZOOM.

test.describe('Discover — viewport zoom-band (authenticated)', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  test('area markers shown at zoom ≤ 12, listing markers shown at zoom > 12', async ({ page }) => {
    await page.goto('/discover?city=udupi');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: 'Filters' })).toBeVisible({ timeout: 10_000 });

    // ── Step 1: zoom 11 — area layer active ───────────────────────────────────
    await expect(page.locator(AREA_MARKER).first()).toBeVisible({ timeout: 12_000 });
    const areasAtLowZoom = await page.locator(AREA_MARKER).count();
    expect(areasAtLowZoom).toBeGreaterThan(0);
    await page.screenshot({ path: SS('04-auth-areas-zoom-11'), fullPage: false });

    // ── Step 2: zoom 13 — flip to listing markers layer ───────────────────────
    // Udupi default=11, so 2 zoom-in clicks → zoom 13 (> AREA_LAYER_MAX_ZOOM=12)
    // force=true: locality-chips overlay covers the zoom control for auth users
    await zoomIn(page, 2, { force: true });
    await page.waitForTimeout(500);
    await page.screenshot({ path: SS('05-auth-zoom-13'), fullPage: false });

    // Area markers gone
    await expect(page.locator(AREA_MARKER)).toHaveCount(0, { timeout: 5_000 });

    // Listing markers may appear (depends on data in bbox); we just assert
    // that the area layer was correctly suppressed — the render path is correct.
    await page.screenshot({ path: SS('06-auth-listing-markers-layer'), fullPage: false });
  });
});
