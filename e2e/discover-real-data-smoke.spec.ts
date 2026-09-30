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
   * Issue #2748 — supersedes the former #2724 "centered anon zoom-past-threshold
   * prompt" test. On the Areas journey (this file's `CITY` lands there by
   * default) that centered `map-anon-zoom-prompt` no longer renders at all: its
   * anonymous-guidance role is now owned by the Map Info Dock's guidance row
   * (`map-info-dock-guidance`), bottom-anchored, never over the map centre — so
   * the marker-occlusion regression class #2724 fixed cannot recur by
   * construction (the dock never sits where markers render). This test keeps
   * #2724's actual invariant — the guidance text's own "sign in" link must stay
   * genuinely clickable — against the new dock instead.
   */
  test('#2748 — the Map Info Dock guidance shows for anon city landing and its "sign in" link is genuinely clickable', async ({
    page,
  }) => {
    await page.goto(`/discover?city=${CITY}`);
    await page.waitForLoadState('domcontentloaded');
    await expect(
      page.locator('.leaflet-control-zoom-in'),
      '#2748: the Discover map (and its zoom control) must mount at the city root',
    ).toBeVisible({ timeout: 15_000 });
    await declineConsentBannerIfPresent(page);

    // #2748 AC — the centered legacy prompt must be gone entirely for this journey.
    await expect(page.getByTestId('map-anon-zoom-prompt')).toHaveCount(0);

    const dock = page.getByTestId('map-info-dock');
    await expect(dock, '#2748: the Map Info Dock must render for anon city landing').toBeVisible({
      timeout: 15_000,
    });
    const guidance = page.getByTestId('map-info-dock-guidance');
    await expect(
      guidance,
      '#2748: anon + no area selected yet must show the guidance row',
    ).toBeVisible();

    const signIn = guidance.getByRole('link', { name: 'sign in' });
    await expect(signIn).toBeVisible();
    // The guidance copy can wrap "sign in" onto its own line at some widths —
    // `boundingBox()` returns the UNION of every line fragment for an inline
    // element split across lines, whose centre can land in the gap BETWEEN
    // lines (on the parent div, not the link). `getClientRects()[0]` is the
    // first real line-fragment rect, guaranteed to be actual link pixels.
    const linkRect = await signIn.evaluate((el) => {
      const r = el.getClientRects()[0];
      return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
    });
    expect(linkRect, '#2748: the sign-in link must have a real client rect').not.toBeNull();
    const { x: lx, y: ly } = {
      x: (linkRect as NonNullable<typeof linkRect>).x + (linkRect as NonNullable<typeof linkRect>).width / 2,
      y: (linkRect as NonNullable<typeof linkRect>).y + (linkRect as NonNullable<typeof linkRect>).height / 2,
    };
    const linkIsHittable = await page.evaluate(
      ([px, py]) =>
        Boolean(
          (document.elementFromPoint(px as number, py as number) as Element | null)?.closest('a[href*="/auth"]'),
        ),
      [lx, ly],
    );
    expect(
      linkIsHittable,
      '#2748: the "sign in" link must be the real hit-test target at its own coordinates',
    ).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Issue #2724 (pass 4, code review) — desktop area-selected pairing: the
  // portalled "Recenter on <area>" button must never collide with the count
  // pill or with "Recenter on <city>", including a long area name.
  // -------------------------------------------------------------------------

  /**
   * Issue #2748 — supersedes the former "#2724 pass 4" test, which asserted
   * (as legacy-duplicate coverage, per the design-consolidation issue) that
   * BOTH `areas-recenter-button` and `map-recenter-city-button` were visible
   * together once the selected node panned off-screen. That duplicate-recenter
   * behaviour is exactly what #2748 removes: this test instead asserts the
   * new "exactly one Recenter on <current node>" contract holds — both
   * legacy buttons gone, one dock recenter, unconditionally present, labelled
   * with the RR Nagar area name, with no pan-off-screen precondition needed
   * (the dock recenter is no longer gated on out-of-view).
   */
  test('#2748 — exactly one recenter exists for a selected area, and the legacy dual-recenter buttons are both gone', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto(
      `/discover?city=${CITY}&node=${encodeURIComponent(RR_NAGAR_AREA_NODE)}`,
    );
    await page.waitForLoadState('domcontentloaded');
    await declineConsentBannerIfPresent(page);

    const mapContainer = page.locator('.leaflet-container').first();
    await expect(mapContainer, '#2748: the map must mount').toBeVisible({ timeout: 15_000 });

    await expect(page.getByTestId('areas-recenter-button')).toHaveCount(0);
    await expect(page.getByTestId('map-recenter-city-button')).toHaveCount(0);

    const dockRecenter = page.getByTestId('map-info-dock-recenter');
    await expect(dockRecenter, '#2748: the dock recenter row must be visible').toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByRole('button', { name: /^Recenter on /i }),
      '#2748: exactly one "Recenter on <context>" control must exist',
    ).toHaveCount(1);
    await expect(dockRecenter).toHaveAccessibleName('Recenter on RR Nagar');

    // The recenter must stay inside the map container (no clamp regression).
    const dockBox = await dockRecenter.boundingBox();
    const mapBox = await mapContainer.boundingBox();
    expect(dockBox, '#2748: dock recenter must have a real bounding box').not.toBeNull();
    expect(mapBox, '#2748: map container must have a real bounding box').not.toBeNull();
    const db = dockBox as NonNullable<typeof dockBox>;
    const mb = mapBox as NonNullable<typeof mapBox>;
    expect(
      db.x >= mb.x && db.y >= mb.y && db.x + db.width <= mb.x + mb.width && db.y + db.height <= mb.y + mb.height,
      '#2748: the dock recenter must stay fully within the map container',
    ).toBe(true);

    // A real click must move the camera back (URL bbox/camera state changes),
    // matching the old test's "the recenter actually works" intent.
    const urlBefore = page.url();
    await dockRecenter.click();
    await expect
      .poll(() => page.url(), {
        message: '#2748: clicking the dock recenter must change the app URL/camera state',
        timeout: 10_000,
      })
      .not.toBe(urlBefore);
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
  // #2766 — desktop (>=1366, reskin active) School-selected: exactly ONE legend
  // -------------------------------------------------------------------------

  test.describe('#2766 — desktop school-selected legend', () => {
    test.use({ viewport: { width: 1400, height: 900 } });

    test('#2766 — school-selected desktop renders exactly one school-radius legend', async ({ page }) => {
      const schoolId = assertSchoolFixturePresent('#2766');

      await page.goto(
        `/discover?city=${CITY}&schoolId=${encodeURIComponent(schoolId)}` +
          `&radiusKm=${SCHOOL_RADIUS_KM}&journey=school-first`,
      );

      await page.waitForSelector('[data-testid="discover-right-panel"]', { timeout: 15_000 });
      // Homes loaded => the School-selected map chrome has fully settled.
      await page.waitForSelector('[data-testid="listing-card"]', { timeout: 15_000 });

      const legend = page.getByTestId('school-radius-legend');
      await expect(legend).toHaveCount(1);
      await expect(legend).toBeVisible();
    });
  });

  // -------------------------------------------------------------------------
  // #2762 — mobile (390x844) School-selected map: the inline school-radius
  // legend must not sit on top of the Map Info Dock's "Recenter on <school>" row
  // -------------------------------------------------------------------------

  test.describe('#2762 — mobile school-selected map legend/dock', () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    /** Open the mobile School-selected Map and wait for the dock + radius legend. */
    async function openMobileSchoolMap(page: Page, journey: string, radiusKm: number = SCHOOL_RADIUS_KM) {
      const schoolId = assertSchoolFixturePresent(journey);
      await page.goto(
        `/discover?city=${CITY}&schoolId=${encodeURIComponent(schoolId)}` +
          `&radiusKm=${radiusKm}&journey=school-first`,
      );
      const mapTrigger = page.getByTestId('control-bar-map-trigger');
      await expect(mapTrigger).toBeVisible({ timeout: 15_000 });
      await mapTrigger.tap();
      const dock = page.getByTestId('map-info-dock');
      const radiusLegend = page.getByTestId('school-radius-legend');
      await expect(dock).toBeVisible({ timeout: 15_000 });
      await expect(radiusLegend).toBeVisible({ timeout: 15_000 });
      return { dock, radiusLegend };
    }

    async function boxOf(locator: Locator, what: string): Promise<BoundingBox> {
      const box = await locator.boundingBox();
      expect(box, `#2762: ${what} must have a bounding box`).not.toBeNull();
      return box as BoundingBox;
    }

    /** The dock's recenter control must stay visible and topmost at its centre. */
    async function expectRecenterUncovered(dock: Locator): Promise<void> {
      const recenter = dock.getByRole('button', { name: /^Recenter on / });
      await expect(recenter).toBeVisible();
      const rb = await boxOf(recenter, 'the dock recenter button');
      const centreHit = await recenter.evaluate((el, [cx, cy]) => {
        const hit = document.elementFromPoint(cx, cy);
        return hit !== null && el.contains(hit);
      }, [rb.x + rb.width / 2, rb.y + rb.height / 2]);
      expect(centreHit, '#2762: the centre of the dock recenter button must not be covered by another element').toBe(true);
    }

    test('#2762 — mobile school-selected: school-radius legend does not overlap the Map Info Dock', async ({ page }) => {
      const { dock, radiusLegend } = await openMobileSchoolMap(page, '#2762 mobile');
      await expectRecenterUncovered(dock);

      const dockBox = await boxOf(dock, 'the Map Info Dock');
      const legendBox = await boxOf(radiusLegend, 'the school-radius legend');
      expect(
        intersects(dockBox, legendBox),
        `#2762: the school-radius legend ${JSON.stringify(legendBox)} must not intersect the Map Info Dock ${JSON.stringify(dockBox)}`,
      ).toBe(false);
    });

    async function expectZoomedLegendsPairwiseClear(page: Page, journey: string, radiusKm: number): Promise<number> {
      const { dock, radiusLegend } = await openMobileSchoolMap(page, journey, radiusKm);
      const propertyLegend = page.getByLabel('Property type legend');

      // Zoom in until individual homes render (which is what mounts the property-type
      // legend) — asserted visible below so this test can never pass vacuously.
      for (let i = 0; i < 6 && !(await propertyLegend.isVisible()); i += 1) {
        await clickMapZoomIn(page);
        await propertyLegend.waitFor({ state: 'visible', timeout: 2_500 }).catch(() => {
          // Not yet: zoom once more.
        });
      }
      await expect(propertyLegend, '#2762: the property-type legend must be visible (homes on the map)').toBeVisible();
      await expectRecenterUncovered(dock);

      const boxes: Array<[string, BoundingBox]> = [
        ['school-radius legend', await boxOf(radiusLegend, 'the school-radius legend')],
        ['property-type legend', await boxOf(propertyLegend, 'the property-type legend')],
        ['map info dock', await boxOf(dock, 'the Map Info Dock')],
        ['zoom control', await boxOf(page.locator('.leaflet-control-zoom'), 'the Leaflet zoom control')],
      ];
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          expect(
            intersects(boxes[i][1], boxes[j][1]),
            `#2762: ${boxes[i][0]} ${JSON.stringify(boxes[i][1])} must not intersect ${boxes[j][0]} ${JSON.stringify(boxes[j][1])}`,
          ).toBe(false);
        }
      }
      return propertyLegend.locator('p ~ div > div').count();
    }

    test('#2762 — mobile school-selected, homes zoomed in: radius legend, property-type legend, dock and zoom control are pairwise clear', async ({ page }) => {
      await expectZoomedLegendsPairwiseClear(page, '#2762 mobile zoomed', SCHOOL_RADIUS_KM);
    });

    test('#2762 — mobile school-selected, 10 km radius (more property types): legends stay pairwise clear', async ({ page }) => {
      const rows = await expectZoomedLegendsPairwiseClear(page, '#2762 mobile zoomed 10km', 10);
      // Non-vacuous: the height cap only matters once the legend has >= 3 rows.
      expect(rows, '#2762: the 10 km state must show >= 3 property-type rows').toBeGreaterThanOrEqual(3);
    });
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
