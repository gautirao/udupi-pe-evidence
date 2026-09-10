/**
 * issue-2454-scope-aware-relaxation-previews.spec.ts
 *
 * Runtime evidence for Issue #2454 (#2018 slice 4) — the zero-result recovery
 * panel's "Change one filter" rows under a committed POLYGON and a committed
 * VIEWPORT, against the real local fixture stack (no mocking):
 *
 *   1. Signed in + POLYGON (drawn through the product entry on desktop; URL-
 *      restored on mobile): rows render with real counts, applying one row
 *      yields EXACTLY the previewed number of listings, and the scope is untouched.
 *   2. Signed in + VIEWPORT: same claims via the public endpoint's viewportScope.
 *   3. Anonymous + POLYGON: NO relaxation rows, and no polygon count request of
 *      any kind leaves the browser — there is no anonymous polygon path.
 *
 * Every arm declares AND proves its auth state (Sign in link oracle), and
 * every negative assertion is preceded by positive proof the flow ran (the
 * zero state is visible / a counted request happened) — see #2419 PR-2's
 * standing lesson in docs/pr-evidence/issue-2419/pr2/HANDOVER.md.
 *
 * Fixture facts (restore-test-fixture.sh, Bangalore): RR Nagar holds four LIVE
 * sale listings at ~12.9315,77.53 priced ₹3.5L / ₹4.2L / ₹5L / ₹7.2L. A ₹3L
 * ceiling is therefore a genuine zero, and PRICE_MAX's first rung (×1.2 → ₹3.6L)
 * is expected to help. The counts asserted below are read from the server,
 * never hard-coded — the claim is parity, not a magic number.
 *
 * Run: PLAYWRIGHT_BASE_URL=http://localhost:<fe> BACKEND_BASE_URL=http://localhost:<be> \
 *      npx playwright test --project=full e2e/issue-2454-scope-aware-relaxation-previews.spec.ts
 */

import { test, expect, type Page, type Response } from '@playwright/test';
import path from 'node:path';

const CITY = 'bangalore';
const AREA_RR_KEY = 'IN|KA|Bengaluru|RR Nagar';
const AREA_RR_NODE = `a:${AREA_RR_KEY}`;
/** Genuine zero for the fixture (cheapest RR Nagar listing is ₹3.5L). */
const ZERO_PRICE_MAX = 300_000;
/**
 * A ~1.8 km² triangle around the RR Nagar listings, in state/url/resultScope.ts's
 * rpoly encoding (`lat:lon;...`, 5dp). Inside the fixture's CITY boundary and
 * far under PolygonGeographicSafetyPolicy's 12 km² ceiling.
 */
const FIXED_RPOLY = '12.92500:77.52000;12.92500:77.54000;12.94000:77.53000';
/** s,w,n,e — the same rectangle-ish extent as a committed VIEWPORT. */
const FIXED_RVP = '12.925,77.52,12.94,77.54';

// Playwright runs from the repo root (playwright.config.ts lives there); ESM specs have no __dirname.
const EVIDENCE_DIR = path.resolve(process.cwd(), 'docs', 'pr-evidence', 'issue-2454');

const POLYGON_PREVIEWS_PATH = '/api/discover/listings/relaxation-previews';
const AREAS_PREVIEWS_PATH = '/api/discover/areas/relaxation-previews';

// ---------------------------------------------------------------------------
// Helpers (auth oracle, consent, draw — patterns reused from
// issue-2016-result-scope-contract.spec.ts where the same DOM/Leaflet quirk applies)
// ---------------------------------------------------------------------------

function urlParam(page: Page, name: string): string | null {
  return new URL(page.url()).searchParams.get(name);
}

const SIGN_IN_LINK = { name: /^sign in$/i } as const;

async function assertSignedIn(page: Page): Promise<void> {
  await expect(
    page.getByRole('link', SIGN_IN_LINK),
    'this arm must run SIGNED IN (e2e/fixtures/user-auth.json) — the Sign in link must be absent',
  ).toHaveCount(0, { timeout: 10_000 });
}

