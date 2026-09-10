/**
 * issue-2419-mobile-invalid-polygon.spec.ts
 *
 * MOBILE (390x844, touch) acceptance evidence for the INVALID polygon states
 * of Issue #2419 — the one row PR-2 (#2452) recorded as NOT CAPTURED.
 *
 *   A. too-large polygon   -> explicit rejection (polygon_scope_too_broad)
 *                             -> prior scope AND results preserved -> Redraw reachable
 *   B. outside-city polygon -> explicit rejection (polygon_outside_searchable_city)
 *                             -> prior scope AND results preserved -> Redraw reachable
 *   C. Cancel / Undo / finish all reachable during drawing, and the draw-mode
 *      overlay collides with no other map control.
 *
 * Every arm is SIGNED-IN (polygon draw is signed-in-only for MVP — anonymous
 * sessions never send a polygon, so an anonymous run would "prove" a false
 * negative) and starts from the product entry on a committed AREA_SET that
 * really has results (fixture RR Nagar: 6 listings), so "results preserved"
 * is not vacuous.
 *
 * Rejections come from #2420's PolygonGeographicSafetyPolicy (400 with a
 * machine-readable reason). The polygons are chosen in lat/lon against the
 * fixture's ONE VALID Bangalore CITY boundary
 * (scripts/db/fixtures/navigation-hierarchy-fixture-seed.sql:
 *  POLYGON((77.35 12.75, 77.85 12.75, 77.85 13.20, 77.35 13.20, 77.35 12.75)))
 * and projected onto the screen through the loaded OSM tile grid — never
 * guessed as viewport fractions. The vertices actually SENT are re-checked
 * against that boundary from the intercepted request, so a pass proves the
 * server rejected the shape the test meant to draw.
 *
 * Run (own ephemeral fixture stack, ports 5261/8161):
 *   PLAYWRIGHT_BASE_URL=http://localhost:5261 BACKEND_BASE_URL=http://localhost:8161 \
 *     npx playwright test e2e/issue-2419-mobile-invalid-polygon.spec.ts --project=full
 */
import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const CITY = 'bangalore';
const D_SOUTHEAST = 'd:southeast';
const AREA_RR_NAGAR = 'a:IN|KA|Bengaluru|RR Nagar';
const AREA_RR_NAGAR_KEY = 'IN|KA|Bengaluru|RR Nagar';

/** Fixture Bangalore CITY boundary (see docblock). */
const CITY_BOUNDARY = { minLon: 77.35, maxLon: 77.85, minLat: 12.75, maxLat: 13.2 };
/** #2420 PolygonGeographicSafetyPolicy.ABSOLUTE_SIZE_CEILING_M2 */
const SIZE_CEILING_M2 = 12_000_000;

// Debug frames only (test-results/ is gitignored). The acceptance screenshot
// package for #2419 is owned by the manual verification lane, not this spec.
const EVIDENCE_DIR = path.resolve(process.cwd(), 'test-results', 'issue-2419-mobile-invalid');
const VIEWPORT = { width: 390, height: 844 };

type LatLon = [number, number];
type Pt = { x: number; y: number };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function urlParam(page: Page, name: string): string | null {
  return new URL(page.url()).searchParams.get(name);
}

function shot(name: string): string {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  return path.join(EVIDENCE_DIR, `mobile-390x844-${name}.png`);
}

async function declineConsentBannerIfPresent(page: Page): Promise<void> {
  const banner = page.getByTestId('discover-consent-banner');
  if (await banner.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await banner.getByRole('button', { name: /decline/i }).tap();
    await expect(banner).not.toBeVisible({ timeout: 5_000 });
  }
}

async function assertSignedIn(page: Page): Promise<void> {
  await expect(page.getByRole('link', { name: /^sign in$/i }), 'arm must be SIGNED IN (polygon draw is signed-in-only)').toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByTestId('user-menu'), 'signed-in user menu must render').toBeVisible({ timeout: 10_000 });
}

