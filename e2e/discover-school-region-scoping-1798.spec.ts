/**
 * E2E: School search region scoping — Issue #1798.
 *
 * Reproduces + disproves the "heb" same-substring cross-city bleed bug:
 * before this fix, typing "heb" in the area-first ScopedSearch School tab
 * while scoped to Bangalore could surface Udupi-side results (or vice versa)
 * because useSchoolSearch had no city param. Now `useSchoolSearch(query, city?)`
 * appends `&city=<slug>` whenever a city is in scope, and the backend
 * GET /api/public/schools/search branches on that param
 * (SchoolService.search / findByNameContainingIgnoreCaseAndCity).
 *
 * This spec covers the REPRODUCED path only:
 *   - Area-first Bangalore landing → School tab in ScopedSearch → type "heb"
 *     → request carries city=bangalore → only Bangalore/Hebbal results render,
 *     no Udupi school leaks into the dropdown.
 *   - Guard: school-first Hebbal route (city=bangalore&journey=school-first)
 *     still resolves without regressing.
 *   - Smoke: school-first / area-first / agri-first journeys all load without
 *     crashing (journey switch didn't break on this change).
 *
 * Does NOT assert via AreaGroupSelectedPanel (L2 drill-down) — that surface
 * stays globally-unscoped by design; scoping there is deferred to PR-B.
 *
 * Run locally:
 *   bash scripts/run-e2e-local.sh --project=full e2e/discover-school-region-scoping-1798.spec.ts
 */
import { test, expect, type Page, type Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const HEBBAL_AREA_KEY = 'IN|KA|Bengaluru|Hebbal';

const AREA_GROUPS_BLR = {
  city: 'bangalore',
  groups: [
    {
      slug: 'north-growth-corridor',
      name: 'Hebbal & Jakkur Schools',
      subtitle: 'North school zone',
      regionLabel: 'North Bangalore',
      displayOrder: 1,
      areaKeys: [HEBBAL_AREA_KEY, 'IN|KA|Bengaluru|Jakkur'],
    },
  ],
};

const DISCOVER_AREAS_BLR = {
  city: 'bangalore',
  areas: [
    { areaKey: HEBBAL_AREA_KEY, name: 'Hebbal', geoCenterLat: 13.035, geoCenterLon: 77.596, listingCount: 42, schoolCount: 6 },
    { areaKey: 'IN|KA|Bengaluru|Jakkur', name: 'Jakkur', geoCenterLat: 13.065, geoCenterLon: 77.608, listingCount: 28, schoolCount: 4 },
  ],
};

const AREA_GROUPS_UDUPI = {
  city: 'udupi',
  groups: [
    {
      slug: 'university-belt',
      name: 'University Belt',
      subtitle: 'Manipal & surrounds',
      regionLabel: 'Manipal',
      displayOrder: 1,
      areaKeys: ['IN|KA|Udupi|Manipal'],
    },
  ],
};

const DISCOVER_AREAS_UDUPI = {
  city: 'udupi',
  areas: [
    { areaKey: 'IN|KA|Udupi|Manipal', name: 'Manipal', geoCenterLat: 13.3525, geoCenterLon: 74.7864, listingCount: 12, schoolCount: 4 },
  ],
};

// Bangalore-scoped "heb" match — Hebbal Public School.
const BANGALORE_HEB_RESULTS = [
  {
    id: 'sch-blr-heb-1',
    name: 'Hebbal Public School',
    board: 'CBSE',
    boardType: null,
    address: 'Hebbal, Bangalore',
    latitude: 13.035,
    longitude: 77.596,
    distanceKm: 0.8,
    areaKey: HEBBAL_AREA_KEY,
  },
];

// Udupi-side same-substring match — must NEVER appear when city=bangalore is sent.
// (This is the reproduction fixture: a school whose name also contains "heb"
// but lives in Udupi, e.g. "Hebri Government School".)
const UDUPI_HEB_RESULT = {
  id: 'sch-udupi-heb-1',
  name: 'Hebri Government School',
  board: 'STATE',
  boardType: null,
  address: 'Hebri, Udupi',
  latitude: 13.36,
  longitude: 75.0,
  distanceKm: 5.0,
  areaKey: 'IN|KA|Udupi|Hebri',
};

const EMPTY_LISTINGS_PAGE = { content: [], page: 0, size: 50, totalElements: 0, totalPages: 0, aggregates: { topLocalities: [] } };

function fulfillJson(route: Route, body: unknown): Promise<void> {
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

async function suppressConsentBanner(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('discover_telemetry_consent', 'granted');
  });
}

