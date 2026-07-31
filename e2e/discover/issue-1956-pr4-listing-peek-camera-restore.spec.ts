/**
 * Issue #1956 PR-4 — AC4.5 / AC4.10: listing-peek restoration at REAL timing,
 * with explicit camera (centre lat/lon + zoom) assertions.
 *
 * ── ENTRY-PATH SUBSTITUTION (user-approved, scope_amendment n=5) ──
 * AC4.5 and AC4.10 verify Close/Back RESTORATION semantics, not the
 * marker-click ENTRY path. Marker click is currently blocked by a
 * PRE-EXISTING, out-of-scope defect: `PropertyMap.tsx` never calls
 * `map.invalidateSize()` after a camera fit, so markers render ~119px
 * outside their own map container's clipped viewport (reproduces
 * identically, mirrored, on the legacy `?areaKey=` surface — not a PR-4
 * regression, and PropertyMap.tsx is explicitly out of scope for this PR).
 * Per user approval, both scenarios below instead open the peek via a
 * DEEP-LINK straight to the AREA leaf with `listing=<uuid>` already in the
 * URL (`gotoAreaLeafWithListingOpen`) — AC4.4's deep-link open path already
 * passes (AUTOMATED_PASS), so this is a substitution of ENTRY mechanism
 * only. The behaviour under test — Close restores / Back restores — is
 * unchanged and is not weakened by this substitution. This paragraph is the
 * required self-describing record of that substitution.
 *
 * ── WHY THIS SPEC EXISTS (PR-2 false-positive precedent) ──
 * PR-2 logged a green 5/5 E2E run that had OUTRUN a real ~650-900ms delayed
 * camera-fit REPLACE (see issue-1956-pr2-guarded-hierarchy-back.spec.ts's
 * "fix-verify cycle 4" describe block for the confirmed root cause and its
 * DELAYED_REPLACE_WAIT_MS=1500 pattern, reused here). A scripted click->poll
 * cycle that never waits past that window can pass even when the delayed
 * camera-fit silently moved the map. This spec (a) throttles the network via
 * a real CDP session so responses are NOT instant, (b) waits a fixed
 * 1500ms settle window (comfortably longer than the observed 650-900ms) after
 * every navigation before taking the "after" camera reading, and (c) repeats
 * each scenario THREE times in the same file (Playwright `for` loop, not
 * `repeatEach`, so failures on any single repeat are individually visible).
 *
 * ── CAMERA IDENTITY: URL lat/lon/zoom, not a private Leaflet handle ──
 * This app's own architecture (useDiscoverUrlState / MapDiscovery.tsx)
 * already treats `lat`/`lon`/`zoom` URL params as the durable source of truth
 * for map camera position — the sibling PR-2 guard spec's own repro URLs
 * encode camera the same way. No test hook exists to reach into the Leaflet
 * instance directly (confirmed: no `window.__map`/`data-map-center` hook
 * exists anywhere in this codebase), so this spec reads the SAME lat/lon/zoom
 * values the app itself persists as camera identity. This is disclosed
 * explicitly, not silently substituted for "the real camera."
 *
 * ── FIXTURE ──
 * Real backend (NOT stubbed) — `IN|KA|Bengaluru|Basaveshwara Nagar`
 * (AREA_BASAVESHWARA). This spec requires 2 real sale listings in that area;
 * SALE_LISTING_A_ID is the peek target. NOTE (evidence-honesty disclosure):
 * during this pass, the shared local Postgres fixture container
 * (`pg-test-fixture`) was found to have been recreated from scratch by an
 * earlier `scripts/dev/local-fixture-backend.sh` invocation this session,
 * which wiped the previously-seeded Bangalore listings (they are NOT part of
 * `scripts/db/fixtures/discover-smoke-seed.sql`, which is 100% Udupi data).
 * The 2 sale rows below were re-inserted directly against the fixture
 * Postgres (localhost:5434) with the SAME ids this spec and the sibling
 * AC4.11 spec (`issue-1956-areas-adaptive-journeys.spec.ts`) already name, to
 * restore the exact fixture shape those specs document. This is disclosed in
 * the evidence report, not silently absorbed.
 *
 * ── AC4.10 vs AC4.5 attribution ──
 * AC4.10 (peek -> Close -> same area/filters/count/camera/node) is credited
 * to the EXISTING #1939 peek machinery (useMarkerSelection.ts /
 * MapDiscovery.tsx's URL-hydration effect), NOT to
 * `selectedListingPreview.ts` — that module is deliberately unwired in this
 * PR and must not be tested as if live.
 *
 * AC4.5 (peek -> View details -> Back -> restored context) reuses the SAME
 * #1939 machinery's Back-restoration path. Note: the #1939 spec itself
 * (discover-1939-listing-peek-url-restore.spec.ts) is only 9/11 passing on a
 * clean base — its AC3 (Back after View details) and AC4 (Forward after
 * Back) fail pre-existing, confirmed earlier this run by a genuine clean-base
 * run. If this spec's AC4.5 Back sequence hits that same pre-existing
 * failure mode, it is attributed to that PRE-EXISTING gap, not reported as a
 * PR-4 regression.
 *
 * Run:
 *   PLAYWRIGHT_BASE_URL=http://localhost:<port> npx playwright test \
 *     e2e/discover/issue-1956-pr4-listing-peek-camera-restore.spec.ts --project=full
 */

