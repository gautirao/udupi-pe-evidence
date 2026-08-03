/**
 * Issue #1956 PR-4 (AC4.13) — Areas adaptive journeys at a canonical AREA leaf.
 *
 * `node=` is the ONLY navigation identity asserted throughout this file — the
 * legacy `areaKey=` URL param is never written by the surface under test and
 * is never asserted here either.
 *
 * ── FIXTURE PROVENANCE (read before "fixing" any assertion below) ──
 * Same disposable local-fixture Postgres tree as the sibling PR-2/PR-3 specs
 * in this directory (see issue-1956-pr2-guarded-hierarchy-back.spec.ts and
 * issue-1956-pr3-area-clustering.spec.ts module docs for the #2032 fixture
 * background). This file additionally depends on an AC4.11 fixture extension
 * seeded via direct SQL against the SAME disposable container — ADDING
 * listings inside the EXISTING `IN|KA|Bengaluru|Basaveshwara Nagar` area
 * only; no Direction/Area cardinality was touched. Exact statement run:
 *
 *   -- enrich the 2 existing sale rows with real price/coords (still 2 sale rows)
 *   UPDATE property_listings SET title=..., property_type='apartment',
 *     price_paise=..., latitude=12.99135x, longitude=77.53929x, bedrooms=...,
 *     bathrooms=..., built_area=..., built_area_unit='sqft'
 *   WHERE id IN ('e2e19560-0003-0000-0000-000000000001',
 *                'e2e19560-0003-0000-0000-000000000002');
 *
 *   -- add 3 NEW rent rows in the SAME area (deliberately unequal to the 2
 *   -- sale rows so AC4.11's "result COUNT changes" is a real assertion, not
 *   -- presence-only)
 *   INSERT INTO property_listings (id, title, area_key, property_type,
 *     status, listing_purpose, price, monthly_rent, latitude, longitude,
 *     bedrooms, bathrooms, built_area, built_area_unit, listing_number,
 *     trust_tier, seller_type, is_valid, is_duplicate, area_resolution_status,
 *     created_at, updated_at)
 *   VALUES
 *     ('e2e19560-0011-0000-0000-000000000001', ... 'rent', ... monthly_rent=25000, ...),
 *     ('e2e19560-0011-0000-0000-000000000002', ... 'rent', ... monthly_rent=32000, ...),
 *     ('e2e19560-0011-0000-0000-000000000003', ... 'rent', ... monthly_rent=18000, ...);
 *
 * Issue #2051 (AC6/AC8/AC12) extends this same fixture's coverage to the
 * RENDERED price text of those 3 rent rows (PropertyCard.tsx), not just card
 * COUNT. formatPrice(25000, 'INR') (src/lib/formatters.ts) takes the
 * thousands branch (25000 >= 1000, < 100000): thousands = 25, 25 % 1 === 0,
 * so `${(25000/1000).toFixed(0)}K` -> "25K" -> "₹25K", and PropertyCard
 * appends the literal '/mo' suffix for the monthlyRentRupees branch (never a
 * /100 or *100 conversion -- monthlyRentRupees is already in rupees, unlike
 * pricePaise). The expected on-screen string for the 25000 row is therefore
 * exactly "₹25K/mo" -- confirmed against
 * src/components/discover/__tests__/PropertyCard.test.tsx ('#2051 rent
 * branch-1 (authed)'), which asserts the identical string for the identical
 * 25000 input.
 *
 * Confirmed live against the running fixture backend (port 8081, NOT the
 * shared hosted Supabase — see this PR's evidence report for why 8081 is the
 * safe local-fixture backend and 8085 must never be used):
 *   GET /api/discover/cities/bangalore/listings?areaKeys=...Basaveshwara%20Nagar&listingPurpose=sale  -> 2 listings
 *   GET /api/discover/cities/bangalore/listings?areaKeys=...Basaveshwara%20Nagar&listingPurpose=rent  -> 3 listings
 *
 * `IN|KA|Bengaluru|Hosahalli` (the 5th area under `d:s`) remains a genuinely
 * zero-listing AREA — untouched — for AC4.7.
 */