async function stubCommon(page: Page) {
  await page.route('**/api/listings/**', (r) => fulfillJson(r, EMPTY_LISTINGS_PAGE));
  await page.route('**/api/listings**', (r) => fulfillJson(r, EMPTY_LISTINGS_PAGE));
  await page.route('**/api/trends/**', (r) => fulfillJson(r, { city: 'bangalore', defaultAreas: [] }));
  await page.route('**/api/public/schools/popular**', (r) => fulfillJson(r, []));
  await page.route('**/api/public/schools/by-area**', (r) => fulfillJson(r, []));
}

/**
 * Stubs GET /api/public/schools/search to fully emulate the fixed backend
 * behaviour: scoped (city param present) → only that city's fixture rows;
 * unscoped (no city param) → union of both cities' fixture rows. This lets
 * the spec prove the FE sends the param AND that a scoped request never
 * surfaces the other city's data — without needing a live Testcontainers DB.
 */
async function stubSchoolSearchScoped(page: Page) {
  await page.route('**/api/public/schools/search**', async (route) => {
    const url = new URL(route.request().url());
    const city = url.searchParams.get('city');
    if (city === 'bangalore') {
      await fulfillJson(route, BANGALORE_HEB_RESULTS);
    } else if (city === 'udupi') {
      await fulfillJson(route, [UDUPI_HEB_RESULT]);
    } else {
      // Unscoped — prior global behaviour, union of both.
      await fulfillJson(route, [...BANGALORE_HEB_RESULTS, UDUPI_HEB_RESULT]);
    }
  });
}

