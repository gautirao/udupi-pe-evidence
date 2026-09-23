/**
 * E2E: Issue #2494 — mobile "Return to <areas>" does not restore the AREA_SET
 * camera fit for a MULTI-area (N>1) result scope.
 *
 * ── ROOT CAUSE (see useDiscoverMapDataController.ts for the fix) ──
 * On mobile (<=820px), Discover is panel-first: List view unmounts the
 * Leaflet map entirely; Map view is a mutually-exclusive full-screen
 * overlay. The N>1 AREA_SET ambient "union fit" effect (the ONLY camera
 * producer for a multi-area Return — AreaSelectedPanel.tsx's
 * `handleReturnToPreviousScope` has no restore-request path for N>1, only
 * for N=1) had two independent gaps, both in useDiscoverMapDataController.ts:
 *
 *   1. Its `publishRecenterCameraIntent` call never set `deliverOnRemount`,
 *      so a publish issued while the map was unmounted (the normal case for
 *      a mobile Return, reachable only from List view) was silently absorbed
 *      by `PropertyMap.tsx`'s adopt-on-mount guard on the next Map open,
 *      instead of being delivered.
 *   2. The effect's own de-dup guard (`committedAreaSetSignature !==
 *      lastAreaSetCameraSignature.current`) was never cleared on leaving N>1
 *      state, so Returning to an N>1 signature already committed earlier in
 *      the SAME session (exactly what a Return does — the AREA_SET was
 *      committed once before the user panned away) matched the stale ref and
 *      skipped publishing anything at all, independent of gap 1.
 *
 * A THIRD, separate gap was found and fixed in PropertyMap.tsx's
 * `MapController` (the delivery call site itself): on a just-(re)mounted
 * mobile container, the default ANIMATED fitBounds/setView could silently
 * fail to complete (the same class of bug AreaPanner's own #2143 fix already
 * documents in this file) — fixed via `animate: false` + an `isMapSized()`/
 * resize-retry fallback, scoped to the recovery-delivery path only.
 *
 * This spec drives the real mobile repro end-to-end: commit AREA_SET(N>1) ->
 * pan away -> "Search this area" commits VIEWPORT -> switch to List
 * (unmounts the map) -> Return -> switch to Map -> the camera must fit the
 * returned areas, not the stale panned-away viewport.
 *
 * ── CAMERA ORACLE (revised — see issue-2494-url-viewport-sync-bug, filed
 * separately) ──
 * The URL's `lat`/`lon` params (written by ViewportWatcher -> reportViewport,
 * a 300ms-debounced side channel) were the original oracle here, matching
 * e2e/discover/issue-1823-camera-fit-policy.spec.ts's `readCamera` convention
 * — but live E2E runs proved that write path is UNRELIABLE specifically
 * right after a mobile List<->Map remount (a separate, pre-existing defect,
 * independent of THIS fix): it can land on a value that is neither the
 * panned-away position NOR the restored one, for many seconds. It remains a
 * SAFE, reliable signal for a plain in-place pan on an already-mounted map
 * (no remount involved), so it is still used below for the narrower "did the
 * pan actually move the camera away" pan-verification step.
 *
 * For the load-bearing assertion — "did Return's camera target actually get
 * (re-)published, with a fresh seq, after the remount" — this spec instead
 * reads `window.__debug.mapState.cameraCenter`/`.cameraSeq`, a new field on
 * this repo's existing Playwright-contract debug bridge
 * (useDiscoverDebugBridge.ts), sourced directly from
 * useDiscoverMapDataController's own `cameraIntent` state (the same state
 * `useDiscoverMapDataController.test.ts`'s unit tests already assert
 * against). Precedent: `getCanonicalNodeFitCount`/`getDebugSchoolCenter` in
 * issue-1823-camera-fit-policy.spec.ts read the same debug object for the
 * identical reason (a map-driven signal with no reliable URL equivalent).
 *
 * IMPORTANT SCOPE NOTE on what this oracle does and does NOT prove:
 * `cameraCenter`/`cameraSeq` reflect the PUBLISHED cameraIntent (React state
 * owned by useDiscoverMapDataController, which lives ABOVE PropertyMap's
 * mobile remount boundary) — they update the instant the controller-level
 * fix (gap 1/2 above) publishes, regardless of whether PropertyMap.tsx's
 * MapController then successfully delivers that intent to the live Leaflet
 * instance. This spec's `cameraSeq` assertions are therefore REAL regression
 * coverage for the controller-level fix (they fail if deliverOnRemount or
 * the signature-guard clear is reverted), but they do NOT, by themselves,
 * prove the THIRD gap (PropertyMap.tsx's delivery call site — animate:false
 * / isMapSized / resize-retry) stays fixed: a regression there would not
 * change what gets published, only whether Leaflet's own camera visibly
 * moves to match it. That third gap's regression coverage lives in
 * PropertyMap.cameraIntent.test.tsx / cameraScope.test.tsx /
 * clusterDrillZoomClamp.test.tsx / jitterDiagnostic.test.tsx (unit-level,
 * asserting the exact `animate` option on each delivery call) plus manual
 * visual verification during this fix cycle. Exposing Leaflet's OWN
 * `getCenter()`/`getZoom()` to Playwright would close this gap but has no
 * existing hook in this app (Leaflet is bundled as an ES module, never
 * assigned to `window.L`) — flagged as a follow-up, not attempted here to
 * avoid shipping an unverifiable `page.addInitScript` module-patch.
 *
 * Fixtures (seeded Bangalore local dev stack — see
 * scripts/dev/local-fixture-backend.sh), reused verbatim from
 * e2e/issue-2017-multi-area-areaset-commit-regression.spec.ts:
 *   - RR Nagar: 2 fixture listings.
 *   - Deepanjali Nagar (a real "Add nearby areas" candidate for RR Nagar):
 *     1 fixture listing.
 *
 * Uses a real local dev stack (backend + seeded Bangalore fixture data) — no
 * route mocks, per this repo's E2E convention. Reuses the real-mouse-event
 * Leaflet pan helper and mobile Map/List toggle testids from
 * e2e/issue-2015-search-this-area-viewport.spec.ts.
 *
 * Run:
 *   bash scripts/run-e2e-local.sh --project=full e2e/discover/issue-2494-mobile-return-camera-restore.spec.ts
 * Prerequisites: PLAYWRIGHT_BASE_URL / BACKEND_BASE_URL pointing at a running
 * dev stack with the seeded Bangalore fixture (matches #2017/#2015
 * conventions).
 */

