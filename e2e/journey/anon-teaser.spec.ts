/**
 * Anonymous Teaser Discovery — AT1–AT4
 *
 * Covers the anonymous teaser discovery feature (#613–#617):
 *   AT1 — anon home: no redirect, landing page content visible
 *   AT2 — listing detail login gate: CTA has correct returnTo param
 *   AT3 — returnTo deep-link: login redirects back to listing
 *   AT4 — full unlock after login: redirected to /discover, anon CTA absent
 *
 * AT2/AT3/AT4 require SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD and a LIVE listing fixture.
 *
 * Run locally:
 *   SMOKE_USER_EMAIL=you@example.com SMOKE_USER_PASSWORD=secret npm run test:e2e -- e2e/journey/anon-teaser.spec.ts
 */

import { test, expect } from '@playwright/test';
import { hasRealCredentials } from '../helpers';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const userEmail = process.env.SMOKE_USER_EMAIL ?? '';
const userPassword = process.env.SMOKE_USER_PASSWORD ?? '';
const hasUserCreds = hasRealCredentials(userEmail, userPassword);

/**
 * Resolve the LIVE listing ID from the fixture file written by global-setup.
 * Priority:
 *   1. SMOKE_LISTING_ID env var
 *   2. e2e/.test-listing-id (first line = UUID, second line = status)
 *   3. Empty string → tests that need it will skip
 */
function getListingFixture(): { id: string; isLive: boolean } | null {
  if (process.env.SMOKE_LISTING_ID) {
    return { id: process.env.SMOKE_LISTING_ID, isLive: true };
  }
  const idFile = path.join(__dirname, '..', '.test-listing-id');
  if (!fs.existsSync(idFile)) return null;
  const lines = fs.readFileSync(idFile, 'utf-8').trim().split('\n');
  const id = lines[0]?.trim();
  if (!id) return null;
  return { id, isLive: lines[1]?.trim() === 'LIVE' };
}

const fixture = getListingFixture();

// ---------------------------------------------------------------------------
// AT1 — anon home: no redirect, landing page content visible
// ---------------------------------------------------------------------------
test('AT1 — anon home: no redirect, landing page content visible', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  // Must NOT redirect to /auth
  await expect(page).toHaveURL('/');

  // Hero headline from LandingPage.tsx — confirms the marketing page rendered
  await expect(
    page.locator('h1', { hasText: 'Find Your Perfect Home with Trust & Clarity' }),
  ).toBeVisible({ timeout: 10_000 });

  // "Explore on Map" hero CTA must be present and link to /discover
  await expect(
    page.locator('a[href="/discover"]').first(),
  ).toBeVisible({ timeout: 5_000 });
});

// ---------------------------------------------------------------------------
// AT2 — listing detail login gate: CTA has correct returnTo param
// ---------------------------------------------------------------------------
test('AT2 — listing detail: login gate CTA has correct returnTo', async ({ page }) => {
  test.skip(fixture === null, 'e2e/.test-listing-id not found — global-setup may have skipped');
  test.skip(!fixture!.isLive, 'Test listing is not LIVE — detail page requires LIVE status');

  const { id: listingId } = fixture!;

  await page.goto(`/listing/${listingId}`);
  await page.waitForLoadState('domcontentloaded');

  // Must NOT redirect away (listing detail is publicly accessible as teaser)
  await expect(page).toHaveURL(new RegExp(`/listing/${listingId}`));

  // Login gate text visible — ListingDetail.tsx:832 (<p> only; <Link> has same text, avoid strict-mode)
  await expect(
    page.locator('p', { hasText: 'Sign in to view full details' }),
  ).toBeVisible({ timeout: 10_000 });

  // CTA link must contain the correct returnTo param — ListingDetail.tsx:834
  const cta = page.locator(`a[href*="/auth?returnTo"]`).first();
  await expect(cta).toBeVisible({ timeout: 5_000 });
  const href = await cta.getAttribute('href');
  expect(href).toContain(`/auth?returnTo=/listing/${listingId}`);
});

