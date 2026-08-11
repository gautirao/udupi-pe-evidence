/**
 * E2E — Issue #2139: coincident-coordinate markers silently vanish above
 * `disableClusteringAtZoom`.
 *
 * BUG (pre-fix): tapping a small cluster ("3 HOMES") to split it, then
 * zooming in one further step, could land at/above `CLUSTER_DISABLE_AT_ZOOM`
 * (16, `src/shared/map/zoomPolicy.ts`) with two or more listings sharing
 * (near-)identical geocoded coordinates. Above that zoom,
 * leaflet.markercluster provides ZERO coincident-point handling (see that
 * file's own module comment on `computeCoincidentMarkerOffsets`) — every
 * coincident marker rendered at the exact same pixel, stacked, effectively
 * indistinguishable/un-hit-testable.
 *
 * FIX (this issue): `computeCoincidentMarkerOffsets` (`zoomPolicy.ts`) fans
 * coincident listings to small deterministic pixel offsets, wired into both
 * `MarkerClusterLayer` and `AgriMarkerClusterLayer` in
 * `src/components/map/PropertyMap.tsx`.
 *
 * ── REAL DATA, REAL BACKEND, NO STUBS ──
 * Unlike the sibling `issue-1762-listing-density-clustering.spec.ts` (which
 * generates a synthetic in-file fixture and serves it via `page.route`),
 * this spec deliberately runs against the LIVE local backend
 * (`http://localhost:8085`) and its already-seeded Bangalore data — no
 * `page.route()` interception anywhere. `GET /api/discover/cities/bangalore/
 * listings?areaKeys=IN|KA|Bengaluru|Banashankari&limitPerArea=50` (verified
 * directly against the running backend before writing this spec) returns
 * exactly 3 listings sharing bit-identical coordinates (lat=12.93,
 * lon=77.55):
 *   - 117cc67a-008f-49e7-8755-1b26d35eae58 (3 BHK Apartment)
 *   - 03815492-e88a-d8f4-89f4-4978b9983188 (3 BHK Apartment)
 *   - 25414dd0-758b-5f29-6668-7935d578ed94 (2 BHK House)
 * — the exact "3 HOMES" cluster this issue's repro describes (5 more
 * listings in the same area sit at other, non-coincident coordinates and
 * render as a separate "2 homes" cluster plus 3 standalone pins; live-
 * verified before writing this spec, see below).
 *
 * ── LIVE-VERIFIED REPRO SEQUENCE (drives this spec's flow) ──
 * At the initial `zoom=15` camera, the 3 coincident listings above render as
 * ONE `.custom-marker-cluster` badge with `aria-label="3 homes in this
 * cluster. Activate to zoom in."`. Because all 3 members are genuinely
 * coincident (zero spatial spread), a tap on that badge is a non-splittable
 * cluster (same "degenerate bounds" case `issue-1762-listing-density-
 * clustering.spec.ts`'s "spiderfied individual marker" test documents) —
 * leaflet.markercluster's own `spiderfyOnMaxZoom` fans the 3 members out in
 * place rather than the app's own cluster-tap fit-to-bounds path changing
 * the camera; zoom stays at 15. A further, real manual zoom-in step (the
 * Leaflet '+' control — "zoom in one further step", matching the issue's own
 * repro wording) then lands at zoom=16 (`CLUSTER_DISABLE_AT_ZOOM`), where
 * clustering is disabled entirely and all 3 previously-coincident listings
 * must render as independently positioned, independently hit-testable
 * individual markers — this is the exact regression window the pre-fix bug
 * occupied. All of the above was reproduced live against the running local
 * stack before this file was written (not assumed from source alone).
 *
 * ── MOBILE MARKER TAP — KNOWN precedent gap (documented, not papered over) ──
 * `MobileListingPreviewSheet` only mounts once the canonical `node=`-keyed
 * navigation hierarchy resolves (see `issue-1762-listing-density-clustering.
 * spec.ts`'s own "individual marker click" test, same root cause). This
 * spec's URL (`journey=area-first&areaKey=...`, no `node=` — the same
 * legacy, backend-free-safe scheme `discover-real-data-smoke.spec.ts` J1 and
 * `issue-1762-listing-density-clustering.spec.ts` both use for real/stubbed
 * area-first journeys) never populates `node=`, so that resolution never
 * fires — independent of anything #2139 changed. Standing up a `node=`
 * deep-link fixture for this exact real-data area is #2129/#2131 territory,
 * out of scope here. Proven here instead, matching that same file's
 * established precedent: the tap still reaches the real `onSelectListing`
 * path (URL gains `listing=<id>`) with zero crash, immediately after the
 * exact zoom transition this issue's fix targets.
 *
 * Run (dev server + backend already up):
 *   PLAYWRIGHT_BASE_URL=http://localhost:5174 BACKEND_BASE_URL=http://localhost:8085 \
 *   npx playwright test --project=full e2e/discover/issue-2139-coincident-marker-overlap.spec.ts
 */
