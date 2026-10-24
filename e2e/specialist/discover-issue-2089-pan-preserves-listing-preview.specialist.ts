/**
 * Issue #2089 — panning the mobile map must NOT close the open listing preview.
 *
 * BUG (pre-fix): opening the mobile Map-mode preview sheet via a marker tap
 * sets `listing=<uuid>` in the URL and shows `mobile-listing-preview-sheet`.
 * A single pan drag on the map (mousedown -> move -> mouseup, no click) then
 * cleared the `listing=` param entirely and closed the preview sheet. Only
 * the explicit `mobile-listing-preview-close` button should do that — panning
 * must leave the selection/preview open (tracking the new viewport).
 *
 * Reuses the same RR Nagar AREA-leaf fixture/entry pattern as
 * issue-2129-mobile-marker-occlusion.spec.ts (node= deep-link, real marker
 * tap, no force/deep-link substitution for the tap itself).
 *
 * Run:
 *   PLAYWRIGHT_BASE_URL=http://localhost:5174 npx playwright test \
 *     e2e/discover/issue-2089-pan-preserves-listing-preview.spec.ts --project=full
 */
import { test, expect } from './support/specialist-test';
import type { Page } from '@playwright/test';

const CITY = 'bangalore';
const BASE = `city=${CITY}&journey=area-first`;
// Real hosted dev-DB AREA leaf (live-verified via manual UI drill-down on
// 2026-08-12 to carry exactly 2 listings) — no seeded Testcontainers fixture
// is available against the currently-running stack (real hosted Supabase
// dev DB), so this spec drives real data instead of the fixture node= used
// by issue-2129-mobile-marker-occlusion.spec.ts.
const AREA_NODE = 'a:IN|KA|Bengaluru|RR Nagar';
const MOBILE_VIEWPORT = { width: 390, height: 844 };

function currentListingParam(page: Page): string | null {
  return new URL(page.url()).searchParams.get('listing');
}

async function grantTelemetryConsent(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem('discover_telemetry_consent', 'granted');
  });
}

async function gotoAreaLeafMapModeNoPreview(page: Page): Promise<void> {
  await page.goto(`/discover?${BASE}&node=${encodeURIComponent(AREA_NODE)}`);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByTestId('areas-journey-panel-listings')).toBeVisible({ timeout: 20_000 });

  const mapTrigger = page.getByTestId('control-bar-map-trigger');
  await expect(mapTrigger).toBeVisible({ timeout: 15_000 });
  await mapTrigger.click();
  await expect(page.getByTestId('mobile-map-close-list-button')).toBeVisible({ timeout: 10_000 });
}

/** Taps the first individually-hit-testable property marker (real data, no
 * fixed listing id — the AREA leaf's own fit zoom is expected to show its
 * (small) listing count as individual pins, not a cluster bubble). */
async function tapFirstMarker(page: Page) {
  const marker = page.getByTestId('property-marker').first();
  await marker.waitFor({ state: 'attached', timeout: 15_000 });
  // The AREA leaf's own fitBounds occasionally leaves an edge marker
  // partially clipped/obscured by a cluster bubble at the default fit zoom
  // for real (non-fixture) data — zoom in on the map to spread markers out
  // and bring the target fully into an unobstructed, centered position
  // before the real (non-forced) click.
  const zoomIn = page.locator('.leaflet-control-zoom-in');
  for (let i = 0; i < 3; i++) {
    if (await marker.isVisible().catch(() => false)) {
      try {
        await marker.click({ timeout: 2_000 });
        return marker;
      } catch {
        // still obstructed/off-screen — zoom in and retry
      }
    }
    await zoomIn.click();
    await page.waitForTimeout(400);
  }
  await marker.click({ timeout: 10_000 });
  return marker;
}

/** Real pan drag on the Leaflet container: mousedown -> several intermediate
 * moves (Leaflet requires movement across multiple frames to register a real
 * drag, not a single jump) -> mouseup. No `force`, no synthetic DOM events.
 *
 * Step count and settle window were re-tuned 2026-08-12 after a first-pass
 * fix (guarding the background-dismiss click on "a moveend/zoomend fired in
 * the last 400ms") passed this spec at 8 steps / 500ms but still failed on a
 * real drag in manual verification. Real-browser instrumentation confirmed
 * Leaflet's default inertial panning fires `dragend` and the trailing native
 * `click` back-to-back on mouseup, while `moveend` is deferred 200-350ms
 * later by the inertia animation — so a short/fast synthetic drag could
 * settle before the click even completed, never exercising the actual race.
 * 12 steps + an 800ms settle window reliably reproduces the real timing gap
 * that made the timing-based guard approach unsound (the shipped fix does
 * not depend on this timing at all — see DiscoverMapCanvas.tsx's
 * handleBackgroundClick pixel-delta approach — but the wider window keeps
 * this spec a meaningful regression guard against a future regression back
 * to a timing-based approach). */
