/**
 * Issue #2305 Stage 2 — Option-B visual-cluster card skin, real call site.
 *
 * Stage 1 (commit-only, no call site) could only produce a false green — the
 * builder existed but nothing on the map ever rendered it. Stage 2 wires
 * `visualClusterCardHtml` into `makeAreaVisualClusterCard`'s real 'areas'-
 * level call site in `AreaMarkerLayer.tsx`, so the regression this spec must
 * be able to catch is the MARKER RENDERING BROKEN OR BLANK WHILE NEGATIVE
 * ASSERTIONS STILL PASS. Every test below therefore asserts POSITIVELY on
 * concrete rendered structure (hero section, names, numeric count, footer,
 * accent colour) — never presence-of-nothing.
 *
 * ── FIXTURE STRATEGY (mocked navigation API, not live seeded data) ──
 * This spec intercepts `GET .../navigation/resolve` and
 * `GET .../navigation/{node}/counts` — the SAME recipe already proven for
 * this exact `area-visual-cluster-marker` surface in the school-first journey
 * by `e2e/discover-schools-mobile-cluster-2124.spec.ts`. Two AREA children of
 * one DIRECTION are pinned to IDENTICAL centre_lat/centre_lon (co-located),
 * so the client-side pixel-grid clusterer (`areaClustering.ts`) always
 * collapses them into exactly one visual-cluster cell, regardless of zoom or
 * viewport — deterministic across journeys, never dependent on a shared
 * fixture container's live listing counts drifting between sessions (the
 * exact staleness class documented in `issue-1956-pr3-area-clustering.spec.ts`'s
 * own file header). Both members carry non-zero `listingCount` AND
 * `schoolCount` so the fixture forms the SAME cluster under both the
 * residential (`journey=area-first`) and school-first eligibility rules.
 *
 * ── SCOPE ──
 * `AreaDestinationMarkerLayer`'s 'areas' level (a DIRECTION's direct AREA
 * children) — the same call site `makeAreaVisualClusterCard(..., accent,
 * membershipKey, isFocusedSelected, journeyAttr)` in AreaMarkerLayer.tsx
 * where `accent = journey === 'school-first' ? PLUM_600 : COPPER_500` and
 * clicking the cluster sets `isFocusedSelected` (double-ring) via the
 * caller-controlled `focusedClusterMemberAreaKeys` state — never the
 * 'clusters'/'directions' level (no focus concept there).
 */
import { test, expect, type Page, type Route } from '@playwright/test';

const CITY = 'bangalore';

// Hex -> rgb() as a real browser reports it via getComputedStyle, so
// `toHaveCSS` assertions below compare against the SAME format Chromium
// actually returns rather than a hex literal that would never match.
// COPPER_500 = #B05C3A, PLUM_600 = #5E5286, NAVY_800 = #1B2A45, PAPER = #FFFFFF
// (src/components/map/markerTokens.ts — read, not modified, by this spec).
const COPPER_500_RGB = 'rgb(176, 92, 58)';
const PLUM_600_RGB = 'rgb(94, 82, 134)';
const NAVY_800_RGB = 'rgb(27, 42, 69)';
const PAPER_RGB = 'rgb(255, 255, 255)';
// PR #2315 review fix — index.css's hover/focus footer-TINT rgb equivalents
// (COPPER_500_RGB/PLUM_600_RGB above are the accent TEXT colour, a
// different value from these; the tint is the .rc-footer BACKGROUND, not
// its text). #F2E8E1 (index.css:470, residential/generic tint) = rgb(242,
// 232, 225). #DED7EC (index.css:475, schools-journey tint) = rgb(222, 215,
// 236). Read, not modified, by this spec.
const COPPER_100_TINT_RGB = 'rgb(242, 232, 225)';
const PLUM_100_TINT_RGB = 'rgb(222, 215, 236)';

