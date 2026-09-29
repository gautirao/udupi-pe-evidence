/**
 * Evidence capture for Issue #2729 — Discover desktop Results reskin. Modelled on
 * e2e/capture-issue-2728-before-after.spec.ts: run once against merge-base (BEFORE) and once
 * against HEAD (AFTER) with CAPTURE_ARM / CAPTURE_OUT_DIR set differently per run.
 *
 * AFTER-only extras (sticky toolbar, More filters, scope menu, global search idle/draft) are
 * skipped on the BEFORE arm — those surfaces (CompactResultsHeader, filter-pill-*,
 * ScopeActionsMenu) do not exist pre-#2729.
 *
 * Dealer/Admin frames skip cleanly (test.skip) when BROKER_EMAIL/PASSWORD or ADMIN_EMAIL/PASSWORD
 * are absent from .env.e2e (no fixtures/{broker,admin}-auth.json storage state file).
 */
import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { grantDiscoverConsent } from './helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARM = (process.env.CAPTURE_ARM ?? 'after') as 'before' | 'after';
const IS_AFTER = ARM === 'after';
const OUT_DIR = process.env.CAPTURE_OUT_DIR
  ? path.resolve(process.env.CAPTURE_OUT_DIR)
  : path.resolve(__dirname, '../docs/pr-evidence/issue-2729', ARM);
fs.mkdirSync(OUT_DIR, { recursive: true });

const SANJEEVINI_NAGAR_NODE = 'a%3AIN%7CKA%7CBengaluru%7CSanjeevini+Nagar';
const SANJEEVINI_NAGAR_RAREA = 'IN%7CKA%7CBengaluru%7CSanjeevini+Nagar';
const KORAMANGALA_RAREA = 'IN%7CKA%7CBengaluru%7CKoramangala';
const COMMERCIAL_TYPE_PARAM = 'commercial%2Ccommercial_building%2Cwarehouse%2Ccommercial_land';

const SINGLE_AREA_URL = `/discover?city=bangalore&node=${SANJEEVINI_NAGAR_NODE}&rscope=areas&rareas=${SANJEEVINI_NAGAR_RAREA}`;
const COMMERCIAL_URL = `${SINGLE_AREA_URL}&type=${COMMERCIAL_TYPE_PARAM}`;
const MULTI_AREA_URL =
  `/discover?city=bangalore&node=${SANJEEVINI_NAGAR_NODE}&rscope=areas` +
  `&rareas=${SANJEEVINI_NAGAR_RAREA}%2C${KORAMANGALA_RAREA}` +
  `&areaKey=${SANJEEVINI_NAGAR_RAREA}&rprev=areas%3A${SANJEEVINI_NAGAR_RAREA}`;

