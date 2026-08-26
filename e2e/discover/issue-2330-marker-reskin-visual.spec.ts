/**
 * Issue #2330 — Discover map marker action-system reskin, real-browser
 * evidence (AC14-AC17).
 *
 * jsdom (the unit-test harness for `markerPrimitives.ts`/`AreaMarkerLayer.tsx`)
 * never loads `index.css` and never paints real layout, so it structurally
 * cannot prove: the CSS cascade (hover/focus `!important` lift + tint rules),
 * the D2 keyboard-focus-ring painter composing with that cascade, painted
 * `getBoundingClientRect()` bounds, or genuine cross-viewport behaviour. This
 * spec exercises the shared `.rc-shell`/`.rc-body`/`.rc-footer`/`.rc-tail`
 * markup (`markerPrimitives.ts`'s `markerShellHtml`) for all THREE marker
 * families — Explore (`area-destination-marker`), Zoom in
 * (`area-visual-cluster-marker`), View homes/View schools
 * (`area-single-marker`) — against a real Chromium instance, in both the
 * Areas and Schools journeys, at desktop (1366x768) and mobile (390x844)
 * viewports.
 *
 * ── FIXTURE STRATEGY ──
 * Same mocked-navigation-API recipe as
 * `e2e/discover/issue-2305-cluster-marker-skin.spec.ts` (`GET .../navigation/
 * resolve` + `GET .../navigation/{node}/counts`), extended to TWO node
 * levels so all three marker families are reachable from this one fixture:
 *   - `node=root` (or omitted): the city root shows one DIRECTION child ->
 *     exactly one Explore card.
 *   - `node=d:reskin2330`: that DIRECTION's own AREA children — one
 *     ISOLATED area (renders alone -> View homes/View schools leaf) plus two
 *     CO-LOCATED areas (cluster into one Zoom in card) — both reachable on
 *     the SAME screen.
 * Every fixture builder below accepts count/label overrides so the content
 * cases (long name, singular/plural, known-zero, unavailable count) reuse
 * the SAME wiring rather than a parallel fixture per case.
 *
 * ── KNOWN DEFERRED OBSERVATION (D1/AMEND-A, owned by #1943) — do NOT fix ──
 * Explore/Zoom paint at an INVENTORY-SCALED width (132-170px single member,
 * 150-206px combined — `AreaMarkerLayer.tsx`'s `inventoryScaledWidthPx`),
 * while `VISUAL_CLUSTER_CARD_WIDTH_PX` (172px) is only the CLUSTERING
 * collision-footprint input, not a painted-width ceiling. A wide combined
 * Zoom/Explore card (near the 206px ceiling) can therefore paint wider than
 * the 172px footprint used to decide whether it overlaps a neighbour. This
 * spec's AC17 boundingBox fixtures deliberately use LOW/MODERATE inventory
 * (well under the 240-count scaling ceiling) so the painted widths asserted
 * here are the ordinary, in-bounds case; it does not attempt to reproduce or
 * assert around the wide-card overflow gap, which is #1943's to close.
 */
import { test, expect, type Page, type Route } from '@playwright/test';

const CITY = 'bangalore';

// Hex -> rgb(), as a real browser reports it via getComputedStyle (see
// src/components/map/markerTokens.ts — read, not modified, by this spec).
const NAVY_800_RGB = 'rgb(27, 42, 69)';
const PAPER_RGB = 'rgb(255, 255, 255)';
const COPPER_500_RGB = 'rgb(176, 92, 58)';
const COPPER_600_RGB = 'rgb(147, 75, 45)';
const PLUM_600_RGB = 'rgb(94, 82, 134)';

const DESKTOP = { width: 1366, height: 768 };
const MOBILE = { width: 390, height: 844 };

