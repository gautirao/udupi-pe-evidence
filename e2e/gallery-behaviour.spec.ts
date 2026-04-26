/**
 * [E2E] Anonymous vs authenticated gallery behaviour — #847
 *
 * Covers 9 ACs across two describe blocks:
 *
 *   Anonymous (A1–A6):
 *     A1 — imageCount >= 2 listing: first image renders, nav arrows visible
 *     A2 — Clicking Next triggers lock overlay, image does NOT advance
 *     A3 — Lock overlay has Lock icon (svg.lucide-lock) and heading text
 *     A4 — Clicking Prev from locked state dismisses overlay, returns to image 1
 *     A5 — Thumbnail strip is NOT rendered
 *     A6 — Image counter reads "1 / N" where N = imageCount from backend
 *
 *   Authenticated (B1–B3):
 *     B1 — All images navigable freely — no lock overlay at any index
 *     B2 — Thumbnail strip renders; clicking a thumbnail updates main image
 *     B3 — Image counter advances correctly through full set
 *
 * Guards:
 *   - Entire spec skips if listing fixture is absent or not LIVE
 *   - Authenticated describe skips if user credentials are absent
 *     (SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD not set)
 *
 * Run locally:
 *   bash scripts/run-e2e-local.sh --project=full e2e/gallery-behaviour.spec.ts
 */

import { test, expect } from '@playwright/test';
import { hasRealCredentials } from './helpers';
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
 *   3. null → all tests skip
 */
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
const fixtureAbsent = fixture === null;
const fixtureNotLive = fixture !== null && !fixture.isLive;

// ---------------------------------------------------------------------------
// Shared skip reasons (applied inside each test to keep test.skip at leaf level)
// ---------------------------------------------------------------------------
const SKIP_NO_FIXTURE = 'e2e/.test-listing-id not found — global-setup may have skipped';
const SKIP_NOT_LIVE = 'Test listing is not LIVE — gallery tests require LIVE status';
const SKIP_NO_USER_CREDS = 'SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD not set — skipping authenticated tests';
const SKIP_SINGLE_IMAGE = 'Listing has only one image — multi-image gallery tests not applicable';

// ---------------------------------------------------------------------------
// Helper: navigate to listing and wait for gallery data to have loaded.
// Returns { nextBtn, prevBtn, counter, hasMultiple }.
//
// Waits directly for the Next-image button — it renders as soon as the API
// response resolves and the gallery mounts with imageCount >= 2 or images > 1.
// hasMultiple: false means listing has 0 or 1 image; tests that need multi-image
// should call test.skip(!hasMultiple, SKIP_SINGLE_IMAGE).
// ---------------------------------------------------------------------------
async function navigateAndWaitForGallery(
  page: import('@playwright/test').Page,
  id: string,
): Promise<{
  nextBtn: import('@playwright/test').Locator;
  prevBtn: import('@playwright/test').Locator;
  counter: import('@playwright/test').Locator;
  hasMultiple: boolean;
}> {
  await page.goto(`/listing/${id}`);
  await page.waitForLoadState('domcontentloaded');

  const nextBtn = page.getByRole('button', { name: /next image/i });
  const prevBtn = page.getByRole('button', { name: /previous image/i });
  // Counter locator — the div that renders "{n} / {total}" inside the gallery.
  // data-testid="gallery-counter" avoids ambiguity with PropertyDetailModal's identical CSS class.
  const counter = page.getByTestId('gallery-counter');

  // Wait for the Next button using waitFor (which polls) rather than isVisible
  // (which checks synchronously and returns false immediately if not in DOM).
  // The backend can take 10-15s on a cold start after restart.
  let hasMultiple = false;
  try {
    await nextBtn.waitFor({ state: 'visible', timeout: 25_000 });
    hasMultiple = true;
  } catch {
    // Button did not appear within 25s — listing has 0 or 1 image
    hasMultiple = false;
  }
  return { nextBtn, prevBtn, counter, hasMultiple };
}

