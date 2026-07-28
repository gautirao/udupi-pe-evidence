/**
 * Issue #1956 PR 1 — AC1.1 / AC1.14 legacy-journey parity across every entry point.
 *
 * PR 1 ships a preview seam (`node=`, `areasPreview=1`, the deployment capability
 * flag), a typed navigation model, count arithmetic and a counts hook — and
 * MOUNTS NONE OF IT. The shopper-visible outcome of PR 1 is NONE.
 *
 * The unit matrix in
 * `src/features/discover/utils/__tests__/discoverPanelState.previewGate.matrix.test.ts`
 * pins the ROUTING DECISION (`derivePanelContent`) for the same cells. That is a
 * pure function in JSDOM — it cannot prove a real browser still RENDERS the
 * legacy panel. This spec closes exactly that gap: for each of the five AC1.1
 * entry points it drives a real Chromium page and asserts the legacy Areas panel
 * is on screen, plus a negative assertion that no canonical-Areas preview UI
 * exists anywhere in the DOM.
 *
 * ── The five entry points (capability DISABLED — the production default) ──
 *   (a) plain `?city=bangalore&journey=area-first`
 *   (b) direct area search      — `journey=area-first` + a resolved `areaKey`
 *   (c) `?areaKey=` deep link with journey ABSENT
 *       (the AreaCtaBlock / AreaGuide / AreaGuideHero producers)
 *   (d) journey-less `?groupId=`
 *   (e) `node=` present
 * Each is asserted INDIVIDUALLY — a single loop over a table would hide which
 * cell regressed.
 *
 * ── The capability-ENABLED case ──
 * `VITE_DISCOVER_AREAS_PREVIEW` is inlined by Vite at BUILD time, so a
 * capability-enabled page cannot be produced by a URL parameter or a
 * `page.addInitScript` — it needs a separately-built origin. That origin is
 * supplied via `AREAS_PREVIEW_ENABLED_BASE_URL` (e.g. a second dev server started
 * with `VITE_DISCOVER_AREAS_PREVIEW=1`). When it is absent the enabled case is
 * SKIPPED WITH AN EXPLICIT REASON rather than silently passing — a green run that
 * never exercised the gate would be worse than no test.
 *
 * ── Why the API is stubbed ──
 * The assertion is about PANEL SELECTION AND RENDER, not about live inventory.
 * Stubs make the fixture identical across all five entry points, so any
 * difference in what renders is attributable to the URL alone. Same
 * `@integration-ui` convention as `e2e/discover-area-groups-landing.spec.ts`.
 *
 * Run:
 *   npx playwright test e2e/discover/areas-preview-gate-legacy-parity-1956.spec.ts \
 *     --project=full
 * with PLAYWRIGHT_BASE_URL pointing at a dev server on 5173/5174/3000 (the
 * backend CORS allowlist) and, optionally, AREAS_PREVIEW_ENABLED_BASE_URL
 * pointing at a `VITE_DISCOVER_AREAS_PREVIEW=1` build.
 */
import { test, expect, type Page } from '@playwright/test';

const CITY = 'bangalore';
const AREA_KEY = 'IN|KA|Bangalore|Whitefield';
const ENCODED_AREA_KEY = encodeURIComponent(AREA_KEY);
const GROUP_ID = 'whitefield-belt';
/** Server-shaped node key. The frontend never constructs one; this mimics a share link. */
const NODE_KEY = 'a:IN|KA|Bangalore|Whitefield';

const AREAS_RESPONSE = {
  city: CITY,
  areas: [
    {
      areaKey: AREA_KEY,
      name: 'Whitefield',
      geoCenterLat: 12.9698,
      geoCenterLon: 77.7500,
      listingCount: 12,
      schoolCount: 4,
    },
    {
      areaKey: 'IN|KA|Bangalore|Varthur',
      name: 'Varthur',
      geoCenterLat: 12.9400,
      geoCenterLon: 77.7400,
      listingCount: 6,
      schoolCount: 2,
    },
  ],
};

