/**
 * Issue #2089 (#2133 follow-up, PR #2141) — mobile breadcrumb/List-button flex
 * layout, real-browser proof at a TRUE 390x844 viewport (the implementing
 * agent's own interactive-browser check topped out at ~500px and self-
 * reported that gap — this spec closes it).
 *
 * FIX under test (working tree, not yet pushed):
 *   - `AreasBreadcrumbTrail.tsx` now synthesizes a leading City-root crumb
 *     (`cityLabel` prop) whenever the real ancestry chain's top isn't
 *     already root, linked via the same `buildHref`/`ROOT_NODE_KEY` path
 *     every other ancestor crumb uses.
 *   - `DiscoverMapContextOverlay.tsx` replaced a `max-w-[calc(100vw-176px)]`
 *     shrink hack with a real flex row: the breadcrumb side is
 *     `min-w-0 flex-1`, an invisible `shrink-0` ghost spacer reserves the
 *     real List button's exact footprint (the real button itself lives in
 *     `MapDiscovery.tsx`, untouched by this fix), and a
 *     `pointer-events-none`/`pointer-events-auto` split stops the spacer
 *     from swallowing clicks meant for the real button underneath.
 *   - `DiscoverMapBreadcrumb.tsx`'s `<ol>` changed from `overflow-hidden` to
 *     `flex flex-wrap`, so a long/deep trail wraps onto a second line
 *     instead of being silently clipped.
 *
 * ── FIXTURE ──
 * Reuses the committed, idempotent
 * `scripts/db/fixtures/navigation-hierarchy-fixture-seed.sql` (Issue #1956
 * PR-5) against the local fixture backend (`scripts/dev/local-fixture-
 * backend.sh`, port 8087 per this session's live port probe — NOT the
 * hosted-dev-DB stack on 5174/8085, which does not carry this fixture
 * shape). That seed's own header documents the `d:northeast` tree
 * (`North-East Bangalore` -> `Kannamangala - Hoskote Corridor` Local
 * Destination CLUSTER -> `Kannamangala - Whitefield Hoskote Road` AREA leaf)
 * as EXISTING PRECISELY so a real, full-depth City > Direction > Local
 * Destination > Area 4-crumb trail with a genuinely long (39-char) terminal
 * label is reachable for exactly this un-clipping/wrap assertion — see that
 * file's own comment ("a genuinely hard case for AC5.9's un-clipped-at-
 * 390x844 assertion, never the shortest available fixture name"). This spec
 * is the first to drive that exact fixture path through the NEW flex layout
 * (issue-2086-bangalore-area-hierarchy.spec.ts exercises the same tree for
 * drill-down/back-button behaviour, not this layout).
 *
 * Run:
 *   PLAYWRIGHT_BASE_URL=http://localhost:5173 npx playwright test \
 *     e2e/discover/issue-2089-breadcrumb-list-flex-layout.spec.ts --project=full
 */
import { test, expect, type Page } from '@playwright/test';

const CITY = 'bangalore';
const BASE = `city=${CITY}&journey=area-first`;
const MOBILE_VIEWPORT = { width: 390, height: 844 };

// Full-depth City > Direction > Local Destination > Area leaf (4 crumbs,
// long terminal label) — see module doc / fixture seed header.
const AREA_KANNAMANGALA = 'a:IN|KA|Bengaluru|Kannamangala - Whitefield Hoskote Road';
// Shallow DIRECTION node with no CLUSTER ancestor — resolves to a 2-crumb
// trail (synthesized City root + itself), used as the single-line reference
// for the wrap assertion below.
const D_SOUTHEAST = 'd:southeast';

async function grantTelemetryConsent(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem('discover_telemetry_consent', 'granted');
  });
}

/** Navigates straight to a node and opens the mobile full-screen Map overlay (real click on the control-bar trigger, not a deep-link substitute). */
async function gotoNodeMapMode(page: Page, nodeKey: string): Promise<void> {
  await page.goto(`/discover?${BASE}&node=${encodeURIComponent(nodeKey)}`);
  await page.waitForLoadState('domcontentloaded');

  const mapTrigger = page.getByTestId('control-bar-map-trigger');
  await expect(mapTrigger).toBeVisible({ timeout: 20_000 });
  await mapTrigger.click();
  await expect(page.getByTestId('mobile-map-close-list-button')).toBeVisible({ timeout: 10_000 });
}

function currentNodeParam(page: Page): string | null {
  return new URL(page.url()).searchParams.get('node');
}