import { test, expect, type Page } from '@playwright/test';

const CITY = 'bangalore';
const BASE = `city=${CITY}&journey=area-first&areasPreview=1`;
const AREA_BASAVESHWARA = 'a:IN|KA|Bengaluru|Basaveshwara Nagar';
const SALE_LISTING_A_ID = 'e2e19560-0003-0000-0000-000000000001';

// Comfortably longer than the confirmed 650-900ms delayed camera-fit REPLACE
// window (see PR-2's fix-verify cycle 4 module doc).
const SETTLE_MS = 1_500;
const REPEATS = 3;

type Camera = { lat: string | null; lon: string | null; zoom: string | null };

function readCamera(page: Page): Camera {
  const u = new URL(page.url());
  return {
    lat: u.searchParams.get('lat'),
    lon: u.searchParams.get('lon'),
    zoom: u.searchParams.get('zoom'),
  };
}

function nodeParam(page: Page): string | null {
  return new URL(page.url()).searchParams.get('node');
}

/**
 * Real CDP network throttling — NOT a stub, NOT an arbitrary sleep dressed
 * up as "throttling". Slow-3G-like profile: real requests take real time.
 *
 * Applied AFTER the initial page load (never during page.goto): this is a
 * Vite DEV server, which serves hundreds of unbundled ES module requests on
 * first load — throttling from before navigation starts made even the
 * initial `page.goto` exceed Playwright's 30s test timeout outright (a real,
 * confirmed timeout, not a guess). Throttling the interaction under test
 * (peek Close, View details/Back) still genuinely exercises the delayed
 * camera-fit window this spec exists to catch.
 */
async function throttleNetwork(page: Page): Promise<void> {
  const client = await page.context().newCDPSession(page);
  await client.send('Network.enable');
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 400, // ms
    downloadThroughput: (500 * 1024) / 8, // 500kbps
    uploadThroughput: (500 * 1024) / 8,
  });
}

/**
 * Dismiss the telemetry-consent banner (discover-telemetry-consent-1531/1576)
 * if it renders. CONFIRMED LIVE root cause (screenshot evidence from this
 * spec's earlier marker-click revision): the banner's fixed-position wrapper
 * intercepts pointer events across the FULL map area. Declining (not
 * Accepting) preserves this codebase's default-deny consent contract.
 */
async function dismissConsentBannerIfPresent(page: Page): Promise<void> {
  const decline = page.getByRole('button', { name: /decline anonymous usage data collection/i });
  if (await decline.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await decline.click();
  }
}

/**
 * ENTRY-PATH SUBSTITUTION — deep-links straight to the AREA leaf WITH
 * `listing=<uuid>` already in the URL, so the peek is open on load (AC4.4's
 * already-passing deep-link path), instead of opening it via a marker click
 * (blocked by the pre-existing PropertyMap.tsx invalidateSize defect — see
 * module doc above).
 */
async function gotoAreaLeafWithListingOpen(page: Page, listingId: string): Promise<void> {
  await page.goto(
    `/discover?${BASE}&node=${encodeURIComponent(AREA_BASAVESHWARA)}&listing=${listingId}`,
  );
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByTestId('areas-journey-panel-listings')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('listing-card')).toHaveCount(2, { timeout: 20_000 });
  await dismissConsentBannerIfPresent(page);
}

