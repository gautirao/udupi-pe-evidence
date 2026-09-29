/** Evidence capture for the single-row desktop Discover shared header; run once against merge-base (BEFORE) and once against HEAD (AFTER) with different CAPTURE_LABEL/CAPTURE_OUT_DIR. Dealer/Admin skip cleanly when BROKER_EMAIL/PASSWORD or ADMIN_EMAIL/PASSWORD are absent from .env.e2e. */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LABEL = process.env.CAPTURE_LABEL ?? 'before';
const OUT_DIR = process.env.CAPTURE_OUT_DIR
  ? path.resolve(process.env.CAPTURE_OUT_DIR)
  : path.resolve(__dirname, '../docs/pr-evidence/issue-2728');
fs.mkdirSync(OUT_DIR, { recursive: true });

const DISCOVER_PATH = '/discover?city=bangalore';

// Must match DISCOVER_HEADER_HOSTS_CONTROLS_MIN_WIDTH in useDiscoverHeaderHostsControls.ts (duplicated — this spec can't import frontend source).
const HOSTS_CONTROLS_MIN_WIDTH = 1366;

function hasStorageState(filePath: string): boolean {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as { cookies?: unknown[]; origins?: unknown[] };
    return (raw.cookies?.length ?? 0) > 0 || (raw.origins?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

/** Real-layout leaf-control assertions for the collapsed desktop header — a container-box probe over direct children is blind to a shrunk-below-content item whose text paints over the next sibling, so this measures LEAF controls and container overflow directly. */
async function assertSingleRowHeader(page: import('@playwright/test').Page) {
  const LEAF_SELECTORS = [
    '[data-testid="control-bar-city-select"] button',
    '[data-testid="intent-selector-buy"]',
    '[data-testid="intent-selector-rent"]',
    '[data-testid="control-bar-area-input"]',
    '[data-testid="discover-header-journey-tab-area-first"]',
    '[data-testid="discover-header-journey-tab-school-first"]',
    '[data-testid="discover-header-journey-tab-agri-first"]',
    '[data-testid="role-actions-overflow-trigger"]',
    'a:has-text("List property")',
    'a:has-text("Sign in")',
    '[data-testid="user-menu"]',
    'button[aria-label*="Notification" i]',
  ];

  const header = page.locator('header').first();
  const leafBoxes: Array<{ selector: string; top: number; left: number; right: number; bottom: number; width: number; height: number }> = [];
  for (const selector of LEAF_SELECTORS) {
    const loc = header.locator(selector).first();
    if ((await loc.count()) === 0) continue;
    const box = await loc.boundingBox();
    if (!box || box.width === 0 || box.height === 0) continue;
    leafBoxes.push({
      selector,
      top: box.y,
      left: box.x,
      right: box.x + box.width,
      bottom: box.y + box.height,
      width: box.width,
      height: box.height,
    });
  }

  expect(leafBoxes.length).toBeGreaterThan(0);
  // Compare vertical CENTERS, not raw tops: an `items-center` row legitimately
  // has children of different heights whose tops differ even though the row
  // itself never wraps.
  const centers = leafBoxes.map((b) => b.top + b.height / 2);
  expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(10);

  // Every leaf must be fully reachable inside the viewport — a non-overlapping
  // bounding box is not enough if that box itself sits past the right edge
  // (e.g. "Sign in" pushed off-screen with only "Sig" visible).
  const viewportWidth = page.viewportSize()?.width ?? 0;
  for (const b of leafBoxes) {
    if (b.left < 0 || b.right > viewportWidth) {
      throw new Error(`Header leaf out of viewport: "${b.selector}" (${JSON.stringify(b)}) vs viewport width ${viewportWidth}`);
    }
  }

  for (let i = 0; i < leafBoxes.length; i++) {
    for (let j = i + 1; j < leafBoxes.length; j++) {
      const a = leafBoxes[i];
      const b = leafBoxes[j];
      const intersects = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      if (intersects) {
        throw new Error(`Header leaf overlap: "${a.selector}" (${JSON.stringify(a)}) intersects "${b.selector}" (${JSON.stringify(b)})`);
      }
    }
  }

  // A flex container whose content is wider than its own box is the direct
  // signature of an unprotected item shrinking below its text's natural
  // width — the exact bug the leaf-overlap check above catches visually.
  const overflowingContainers = await header.evaluate(() => {
    const selectors = [
      'div[aria-label="Role actions"]',
      '[data-testid="discover-header-journey-tabs"]',
      '[data-testid="discover-control-bar"]',
    ];
    return selectors
      .map((sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        return { selector: sel, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
      })
      .filter((r): r is { selector: string; scrollWidth: number; clientWidth: number } => r != null && r.scrollWidth > r.clientWidth + 1);
  });
  expect(overflowingContainers).toEqual([]);

  const searchInput = page.getByTestId('control-bar-area-input');
  if (await searchInput.count()) {
    const box = await searchInput.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(240);
  }
}

/** Below the header's width threshold the panel owns the control bar instead (matches main) — assert it's visible there and absent from the header. */
async function assertControlBarHostedByPanel(page: import('@playwright/test').Page) {
  const panelControlBar = page.locator('[data-testid="discover-right-panel"] [data-testid="discover-control-bar"], [data-testid="discover-areas-journey-panel-shell"] [data-testid="discover-control-bar"]').first();
  await expect(panelControlBar).toBeVisible();
  await expect(page.locator('header [data-testid="discover-control-bar"]')).toHaveCount(0);
  await expect(page.locator('header [data-testid="discover-header-journey-tabs"]')).toHaveCount(0);
}

/** Counts of the panel's full-card switcher vs. the header's compact tabs, and any region-guide ring/helper instance in either location — used both by the sole-selector landing checks and the resize sweep. */
async function selectorCounts(page: import('@playwright/test').Page) {
  const panelSwitcher = page.locator('[data-testid="journey-switcher-section"]');
  const headerTabs = page.locator('[data-testid="discover-header-journey-tabs"]');
  const controlBar = page.locator('[data-testid="discover-control-bar"]');
  const panelCards = page.locator('[data-testid^="journey-card-"]');
  const summaryStrip = page.locator('[data-testid="journey-metadata-strip"]');

  const countVisible = async (loc: import('@playwright/test').Locator) => {
    const n = await loc.count();
    let visible = 0;
    for (let i = 0; i < n; i++) {
      if (await loc.nth(i).isVisible()) visible++;
    }
    return visible;
  };

  return {
    panelSwitcherVisible: await countVisible(panelSwitcher),
    headerTabsVisible: await countVisible(headerTabs),
    controlBarVisible: await countVisible(controlBar),
    panelCardsVisible: await countVisible(panelCards),
    // The "9 areas · 21 properties · Locality insights" (and school/agri
    // equivalents) strip used to live only inside the panel's own
    // JourneySwitcher; extracted to JourneySummaryStrip so it survives
    // standalone wherever the switcher is hidden.
    summaryStripVisible: await countVisible(summaryStrip),
    // Split panel vs. header so a caller can assert the exact base evidence
    // (see useDiscoverRegionGuideController.ts: the ring/helper fire "only on
    // an actual map/panel pick, never on deep-link/refresh" — a plain
    // page.goto() IS a deep-link, so BOTH read 0 on a fresh landing; nothing
    // "moved to the header" at cold load — see the landing test below).
    panelRegionGuideVisible: await countVisible(page.locator('[data-testid="region-guide-helper"]')),
    headerRegionGuideVisible: await countVisible(
      page.locator('[data-testid="discover-header-region-guide-helper"]'),
    ),
  };
}

test.describe('header is the sole journey selector at >=1366px', () => {
  // `expectedStrip` — whether BASE shows the JourneySummaryStrip at this exact
  // journey's bare-landing URL: area-first/school-first land at their
  // city-root (non-compact) state, which always carried the strip.
  // agri-first's bare landing resolves to legacy `agri-landing` panelContent
  // (never `guided-entry`), which was ALREADY compact/stripless in base — see
  // RightPanelFrame's `compact = isMobileShell || panelContent !== 'guided-entry'`
  // and discoverPanelState.ts's agri-first branch. So agri-first here expects 0,
  // not a lost-content regression.
  const journeyLandings: Array<{ journey: string; routePath: string; expectedStrip: 0 | 1 }> = [
    { journey: 'area-first', routePath: `${DISCOVER_PATH}`, expectedStrip: 1 },
    { journey: 'school-first', routePath: `${DISCOVER_PATH}&journey=school-first`, expectedStrip: 1 },
    { journey: 'agri-first', routePath: `${DISCOVER_PATH}&journey=agri-first`, expectedStrip: 0 },
  ];

  for (const { journey, routePath, expectedStrip } of journeyLandings) {
    test(`${journey} landing at 1366x768 — no panel switcher, header tabs visible, guidance not duplicated, summary strip content preserved`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: HOSTS_CONTROLS_MIN_WIDTH, height: 768 });
      await page.goto(routePath, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2500);

      const counts = await selectorCounts(page);
      expect(counts.panelSwitcherVisible, 'panel JourneySwitcher must not mount at >=1366px').toBe(0);
      expect(counts.panelCardsVisible, 'panel journey-card-* must not mount at >=1366px').toBe(0);
      expect(counts.headerTabsVisible, 'header journey tabs must be the sole selector').toBe(1);
      // EVIDENCE (read from base, not guessed): the ring/helper are keyed by
      // `regionSelectSource !== 'deeplink'` in
      // useDiscoverRegionGuideController.ts, whose own doc comment states
      // they fire "only on an actual map/panel pick, never on deep-link/
      // refresh". A plain page.goto() to this bare journey URL IS a
      // deep-link/refresh, so base shows ZERO ring/helper instances here —
      // in EITHER location — not "moved from panel to header". Asserting
      // exactly 0 for both (rather than <=1 total) is the non-vacuous form:
      // it would fail if either location incorrectly showed a stray instance
      // on cold load, which <=1 could not have caught.
      expect(counts.panelRegionGuideVisible, 'panel region-guide helper must be absent on a cold landing').toBe(0);
      expect(counts.headerRegionGuideVisible, 'header region-guide helper must be absent on a cold landing').toBe(0);
      expect(
        counts.summaryStripVisible,
        `expected the ${journey} summary strip to appear exactly ${expectedStrip} time(s) at 1366px (matching base)`,
      ).toBe(expectedStrip);

      // Below the header-hosting width the panel owns the switcher again, which
      // renders the SAME strip itself — assert it still appears exactly once
      // there too (never 0, never duplicated against a stray standalone copy).
      await page.setViewportSize({ width: 900, height: 768 });
      await page.waitForTimeout(500);
      const counts900 = await selectorCounts(page);
      expect(
        counts900.summaryStripVisible,
        `expected the ${journey} summary strip to appear exactly ${expectedStrip} time(s) at 900px too`,
      ).toBe(expectedStrip);
      await page.setViewportSize({ width: HOSTS_CONTROLS_MIN_WIDTH, height: 768 });
      await page.waitForTimeout(500);

      await page.screenshot({
        path: path.join(OUT_DIR, `${LABEL}-buyer-${journey}-1366x768.png`),
        fullPage: false,
      });
    });
  }
});