/** Real tap path: city root -> d:southeast -> RR Nagar AREA (Areas journey). */
async function reachCommittedRRNagar(page: Page): Promise<void> {
  await page.goto(`/discover?city=${CITY}`);
  await page.waitForLoadState('domcontentloaded');
  const panelShell = page.getByTestId('discover-areas-journey-panel-shell');
  await expect(panelShell).toBeVisible({ timeout: 15_000 });
  await declineConsentBannerIfPresent(page);
  await assertSignedIn(page);

  const directionCard = panelShell.getByTestId(`navigation-child-card-${D_SOUTHEAST}`);
  await expect(directionCard).toBeVisible({ timeout: 15_000 });
  await directionCard.tap();
  await expect(page).toHaveURL(new RegExp(`node=${encodeURIComponent(D_SOUTHEAST)}`), { timeout: 10_000 });

  const areaCard = panelShell.getByTestId(`navigation-child-card-${AREA_RR_NAGAR}`);
  await expect(areaCard).toBeVisible({ timeout: 15_000 });
  await areaCard.tap();
  await expect.poll(() => urlParam(page, 'rscope'), { timeout: 10_000 }).toBe('areas');
  expect(urlParam(page, 'rareas')).toBe(AREA_RR_NAGAR_KEY);
  await declineConsentBannerIfPresent(page);
}

/** The committed area's own result count, as the list view shows it. */
async function readAreaHeaderCount(page: Page): Promise<string> {
  const header = page.getByTestId('area-header-count');
  await expect(header).toBeVisible({ timeout: 15_000 });
  const text = (await header.innerText()).replace(/\s+/g, ' ').trim();
  expect(text, 'the committed area must have results before drawing, or "preserved" proves nothing').toMatch(/[1-9]\d*/);
  return text;
}

/** Product entry: reveals the map (mobile) and arms draw mode. */
async function armDrawMode(page: Page): Promise<void> {
  const drawEntry = page.getByTestId('area-set-draw-area');
  await expect(drawEntry).toBeVisible({ timeout: 15_000 });
  await expect(drawEntry).toBeEnabled();
  await drawEntry.tap();
  await expect(page.getByTestId('draw-mode-overlay')).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => page.locator('img.leaflet-tile-loaded').count(), { timeout: 20_000 }).toBeGreaterThan(0);
  // Let the area-fit camera settle before any projection.
  await page.waitForTimeout(1_500);
  // Marker / overlay / tooltip panes swallow vertex taps (leaflet-draw's
  // cursor tooltip grows as the shape progresses). Keep them visible, drop
  // their pointer-events. Same recipe as issue-2016-result-scope-contract.
  await page.addStyleTag({
    content: '.leaflet-marker-pane, .leaflet-overlay-pane, .leaflet-tooltip-pane, .leaflet-draw-tooltip { pointer-events: none !important; }',
  });
}

/** Zoom of the loaded OSM tiles (majority vote, so fading tiles do not lie). */
async function tileZoom(page: Page): Promise<number> {
  return page.evaluate(() => {
    const counts = new Map<number, number>();
    document.querySelectorAll<HTMLImageElement>('img.leaflet-tile-loaded').forEach((img) => {
      const m = /\/(\d+)\/(\d+)\/(\d+)\.png/.exec(img.src);
      if (m) counts.set(Number(m[1]), (counts.get(Number(m[1])) ?? 0) + 1);
    });
    let best = -1;
    let bestN = 0;
    counts.forEach((n, z) => { if (n > bestN) { best = z; bestN = n; } });
    return best;
  });
}

/** Project lat/lon to viewport px through a loaded OSM tile (Web Mercator). */
async function geoToScreen(page: Page, [lat, lon]: LatLon, z: number): Promise<Pt> {
  const pt = await page.evaluate(([la, lo, zoom]) => {
    const tiles = Array.from(document.querySelectorAll<HTMLImageElement>('img.leaflet-tile-loaded'));
    for (const img of tiles) {
      const m = /\/(\d+)\/(\d+)\/(\d+)\.png/.exec(img.src);
      if (!m || Number(m[1]) !== zoom) continue;
      const tx = Number(m[2]);
      const ty = Number(m[3]);
      const r = img.getBoundingClientRect();
      if (r.width === 0) continue;
      const n = 2 ** zoom;
      const wx = ((lo + 180) / 360) * n * 256;
      const latRad = (la * Math.PI) / 180;
      const wy = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n * 256;
      const scale = r.width / 256;
      return { x: r.x + (wx - tx * 256) * scale, y: r.y + (wy - ty * 256) * scale };
    }
    return null;
  }, [lat, lon, z] as const);
  if (!pt) throw new Error(`no loaded OSM tile at zoom ${z} to project through`);
  return pt;
}