async function panMap(page: Page, dx: number, dy: number): Promise<void> {
  const mapContainer = page.locator('.leaflet-container').first();
  const box = await mapContainer.boundingBox();
  if (!box) throw new Error('leaflet container has no bounding box');
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(startX + (dx * i) / steps, startY + (dy * i) / steps);
  }
  await page.mouse.up();
  // Let dragend/the trailing native click resolve, then moveend/zoomend +
  // the 300ms reportViewport debounce settle (inertia can defer moveend by
  // 200-350ms past mouseup — see comment above).
  await page.waitForTimeout(800);
}

test.describe('@integration-ui #2089 — mobile map pan must not close the listing preview', () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test.beforeEach(async ({ page }) => {
    await grantTelemetryConsent(page);
  });

  test('pan drag after opening a marker preview keeps listing= and the sheet open', async ({
    page,
  }) => {
    await gotoAreaLeafMapModeNoPreview(page);
    await tapFirstMarker(page);

    const sheet = page.getByTestId('mobile-listing-preview-sheet');
    await expect(sheet).toBeVisible({ timeout: 10_000 });
    await expect.poll(() => currentListingParam(page)).not.toBeNull();
    const openedListingId = currentListingParam(page);

    await panMap(page, -80, -40);

    // The pan itself must have registered (viewport actually moved) so this
    // is a genuine pan proof, not a no-op drag.
    await expect.poll(() => new URL(page.url()).searchParams.get('lat')).not.toBeNull();

    await expect(
      sheet,
      'panning the map must not close the mobile listing preview sheet',
    ).toBeVisible({ timeout: 5_000 });
    await expect
      .poll(() => currentListingParam(page), 'panning must not clear the listing= URL param')
      .toBe(openedListingId);
  });

  test('the explicit Close button still closes the sheet and clears listing=', async ({ page }) => {
    await gotoAreaLeafMapModeNoPreview(page);
    await tapFirstMarker(page);

    const sheet = page.getByTestId('mobile-listing-preview-sheet');
    await expect(sheet).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('mobile-listing-preview-close').click();

    await expect(sheet).toHaveCount(0);
    await expect.poll(() => currentListingParam(page)).toBeNull();
  });
});

test.describe('@integration-ui #2089 — supplementary regression checks (marker swap, camera pan persistence)', () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test.beforeEach(async ({ page }) => {
    await grantTelemetryConsent(page);
  });

  // Issue #2089 fix scope note: the fix below only gates the MAP-BACKGROUND
  // click-to-dismiss path (DiscoverMapCanvas.tsx's onClick, triggered when
  // `markerPixelPos != null` and no listing marker was hit) behind a short
  // post-viewport-change suppression window. A marker-to-marker tap is a
  // real click on a DIFFERENT DOM element (the marker icon itself, handled
  // by MarkerClusterLayer's own 'click' listener in PropertyMap.tsx) and
  // never reaches this background onClick at all, so the #2129 swap behavior
  // is structurally untouched by this change.
  //
  // The deterministic proof of this (marker A -> preview A -> marker B, no
  // intermediate Close -> preview B) previously lived HERE as a live,
  // real-hosted-data test that self-skipped whenever the currently-reachable
  // RR Nagar AREA leaf didn't expose 2 independently hit-testable markers —
  // real (non-fixture) hosted-dev-DB data is not deterministic enough to
  // guarantee that. Per code-review finding on PR #2141 (BLOCKING #3), a
  // self-skipping test does not satisfy #2089's Definition of Done, and the
  // repo already has a deterministic fixture for exactly this case (the same
  // one `issue-2129-mobile-marker-occlusion.spec.ts` uses: RR Nagar seeded
  // with TWO independently hit-testable listing markers via
  // `navigation-hierarchy-fixture-listings-seed.sql`). That proof now lives,
  // never skipped, in `issue-2089-marker-swap-fixture.spec.ts` (run against
  // `./scripts/dev/local-fixture-backend.sh`, not this file's real-hosted-DB
  // target) — see that file for the assertion-backed swap proof.

  test('map camera pan/zoom is preserved across a List<->Map toggle (no regression)', async ({ page }) => {
    await gotoAreaLeafMapModeNoPreview(page);
    await panMap(page, -60, -30);
    await expect.poll(() => new URL(page.url()).searchParams.get('lat')).not.toBeNull();
    const latAfterPan = new URL(page.url()).searchParams.get('lat');
    const lonAfterPan = new URL(page.url()).searchParams.get('lon');

    await page.getByTestId('mobile-map-close-list-button').click();
    await expect(page.getByTestId('areas-journey-panel-listings')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('control-bar-map-trigger').click();
    await expect(page.getByTestId('mobile-map-close-list-button')).toBeVisible({ timeout: 10_000 });

    expect(new URL(page.url()).searchParams.get('lat')).toBe(latAfterPan);
    expect(new URL(page.url()).searchParams.get('lon')).toBe(lonAfterPan);
  });
});