const D_KEY = 'd:mock2305cluster';
const D_LABEL = 'Mock Direction 2305';
const AREA_ALPHA_KEY = 'IN|KA|Bengaluru|MockClusterAreaAlpha2305';
const AREA_ALPHA_NODE_KEY = `a:${AREA_ALPHA_KEY}`;
// Kept under REP_LABEL_TRUNCATE_MAX_CHARS (18 — areaMarkerBucketing.ts) so
// both names render IN FULL, never JS-truncated with an ellipsis — the
// hero-text assertions below need the real, complete label text.
const AREA_ALPHA_LABEL = 'AlphaMock2305';
const AREA_BETA_KEY = 'IN|KA|Bengaluru|MockClusterAreaBeta2305';
const AREA_BETA_NODE_KEY = `a:${AREA_BETA_KEY}`;
const AREA_BETA_LABEL = 'BetaMock2305';
// Co-located deliberately (identical, not merely nearby) — the clusterer
// groups by PROJECTED PIXEL position, so identical lat/lon guarantees a
// single cell at any zoom/viewport this suite runs at.
const CENTRE_LAT = 12.9512;
const CENTRE_LON = 77.5847;

// Non-zero for BOTH count families on BOTH members — visible under the
// residential (listingCount-gated) AND school-first (schoolCount-agnostic,
// per AreaMarkerLayer.tsx's 'schools' visibility special-case) eligibility
// rules alike, so the same two-member fixture clusters identically in both
// journeys under test.
const ALPHA_LISTINGS = 7;
const ALPHA_SCHOOLS = 3;
const BETA_LISTINGS = 5;
const BETA_SCHOOLS = 2;
const TOTAL_LISTINGS = ALPHA_LISTINGS + BETA_LISTINGS; // 12

function rootWire() {
  return {
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
        descendantAreaCount: 2,
        centreLat: CENTRE_LAT,
        centreLon: CENTRE_LON,
      },
    ],
    revisionId: 1,
    bounds: null,
    descendantAreaKeys: null,
    areaKey: null,
  };
}

function directionWire() {
  return {
    nodeKey: D_KEY,
    nodeType: 'DIRECTION',
    displayLabel: D_LABEL,
    depth: 0,
    regionKey: null,
    ancestry: [],
    nextLevelType: 'AREA',
    children: [
      {
        nodeKey: AREA_ALPHA_NODE_KEY,
        nodeType: 'AREA',
        displayLabel: AREA_ALPHA_LABEL,
        displayOrder: 1,
        areaKey: AREA_ALPHA_KEY,
        centreLat: CENTRE_LAT,
        centreLon: CENTRE_LON,
      },
      {
        nodeKey: AREA_BETA_NODE_KEY,
        nodeType: 'AREA',
        displayLabel: AREA_BETA_LABEL,
        displayOrder: 2,
        areaKey: AREA_BETA_KEY,
        centreLat: CENTRE_LAT,
        centreLon: CENTRE_LON,
      },
    ],
    revisionId: 1,
    bounds: {
      centreLat: CENTRE_LAT, centreLon: CENTRE_LON,
      minLat: CENTRE_LAT - 0.01, minLon: CENTRE_LON - 0.01,
      maxLat: CENTRE_LAT + 0.01, maxLon: CENTRE_LON + 0.01,
    },
    descendantAreaKeys: [AREA_ALPHA_KEY, AREA_BETA_KEY],
    areaKey: null,
  };
}

const WIRE_BY_KEY: Record<string, unknown> = {
  root: rootWire(),
  [D_KEY]: directionWire(),
};

function countsForNode(nodeKey: string) {
  const wire = WIRE_BY_KEY[nodeKey] as { children: Array<{ nodeKey: string }> } | undefined;
  const children = (wire?.children ?? []).map((c) => {
    if (c.nodeKey === AREA_ALPHA_NODE_KEY) {
      return { nodeKey: c.nodeKey, count: ALPHA_LISTINGS, schoolCount: ALPHA_SCHOOLS, matchingAreaCount: 1 };
    }
    if (c.nodeKey === AREA_BETA_NODE_KEY) {
      return { nodeKey: c.nodeKey, count: BETA_LISTINGS, schoolCount: BETA_SCHOOLS, matchingAreaCount: 1 };
    }
    return { nodeKey: c.nodeKey, count: TOTAL_LISTINGS, schoolCount: ALPHA_SCHOOLS + BETA_SCHOOLS, matchingAreaCount: 2 };
  });
  const totalListings = children.reduce((sum: number, c: { count: number }) => sum + c.count, 0);
  const totalSchools = children.reduce((sum: number, c: { schoolCount: number }) => sum + c.schoolCount, 0);
  return {
    nodeKey,
    count: totalListings,
    schoolCount: totalSchools,
    areaCounts: {},
    areaSchoolCounts: {},
    children,
    revisionId: 1,
  };
}

