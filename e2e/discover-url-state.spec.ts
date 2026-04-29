/**
 * E-2: Discover URL state — bookmarkable views and browser back/forward
 *
 * Covers issue #910 ACs that require browser-level validation:
 *
 *   AC12 — Navigating to a bookmarked URL with ?areaKey= loads the correct area
 *           listings in the right panel without requiring any user interaction.
 *
 *   AC13 — After a user selects an area (history push), pressing browser Back
 *           removes ?areaKey= from the URL and returns the right panel to the
 *           "Select an area to explore" instructional state.
 *
 *   AC14 — Navigating to a bookmarked URL with ?areaKey=, then clicking the
 *           panel Back button: (a) removes ?areaKey= from the URL, (b) shows
 *           the instructional state, (c) keeps the user on /discover (does NOT
 *           navigate away — deselection is a replace, not navigate(-1)).
 *
 * Anonymous flow — no auth required.
 * Run: bash scripts/run-e2e-local.sh e2e/discover-url-state.spec.ts
 */

import { test, expect } from '@playwright/test';

// ── Fixture data ──────────────────────────────────────────────────────────────

const MOCK_AREA_KEY = 'IN|KA|Udupi|Manipal';
const MOCK_LISTING_ID = 'url-state-listing-abc123';

// Matches DiscoverAreasResponse shape (src/hooks/useDiscoverAreas.ts)
const MOCK_AREAS_RESPONSE = {
  city: 'udupi',
  areas: [
    {
      areaKey: MOCK_AREA_KEY,
      name: 'Manipal',
      geoCenterLat: 13.3525,
      geoCenterLon: 74.7925,
      listingCount90d: 5,
      trendDirection: 'stable',
    },
  ],
};

// Matches DiscoverCityListingsResponse shape (src/hooks/useDiscoverCityListings.ts)
const MOCK_CITY_LISTINGS_RESPONSE = {
  city: 'udupi',
  limitPerArea: 5,
  areas: [
    {
      areaKey: MOCK_AREA_KEY,
      areaName: 'Manipal',
      listings: [
        {
          id: MOCK_LISTING_ID,
          pricePaise: 250000000, // ₹25 lakh
          propertyType: 'apartment',
          locality: 'Manipal',
          primaryImageUrl: null,
          listingPurpose: 'sale',
        },
      ],
    },
  ],
};

// Encoded areaKey as it appears in a real bookmarked URL
const ENCODED_AREA_KEY = encodeURIComponent(MOCK_AREA_KEY); // IN%7CKA%7CUdupi%7CManipal

// ── Helper: register API mocks before page navigation ─────────────────────────