const D_KEY = 'd:reskin2330';
const D_LABEL = 'Reskin Direction 2330';
// Deliberately far (~0.6 degree, well over 60km) from the co-located pair
// below so it never joins their cluster cell at ANY fitted zoom — a narrower
// mobile viewport fits the SAME geographic bounds at a LOWER zoom than
// desktop, which shrinks the projected PIXEL distance between two fixed
// lat/lon points; a separation this large keeps them in separate grid cells
// regardless of that per-viewport zoom difference (a smaller ~0.15 degree
// gap was tried first and merged into one cluster on the mobile viewport).
const ISO_LAT = 13.55;
const ISO_LON = 78.1;
const ISO_KEY = 'IN|KA|Bengaluru|Reskin2330Isolated';
const ISO_NODE_KEY = `a:${ISO_KEY}`;
const CLUSTER_LAT = 12.9;
const CLUSTER_LON = 77.5;
const A_KEY = 'IN|KA|Bengaluru|Reskin2330Alpha';
const A_NODE_KEY = `a:${A_KEY}`;
const A_LABEL = 'ReskinAlpha';
const B_KEY = 'IN|KA|Bengaluru|Reskin2330Beta';
const B_NODE_KEY = `a:${B_KEY}`;
const B_LABEL = 'ReskinBeta';

interface IsoOverrides {
  displayLabel?: string;
  listingCount?: number;
  schoolCount?: number | null;
}

/** Builds the two-level fixture (root -> one DIRECTION -> 3 AREA children). */
function buildWire(isoOverrides: IsoOverrides = {}) {
  const isoLabel = isoOverrides.displayLabel ?? 'ReskinIsolated';
  const isoListingCount = isoOverrides.listingCount ?? 6;
  const isoSchoolCount = isoOverrides.schoolCount === undefined ? 4 : isoOverrides.schoolCount;

  const rootWire = {
    nodeKey: 'root',
    nodeType: 'ROOT',
    displayLabel: 'Bangalore',
    depth: -1,
    regionKey: null,
    ancestry: [],
    nextLevelType: 'DIRECTION',
    children: [
      {
        nodeKey: D_KEY,
        nodeType: 'DIRECTION',
        displayLabel: D_LABEL,
        displayOrder: 1,
        descendantAreaCount: 3,
        centreLat: 12.97,
        centreLon: 77.6,
      },
    ],
    revisionId: 1,
    bounds: null,
    descendantAreaKeys: null,
    areaKey: null,
  };

  const directionWire = {
    nodeKey: D_KEY,
    nodeType: 'DIRECTION',
    displayLabel: D_LABEL,
    depth: 0,
    regionKey: null,
    ancestry: [],
    nextLevelType: 'AREA',
    children: [
      {
        nodeKey: ISO_NODE_KEY,
        nodeType: 'AREA',
        displayLabel: isoLabel,
        displayOrder: 1,
        areaKey: ISO_KEY,
        centreLat: ISO_LAT,
        centreLon: ISO_LON,
      },
      {
        nodeKey: A_NODE_KEY,
        nodeType: 'AREA',
        displayLabel: A_LABEL,
        displayOrder: 2,
        areaKey: A_KEY,
        centreLat: CLUSTER_LAT,
        centreLon: CLUSTER_LON,
      },
      {
        nodeKey: B_NODE_KEY,
        nodeType: 'AREA',
        displayLabel: B_LABEL,
        displayOrder: 3,
        areaKey: B_KEY,
        centreLat: CLUSTER_LAT,
        centreLon: CLUSTER_LON,
      },
    ],
    revisionId: 1,
    bounds: {
      centreLat: 13.2, centreLon: 77.8,
      minLat: 12.85, minLon: 77.45, maxLat: 13.6, maxLon: 78.15,
    },
    descendantAreaKeys: [ISO_KEY, A_KEY, B_KEY],
    areaKey: null,
  };

  const wireByKey: Record<string, unknown> = { root: rootWire, [D_KEY]: directionWire };

  function countsForNode(nodeKey: string) {
    if (nodeKey === D_KEY) {
      const children = [
        { nodeKey: ISO_NODE_KEY, count: isoListingCount, schoolCount: isoSchoolCount, matchingAreaCount: 1 },
        { nodeKey: A_NODE_KEY, count: 8, schoolCount: 3, matchingAreaCount: 1 },
        { nodeKey: B_NODE_KEY, count: 5, schoolCount: 2, matchingAreaCount: 1 },
      ];
      return {
        nodeKey,
        count: isoListingCount + 13,
        schoolCount: (isoSchoolCount ?? 0) + 5,
        areaCounts: {},
        areaSchoolCounts: {},
        children,
        revisionId: 1,
      };
    }
    // 'root' — one DIRECTION child, moderate (low) inventory so Explore
    // paints well within the 172px collision footprint (see the module doc's
    // DEFERRED OBSERVATION note — this fixture never approaches the
    // 206px/240-count scaling ceiling that gap is about).
    return {
      nodeKey,
      count: 19,
      schoolCount: 9,
      areaCounts: {},
      areaSchoolCounts: {},
      children: [{ nodeKey: D_KEY, count: 19, schoolCount: 9, matchingAreaCount: 3 }],
      revisionId: 1,
    };
  }

  return { wireByKey, countsForNode };
}

