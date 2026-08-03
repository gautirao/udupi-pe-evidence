/**
 * Issue #1956 PR-4 — AREA leaf listings error state (AC4.9-adjacent, new for
 * this PR: `areas-journey-panel-listings-error`).
 *
 * `DiscoverAreasJourneyPanel`'s `AreaLeafListingsSurface` distinguishes a
 * genuine backend failure on `/api/discover/cities/{city}/listings` from a
 * real zero-result area: before this PR's FIX PASS 4, `isError` was never
 * threaded from the query, so a 404/500/timeout silently settled to
 * `data:undefined -> listings:[] -> the listing-EMPTY branch`, presenting a
 * backend failure as the factual claim "0 verified properties in {area}".
 *
 * A route mock IS appropriate here — unlike AC4.11, this test is simulating
 * a backend failure, not faking Buy/Rent product semantics. No other spec in
 * this PR's evidence set uses a route mock for the listings endpoint.
 */
import { test, expect, type Page } from '@playwright/test';

const CITY = 'bangalore';
const BASE = `city=${CITY}&journey=area-first`;
const AREA_BASAVESHWARA = 'a:IN|KA|Bengaluru|Basaveshwara Nagar';

async function mockListingsFailure(page: Page, status: number) {
  await page.route('**/api/discover/cities/**/listings**', (route) => {
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'simulated_failure' }),
    });
  });
}

test.describe('@integration-ui #1956 PR-4 — AREA leaf listings error state', () => {
  test('a 500 on the listings endpoint renders the error state with a working Retry, never the empty/"0 verified" claim', async ({
    page,
  }) => {
    await mockListingsFailure(page, 500);
    await page.goto(`/discover?${BASE}&node=${encodeURIComponent(AREA_BASAVESHWARA)}`);
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByTestId('areas-journey-panel-listings')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('areas-journey-panel-listings-error')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("We couldn't load properties")).toBeVisible();

    // Never the honest-empty claim, never the structural (Direction/Cluster)
    // empty branch, never any listing cards.
    await expect(page.getByTestId('area-empty-state')).toHaveCount(0);
    await expect(page.getByTestId('area-result-summary')).toHaveCount(0);
    await expect(page.getByText(/0 verified/i)).toHaveCount(0);
    await expect(page.getByTestId('listing-card')).toHaveCount(0);

    // Retry is a REAL affordance: unroute to let the next request succeed,
    // click Retry, and the real listing surface (2 seeded sale listings)
    // must replace the error state.
    await page.unroute('**/api/discover/cities/**/listings**');
    await page.getByRole('button', { name: 'Retry' }).click();

    await expect(page.getByTestId('areas-journey-panel-listings-error')).toHaveCount(0, {
      timeout: 15_000,
    });
    await expect(page.getByTestId('listing-card')).toHaveCount(2, { timeout: 15_000 });
  });

  test('a 404 on the listings endpoint also renders the error branch (not treated as a valid empty response)', async ({
    page,
  }) => {
    await mockListingsFailure(page, 404);
    await page.goto(`/discover?${BASE}&node=${encodeURIComponent(AREA_BASAVESHWARA)}`);
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByTestId('areas-journey-panel-listings-error')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('area-empty-state')).toHaveCount(0);
  });
});