test.describe('@integration-ui #1956 PR-4 — AC4.10 real-timing peek Close restoration (camera asserted, deep-link entry)', () => {
  for (let repeat = 1; repeat <= REPEATS; repeat += 1) {
    test(`AC4.10 repeat ${repeat}/${REPEATS} — deep-link peek -> Close restores area/filters/count/camera/node`, async ({
      page,
    }) => {
      test.setTimeout(90_000);
      await gotoAreaLeafWithListingOpen(page, SALE_LISTING_A_ID);
      await throttleNetwork(page);

      // Real settle window so the deep-link's own initial camera-fit (if any)
      // is fully done BEFORE the peek is confirmed open and the "before"
      // camera reading is taken — this is the exact window a scripted-speed
      // test would race ahead of.
      await page.waitForTimeout(SETTLE_MS);

      const popover = page.getByTestId('marker-popover-card');
      await expect(popover).toBeVisible({ timeout: 20_000 });
      expect(new URL(page.url()).searchParams.get('listing')).toBe(SALE_LISTING_A_ID);

      const nodeBefore = nodeParam(page);
      const cameraBefore = readCamera(page);
      const countBefore = await page.getByTestId('listing-card').count();
      expect(nodeBefore, 'node= must be the canonical AREA leaf on load').toBe(AREA_BASAVESHWARA);

      await popover.getByTestId('marker-popover-close').click();
      await expect(popover).toBeHidden({ timeout: 8_000 });
      await expect
        .poll(() => new URL(page.url()).searchParams.get('listing'), { timeout: 8_000 })
        .toBeNull();

      // Real settle window AFTER closing, before the "after" reading.
      await page.waitForTimeout(SETTLE_MS);

      const nodeAfter = nodeParam(page);
      const cameraAfter = readCamera(page);
      const countAfter = await page.getByTestId('listing-card').count();

      expect(nodeAfter, 'node= must be UNCHANGED — never promoted to the hierarchy parent').toBe(
        AREA_BASAVESHWARA,
      );
      expect(countAfter, 'result count must be restored').toBe(countBefore);
      expect(cameraAfter, 'camera (lat/lon/zoom) must be restored exactly').toEqual(cameraBefore);
    });
  }
});

test.describe('@integration-ui #1956 PR-4 — AC4.5 real-timing peek -> View details -> Back restoration (camera asserted, deep-link entry)', () => {
  for (let repeat = 1; repeat <= REPEATS; repeat += 1) {
    test(`AC4.5 repeat ${repeat}/${REPEATS} — deep-link peek -> View details -> Back restores prior context`, async ({
      page,
    }) => {
      test.setTimeout(90_000);
      await gotoAreaLeafWithListingOpen(page, SALE_LISTING_A_ID);
      await throttleNetwork(page);

      await page.waitForTimeout(SETTLE_MS);

      const popover = page.getByTestId('marker-popover-card');
      await expect(popover).toBeVisible({ timeout: 20_000 });

      const nodeBefore = nodeParam(page);
      const cameraBefore = readCamera(page);
      const countBefore = await page.getByTestId('listing-card').count();

      const viewDetails = popover.getByTestId('popover-view-details');
      await expect(viewDetails).toBeVisible();
      await viewDetails.click();
      await page.waitForURL(new RegExp(`/listing/${SALE_LISTING_A_ID}`), { timeout: 15_000 });

      await page.goBack();

      // Real settle window after Back, before the "after" reading — this is
      // the exact window PR-2's fix-verify cycle 4 proved a scripted-speed
      // test would race ahead of.
      await page.waitForTimeout(SETTLE_MS);
      await expect(page.getByTestId('areas-journey-panel-listings')).toBeVisible({ timeout: 20_000 });

      const nodeAfter = nodeParam(page);
      const cameraAfter = readCamera(page);
      const countAfter = await page.getByTestId('listing-card').count();

      expect(nodeAfter, 'node= must be unchanged after Back').toBe(nodeBefore);
      expect(countAfter, 'result count must be restored after Back').toBe(countBefore);
      expect(cameraAfter, 'camera (lat/lon/zoom) must be restored exactly after Back').toEqual(
        cameraBefore,
      );
    });
  }
});
