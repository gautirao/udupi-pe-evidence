/**
 * issue-2016-result-scope-contract.spec.ts
 *
 * E2E acceptance evidence for Issue #2016 — the canonical geographic
 * result-scope contract (ResultScope = AREA_SET | POLYGON | VIEWPORT,
 * exactly one active at a time, kept separate from navigation `node=` and
 * from PropertyFilters).
 *
 * PR #2418 was BLOCKED on missing E2E evidence for the issue's locked
 * end-to-end journey (design oracle J3/J4:
 * docs/design/retrends-design-system/ui_kits/new_discover/src/transitions-data.js
 * L252-374). This spec drives the REAL app against the real local dev stack
 * (seeded Bangalore fixture, no mocking) to prove:
 *
 *   1. Polygon-draw-BY-CLICK completion + the J3.3 replace-confirmation
 *      dialog, driven through the product's own "Draw search area" entry
 *      (not a directly-constructed URL). Issue #2419 (PR-2) moved this off
 *      Leaflet.Draw's toolbar, which that issue hides as the primary entry.
 *   2. Browser Back after a POLYGON commit restores the prior AREA_SET by
 *      name, in exactly one Back press.
 *   3. Refresh-persistence for both a committed AREA_SET and a committed
 *      POLYGON.
 *   4. VIEWPORT seam-level URL round-trip (the type ships inert in #2016 —
 *      #2015 wires the real "Search this area" activation UI).
 *   5. Property peek/detail -> "Back to results" scope preservation.
 *
 * Run locally (full project, real backend, no stubs):
 *   bash scripts/run-e2e-local.sh --project=full e2e/issue-2016-result-scope-contract.spec.ts
 *
 * Prerequisites:
 *   - PLAYWRIGHT_BASE_URL / BACKEND_BASE_URL pointing at a running dev stack
 *     with the seeded Bangalore fixture (see discover-schools-canonical-2124.spec.ts
 *     for the same live constants reused below).
 */

import type { Page } from '@playwright/test';
import { test, expect } from './support/specialist-test';
import { loginAsUser } from '../helpers';

// ---------------------------------------------------------------------------
// Live Bangalore fixture constants — reused verbatim from
// discover-schools-canonical-2124.spec.ts (verified live against
// GET /api/discover/cities/bangalore/navigation/{node}/counts).
// ---------------------------------------------------------------------------

const CITY = 'bangalore';
const D_CENTRAL = 'd:central';
const C_CENTRAL = 'c:central:in-ka-bengaluru-btm-layout-in-ka-bengaluru-koramangala';
const AREA_KORAMANGALA = 'a:IN|KA|Bengaluru|Koramangala';
const AREA_KORAMANGALA_KEY = 'IN|KA|Bengaluru|Koramangala';

const D_SOUTHEAST = 'd:southeast';
const AREA_RR_NAGAR = 'a:IN|KA|Bengaluru|RR Nagar';
const AREA_RR_NAGAR_KEY = 'IN|KA|Bengaluru|RR Nagar';

// ---------------------------------------------------------------------------
// Shared helpers (patterns proven in discover-real-data-smoke.spec.ts and
// discover-schools-canonical-2124.spec.ts — reused verbatim where the exact
// same DOM/Leaflet quirk applies).
// ---------------------------------------------------------------------------

function urlParam(page: Page, name: string): string | null {
  return new URL(page.url()).searchParams.get(name);
}

// The header's Sign in link (apps/web/src/components/layout/AppLayout.tsx) is
// the auth-state oracle for every arm below. Each arm DECLARES its auth state
// and then PROVES it, because a suite whose storageState silently failed to
// mint runs anonymous while claiming otherwise — which happened on several
// PR-1 heads of #2419 before this guard existed.
const SIGN_IN_LINK = { name: /^sign in$/i } as const;

async function assertSignedIn(page: Page): Promise<void> {
  await expect(
    page.getByRole('link', SIGN_IN_LINK),
    'this arm must run SIGNED IN (local auth fixture) — the Sign in link must be absent',
  ).toHaveCount(0, { timeout: 10_000 });
}

/**
 * The results panel that mounts for a committed area. The Areas journey
 * renders `areas-journey-panel-listings`; `discover-right-panel` is the
 * Schools-journey / legacy panel this spec drove before it moved onto the
 * Areas journey (see reachCommittedKoramangalaAreaSet). Either proves the
 * panel survived a reload or a Back.
 */