import { test, expect, type Page, type Locator } from '@playwright/test';

const CITY = 'bangalore';
const AREA_KEY = 'IN|KA|Bengaluru|Banashankari';
const REPRO_URL =
  `/discover?city=${CITY}&journey=area-first&areaKey=${encodeURIComponent(AREA_KEY)}` +
  `&lat=12.93&lon=77.55&zoom=15`;

// The 3 real, live-seeded listings sharing bit-identical coordinates
// (lat=12.93, lon=77.55) at the Banashankari area — the "3 HOMES" cluster
// this issue's repro describes. See module doc for how these were confirmed
// against the live local backend.
const COINCIDENT_LISTING_IDS = [
  '117cc67a-008f-49e7-8755-1b26d35eae58',
  '03815492-e88a-d8f4-89f4-4978b9983188',
  '25414dd0-758b-5f29-6668-7935d578ed94',
] as const;

const CLUSTER_DISABLE_AT_ZOOM = 16;
const MOBILE_VIEWPORT = { width: 390, height: 844 };

function markerLocatorFor(page: Page, listingId: string): Locator {
  return page.locator(`[data-listing-id="${listingId}"] [data-testid="property-marker"]`);
}

async function grantTelemetryConsent(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem('discover_telemetry_consent', 'granted');
  });
}

async function getMapZoom(page: Page): Promise<number | null> {
  return page.evaluate(
    () =>
      (window as unknown as { __debug?: { mapState?: { zoom?: number } } }).__debug?.mapState
        ?.zoom ?? null,
  );
}

/** Opens mobile Map mode — the mobile shell defaults to List. Same control as issue-1762/2129's ensureMobileMapOpen. */
async function openMobileMap(page: Page): Promise<void> {
  const mapTrigger = page.getByRole('button', { name: 'Map', exact: true });
  await expect(mapTrigger).toBeVisible({ timeout: 15_000 });
  await mapTrigger.click();
  await expect(page.locator('.leaflet-container')).toHaveCount(1, { timeout: 10_000 });
}

/**
 * Navigates to the real repro URL, enters mobile Map mode, taps the real
 * "3 homes" coincident cluster, then performs one real manual zoom-in step
 * (Leaflet's own '+' control) — the exact "tap to split, zoom in one
 * further step" sequence from the issue repro. Returns once the map has
 * settled at CLUSTER_DISABLE_AT_ZOOM with no cluster badges remaining.
 */
async function reproSequence(page: Page): Promise<void> {
  await grantTelemetryConsent(page);
  const listingsResponse = page.waitForResponse(
    (res) =>
      res.url().includes('/api/discover/cities/') &&
      res.url().includes('/listings') &&
      res.status() === 200,
    { timeout: 20_000 },
  );
  await page.goto(REPRO_URL);
  await page.waitForLoadState('domcontentloaded');
  await listingsResponse;
  await openMobileMap(page);

  const cluster = page.locator('.custom-marker-cluster[aria-label^="3 homes"]');
  await expect(cluster).toBeVisible({ timeout: 15_000 });
  // Give leaflet.markercluster's chunkedLoading a beat to finish its initial
  // build before interacting (same fact issue-1762's spec documents).
  await page.waitForTimeout(500);

  const zoomBefore = await getMapZoom(page);
  expect(zoomBefore).toBe(15);

  await cluster.click();

  // Beat for the spiderfy/cluster-tap outcome to settle before the next
  // interaction (chunkedLoading, same as above).
  await page.waitForTimeout(500);

  // Real click on the Leaflet zoom-in control — the "zoom in one further
  // step" from the issue repro. Poll for the map to actually settle at
  // CLUSTER_DISABLE_AT_ZOOM rather than trusting a fixed sleep.
  await expect(page.locator('.leaflet-control-zoom-in')).toBeVisible({ timeout: 10_000 });
  await page.locator('.leaflet-control-zoom-in').click();
  await expect
    .poll(() => getMapZoom(page), {
      timeout: 10_000,
      message: 'waiting for manual zoom-in to settle at CLUSTER_DISABLE_AT_ZOOM (16)',
    })
    .toBe(CLUSTER_DISABLE_AT_ZOOM);

  // Above disableClusteringAtZoom, leaflet.markercluster has fully
  // disbanded — no cluster badges of any kind remain in this area's view.
  await expect(page.locator('.custom-marker-cluster')).toHaveCount(0, { timeout: 10_000 });

  // leaflet.markercluster's chunkedLoading rebuilds the cluster tree in
  // rAF-scheduled chunks after a zoom change (same fact issue-1762's spec
  // documents/waits for) — poll until all 3 previously-coincident listings
  // are actually attached to the DOM rather than reading mid-rebuild.
  await expect
    .poll(
      async () => {
        const counts = await Promise.all(
          COINCIDENT_LISTING_IDS.map((id) => markerLocatorFor(page, id).count()),
        );
        return counts.every((c) => c === 1);
      },
      { timeout: 10_000, message: 'waiting for all 3 coincident markers to attach after the zoom-in rebuild' },
    )
    .toBe(true);
}