async function interceptNavigationApi(page: Page, wire: ReturnType<typeof buildWire>) {
  await page.route('**/api/discover/**', (route: Route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ areas: [], markers: [] }) });
  });
  await page.route('**/api/discover/areas**', (route: Route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ city: CITY, areas: [] }) });
  });
  await page.route('**/api/discover/cities/*/navigation/resolve**', (route: Route) => {
    const url = new URL(route.request().url());
    const nodeKey = url.searchParams.get('node') ?? 'root';
    const node = wire.wireByKey[nodeKey];
    if (!node) {
      route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not found' }) });
      return;
    }
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ requested: nodeKey, resolution: 'EXACT', node, revisionId: 1 }),
    });
  });
  await page.route('**/api/discover/cities/*/navigation/*/counts**', (route: Route) => {
    const url = new URL(route.request().url());
    const match = url.pathname.match(/\/navigation\/([^/]+)\/counts$/);
    const nodeKey = match ? decodeURIComponent(match[1]) : 'root';
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(wire.countsForNode(nodeKey)) });
  });
}

async function openScreen(
  page: Page,
  opts: { journey: 'area-first' | 'school-first'; node: 'root' | typeof D_KEY; isoOverrides?: IsoOverrides },
) {
  const wire = buildWire(opts.isoOverrides);
  await interceptNavigationApi(page, wire);
  const nodeParam = opts.node === 'root' ? '' : `&node=${encodeURIComponent(opts.node)}`;
  await page.goto(`/discover?city=${CITY}&journey=${opts.journey}${nodeParam}`);
  await page.waitForLoadState('domcontentloaded');
  const decline = page.getByRole('button', { name: /decline anonymous usage data collection/i });
  if (await decline.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await decline.click();
  }
  // Mobile viewport (390x844): the school/areas journey defaults to the list
  // surface, not the map — same universal control-bar-map-trigger every other
  // mobile map spec in this repo uses (e.g.
  // issue-2149-mobile-school-first-marker-preview.spec.ts) to enter Map mode
  // before any map marker becomes attachable at all.
  const viewportSize = page.viewportSize();
  if (viewportSize && viewportSize.width < 768) {
    const mapTrigger = page.getByTestId('control-bar-map-trigger');
    if (await mapTrigger.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await mapTrigger.click();
      await expect(page.getByTestId('mobile-map-close-list-button')).toBeVisible({ timeout: 10_000 });
    }
  }
}

