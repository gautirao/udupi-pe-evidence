/**
 * E2E — area-first Level-2 area-name fix (Issue #1489)
 *
 * Regression suite verifying that area rows in the area-first Level-2 drill-down
 * show REAL NAMES (not empty/undefined) after the MapDiscovery.tsx fix that passes
 * DiscoverArea[] (with `name`) instead of AreaPoint[] (which lacks `name`).
 *
 * All tests are STUB-FIRST: network requests are intercepted via page.route so
 * they run without a seeded backend.
 *
 * Run:
 *   PLAYWRIGHT_BASE_URL=http://localhost:5173 npx playwright test \
 *     e2e/discover-area-first-grouping-1489.spec.ts --project=chromium --reporter=list
 */

import { test, expect, type Page } from '@playwright/test';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CITY = 'udupi';
const GROUP_SLUG = 'university-belt';
const AREA_KEY_MANIPAL = 'IN|KA|Udupi|Manipal';
const AREA_KEY_KATAPADI = 'IN|KA|Udupi|Katapadi';
const ENCODED_AREA_KEY_MANIPAL = encodeURIComponent(AREA_KEY_MANIPAL);

// Backend DTO for /api/discover/area-groups
const MOCK_AREA_GROUPS = {
  city: CITY,
  groups: [
    {
      slug: GROUP_SLUG,
      name: 'University Belt',
      subtitle: 'Manipal and Katapadi campuses',
      regionLabel: 'Central',
      displayOrder: 1,
      areaKeys: [AREA_KEY_MANIPAL, AREA_KEY_KATAPADI],
      focusLat: 13.35,
      focusLon: 74.79,
      minLat: 13.3,
      minLon: 74.75,
      maxLat: 13.4,
      maxLon: 74.83,
    },
    {
      slug: 'coastal-belt',
      name: 'Coastal Belt',
      subtitle: 'Malpe and Kapu beaches',
      regionLabel: 'West',
      displayOrder: 2,
      areaKeys: ['IN|KA|Udupi|Malpe'],
    },
  ],
};

// Backend DTO for /api/discover/areas — DiscoverArea[] shape (has `name`)
const MOCK_AREAS = {
  city: CITY,
  areas: [
    {
      areaKey: AREA_KEY_MANIPAL,
      name: 'Manipal',
      geoCenterLat: 13.3525,
      geoCenterLon: 74.7864,
      listingCount: 12,
      schoolCount: 4,
    },
    {
      areaKey: AREA_KEY_KATAPADI,
      name: 'Katapadi',
      geoCenterLat: 13.3498,
      geoCenterLon: 74.7801,
      listingCount: 5,
      schoolCount: 1,
    },
    {
      areaKey: 'IN|KA|Udupi|Malpe',
      name: 'Malpe',
      geoCenterLat: 13.3568,
      geoCenterLon: 74.7052,
      listingCount: 7,
      schoolCount: 2,
    },
  ],
};

// Minimal city-listings response for Level-3 (area selected)
const MOCK_CITY_LISTINGS = {
  city: CITY,
  limitPerArea: 5,
  areas: [
    {
      areaKey: AREA_KEY_MANIPAL,
      areaName: 'Manipal',
      listings: [
        {
          id: 'listing-1489-stub-1',
          pricePaise: 4500000,
          propertyType: 'apartment',
          locality: 'Manipal',
          primaryImageUrl: null,
          listingPurpose: 'sale',
        },
      ],
    },
  ],
};

