/**
 * broker-area-insights.spec.ts
 *
 * E2E coverage for /broker/areas/:citySlug/:areaKey — introduced by issue #1530.
 *
 * All four tests intercept the insights API via page.route() — no real backend contacted.
 * No Supabase mutations occur.
 *
 * Four focused checks:
 *   BAI-1 — Happy path: populated fixture, header/breadcrumb, metric values, enabled CTAs.
 *   BAI-2 — Limited-data path: available=false + null shared Metrics + broker true-0.
 *   BAI-3 — Disabled CTA placeholders (demand-gaps #1535, compare-areas #1523).
 *   BAI-4 — Auth guard: unauthenticated user is redirected away.
 *
 * Auth: BAI-1/2/3 use e2e/fixtures/broker-auth.json (storageState).
 *       BAI-4 uses no auth (anonymous).
 *
 * Run (worktree only, port 5324):
 *   PLAYWRIGHT_BASE_URL=http://localhost:5324 \
 *   npx playwright test e2e/broker-area-insights.spec.ts --project=full --reporter=list
 */

import { test, expect, type Page } from '@playwright/test';
import type { BrokerAreaInsightsResponse } from '../src/types/brokerAreaInsights';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CITY_SLUG = 'udupi';
// The raw areaKey — React Router will URL-encode the '|' characters in the <Link>
// but the fixture itself uses the readable form. In navigation we encode manually.
const AREA_KEY_RAW = 'IN|KA|Udupi|Manipal';
const AREA_KEY_ENCODED = encodeURIComponent(AREA_KEY_RAW);

// Route the browser navigates to
const PAGE_URL = `/broker/areas/${CITY_SLUG}/${AREA_KEY_ENCODED}`;

// Playwright route glob — catches both encoded and unencoded variants
const API_GLOB = '**/api/broker/areas/*/*/insights';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Happy-path fixture: available=true, all shared Metrics non-null, broker counts > 0.
 */
const HAPPY_FIXTURE: BrokerAreaInsightsResponse = {
  citySlug: CITY_SLUG,
  areaKey: AREA_KEY_RAW,
  areaLabel: 'Manipal',
  available: true,
  confidenceLabel: 'Enough data',
  area: {
    medianPricePaise: { value: 6_500_000_00, confidenceLabel: 'Enough data' },
    dominantPropertyType: { value: 'Apartment', confidenceLabel: 'Enough data' },
    activeListingCount: { value: 34, confidenceLabel: 'Enough data' },
    freshListingCount: { value: 8, confidenceLabel: 'Enough data' },
    avgListingQuality: { value: 3.7, confidenceLabel: 'Enough data' },
    topBuyerNeedSignalCount: { value: 12, confidenceLabel: 'Enough data' },
  },
  broker: {
    liveListingsInArea: 3,
    listingsNeedingAttention: 1,
    enquiriesOnBrokerListings: 7,
    opportunitiesToAct: 2,
  },
};

/**
 * Limited-data fixture: available=false, areaLabel=null (backend returns null),
 * all shared Metrics suppressed (value=null), broker liveListingsInArea=0.
 */
const LIMITED_FIXTURE: BrokerAreaInsightsResponse = {
  citySlug: CITY_SLUG,
  areaKey: AREA_KEY_RAW,
  areaLabel: null,
  available: false,
  confidenceLabel: 'Not enough data yet',
  area: {
    medianPricePaise: { value: null, confidenceLabel: 'Not enough data yet' },
    dominantPropertyType: { value: null, confidenceLabel: 'Not enough data yet' },
    activeListingCount: { value: null, confidenceLabel: 'Not enough data yet' },
    freshListingCount: { value: null, confidenceLabel: 'Not enough data yet' },
    avgListingQuality: { value: null, confidenceLabel: 'Not enough data yet' },
    topBuyerNeedSignalCount: { value: null, confidenceLabel: 'Not enough data yet' },
  },
  broker: {
    liveListingsInArea: 0,      // broker true-0 — distinct from null
    listingsNeedingAttention: 0,
    enquiriesOnBrokerListings: 0,
    opportunitiesToAct: 0,
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Intercept the insights API and return the given fixture. */
async function interceptInsights(page: Page, fixture: BrokerAreaInsightsResponse) {
  await page.route(API_GLOB, (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fixture),
    });
  });
}

// ---------------------------------------------------------------------------
// BAI-1 — Happy path
// ---------------------------------------------------------------------------

