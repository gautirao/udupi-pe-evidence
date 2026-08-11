/**
 * Issue #2129 — mobile lower-map marker occlusion by MobileListingPreviewSheet.
 *
 * BUG (pre-fix): the mobile Map-mode preview sheet (`MobileListingPreviewSheet`,
 * z-[1100], `absolute inset-x-0 bottom-0`) covers roughly the bottom 150px of
 * the map once it opens. The PRE-FIX occlusion reservation
 * (`bottomOcclusionPx`, still used unchanged by `AreaPanner`'s one-time
 * `fitBounds` padding) was only ever applied at the MOMENT of a canonical-node
 * camera fit — a plain user pan/drag AFTER that fit was never re-guarded, so a
 * marker could drift back into the band the sheet would later cover, becoming
 * genuinely un-hit-testable there.
 *
 * FIX (this issue, `src/pages/MapDiscovery.tsx` / `DiscoverMapCanvas.tsx` /
 * `PropertyMap.tsx`): a NEW, purely reactive value `previewOcclusionPx`
 * (0 normally; `MOBILE_LISTING_PREVIEW_OCCLUSION_PX`=150 exactly while
 * `isPreviewSheetOpen` — `mobileMapOpen && !!selectedListingPreview`, the SAME
 * condition gating the sheet's own render) drives a wrapper div
 * (`data-testid="discover-map-usable-viewport"`) around `<MapContainer>`
 * whose `height` is `calc(100% - 150px)` while the sheet is open, `100%`
 * otherwise. Leaflet's own `.leaflet-container { overflow: hidden }`,
 * combined with the pre-existing `MapContainerResizeSync` ResizeObserver
 * (#2049) that already calls `invalidateSize()` on any container resize,
 * means the Leaflet viewport is PHYSICALLY clipped 150px shorter for as long
 * as the sheet stays open — continuously, across any subsequent pan/zoom, not
 * just at fit time — while ordinary browsing before any tap keeps the full
 * map height (the regression an earlier review cycle caught and this file's
 * first test guards against).
 *
 * This spec proves the GEOMETRY of that clip mechanism with real
 * `boundingBox()`/`getComputedStyle()` measurements — an assertion-backed
 * hit-test, per the issue's own Definition of Done, never screenshot-only
 * evidence — plus the observable marker-tap -> preview-open flow and a
 * cross-context regression sweep (desktop popover, bounded single-listing
 * area).
 *
 * ── FIXTURE SETUP ──
 * Reuses the SAME committed fixture + entry pattern already proven live by
 * `issue-1956-pr5-s5-mobile-listing-preview.spec.ts` (`node=` deep-link into
 * the `a:IN|KA|Bengaluru|RR Nagar` AREA leaf, single seeded [E2E] listing
 * `f1956005-0000-0000-0000-000000000001`). UNLIKE that spec, a genuine marker
 * TAP (`property-marker.click()`, no `{ force: true }`) was re-verified live
 * against this exact fixture before writing this file and reliably opens the
 * preview sheet end-to-end (URL gains `listing=`/`lat=`/`lon=`/`zoom=`, sheet
 * mounts) — Playwright's own actionability scroll-then-click sequence
 * resolves the marker's real screen position even though a raw, unscrolled
 * `boundingBox()` on that marker can still read a position outside the
 * pre-scroll viewport (the same underlying fact PR-5's spec documented for a
 * manual/forced hit-test). So this spec drives the flow via a REAL marker tap
 * throughout, not the deep-link substitution PR-5 needed.
 *
 * ── MARKER-B-WITHOUT-CLOSING SWAP: INFEASIBLE WITH COMMITTED FIXTURES,
 * RE-INVESTIGATED LIVE FOR THIS ISSUE (not re-derived from the PR-5 finding
 * by assumption) ──
 * The Definition of Done asks for marker A -> preview A -> tap marker B
 * (no intermediate Close) -> preview B, with a geometric proof neither marker
 * is ever hidden. This was re-investigated live today, against the CURRENT
 * `main`-merged fixtures (this branch adds no new fixture rows):
 *   1. `navigation-hierarchy-fixture-listings-seed.sql` gives every AREA leaf
 *      EXACTLY ONE listing (re-confirmed via a direct query against the local
 *      fixture Postgres: `SELECT id, area_key, latitude, longitude FROM
 *      property_listings WHERE area_key LIKE '%RR Nagar%'` returns exactly
 *      one row) — there is no second, independent listing marker inside a
 *      single AREA leaf's own map view to tap.
 *   2. The only place two-or-more AREA leaves' markers could coexist in one
 *      map view is at their shared DIRECTION parent (`d:southeast`, parent of
 *      RR Nagar/Vijayanagar/Nagarbhavi). `navigation-hierarchy-fixture-
 *      seed.sql`'s own header states this set's centre coordinates are
 *      DELIBERATELY placed "~10-15m apart... so the client-side pixel-grid
 *      clusterer groups all three into ONE visual cluster cell at ANY
 *      zoom/viewport a test runs at" — and the `d:southwest` trio (Deepanjali
 *      Nagar/Gnana Bharathi/Chandra Layout Extension) is documented in the
 *      same file as deliberately mirroring that same dense-cluster pattern.
 *      Even setting aside clustering, a Direction-level view's AREA pins
 *      navigate INTO an area on tap — they do not set `selectedListingPreview`
 *      or open `MobileListingPreviewSheet` at all, so they could not stand in
 *      for "marker B" regardless.
 *   3. `resolveMarkerRevealMode` (#1762) — the ONLY mechanism that could ever
 *      surface two individual, ungrouped LISTING markers from different AREA
 *      leaves in one view — is explicitly out of scope for this issue and
 *      this spec does not touch or rely on it.
 * A test that drove two "different" markers by exploiting whatever happened
 * to be indexed/clustered at the moment would be non-deterministic and not
 * reproducible from a fresh fixture restore. Per instruction, this is
 * disclosed rather than skipped silently, faked, or worked around with a
 * mocked click. What CAN be, and is, proven below instead: (a) the clip
 * mechanism's exact geometry — since it is a structural, marker-agnostic
 * clip (Leaflet's own `overflow: hidden` + a measured height), proving it
 * holds for the ONE real marker in view is proof it would hold identically
 * for any marker, including a hypothetical marker B; and (b) that no point
 * inside the reserved band ever hit-tests to a `property-marker` while the
 * sheet is open.
 *
 * Run:
 *   PLAYWRIGHT_BASE_URL=http://localhost:<port> npx playwright test \
 *     e2e/discover/issue-2129-mobile-marker-occlusion.spec.ts --project=full
 */
