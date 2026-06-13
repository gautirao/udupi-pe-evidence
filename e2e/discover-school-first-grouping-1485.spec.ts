/**
 * E2E — school-first grouped hierarchy (Issue #1485)
 *
 * 4-level journey: zones (L1) → areas-in-zone (L2) → schools-in-area (L3) → listings (L4).
 *
 * All tests are STUB-FIRST: network requests for area-groups, discover-areas, schools, and
 * listings are intercepted via page.route so they run without a seeded backend.
 *
 * Run:
 *   PLAYWRIGHT_BASE_URL=http://localhost:5173 npx playwright test \
 *     e2e/discover-school-first-grouping-1485.spec.ts --project=full --reporter=list
 */
import { test, expect, type Page, type Route } from '@playwright/test';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// Backend DTO shape (camelCase areaKeys) — normalised to area_keys by useAreaGroups hook.
// slug → AreaGroup.id after normalisation (normalizeAreaGroupResponse: id = slug || name).
const AREA_GROUPS_STUB = {
  city: 'udupi',
  groups: [
    {
      slug: 'south-zone',
      name: 'South Zone',
      subtitle: 'Southern neighbourhoods',
      regionLabel: 'South',
      displayOrder: 1,
      areaKeys: ['IN|KA|Udupi|Manipal', 'IN|KA|Udupi|Malpe'],
    },
    {
      slug: 'north-zone',
      name: 'North Zone',
      subtitle: 'Northern neighbourhoods',
      regionLabel: 'North',
      displayOrder: 2,
      areaKeys: ['IN|KA|Udupi|Padubidri', 'IN|KA|Udupi|Shirva'],
    },
  ],
};

// Backend DTO shape for /api/discover/areas — includes schoolCount + listingCount.
const DISCOVER_AREAS_STUB = {
  city: 'udupi',
  areas: [
    {
      areaKey: 'IN|KA|Udupi|Manipal',
      name: 'Manipal',
      geoCenterLat: 13.3523,
      geoCenterLon: 74.7867,
      listingCount: 12,
      schoolCount: 4,
    },
    {
      areaKey: 'IN|KA|Udupi|Malpe',
      name: 'Malpe',
      geoCenterLat: 13.3568,
      geoCenterLon: 74.7052,
      listingCount: 7,
      schoolCount: 2,
    },
    {
      areaKey: 'IN|KA|Udupi|Padubidri',
      name: 'Padubidri',
      geoCenterLat: 13.1530,
      geoCenterLon: 74.7800,
      listingCount: 5,
      schoolCount: 3,
    },
    {
      areaKey: 'IN|KA|Udupi|Shirva',
      name: 'Shirva',
      geoCenterLat: 13.1800,
      geoCenterLon: 74.8400,
      listingCount: 3,
      schoolCount: 1,
    },
  ],
};

// Schools-by-area response — api.get returns SchoolResult[] directly (not paginated).
// All required SchoolResult fields must be present: id, name, board, boardType,
// latitude, longitude, address, distanceKm. Without distanceKm the SchoolResult is
// malformed; setSchoolJourney wrote lat/lon/zoom but omitted schoolId.
// areaKey supplied so setSchoolJourney skips the bbox-fallback cache lookup.
const SCHOOLS_BY_AREA_STUB = [
  {
    id: 'sch-stub-1',
    name: 'Manipal Public School',
    board: 'CBSE',
    boardType: null,
    address: 'Manipal, Udupi',
    latitude: 13.3525,
    longitude: 74.7864,
    distanceKm: 1.2,
    schoolCategory: 'secondary',
    areaKey: 'IN|KA|Udupi|Manipal',
  },
  {
    id: 'sch-stub-2',
    name: 'MIT Vidyaniketan',
    board: 'STATE',
    boardType: null,
    address: 'Manipal, Udupi',
    latitude: 13.351,
    longitude: 74.785,
    distanceKm: 1.5,
    schoolCategory: 'primary',
    areaKey: 'IN|KA|Udupi|Manipal',
  },
];

// Popular schools — same SchoolResult shape; distanceKm required.
// areaKey supplied so setSchoolJourney resolves it without a bbox cache lookup.
const POPULAR_SCHOOLS_STUB = [
  {
    id: 'sch-stub-1',
    name: 'Manipal Public School',
    board: 'CBSE',
    boardType: null,
    address: 'Manipal, Udupi',
    latitude: 13.3525,
    longitude: 74.7864,
    distanceKm: 1.2,
    areaKey: 'IN|KA|Udupi|Manipal',
  },
];