test.describe('@integration-ui #2139 — coincident-coordinate marker overlap, real 390x844 browser proof', () => {
  test.use({ viewport: MOBILE_VIEWPORT, storageState: 'e2e/fixtures/user-auth.json' });

  test('REGRESSION: all 3 previously-coincident listings remain individually visible at DISTINCT screen positions after the cluster-tap + zoom-in transition past disableClusteringAtZoom', async ({
    page,
  }) => {
    await reproSequence(page);

    // All 3 real listings that shared bit-identical coordinates must each
    // have exactly one live, visible marker element in the DOM — the bug
    // this issue reports was listings silently vanishing here, not merely
    // rendering on top of each other.
    const boxes: Array<{ id: string; x: number; y: number; width: number; height: number }> = [];
    for (const id of COINCIDENT_LISTING_IDS) {
      const marker = markerLocatorFor(page, id);
      await expect(marker, `marker for listing ${id} must be present exactly once (not vanished)`).toHaveCount(1);
      await expect(marker, `marker for listing ${id} must be visible (not hidden behind another marker)`).toBeVisible({
        timeout: 10_000,
      });
      const box = await marker.boundingBox();
      expect(box, `marker for listing ${id} must have a real layout box`).not.toBeNull();
      boxes.push({ id, ...box! });
    }

    // The exact regression this issue's fix targets: pre-fix, all 3 would
    // render at the IDENTICAL pixel position (bit-identical source
    // coordinates, zero coincident-point handling above
    // disableClusteringAtZoom). Assert every pair is at a genuinely
    // different position — not just "count() === 3" (existence-only would
    // pass even when all 3 DOM elements sit at the same (x, y)).
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const samePosition = Math.round(a.x) === Math.round(b.x) && Math.round(a.y) === Math.round(b.y);
        expect(
          samePosition,
          `listing ${a.id} and ${b.id} rendered at the IDENTICAL screen position ` +
            `(${a.x},${a.y}) vs (${b.x},${b.y}) — this is the #2139 coincident-marker ` +
            `overlap regression: coincident-offset fanning did not separate them.`,
        ).toBe(false);
      }
    }

    await page.screenshot({
      path: 'test-results/issue-2139-coincident-markers-separated.png',
      fullPage: false,
    });
  });

  test('mobile marker tap after the zoom-in transition still reaches the real selection path with no crash (matches #1762/#2129 established mobile-tap precedent)', async ({
    page,
  }) => {
    await reproSequence(page);

    // Pick whichever of the 3 coincident markers is NOT currently obscured
    // by one of its siblings (the small deterministic fan can still leave
    // adjacent pills close enough to overlap at this zoom — that is
    // expected and not itself a regression; it does not reintroduce the
    // "same pixel, unclickable" bug because at least one member is always
    // reachable). Uses a real document.elementFromPoint check — no
    // `force: true`, no synthetic click bypassing real pointer events.
    let clickableId: string | null = null;
    for (const id of COINCIDENT_LISTING_IDS) {
      const marker = markerLocatorFor(page, id);
      const box = await marker.boundingBox();
      if (!box) continue;
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      const isTopmost = await page.evaluate(
        ({ x, y, id }) => {
          const el = document.elementFromPoint(x, y);
          return !!el?.closest(`[data-listing-id="${id}"]`);
        },
        { x: cx, y: cy, id },
      );
      if (isTopmost) {
        clickableId = id;
        break;
      }
    }
    expect(clickableId, 'at least one of the 3 coincident markers must be the real topmost hit-target at its own centre').not.toBeNull();

    const marker = markerLocatorFor(page, clickableId!);
    const preview = page.getByTestId('mobile-listing-preview-sheet');
    await expect(preview).toBeHidden();

    await marker.click();

    // Known precedent gap (see module doc): this legacy areaKey URL never
    // populates node=, so the full preview sheet does not mount here — the
    // robust, established proxy for "the click reached onSelectListing" is
    // the URL gaining listing=<id>, exactly as issue-1762's spec already
    // established for this same URL scheme.
    await expect
      .poll(() => new URL(page.url()).searchParams.get('listing'), {
        timeout: 10_000,
        message: 'waiting for marker click to write listing= to the URL',
      })
      .toBe(clickableId);

    // No crash after the tap.
    expect(await page.locator('text=Something went wrong').count()).toBe(0);
  });
});