const AREA_GROUPS_RESPONSE = {
  city: CITY,
  groups: [
    {
      slug: GROUP_ID,
      name: 'Whitefield Belt',
      subtitle: 'Whitefield, Varthur',
      regionLabel: 'East',
      displayOrder: 1,
      areaKeys: [AREA_KEY, 'IN|KA|Bangalore|Varthur'],
      focusLat: 12.96,
      focusLon: 77.74,
      minLat: 12.9,
      minLon: 77.6,
      maxLat: 13.05,
      maxLon: 77.8,
    },
    {
      slug: 'north-corridor',
      name: 'North Corridor',
      subtitle: 'Hebbal, Yelahanka',
      regionLabel: 'North',
      displayOrder: 2,
      areaKeys: ['IN|KA|Bangalore|Hebbal'],
      focusLat: 13.05,
      focusLon: 77.59,
      minLat: 13.0,
      minLon: 77.5,
      maxLat: 13.15,
      maxLon: 77.7,
    },
  ],
};

/**
 * Stubs every Discover read the panels make. Registered broad-first: Playwright
 * matches the MOST RECENTLY registered route, so the catch-all below is the
 * fallback and the specific handlers above win.
 */
async function stubDiscoverApis(page: Page) {
  await page.route('**/api/discover/areas**', (route) =>
    route.fulfill({ json: AREAS_RESPONSE }),
  );
  await page.route('**/api/discover/area-groups**', (route) =>
    route.fulfill({ json: AREA_GROUPS_RESPONSE }),
  );
  await page.route('**/api/discover/regional-area-groups**', (route) =>
    route.fulfill({ json: { city: CITY, regions: [] } }),
  );
  await page.route(`**/api/discover/cities/${CITY}/listings**`, (route) =>
    route.fulfill({ json: { city: CITY, limitPerArea: 5, areas: [] } }),
  );
  await page.route('**/api/listings/markers**', (route) =>
    route.fulfill({ json: { elements: [], truncated: false } }),
  );
}

/** The Discover shell must be up before any panel assertion means anything. */
async function openDiscover(page: Page, query: string) {
  await page.goto(`/discover?${query}`);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 15_000 });
}

/**
 * The legacy AREA-GROUPS LANDING panel is on screen.
 *
 * Asserted on the panel's own list container AND on a real group card, so an
 * empty shell that merely renders the wrapper cannot pass.
 */
async function expectLegacyAreaGroupsLanding(page: Page) {
  await expect(page.getByTestId('area-groups-list')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId(`area-group-card-${GROUP_ID}`)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('area-group-card-north-corridor')).toBeVisible();
}

/**
 * The legacy AREA-GROUPS LANDING panel in its LEVEL-2 (group-selected) state.
 *
 * A journey-less `?groupId=` routes to `area-groups-landing` (same panel as the
 * plain entry point) but the panel itself opens on the selected group's own
 * level rather than the all-groups list — breadcrumb, group card, and the
 * "areas inside" list. Asserting the all-groups list here would be asserting the
 * WRONG legacy behaviour and would have to be "fixed" by weakening it later.
 */