const EMPTY_LISTINGS_PAGE = {
  content: [],
  page: 0,
  size: 50,
  totalElements: 0,
  totalPages: 0,
  aggregates: { topLocalities: [] },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Use PLAYWRIGHT_BASE_URL when set (e.g. http://localhost:5173) — fallback for local dev.
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';

function fulfillJson(route: Route, body: unknown): Promise<void> {
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

async function setupStubs(page: Page) {
  await page.route('**/api/discover/area-groups**', (route) => fulfillJson(route, AREA_GROUPS_STUB));
  await page.route('**/api/discover/areas**', (route) => fulfillJson(route, DISCOVER_AREAS_STUB));
  // useSchoolsByArea fetches /api/public/schools/by-area (not /api/discover/schools).
  await page.route('**/api/public/schools/by-area**', (route) => fulfillJson(route, SCHOOLS_BY_AREA_STUB));
  await page.route('**/api/public/schools/popular**', (route) => fulfillJson(route, POPULAR_SCHOOLS_STUB));
  // useSchoolById fetches /api/public/schools/{id} for cold-load URL restoration.
  // Without this stub the fetch 404s → MapDiscovery's error-cleanup effect fires
  // setSchoolParams(null) and erases schoolId+radiusKm from the URL — a false-negative.
  await page.route('**/api/public/schools/sch-stub-1', (route) =>
    fulfillJson(route, SCHOOLS_BY_AREA_STUB[0]),
  );
  // School-radius listings endpoint — return empty page for L4 tests.
  await page.route('**/api/listings/school-radius**', (route) => fulfillJson(route, EMPTY_LISTINGS_PAGE));
  // Suppress any other listing/trends calls that would race.
  await page.route('**/api/listings**', (route) => fulfillJson(route, EMPTY_LISTINGS_PAGE));
  await page.route('**/api/trends/**', (route) => fulfillJson(route, { city: 'udupi', defaultAreas: [] }));
}

function schoolFirstBrowseUrl(params: Record<string, string> = {}) {
  const sp = new URLSearchParams({ city: 'udupi', journey: 'school-first', ...params });
  return `${BASE_URL}/discover?${sp.toString()}`;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('school-first grouped hierarchy (Issue #1485)', () => {
  test.beforeEach(async ({ page }) => {
    await setupStubs(page);
  });

  // AC1: school-browse (L1) shows zone cards + search shortcut
  test('AC1 school-browse (L1): zone cards shown with metrics + search shortcut present', async ({ page }) => {
    await page.goto(schoolFirstBrowseUrl());

    // Search shortcut must be present at L1
    await expect(page.getByPlaceholder('Search school name...')).toBeVisible();

    // Both zone cards from the stub must render
    await expect(page.getByTestId('school-zone-card-south-zone')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('school-zone-card-north-zone')).toBeVisible();

    // Zone card badges — assert non-trivial content (not just "truthy")
    const southCard = page.getByTestId('school-zone-card-south-zone');
    // South Zone has 4+2=6 schools, 12+7=19 listings, 2 areas from stub
    await expect(southCard.getByTestId('school-zone-card-school-count')).toContainText('school');
    await expect(southCard.getByTestId('school-zone-card-listing-count')).toContainText('listing');
    await expect(southCard.getByTestId('school-zone-card-area-count')).toContainText('area');

    // Screenshot: L1 zone cards
    await page.screenshot({ path: 'test-results/1485-ac1-zones-l1.png' });
  });

  // AC2: zone card click → school-group-areas (L2) with that group's areas only
  test('AC2 zone click → L2 areas panel with group members only', async ({ page }) => {
    await page.goto(schoolFirstBrowseUrl());
    await expect(page.getByTestId('school-zone-card-south-zone')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('school-zone-card-south-zone').click();

    // URL must have exactly groupId=south-zone
    await expect(page).toHaveURL(/groupId=south-zone/, { timeout: 5_000 });

    // L2 area list container must be visible
    await expect(page.getByTestId('school-group-areas-list')).toBeVisible({ timeout: 10_000 });

    // South Zone contains Manipal + Malpe — both must appear
    await expect(page.getByTestId('school-group-area-row-IN|KA|Udupi|Manipal')).toBeVisible();
    await expect(page.getByTestId('school-group-area-row-IN|KA|Udupi|Malpe')).toBeVisible();

    // North Zone areas must NOT appear (cross-zone isolation)
    await expect(page.getByTestId('school-group-area-row-IN|KA|Udupi|Padubidri')).not.toBeVisible();
    await expect(page.getByTestId('school-group-area-row-IN|KA|Udupi|Shirva')).not.toBeVisible();

    // Screenshot: L2 areas-in-zone
    await page.screenshot({ path: 'test-results/1485-ac2-areas-l2.png' });
  });

  // AC2: cold-load at groupId URL restores L2 directly (no interaction needed)
  test('AC2 cold-load: ?groupId=south-zone restores L2 area list', async ({ page }) => {
    await page.goto(schoolFirstBrowseUrl({ groupId: 'south-zone' }));
    await expect(page.getByTestId('school-group-areas-list')).toBeVisible({ timeout: 10_000 });
    // Manipal must appear (confirms correct group membership loaded)
    await expect(page.getByTestId('school-group-area-row-IN|KA|Udupi|Manipal')).toBeVisible();
    // Padubidri must NOT appear (wrong group)
    await expect(page.getByTestId('school-group-area-row-IN|KA|Udupi|Padubidri')).not.toBeVisible();
  });

  // AC3: area row click → schools-in-area (L3), groupId retained in URL
  test('AC3 area click → schools-in-area (L3), groupId retained', async ({ page }) => {
    await page.goto(schoolFirstBrowseUrl({ groupId: 'south-zone' }));
    await expect(page.getByTestId('school-group-area-row-IN|KA|Udupi|Manipal')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('school-group-area-row-IN|KA|Udupi|Manipal').click();

    // URL must contain the exact URL-encoded areaKey — no vacuous alternative
    // IN|KA|Udupi|Manipal encodes to IN%7CKA%7CUdupi%7CManipal
    await expect(page).toHaveURL(/areaKey=IN%7CKA%7CUdupi%7CManipal/, { timeout: 5_000 });
    // groupId must still be present (retained, not cleared)
    await expect(page).toHaveURL(/groupId=south-zone/);

    // L3 SchoolsInAreaPanel renders "Schools in Manipal" header
    await expect(page.getByText(/schools in manipal/i)).toBeVisible({ timeout: 10_000 });
  });

  // AC4: school click (L3 → L4) → schoolId set in URL + school-selected panel renders
  test('AC4 school click → school-selected (L4), schoolId in URL', async ({ page }) => {
    // Start at L3: groupId + areaKey both set
    await page.goto(schoolFirstBrowseUrl({ groupId: 'south-zone', areaKey: 'IN|KA|Udupi|Manipal' }));

    // Wait for L3 panel (Schools in Manipal) to be ready
    await expect(page.getByText(/schools in manipal/i)).toBeVisible({ timeout: 10_000 });

    // School cards from the by-area stub should appear
    await expect(page.getByText('Manipal Public School')).toBeVisible({ timeout: 10_000 });

    // Click the first school card
    await page.getByText('Manipal Public School').click();

    // URL must gain schoolId=sch-stub-1
    await expect(page).toHaveURL(/schoolId=sch-stub-1/, { timeout: 5_000 });
    // areaKey and groupId must still be present
    await expect(page).toHaveURL(/areaKey=IN%7CKA%7CUdupi%7CManipal/);
    await expect(page).toHaveURL(/groupId=south-zone/);

    // L4 panel: school-selected (combined or school-selected) — assert it rendered
    // The panel shows school-radius listings; empty page is stubbed so no listing rows,
    // but the panel itself must be visible (not L3 "Schools in Manipal").
    await expect(page.getByText(/schools in manipal/i)).not.toBeVisible({ timeout: 5_000 });
  });

  // AC5: Back from L4 (school-selected) → L3 (schools-in-area), clears schoolId only
  test('AC5 Back from L4 clears schoolId → returns to L3 schools-in-area', async ({ page }) => {
    // Start at L4: groupId + areaKey + schoolId
    await page.goto(
      schoolFirstBrowseUrl({ groupId: 'south-zone', areaKey: 'IN|KA|Udupi|Manipal', schoolId: 'sch-stub-1' }),
    );

    // L4 must be the active panel (L3 "Schools in Manipal" not visible)
    await expect(page.getByText(/schools in manipal/i)).not.toBeVisible({ timeout: 10_000 });

    // Find and click the Back button at L4
    const backBtn = page.getByRole('button', { name: /back/i }).first();
    await expect(backBtn).toBeVisible({ timeout: 5_000 });
    await backBtn.click();

    // schoolId must be gone; areaKey + groupId must remain
    await expect(page).not.toHaveURL(/schoolId=/, { timeout: 5_000 });
    await expect(page).toHaveURL(/areaKey=IN%7CKA%7CUdupi%7CManipal/);
    await expect(page).toHaveURL(/groupId=south-zone/);

    // Back at L3: "Schools in Manipal" header visible
    await expect(page.getByText(/schools in manipal/i)).toBeVisible({ timeout: 10_000 });
  });

  // AC5 Back ladder: L2 → L1 (clear groupId, return to zone cards)
  test('AC5 Back from L2 clears groupId → returns to L1 zone cards', async ({ page }) => {
    await page.goto(schoolFirstBrowseUrl({ groupId: 'south-zone' }));
    await expect(page.getByTestId('school-group-areas-back-btn')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('school-group-areas-back-btn').click();

    // URL must no longer contain groupId
    await expect(page).not.toHaveURL(/groupId=/, { timeout: 5_000 });
    // L1 zone cards must be visible again
    await expect(page.getByTestId('school-zone-card-south-zone')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('school-zone-card-north-zone')).toBeVisible();
  });

  // AC5 Back ladder: L3 → L2 (clear areaKey, keep groupId)
  test('AC5 Back from L3 clears areaKey, keeps groupId → returns to L2', async ({ page }) => {
    await page.goto(schoolFirstBrowseUrl({ groupId: 'south-zone', areaKey: 'IN|KA|Udupi|Manipal' }));
    await expect(page.getByText(/schools in manipal/i)).toBeVisible({ timeout: 10_000 });

    // Click the panel-level Back button (first Back-labelled button on the page)
    const backBtn = page.getByRole('button', { name: /back/i }).first();
    await backBtn.click();

    // groupId retained, areaKey removed
    await expect(page).toHaveURL(/groupId=south-zone/, { timeout: 5_000 });
    await expect(page).not.toHaveURL(/areaKey=/);
    // Back at L2 — area list container visible
    await expect(page.getByTestId('school-group-areas-list')).toBeVisible({ timeout: 10_000 });
    // Manipal area row visible again
    await expect(page.getByTestId('school-group-area-row-IN|KA|Udupi|Manipal')).toBeVisible();
  });

  // AC6: Start Over clears groupId + areaKey → guided-entry
  test('AC6 Start Over clears all school-first params → guided-entry', async ({ page }) => {
    await page.goto(schoolFirstBrowseUrl({ groupId: 'south-zone' }));
    await expect(page.getByTestId('school-group-areas-list')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /start over/i }).click();

    // URL must not retain journey, groupId, or areaKey
    await expect(page).not.toHaveURL(/journey=/, { timeout: 5_000 });
    await expect(page).not.toHaveURL(/groupId=/);
    await expect(page).not.toHaveURL(/areaKey=/);
    // Guided-entry panel visible
    await expect(page.getByText('Find properties your way')).toBeVisible({ timeout: 5_000 });
  });

  // AC8: invalid groupId → safe fallback to school-browse, no crash
  test('AC8 invalid groupId → safe fallback to school-browse (no crash)', async ({ page }) => {
    await page.goto(schoolFirstBrowseUrl({ groupId: 'no-such-group' }));

    // Must not crash — school-browse (L1) must render with search input
    await expect(page.getByPlaceholder('Search school name...')).toBeVisible({ timeout: 10_000 });
    // SchoolGroupAreasPanel must NOT be visible
    await expect(page.getByTestId('school-group-areas-list')).not.toBeVisible();
  });

  // AC9 regression: school-name search shortcut still works at L1
  test('AC9 regression: school-name search shortcut selects a school directly', async ({ page }) => {
    await page.goto(schoolFirstBrowseUrl());
    await expect(page.getByPlaceholder('Search school name...')).toBeVisible({ timeout: 10_000 });

    // Popular school card from stub must render
    await expect(page.getByText('Manipal Public School')).toBeVisible({ timeout: 10_000 });

    // Clicking popular school must write schoolId to URL (not just navigate)
    await page.getByText('Manipal Public School').click();
    await expect(page).toHaveURL(/schoolId=sch-stub-1/, { timeout: 5_000 });
  });

  // AC9 regression: area-first journey with groupId must NOT show school-group-areas
  test('AC9 regression: area-first + groupId → area-groups-landing (not school-group-areas)', async ({ page }) => {
    await page.goto(`${BASE_URL}/discover?city=udupi&journey=area-first&groupId=south-zone`);

    // Area-first landing panel must appear — "Select area" or group-cards heading
    await expect(page.getByText('Select area')).toBeVisible({ timeout: 10_000 });
    // school-group-areas panel must NOT render (cross-journey isolation)
    await expect(page.getByTestId('school-group-areas-list')).not.toBeVisible();
  });
});