import { test, expect, type Page } from '@playwright/test';

const CITY = 'bangalore';
const BASE = `city=${CITY}&journey=area-first`;

const AREA_BASAVESHWARA = 'a:IN|KA|Bengaluru|Basaveshwara Nagar';
const AREA_HOSAHALLI = 'a:IN|KA|Bengaluru|Hosahalli';

const SALE_LISTING_A_ID = 'e2e19560-0003-0000-0000-000000000001';
const SALE_LISTING_A_TITLE = '[E2E-AC4.11] 3BHK Basaveshwara Nagar Sale A';

function nodeParam(page: Page): string | null {
  return new URL(page.url()).searchParams.get('node');
}
function listingParam(page: Page): string | null {
  return new URL(page.url()).searchParams.get('listing');
}

async function gotoAreaLeaf(page: Page, node: string) {
  await page.goto(`/discover?${BASE}&node=${encodeURIComponent(node)}`);
  await page.waitForLoadState('domcontentloaded');
}

// #2051 — PropertyCard renders the price as the first <p> in the card body
// (title is an <h3>; location, when present, is a <p> that always comes
// AFTER the price block in DOM order — see PropertyCard.tsx around the
// "Price + property-type pill" comment). There is no dedicated price
// data-testid, so this is the narrowest reliable selector without touching
// production code.
async function cardPriceTexts(page: Page): Promise<string[]> {
  const cards = page.getByTestId('listing-card');
  const count = await cards.count();
  const texts: string[] = [];
  for (let i = 0; i < count; i++) {
    texts.push((await cards.nth(i).locator('p').first().innerText()).trim());
  }
  return texts;
}

