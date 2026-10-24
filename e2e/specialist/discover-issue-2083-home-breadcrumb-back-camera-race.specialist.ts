/**
 * Issue #2083 (cycle 5) — Home-breadcrumb-then-Back camera race.
 *
 * ── THE BUG THIS SPEC EXISTS TO CATCH ──
 * The RC_A determinism spec (issue-2083-camera-back-determinism.spec.ts) drives
 * Area -> Direction -> Back x2 (a real browser Back landing on nodes that never
 * had their OWN camera re-fit fired freshly on the very same transition). It
 * never performs Home-breadcrumb (a PUSH to the canonical city root, which
 * fires a fresh `AreaPanner` bbox fit via `useDiscoverCameraOrchestration`'s
 * canonical-node fit-once effect) immediately followed by a browser Back to
 * the just-abandoned AREA leaf.
 *
 * That exact sequence exposed a SECOND, uncoordinated camera writer:
 * `useDiscoverCameraOrchestration.ts`'s canonical-node fit-once effect
 * (AC3.10) calls `setPanToArea(...)` -> `AreaPanner`'s `map.fitBounds(...)`
 * on EVERY node transition, including a Back (POP) that lands on a node whose
 * URL already carries a precise, restored `lat`/`lon`/`zoom` — which
 * `PropertyMap.tsx`'s `URLViewportController` ALSO applies via `map.setView()`
 * on the very same transition. Two independent writers, with no seq/
 * suppression coordination between them (unlike `MapController`'s
 * `cameraIntent` path, which already has `lastHandledSeqRef`/
 * `suppressForSeqRef` for exactly this hazard class), racing to set the
 * camera for the SAME history entry — a real production dataset's zoom delta
 * can put `fitBounds`'s animation inside Leaflet's zoom-animation threshold,
 * landing a stale/re-derived camera on top of the correct restored one
 * anywhere from a few hundred ms to ~2s after Back. The node/breadcrumb/panel
 * stay correct throughout; only the camera silently reverts.
 *
 * The fix scopes a guard onto that second writer: a POP transition landing on
 * a node whose URL already carries a `viewport` is trusted (skip the bbox
 * refit) rather than re-fit from the node's bbox. A forward PUSH (fresh
 * navigation) or a POP to a node with NO persisted viewport (city root / a
 * Direction — `goToNode` strips lat/lon/zoom for hierarchy nodes) is
 * untouched and still fits fresh.
 *
 * Both symptom classes here are TIME-DEPENDENT and, on this repo's fixture
 * data, not always visually distinguishable from the correct settled camera
 * at a single sample point — so this spec, like the RC_A determinism spec,
 * samples the URL BOTH immediately after Back and again after a real settle
 * window comfortably longer than the 300ms viewport debounce, and repeats the
 * scenario with real timers (no fake-timer scripting) to catch the race.
 *
 * VALUE-EQUALITY IS NOT ENOUGH ON THIS FIXTURE: `AreaPanner`'s `fitBounds()`
 * is a pure function of (bbox, padding, container size) with a fixed
 * Playwright viewport, so a second, uncoordinated bbox refit for the SAME
 * node reproduces a byte-identical camera to the persisted one here — no
 * visible divergence, even with the bug fully present (Leaflet's zoom
 * animation is also skipped entirely for this fixture's large zoom deltas,
 * so there is no animation-driven delay either). This spec therefore ALSO
 * asserts on the underlying MECHANISM directly, via
 * `window.__debug.mapState.canonicalNodeFitCount` (incremented once per
 * ACTUAL `setPanToArea` call from `useDiscoverCameraOrchestration.ts`'s
 * canonical-node fit-once effect — see that file's doc): a Back that lands on
 * a node with an already-persisted viewport must NOT increment this counter
 * a second time. This is the assertion that actually distinguishes the
 * pre-fix and post-fix behaviour on this fixture; the URL/camera assertions
 * above remain as the user-facing contract and as the guard for a real,
 * animation-driven divergence on richer datasets.
 *
 * ── FIXTURE ──
 * Same committed, idempotent seed as issue-2083-camera-back-determinism.spec.ts:
 * root -> d:southeast "South-East Bangalore" (DIRECTION) -> a:...RR Nagar (AREA).
 *
 * Run (dev server + local-fixture backend already up):
 *   PLAYWRIGHT_BASE_URL=http://localhost:<port> npx playwright test \
 *     --project=full e2e/discover/issue-2083-home-breadcrumb-back-camera-race.spec.ts
 */
import { test, expect } from './support/specialist-test';
import type { Page } from '@playwright/test';

const CITY = 'bangalore';
const BASE = `city=${CITY}&journey=area-first`;

const D_SE = 'd:southeast';
const AREA_RR_NAGAR = 'a:IN|KA|Bengaluru|RR Nagar';

// Comfortably longer than the 300ms viewport-write debounce AND the reported
// ~2s delayed-jump window from the task brief's real-browser repro.
const SETTLE_MS = 2_500;
const TRIALS = 3;

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
 * Reads the E2E-only debug counter MapDiscovery.tsx exposes (see
 * useDiscoverCameraOrchestration.ts's UseDiscoverCameraOrchestrationResult
 * doc). Returns null before the debug object has ever been populated.
 */
async function getCanonicalNodeFitCount(page: Page): Promise<number | null> {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          __debug?: { mapState?: { canonicalNodeFitCount?: number } };
        }
      ).__debug?.mapState?.canonicalNodeFitCount ?? null,
  );
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

