/**
 * Issue #2715 — school-first Map: the "No schools found in this area" empty
 * pill (data-testid `school-marker-empty`, rendered by
 * apps/web/src/components/map/SchoolMarkerLayer.tsx) must NOT render while
 * the selected school's own pin/ring is visible on the map.
 *
 * BEFORE the fix, `SchoolMarkerLayer` showed the empty pill whenever the
 * `schools` list (nearby-school markers, a SEPARATE data path from the
 * selected school) was empty — even though a school WAS selected and its
 * pin/ring (rendered by `SchoolRadiusOverlay` in `PropertyMap.tsx`, reading
 * the `selectedSchoolId`/`schoolCircle` state, not the `schools` array) were
 * on screen. AFTER the fix, the empty-pill gate is
 * `schools.length === 0 && selectedSchoolId === null` — so a selected school
 * suppresses the pill even when the nearby-schools list is empty.
 *
 * This spec runs against a REAL browser + REAL fixture backend (no
 * page.route mocking): it exercises the actual API response for the
 * `[E2E] Manipal Test College` fixture row (id
 * 11111111-2222-3333-4444-555555555555, areaKey IN|KA|Udupi|Manipal,
 * lat 13.3525 / lon 74.7923) and the actual rendered Leaflet map.
 *
 * Guard against a vacuous negative: the pill-absent assertion for each
 * viewport runs ONLY after that viewport's positive pin+ring-visible
 * assertions have already passed — a broken/blank map would otherwise make
 * "no pill" trivially true.
 */
import { URL as NodeURL } from 'node:url';
import { test, expect, backendGet } from './support/specialist-test';
import type { Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/discover/**', async (route) => {
    try {
      const u = new NodeURL(route.request().url());
      const res = await backendGet(page, `${u.pathname}${u.search}`);
      const body = (await res.text()).replace(
        /https?:\/\/[^"\x27\s]*Fixture\+Photo[^"\x27\s]*/g,
        'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      );
      await route.fulfill({ status: res.status(), headers: res.headers(), body });
    } catch {
      /* page or APIResponse disposed during test teardown */
    }
  });
});

const SCHOOL_ID = '11111111-2222-3333-4444-555555555555';
const AREA_KEY = 'IN|KA|Udupi|Manipal';
const URL = `/discover?city=udupi&journey=school-first&areaKey=${encodeURIComponent(AREA_KEY)}&schoolId=${SCHOOL_ID}`;

// Selected-school pin: rendered by SchoolRadiusOverlay (PropertyMap.tsx) into
// the `selected-school-pane` Leaflet pane, live-confirmed via a real DOM
// query against the AFTER fixture stack.
const SCHOOL_PIN = '.leaflet-marker-icon.school-marker';
// Selected-school 3km radius ring: the Leaflet <Circle> SVG path with the
// exact pathOptions SchoolRadiusOverlay applies (color hsl(var(--plum)),
// dashArray '6 4', fillOpacity 0.08) — live-confirmed the same way, scoped to
// the overlay pane so it can't collide with an unrelated icon <path>.
const SCHOOL_RING = '.leaflet-overlay-pane path[stroke="hsl(var(--plum))"]';

async function declineTelemetryConsentIfPresent(page: Page) {
  // Decline (not Accept/grant) per the task's requirement — dismisses the
  // DiscoverConsentBanner without opting in to telemetry, in case the banner
  // occludes the map at this viewport.
  const decline = page.getByRole('button', { name: 'Decline anonymous usage data collection' });
  if (await decline.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await decline.click();
  }
}

async function assertSelectedSchoolPinVisible(page: Page) {
  // POSITIVE, data path: SchoolRadiusOverlay's `schoolCircle` derived state
  // (gated only on `if (!schoolCircle) return null;`) — independent of the
  // `schools` (nearby-markers) list that SchoolMarkerLayer reads.
  await expect(page.locator(SCHOOL_PIN)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(SCHOOL_RING)).toBeVisible();
}

async function assertEmptyPillAbsent(page: Page) {
  // NEGATIVE, data path: SchoolMarkerLayer's `schools` (nearby-school
  // markers) list combined with `selectedSchoolId` — this is the exact fix
  // gate (`schools.length === 0 && selectedSchoolId === null`). Only
  // meaningful because assertSelectedSchoolPinVisible() already proved the
  // map itself rendered correctly for this page/viewport.
  await expect(page.getByTestId('school-marker-empty')).toHaveCount(0);
  await expect(page.getByText('No schools found in this area')).toHaveCount(0);
}

test.describe('@discover #2715 — selected-school pin suppresses the empty-schools pill', () => {
  test('desktop 1440x900 — Map is visible without switching views; pin+ring show, empty pill is absent', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(URL);
    await page.waitForLoadState('domcontentloaded');
    await declineTelemetryConsentIfPresent(page);

    // Live-confirmed: at 1440x900 the Map is already the visible pane for
    // the school-first journey — no `control-bar-map-trigger` click needed
    // (unlike the mobile breakpoints below).
    await assertSelectedSchoolPinVisible(page);
    await assertEmptyPillAbsent(page);
  });

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 375, height: 667 },
    { width: 412, height: 915 },
  ]) {
    test(`mobile ${viewport.width}x${viewport.height} — switch to Map via control-bar-map-trigger; pin+ring show, empty pill is absent`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto(URL);
      await page.waitForLoadState('domcontentloaded');
      await declineTelemetryConsentIfPresent(page);

      // Below the mobile breakpoint the default split-view pane is List, not
      // Map (same pattern confirmed live for #1956 PR-2 in
      // e2e/discover/issue-1956-pr2-breadcrumb.spec.ts) — switch explicitly.
      const mapTrigger = page.getByTestId('control-bar-map-trigger');
      if (await mapTrigger.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await mapTrigger.click();
      }

      await assertSelectedSchoolPinVisible(page);
      await assertEmptyPillAbsent(page);
    });
  }
});