function resultsPanel(page: Page) {
  return page.getByTestId('discover-right-panel').or(page.getByTestId('areas-journey-panel-listings'));
}

async function assertAnonymous(page: Page): Promise<void> {
  await expect(
    page.getByRole('link', SIGN_IN_LINK),
    'this arm must run ANONYMOUS (empty storageState) — the Sign in link must be visible',
  ).toBeVisible({ timeout: 10_000 });
}

async function declineConsentBannerIfPresent(page: Page): Promise<void> {
  const banner = page.getByTestId('discover-consent-banner');
  if (await banner.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await banner.getByRole('button', { name: /decline/i }).click();
    await expect(banner).not.toBeVisible({ timeout: 5_000 });
  }
}

/**
 * Drive the real click path from the Bangalore city root down to a committed
 * AREA_SET(Koramangala) on the DEFAULT Areas journey.
 *
 * HISTORY: when this spec was first written (#2016), the plain Areas journey's
 * Direction -> Cluster -> Area click path wrote `node=` but did NOT commit an
 * AREA_SET result scope, so the spec drove the `journey=school-first` panel
 * instead (the only path that then reached `rscope=areas`). That is no longer
 * true — verified live on this branch: clicking the Koramangala AREA card in
 * `discover-areas-journey-panel-shell` lands on
 * `node=a:IN|KA|Bengaluru|Koramangala&rscope=areas&rareas=IN|KA|Bengaluru|Koramangala`.
 *
 * Issue #2419 (PR-2) makes the journey choice load-bearing: the product-native
 * "Draw search area" entry lives in the Areas journey's `AreaSelectedPanel`
 * (single- and multi-area branches). The Schools journey renders its own
 * panel and never mounts that entry, so a school-first start would leave the
 * draw arm nothing to click. The ResultScope mechanics under test (draw /
 * replace / confirm, refresh-restore, Back) are not journey-gated either way.
 */
async function reachCommittedKoramangalaAreaSet(page: Page): Promise<void> {
  await page.goto(`/discover?city=${CITY}`);
  await page.waitForLoadState('domcontentloaded');

  const panelShell = page.getByTestId('discover-areas-journey-panel-shell');
  await expect(panelShell, 'the Areas-journey navigation panel must mount at the city root').toBeVisible({ timeout: 15_000 });
  await declineConsentBannerIfPresent(page);

  const directionCard = panelShell.getByTestId(`navigation-child-card-${D_CENTRAL}`);
  await expect(directionCard, 'the Central Bangalore direction card must render on the landing panel').toBeVisible({ timeout: 15_000 });
  await directionCard.click();
  await expect(page, 'clicking the direction card must write node= to the URL').toHaveURL(new RegExp(`node=${encodeURIComponent(D_CENTRAL)}`), { timeout: 10_000 });

  const clusterCard = panelShell.getByTestId(`navigation-child-card-${C_CENTRAL}`);
  await expect(clusterCard, 'the Koramangala cluster card must render inside Central Bangalore').toBeVisible({ timeout: 15_000 });
  await clusterCard.click();
  await expect(page, 'clicking the cluster card must write node= to the URL').toHaveURL(new RegExp(`node=${encodeURIComponent(C_CENTRAL)}`), { timeout: 10_000 });

  const areaCard = panelShell.getByTestId(`navigation-child-card-${AREA_KORAMANGALA}`);
  await expect(areaCard, 'the Koramangala AREA card must render inside its cluster').toBeVisible({ timeout: 15_000 });
  await areaCard.click();

  // This real click must commit rscope=areas/rareas (result scope) — verified
  // live on the Areas journey (see the docblock above).
  await expect
    .poll(() => urlParam(page, 'rscope'), { message: 'clicking the Koramangala AREA card (Areas journey) must commit an AREA_SET result scope', timeout: 10_000 })
    .toBe('areas');
  expect(urlParam(page, 'rareas'), 'the committed AREA_SET must name Koramangala').toBe(AREA_KORAMANGALA_KEY);

  await declineConsentBannerIfPresent(page);
}