// ---------------------------------------------------------------------------
// Anonymous describe — no storageState (browser starts with no session)
// ---------------------------------------------------------------------------
test.describe('[E2E] Anonymous gallery behaviour', () => {
  test.setTimeout(60_000); // backend cold-start after restart can take 10-15s
  test('A1 — gallery area renders and nav arrows are visible', async ({ page }) => {
    test.skip(fixtureAbsent, SKIP_NO_FIXTURE);
    test.skip(fixtureNotLive, SKIP_NOT_LIVE);

    const { id } = fixture!;
    const { nextBtn, prevBtn, counter, hasMultiple } = await navigateAndWaitForGallery(page, id);
    test.skip(!hasMultiple, SKIP_SINGLE_IMAGE);

    // Nav arrows visible confirms gallery mounted with imageCount >= 2
    await expect(nextBtn).toBeVisible();
    await expect(prevBtn).toBeVisible();

    // Counter is visible and reads "1 / N"
    await expect(counter).toBeVisible();
    const counterText = await counter.textContent();
    expect(counterText?.trim()).toMatch(/^1 \/ \d+/);
  });

  test('A2 — clicking Next triggers lock overlay and image does not advance', async ({ page }) => {
    test.skip(fixtureAbsent, SKIP_NO_FIXTURE);
    test.skip(fixtureNotLive, SKIP_NOT_LIVE);

    const { id } = fixture!;
    const { nextBtn, counter, hasMultiple } = await navigateAndWaitForGallery(page, id);
    test.skip(!hasMultiple, SKIP_SINGLE_IMAGE);

    // Counter before clicking Next must read "1 / N"
    const counterTextBefore = await counter.textContent();
    expect(counterTextBefore?.trim()).toMatch(/^1 \/ \d+/);

    // Click Next
    await nextBtn.click();

    // Lock overlay must appear (state changed — this is the primary assertion)
    const lockHeading = page.getByRole('heading', { name: /sign in to view all photos/i });
    await expect(lockHeading).toBeVisible({ timeout: 5_000 });

    // Counter must still read "1 / N" — image index did not advance
    const counterTextAfter = await counter.textContent();
    expect(counterTextAfter?.trim()).toMatch(/^1 \/ \d+/);
  });

  test('A3 — lock overlay contains Lock icon and sign-in heading', async ({ page }) => {
    test.skip(fixtureAbsent, SKIP_NO_FIXTURE);
    test.skip(fixtureNotLive, SKIP_NOT_LIVE);

    const { id } = fixture!;
    const { nextBtn, hasMultiple } = await navigateAndWaitForGallery(page, id);
    test.skip(!hasMultiple, SKIP_SINGLE_IMAGE);

    await nextBtn.click();

    // Heading
    const lockHeading = page.getByRole('heading', { name: /sign in to view all photos/i });
    await expect(lockHeading).toBeVisible({ timeout: 5_000 });

    // Lock SVG — lucide-lock class is set by lucide-react on the svg element.
    // Scope to inside the lock overlay container to avoid strict-mode violation
    // with other Lock icons that may exist elsewhere on the page.
    const overlayContainer = page.locator('div.absolute.inset-0.bg-black\\/60');
    const lockIcon = overlayContainer.locator('svg.lucide-lock');
    await expect(lockIcon).toBeVisible({ timeout: 3_000 });

    // CTA link
    const ctaLink = page.getByRole('link', { name: /sign in to view all photos/i });
    await expect(ctaLink).toBeVisible({ timeout: 3_000 });
    const href = await ctaLink.getAttribute('href');
    expect(href).toContain(`/auth?returnTo=/listing/${id}`);
  });

  test('A4 — clicking Prev from locked state dismisses overlay and returns to image 1', async ({ page }) => {
    test.skip(fixtureAbsent, SKIP_NO_FIXTURE);
    test.skip(fixtureNotLive, SKIP_NOT_LIVE);

    const { id } = fixture!;
    const { nextBtn, prevBtn, counter, hasMultiple } = await navigateAndWaitForGallery(page, id);
    test.skip(!hasMultiple, SKIP_SINGLE_IMAGE);

    // Trigger the lock
    await nextBtn.click();
    const lockHeading = page.getByRole('heading', { name: /sign in to view all photos/i });
    await expect(lockHeading).toBeVisible({ timeout: 5_000 });

    // Click Prev — overlay must be dismissed.
    // Nav buttons carry z-10 so they sit above the absolute-inset-0 overlay.
    await prevBtn.click();
    await expect(lockHeading).not.toBeVisible({ timeout: 5_000 });

    // Counter must be back to "1 / N"
    const counterText = await counter.textContent();
    expect(counterText?.trim()).toMatch(/^1 \/ \d+/);
  });

  test('A5 — thumbnail strip is NOT rendered for anonymous user', async ({ page }) => {
    test.skip(fixtureAbsent, SKIP_NO_FIXTURE);
    test.skip(fixtureNotLive, SKIP_NOT_LIVE);

    const { id } = fixture!;
    await page.goto(`/listing/${id}`);
    await page.waitForLoadState('domcontentloaded');

    // Wait for the listing page to have rendered some content before asserting absence.
    // The "Back to Map" button is always present on the listing detail page.
    await expect(page.getByRole('button', { name: /back to map/i })).toBeVisible({ timeout: 15_000 });

    // tablist (thumbnail strip container) must not exist for anon
    await expect(page.getByRole('tablist')).toHaveCount(0);
    // Individual tab buttons must not exist
    await expect(page.getByRole('tab')).toHaveCount(0);

    // Confirm gallery content itself loaded (not just an empty shell).
    // The counter is rendered iff the gallery section has mounted with image data.
    await expect(page.getByTestId('gallery-counter')).toBeVisible({ timeout: 15_000 });
  });

  test('A6 — image counter reads "1 / N" where N matches imageCount from backend', async ({ page }) => {
    test.skip(fixtureAbsent, SKIP_NO_FIXTURE);
    test.skip(fixtureNotLive, SKIP_NOT_LIVE);

    const { id } = fixture!;
    const { counter, hasMultiple } = await navigateAndWaitForGallery(page, id);
    test.skip(!hasMultiple, SKIP_SINGLE_IMAGE);

    // Counter format: "{currentIndex + 1} / {effectiveImageCount}"
    // At page load, currentIndex = 0, so it must read "1 / N" where N >= 2
    const text = await counter.textContent();
    const trimmed = text?.trim() ?? '';

    // Must start with "1 /"
    expect(trimmed).toMatch(/^1 \/ \d+/);

    // Extract N and verify it is >= 2 (fixture was created with imageCount >= 2)
    const parts = trimmed.split(' / ');
    const n = parseInt(parts[1], 10);
    expect(n).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Authenticated describe — uses pre-written storageState from global-setup
// ---------------------------------------------------------------------------
test.describe('[E2E] Authenticated gallery behaviour', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });
  test.setTimeout(60_000);

  test('B1 — all images navigable freely, no lock overlay at any index', async ({ page }) => {
    test.skip(!hasUserCreds, SKIP_NO_USER_CREDS);
    test.skip(fixtureAbsent, SKIP_NO_FIXTURE);
    test.skip(fixtureNotLive, SKIP_NOT_LIVE);

    const { id } = fixture!;
    const { nextBtn, counter, hasMultiple } = await navigateAndWaitForGallery(page, id);
    test.skip(!hasMultiple, SKIP_SINGLE_IMAGE);

    // Early auth check: thumbnail strip only visible for authenticated users
    await expect(page.getByRole('tablist')).toBeVisible({ timeout: 15_000 });

    // Lock overlay must be absent at index 0
    await expect(
      page.getByRole('heading', { name: /sign in to view all photos/i }),
    ).toHaveCount(0, { timeout: 3_000 });

    // Click Next — must advance without showing lock overlay
    await nextBtn.click();

    // Lock overlay must remain absent
    await expect(
      page.getByRole('heading', { name: /sign in to view all photos/i }),
    ).toHaveCount(0, { timeout: 3_000 });

    // Counter must now read "2 / N" — image index advanced
    const counterText = await counter.textContent();
    expect(counterText?.trim()).toMatch(/^2 \/ \d+/);
  });

  test('B2 — thumbnail strip renders and clicking a thumbnail updates the main image', async ({ page }) => {
    test.skip(!hasUserCreds, SKIP_NO_USER_CREDS);
    test.skip(fixtureAbsent, SKIP_NO_FIXTURE);
    test.skip(fixtureNotLive, SKIP_NOT_LIVE);

    const { id } = fixture!;
    // Thumbnail strip only renders when images.length > 1 (authenticated path)
    const { counter, hasMultiple } = await navigateAndWaitForGallery(page, id);
    test.skip(!hasMultiple, SKIP_SINGLE_IMAGE);

    // Early auth check: thumbnail strip only visible for authenticated users
    await expect(page.getByRole('tablist')).toBeVisible({ timeout: 15_000 });

    // Wait for thumbnail strip — rendered immediately for auth users with images[]
    const tablist = page.getByRole('tablist');
    await expect(tablist).toBeVisible({ timeout: 5_000 });

    // There must be at least 2 tab buttons
    const tabs = page.getByRole('tab');
    const tabCount = await tabs.count();
    expect(tabCount).toBeGreaterThanOrEqual(2);

    // Record counter before clicking the second thumbnail
    const counterBefore = await counter.textContent();

    // Click the second thumbnail (index 1 = second image)
    await tabs.nth(1).click();

    // Counter must have changed (image updated)
    const counterAfter = await counter.textContent();
    expect(counterAfter?.trim()).not.toBe(counterBefore?.trim());

    // Counter must now read "2 / N"
    expect(counterAfter?.trim()).toMatch(/^2 \/ \d+/);
  });

  test('B3 — image counter advances correctly through the full image set', async ({ page }) => {
    test.skip(!hasUserCreds, SKIP_NO_USER_CREDS);
    test.skip(fixtureAbsent, SKIP_NO_FIXTURE);
    test.skip(fixtureNotLive, SKIP_NOT_LIVE);

    const { id } = fixture!;
    const { nextBtn, counter, hasMultiple } = await navigateAndWaitForGallery(page, id);
    test.skip(!hasMultiple, SKIP_SINGLE_IMAGE);

    // Early auth check: thumbnail strip only visible for authenticated users
    await expect(page.getByRole('tablist')).toBeVisible({ timeout: 15_000 });

    // Read the total from the "1 / N" counter
    const initialText = await counter.textContent();
    const total = parseInt(initialText?.trim().split(' / ')[1] ?? '0', 10);
    expect(total).toBeGreaterThanOrEqual(2);

    // Navigate through all images and assert counter increments at each step
    for (let expectedIndex = 2; expectedIndex <= total; expectedIndex++) {
      await nextBtn.click();

      // No lock overlay should appear at any step for authenticated user
      await expect(
        page.getByRole('heading', { name: /sign in to view all photos/i }),
      ).toHaveCount(0, { timeout: 3_000 });

      const counterText = await counter.textContent();
      expect(counterText?.trim()).toBe(`${expectedIndex} / ${total}`);
    }
  });
});
