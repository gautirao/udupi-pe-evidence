/**
 * E2E: Issue #1821 — cold-load region -> group -> area drill-down loses tight
 * camera fit (stale group/region viewport wins).
 *
 * Symptom: navigating region -> group -> area (e.g. North Bangalore ->
 * Airport Belt -> Devanahalli) and then reloading/bookmarking/sharing the
 * resulting URL rendered the map at the STALE, far-too-wide group/region
 * viewport instead of tightly fitting the selected area's own bounds. The
 * SAME navigation performed via in-app clicks (no reload) always worked —
 * this is a cold-load-only regression.
 *
 * Root cause: MapDiscovery.tsx's deferred areaKey-hydration effect gated the
 * area-specific setPanToArea(match) fit behind `if (!initialViewportRef.current)`.
 * initialViewportRef is a mount-time snapshot of the URL viewport and cannot
 * tell a genuinely restored area viewport (#1160/#1069, bare areaKey-only
 * URL) apart from a viewport merely inherited from an earlier group/region
 * navigation step. Fix: the area-specific fit now always fires when the
 * mount-time URL had a groupId/scope alongside areaKey (a group/region
 * drill-down) — an inherited viewport is only trusted (fit suppressed) for a
 * genuinely bare area-only URL (areaKey, no groupId/scope).
 *
 * Real, code-traceable assertion: MapDiscovery writes the settled Leaflet
 * zoom back into the URL after every moveend/zoomend via reportViewport
 * (confirmed precedent: e2e/discover-correctness-1069.spec.ts). The reported
 * bug URL's stale zoom (12) IS exactly AREA_PANNER_GROUP_MAX_ZOOM — the clamp
 * AreaPanner applies ONLY to synthetic GROUP_BOUNDS fits (PropertyMap.tsx).
 * A genuine area-specific fit never uses that clamp — it either flies to
 * zoom 13 (center-only areas) or fitBounds's with maxZoom 16 (areas with a
 * bbox) — so it always settles at zoom > 12. If the bug were present (area
 * fit skipped because an inherited viewport was wrongly trusted), the URL's
 * zoom would stay pinned at the stale 12 forever, since no further
 * moveend/zoomend would fire to overwrite it. This spec asserts the settled
 * zoom exceeds 12, which is true if and only if the area-specific fit
 * actually fired.
 *
 * Runs against the REAL backend + shared hosted Supabase (no page.route()
 * mocks), per the same read-only-navigation, no-migration precedent as
 * e2e/discover/thanisandra-hennur-belt-label-collision-1815.spec.ts.
 * airport-belt (region_label 'North Bangalore', i.e. scope=north) with
 * member area IN|KA|Bengaluru|Devanahalli is a real seeded group (confirmed
 * in backend/db/migration/V106__seed_bangalore_macro_region_mapping.sql and
 * exercised live by e2e/discover-area-first-polish-1765.spec.ts's Scenario 4
 * against this same group).
 *
 * Run locally (full project, no stubs):
 *   bash scripts/run-e2e-local.sh --project=full \
 *     e2e/discover/area-drilldown-stale-viewport-1821.spec.ts
 *
 * Screenshots land in test-results/1821-*.png.
 */

import { test, expect, type Page } from '@playwright/test';
import { grantDiscoverConsent } from '../helpers';

const CITY = 'bangalore';
const SCOPE = 'north';
const GROUP_ID = 'airport-belt';
const AREA_KEY_DEVANAHALLI = 'IN|KA|Bengaluru|Devanahalli';

// The exact stale group/region viewport from the reported production repro
// (evidence in .claude/state/current-approved-plan.toml, issue 1821): this
// zoom is the AREA_PANNER_GROUP_MAX_ZOOM clamp applied to the group's own
// synthetic-bounds fit — NOT any area-specific fit.
const STALE_GROUP_VIEWPORT = { lat: 13.16923, lon: 77.63743, zoom: 12 };
const GROUP_CLAMP_ZOOM = 12;

async function readUrlZoom(page: Page): Promise<number> {
  return page.evaluate(() => {
    const z = new URL(window.location.href).searchParams.get('zoom');
    return z !== null ? Number(z) : NaN;
  });
}

/**
 * Polls the URL's zoom param until it stops changing across `stableChecks`
 * consecutive polls, instead of guessing a fixed delay. Mirrors the
 * settle-polling pattern in e2e/discover/thanisandra-hennur-belt-label-collision-1815.spec.ts
 * (waitForStableMarkerCount) — the area-specific fit (flyTo/fitBounds) only
 * writes its final zoom into the URL once the moveend/zoomend -> debounced
 * reportViewport chain completes, and that completion time is not bounded by
 * a fixed sleep.
 */