// ---------------------------------------------------------------------------
// AT2b — anon: first image visible, image 2 blocked with locked overlay
// ---------------------------------------------------------------------------
test('AT2b — anon: first image visible, image 2 blocked with locked overlay', async ({ page }) => {
  test.skip(fixture === null, 'e2e/.test-listing-id not found — global-setup may have skipped');
  test.skip(!fixture!.isLive, 'Test listing is not LIVE');

  const { id: listingId } = fixture!;
  await page.goto(`/listing/${listingId}`);
  await page.waitForLoadState('domcontentloaded');

  // No lock overlay at index 0
  await expect(page.locator('text=Sign in to view all photos')).toHaveCount(0, { timeout: 5_000 });

  // Skip if listing has only one image — next button absent means no gallery to lock
  const nextBtn = page.getByRole('button', { name: /next image/i });
  const hasMultiple = await nextBtn.isVisible({ timeout: 3_000 }).catch(() => false);
  test.skip(!hasMultiple, 'Listing has only one image — gallery lock not testable');

  await nextBtn.click();
  await expect(page.locator('text=Sign in to view all photos')).toBeVisible({ timeout: 5_000 });
  const cta = page.locator(`a[href*="/auth?returnTo=/listing/${listingId}"]`).last();
  await expect(cta).toBeVisible();
});

// ---------------------------------------------------------------------------
// AT2c — logged-in: full gallery browsable
// ---------------------------------------------------------------------------
test.describe('AT2c — logged-in: full gallery browsable', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  test('logged-in user can navigate to image 2 without locked overlay', async ({ page }) => {
    test.skip(fixture === null, 'e2e/.test-listing-id not found — global-setup may have skipped');
    test.skip(!fixture!.isLive, 'Test listing is not LIVE');

    const { id: listingId } = fixture!;
    await page.goto(`/listing/${listingId}`);
    await page.waitForLoadState('domcontentloaded');

    const nextBtn = page.getByRole('button', { name: /next image/i });
    const hasMultiple = await nextBtn.isVisible({ timeout: 3_000 }).catch(() => false);
    test.skip(!hasMultiple, 'Listing has only one image — full gallery test not applicable');

    await nextBtn.click();
    await expect(page.locator('text=Sign in to view all photos')).toHaveCount(0, { timeout: 3_000 });
    await expect(page.getByRole('tab').first()).toBeVisible({ timeout: 3_000 });
  });
});

// ---------------------------------------------------------------------------
// AT3 — returnTo deep-link: login redirects back to listing
// ---------------------------------------------------------------------------
test('AT3 — returnTo deep-link: login redirects back to listing', async ({ page }) => {
  test.skip(!hasUserCreds, 'SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD not set — skipping AT3');
  test.skip(fixture === null, 'e2e/.test-listing-id not found — global-setup may have skipped');
  test.skip(!fixture!.isLive, 'Test listing is not LIVE — returnTo test requires LIVE status');

  const { id: listingId } = fixture!;

  // Navigate directly to /auth with returnTo set
  await page.goto(`/auth?returnTo=/listing/${listingId}`);
  await page.waitForLoadState('domcontentloaded');

  // Fill credentials and submit — same pattern as user-journeys.spec.ts
  await page.locator('#signin-email').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('#signin-email').fill(userEmail);
  await page.locator('#signin-password').fill(userPassword);
  await page
    .locator('button[type="submit"]')
    .filter({ hasText: /sign in/i })
    .first()
    .click();

  // Must leave /auth
  await expect(page).not.toHaveURL(/\/auth/, { timeout: 10_000 });

  // Must arrive at the listing detail page (Auth.tsx:45 reads safeReturnTo → redirects)
  await expect(page).toHaveURL(new RegExp(`/listing/${listingId}`), { timeout: 5_000 });
});

// ---------------------------------------------------------------------------
// AT4 — full unlock after login: redirected to /discover, anon CTA absent
// ---------------------------------------------------------------------------
test.describe('AT4 — user-authenticated', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  test('AT4 — full unlock after login: redirected to /discover, anon CTA absent', async ({ page }) => {
    test.skip(!hasUserCreds, 'SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD not set — skipping AT4');

    // Navigating to / while authenticated triggers LandingPage's redirect to /discover
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Authenticated users are redirected from / to /discover by LandingPage
    await page.waitForURL('/discover', { timeout: 10_000 });

    // Authenticated users get full listings with coordinates — map markers appear when data has coords.
    // In local environments the test listing has no lat/lon, so markers may not appear; don't fail.
    try {
      await page.waitForSelector('.leaflet-marker-icon', { timeout: 5_000 });
    } catch {
      // No markers — local DB listings lack coordinates. Anon CTA check below is the primary assertion.
    }

    // The anonymous-only CTA must not be present for an authenticated user
    await expect(
      page.locator('text=Sign in to see full details and contact brokers'),
    ).toHaveCount(0);
  });
});
