/**
 * issue-2461-polygon-panel-parity.spec.ts
 *
 * DESKTOP (1366x768, mouse, signed-in) acceptance evidence for Issue #2461:
 * under a COMMITTED POLYGON the AreaSelectedPanel card list must be the SAME
 * result set the canonical polygon query returns — not the AREA-keyed list of
 * the previously-selected area.
 *
 *   1. Draw a polygon (genuine pointer interaction) around fixture RR Nagar's
 *      listings from the product entry on a committed AREA_SET.
 *      -> panel header says "Drawn area"
 *      -> card count == `/api/discover/listings?polygon=` totalElements
 *      -> card prices == that response's prices (identity proxy — every
 *         fixture price in this polygon is distinct)
 *      -> markers == `/api/discover/markers?polygon=` (agri-excluded on the
 *         area-first journey, #1463) — the agri-in-polygon divergence is
 *         RECORDED, not hidden (see the OWNER DECISION comment on the PR).
 *   2. Same drawn polygon + priceMax=300000 (a genuine zero in the fixture)
 *      -> zero-result recovery names the drawn area, relaxation preview says 1
 *      -> apply -> a NEW polygon listings request carries the relaxed filter
 *         and the panel shows exactly that response (count 1).
 *
 * Every arm is SIGNED-IN (polygon draw is signed-in-only for MVP). Vertices
 * are projected through the loaded OSM tile grid, never guessed as viewport
 * fractions (same recipe as issue-2419-mobile-invalid-polygon.spec.ts).
 *
 * Run (own fixture stack, ports 5291/8191):
 *   PLAYWRIGHT_BASE_URL=http://localhost:5291 BACKEND_BASE_URL=http://localhost:8191 \
 *     npx playwright test e2e/issue-2461-polygon-panel-parity.spec.ts --project=full
 */
import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const CITY = 'bangalore';
const D_SOUTHEAST = 'd:southeast';
const AREA_RR_NAGAR = 'a:IN|KA|Bengaluru|RR Nagar';
const AREA_RR_NAGAR_KEY = 'IN|KA|Bengaluru|RR Nagar';

// Resolved from THIS file, not process.cwd(), so the evidence always lands in
// (and the signed-in storage state is always read from) the tree the spec
// was served from — never a sibling checkout's docs/ or e2e/fixtures/. A
// relative storageState resolves against the launch cwd, which is exactly how
// run 1 of this spec picked up a sibling checkout's state for another port.
const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = path.resolve(SPEC_DIR, '..', 'docs', 'pr-evidence', 'issue-2461');
const USER_STORAGE_STATE = path.resolve(SPEC_DIR, 'fixtures', 'user-auth.json');
const VIEWPORT = { width: 1366, height: 768 };

type LatLon = [number, number];
type Pt = { x: number; y: number };

/**
 * A triangle that contains every fixture RR Nagar listing
 * (12.9313–12.9316 / 77.5289–77.5319): at lat 12.9316 its half-width is
 * ~0.003° (77.5272–77.5332). ~0.4 km², well inside the city boundary and the
 * #2420 size ceiling.
 */
const TRIANGLE: LatLon[] = [
  [12.929, 77.524],
  [12.929, 77.5365],
  [12.934, 77.5302],
];
const LISTINGS_CENTROID: LatLon = [12.9314, 77.5304];

// ---------------------------------------------------------------------------
// Helpers (desktop/mouse variants of the #2419 mobile recipe)
// ---------------------------------------------------------------------------

function urlParam(page: Page, name: string): string | null {
  return new URL(page.url()).searchParams.get(name);
}

function shot(name: string): string {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  return path.join(EVIDENCE_DIR, `desktop-1366x768-${name}.png`);
}

async function declineConsentBannerIfPresent(page: Page): Promise<void> {
  const banner = page.getByTestId('discover-consent-banner');
  if (await banner.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await banner.getByRole('button', { name: /decline/i }).click();
    await expect(banner).not.toBeVisible({ timeout: 5_000 });
  }
}