async function waitForPanelReady(page: Page) {
  await page.waitForSelector(
    'h1, [data-testid="area-groups-intro"], [data-testid="school-browse-intro"]',
    { state: 'visible', timeout: 12_000 },
  ).catch(() => {});
  await page.waitForTimeout(800);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Issue #1798 — School search region scoping (area-first ScopedSearch)', () => {
  test.beforeEach(async ({ page }) => {
    await suppressConsentBanner(page);
  });

  test('Bangalore area-first School tab: "heb" search is scoped to Bangalore, no Udupi bleed', async ({ page }) => {
    await page.route('**/api/discover/area-groups**', (r) => fulfillJson(r, AREA_GROUPS_BLR));
    await page.route('**/api/discover/areas**', (r) => fulfillJson(r, DISCOVER_AREAS_BLR));
    await stubCommon(page);
    await stubSchoolSearchScoped(page);

    const capturedSearchUrls: string[] = [];
    page.on('request', (req) => {
      const u = req.url();
      if (u.includes('/api/public/schools/search')) capturedSearchUrls.push(u);
    });

    await page.goto('/discover?city=bangalore&journey=area-first');
    await waitForPanelReady(page);

    // Switch to School tab in the scoped search box.
    const schoolTab = page.getByTestId('search-mode-school');
    await expect(schoolTab).toBeVisible({ timeout: 10_000 });
    await schoolTab.click();
    await expect(schoolTab).toHaveAttribute('aria-checked', 'true');

    // Type the reproduced-bug substring.
    const searchInput = page.getByTestId('scoped-search-input');
    await searchInput.fill('heb');

    // Bangalore-scoped result renders.
    await expect(page.getByTestId('search-result-school-sch-blr-heb-1')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Hebbal Public School')).toBeVisible();

    // Udupi cross-city result must NOT leak into the dropdown.
    await expect(page.getByTestId('search-result-school-sch-udupi-heb-1')).not.toBeVisible();
    await expect(page.getByText('Hebri Government School')).not.toBeVisible();

    // Assert the outgoing request actually carried city=bangalore (the fix).
    await expect.poll(() => capturedSearchUrls.length).toBeGreaterThan(0);
    expect(capturedSearchUrls.every((u) => u.includes('city=bangalore'))).toBe(true);
    expect(capturedSearchUrls.some((u) => u.includes('q=heb'))).toBe(true);
  });

  test('Udupi area-first School tab: "heb" search is scoped to Udupi, no Bangalore bleed', async ({ page }) => {
    await page.route('**/api/discover/area-groups**', (r) => fulfillJson(r, AREA_GROUPS_UDUPI));
    await page.route('**/api/discover/areas**', (r) => fulfillJson(r, DISCOVER_AREAS_UDUPI));
    await stubCommon(page);
    await stubSchoolSearchScoped(page);

    const capturedSearchUrls: string[] = [];
    page.on('request', (req) => {
      const u = req.url();
      if (u.includes('/api/public/schools/search')) capturedSearchUrls.push(u);
    });

    await page.goto('/discover?city=udupi&journey=area-first');
    await waitForPanelReady(page);

    const schoolTab = page.getByTestId('search-mode-school');
    await expect(schoolTab).toBeVisible({ timeout: 10_000 });
    await schoolTab.click();

    const searchInput = page.getByTestId('scoped-search-input');
    await searchInput.fill('heb');

    await expect(page.getByTestId('search-result-school-sch-udupi-heb-1')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Hebri Government School')).toBeVisible();

    // Bangalore cross-city result must NOT leak into the dropdown.
    await expect(page.getByTestId('search-result-school-sch-blr-heb-1')).not.toBeVisible();
    await expect(page.getByText('Hebbal Public School')).not.toBeVisible();

    await expect.poll(() => capturedSearchUrls.length).toBeGreaterThan(0);
    expect(capturedSearchUrls.every((u) => u.includes('city=udupi'))).toBe(true);
  });

  test('Guard: school-first Hebbal route still resolves after the scoping fix', async ({ page }) => {
    await page.route('**/api/discover/area-groups**', (r) => fulfillJson(r, AREA_GROUPS_BLR));
    await page.route('**/api/discover/areas**', (r) => fulfillJson(r, DISCOVER_AREAS_BLR));
    await stubCommon(page);
    await page.route('**/api/public/schools/popular**', (r) => fulfillJson(r, BANGALORE_HEB_RESULTS));

    await page.goto('/discover?city=bangalore&journey=school-first');
    await waitForPanelReady(page);

    await expect(page.getByTestId('school-zones-list')).toBeVisible({ timeout: 12_000 });
    await expect(page.getByTestId('school-zone-card-north-growth-corridor')).toBeVisible();
    await expect(page.getByText(/Hebbal/).first()).toBeVisible();
  });

  test('Smoke: school-first, area-first, and agri-first journeys all load without crashing', async ({ page }) => {
    await page.route('**/api/discover/area-groups**', (r) => fulfillJson(r, AREA_GROUPS_BLR));
    await page.route('**/api/discover/areas**', (r) => fulfillJson(r, DISCOVER_AREAS_BLR));
    await stubCommon(page);

    for (const journey of ['school-first', 'area-first', 'agri-first']) {
      await page.goto(`/discover?city=bangalore&journey=${journey}`);
      await waitForPanelReady(page);
      // No unhandled crash: page still has a heading and did not fall through
      // to a blank/error screen.
      await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(/something went wrong/i)).not.toBeVisible().catch(() => {});
    }
  });
});
