/**
 * Popular Schools Grid — E2E coverage for issue #968.
 *
 * Surface under test: the "Popular schools" grid mounted inside the
 * NearSchoolSheet on /discover. Activated by clicking the "Near a school"
 * button on MapDiscovery.
 *
 * Cross-layer flow exercised here:
 *   1. User opens MapDiscovery for a city → clicks "Near a school"
 *   2. The grid issues GET /api/public/schools/popular?city=...&limit=...
 *   3. Cards render (name + board + address + optional distance, NO listing
 *      count badge per #968 product constraint)
 *   4. Local "Filter by area" dropdown narrows results without touching the
 *      global URL areaKey or selectedArea
 *   5. Clicking a card flips parent state (selectedSchool) — the "Near a
 *      school" trigger button reflects the selection via aria-pressed and
 *      a non-outline visual variant
 *   6. Error state surfaces a Retry button that refetches; empty state shows
 *      "No popular schools found near {city}"
 *   7. Closing + reopening the sheet does not leave a stale selection in the
 *      grid (the next render reflects the current parent selectedSchool only)
 *
 * Backend contract:
 *   GET /api/public/schools/popular?city={slug}&areaKey={optional}&limit={optional}
 *   → 200 with SchoolResult[] (id, name, address, board, boardType, latitude,
 *     longitude, distanceKm)
 *
 * The trends-options endpoint (drives the area dropdown options) is also
 * stubbed so the dropdown surfaces predictable area choices.
 *
 * No auth required — discover schools popular endpoint is public (skipAuth).
 *
 * Run locally:
 *   bash scripts/run-e2e-local.sh --project=full e2e/popular-schools.spec.ts
 */

