/**
 * E2E-3: Discover viewport restoration via URLViewportController (#1043)
 *
 * Tests browser Back/Forward navigation with map viewport restoration:
 *   - Navigates from city-level → area-specific zoom
 *   - Verifies goBack() restores previous viewport state from URL
 *   - Verifies goForward() reapplies deeper zoom state from URL
 *
 * Run: bash scripts/run-e2e-local.sh --project=full e2e/discover-viewport.spec.ts
 */

import { test, expect } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SS = (name: string) => path.join(__dirname, `../screenshots/viewport-${name}.png`);

const AREA_MARKER = '.leaflet-marker-icon.area-marker';


// ── Authenticated tests ──────────────────────────────────────────────────────
// Listing markers (from /api/listings/markers) only render for auth'd users
// when zoom > AREA_LAYER_MAX_ZOOM.

// ── Browser Back/Forward viewport restoration tests ────────────────────────

test.describe('@integration-ui Discover — viewport restoration on browser Back/Forward (#1043)', () => {
  test('browser Back restores map viewport from URL state', async ({ page }) => {
    const MOCK_AREA_KEY = 'IN|KA|Udupi|Manipal';
    const ENCODED_AREA_KEY = encodeURIComponent(MOCK_AREA_KEY);

    // Step 1: Navigate directly to city level (default zoom)
    await page.goto('/discover?city=udupi');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator(AREA_MARKER).first()).toBeVisible({ timeout: 12_000 });

    // Step 2: Navigate to area with explicit zoom (deeper context)
    const areaZoomedUrl = `/discover?city=udupi&areaKey=${ENCODED_AREA_KEY}&lat=13.35&lon=74.79&zoom=14`;
    await page.goto(areaZoomedUrl);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(600); // Allow URLViewportController effect to apply setView

    // Verify area is selected in URL
    expect(page.url()).toContain('areaKey=');
    expect(page.url()).toContain('zoom=14');

    // Step 3: Browser Back — should restore city level viewport
    await page.goBack();
    await page.waitForTimeout(600); // Allow setView to apply

    // Verify URL no longer has areaKey
    const backUrl = page.url();
    expect(backUrl).toContain('city=udupi');
    expect(backUrl).not.toContain('areaKey=');

    // Verify area markers are visible again (zoom ≤ 12)
    // The URLViewportController should have applied map.setView() to restore city center/zoom
    await expect(page.locator(AREA_MARKER).first()).toBeVisible({ timeout: 5_000 });
  });

  test('browser Forward reapplies map viewport from URL state', async ({ page }) => {
    const MOCK_AREA_KEY = 'IN|KA|Udupi|Manipal';
    const ENCODED_AREA_KEY = encodeURIComponent(MOCK_AREA_KEY);

    // Step 1: Navigate to city
    await page.goto('/discover?city=udupi');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator(AREA_MARKER).first()).toBeVisible({ timeout: 12_000 });

    // Step 2: Navigate to area with explicit viewport (creates history)
    const areaZoomedUrl = `/discover?city=udupi&areaKey=${ENCODED_AREA_KEY}&lat=13.35&lon=74.79&zoom=14`;
    await page.goto(areaZoomedUrl);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(600);

    // Verify area context
    expect(page.url()).toContain('areaKey=');
    expect(page.url()).toContain('zoom=14');

    // Step 3: Go Back (restores city)
    await page.goBack();
    await page.waitForTimeout(600);
    const backUrl = page.url();
    expect(backUrl).not.toContain('areaKey=');

    // Step 4: Go Forward (should restore area zoom)
    await page.goForward();
    await page.waitForTimeout(600);

    // Verify area context is restored
    const forwardUrl = page.url();
    expect(forwardUrl).toContain('areaKey=');
    expect(forwardUrl).toContain('zoom=14');

    // Right panel should show area selection heading
    await expect(page.getByRole('heading', { name: /Manipal|properties/i }).first()).toBeVisible({ timeout: 5_000 });
  });
});