async function assertAnonymous(page: Page): Promise<void> {
  await expect(
    page.getByRole('link', SIGN_IN_LINK),
    'this arm must run ANONYMOUS (empty storageState) — the Sign in link must be visible',
  ).toBeVisible({ timeout: 10_000 });
}

async function declineConsentBannerIfPresent(page: Page): Promise<void> {
  const banner = page.getByTestId('discover-consent-banner');
  if (await banner.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await banner.getByRole('button', { name: /decline/i }).click();
    await expect(banner).not.toBeVisible({ timeout: 5_000 });
  }
}

function committedAreaUrl(): string {
  return `/discover?city=${CITY}&node=${encodeURIComponent(AREA_RR_NODE)}&rscope=areas&rareas=${encodeURIComponent(AREA_RR_KEY)}`;
}

function polygonZeroUrl(rpoly: string): string {
  return (
    `/discover?city=${CITY}&node=${encodeURIComponent(AREA_RR_NODE)}` +
    `&rscope=poly&rpoly=${encodeURIComponent(rpoly)}&rprev=${encodeURIComponent(`areas:${AREA_RR_KEY}`)}` +
    `&priceMax=${ZERO_PRICE_MAX}`
  );
}

function viewportZeroUrl(): string {
  return (
    `/discover?city=${CITY}&node=${encodeURIComponent(AREA_RR_NODE)}` +
    `&rscope=vp&rvp=${encodeURIComponent(FIXED_RVP)}&rprev=${encodeURIComponent(`areas:${AREA_RR_KEY}`)}` +
    `&priceMax=${ZERO_PRICE_MAX}`
  );
}

/** Records every relaxation-preview and listings response, for the parity + guard assertions. */
function recordApi(page: Page) {
  const previews: Array<{ url: string; status: number; body: unknown }> = [];
  const listings: Array<{ url: string; status: number; body: unknown }> = [];
  page.on('response', async (r: Response) => {
    const url = r.url();
    const isPreview = url.includes(POLYGON_PREVIEWS_PATH) || url.includes(AREAS_PREVIEWS_PATH);
    const isListings = /\/api\/discover\/listings\?/.test(url);
    if (!isPreview && !isListings) return;
    const body = await r.json().catch(() => null);
    (isPreview ? previews : listings).push({ url, status: r.status(), body });
  });
  return { previews, listings };
}

/** The first relaxation row's server count, read from the DOM exactly as the shopper sees it. */
async function readFirstRelaxationCount(page: Page): Promise<{ kind: string; count: number }> {
  const block = page.getByTestId('area-zero-recovery-relaxations');
  await expect(block, 'the "Change one filter" block must render with real counts').toBeVisible({ timeout: 15_000 });
  const rows = block.locator('button[data-testid^="area-zero-recovery-relaxation-"]');
  const kind = (await rows.first().getAttribute('data-testid'))!.replace('area-zero-recovery-relaxation-', '');
  const countText = await page.getByTestId(`area-zero-recovery-relaxation-${kind}-count`).textContent();
  const count = Number.parseInt((countText ?? '').trim(), 10);
  expect(Number.isFinite(count) && count > 0, `row count must be a positive integer, got "${countText}"`).toBe(true);
  return { kind, count };
}

/**
 * Apply the first row and prove the shopper gets EXACTLY the previewed number:
 * the listings query the app fetches for the new filter state, under the SAME
 * scope (`/api/discover/listings?...&<scopeParam>=`), must report
 * totalElements === preview count. That query is the slice-2 invariant's other
 * half ("the same predicate builder as the listings query").
 *
 * `assertPanel`: for VIEWPORT the Areas-journey panel substitutes the viewport
 * result set (DiscoverRightPanel `isViewportScope ? viewportListings : …`), so
 * its own summary line is asserted too. For POLYGON there is NO such
 * substitution today — the panel keeps listing the AREA-keyed set (which also
 * excludes agricultural_land) — a pre-existing #2016/#2419 seam recorded on the
 * PR as OWNER DECISION REQUIRED, so the panel line is deliberately not asserted.
 */
