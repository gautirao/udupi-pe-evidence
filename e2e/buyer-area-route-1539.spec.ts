/**
 * E2E spec — Buyer Area Route /trends/:citySlug/areas/:areaSlug (Issue #1539)
 *
 * ALL network calls are intercepted via Playwright route mocking.
 * No live backend required. No shared Supabase mutation (safe read-only).
 *
 * Test provenance: MOCKED_NETWORK — API responses are stubbed via route.fulfill;
 * no real backend or Supabase connection is used.
 *
 * Covers:
 *   Test 1 — matched=true:  hero heading, breadcrumb, at-a-glance, CTA link with areaKey href
 *   Test 2 — matched=false: slug-not-found copy, safe /discover link, no fabricated metrics
 *
 * Run (no backend needed):
 *   npx playwright test e2e/buyer-area-route-1539.spec.ts --project=full
 */

import { test, expect } from '@playwright/test';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CITY_SLUG = 'udupi';
const AREA_SLUG = 'malpe';
const AREA_KEY = 'IN|KA|Udupi|Malpe';
const AREA_LABEL = 'Malpe';

/** Matched resolve-area response */
const MATCHED_RESOLVE = {
  citySlug: CITY_SLUG,
  areaSlug: AREA_SLUG,
  areaKey: AREA_KEY,
  areaLabel: AREA_LABEL,
  matched: true,
};

/** Not-found resolve-area response */
const NOT_MATCHED_RESOLVE = {
  citySlug: CITY_SLUG,
  areaSlug: 'no-such-place',
  areaKey: null,
  areaLabel: null,
  matched: false,
};

/** Full area-intelligence payload — mirrors FULL_DATA_MOCK shape from area-intelligence-1528.spec.ts */
const FULL_DATA_MOCK = {
  citySlug: CITY_SLUG,
  areaKey: AREA_KEY,
  areaLabel: AREA_LABEL,
  available: true,
  confidenceLabel: 'Enough data',
  metrics: {
    medianPricePaise: { value: 550000000, confidenceLabel: 'Enough data' },
    dominantPropertyType: { value: 'plot', confidenceLabel: 'Enough data' },
    activeListingCount: { value: 31, confidenceLabel: 'Enough data' },
    freshListingCount: { value: 18, confidenceLabel: 'Enough data' },
    avgListingQuality: { value: 74, confidenceLabel: 'Enough data' },
    mostSearchedBudget: { value: null, confidenceLabel: 'Not enough data yet' },
  },
  priceComparison: { supported: false, wording: null },
  listingsCta: { areaKey: AREA_KEY, label: `View listings in ${AREA_LABEL}` },
};

// ─── Shared beforeEach ────────────────────────────────────────────────────────

/**
 * Stub auth + trends-options endpoints that every page hits on mount,
 * preventing login redirects and keeping the test self-contained.
 */
async function stubCommonRoutes(page: import('@playwright/test').Page) {
  await page.route('**/auth/v1/**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ access_token: null, user: null }),
    });
  });

  await page.route('**/api/trends/options**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ city: CITY_SLUG, defaultAreas: [] }),
    });
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('Buyer Area Route /trends/:citySlug/areas/:areaSlug — #1539 (mocked network)', () => {
  test('matched=true: hero heading, breadcrumb, at-a-glance section, and "View homes" CTA with areaKey href', async ({
    page,
  }) => {
    await stubCommonRoutes(page);

    // Stub resolve-area → matched=true
    await page.route('**/api/trends/resolve-area**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MATCHED_RESOLVE),
      });
    });

    // Stub area-intelligence → full data
    await page.route('**/api/trends/area-intelligence**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(FULL_DATA_MOCK),
      });
    });

    await page.goto(`/trends/${CITY_SLUG}/areas/${AREA_SLUG}`);

    // Hero h1 shows the area label (AC2 — area name in heading)
    await expect(
      page.getByRole('heading', { name: /malpe/i, level: 1 }),
    ).toBeVisible({ timeout: 10_000 });

    // Breadcrumb: Home / Udupi / Malpe
    // The breadcrumb nav renders cityLabel and areaLabel as text/links
    const breadcrumb = page.getByRole('navigation', { name: /breadcrumb/i });
    await expect(breadcrumb).toBeVisible();
    await expect(breadcrumb.getByText(/udupi/i)).toBeVisible();
    await expect(breadcrumb.getByText(/malpe/i)).toBeVisible();

    // At-a-glance section (AC3) — present when available=true
    await expect(page.getByText('How active is the market here?')).toBeVisible();

    // "View homes in Malpe" CTA — may appear in AreaGuideHero AND AreaCtaBlock;
    // use first() since multiplicity is expected
    const ctaLink = page.getByRole('link', { name: /view homes in malpe/i }).first();
    await expect(ctaLink).toBeVisible();

    // CTA href must include the resolved areaKey for discover routing
    const href = await ctaLink.getAttribute('href');
    expect(href).toContain('/discover');
    expect(href).toContain(`city=${CITY_SLUG}`);
    expect(href).toContain(encodeURIComponent(AREA_KEY));
  });

  test('matched=false: slug-not-found copy renders, /discover link offered, no fabricated metrics', async ({
    page,
  }) => {
    await stubCommonRoutes(page);

    // Stub resolve-area → matched=false (slug unknown)
    await page.route('**/api/trends/resolve-area**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(NOT_MATCHED_RESOLVE),
      });
    });

    // area-intelligence should NOT be called for matched=false, but stub defensively
    await page.route('**/api/trends/area-intelligence**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ available: false, metrics: {} }),
      });
    });

    await page.goto(`/trends/${CITY_SLUG}/areas/no-such-place`);

    // Slug-not-found heading (from SlugNotFound component)
    await expect(page.getByRole('heading', { name: /area not found/i })).toBeVisible({
      timeout: 10_000,
    });

    // Honest explanation copy — confirms it's the slug-not-found state
    await expect(page.getByText(/we couldn't find that area/i)).toBeVisible();

    // Safe /discover link offered as primary action
    const discoverLink = page.getByRole('link', { name: /explore.*on map/i });
    await expect(discoverLink).toBeVisible();
    const discoverHref = await discoverLink.getAttribute('href');
    expect(discoverHref).toContain(`/discover?city=${CITY_SLUG}`);

    // Must NOT render the no-snapshot copy (available=false is a different state)
    await expect(page.getByText(/not yet available/i)).not.toBeVisible();

    // Must NOT render fabricated area metrics
    await expect(page.getByText('31')).not.toBeVisible();
    await expect(page.getByText(/₹55/)).not.toBeVisible();

    // Must NOT render the AreaGuide error copy (different from slug-not-found)
    await expect(page.getByText(/couldn't load area details/i)).not.toBeVisible();
  });
});