const EMPTY_LISTINGS_PAGE = {
  content: [],
  page: 0,
  size: 50,
  totalElements: 0,
  totalPages: 0,
  aggregates: { topLocalities: [] },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';

function areaFirstUrl(params: Record<string, string> = {}) {
  const sp = new URLSearchParams({ city: CITY, journey: 'area-first', ...params });
  return `${BASE_URL}/discover?${sp.toString()}`;
}

async function setupStubs(page: Page) {
  await page.route('**/api/discover/area-groups**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_AREA_GROUPS) }),
  );
  await page.route('**/api/discover/areas**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_AREAS) }),
  );
  await page.route(`**/api/discover/cities/${CITY}/listings**`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_CITY_LISTINGS) }),
  );
  // Suppress agri/school/marker calls that would race
  await page.route('**/api/discover/regional-area-groups**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ groups: [] }) }),
  );
  await page.route('**/api/discover/agri-map-listings**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ listings: [] }) }),
  );
  await page.route('**/api/discover/markers**', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Unauthorized' }) }),
  );
  await page.route('**/api/listings**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(EMPTY_LISTINGS_PAGE) }),
  );
  await page.route('**/api/trends/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ city: CITY, defaultAreas: [] }) }),
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('area-first Level-2 area-name fix (Issue #1489)', () => {
  test.beforeEach(async ({ page }) => {
    await setupStubs(page);
  });

  // AC-AF-1: group card click → area rows show real names (Manipal, Katapadi)
  test('AC-AF-1: group card click → Level-2 area rows show real names', async ({ page }) => {
    await page.goto(areaFirstUrl());

    // Wait for Level-1 group cards to appear
    await expect(page.getByTestId(`area-group-card-${GROUP_SLUG}`)).toBeVisible({ timeout: 10_000 });

    // Click the University Belt group card
    await page.getByTestId(`area-group-card-${GROUP_SLUG}`).click();

    // URL must contain groupId
    await expect(page).toHaveURL(/groupId=university-belt/, { timeout: 5_000 });

    // Level-2 container must be visible
    await expect(page.getByTestId('area-group-level2')).toBeVisible({ timeout: 10_000 });

    // Area rows must appear with REAL NAMES — this is the #1489 regression guard
    const manipalRow = page.getByTestId(`browse-all-area-${AREA_KEY_MANIPAL}`);
    await expect(manipalRow).toBeVisible();
    await expect(manipalRow).toContainText('Manipal');

    const katapadiRow = page.getByTestId(`browse-all-area-${AREA_KEY_KATAPADI}`);
    await expect(katapadiRow).toBeVisible();
    await expect(katapadiRow).toContainText('Katapadi');

    // Coastal Belt member must NOT appear (cross-group isolation)
    await expect(page.getByTestId('browse-all-area-IN|KA|Udupi|Malpe')).not.toBeVisible();

    await page.screenshot({ path: 'test-results/1489-af1-group-click-names.png' });
  });

  // AC-AF-2: groupId deep-link cold-load → area rows with names
  test('AC-AF-2: deep-link with groupId shows area rows with real names on cold load', async ({ page }) => {
    await page.goto(areaFirstUrl({ groupId: GROUP_SLUG }));

    // Level-2 container must appear directly (no interaction needed)
    await expect(page.getByTestId('area-group-level2')).toBeVisible({ timeout: 10_000 });

    // Manipal and Katapadi must show real names
    const manipalRow = page.getByTestId(`browse-all-area-${AREA_KEY_MANIPAL}`);
    await expect(manipalRow).toBeVisible();
    await expect(manipalRow).toContainText('Manipal');

    const katapadiRow = page.getByTestId(`browse-all-area-${AREA_KEY_KATAPADI}`);
    await expect(katapadiRow).toBeVisible();
    await expect(katapadiRow).toContainText('Katapadi');

    // Level-1 group cards must NOT be visible
    await expect(page.getByTestId(`area-group-card-${GROUP_SLUG}`)).not.toBeVisible();

    await page.screenshot({ path: 'test-results/1489-af2-cold-load-names.png' });
  });

  // AC-AF-3: area row click → areaKey in URL → area-selected panel (listings)
  test('AC-AF-3: area row click sets areaKey and renders area-selected panel', async ({ page }) => {
    await page.goto(areaFirstUrl({ groupId: GROUP_SLUG }));
    await expect(page.getByTestId('area-group-level2')).toBeVisible({ timeout: 10_000 });

    // Click Manipal area row
    await page.getByTestId(`browse-all-area-${AREA_KEY_MANIPAL}`).click();

    // URL must gain areaKey
    await expect(page).toHaveURL(
      new RegExp(`areaKey=${ENCODED_AREA_KEY_MANIPAL}`),
      { timeout: 5_000 },
    );
    // groupId must still be present (retained)
    await expect(page).toHaveURL(/groupId=university-belt/);

    // Area-selected panel: add-school-cta is a reliable marker unique to AreaSelectedPanel
    await expect(page.getByTestId('add-school-cta')).toBeVisible({ timeout: 8_000 });

    // Level-2 container must be gone
    await expect(page.getByTestId('area-group-level2')).not.toBeAttached();

    await page.screenshot({ path: 'test-results/1489-af3-area-selected.png' });
  });

  // AC-AF-4: Back from listings → area rows with names still present
  test('AC-AF-4: browser Back from area listings returns to Level-2 with named area rows', async ({ page }) => {
    await page.goto(areaFirstUrl({ groupId: GROUP_SLUG }));
    await expect(page.getByTestId('area-group-level2')).toBeVisible({ timeout: 10_000 });

    // Navigate to Level-3
    await page.getByTestId(`browse-all-area-${AREA_KEY_MANIPAL}`).click();
    await expect(page).toHaveURL(new RegExp(`areaKey=`), { timeout: 5_000 });
    await expect(page.getByTestId('add-school-cta')).toBeVisible({ timeout: 8_000 });

    // Browser Back
    await page.goBack();

    // groupId retained, areaKey removed
    await expect(page).toHaveURL(/groupId=university-belt/, { timeout: 5_000 });
    await expect.poll(
      () => new URL(page.url()).searchParams.get('areaKey'),
      { timeout: 5_000 },
    ).toBeNull();

    // Level-2 area rows must re-appear with real names
    const manipalRow = page.getByTestId(`browse-all-area-${AREA_KEY_MANIPAL}`);
    await expect(manipalRow).toBeVisible({ timeout: 8_000 });
    await expect(manipalRow).toContainText('Manipal');

    await page.screenshot({ path: 'test-results/1489-af4-back-names.png' });
  });

  // AC-AF-5: Start Over → Level-1 group cards (journey and groupId cleared)
  test('AC-AF-5: Start Over clears journey and groupId, returns to Level-1 group cards', async ({ page }) => {
    await page.goto(areaFirstUrl({ groupId: GROUP_SLUG }));
    await expect(page.getByTestId('area-group-level2')).toBeVisible({ timeout: 10_000 });

    // Click Start Over
    await page.getByTestId('start-over-button').click();

    // journey and groupId must be cleared
    await expect.poll(
      () => {
        const u = new URL(page.url());
        return { journey: u.searchParams.get('journey'), groupId: u.searchParams.get('groupId') };
      },
      { timeout: 5_000 },
    ).toEqual({ journey: null, groupId: null });

    // Level-2 container must be gone
    await expect(page.getByTestId('area-group-level2')).not.toBeAttached();

    // Guided-entry / journey-selection visible
    await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 5_000 });

    await page.screenshot({ path: 'test-results/1489-af5-start-over.png' });
  });

  // Regression guard: agri journey (corridor click → towns, not area listing rows)
  // Verifies that the area-first fix does not interfere with agri-first routing.
  test('Regression: agri-first + corridor click stays in agri journey (no area-first leak)', async ({ page }) => {
    await page.goto(`${BASE_URL}/discover?city=${CITY}&journey=agri-first`);

    // Agri landing panel must render (not area-groups-landing)
    // The agri-first landing panel renders corridor group cards (CorridorLandingPanel),
    // not area group cards. We verify the area-groups-list is NOT present.
    await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('area-groups-list')).not.toBeAttached({ timeout: 5_000 });
    // Area-first group cards must not leak into agri journey
    await expect(page.getByTestId(`area-group-card-${GROUP_SLUG}`)).not.toBeVisible({ timeout: 3_000 });
  });
});
