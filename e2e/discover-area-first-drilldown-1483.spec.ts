/**
 * E2E: Issue #1483 — area-first group → area → listings Level-2 drill-down
 *
 * Covers the new AreaGroupsLandingPanel Level-2 behaviour: when
 * `journey=area-first` + `groupId` resolves to a loaded group (and no `areaKey`
 * is present), the panel renders that group's area rows instead of group cards.
 *
 * All tests are stub-first (page.route) — no backend required.
 *
 * Run:
 *   PLAYWRIGHT_BASE_URL=http://localhost:5173 \
 *   npx playwright test e2e/discover-area-first-drilldown-1483.spec.ts --project=chromium
 */

import { test, expect, type Page } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SS = (name: string) =>
  path.join(__dirname, `../screenshots/area-first-drilldown-1483-${name}.png`);

// ── Fixture constants ─────────────────────────────────────────────────────────

const CITY = 'udupi';
const GROUP_ID = 'south-udupi';
const AREA_KEY_MANIPAL = 'IN|KA|Udupi|Manipal';
const AREA_KEY_UDYAVAR = 'IN|KA|Udupi|Udyavar';
const ENCODED_AREA_KEY_MANIPAL = encodeURIComponent(AREA_KEY_MANIPAL);

// Backend DTO shape for /api/discover/area-groups
// slug → normalised to id by useAreaGroups hook; areaKeys → area_keys after normalisation.
const MOCK_AREA_GROUPS = {
  city: CITY,
  groups: [
    {
      slug: GROUP_ID,
      name: 'South Udupi',
      subtitle: 'Manipal, Udyavar',
      regionLabel: 'South',
      displayOrder: 1,
      areaKeys: [AREA_KEY_MANIPAL, AREA_KEY_UDYAVAR],
      focusLat: 13.19,
      focusLon: 74.79,
      minLat: 13.0,
      minLon: 74.6,
      maxLat: 13.4,
      maxLon: 75.0,
    },
    {
      slug: 'north-udupi',
      name: 'North Udupi',
      subtitle: 'Brahmavar, Shirva',
      regionLabel: 'North',
      displayOrder: 2,
      areaKeys: ['IN|KA|Udupi|Brahmavar'],
      focusLat: 13.42,
      focusLon: 74.79,
      minLat: 13.3,
      minLon: 74.6,
      maxLat: 13.6,
      maxLon: 75.0,
    },
  ],
};

// Backend DTO shape for /api/discover/areas
const MOCK_AREAS = {
  city: CITY,
  areas: [
    {
      areaKey: AREA_KEY_MANIPAL,
      name: 'Manipal',
      geoCenterLat: 13.3525,
      geoCenterLon: 74.7864,
      listingCount: 7,
    },
    {
      areaKey: AREA_KEY_UDYAVAR,
      name: 'Udyavar',
      geoCenterLat: 13.19,
      geoCenterLon: 74.78,
      listingCount: 3,
    },
    {
      areaKey: 'IN|KA|Udupi|Brahmavar',
      name: 'Brahmavar',
      geoCenterLat: 13.42,
      geoCenterLon: 74.78,
      listingCount: 5,
    },
  ],
};

// Minimal city-listings response — used to satisfy the useDiscoverCityListings query
// that fires when an areaKey is set (Level 3).
const MOCK_CITY_LISTINGS = {
  city: CITY,
  limitPerArea: 5,
  areas: [
    {
      areaKey: AREA_KEY_MANIPAL,
      areaName: 'Manipal',
      listings: [
        {
          id: 'listing-abc-1',
          pricePaise: 5000000,
          propertyType: 'apartment',
          locality: 'Manipal',
          primaryImageUrl: null,
          listingPurpose: 'sale',
        },
      ],
    },
  ],
};

// ── Stub helpers ──────────────────────────────────────────────────────────────