/** Inverse of geoToScreen — the lat/lon under a viewport pixel. */
async function screenToGeo(page: Page, p: Pt, z: number): Promise<LatLon> {
  const ll = await page.evaluate(([px, py, zoom]) => {
    const tiles = Array.from(document.querySelectorAll<HTMLImageElement>('img.leaflet-tile-loaded'));
    for (const img of tiles) {
      const m = /\/(\d+)\/(\d+)\/(\d+)\.png/.exec(img.src);
      if (!m || Number(m[1]) !== zoom) continue;
      const r = img.getBoundingClientRect();
      if (r.width === 0) continue;
      const n = 2 ** zoom;
      const scale = r.width / 256;
      const wx = Number(m[2]) * 256 + (px - r.x) / scale;
      const wy = Number(m[3]) * 256 + (py - r.y) / scale;
      const lon = (wx / (n * 256)) * 360 - 180;
      const yNorm = 1 - (2 * wy) / (n * 256);
      const lat = (Math.atan(Math.sinh(Math.PI * yNorm)) * 180) / Math.PI;
      return [lat, lon] as [number, number];
    }
    return null;
  }, [p.x, p.y, z] as const);
  if (!ll) throw new Error(`no loaded OSM tile at zoom ${z} to unproject through`);
  return ll;
}

async function tapZoomOutTo(page: Page, targetZoom: number): Promise<void> {
  const zoomOut = page.locator('.leaflet-control-zoom-out');
  await expect(zoomOut, 'Leaflet zoom-out control must be visible on mobile').toBeVisible();
  for (let guard = 0; guard < 6; guard += 1) {
    const z = await tileZoom(page);
    if (z <= targetZoom) break;
    const box = (await zoomOut.boundingBox())!;
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect.poll(() => tileZoom(page), { timeout: 10_000 }).toBe(z - 1);
    await page.waitForTimeout(600);
  }
  expect(await tileZoom(page), 'zoom-out taps must reach the target zoom').toBe(targetZoom);
}

/** Slow pointer drag — a fast synthetic drag triggers Leaflet inertia. */
async function slowPan(page: Page, from: Pt, to: Pt): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  const steps = 20;
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(400);
  await page.mouse.up();
  await page.waitForTimeout(800);
}

async function hitAt(page: Page, p: Pt): Promise<string> {
  return page.evaluate(([x, y]) => {
    const el = document.elementFromPoint(x, y);
    if (!el) return 'nothing';
    const id = el.getAttribute('data-testid');
    return `${el.tagName.toLowerCase()}.${Array.from(el.classList).join('.')}${id ? `[data-testid=${id}]` : ''}`;
  }, [p.x, p.y]);
}

/** Genuine touch taps; each vertex is verified through its editing handle. */
async function placeVertices(page: Page, pts: Pt[], startIndex = 0): Promise<void> {
  const handles = page.locator('.leaflet-editing-icon');
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i];
    const hit = await hitAt(page, p);
    // leaflet-draw's own invisible cursor marker (`leaflet-mouse-marker`) parks
    // where the last tap landed and is the plugin's vertex-adding target, so it
    // is a legitimate hit alongside the bare map surface.
    expect(hit, `vertex ${startIndex + i + 1} at (${Math.round(p.x)},${Math.round(p.y)}) must land on the Leaflet surface, not on chrome — hit: ${hit}`).toMatch(/leaflet-container|leaflet-mouse-marker/);
    let placed = false;
    for (let attempt = 0; attempt < 3 && !placed; attempt += 1) {
      await page.touchscreen.tap(p.x, p.y);
      placed = await handles.nth(startIndex + i).waitFor({ state: 'attached', timeout: 2_000 }).then(() => true).catch(() => false);
    }
    expect(placed, `vertex ${startIndex + i + 1} never registered`).toBe(true);
    await page.waitForTimeout(250);
  }
}

/** Close the ring on the FIRST vertex (the overlay's own instruction; there is no Finish control). */
async function finishOnFirstVertex(page: Page, first: Pt): Promise<void> {
  await page.touchscreen.tap(first.x, first.y);
}

type PolygonProbe = { status: number; error: string | null; polygon: LatLon[] };

/** Every polygon-carrying listings request — the probe-count guard. */
function capturePolygonRequests(page: Page): PolygonProbe[] {
  const seen: PolygonProbe[] = [];
  page.on('response', async (res) => {
    const url = res.url();
    if (!url.includes('/api/discover/listings') || !url.includes('polygon=')) return;
    const raw = new URL(url).searchParams.get('polygon') ?? '[]';
    let error: string | null = null;
    try {
      const body = await res.json();
      error = typeof body?.error === 'string' ? body.error : null;
    } catch {
      /* non-JSON body */
    }
    seen.push({ status: res.status(), error, polygon: JSON.parse(raw) as LatLon[] });
  });
  return seen;
}

