/**
 * Discover real-data smoke — Issue #1264.
 *
 * Validates 4 cross-layer journeys against the LIVE backend (no page.route() mocks).
 * Seed data from scripts/seed-discover-listings.mjs must be present before running:
 *   12 LIVE [E2E] listings across Manipal / Malpe / Kaup (4 each).
 *
 * Journeys:
 *   J1  area-first anon       — click area marker → listing cards appear, no 401/403
 *   J2  school-radius anon    — school URL params → school-radius endpoint fires, cards appear
 *   J3  school-first auth     — authenticated school-radius → cards OR property markers appear
 *   J4  keyword contextual    — q=apartment filters results; clearing q restores them
 *
 * Run locally (full project, no stubs):
 *   bash scripts/run-e2e-local.sh --project=full e2e/discover-real-data-smoke.spec.ts
 *
 * Prerequisites:
 *   - PLAYWRIGHT_BASE_URL pointing at a running frontend
 *   - Seed data present (run scripts/seed-discover-listings.mjs first)
 *   - PLAYWRIGHT_BROKER_EMAIL + PLAYWRIGHT_BROKER_PASSWORD set for J3 (else J3 skips)
 */

import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BACKEND =
  process.env.BACKEND_BASE_URL ?? 'https://udupi-property-explorer.onrender.com';

const MANIPAL_AREA_KEY = 'IN|KA|Udupi|Manipal';

// ---------------------------------------------------------------------------
// Canonical Discover navigation nodes (Udupi) — real, backend-confirmed shape.
//
// The legacy `?areaKey=` deep-link param has been deliberately ignored by the
// area-first journey since #2117: the canonical AREA state is `?node=a:<areaKey>`.
// These node keys are the live values returned by
//   GET /api/discover/cities/udupi/navigation/{node}/counts
// (root -> d:n -> a:IN|KA|Udupi|Brahmavar; root -> d:e -> a:IN|KA|Udupi|Manipal).
// ---------------------------------------------------------------------------

/** Direction destination reached from the Udupi city root after one map zoom-in. */
const UDUPI_NORTH_DIRECTION_NODE = 'd:n';
/**
 * AREA child of `d:n`. Both of `d:n`'s AREA children carry real listings
 * (Brahmavar 9, NorthMidTest 2), but Brahmavar is pinned by identity rather
 * than discovered via `.first()`: `[data-testid="area-single-marker"]` DOM order
 * does not track on-screen order for a Leaflet map, so a positional pick could
 * silently drift onto a different area and weaken what this journey proves.
 */
const BRAHMAVAR_AREA_NODE = 'a:IN|KA|Udupi|Brahmavar';
/** AREA child of `d:e` — the seeded Manipal area J4 filters with `q=apartment`. */
const MANIPAL_AREA_NODE = `a:${MANIPAL_AREA_KEY}`;

function urlParam(page: Page, name: string): string | null {
  return new URL(page.url()).searchParams.get(name);
}

