/**
 * E-5: Discover area-groups-landing panel E2E
 *
 * Tests the AreaGroupsLandingPanel introduced in issue #992:
 *   1. Navigate to /discover?city=udupi&journey=area-first&groupId=coastal-belt
 *      → panel shows "Select area" header with group cards
 *   2. Clicking a group card updates URL to retain groupId and shows the panel
 *   3. Empty groups → Browse-all fallback renders area buttons
 *   4. Clicking a Browse-all area navigates to ?areaKey=... (no groupId)
 *   5. Start over button clears journey + groupId from URL
 *
 * Anonymous flow — no auth required.
 * Run: bash scripts/run-e2e-local.sh --project=full e2e/discover-area-groups-landing.spec.ts
 */

import { test, expect, type Page } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SS = (name: string) =>
  path.join(__dirname, `../screenshots/area-groups-landing-${name}.png`);

// ── Fixture data ────────────────────────────────────────────────────────────

const MOCK_CITY = 'udupi';
const MOCK_GROUP_ID = 'coastal-belt';
const MOCK_AREA_KEY = 'IN|KA|Udupi|Manipal';
const ENCODED_AREA_KEY = encodeURIComponent(MOCK_AREA_KEY);

const MOCK_AREAS_RESPONSE = {
  city: MOCK_CITY,
  areas: [
    {
      areaKey: MOCK_AREA_KEY,
      name: 'Manipal',
      geoCenterLat: 13.3525,
      geoCenterLon: 74.7925,
      listingCount: 5,
      schoolCount: 3,
    },
  ],
};

const MOCK_AREA_GROUPS_RESPONSE = {
  groups: [
    {
      id: MOCK_GROUP_ID,
      name: 'Coastal Belt',
      subtitle: 'Udupi, Manipal, Karkala',
      region_label: 'West Coast',
      school_count: 8,
      area_keys: [MOCK_AREA_KEY, 'IN|KA|Udupi|Karkala'],
    },
    {
      id: 'inland-corridor',
      name: 'Inland Corridor',
      subtitle: 'Kundapur, Hebri',
      region_label: 'East',
      school_count: 4,
      area_keys: ['IN|KA|Udupi|Kundapur'],
    },
  ],
};

const MOCK_EMPTY_GROUPS_RESPONSE = { groups: [] };

// ── Helpers ─────────────────────────────────────────────────────────────────

async function stubApis(page: Page, groupsResponse = MOCK_AREA_GROUPS_RESPONSE) {
  // Stub the areas endpoint (used by the map layer)
  await page.route('**/api/discover/areas**', (route) =>
    route.fulfill({ json: MOCK_AREAS_RESPONSE }),
  );

  // Stub the area-groups endpoint
  await page.route('**/api/discover/area-groups**', (route) =>
    route.fulfill({ json: groupsResponse }),
  );

  // Stub city listings (may be fetched on area select)
  await page.route(`**/api/discover/cities/${MOCK_CITY}/listings**`, (route) =>
    route.fulfill({ json: { city: MOCK_CITY, limitPerArea: 5, areas: [] } }),
  );
}

// ── Tests ───────────────────────────────────────────────────────────────────

