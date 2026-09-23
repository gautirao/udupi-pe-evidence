/**
 * E2E: Issue #2674 — mobile Discover's map viewport `lat`/`lon` URL params
 * don't reliably sync after a camera restore on a remounted map.
 *
 * ── ROOT CAUSE ──
 * `viewport.ts`'s `reportViewport` debounces every `moveend`/`zoomend`
 * (ViewportWatcher, PropertyMap.tsx) 300ms before writing `lat`/`lon`/`zoom`
 * to the URL, via a SHARED timer ref (`timers.viewport`) owned by the
 * `useDiscoverUrlState` facade — which lives ABOVE PropertyMap's mobile
 * remount boundary and never unmounts with it.
 *
 * Two existing guards already cancel this timer to close a related race
 * (issue #2083): the per-writer synchronous cancels (area.ts's
 * `deselectArea`, city.ts's `changeCity`, etc.) and a universal
 * `location.key`-keyed cancel in `useDiscoverUrlState.ts`. Neither covers
 * mobile's List<->Map toggle: it is local UI state (`useMobileMapOverlayShell`),
 * not a URL navigation, so `location.key` never changes, yet
 * `DiscoverMapCanvas` (and the whole Leaflet map inside it) genuinely
 * real-unmounts and remounts (Discover is panel-first — see #1953).
 *
 * A pan that fires `moveend` shortly before the map closes to List leaves a
 * 300ms-debounced URL write armed with nothing left to cancel it. It fires
 * later — regardless of the component's lifecycle — silently overwriting the
 * URL's `lat`/`lon`/`zoom` with the stale, now-irrelevant pre-close pan
 * position, even while the map sits closed in List view with a committed
 * AREA_SET scope whose OWN camera fit has nothing to do with that pan.
 *
 * ── FIX ──
 * `DiscoverMapCanvas` now cancels the pending viewport debounce commit
 * (`urlActions.cancelViewportCommit`, wired to the SAME `timers.viewport`
 * ref the two existing guards already use) in its own unmount cleanup — the
 * genuine real-unmount boundary for the mobile map.
 *
 * Run:
 *   bash scripts/run-e2e-local.sh --project=full e2e/discover/issue-2674-mobile-viewport-debounce-orphan.spec.ts
 * Prerequisites: PLAYWRIGHT_BASE_URL / BACKEND_BASE_URL pointing at a running
 * dev stack with the seeded Bangalore fixture (matches #2017/#2015/#2494
 * conventions). Reuses the RR Nagar + Deepanjali Nagar AREA_SET(N>1) fixture
 * and real-mouse-event pan helper from
 * e2e/discover/issue-2494-mobile-return-camera-restore.spec.ts.
 */

import { test, expect, type Page } from '@playwright/test';

const AREA_RR_NAGAR = 'a:IN|KA|Bengaluru|RR Nagar';
const AREA_RR_NAGAR_KEY = 'IN|KA|Bengaluru|RR Nagar';
const AREA_DEEPANJALI_NAGAR_KEY = 'IN|KA|Bengaluru|Deepanjali Nagar';

const MOBILE_VIEWPORT = { width: 390, height: 844 };

function urlParam(page: Page, name: string): string | null {
  return new URL(page.url()).searchParams.get(name);
}

async function declineConsentBannerIfPresent(page: Page): Promise<void> {
  const banner = page.getByTestId('discover-consent-banner');
  if (await banner.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await banner.getByRole('button', { name: /decline/i }).click();
    await expect(banner).not.toBeVisible({ timeout: 5_000 });
  }
}

/**
 * Mirrors issue-2494's identically-named helper: commits an N=2 AREA_SET
 * (RR Nagar + Deepanjali Nagar) via the real "Add nearby areas" draft flow.
 */
