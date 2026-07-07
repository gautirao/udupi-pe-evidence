/**
 * Issue #1567 — public-safe trust badges on discovery listing cards.
 *
 * Covers AC1 (public trustBadge word renders as a labelled badge) and AC4
 * (absent/null/unknown trustBadge renders NO badge — never fabricated).
 *
 * Why E2E (not just unit): the contract is A/B/C/D (internal) -> trustBadge
 * public word -> HTTP JSON -> useDiscoverCityListings -> PropertyCard DOM.
 * PropertyCard.test.tsx already proves the render branch in isolation; this
 * spec proves the same contract survives serialization -> network ->
 * deserialization -> DOM for the real discover page, which no unit test can
 * observe on its own.
 *
 * CRITICAL: real Udupi seed data is trustTier D/null for ~all listings, so a
 * live-data run would show zero badges by design and prove nothing. Every
 * assertion here runs against a page.route()-mocked /api/discover/cities/
 * {city}/listings response carrying explicit trustBadge values — no live
 * backend or shared Supabase required.
 *
 * Run locally:
 *   bash scripts/run-e2e-local.sh --project=full e2e/discover-trust-badge-1567.spec.ts
 */

import { test, expect } from '@playwright/test';

// ── Fixture data ─────────────────────────────────────────────────────────

const MOCK_CITY = 'udupi';
const MOCK_AREA_KEY = 'IN|KA|Udupi|Manipal';
const MOCK_AREA_KEY_ENCODED = encodeURIComponent(MOCK_AREA_KEY);

// Shape matches DiscoverAreasResponse (src/hooks/useDiscoverAreas.ts)
const MOCK_AREAS_RESPONSE = {
  city: MOCK_CITY,
  areas: [
    {
      areaKey: MOCK_AREA_KEY,
      name: 'Manipal',
      geoCenterLat: 13.3525,
      geoCenterLon: 74.7925,
      bbox: [
        [13.32, 74.76],
        [13.38, 74.82],
      ],
      listingCount: 5,
      schoolCount: 3,
      trendDirection: 'stable',
    },
  ],
};

// Each listing carries ONLY the public `trustBadge` field — the raw internal
// letter grade (trustTier) is never part of the wire contract (backend
// projects A/B/C -> verified/trusted/listed and D/null -> absent before the
// response ever leaves the server; see TrustBadge.java / CityAreaListingsService.java).
// Shape matches DiscoverCityListingItem (src/hooks/useDiscoverCityListings.ts).
const VERIFIED_LISTING = {
  id: 'lst-verified',
  title: 'Verified Grade Listing',
  locality: 'Manipal',
  propertyType: 'apartment',
  listingPurpose: 'sale',
  pricePaise: 5_000_000 * 100,
  trustBadge: 'verified' as const,
};

const TRUSTED_LISTING = {
  id: 'lst-trusted',
  title: 'Trusted Grade Listing',
  locality: 'Manipal',
  propertyType: 'villa',
  listingPurpose: 'sale',
  pricePaise: 7_500_000 * 100,
  trustBadge: 'trusted' as const,
};

const LISTED_LISTING = {
  id: 'lst-listed',
  title: 'Listed Grade Listing',
  locality: 'Manipal',
  propertyType: 'house',
  listingPurpose: 'rent',
  pricePaise: 25_000 * 100,
  trustBadge: 'listed' as const,
};

// D-tier / legacy rows: the field is entirely ABSENT from the JSON (not present
// as a key at all) — the dominant real-world shape per TrustBadge.publicBadge().
const NO_BADGE_LISTING = {
  id: 'lst-no-badge',
  title: 'No Badge D Tier Listing',
  locality: 'Manipal',
  propertyType: 'apartment',
  listingPurpose: 'sale',
  pricePaise: 3_000_000 * 100,
  // trustBadge intentionally omitted
};

// Defensive: a stray/unknown value must never be rendered as a badge either
// (the component's allow-list only recognises verified/trusted/listed).
const UNKNOWN_BADGE_LISTING = {
  id: 'lst-unknown-badge',
  title: 'Unknown Grade Listing',
  locality: 'Manipal',
  propertyType: 'apartment',
  listingPurpose: 'sale',
  pricePaise: 4_000_000 * 100,
  trustBadge: 'UNKNOWN',
};

const ALL_LISTINGS = [
  VERIFIED_LISTING,
  TRUSTED_LISTING,
  LISTED_LISTING,
  NO_BADGE_LISTING,
  UNKNOWN_BADGE_LISTING,
];

// Shape matches DiscoverCityListingsResponse
const MOCK_CITY_LISTINGS_RESPONSE = {
  city: MOCK_CITY,
  limitPerArea: 10,
  areas: [
    {
      areaKey: MOCK_AREA_KEY,
      areaName: 'Manipal',
      listings: ALL_LISTINGS,
    },
  ],
};

// ── Helpers ──────────────────────────────────────────────────────────────