async function runResizeSweep(page: import('@playwright/test').Page) {
  await page.setViewportSize({ width: HOSTS_CONTROLS_MIN_WIDTH, height: 768 });
  await page.goto(DISCOVER_PATH, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  const widths = [1365, 1366, 1365, 900, 1440, 900];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 768 });
    await expect
      .poll(async () => (await selectorCounts(page)).controlBarVisible, {
        message: `expected exactly one visible discover-control-bar at ${width}px`,
        timeout: 8_000,
      })
      .toBe(1);

    const counts = await selectorCounts(page);
    const selectorTotal = counts.headerTabsVisible + counts.panelSwitcherVisible;
    expect(
      selectorTotal,
      `expected exactly one journey selector at ${width}px (header XOR panel), got ${JSON.stringify(counts)}`,
    ).toBe(1);
    if (width >= HOSTS_CONTROLS_MIN_WIDTH) {
      expect(counts.headerTabsVisible, `expected header tabs (not panel switcher) at ${width}px`).toBe(1);
    } else {
      expect(counts.panelSwitcherVisible, `expected panel switcher (not header tabs) at ${width}px`).toBe(1);
    }
  }
}

test.describe('resize sweep (owner-required)', () => {
  test('buyer (anon) — resize 1366 -> 1365 -> 1366 -> 1365 -> 900 -> 1440 -> 900 never shows 0 or 2 selectors', async ({
    page,
  }) => {
    await runResizeSweep(page);
  });
});