async function assertSignedIn(page: Page): Promise<void> {
  await expect(page.getByRole('link', { name: /^sign in$/i }), 'arm must be SIGNED IN (polygon draw is signed-in-only)').toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByTestId('user-menu'), 'signed-in user menu must render').toBeVisible({ timeout: 10_000 });
}

/** Real click path: city root -> d:southeast -> RR Nagar AREA (Areas journey). */
async function reachCommittedRRNagar(page: Page): Promise<void> {
  await page.goto(`/discover?city=${CITY}`);
  await page.waitForLoadState('domcontentloaded');
  const panelShell = page.getByTestId('discover-areas-journey-panel-shell');
  await expect(panelShell).toBeVisible({ timeout: 15_000 });
  await declineConsentBannerIfPresent(page);
  await assertSignedIn(page);

  const directionCard = panelShell.getByTestId(`navigation-child-card-${D_SOUTHEAST}`);
  await expect(directionCard).toBeVisible({ timeout: 15_000 });
  await directionCard.click();
  await expect(page).toHaveURL(new RegExp(`node=${encodeURIComponent(D_SOUTHEAST)}`), { timeout: 10_000 });

  const areaCard = panelShell.getByTestId(`navigation-child-card-${AREA_RR_NAGAR}`);
  await expect(areaCard).toBeVisible({ timeout: 15_000 });
  await areaCard.click();
  await expect.poll(() => urlParam(page, 'rscope'), { timeout: 10_000 }).toBe('areas');
  expect(urlParam(page, 'rareas')).toBe(AREA_RR_NAGAR_KEY);
  await declineConsentBannerIfPresent(page);
}

async function readAreaHeaderCount(page: Page): Promise<number> {
  const header = page.getByTestId('area-header-count');
  await expect(header).toBeVisible({ timeout: 15_000 });
  const text = (await header.innerText()).replace(/\s+/g, ' ').trim();
  const m = /(\d+)/.exec(text);
  expect(m, `area-header-count must carry a number, got "${text}"`).not.toBeNull();
  return Number(m![1]);
}

async function armDrawMode(page: Page): Promise<void> {
  const drawEntry = page.getByTestId('area-set-draw-area');
  await expect(drawEntry).toBeVisible({ timeout: 15_000 });
  await expect(drawEntry).toBeEnabled();
  await drawEntry.click();
  await expect(page.getByTestId('draw-mode-overlay')).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => page.locator('img.leaflet-tile-loaded').count(), { timeout: 20_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(1_500);
  await page.addStyleTag({
    content: '.leaflet-marker-pane, .leaflet-overlay-pane, .leaflet-tooltip-pane, .leaflet-draw-tooltip { pointer-events: none !important; }',
  });
}

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

/** Genuine mouse clicks; each vertex is verified through its editing handle. */
async function placeVertices(page: Page, pts: Pt[]): Promise<void> {
  const handles = page.locator('.leaflet-editing-icon');
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i];
    const hit = await hitAt(page, p);
    expect(hit, `vertex ${i + 1} at (${Math.round(p.x)},${Math.round(p.y)}) must land on the Leaflet surface — hit: ${hit}`).toMatch(/leaflet-container|leaflet-mouse-marker/);
    let placed = false;
    for (let attempt = 0; attempt < 3 && !placed; attempt += 1) {
      await page.mouse.move(p.x, p.y);
      await page.waitForTimeout(120);
      await page.mouse.click(p.x, p.y);
      placed = await handles.nth(i).waitFor({ state: 'attached', timeout: 2_000 }).then(() => true).catch(() => false);
    }
    expect(placed, `vertex ${i + 1} never registered`).toBe(true);
    await page.waitForTimeout(250);
  }
}