async function interceptNavigationApi(page: Page) {
  // Catch-all first (least specific) — anything not explicitly overridden
  // below degrades to an empty, harmless payload rather than hitting a real
  // (and here, absent) backend.
  await page.route('**/api/discover/**', (route: Route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ areas: [], markers: [] }) });
  });

  await page.route('**/api/discover/areas**', (route: Route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ city: CITY, areas: [] }) });
  });

  await page.route('**/api/discover/cities/*/navigation/resolve**', (route: Route) => {
    const url = new URL(route.request().url());
    const nodeKey = url.searchParams.get('node') ?? 'root';
    const wire = WIRE_BY_KEY[nodeKey];
    if (!wire) {
      route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not found' }) });
      return;
    }
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ requested: nodeKey, resolution: 'EXACT', node: wire, revisionId: 1 }),
    });
  });

  await page.route('**/api/discover/cities/*/navigation/*/counts**', (route: Route) => {
    const url = new URL(route.request().url());
    const match = url.pathname.match(/\/navigation\/([^/]+)\/counts$/);
    const nodeKey = match ? decodeURIComponent(match[1]) : 'root';
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(countsForNode(nodeKey)) });
  });
}

async function openDirection(page: Page, journey: 'area-first' | 'school-first') {
  await interceptNavigationApi(page);
  await page.goto(`/discover?city=${CITY}&journey=${journey}&node=${encodeURIComponent(D_KEY)}`);
  await page.waitForLoadState('domcontentloaded');
  const decline = page.getByRole('button', { name: /decline anonymous usage data collection/i });
  if (await decline.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await decline.click();
  }
}

function clusterMarkerLocator(page: Page) {
  return page.locator('[data-testid="area-visual-cluster-marker"]');
}

/**
 * Real synthetic mouse move/down/up at the marker's bounding-box centre —
 * `locator.click()` is unreliable on these markers because Leaflet
 * re-assigns the divIcon's innerHTML on layout-affecting recomputes (proven
 * in `issue-1956-pr3-area-clustering.spec.ts`; reused verbatim here rather
 * than reimplemented).
 */
async function clickMarker(locator: ReturnType<typeof clusterMarkerLocator>): Promise<void> {
  await expect(locator).toBeVisible({ timeout: 15_000 });
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('marker has no bounding box');
  }
  await locator.page().mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await locator.page().mouse.down();
  await locator.page().mouse.up();
}

/**
 * Asserts the full Option-B card structure renders for the given accent —
 * shared by both journey tests below so a card regression in either journey
 * fails the same way.
 */
async function assertOptionBCardStructure(
  page: Page,
  opts: { accentRgb: string },
): Promise<void> {
  const cluster = clusterMarkerLocator(page);
  await expect(cluster, 'exactly one visual cluster forms from the two co-located members').toHaveCount(1);
  await expect(cluster).toBeVisible();

  const shell = cluster.locator('.rc-shell');
  await expect(shell, 'the Option-B card shell must actually paint').toBeVisible();

  // Positive: navy hero section — names legible (both members' labels
  // present, MAX_REPRESENTATIVE_NAMES=2 covers both with no "+N" truncation)
  // and NOT overflowing (real navy background-color proves the shell is
  // real painted markup, not a collapsed/blank div).
  const hero = shell.locator('> div').first();
  await expect(hero).toBeVisible();
  await expect(hero).toHaveCSS('background-color', NAVY_800_RGB);
  await expect(hero).toContainText(AREA_ALPHA_LABEL);
  await expect(hero).toContainText(AREA_BETA_LABEL);

  // Positive: mono hero count + uppercase unit word — the actual SUM of the
  // two members' listing counts, not a placeholder/zero.
  await expect(cluster).toContainText(String(TOTAL_LISTINGS));
  await expect(cluster).toContainText(/listings?/i);
  // Never the zero-count guard phrase (proves the numeric branch rendered).
  await expect(cluster).not.toContainText('No listings yet');

  // Positive: the pill — both members visible, both representative names
  // shown (cap 2, hiddenCount 0) => "2 areas with matches".
  await expect(cluster).toContainText('2 areas with matches');

  // Positive: white "Zoom in" footer, with the journey-correct accent colour
  // on both the footer label AND the tail triangle.
  const footer = shell.locator('.rc-footer');
  await expect(footer).toBeVisible();
  await expect(footer).toHaveCSS('background-color', PAPER_RGB);
  const zoomLabel = footer.locator('span', { hasText: 'Zoom in' });
  await expect(zoomLabel).toBeVisible();
  await expect(zoomLabel).toHaveCSS('color', opts.accentRgb);

  const tail = cluster.locator('.rc-tail');
  await expect(tail, 'the accent-coloured tail triangle must render').toBeVisible();
  await expect(tail).toHaveCSS('border-top-color', opts.accentRgb);
}

