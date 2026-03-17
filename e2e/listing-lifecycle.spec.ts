/**
 * Listing Lifecycle Smoke — automated with Playwright (real Chromium)
 *
 * Depends on e2e/global-setup.ts having created a test listing and written
 * its ID (and optional LIVE status) to e2e/.test-listing-id.
 *
 * All tests skip gracefully when prerequisites are not met so the suite
 * remains green in CI environments where creds are absent.
 *
 * Tests:
 *   L1 — created listing appears in broker /broker/listings page
 *   L2 — listing detail page loads without error
 *   L3 — "Request Viewing" button visible when listing is LIVE
 *   L4 — duplicate booking is rejected with 409
 */

import { test, expect } from '@playwright/test';
import { hasRealCredentials } from './helpers';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const ID_FILE = path.join(__dirname, '.test-listing-id');

interface ListingFixture {
  id: string;
  isLive: boolean;
}

/**
 * Read e2e/.test-listing-id.
 * Returns null if the file does not exist or is malformed.
 *   Line 1: UUID
 *   Line 2 (optional): "LIVE" or "DRAFT"
 */
function readListingFixture(): ListingFixture | null {
  if (!fs.existsSync(ID_FILE)) return null;
  const lines = fs.readFileSync(ID_FILE, 'utf-8').trim().split('\n');
  const id = lines[0]?.trim();
  if (!id) return null;
  const isLive = lines[1]?.trim() === 'LIVE';
  return { id, isLive };
}

const BACKEND =
  process.env.BACKEND_BASE_URL ?? 'https://udupi-property-explorer.onrender.com';

const dealerEmail    = process.env.BROKER_EMAIL    ?? process.env.DEALER_EMAIL    ?? '';
const dealerPassword = process.env.BROKER_PASSWORD ?? process.env.DEALER_PASSWORD ?? '';
const userEmail = process.env.SMOKE_USER_EMAIL ?? '';
const userPassword = process.env.SMOKE_USER_PASSWORD ?? '';

const hasDealerCreds = hasRealCredentials(dealerEmail, dealerPassword);
const hasUserCreds = hasRealCredentials(userEmail, userPassword);

/** Log in as dealer via the UI and wait for redirect away from /auth. */
async function loginAsDealer(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/auth');
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#signin-email').fill(dealerEmail);
  await page.locator('#signin-password').fill(dealerPassword);
  await page
    .locator('button[type="submit"]')
    .filter({ hasText: /sign in/i })
    .first()
    .click();
  await expect(page).not.toHaveURL(/\/auth/, { timeout: 10_000 });
}

