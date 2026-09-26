/**
 * Discover real-data smoke — Issue #1264.
 *
 * Validates 4 cross-layer journeys against the LIVE backend (no page.route() mocks).
 *
 * Journeys:
 *   J1  area-first anon       — click area marker → listing cards appear, no 401/403
 *   J2  school-radius anon    — school URL params → school-radius endpoint fires, cards appear
 *   J3  school-first auth     — authenticated school-radius → cards OR property markers appear
 *   J4  keyword contextual    — q=apartment filters results; clearing q restores them
 *
 * ---------------------------------------------------------------------------
 * Issue #2427 — WHY THIS FILE TARGETS BANGALORE, NOT UDUPI (owner ruling, Option 2)
 *
 * These four journeys previously pinned Udupi node identities (`d:n`,
 * `a:IN|KA|Udupi|Brahmavar`, `a:IN|KA|Udupi|Manipal`) and a Manipal school. They
 * only ever passed because the gate ran against the shared hosted database. PR
 * #2423 (2026-09-02) isolated the gate onto an ephemeral fixture Postgres, and
 * that fixture has NO Udupi canonical hierarchy at all — `discover-smoke-seed.sql`
 * seeds zero rows into `city_regions`, `navigation_nodes` and
 * `city_launch_revision` — so Udupi renders the LEGACY area list, city-root
 * camera-sync never writes a zoom into the URL, and J1 could not pass by any
 * amount of retrying. J2-J4 were masked behind it by `mode: 'serial'` below.
 *
 * Seeding a canonical Udupi hierarchy was measured and deliberately NOT chosen:
 * promoting even a narrow `d:n` + Brahmavar revision flips ~6 Udupi spec files
 * and ~15 unmocked assertion sites from legacy to canonical rendering, none of
 * them in the `smoke` project (docs/pr-evidence/issue-2427/option-1-blast-radius.md).
 * That is a suite-wide behavioural decision, not a fixture repair, and it is
 * tracked separately — see the follow-up issue referenced from #2427.
 *
 * NOTHING IN J1-J4 IS UDUPI-SPECIFIC. Every contract they prove is city-agnostic
 * (canonical `node=` ownership, legacy `areaKey=` absence, anonymous 401/403
 * protection, school-radius endpoint invocation, keyword narrowing/restoration),
 * so retargeting onto the canonical Bangalore branch the fixture already contains
 * preserves all of them. What changes is only data identity. The cost, recorded
 * honestly: the `smoke` project no longer carries real-backend Discover coverage
 * for Udupi, the product's home city. That coverage was already dead rather than
 * merely at risk, but the follow-up issue exists so the gap stays visible.
 *
 * Run locally (smoke project, real local backend + ephemeral fixture DB):
 *   bash scripts/run-e2e-local.sh --project=smoke e2e/discover-real-data-smoke.spec.ts
 *
 * Prerequisites:
 *   - PLAYWRIGHT_BASE_URL pointing at a running frontend
 *   - BACKEND_BASE_URL pointing at the backend serving that frontend's data
 *     (scripts/run-e2e-local.sh exports both from .env.e2e / .env.e2e.local)
 *   - The fixture seeds applied by scripts/db/restore-test-fixture.sh — in
 *     particular navigation-hierarchy-fixture-seed.sql (the nodes),
 *     navigation-hierarchy-fixture-listings-seed.sql (the RR Nagar listings) and
 *     navigation-hierarchy-schools-agri-fixture-seed.sql (the RR Nagar school)
 *   - PLAYWRIGHT_BROKER_EMAIL + PLAYWRIGHT_BROKER_PASSWORD set for J3 (else J3 skips)
 */