test.describe('resize sweep, dealer', () => {
  const storageStatePath = path.join(__dirname, 'fixtures', 'broker-auth.json');
  test.use({ storageState: storageStatePath });

  test('dealer — same resize sweep', async ({ page }) => {
    test.skip(!hasStorageState(storageStatePath), 'No BROKER_EMAIL/BROKER_PASSWORD auth state available.');
    await runResizeSweep(page);
  });
});

test.describe('buyer (no auth)', () => {
  test('capture buyer viewports', async ({ page }) => {
    const viewports: Array<{ w: number; h: number; name: string }> = [
      { w: 1440, h: 900, name: '1440x900' },
      { w: 390, h: 844, name: '390x844' },
      { w: 900, h: 768, name: '900x768' },
      { w: HOSTS_CONTROLS_MIN_WIDTH - 1, h: 768, name: `${HOSTS_CONTROLS_MIN_WIDTH - 1}x768` },
      { w: HOSTS_CONTROLS_MIN_WIDTH, h: 768, name: `${HOSTS_CONTROLS_MIN_WIDTH}x768` },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await page.goto(DISCOVER_PATH, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2500);
      await page.screenshot({
        path: path.join(OUT_DIR, `${LABEL}-buyer-${vp.name}.png`),
        fullPage: false,
      });
      if (vp.w === 900 || vp.w === HOSTS_CONTROLS_MIN_WIDTH - 1) {
        await assertControlBarHostedByPanel(page);
      } else if (vp.w >= HOSTS_CONTROLS_MIN_WIDTH) {
        await assertSingleRowHeader(page);
      }
    }
  });
});

