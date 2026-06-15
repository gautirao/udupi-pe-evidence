/**
 * [E2E] Anonymous homepage (ReTrends redesign) → listing detail journey — #846
 *
 * The homepage was redesigned to the ReTrends marketing mock
 * (feat/homepage-figma-redesign). The old "Latest Listings" tile section was
 * intentionally removed — it is not part of the mock. Listings are no longer
 * linked directly from the homepage; the supported entry point is now the
 * Discover-first journey ("Explore on Map" / "Start Map Search" → /discover).
 *
 * ACs:
 *   H1  — Anonymous user visits / — homepage renders without redirect or spinner hang
 *   H2  — Redesigned hero, search controls and major marketing sections render anonymously
 *   H3  — "Explore on Map" navigates to /discover?city=<city>
 *   H3b — Header + CTA navigation: Discover → /discover, Start Map Search → /discover,
 *         Explore Trends → /trends
 *   H4  — Listing detail loads with first image visible; no lock overlay at index 0
 *   H5  — Nav arrows are visible when listing has imageCount >= 2
 *   H6  — Clicking Next shows lock overlay with "Sign in to view all photos"
 *   H7  — Lock overlay CTA links to /auth?returnTo=/listing/:id
 *   H8  — Authenticated user visiting / sees homepage content — no redirect
 *
 * Migration note (redesign):
 *   The old homepage→listing direct tile path (former H2/H3) is obsolete — the
 *   homepage no longer surfaces listing tiles. H2/H3 now assert the new
 *   landing-page flow. The listing-detail gallery + anon photo-lock coverage
 *   (H4–H7) is preserved, but the listing ID is now sourced from the
 *   global-setup LIVE fixture instead of a homepage tile. Those tests skip when
 *   no LIVE listing is available (e.g. no admin creds in the local stack).
 *
 * Run locally:
 *   bash scripts/run-e2e-local.sh --project=full e2e/homepage-listing-journey.spec.ts
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SKIP_NO_MULTI_IMAGE = 'Listing has 0 or 1 image — gallery navigation tests require imageCount >= 2';
const SKIP_NO_LIVE_FIXTURE = 'No LIVE listing fixture — global-setup seeded none (set SMOKE_LISTING_ID or admin creds)';

// ---------------------------------------------------------------------------
// Resolve the LIVE listing ID from the fixture file written by global-setup.
// Mirrors the pattern in e2e/journey/anon-teaser.spec.ts. After the homepage
// redesign removed the "Latest Listings" section, the listing-detail journey
// tests (H4–H7) source their listing here rather than from a homepage tile.
//   1. SMOKE_LISTING_ID env var
//   2. e2e/.test-listing-id (line 1 = UUID, line 2 = status)
//   3. null → listing-dependent tests skip
// ---------------------------------------------------------------------------
function getListingFixture(): { id: string; isLive: boolean } | null {
  if (process.env.SMOKE_LISTING_ID) {
    return { id: process.env.SMOKE_LISTING_ID, isLive: true };
  }
  const idFile = path.join(__dirname, '.test-listing-id');
  if (!fs.existsSync(idFile)) return null;
  const lines = fs.readFileSync(idFile, 'utf-8').trim().split('\n');
  const id = lines[0]?.trim();
  if (!id) return null;
  return { id, isLive: lines[1]?.trim() === 'LIVE' };
}

const fixture = getListingFixture();

// ---------------------------------------------------------------------------
// Helper: navigate to a listing detail page and wait for gallery to settle.
// Returns { nextBtn, prevBtn, hasMultiple }.
// ---------------------------------------------------------------------------
async function openListingDetail(
  page: import('@playwright/test').Page,
  listingId: string,
): Promise<{
  nextBtn: import('@playwright/test').Locator;
  prevBtn: import('@playwright/test').Locator;
  hasMultiple: boolean;
}> {
  await page.goto(`/listing/${listingId}`);
  await page.waitForLoadState('domcontentloaded');

  const nextBtn = page.getByRole('button', { name: /next image/i });
  const prevBtn = page.getByRole('button', { name: /previous image/i });

  let hasMultiple = false;
  try {
    await nextBtn.waitFor({ state: 'visible', timeout: 25_000 });
    hasMultiple = true;
  } catch {
    hasMultiple = false;
  }
  return { nextBtn, prevBtn, hasMultiple };
}

// ---------------------------------------------------------------------------
// Anonymous journey tests — no storageState (browser starts with no session)
// ---------------------------------------------------------------------------
test.describe('@journey [E2E] Anonymous homepage → listing detail journey', () => {
  test.setTimeout(90_000);

  test('H1 — anonymous user visits / without redirect or spinner hang', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // URL must remain / — no redirect to /discover or /auth
    await expect(page).toHaveURL('/', { timeout: 5_000 });

    // Homepage hero heading confirms LandingPage rendered (not a spinner hang)
    await expect(
      page.getByRole('heading', { name: /Find Your Perfect Home with Trust/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('H2 — redesigned hero, search controls and major sections render anonymously', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Hero search card controls
    await expect(
      page.getByRole('button', { name: /Explore on Map/i }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByPlaceholder(/Search localities/i)).toBeVisible();

    // Major marketing sections from the mock all render without signing in
    await expect(page.getByRole('heading', { name: /Why Choose ReTrends\?/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Trending Localities/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Understanding Trust Badges/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Area Overview Pages/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Ready to Find Your Perfect Home\?/i })).toBeVisible();
  });

  test('H3 — "Explore on Map" navigates to /discover with a city param', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await page.getByRole('button', { name: /Explore on Map/i }).click();
    await expect(page).toHaveURL(/\/discover\?city=\w+/, { timeout: 10_000 });
  });

  test('H3b — header and CTA links route to /discover and /trends', async ({ page }) => {
    // Header "Discover" nav link → /discover
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.getByRole('link', { name: 'Discover' }).click();
    await expect(page).toHaveURL(/\/discover/, { timeout: 10_000 });

    // Bottom CTA "Start Map Search" → /discover
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.getByRole('link', { name: /Start Map Search/i }).click();
    await expect(page).toHaveURL(/\/discover/, { timeout: 10_000 });

    // Bottom CTA "Explore Trends" → /trends
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.getByRole('link', { name: /Explore Trends/i }).click();
    await expect(page).toHaveURL(/\/trends/, { timeout: 10_000 });
  });

  test('H4 — listing detail loads with first image visible; no lock overlay at index 0', async ({ page }) => {
    test.skip(fixture === null || !fixture.isLive, SKIP_NO_LIVE_FIXTURE);

    await openListingDetail(page, fixture!.id);

    // No lock overlay heading at index 0
    await expect(
      page.getByRole('heading', { name: /Sign in to view all photos/i }),
    ).not.toBeVisible();

    // AC1: if an image rendered (listing has primaryImageUrl), assert it has a non-empty src.
    // This prevents a blank gallery area passing just because the lock overlay is absent.
    const galleryImg = page.locator('img[alt*="Property image"]').first();
    const imgVisible = await galleryImg.isVisible().catch(() => false);
    if (imgVisible) {
      const src = await galleryImg.getAttribute('src');
      expect(src, 'Gallery image src is empty — blank image area passed old lock-only check').toBeTruthy();
    }
  });

  test('H5 — nav arrows are visible for listing with imageCount >= 2', async ({ page }) => {
    test.skip(fixture === null || !fixture.isLive, SKIP_NO_LIVE_FIXTURE);

    const { nextBtn, prevBtn, hasMultiple } = await openListingDetail(page, fixture!.id);
    test.skip(!hasMultiple, SKIP_NO_MULTI_IMAGE);

    await expect(nextBtn).toBeVisible();
    await expect(prevBtn).toBeVisible();
  });

  test('H6 — clicking Next triggers lock overlay with "Sign in to view all photos"', async ({ page }) => {
    test.skip(fixture === null || !fixture.isLive, SKIP_NO_LIVE_FIXTURE);

    const { nextBtn, hasMultiple } = await openListingDetail(page, fixture!.id);
    test.skip(!hasMultiple, SKIP_NO_MULTI_IMAGE);

    await nextBtn.click();

    await expect(
      page.getByRole('heading', { name: /Sign in to view all photos/i }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('H7 — lock overlay CTA links to /auth?returnTo=/listing/:id', async ({ page }) => {
    test.skip(fixture === null || !fixture.isLive, SKIP_NO_LIVE_FIXTURE);

    const listingId = fixture!.id;
    const { nextBtn, hasMultiple } = await openListingDetail(page, listingId);
    test.skip(!hasMultiple, SKIP_NO_MULTI_IMAGE);

    await nextBtn.click();

    // Wait for overlay CTA to appear
    const cta = page.getByRole('link', { name: /Sign in to view all photos/i });
    await expect(cta).toBeVisible({ timeout: 5_000 });

    const href = await cta.getAttribute('href');
    // returnTo may be URL-encoded (%2Flisting%2F…) or plain-slash depending on Link implementation
    expect(decodeURIComponent(href ?? '')).toBe(`/auth?returnTo=/listing/${listingId}`);
  });
});

// ---------------------------------------------------------------------------
// Authenticated journey — verifies homepage is not bypassed for auth users
// ---------------------------------------------------------------------------
test.describe('[E2E] Authenticated homepage', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });
  test.setTimeout(30_000);

  test('H8 — authenticated user visits / and sees homepage content without redirect', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // URL stays at / — no redirect to /discover
    await expect(page).toHaveURL('/', { timeout: 5_000 });

    // LandingPage hero heading confirms the homepage rendered (not AppLayout)
    await expect(
      page.getByRole('heading', { name: /Find Your Perfect Home with Trust/i }),
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// Parity verification — milestone discover-trends-redesign-2-parity-fixes
// Covers AC6: E2E signal for all implementation fixes merged in this milestone.
//
// NOTE: P2 (#858 panel-toggle collapse) and P3 (#857 mobile filter sheet) were
// removed in the ReTrends homepage redesign. That redesign intentionally
// replaced the homepage two-column filter panel with the marketing hero search
// card — the panel-toggle / filter-panel-col / mobile-filter-trigger elements
// and the "Find your next property" sheet no longer exist on the homepage. The
// filtering UX now lives on /discover, where it is covered by the map-filters
// and discover specs. Those two assertions are therefore obsolete for this page
// and have been dropped rather than weakened. P1 (#862) remains valid.
// ---------------------------------------------------------------------------
test.describe('[E2E] Homepage parity — discover-trends-redesign-2-parity-fixes', () => {
  test.setTimeout(30_000);

  test('P1 — anonymous user sees "Sign In" link in header, not undefined email (#862)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // The header must render a "Sign In" link for anonymous users, not an avatar/email
    await expect(page.getByRole('link', { name: /^sign in$/i })).toBeVisible({ timeout: 5_000 });

    // Header must not contain the literal string "undefined"
    const headerText = await page.locator('header').textContent();
    expect(headerText, '"undefined" appeared in the header — anonymous email bug not fixed').not.toContain('undefined');
  });
});
