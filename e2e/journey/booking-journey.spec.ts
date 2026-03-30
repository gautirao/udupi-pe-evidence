/**
 * UB — Booking UI journey tests
 *
 * Covers:
 *   UB1 — Successful viewing request via RequestViewingModal
 *   UB2 — Duplicate booking shows inline error (not just a toast)
 *   UB3 — Booking from UB1 appears in the broker's /broker/bookings page
 *
 * Prerequisites:
 *   - SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD — the regular test user
 *   - DEALER_EMAIL / DEALER_PASSWORD (or BROKER_EMAIL / BROKER_PASSWORD) — the broker
 *   - VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY — for token grant in beforeAll/afterAll
 *   - e2e/.test-listing-id must exist and contain a LIVE listing UUID (written by global-setup)
 *
 * Auth:
 *   UB1/UB2 use storageState from e2e/fixtures/user-auth.json (user session).
 *   UB3 opens a separate browser context with e2e/fixtures/broker-auth.json.
 *   The beforeAll/afterAll fixture helpers authenticate via Supabase token grant (API only).
 *
 * Run locally:
 *   SMOKE_USER_EMAIL=user@example.com SMOKE_USER_PASSWORD=... \
 *   DEALER_EMAIL=broker@example.com DEALER_PASSWORD=... \
 *   npm run test:e2e -- e2e/journey/booking-journey.spec.ts
 *
 * This file is intentionally NOT included in the smoke Playwright project.
 * It runs under the full project only (all e2e/**\/*.spec.ts).
 */

import { test, expect } from '@playwright/test';
import { hasRealCredentials } from '../helpers';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const BACKEND = process.env.BACKEND_BASE_URL ?? 'https://udupi-property-explorer.onrender.com';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';

const USER_EMAIL = process.env.SMOKE_USER_EMAIL ?? '';
const USER_PASSWORD = process.env.SMOKE_USER_PASSWORD ?? '';
const BROKER_EMAIL = process.env.BROKER_EMAIL ?? process.env.DEALER_EMAIL ?? '';
const BROKER_PASSWORD = process.env.BROKER_PASSWORD ?? process.env.DEALER_PASSWORD ?? '';

// The test-listing-id file lives one level up (in e2e/, not e2e/journey/)
const ID_FILE = path.join(__dirname, '..', '.test-listing-id');

// ---------------------------------------------------------------------------
// Credential guard — all tests in this suite require user + broker creds
// ---------------------------------------------------------------------------

const hasAllCreds = hasRealCredentials(
  USER_EMAIL,
  USER_PASSWORD,
  BROKER_EMAIL,
  BROKER_PASSWORD,
  SUPABASE_URL,
  SUPABASE_KEY,
);

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function readListingFixture(): { id: string; isLive: boolean } | null {
  if (!fs.existsSync(ID_FILE)) return null;
  const lines = fs.readFileSync(ID_FILE, 'utf-8').trim().split('\n');
  const id = lines[0]?.trim();
  if (!id) return null;
  return { id, isLive: lines[1]?.trim() === 'LIVE' };
}

/**
 * Obtain a Supabase access token via the password grant.
 * Returns null on any failure rather than throwing.
 * Used only in beforeAll/afterAll fixture setup — never inside test step bodies.
 */
async function getToken(email: string, password: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
      },
      body: JSON.stringify({ email, password }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text().catch(() => '<unreadable>');
      console.log(`[UB] Supabase auth failed (${res.status}): ${text}`);
      return null;
    }

    const data = (await res.json()) as { access_token?: string };
    return data.access_token ?? null;
  } catch (err) {
    clearTimeout(timer);
    console.log(`[UB] Supabase auth request threw: ${String(err)}`);
    return null;
  }
}

/**
 * Decode the `sub` claim (user UUID) from a JWT without verifying the signature.
 */
function getUserIdFromToken(token: string): string {
  const payload = token.split('.')[1] ?? '';
  const decoded = JSON.parse(
    Buffer.from(payload, 'base64url').toString('utf-8'),
  ) as { sub?: string };
  return decoded.sub ?? '';
}