async function applyFirstRowAndAssertParity(
  page: Page,
  api: ReturnType<typeof recordApi>,
  scopeParam: 'polygon' | 'viewportScope',
  assertPanel: boolean,
): Promise<{ count: number; kind: string; priceMaxAfter: number }> {
  const { kind, count } = await readFirstRelaxationCount(page);
  const listingsBefore = api.listings.length;
  await page.getByTestId(`area-zero-recovery-relaxation-${kind}`).click();

  await expect
    .poll(
      () => {
        const fresh = api.listings.slice(listingsBefore).filter((l) => l.url.includes(`${scopeParam}=`) && l.status === 200);
        const last = fresh[fresh.length - 1];
        return last ? (last.body as { totalElements?: number }).totalElements : undefined;
      },
      { message: `after applying ${kind}, the listings query for the same ${scopeParam} scope must report the previewed count`, timeout: 20_000 },
    )
    .toBe(count);

  if (assertPanel) {
    await expect(page.getByTestId('area-result-summary-text'), 'the panel must show the previewed number of results').toContainText(
      `${count} verified`,
      { timeout: 15_000 },
    );
    await expect(page.getByTestId('area-zero-result-recovery'), 'the zero state must be gone once results exist').toHaveCount(0);
  }
  // The filters URL domain debounces its write (300ms); read the settled value.
  await expect
    .poll(() => Number(urlParam(page, 'priceMax')), { message: 'the applied row must be written to the URL as the new priceMax', timeout: 5_000 })
    .toBeGreaterThan(ZERO_PRICE_MAX);
  return { count, kind, priceMaxAfter: Number(urlParam(page, 'priceMax')) };
}

/**
 * Project a lat/lon to viewport pixels from the OSM tile grid Leaflet has on
 * screen: any loaded `<img class="leaflet-tile" src=".../{z}/{x}/{y}.png">`
 * pins the Web-Mercator world-pixel origin of that tile to a screen position,
 * and every other point follows from the projection at that zoom. Deterministic
 * and independent of marker rendering — the first evidence run drew a valid
 * polygon at a fraction of the viewport that simply contained no listing, and
 * under a zero-result filter there are no markers to anchor on at all.
 */
async function geoToScreen(page: Page, lat: number, lon: number): Promise<[number, number]> {
  return page.evaluate(
    ([plat, plon]) => {
      const tiles = Array.from(document.querySelectorAll<HTMLImageElement>('img.leaflet-tile'));
      for (const tile of tiles) {
        const m = /\/(\d+)\/(\d+)\/(\d+)(?:@2x)?\.png/.exec(tile.src);
        if (!m) continue;
        const r = tile.getBoundingClientRect();
        if (r.width < 1) continue;
        const z = Number(m[1]);
        const tx = Number(m[2]);
        const ty = Number(m[3]);
        const scale = 256 * 2 ** z;
        const worldX = ((plon + 180) / 360) * scale;
        const latRad = (plat * Math.PI) / 180;
        const worldY = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale;
        // Tiles may render at a non-256 CSS size (retina / fractional zoom): scale by the drawn size.
        const px = r.x + ((worldX - tx * 256) / 256) * r.width;
        const py = r.y + ((worldY - ty * 256) / 256) * r.height;
        return [px, py] as [number, number];
      }
      throw new Error('no loaded OSM tile to project against');
    },
    [lat, lon],
  );
}

/**
 * The fixture's RR Nagar sale listings sit at lat 12.9313–12.9316, lon
 * 77.5289–77.5319. This triangle contains all four with margin (~0.2 km², far
 * under the policy's 12 km² ceiling, inside the CITY boundary).
 */
const DRAW_TRIANGLE: Array<[number, number]> = [
  [12.9335, 77.5265],
  [12.9335, 77.5345],
  [12.929, 77.5305],
];