test.describe('BAI-1 — Happy path (available=true, populated metrics)', () => {
  test.use({ storageState: 'e2e/fixtures/broker-auth.json' });

  test('breadcrumb and page heading show areaLabel', async ({ page }) => {
    await interceptInsights(page, HAPPY_FIXTURE);
    await page.goto(PAGE_URL);
    await page.waitForLoadState('domcontentloaded');

    // h1 heading — title derived from areaLabel
    await expect(page.getByRole('heading', { name: 'Manipal', level: 1 })).toBeVisible({ timeout: 8_000 });

    // Breadcrumb last segment shows the area title (not the areaKey raw string)
    await expect(page.getByText('Manipal').first()).toBeVisible();

    // Confidence badge rendered
    await expect(page.getByText('Enough data').first()).toBeVisible();
  });

  test('shared area metric cards render non-null values', async ({ page }) => {
    await interceptInsights(page, HAPPY_FIXTURE);
    await page.goto(PAGE_URL);
    await page.waitForLoadState('domcontentloaded');

    // dominantPropertyType metric — rendered as plain string
    await expect(page.getByText('Apartment')).toBeVisible({ timeout: 8_000 });

    // activeListingCount — rendered as "34"
    await expect(page.getByText('34')).toBeVisible();

    // freshListingCount — rendered as "8"
    await expect(page.getByText('8')).toBeVisible();

    // No suppressed-metric labels should appear when all values are non-null
    await expect(page.locator('[data-testid="suppressed-metric-label"]')).toHaveCount(0);
  });

  test('broker count cards render non-zero counts', async ({ page }) => {
    await interceptInsights(page, HAPPY_FIXTURE);
    await page.goto(PAGE_URL);
    await page.waitForLoadState('domcontentloaded');

    // liveListingsInArea=3 — use exact to avoid matching "3.7" avgListingQuality
    await expect(page.getByText('3', { exact: true }).first()).toBeVisible({ timeout: 8_000 });

    // enquiriesOnBrokerListings=7 — use exact to avoid matching "Fresh listings (7d)" and "3.7"
    await expect(page.getByText('7', { exact: true })).toBeVisible();

    // broker-true-zero element must NOT appear in the happy path
    await expect(page.locator('[data-testid="broker-true-zero"]')).toHaveCount(0);
  });

  test('enabled CTAs have correct hrefs', async ({ page }) => {
    await interceptInsights(page, HAPPY_FIXTURE);
    await page.goto(PAGE_URL);
    await page.waitForLoadState('domcontentloaded');

    // "View public area page" → /trends?city=udupi&areaKey=IN|KA|Udupi|Manipal
    const viewPublic = page.locator('[data-testid="cta-view-public-area"]');
    await expect(viewPublic).toBeVisible({ timeout: 8_000 });
    const viewPublicHref = await viewPublic.getAttribute('href');
    expect(viewPublicHref).toContain('/trends');
    expect(viewPublicHref).toContain('city=udupi');
    expect(viewPublicHref).toContain('areaKey=');

    // "Add listing in this area" → /broker/listings/new
    const addListing = page.locator('[data-testid="cta-add-listing"]');
    await expect(addListing).toBeVisible();
    expect(await addListing.getAttribute('href')).toBe('/broker/listings/new');

    // "Open listing quality" → /broker/listing-quality
    const listingQuality = page.locator('[data-testid="cta-listing-quality"]');
    await expect(listingQuality).toBeVisible();
    expect(await listingQuality.getAttribute('href')).toBe('/broker/listing-quality');
  });
});

// ---------------------------------------------------------------------------
// BAI-2 — Limited-data path
// ---------------------------------------------------------------------------