type ListingsProbe = { url: string; status: number; total: number | null; ids: string[]; pricePaise: number[]; priceMax: string | null };
type MarkersProbe = { url: string; status: number; returned: number | null; ids: string[]; excludePropertyType: string | null };

/** Every polygon-carrying listings AND markers response, with what they returned. */
function captureScopedResponses(page: Page): { listings: ListingsProbe[]; markers: MarkersProbe[] } {
  const listings: ListingsProbe[] = [];
  const markers: MarkersProbe[] = [];
  page.on('response', async (res) => {
    const url = res.url();
    if (!url.includes('polygon=')) return;
    if (url.includes('/api/discover/listings') && !url.includes('relaxation-previews')) {
      let total: number | null = null;
      let ids: string[] = [];
      let pricePaise: number[] = [];
      try {
        const body = (await res.json()) as { totalElements?: number; content?: Array<{ id: string; pricePaise: number | null }> };
        total = typeof body?.totalElements === 'number' ? body.totalElements : null;
        ids = (body?.content ?? []).map((l) => l.id);
        pricePaise = (body?.content ?? []).map((l) => l.pricePaise ?? -1);
      } catch { /* non-JSON */ }
      listings.push({ url, status: res.status(), total, ids, pricePaise, priceMax: new URL(url).searchParams.get('priceMax') });
    } else if (url.includes('/api/discover/markers')) {
      let returned: number | null = null;
      let ids: string[] = [];
      try {
        const body = (await res.json()) as { returnedElements?: number; markers?: Array<{ id: string }> };
        returned = typeof body?.returnedElements === 'number' ? body.returnedElements : null;
        ids = (body?.markers ?? []).map((m) => m.id);
      } catch { /* non-JSON */ }
      markers.push({ url, status: res.status(), returned, ids, excludePropertyType: new URL(url).searchParams.get('excludePropertyType') });
    }
  });
  return { listings, markers };
}

async function markerCount(page: Page): Promise<number> {
  return page.locator('.leaflet-marker-pane .leaflet-marker-icon:not(.leaflet-editing-icon)').count();
}