/**
 * Pan the map with a real pointer drag so that (lat, lon) lands on `target`.
 * The area-fit camera for the fixture's RR Nagar sits north of its own
 * listings (they projected ~430px below the visible map on the first run), so
 * the shopper — and this test — must pan before drawing around them. Done
 * BEFORE arming the draw tool, exactly as a shopper would.
 */
async function panMapSoThat(page: Page, lat: number, lon: number, target: [number, number]): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const [px, py] = await geoToScreen(page, lat, lon);
    const dx = target[0] - px;
    const dy = target[1] - py;
    if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
    // Drag from the target point itself (guaranteed on the map) by (dx, dy), in
    // slow steps with a hold before release: Leaflet applies pointer INERTIA on
    // mouseup, and a fast synthetic drag flung the map ~1,900px past the target
    // on the first attempt.
    console.log(`[panMapSoThat] listings at (${Math.round(px)}, ${Math.round(py)}), dragging by (${Math.round(dx)}, ${Math.round(dy)})`);
    const from: [number, number] = [target[0], target[1]];
    await page.mouse.move(from[0], from[1]);
    await page.mouse.down();
    const steps = 20;
    for (let i = 1; i <= steps; i += 1) {
      await page.mouse.move(from[0] + (dx * i) / steps, from[1] + (dy * i) / steps);
      await page.waitForTimeout(40);
    }
    await page.waitForTimeout(400);
    await page.mouse.up();
    await page.waitForTimeout(900);
  }
  const [px, py] = await geoToScreen(page, lat, lon);
  expect(Math.hypot(target[0] - px, target[1] - py), 'the map must have panned the listings under the drawable region').toBeLessThan(40);
}