import { test, expect, type Page } from '@playwright/test';

const AREA_RR_NAGAR = 'a:IN|KA|Bengaluru|RR Nagar';
const AREA_RR_NAGAR_KEY = 'IN|KA|Bengaluru|RR Nagar';
const AREA_DEEPANJALI_NAGAR_KEY = 'IN|KA|Bengaluru|Deepanjali Nagar';

const MOBILE_VIEWPORT = { width: 390, height: 844 };

// Camera-center comparison tolerance — the union-fit computation is
// deterministic given the same two committed areas, but comparing exact
// floating-point equality is fragile across a real network/render round
// trip. ~1 meter at this latitude.
const CENTER_TOLERANCE_DEG = 0.00001;

function urlParam(page: Page, name: string): string | null {
  return new URL(page.url()).searchParams.get(name);
}

/**
 * URL-based lat/lon — kept ONLY for the narrower "did an in-place pan (no
 * remount involved) actually move the camera" check. See this file's module
 * doc for why this signal is NOT used for the load-bearing restore
 * assertion.
 */
function readUrlLatLon(page: Page): { lat: string | null; lon: string | null } {
  return { lat: urlParam(page, 'lat'), lon: urlParam(page, 'lon') };
}

interface CameraDebugState {
  center: { lat: number; lon: number } | null;
  seq: number | null;
}