function urlZoom(page: Page): number {
  return Number(urlParam(page, 'zoom') ?? 0);
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
async function clickMapZoomIn(page: Page): Promise<void> {
  const btn = page.locator('.leaflet-control-zoom-in');
  await expect(btn, 'the Discover map zoom control must be available').toBeVisible({ timeout: 10_000 });
  const box = await btn.boundingBox();
  if (!box) {
    throw new Error('leaflet zoom-in control has no bounding box');
  }
  const candidates: Array<[number, number]> = [
    [box.x + box.width / 2, box.y + box.height / 2],
    [box.x + box.width - 2, box.y + box.height / 2],
    [box.x + box.width - 2, box.y + 2],
    [box.x + 2, box.y + 2],
  ];
  for (const [x, y] of candidates) {
    const reachable = await page.evaluate(
      ([px, py]) => Boolean((document.elementFromPoint(px, py) as Element | null)?.closest('.leaflet-control-zoom-in')),
      [x, y] as [number, number],
    );
    if (!reachable) continue;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.up();
    return;
  }
  throw new Error('leaflet zoom-in control is fully obscured by a floating overlay');
}

/**
 * Drive the map's own "Zoom in" (+) control until `nodeKey` de-clusters into its
 * own marker, then assert it really rendered.
 *
 * The zoom at which a given marker breaks out of its visual cluster depends on
 * the viewport, so the number of clicks is discovered rather than hard-coded —
 * but every step still waits on deterministic app state (the URL zoom advancing,
 * the marker existing), never on a sleep, and the loop ends in a hard visibility
 * assertion so a marker that never appears fails loudly instead of being skipped.
 */
async function zoomUntilMarkerVisible(
  page: Page,
  testId: string,
  nodeKey: string,
  maxZoomIns = 8,
): Promise<void> {
  const marker = page.locator(`[data-testid="${testId}"][data-node-key="${nodeKey}"]`);
  for (let i = 0; i < maxZoomIns; i += 1) {
    if ((await marker.count()) > 0) break;
    const before = urlZoom(page);
    await clickMapZoomIn(page);
    await expect
      .poll(() => urlZoom(page), {
        message: `the map "Zoom in" control must advance the URL zoom past ${before}`,
        timeout: 10_000,
      })
      .toBeGreaterThan(before);
  }
  await expect(marker, `map marker ${testId}/${nodeKey} must render after zooming in`).toBeVisible({
    timeout: 15_000,
  });
}

async function clickMapMarker(page: Page, testId: string, nodeKey: string): Promise<void> {
  const marker = page.locator(`[data-testid="${testId}"][data-node-key="${nodeKey}"]`);
  await expect(marker, `map marker ${testId}/${nodeKey} must render before it can be clicked`).toBeVisible({
    timeout: 15_000,
  });
  const box = await marker.boundingBox();
  if (!box) {
    throw new Error(`map marker ${testId}/${nodeKey} has no bounding box`);
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

// ---------------------------------------------------------------------------
// J2/J3 school pre-fetch (beforeAll — runs once for the describe block)
// ---------------------------------------------------------------------------

test.describe('Discover real-data smoke', () => {
  // Run tests serially within this block to avoid auth fixture contention under parallel workers.
  // Root cause: J3 (broker auth) and N2 (admin auth) race on shared storageState under 2-worker execution.
  // Serial mode here ensures each auth context settles before the next test begins.
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    try {
      const url =
        `${BACKEND}/api/public/schools/by-area` +
        `?areaKey=${encodeURIComponent(MANIPAL_AREA_KEY)}&page=0&size=1`;
      const res = await fetch(url);
      if (!res.ok) {
        console.log(`[discover-real-data-smoke] school prefetch returned ${res.status} — J2/J3 will skip`);
        return;
      }
      // Response shape: bare array [{ id, name, latitude, longitude, ... }, ...]
      const data = await res.json() as Array<{ id: string; latitude: number; longitude: number }>;
      const first = data?.[0];
      if (first?.id && first.latitude != null && first.longitude != null) {
        schoolData = {
          schoolId: first.id,
          schoolLat: first.latitude,
          schoolLon: first.longitude,
        };
        console.log(`[discover-real-data-smoke] School prefetch OK: id=${first.id} lat=${first.latitude} lon=${first.longitude}`);
      } else {
        console.log('[discover-real-data-smoke] School prefetch: no schools found near Manipal — J2/J3 will skip');
      }
    } catch (err) {
      console.log(`[discover-real-data-smoke] School prefetch threw: ${String(err)} — J2/J3 will skip`);
    }
  });

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

    // Step 0 — city root. Every area is collapsed into one visual cluster here,
    // so there is no AREA/Direction marker to click yet.
    await page.goto('/discover?city=udupi');
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

    // Step 1 — zooming in breaks the single city cluster into Direction destinations.
    // Markers must be waited for after EVERY camera change.
    // Step 2 — activate the North direction destination.
    await zoomUntilMarkerVisible(page, 'area-destination-marker', UDUPI_NORTH_DIRECTION_NODE);
    await clickMapMarker(page, 'area-destination-marker', UDUPI_NORTH_DIRECTION_NODE);
    await expect(page, 'J1: activating a Direction marker must write its canonical node to the URL').toHaveURL(
      new RegExp(`node=${encodeURIComponent(UDUPI_NORTH_DIRECTION_NODE)}`),
      { timeout: 10_000 },
    );

    // Step 3 — activate a real AREA marker inside that direction.
    await zoomUntilMarkerVisible(page, 'area-single-marker', BRAHMAVAR_AREA_NODE);
    await clickMapMarker(page, 'area-single-marker', BRAHMAVAR_AREA_NODE);
    await expect(page, 'J1: activating an AREA marker must write its canonical node to the URL').toHaveURL(
      new RegExp(`node=${encodeURIComponent(BRAHMAVAR_AREA_NODE)}`),
      { timeout: 10_000 },
    );

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
      'J1: at least 1 real listing card expected after activating the Brahmavar AREA marker',
    ).toBeGreaterThanOrEqual(1);

    // No auth errors — anon path must use public endpoints only
    expect(authErrors, 'J1: unexpected 401/403 responses on anon journey').toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // J2 — school-radius anon
  // -------------------------------------------------------------------------

  test('J2 — school-radius anon: school URL params trigger school-radius endpoint and render cards', async ({ page }) => {
    test.skip(schoolData.schoolId === null, 'No school data near Manipal — J2 skipped');

    const { schoolId } = schoolData;

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

    await page.goto(`/discover?city=udupi&schoolId=${encodeURIComponent(schoolId!)}&radiusKm=2&journey=school-first`);

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
      test.skip(!hasBrokerCreds, 'PLAYWRIGHT_BROKER_EMAIL / PLAYWRIGHT_BROKER_PASSWORD not set — J3 skipped');
      test.skip(schoolData.schoolId === null, 'No school data near Manipal — J3 skipped');

      const { schoolId } = schoolData;

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

      await page.goto(`/discover?city=udupi&schoolId=${encodeURIComponent(schoolId!)}&radiusKm=2&journey=school-first`);

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

  test('J4 — keyword search: q=apartment filters results; clearing q restores them', async ({ page }) => {
    // Collect auth errors
    const authErrors: number[] = [];
    page.on('response', (r) => {
      if (r.status() === 401 || r.status() === 403) authErrors.push(r.status());
    });

    // Step 1: Navigate to the Manipal AREA without keyword filter.
    // Canonical AREA state is `node=a:<areaKey>`; the legacy `areaKey=` param this
    // test used to send has been ignored by area-first since #2117, so the page
    // never left the city root and no listing card ever rendered. That failure was
    // masked until now by `test.describe.configure({ mode: 'serial' })` above,
    // which stopped this test from ever being reported independently of J1.
    await page.goto(`/discover?city=udupi&node=${encodeURIComponent(MANIPAL_AREA_NODE)}`);
    await page.waitForSelector('[data-testid="listing-card"]', { timeout: 15_000 });

    const baselineCount = await page.locator('[data-testid="listing-card"]').count();
    test.skip(baselineCount < 2, 'J4: Seed not present or stale — requires >= 2 Manipal listings; run scripts/seed-discover-listings.mjs first');

    // Step 2: Apply keyword filter (seed has 2 apartment listings in Manipal)
    await page.goto(
      `/discover?city=udupi&node=${encodeURIComponent(MANIPAL_AREA_NODE)}&q=apartment`,
    );

    // Wait for the network to settle after q param fires a new API call
    await page.waitForSelector('[data-testid="listing-card"]', { timeout: 15_000 });
    // Allow a brief network-idle period for the filtered results to stabilise
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {
      // Non-fatal: long-polling connections may prevent networkidle; proceed anyway
    });

    const filteredCount = await page.locator('[data-testid="listing-card"]').count();
    expect(filteredCount, 'J4: filtered results must include at least 1 apartment listing').toBeGreaterThanOrEqual(1);
    expect(
      filteredCount,
      'J4: filtering must not inflate result count beyond baseline',
    ).toBeLessThanOrEqual(baselineCount);

    // Step 3: Clear the keyword filter — navigate back without q param
    await page.goto(`/discover?city=udupi&node=${encodeURIComponent(MANIPAL_AREA_NODE)}`);
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