/** Copied from issue-2016-result-scope-contract.spec.ts (product entry, verified vertices, close on first). */
async function drawPolygonOnMap(page: Page): Promise<void> {
  await assertSignedIn(page);

  // Bring the fixture's listings into the drawable region first (see panMapSoThat).
  const usableBefore = (await page.getByTestId('discover-map-usable-viewport').boundingBox()) ?? (await page.locator('.leaflet-container').first().boundingBox());
  if (!usableBefore) throw new Error('no map bounding box');
  const panelBefore = await page.getByTestId('discover-areas-journey-panel-shell').boundingBox();
  const drawableWidth = panelBefore && panelBefore.x > usableBefore.x + usableBefore.width / 2 ? panelBefore.x - usableBefore.x : usableBefore.width;
  await panMapSoThat(page, 12.9315, 77.5305, [usableBefore.x + drawableWidth / 2, usableBefore.y + usableBefore.height * 0.55]);

  const drawEntry = page.getByTestId('area-set-draw-area');
  await expect(drawEntry, 'the product-native "Draw search area" entry must render for a committed area').toBeVisible({ timeout: 15_000 });
  await expect(drawEntry).toBeEnabled();
  await drawEntry.click();
  await expect(page.getByTestId('draw-mode-overlay'), 'clicking the entry must enter draw mode').toBeVisible({ timeout: 10_000 });

  const usable = page.getByTestId('discover-map-usable-viewport');
  const fullBox = (await usable.boundingBox()) ?? (await page.locator('.leaflet-container').first().boundingBox());
  if (!fullBox) throw new Error('no map bounding box');
  const panelBox = await page.getByTestId('discover-areas-journey-panel-shell').boundingBox();
  let mapBox = { ...fullBox };
  if (panelBox) {
    const overlapLeft = Math.max(fullBox.x, panelBox.x);
    const overlapRight = Math.min(fullBox.x + fullBox.width, panelBox.x + panelBox.width);
    if (overlapRight - overlapLeft > 0) {
      const panelIsRight = panelBox.x > fullBox.x + fullBox.width / 2;
      mapBox = panelIsRight
        ? { ...fullBox, width: panelBox.x - fullBox.x }
        : { ...fullBox, x: panelBox.x + panelBox.width, width: fullBox.x + fullBox.width - (panelBox.x + panelBox.width) };
    }
  }
  if (mapBox.width < 200) throw new Error(`drawable map region too narrow (${mapBox.width}px)`);

  const hitAt = async (px: number, py: number): Promise<string> =>
    page.evaluate(
      ([hx, hy]) => {
        const el = document.elementFromPoint(hx, hy);
        if (!el) return 'nothing';
        return `${el.tagName.toLowerCase()}.${Array.from(el.classList).join('.')}`;
      },
      [px, py],
    );
  const findDrawablePoint = async (px: number, py: number): Promise<[number, number]> => {
    const bottom = mapBox.y + mapBox.height - 24;
    for (let cy = py; cy <= bottom; cy += 24) {
      if ((await hitAt(px, cy)).includes('leaflet')) return [px, cy];
    }
    throw new Error(`no Leaflet surface below (${Math.round(px)}, ${Math.round(py)})`);
  };

  await page.addStyleTag({
    content: '.leaflet-marker-pane, .leaflet-overlay-pane, .leaflet-tooltip-pane, .leaflet-draw-tooltip { pointer-events: none !important; }',
  });

  // Project the geographic triangle around the fixture listings onto the screen.
  // Every vertex must land on the drawable map region; if the area-fit camera
  // put the listings under the panel or off-screen this fails loudly rather
  // than drawing somewhere else.
  const vertices: Array<[number, number]> = [];
  for (const [lat, lon] of DRAW_TRIANGLE) {
    const [px, py] = await geoToScreen(page, lat, lon);
    const inside = px > mapBox.x + 8 && px < mapBox.x + mapBox.width - 8 && py > mapBox.y + 8 && py < mapBox.y + mapBox.height - 8;
    console.log(`[drawPolygonOnMap] (${lat}, ${lon}) -> (${Math.round(px)}, ${Math.round(py)}) inside=${inside} hits: ${await hitAt(px, py)}`);
    expect(inside, `vertex (${lat}, ${lon}) must project inside the drawable map region ${JSON.stringify(mapBox)}`).toBe(true);
    vertices.push(await findDrawablePoint(px, py));
  }
  const vertexHandles = page.locator('.leaflet-editing-icon');
  for (let i = 0; i < vertices.length; i += 1) {
    const [x, y] = vertices[i];
    let placed = false;
    for (let attempt = 0; attempt < 3 && !placed; attempt += 1) {
      await page.mouse.move(x, y);
      await page.waitForTimeout(120);
      await page.mouse.click(x, y);
      placed = await vertexHandles.nth(i).waitFor({ state: 'attached', timeout: 2_000 }).then(() => true).catch(() => false);
    }
    expect(placed, `vertex ${i + 1} never registered`).toBe(true);
  }
  const [firstX, firstY] = vertices[0];
  await page.mouse.move(firstX, firstY);
  await page.waitForTimeout(120);
  await page.mouse.click(firstX, firstY);
}

/** Scroll a block into the viewport for the screenshot; tolerant of a React re-mount mid-scroll. */
async function scrollIntoViewSafe(page: Page, testId: string): Promise<void> {
  await expect(page.getByTestId(testId)).toBeVisible({ timeout: 10_000 });
  await page
    .getByTestId(testId)
    .evaluate((el) => el.scrollIntoView({ block: 'center' }))
    .catch(() => undefined);
  await page.waitForTimeout(400);
}
const scrollRelaxationsIntoView = (page: Page) => scrollIntoViewSafe(page, 'area-zero-recovery-relaxations');
const scrollRecoveryIntoView = (page: Page) => scrollIntoViewSafe(page, 'area-zero-result-recovery');

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(EVIDENCE_DIR, `${name}.png`), fullPage: false });
}

// ---------------------------------------------------------------------------
// Desktop 1366×768
// ---------------------------------------------------------------------------

