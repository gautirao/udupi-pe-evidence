/**
 * E2E — Issue #2716: mobile Map summary pill must not overlap the Leaflet
 * zoom "−" control on the public city-landing view.
 *
 * Surface under test: DiscoverMapCountBadge's public-landing summary pill
 * ("Showing N verified properties across {city}"), rendered inside the
 * full-screen mobile Map overlay (`isMobileMapOverlay`) at 375/390/412px
 * viewport widths — the state that regressed before this fix (bottom-5,
 * centred, unconstrained width) overlapped the bottom-right Leaflet zoom
 * control at those widths.
 *
 * Real backend, real Leaflet — no page.route() mocks. Reaches the state via
 * the same anonymous `/discover?city=bangalore` landing + "Map" toggle path
 * as e2e/discover/mobile-list-map-shell-1953.spec.ts, and reuses the
 * consent-decline + zoom-control-reachability pattern from
 * e2e/discover-schools-canonical-2124.spec.ts (clickMapZoomIn), adapted to
 * the zoom-OUT control since that is the one nearer the pill's right edge.
 *
 * Scope boundary (do not conflate with sibling issues):
 *   - #2714 (desktop bottom-chrome overlap) is untouched here — the fix is
 *     gated on `isMobileMapOverlay`, which is only ever true inside the
 *     mobile Map overlay, never on desktop.
 *   - #2712 (DiscoverPageShell z-index layering) is untouched.
 *
 * Run (targeted):
 *   bash scripts/run-e2e-local.sh --project=full e2e/discover-mobile-map-badge-zoom-2716.spec.ts
 */

import { test, expect } from './support/specialist-test';
import type { Page } from '@playwright/test';

const CITY = 'bangalore';

const MOBILE_WIDTHS: Array<{ width: number; height: number }> = [
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
];

/**
 * Dismiss the Discover telemetry-consent dialog before driving the map.
 * Mirrors declineConsentBannerIfPresent in e2e/discover-schools-canonical-2124.spec.ts.
 */
async function declineConsentBannerIfPresent(page: Page): Promise<void> {
  const banner = page.getByTestId('discover-consent-banner');
  if (await banner.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await banner.getByRole('button', { name: /decline/i }).click();
    await expect(banner).not.toBeVisible({ timeout: 5_000 });
  }
}

interface PlainRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Axis-aligned bounding-box intersection test (touching edges do not count as overlap). */
function rectsIntersect(a: PlainRect, b: PlainRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

test.describe('Issue #2716 — mobile Map summary pill clears the Leaflet zoom control', () => {
  for (const { width, height } of MOBILE_WIDTHS) {
    test(`@${width}x${height} — public city-landing mobile Map: pill does not overlap zoom control`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });

      // Public city-landing anon path — no area/school selected. Same entry
      // point as mobile-list-map-shell-1953.spec.ts.
      await page.goto(`/discover?city=${CITY}`);
      await expect(page.getByTestId('discover-control-bar')).toBeVisible({ timeout: 15_000 });

      await declineConsentBannerIfPresent(page);

      // Open the full-screen mobile Map overlay — the only render path where
      // isMobileMapOverlay is true (see DiscoverMapCanvas.tsx: derived from
      // `!!mobileListButton`, which is only supplied while this overlay is open).
      const mapTrigger = page.getByRole('button', { name: 'Map', exact: true });
      await expect(mapTrigger).toBeVisible({ timeout: 15_000 });
      await mapTrigger.click();
      await expect(page.locator('.leaflet-container')).toHaveCount(1, { timeout: 10_000 });

      const badge = page.getByTestId('discover-badge');
      await expect(badge, 'the public-landing summary pill must render (cityTotal > 0)').toBeVisible({
        timeout: 15_000,
      });
      await expect(badge).toContainText('verified properties');

      const zoomOut = page.locator('.leaflet-control-zoom-out');
      await expect(zoomOut, 'the Leaflet zoom-out control must be available').toBeVisible({
        timeout: 10_000,
      });

      // ── Assertion 1: elementFromPoint at the zoom control's own centre must
      // resolve to the zoom control itself (or a descendant), never the pill. ──
      const zoomBox = await zoomOut.boundingBox();
      if (!zoomBox) {
        throw new Error('leaflet zoom-out control has no bounding box');
      }
      const centre = {
        x: zoomBox.x + zoomBox.width / 2,
        y: zoomBox.y + zoomBox.height / 2,
      };
      const topmostIsZoomControl = await page.evaluate(
        ([px, py]) =>
          Boolean((document.elementFromPoint(px, py) as Element | null)?.closest('.leaflet-control-zoom-out')),
        [centre.x, centre.y] as [number, number],
      );
      expect(
        topmostIsZoomControl,
        `at ${width}x${height}, the topmost element at the zoom-out control's centre (${centre.x}, ${centre.y}) must be the zoom control, not the summary pill`,
      ).toBe(true);

      // ── Assertion 2: bounding-box non-intersection between the pill and the
      // zoom control, independent of hit-testing (catches near-miss overlaps
      // elementFromPoint's single sample point could otherwise hide). ──
      const rects = await page.evaluate(() => {
        const pillEl = document.querySelector('[data-testid="discover-badge"]');
        const zoomEl = document.querySelector('.leaflet-control-zoom-out');
        if (!pillEl || !zoomEl) return null;
        const p = pillEl.getBoundingClientRect();
        const z = zoomEl.getBoundingClientRect();
        return {
          pill: { left: p.left, top: p.top, right: p.right, bottom: p.bottom },
          zoom: { left: z.left, top: z.top, right: z.right, bottom: z.bottom },
        };
      });
      expect(rects, 'both the pill and the zoom control must be present in the DOM').not.toBeNull();
      if (!rects) return; // unreachable — satisfies TS narrowing after the assertion above
      expect(
        rectsIntersect(rects.pill, rects.zoom),
        `at ${width}x${height}, the summary pill's bounding box must not intersect the zoom control's — pill=${JSON.stringify(
          rects.pill,
        )} zoom=${JSON.stringify(rects.zoom)}`,
      ).toBe(false);
    });
  }
});