test.describe('@integration-ui #2083 (cycle 5) — Home breadcrumb then Back camera determinism', () => {
  test(`${TRIALS}x real-timer trials — camera restored by Back stays stable through a >=2.5s settle window (no delayed root-camera overwrite)`, async ({
    page,
  }) => {
    test.setTimeout(20_000 + TRIALS * 20_000);

    for (let trial = 1; trial <= TRIALS; trial += 1) {
      await page.goto(`/discover?${BASE}`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.getByTestId('navigation-level-panel')).toBeVisible({ timeout: 15_000 });
      await dismissConsentBannerIfPresent(page);

      // Home (root) -> Direction -> Area, each a real click/PUSH, matching the
      // task brief's exact guided path.
      await page.getByTestId(cardTestId(D_SE)).click();
      await expect.poll(() => nodeParam(page)).toBe(D_SE);
      await expect(page.getByTestId(cardTestId(AREA_RR_NAGAR))).toBeVisible({ timeout: 10_000 });

      await page.getByTestId(cardTestId(AREA_RR_NAGAR)).click();
      await expect.poll(() => nodeParam(page)).toBe(AREA_RR_NAGAR);
      await expect.poll(() => readCamera(page).lat, { timeout: 10_000 }).not.toBeNull();
      // Real settle window so the Area's own camera fit — and the resulting
      // debounced reportViewport REPLACE that persists lat/lon/zoom onto THIS
      // history entry — is fully done before we leave it. Without this, the
      // entry Back later restores would not yet carry a persisted viewport at
      // all, which would trivially route around the bug this spec targets.
      await page.waitForTimeout(SETTLE_MS);

      const areaCameraBeforeHome = readCamera(page);
      expect(
        areaCameraBeforeHome.lat,
        `trial ${trial}: Area camera must carry a real lat before Home is clicked`,
      ).not.toBeNull();

      // Home breadcrumb -> canonical city root (a PUSH). This is the transition
      // that fires the canonical-node fit-once effect's fresh bbox refit
      // (AreaPanner -> map.fitBounds) for root — the SAME machinery that,
      // pre-fix, ALSO re-fires (uncoordinated with URLViewportController) on
      // the very next Back below.
      const homeCrumb = page.getByTestId('breadcrumb-home');
      await expect(homeCrumb).toBeVisible({ timeout: 5_000 });
      await homeCrumb.click();
      await expect.poll(() => nodeParam(page)).toBe('root');

      const fitCountAtRoot = await getCanonicalNodeFitCount(page);
      expect(
        fitCountAtRoot,
        `trial ${trial}: root's own fresh fit must have fired (canonicalNodeFitCount populated)`,
      ).not.toBeNull();

      // Real browser Back — no artificial delay, to land while the root
      // navigation's own fit machinery could still be settling. This is
      // exactly the "Home-breadcrumb-then-Back" sequence the guided
      // Area -> Direction -> Back x2 spec never performs.
      await page.goBack();

      // Sample #1 — IMMEDIATELY after Back. The reported bug already passed
      // this sample (node/panel/camera all read correct here).
      const nodeImmediate = nodeParam(page);
      expect(
        nodeImmediate,
        `trial ${trial}: node must read the restored AREA key immediately after Back`,
      ).toBe(AREA_RR_NAGAR);
      const cameraImmediate = readCamera(page);
      expect(
        cameraImmediate,
        `trial ${trial}: camera immediately after Back must already equal the Area's own persisted camera`,
      ).toEqual(areaCameraBeforeHome);

      // Sample #2 — after a real settle window comfortably past both the
      // 300ms viewport debounce and the reported ~2s delayed-jump window. The
      // bug ONLY appeared here: node/panel stayed correct while the camera
      // silently reverted to a re-derived root-ish value.
      await page.waitForTimeout(SETTLE_MS);

      const nodeSettled = nodeParam(page);
      const cameraSettled = readCamera(page);
      expect(
        nodeSettled,
        `trial ${trial}: node must still read the restored AREA key after the settle window`,
      ).toBe(AREA_RR_NAGAR);
      expect(
        cameraSettled,
        `trial ${trial}: settled camera must STILL equal the Area's own persisted camera — a differing ` +
          'value here is exactly the delayed-overwrite bug signature (node/panel correct, camera stale)',
      ).toEqual(areaCameraBeforeHome);

      // THE MECHANISM ASSERTION (see module doc) — a Back landing on a node
      // whose URL already carries a persisted viewport must NOT re-trigger a
      // second canonical-node bbox fit. `URLViewportController`'s setView is
      // the sole writer for this transition. Read AFTER the settle window
      // (not immediately post-Back) so the debug-object-sync effect has had
      // time to flush the increment — this is the assertion that actually
      // fails pre-fix on this fixture (value-equality alone does not, since
      // fitBounds reproduces a byte-identical camera here).
      const fitCountAfterBack = await getCanonicalNodeFitCount(page);
      expect(
        fitCountAfterBack,
        `trial ${trial}: canonicalNodeFitCount must NOT increase across a Back that restores an ` +
          'already-persisted camera — an increase here means the second, uncoordinated bbox-refit ' +
          "writer fired on top of URLViewportController's restore (the #2083 cycle 5 race)",
      ).toBe(fitCountAtRoot);
    }
  });
});