test.describe('#2454 desktop 1366x768', () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test.describe('signed-in shopper', () => {
    test.use({ storageState: 'e2e/fixtures/user-auth.json' });

    test('POLYGON drawn through the product entry: zero state offers real counts; applying one yields exactly that many', async ({ page }) => {
      const api = recordApi(page);

      // 1. Committed AREA_SET → draw → confirm replace → POLYGON committed (the real entry path).
      await page.goto(committedAreaUrl());
      await page.waitForLoadState('domcontentloaded');
      await declineConsentBannerIfPresent(page);
      await drawPolygonOnMap(page);
      const dialog = page.getByRole('alertdialog');
      await expect(dialog, 'J3.3 replace-confirmation must open').toBeVisible({ timeout: 10_000 });
      await dialog.getByRole('button', { name: 'Replace and search' }).click();
      await expect.poll(() => urlParam(page, 'rscope'), { timeout: 10_000 }).toBe('poly');
      const rpoly = urlParam(page, 'rpoly');
      expect(rpoly).not.toBeNull();

      // 2. A genuine zero under the drawn area: the ₹3L ceiling, via the app's own URL filter contract.
      await page.goto(`${page.url()}&priceMax=${ZERO_PRICE_MAX}`);
      await page.waitForLoadState('domcontentloaded');
      await declineConsentBannerIfPresent(page);
      await assertSignedIn(page);
      await expect(page.getByTestId('area-zero-recovery-heading')).toContainText('inside your drawn area', { timeout: 20_000 });
      await expect(page.getByTestId('area-zero-recovery-scope-line')).toContainText('Drawn area');

      // 3. The counts came from the AUTHENTICATED polygon endpoint, for THIS polygon.
      await expect
        .poll(() => api.previews.filter((p) => p.url.includes(POLYGON_PREVIEWS_PATH) && p.status === 200).length, {
          message: 'a polygon relaxation-previews request must have succeeded',
          timeout: 15_000,
        })
        .toBeGreaterThan(0);
      const reply = api.previews.filter((p) => p.url.includes(POLYGON_PREVIEWS_PATH) && p.status === 200).at(-1)!;
      expect((reply.body as { scopeKind: string }).scopeKind).toBe('POLYGON');
      expect(api.previews.filter((p) => p.url.includes(AREAS_PREVIEWS_PATH) && p.url.includes('polygon=')).length,
        'the anonymous endpoint must never be asked with a polygon').toBe(0);

      const { count } = await readFirstRelaxationCount(page);
      expect((reply.body as { previews: Array<{ resultingCount: number }> }).previews[0].resultingCount, 'DOM count is the server count, verbatim').toBe(count);

      // Kit order (EPZero L290-342): scope actions directly under the banner, then the rows.
      const order = await page.getByTestId('area-zero-result-recovery').evaluate((el) =>
        Array.from(el.querySelectorAll('[data-testid="area-zero-recovery-scope-actions"], [data-testid="area-zero-recovery-relaxations"]')).map((n) => n.getAttribute('data-testid')),
      );
      expect(order).toEqual(['area-zero-recovery-scope-actions', 'area-zero-recovery-relaxations']);
      await expect(page.getByTestId('area-zero-recovery-relaxations')).toContainText('Your drawn area stays exactly as it is.');
      await scrollRecoveryIntoView(page);
      await shot(page, 'desktop-1366x768-signed-in-polygon-zero-relaxation-rows');

      // 4. Apply → exactly the previewed number from the polygon listings query, same polygon, scope untouched.
      const applied = await applyFirstRowAndAssertParity(page, api, 'polygon', false);
      expect(urlParam(page, 'rscope'), 'applying a row must not change the scope kind').toBe('poly');
      expect(urlParam(page, 'rpoly'), 'applying a row must not change the polygon').toBe(rpoly);
      expect(applied.priceMaxAfter, 'exactly one filter changed').toBeGreaterThan(ZERO_PRICE_MAX);
      await page.waitForTimeout(1_500);
      // What the PANEL shows after apply is the pre-existing area-keyed list (see
      // applyFirstRowAndAssertParity's doc) — captured as-is, deliberately.
      await scrollRecoveryIntoView(page).catch(() => undefined);
      await shot(page, 'desktop-1366x768-signed-in-polygon-row-applied');
      console.log(`[2454] desktop POLYGON: previewed ${count}, polygon listings query after apply ${applied.count} (priceMax → ${applied.priceMaxAfter})`);
    });

    test('VIEWPORT: zero state offers real counts from the public endpoint; applying one yields exactly that many', async ({ page }) => {
      const api = recordApi(page);
      await page.goto(viewportZeroUrl());
      await page.waitForLoadState('domcontentloaded');
      await declineConsentBannerIfPresent(page);
      await assertSignedIn(page);
      await expect(page.getByTestId('area-zero-recovery-heading')).toContainText('in the visible map area', { timeout: 20_000 });
      await expect(page.getByTestId('area-zero-recovery-scope-line')).toContainText('Visible map area');

      await expect
        .poll(() => api.previews.filter((p) => p.url.includes(AREAS_PREVIEWS_PATH) && p.url.includes('viewportScope=') && p.status === 200).length, {
          message: 'a viewportScope relaxation-previews request must have succeeded',
          timeout: 15_000,
        })
        .toBeGreaterThan(0);
      const reply = api.previews.filter((p) => p.url.includes(AREAS_PREVIEWS_PATH) && p.url.includes('viewportScope=') && p.status === 200).at(-1)!;
      expect((reply.body as { scopeKind: string }).scopeKind).toBe('VIEWPORT');
      expect(reply.url.includes('areaKeys='), 'a VIEWPORT request carries no area keys').toBe(false);

      const { count } = await readFirstRelaxationCount(page);
      expect((reply.body as { previews: Array<{ resultingCount: number }> }).previews[0].resultingCount).toBe(count);
      await expect(page.getByTestId('area-zero-recovery-relaxations')).toContainText('The visible map area stays exactly as it is.');
      await scrollRecoveryIntoView(page);
      await shot(page, 'desktop-1366x768-signed-in-viewport-zero-relaxation-rows');

      const applied = await applyFirstRowAndAssertParity(page, api, 'viewportScope', true);
      expect(urlParam(page, 'rscope')).toBe('vp');
      expect(urlParam(page, 'rvp')).toBe(FIXED_RVP);
      await shot(page, 'desktop-1366x768-signed-in-viewport-row-applied');
      console.log(`[2454] desktop VIEWPORT: previewed ${count}, got ${applied.count} (priceMax → ${applied.priceMaxAfter})`);
    });
  });

  test.describe('anonymous shopper', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('POLYGON: the zero state renders with NO relaxation rows and no polygon count request of any kind', async ({ page }) => {
      const api = recordApi(page);
      await page.goto(polygonZeroUrl(FIXED_RPOLY));
      await page.waitForLoadState('domcontentloaded');
      await declineConsentBannerIfPresent(page);
      await assertAnonymous(page);

      // Positive proof the flow ran: the POLYGON zero state is on screen.
      await expect(page.getByTestId('area-zero-recovery-heading')).toContainText('inside your drawn area', { timeout: 20_000 });
      await expect(page.getByTestId('area-zero-recovery-clear-filters')).toBeVisible();
      // Give any (wrongly) enabled query ample time to fire before asserting silence.
      await page.waitForTimeout(3_000);

      await expect(page.getByTestId('area-zero-recovery-relaxations')).toHaveCount(0);
      expect(api.previews.filter((p) => p.url.includes(POLYGON_PREVIEWS_PATH)).length, 'no authenticated polygon request may leave an anonymous browser').toBe(0);
      expect(api.previews.filter((p) => p.url.includes('polygon=')).length, 'no request carrying a polygon may reach ANY relaxation endpoint anonymously').toBe(0);
      await scrollRecoveryIntoView(page);
      await shot(page, 'desktop-1366x768-anonymous-polygon-zero-no-relaxation-rows');
    });
  });
});

