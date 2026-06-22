/**
 * E2E smoke spec — Area Intelligence UI (Issue #1528)
 *
 * ALL network calls are intercepted via Playwright route mocking.
 * No live backend required. No shared Supabase mutation (safe read-only).
 *
 * Test provenance: MOCKED_NETWORK — API responses are stubbed; no real backend.
 * This spec tests the frontend rendering logic for the six area-guide states.
 *
 * Design final mock:
 * https://claude.ai/design/p/f3796631-064b-4956-94ba-14baa7af9bcf?file=ui_kits%2Fbuyer%2Farea-insights.html
 *
 * Run locally (no backend needed):
 *   npx playwright test e2e/area-intelligence-1528.spec.ts
 */

import { test, expect, Route } from '@playwright/test';

// ─── Mock data ────────────────────────────────────────────────────────────────

const AREA_KEY = 'IN|KA|Udupi|Malpe';
const CITY = 'udupi';

const FULL_DATA_MOCK = {
  citySlug: CITY,
  areaKey: AREA_KEY,
  areaLabel: 'Malpe',
  available: true,
  confidenceLabel: 'Enough data',
  metrics: {
    medianPricePaise: { value: 550000000, confidenceLabel: 'Enough data' }, // ₹55L in paise
    dominantPropertyType: { value: 'plot', confidenceLabel: 'Enough data' },
    activeListingCount: { value: 31, confidenceLabel: 'Enough data' },
    freshListingCount: { value: 18, confidenceLabel: 'Enough data' },
    avgListingQuality: { value: 74, confidenceLabel: 'Enough data' },
    mostSearchedBudget: { value: null, confidenceLabel: 'Not enough data yet' },
  },
  priceComparison: { supported: false, wording: null },
  listingsCta: { areaKey: AREA_KEY, label: 'View listings in Malpe' },
};

const NO_SNAPSHOT_MOCK = {
  citySlug: 'bangalore',
  areaKey: 'IN|KA|Bengaluru|Whitefield',
  areaLabel: null,
  available: false,
  confidenceLabel: 'Not enough data yet',
  metrics: {
    medianPricePaise: { value: null, confidenceLabel: 'Not enough data yet' },
    dominantPropertyType: { value: null, confidenceLabel: 'Not enough data yet' },
    activeListingCount: { value: null, confidenceLabel: 'Not enough data yet' },
    freshListingCount: { value: null, confidenceLabel: 'Not enough data yet' },
    avgListingQuality: { value: null, confidenceLabel: 'Not enough data yet' },
    mostSearchedBudget: { value: null, confidenceLabel: 'Not enough data yet' },
  },
  priceComparison: { supported: false, wording: null },
  listingsCta: { areaKey: 'IN|KA|Bengaluru|Whitefield', label: 'View listings in this area' },
};

// ─── Route mock helper ────────────────────────────────────────────────────────