function hasStorageState(filePath: string): boolean {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as { cookies?: unknown[]; origins?: unknown[] };
    return (raw.cookies?.length ?? 0) > 0 || (raw.origins?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

/** Waits for real listing cards (not the skeleton placeholders) before a shot is taken. */
async function waitForRealCards(page: Page): Promise<void> {
  await expect
    .poll(async () => page.getByTestId('listing-skeleton').count(), { timeout: 20_000 })
    .toBe(0);
  await expect(page.getByTestId('listing-card').first()).toBeVisible({ timeout: 20_000 });
}

interface LayoutProbe {
  toolbarHeight: number | null;
  toolbarSingleLine: boolean | null;
  documentScrollWidth: number;
  documentClientWidth: number;
  horizontalOverflow: boolean;
  firstCardTop: number | null;
  firstCardBottom: number | null;
  innerHeight: number;
  /** bottom <= innerHeight — the card's ENTIRE row fits with no scroll, not merely its top edge. */
  firstCardFullyVisible: boolean | null;
  gridColumnCount: number | null;
  globalSearchValue: string | null;
  /** Element-level overflow probe on the role="toolbar" host itself (which carries its own
   * `overflow-hidden`) — the document-level `horizontalOverflow` check above is blind to content
   * clipped INSIDE an overflow-hidden container that never grows the page's own scrollWidth. */
  toolbarClientWidth: number | null;
  toolbarScrollWidth: number | null;
  /** The toolbar's own visible right edge (its bounding-box right, since it clips at its own
   * border, not at the document edge). */
  toolbarVisibleRight: number | null;
  /** Bounding-box right edge of the toolbar's LAST child (the "More filters" trigger in compact
   * layout) — compared against toolbarVisibleRight to catch it being cut off mid-label. */
  toolbarLastChildRight: number | null;
  toolbarLastChildTestId: string | null;
  /** True when the last child's right edge overshoots the toolbar's own visible right edge, OR
   * the toolbar's scrollWidth exceeds its clientWidth — either is direct evidence of clipping. */
  toolbarLastChildClipped: boolean | null;
}

/** Reads the AFTER-reskin's real DOM layout — not a screenshot pixel-diff — so a regression
 * (toolbar wraps to 2 lines, grid overflows horizontally, first card row hidden below the fold,
 * "More filters" clipped to "More") is provable from numbers, not eyeballing a PNG. */
async function captureLayoutProbe(page: Page): Promise<LayoutProbe> {
  return page.evaluate(() => {
    const toolbarHost =
      document.querySelector('[data-testid="area-filters-sticky"] [role="toolbar"]') ??
      document.querySelector('[role="toolbar"]');
    const toolbarRect = toolbarHost?.getBoundingClientRect() ?? null;
    let toolbarSingleLine: boolean | null = null;
    if (toolbarHost) {
      const tops = Array.from(toolbarHost.children).map(
        (child) => (child as HTMLElement).getBoundingClientRect().top,
      );
      toolbarSingleLine = tops.length > 0 ? Math.max(...tops) - Math.min(...tops) <= 4 : null;
    }
    const doc = document.documentElement;
    const horizontalOverflow = doc.scrollWidth > doc.clientWidth + 1;
    const firstCard = document.querySelector('[data-testid="listing-card"]');
    const firstCardRect = firstCard?.getBoundingClientRect() ?? null;
    const grid = document.querySelector('.area-listings-grid');
    let gridColumnCount: number | null = null;
    if (grid) {
      const style = window.getComputedStyle(grid);
      gridColumnCount = style.gridTemplateColumns.split(' ').filter(Boolean).length;
    }
    const searchInput = document.querySelector(
      '[data-testid="control-bar-area-input"]',
    ) as HTMLInputElement | null;

    let toolbarClientWidth: number | null = null;
    let toolbarScrollWidth: number | null = null;
    let toolbarVisibleRight: number | null = null;
    let toolbarLastChildRight: number | null = null;
    let toolbarLastChildTestId: string | null = null;
    let toolbarLastChildClipped: boolean | null = null;
    if (toolbarHost) {
      const host = toolbarHost as HTMLElement;
      toolbarClientWidth = host.clientWidth;
      toolbarScrollWidth = host.scrollWidth;
      toolbarVisibleRight = toolbarRect ? toolbarRect.right : null;
      const lastChild = host.lastElementChild as HTMLElement | null;
      if (lastChild) {
        const lastRect = lastChild.getBoundingClientRect();
        toolbarLastChildRight = lastRect.right;
        toolbarLastChildTestId = lastChild.getAttribute('data-testid');
        const scrollClips = toolbarScrollWidth != null && toolbarClientWidth != null && toolbarScrollWidth > toolbarClientWidth + 1;
        const rightEdgeClips = toolbarVisibleRight != null && lastRect.right > toolbarVisibleRight + 1;
        toolbarLastChildClipped = scrollClips || rightEdgeClips;
      }
    }

    return {
      toolbarHeight: toolbarRect ? toolbarRect.height : null,
      toolbarSingleLine,
      documentScrollWidth: doc.scrollWidth,
      documentClientWidth: doc.clientWidth,
      horizontalOverflow,
      firstCardTop: firstCardRect ? firstCardRect.top : null,
      firstCardBottom: firstCardRect ? firstCardRect.bottom : null,
      innerHeight: window.innerHeight,
      firstCardFullyVisible: firstCardRect ? firstCardRect.bottom <= window.innerHeight : null,
      gridColumnCount,
      globalSearchValue: searchInput ? searchInput.value : null,
      toolbarClientWidth,
      toolbarScrollWidth,
      toolbarVisibleRight,
      toolbarLastChildRight,
      toolbarLastChildTestId,
      toolbarLastChildClipped,
    };
  });
}

/** Writes the JSON sidecar and, for AFTER desktop (>=1366) frames only, asserts the DoD layout
 * contract. Numbers are ALWAYS written (and printed) even when an assertion below fails — this
 * function intentionally does not soften the assertions to make a bad measurement pass. */
async function recordLayoutProbe(page: Page, name: string, width: number): Promise<void> {
  if (!IS_AFTER) return; // BEFORE has no CompactResultsHeader/filter-toolbar-compact to probe.
  const probe = await captureLayoutProbe(page);
  fs.writeFileSync(path.join(OUT_DIR, `${ARM}-${name}.json`), JSON.stringify(probe, null, 2));
  console.log(`[layout-probe] ${name}:`, JSON.stringify(probe));

  if (width >= 1366) {
    expect(probe.toolbarHeight, `${name}: toolbar must be measurable`).not.toBeNull();
    expect(probe.toolbarHeight ?? Infinity, `${name}: toolbar must stay single-row (<=52px)`).toBeLessThanOrEqual(52);
    expect(probe.horizontalOverflow, `${name}: document must not overflow horizontally`).toBe(false);
    expect(probe.firstCardTop, `${name}: first card must be measurable`).not.toBeNull();
    expect(
      probe.firstCardTop ?? Infinity,
      `${name}: first card row must be visible without scrolling (top < innerHeight)`,
    ).toBeLessThan(probe.innerHeight);
    // Stricter than the top-only check above: the card's whole row must fit, not just start
    // on-screen. NOT loosened — left failing where the real layout doesn't yet satisfy it.
    expect(
      probe.firstCardFullyVisible,
      `${name}: first card row must be FULLY visible (bottom<=innerHeight), not merely started (top<innerHeight); measured firstCardBottom=${probe.firstCardBottom} vs innerHeight=${probe.innerHeight}`,
    ).toBe(true);
    // "More filters" must not be clipped to "More" — element-level overflow probe (document-level
    // horizontalOverflow above cannot see clipping inside the toolbar's own overflow-hidden box).
    expect(
      probe.toolbarLastChildClipped,
      `${name}: toolbar's last child ("${probe.toolbarLastChildTestId}") must not be clipped; lastChildRight=${probe.toolbarLastChildRight} vs toolbarVisibleRight=${probe.toolbarVisibleRight}, toolbarScrollWidth=${probe.toolbarScrollWidth} vs toolbarClientWidth=${probe.toolbarClientWidth}`,
    ).toBe(false);
  }
}

interface OpenSurfaceProbe {
  found: boolean;
  /** getComputedStyle(content).opacity — must read "1" (a settled, fully-opaque Radix
   * open-state), never a fractional value caught mid fade-in. */
  opacity: string | null;
  /** The real z-order check: elementFromPoint at the CENTRE of the content's first item must
   * resolve to an element INSIDE the content — a faint, still-fading popover sitting behind
   * another surface would hit that other surface's element instead, which a bare
   * `toBeVisible()`/opacity check alone cannot catch. */
  elementFromPointInsideContent: boolean | null;
  elementFromPointTag: string | null;
  elementFromPointTestId: string | null;
}

/** Waits for the Radix content element to report `data-state="open"` AND for every running
 * Web Animation on the page to finish, so a screenshot/probe never catches a mid fade-in frame
 * (semi-transparent, or briefly under another stacking context before its own layer settles). */
async function waitForOpenSurfaceSettled(page: Page, contentTestId: string): Promise<void> {
  const content = page.getByTestId(contentTestId);
  await expect(content).toBeVisible();
  await expect(content).toHaveAttribute('data-state', 'open', { timeout: 5_000 });
  await page.waitForFunction(
    () => document.getAnimations().every((a) => a.playState !== 'running'),
    undefined,
    { timeout: 5_000 },
  );
}

/** Reads the settled open-state's opacity and does the real stacking-order check via
 * `elementFromPoint` — not inferred from CSS z-index values (which can be right on paper and
 * still lose the hit-test to a sibling with its own stacking context), but from what the browser
 * itself would actually deliver a click to. */
async function probeOpenSurface(page: Page, contentTestId: string): Promise<OpenSurfaceProbe> {
  return page.evaluate((testId) => {
    const content = document.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null;
    if (!content) {
      return { found: false, opacity: null, elementFromPointInsideContent: null, elementFromPointTag: null, elementFromPointTestId: null };
    }
    const opacity = window.getComputedStyle(content).opacity;
    const firstItem = content.firstElementChild as HTMLElement | null;
    let elementFromPointInsideContent: boolean | null = null;
    let elementFromPointTag: string | null = null;
    let elementFromPointTestId: string | null = null;
    if (firstItem) {
      const rect = firstItem.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(cx, cy);
      elementFromPointInsideContent = hit ? content.contains(hit) : false;
      elementFromPointTag = hit ? hit.tagName : null;
      elementFromPointTestId = hit ? (hit.closest('[data-testid]')?.getAttribute('data-testid') ?? null) : null;
    }
    return { found: true, opacity, elementFromPointInsideContent, elementFromPointTag, elementFromPointTestId };
  }, contentTestId);
}

/** Settles, probes (writing a JSON sidecar under the same name as the PNG), asserts opacity===1
 * and the real elementFromPoint z-order check, THEN screenshots — so the frame and the sidecar
 * describe the exact same settled DOM state. Assertions are NOT loosened: a real z-index defect
 * fails here with the offending element named, rather than being silently screenshotted over. */
async function captureOpenSurface(page: Page, contentTestId: string, frameName: string): Promise<void> {
  await waitForOpenSurfaceSettled(page, contentTestId);
  const probe = await probeOpenSurface(page, contentTestId);
  fs.writeFileSync(path.join(OUT_DIR, `${ARM}-${frameName}.json`), JSON.stringify(probe, null, 2));
  console.log(`[open-surface-probe] ${frameName}:`, JSON.stringify(probe));

  expect(probe.found, `${frameName}: content "${contentTestId}" must be present`).toBe(true);
  expect(probe.opacity, `${frameName}: content must be fully settled (opacity===1), not mid fade-in`).toBe('1');
  expect(
    probe.elementFromPointInsideContent,
    `${frameName}: elementFromPoint at the first item's centre must land INSIDE the content, not on "${probe.elementFromPointTestId ?? probe.elementFromPointTag}" — real stacking-order defect if this fails`,
  ).toBe(true);

  await page.screenshot({ path: path.join(OUT_DIR, `${ARM}-${frameName}.png`), fullPage: false });
}

async function gotoAndCapture(
  page: Page,
  url: string,
  width: number,
  height: number,
  name: string,
): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto(url, { waitUntil: 'networkidle' });
  // Belt-and-suspenders for the storageState-fixture describes (dealer/admin): confirm the
  // viewport actually took effect on THIS page before measuring, rather than trusting
  // setViewportSize silently succeeded — a mismatch here means the bug is real, not measurement
  // noise, and this will time out (visibly) rather than silently probing the wrong size.
  await page.waitForFunction(
    ({ w, h }) => window.innerWidth === w && window.innerHeight === h,
    { w: width, h: height },
    { timeout: 10_000 },
  );
  await waitForRealCards(page);
  await page.screenshot({ path: path.join(OUT_DIR, `${ARM}-${name}.png`), fullPage: false });
  await recordLayoutProbe(page, name, width);
}

test.beforeEach(async ({ page }) => {
  await grantDiscoverConsent(page);
});

test.describe('buyer (anon) — core desktop frames', () => {
  test('single-area Residential Results 1366x768', async ({ page }) => {
    await gotoAndCapture(page, SINGLE_AREA_URL, 1366, 768, 'buyer-single-1366x768');
  });

  test('Commercial Results 1366x768', async ({ page }) => {
    await gotoAndCapture(page, COMMERCIAL_URL, 1366, 768, 'buyer-commercial-1366x768');
  });

  test('multi-area Results 1366x768', async ({ page }) => {
    await gotoAndCapture(page, MULTI_AREA_URL, 1366, 768, 'buyer-multi-1366x768');
  });

  test('buyer Results 1440x900', async ({ page }) => {
    await gotoAndCapture(page, SINGLE_AREA_URL, 1440, 900, 'buyer-1440x900');
  });

  test('mobile regression 390x844 (single-area)', async ({ page }) => {
    await gotoAndCapture(page, SINGLE_AREA_URL, 390, 844, 'buyer-mobile-390x844');
  });

  // Below-threshold regression guard — both arms, both widths.
  test('single-area 1365x768 (just below the 1366 gate)', async ({ page }) => {
    await gotoAndCapture(page, SINGLE_AREA_URL, 1365, 768, 'buyer-single-1365x768');
  });

  test('single-area 900x768', async ({ page }) => {
    await gotoAndCapture(page, SINGLE_AREA_URL, 900, 768, 'buyer-single-900x768');
  });
});

test.describe('dealer/broker — Results 1366x768', () => {
  const storageStatePath = path.join(__dirname, 'fixtures', 'broker-auth.json');
  // Context-level viewport, not just a page.setViewportSize() call after the storageState-loaded
  // context is created — this describe's frame must be comparable (same 1366x768) to the buyer
  // and admin frames, not whatever project default the storageState fixture context started at.
  test.use({ storageState: storageStatePath, viewport: { width: 1366, height: 768 } });

  test('dealer Results 1366x768', async ({ page }) => {
    test.skip(!hasStorageState(storageStatePath), 'No BROKER_EMAIL/BROKER_PASSWORD auth state available.');
    await gotoAndCapture(page, SINGLE_AREA_URL, 1366, 768, 'dealer-1366x768');
  });
});

test.describe('admin — Results 1366x768', () => {
  const storageStatePath = path.join(__dirname, 'fixtures', 'admin-auth.json');
  test.use({ storageState: storageStatePath, viewport: { width: 1366, height: 768 } });

  test('admin Results 1366x768', async ({ page }) => {
    test.skip(!hasStorageState(storageStatePath), 'No ADMIN_EMAIL/ADMIN_PASSWORD auth state available.');
    await gotoAndCapture(page, SINGLE_AREA_URL, 1366, 768, 'admin-1366x768');
  });
});

// ── AFTER-only extras — these surfaces (CompactResultsHeader / filter-pill-* / ScopeActionsMenu /
// sticky area-filters-sticky) do not exist on the BEFORE arm, so these tests are skipped there
// rather than failing on a missing-element timeout that would misreport as an environment issue.
test.describe('AFTER-only extras', () => {
  test.skip(!IS_AFTER, 'AFTER-only: CompactResultsHeader/filter pills/scope menu do not exist pre-#2729.');

  test('sticky toolbar after scrolling the results panel', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(SINGLE_AREA_URL, { waitUntil: 'networkidle' });
    await waitForRealCards(page);
    await page.locator('.area-panel-container').evaluate((el) => {
      el.scrollTop = 600;
    });
    await page.waitForTimeout(300);
    await expect(page.getByTestId('area-filters-sticky')).toBeVisible();
    await page.screenshot({
      path: path.join(OUT_DIR, `${ARM}-buyer-single-1366x768-sticky-scrolled.png`),
      fullPage: false,
    });
  });

  test('"More filters" open', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(SINGLE_AREA_URL, { waitUntil: 'networkidle' });
    await waitForRealCards(page);
    await page.getByTestId('filter-toolbar-more-filters-trigger').click();
    await captureOpenSurface(page, 'filter-toolbar-more-filters-popover', 'buyer-single-1366x768-more-filters-open');
  });

  test('scope menu open — "Edit areas" on multi-area', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(MULTI_AREA_URL, { waitUntil: 'networkidle' });
    await waitForRealCards(page);
    const trigger = page.getByTestId('scope-actions-menu-trigger');
    await expect(trigger).toHaveText(/Edit areas/);
    await trigger.click();
    await captureOpenSurface(page, 'scope-actions-menu-content', 'buyer-multi-1366x768-scope-menu-open');
  });

  test('global search idle showing the canonical area', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(SINGLE_AREA_URL, { waitUntil: 'networkidle' });
    await waitForRealCards(page);
    await expect(page.getByTestId('control-bar-area-input')).toHaveValue('Sanjeevini Nagar');
    await page.screenshot({
      path: path.join(OUT_DIR, `${ARM}-buyer-1366x768-global-search-idle.png`),
      fullPage: false,
    });
  });

  test('global search after typing a draft then Escape (reverted)', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(SINGLE_AREA_URL, { waitUntil: 'networkidle' });
    await waitForRealCards(page);
    const input = page.getByTestId('control-bar-area-input');
    await input.click();
    await input.fill('Koramangala');
    await expect(input).toHaveValue('Koramangala');
    await input.press('Escape');
    await expect(input).toHaveValue('Sanjeevini Nagar');
    await page.screenshot({
      path: path.join(OUT_DIR, `${ARM}-buyer-1366x768-global-search-draft-escape-reverted.png`),
      fullPage: false,
    });
  });
});

test.describe('AFTER-only extras — signed-in single-area "Options" scope menu', () => {
  test.skip(!IS_AFTER, 'AFTER-only: ScopeActionsMenu does not exist pre-#2729.');
  const storageStatePath = path.join(__dirname, 'fixtures', 'broker-auth.json');
  test.use({ storageState: storageStatePath, viewport: { width: 1366, height: 768 } });

  test('scope menu open — "Options" for a signed-in single-area', async ({ page }) => {
    test.skip(!hasStorageState(storageStatePath), 'No BROKER_EMAIL/BROKER_PASSWORD auth state available.');
    await grantDiscoverConsent(page);
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(SINGLE_AREA_URL, { waitUntil: 'networkidle' });
    await waitForRealCards(page);
    const trigger = page.getByTestId('scope-actions-menu-trigger');
    await expect(trigger).toHaveText(/Options/);
    await trigger.click();
    await captureOpenSurface(page, 'scope-actions-menu-content', 'dealer-single-1366x768-scope-menu-open');
  });
});