test.describe('@integration-ui #1956 PR-4 — Areas adaptive journeys at an AREA leaf (AC4.13)', () => {
  test('AC4.1/AC4.11 — a canonical AREA leaf mounts the listings surface (not the structural empty branch), and Buy/Rent changes the result COUNT while node stays fixed', async ({
    page,
    browser,
  }) => {
    await gotoAreaLeaf(page, AREA_BASAVESHWARA);
    await expect(page.getByTestId('areas-journey-panel-listings')).toBeVisible({ timeout: 15_000 });
    expect(nodeParam(page)).toBe(AREA_BASAVESHWARA);

    // Buy (default, 'intent' omitted from URL) — 2 sale listings.
    await expect(page.getByTestId('listing-card')).toHaveCount(2, { timeout: 15_000 });

    // Switch to Rent. Wait on the ACTUAL listingPurpose=rent network response
    // (not just locator-count polling) so this assertion is tied to the real
    // fetch completing rather than a render-timing race against the click.
    const rentResponse = page.waitForResponse(
      (res) =>
        res.url().includes('/api/discover/cities/bangalore/listings') &&
        res.url().includes('listingPurpose=rent'),
      { timeout: 15_000 },
    );
    await page.getByTestId('intent-selector-rent').click();
    await expect.poll(() => new URL(page.url()).searchParams.get('intent')).toBe('rent');
    await rentResponse;

    // The result COUNT genuinely changes (2 -> 3) because the underlying
    // fixtures differ in cardinality — this is the AC4.11 assertion the
    // pre-existing intent-survives-navigation spec deliberately does NOT
    // make (it only proves the param survives, never that it changes what's
    // shown).
    await expect(page.getByTestId('listing-card')).toHaveCount(3, { timeout: 15_000 });

    // #2051 AC6/AC12 — the rendered price text of the 3 rent cards, not just
    // their count. Anon here (this test's default context has no
    // storageState) so PropertyCard is on the monthlyRentBand arm: every
    // card must carry a real, non-empty price with the '/mo' suffix and must
    // never fall back to "Price on request" for a listing that does carry a
    // monthly_rent.
    const anonRentPriceTexts = await cardPriceTexts(page);
    expect(anonRentPriceTexts).toHaveLength(3);
    for (const text of anonRentPriceTexts) {
      expect(text.length, `rent card price "${text}" must be non-empty`).toBeGreaterThan(0);
      expect(text, `rent card price "${text}" must carry the /mo suffix`).toMatch(/\/mo$/);
      expect(text, `rent card price must never read "Price on request" for a priced rent listing`).not.toBe(
        'Price on request',
      );
    }

    // #2051 AC8 — anti-regression against a x100/÷100 unit conversion bug on
    // the EXACT rupee figure. The anon band above can't prove this (bands
    // are coarse, computed server-side, and share no code path with the
    // exact-rupee conversion), so open a SEPARATE authenticated context
    // in-place — no restructuring of this spec's anon-default test model —
    // and re-read the same area leaf under intent=rent. The seeded 25000
    // row must render exactly "₹25K/mo" (formatPrice's thousands branch —
    // see this file's module doc for the derivation), never "₹250/mo" (a
    // ÷100 error) or a "₹25,00,000" family string (a ×100 error).
    const authedContext = await browser.newContext({ storageState: 'e2e/fixtures/user-auth.json' });
    const authedPage = await authedContext.newPage();
    try {
      await authedPage.goto(`/discover?${BASE}&node=${encodeURIComponent(AREA_BASAVESHWARA)}&intent=rent`);
      await authedPage.waitForLoadState('domcontentloaded');
      await expect(authedPage.getByTestId('listing-card')).toHaveCount(3, { timeout: 15_000 });

      const authedRentPriceTexts = await cardPriceTexts(authedPage);
      expect(authedRentPriceTexts).toHaveLength(3);
      expect(
        authedRentPriceTexts,
        `the seeded 25000 rent row must render as exactly "₹25K/mo" among ${JSON.stringify(authedRentPriceTexts)}`,
      ).toContain('₹25K/mo');
      for (const text of authedRentPriceTexts) {
        expect(text, `"${text}" must not be a ÷100-corrupted "₹250/mo"`).not.toMatch(/₹250(?!K)\/mo/);
        expect(text, `"${text}" must not be a ×100-corrupted "₹25,00,000" family string`).not.toMatch(
          /25,00,000/,
        );
      }
    } finally {
      await authedContext.close();
    }

    // #2051 AC13 (card/marker-popover price agreement) is intentionally NOT
    // asserted here. Doing so would require clicking a specific rent
    // listing's map marker via `[data-listing-id="<id>"] [data-testid="property-marker"]`
    // (the pattern used by e2e/discover-1738-regression.spec.ts and
    // e2e/discover-1939-listing-peek-url-restore.spec.ts), but unlike the
    // sale rows — which this file's own J7c test explicitly confirms "carry
    // real lat/lon" — the AC4.11 fixture-seed SQL for the 3 rent rows above
    // elides their lat/longitude ("..."), so whether a rent marker even
    // exists to click is unconfirmed. Asserting on an unconfirmed marker
    // would either be a guess dressed up as a real check, or would require
    // restructuring this spec to seed/confirm rent-row coordinates first —
    // out of scope for this authoring pass. Skipped; flagged for follow-up
    // once the rent-row fixture coordinates are confirmed.

    // node= and the AREA identity are unchanged by the Buy -> Rent toggle.
    expect(nodeParam(page)).toBe(AREA_BASAVESHWARA);
    await expect(page.getByTestId('areas-journey-panel-listings')).toBeVisible();
  });

  test('AC4.7 — a genuinely zero-listing AREA renders the listing-empty state, not the error branch', async ({
    page,
  }) => {
    await gotoAreaLeaf(page, AREA_HOSAHALLI);
    await expect(page.getByTestId('areas-journey-panel-listings')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('area-empty-state')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('areas-journey-panel-listings-error')).toHaveCount(0);
    await expect(page.getByTestId('listing-card')).toHaveCount(0);
  });

  test('J7a — quick filter chips at an AREA leaf narrow the visible cards (chips, count, and cards share one filter identity)', async ({
    page,
  }) => {
    await gotoAreaLeaf(page, AREA_BASAVESHWARA);
    await expect(page.getByTestId('areas-journey-panel-listings')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('listing-card')).toHaveCount(2, { timeout: 15_000 });

    // Both seeded sale listings are 'apartment' — the chip should keep 2 visible.
    const apartmentChip = page.getByTestId('quick-chip-apartment');
    await expect(apartmentChip).toBeVisible();
    await apartmentChip.click();
    await expect(page.getByTestId('listing-card')).toHaveCount(2, { timeout: 15_000 });

    // Bedrooms=3 narrows to exactly ONE of the two seeded sale listings
    // (Sale A is 3BHK, Sale B is 2BHK) — a real narrowing assertion, not a
    // no-op toggle.
    const bed3Chip = page.getByTestId('quick-chip-3-bhk');
    await expect(bed3Chip).toBeVisible();
    await bed3Chip.click();
    await expect(page.getByTestId('listing-card')).toHaveCount(1, { timeout: 15_000 });
    await expect(page.getByTestId('area-result-summary')).toBeVisible();

    // Clearing back to 'All' restores both.
    await page.getByTestId('quick-chip-all').click();
    await bed3Chip.click(); // toggle bedrooms off (re-click clears the single-select chip)
    await expect(page.getByTestId('listing-card')).toHaveCount(2, { timeout: 15_000 });
  });

  test('J7b — within-area search narrows results by title text', async ({ page }) => {
    await gotoAreaLeaf(page, AREA_BASAVESHWARA);
    await expect(page.getByTestId('areas-journey-panel-listings')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('listing-card')).toHaveCount(2, { timeout: 15_000 });

    // "3BHK" appears only in Sale A's title (Sale B is "2BHK") — a plain
    // "Sale A" query does NOT narrow (confirmed live: the backend FTS treats
    // 'A' as a stopword, so both listings match on the 'sale' token alone).
    const searchInput = page.getByTestId('area-search-input');
    await expect(searchInput).toBeVisible();
    await searchInput.fill('3BHK');

    // The search hook debounces (~300ms) before committing to the URL/query —
    // poll rather than asserting immediately.
    await expect.poll(() => new URL(page.url()).searchParams.get('q'), { timeout: 5_000 }).toBe('3BHK');
    await expect(page.getByTestId('listing-card')).toHaveCount(1, { timeout: 15_000 });
    await expect(page.getByText(SALE_LISTING_A_TITLE)).toBeVisible();

    await page.getByTestId('area-search-clear').click();
    await expect(page.getByTestId('listing-card')).toHaveCount(2, { timeout: 15_000 });
  });

  test('J7c — at an AREA leaf the map switches to per-LISTING markers (a terminal leaf has no children of its own), in sync with the panel result count', async ({
    page,
  }) => {
    await gotoAreaLeaf(page, AREA_BASAVESHWARA);
    await expect(page.getByTestId('areas-journey-panel-listings')).toBeVisible({ timeout: 15_000 });

    // AREA is a terminal node (journey.children.length === 0) — AreaMarkerLayer's
    // `area-single-marker`/`area-destination-marker` render AREA children of a
    // Direction/Cluster, which does not apply here; at the leaf itself the map
    // renders one `property-marker` per geocoded listing (PropertyMap.tsx),
    // and that count must agree with the panel's card count (both seeded sale
    // listings carry real lat/lon).
    await expect(page.getByTestId('listing-card')).toHaveCount(2, { timeout: 15_000 });
    await expect(page.locator('[data-testid="property-marker"]')).toHaveCount(2, { timeout: 15_000 });

    const summaryText = await page.getByTestId('area-result-summary-text').innerText();
    expect(summaryText).toMatch(/2/);
  });

  test('J7d — anonymous save opens the sign-in modal (no client-only toggle, no network call)', async ({
    page,
  }) => {
    await gotoAreaLeaf(page, AREA_BASAVESHWARA);
    await expect(page.getByTestId('areas-journey-panel-listings')).toBeVisible({ timeout: 15_000 });

    const firstCard = page.getByTestId('listing-card').first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });
    const saveButton = firstCard.getByTestId('listing-save-button');
    await expect(saveButton).toBeVisible();
    await expect(saveButton).toHaveAttribute('aria-pressed', 'false');

    await saveButton.click();

    // The shadcn Dialog rendered by AuthModalContext — sr-only DialogTitle
    // "Authentication" identifies it unambiguously.
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog.getByText('Authentication', { exact: true })).toBeAttached();

    // The heart itself never flips locally — an anonymous click must not
    // fake a client-only "saved" state.
    await expect(saveButton).toHaveAttribute('aria-pressed', 'false');
  });

  test('AC4.6 — "Add a school in this area" CTA is visible at a canonical AREA leaf, enters school-picking with the area retained, and Back restores that same AREA', async ({
    page,
  }) => {
    // Regression test (Mode-3 PR-4 FINAL FIX PASS) — the canonical AREA-leaf
    // surface (AreaLeafListingsSurface -> DiscoverAreasJourneyPanel) omitted
    // `onAddSchool` when mounting AreaSelectedPanel, so the CTA silently never
    // rendered (the prop is optional on both components, so the omission
    // compiled clean). Confirmed pre-fix by rendering this exact spec against
    // a copy of DiscoverAreasJourneyPanel.tsx with the `onAddSchool={onAddSchool}`
    // line (AreaLeafListingsSurface's <AreaSelectedPanel> call) reverted to
    // omitted — see PR report for the exact command/diff used to prove the
    // failure.
    await gotoAreaLeaf(page, AREA_BASAVESHWARA);
    await expect(page.getByTestId('areas-journey-panel-listings')).toBeVisible({ timeout: 15_000 });
    expect(nodeParam(page)).toBe(AREA_BASAVESHWARA);

    const addSchoolCta = page.getByTestId('add-school-cta');
    await expect(addSchoolCta).toBeVisible({ timeout: 15_000 });
    await addSchoolCta.click();

    // enterSchoolPicking() PUSHes schoolPicking=1 while keeping journey/node
    // (Issue #1157) — the AREA identity must survive the click unchanged.
    await expect.poll(() => new URL(page.url()).searchParams.get('schoolPicking')).toBe('1');
    expect(nodeParam(page)).toBe(AREA_BASAVESHWARA);

    // Browser Back must REPLACE-undo the schoolPicking marker only, landing
    // back on the SAME area-selected surface — not the area-groups landing.
    await page.goBack();
    await expect.poll(() => new URL(page.url()).searchParams.get('schoolPicking')).toBeNull();
    expect(nodeParam(page)).toBe(AREA_BASAVESHWARA);
    await expect(page.getByTestId('areas-journey-panel-listings')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('add-school-cta')).toBeVisible();
  });

  test('J7f — listing=<uuid> cold deep-link at an AREA leaf round-trips through reload', async ({
    page,
  }) => {
    await page.goto(
      `/discover?${BASE}&node=${encodeURIComponent(AREA_BASAVESHWARA)}&listing=${SALE_LISTING_A_ID}`,
    );
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('areas-journey-panel-listings')).toBeVisible({ timeout: 15_000 });

    expect(nodeParam(page)).toBe(AREA_BASAVESHWARA);
    expect(listingParam(page)).toBe(SALE_LISTING_A_ID);
    // Confirmed live: `listing=` cold-loads BOTH the result card AND a
    // marker popover naming the same listing (#1939 machinery) — the title
    // text is legitimately duplicated on screen, so assert on the card only.
    await expect(page.getByTestId('listing-card').getByText(SALE_LISTING_A_TITLE)).toBeVisible({
      timeout: 15_000,
    });

    // Round-trip: a hard reload preserves both node= and listing=, and the
    // named listing is still on screen (not silently dropped).
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('areas-journey-panel-listings')).toBeVisible({ timeout: 15_000 });
    expect(nodeParam(page)).toBe(AREA_BASAVESHWARA);
    expect(listingParam(page)).toBe(SALE_LISTING_A_ID);
    await expect(page.getByTestId('listing-card').getByText(SALE_LISTING_A_TITLE)).toBeVisible({
      timeout: 15_000,
    });
  });
});