async function mockAreaIntelligenceApi(
  route: Route,
  responseBody: object,
  status = 200,
) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(responseBody),
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('Area Intelligence UI — #1528 (mocked network)', () => {
  // Intercept the area-intelligence API for every test
  test.beforeEach(async ({ page }) => {
    // Intercept auth/Supabase session calls to prevent login redirects
    await page.route('**/auth/v1/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ access_token: null, user: null }),
      });
    });

    // Intercept trends options (defaults)
    await page.route('**/api/trends/options**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ defaultAreas: [] }),
      });
    });
  });

  test('full-data: renders hero, metrics, and "View homes" CTA', async ({ page }) => {
    await page.route('**/api/trends/area-intelligence**', async route => {
      await mockAreaIntelligenceApi(route, FULL_DATA_MOCK);
    });

    await page.goto(
      `/trends?city=${CITY}&areaKey=${encodeURIComponent(AREA_KEY)}&guide=1`,
    );

    // Hero area name (AC2)
    await expect(page.getByRole('heading', { name: /malpe/i, level: 1 })).toBeVisible({
      timeout: 10_000,
    });

    // Confidence chip (AC2)
    await expect(page.getByText('Enough data').first()).toBeVisible();

    // Primary CTA (AC8)
    await expect(page.getByRole('link', { name: /view homes in malpe/i }).first()).toBeVisible();

    // At-a-glance section (AC3)
    await expect(page.getByText('How active is the market here?')).toBeVisible();

    // 'Typical price' label — NOT 'Median price' (AC15)
    await expect(page.getByText('Typical price')).toBeVisible();
    await expect(page.getByText('Median price')).not.toBeVisible();

    // Exact helper copy (AC16)
    await expect(
      page.getByText(
        'Middle of current listings, so unusually expensive homes do not skew it.',
      ),
    ).toBeVisible();

    // mostSearchedBudget always shows 'Not enough data yet' (AC4)
    await expect(page.getByText('Most searched budget')).toBeVisible();

    // Trust note (AC6)
    await expect(page.getByText(/why we show this/i)).toBeVisible();

    // Transparency footer (AC8)
    await expect(page.getByText(/verified listing activity/i)).toBeVisible();
  });

  test('no-snapshot: available=false shows "View homes" CTA — not error screen (AC9)', async ({
    page,
  }) => {
    await page.route('**/api/trends/area-intelligence**', async route => {
      await mockAreaIntelligenceApi(route, NO_SNAPSHOT_MOCK);
    });

    await page.goto(
      `/trends?city=bangalore&areaKey=${encodeURIComponent('IN|KA|Bengaluru|Whitefield')}&guide=1`,
    );

    // Must show clean unavailable state — not error screen (AC9)
    await expect(page.getByText(/not yet available/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('link', { name: /view homes/i })).toBeVisible();

    // Must NOT be the error screen
    await expect(page.getByText(/couldn't load area details/i)).not.toBeVisible();

    // No leaked Udupi markers/pills (AC11)
    await expect(page.getByText(/\bUdupi\b/)).not.toBeVisible();
    await expect(page.getByText(/\bMalpe\b/)).not.toBeVisible();
  });

  test('dynamic city copy: Bangalore fixture shows Bangalore, no hardcoded Udupi/Malpe (AC10)', async ({
    page,
  }) => {
    const bangaloreMock = {
      ...FULL_DATA_MOCK,
      citySlug: 'bangalore',
      areaKey: 'IN|KA|Bengaluru|Whitefield',
      areaLabel: 'Whitefield',
      listingsCta: {
        areaKey: 'IN|KA|Bengaluru|Whitefield',
        label: 'View listings in Whitefield',
      },
    };

    await page.route('**/api/trends/area-intelligence**', async route => {
      await mockAreaIntelligenceApi(route, bangaloreMock);
    });

    await page.goto(
      `/trends?city=bangalore&areaKey=${encodeURIComponent('IN|KA|Bengaluru|Whitefield')}&guide=1`,
    );

    await expect(page.getByRole('heading', { name: /whitefield/i, level: 1 })).toBeVisible({
      timeout: 10_000,
    });

    // No hardcoded Udupi/Malpe in rendered copy (AC10)
    await expect(page.locator('text=Udupi')).not.toBeVisible();
    await expect(page.locator('text=Malpe')).not.toBeVisible();

    // 'View homes in Whitefield' CTA
    await expect(
      page.getByRole('link', { name: /view homes in whitefield/i }).first(),
    ).toBeVisible();
  });

  test('api-error: renders calm error message with no fake values (AC9)', async ({ page }) => {
    await page.route('**/api/trends/area-intelligence**', async route => {
      await route.fulfill({ status: 500, body: 'Internal Server Error' });
    });

    await page.goto(
      `/trends?city=${CITY}&areaKey=${encodeURIComponent(AREA_KEY)}&guide=1`,
    );

    await expect(page.getByText(/couldn't load area details/i)).toBeVisible({ timeout: 10_000 });
    // No fake values
    await expect(page.getByText('31')).not.toBeVisible();
    await expect(page.locator('text=₹55')).not.toBeVisible();
  });

  test('loading: renders skeleton (AC9)', async ({ page }) => {
    // Delay the API response to observe loading state
    await page.route('**/api/trends/area-intelligence**', async route => {
      await new Promise(resolve => setTimeout(resolve, 3000));
      await mockAreaIntelligenceApi(route, FULL_DATA_MOCK);
    });

    await page.goto(
      `/trends?city=${CITY}&areaKey=${encodeURIComponent(AREA_KEY)}&guide=1`,
    );

    // Loading skeleton should be visible before response
    await expect(page.locator('[aria-busy="true"]')).toBeVisible({ timeout: 5_000 });
  });
});