async function mockDiscoverApis(page: import('@playwright/test').Page) {
  await page.route('**/api/discover/areas**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_AREAS_RESPONSE),
    }),
  );

  await page.route('**/api/discover/cities/**/listings**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_CITY_LISTINGS_RESPONSE),
    }),
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Discover — URL-backed state (#910)', () => {
  /**
   * AC12: Bookmarked URL with ?areaKey= loads correct area listings on fresh page load.
   *
   * The pendingAreaKeyRef mechanism defers areaKey → selectedArea resolution
   * until discoverAreasData loads. This test verifies the full round-trip:
   * URL param → pendingAreaKeyRef → setSelectedArea → right panel shows listings.
   */
  test('AC12 — bookmarked URL with areaKey shows area listings on fresh load', async ({ page }) => {
    await mockDiscoverApis(page);

    // Navigate directly to a bookmarked URL — simulates user opening a shared link
    await page.goto(`/discover?city=udupi&areaKey=${ENCODED_AREA_KEY}`);
    await page.waitForLoadState('domcontentloaded');

    // Right panel must be visible
    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel).toBeVisible({ timeout: 10_000 });

    // The panel must NOT be in instructional state — listing cards must appear.
    // This is the primary business assertion: the areaKey was resolved and
    // listings were fetched without any user interaction.
    await expect(page.getByTestId('listing-card').first()).toBeVisible({ timeout: 12_000 });

    // Instructional state must be absent — the area is already selected
    await expect(rightPanel.getByText('Select an area to explore')).toHaveCount(0);

    // Back button is present (confirms the panel is in area-selected mode)
    await expect(page.getByTestId('back-button')).toBeVisible();

    // URL retains the areaKey (no spurious redirect stripped it)
    await expect(page).toHaveURL(new RegExp(`areaKey=${ENCODED_AREA_KEY.replace(/\|/g, '%7C')}`));
  });

  /**
   * AC13: Browser Back after area selection returns to "no area" state.
   *
   * Area selection via quick-select-chip calls handleAreaClick (same code path
   * as map marker click) which calls urlActions.selectArea → history PUSH.
   * Pressing page.goBack() replays the previous entry, which has no areaKey.
   */
  test('AC13 — browser Back after area selection removes areaKey and shows instructional state', async ({
    page,
  }) => {
    await mockDiscoverApis(page);

    // Start at /discover with no area selected
    await page.goto('/discover?city=udupi');
    await page.waitForLoadState('domcontentloaded');

    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel).toBeVisible({ timeout: 10_000 });

    // Wait for the quick-select chip (powered by mocked useDiscoverAreas data)
    // Chips are the readiness signal for area data — same approach as discover-area-cards tests
    const chip = page.getByTestId('quick-select-chip').first();
    await expect(chip).toBeVisible({ timeout: 12_000 });

    // Verify we start in instructional state
    await expect(rightPanel.getByText('Select an area to explore')).toBeVisible();

    // Click the chip — same code path as clicking a Leaflet area marker;
    // calls handleAreaSelect → urlActions.selectArea → history PUSH
    await chip.click();

    // ?areaKey= must now be in the URL (history entry pushed)
    await expect(page).toHaveURL(/areaKey=/, { timeout: 8_000 });

    // Back button confirms area-selected mode
    await expect(page.getByTestId('back-button')).toBeVisible({ timeout: 8_000 });

    // Press browser Back — pops the history stack to the pre-selection entry
    await page.goBack();

    // URL must no longer contain areaKey
    await expect(page).toHaveURL(/^(?!.*areaKey).*$/, { timeout: 8_000 });

    // Right panel must return to instructional state — this is the key business assertion:
    // pressing Back correctly undoes the area selection rather than leaving a stale UI
    await expect(rightPanel.getByText('Select an area to explore')).toBeVisible({ timeout: 8_000 });

    // No listing cards should be visible in instructional state
    await expect(page.getByTestId('listing-card')).toHaveCount(0);

    // Still on /discover — back only popped one entry
    await expect(page).toHaveURL(/\/discover/);
  });

  /**
   * AC14: Panel Back button from bookmarked URL stays on /discover and resets state.
   *
   * Area deselection calls urlActions.deselectArea() which does a history REPLACE
   * (not navigate(-1)). This means clicking Back on the panel does NOT pop the
   * history stack — the user stays on /discover regardless of where they came from.
   */
  test('AC14 — panel Back button from bookmarked URL removes areaKey, clears viewport params, resets panel, stays on Discover', async ({
    page,
  }) => {
    await mockDiscoverApis(page);

    // Simulate arriving from a bookmarked URL that also carries zoomed-in viewport coords
    // (the real regression: deselectArea must clear lat/lon/zoom too)
    const lat = '13.34090';
    const lon = '74.74210';
    const zoom = '14';
    await page.goto(
      `/discover?city=udupi&areaKey=${ENCODED_AREA_KEY}&lat=${lat}&lon=${lon}&zoom=${zoom}`,
    );
    await page.waitForLoadState('domcontentloaded');

    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel).toBeVisible({ timeout: 10_000 });

    // Wait for the area to be resolved and listing cards to appear
    await expect(page.getByTestId('listing-card').first()).toBeVisible({ timeout: 12_000 });

    // Confirm we are in area-selected state
    const backButton = page.getByTestId('back-button');
    await expect(backButton).toBeVisible();

    // Click the panel Back button — calls handleAreaBack → urlActions.deselectArea() → REPLACE
    await backButton.click();

    // (a) URL must no longer contain areaKey
    await expect(page).toHaveURL(/^(?!.*areaKey).*$/, { timeout: 8_000 });

    // (a-ii) URL must also no longer contain lat, lon, or zoom — deselectArea clears
    // the zoomed-in viewport atomically to prevent stale coords being bookmarked/shared.
    // This also guards against the regression where a pending viewport debounce re-writes
    // the params back 300 ms after Back is clicked.
    const urlAfterBack = new URL(page.url());
    expect(urlAfterBack.searchParams.has('lat'), 'lat must be absent after Back').toBe(false);
    expect(urlAfterBack.searchParams.has('lon'), 'lon must be absent after Back').toBe(false);
    expect(urlAfterBack.searchParams.has('zoom'), 'zoom must be absent after Back').toBe(false);

    // (b) Right panel must show instructional state — this is the key business assertion:
    // the panel resets to the empty state after panel Back, not just URL removal
    await expect(rightPanel.getByText('Select an area to explore')).toBeVisible({ timeout: 8_000 });

    // No listing cards should remain after deselection
    await expect(page.getByTestId('listing-card')).toHaveCount(0);

    // (c) User is still on /discover — deselectArea uses replace, not navigate(-1),
    // so the page has not navigated away even though there was no prior /discover entry
    await expect(page).toHaveURL(/\/discover/);
  });
});