/** Spherical-excess-free planar estimate, good to <1% at this scale. */
function approxAreaM2(poly: LatLon[]): number {
  const lat0 = (poly.reduce((s, [la]) => s + la, 0) / poly.length) * (Math.PI / 180);
  const mPerDegLat = 111_320;
  const mPerDegLon = 111_320 * Math.cos(lat0);
  let a = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const [la1, lo1] = poly[i];
    const [la2, lo2] = poly[(i + 1) % poly.length];
    a += lo1 * mPerDegLon * (la2 * mPerDegLat) - lo2 * mPerDegLon * (la1 * mPerDegLat);
  }
  return Math.abs(a) / 2;
}

function insideBoundary([lat, lon]: LatLon): boolean {
  return lat >= CITY_BOUNDARY.minLat && lat <= CITY_BOUNDARY.maxLat && lon >= CITY_BOUNDARY.minLon && lon <= CITY_BOUNDARY.maxLon;
}

/** The map view's own count badge ("N verified properties in <area>"). */
async function readBadge(page: Page): Promise<string> {
  const badge = page.getByTestId('discover-badge');
  await expect(badge).toBeVisible({ timeout: 10_000 });
  return (await badge.innerText()).replace(/\s+/g, ' ').trim();
}

async function markerCount(page: Page): Promise<number> {
  return page.locator('.leaflet-marker-pane .leaflet-marker-icon:not(.leaflet-editing-icon)').count();
}

function scopeSnapshot(page: Page) {
  return { rscope: urlParam(page, 'rscope'), rareas: urlParam(page, 'rareas'), rpoly: urlParam(page, 'rpoly'), node: urlParam(page, 'node') };
}

/**
 * Shared tail for A and B: rejection surfaced -> scope + results preserved
 * -> Redraw reachable -> Cancel -> back to the list with the same count.
 */