async function expectLegacyAreaGroupLevelTwo(page: Page) {
  await expect(page.getByTestId('area-group-level2')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('area-group-breadcrumb')).toBeVisible();
  await expect(page.getByTestId('area-group-selected-card')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Whitefield Belt' })).toBeVisible();
  // The two member areas of the stubbed group really are listed.
  await expect(page.getByRole('button', { name: /properties in Whitefield$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /properties in Varthur$/ })).toBeVisible();
}

/** The legacy AREA-SELECTED panel is on screen. */
async function expectLegacyAreaSelected(page: Page) {
  await expect(page.getByTestId('area-search-input')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('area-trust-strip')).toBeVisible({ timeout: 10_000 });
}

/**
 * NEGATIVE: none of the canonical-Areas preview surfaces PR 2+ will introduce is
 * present. PR 1's whole claim is that the seam mounts nothing, and this is the
 * assertion that would fail the day something is wired in early.
 */
async function expectNoPreviewAreasUi(page: Page) {
  const previewSelectors = [
    '[data-testid="discover-areas-journey-panel"]',
    '[data-testid="areas-breadcrumb-trail"]',
    '[data-testid="navigation-level-panel"]',
    '[data-testid="navigation-child-list"]',
    '[data-testid="navigation-resolution-notice"]',
  ];
  for (const selector of previewSelectors) {
    await expect(page.locator(selector)).toHaveCount(0);
  }
}

test.describe('@integration-ui #1956 PR 1 — AC1.1 legacy Areas journey, capability DISABLED', () => {
  test.beforeEach(async ({ page }) => {
    await stubDiscoverApis(page);
  });

  test('(a) plain ?city=bangalore&journey=area-first renders the legacy area-groups landing', async ({
    page,
  }) => {
    await openDiscover(page, `city=${CITY}&journey=area-first`);
    await expectLegacyAreaGroupsLanding(page);
    await expectNoPreviewAreasUi(page);
  });

  test('(a2) the same entry point with areasPreview=1 is BYTE-FOR-BYTE the same journey (URL flag alone is inert)', async ({
    page,
  }) => {
    await openDiscover(page, `city=${CITY}&journey=area-first&areasPreview=1`);
    await expectLegacyAreaGroupsLanding(page);
    await expectNoPreviewAreasUi(page);
    // The flag survives in the URL (it is read-only, never rewritten) but changes nothing.
    expect(new URL(page.url()).searchParams.get('areasPreview')).toBe('1');
  });

  test('(b) direct area search — journey=area-first + a resolved areaKey renders the legacy area-selected panel', async ({
    page,
  }) => {
    await openDiscover(page, `city=${CITY}&journey=area-first&areaKey=${ENCODED_AREA_KEY}`);
    await expectLegacyAreaSelected(page);
    await expectNoPreviewAreasUi(page);
  });

  test('(c) ?areaKey= deep link with journey ABSENT (AreaCtaBlock / AreaGuide / AreaGuideHero) renders the legacy area-selected panel', async ({
    page,
  }) => {
    await openDiscover(page, `city=${CITY}&areaKey=${ENCODED_AREA_KEY}`);
    await expectLegacyAreaSelected(page);
    await expectNoPreviewAreasUi(page);
    // The producers emit no journey — the cold-load inference must still land here.
    expect(new URL(page.url()).searchParams.get('journey')).toBeNull();
  });

  test('(d) journey-less ?groupId= renders the legacy area-groups landing at its group level', async ({
    page,
  }) => {
    await openDiscover(page, `city=${CITY}&groupId=${GROUP_ID}`);
    await expectLegacyAreaGroupLevelTwo(page);
    await expectNoPreviewAreasUi(page);
    // The cold-load inference happened without a journey param, exactly as the
    // AreaCtaBlock-style producers emit it.
    expect(new URL(page.url()).searchParams.get('journey')).toBeNull();
  });

  test('(d2) journey-less ?groupId= + node= is identical — node does not disturb the group level', async ({
    page,
  }) => {
    await openDiscover(
      page,
      `city=${CITY}&groupId=${GROUP_ID}&node=${encodeURIComponent(NODE_KEY)}`,
    );
    await expectLegacyAreaGroupLevelTwo(page);
    await expectNoPreviewAreasUi(page);
  });

  test('(e) node= present changes nothing — the legacy journey renders exactly as without it', async ({
    page,
  }) => {
    await openDiscover(
      page,
      `city=${CITY}&journey=area-first&node=${encodeURIComponent(NODE_KEY)}`,
    );
    await expectLegacyAreaGroupsLanding(page);
    await expectNoPreviewAreasUi(page);
    // Parsed and carried, never acted on in PR 1.
    expect(new URL(page.url()).searchParams.get('node')).toBe(NODE_KEY);
  });

  test('(e2) node= on an areaKey deep link is equally inert', async ({ page }) => {
    await openDiscover(
      page,
      `city=${CITY}&areaKey=${ENCODED_AREA_KEY}&node=${encodeURIComponent(NODE_KEY)}`,
    );
    await expectLegacyAreaSelected(page);
    await expectNoPreviewAreasUi(page);
  });

  test('(e3) node= + areasPreview=1 together are still inert without the deployment capability', async ({
    page,
  }) => {
    await openDiscover(
      page,
      `city=${CITY}&journey=area-first&areasPreview=1&node=${encodeURIComponent(NODE_KEY)}`,
    );
    await expectLegacyAreaGroupsLanding(page);
    await expectNoPreviewAreasUi(page);
  });
});

/**
 * The two LOCKED viewports.
 *
 * NOT a pixel baseline. The repo has no `toHaveScreenshot` configuration and no
 * committed snapshot set anywhere (`playwright.config.ts` declares none), so
 * introducing the first baseline system is deliberately out of scope for a QA
 * pass — and a baseline captured from a map page whose Leaflet tiles are
 * network-fetched would be flaky by construction. What IS asserted here is the
 * falsifiable, non-pixel part of the visual claim: at both locked viewports the
 * legacy panel still renders, no preview surface appears, and the page does not
 * scroll horizontally.
 */
const LOCKED_VIEWPORTS = [
  { label: 'desktop 1366x768', viewport: { width: 1366, height: 768 } },
  { label: 'mobile 390x844', viewport: { width: 390, height: 844 } },
] as const;

for (const { label, viewport } of LOCKED_VIEWPORTS) {
  test.describe(`@integration-ui #1956 PR 1 — legacy journey at ${label}`, () => {
    test.use({ viewport });

    test.beforeEach(async ({ page }) => {
      await stubDiscoverApis(page);
    });

    test('the legacy area-first journey renders, mounts no preview UI, and does not scroll horizontally', async ({
      page,
    }) => {
      await openDiscover(page, `city=${CITY}&journey=area-first`);
      await expectLegacyAreaGroupsLanding(page);
      await expectNoPreviewAreasUi(page);

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
    });

    test('the same is true with the full preview seam in the URL (areasPreview=1 + node=)', async ({
      page,
    }) => {
      await openDiscover(
        page,
        `city=${CITY}&journey=area-first&areasPreview=1&node=${encodeURIComponent(NODE_KEY)}`,
      );
      await expectLegacyAreaGroupsLanding(page);
      await expectNoPreviewAreasUi(page);

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
    });
  });
}

test.describe('@integration-ui #1956 PR 1 — capability ENABLED, the gate is still inert', () => {
  const enabledBaseUrl = process.env.AREAS_PREVIEW_ENABLED_BASE_URL;

  test('capability ENABLED + areasPreview=1 mounts NO new UI and still renders the legacy journey', async ({
    page,
  }) => {
    test.skip(
      !enabledBaseUrl,
      'AREAS_PREVIEW_ENABLED_BASE_URL is unset. VITE_DISCOVER_AREAS_PREVIEW is inlined at ' +
        'build time, so the enabled half of the dual gate needs a separately-built origin ' +
        '(e.g. `VITE_DISCOVER_AREAS_PREVIEW=1 npm run dev -- --port 3000`). Skipping is ' +
        'deliberate: asserting the DISABLED build here would be a green test that never ' +
        'exercised the gate.',
    );

    await stubDiscoverApis(page);
    await page.goto(
      `${enabledBaseUrl}/discover?city=${CITY}&journey=area-first&areasPreview=1`,
    );
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 15_000 });

    // BOTH halves of the dual gate are true here — and PR 1 still renders the
    // legacy journey, because the gate selects no panel.
    await expectLegacyAreaGroupsLanding(page);
    await expectNoPreviewAreasUi(page);
  });
});
