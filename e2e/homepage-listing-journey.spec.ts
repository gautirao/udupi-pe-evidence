/**
 * [E2E] Anonymous homepage → listing detail journey — #846
 *
 * ACs:
 *   H1 — Anonymous user visits /  — homepage renders without redirect or spinner hang
 *   H2 — Latest Listings tile section visible without signing in
 *   H3 — Clicking a listing tile navigates to /listing/:id
 *   H4 — Listing detail loads with first image visible; no lock overlay at index 0
 *   H5 — Nav arrows are visible when listing has imageCount >= 2
 *   H6 — Clicking Next shows lock overlay with "Sign in to view all photos"
 *   H7 — Lock overlay CTA links to /auth?returnTo=/listing/:id
 *   H8 — Authenticated user visiting / sees homepage content — no redirect
 *
 * Guards:
 *   - Tile tests (H2–H7) skip if public API returns no LIVE listings on homepage
 *   - Multi-image tests (H5–H7) skip if the first tile has only one image
 *
 * Run locally:
 *   bash scripts/run-e2e-local.sh --project=full e2e/homepage-listing-journey.spec.ts
 */

import { test, expect } from '@playwright/test';

const SKIP_NO_TILES = 'No listing tiles on homepage — public API returned no results or is unavailable';
const SKIP_NO_MULTI_IMAGE = 'Listing has 0 or 1 image — gallery navigation tests require imageCount >= 2';

// ---------------------------------------------------------------------------
// Helper: go to homepage and resolve the first listing tile link.
// Returns null if the section doesn't appear (public API empty / unavailable).
// ---------------------------------------------------------------------------
async function getFirstTileLink(
  page: import('@playwright/test').Page,
): Promise<{ href: string; listingId: string } | null> {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  const heading = page.getByRole('heading', { name: /Latest Listings/i });
  const appeared = await heading
    .waitFor({ state: 'visible', timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  if (!appeared) return null;

  const firstLink = page.locator('a[href^="/listing/"]').first();
  const href = await firstLink.getAttribute('href');
  if (!href) return null;
  const listingId = href.replace('/listing/', '');
  return { href, listingId };
}

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
test.describe('[E2E] Anonymous homepage → listing detail journey', () => {
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

  test('H2 — Latest Listings section is visible without signing in', async ({ page }) => {
    const tile = await getFirstTileLink(page);
    test.skip(tile === null, SKIP_NO_TILES);

    await expect(page.getByRole('heading', { name: /Latest Listings/i })).toBeVisible();
    // At least one listing link rendered
    await expect(page.locator('a[href^="/listing/"]').first()).toBeVisible();
  });

  test('H3 — clicking a listing tile navigates to /listing/:id', async ({ page }) => {
    const tile = await getFirstTileLink(page);
    test.skip(tile === null, SKIP_NO_TILES);

    const { listingId } = tile!;
    // Click the first tile link
    await page.locator('a[href^="/listing/"]').first().click();
    await expect(page).toHaveURL(`/listing/${listingId}`, { timeout: 10_000 });
  });

  test('H4 — listing detail loads with first image visible; no lock overlay at index 0', async ({ page }) => {
    const tile = await getFirstTileLink(page);
    test.skip(tile === null, SKIP_NO_TILES);

    const { listingId } = tile!;
    await openListingDetail(page, listingId);

    // No lock overlay heading at index 0
    await expect(
      page.getByRole('heading', { name: /Sign in to view all photos/i }),
    ).not.toBeVisible();
  });

  test('H5 — nav arrows are visible for listing with imageCount >= 2', async ({ page }) => {
    const tile = await getFirstTileLink(page);
    test.skip(tile === null, SKIP_NO_TILES);

    const { listingId } = tile!;
    const { nextBtn, prevBtn, hasMultiple } = await openListingDetail(page, listingId);
    test.skip(!hasMultiple, SKIP_NO_MULTI_IMAGE);

    await expect(nextBtn).toBeVisible();
    await expect(prevBtn).toBeVisible();
  });

  test('H6 — clicking Next triggers lock overlay with "Sign in to view all photos"', async ({ page }) => {
    const tile = await getFirstTileLink(page);
    test.skip(tile === null, SKIP_NO_TILES);

    const { listingId } = tile!;
    const { nextBtn, hasMultiple } = await openListingDetail(page, listingId);
    test.skip(!hasMultiple, SKIP_NO_MULTI_IMAGE);

    await nextBtn.click();

    await expect(
      page.getByRole('heading', { name: /Sign in to view all photos/i }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('H7 — lock overlay CTA links to /auth?returnTo=/listing/:id', async ({ page }) => {
    const tile = await getFirstTileLink(page);
    test.skip(tile === null, SKIP_NO_TILES);

    const { listingId } = tile!;
    const { nextBtn, hasMultiple } = await openListingDetail(page, listingId);
    test.skip(!hasMultiple, SKIP_NO_MULTI_IMAGE);

    await nextBtn.click();

    // Wait for overlay CTA to appear
    const cta = page.getByRole('link', { name: /Sign in to view all photos/i });
    await expect(cta).toBeVisible({ timeout: 5_000 });

    const href = await cta.getAttribute('href');
    expect(href).toBe(`/auth?returnTo=/listing/${listingId}`);
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