/** "₹3.5 L" style text as `formatPrice` renders it — asserted by regex so spacing differences cannot fake a miss. */
function priceRegex(paise: number): RegExp {
  const rupees = paise / 100;
  const lakh = rupees / 100_000;
  // formatPrice renders "₹5 L" for whole lakhs and "₹3.50 L" / "₹7.20 L"
  // (two decimals) otherwise; tolerate a trailing zero either way.
  if (Number.isInteger(lakh)) return new RegExp(`₹\\s?${lakh}(?:\\.0{1,2})?\\s?L`);
  const trimmed = lakh.toFixed(2).replace(/0$/, '');
  return new RegExp(`₹\\s?${trimmed.replace('.', '\\.')}0?\\s?L`);
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

test.describe('Issue #2461 — committed POLYGON panel parity (desktop 1366x768, mouse, signed-in)', () => {
  test.use({ storageState: USER_STORAGE_STATE, viewport: VIEWPORT });

  test('cards follow the canonical polygon query; zero-result apply refetches and re-renders the polygon set', async ({ page }) => {
    test.setTimeout(180_000);
    const probes = captureScopedResponses(page);

    await reachCommittedRRNagar(page);
    const areaKeyedCount = await readAreaHeaderCount(page);
    expect(areaKeyedCount, 'the committed AREA must have results before drawing').toBeGreaterThan(0);
    await armDrawMode(page);

    // Bring the listings into view: the area-fit camera parks well north of
    // RR Nagar's own listings. Pan the centroid to the map centre, slowly.
    const mapBox = (await page.locator('.leaflet-container').boundingBox())!;
    const mapCentre: Pt = { x: mapBox.x + mapBox.width / 2, y: mapBox.y + mapBox.height / 2 };
    // The draw-mode overlay ("Draw your search area" + Undo/Cancel) sits in
    // the upper third of the map, and the badge/Recenter controls in the
    // bottom strip. Park the listings centroid in the lower-middle band so the
    // triangle's apex clears the overlay and its base clears the controls.
    const target: Pt = { x: mapCentre.x, y: mapBox.y + mapBox.height * 0.64 };
    let z = await tileZoom(page);
    const centroidBefore = await geoToScreen(page, LISTINGS_CENTROID, z);
    await slowPan(page, mapCentre, { x: mapCentre.x + (target.x - centroidBefore.x), y: mapCentre.y + (target.y - centroidBefore.y) });
    await expect.poll(() => page.locator('img.leaflet-tile-loaded').count(), { timeout: 20_000 }).toBeGreaterThan(0);
    z = await tileZoom(page);

    const overlayBox = (await page.getByTestId('draw-mode-overlay').boundingBox())!;
    const pts = await Promise.all(TRIANGLE.map((v) => geoToScreen(page, v, z)));
    pts.forEach((p) => {
      expect(p.x, 'vertex must be inside the map').toBeGreaterThan(mapBox.x + 20);
      expect(p.x).toBeLessThan(mapBox.x + mapBox.width - 20);
      expect(p.y, 'vertex must sit below the draw-mode overlay').toBeGreaterThan(overlayBox.y + overlayBox.height + 8);
      expect(p.y, 'vertex must sit above the bottom map controls').toBeLessThan(mapBox.y + mapBox.height - 110);
    });

    await placeVertices(page, pts);
    await page.screenshot({ path: shot('polygon-triangle-vertices-placed') });
    // Close the ring on the FIRST vertex (the overlay's own instruction).
    await page.mouse.click(pts[0].x, pts[0].y);
    // Drawing over a committed AREA_SET asks before replacing it — confirm
    // through the product dialog (genuine pointer, no URL shortcut).
    const replaceDialog = page.getByRole('alertdialog');
    await expect(replaceDialog).toBeVisible({ timeout: 15_000 });
    await expect(replaceDialog).toContainText(/replace selected areas/i);
    await page.screenshot({ path: shot('replace-selected-areas-confirm-dialog') });
    await replaceDialog.getByRole('button', { name: /replace and search/i }).click();

    // ── Committed POLYGON ──────────────────────────────────────────────────
    await expect.poll(() => urlParam(page, 'rscope'), { timeout: 15_000 }).toBe('poly');
    await expect(page.getByTestId('active-scope-chip-polygon')).toBeVisible({ timeout: 15_000 });

    // The panel's own query is the #2016 fingerprinted `useDiscoverListings`
    // request (carries `scopeFingerprint=` + `listingPurpose=`). The commit
    // path ALSO fires a bare validation probe (`validatePolygonScope`, no
    // purpose, so it counts the two ₹0 rent rows too) — that is not what the
    // cards render and must not be the parity reference.
    const isPanelQuery = (p: ListingsProbe) =>
      p.status === 200 && p.priceMax == null && p.url.includes('scopeFingerprint=') && p.url.includes('listingPurpose=');
    const listingsProbe = await expect
      .poll(() => probes.listings.filter(isPanelQuery).at(-1) ?? null, { timeout: 20_000 })
      .not.toBeNull()
      .then(() => probes.listings.filter(isPanelQuery).at(-1)!);
    const markersProbe = await expect
      .poll(() => probes.markers.filter((p) => p.status === 200).at(-1) ?? null, { timeout: 20_000 })
      .not.toBeNull()
      .then(() => probes.markers.filter((p) => p.status === 200).at(-1)!);

    expect(listingsProbe.total, 'canonical polygon query must return results in this polygon').toBeGreaterThan(0);

    // Panel header names the drawn area, not the previously-selected AREA.
    await expect(page.getByText('Result scope — Drawn area')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Properties in your drawn area' })).toBeVisible();

    // Card count == canonical polygon count (this is the #2461 defect line).
    await expect.poll(() => readAreaHeaderCount(page), { timeout: 15_000 }).toBe(listingsProbe.total);
    const cards = page.getByTestId('listing-card');
    await expect(cards).toHaveCount(listingsProbe.total!);
    // Identity proxy: every fixture price in this polygon is distinct.
    const cardText = (await cards.allInnerTexts()).join('\n');
    for (const paise of listingsProbe.pricePaise) {
      expect(cardText, `card list must contain the ₹${paise / 100} listing from the polygon response`).toMatch(priceRegex(paise));
    }
    await expect(page.getByTestId('area-result-summary-text')).toContainText(`${listingsProbe.total} verified`);
    await expect(page.getByTestId('area-result-summary-text')).toContainText('in your drawn area');

    // Markers == the markers query (area-first journey: agri-excluded, #1463).
    const domMarkers = await markerCount(page);
    expect(domMarkers).toBe(markersProbe.returned);

    // #2461's actual claim: cards and markers AGREE under this polygon — not
    // two independently-asserted literals that happen to match by accident.
    expect(
      await cards.count(),
      'card count and marker count must agree under the committed polygon (the #2461 defect line)',
    ).toBe(domMarkers);

    // Agricultural listings are excluded from markers on the area-first
    // journey (#1463); the fix means they must also be absent from the cards
    // rendered under a committed POLYGON, not merely absent from the pins.
    const agriIdsInCards = listingsProbe.ids.filter((id) => id.startsWith('f1713004-'));
    expect(agriIdsInCards, 'agricultural listings must not appear as cards under this polygon').toEqual([]);

    await page.screenshot({
      path: shot(`polygon-${listingsProbe.total}-cards-${domMarkers}-markers-converged`),
    });

    const parity = {
      polygonUrl: page.url(),
      listingsRequest: listingsProbe.url,
      listingsTotal: listingsProbe.total,
      listingsIds: listingsProbe.ids,
      cardsShown: await cards.count(),
      headerCount: await readAreaHeaderCount(page),
      markersRequest: markersProbe.url,
      markersExcludePropertyType: markersProbe.excludePropertyType,
      markersReturned: markersProbe.returned,
      markersIds: markersProbe.ids,
      domMarkers,
      areaKeyedCountBefore: areaKeyedCount,
      agriOnlyInCards: listingsProbe.ids.filter((id) => !markersProbe.ids.includes(id)),
      allPolygonListingsRequests: probes.listings.map((p) => ({ url: p.url, status: p.status, total: p.total })),
      allPolygonMarkersRequests: probes.markers.map((p) => ({ url: p.url, status: p.status, returned: p.returned })),
    };
    fs.writeFileSync(path.join(EVIDENCE_DIR, 'parity-results.json'), JSON.stringify(parity, null, 2));
    // Cards must be a superset of markers under the current owner ruling
    // (markers drop agri on the area-first journey; the listings target does not).
    markersProbe.ids.forEach((id) => expect(listingsProbe.ids, 'every marker must be a card').toContain(id));

    // ── Zero result + relaxation apply (same drawn polygon) ────────────────
    const zeroUrl = new URL(page.url());
    zeroUrl.searchParams.set('priceMax', '300000');
    await page.goto(zeroUrl.toString());
    await declineConsentBannerIfPresent(page);
    await expect(page.getByTestId('active-scope-chip-polygon')).toBeVisible({ timeout: 20_000 });

    const isZeroPanelQuery = (p: ListingsProbe) =>
      p.status === 200 && p.priceMax === '300000' && p.url.includes('scopeFingerprint=') && p.url.includes('listingPurpose=');
    const zeroProbe = await expect
      .poll(() => probes.listings.filter(isZeroPanelQuery).at(-1) ?? null, { timeout: 20_000 })
      .not.toBeNull()
      .then(() => probes.listings.filter(isZeroPanelQuery).at(-1)!);
    expect(zeroProbe.total, 'priceMax=300000 must be a genuine zero in this polygon').toBe(0);

    const recovery = page.getByTestId('area-zero-result-recovery');
    await expect(recovery).toBeVisible({ timeout: 20_000 });
    await expect(recovery.getByTestId('area-zero-recovery-scope-line')).toContainText(/drawn/i);
    await expect(page.getByTestId('listing-card')).toHaveCount(0);

    const relaxationRow = recovery.locator('[data-testid^="area-zero-recovery-relaxation-"]:not([data-testid$="-count"])').first();
    await expect(relaxationRow).toBeVisible({ timeout: 20_000 });
    const previewCountText = (await recovery.locator('[data-testid$="-count"]').first().innerText()).trim();
    const previewCount = Number(/(\d+)/.exec(previewCountText)?.[1] ?? NaN);
    expect(previewCount, 'relaxation preview must promise a positive count').toBeGreaterThan(0);
    await expect.poll(() => page.locator('img.leaflet-tile-loaded').count(), { timeout: 20_000 }).toBeGreaterThan(0);
    await recovery.scrollIntoViewIfNeeded();
    await page.screenshot({ path: shot('polygon-priceMax-300000-zero-result-recovery-offer') });

    const listingsBeforeApply = probes.listings.length;
    await relaxationRow.click();

    // The post-apply refetch: a NEW polygon listings request with the relaxed filter.
    const isAppliedPanelQuery = (p: ListingsProbe) =>
      p.status === 200 && p.priceMax !== '300000' && p.url.includes('scopeFingerprint=') && p.url.includes('listingPurpose=');
    const appliedProbe = await expect
      .poll(() => probes.listings.slice(listingsBeforeApply).filter(isAppliedPanelQuery).at(-1) ?? null, { timeout: 20_000 })
      .not.toBeNull()
      .then(() => probes.listings.slice(listingsBeforeApply).filter(isAppliedPanelQuery).at(-1)!);
    expect(appliedProbe.url).toContain('polygon=');
    expect(appliedProbe.total, 'the relaxed polygon query must return what the preview promised').toBe(previewCount);
    // The zero-arm recovery must not resurrect an agricultural listing as the
    // relaxed-filter result — the #2461 fix means the recovery target is a
    // residential listing from the same polygon.
    expect(
      appliedProbe.ids.some((id) => id.startsWith('f1713004-')),
      'the zero-result relaxation must not offer an agricultural listing',
    ).toBe(false);

    await expect(recovery).toHaveCount(0, { timeout: 15_000 });
    await expect.poll(() => readAreaHeaderCount(page), { timeout: 15_000 }).toBe(appliedProbe.total);
    await expect(page.getByTestId('listing-card')).toHaveCount(appliedProbe.total!);
    const appliedCardText = (await page.getByTestId('listing-card').allInnerTexts()).join('\n');
    for (const paise of appliedProbe.pricePaise) {
      expect(appliedCardText).toMatch(priceRegex(paise));
    }
    await page.getByTestId('area-header-count').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: shot(`polygon-relaxation-applied-${appliedProbe.total}-card-residential-not-agri`),
    });

    fs.writeFileSync(
      path.join(EVIDENCE_DIR, 'parity-zero-result.json'),
      JSON.stringify(
        {
          zeroUrl: zeroUrl.toString(),
          zeroRequest: zeroProbe.url,
          zeroTotal: zeroProbe.total,
          previewCount,
          appliedRequest: appliedProbe.url,
          appliedPriceMax: appliedProbe.priceMax,
          appliedTotal: appliedProbe.total,
          appliedIds: appliedProbe.ids,
          cardsAfterApply: await page.getByTestId('listing-card').count(),
          headerAfterApply: await readAreaHeaderCount(page),
        },
        null,
        2,
      ),
    );
  });
});