/** Log in as the smoke-test user via the UI and wait for redirect away from /auth. */
async function loginAsUser(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/auth');
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#signin-email').fill(userEmail);
  await page.locator('#signin-password').fill(userPassword);
  await page
    .locator('button[type="submit"]')
    .filter({ hasText: /sign in/i })
    .first()
    .click();
  await expect(page).not.toHaveURL(/\/auth/, { timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// L1 — Created listing appears in broker /broker/listings page
// ---------------------------------------------------------------------------
test('L1 — created listing appears in broker /broker/listings', async ({ page }) => {
  test.skip(
    !hasDealerCreds,
    'BROKER_EMAIL / DEALER_EMAIL / DEALER_PASSWORD not set — skipping L1',
  );

  const fixture = readListingFixture();
  test.skip(
    fixture === null,
    'e2e/.test-listing-id not found — global-setup may have skipped listing creation',
  );

  // TypeScript narrowing: fixture is non-null after the skip above
  const { id } = fixture!;

  await loginAsDealer(page);
  await page.goto('/dealer/listings');
  await page.waitForLoadState('domcontentloaded');

  await expect(page).toHaveURL(/\/dealer\/listings/, { timeout: 8_000 });

  // ProtectedRoute shows a "Loading..." paragraph while Supabase auth resolves.
  // Wait for it to disappear before asserting listing content.
  await page.waitForSelector('p:has-text("Loading...")', { state: 'hidden', timeout: 15_000 }).catch(() => {});
  // Then wait for the listings API fetch to settle.
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

  // The listing card must contain either the UUID or the test title substring.
  // Try the UUID first (most reliable), fall back to the title text.
  const byId = page.locator(`text=${id}`);
  const byTitle = page.locator('text=[E2E Test Listing]');

  const idVisible = await byId.isVisible().catch(() => false);
  const titleVisible = await byTitle.first().isVisible().catch(() => false);

  if (!idVisible && !titleVisible) {
    throw new Error(
      `L1: Neither the listing ID (${id}) nor the test title was visible on /broker/listings`,
    );
  }
});

// ---------------------------------------------------------------------------
// L2 — Listing detail page loads without an error banner
// ---------------------------------------------------------------------------
test('L2 — listing detail page loads without error', async ({ page }) => {
  const fixture = readListingFixture();
  test.skip(
    fixture === null,
    'e2e/.test-listing-id not found — global-setup may have skipped listing creation',
  );
  test.skip(
    !hasDealerCreds,
    'BROKER_EMAIL / DEALER_EMAIL / DEALER_PASSWORD not set — /listing/:id requires auth; skipping L2',
  );

  const { id } = fixture!;

  // /listing/:id is a ProtectedRoute — must be logged in before navigating.
  await loginAsDealer(page);
  await page.goto(`/listing/${id}`);
  await page.waitForLoadState('domcontentloaded');

  // Wait for ProtectedRoute auth check and page data to load.
  await page.waitForSelector('p:has-text("Loading...")', { state: 'hidden', timeout: 15_000 }).catch(() => {});

  // No Sentry/error boundary banner
  await expect(
    page.locator('text=Something went wrong. Please refresh the page.'),
  ).toHaveCount(0);

  // The listing title substring must appear somewhere in the page
  await expect(
    page.locator('text=[E2E Test Listing]').first(),
  ).toBeVisible({ timeout: 10_000 });
});

// ---------------------------------------------------------------------------
// L3 — "Request Viewing" button visible when listing is LIVE
// ---------------------------------------------------------------------------
test('L3 — Request Viewing button visible for a LIVE listing', async ({ page }) => {
  const fixture = readListingFixture();
  test.skip(
    fixture === null,
    'e2e/.test-listing-id not found — global-setup may have skipped listing creation',
  );
  test.skip(
    !fixture!.isLive,
    'Listing is not LIVE (admin creds absent or approve failed) — skipping L3',
  );

  test.skip(
    !hasUserCreds,
    'SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD not set — /listing/:id requires auth; skipping L3',
  );

  const { id } = fixture!;

  // /listing/:id is a ProtectedRoute — must be logged in before navigating.
  // Log in as user (not dealer — "Request Viewing" is for non-dealer users).
  await loginAsUser(page);
  await page.goto(`/listing/${id}`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('p:has-text("Loading...")', { state: 'hidden', timeout: 15_000 }).catch(() => {});

  await expect(
    page.getByRole('button', { name: /request viewing/i }),
  ).toBeVisible({ timeout: 10_000 });
});

// ---------------------------------------------------------------------------
// L4 — Duplicate booking is rejected (replaces Q7's dependency on SMOKE_LISTING_ID)
// ---------------------------------------------------------------------------
test('L4 — duplicate booking request is rejected with 409', async ({ page }) => {
  const fixture = readListingFixture();
  test.skip(
    fixture === null,
    'e2e/.test-listing-id not found — global-setup may have skipped listing creation',
  );
  test.skip(
    !fixture!.isLive,
    'Listing is not LIVE — bookings require an approved listing; skipping L4',
  );
  test.skip(
    !hasUserCreds,
    'SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD not set — skipping L4',
  );

  const { id: listingId } = fixture!;

  // Log in as user (bookings are made by regular users, not dealers)
  await loginAsUser(page);

  // Navigate to the listing so the browser context is on the same origin
  await page.goto(`/listing/${listingId}`);
  await page.waitForLoadState('domcontentloaded');

  // First booking — must succeed (201) or already exist (409 from a prior run)
  const firstResult = await page.evaluate(
    async ({ backendUrl, lid }: { backendUrl: string; lid: string }) => {
      const keys = Object.keys(localStorage);
      const authKey = keys.find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
      if (!authKey) return { status: null, error: 'No Supabase auth token in localStorage' };

      let token: string | null = null;
      try {
        const parsed = JSON.parse(localStorage.getItem(authKey) ?? '{}') as { access_token?: string };
        token = parsed.access_token ?? null;
      } catch {
        return { status: null, error: 'Failed to parse auth token' };
      }
      if (!token) return { status: null, error: 'access_token is null' };

      const d = new Date();
      d.setDate(d.getDate() + 2);
      const requestedDate = d.toISOString().split('T')[0];

      try {
        const r = await fetch(`${backendUrl}/api/bookings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ listingId: lid, requestedDate, requestedTimeSlot: '10:00-11:00' }),
        });
        return { status: r.status, error: null };
      } catch (e) {
        return { status: null, error: String(e) };
      }
    },
    { backendUrl: BACKEND, lid: listingId },
  );

  if (firstResult.error) {
    throw new Error(`L4: First booking request threw: ${firstResult.error}`);
  }
  expect(
    [201, 409],
    `L4: Expected 201 or 409 from first booking, got ${firstResult.status}`,
  ).toContain(firstResult.status);

  // Second booking on the same listing — must be rejected with 409
  const secondResult = await page.evaluate(
    async ({ backendUrl, lid }: { backendUrl: string; lid: string }) => {
      const keys = Object.keys(localStorage);
      const authKey = keys.find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
      if (!authKey) return { status: null, error: 'No Supabase auth token' };

      let token: string | null = null;
      try {
        const parsed = JSON.parse(localStorage.getItem(authKey) ?? '{}') as { access_token?: string };
        token = parsed.access_token ?? null;
      } catch {
        return { status: null, error: 'Failed to parse auth token' };
      }
      if (!token) return { status: null, error: 'access_token is null' };

      const d = new Date();
      d.setDate(d.getDate() + 3); // different date, same listing
      const requestedDate = d.toISOString().split('T')[0];

      try {
        const r = await fetch(`${backendUrl}/api/bookings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ listingId: lid, requestedDate, requestedTimeSlot: '11:00-12:00' }),
        });
        return { status: r.status, error: null };
      } catch (e) {
        return { status: null, error: String(e) };
      }
    },
    { backendUrl: BACKEND, lid: listingId },
  );

  if (secondResult.error) {
    throw new Error(`L4: Second booking request threw: ${secondResult.error}`);
  }
  expect(
    secondResult.status,
    `L4: Expected 409 (duplicate active booking) from second request, got ${secondResult.status}`,
  ).toBe(409);
});