/**
 * Reads the debug bridge's published-cameraIntent fields — see this file's
 * module doc ("CAMERA ORACLE") for what this does and does not prove.
 */
async function readCameraDebugState(page: Page): Promise<CameraDebugState> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __debug?: {
        mapState?: {
          cameraCenter?: { lat: number; lon: number } | null;
          cameraSeq?: number | null;
        };
      };
    };
    return {
      center: w.__debug?.mapState?.cameraCenter ?? null,
      seq: w.__debug?.mapState?.cameraSeq ?? null,
    };
  });
}

function expectCentersClose(
  actual: { lat: number; lon: number } | null,
  expected: { lat: number; lon: number } | null,
  message: string,
): void {
  expect(actual, message).not.toBeNull();
  expect(expected, message).not.toBeNull();
  if (!actual || !expected) return;
  expect(Math.abs(actual.lat - expected.lat), `${message} (lat)`).toBeLessThan(CENTER_TOLERANCE_DEG);
  expect(Math.abs(actual.lon - expected.lon), `${message} (lon)`).toBeLessThan(CENTER_TOLERANCE_DEG);
}

async function declineConsentBannerIfPresent(page: Page): Promise<void> {
  const banner = page.getByTestId('discover-consent-banner');
  if (await banner.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await banner.getByRole('button', { name: /decline/i }).click();
    await expect(banner).not.toBeVisible({ timeout: 5_000 });
  }
}

/**
 * Navigates to a committed single-Area RR Nagar scope (mirrors
 * e2e/issue-2017-multi-area-areaset-commit-regression.spec.ts's
 * `reachSingleAreaRrNagar`), then uses the real "Add nearby areas" draft flow
 * to commit an N=2 AREA_SET (RR Nagar + Deepanjali Nagar) — the same
 * fixtures and flow #2017 already proves end-to-end, reused here rather than
 * re-derived.
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
  const committedAreas = (urlParam(page, 'rareas') ?? '').split(',');
  expect(committedAreas, 'committed rareas should include both areas').toEqual(
    expect.arrayContaining([AREA_RR_NAGAR_KEY, AREA_DEEPANJALI_NAGAR_KEY]),
  );
}

/**
 * Real-mouse-event Leaflet pan — synthetic .click()/.dragTo() is documented
 * as unreliable against Leaflet's own event plumbing (see
 * e2e/discover/issue-2089-pan-preserves-listing-preview.spec.ts, reused
 * verbatim by e2e/issue-2015-search-this-area-viewport.spec.ts's `panMap`).
 */
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
  await page.waitForTimeout(800);
}

async function panUntilCtaVisible(page: Page, ctaButton: ReturnType<Page['getByRole']>): Promise<void> {
  let dx = -180;
  let dy = -120;
  const maxAttempts = 4;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (await ctaButton.isVisible().catch(() => false)) return;
    await panMap(page, dx, dy);
    dx *= 1.6;
    dy *= 1.6;
  }
  await expect(ctaButton, 'CTA should appear once the pan drifts the viewport past tolerance').toBeVisible({
    timeout: 5_000,
  });
}

test.describe.configure({ mode: 'serial' });