/** Every locator below is scoped to `area-single-marker`/etc + `data-node-key` — the SAME
 * `data-node-key` attribute is also carried by the right-panel's
 * `navigation-child-card-<nodeKey>` button, so an unscoped `[data-node-key="..."]`
 * selector resolves to TWO elements (map marker + panel row) and trips
 * Playwright's strict-mode violation. */
function exploreLocator(page: Page) {
  return page.locator('[data-testid="area-destination-marker"]');
}
function zoomLocator(page: Page) {
  return page.locator('[data-testid="area-visual-cluster-marker"]');
}
function leafLocator(page: Page) {
  return page.locator(`[data-testid="area-single-marker"][data-node-key="${ISO_NODE_KEY}"]`);
}

function currentNodeParam(page: Page): string | null {
  return new URL(page.url()).searchParams.get('node');
}

/** Union bounding box of the shell PLUS the tail triangle (AC17: never shell alone). */
async function paintedFootprint(marker: ReturnType<typeof exploreLocator>): Promise<{ width: number; height: number }> {
  const shellBox = await marker.locator('.rc-shell').boundingBox();
  const tailBox = await marker.locator('.rc-tail').boundingBox();
  if (!shellBox || !tailBox) {
    throw new Error('shell or tail has no bounding box');
  }
  const left = Math.min(shellBox.x, tailBox.x);
  const top = Math.min(shellBox.y, tailBox.y);
  const right = Math.max(shellBox.x + shellBox.width, tailBox.x + tailBox.width);
  const bottom = Math.max(shellBox.y + shellBox.height, tailBox.y + tailBox.height);
  return { width: right - left, height: bottom - top };
}

