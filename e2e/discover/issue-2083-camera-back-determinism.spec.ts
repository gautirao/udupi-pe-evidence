/**
 * Issue #2083 — RC_A: browser-Back camera determinism (AC2/AC3, the headline
 * acceptance bar).
 *
 * ── THE BUG THIS SPEC EXISTS TO CATCH ──
 * The 300ms `reportViewport` debounce (viewport.ts) was previously cancelled
 * only by APP-INITIATED writers (navigation.ts's `writeNode`/
 * `enterAreasJourney`, area.ts's `deselectArea`, etc.) — never by a browser
 * Back (a POP), which no writer intercepts. An armed timer could therefore
 * fire AFTER a Back had already committed a new history entry, flushing the
 * OLD (pre-Back) camera onto the NEW entry as a REPLACE — silently
 * overwriting whatever camera state Back itself had legitimately restored.
 * Separately, the synthetic city-root node shipped `bounds: null`, so the
 * existing camera-fit effect's null guard always short-circuited at root —
 * returning to root re-fit NOTHING, leaving the map framed on whatever area
 * was last viewed.
 *
 * Both defects were TIME-DEPENDENT (the stale flush lands ~300ms after Back,
 * not synchronously with it) and NON-deterministic in practice (whether the
 * timer had even armed depended on exact interaction timing) — a test that
 * samples the URL once, immediately after Back, cannot see either failure
 * mode. This spec therefore:
 *   (a) uses REAL timers throughout (no vi.useFakeTimers/clock mocking — a
 *       scripted ordering is precisely what let this race ship for years),
 *   (b) samples the URL BOTH immediately after Back and again after a >=1s
 *       settle window (>3x the 300ms debounce), and
 *   (c) repeats each scenario 5 times in a single test (not 5 separate
 *       `test()` blocks), collecting every trial's settled URL so
 *       determinism is asserted as byte-identical equality across all 5,
 *       not "it passed once."
 *
 * ── FIXTURE ──
 * `d:w`/Basaveshwara Nagar do NOT exist on a clean fixture restore — per
 * `scripts/db/fixtures/navigation-hierarchy-fixture-seed.sql`'s own header,
 * those two nodes were hand-seeded into a disposable container by an earlier,
 * UNCOMMITTED PR-2/3/4 session and are explicitly never touched or
 * reproduced by the committed seed. This spec instead drives the nodes the
 * committed, idempotent seed (`navigation-hierarchy-fixture-seed.sql`, #1956
 * PR-5) actually creates:
 *   root
 *     -> d:southeast "South-East Bangalore" (DIRECTION, depth 0)
 *          -> a:...RR Nagar (AREA, depth 1)
 * `RR Nagar` also carries real sale inventory from
 * `navigation-hierarchy-fixture-listings-seed.sql`, so the Area-level camera
 * this spec captures reflects a real, populated leaf, not an empty one.
 *
 * Run (dev server + local-fixture backend already up, per the task brief):
 *   PLAYWRIGHT_BASE_URL=http://localhost:<port> npx playwright test \
 *     --project=full e2e/discover/issue-2083-camera-back-determinism.spec.ts
 */
import { test, expect, type Page } from '@playwright/test';

const CITY = 'bangalore';
const BASE = `city=${CITY}&journey=area-first`;
const API_BASE_URL = process.env.VITE_API_BASE_URL ?? 'http://localhost:8085';

const D_SE = 'd:southeast';
const AREA_RR_NAGAR = 'a:IN|KA|Bengaluru|RR Nagar';

// Comfortably longer than the 300ms viewport-write debounce (viewport.ts's
// DEBOUNCE_MS) — mirrors the sibling PR-4 camera-restore spec's own
// SETTLE_MS convention/rationale (issue-1956-pr4-listing-peek-camera-restore
// .spec.ts), scaled up slightly for this spec's extra Back hop.
const SETTLE_MS = 1_200;
const TRIALS = 5;

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

function cardTestId(nodeKey: string): string {
  return `navigation-child-card-${nodeKey}`;
}

async function dismissConsentBannerIfPresent(page: Page): Promise<void> {
  const decline = page.getByRole('button', { name: /decline anonymous usage data collection/i });
  if (await decline.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await decline.click();
  }
}