// ---------------------------------------------------------------------------
// Mobile 390×844 — same claims on the list-first mobile shell. The polygon is
// URL-restored here (the identical rpoly contract a drawn polygon is persisted
// through, proven by issue-2016 item 3b); drawing by touch is #2419's evidence.
// ---------------------------------------------------------------------------

test.describe('#2454 mobile 390x844', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test.describe('signed-in shopper', () => {
    test.use({ storageState: 'e2e/fixtures/user-auth.json' });

    test('POLYGON (URL-restored): rows with real counts; applying one yields exactly that many', async ({ page }) => {
      const api = recordApi(page);
      await page.goto(polygonZeroUrl(FIXED_RPOLY));
      await page.waitForLoadState('domcontentloaded');
      await declineConsentBannerIfPresent(page);
      await assertSignedIn(page);
      await expect(page.getByTestId('area-zero-recovery-heading')).toContainText('inside your drawn area', { timeout: 20_000 });
      await expect
        .poll(() => api.previews.filter((p) => p.url.includes(POLYGON_PREVIEWS_PATH) && p.status === 200).length, { timeout: 15_000 })
        .toBeGreaterThan(0);
      const { count } = await readFirstRelaxationCount(page);
      await scrollRelaxationsIntoView(page);
      await shot(page, 'mobile-390x844-signed-in-polygon-zero-relaxation-rows');
      const applied = await applyFirstRowAndAssertParity(page, api, 'polygon', false);
      expect(urlParam(page, 'rscope')).toBe('poly');
      await page.waitForTimeout(1_500);
      await scrollRecoveryIntoView(page).catch(() => undefined);
      await shot(page, 'mobile-390x844-signed-in-polygon-row-applied');
      console.log(`[2454] mobile POLYGON: previewed ${count}, polygon listings query after apply ${applied.count} (priceMax → ${applied.priceMaxAfter})`);
    });

    test('VIEWPORT: rows with real counts; applying one yields exactly that many', async ({ page }) => {
      const api = recordApi(page);
      await page.goto(viewportZeroUrl());
      await page.waitForLoadState('domcontentloaded');
      await declineConsentBannerIfPresent(page);
      await assertSignedIn(page);
      await expect(page.getByTestId('area-zero-recovery-heading')).toContainText('in the visible map area', { timeout: 20_000 });
      const { count } = await readFirstRelaxationCount(page);
      await scrollRelaxationsIntoView(page);
      await shot(page, 'mobile-390x844-signed-in-viewport-zero-relaxation-rows');
      const applied = await applyFirstRowAndAssertParity(page, api, 'viewportScope', true);
      expect(urlParam(page, 'rscope')).toBe('vp');
      await shot(page, 'mobile-390x844-signed-in-viewport-row-applied');
      console.log(`[2454] mobile VIEWPORT: previewed ${count}, got ${applied.count} (priceMax → ${applied.priceMaxAfter})`);
    });
  });

  test.describe('anonymous shopper', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('POLYGON: zero state with NO relaxation rows and no polygon count request', async ({ page }) => {
      const api = recordApi(page);
      await page.goto(polygonZeroUrl(FIXED_RPOLY));
      await page.waitForLoadState('domcontentloaded');
      await declineConsentBannerIfPresent(page);
      await assertAnonymous(page);
      await expect(page.getByTestId('area-zero-recovery-heading')).toContainText('inside your drawn area', { timeout: 20_000 });
      await page.waitForTimeout(3_000);
      await expect(page.getByTestId('area-zero-recovery-relaxations')).toHaveCount(0);
      expect(api.previews.filter((p) => p.url.includes(POLYGON_PREVIEWS_PATH)).length).toBe(0);
      expect(api.previews.filter((p) => p.url.includes('polygon=')).length).toBe(0);
      await scrollRecoveryIntoView(page);
      await shot(page, 'mobile-390x844-anonymous-polygon-zero-no-relaxation-rows');
    });
  });
});