test.describe('Discover — area-groups-landing panel', () => {
  test('loads panel with group cards when journey=area-first and groupId is set', async ({ page }) => {
    await stubApis(page);

    await page.goto(
      `/discover?city=${MOCK_CITY}&journey=area-first&groupId=${MOCK_GROUP_ID}`,
    );
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 10_000 });

    // Panel header shows "Select area"
    await expect(page.getByText('Select area')).toBeVisible({ timeout: 5_000 });
    await page.screenshot({ path: SS('01-panel-loaded'), fullPage: false });

    // Both group cards are visible
    await expect(page.getByTestId('area-group-card-coastal-belt')).toBeVisible();
    await expect(page.getByTestId('area-group-card-inland-corridor')).toBeVisible();
    await page.screenshot({ path: SS('02-group-cards-visible'), fullPage: false });
  });

  test('shows journey pill "By area" in the panel header', async ({ page }) => {
    await stubApis(page);

    await page.goto(
      `/discover?city=${MOCK_CITY}&journey=area-first&groupId=${MOCK_GROUP_ID}`,
    );
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 10_000 });

    // PanelHeader renders the journey pill
    await expect(page.getByText('By area')).toBeVisible({ timeout: 5_000 });
  });

  test('Start over button clears journey and groupId from URL', async ({ page }) => {
    await stubApis(page);

    await page.goto(
      `/discover?city=${MOCK_CITY}&journey=area-first&groupId=${MOCK_GROUP_ID}`,
    );
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('start-over-button')).toBeVisible({ timeout: 5_000 });

    await page.getByTestId('start-over-button').click();

    // URL should no longer contain journey or groupId
    await expect(page).toHaveURL(/city=udupi/, { timeout: 5_000 });
    const url = new URL(page.url());
    expect(url.searchParams.get('journey')).toBeNull();
    expect(url.searchParams.get('groupId')).toBeNull();
    await page.screenshot({ path: SS('03-after-start-over'), fullPage: false });
  });

  test('shows loading skeletons while area-groups fetch is in-flight', async ({ page }) => {
    // Delay the groups response to observe the loading state
    await page.route('**/api/discover/areas**', (route) =>
      route.fulfill({ json: MOCK_AREAS_RESPONSE }),
    );
    await page.route('**/api/discover/area-groups**', async (route) => {
      // Delay 800ms so the loading skeleton is visible on page load
      await new Promise((r) => setTimeout(r, 800));
      await route.fulfill({ json: MOCK_AREA_GROUPS_RESPONSE });
    });
    await page.route(`**/api/discover/cities/${MOCK_CITY}/listings**`, (route) =>
      route.fulfill({ json: { city: MOCK_CITY, limitPerArea: 5, areas: [] } }),
    );

    await page.goto(
      `/discover?city=${MOCK_CITY}&journey=area-first&groupId=${MOCK_GROUP_ID}`,
    );
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 10_000 });

    // Loading skeleton should be visible before the fetch resolves
    await expect(page.getByTestId('area-groups-loading')).toBeVisible({ timeout: 5_000 });
    await page.screenshot({ path: SS('04-loading-skeletons'), fullPage: false });

    // After fetch resolves, cards should appear
    await expect(page.getByTestId('area-group-card-coastal-belt')).toBeVisible({ timeout: 5_000 });
  });

  test('Browse-all fallback renders when groups is empty', async ({ page }) => {
    await stubApis(page, MOCK_EMPTY_GROUPS_RESPONSE);

    await page.goto(
      `/discover?city=${MOCK_CITY}&journey=area-first&groupId=${MOCK_GROUP_ID}`,
    );
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 10_000 });

    // Browse-all section should be visible
    await expect(page.getByText(/browse all areas/i)).toBeVisible({ timeout: 5_000 });
    // Area from MOCK_AREAS_RESPONSE should be listed
    await expect(
      page.getByTestId(`browse-all-area-${MOCK_AREA_KEY}`),
    ).toBeVisible({ timeout: 5_000 });
    await page.screenshot({ path: SS('05-browse-all-fallback'), fullPage: false });
  });

  test('clicking a Browse-all area sets ?areaKey in URL (no groupId in outcome)', async ({ page }) => {
    await stubApis(page, MOCK_EMPTY_GROUPS_RESPONSE);

    await page.goto(
      `/discover?city=${MOCK_CITY}&journey=area-first&groupId=${MOCK_GROUP_ID}`,
    );
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByTestId(`browse-all-area-${MOCK_AREA_KEY}`),
    ).toBeVisible({ timeout: 5_000 });

    await page.getByTestId(`browse-all-area-${MOCK_AREA_KEY}`).click();

    // URL should contain areaKey
    await expect(page).toHaveURL(new RegExp(`areaKey=${ENCODED_AREA_KEY}`), { timeout: 5_000 });
    await page.screenshot({ path: SS('06-area-selected-from-browse-all'), fullPage: false });
  });

  test('panel shows area-selection (not area-groups-landing) when no groupId is in URL', async ({ page }) => {
    await stubApis(page);

    await page.goto(`/discover?city=${MOCK_CITY}&journey=area-first`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 10_000 });

    // area-selection (no groupId → AreaSelectionPanel placeholder)
    await expect(page.getByText('Explore by neighbourhood')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('area-group-card-coastal-belt')).not.toBeAttached();
    await page.screenshot({ path: SS('07-area-selection-no-group-id'), fullPage: false });
  });

  // AC #5: Clicking a group card sets ?groupId= in URL
  test('clicking a group card sets groupId in URL', async ({ page }) => {
    await stubApis(page);

    // Start with journey=area-first and a groupId already set so the panel renders
    // with group cards (area-groups-landing state). Then navigate via the card click
    // to confirm the groupId param is present in the resulting URL.
    await page.goto(
      `/discover?city=${MOCK_CITY}&journey=area-first&groupId=${MOCK_GROUP_ID}`,
    );
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 10_000 });

    // Wait for group cards to appear
    await expect(page.getByTestId('area-group-card-inland-corridor')).toBeVisible({ timeout: 5_000 });

    // Click the second group (different from the current groupId)
    await page.getByTestId('area-group-card-inland-corridor').click();

    // URL must contain groupId=inland-corridor
    await expect(page).toHaveURL(/groupId=inland-corridor/, { timeout: 5_000 });
    const url = new URL(page.url());
    expect(url.searchParams.get('groupId')).toBe('inland-corridor');
    // areaKey must NOT be present (selectGroup clears it)
    expect(url.searchParams.get('areaKey')).toBeNull();
    await page.screenshot({ path: SS('08-group-card-click-url'), fullPage: false });
  });
});