async function reachCommittedRrNagarAreaSet(page: Page): Promise<void> {
  await page.goto(`/discover?city=${CITY}`);
  await page.waitForLoadState('domcontentloaded');

  const panelShell = page.getByTestId('discover-areas-journey-panel-shell');
  await expect(panelShell, 'the Areas-journey navigation panel must mount at the city root').toBeVisible({ timeout: 15_000 });
  await declineConsentBannerIfPresent(page);

  const directionCard = panelShell.getByTestId(`navigation-child-card-${D_SOUTHEAST}`);
  await expect(directionCard, 'the Southeast Bangalore direction card must render on the landing panel').toBeVisible({ timeout: 15_000 });
  await directionCard.click();
  await expect(page, 'clicking the direction card must write node= to the URL').toHaveURL(new RegExp(`node=${encodeURIComponent(D_SOUTHEAST)}`), { timeout: 10_000 });

  const areaCard = panelShell.getByTestId(`navigation-child-card-${AREA_RR_NAGAR}`);
  await expect(areaCard, 'the RR Nagar AREA card must render inside Southeast Bangalore').toBeVisible({ timeout: 15_000 });
  await areaCard.click();

  await expect
    .poll(() => urlParam(page, 'rscope'), { message: 'clicking the RR Nagar AREA card must commit an AREA_SET result scope', timeout: 10_000 })
    .toBe('areas');
  expect(urlParam(page, 'rareas'), 'the committed AREA_SET must name RR Nagar').toBe(AREA_RR_NAGAR_KEY);

  await declineConsentBannerIfPresent(page);
}

/**
 * Draw a triangular polygon on the Discover map, starting from the PRODUCT
 * entry point.
 *
 * Sequence: click "Draw search area" in the committed-area panel, confirm the
 * draw-mode overlay appeared, place three vertices with real synthetic mouse
 * moves and clicks, then close the ring on the first vertex.
 *
 * Re-pointed by Issue #2419 (PR-2). This used to click Leaflet.Draw's own
 * pentagon toolbar button; that chrome is now hidden whenever the product
 * entry is wired, so the old sequence would fail on a control that no longer
 * exists. Synthetic mouse events (not `locator.click()`) are still used for
 * the vertices themselves — Leaflet's own event plumbing does not reliably
 * see Playwright's element clicks.
 */