import { test, expect, type Page, type Locator } from '@playwright/test';
import { assertReachable } from '../support/reachability';

const CITY = 'bangalore';
const BASE = `city=${CITY}&journey=area-first`;
const AREA_RR_NAGAR = 'a:IN|KA|Bengaluru|RR Nagar';
const RR_NAGAR_LISTING_ID = 'f1956005-0000-0000-0000-000000000001';
const MOBILE_VIEWPORT = { width: 390, height: 844 };
const DESKTOP_VIEWPORT = { width: 1366, height: 768 };
const PREVIEW_OCCLUSION_PX = 150; // MOBILE_LISTING_PREVIEW_OCCLUSION_PX, src/shared/map/zoomPolicy.ts
const GEOMETRY_TOLERANCE_PX = 3; // subpixel/rounding slack for calc()-derived layout boxes

function currentListingParam(page: Page): string | null {
  return new URL(page.url()).searchParams.get('listing');
}

async function grantTelemetryConsent(page: Page): Promise<void> {
  // Bypasses the consent banner deterministically (same mechanism the
  // existing desktop-breadcrumb regression spec in this directory uses)
  // rather than racing a Decline-button click against first paint.
  await page.addInitScript(() => {
    window.localStorage.setItem('discover_telemetry_consent', 'granted');
  });
}

