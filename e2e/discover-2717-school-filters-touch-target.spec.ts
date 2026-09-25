/**
 * E2E: School results "Filters" trigger touch target — Issue #2717.
 *
 * Split out of #2698's review (owner ruling in #2713 comment 5831289421). PR
 * #2713 gave the School-results Filters Sheet trigger a visible "Filters"
 * label; it stayed `h-7` (28px), matching its Start over/Back neighbours but
 * short of the 44px WCAG 2.5.5 touch-target minimum on mobile (<821px, the
 * project's existing 820px shell breakpoint — see DiscoverContext.tsx's
 * `isMobileShell` matchMedia).
 *
 * Why E2E (not unit): a unit/JSDOM test cannot measure a real hit area —
 * `getBoundingClientRect()` on generated `::before` pseudo-element content
 * only reflects real layout in an actual browser (see the header comment on
 * e2e/commercial-subtype-wrap-2450.spec.ts for the same reasoning). The fix
 * enlarges the HIT AREA via an absolutely-positioned `::before` pseudo
 * element (project convention noted inline in SchoolJourneyPanels.tsx) —
 * the visible chip itself must stay unchanged, so a test on the visible
 * box (`offsetWidth`/`offsetHeight`) would incorrectly fail.
 *
 * Test IDs:
 *   E2E-2717-1  Mobile (375x667 / 390x844 / 412x915): the trigger's clickable
 *               hit rect (button box + before: pseudo expansion) measures
 *               >= 44x44 CSS px.
 *   E2E-2717-2  Mobile: the visible chip itself is still the compact h-7
 *               (~28px tall) size — the fix must not have grown the chip.
 *   E2E-2717-3  Mobile 375x667: no wrapping — Filters and Start over stay on
 *               PanelHeader's one actions row (no extra row added; "Back", when
 *               present, is already its own row below the title by design).
 *   E2E-2717-4  Desktop (1280 wide, >=821px): the trigger is the pre-existing
 *               h-7 box with no enlarged hit area (before: gated off).
 *
 * Anonymous flow throughout (mirrors discover-anon-school-radius.spec.ts) —
 * filtersContent is passed to SchoolSelectedPanel regardless of auth state,
 * so no storageState/login flow is needed to reach the trigger.
 *
 * Run locally:
 *   bash scripts/run-e2e-local.sh --project=full e2e/discover-2717-school-filters-touch-target.spec.ts
 */

import { test, expect, type Page, type Route } from '@playwright/test';

test.use({ storageState: undefined });

// ---------------------------------------------------------------------------
// Fixtures — trimmed to the minimum SchoolSelectedPanel needs to mount with
// filtersContent present (the "Filters" trigger only renders when it is).
// ---------------------------------------------------------------------------

const MANIPAL_AREA_KEY = 'IN|KA|Udupi|Manipal';

const MANIPAL_SCHOOL = {
  id: 'sch-2717',
  name: 'Manipal Public School',
  board: 'CBSE',
  boardType: null,
  address: 'Manipal, Udupi District',
  latitude: 13.3525,
  longitude: 74.7864,
  distanceKm: 1.2,
};

const DISCOVER_AREAS_UDUPI = {
  city: 'udupi',
  areas: [
    {
      areaKey: MANIPAL_AREA_KEY,
      name: 'Manipal',
      geoCenterLat: 13.3525,
      geoCenterLon: 74.7864,
      listingCount: 5,
      schoolCount: 3,
      trendDirection: 'stable',
      minLat: 13.33,
      minLon: 74.77,
      maxLat: 13.37,
      maxLon: 74.81,
    },
  ],
};

const TRENDS_OPTIONS_FIXTURE = {
  city: 'udupi',
  defaultAreas: [{ areaKey: MANIPAL_AREA_KEY, areaLabel: 'Manipal' }],
};

const EMPTY_SCHOOL_RADIUS_LISTINGS = { listings: [], hasMore: false, totalCount: 0 };

function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function stubCommonEndpoints(page: Page): Promise<void> {
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/trends/options**', (route) =>
    fulfillJson(route, 200, TRENDS_OPTIONS_FIXTURE),
  );
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/discover/areas**', (route) =>
    fulfillJson(route, 200, DISCOVER_AREAS_UDUPI),
  );
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/public/schools/popular**', (route) =>
    fulfillJson(route, 200, []),
  );
  // School-by-id (public) — resolves the URL ?schoolId=, populating school coords.
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route(`**/api/public/schools/${MANIPAL_SCHOOL.id}**`, (route) =>
    fulfillJson(route, 200, MANIPAL_SCHOOL),
  );
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/discover/cities/*/school-radius-listings**', (route) =>
    fulfillJson(route, 200, EMPTY_SCHOOL_RADIUS_LISTINGS),
  );
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route('**/api/discover/cities/*/listings**', (route) =>
    fulfillJson(route, 200, { areas: [{ areaKey: MANIPAL_AREA_KEY, listings: [] }] }),
  );
}

// SchoolSelectedPanel is confirmed mounted when its radius selector is visible.
async function waitForSchoolPanel(page: Page): Promise<void> {
  await expect(page.getByTestId('radius-btn-3')).toBeVisible({ timeout: 15_000 });
}

const SCHOOL_FIRST_URL =
  `/discover?city=udupi&journey=school-first&schoolId=${MANIPAL_SCHOOL.id}&radiusKm=3`;

/** Real, rendered hit-testable rect: button box UNIONed with its `::before` pseudo
 * expansion (if any) — this is what a real finger/pointer actually hits, which
 * `getBoundingClientRect()` on the button element alone would miss since the
 * pseudo content is generated, not a DOM child. */
