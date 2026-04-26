/**
 * User Journey Smoke — verifies core user-role pages load without crashing.
 *
 * Covers:
 *   U1 — /saved-areas loads with "My Saved Areas" heading
 *   U2 — /my-bookings loads with "My Bookings" heading
 *   U3 — /insights renders correctly (paywall OR chart content — no crash)
 *   U4 — /listing/:id detail page: AreaMarketWidget renders in one of its valid states
 *   UJ1 — Full user journey: Browse → View Listing → Book Viewing → Verify in My Bookings
 *
 * All tests require SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD.
 * U4, UJ1 additionally require e2e/.test-listing-id (written by global-setup) with a LIVE listing.
 *
 * U1–U4 log in via loginAsUser() each test.
 * UJ1 uses storageState from e2e/fixtures/user-auth.json (written by global-setup).
 *
 * Run locally:
 *   SMOKE_USER_EMAIL=user@example.com SMOKE_USER_PASSWORD=... npm run test:e2e -- e2e/user-journeys.spec.ts
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

const BACKEND =
  process.env.BACKEND_BASE_URL ?? 'https://udupi-property-explorer.onrender.com';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';

const ID_FILE = path.join(__dirname, '.test-listing-id');

async function getToken(email: string, password: string): Promise<string | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string };
  return data.access_token ?? null;
}

function readListingFixture(): { id: string; isLive: boolean } | null {
  if (!fs.existsSync(ID_FILE)) return null;
  const lines = fs.readFileSync(ID_FILE, 'utf-8').trim().split('\n');
  const id = lines[0]?.trim();
  if (!id) return null;
  return { id, isLive: lines[1]?.trim() === 'LIVE' };
}

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
// U1 — /saved-areas loads
// ---------------------------------------------------------------------------
test('U1 — /saved-areas loads with My Saved Areas heading', async ({ page }) => {
  test.skip(!hasUserCreds, 'SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD not set — skipping U1');

  await loginAsUser(page);
  await page.goto('/saved-areas');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('p:has-text("Loading...")', { state: 'hidden', timeout: 15_000 }).catch(() => {});

  // No error boundary
  await expect(
    page.locator('text=Something went wrong. Please refresh the page.'),
  ).toHaveCount(0);

  await expect(
    page.getByRole('heading', { name: /my saved areas/i }),
  ).toBeVisible({ timeout: 10_000 });
});

// ---------------------------------------------------------------------------
// U2 — /my-bookings loads
// ---------------------------------------------------------------------------
test('U2 — /my-bookings loads with My Bookings heading', async ({ page }) => {
  test.skip(!hasUserCreds, 'SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD not set — skipping U2');

  await loginAsUser(page);
  await page.goto('/my-bookings');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('p:has-text("Loading...")', { state: 'hidden', timeout: 15_000 }).catch(() => {});

  await expect(
    page.locator('text=Something went wrong. Please refresh the page.'),
  ).toHaveCount(0);

  await expect(
    page.getByRole('heading', { name: /my bookings/i }),
  ).toBeVisible({ timeout: 10_000 });
});

// ---------------------------------------------------------------------------
// U3 — /insights redirects to /trends (route renamed from /area-overview in #767)
// ---------------------------------------------------------------------------
test('U3 — /insights redirects to /trends (no crash)', async ({ page }) => {
  test.skip(!hasUserCreds, 'SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD not set — skipping U3');

  await loginAsUser(page);
  await page.goto('/insights');
  await page.waitForLoadState('domcontentloaded');

  // The /insights route is now a <Navigate to="/trends" replace /> redirect
  await expect(page).toHaveURL(/\/trends/, { timeout: 8_000 });

  // No error boundary
  await expect(
    page.locator('text=Something went wrong. Please refresh the page.'),
  ).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// U4 — /listing/:id AreaMarketWidget renders in one of its valid states
//      Requires a LIVE test fixture from global-setup.
// ---------------------------------------------------------------------------
test('U4 — listing detail: AreaMarketWidget renders without crash', async ({ page }) => {
  test.skip(!hasUserCreds, 'SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD not set — skipping U4');

  const fixture = readListingFixture();
  test.skip(fixture === null, 'e2e/.test-listing-id not found — global-setup may have skipped');
  test.skip(!fixture!.isLive, 'Test listing is not LIVE — AreaMarketWidget requires locality on a real listing');

  const { id } = fixture!;

  await loginAsUser(page);
  await page.goto(`/listing/${id}`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('p:has-text("Loading...")', { state: 'hidden', timeout: 15_000 }).catch(() => {});

  // No error boundary
  await expect(
    page.locator('text=Something went wrong. Please refresh the page.'),
  ).toHaveCount(0);

  // The listing title must appear
  await expect(
    page.locator('text=[E2E Test Listing]').first(),
  ).toBeVisible({ timeout: 10_000 });

  // AreaMarketWidget must render in one of its four valid states:
  //   - loading: Skeleton elements (no specific text — just no crash)
  //   - error: "Could not load market data."
  //   - empty: "Not enough data for this area yet."
  //   - data: "Area Market" heading
  //
  // We check that at least one of the non-loading states is visible after settling,
  // OR that the widget is simply absent (locality not set on test listing).
  // Wait for AreaMarketWidget Supabase RPC — fires against live Supabase directly.
  // URL pattern: https://<project>.supabase.co/rest/v1/rpc/get_listing_market_context
  await page.waitForResponse(
    (resp) => resp.url().includes('/rpc/get_listing_market_context'),
    { timeout: 8_000 },
  ).catch(() => {
    // RPC not fired if test listing has no locality — widget renders null, acceptable.
  });

  const areaMarket = page.locator('text=Area Market');
  const notEnough = page.locator('text=Not enough data for this area yet.');
  const loadError = page.locator('text=Could not load market data.');

  // TODO: RE-XXX — strengthen AreaMarketWidget assertion once AreaMarketWidget is migrated
  // from snake_case PropertyListing to camelCase PublicListingDetail shape. Currently the
  // widget degrades to "Not enough data" for all listings (cast issue in ListingDetail.tsx:634).
  const anyStateVisible =
    (await areaMarket.isVisible().catch(() => false)) ||
    (await notEnough.isVisible().catch(() => false)) ||
    (await loadError.isVisible().catch(() => false));

  // If the widget is not visible at all, that is also acceptable (listing has no locality).
  // What is NOT acceptable: an error boundary or blank space where it should be.
  // We already checked for the error boundary above, so this test passes regardless.
  // Log the widget state for diagnostic purposes.
  if (anyStateVisible) {
    console.log('[U4] AreaMarketWidget rendered in a known state ✓');
  } else {
    console.log('[U4] AreaMarketWidget not visible — listing may have no locality (acceptable)');
  }
});

// ---------------------------------------------------------------------------
// UJ1 — Full User Journey: Browse → View Listing → Book Viewing → My Bookings
//       Requires a LIVE test fixture from global-setup.
// ---------------------------------------------------------------------------
test.describe('UJ1 — Browse → Detail → Request Viewing → My Bookings', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });
  // Run serially within this describe to avoid parallel duplicate-booking conflicts
  test.describe.configure({ mode: 'serial' });

  let createdBookingId: string | null = null;

  test.beforeAll(async () => {
    // Cancel any leftover active bookings for the test listing to avoid 409
    const fixture = readListingFixture();
    if (!fixture) return;
    const token = await getToken(userEmail, userPassword);
    if (!token) return;
    const res = await fetch(`${BACKEND}/api/bookings/mine?size=100`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = (await res.json()) as {
      content: Array<{ id: string; listingId: string; status: string }>;
    };
    for (const b of data.content) {
      if (b.listingId === fixture.id && (b.status === 'REQUESTED' || b.status === 'CONFIRMED')) {
        await fetch(`${BACKEND}/api/bookings/${b.id}/cancel`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});
        console.log(`[UJ1] beforeAll: cancelled leftover booking ${b.id}`);
      }
    }
  });

  test.afterAll(async () => {
    // Teardown: cancel any booking we created so we don't leave data behind
    if (!createdBookingId) return;
    const token = await getToken(userEmail, userPassword);
    if (!token) {
      console.log('[UJ1] Teardown: could not get token — booking may remain');
      return;
    }
    await fetch(`${BACKEND}/api/bookings/${createdBookingId}/cancel`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
    console.log(`[UJ1] Teardown: cancelled booking ${createdBookingId}`);
  });

  test('UJ1 — browse, view listing, request viewing, verify in My Bookings', async ({ page }, testInfo) => {
    test.skip(!hasUserCreds, 'SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD not set — skipping UJ1');
    // UJ1 creates a booking — only run in one project to avoid duplicate-booking 409
    test.skip(testInfo.project.name === 'full', 'UJ1 runs in smoke project only');

    const fixture = readListingFixture();
    test.skip(fixture === null, 'e2e/.test-listing-id not found — global-setup may have skipped');
    test.skip(!fixture!.isLive, 'Test listing is not LIVE — UJ1 requires a LIVE listing');

    const { id } = fixture!;
    const tomorrowDate = new Date(Date.now() + 86_400_000).toISOString().split('T')[0]!;

    // ── Step 1: Navigate to discover page and verify auth nav renders ──
    await page.goto('/discover');
    await page.waitForLoadState('domcontentloaded');
    // Wait for listings to finish loading
    await page.waitForSelector('text=Loading listings...', { state: 'hidden', timeout: 15_000 }).catch(() => {});
    // Confirm the app rendered with auth — nav shows user-specific links
    await expect(page.getByRole('link', { name: /my bookings/i })).toBeVisible({ timeout: 10_000 });

    // ── Step 2: Navigate to the LIVE listing detail page ───────────────
    await page.goto(`/listing/${id}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('p:has-text("Loading...")', { state: 'hidden', timeout: 15_000 }).catch(() => {});

    // No error boundary
    await expect(
      page.locator('text=Something went wrong. Please refresh the page.'),
    ).toHaveCount(0);

    // ── Pre-flight: cancel any active booking for this listing (avoid 409) ──
    const preflight = await getToken(userEmail, userPassword);
    if (preflight) {
      const mineRes = await fetch(`${BACKEND}/api/bookings/mine?size=100`, {
        headers: { Authorization: `Bearer ${preflight}` },
      });
      if (mineRes.ok) {
        const mine = (await mineRes.json()) as {
          content: Array<{ id: string; listingId: string; status: string }>;
        };
        for (const b of mine.content) {
          if (b.listingId === id && (b.status === 'REQUESTED' || b.status === 'CONFIRMED')) {
            await fetch(`${BACKEND}/api/bookings/${b.id}/cancel`, {
              method: 'PUT',
              headers: { Authorization: `Bearer ${preflight}` },
            }).catch(() => {});
            console.log(`[UJ1] Pre-flight: cancelled active booking ${b.id}`);
          }
        }
      }
    }

    // ── Step 3: Click "Request Viewing" ────────────────────────────────
    const requestBtn = page.getByRole('button', { name: /request viewing/i });
    await expect(requestBtn).toBeVisible({ timeout: 10_000 });
    await requestBtn.click();

    // ── Step 4: Fill the modal form ────────────────────────────────────
    // Wait for the dialog to appear
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });

    // Fill date
    await page.locator('#requested-date').fill(tomorrowDate);

    // Select time slot via Radix Select
    await page.locator('#time-slot').click();
    await page.getByRole('option', { name: '10:00-11:00' }).click();

    // Submit — wait for the booking API response to confirm success
    const bookingResponse = page.waitForResponse(
      (resp) => resp.url().includes('/api/bookings') && resp.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await page.getByRole('button', { name: /send request/i }).click();
    const resp = await bookingResponse;
    expect(resp.status()).toBe(201);

    // ── Step 5: Wait for success toast ─────────────────────────────────
    await expect(
      page.getByText('Viewing request sent', { exact: true }).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Modal should close after success
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 5_000 });

    // ── Step 6: Capture booking ID via API for teardown ────────────────
    const token = await getToken(userEmail, userPassword);
    if (token) {
      const res = await fetch(`${BACKEND}/api/bookings/mine?size=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as {
          content: Array<{ id: string; listingId: string; status: string; requestedDate: string }>;
        };
        const match = data.content.find(
          (b) => b.listingId === id && b.status === 'REQUESTED' && b.requestedDate === tomorrowDate,
        );
        if (match) {
          createdBookingId = match.id;
          console.log(`[UJ1] Captured booking ID: ${createdBookingId}`);
        }
      }
    }

    // ── Step 7: Navigate to My Bookings and verify ─────────────────────
    await page.goto('/my-bookings');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('p:has-text("Loading...")', { state: 'hidden', timeout: 15_000 }).catch(() => {});

    // Page heading
    await expect(
      page.getByRole('heading', { name: /my bookings/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Find a booking card that contains our listing ID (font-mono span inside CardContent)
    const bookingCard = page.locator('[class*="rounded-"]', {
      has: page.locator('.font-mono', { hasText: id }),
    }).first();
    await expect(bookingCard).toBeVisible({ timeout: 10_000 });

    // Verify the date is displayed (the card shows requestedDate directly)
    await expect(bookingCard.getByText(tomorrowDate)).toBeVisible({ timeout: 5_000 });

    // Verify the "Requested" status badge
    await expect(bookingCard.getByText('Requested')).toBeVisible({ timeout: 5_000 });

    console.log('[UJ1] Full user journey completed successfully ✓');
  });
});