async function reachCommittedRrNagarDeepanjaliAreaSet(page: Page): Promise<void> {
  await page.goto(
    `/discover?node=${encodeURIComponent(AREA_RR_NAGAR)}&areaKey=${encodeURIComponent(AREA_RR_NAGAR_KEY)}&lat=12.93169&lon=77.52932&zoom=16&rscope=area`,
  );
  await page.waitForLoadState('domcontentloaded');
  await declineConsentBannerIfPresent(page);

  const panelHeading = page.getByRole('heading', { level: 1 });
  await expect(panelHeading, 'single-Area RR Nagar heading should render').toContainText(/RR Nagar/i, {
    timeout: 15_000,
  });

  const addNearbyTile = page.getByTestId('area-set-add-nearby-tile');
  await expect(addNearbyTile, '"Add nearby areas" tile should render').toBeVisible({ timeout: 15_000 });
  await addNearbyTile.click();

  const draftPanel = page.getByTestId('area-set-draft-panel');
  await expect(draftPanel, 'AREA_SET draft view should open').toBeVisible({ timeout: 10_000 });

  const addDeepanjaliButton = draftPanel.getByTestId(
    `area-set-draft-panel-suggestion-${AREA_DEEPANJALI_NAGAR_KEY}-add`,
  );
  await expect(addDeepanjaliButton, 'Deepanjali Nagar candidate should be offered').toBeVisible({ timeout: 15_000 });
  await addDeepanjaliButton.click();
  await expect(draftPanel.getByTestId(`area-set-draft-panel-chip-${AREA_DEEPANJALI_NAGAR_KEY}`)).toBeVisible();

  const commitButton = draftPanel.getByTestId('area-set-draft-panel-commit-cta');
  await expect(commitButton).toBeVisible();
  await commitButton.click();

  await expect
    .poll(() => urlParam(page, 'rscope'), { message: 'commit should set rscope=areas', timeout: 10_000 })
    .toBe('areas');
}

test.describe('Issue #2674 — mobile viewport URL desync after a pan-then-close race', () => {
  test('a pan fired just before closing to List must not orphan a stale URL write', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await reachCommittedRrNagarDeepanjaliAreaSet(page);

    const mapTrigger = page.getByTestId('control-bar-map-trigger');
    await expect(mapTrigger, 'mobile Map trigger should be reachable').toBeVisible({ timeout: 15_000 });
    await mapTrigger.click();

    const closeListButton = page.getByTestId('mobile-map-close-list-button');
    await expect(closeListButton, 'mobile Map overlay should be open').toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.leaflet-container')).toHaveCount(1, { timeout: 10_000 });
    // Let the ambient AREA_SET union-fit settle and its own (legitimate)
    // debounced URL write land before we start the real repro below.
    await page.waitForTimeout(1_000);

    const referenceLat = urlParam(page, 'lat');
    const referenceLon = urlParam(page, 'lon');
    expect(referenceLat, 'the committed AREA_SET fit should have written a viewport to the URL').not.toBeNull();
    expect(referenceLon).not.toBeNull();

    // A single, deliberate pan — real mouse events (see this repo's
    // established Leaflet-pan convention, e.g. issue-2494's `panMap`) — just
    // enough to fire `moveend` and (re)arm the 300ms viewport debounce.
    const mapContainer = page.locator('.leaflet-container').first();
    const box = await mapContainer.boundingBox();
    if (!box) throw new Error('leaflet container has no bounding box');
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(startX - (200 * i) / 8, startY - (150 * i) / 8);
    }
    await page.mouse.up();

    // Close to List WELL WITHIN the 300ms debounce window — this real-
    // unmounts DiscoverMapCanvas (Discover is panel-first on mobile).
    await page.waitForTimeout(80);
    await closeListButton.click();
    await expect(page.locator('.leaflet-container'), 'List view must fully unmount the map').toHaveCount(0, {
      timeout: 10_000,
    });

    // Poll well past the 300ms debounce window: the URL's lat/lon must NEVER
    // drift from the reference AREA_SET fit while the map sits closed with
    // no user action — a late, orphaned write from the pan above would flip
    // it to the panned-away position with nothing left to correct it.
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(200);
      expect(
        urlParam(page, 'lat'),
        `lat must stay pinned to the committed AREA_SET fit while the map is closed (poll ${i})`,
      ).toBe(referenceLat);
      expect(
        urlParam(page, 'lon'),
        `lon must stay pinned to the committed AREA_SET fit while the map is closed (poll ${i})`,
      ).toBe(referenceLon);
      // rscope must also stay put — nothing in this repro changes scope.
      expect(urlParam(page, 'rscope')).toBe('areas');
    }
  });
});