async function stubApis(page: import('@playwright/test').Page) {
  // INTEGRATION-UI: stub justified — real Udupi seed data is D-tier/null for
  // ~all listings, so live data would show zero badges and prove nothing.
  await page.route('**/api/discover/areas**', (route) =>
    route.fulfill({ json: MOCK_AREAS_RESPONSE }),
  );
  await page.route('**/api/discover/cities/**/listings**', (route) =>
    route.fulfill({ json: MOCK_CITY_LISTINGS_RESPONSE }),
  );
  // Prevents 404 noise if the panel also requests area-groups; not under test here.
  await page.route('**/api/discover/area-groups**', (route) =>
    route.fulfill({ json: { groups: [] } }),
  );
}

/** Scope to the single listing-card whose title matches `titleText`. */
function cardByTitle(page: import('@playwright/test').Page, titleText: string) {
  return page.getByTestId('listing-card').filter({ hasText: titleText });
}

// ── Tests ────────────────────────────────────────────────────────────────

test.describe('@integration-ui Issue #1567 — public trust badge on discover cards', () => {
  test.beforeEach(async ({ page }) => {
    await stubApis(page);
    await page.goto(
      `/discover?city=${MOCK_CITY}&areaKey=${MOCK_AREA_KEY_ENCODED}`,
    );
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 10_000 });
    // Wait for the mocked listings to have rendered before any test asserts on cards.
    await expect(page.getByText(UNKNOWN_BADGE_LISTING.title)).toBeVisible({ timeout: 12_000 });
  });

  // AC1 — trustBadge "verified" -> "Verified" badge, end to end through the network mock.
  test('AC1: trustBadge "verified" renders a "Verified" badge on its card', async ({ page }) => {
    const card = cardByTitle(page, VERIFIED_LISTING.title);
    await expect(card).toBeVisible({ timeout: 8_000 });
    const badge = card.getByTestId('trust-badge');
    await expect(badge).toBeVisible({ timeout: 8_000 });
    await expect(badge).toHaveText(/Verified/);
  });

  // AC1 — trustBadge "trusted" -> "Trusted" badge.
  test('AC1: trustBadge "trusted" renders a "Trusted" badge on its card', async ({ page }) => {
    const card = cardByTitle(page, TRUSTED_LISTING.title);
    await expect(card).toBeVisible({ timeout: 8_000 });
    const badge = card.getByTestId('trust-badge');
    await expect(badge).toBeVisible({ timeout: 8_000 });
    await expect(badge).toHaveText(/Trusted/);
  });

  // AC1 — trustBadge "listed" -> "Listed" badge.
  test('AC1: trustBadge "listed" renders a "Listed" badge on its card', async ({ page }) => {
    const card = cardByTitle(page, LISTED_LISTING.title);
    await expect(card).toBeVisible({ timeout: 8_000 });
    const badge = card.getByTestId('trust-badge');
    await expect(badge).toBeVisible({ timeout: 8_000 });
    await expect(badge).toHaveText(/Listed/);
  });

  // AC4 — the field is entirely absent from the JSON (D-tier/legacy row) -> no badge at all.
  test('AC4: a listing with trustBadge absent from the JSON renders NO trust badge', async ({
    page,
  }) => {
    const card = cardByTitle(page, NO_BADGE_LISTING.title);
    await expect(card).toBeVisible({ timeout: 8_000 });
    await expect(card.getByTestId('trust-badge')).toHaveCount(0);
    await expect(card.getByText(/Verified|Trusted|Listed/)).toHaveCount(0);
  });

  // AC4 (defensive) — an unrecognised trustBadge string must not be rendered either;
  // the allow-list is verified/trusted/listed only, never invented.
  test('AC4 (defensive): a listing with an unrecognised trustBadge value renders NO badge', async ({
    page,
  }) => {
    const card = cardByTitle(page, UNKNOWN_BADGE_LISTING.title);
    await expect(card).toBeVisible({ timeout: 8_000 });
    await expect(card.getByTestId('trust-badge')).toHaveCount(0);
  });

  // Regression — the public wire contract must never carry the raw internal letter
  // grade. This guards the fixture itself (so a future edit can't silently
  // reintroduce trustTier) AND the rendered DOM (no card ever shows a bare "A"/"B"/
  // "C"/"D" as its trust badge — only the three public words are legitimate).
  test('regression: mocked payload has no trustTier key, and rendered badges are never raw letter grades', async ({
    page,
  }) => {
    for (const listing of ALL_LISTINGS) {
      expect(listing).not.toHaveProperty('trustTier');
    }

    // Exactly 3 of the 5 mocked listings carry a recognised public badge word.
    const badges = page.getByTestId('trust-badge');
    await expect(badges).toHaveCount(3);

    const texts = await badges.allTextContents();
    for (const text of texts) {
      const trimmed = text.trim();
      expect(trimmed).not.toMatch(/^[ABCD]$/);
      expect(['Verified', 'Trusted', 'Listed']).toContain(
        trimmed.replace(/^\W+/, '').split(/\s+/).pop(),
      );
    }
  });
});