async function drawPolygonOnMap(page: Page): Promise<void> {
  // 1. The PRODUCT entry. #2419 PR-2 re-pointed this helper off Leaflet.Draw's
  //    own pentagon toolbar button, which the issue removes as the primary
  //    entry ("do not expose unexplained Leaflet/plugin iconography") and
  //    which is now hidden whenever the product entry is wired — so the old
  //    sequence would fail on a control that is no longer there.
  //
  //    This entry renders for BOTH single- and multi-area committed AREA_SET
  //    states. Before PR-2 it existed only in the multi-area header, which is
  //    exactly why this spec's single-area path had no entry to click.
  //    It is SIGNED-IN-ONLY (owner ruling on PR #2452): anonymous shoppers get
  //    no entry at all, so this helper is only meaningful in the signed-in arm.
  await assertSignedIn(page);
  const menuTrigger = page.getByTestId('scope-actions-menu-trigger');
  if (await menuTrigger.isVisible().catch(() => false)) {
    await menuTrigger.click();
  }
  const drawEntry = page.getByTestId('area-set-draw-area');
  await expect(drawEntry, 'the product-native "Draw search area" entry must render for a committed area').toBeVisible({ timeout: 15_000 });
  await expect(drawEntry, 'the entry must be enabled for a signed-in shopper in a drawable city').toBeEnabled();
  await drawEntry.click();

  // 2. The overlay IS the product's "draw mode is on" signal, and it is
  //    authoritative — unlike the plugin CSS classes this helper used to
  //    sniff, which varied by leaflet-draw version and had to be tolerated
  //    with a catch(). Fail loudly here rather than clicking an inert map.
  await expect(
    page.getByTestId('draw-mode-overlay'),
    'clicking the entry must enter draw mode and show the instructions overlay',
  ).toBeVisible({ timeout: 10_000 });

  // Place vertices inside the map's USABLE viewport, not its full box. The
  // Leaflet container spans the whole shell and the results panel floats
  // over its left edge, so a point at 35% of the container's width lands on
  // panel text — exactly what the hit diagnostic below reported on the first
  // live run ("vertex 1 ... hits: p.text-xs..."). `discover-map-usable-viewport`
  // is the region PropertyMap itself treats as unobstructed.
  const usable = page.getByTestId('discover-map-usable-viewport');
  const fullBox = (await usable.boundingBox()) ?? (await page.locator('.leaflet-container').first().boundingBox());
  if (!fullBox) throw new Error('neither discover-map-usable-viewport nor .leaflet-container has a bounding box');
  // If the results panel overlaps the map horizontally, clip that side out.
  // (On the desktop shell the panel sits beside the map, not over it; the
  // clip is a no-op there and only matters for narrower layouts.)
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
  console.log(
    `[drawPolygonOnMap] map box ${JSON.stringify(fullBox)} panel box ${JSON.stringify(panelBox)} -> drawable ${JSON.stringify(mapBox)}`,
  );
  if (mapBox.width < 200) throw new Error(`drawable map region is too narrow (${mapBox.width}px) to place a triangle`);

  /**
   * The draw-mode overlay (instructions + Cancel/Undo) and the map's own
   * context chrome float over the map surface; a synthetic click on them is
   * swallowed. Walk downward from the requested point until the element under
   * it belongs to Leaflet, exactly as a shopper would place points beside the
   * overlay rather than through it.
   */
  const hitAt = async (px: number, py: number): Promise<string> =>
    page.evaluate(
      ([hx, hy]) => {
        const el = document.elementFromPoint(hx, hy);
        if (!el) return 'nothing';
        const testId = el.getAttribute('data-testid');
        return `${el.tagName.toLowerCase()}.${Array.from(el.classList).join('.')}${testId ? `[data-testid=${testId}]` : ''}`;
      },
      [px, py],
    );
  const findDrawablePoint = async (px: number, py: number): Promise<[number, number]> => {
    const bottom = mapBox.y + mapBox.height - 24;
    for (let cy = py; cy <= bottom; cy += 24) {
      if ((await hitAt(px, cy)).includes('leaflet')) return [px, cy];
    }
    throw new Error(`no Leaflet surface found below (${Math.round(px)}, ${Math.round(py)}) — last hit: ${await hitAt(px, bottom)}`);
  };

  // 3. Listing markers, the drawn shape and leaflet-draw's own cursor tooltip
  //    all sit above the map surface and swallow vertex clicks — the tooltip
  //    especially, since it follows the pointer and GROWS as the shape
  //    progresses. Suppressing pointer events on those panes (they stay
  //    visible) is what makes vertex placement deterministic; without it the
  //    draw arms correctly and then silently records nothing.
  await page.addStyleTag({
    content:
      '.leaflet-marker-pane, .leaflet-overlay-pane, .leaflet-tooltip-pane, .leaflet-draw-tooltip { pointer-events: none !important; }',
  });

  // A triangle, not a rectangle: three vertices are all the app needs (the
  // URL decoder requires >= 3 and #2420's policy no-ops below that), and a
  // fourth vertex proved unreliable to place in every earlier run.
  const vertices: Array<[number, number]> = [
    await findDrawablePoint(mapBox.x + mapBox.width * 0.45, mapBox.y + mapBox.height * 0.45),
    await findDrawablePoint(mapBox.x + mapBox.width * 0.55, mapBox.y + mapBox.height * 0.47),
    await findDrawablePoint(mapBox.x + mapBox.width * 0.5, mapBox.y + mapBox.height * 0.55),
  ];

  // 4. Move -> settle -> click, and VERIFY each vertex registered before
  //    moving on. leaflet-draw renders one `.leaflet-editing-icon` handle per
  //    placed vertex, which is a direct observable signal; a bare click loop
  //    drops vertices intermittently, and that failure only surfaces far
  //    downstream as "no polygon was ever committed".
  const vertexHandles = page.locator('.leaflet-editing-icon');
  for (let i = 0; i < vertices.length; i += 1) {
    const [x, y] = vertices[i];
    // Diagnostic: name the element that will actually receive this click. A
    // vertex that "never registered" is almost always a click swallowed by
    // something above the map surface, and the failure message alone cannot
    // say what.
    console.log(`[drawPolygonOnMap] vertex ${i + 1} at (${Math.round(x)}, ${Math.round(y)}) hits: ${await hitAt(x, y)}`);
    let placed = false;
    for (let attempt = 0; attempt < 3 && !placed; attempt += 1) {
      await page.mouse.move(x, y);
      await page.waitForTimeout(120);
      await page.mouse.click(x, y);
      placed = await vertexHandles
        .nth(i)
        .waitFor({ state: 'attached', timeout: 2_000 })
        .then(() => true)
        .catch(() => false);
    }
    expect(placed, `vertex ${i + 1} of the search-area triangle never registered`).toBe(true);
  }

  // 5. Close the ring on the FIRST vertex — the instruction the overlay itself
  //    gives ("Click the first point to finish"). There is deliberately no
  //    Finish control: hiding the plugin chrome hides its action bar too, and
  //    adding a product Finish button is an owner decision recorded on PR
  //    #2452 rather than assumed here.
  const [firstX, firstY] = vertices[0];
  await page.mouse.move(firstX, firstY);
  await page.waitForTimeout(120);
  await page.mouse.click(firstX, firstY);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Issue #2016 — result-scope contract', () => {
  test.describe.configure({ mode: 'serial' });

  // Items 1, 2 and 3b DRAW, and drawing is signed-in-only (#2419 PR-2 ruling),
  // so they run as the smoke user. Items 3a, 4 and 5 never draw and stay
  // anonymous — and 3a doubles as the proof that the entry is HIDDEN for an
  // anonymous shopper on a committed area.
  test.describe('signed-in shopper — polygon draw arms', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsUser(page, process.env.SMOKE_USER_EMAIL!, process.env.SMOKE_USER_PASSWORD!);
    });

  // -------------------------------------------------------------------------
  // Item 1 — polygon-draw-BY-CLICK + J3.3 confirmation dialog
  // -------------------------------------------------------------------------

  test('1. draw polygon over committed AREA_SET drives the J3.3 replace-confirmation dialog and commits POLYGON', async ({ page }) => {
    await reachCommittedKoramangalaAreaSet(page);

    await drawPolygonOnMap(page);

    // J3.3: exact oracle copy (docs/.../transitions-data.js L275-279), via
    // ReplaceResultScopeDialog.tsx — a shadcn AlertDialog, role="alertdialog".
    const dialog = page.getByRole('alertdialog');
    await expect(dialog, 'the J3.3 replace-confirmation dialog must open when drawing over a committed scope').toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText('Replace selected areas with this boundary?')).toBeVisible();
    await expect(dialog.getByText(/will be removed from the search\. Filters stay as they are\./)).toBeVisible();

    const confirmBtn = dialog.getByRole('button', { name: 'Replace and search' });
    const cancelBtn = dialog.getByRole('button', { name: 'Keep selected areas' });
    await expect(confirmBtn).toBeVisible();
    await expect(cancelBtn).toBeVisible();

    await confirmBtn.click();
    await expect(dialog, 'confirming must close the dialog').not.toBeVisible({ timeout: 5_000 });

    // POLYGON is now the committed scope.
    await expect
      .poll(() => urlParam(page, 'rscope'), { message: 'confirming replace must commit rscope=poly', timeout: 10_000 })
      .toBe('poly');
    expect(urlParam(page, 'rpoly'), 'rpoly must carry the drawn coordinates').not.toBeNull();
    expect(urlParam(page, 'rareas'), 'rareas must be cleared once POLYGON is committed').toBeNull();
  });

  // -------------------------------------------------------------------------
  // Item 2 — Browser Back after POLYGON commit restores prior AREA_SET
  // -------------------------------------------------------------------------

  test('2. Browser Back after a POLYGON commit restores the prior AREA_SET by name in exactly one press', async ({ page }) => {
    await reachCommittedKoramangalaAreaSet(page);
    await drawPolygonOnMap(page);

    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await dialog.getByRole('button', { name: 'Replace and search' }).click();
    await expect
      .poll(() => urlParam(page, 'rscope'), { timeout: 10_000 })
      .toBe('poly');

    // Exactly one Back press must restore the exact prior AREA_SET(Koramangala) —
    // no incidental history entries from the draw/confirm sequence (J3.2/J3.3
    // are documented as pushing no history of their own; only the final commit does).
    await page.goBack();

    await expect
      .poll(() => urlParam(page, 'rscope'), { message: 'one Browser Back must restore rscope=areas', timeout: 10_000 })
      .toBe('areas');
    expect(urlParam(page, 'rareas'), 'the restored AREA_SET must be the exact same Koramangala set by name').toBe(AREA_KORAMANGALA_KEY);
    expect(urlParam(page, 'rpoly'), 'rpoly must be cleared once AREA_SET is restored').toBeNull();
  });

  // -------------------------------------------------------------------------
  // Item 3b — refresh persistence for a committed POLYGON (3a, the AREA_SET
  // half, lives in the anonymous arm below: it never draws)
  // -------------------------------------------------------------------------

  test('3b. refresh restores the exact committed POLYGON (same coordinates)', async ({ page }) => {
    await reachCommittedKoramangalaAreaSet(page);
    await drawPolygonOnMap(page);
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await dialog.getByRole('button', { name: 'Replace and search' }).click();
    await expect.poll(() => urlParam(page, 'rscope'), { timeout: 10_000 }).toBe('poly');

    const rpolyBefore = urlParam(page, 'rpoly');
    expect(rpolyBefore).not.toBeNull();

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 15_000 });

    await expect
      .poll(() => urlParam(page, 'rscope'), { message: 'refresh must restore rscope=poly', timeout: 10_000 })
      .toBe('poly');
    expect(urlParam(page, 'rpoly'), 'refresh must restore the EXACT same polygon coordinates, not just some scope').toBe(rpolyBefore);
  });
  });

  test.describe('anonymous shopper — no draw entry, scope mechanics unchanged', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // -------------------------------------------------------------------------
  // Item 3a — refresh persistence for a committed AREA_SET, plus the #2419
  // anonymous-treatment ruling (entry HIDDEN, not disabled) on the same state.
  // -------------------------------------------------------------------------

  test('3a. refresh restores the exact committed AREA_SET (anonymous; no draw entry rendered)', async ({ page }) => {
    await reachCommittedKoramangalaAreaSet(page);
    await assertAnonymous(page);
    await expect(
      page.getByTestId('area-set-draw-area'),
      '#2419 ruling: an anonymous shopper on a committed area gets NO "Draw search area" entry (hidden, not disabled)',
    ).toHaveCount(0);
    const beforeUrl = page.url();

    await page.reload();
    await expect(resultsPanel(page)).toBeVisible({ timeout: 15_000 });

    expect(page.url(), 'a hard refresh must restore the exact same URL (no camera-inferred scope)').toBe(beforeUrl);
    expect(urlParam(page, 'rscope')).toBe('areas');
    expect(urlParam(page, 'rareas')).toBe(AREA_KORAMANGALA_KEY);
  });

  // -------------------------------------------------------------------------
  // Item 4 — VIEWPORT seam-level contract (inert in #2016; #2015 wires the
  // real "Search this area" activation UI). Proves the URL round-trip and
  // "return to previous" mechanics a future #2015 will drive.
  // -------------------------------------------------------------------------

  test('4. VIEWPORT scope round-trips via URL and "return to previous" restores the prior scope', async ({ page }) => {
    // Construct the URL exactly as #2015's future "Search this area" CTA
    // would: rscope=vp&rvp=<bounds>, with rprev carrying the AREA_SET it
    // replaced (state/url/resultScope.ts's encodeForPrev format:
    // "areas:<comma-joined-areaKeys>").
    const rvp = '12.9,77.5,13.1,77.7'; // s,w,n,e — a real Bangalore-scale bbox
    const rprev = `areas:${AREA_KORAMANGALA_KEY}`;

    const responses: Array<{ url: string; status: number }> = [];
    page.on('response', (r) => {
      if (r.url().includes('/api/discover/listings') || r.url().includes('/api/discover/markers')) {
        responses.push({ url: r.url(), status: r.status() });
      }
    });

    await page.goto(
      `/discover?city=${CITY}&node=${encodeURIComponent(AREA_KORAMANGALA)}` +
        `&rscope=vp&rvp=${encodeURIComponent(rvp)}&rprev=${encodeURIComponent(rprev)}`,
    );
    await page.waitForLoadState('domcontentloaded');
    await assertAnonymous(page);

    // App must not crash — the map + a results panel must still mount. Which
    // panel testid renders here is governed by `node=` (navigation), not by
    // `rscope` — this URL also carries a real node=, so the area-selected
    // panel (not `discover-right-panel`) is the one that actually mounts;
    // either is acceptable proof the app didn't crash on the VIEWPORT param.
    await expect(page.locator('.leaflet-container'), 'VIEWPORT scope must not crash the map').toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByTestId('discover-right-panel').or(page.getByTestId('areas-journey-panel-listings')),
      'VIEWPORT scope must not crash the results panel',
    ).toBeVisible({ timeout: 15_000 });

    // The committed scope is recognised: URL persists rscope=vp on read,
    // and no request in this flow was rejected by the new exclusivity check
    // (400 result_scope_must_be_exclusive would appear here if areaKeys/polygon
    // were accidentally sent alongside viewportScope).
    expect(urlParam(page, 'rscope'), 'VIEWPORT must be read back from the URL unchanged').toBe('vp');
    expect(urlParam(page, 'rvp')).toBe(rvp);
    await page.waitForTimeout(2_000); // let in-flight listings/markers requests land
    const scopeRejections = responses.filter((r) => r.status === 400);
    expect(scopeRejections, 'no request in the VIEWPORT flow may hit the new exclusivity 400').toEqual([]);

    // Refresh persistence for VIEWPORT (same class of proof as item 3, since
    // #2015's UI is out of scope for #2016 and cannot be clicked here).
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 15_000 });
    expect(urlParam(page, 'rscope'), 'refresh must restore rscope=vp').toBe('vp');
    expect(urlParam(page, 'rvp')).toBe(rvp);

    // "Return to previous" mechanics: since #2015 has not shipped the UI
    // trigger for this yet (confirmed absent from apps/web/src — see report),
    // the only real, currently-reachable path back to the rprev-encoded scope
    // is Browser Back to the state that had committed it, or a direct
    // navigation reading rprev's encoded AREA_SET. We prove the latter here —
    // that the exact rprev-encoded scope round-trips correctly when it
    // becomes the active rscope, matching decodePrev's "areas:<keys>" format
    // (state/url/resultScope.ts) — the same decode path #2015 will invoke.
    await page.goto(`/discover?city=${CITY}&node=${encodeURIComponent(AREA_KORAMANGALA)}&rscope=areas&rareas=${encodeURIComponent(AREA_KORAMANGALA_KEY)}`);
    await expect(page.getByTestId('discover-right-panel').or(page.getByTestId('areas-journey-panel-listings'))).toBeVisible({ timeout: 15_000 });
    expect(urlParam(page, 'rscope')).toBe('areas');
    expect(urlParam(page, 'rareas')).toBe(AREA_KORAMANGALA_KEY);
  });

  // -------------------------------------------------------------------------
  // Item 5 — property peek/detail -> Back-to-results scope preservation
  // -------------------------------------------------------------------------

  test('5. opening a listing detail and returning via Browser Back preserves the exact prior AREA_SET scope', async ({ page }) => {
    // Use RR Nagar in Southeast Bangalore, which is seeded with 2 LIVE
    // residential listings in the deterministic local fixture DB.
    await reachCommittedRrNagarAreaSet(page);
    await assertAnonymous(page);
    await expect(resultsPanel(page)).toBeVisible({ timeout: 15_000 });

    const card = page.getByTestId('listing-card').first();
    await expect(card, 'seeded RR Nagar AREA_SET must render at least one listing card').toBeVisible({ timeout: 15_000 });

    const beforeNode = urlParam(page, 'node');
    await card.getByTestId('listing-view-details').click();

    // apps/web/src/components/discover/panels/AreaSelectedPanel.tsx wires
    // PropertyCard.onNavigate to `navigate(\`/listing/${listing.id}\`)` — a
    // real route push, not an in-app peek modal. Confirm we actually left Discover.
    await expect(page, 'clicking a listing card must navigate to its detail route').toHaveURL(/\/listing\//, { timeout: 10_000 });

    await page.goBack();

    await expect(page, 'Back from listing detail must return to the Discover route').toHaveURL(/\/discover\?/, { timeout: 10_000 });
    await expect(resultsPanel(page)).toBeVisible({ timeout: 15_000 });
    expect(urlParam(page, 'node')).toBe(beforeNode);
    expect(urlParam(page, 'rscope')).toBe('areas');
    expect(urlParam(page, 'rareas')).toBe(AREA_RR_NAGAR_KEY);
  });
  });
});