for (const viewport of [DESKTOP, MOBILE]) {
  const viewportLabel = viewport === DESKTOP ? 'desktop 1366x768' : 'mobile 390x844';

  test.describe(`@integration-ui #2330 AC16 — Schools plum treatment applies to ALL THREE marker families (${viewportLabel})`, () => {
    test.use(viewport === MOBILE ? { viewport, hasTouch: true, isMobile: true } : { viewport });

    test(`Explore, Zoom in, and View schools all resolve their accent-bearing surface to PLUM_600 (${viewportLabel})`, async ({ page }) => {
      // Explore — root level.
      await openScreen(page, { journey: 'school-first', node: 'root' });
      const explore = exploreLocator(page);
      await expect(explore).toHaveCount(1);
      await expect(explore.locator('.rc-footer')).toHaveCSS('background-color', PLUM_600_RGB);

      // Zoom in + View schools — direction's areas level, same screen.
      await openScreen(page, { journey: 'school-first', node: D_KEY });
      const zoom = zoomLocator(page);
      await expect(zoom).toHaveCount(1);
      const zoomLabel = zoom.locator('.rc-footer span', { hasText: 'Zoom in' });
      await expect(zoomLabel).toHaveCSS('color', PLUM_600_RGB);

      const leaf = leafLocator(page);
      await expect(leaf).toHaveCount(1);
      await expect(leaf.locator('.rc-footer')).toHaveCSS('background-color', PLUM_600_RGB);
      await expect(leaf.locator('.rc-footer')).toContainText('View schools');
    });

    test(`CONTRAST — the SAME three families resolve to COPPER in the Areas journey, never plum (${viewportLabel})`, async ({ page }) => {
      await openScreen(page, { journey: 'area-first', node: 'root' });
      const explore = exploreLocator(page);
      await expect(explore.locator('.rc-footer')).toHaveCSS('background-color', COPPER_500_RGB);

      await openScreen(page, { journey: 'area-first', node: D_KEY });
      const zoomLabel = zoomLocator(page).locator('.rc-footer span', { hasText: 'Zoom in' });
      await expect(zoomLabel).toHaveCSS('color', COPPER_600_RGB);

      const leaf = leafLocator(page);
      await expect(leaf.locator('.rc-footer')).toHaveCSS('background-color', NAVY_800_RGB);
      await expect(leaf.locator('.rc-footer')).toContainText('View homes');
    });
  });

  test.describe(`@integration-ui #2330 AC15 — keyboard focus ring on ALL THREE marker families (${viewportLabel})`, () => {
    test.use(viewport === MOBILE ? { viewport, hasTouch: true, isMobile: true } : { viewport });

    test(`Explore, Zoom in, and View homes each show the composed navy/white focus ring on Tab-equivalent focus (${viewportLabel})`, async ({ page }) => {
      await openScreen(page, { journey: 'area-first', node: 'root' });
      const exploreShell = exploreLocator(page).locator('.rc-shell');
      await exploreLocator(page).focus();
      const exploreShadow = await exploreShell.evaluate((el) => getComputedStyle(el).boxShadow);
      expect(exploreShadow, 'Explore must paint the ring').toContain(PAPER_RGB);
      expect(exploreShadow, 'Explore must paint the ring').toContain(NAVY_800_RGB);
      await exploreLocator(page).evaluate((el) => (el as HTMLElement).blur());

      await openScreen(page, { journey: 'area-first', node: D_KEY });
      const zoomShell = zoomLocator(page).locator('.rc-shell');
      await zoomLocator(page).focus();
      const zoomShadow = await zoomShell.evaluate((el) => getComputedStyle(el).boxShadow);
      expect(zoomShadow, 'Zoom in must paint the ring').toContain(PAPER_RGB);
      expect(zoomShadow, 'Zoom in must paint the ring').toContain(NAVY_800_RGB);
      await zoomLocator(page).evaluate((el) => (el as HTMLElement).blur());

      const leafShell = leafLocator(page).locator('.rc-shell');
      await leafLocator(page).focus();
      const leafShadow = await leafShell.evaluate((el) => getComputedStyle(el).boxShadow);
      expect(leafShadow, 'View homes must paint the ring — R2, previously ungated').toContain(PAPER_RGB);
      expect(leafShadow, 'View homes must paint the ring — R2, previously ungated').toContain(NAVY_800_RGB);
      await leafLocator(page).evaluate((el) => (el as HTMLElement).blur());

      // Blur clears cleanly — never a permanent ring on any of the three.
      const blurredLeafShadow = await leafShell.evaluate((el) => getComputedStyle(el).boxShadow);
      expect(blurredLeafShadow).not.toContain(PAPER_RGB);
    });
  });

  test.describe(`@integration-ui #2330 AC17 — painted marker bounds (shell + tail) fit the declared footprint (${viewportLabel})`, () => {
    test.use(viewport === MOBILE ? { viewport, hasTouch: true, isMobile: true } : { viewport });

    test(`View homes / View schools leaf paints within 172x140 in both journeys (${viewportLabel})`, async ({ page }) => {
      await openScreen(page, { journey: 'area-first', node: D_KEY });
      const areasLeafFootprint = await paintedFootprint(leafLocator(page));
      expect(areasLeafFootprint.width, 'leaf painted width must fit AREA_CARD_FOOTPRINT_WIDTH_PX (172)').toBeLessThanOrEqual(172);
      expect(areasLeafFootprint.height, 'leaf painted height must fit the 140px reference').toBeLessThanOrEqual(140);

      await openScreen(page, { journey: 'school-first', node: D_KEY });
      const schoolsLeafFootprint = await paintedFootprint(leafLocator(page));
      expect(schoolsLeafFootprint.width).toBeLessThanOrEqual(172);
      expect(schoolsLeafFootprint.height).toBeLessThanOrEqual(140);
    });

    test(`Explore and Zoom in at ordinary (low/moderate) inventory paint no WIDER than 172px (${viewportLabel})`, async ({ page }) => {
      // Explore/Zoom's WIDTH is the one dimension AC17/D1 actually govern via
      // a shared footprint relationship (VISUAL_CLUSTER_CARD_WIDTH_PX is the
      // clustering collision-footprint input both call sites are floored
      // against) — HEIGHT is not a documented painted-height ceiling for
      // these two families the way AREA_CARD_FOOTPRINT_HEIGHT_PX is for the
      // leaf (Explore's identity section can legitimately run a 2-line name +
      // hero row + pill, taller than the leaf's simpler content), so this
      // test asserts width only, never height, for Explore/Zoom.
      //
      // Explore — single member, low inventory (well under this fixture's
      // moderate 19-listing root count).
      await openScreen(page, { journey: 'area-first', node: 'root' });
      const exploreFootprint = await paintedFootprint(exploreLocator(page));
      expect(exploreFootprint.width, 'Explore at ordinary inventory must fit within 172px — see module doc DEFERRED OBSERVATION for the wide-card gap this deliberately does not exercise').toBeLessThanOrEqual(172);

      // Zoom in — 2-member cluster, 13 total listings (well under the
      // 150px-206px combined range's scaling ceiling).
      await openScreen(page, { journey: 'area-first', node: D_KEY });
      const zoomFootprint = await paintedFootprint(zoomLocator(page));
      expect(zoomFootprint.width, 'Zoom in at ordinary inventory must fit within 172px').toBeLessThanOrEqual(172);
    });
  });
}