import { test, expect, type Locator, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BACKEND =
  process.env.BACKEND_BASE_URL ?? 'https://udupi-property-explorer.onrender.com';

/** City slug every journey below runs against — see the #2427 note in the file header. */
const CITY = 'bangalore';

/**
 * AREA leaf all four journeys use. It is the only fixture AREA that carries
 * everything they need at once: two LIVE residential listings, a school, and a
 * canonical Direction parent.
 */
const RR_NAGAR_AREA_KEY = 'IN|KA|Bengaluru|RR Nagar';

// ---------------------------------------------------------------------------
// Canonical Discover navigation nodes (Bangalore) — real fixture shape.
//
// The legacy `?areaKey=` deep-link param has been deliberately ignored by the
// area-first journey since #2117: the canonical AREA state is `?node=a:<areaKey>`.
// Both node keys below are seeded by
// scripts/db/fixtures/navigation-hierarchy-fixture-seed.sql (RR Nagar at :124,
// a depth-1 AREA leaf under `d:southeast`) and are already exercised as a real
// root -> Direction -> AREA path by e2e/canonical/discover-area-first.canonical.ts
// (:98-131) and e2e/discover/issue-1823-camera-fit-policy.spec.ts.
// ---------------------------------------------------------------------------

/** Direction destination reached from the Bangalore city root. */
const SOUTHEAST_DIRECTION_NODE = 'd:southeast';
/**
 * AREA child of `d:southeast`, pinned by identity rather than discovered via
 * `.first()`: `[data-testid="area-single-marker"]` DOM order does not track
 * on-screen order for a Leaflet map, so a positional pick could silently drift
 * onto a sibling area (Vijayanagar or Nagarbhavi) and weaken what this journey
 * proves.
 */
const RR_NAGAR_AREA_NODE = `a:${RR_NAGAR_AREA_KEY}`;

/**
 * The exact fixture school J2/J3 use, pinned by name.
 *
 * `GET /api/public/schools/by-area` returns every school within 2 km of the AREA
 * CENTROID rather than only those whose `area_key` matches (SchoolController#byArea),
 * so taking element [0] would let an unrelated Bangalore school drift in — and the
 * radius derived below is only valid for THIS school's coordinates.
 * navigation-hierarchy-schools-agri-fixture-seed.sql:76-78 seeds it, and :123-126
 * asserts at seed time that the V80 trigger resolves it to RR Nagar.
 */
const RR_NAGAR_SCHOOL_NAME = '[E2E] RR Nagar Fixture Public School';

/**
 * School radius for J2/J3, DERIVED from the fixture's real coordinates rather
 * than inherited or guessed.
 *
 * The school sits at 12.9314733, 77.5290964. RR Nagar's two LIVE listings:
 *   - `[E2E] RR Nagar Fixture Apartment` at 12.9314733, 77.5290964 — identical
 *     coordinates, so 0.000 km away.
 *   - `[E2E] RR Nagar Fixture House Two` at 12.9314733, 77.5318614 — same
 *     latitude, delta-longitude 0.0027650 deg. One degree of longitude at this
 *     latitude is 111.320 * cos(12.9314733 deg) = 108.497 km, so the offset is
 *     0.0027650 * 108.497 = 0.300 km. (Independently corroborated by that seed's
 *     own "+300m EAST" note.)
 * 2 km therefore reaches both with a ~6.7x margin, while still excluding the
 * nearest listings in neighbouring AREAs (Deepanjali Nagar ~2.3 km, Nagarbhavi
 * ~2.4 km) — so a passing assertion is genuinely about RR Nagar.
 */
const SCHOOL_RADIUS_KM = 2;

/**
 * J4's keyword, DERIVED from the fixture's own listing text.
 *
 * `q` is forwarded server-side to `/api/discover/cities/{city}/listings` and
 * becomes `pl.search_vector @@ websearch_to_tsquery('english', ?)`
 * (DiscoverListingPredicateBuilder). V18__add_listing_fts_vector.sql defines
 * `search_vector` over title + locality + description. Of RR Nagar's LIVE
 * listings only `[E2E] RR Nagar Fixture Apartment` contains this token — the
 * others are `... House Two` and the two `... Agri Parcel` rows — so the keyword
 * provably narrows the AREA's result set rather than matching everything.
 */
const KEYWORD = 'apartment';

function urlParam(page: Page, name: string): string | null {
  return new URL(page.url()).searchParams.get(name);
}

function urlZoom(page: Page): number {
  return Number(urlParam(page, 'zoom') ?? 0);
}

/**
 * Issue #2724 (pass 4) — plain rectangle shape for `Locator.boundingBox()`'s
 * non-null result, used by `intersects` below.
 */
interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Standard axis-aligned bounding-box intersection test, mirroring
 * `capture-2724-parity.mjs`'s own `intersects()` helper (kept identical in
 * shape so the two can't silently drift into different overlap definitions).
 */
function intersects(a: BoundingBox, b: BoundingBox): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

/**
 * Drive a real click on a Leaflet map marker.
 *
 * Leaflet recreates each marker's DOM element on layout-affecting events
 * (`layoutTick`/zoom recompute in the area marker layers), which makes
 * Playwright's higher-level `locator.click()` actionability wait (element
 * stability across frames) unreliable for these marker types — the exact,
 * already-documented limitation `issue-1956-pr2-destination-surface.spec.ts`
 * and `issue-1956-pr3-area-clustering.spec.ts` work around with this same
 * `page.mouse.move/down/up` pattern. A real synthetic mouse move/down/up at the
 * marker's own bounding-box centre DOES navigate, while `locator.click()` on the
 * exact same element intermittently no-ops.
 *
 * The marker must be waited for after EVERY camera change before its bounding
 * box is read — a `boundingBox()` on a not-yet-rendered marker simply hangs.
 */
/**
 * Dismiss the Discover telemetry-consent banner before driving the map.
 *
 * It is a `z-50` fixed overlay pinned bottom-centre, so while it is up it sits
 * above the map surface and can intercept pointer events aimed at it. DECLINE
 * is chosen deliberately: it is the privacy-preserving option, and the specs
 * must not depend on telemetry being switched on.
 *
 * (It does not overlap the Leaflet zoom control specifically — at the default
 * 1280x720 viewport the banner spans roughly x 400-880 and the bottom-right
 * zoom control sits near x 1230-1270. The overlay that does sit on the zoom
 * control is the `discover-badge` pill; see clickMapZoomIn.)
 */
async function declineConsentBannerIfPresent(page: Page): Promise<void> {
  const banner = page.getByTestId('discover-consent-banner');
  if (await banner.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await banner.getByRole('button', { name: /decline/i }).click();
    await expect(banner).not.toBeVisible({ timeout: 5_000 });
  }
}

/**
 * Click the map's own "Zoom in" (+) control with a real synthetic mouse click.
 *
 * The floating `discover-badge` results pill can sit partly on top of the
 * control, so `locator.click()` blocks on actionability. Rather than forcing the
 * click blindly, pick a point inside the control that `elementFromPoint` proves
 * is genuinely the topmost element there, and throw if no such point exists —
 * so a control that really is unreachable fails loudly instead of silently.
 */
async function clickMapZoomControl(page: Page, direction: 'in' | 'out'): Promise<void> {
  const btn = page.locator(`.leaflet-control-zoom-${direction}`);
  await expect(btn, `the Discover map "zoom ${direction}" control must be available`).toBeVisible({ timeout: 10_000 });
  const box = await btn.boundingBox();
  if (!box) {
    throw new Error(`leaflet zoom-${direction} control has no bounding box`);
  }
  const candidates: Array<[number, number]> = [
    [box.x + box.width / 2, box.y + box.height / 2],
    [box.x + box.width - 2, box.y + box.height / 2],
    [box.x + box.width - 2, box.y + 2],
    [box.x + 2, box.y + 2],
  ];
  for (const [x, y] of candidates) {
    const reachable = await page.evaluate(
      ([px, py, sel]) =>
        Boolean((document.elementFromPoint(px as number, py as number) as Element | null)?.closest(sel as string)),
      [x, y, `.leaflet-control-zoom-${direction}`] as [number, number, string],
    );
    if (!reachable) continue;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.up();
    return;
  }
  throw new Error(`leaflet zoom-${direction} control is fully obscured by a floating overlay`);
}

async function clickMapZoomIn(page: Page): Promise<void> {
  await clickMapZoomControl(page, 'in');
}

/**
 * Is this marker actually clickable — rendered AND inside the visible viewport?
 *
 * Leaflet keeps markers in the DOM while they are panned outside the visible map
 * pane, and Playwright's `toBeVisible()` is satisfied by any element with a
 * non-empty box and no hiding CSS. So an off-screen marker passes every check
 * this file used to make before clicking, and `page.mouse.move()` to its
 * out-of-viewport coordinates then lands on nothing at all — a click into the
 * void that looks, from the assertion's point of view, exactly like a broken app.
 */
async function markerHittable(page: Page, locator: Locator): Promise<boolean> {
  if ((await locator.count()) === 0) return false;
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('page has no viewport size');
  const box = await locator.first().boundingBox();
  if (!box) return false;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  return cx >= 0 && cy >= 0 && cx <= viewport.width && cy <= viewport.height;
}

/**
 * The visual cluster currently swallowing `nodeKey`, if any.
 *
 * `AreaVisualClusterLayer` names a cluster after its members, e.g.
 * `visual-cluster:d:central|d:southeast|d:southwest`, so a substring match on the
 * member key identifies the cluster that must be broken open to reach it. The
 * keys are unambiguous under substring matching: `d:southeast` does not occur
 * inside `d:southwest`, and AREA keys are fully qualified
 * (`a:IN|KA|Bengaluru|RR Nagar`).
 */
function clusterContaining(page: Page, nodeKey: string): Locator {
  // Direction members appear under their own key (`d:southeast`), but AREA
  // members appear as RAW area keys with the `a:` prefix stripped — measured:
  // `visual-cluster:IN|KA|Bengaluru|Nagarbhavi|IN|KA|Bengaluru|RR Nagar|IN|KA|Bengaluru|Vijayanagar`.
  // Matching on the unprefixed form covers both.
  const member = nodeKey.replace(/^a:/, '');
  return page.locator(
    `[data-testid="area-visual-cluster-marker"][data-node-key*="${member}"]`,
  );
}

/**
 * The cluster-focus panel entry for `nodeKey`, the app's own disambiguation
 * surface for markers that cannot be separated by zooming.
 */
function clusterFocusMember(page: Page, nodeKey: string): Locator {
  return page.locator(`[data-testid="areas-cluster-focus-member-${nodeKey}"]`);
}

/**
 * Walk the real supported anonymous click path until `nodeKey` is activated (#2427).
 *
 * Bangalore is a DENSE city root, and the fixture is deliberately dense too, so
 * neither hop of this journey is a bare marker click. Both shapes were measured
 * against the running fixture rather than assumed:
 *
 *  - City root (zoom 12): only `d:northeast` stands alone. The southern three
 *    collapse into `visual-cluster:d:central|d:southeast|d:southwest`. Clicking
 *    that cluster is the app's break-out interaction — it zooms one level, which
 *    promotes `d:central` and leaves `visual-cluster:d:southeast|d:southwest` —
 *    so reaching a clustered Direction means clicking clusters, not zooming.
 *  - Inside `d:southeast`: all three AREA leaves sit in ONE cluster
 *    (`visual-cluster:IN|KA|Bengaluru|Nagarbhavi|...|RR Nagar|...|Vijayanagar`)
 *    that no zoom level separates — by design. navigation-hierarchy-fixture-seed.sql
 *    places those markers within ~10-15m of each other precisely so the clusterer
 *    merges them at any zoom. Clicking the cluster opens the `areas-cluster-focus-panel`,
 *    whose per-member rows (`areas-cluster-focus-member-a:<areaKey>`) are how a real
 *    user picks one coincident area. That panel IS the marker-activation surface here.
 *
 * So this helper tries, in order: activate the target's own marker; activate its
 * cluster-focus row if a panel is open; break open the cluster holding it; and
 * only then fall back to zooming in. Every step waits on real app state — the URL
 * camera advancing, an element existing — never a sleep, and it ends in a hard
 * assertion so a target that never becomes reachable fails loudly instead of
 * being skipped or clicked into the void.
 *
 * Net effect on coverage: the journey exercises MORE of the product than the
 * Udupi original did, since the dense-root break-out and the coincident-marker
 * disambiguation panel are both now on the path.
 */
async function activateMapNode(
  page: Page,
  testId: string,
  nodeKey: string,
  maxSteps = 10,
): Promise<void> {
  const target = page.locator(`[data-testid="${testId}"][data-node-key="${nodeKey}"]`);
  const focusRow = clusterFocusMember(page, nodeKey);

  // Let the marker layer render before concluding anything about the camera:
  // otherwise the first iteration acts on a map that simply has not painted yet.
  await page
    .locator(
      '[data-testid="area-destination-marker"], [data-testid="area-single-marker"], [data-testid="area-visual-cluster-marker"]',
    )
    .first()
    .waitFor({ state: 'attached', timeout: 15_000 })
    .catch(() => {
      // Non-fatal: the loop below is the recovery, and its closing assertion
      // still fails loudly if nothing ever renders.
    });

  for (let i = 0; i < maxSteps; i += 1) {
    if (await markerHittable(page, target)) {
      await clickLocatorCentre(page, target.first());
      return;
    }
    if (await markerHittable(page, focusRow)) {
      await clickLocatorCentre(page, focusRow.first());
      return;
    }

    const cluster = clusterContaining(page, nodeKey);
    if (await markerHittable(page, cluster)) {
      const urlBefore = page.url();
      await clickLocatorCentre(page, cluster.first());
      // A cluster click either moves the camera or opens the focus panel; both
      // are visible in the URL (`clusterFocus=`), so wait on real state rather
      // than assuming the click took effect.
      await expect
        .poll(() => page.url(), {
          message: `clicking the visual cluster holding ${nodeKey} must change the app's URL state`,
          timeout: 10_000,
        })
        .not.toBe(urlBefore);
      continue;
    }

    const zoomBefore = urlZoom(page);
    await clickMapZoomIn(page);
    await expect
      .poll(() => urlZoom(page), {
        message: `the map "Zoom in" control must advance the URL zoom past ${zoomBefore}`,
        timeout: 10_000,
      })
      .toBeGreaterThan(zoomBefore);
  }

  expect(
    await markerHittable(page, target) || (await markerHittable(page, focusRow)),
    `${nodeKey} must become activatable — as its own ${testId}, or as a row in the ` +
      'cluster-focus panel — before this journey can continue',
  ).toBe(true);
}

/** Real synthetic mouse click at a locator's own bounding-box centre. */
async function clickLocatorCentre(page: Page, locator: Locator): Promise<void> {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('locator has no bounding box');
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
}

// ---------------------------------------------------------------------------
// School data fetched once for J2 + J3
// ---------------------------------------------------------------------------

interface SchoolData {
  schoolId: string | null;
  schoolLat: number | null;
  schoolLon: number | null;
}

let schoolData: SchoolData = { schoolId: null, schoolLat: null, schoolLon: null };

/**
 * Why the prefetch failure is reported rather than swallowed (#2427).
 *
 * This used to degrade into `test.skip(schoolData.schoolId === null)`, which was
 * right when the suite ran against a shared hosted database whose seed might be
 * stale. It is wrong now: the school is seeded into the isolated fixture and
 * asserted present AT SEED TIME, so a missing school means the fixture or the
 * endpoint is broken — precisely the failure a smoke gate exists to catch. A
 * silent skip would report green while proving nothing.
 */
let schoolPrefetchFailure: string | null = null;

// ---------------------------------------------------------------------------
// J2/J3 school pre-fetch (beforeAll — runs once for the describe block)
// ---------------------------------------------------------------------------

test.describe('Discover real-data smoke', () => {
  // Run tests serially within this block to avoid auth fixture contention under parallel workers.
  // Root cause: J3 (broker auth) and N2 (admin auth) race on shared storageState under 2-worker execution.
  // Serial mode here ensures each auth context settles before the next test begins.
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    // `size` is deliberately larger than 1: by-area returns every school within
    // 2 km of the AREA centroid, so the fixture school is not guaranteed to be
    // first and must be selected by name (see RR_NAGAR_SCHOOL_NAME).
    const url =
      `${BACKEND}/api/public/schools/by-area` +
      `?areaKey=${encodeURIComponent(RR_NAGAR_AREA_KEY)}&page=0&size=50`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        schoolPrefetchFailure = `GET ${url} returned ${res.status}`;
        return;
      }
      // Response shape: bare array [{ id, name, latitude, longitude, ... }, ...]
      const data = (await res.json()) as Array<{
        id: string;
        name: string;
        latitude: number;
        longitude: number;
      }>;
      const school = data?.find((s) => s?.name === RR_NAGAR_SCHOOL_NAME);
      if (!school) {
        schoolPrefetchFailure =
          `the fixture school "${RR_NAGAR_SCHOOL_NAME}" was not among the ` +
          `${data?.length ?? 0} school(s) returned for ${RR_NAGAR_AREA_KEY} ` +
          `(names: ${(data ?? []).map((s) => s?.name).join(', ') || 'none'})`;
        return;
      }
      if (school.latitude == null || school.longitude == null) {
        schoolPrefetchFailure = `the fixture school "${RR_NAGAR_SCHOOL_NAME}" has null coordinates`;
        return;
      }
      schoolData = {
        schoolId: school.id,
        schoolLat: school.latitude,
        schoolLon: school.longitude,
      };
      console.log(
        `[discover-real-data-smoke] School prefetch OK: id=${school.id} lat=${school.latitude} lon=${school.longitude}`,
      );
    } catch (err) {
      schoolPrefetchFailure = `GET ${url} threw: ${String(err)}`;
    }
  });

  /**
   * Shared J2/J3 precondition. Fails loudly with the prefetch's own diagnostic
   * rather than skipping — see schoolPrefetchFailure's note above.
   */
  function assertSchoolFixturePresent(journey: string): string {
    expect(
      schoolPrefetchFailure,
      `${journey}: the RR Nagar fixture school must be resolvable before this journey can run`,
    ).toBeNull();
    expect(
      schoolData.schoolId,
      `${journey}: school prefetch must have resolved an id for "${RR_NAGAR_SCHOOL_NAME}"`,
    ).not.toBeNull();
    return schoolData.schoolId as string;
  }

  // -------------------------------------------------------------------------
  // J1 — area-first anon
  // -------------------------------------------------------------------------

  test('J1 — area-first anon: click through to a real AREA marker loads listing cards without auth errors', async ({ page }) => {
    // Collect any 401/403 responses during the journey
    const authErrors: number[] = [];
    page.on('response', (r) => {
      if (r.status() === 401 || r.status() === 403) authErrors.push(r.status());
    });

    // This test walks the REAL supported anonymous click path, marker by marker.
    // It previously deep-linked `?areaKey=IN|KA|Udupi|Manipal` and clicked nothing
    // at all, which both mis-described itself ("click area marker") and could never
    // load: area-first has deliberately ignored the legacy `areaKey=` param since
    // #2117, so the deep link left the journey at the city root with no cards.

    // Step 0 — city root. `revealMapNode` below discovers, per hop, whether the
    // target needs a visual cluster broken open or simply a zoom-in, rather than
    // assuming a fixed sequence — so this works whether the root renders its
    // Direction destinations individually or collapses them into a cluster.
    await page.goto(`/discover?city=${CITY}`);
    await page.waitForLoadState('domcontentloaded');

    await expect(
      page.locator('.leaflet-control-zoom-in'),
      'J1: the Discover map (and its zoom control) must mount at the city root',
    ).toBeVisible({ timeout: 15_000 });
    // Wait on real app state — the camera-sync writing lat/lon/zoom into the URL —
    // rather than a sleep, so the zoom-in below acts on a settled camera.
    await expect
      .poll(() => urlZoom(page), {
        message: 'J1: city-root camera-sync must settle a zoom into the URL',
        timeout: 15_000,
      })
      .toBeGreaterThanOrEqual(1);

    // The consent dialog overlays the zoom control — dismiss it before driving the map.
    await declineConsentBannerIfPresent(page);

    // Step 1/2 — zoom until the South-East Direction destination is its own
    // marker, then activate it. Markers must be waited for after EVERY camera
    // change.
    await activateMapNode(page, 'area-destination-marker', SOUTHEAST_DIRECTION_NODE);
    // Assert the DECODED `node` param equals the canonical key exactly, rather
    // than regex-matching the raw URL. The raw form is not a stable contract —
    // the app form-encodes a space as `+` while `encodeURIComponent` produces
    // `%20`, so a raw-string match on an AREA key containing a space (`RR Nagar`)
    // fails for a purely representational reason. Exact equality on the parsed
    // value is also strictly stronger than the substring regex it replaces.
    await expect
      .poll(() => urlParam(page, 'node'), {
        message: 'J1: activating a Direction marker must write its canonical node to the URL',
        timeout: 10_000,
      })
      .toBe(SOUTHEAST_DIRECTION_NODE);

    // Step 3 — activate a real AREA marker inside that direction.
    await activateMapNode(page, 'area-single-marker', RR_NAGAR_AREA_NODE);
    await expect
      .poll(() => urlParam(page, 'node'), {
        message: 'J1: activating an AREA marker must write its canonical node to the URL',
        timeout: 10_000,
      })
      .toBe(RR_NAGAR_AREA_NODE);

    // The canonical AREA state is `node=a:…`; the legacy `areaKey=` param must
    // never be what carries this state.
    expect(
      urlParam(page, 'areaKey'),
      'J1: the AREA state must be canonical (node=a:…), never the legacy areaKey= param',
    ).toBeNull();

    // Wait for real listing cards from the live backend in the right panel.
    await page.waitForSelector('[data-testid="listing-card"]', { timeout: 15_000 });

    const cardCount = await page.locator('[data-testid="listing-card"]').count();
    expect(
      cardCount,
      'J1: at least 1 real listing card expected after activating the RR Nagar AREA marker',
    ).toBeGreaterThanOrEqual(1);

    // No auth errors — anon path must use public endpoints only
    expect(authErrors, 'J1: unexpected 401/403 responses on anon journey').toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Issue #2724 — anon zoom-past-threshold prompt must not swallow marker clicks
  // -------------------------------------------------------------------------

  /**
   * Regression test for issue #2724's pointer-events fix (MapEmptyGuidance.tsx's
   * `showAnonZoomPrompt` branch). That prompt now renders CENTERED on the map
   * (`absolute inset-0` + `flex items-center justify-center`) instead of pinned to
   * the bottom-chrome — an owner design change made while fixing #2724's other two
   * bottom-chrome issues. Centering it re-created exactly the failure class this
   * whole issue was about: while implementing it, the pre-push gate's J1 above
   * started failing (a cluster click stopped changing the URL), because the
   * centered card's WHOLE surface briefly carried `pointer-events-auto` and
   * silently absorbed clicks meant for whatever marker/cluster the fitBounds
   * camera happened to center underneath it.
   *
   * J1 above incidentally exercises the fixed code (it walks through the same
   * anon, no-area-selected, zoomed-in state before it ever selects an area,
   * which is exactly when `showAnonZoomPrompt` is true), and did catch the
   * regression when it was reintroduced locally — but its own pass/fail signal
   * is one hop removed from the actual claim (a URL not changing has other
   * possible causes too). THIS test proves the specific mechanism directly,
   * with no inference required:
   *   1. Drives the map into the exact state where the prompt is visible AND a
   *      real marker/cluster's bounding box provably overlaps the prompt's own
   *      bounding box (asserted geometrically, not assumed).
   *   2. Uses `document.elementFromPoint` — the same real-browser hit-testing
   *      primitive `clickMapZoomControl` above already relies on — at that exact
   *      overlapping pixel, and asserts the topmost element is the marker/map,
   *      never a descendant of the prompt card.
   *   3. Performs a real synthetic click there and asserts it reached the map
   *      (the URL actually changes), not just that no error was thrown.
   *   4. Separately confirms the prompt's own "sign in" link is still reachable
   *      at ITS coordinates, proving the fix didn't break the link itself.
   */
  test('#2724 — the centered anon zoom-past-threshold prompt lets a click reach a marker underneath it, not just clicks near it', async ({
    page,
  }) => {
    await page.goto(`/discover?city=${CITY}`);
    await page.waitForLoadState('domcontentloaded');
    await expect(
      page.locator('.leaflet-control-zoom-in'),
      '#2724: the Discover map (and its zoom control) must mount at the city root',
    ).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(() => urlZoom(page), {
        message: '#2724: city-root camera-sync must settle a zoom into the URL',
        timeout: 15_000,
      })
      .toBeGreaterThanOrEqual(1);
    await declineConsentBannerIfPresent(page);

    const prompt = page.getByTestId('map-anon-zoom-prompt');
    // The ACTUAL blocking element — `prompt` (the outer wrapper) is `absolute inset-0`
    // (the whole map area) and is itself `pointer-events-none`; it never blocks anything
    // by itself. Only this inner card (previously `pointer-events-auto` on its whole
    // surface, the regression) can intercept a click. The precondition/overlap check
    // below MUST use the card's own (much smaller, centered) box, not the full-map
    // wrapper's — checking against the wrapper would make "overlap" trivially true for
    // almost any marker on screen and prove nothing about the actual regression.
    const promptCard = page.getByTestId('map-anon-zoom-prompt-card');
    const markers = page.locator(
      '[data-testid="area-destination-marker"], [data-testid="area-single-marker"], [data-testid="area-visual-cluster-marker"]',
    );

    // Zoom in (never selecting an area) until the anon prompt is up. Bounded —
    // fails loudly rather than hanging if the threshold is never crossed.
    let overlappingMarkerCentre: { x: number; y: number } | null = null;
    for (let i = 0; i < 8; i += 1) {
      if (await prompt.isVisible().catch(() => false)) {
        const promptBox = await promptCard.boundingBox();
        if (promptBox) {
          const count = await markers.count();
          for (let m = 0; m < count; m += 1) {
            const markerBox = await markers.nth(m).boundingBox();
            if (!markerBox) continue;
            // Intersection rectangle, not either element's own centre — two boxes can
            // overlap at a corner/edge far from a marker's own centre point, and a click
            // there would land outside the card even though the boxes "overlap". The
            // point that actually proves the claim is one inside BOTH rectangles.
            const left = Math.max(markerBox.x, promptBox.x);
            const right = Math.min(markerBox.x + markerBox.width, promptBox.x + promptBox.width);
            const top = Math.max(markerBox.y, promptBox.y);
            const bottom = Math.min(markerBox.y + markerBox.height, promptBox.y + promptBox.height);
            if (right > left && bottom > top) {
              overlappingMarkerCentre = { x: (left + right) / 2, y: (top + bottom) / 2 };
              break;
            }
          }
        }
        if (overlappingMarkerCentre) break;
      }
      await clickMapZoomIn(page);
      await page.waitForTimeout(300);
    }

    expect(
      overlappingMarkerCentre,
      '#2724: setup precondition — a real marker/cluster must be visibly underneath the anon prompt for this test to prove anything. If this fails, the fixture/camera fit has drifted and the repro needs re-deriving, not the assertion loosened.',
    ).not.toBeNull();
    const { x, y } = overlappingMarkerCentre as { x: number; y: number };

    // Step 2 — real-browser hit-testing at the overlapping pixel: the topmost
    // element there must NOT be part of the prompt CARD (the actual blocking
    // element — see the note above).
    const topmostIsPromptCardDescendant = await page.evaluate(
      ([px, py]) =>
        Boolean(
          (document.elementFromPoint(px as number, py as number) as Element | null)?.closest(
            '[data-testid="map-anon-zoom-prompt-card"]',
          ),
        ),
      [x, y],
    );
    expect(
      topmostIsPromptCardDescendant,
      '#2724: the anon prompt card must not be the topmost hit-test target over a marker it visually overlaps',
    ).toBe(false);

    // Step 3 — a real click there must reach the map (URL changes), matching
    // J1's own "cluster/marker click -> URL state changes" contract.
    const urlBefore = page.url();
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.up();
    await expect
      .poll(() => page.url(), {
        message: '#2724: a click on a marker visually underneath the anon prompt must still change the app URL state',
        timeout: 10_000,
      })
      .not.toBe(urlBefore);

    // Step 4 — the prompt's own "sign in" link, at its own coordinates, must
    // still be the real hit-test target (the fix must not have broken it).
    // Re-navigate fresh: the click above may have selected an area, which
    // suppresses the anon prompt (hasAreaSelected gate).
    await page.goto(`/discover?city=${CITY}`);
    await page.waitForLoadState('domcontentloaded');
    await declineConsentBannerIfPresent(page);
    for (let i = 0; i < 8; i += 1) {
      if (await prompt.isVisible().catch(() => false)) break;
      await clickMapZoomIn(page);
      await page.waitForTimeout(300);
    }
    await expect(prompt, '#2724: the anon prompt must reappear on a fresh zoomed-in, no-area-selected load').toBeVisible({
      timeout: 10_000,
    });
    // Scoped to the prompt itself — the persistent top nav also has its own
    // "Sign in" link, which a page-wide role query matches too (strict-mode
    // violation otherwise).
    const signIn = prompt.getByRole('link', { name: 'sign in' });
    await expect(signIn).toBeVisible({ timeout: 10_000 });
    const linkBox = await signIn.boundingBox();
    expect(linkBox, '#2724: the sign-in link must have a real bounding box').not.toBeNull();
    const { x: lx, y: ly } = {
      x: (linkBox as NonNullable<typeof linkBox>).x + (linkBox as NonNullable<typeof linkBox>).width / 2,
      y: (linkBox as NonNullable<typeof linkBox>).y + (linkBox as NonNullable<typeof linkBox>).height / 2,
    };
    const linkIsHittable = await page.evaluate(
      ([px, py]) =>
        Boolean(
          (document.elementFromPoint(px as number, py as number) as Element | null)?.closest('a[href*="/auth"]'),
        ),
      [lx, ly],
    );
    expect(linkIsHittable, '#2724: the "sign in" link itself must still be the real hit-test target at its own coordinates').toBe(
      true,
    );
  });

  // -------------------------------------------------------------------------
  // Issue #2724 (pass 4, code review) — desktop area-selected pairing: the
  // portalled "Recenter on <area>" button must never collide with the count
  // pill or with "Recenter on <city>", including a long area name.
  // -------------------------------------------------------------------------

  /**
   * Regression test for issue #2724 pass 4's width-cap/clamp fix
   * (DiscoverMapSurface.tsx's `areas-recenter-button`, desktop branch). Before
   * the fix, that button had no `max-w` cap; a long area name wrapped to 3
   * lines at 1024px and, being bottom-anchored, grew UPWARD toward the count
   * pill sharing its row.
   *
   * The RR Nagar fixture area's own name ("RR Nagar") is far too short to
   * organically wrap at any desktop width, so — mirroring the technique
   * capture-2724-parity.mjs already used for the evidence screenshots —
   * this test overwrites the already-rendered label `<span>`'s (not the
   * button's — button.textContent would delete the clamp element itself)
   * live DOM text content with a deliberately long name AFTER measuring its
   * real, unforced geometry. Both the "before" and "after" measurements
   * below read real layout/CSS; only the text content in the "after" step is
   * synthetic. This is called out explicitly rather than left implicit, so
   * the assertion is honest about what it does and does not prove: it proves
   * the CSS cap/clamp holds for an arbitrarily long label, not that any
   * currently-seeded fixture area has a name this long. "Recenter on <city>"
   * is checked unconditionally throughout (it is mounted unconditionally by
   * DiscoverMapCanvas.tsx, not gated by area-selected state).
   */
  test('#2724 pass 4 — the desktop area-recenter button never collides with the count pill or "Recenter on <city>", including a forced long area name', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto(
      `/discover?city=${CITY}&node=${encodeURIComponent(RR_NAGAR_AREA_NODE)}`,
    );
    await page.waitForLoadState('domcontentloaded');
    await declineConsentBannerIfPresent(page);

    const mapContainer = page.locator('.leaflet-container').first();
    await expect(
      mapContainer,
      '#2724 pass 4: the map must mount before it can be panned out of view',
    ).toBeVisible({ timeout: 15_000 });

    const areasRecenter = page.getByTestId('areas-recenter-button');
    const countPill = page.getByTestId('discover-badge').first();
    // Code review (Finding 2, pass 5) — this button is mounted UNCONDITIONALLY
    // in DiscoverMapCanvas.tsx (see its own "THIS BUTTON IS UNCONDITIONAL" /
    // Step 4 comment); only its column position, not its presence, depends on
    // isAreaFirstSelectedAreaState. It is NOT mutually exclusive with
    // areas-recenter-button, so it must be asserted visible and non-colliding
    // below, not skipped behind an `if (isVisible())` that could silently
    // no-op if a future regression hid it.
    const cityRecenter = page.getByTestId('map-recenter-city-button');

    // Pan the map so the selected RR Nagar node leaves the viewport — the
    // precondition for `areas-recenter-button` to render
    // (view.overlays.recenter.visible in buildMapSurfaceModel.tsx).
    const mapBox = await mapContainer.boundingBox();
    expect(mapBox, '#2724 pass 4: the map container needs a real bounding box to be dragged').not.toBeNull();
    const { x: mx, y: my, width: mw, height: mh } = mapBox as NonNullable<typeof mapBox>;
    const cx = mx + mw / 2;
    const cy = my + mh / 2;
    for (let i = 0; i < 6; i += 1) {
      if (await areasRecenter.isVisible().catch(() => false)) break;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + 350, cy + 350, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(300);
    }
    await expect(
      areasRecenter,
      '#2724 pass 4: setup precondition — panning the selected RR Nagar node out of view must surface the area-recenter button, or nothing below proves anything about it',
    ).toBeVisible({ timeout: 10_000 });

    // --- Real, unforced geometry first ---
    const realBox = await areasRecenter.boundingBox();
    const realPillBox = await countPill.boundingBox();
    expect(realBox, '#2724 pass 4: area-recenter button must have a real bounding box').not.toBeNull();
    expect(realPillBox, '#2724 pass 4: count pill must have a real bounding box').not.toBeNull();
    expect(
      intersects(realBox as BoundingBox, realPillBox as BoundingBox),
      '#2724 pass 4: with the real (short) RR Nagar area name, the area-recenter button must not collide with the count pill',
    ).toBe(false);

    // Code review (Finding 2, pass 5) — "Recenter on <city>" is mounted
    // unconditionally (DiscoverMapCanvas.tsx), not gated behind area-selected
    // state, and the evidence frame parity-after-desktop-1024-area-longname.png
    // shows both buttons visible together. Asserted unconditionally: a silent
    // `if (isVisible())` skip here would let a real regression through.
    await expect(
      cityRecenter,
      '#2724 pass 4: "Recenter on <city>" is mounted unconditionally and must be visible alongside the area-recenter button in this state',
    ).toBeVisible();
    const realCityBox = await cityRecenter.boundingBox();
    expect(realCityBox, '#2724 pass 4: "Recenter on <city>" must have a real bounding box').not.toBeNull();
    expect(
      intersects(realBox as BoundingBox, realCityBox as BoundingBox),
      '#2724 pass 4: with the real (short) RR Nagar area name, the area-recenter button must not collide with "Recenter on <city>"',
    ).toBe(false);

    // --- Forced long area name: the width-cap/clamp regression case ---
    // Mirrors capture-2724-parity.mjs's own technique (see its Finding-3
    // comment): overwrite the already-rendered LABEL's DOM text content
    // directly. Code review (Finding 1, pass 5) — the earlier version set
    // `areasRecenter.textContent` on the BUTTON itself, which deletes the
    // `<span className="line-clamp-2">` child entirely (button.textContent
    // replaces all children with one plain text node), so the forced-long-name
    // step never exercised the 2-line clamp — only the width cap. Targeting
    // the inner <span> instead keeps the clamp element in place. Layout, CSS
    // and the pill's real box are untouched — only this one element's text is
    // synthetic, and it's chosen to be implausibly longer than any real
    // fixture area name so the assertions below are about the CSS cap/clamp
    // holding in general, not about today's specific fixture data.
    const areasRecenterLabel = areasRecenter.locator('span');
    await expect(
      areasRecenterLabel,
      '#2724 pass 4: the area-recenter button must render its label inside a <span>, or forcing a long name below would not exercise the line-clamp',
    ).toHaveCount(1);

    const FORCED_LONG_AREA_NAME =
      'Recenter on Jayaprakash Narayana Extension & Kodihalli Layout Cross';
    await areasRecenterLabel.evaluate((el, text) => {
      el.textContent = text;
    }, FORCED_LONG_AREA_NAME);
    await page.waitForTimeout(200);

    const longBox = await areasRecenter.boundingBox();
    const longPillBox = await countPill.boundingBox();
    expect(longBox, '#2724 pass 4: area-recenter button must still have a real bounding box after the forced long name').not.toBeNull();
    expect(longPillBox, '#2724 pass 4: count pill must still have a real bounding box after the forced long name').not.toBeNull();

    // The width cap must actually be constraining something: the button's
    // rendered width with the forced long name must not exceed the pill's own
    // max-w-[220px] cap (with a small tolerance for border/padding rounding).
    // Without this, a test that only checks "no collision" could pass merely
    // because the (uncapped) button happened not to reach the pill at THIS
    // particular viewport width, not because the cap is doing anything.
    expect(
      (longBox as NonNullable<typeof longBox>).width,
      '#2724 pass 4: the forced long name must not widen the button past its max-w-[220px] cap',
    ).toBeLessThanOrEqual(224);

    // Code review (Finding 1, pass 5) — the height bound is DERIVED from the
    // real rendered line-height/padding/border, not a hard-coded guess, so
    // this assertion actually exercises `line-clamp-2` rather than a number
    // that happened to work once. Without it, an unclamped label that merely
    // stayed narrower than 220px (e.g. if the clamp class were removed but the
    // text still wrapped only 2-3 lines at this width) could pass on width
    // alone while silently growing past its 2-line budget.
    const clampedHeightBound = await areasRecenter.evaluate((el) => {
      const span = el.querySelector('span');
      if (!span) return null;
      const spanStyle = window.getComputedStyle(span);
      const btnStyle = window.getComputedStyle(el);
      const lineHeight = parseFloat(spanStyle.lineHeight);
      const paddingTop = parseFloat(btnStyle.paddingTop);
      const paddingBottom = parseFloat(btnStyle.paddingBottom);
      const borderTop = parseFloat(btnStyle.borderTopWidth);
      const borderBottom = parseFloat(btnStyle.borderBottomWidth);
      if (!Number.isFinite(lineHeight)) return null;
      return 2 * lineHeight + paddingTop + paddingBottom + borderTop + borderBottom;
    });
    expect(
      clampedHeightBound,
      '#2724 pass 4: could not derive a real 2-line height bound from the button\'s own computed line-height/padding/border',
    ).not.toBeNull();
    expect(
      (longBox as NonNullable<typeof longBox>).height,
      '#2724 pass 4: the forced long name must not grow the button past its own 2-line clamp height (derived from real computed styles, +2px rounding tolerance)',
    ).toBeLessThanOrEqual((clampedHeightBound as number) + 2);

    expect(
      intersects(longBox as BoundingBox, longPillBox as BoundingBox),
      '#2724 pass 4: even with a forced long area name, the width-capped/clamped button must not collide with the count pill',
    ).toBe(false);

    // Code review (Finding 2, pass 5) — re-check "Recenter on <city>" after
    // the forced long name too: a wider/taller unclamped button could newly
    // collide with it even if the short-name check above passed.
    const longCityBox = await cityRecenter.boundingBox();
    expect(longCityBox, '#2724 pass 4: "Recenter on <city>" must still have a real bounding box after the forced long name').not.toBeNull();
    expect(
      intersects(longBox as BoundingBox, longCityBox as BoundingBox),
      '#2724 pass 4: even with a forced long area name, the area-recenter button must not collide with "Recenter on <city>"',
    ).toBe(false);

    // The button must stay fully inside the map container even at its
    // longest — a capped-width, clamped-height button that's still
    // bottom-anchored could in principle still grow past the container's own
    // edges if the cap/clamp were on the wrong element.
    const mapBoxAfter = await mapContainer.boundingBox();
    expect(mapBoxAfter, '#2724 pass 4: the map container must still have a real bounding box').not.toBeNull();
    const mb = mapBoxAfter as NonNullable<typeof mapBoxAfter>;
    const lb = longBox as NonNullable<typeof longBox>;
    expect(
      lb.x >= mb.x && lb.y >= mb.y && lb.x + lb.width <= mb.x + mb.width && lb.y + lb.height <= mb.y + mb.height,
      '#2724 pass 4: the area-recenter button, even with a forced long name, must stay fully within the map container',
    ).toBe(true);
  });

  // -------------------------------------------------------------------------
  // J2 — school-radius anon
  // -------------------------------------------------------------------------

  test('J2 — school-radius anon: school URL params trigger school-radius endpoint and render cards', async ({ page }) => {
    const schoolId = assertSchoolFixturePresent('J2');

    // Collect auth errors
    const authErrors: number[] = [];
    page.on('response', (r) => {
      if (r.status() === 401 || r.status() === 403) authErrors.push(r.status());
    });

    // Set up a promise that resolves when the school-radius endpoint is called
    const schoolRadiusResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/school-radius-listings'),
      { timeout: 20_000 },
    );

    await page.goto(
      `/discover?city=${CITY}&schoolId=${encodeURIComponent(schoolId)}` +
        `&radiusKm=${SCHOOL_RADIUS_KM}&journey=school-first`,
    );

    // Wait for either a listing card or the right panel to become stable
    await page.waitForSelector('[data-testid="discover-right-panel"]', { timeout: 15_000 });

    // Wait for the school-radius endpoint to be called
    await schoolRadiusResponsePromise;

    // Wait for listing cards
    await page.waitForSelector('[data-testid="listing-card"]', { timeout: 15_000 });

    const cardCount = await page.locator('[data-testid="listing-card"]').count();
    expect(cardCount, 'J2: at least 1 listing card expected from school-radius endpoint').toBeGreaterThanOrEqual(1);

    // No auth errors — anon path must use public endpoints only
    expect(authErrors, 'J2: unexpected 401/403 responses on anon school-radius journey').toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // J3 — school-first auth
  // -------------------------------------------------------------------------

  test.describe('J3 — school-first auth', () => {
    const brokerEmail = process.env.PLAYWRIGHT_BROKER_EMAIL ?? process.env.BROKER_EMAIL ?? '';
    const brokerPassword = process.env.PLAYWRIGHT_BROKER_PASSWORD ?? process.env.BROKER_PASSWORD ?? '';
    const hasBrokerCreds = Boolean(brokerEmail && brokerPassword);

    // Use broker storageState if the fixture exists (written by global-setup.ts)
    const brokerAuthPath = path.join(__dirname, 'fixtures', 'broker-auth.json');
    const brokerAuthExists = fs.existsSync(brokerAuthPath);

    // Check if the fixture file has REAL content (global-setup may write empty state when creds absent)
    let brokerAuthHasContent = false;
    if (brokerAuthExists) {
      try {
        const fixtureContent = JSON.parse(fs.readFileSync(brokerAuthPath, 'utf-8')) as {
          cookies?: Array<unknown>;
        };
        brokerAuthHasContent = Array.isArray(fixtureContent.cookies) && fixtureContent.cookies.length > 0;
      } catch {
        brokerAuthHasContent = false;
      }
    }

    // Apply storageState only when the file exists AND has real content
    // (global-setup writes empty { cookies: [], origins: [] } when creds absent)
    test.use({
      storageState: brokerAuthHasContent ? brokerAuthPath : undefined,
    });

    test('J3 — authenticated school-radius: listing cards or property markers appear', async ({ page }) => {
      // The credential skip is genuinely environmental and stays. The school-data
      // skip does not — see schoolPrefetchFailure.
      test.skip(!hasBrokerCreds, 'PLAYWRIGHT_BROKER_EMAIL / PLAYWRIGHT_BROKER_PASSWORD not set — J3 skipped');

      const schoolId = assertSchoolFixturePresent('J3');

      // If storageState didn't have real credentials, perform login
      if (!brokerAuthHasContent) {
        await page.goto('/auth');
        await page.waitForLoadState('domcontentloaded');
        await page.locator('#signin-email').waitFor({ state: 'visible', timeout: 15_000 });
        await page.locator('#signin-email').fill(brokerEmail);
        await page.locator('#signin-password').fill(brokerPassword);
        await page
          .locator('button[type="submit"]')
          .filter({ hasText: /sign in/i })
          .first()
          .click();
        await page.waitForURL((url) => !url.pathname.startsWith('/auth'), { timeout: 15_000 });
      }

      // Set up a promise that resolves when the school-radius endpoint is called
      const schoolRadiusResponsePromise = page.waitForResponse(
        (resp) => resp.url().includes('/school-radius-listings'),
        { timeout: 20_000 },
      );

      await page.goto(
        `/discover?city=${CITY}&schoolId=${encodeURIComponent(schoolId)}` +
          `&radiusKm=${SCHOOL_RADIUS_KM}&journey=school-first`,
      );

      // Wait for the right panel
      await page.waitForSelector('[data-testid="discover-right-panel"]', { timeout: 20_000 });

      // Wait for the school-radius endpoint to be called
      await schoolRadiusResponsePromise.catch(() => {}); // handle cache hits or fast responses

      // Authenticated school-radius path uses same public school-radius endpoint as anon path.
      // May show listing cards OR property markers/clusters.
      await expect.poll(
        async () => {
          const cards = await page.locator('[data-testid="listing-card"]').count();
          const markers = await page.locator('[data-testid="property-marker"]').count();
          const clusters = await page.locator('.custom-marker-cluster').count();
          return cards + markers + clusters;
        },
        {
          message: 'J3: at least 1 listing card OR property marker/cluster expected for authenticated school-radius journey',
          timeout: 15_000,
        },
      ).toBeGreaterThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  // J4 — keyword contextual search
  // -------------------------------------------------------------------------

  test(`J4 — keyword search: q=${KEYWORD} filters results; clearing q restores them`, async ({ page }) => {
    // Collect auth errors
    const authErrors: number[] = [];
    page.on('response', (r) => {
      if (r.status() === 401 || r.status() === 403) authErrors.push(r.status());
    });

    // Step 1: Navigate to the RR Nagar AREA without keyword filter.
    // Canonical AREA state is `node=a:<areaKey>`; the legacy `areaKey=` param this
    // test used to send has been ignored by area-first since #2117, so the page
    // never left the city root and no listing card ever rendered. That failure was
    // masked until now by `test.describe.configure({ mode: 'serial' })` above,
    // which stopped this test from ever being reported independently of J1.
    await page.goto(`/discover?city=${CITY}&node=${encodeURIComponent(RR_NAGAR_AREA_NODE)}`);
    await page.waitForSelector('[data-testid="listing-card"]', { timeout: 15_000 });

    const baselineCount = await page.locator('[data-testid="listing-card"]').count();
    // #2427: this was `test.skip(baselineCount < 2, ...)`. RR Nagar carries EXACTLY
    // two LIVE fixture listings, so the old guard sat directly on its own threshold:
    // one listing fewer and J4 would have silently skipped instead of failing. The
    // fixture asserts the same >= 2 at seed time
    // (navigation-hierarchy-fixture-listings-seed.sql:200-203), so a shortfall here
    // can only mean a broken fixture — which must fail loudly, not vanish. The skip
    // was not required by the test architecture; it dates from running against a
    // shared hosted database whose seed could legitimately be stale.
    expect(
      baselineCount,
      'J4: fixture precondition — RR Nagar must expose >= 2 LIVE listing cards before filtering ' +
        '(seeded by navigation-hierarchy-fixture-listings-seed.sql)',
    ).toBeGreaterThanOrEqual(2);

    // Step 2: Apply the keyword filter. Exactly one RR Nagar listing carries this
    // token in its FTS vector — see KEYWORD's derivation above.
    await page.goto(
      `/discover?city=${CITY}&node=${encodeURIComponent(RR_NAGAR_AREA_NODE)}&q=${encodeURIComponent(KEYWORD)}`,
    );

    // Wait for the network to settle after q param fires a new API call
    await page.waitForSelector('[data-testid="listing-card"]', { timeout: 15_000 });
    // Allow a brief network-idle period for the filtered results to stabilise
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {
      // Non-fatal: long-polling connections may prevent networkidle; proceed anyway
    });

    const filteredCount = await page.locator('[data-testid="listing-card"]').count();
    expect(
      filteredCount,
      `J4: filtered results must include at least 1 "${KEYWORD}" listing`,
    ).toBeGreaterThanOrEqual(1);
    // #2427: this was `toBeLessThanOrEqual(baselineCount)`, which equality satisfies —
    // a `q` that filtered NOTHING passed it. RR Nagar's LIVE set contains exactly one
    // listing matching this keyword and at least one that cannot ("... House Two",
    // plus the two agri parcels), so strict narrowing is deterministic here and is
    // what "keyword filtering works" actually means.
    expect(
      filteredCount,
      'J4: filtering must genuinely narrow the result set, not merely avoid inflating it',
    ).toBeLessThan(baselineCount);

    // Step 3: Clear the keyword filter — navigate back without q param
    await page.goto(`/discover?city=${CITY}&node=${encodeURIComponent(RR_NAGAR_AREA_NODE)}`);
    await page.waitForSelector('[data-testid="listing-card"]', { timeout: 15_000 });
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const restoredCount = await page.locator('[data-testid="listing-card"]').count();
    expect(
      restoredCount,
      'J4: restoring (no q) must show at least as many cards as the filtered set',
    ).toBeGreaterThanOrEqual(filteredCount);

    // No auth errors across the entire keyword journey
    expect(authErrors, 'J4: unexpected 401/403 responses on keyword journey').toHaveLength(0);
  });

});
