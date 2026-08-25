/**
 * UB — Booking UI journey tests
 *
 * Covers:
 *   UB1 — Successful viewing request via the inline ViewingRequestPanel
 *         (#1797/#2321 — the RequestViewingModal was replaced by an inline
 *         date-pill + time-slot panel on the listing detail page itself)
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
// Test data — the ViewingRequestPanel (#1797/#2321) exposes a fixed set of
// quick-pick date pills (tomorrow + next 4 days) and a fixed TIME_SLOTS list.
// UB1 selects the FIRST pill/slot and captures the actual date chosen; UB2
// re-selects the identical pill to force a genuine duplicate-booking 409.
// ---------------------------------------------------------------------------

const BOOKING_MESSAGE = 'Automated test booking';

// ---------------------------------------------------------------------------
// Module-level state shared across tests and beforeAll/afterAll
// ---------------------------------------------------------------------------

// The booking ID created by UB1; captured in UB1, used by UB2/UB3 skip guard
// and by afterAll cleanup.
let createdBookingId: string | null = null;

// The date pill UB1 selected (ISO yyyy-MM-dd), read back from the clicked
// pill's data-testid; captured in UB1, reused by UB2 to reproduce an exact
// duplicate booking against the same date.
let bookedDate: string | null = null;

// ---------------------------------------------------------------------------
// UB1 and UB2 use the user session. storageState is set at the describe level.
// UB3 opens its own broker context via browser.newContext().
// ---------------------------------------------------------------------------

test.describe('@journey UB — Booking UI journey', () => {
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
          items?: Array<{ id: string; listingId: string; requesterId: string; status: string }>;
        };
        existingIds = (data.items ?? [])
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

  test('UB1 — successful viewing request via panel', async ({ page }, testInfo) => {
    test.skip(!hasAllCreds, 'UB1: user/broker creds or Supabase keys not set — skipping');

    const fixture = readListingFixture();
    test.skip(fixture === null, 'UB1: e2e/.test-listing-id not found — global-setup may have skipped');
    test.skip(!fixture!.isLive, 'UB1: test listing is not LIVE — booking requires a live listing');

    const id = fixture!.id;

    await page.goto(`/listing/${id}`);
    await page.waitForLoadState('domcontentloaded');

    // Wait for the listing detail page to render
    await page.waitForSelector('h1', { timeout: 15_000 });

    // The viewing-request UI is an inline panel on the page itself (#1797/#2321
    // — RequestViewingModal was replaced by ViewingRequestPanel) — no dialog to open.
    // Select the first available quick-pick date pill.
    const firstDatePill = page.locator('[data-testid^="viewing-date-pill-"]').first();
    await firstDatePill.waitFor({ state: 'visible', timeout: 10_000 });
    const datePillTestId = (await firstDatePill.getAttribute('data-testid')) ?? '';
    bookedDate = datePillTestId.replace('viewing-date-pill-', '');
    expect(bookedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await firstDatePill.click();

    // Select the first available time slot
    const firstTimeSlot = page.locator('[data-testid^="viewing-time-slot-"]').first();
    await firstTimeSlot.waitFor({ state: 'visible', timeout: 5_000 });
    await firstTimeSlot.click();

    // Fill optional message
    await page.getByTestId('viewing-message-input').fill(BOOKING_MESSAGE);

    // Submit
    const submitBtn = page.getByTestId('request-viewing-btn');
    await expect(submitBtn).toBeEnabled({ timeout: 5_000 });
    await submitBtn.click();

    // Success replaces the panel's form with the `succeeded` branch
    // (role="status", data-testid="viewing-request-success"). The same
    // "Viewing request sent" copy is also echoed in a toast notification and
    // an aria-live region, so scope the text assertion to the panel itself
    // to avoid a strict-mode violation (3 matching elements otherwise).
    const successPanel = page.getByTestId('viewing-request-success');
    await expect(successPanel).toBeVisible({ timeout: 10_000 });
    await expect(successPanel.getByText(/viewing request sent/i)).toBeVisible();

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
            items?: Array<{ id: string; listingId: string; status: string; requestedDate?: string }>;
          };
          const booking = (data.items ?? []).find(
            (b) => b.listingId === id && b.status === 'REQUESTED' && (b.requestedDate === bookedDate || !b.requestedDate),
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

    await testInfo.attach('booking-date', { body: bookedDate ?? 'unknown', contentType: 'text/plain' });
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

    // Re-select the SAME date pill UB1 booked (falls back to the first pill if the
    // quick-pick window has shifted, e.g. a midnight rollover between UB1 and UB2).
    let datePill = bookedDate
      ? page.locator(`[data-testid="viewing-date-pill-${bookedDate}"]`)
      : page.locator('[data-testid^="viewing-date-pill-"]').first();
    if (bookedDate && !(await datePill.isVisible().catch(() => false))) {
      datePill = page.locator('[data-testid^="viewing-date-pill-"]').first();
    }
    await datePill.waitFor({ state: 'visible', timeout: 10_000 });
    await datePill.click();

    // Same first time slot as UB1 — TIME_SLOTS is a fixed list, identical for every date.
    const firstTimeSlot = page.locator('[data-testid^="viewing-time-slot-"]').first();
    await firstTimeSlot.waitFor({ state: 'visible', timeout: 5_000 });
    await firstTimeSlot.click();

    await page.getByTestId('viewing-message-input').fill(BOOKING_MESSAGE);

    // Submit — backend returns 409 Conflict for a duplicate booking
    const submitBtn = page.getByTestId('request-viewing-btn');
    await expect(submitBtn).toBeEnabled({ timeout: 5_000 });
    await submitBtn.click();

    // The panel must NOT show the success state for a rejected duplicate.
    await expect(page.getByTestId('viewing-request-success')).toHaveCount(0);

    // ViewingRequestPanel renders an inline role="alert" error banner when
    // createBooking.isError is true: "Failed to send your request. Please try again."
    await expect(page.getByTestId('viewing-request-error')).toBeVisible({ timeout: 10_000 });
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
      // Multiple bookings with this message may exist from prior test runs.
      // Use .first() to avoid Playwright strict mode violation.
      await expect(
        page.getByText(BOOKING_MESSAGE).first(),
      ).toBeVisible({ timeout: 10_000 });
    } finally {
      await context.close();
    }
  });
});