test.describe('dealer', () => {
  const storageStatePath = path.join(__dirname, 'fixtures', 'broker-auth.json');
  test.use({ storageState: storageStatePath });

  const dealerViewports: Array<{ w: number; h: number; name: string }> = [
    { w: HOSTS_CONTROLS_MIN_WIDTH, h: 768, name: `${HOSTS_CONTROLS_MIN_WIDTH}x768` },
    { w: 1440, h: 900, name: '1440x900' },
    { w: 900, h: 768, name: '900x768' },
  ];

  for (const vp of dealerViewports) {
    test(`capture dealer viewport ${vp.name}`, async ({ page }) => {
      test.skip(!hasStorageState(storageStatePath), 'No BROKER_EMAIL/BROKER_PASSWORD auth state available — see disclosed gap in PR.');
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await page.goto(DISCOVER_PATH, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2500);
      await page.screenshot({
        path: path.join(OUT_DIR, `${LABEL}-dealer-${vp.name}.png`),
        fullPage: false,
      });
      if (vp.w === 900) {
        await assertControlBarHostedByPanel(page);
      } else {
        await assertSingleRowHeader(page);
      }
    });
  }
});

test.describe('admin', () => {
  const storageStatePath = path.join(__dirname, 'fixtures', 'admin-auth.json');
  test.use({ storageState: storageStatePath });

  const adminViewports: Array<{ w: number; h: number; name: string }> = [
    { w: HOSTS_CONTROLS_MIN_WIDTH, h: 768, name: `${HOSTS_CONTROLS_MIN_WIDTH}x768` },
    { w: 1440, h: 900, name: '1440x900' },
    { w: 900, h: 768, name: '900x768' },
  ];

  for (const vp of adminViewports) {
    test(`capture admin viewport ${vp.name}`, async ({ page }) => {
      test.skip(!hasStorageState(storageStatePath), 'No ADMIN_EMAIL/ADMIN_PASSWORD auth state available — see disclosed gap in PR.');
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await page.goto(DISCOVER_PATH, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2500);
      await page.screenshot({
        path: path.join(OUT_DIR, `${LABEL}-admin-${vp.name}.png`),
        fullPage: false,
      });
      if (vp.w === 900) {
        await assertControlBarHostedByPanel(page);
      } else {
        await assertSingleRowHeader(page);
      }
    });
  }
});

// NOT_RUN: a real-browser capture of the "unresolved preview" desktop state — no fixture seeds a city-launch revision that exists but isn't in the promoted-city list, so it can't be reproduced here; covered instead by the mocked-pending unit test in PublicHeader.previewCity.test.tsx.

// NOT_RUN: a real (non-deeplink) pick-driven region-guide-ring capture. Tried
// clicking the legacy GuidedEntryPanel macro-region cards
// (`[data-testid="guided-entry-regions-grid"]`, whose row click wires
// `onRegionSelectFromPanel` -> `armRegionSelect('panel')`) — confirmed via a
// real-browser run (screenshot on file) that this component never mounts from
// the bare `/discover?city=bangalore` landing: the #2088/#1956 virtual
// journey default routes that URL straight into the CANONICAL
// `AreaFirstJourneyPanel` (city-root `NavigationChildCard` DIRECTION rows,
// e.g. "South-East Bangalore"), which is a structurally different component
// with no macro-region-scope affordance. The other `armRegionSelect` call
// site, `useDiscoverOverviewNavigationController.handleOverviewAreaClick`'s
// `armRegionSelect('map')`, only fires when `mapLayerKind ===
// 'macro-region-bubbles'` — a map presentation state not reached from
// Bangalore's canonical Areas-hierarchy landing either. Reproducing a real
// 'map'/'panel' pick would need either a different seeded city whose
// hierarchy still resolves to the legacy macro-region-bubble overview, or a
// scripted URL walk into that state — both beyond this pass's bounded e2e
// budget. Left NOT_RUN per the task's "don't sink your budget here"
// instruction rather than landing a synthetic (non-real-pick) substitute.