async function waitForStableZoom(
  page: Page,
  opts: { stableChecks?: number; intervalMs?: number; timeoutMs?: number } = {},
): Promise<number> {
  const stableChecks = opts.stableChecks ?? 3;
  const intervalMs = opts.intervalMs ?? 300;
  const timeoutMs = opts.timeoutMs ?? 12_000;
  const deadline = Date.now() + timeoutMs;
  let lastZoom = NaN;
  let stableStreak = 0;
  for (;;) {
    const zoom = await readUrlZoom(page);
    if (Number.isFinite(zoom) && zoom === lastZoom) {
      stableStreak += 1;
      if (stableStreak >= stableChecks) return zoom;
    } else {
      stableStreak = 0;
      lastZoom = zoom;
    }
    if (Date.now() >= deadline) return lastZoom;
    await page.waitForTimeout(intervalMs);
  }
}

test.describe('@integration-ui Issue #1821 — cold-load area drill-down stale viewport', () => {
  test('AC1: region -> group -> area URL with an inherited stale group-zoom viewport re-fits tightly to the area (zoom settles above the group clamp)', async ({
    page,
  }) => {
    await grantDiscoverConsent(page);

    // Cold load via page.goto — reproduces reload/bookmark/share, NOT an
    // in-app click-through (the in-app path was never broken; the bug is
    // cold-load-only, per the plan's evidence).
    const url =
      `/discover?city=${CITY}&scope=${SCOPE}&groupId=${GROUP_ID}` +
      `&lat=${STALE_GROUP_VIEWPORT.lat}&lon=${STALE_GROUP_VIEWPORT.lon}&zoom=${STALE_GROUP_VIEWPORT.zoom}` +
      `&areaKey=${encodeURIComponent(AREA_KEY_DEVANAHALLI)}`;
    await page.goto(url);
    await page.waitForLoadState('domcontentloaded');

    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 15_000 });

    // Drill-down landed on Devanahalli's own listings (sanity — proves the
    // `if (match)` branch in the hydration effect actually ran).
    await expect(page.getByTestId('area-result-summary')).toBeVisible({ timeout: 15_000 });

    const settledZoom = await waitForStableZoom(page);
    expect(Number.isFinite(settledZoom), 'zoom param must be present in the URL after settling').toBe(true);

    // THE regression assertion: without the #1821 fix, the area-specific fit
    // never fires (inherited viewport wrongly trusted because a groupId/scope
    // was present), so no moveend/zoomend ever overwrites the URL's zoom —
    // it stays pinned at the stale group clamp (12) forever. With the fix,
    // the area-specific fit (flyTo zoom 13, or fitBounds maxZoom 16) always
    // settles strictly above the group clamp.
    expect(
      settledZoom,
      `settled zoom (${settledZoom}) must exceed the group/region clamp (${GROUP_CLAMP_ZOOM}) — ` +
        'a value at or below it means the area-specific fit did not fire and the stale group/region ' +
        'viewport won, reproducing #1821',
    ).toBeGreaterThan(GROUP_CLAMP_ZOOM);

    await page.screenshot({ path: 'test-results/1821-ac1-drilldown-tight-fit.png', fullPage: false });
  });

  test('AC2 (#1160/#1069 non-regression): a bare area-only cold load (no groupId/scope) preserves the restored viewport untouched', async ({
    page,
  }) => {
    await grantDiscoverConsent(page);

    // Devanahalli's own tight viewport (distinct from the group clamp used in
    // AC1) — a genuinely restored, bare area-only deep link, exactly the
    // #1160/#1069 shape (areaKey + viewport, NO groupId, NO scope).
    const restoredViewport = { lat: 13.2437, lon: 77.7108, zoom: 15 };
    const url =
      `/discover?city=${CITY}` +
      `&lat=${restoredViewport.lat}&lon=${restoredViewport.lon}&zoom=${restoredViewport.zoom}` +
      `&areaKey=${encodeURIComponent(AREA_KEY_DEVANAHALLI)}`;
    await page.goto(url);
    await page.waitForLoadState('domcontentloaded');

    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 15_000 });

    // Positive signal the hydration effect's `if (match)` branch actually
    // ran and reached the bare-area gate (not merely that nothing happened).
    await expect(page.getByTestId('area-result-summary')).toBeVisible({ timeout: 15_000 });

    // Poll (not a fixed sleep — see waitForStableZoom doc comment above) to
    // give any spurious fit a chance to fire and settle, then assert the
    // zoom param is UNCHANGED from what was restored — proving the
    // area-specific fit was correctly suppressed for this bare-area shape
    // (the original #1160/#1069 guard behaviour, preserved by #1821's fix).
    const zoomAfter = await waitForStableZoom(page);
    expect(
      zoomAfter,
      'bare area-only cold load must preserve the restored viewport zoom untouched (no re-fit override)',
    ).toBe(restoredViewport.zoom);

    await page.screenshot({ path: 'test-results/1821-ac2-bare-area-viewport-preserved.png', fullPage: false });
  });
});