test.describe('@integration-ui #2305 Stage 2 — Option-B visual-cluster card renders at the real call site (residential journey)', () => {
  test('the areas-level visual cluster paints the full Option-B card with the COPPER accent', async ({ page }) => {
    await openDirection(page, 'area-first');
    await assertOptionBCardStructure(page, { accentRgb: COPPER_500_RGB });

    // Negative, only after positive structure is proven: the OLD dashed-chip
    // treatment this replaced must be gone.
    const shell = clusterMarkerLocator(page).locator('.rc-shell');
    await expect(shell).not.toHaveCSS('border-style', 'dashed');
  });
});

test.describe('@integration-ui #2305 Stage 2 — Option-B visual-cluster card renders at the real call site (school-first journey)', () => {
  test('the areas-level visual cluster paints the full Option-B card with the PLUM accent', async ({ page }) => {
    await openDirection(page, 'school-first');
    await assertOptionBCardStructure(page, { accentRgb: PLUM_600_RGB });
  });
});

test.describe('@integration-ui #2305 Stage 2 — focused-selected double ring', () => {
  test('tapping the residential cluster sets data-selected and the double-ring shell treatment', async ({ page }) => {
    await openDirection(page, 'area-first');
    const cluster = clusterMarkerLocator(page);
    await assertOptionBCardStructure(page, { accentRgb: COPPER_500_RGB });

    // Baseline (un-focused): plain shell, no data-selected attribute.
    await expect(cluster).not.toHaveAttribute('data-selected', 'true');

    await clickMarker(cluster);

    // The cluster-focus panel really opened (proves the click was a real,
    // effective interaction — not a no-op that would leave the marker in
    // its un-focused state while this test kept asserting anyway).
    await expect(page.getByTestId('areas-cluster-focus-panel')).toBeVisible({ timeout: 10_000 });

    // Positive: the SAME marker (registry keeps identity across re-render)
    // now carries data-selected="true" and its inline style (Chromium
    // serialises the `style` ATTRIBUTE itself back through the CSSOM — hex
    // becomes rgb(), bare "0" becomes "0px" — this asserts against that real
    // serialised form, not the raw literal `visualClusterCardHtml` wrote)
    // contains BOTH box-shadow rings: the 2px white/PAPER gap + 4px
    // NAVY_800 shell.
    await expect(cluster).toHaveAttribute('data-selected', 'true');
    const shellStyle = await cluster.locator('.rc-shell').getAttribute('style');
    expect(shellStyle, 'focused-selected shell must carry the double-ring box-shadow').toContain(
      `${PAPER_RGB} 0px 0px 0px 2px`,
    );
    expect(shellStyle).toContain(`${NAVY_800_RGB} 0px 0px 0px 4px`);
    // Stronger shell border while focused (rgba(27, 42, 69, 0.4) vs the
    // un-focused rgba(27, 42, 69, 0.24) — markerPrimitives.ts's
    // `shellBorderColor`).
    expect(shellStyle).toContain('rgba(27, 42, 69, 0.4)');

    // Move the pointer away AND blur the marker — `clickMarker`'s real mouse
    // move/down/up leaves the cursor resting on the marker (real `:hover`)
    // AND this tabindex=0 div focused (real `:focus-within`), and
    // `src/index.css` legitimately tints the footer copper (residential) /
    // plum (schools) for EITHER state while it holds; re-asserting the
    // REST-state footer background under either state would be testing that
    // hover/focus-tint rule, not this test's actual subject (the
    // double-ring focus-SELECTED treatment, which is driven by
    // `data-selected`/inline box-shadow, not CSS hover/focus).
    await page.mouse.move(10, 10);
    await cluster.evaluate((el) => (el as HTMLElement).blur());

    // The card's own structure (names/count/footer/accent) is unchanged by
    // focusing — re-asserted so this test does not merely infer it from the
    // earlier un-focused assertion.
    await assertOptionBCardStructure(page, { accentRgb: COPPER_500_RGB });
  });
});