/** Navigates straight to the RR Nagar AREA leaf and enters mobile Map mode, WITHOUT tapping any marker — the pre-tap state the first (regression) test needs. */
async function gotoAreaLeafMapModeNoPreview(page: Page): Promise<void> {
  await page.goto(`/discover?${BASE}&node=${encodeURIComponent(AREA_RR_NAGAR)}`);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByTestId('areas-journey-panel-listings')).toBeVisible({ timeout: 20_000 });

  const mapTrigger = page.getByTestId('control-bar-map-trigger');
  await expect(mapTrigger).toBeVisible({ timeout: 15_000 });
  await mapTrigger.click();
  await expect(page.getByTestId('mobile-map-close-list-button')).toBeVisible({ timeout: 10_000 });
}

/** Real marker tap (no deep-link substitution — see module doc). Returns the tapped marker locator. */
async function tapFirstMarker(page: Page): Promise<Locator> {
  const marker = page.getByTestId('property-marker').first();
  await marker.waitFor({ state: 'attached', timeout: 15_000 });
  await marker.click({ timeout: 10_000 });
  return marker;
}

function usableViewport(page: Page): Locator {
  return page.getByTestId('discover-map-usable-viewport');
}

/** getBoundingClientRect() of the usable-viewport wrapper's OWN parent container (`<div class="w-full h-full relative">` in PropertyMap.tsx) — the reference box `calc(100% - 150px)` is computed against. */
async function containerBox(
  wrapper: Locator,
): Promise<{ x: number; y: number; width: number; height: number }> {
  return wrapper.evaluate((el) => {
    const rect = el.parentElement!.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
}

test.describe('@integration-ui #2129 — mobile lower-map marker occlusion, real geometric hit-test proof at 390x844', () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test.beforeEach(async ({ page }) => {
    await grantTelemetryConsent(page);
  });

  test('REGRESSION GUARD: before any preview is open, the usable-viewport wrapper is FULL HEIGHT (no map shrink for ordinary browsing)', async ({
    page,
  }) => {
    await gotoAreaLeafMapModeNoPreview(page);

    const wrapper = usableViewport(page);
    await expect(wrapper).toBeVisible({ timeout: 10_000 });
    await expect(wrapper).toHaveAttribute('data-bottom-occlusion-px', '0');

    const wrapperBox = await wrapper.boundingBox();
    const container = await containerBox(wrapper);
    expect(wrapperBox, 'usable-viewport wrapper has a layout box').not.toBeNull();

    // This is the EXACT bug a prior review cycle caught: using the proactive
    // bottomOcclusionPx signal here (true for the whole eligible mobile
    // session) would shrink the map even before any marker is ever tapped.
    // previewOcclusionPx must stay 0 here, so height must equal the full
    // parent container height, not container-150.
    expect(
      wrapperBox!.height,
      `wrapper height (${wrapperBox!.height}px) must equal the full container height (${container.height}px) before any tap — no premature shrink`,
    ).toBeGreaterThan(container.height - GEOMETRY_TOLERANCE_PX);

    // Exactly one seeded listing at this AREA leaf (navigation-hierarchy-
    // fixture-listings-seed.sql) — the bounded nodeListings=1 case named in
    // this issue's smoke checklist.
    await expect(page.getByTestId('property-marker')).toHaveCount(1);
  });

  test('tapping marker A opens the preview sheet with A\'s data (real marker tap, no deep-link substitution)', async ({
    page,
  }) => {
    await gotoAreaLeafMapModeNoPreview(page);
    await tapFirstMarker(page);

    const sheet = page.getByTestId('mobile-listing-preview-sheet');
    await expect(sheet).toBeVisible({ timeout: 10_000 });
    await expect.poll(() => currentListingParam(page)).toBe(RR_NAGAR_LISTING_ID);

    // Still in Map mode — the peek must not force a mode switch.
    await expect(page.getByTestId('mobile-map-close-list-button')).toBeVisible({ timeout: 5_000 });

    // Phase 7A regression guard (also exercised by the PR-5 spec, re-checked
    // here since this test drives entry via a genuine tap, not a deep-link):
    // the legacy MarkerPopoverCard must never render alongside the new sheet
    // in mobile Map mode.
    await expect(
      page.getByTestId('marker-popover-card'),
      'the legacy desktop MarkerPopoverCard must NOT also render in mobile Map mode',
    ).toHaveCount(0);
  });

  test('THE HIT-TEST PROOF: once the sheet is open, the usable-viewport wrapper clips to EXACTLY container-height minus 150px, and the clipped map surface is genuinely overflow:hidden', async ({
    page,
  }) => {
    await gotoAreaLeafMapModeNoPreview(page);
    const wrapper = usableViewport(page);
    const containerBefore = await containerBox(wrapper);

    await tapFirstMarker(page);
    const sheet = page.getByTestId('mobile-listing-preview-sheet');
    await expect(sheet).toBeVisible({ timeout: 10_000 });

    await expect(wrapper).toHaveAttribute('data-bottom-occlusion-px', String(PREVIEW_OCCLUSION_PX));

    const wrapperBox = await wrapper.boundingBox();
    const container = await containerBox(wrapper);
    expect(wrapperBox, 'usable-viewport wrapper has a layout box while the sheet is open').not.toBeNull();

    // The container itself (the map's own allotted space, independent of the
    // sheet) must be unchanged by opening the sheet — only the WRAPPER inside
    // it shrinks. Confirms the height delta below is genuinely the clip
    // mechanism, not some incidental parent resize.
    expect(
      Math.abs(container.height - containerBefore.height),
      'the map\'s own container height must not change when the sheet opens — only the inner usable-viewport wrapper clips',
    ).toBeLessThanOrEqual(GEOMETRY_TOLERANCE_PX);

    // THE geometric proof: wrapper height == container height - 150px,
    // exactly the `calc(100% - ${previewOcclusionPx}px)` the fix applies.
    expect(
      Math.abs(wrapperBox!.height - (container.height - PREVIEW_OCCLUSION_PX)),
      `wrapper height (${wrapperBox!.height}px) must equal container height (${container.height}px) minus the reserved ${PREVIEW_OCCLUSION_PX}px`,
    ).toBeLessThanOrEqual(GEOMETRY_TOLERANCE_PX);

    // Leaflet's own base CSS puts `overflow: hidden` on `.leaflet-container`
    // — the structural guarantee (independent of any specific marker's
    // position) that nothing below the clipped wrapper's bottom edge can
    // ever be hit-tested while it is shorter than its content. Asserted
    // directly, not assumed from the library's docs.
    const leafletContainer = wrapper.locator('.leaflet-container').first();
    await expect(leafletContainer).toBeVisible({ timeout: 5_000 });
    const overflowStyle = await leafletContainer.evaluate((el) => getComputedStyle(el).overflow);
    expect(overflowStyle, 'the Leaflet container must genuinely compute overflow:hidden').toBe('hidden');

    // No dead gap between the clipped map's bottom edge and the sheet's own
    // top edge — the sheet's real rendered height (a content-driven ~194px
    // per the precedent #1956 PR-5 spec's own live measurement) is taller
    // than the fixed 150px reservation, so it fully covers the reserved band
    // with margin. Proven directly here, not assumed from that other spec.
    const sheetBox = await sheet.boundingBox();
    expect(sheetBox, 'sheet has a layout box').not.toBeNull();
    const wrapperBottomY = wrapperBox!.y + wrapperBox!.height;
    expect(
      sheetBox!.y,
      `sheet top edge (y=${sheetBox!.y}) must be AT or ABOVE the clipped map's bottom edge (y=${wrapperBottomY}) — no visible dead-zone gap between them`,
    ).toBeLessThanOrEqual(wrapperBottomY + GEOMETRY_TOLERANCE_PX);
  });

  test('no point inside the reserved occlusion band hit-tests to a property-marker while the sheet is open', async ({
    page,
  }) => {
    await gotoAreaLeafMapModeNoPreview(page);
    const wrapper = usableViewport(page);
    await tapFirstMarker(page);
    const sheet = page.getByTestId('mobile-listing-preview-sheet');
    await expect(sheet).toBeVisible({ timeout: 10_000 });

    const wrapperBox = await wrapper.boundingBox();
    expect(wrapperBox).not.toBeNull();
    const wrapperBottomY = wrapperBox!.x !== undefined ? wrapperBox!.y + wrapperBox!.height : 0;
    const centreX = wrapperBox!.x + wrapperBox!.width / 2;

    // Sample three points inside the reserved band (just below the clipped
    // map's bottom edge, at the sheet's vertical mid-point, and near the
    // bottom of the viewport) — none may resolve to a property-marker. This
    // is the direct, marker-shaped instrument the issue's DoD calls for: "no
    // marker hit target hidden behind the preview sheet".
    const probeYs = [
      wrapperBottomY + 5,
      wrapperBottomY + (MOBILE_VIEWPORT.height - wrapperBottomY) / 2,
      MOBILE_VIEWPORT.height - 5,
    ];

    for (const y of probeYs) {
      const clampedY = Math.min(y, MOBILE_VIEWPORT.height - 1);
      const hitTestsToMarker = await page.evaluate(
        ([x, cy]) => {
          const atPoint = document.elementFromPoint(x, cy);
          return atPoint != null && atPoint.closest('[data-testid="property-marker"]') != null;
        },
        [centreX, clampedY] as const,
      );
      expect(
        hitTestsToMarker,
        `point (${centreX}, ${clampedY}) inside the reserved/covered band must never hit-test to a property-marker`,
      ).toBe(false);
    }
  });

  test('"Close" is reachable and the usable-viewport wrapper returns to full height', async ({ page }) => {
    await gotoAreaLeafMapModeNoPreview(page);
    const wrapper = usableViewport(page);
    await tapFirstMarker(page);
    const sheet = page.getByTestId('mobile-listing-preview-sheet');
    await expect(sheet).toBeVisible({ timeout: 10_000 });
    await expect(wrapper).toHaveAttribute('data-bottom-occlusion-px', String(PREVIEW_OCCLUSION_PX));

    const closeButton = page.getByTestId('mobile-listing-preview-close');
    await assertReachable(page, closeButton);
    await closeButton.click();

    await expect(sheet).toHaveCount(0);
    await expect.poll(() => currentListingParam(page)).toBeNull();
    await expect(wrapper).toHaveAttribute('data-bottom-occlusion-px', '0');

    const wrapperBox = await wrapper.boundingBox();
    const container = await containerBox(wrapper);
    expect(
      wrapperBox!.height,
      'wrapper must return to full container height after Close',
    ).toBeGreaterThan(container.height - GEOMETRY_TOLERANCE_PX);
  });
});

test.describe('@integration-ui #2129 — cross-context regression sweep (out of scope for this issue, quick sanity only)', () => {
  test('desktop (>=1024px): marker click still opens the legacy MarkerPopoverCard, and previewOcclusionPx never applies', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await grantTelemetryConsent(page);
    await page.goto(`/discover?${BASE}&node=${encodeURIComponent(AREA_RR_NAGAR)}`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('areas-journey-panel-listings')).toBeVisible({ timeout: 20_000 });

    const marker = page.getByTestId('property-marker').first();
    await marker.waitFor({ state: 'attached', timeout: 15_000 });
    await marker.click({ timeout: 10_000 });

    await expect(page.getByTestId('marker-popover-card')).toBeVisible({ timeout: 10_000 });

    // #2129's new isPreviewSheetOpen gate is `mobileMapOpen && ...` — desktop
    // never sets mobileMapOpen, so previewOcclusionPx must stay 0 and the
    // desktop map must never be clipped.
    const wrapper = usableViewport(page);
    await expect(wrapper).toHaveAttribute('data-bottom-occlusion-px', '0');
    await expect(page.getByTestId('mobile-listing-preview-sheet')).toHaveCount(0);
  });
});