async function stubDiscoverApis(page: Page) {
  // INTEGRATION-UI: stub justified — backend is down; test must be deterministic.
  await page.route('**/api/discover/area-groups**', (route) =>
    route.fulfill({ json: MOCK_AREA_GROUPS }),
  );

  // INTEGRATION-UI: stub justified — isolate from backend variability.
  await page.route('**/api/discover/areas**', (route) =>
    route.fulfill({ json: MOCK_AREAS }),
  );

  // INTEGRATION-UI: stub justified — satisfy city-listings hook when areaKey is set.
  await page.route(`**/api/discover/cities/${CITY}/listings**`, (route) =>
    route.fulfill({ json: MOCK_CITY_LISTINGS }),
  );

  // Stub school / marker / agri endpoints to avoid unhandled 404s that may
  // interfere with React-Query retries in the test environment.
  await page.route('**/api/discover/regional-area-groups**', (route) =>
    route.fulfill({ json: { groups: [] } }),
  );
  await page.route('**/api/discover/agri-map-listings**', (route) =>
    route.fulfill({ json: { listings: [] } }),
  );
  await page.route('**/api/discover/markers**', (route) =>
    route.fulfill({ status: 401, json: { error: 'Unauthorized' } }),
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('@integration-ui Issue #1483 — area-first Level-2 drill-down', () => {

  /**
   * AC1 — deep-link with groupId (no areaKey) → Level-2 area rows visible;
   * NO group cards visible; NO listings rendered.
   */
  test('AC1: deep-link with groupId shows group area rows (Level 2), not group cards', async ({ page }) => {
    await stubDiscoverApis(page);

    await page.goto(
      `/discover?city=${CITY}&journey=area-first&groupId=${GROUP_ID}`,
    );
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 10_000 });

    // Level-2 container must be present
    await expect(page.getByTestId('area-group-level2')).toBeVisible({ timeout: 8_000 });

    // Area rows for the group's areaKeys must be listed
    await expect(page.getByTestId(`browse-all-area-${AREA_KEY_MANIPAL}`)).toBeVisible();
    await expect(page.getByTestId(`browse-all-area-${AREA_KEY_UDYAVAR}`)).toBeVisible();

    // Level-1 group cards must NOT be visible
    await expect(page.getByTestId(`area-group-card-${GROUP_ID}`)).not.toBeVisible();
    await expect(page.getByTestId('area-group-card-north-udupi')).not.toBeVisible();
    await expect(page.getByTestId('area-groups-list')).not.toBeVisible();

    // No listings panel content (no area selected yet)
    await expect(page.getByTestId('listing-skeleton')).not.toBeAttached();
    await expect(page.getByTestId('add-school-cta')).not.toBeAttached();

    await page.screenshot({ path: SS('ac1-level2-area-rows'), fullPage: false });
  });

  /**
   * AC3 — clicking an area row sets areaKey in URL; Level-3 area-selected panel renders.
   * Level-2 container must disappear.
   */
  test('AC3: clicking area row sets areaKey and renders area-selected panel (Level 3)', async ({ page }) => {
    await stubDiscoverApis(page);

    await page.goto(
      `/discover?city=${CITY}&journey=area-first&groupId=${GROUP_ID}`,
    );
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('area-group-level2')).toBeVisible({ timeout: 8_000 });

    // Click the Manipal area row
    await page.getByTestId(`browse-all-area-${AREA_KEY_MANIPAL}`).click();

    // URL must gain areaKey
    await expect(page).toHaveURL(
      new RegExp(`areaKey=${ENCODED_AREA_KEY_MANIPAL}`),
      { timeout: 5_000 },
    );

    // Level-3 area-selected panel: area-set-schools-tile (Issue #2017 —
    // formerly add-school-cta) is a reliable marker unique to AreaSelectedPanel
    await expect(page.getByTestId('area-set-schools-tile')).toBeVisible({ timeout: 8_000 });

    // Level-2 container must be gone
    await expect(page.getByTestId('area-group-level2')).not.toBeAttached();

    await page.screenshot({ path: SS('ac3-level3-area-selected'), fullPage: false });
  });

  /**
   * AC4 — browser Back from Level-3 listings → returns to Level-2 area list.
   * groupId must be retained; areaKey must be absent.
   */
  test('AC4: browser Back from area listings returns to Level-2 area list', async ({ page }) => {
    await stubDiscoverApis(page);

    await page.goto(
      `/discover?city=${CITY}&journey=area-first&groupId=${GROUP_ID}`,
    );
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('area-group-level2')).toBeVisible({ timeout: 8_000 });

    // Go to Level 3
    await page.getByTestId(`browse-all-area-${AREA_KEY_MANIPAL}`).click();
    await expect(page).toHaveURL(new RegExp(`areaKey=`), { timeout: 5_000 });
    await expect(page.getByTestId('area-set-schools-tile')).toBeVisible({ timeout: 8_000 });

    // Browser Back
    await page.goBack();

    // URL must retain groupId but not areaKey
    await expect(page).toHaveURL(new RegExp(`groupId=${GROUP_ID}`), { timeout: 5_000 });
    await expect.poll(() => new URL(page.url()).searchParams.get('areaKey'), { timeout: 5_000 }).toBeNull();

    // Level-2 container must re-appear
    await expect(page.getByTestId('area-group-level2')).toBeVisible({ timeout: 8_000 });

    await page.screenshot({ path: SS('ac4-back-to-level2'), fullPage: false });
  });

  /**
   * AC5a — "up to all groups" button clears groupId → Level-1 group cards visible.
   */
  test('AC5a: "up to all groups" affordance clears groupId, shows Level-1 group cards', async ({ page }) => {
    await stubDiscoverApis(page);

    await page.goto(
      `/discover?city=${CITY}&journey=area-first&groupId=${GROUP_ID}`,
    );
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('area-group-level2')).toBeVisible({ timeout: 8_000 });

    // Click the back-to-all-groups affordance
    await page.getByTestId('area-group-back-to-all').click();

    // URL must no longer carry groupId
    await expect.poll(() => new URL(page.url()).searchParams.get('groupId'), { timeout: 5_000 }).toBeNull();

    // Level-1 group cards must be visible
    await expect(page.getByTestId('area-groups-list')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId(`area-group-card-${GROUP_ID}`)).toBeVisible();

    // Level-2 container must be gone
    await expect(page.getByTestId('area-group-level2')).not.toBeAttached();

    await page.screenshot({ path: SS('ac5a-back-to-level1-groups'), fullPage: false });
  });

  /**
   * AC5b — Start Over clears journey, groupId, and areaKey entirely.
   */
  test('AC5b: Start Over clears all journey state', async ({ page }) => {
    await stubDiscoverApis(page);

    await page.goto(
      `/discover?city=${CITY}&journey=area-first&groupId=${GROUP_ID}`,
    );
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('area-group-level2')).toBeVisible({ timeout: 8_000 });

    await page.getByTestId('start-over-button').click();

    // journey and groupId must be cleared
    await expect.poll(
      () => {
        const u = new URL(page.url());
        return {
          journey: u.searchParams.get('journey'),
          groupId: u.searchParams.get('groupId'),
          areaKey: u.searchParams.get('areaKey'),
        };
      },
      { timeout: 5_000 },
    ).toEqual({ journey: null, groupId: null, areaKey: null });

    // Right panel must show the guided-entry / journey-selection state
    await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('area-group-level2')).not.toBeAttached();

    await page.screenshot({ path: SS('ac5b-start-over'), fullPage: false });
  });

  /**
   * AC6 — unknown/invalid groupId → Level-1 group cards + "not available" notice.
   * Blank/whitespace groupId → group cards with NO notice.
   */
  test('AC6: invalid groupId shows group cards + not-available notice; whitespace groupId shows no notice', async ({ page }) => {
    await stubDiscoverApis(page);

    // Invalid (non-empty, non-matching) groupId
    await page.goto(
      `/discover?city=${CITY}&journey=area-first&groupId=nonexistent-group`,
    );
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 10_000 });

    await expect(page.getByTestId('area-groups-list')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId('area-group-invalid-message')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('area-group-level2')).not.toBeAttached();

    await page.screenshot({ path: SS('ac6a-invalid-group-notice'), fullPage: false });

    // Blank/whitespace groupId — %20 is a single space, trimmed → no match → no notice
    await page.goto(
      `/discover?city=${CITY}&journey=area-first&groupId=%20`,
    );
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('area-groups-list')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId('area-group-invalid-message')).not.toBeAttached();

    await page.screenshot({ path: SS('ac6b-whitespace-group-no-notice'), fullPage: false });
  });

  /**
   * AC7 — regression: school-first journey is unaffected by #1483 changes.
   * Reference spec: e2e/discover-school-first-journey.spec.ts
   * This minimal assertion confirms the panel routing still works for school-first.
   */
  test('AC7 regression: school-first journey still renders journey-card-school-first', async ({ page }) => {
    await stubDiscoverApis(page);

    // Issue #2088 item 3 — a bare `/discover?city=...` now defaults `journey`
    // to `area-first` (state/url/area.ts), which would skip straight past the
    // journey-SELECTION guided-entry state this assertion needs (the
    // `journey-card-school-first` picker only renders when NO journey has
    // been chosen yet). An explicit `scope=` param is the one thing that
    // suppresses that default (area.ts's `hasExplicitScope` check), keeping
    // this test on the genuinely-still-reachable "no journey chosen" landing.
    await page.goto(`/discover?city=${CITY}&scope=`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/[?&]scope=(&|$)/);
    await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 10_000 });

    // The guided-entry journey-card for school-first must be selectable
    await expect(page.getByTestId('journey-card-school-first')).toBeVisible({ timeout: 8_000 });

    // area-group-level2 must not appear in an unrelated journey
    await expect(page.getByTestId('area-group-level2')).not.toBeAttached();

    // Agri regression: area-group-level2 must not appear on agri-first without groupId
    await page.goto(`/discover?city=${CITY}&journey=agri-first`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('area-group-level2')).not.toBeAttached();

    await page.screenshot({ path: SS('ac7-regression-school-agri'), fullPage: false });
  });

});