/**
 * FIX CYCLE 2 (real-browser QA, post-N3) — index.css:462-466's
 * `.area-visual-cluster-marker-icon [data-testid="area-visual-cluster-marker"]
 * :focus-within .rc-shell { box-shadow: ...!important; }` author rule
 * OUTRANKS a plain (non-`!important`) inline `box-shadow` the moment the
 * REAL stylesheet is loaded — a cascade conflict `AreaMarkerLayer.
 * focusRingTarget.test.tsx` structurally cannot see, since JSDOM never
 * loads `index.css` at all. That gap is exactly how N3's ring regression
 * (keyboard-focus ring silently invisible) shipped past a fully-green unit
 * suite. This describe block is the regression guard for that specific
 * class of defect — it belongs in a real browser, not JSDOM, on purpose.
 */
test.describe('@integration-ui #2305 FIX CYCLE 2 — keyboard-focus ring survives the real CSS !important cascade', () => {
  test('DOM-focusing the residential cluster composes the keyboard-focus ring WITH the CSS hover/focus lift shadow (never silently overridden), and both clear cleanly on blur', async ({ page }) => {
    await openDirection(page, 'area-first');
    const cluster = clusterMarkerLocator(page);
    await assertOptionBCardStructure(page, { accentRgb: COPPER_500_RGB });
    const shell = cluster.locator('.rc-shell');

    // Resting (no focus, no hover): the plain static shadow only — neither
    // ring colour present yet, so the later "focused" assertion is a real
    // state transition, not a tautology.
    const restingShadow = await shell.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(restingShadow).not.toContain(PAPER_RGB);
    expect(restingShadow).not.toContain(NAVY_800_RGB);

    // Real DOM focus — `locator.focus()` dispatches genuine browser focus
    // events (the same events a real Tab keypress fires), so
    // `bindMarkerDom`'s `focus`/`blur` listeners in AreaMarkerLayer.tsx run
    // for real AND the browser recomputes the cascade against the actually
    // loaded index.css — the exact mechanism a real Tab keypress exercises,
    // and the exact thing JSDOM cannot.
    await cluster.focus();
    await expect(cluster).toBeFocused();

    const focusedShadow = await shell.evaluate((el) => getComputedStyle(el).boxShadow);
    // THE REGRESSION THIS TEST CATCHES: before FIX CYCLE 2, the keyboard-
    // focus ring wrote a plain inline `box-shadow`, so `focusedShadow` here
    // would equal ONLY the CSS `!important` lift shadow (identical to
    // `restingShadow`'s hover/focus form) — the ring itself was completely
    // invisible. `setProperty(..., 'important')` is what makes these two
    // assertions actually pass.
    expect(focusedShadow, 'the white 2px ring gap must survive the real CSS cascade').toContain(PAPER_RGB);
    expect(focusedShadow, 'the navy 4px ring must survive the real CSS cascade').toContain(NAVY_800_RGB);
    // COMPOSED, not replaced — the fix must not silently drop the
    // author-stylesheet lift shadow (index.css:465's
    // `0 14px 28px rgba(18, 24, 38, 0.38)`) while adding the ring.
    expect(
      focusedShadow,
      'the CSS lift shadow must still be present, composed alongside the ring, not replaced by it',
    ).toContain('14px 28px');

    // Blur: real browser restore — never a leftover permanent ring (a worse
    // bug than the one this fixes).
    await cluster.evaluate((el) => (el as HTMLElement).blur());
    await expect(cluster).not.toBeFocused();
    const blurredShadow = await shell.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(blurredShadow, 'the ring must fully clear on blur, never a permanent ring').not.toContain(PAPER_RGB);
    expect(blurredShadow, 'the ring must fully clear on blur, never a permanent ring').not.toContain(NAVY_800_RGB);
  });
});

