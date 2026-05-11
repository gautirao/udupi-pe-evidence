/**
 * E2E for Issue #1069 — area-group focus fitBounds maxZoom clamp.
 *
 * Symptom 2: Clicking University Belt zoomed too tight on Manipal and hid all
 * area markers. Root cause was AreaPanner's unconditional maxZoom=16 applied
 * to synthetic group-bounds AreaPoints from computeGroupBounds. Fix clamps
 * group-bounds fits to AREA_LAYER_MAX_ZOOM (=12) so the area-overview layer
 * stays visible.
 *
 * Spec 1 — University Belt (the regression).
 * Spec 2 — Coastal Strip (wider group, non-regression — must still work).
 *
 * Run: bash scripts/run-e2e-local.sh --project=full e2e/discover-correctness-1069.spec.ts
 */
import { test, expect } from '@playwright/test';

const AREA_MARKER = '.leaflet-marker-icon.area-marker';
// Mirrors AREA_LAYER_MAX_ZOOM in src/pages/MapDiscovery.tsx and
// AREA_PANNER_GROUP_MAX_ZOOM in src/components/map/PropertyMap.tsx.
const AREA_LAYER_MAX_ZOOM = 12;

async function readLeafletZoom(page: import('@playwright/test').Page): Promise<number> {
  return await page.evaluate(() => {
    type LeafletContainer = HTMLElement & {
      _leaflet_id?: number;
      _leaflet_map?: { getZoom?: () => number };
    };
    const el = document.querySelector<LeafletContainer>('.leaflet-container');
    if (!el) return NaN;
    // Leaflet doesn't expose the map instance via DOM; fall back to URL zoom param
    // (MapDiscovery writes zoom into the URL after every moveend via reportViewport).
    const params = new URL(window.location.href).searchParams;
    const z = params.get('zoom');
    return z !== null ? Number(z) : NaN;
  });
}

test.describe('Issue #1069 — area-group fitBounds maxZoom clamp', () => {
  test('Spec 1 (AC4) — University Belt click keeps area markers visible (zoom ≤ AREA_LAYER_MAX_ZOOM)', async ({ page }) => {
    // Area-first journey with no area selected → right-panel shows
    // AreaGroupsLandingPanel with the group cards (derivePanelContent rule:
    // journey=area-first && no areaKey → 'area-groups-landing').
    await page.goto('/discover?city=udupi&journey=area-first');
    await page.waitForLoadState('domcontentloaded');

    // Wait for the University Belt group card to render. The data-testid pattern
    // matches AreaGroupsLandingPanel: `area-group-card-${group.id}`.
    const universityBeltCard = page.getByTestId('area-group-card-university-belt');
    await universityBeltCard.waitFor({ state: 'visible', timeout: 15_000 });

    // Sanity — at least one area marker is currently visible (city-wide overview).
    await expect(page.locator(AREA_MARKER).first()).toBeVisible({ timeout: 12_000 });

    // Click the group card. This sets ?groupId=university-belt in the URL and
    // (with the #1069 fix) triggers an AreaPanner fitBounds clamped to zoom ≤ 12.
    await universityBeltCard.click();

    // URL reflects the group selection.
    await expect(page).toHaveURL(/groupId=university-belt/, { timeout: 5_000 });

    // Wait for AreaPanner to settle (fitBounds + reportViewport debounce).
    await page.waitForTimeout(2_000);

    // AC4: area markers must remain visible — without the fix, narrow groups
    // (Manipal + Katapadi only ~4 km apart) fit at zoom ~14 and the
    // `mapZoom <= AREA_LAYER_MAX_ZOOM` gate in MapDiscovery hides them.
    const areaMarkerCount = await page.locator(AREA_MARKER).count();
    expect(areaMarkerCount, 'area markers must remain rendered after group focus').toBeGreaterThanOrEqual(2);

    // Zoom must stay within the area-layer band.
    const zoom = await readLeafletZoom(page);
    expect(Number.isFinite(zoom), 'zoom param must be present in URL').toBe(true);
    expect(zoom).toBeLessThanOrEqual(AREA_LAYER_MAX_ZOOM);
  });

  test('Spec 2 (AC5) — Coastal Strip non-regression: wider group still focuses correctly', async ({ page }) => {
    await page.goto('/discover?city=udupi&journey=area-first');
    await page.waitForLoadState('domcontentloaded');

    const coastalStripCard = page.getByTestId('area-group-card-coastal-strip');
    await coastalStripCard.waitFor({ state: 'visible', timeout: 15_000 });
    await expect(page.locator(AREA_MARKER).first()).toBeVisible({ timeout: 12_000 });

    await coastalStripCard.click();
    await expect(page).toHaveURL(/groupId=coastal-strip/, { timeout: 5_000 });
    await page.waitForTimeout(2_000);

    // Wider group naturally fits at a lower zoom — verify both invariants hold.
    const areaMarkerCount = await page.locator(AREA_MARKER).count();
    expect(areaMarkerCount).toBeGreaterThanOrEqual(2);

    const zoom = await readLeafletZoom(page);
    expect(Number.isFinite(zoom)).toBe(true);
    expect(zoom).toBeLessThanOrEqual(AREA_LAYER_MAX_ZOOM);
  });
});
