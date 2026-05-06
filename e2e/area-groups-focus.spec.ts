/**
 * A3 #993: Focused-group map behaviour + area marker selection E2E
 *
 * Tests the group-focused map changes introduced in A3:
 *   1. Group card click → map refocuses (URL has groupId, no areaKey)
 *   2. Area marker click inside a group → URL has both ?groupId and ?areaKey
 *   3. Browser back from area-selected → returns to group-focused state
 *      (URL: groupId present, areaKey absent)
 *
 * Anonymous flow — no auth required.
 * Run: bash scripts/run-e2e-local.sh --project=smoke e2e/area-groups-focus.spec.ts
 */

import { test, expect, type Page } from '@playwright/test';

// ── Fixture data ─────────────────────────────────────────────────────────────

const MOCK_CITY      = 'udupi';
const MOCK_GROUP_ID  = 'coastal-belt';
const MOCK_GROUP_ID2 = 'inland-corridor';
const MOCK_AREA_KEY  = 'IN|KA|Udupi|Manipal';
const MOCK_AREA_KEY_2 = 'IN|KA|Udupi|Karkala';

const MOCK_AREAS_RESPONSE = {
  city: MOCK_CITY,
  areas: [
    {
      areaKey: MOCK_AREA_KEY,
      name: 'Manipal',
      geoCenterLat: 13.3525,
      geoCenterLon: 74.7925,
      bbox: [[13.32, 74.76], [13.38, 74.82]],
      listingCount: 5,
      schoolCount: 3,
    },
    {
      areaKey: MOCK_AREA_KEY_2,
      name: 'Karkala',
      geoCenterLat: 13.20,
      geoCenterLon: 74.99,
      bbox: [[13.17, 74.96], [13.23, 75.02]],
      listingCount: 3,
      schoolCount: 1,
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
      area_keys: [MOCK_AREA_KEY, MOCK_AREA_KEY_2],
    },
    {
      id: MOCK_GROUP_ID2,
      name: 'Inland Corridor',
      subtitle: 'Kundapur, Hebri',
      region_label: 'East',
      school_count: 4,
      area_keys: ['IN|KA|Udupi|Kundapur'],
    },
  ],
};

// ── Helpers ──────────────────────────────────────────────────────────────────

async function stubApis(page: Page) {
  await page.route('**/api/discover/areas**', (route) =>
    route.fulfill({ json: MOCK_AREAS_RESPONSE }),
  );
  await page.route('**/api/discover/area-groups**', (route) =>
    route.fulfill({ json: MOCK_AREA_GROUPS_RESPONSE }),
  );
  await page.route(`**/api/discover/cities/${MOCK_CITY}/listings**`, (route) =>
    route.fulfill({ json: { city: MOCK_CITY, limitPerArea: 5, areas: [] } }),
  );
}

/**
 * Navigate to the area-groups-landing panel state (groupId set, no areaKey).
 * This is the only URL state that renders group cards.
 */