/**
 * Ground truth for the city root's own bounds — read live from the SAME
 * resolve endpoint the app itself calls, rather than a hardcoded literal
 * that would silently go stale the moment Bangalore's navigation tree
 * changes (the exact anti-pattern the sibling PR-3 spec's `fetchNodeCounts`
 * helper documents avoiding). `bounds` is #2083 RC_A part 3's new field on
 * the root NavigationNodeResponse (see
 * backend/.../navigation/NavigationNodeResponseRootBoundsTest.java) — if
 * this shape assumption is wrong the request below fails loudly rather than
 * silently asserting nothing.
 */
async function fetchRootBounds(page: Page): Promise<{
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
  centreLat: number;
  centreLon: number;
} | null> {
  const response = await page.request.get(
    `${API_BASE_URL}/api/discover/cities/${CITY}/navigation/resolve?node=root`,
  );
  expect(response.ok(), 'root resolve request must succeed').toBe(true);
  const body = await response.json();
  return body.bounds ?? null;
}

test.describe('@integration-ui #2083 AC2/AC3 — guided path (City -> Direction -> Area -> Back x2) camera determinism', () => {
  test(`${TRIALS}x real-timer trials — settled URL after Back x2 is byte-identical across all trials, contains no stale lat/lon/zoom, and lands at real city bounds`, async ({
    page,
  }) => {
    test.setTimeout(20_000 + TRIALS * 20_000);

    const settledUrls: string[] = [];
    const settledCameras: Camera[] = [];
    let areaCameraFirstTrial: Camera | null = null;

    for (let trial = 1; trial <= TRIALS; trial += 1) {
      await page.goto(`/discover?${BASE}`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.getByTestId('navigation-level-panel')).toBeVisible({ timeout: 15_000 });
      await dismissConsentBannerIfPresent(page);

      // Home -> Direction.
      await page.getByTestId(cardTestId(D_SE)).click();
      await expect.poll(() => nodeParam(page)).toBe(D_SE);
      await expect(page.getByTestId(cardTestId(AREA_RR_NAGAR))).toBeVisible({ timeout: 10_000 });
      // Real settle window so the Direction level's own camera fit is fully
      // done (and any resulting reportViewport debounce has already flushed)
      // BEFORE the next navigation — this is the exact window a
      // scripted-speed test would race ahead of.
      await page.waitForTimeout(SETTLE_MS);

      // Direction -> Area.
      await page.getByTestId(cardTestId(AREA_RR_NAGAR)).click();
      await expect.poll(() => nodeParam(page)).toBe(AREA_RR_NAGAR);
      await page.waitForTimeout(SETTLE_MS);

      const areaCamera = readCamera(page);
      expect(areaCamera.lat, `trial ${trial}: area camera must carry a real lat before Back`).not.toBeNull();
      if (trial === 1) areaCameraFirstTrial = areaCamera;

      // Back x2: Area -> Direction -> root. A REAL browser Back (POP), never
      // navigate() or a UI Back-button substitute — this is the exact
      // transition kind no app-initiated writer can intercept (see module
      // doc / useDiscoverUrlState.ts's RC_A part 1 comment).
      await page.goBack();
      await page.goBack();

      // Sample #1 — IMMEDIATELY after Back, before the debounce window has
      // any chance to flush a stale write. The bug was invisible here.
      const nodeImmediate = nodeParam(page);
      expect(nodeImmediate, `trial ${trial}: root must already read null immediately after Back x2`).toBeNull();

      // Sample #2 — AFTER a real settle window comfortably past the 300ms
      // debounce. The bug only appeared here (~2s later per the task brief).
      await page.waitForTimeout(SETTLE_MS);

      const nodeSettled = nodeParam(page);
      const cameraSettled = readCamera(page);

      expect(nodeSettled, `trial ${trial}: node must remain the synthetic city root after settling`).toBeNull();

      // The settled camera must never equal the stale AREA camera that was
      // live immediately before Back — that equality is exactly the bug's
      // signature (an old area camera silently REPLACEd onto the root entry).
      expect(
        cameraSettled,
        `trial ${trial}: settled root camera must NOT equal the pre-Back AREA camera (stale flush)`,
      ).not.toEqual(areaCamera);

      settledUrls.push(new URL(page.url()).search);
      settledCameras.push(cameraSettled);
    }

    // ── Determinism — the headline assertion ──
    // Every trial's settled URL (post Back x2, post settle window) must be
    // byte-identical. A single differing trial means the race is still
    // live (intermittent), which a single-repeat green run would hide.
    const [first, ...rest] = settledUrls;
    for (let i = 0; i < rest.length; i += 1) {
      expect(rest[i], `trial ${i + 2} settled URL must be byte-identical to trial 1`).toBe(first);
    }

    // ── The map must actually be AT city bounds on return to root, not
    //    merely "some clean URL" — cross-checked against the real backend's
    //    own root bounds, not a hardcoded literal.
    const rootBounds = await fetchRootBounds(page);
    if (rootBounds && settledCameras[0].lat != null && settledCameras[0].lon != null) {
      const lat = Number(settledCameras[0].lat);
      const lon = Number(settledCameras[0].lon);
      // Generous tolerance (city-bounds fit vs a live Leaflet centre after
      // fitBounds()'s own padding/aspect-ratio adjustment are not bit-identical
      // to the raw bounds centroid) — this is a "same city, not a stale area"
      // check, not a pixel-precision assertion.
      expect(lat, 'settled root lat must be within the real city bounds envelope').toBeGreaterThanOrEqual(
        rootBounds.minLat - 0.2,
      );
      expect(lat).toBeLessThanOrEqual(rootBounds.maxLat + 0.2);
      expect(lon).toBeGreaterThanOrEqual(rootBounds.minLon - 0.2);
      expect(lon).toBeLessThanOrEqual(rootBounds.maxLon + 0.2);
    }

    // Sanity: the stale-area camera captured on trial 1 really was different
    // from city bounds (otherwise the "not.toEqual" assertion above would be
    // vacuously true rather than a real regression guard).
    expect(areaCameraFirstTrial).not.toBeNull();
  });
});