test.describe('BAI-2 — Limited-data path (available=false, null Metrics, broker true-0)', () => {
  test.use({ storageState: 'e2e/fixtures/broker-auth.json' });

  test('honest limited-data state renders when available=false', async ({ page }) => {
    await interceptInsights(page, LIMITED_FIXTURE);
    await page.goto(PAGE_URL);
    await page.waitForLoadState('domcontentloaded');

    // LimitedDataState alert must be present
    await expect(page.locator('[data-testid="limited-data-state"]')).toBeVisible({ timeout: 8_000 });
  });

  test('header falls back to areaKey when areaLabel is null', async ({ page }) => {
    await interceptInsights(page, LIMITED_FIXTURE);
    await page.goto(PAGE_URL);
    await page.waitForLoadState('domcontentloaded');

    // areaLabel is null → title = areaKey (the raw string from the URL param)
    // The page decodes AREA_KEY_ENCODED back to AREA_KEY_RAW for display.
    await expect(
      page.getByRole('heading', { name: AREA_KEY_RAW, level: 1 }),
    ).toBeVisible({ timeout: 8_000 });

    // Must NOT show blank heading
    const h1Text = await page.getByRole('heading', { level: 1 }).textContent();
    expect((h1Text ?? '').trim().length).toBeGreaterThan(0);
  });

  test('null shared Metrics render confidence label, never "0"', async ({ page }) => {
    await interceptInsights(page, LIMITED_FIXTURE);
    await page.goto(PAGE_URL);
    await page.waitForLoadState('domcontentloaded');

    // All six shared Metric cards must show their suppressed label, not "0"
    const suppressed = page.locator('[data-testid="suppressed-metric-label"]');
    // At least the six area metric cards should show suppressed labels
    await expect(suppressed.first()).toBeVisible({ timeout: 8_000 });
    const count = await suppressed.count();
    expect(count).toBeGreaterThanOrEqual(6);

    // The literal text "0" must not appear inside any suppressed-metric-label element
    for (let i = 0; i < count; i++) {
      const text = await suppressed.nth(i).textContent();
      expect(text).not.toBe('0');
      expect(text).not.toMatch(/^0$/);
    }
  });

  test('broker true-0 (liveListingsInArea=0) shows "0" with broker framing, not suppressed', async ({ page }) => {
    await interceptInsights(page, LIMITED_FIXTURE);
    await page.goto(PAGE_URL);
    await page.waitForLoadState('domcontentloaded');

    // broker-true-zero elements must be present (all four broker counts are 0)
    const trueZeroEls = page.locator('[data-testid="broker-true-zero"]');
    await expect(trueZeroEls.first()).toBeVisible({ timeout: 8_000 });

    // The first broker-true-zero element must show the numeral "0" visibly
    const firstTrueZero = trueZeroEls.first();
    await expect(firstTrueZero.getByText('0')).toBeVisible();

    // broker-true-zero must NOT be the same element as suppressed-metric-label
    // (they are different components: BrokerCountCard vs SharedMetricCard)
    const suppressedInTrueZero = firstTrueZero.locator('[data-testid="suppressed-metric-label"]');
    await expect(suppressedInTrueZero).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// BAI-3 — Disabled CTA placeholders
// ---------------------------------------------------------------------------

test.describe('BAI-3 — Disabled CTA placeholders (coming soon)', () => {
  test.use({ storageState: 'e2e/fixtures/broker-auth.json' });

  test('demand-gaps and compare-areas controls are disabled with no navigation', async ({ page }) => {
    await interceptInsights(page, HAPPY_FIXTURE);
    await page.goto(PAGE_URL);
    await page.waitForLoadState('domcontentloaded');

    // demand-gaps — disabled button, no href
    const demandGaps = page.locator('[data-testid="cta-demand-gaps-disabled"]');
    await expect(demandGaps).toBeVisible({ timeout: 8_000 });
    await expect(demandGaps).toBeDisabled();
    // Must not be an anchor (no dead link)
    const demandGapsTag = await demandGaps.evaluate((el) => el.tagName.toLowerCase());
    expect(demandGapsTag).toBe('button');
    expect(await demandGaps.getAttribute('href')).toBeNull();

    // compare-areas — disabled button, no href
    const compareAreas = page.locator('[data-testid="cta-compare-areas-disabled"]');
    await expect(compareAreas).toBeVisible();
    await expect(compareAreas).toBeDisabled();
    const compareAreasTag = await compareAreas.evaluate((el) => el.tagName.toLowerCase());
    expect(compareAreasTag).toBe('button');
    expect(await compareAreas.getAttribute('href')).toBeNull();

    // Clicking disabled buttons must not navigate away
    const urlBefore = page.url();
    await demandGaps.click({ force: true });
    await page.waitForTimeout(300);
    expect(page.url()).toBe(urlBefore);

    await compareAreas.click({ force: true });
    await page.waitForTimeout(300);
    expect(page.url()).toBe(urlBefore);
  });

  test('"coming soon" label is visible on disabled buttons', async ({ page }) => {
    await interceptInsights(page, HAPPY_FIXTURE);
    await page.goto(PAGE_URL);
    await page.waitForLoadState('domcontentloaded');

    await expect(
      page.locator('[data-testid="cta-demand-gaps-disabled"]').getByText(/coming soon/i),
    ).toBeVisible({ timeout: 8_000 });
    await expect(
      page.locator('[data-testid="cta-compare-areas-disabled"]').getByText(/coming soon/i),
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// BAI-4 — Auth guard
// ---------------------------------------------------------------------------

test.describe('BAI-4 — Auth guard (no storageState)', () => {
  // No test.use({ storageState }) — anonymous context

  test('unauthenticated user is redirected away from broker area insights', async ({ page }) => {
    await page.goto(PAGE_URL);
    // ProtectedRoute redirects to /auth after session check
    await expect(page).toHaveURL(/\/auth(\?.*)?$/, { timeout: 10_000 });

    // The broker area insights page content must not have rendered —
    // check for the broker-specific h1 text (areaKey), not all h1s
    // (the /auth page has its own h1 "Sign in to your account")
    await expect(page.getByRole('heading', { name: /broker|area intelligence|insights/i, level: 1 })).toHaveCount(0);
  });
});
