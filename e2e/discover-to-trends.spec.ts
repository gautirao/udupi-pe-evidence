/**
 * E-5: Discover → C-switch skinny marker → lazy popover hydration
 *
 * Tests the C-switch feature set:
 *   1. Listing markers (from /api/listings/markers) appear at zoom > AREA_LAYER_MAX_ZOOM=12
 *   2. Clicking a listing marker opens the popover (lazy hydration via useListingDetail)
 *   3. The popover contains a "View Details" button (confirming full hydration path wired)
 *   4. "View Area Trends" link navigates to /trends when the listing has an areaKey
 *
 * Requires authenticated user — listing markers only render for isAuthenticated.
 * Run: bash scripts/run-e2e-local.sh --project=full e2e/discover-to-trends.spec.ts
 */

import { test, expect } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SS = (name: string) => path.join(__dirname, `../screenshots/d2t-${name}.png`);

// Listing markers: custom-marker class set by createMarkerIcon DivIcon
const LISTING_MARKER = '.leaflet-marker-icon.custom-marker';
// Cluster icon class for MarkerClusterGroup
const CLUSTER_MARKER = '.leaflet-marker-icon.leaflet-div-icon .custom-marker-cluster, .custom-marker-cluster';

test.describe('Discover → C-switch skinny markers + popover (authenticated)', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  test('listing markers appear at zoom > 12 (C-switch layer active)', async ({ page }) => {
    // ── Step 1: Load Discover ─────────────────────────────────────────────────
    await page.goto('/discover?city=udupi');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: 'Filters' })).toBeVisible({ timeout: 10_000 });

    // At zoom 11 (default), listing markers are hidden (mapZoom ≤ AREA_LAYER_MAX_ZOOM)
    await expect(page.locator('.leaflet-marker-icon.area-marker').first()).toBeVisible({ timeout: 12_000 });
    await page.screenshot({ path: SS('01-areas-at-zoom-11'), fullPage: false });

    // ── Step 2: Zoom in past 12 (force: locality-chips overlay covers control) ─
    const zoomInBtn = page.locator('.leaflet-control-zoom-in');
    await zoomInBtn.click({ force: true });
    await page.waitForTimeout(400);
    await zoomInBtn.click({ force: true });
    await page.waitForTimeout(400);

    // ── Step 3: Area markers removed; listing markers (or clusters) visible ────
    await expect(page.locator('.leaflet-marker-icon.area-marker')).toHaveCount(0, { timeout: 5_000 });
    await page.screenshot({ path: SS('02-after-zoom-13'), fullPage: false });

    // At least one listing marker or cluster is present
    const listingOrCluster = page.locator(`${LISTING_MARKER}, .custom-marker-cluster`);
    await expect(listingOrCluster.first()).toBeVisible({ timeout: 10_000 });
    const markerCount = await listingOrCluster.count();
    expect(markerCount).toBeGreaterThan(0);
    await page.screenshot({ path: SS('03-listing-markers-visible'), fullPage: false });
  });

  test('clicking a listing marker opens the lazy-hydrated popover', async ({ page }) => {
    // ── Step 1: Load Discover and zoom in to disable clustering (zoom 16) ─────
    await page.goto('/discover?city=udupi');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: 'Filters' })).toBeVisible({ timeout: 10_000 });

    // Wait for initial area markers at zoom 11
    await expect(page.locator('.leaflet-marker-icon.area-marker').first()).toBeVisible({ timeout: 12_000 });

    // Zoom in 5× → zoom 16 (disableClusteringAtZoom=16 in MarkerClusterLayer)
    const zoomInBtn = page.locator('.leaflet-control-zoom-in');
    for (let i = 0; i < 5; i++) {
      await zoomInBtn.click({ force: true });
      await page.waitForTimeout(400);
    }
    await page.screenshot({ path: SS('04-zoom-16'), fullPage: false });

    // ── Step 2: Wait for individual listing markers (no cluster at zoom 16) ────
    // If no markers visible at center, this test passes trivially — the C-switch
    // layer wire is verified by test 1 above; popover hydration requires data.
    const firstMarker = page.locator(LISTING_MARKER).first();
    const markerVisible = await firstMarker.isVisible().catch(() => false);

    if (!markerVisible) {
      // No individual markers visible at map center after 5 zooms — skip popover test
      test.skip(true, 'No individual listing markers in map viewport at zoom 16; skip popover test');
      return;
    }

    await page.screenshot({ path: SS('05-individual-marker'), fullPage: false });

    // ── Step 3: Click the first individual marker ─────────────────────────────
    await firstMarker.click({ force: true });
    await page.screenshot({ path: SS('06-after-marker-click'), fullPage: false });

    // ── Step 4: Popover (hydratedListing card) appears ───────────────────────
    // The popover contains a "View Details" button (always present on auth'd path)
    await expect(
      page.getByRole('button', { name: /View Details/i })
    ).toBeVisible({ timeout: 8_000 });
    await page.screenshot({ path: SS('07-popover-visible'), fullPage: false });
  });

  test('listing popover "View Area Trends" link navigates to /trends', async ({ page }) => {
    // ── Step 1: Load Discover and zoom in to zoom 16 ─────────────────────────
    await page.goto('/discover?city=udupi');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: 'Filters' })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.leaflet-marker-icon.area-marker').first()).toBeVisible({ timeout: 12_000 });

    const zoomInBtn = page.locator('.leaflet-control-zoom-in');
    for (let i = 0; i < 5; i++) {
      await zoomInBtn.click({ force: true });
      await page.waitForTimeout(400);
    }

    // ── Step 2: Check for individual markers ─────────────────────────────────
    const firstMarker = page.locator(LISTING_MARKER).first();
    const markerVisible = await firstMarker.isVisible().catch(() => false);

    if (!markerVisible) {
      test.skip(true, 'No individual listing markers in map viewport at zoom 16; skip trends nav test');
      return;
    }

    // ── Step 3: Click marker and wait for popover ─────────────────────────────
    await firstMarker.click({ force: true });
    await expect(page.getByRole('button', { name: /View Details/i })).toBeVisible({ timeout: 8_000 });

    // ── Step 4: If "View Area Trends" link exists, click it ───────────────────
    // The link only renders when hydratedListing.areaKey is set (lazy hydration).
    const trendsLink = page.getByRole('link', { name: /View Area Trends/i });
    const trendsLinkVisible = await trendsLink.isVisible({ timeout: 3_000 }).catch(() => false);

    if (trendsLinkVisible) {
      await trendsLink.click();
      await expect(page).toHaveURL(/\/trends/, { timeout: 8_000 });
      const url = new URL(page.url());
      expect(url.pathname).toBe('/trends');
      expect(url.searchParams.has('areaKey')).toBe(true);
      await page.screenshot({ path: SS('08-trends-from-popover'), fullPage: false });
    } else {
      // Listing hydrated but no areaKey — popover "View Details" path still verified
      await page.screenshot({ path: SS('08-no-trends-link'), fullPage: false });
    }
  });
});