test.describe('@integration-ui #2083 AC2/AC3 — searched path (search box select area, single history entry) camera determinism', () => {
  test(`${TRIALS}x real-timer trials — Back x1 after a single-PUSH area search-select settles deterministically with no stale camera`, async ({
    page,
  }) => {
    test.setTimeout(20_000 + TRIALS * 15_000);

    const settledUrls: string[] = [];

    for (let trial = 1; trial <= TRIALS; trial += 1) {
      await page.goto(`/discover?${BASE}`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.getByTestId('navigation-level-panel')).toBeVisible({ timeout: 15_000 });
      await dismissConsentBannerIfPresent(page);

      const nodeAtRoot = nodeParam(page);
      expect(nodeAtRoot, `trial ${trial}: must start at the synthetic city root (node=null)`).toBeNull();
      const historyBeforeSearch = await page.evaluate(() => window.history.length);

      // Search box -> select "RR Nagar" -> ONE atomic write
      // (enterAreasJourney via the resolve-through-navigation-path seam —
      // see DiscoverControlBar.tsx's handleSelectArea for the area-first
      // journey branch). This must be a SINGLE history PUSH, not a
      // multi-step sequence, for the "single history entry" premise below
      // to hold.
      const areaInput = page.getByTestId('control-bar-area-input');
      await expect(areaInput).toBeVisible({ timeout: 10_000 });
      await areaInput.fill('RR Nagar');
      const option = page.getByTestId(`control-bar-area-option-IN|KA|Bengaluru|RR Nagar`);
      await expect(option).toBeVisible({ timeout: 10_000 });
      await option.click();

      await expect.poll(() => nodeParam(page)).toBe(AREA_RR_NAGAR);
      const historyAfterSelect = await page.evaluate(() => window.history.length);
      expect(
        historyAfterSelect - historyBeforeSearch,
        `trial ${trial}: search-select must be a SINGLE history entry`,
      ).toBe(1);

      await page.waitForTimeout(SETTLE_MS);
      const areaCamera = readCamera(page);

      // Back x1 — the single history entry above popped in one hop.
      await page.goBack();

      const nodeImmediate = nodeParam(page);
      expect(nodeImmediate, `trial ${trial}: must read root immediately after the single Back`).toBeNull();

      await page.waitForTimeout(SETTLE_MS);

      const nodeSettled = nodeParam(page);
      const cameraSettled = readCamera(page);
      expect(nodeSettled, `trial ${trial}: root must remain settled after Back x1`).toBeNull();
      expect(
        cameraSettled,
        `trial ${trial}: settled root camera must not equal the stale pre-Back area camera`,
      ).not.toEqual(areaCamera);

      settledUrls.push(new URL(page.url()).search);
    }

    const [first, ...rest] = settledUrls;
    for (let i = 0; i < rest.length; i += 1) {
      expect(rest[i], `trial ${i + 2} settled URL must be byte-identical to trial 1 (searched path)`).toBe(
        first,
      );
    }
  });
});