async function measureHitRect(
  page: Page,
  testId: string,
): Promise<{ width: number; height: number }> {
  return page.evaluate((tid) => {
    const el = document.querySelector(`[data-testid="${tid}"]`) as HTMLElement | null;
    if (!el) throw new Error(`missing [data-testid="${tid}"]`);
    const ownRect = el.getBoundingClientRect();
    const before = window.getComputedStyle(el, '::before');
    // Parse `inset(-9px)`/individual side values out of computed style. Chromium
    // exposes the resolved box via `top`/`left`/`right`/`bottom` on the
    // pseudo-element's computed style when `position: absolute` is set.
    const hasBefore = before.content !== 'none' && before.position === 'absolute';
    if (!hasBefore) {
      return { width: ownRect.width, height: ownRect.height };
    }
    const top = parseFloat(before.top || '0');
    const left = parseFloat(before.left || '0');
    const right = parseFloat(before.right || '0');
    const bottom = parseFloat(before.bottom || '0');
    // top/left/right/bottom on an inset(-9px) pseudo resolve to -9px each side
    // relative to the button's own padding box — so the expanded box grows by
    // the absolute value of each negative offset.
    return {
      width: ownRect.width + Math.abs(Math.min(left, 0)) + Math.abs(Math.min(right, 0)),
      height: ownRect.height + Math.abs(Math.min(top, 0)) + Math.abs(Math.min(bottom, 0)),
    };
  }, testId);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('@integration-ui School results Filters trigger touch target (#2717)', () => {
  const mobileViewports = [
    { name: '375x667', width: 375, height: 667 },
    { name: '390x844', width: 390, height: 844 },
    { name: '412x915', width: 412, height: 915 },
  ];

  for (const vp of mobileViewports) {
    test(`E2E-2717-1/2/3 @ ${vp.name}: Filters hit area >= 44px, chip unchanged, no wrap`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await stubCommonEndpoints(page);

      await page.goto(SCHOOL_FIRST_URL);
      await waitForSchoolPanel(page);

      const trigger = page.getByTestId('school-filters-trigger');
      await expect(trigger).toBeVisible();

      // E2E-2717-2: the VISIBLE chip stays the compact h-7 size (~28px tall).
      // A regression that grew the chip itself (instead of just the hit area)
      // would push this well past 32px.
      const visibleBox = await trigger.boundingBox();
      expect(visibleBox).not.toBeNull();
      expect(visibleBox!.height).toBeLessThan(32);

      // E2E-2717-1: the real hit-testable rect (button box + before: pseudo
      // expansion) meets the 44px WCAG 2.5.5 minimum on both axes.
      const hitRect = await measureHitRect(page, 'school-filters-trigger');
      expect(hitRect.width).toBeGreaterThanOrEqual(44);
      expect(hitRect.height).toBeGreaterThanOrEqual(44);

      // E2E-2717-3: Filters and Start over share PanelHeader's single actions
      // row (PanelHeader.tsx renders `actions` + StartOverButton in one
      // `flex items-center` row; "Back", when present, is a SEPARATE row
      // below the title by design — unrelated to this fix). The enlarged
      // hit area must not push Start over onto a second line.
      const startOver = page.getByTestId('start-over-button');
      if ((await startOver.count()) > 0) {
        const [filtersRow, startOverRow] = await Promise.all([
          trigger.boundingBox(),
          startOver.first().boundingBox(),
        ]);
        expect(filtersRow).not.toBeNull();
        expect(startOverRow).not.toBeNull();
        // Same toolbar row => vertical centers within a few px of each other.
        const centers = [filtersRow, startOverRow].map((r) => r!.y + r!.height / 2);
        const spread = Math.max(...centers) - Math.min(...centers);
        expect(spread).toBeLessThan(8);
      }
    });
  }

  test('E2E-2717-4: desktop (>=821px) trigger keeps the pre-existing h-7 box, no enlarged hit area', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await stubCommonEndpoints(page);

    await page.goto(SCHOOL_FIRST_URL);
    await waitForSchoolPanel(page);

    const trigger = page.getByTestId('school-filters-trigger');
    await expect(trigger).toBeVisible();

    const hitRect = await measureHitRect(page, 'school-filters-trigger');
    const visibleBox = await trigger.boundingBox();
    expect(visibleBox).not.toBeNull();

    // Desktop: the max-[820px]: before: rules never apply, so the measured hit
    // rect equals the visible chip box (no expansion).
    expect(hitRect.height).toBeCloseTo(visibleBox!.height, 0);
    expect(hitRect.height).toBeLessThan(32);
  });
});