async function assertRejectionPreservesScopeAndRedrawWorks(
  page: Page,
  label: 'A-too-broad' | 'B-outside-city',
  expectedError: string,
  probes: PolygonProbe[],
  before: { scope: ReturnType<typeof scopeSnapshot>; headerCount: string; badge: string; markers: number; cameraMoved: boolean },
): Promise<void> {
  const blocked = page.getByTestId('draw-blocked-overlay');
  await expect(blocked, 'an explicit rejection surface must appear').toBeVisible({ timeout: 15_000 });
  // Probe-count guard: the flow really ran, and the server said why.
  await expect.poll(() => probes.filter((p) => p.status === 400).length, { timeout: 10_000 }).toBeGreaterThan(0);
  const rejection = probes.find((p) => p.status === 400);
  expect(rejection?.error, 'rejection reason from #2420').toBe(expectedError);
  await expect(page.getByTestId('draw-blocked-redraw'), 'Redraw must be offered for a policy rejection').toBeVisible();
  await expect(page.getByTestId('draw-mode-overlay')).toHaveCount(0);
  await page.screenshot({ path: shot(`${label}-rejection`) });

  // Prior scope preserved: nothing committed, URL untouched, markers intact.
  expect(scopeSnapshot(page)).toEqual(before.scope);
  expect(urlParam(page, 'rpoly')).toBeNull();
  // The map badge still reports the committed area's own count.
  expect(await readBadge(page), 'map badge must still describe the committed area').toBe(before.badge);
  // Markers are viewport-driven: B pans ~20 km off the area, so its marker is
  // legitimately off-screen there and only the badge + list count can speak.
  if (!before.cameraMoved) expect(await markerCount(page)).toBe(before.markers);

  // Redraw reachable: back to DRAWING with an empty draft.
  await page.getByTestId('draw-blocked-redraw').tap();
  await expect(page.getByTestId('draw-mode-overlay')).toBeVisible({ timeout: 5_000 });
  await expect(blocked).toHaveCount(0);
  await expect(page.locator('.leaflet-editing-icon')).toHaveCount(0);
  await expect(page.getByTestId('draw-mode-undo')).toBeDisabled();
  await page.screenshot({ path: shot(`${label}-redraw-armed`) });

  // Cancel returns to the committed scope; the list still shows the same results.
  await page.getByTestId('draw-mode-cancel').tap();
  await expect(page.getByTestId('draw-mode-overlay')).toHaveCount(0);
  expect(scopeSnapshot(page)).toEqual(before.scope);
  await page.getByTestId('mobile-map-close-list-button').tap();
  await expect
    .poll(async () => (await page.getByTestId('area-header-count').innerText()).replace(/\s+/g, ' ').trim(), { timeout: 10_000 })
    .toBe(before.headerCount);
  await expect(page.getByTestId('area-set-draw-area')).toBeVisible();
  await page.screenshot({ path: shot(`${label}-scope-preserved-list`) });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Issue #2419 — mobile INVALID polygon evidence (390x844, touch, signed-in)', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ storageState: 'e2e/fixtures/user-auth.json', viewport: VIEWPORT, hasTouch: true, isMobile: true });

  test('A. too-large polygon is rejected explicitly; scope and results preserved; Redraw reachable', async ({ page }) => {
    test.setTimeout(120_000);
    const probes = capturePolygonRequests(page);
    await reachCommittedRRNagar(page);
    const headerCount = await readAreaHeaderCount(page);
    await armDrawMode(page);
    const before = { scope: scopeSnapshot(page), headerCount, badge: await readBadge(page), markers: await markerCount(page), cameraMoved: false };
    expect(before.scope.rscope).toBe('areas');
    expect(before.badge).toMatch(/[1-9]\d*/);

    // Zoom out so a >12 km² shape fits between the overlay and the bottom controls.
    await tapZoomOutTo(page, 12);
    const z = await tileZoom(page);
    // ~10.8 km x 7.8 km triangle around RR Nagar (12.93, 77.53): ~42 km², fully inside the city.
    const tri: LatLon[] = [[12.895, 77.48], [12.895, 77.58], [12.965, 77.53]];
    expect(approxAreaM2(tri)).toBeGreaterThan(SIZE_CEILING_M2);
    tri.forEach((v) => expect(insideBoundary(v)).toBe(true));
    const pts = await Promise.all(tri.map((v) => geoToScreen(page, v, z)));
    pts.forEach((p) => {
      expect(p.x, 'vertex must be on-screen').toBeGreaterThan(20);
      expect(p.x).toBeLessThan(VIEWPORT.width - 20);
      expect(p.y, 'vertex must sit below the draw overlay and above the bottom controls').toBeGreaterThan(300);
      expect(p.y).toBeLessThan(690);
    });

    await placeVertices(page, pts);
    await page.screenshot({ path: shot('A-too-broad-drawn') });
    await finishOnFirstVertex(page, pts[0]);

    await assertRejectionPreservesScopeAndRedrawWorks(page, 'A-too-broad', 'polygon_scope_too_broad', probes, before);
    // What was sent is what was meant: large and inside.
    const sent = probes[0].polygon;
    expect(sent.length).toBeGreaterThanOrEqual(3);
    expect(approxAreaM2(sent)).toBeGreaterThan(SIZE_CEILING_M2);
    sent.forEach((v) => expect(insideBoundary(v)).toBe(true));
  });

  test('B. outside-city polygon is rejected explicitly; scope and results preserved; Redraw reachable', async ({ page }) => {
    test.setTimeout(150_000);
    const probes = capturePolygonRequests(page);
    await reachCommittedRRNagar(page);
    const headerCount = await readAreaHeaderCount(page);
    await armDrawMode(page);
    const before = { scope: scopeSnapshot(page), headerCount, badge: await readBadge(page), markers: await markerCount(page), cameraMoved: true };
    expect(before.badge).toMatch(/[1-9]\d*/);

    // The fixture city's south edge (12.75) is ~20 km from RR Nagar. Zoom to
    // 11 (~75 m/px) and pan SLOWLY north-to-south so the strip south of the
    // edge sits in the clear part of the screen.
    await tapZoomOutTo(page, 11);
    let z = await tileZoom(page);
    const edgeBefore = await geoToScreen(page, [CITY_BOUNDARY.minLat, 77.53], z);
    await slowPan(page, { x: 195, y: 620 }, { x: 195, y: 620 - (edgeBefore.y - 400) });
    // Panning must not have added a vertex.
    await expect(page.locator('.leaflet-editing-icon')).toHaveCount(0);
    z = await tileZoom(page);
    const edgeAfter = await geoToScreen(page, [CITY_BOUNDARY.minLat, 77.53], z);
    expect(edgeAfter.y, 'slow pan must have brought the city edge into the clear region (inertia check)').toBeGreaterThan(300);
    expect(edgeAfter.y).toBeLessThan(470);

    // ~3.8 km x 3.3 km triangle wholly south of the boundary: ~6 km² (< ceiling), 0% inside.
    const tri: LatLon[] = [[12.70, 77.51], [12.70, 77.545], [12.73, 77.5275]];
    expect(approxAreaM2(tri)).toBeLessThan(SIZE_CEILING_M2);
    tri.forEach((v) => expect(insideBoundary(v)).toBe(false));
    const pts = await Promise.all(tri.map((v) => geoToScreen(page, v, z)));
    pts.forEach((p) => {
      expect(p.x).toBeGreaterThan(20);
      expect(p.x).toBeLessThan(VIEWPORT.width - 20);
      expect(p.y).toBeGreaterThan(300);
      expect(p.y).toBeLessThan(690);
    });

    await placeVertices(page, pts);
    await page.screenshot({ path: shot('B-outside-city-drawn') });
    await finishOnFirstVertex(page, pts[0]);

    await assertRejectionPreservesScopeAndRedrawWorks(page, 'B-outside-city', 'polygon_outside_searchable_city', probes, before);
    const sent = probes[0].polygon;
    expect(sent.length).toBeGreaterThanOrEqual(3);
    expect(approxAreaM2(sent)).toBeLessThan(SIZE_CEILING_M2);
    sent.forEach((v) => expect(insideBoundary(v)).toBe(false));
  });

  test('C. Cancel, Undo and finish stay reachable while drawing; no map-control collision', async ({ page }) => {
    test.setTimeout(120_000);
    const probes = capturePolygonRequests(page);
    await reachCommittedRRNagar(page);
    await readAreaHeaderCount(page);
    await armDrawMode(page);
    const scopeBefore = scopeSnapshot(page);
    const z = await tileZoom(page);

    // Small local triangle around whatever the area-fit camera centred on
    // (~1.7 km x 1.3 km, valid and inside the city; C is about controls, not policy).
    // Chosen in screen space (the area-fit zoom is ~16, so 140 px is ~300 m) and
    // unprojected only to prove it is a small, in-city shape.
    const pts: Pt[] = [{ x: 125, y: 560 }, { x: 265, y: 560 }, { x: 195, y: 440 }];
    const tri = await Promise.all(pts.map((p) => screenToGeo(page, p, z)));
    console.log(`[C] triangle ${JSON.stringify(tri)} ~${Math.round(approxAreaM2(tri))} m² at tile zoom ${z}`);
    expect(approxAreaM2(tri)).toBeLessThan(SIZE_CEILING_M2);
    tri.forEach((v) => expect(insideBoundary(v)).toBe(true));
    pts.forEach((p) => {
      expect(p.x).toBeGreaterThan(20);
      expect(p.x).toBeLessThan(VIEWPORT.width - 20);
      expect(p.y).toBeGreaterThan(300);
      expect(p.y).toBeLessThan(690);
    });

    const undo = page.getByTestId('draw-mode-undo');
    const cancel = page.getByTestId('draw-mode-cancel');
    await expect(undo).toBeVisible();
    await expect(undo, 'Undo must be disabled with no points').toBeDisabled();
    await expect(cancel).toBeVisible();

    await placeVertices(page, pts.slice(0, 2));
    await expect(undo).toBeEnabled();

    // Reachability: both controls fully inside the viewport, with touch-usable boxes.
    const overlayBox = (await page.getByTestId('draw-mode-overlay').boundingBox())!;
    for (const [name, loc] of [['undo', undo], ['cancel', cancel]] as const) {
      const b = (await loc.boundingBox())!;
      expect(b.x, `${name} on-screen`).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(VIEWPORT.width);
      expect(b.y + b.height).toBeLessThanOrEqual(VIEWPORT.height);
      expect(b.height, `${name} touch height`).toBeGreaterThanOrEqual(32);
      console.log(`[C] ${name} box ${JSON.stringify(b)}`);
    }

    // Collision: the overlay must not intersect any OTHER visible interactive control.
    const collisions = await page.evaluate((ob) => {
      const overlay = document.querySelector('[data-testid="draw-mode-overlay"]');
      const out: string[] = [];
      const intersects = (r: DOMRect) => r.width > 0 && r.height > 0 && r.x < ob.x + ob.width && ob.x < r.x + r.width && r.y < ob.y + ob.height && ob.y < r.y + r.height;
      document.querySelectorAll<HTMLElement>('button, a[href], [role="button"], .leaflet-control, .leaflet-control a').forEach((el) => {
        if (overlay?.contains(el) || el.contains(overlay!)) return;
        const r = el.getBoundingClientRect();
        if (!intersects(r)) return;
        // The list panel sits under the mounted map on mobile: its buttons
        // keep a box but cannot be hit. Only something actually reachable at
        // its own centre can collide with the shopper's draw controls.
        const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        if (!top || !(el === top || el.contains(top))) return;
        out.push(`${el.tagName.toLowerCase()}[data-testid=${el.getAttribute('data-testid')}] ${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)} "${(el.textContent ?? '').trim().slice(0, 30)}"`);
      });
      return out;
    }, overlayBox);
    expect(collisions, `draw overlay must not overlap other controls: ${collisions.join(' | ')}`).toEqual([]);
    // And the map's own controls must not overlap each other.
    const controlBoxes = await page.evaluate(() => {
      const sel = ['.leaflet-control-zoom-in', '.leaflet-control-zoom-out', '[data-testid="areas-recenter-button"]', '[data-testid="discover-badge"]', '[data-testid="mobile-map-close-list-button"]', '[data-testid="area-set-chips"]', '[data-testid="areas-breadcrumb-trail"]', '[data-testid="discover-map-legend"]'];
      const boxes = sel.map((s) => { const el = document.querySelector(s); const r = el?.getBoundingClientRect(); return { s, r: r && r.width > 0 ? { x: r.x, y: r.y, w: r.width, h: r.height } : null }; });
      const overlaps: string[] = [];
      for (let i = 0; i < boxes.length; i += 1) for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i].r; const b = boxes[j].r;
        if (a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) overlaps.push(`${boxes[i].s} x ${boxes[j].s}`);
      }
      return { boxes, overlaps };
    });
    // Logged, not asserted: pre-existing map chrome (legend vs count badge) is
    // outside #2419's owned surfaces — see the PR's deviations table.
    console.log(`[C] control boxes ${JSON.stringify(controlBoxes.boxes)}`);
    console.log(`[C] pre-existing map-chrome overlaps (not #2419 surfaces): ${JSON.stringify(controlBoxes.overlaps)}`);
    await page.screenshot({ path: shot('C-drawing-two-vertices') });

    // Undo removes only the latest point.
    await undo.tap();
    await expect(page.locator('.leaflet-editing-icon')).toHaveCount(1);
    await expect(undo).toBeEnabled();
    await page.screenshot({ path: shot('C-after-undo') });

    // Finish reachable: complete the triangle from the remaining vertex and
    // close on the first one; the product must surface an explicit outcome
    // (valid -> #2016 replace dialog).
    await placeVertices(page, pts.slice(1), 1);
    await finishOnFirstVertex(page, pts[0]);
    await expect.poll(() => probes.length, { message: 'closing on the first vertex must send the polygon for validation', timeout: 15_000 }).toBeGreaterThan(0);
    const dialog = page.getByRole('alertdialog');
    await expect(dialog, 'a valid local polygon reaches the #2016 replace confirmation').toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: shot('C-finish-valid-polygon-dialog-hidden-under-map') });
    // Diagnostics: where the dialog actually is, and what is on top of its buttons.
    const dialogDiag = await page.evaluate(() => {
      const d = document.querySelector('[role="alertdialog"]') as HTMLElement | null;
      if (!d) return null;
      const r = d.getBoundingClientRect();
      const btn = Array.from(d.querySelectorAll('button')).map((b) => {
        const br = b.getBoundingClientRect();
        const top = document.elementFromPoint(br.x + br.width / 2, br.y + br.height / 2);
        return { text: (b.textContent ?? '').trim(), box: { x: Math.round(br.x), y: Math.round(br.y), w: Math.round(br.width), h: Math.round(br.height) }, topAtCentre: top ? `${top.tagName.toLowerCase()}.${Array.from(top.classList).slice(0, 3).join('.')}` : 'none' };
      });
      const chain: string[] = [];
      for (let el: HTMLElement | null = d; el && el !== document.body; el = el.parentElement) {
        const cs = getComputedStyle(el);
        chain.push(`${el.tagName.toLowerCase()}${el.getAttribute('data-testid') ? `[${el.getAttribute('data-testid')}]` : ''}{pos:${cs.position},z:${cs.zIndex},op:${cs.opacity},vis:${cs.visibility},tf:${cs.transform !== 'none' ? 'y' : 'n'}}`);
      }
      const mapChain: string[] = [];
      for (let el: HTMLElement | null = document.querySelector('.leaflet-container'); el && el !== document.body; el = el.parentElement) {
        const cs = getComputedStyle(el);
        if (cs.zIndex !== 'auto' || cs.position === 'fixed') mapChain.push(`${el.tagName.toLowerCase()}${el.getAttribute('data-testid') ? `[${el.getAttribute('data-testid')}]` : ''}.${Array.from(el.classList).filter((c) => /^z-|fixed|absolute|inset/.test(c)).join('.')}{pos:${cs.position},z:${cs.zIndex}}`);
      }
      return { box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, inPanelShell: !!d.closest('[data-testid="discover-areas-journey-panel-shell"]'), inMap: !!d.closest('.leaflet-container'), buttons: btn, dialogChain: chain, mapChain };
    });
    console.log(`[C] replace dialog diag ${JSON.stringify(dialogDiag)}`);

    // #2471: the dialog must be the thing under the shopper's thumb (C3 is
    // the dedicated stacking proof). Keep the prior scope via a real tap.
    await dialog.getByRole('button', { name: 'Keep selected areas' }).tap();
    await expect(dialog).toHaveCount(0, { timeout: 5_000 });
    expect(scopeSnapshot(page)).toEqual(scopeBefore);
    expect(urlParam(page, 'rpoly')).toBeNull();
    await expect(page.getByTestId('draw-mode-overlay')).toHaveCount(0);
  });

  // Issue #2471 (reproduced on this lane, runs 10-11, and visible in PR-2's own
  // impl-mobile-390x844-reviewing-replace-dialog.png — no dialog in frame):
  // finishing a VALID polygon on mobile opened the #2016 replace confirmation
  // (role=alertdialog, fixed z-50, body portal) UNDERNEATH DiscoverPageShell's
  // `fixed inset-0 z-[60]` map wrapper; both buttons were covered by the draft
  // polygon `<path>`. Fixed by portalling the dialog INSIDE the map canvas
  // (MobileClusterSheet precedent). This is the acceptance proof: the button
  // is the topmost element at its own centre, and a genuine tap works.
  test('C3. finishing a valid polygon shows the replace dialog ABOVE the map and its buttons are tappable (#2471)', async ({ page }) => {
    const probes = capturePolygonRequests(page);
    await reachCommittedRRNagar(page);
    await readAreaHeaderCount(page);
    await armDrawMode(page);
    const scopeBefore = scopeSnapshot(page);
    const pts: Pt[] = [{ x: 125, y: 560 }, { x: 265, y: 560 }, { x: 195, y: 440 }];
    await placeVertices(page, pts);
    await finishOnFirstVertex(page, pts[0]);
    await expect.poll(() => probes.length, { timeout: 15_000 }).toBeGreaterThan(0);
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    const keep = dialog.getByRole('button', { name: 'Keep selected areas' });
    const b = (await keep.boundingBox())!;
    const top = await hitAt(page, { x: b.x + b.width / 2, y: b.y + b.height / 2 });
    expect(top, 'the dialog button must be the topmost element at its own centre').toContain('button');
    await keep.tap();
    await expect(dialog).toHaveCount(0);
    expect(scopeSnapshot(page)).toEqual(scopeBefore);
  });

  // REPRODUCED on this lane (run 8): with exactly ONE point placed, "Undo last
  // point" stays enabled but removes nothing — leaflet-draw's
  // Draw.Polyline.deleteLastVertex() returns early when `_markers.length <= 1`,
  // so the product's undo nonce has no effect on the last point. The shopper's
  // only way out is Cancel (which works). Reported on the PR as a usability
  // defect for an owner decision; this test is the acceptance check for the
  // fix and is fixme'd rather than deleted so it cannot be forgotten.
  test.fixme('C2. Undo with a single point removes it and disables Undo (reproduced defect — see PR)', async ({ page }) => {
    await reachCommittedRRNagar(page);
    await readAreaHeaderCount(page);
    await armDrawMode(page);
    await placeVertices(page, [{ x: 195, y: 500 }]);
    const undo = page.getByTestId('draw-mode-undo');
    await expect(undo).toBeEnabled();
    await undo.tap();
    await expect(page.locator('.leaflet-editing-icon')).toHaveCount(0);
    await expect(undo).toBeDisabled();
    await page.getByTestId('draw-mode-cancel').tap();
    await expect(page.getByTestId('draw-mode-overlay')).toHaveCount(0);
  });
});