test.describe('@integration-ui #2089 — mobile breadcrumb/List-button flex layout at 390x844', () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test.beforeEach(async ({ page }) => {
    await grantTelemetryConsent(page);
  });

  test('deep 4-crumb trail renders with no horizontal page overflow at exactly 390px', async ({
    page,
  }) => {
    await gotoNodeMapMode(page, AREA_KANNAMANGALA);

    const breadcrumb = page.getByTestId('areas-breadcrumb-trail');
    await expect(breadcrumb).toBeVisible();
    // All 4 real crumbs resolved — City (synthesized), Direction, Local
    // Destination, and the long terminal AREA label — never silently
    // dropped by the flex/wrap rework.
    await expect(breadcrumb).toHaveText(/Bangalore/);
    await expect(breadcrumb).toHaveText(/North-East Bangalore/);
    await expect(breadcrumb).toHaveText(/Kannamangala - Hoskote Corridor/);
    await expect(breadcrumb).toHaveText(/Kannamangala - Whitefield Hoskote Road/);
    // The AC5.1 depth-guard alert must never fire for this in-bounds chain.
    await expect(page.getByTestId('areas-breadcrumb-depth-guard')).toHaveCount(0);

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(overflow.innerWidth, 'sanity: viewport is really 390px wide').toBe(390);
    expect(
      overflow.scrollWidth,
      `document.documentElement.scrollWidth (${overflow.scrollWidth}) must not exceed the 390px viewport — a real horizontal-overflow regression`,
    ).toBeLessThanOrEqual(overflow.innerWidth);
  });

  test('a deep/long trail wraps onto a second line; a shallow 2-crumb trail stays single-line', async ({
    page,
  }) => {
    await gotoNodeMapMode(page, D_SOUTHEAST);
    const shallowBox = await page
      .getByTestId('areas-breadcrumb-trail')
      .locator('ol')
      .boundingBox();
    expect(shallowBox, 'shallow trail has a layout box').not.toBeNull();

    await gotoNodeMapMode(page, AREA_KANNAMANGALA);
    const deepBox = await page.getByTestId('areas-breadcrumb-trail').locator('ol').boundingBox();
    expect(deepBox, 'deep trail has a layout box').not.toBeNull();

    // `flex-wrap` (DiscoverMapBreadcrumb.tsx fix) lets the 4-item, long-label
    // trail wrap onto a second line rather than being clipped by the old
    // `overflow-hidden` — its own rendered height must genuinely grow versus
    // the single-line shallow case, not just stay the same (silent clip).
    expect(
      deepBox!.height,
      `deep 4-crumb trail height (${deepBox!.height}px) must exceed the shallow single-line trail height (${shallowBox!.height}px) — proof it wrapped instead of clipping`,
    ).toBeGreaterThan(shallowBox!.height * 1.3);
  });

  test('the List button hit-tests to itself (never the breadcrumb/spacer) and a real click switches back to List mode', async ({
    page,
  }) => {
    await gotoNodeMapMode(page, AREA_KANNAMANGALA);

    const listButton = page.getByTestId('mobile-map-close-list-button');
    const box = await listButton.boundingBox();
    expect(box, 'List button has a layout box').not.toBeNull();
    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;

    const hitTestsToButton = await page.evaluate(
      ([x, y]) => {
        const el = document.elementFromPoint(x, y);
        const button = document.querySelector('[data-testid="mobile-map-close-list-button"]');
        return el === button || !!button?.contains(el);
      },
      [cx, cy] as const,
    );
    expect(
      hitTestsToButton,
      'elementFromPoint at the List button\'s own center must resolve to the button itself, not the breadcrumb or its ghost spacer',
    ).toBe(true);

    // A real, unforced click is itself a second, independent proof: Playwright
    // refuses a non-forced click unless the target passes the browser's own
    // actionability hit-test at its exact coordinates.
    await listButton.click({ timeout: 5_000 });
    await expect(listButton).toHaveCount(0);
    await expect(page.getByTestId('control-bar-map-trigger')).toBeVisible({ timeout: 10_000 });
  });

  test('the synthesized City-root crumb is a real, independently tappable link back to city root', async ({
    page,
  }) => {
    await gotoNodeMapMode(page, AREA_KANNAMANGALA);

    const cityCrumb = page.getByTestId('breadcrumb-seg-root');
    await expect(cityCrumb).toBeVisible();
    expect(
      await cityCrumb.evaluate((el) => el.tagName),
      'the City-root crumb must be a real anchor element, never a plain span',
    ).toBe('A');
    const href = await cityCrumb.getAttribute('href');
    expect(href, 'the City-root crumb must carry a real href').toBeTruthy();

    const box = await cityCrumb.boundingBox();
    expect(box, 'City-root crumb has a layout box').not.toBeNull();
    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;
    const hitTestsToCrumb = await page.evaluate(
      ([x, y]) => {
        const el = document.elementFromPoint(x, y);
        const crumb = document.querySelector('[data-testid="breadcrumb-seg-root"]');
        return el === crumb || !!crumb?.contains(el);
      },
      [cx, cy] as const,
    );
    expect(
      hitTestsToCrumb,
      'elementFromPoint at the City-root crumb\'s own center must resolve to the crumb itself — never covered by anything else',
    ).toBe(true);

    // Real, unforced click — must actually navigate away from the deep node.
    await cityCrumb.click({ timeout: 5_000 });
    await expect.poll(() => currentNodeParam(page)).not.toBe(AREA_KANNAMANGALA);
  });
});