async function gotoGroupLanding(page: Page, groupId = MOCK_GROUP_ID) {
  await stubApis(page);
  await page.goto(
    `/discover?city=${MOCK_CITY}&journey=area-first&groupId=${groupId}`,
  );
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 10_000 });
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('A3 #993 — Focused-group map behaviour', () => {

  /**
   * Test 1: clicking a group card updates the URL's groupId.
   *
   * Setup: start in area-groups-landing state (groupId=coastal-belt) so that
   * group cards are visible. Click the second group card (inland-corridor) to
   * trigger a groupId change and verify the URL and marker opacity update.
   */
  test('group card click sets groupId in URL and shows area-groups-landing panel', async ({ page }) => {
    // Start in area-groups-landing (groupId set → group cards rendered)
    await gotoGroupLanding(page, MOCK_GROUP_ID);

    // Both group cards must be visible before clicking
    await expect(
      page.getByTestId(`area-group-card-${MOCK_GROUP_ID}`),
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      page.getByTestId(`area-group-card-${MOCK_GROUP_ID2}`),
    ).toBeVisible({ timeout: 5_000 });

    // Click the second group card to switch groups
    await page.getByTestId(`area-group-card-${MOCK_GROUP_ID2}`).click();

    // URL must include the new groupId and no areaKey
    await expect(page).toHaveURL(new RegExp(`groupId=${MOCK_GROUP_ID2}`), { timeout: 5_000 });
    const url = new URL(page.url());
    expect(url.searchParams.get('groupId')).toBe(MOCK_GROUP_ID2);
    expect(url.searchParams.get('areaKey')).toBeNull();

    // Panel must still show "Select area" (area-groups-landing state)
    await expect(page.getByText('Select area')).toBeVisible({ timeout: 5_000 });

    // Area markers for non-group members should be dimmed (opacity:0.3 in inline style).
    // MOCK_AREA_KEY and MOCK_AREA_KEY_2 belong to coastal-belt, not inland-corridor,
    // so both markers should be rendered at 0.3 opacity.
    // We wait for markers to appear then check the first one.
    const firstMarker = page.locator('[data-testid="area-marker"]').first();
    await expect(firstMarker).toBeVisible({ timeout: 8_000 });
    // At least one dimmed marker must exist — all areas belong to coastal-belt, not inland-corridor
    const dimmedMarkers = page.locator('[data-testid="area-marker"][style*="opacity:0.3"]');
    await expect(dimmedMarkers.first()).toBeVisible({ timeout: 5_000 });
  });

  /**
   * Test 2: area marker click while group is active sets both ?groupId and ?areaKey in URL.
   */
  test('area marker click while group is active sets both ?groupId and ?areaKey in URL', async ({ page }) => {
    // Navigate to group-landing state — the map shows area markers.
    await gotoGroupLanding(page);

    // Wait for area markers to appear, then click the first one
    const areaMarker = page.locator('[data-testid="area-marker"]').first();
    await expect(areaMarker).toBeVisible({ timeout: 8_000 });
    await areaMarker.click();

    // Both params must be present in the URL
    await expect(page).toHaveURL(/areaKey=/, { timeout: 5_000 });
    const url = new URL(page.url());
    expect(url.searchParams.get('groupId')).toBe(MOCK_GROUP_ID);
    expect(url.searchParams.get('areaKey')).not.toBeNull();
  });

  /**
   * Test 3: browser back from area-selected returns to group-focused state.
   *
   * Build real browser history:
   *   (1) Navigate to group-landing (groupId set, no areaKey) — history entry 1
   *   (2) Navigate to area-selected (groupId + areaKey set) — history entry 2
   *   (3) goBack() — should return to entry 1: groupId present, areaKey absent
   */
  test('browser back from area-selected returns to group-focused state (groupId present, areaKey absent)', async ({ page }) => {
    // Step 1: land on group-landing state to push it into browser history
    await gotoGroupLanding(page, MOCK_GROUP_ID);

    // Step 2: navigate forward to area-selected state (pushes a new history entry)
    const encodedAreaKey = encodeURIComponent(MOCK_AREA_KEY);
    await page.goto(
      `/discover?city=${MOCK_CITY}&journey=area-first&groupId=${MOCK_GROUP_ID}&areaKey=${encodedAreaKey}`,
    );
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 10_000 });
    // Confirm we are in area-selected state
    await expect(page).toHaveURL(/areaKey=/, { timeout: 5_000 });

    // Step 3: go back — should return to group-focused state
    await page.goBack();

    // URL must have groupId but no areaKey
    await expect(page).toHaveURL(new RegExp(`groupId=${MOCK_GROUP_ID}`), { timeout: 5_000 });
    const url = new URL(page.url());
    expect(url.searchParams.get('groupId')).toBe(MOCK_GROUP_ID);
    expect(url.searchParams.get('areaKey')).toBeNull();
  });

  /**
   * Test 4: landing on ?groupId URL directly renders area-groups-landing panel.
   */
  test('area-groups-landing panel: group is already selected when landing on groupId URL', async ({ page }) => {
    await gotoGroupLanding(page);

    // Panel must show "Select area" and the group card for the active group
    await expect(page.getByText('Select area')).toBeVisible({ timeout: 5_000 });
    await expect(
      page.getByTestId(`area-group-card-${MOCK_GROUP_ID}`),
    ).toBeVisible({ timeout: 5_000 });

    // URL must have groupId and no areaKey
    const url = new URL(page.url());
    expect(url.searchParams.get('groupId')).toBe(MOCK_GROUP_ID);
    expect(url.searchParams.get('areaKey')).toBeNull();
  });

});