test.describe('@integration-ui #2330 content cases — long name, singular/plural, known-zero, unavailable count', () => {
  test.use({ viewport: DESKTOP });

  test('a long two-line area name clamps visually but the full name is preserved in the accessible name (title/aria-label)', async ({ page }) => {
    const LONG_NAME = 'Really Very Extremely Long Bangalore Locality Name';
    await openScreen(page, { journey: 'area-first', node: D_KEY, isoOverrides: { displayLabel: LONG_NAME } });
    const leaf = leafLocator(page);
    await expect(leaf).toBeVisible();
    await expect(leaf).toHaveAttribute('aria-label', new RegExp(LONG_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    const nameSpan = leaf.locator('.rc-shell [style*="line-clamp"]');
    await expect(nameSpan).toBeVisible();
    const visibleText = await nameSpan.textContent();
    expect(visibleText).not.toBe(LONG_NAME);
  });

  test('singular "1 listing" renders for a leaf with exactly one listing', async ({ page }) => {
    await openScreen(page, { journey: 'area-first', node: D_KEY, isoOverrides: { listingCount: 1, schoolCount: 2 } });
    const leaf = leafLocator(page);
    // The hero digit and its uppercase unit label are separate adjacent
    // `<span>`s with no whitespace text node between them (e.g.
    // "1LISTING2 schools..."), so a `\b`-anchored regex can never match at
    // the digit/letter junction — plain (case-insensitive) substring checks
    // are used instead, never word-boundary regexes, against this markup.
    await expect(leaf).toContainText('1');
    await expect(leaf).toContainText(/LISTING/i);
    await expect(leaf).not.toContainText(/LISTINGS/i);
  });

  test('plural "N listings" renders for a leaf with more than one listing', async ({ page }) => {
    await openScreen(page, { journey: 'area-first', node: D_KEY, isoOverrides: { listingCount: 6, schoolCount: 2 } });
    const leaf = leafLocator(page);
    await expect(leaf).toContainText(/LISTINGS/i);
  });

  test('known "0 schools" renders explicitly for a leaf in the Schools journey — never omitted', async ({ page }) => {
    await openScreen(page, { journey: 'school-first', node: D_KEY, isoOverrides: { schoolCount: 0, listingCount: 5 } });
    const leaf = leafLocator(page);
    await expect(leaf).toBeVisible();
    // Same adjacent-span caveat as the listing singular/plural case above —
    // the hero "0" and "SCHOOLS" spans have no whitespace between them.
    await expect(leaf).toContainText('0');
    await expect(leaf).toContainText(/schools?/i);
  });

  test('an unavailable (null) secondary count is omitted entirely — never a fabricated "0"', async ({ page }) => {
    await openScreen(page, { journey: 'area-first', node: D_KEY, isoOverrides: { schoolCount: null, listingCount: 6 } });
    const leaf = leafLocator(page);
    await expect(leaf).toBeVisible();
    // The leaf's SECONDARY line (school count, in the Areas journey) must be
    // entirely absent — no "0 schools" fabricated for a genuinely unknown
    // count (contrast with the known-zero case above, which DOES render "0").
    await expect(leaf).not.toContainText(/schools?/i);
  });
});

test.describe('@integration-ui #2330 activation traces — Explore/Zoom/View-homes preserve their existing navigation semantics', () => {
  test.use({ viewport: DESKTOP });

  test('Explore: clicking updates node= to the DIRECTION and reveals its AREA-level children', async ({ page }) => {
    await openScreen(page, { journey: 'area-first', node: 'root' });
    expect(currentNodeParam(page)).toBeNull();
    const box = await exploreLocator(page).boundingBox();
    if (!box) throw new Error('Explore marker has no bounding box');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.up();
    await expect.poll(() => currentNodeParam(page)).toBe(D_KEY);
    // The previous (root/directions) level's own marker is gone; the new
    // level's markers (leaf + cluster) are present.
    await expect(exploreLocator(page)).toHaveCount(0);
    await expect(zoomLocator(page)).toHaveCount(1);
    await expect(leafLocator(page)).toHaveCount(1);
  });

  test('Zoom in: clicking changes ONLY camera/focus state — URL node= and window.history length stay byte-identical', async ({ page }) => {
    await openScreen(page, { journey: 'area-first', node: D_KEY });
    const before = { node: currentNodeParam(page), historyLength: await page.evaluate(() => window.history.length) };

    const box = await zoomLocator(page).boundingBox();
    if (!box) throw new Error('Zoom marker has no bounding box');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.up();

    // Presentation-only: the cluster-focus panel opens (a real, effective
    // click), proving this is not a no-op that would trivially leave node=
    // unchanged.
    await expect(page.getByTestId('areas-cluster-focus-panel')).toBeVisible({ timeout: 10_000 });

    const after = { node: currentNodeParam(page), historyLength: await page.evaluate(() => window.history.length) };
    expect(after.node, 'Zoom in must never write node=').toBe(before.node);
    expect(after.historyLength, 'Zoom in must never push/replace history').toBe(before.historyLength);
    // Zoom in's own click ALSO sets `focusedClusterMemberAreaKeys` to just
    // its own [A_KEY, B_KEY] (AreaMarkerLayer.tsx's cluster-focus scoping),
    // which legitimately narrows the 'areas' level render to ONLY that
    // cluster's members until focus clears — the isolated leaf is expected
    // to disappear from the map here, by design; this is a real,
    // intentional presentation-only narrowing, not a regression, so it is
    // deliberately NOT asserted against in either direction by this test.
    // The cluster itself is still the SAME 2-member cell (unchanged by the
    // click) and is still rendered.
    await expect(zoomLocator(page)).toHaveCount(1);
  });

  test('View homes: clicking selects the real AREA leaf (node= becomes its areaKey) and the previous level\'s markers are gone', async ({ page }) => {
    await openScreen(page, { journey: 'area-first', node: D_KEY });
    await expect(leafLocator(page)).toHaveCount(1);

    const box = await leafLocator(page).boundingBox();
    if (!box) throw new Error('leaf marker has no bounding box');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.up();

    await expect.poll(() => currentNodeParam(page)).toBe(ISO_NODE_KEY);
    // F1 guard (AreaMarkerLayer.tsx) — the previous areas-level markers
    // (leaf + cluster) must be gone, not merely covered, once the level
    // changes to listings.
    await expect(leafLocator(page)).toHaveCount(0);
    await expect(zoomLocator(page)).toHaveCount(0);
  });
});