test.describe('Issue #2494 — mobile Return-to-AREA_SET(N>1) camera restore', () => {
  test('mobile: AREA_SET(N>1) -> pan away -> List -> Return -> Map restores the returned areas’ camera fit', async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await reachCommittedRrNagarDeepanjaliAreaSet(page);

    // Open Map — the ambient N>1 union-fit effect's own publish (from the
    // commit above) settles here; capture this as the REFERENCE camera the
    // fix must restore us to later.
    const mapTrigger = page.getByTestId('control-bar-map-trigger');
    await expect(mapTrigger, 'mobile Map trigger should be reachable').toBeVisible({ timeout: 15_000 });
    await mapTrigger.click();

    const closeListButton = page.getByTestId('mobile-map-close-list-button');
    await expect(closeListButton, 'mobile Map overlay should be open').toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.leaflet-container')).toHaveCount(1, { timeout: 10_000 });

    await expect
      .poll(async () => (await readCameraDebugState(page)).center, {
        message: 'camera should settle on the committed AREA_SET fit',
        timeout: 10_000,
      })
      .not.toBeNull();
    const referenceCamera = await readCameraDebugState(page);
    expect(referenceCamera.seq, 'reference publish must carry a real seq').not.toBeNull();

    // Pan away, then "Search this area" — commits a VIEWPORT scope whose
    // `previous` is the AREA_SET(N>1) just fit above. The map is NOT
    // remounting here (same Leaflet instance being dragged), so the URL
    // lat/lon signal is safe to use for this narrower "did the drag actually
    // move something" check — see this file's module doc.
    const preDragUrlLatLon = readUrlLatLon(page);
    const ctaButton = page.getByRole('button', { name: /search this area/i });
    await panUntilCtaVisible(page, ctaButton);
    await ctaButton.click();

    await expect
      .poll(() => urlParam(page, 'rscope'), { message: 'activating the CTA should commit rscope=vp', timeout: 10_000 })
      .toBe('vp');

    const postDragUrlLatLon = readUrlLatLon(page);
    expect(
      postDragUrlLatLon.lat !== preDragUrlLatLon.lat || postDragUrlLatLon.lon !== preDragUrlLatLon.lon,
      'the pan must actually have moved the camera away from the AREA_SET fit',
    ).toBe(true);

    // Switch to List — real unmount (Discover is panel-first on mobile).
    await closeListButton.click();
    await expect(page.locator('.leaflet-container'), 'List view must fully unmount the map').toHaveCount(0, {
      timeout: 10_000,
    });

    // Return — reachable only from List view. The label joins both area
    // names for an N>1 previous scope.
    const returnButton = page.getByRole('button', { name: /return to .*rr nagar.*deepanjali nagar|return to .*deepanjali nagar.*rr nagar/i });
    await expect(returnButton, 'the Return control should render for a VIEWPORT scope whose prior scope was AREA_SET(N>1)').toBeVisible({
      timeout: 10_000,
    });
    await returnButton.click();

    await expect
      .poll(() => urlParam(page, 'rscope'), { message: 'Return should restore rscope=areas', timeout: 10_000 })
      .toBe('areas');
    const restoredAreas = (urlParam(page, 'rareas') ?? '').split(',');
    expect(restoredAreas, 'Return should restore both original area keys').toEqual(
      expect.arrayContaining([AREA_RR_NAGAR_KEY, AREA_DEEPANJALI_NAGAR_KEY]),
    );

    // Return must have already re-published a FRESH camera intent (the
    // controller-level fix — gap 1/2 in this file's module doc) — this is
    // observable via the debug bridge immediately, even before the map
    // remounts (cameraIntent lives above PropertyMap's remount boundary).
    await expect
      .poll(async () => (await readCameraDebugState(page)).seq, {
        message: 'Return should publish a NEW camera intent (strictly higher seq) for the N>1 AREA_SET, not silently no-op',
        timeout: 10_000,
      })
      .not.toBe(referenceCamera.seq);
    const postReturnDebugState = await readCameraDebugState(page);
    expect(
      (postReturnDebugState.seq ?? -Infinity) > (referenceCamera.seq ?? -Infinity),
      'the Return publish must be a strictly newer seq (monotonic), not a coincidental replay',
    ).toBe(true);
    expectCentersClose(
      postReturnDebugState.center,
      referenceCamera.center,
      'Return should publish the SAME union-fit target as the original commit',
    );

    // Switch to Map — the fix under test (PropertyMap.tsx's delivery call
    // site): the camera must deliver on this remount instead of staying at
    // the stale panned-away position. See this file's module doc for what
    // the assertions below do (and do not) prove about this specific gap.
    await mapTrigger.click();
    await expect(page.getByTestId('mobile-map-close-list-button'), 'Map overlay should reopen').toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator('.leaflet-container')).toHaveCount(1, { timeout: 10_000 });
    await page.screenshot({ path: 'docs/pr-evidence/issue-2494/after-fix-390x844-camera-restored.png' });

    // The published cameraIntent (seq + center) must survive the remount
    // unchanged — proves the remount did not silently drop or replace it.
    const postRemountDebugState = await readCameraDebugState(page);
    expect(
      postRemountDebugState.seq,
      'the remount must not drop or replay a different seq than what Return published',
    ).toBe(postReturnDebugState.seq);
    expectCentersClose(
      postRemountDebugState.center,
      referenceCamera.center,
      'the restored camera target should match the original AREA_SET(N>1) fit, not the stale panned position',
    );
  });

  test('mobile control: List -> Map -> List -> Map with no Return leaves the camera unchanged', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await reachCommittedRrNagarDeepanjaliAreaSet(page);

    const mapTrigger = page.getByTestId('control-bar-map-trigger');
    await mapTrigger.click();
    const closeListButton = page.getByTestId('mobile-map-close-list-button');
    await expect(closeListButton).toBeVisible({ timeout: 10_000 });
    await expect
      .poll(async () => (await readCameraDebugState(page)).center, { timeout: 10_000 })
      .not.toBeNull();
    const firstFitState = await readCameraDebugState(page);

    // Toggle List -> Map -> List -> Map with no Return, no Search-this-area,
    // no pan in between — no new camera intent should ever be published
    // (matches useDiscoverMapDataController.test.ts's "N>1 unchanged"
    // no-double-fire unit coverage, exercised here at the E2E level).
    await closeListButton.click();
    await expect(page.locator('.leaflet-container')).toHaveCount(0, { timeout: 10_000 });

    await mapTrigger.click();
    await expect(closeListButton).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.leaflet-container')).toHaveCount(1, { timeout: 10_000 });
    // Give a settle window equal to the primary test's poll budget so a
    // late/duplicate publish would have time to show up.
    await page.waitForTimeout(1_000);

    const secondFitState = await readCameraDebugState(page);
    expect(secondFitState.seq, 'no-Return List/Map toggling must not publish a new camera intent').toBe(
      firstFitState.seq,
    );
    expectCentersClose(secondFitState.center, firstFitState.center, 'no-Return List/Map toggling must not move the camera target');
  });

  test('desktop control: Return-to-AREA_SET(N>1) camera restore is unaffected (map always mounted)', async ({
    page,
  }) => {
    await reachCommittedRrNagarDeepanjaliAreaSet(page);

    await expect
      .poll(async () => (await readCameraDebugState(page)).center, {
        message: 'camera should settle on the committed AREA_SET fit',
        timeout: 10_000,
      })
      .not.toBeNull();
    const referenceCamera = await readCameraDebugState(page);

    const ctaButton = page.getByRole('button', { name: /search this area/i });
    await panUntilCtaVisible(page, ctaButton);
    await ctaButton.click();

    await expect
      .poll(() => urlParam(page, 'rscope'), { message: 'activation should commit rscope=vp', timeout: 10_000 })
      .toBe('vp');

    const returnButton = page.getByRole('button', { name: /return to .*rr nagar.*deepanjali nagar|return to .*deepanjali nagar.*rr nagar/i });
    await expect(returnButton).toBeVisible({ timeout: 10_000 });
    await returnButton.click();

    await expect
      .poll(() => urlParam(page, 'rscope'), { message: 'Return should restore rscope=areas', timeout: 10_000 })
      .toBe('areas');

    await expect
      .poll(async () => (await readCameraDebugState(page)).seq, {
        message: 'Return should publish a fresh camera intent on desktop too (map never unmounts)',
        timeout: 10_000,
      })
      .not.toBe(referenceCamera.seq);
    const restoredCamera = await readCameraDebugState(page);
    expectCentersClose(
      restoredCamera.center,
      referenceCamera.center,
      'desktop Return should re-fit the returned AREA_SET(N>1) to the same target',
    );
  });
});