/**
 * PR #2315 review fix — `markerPrimitives.ts:322`'s inner `.rc-shell` used to
 * carry `journeyAttr` (`data-journey="schools"`), while `data-testid=
 * "area-visual-cluster-marker"` (via `shellAttrs`) sits on the OUTER
 * wrapper. `index.css:473-474`'s schools-journey hover/focus footer-tint
 * rule is a COMPOUND selector —
 * `[data-testid="area-visual-cluster-marker"][data-journey="schools"]
 * :hover .rc-footer` — which requires BOTH attributes on the SAME element to
 * ever match. Split across two elements, it could never match: the
 * schools-journey footer silently fell through to the generic COPPER tint
 * (index.css:468-471) on hover/keyboard-focus instead of PLUM. Resting-state
 * background and the accent TEXT colour (asserted elsewhere in this file)
 * are unaffected — this is narrowly the hover/focus TINT.
 *
 * This is a pure CSS cascade fact (a compound selector either matches an
 * element or it structurally cannot) — JSDOM never loads `index.css`, so no
 * unit test can see this defect at all, by construction. Real browser only.
 */
test.describe('@integration-ui #2305 PR #2315 review fix — schools-journey hover footer tint (compound selector)', () => {
  test('school-first: hovering the visual cluster tints .rc-footer PLUM (#DED7EC), never falls through to the generic copper tint', async ({ page }) => {
    await openDirection(page, 'school-first');
    const cluster = clusterMarkerLocator(page);
    await assertOptionBCardStructure(page, { accentRgb: PLUM_600_RGB });
    const footer = cluster.locator('.rc-footer');

    // Resting (no hover yet): neither tint present — the later "hovered"
    // assertion is a real state transition, not a tautology.
    const restingBg = await footer.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(restingBg).not.toBe(PLUM_100_TINT_RGB);
    expect(restingBg).not.toBe(COPPER_100_TINT_RGB);

    const box = await cluster.boundingBox();
    if (!box) {
      throw new Error('marker has no bounding box');
    }
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

    const hoveredBg = await footer.evaluate((el) => getComputedStyle(el).backgroundColor);
    // THE REGRESSION THIS TEST CATCHES: with `journeyAttr` on `.rc-shell`
    // (pre-fix), the compound selector above never matches, and
    // `.rc-footer` instead picks up `index.css:468-471`'s data-journey-
    // agnostic `:hover .rc-footer { background: #F2E8E1 !important; }`
    // rule — i.e. `hoveredBg` would equal `COPPER_100_TINT_RGB` here, on
    // the SCHOOLS journey. Asserting PLUM positively (not merely
    // "not copper") is what makes this test unable to pass on a
    // blank/broken card.
    expect(hoveredBg, 'schools-journey hover must tint the footer PLUM').toBe(PLUM_100_TINT_RGB);
    expect(hoveredBg, 'must never fall through to the generic copper tint').not.toBe(COPPER_100_TINT_RGB);

    await page.mouse.move(10, 10);
  });

  test('CONTRAST CASE — residential journey: hovering the visual cluster tints .rc-footer COPPER (#F2E8E1), discriminating from the schools case above', async ({ page }) => {
    await openDirection(page, 'area-first');
    const cluster = clusterMarkerLocator(page);
    await assertOptionBCardStructure(page, { accentRgb: COPPER_500_RGB });
    const footer = cluster.locator('.rc-footer');

    const box = await cluster.boundingBox();
    if (!box) {
      throw new Error('marker has no bounding box');
    }
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

    const hoveredBg = await footer.evaluate((el) => getComputedStyle(el).backgroundColor);
    // Pairs with the schools-journey test above: the SAME hover mechanism,
    // on the OTHER journey, must resolve to the OTHER tint — proving the
    // two tests genuinely discriminate rather than both happening to pass
    // against a hardcoded/frozen value.
    expect(hoveredBg).toBe(COPPER_100_TINT_RGB);
    expect(hoveredBg).not.toBe(PLUM_100_TINT_RGB);

    await page.mouse.move(10, 10);
  });
});