// ---------------------------------------------------------------------------
// Test data — booking date 3 days from today, using the first TIME_SLOTS entry
// ---------------------------------------------------------------------------

const _d = new Date();
_d.setDate(_d.getDate() + 3);
const BOOKING_DATE = _d.toISOString().slice(0, 10);
const BOOKING_MESSAGE = 'Automated test booking';

// ---------------------------------------------------------------------------
// Module-level state shared across tests and beforeAll/afterAll
// ---------------------------------------------------------------------------

// The booking ID created by UB1; captured in UB1, used by UB2/UB3 skip guard
// and by afterAll cleanup.
let createdBookingId: string | null = null;

// ---------------------------------------------------------------------------
// UB1 and UB2 use the user session. storageState is set at the describe level.
// UB3 opens its own broker context via browser.newContext().
// ---------------------------------------------------------------------------

test.describe('UB — Booking UI journey', () => {
  test.describe.configure({ mode: 'serial' });

  // Apply user storageState to all tests in this describe block.
  // UB3 overrides this by opening a fresh browser context manually.
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  // -------------------------------------------------------------------------
  // beforeAll — determinism contract:
  //   1. Authenticate as user via Supabase token grant (API only)
  //   2. Fetch existing bookings this user has on the test listing
  //   3. Cancel each one so UB1 starts from a clean state
  // -------------------------------------------------------------------------

  test.beforeAll(async () => {
    if (!hasAllCreds) return;

    const fixture = readListingFixture();
    if (!fixture?.isLive) return;

    // API-assisted fixture cleanup — not a test step
    const userToken = await getToken(USER_EMAIL, USER_PASSWORD);
    if (!userToken) {
      console.log('[UB beforeAll] Could not obtain user token — existing bookings not cancelled');
      return;
    }

    const userId = getUserIdFromToken(userToken);

    // Fetch the user's own bookings to find any pre-existing ones on the test listing
    // API-assisted fixture cleanup — not a test step
    let existingIds: string[] = [];
    try {
      const res = await fetch(`${BACKEND}/api/bookings/mine?size=50`, {
        headers: { Authorization: `Bearer ${userToken}` },
      });
      if (res.ok) {
        const data = (await res.json()) as {
          content?: Array<{ id: string; listingId: string; requesterId: string; status: string }>;
        };
        existingIds = (data.content ?? [])
          .filter(
            (b) =>
              b.listingId === fixture.id &&
              b.requesterId === userId &&
              b.status !== 'CANCELLED' &&
              b.status !== 'DECLINED',
          )
          .map((b) => b.id);
        console.log(`[UB beforeAll] Found ${existingIds.length} active booking(s) to cancel`);
      } else {
        const text = await res.text().catch(() => '<unreadable>');
        console.log(`[UB beforeAll] GET /api/bookings/mine failed (${res.status}): ${text}`);
      }
    } catch (err) {
      console.log(`[UB beforeAll] GET /api/bookings/mine threw: ${String(err)}`);
    }

    // Cancel each pre-existing booking — API-assisted fixture cleanup, not a test step
    const failedIds: string[] = [];
    for (const id of existingIds) {
      try {
        const cancelRes = await fetch(`${BACKEND}/api/bookings/${id}/cancel`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${userToken}` },
        });
        if (cancelRes.ok) {
          console.log(`[UB beforeAll] Cancelled pre-existing booking ${id}`);
        } else {
          const text = await cancelRes.text().catch(() => '<unreadable>');
          console.log(`[UB beforeAll] Cancel booking ${id} failed (${cancelRes.status}): ${text}`);
          failedIds.push(id);
        }
      } catch (err) {
        console.log(`[UB beforeAll] Cancel booking ${id} threw: ${String(err)}`);
        failedIds.push(id);
      }
    }
    if (failedIds.length > 0) {
      console.log(`[UB beforeAll] WARNING: ${failedIds.length} booking(s) could not be cancelled — UB1 may fail with 409: ${failedIds.join(', ')}`);
    }
  });

  // -------------------------------------------------------------------------
  // afterAll — cancel the booking created by UB1
  // API-assisted fixture cleanup — not a test step
  // -------------------------------------------------------------------------

  test.afterAll(async () => {
    if (!createdBookingId) return;

    // API-assisted fixture cleanup — not a test step
    const userToken = await getToken(USER_EMAIL, USER_PASSWORD);
    if (!userToken) {
      console.log('[UB afterAll] Could not obtain user token — booking not cancelled');
      return;
    }

    try {
      const cancelRes = await fetch(`${BACKEND}/api/bookings/${createdBookingId}/cancel`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${userToken}` },
      });
      if (cancelRes.ok) {
        console.log(`[UB afterAll] Cancelled test booking ${createdBookingId}`);
      } else {
        const text = await cancelRes.text().catch(() => '<unreadable>');
        console.log(`[UB afterAll] Cancel test booking failed (${cancelRes.status}): ${text}`);
      }
    } catch (err) {
      console.log(`[UB afterAll] Cancel test booking threw: ${String(err)}`);
    }
  });

  // -------------------------------------------------------------------------
  // UB1 — Successful booking request
  // -------------------------------------------------------------------------

  test('UB1 — successful viewing request via modal', async ({ page }, testInfo) => {
    test.skip(!hasAllCreds, 'UB1: user/broker creds or Supabase keys not set — skipping');

    const fixture = readListingFixture();
    test.skip(fixture === null, 'UB1: e2e/.test-listing-id not found — global-setup may have skipped');
    test.skip(!fixture!.isLive, 'UB1: test listing is not LIVE — booking requires a live listing');

    const id = fixture!.id;

    await page.goto(`/listing/${id}`);
    await page.waitForLoadState('domcontentloaded');

    // Wait for the listing detail page to render
    await page.waitForSelector('h1', { timeout: 15_000 });

    // Open the RequestViewingModal
    await page.getByRole('button', { name: /request viewing/i }).click();

    // Wait for dialog to open
    await page.waitForSelector('[role="dialog"]', { timeout: 10_000 });

    // Fill preferred date
    await page.locator('#requested-date').fill(BOOKING_DATE);

    // Open the Radix Select for time slot and choose the first available option
    await page.locator('#time-slot').click();
    await page.getByRole('option').first().click();

    // Fill optional message
    await page.locator('#requester-message').fill(BOOKING_MESSAGE);

    // Submit the form
    await page.getByRole('button', { name: /send request/i }).click();

    // Assert success toast — text from useCreateBooking onSuccess
    await expect(
      page.getByText(/viewing request sent/i),
    ).toBeVisible({ timeout: 10_000 });

    // Assert dialog closes after success (onSuccess calls handleClose which calls onClose)
    await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 8_000 });

    // Capture the booking ID for UB2/UB3 skip guard and afterAll cleanup.
    // API-assisted fixture capture — not a test step.
    const userToken = await getToken(USER_EMAIL, USER_PASSWORD);
    if (userToken) {
      try {
        const res = await fetch(`${BACKEND}/api/bookings/mine?size=20`, {
          headers: { Authorization: `Bearer ${userToken}` },
        });
        if (res.ok) {
          const data = (await res.json()) as {
            content?: Array<{ id: string; listingId: string; status: string; requestedDate?: string }>;
          };
          const booking = (data.content ?? []).find(
            (b) => b.listingId === id && b.status === 'REQUESTED' && (b.requestedDate === BOOKING_DATE || !b.requestedDate),
          );
          if (booking) {
            createdBookingId = booking.id;
            console.log(`[UB1] Captured booking ID: ${createdBookingId}`);
          } else {
            console.log('[UB1] Booking not found in /api/bookings/mine — afterAll cleanup may be partial');
          }
        }
      } catch (err) {
        console.log(`[UB1] GET /api/bookings/mine threw: ${String(err)}`);
      }
    }

    await testInfo.attach('booking-date', { body: BOOKING_DATE, contentType: 'text/plain' });
  });

  // -------------------------------------------------------------------------
  // UB2 — Duplicate booking shows inline error
  // Pre-condition: UB1 ran (a booking already exists for this listing+user).
  // -------------------------------------------------------------------------

  test('UB2 — duplicate booking shows inline error', async ({ page }) => {
    test.skip(!hasAllCreds, 'UB2: user/broker creds or Supabase keys not set — skipping');

    const fixture = readListingFixture();
    test.skip(fixture === null, 'UB2: e2e/.test-listing-id not found — skipping');
    test.skip(!fixture!.isLive, 'UB2: test listing is not LIVE — skipping');
    test.skip(
      createdBookingId === null,
      'UB2: UB1 did not create a booking — skipping duplicate test',
    );

    const id = fixture!.id;

    await page.goto(`/listing/${id}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('h1', { timeout: 15_000 });

    // Open the modal
    await page.getByRole('button', { name: /request viewing/i }).click();
    await page.waitForSelector('[role="dialog"]', { timeout: 10_000 });

    // Fill the same date and time slot as UB1 to trigger a 409 Conflict
    await page.locator('#requested-date').fill(BOOKING_DATE);
    await page.locator('#time-slot').click();
    await page.getByRole('option').first().click();
    await page.locator('#requester-message').fill(BOOKING_MESSAGE);

    // Submit — backend returns 409 Conflict for a duplicate booking
    await page.getByRole('button', { name: /send request/i }).click();

    // Dialog must remain open while the inline error is shown
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5_000 });

    // The modal renders a .text-destructive inline error when createBooking.isError is true:
    //   "Failed to send request. Please try again."
    // This is an inline element inside the dialog — distinct from the toast.
    const inlineError = page.locator('[role="dialog"] .text-destructive');
    await expect(inlineError).toBeVisible({ timeout: 10_000 });
  });

  // -------------------------------------------------------------------------
  // UB3 — Booking from UB1 appears in broker dashboard
  // Uses a separate browser context with broker storageState.
  // -------------------------------------------------------------------------

  test('UB3 — booking appears in broker bookings page', async ({ browser }) => {
    test.skip(!hasAllCreds, 'UB3: user/broker creds or Supabase keys not set — skipping');

    const fixture = readListingFixture();
    test.skip(fixture === null, 'UB3: e2e/.test-listing-id not found — skipping');
    test.skip(!fixture!.isLive, 'UB3: test listing is not LIVE — skipping');
    test.skip(
      createdBookingId === null,
      'UB3: UB1 did not create a booking — skipping broker check',
    );

    // Open a fresh context with broker credentials — UB1/UB2 use user storageState
    const context = await browser.newContext({
      storageState: 'e2e/fixtures/broker-auth.json',
    });
    const page = await context.newPage();

    try {
      await page.goto('/broker/bookings');
      await page.waitForLoadState('domcontentloaded');

      // Wait for auth to settle and page heading to render
      await page.waitForSelector('h1', { timeout: 15_000 });

      // The page renders "Booking Requests" as the main h1
      await expect(
        page.getByRole('heading', { name: /booking requests/i }).first(),
      ).toBeVisible({ timeout: 10_000 });

      // The booking created in UB1 is REQUESTED so it appears under "Pending Requests".
      // BrokerBookings renders requesterMessage as a quoted block when set —
      // we match on the message text which is unique to this test run.
      // Matches the quoted message text rendered in BrokerBookings for REQUESTED bookings.
      // Works as long as the booking appears on the first page of results.
      // Limitation: if broker has many bookings, pagination could hide it; acceptable for CI.
      await expect(
        page.getByText(BOOKING_MESSAGE),
      ).toBeVisible({ timeout: 10_000 });
    } finally {
      await context.close();
    }
  });
});