import { test, expect, type Page, type Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const POPULAR_SCHOOLS_FIXTURE = [
  {
    id: 'sch-1',
    name: 'Manipal Public School',
    board: 'CBSE',
    boardType: null,
    address: 'Manipal, Udupi',
    latitude: 13.3525,
    longitude: 74.7864,
    distanceKm: 1.2,
  },
  {
    id: 'sch-2',
    name: 'Sharada Vidyalaya',
    board: 'ICSE',
    boardType: null,
    address: 'Kadiyali, Udupi',
    latitude: 13.3409,
    longitude: 74.7421,
    distanceKm: 2.4,
  },
  {
    id: 'sch-3',
    name: "St. Cecily's High School",
    board: 'STATE',
    boardType: null,
    address: 'Udupi Town',
    latitude: 13.3389,
    longitude: 74.7479,
    distanceKm: 3.1,
  },
  {
    id: 'sch-4',
    name: 'Christian Vidyaniketan',
    board: 'CBSE',
    boardType: null,
    address: 'Brahmagiri, Udupi',
    latitude: 13.3500,
    longitude: 74.7500,
    distanceKm: 0.8,
  },
];

// Subset returned when the local "Filter by area" dropdown narrows to Manipal.
const POPULAR_SCHOOLS_MANIPAL_FIXTURE = [
  {
    id: 'sch-1',
    name: 'Manipal Public School',
    board: 'CBSE',
    boardType: null,
    address: 'Manipal, Udupi',
    latitude: 13.3525,
    longitude: 74.7864,
    distanceKm: 0.4,
  },
];

const TRENDS_OPTIONS_FIXTURE = {
  city: 'udupi',
  defaultAreas: [
    { areaKey: 'IN|KA|Udupi|Manipal', areaLabel: 'Manipal' },
    { areaKey: 'IN|KA|Udupi|Kadiyali', areaLabel: 'Kadiyali' },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** JSON-fulfill helper preserving content-type. */
function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

/**
 * Stub trends-options so the area dropdown surfaces deterministic options.
 * This endpoint may or may not be invoked by other components on the page —
 * stubbing it unconditionally keeps the test hermetic.
 */
async function stubTrendsOptions(page: Page): Promise<void> {
  await page.route('**/api/trends/options**', (route) =>
    fulfillJson(route, 200, TRENDS_OPTIONS_FIXTURE),
  );
}

/**
 * Stub the popular-schools endpoint. Returns Manipal-only fixture when the
 * request URL contains an areaKey query, the full fixture otherwise. Lets
 * tests assert that area-narrowed requests actually reach the backend.
 */
async function stubPopularSchools(
  page: Page,
  opts: { all?: unknown[]; manipal?: unknown[] } = {},
): Promise<void> {
  const all = opts.all ?? POPULAR_SCHOOLS_FIXTURE;
  const manipal = opts.manipal ?? POPULAR_SCHOOLS_MANIPAL_FIXTURE;
  await page.route('**/api/public/schools/popular**', (route) => {
    const url = route.request().url();
    const hasAreaKey = /[?&]areaKey=/.test(url);
    return fulfillJson(route, 200, hasAreaKey ? manipal : all);
  });
}

/** Open the NearSchoolSheet by clicking the "Near a school" button. */
async function openNearSchoolSheet(page: Page): Promise<void> {
  await page.goto('/discover?city=udupi');
  await page.waitForLoadState('domcontentloaded');
  const trigger = page.getByRole('button', { name: /near a school/i });
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  await trigger.click();
  await expect(
    page.getByRole('heading', { name: /popular schools/i }),
  ).toBeVisible({ timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Popular schools grid (#968)', () => {
  test('renders 3+ school cards with name + board + address and no listing count badge', async ({
    page,
  }) => {
    await stubTrendsOptions(page);
    await stubPopularSchools(page);

    const popularResponse = page.waitForResponse(
      (r) =>
        r.url().includes('/api/public/schools/popular') && r.status() === 200,
      { timeout: 10_000 },
    );

    await openNearSchoolSheet(page);
    await popularResponse;

    // Locate the grid section by its labelled heading id.
    const grid = page.locator('section[aria-labelledby="popular-schools-heading"]');
    await expect(grid).toBeVisible();

    // 3+ cards rendered — fixture has 4. PopularSchoolCard buttons expose
    // an aria-label of "Select {name}".
    const cards = grid.getByRole('button', { name: /^Select / });
    await expect(cards).toHaveCount(POPULAR_SCHOOLS_FIXTURE.length);

    // First card displays its name, board, address, and distance.
    const firstCard = cards.first();
    await expect(firstCard).toContainText('Manipal Public School');
    await expect(firstCard).toContainText('CBSE');
    await expect(firstCard).toContainText('Manipal, Udupi');
    await expect(firstCard).toContainText(/1\.2\s*km away/);

    // Listing-count badges are intentionally absent (#968 constraint).
    // Search inside the grid only — Discover area cards on the map can show
    // counts and are unrelated.
    await expect(grid.getByText(/\d+\s+listings?/i)).toHaveCount(0);
    await expect(grid.locator('[data-testid="nearby-listing-count"]')).toHaveCount(0);
  });

  test('clicking a card highlights it and updates parent selectedSchool without changing global areaKey', async ({
    page,
  }) => {
    await stubTrendsOptions(page);
    await stubPopularSchools(page);

    // Pre-open: assert the trigger button starts in the unselected state.
    // (When the Sheet is open, Radix puts the rest of the page under
    //  aria-hidden — getByRole would not find the trigger then. So we sample
    //  it BEFORE opening and again AFTER closing.)
    await page.goto('/discover?city=udupi');
    await page.waitForLoadState('domcontentloaded');
    const trigger = page.getByRole('button', { name: /near a school/i });
    await expect(trigger).toBeVisible({ timeout: 15_000 });
    await expect(trigger).toHaveAttribute('aria-pressed', 'false');

    const initialAreaKey = new URL(page.url()).searchParams.get('areaKey');

    // Open the sheet.
    await trigger.click();
    await expect(
      page.getByRole('heading', { name: /popular schools/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Wait for cards to render rather than for a network response — once the
    // first PopularSchoolCard is in the DOM we know the grid has hydrated.
    await expect(
      page.getByRole('button', { name: /^Select Manipal Public School$/ }),
    ).toBeVisible({ timeout: 10_000 });

    // Click the second card so we can assert "this specific card was selected".
    const targetCard = page.getByRole('button', {
      name: /^Select Sharada Vidyalaya$/,
    });
    await targetCard.click();

    // Card highlight: aria-pressed flips on the clicked card.
    await expect(targetCard).toHaveAttribute('aria-pressed', 'true');

    // Other cards remain unselected.
    const otherCard = page.getByRole('button', {
      name: /^Select Manipal Public School$/,
    });
    await expect(otherCard).toHaveAttribute('aria-pressed', 'false');

    // Close the sheet so the trigger becomes accessible again, then assert
    // the parent state was mutated. The trigger's aria-pressed reflects
    // `selectedSchool !== null`, the parent-owned source of truth.
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('heading', { name: /popular schools/i }),
    ).toHaveCount(0);
    await expect(trigger).toHaveAttribute('aria-pressed', 'true');

    // Global URL areaKey is unchanged — the local-only dropdown design
    // explicitly forbids hijacking this. The schoolId param may legitimately
    // appear via handleSchoolSelect; we only assert areaKey stability here.
    const afterAreaKey = new URL(page.url()).searchParams.get('areaKey');
    expect(afterAreaKey).toBe(initialAreaKey);
  });

  test('local area dropdown narrows results without writing to the URL', async ({
    page,
  }) => {
    await stubTrendsOptions(page);
    await stubPopularSchools(page);

    await openNearSchoolSheet(page);

    // Sanity: full fixture rendered first.
    const grid = page.locator('section[aria-labelledby="popular-schools-heading"]');
    await expect(grid.getByRole('button', { name: /^Select / })).toHaveCount(
      POPULAR_SCHOOLS_FIXTURE.length,
      { timeout: 10_000 },
    );

    const urlBefore = new URL(page.url()).searchParams.get('areaKey');

    // Select a specific area in the LOCAL dropdown. Radix Select renders the
    // trigger as role="combobox". The dropdown is anchored by Label
    // htmlFor="popular-schools-area".
    const areaTrigger = page.locator('#popular-schools-area');
    await expect(areaTrigger).toBeVisible();

    // Wait for the request that fires when areaKey is added.
    const narrowedResponse = page.waitForResponse(
      (r) =>
        r.url().includes('/api/public/schools/popular') &&
        r.url().includes('areaKey='),
      { timeout: 10_000 },
    );

    await areaTrigger.click();
    await page.getByRole('option', { name: 'Manipal', exact: true }).click();
    await narrowedResponse;

    // Narrowed fixture has exactly one card.
    await expect(grid.getByRole('button', { name: /^Select / })).toHaveCount(
      POPULAR_SCHOOLS_MANIPAL_FIXTURE.length,
    );
    await expect(grid).toContainText('Manipal Public School');

    // URL areaKey is UNCHANGED — the dropdown is local-only.
    const urlAfter = new URL(page.url()).searchParams.get('areaKey');
    expect(urlAfter).toBe(urlBefore);
  });

  test('error state shows Retry button that refetches schools', async ({ page }) => {
    await stubTrendsOptions(page);

    // The production QueryClient is constructed with TanStack defaults
    // (`new QueryClient()`), which retries failed queries 3 times with
    // exponential backoff. We must therefore keep returning 500 until the
    // user clicks Retry — otherwise the auto-retry succeeds and the error
    // UI never appears. Toggling on user click also proves Retry actually
    // refetches (vs the auto-retries that fired without user input).
    let failNext = true;
    await page.route('**/api/public/schools/popular**', (route) => {
      if (failNext) {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'boom' }),
        });
      }
      return fulfillJson(route, 200, POPULAR_SCHOOLS_FIXTURE);
    });

    await openNearSchoolSheet(page);

    // Error UI: "Couldn't load schools. Please try again." + Retry button.
    // Bumped to 20s to cover TanStack's exponential backoff (0+1+4 ≈ 5s)
    // plus per-attempt latency before the error state stabilises.
    await expect(page.getByText(/couldn.?t load schools/i)).toBeVisible({
      timeout: 20_000,
    });

    // Flip the stub so the user-triggered Retry succeeds.
    failNext = false;

    await page.getByRole('button', { name: /retry/i }).click();

    // After successful refetch, cards render and the error block is gone.
    const grid = page.locator('section[aria-labelledby="popular-schools-heading"]');
    await expect(
      grid.getByRole('button', { name: /^Select Manipal Public School$/ }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/couldn.?t load schools/i)).toHaveCount(0);
  });

  test('empty state shows "No popular schools found near {city}"', async ({ page }) => {
    await stubTrendsOptions(page);
    await page.route('**/api/public/schools/popular**', (route) =>
      fulfillJson(route, 200, []),
    );

    const popularResponse = page.waitForResponse(
      (r) =>
        r.url().includes('/api/public/schools/popular') && r.status() === 200,
      { timeout: 10_000 },
    );

    await openNearSchoolSheet(page);
    await popularResponse;

    const grid = page.locator('section[aria-labelledby="popular-schools-heading"]');
    await expect(grid).toContainText(/no popular schools found near udupi/i);

    // No cards.
    await expect(grid.getByRole('button', { name: /^Select / })).toHaveCount(0);
  });

  test('closing then reopening the sheet preserves parent selection (no stale-only-in-grid state)', async ({
    page,
  }) => {
    await stubTrendsOptions(page);
    await stubPopularSchools(page);

    await openNearSchoolSheet(page);

    // Select a school.
    const targetCard = page.getByRole('button', {
      name: /^Select Sharada Vidyalaya$/,
    });
    await expect(targetCard).toBeVisible({ timeout: 10_000 });
    await targetCard.click();
    await expect(targetCard).toHaveAttribute('aria-pressed', 'true');

    // Close the Sheet via Escape (Radix Sheet closes on Escape and click-outside).
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('heading', { name: /popular schools/i }),
    ).toHaveCount(0);

    // The "Near a school" trigger still reflects an active selection — parent
    // state survived the close (this is the contract the grid relies on).
    const trigger = page.getByRole('button', { name: /near a school/i });
    await expect(trigger).toHaveAttribute('aria-pressed', 'true');

    // Reopen — grid should reflect the current parent selectedSchool only.
    // No card other than the previously-selected one should be aria-pressed.
    await trigger.click();
    await expect(
      page.getByRole('heading', { name: /popular schools/i }),
    ).toBeVisible({ timeout: 10_000 });

    const reopenedTarget = page.getByRole('button', {
      name: /^Select Sharada Vidyalaya$/,
    });
    await expect(reopenedTarget).toBeVisible({ timeout: 10_000 });
    await expect(reopenedTarget).toHaveAttribute('aria-pressed', 'true');

    // Exactly one selected card across the grid (proves no stale highlight on
    // any other card from a previous render).
    const grid = page.locator('section[aria-labelledby="popular-schools-heading"]');
    const pressedCards = grid.locator('button[aria-pressed="true"]');
    await expect(pressedCards).toHaveCount(1);
  });
});
