/**
 * listing-detail-viewing.spec.ts — #1617 listing detail viewing flow
 * Adapted for #1797 — the modal (Dialog) "Request Viewing" flow was replaced by
 * a fully inline, sticky ViewingRequestPanel in the sidebar. There is no dialog
 * for the request-viewing journey anymore (agri listings still use the legacy
 * RequestViewingModal, but that page variant is out of scope here).
 *
 * Covers:
 *   LDV1 — Authed buyer picks a date pill + time slot in the inline panel, submits
 *          (journey intact) — POST /api/bookings contract unchanged.
 *   LDV2 — "Contact Broker" button is absent (dishonest duplicate removed in D2-A);
 *          the inline contact-lister card is out of scope for this spec.
 *   LDV3 — Anonymous buyer sees the SAME interactive inline panel (Option A, #1797)
 *          — not a sign-in wall. Submitting as anon preserves date+time intent to
 *          sessionStorage and opens the sign-in modal WITHOUT posting to /api/bookings.
 *   LDV4 — Anonymous buyer: first image visible; gallery lock appears at image 2
 *
 * Prerequisites:
 *   - SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD — a regular authenticated test user
 *   - The test listing UUID: env var SMOKE_LISTING_ID or e2e/.test-listing-id
 *     (written by global-setup from the seeded listing e2e00003-0000-0000-0000-000000000001)
 *   - Running stack: frontend at PLAYWRIGHT_BASE_URL (default: http://localhost:5201)
 *                    backend  at BACKEND_BASE_URL   (default: http://localhost:8110)
 *
 * Auth:
 *   LDV1 uses storageState from e2e/fixtures/user-auth.json (pre-authenticated session).
 *   LDV2 uses storageState from e2e/fixtures/user-auth.json.
 *   LDV3/LDV4 run unauthenticated (no storageState).
 *
 * Scheduling note:
 *   LDV1 calls POST /api/bookings. The seeded test listing must belong to a broker
 *   different from the SMOKE_USER. If the booking API returns 409 (duplicate), the
 *   test still counts as PASS for the journey-intact check — the submit path reached
 *   the API without a client-side regression.
 *
 * Run locally (stack already running at ports 5201/8110):
 *   PLAYWRIGHT_BASE_URL=http://localhost:5201 \
 *   SMOKE_USER_EMAIL=user@example.com SMOKE_USER_PASSWORD=secret \
 *   npx playwright test e2e/listing-detail-viewing.spec.ts --project=journey
 */

import { test, expect } from '@playwright/test';
import { hasRealCredentials } from './helpers';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const USER_EMAIL = process.env.SMOKE_USER_EMAIL ?? '';
const USER_PASSWORD = process.env.SMOKE_USER_PASSWORD ?? '';
const hasUserCreds = hasRealCredentials(USER_EMAIL, USER_PASSWORD);

// The seeded fixture listing guaranteed to be LIVE in a Testcontainers/dev stack.
const SEEDED_LISTING_ID = 'e2e00003-0000-0000-0000-000000000001';

/**
 * Resolve listing ID from:
 * 1. SMOKE_LISTING_ID env var
 * 2. e2e/.test-listing-id file (written by global-setup)
 * 3. Seeded fixture ID (Testcontainers / dev stack)
 */
function resolveListingId(): string {
  if (process.env.SMOKE_LISTING_ID) return process.env.SMOKE_LISTING_ID;
  const idFile = path.join(__dirname, '.test-listing-id');
  if (fs.existsSync(idFile)) {
    const first = fs.readFileSync(idFile, 'utf-8').trim().split('\n')[0]?.trim();
    if (first) return first;
  }
  return SEEDED_LISTING_ID;
}

const LISTING_ID = resolveListingId();

// ---------------------------------------------------------------------------
// Helper: navigate to listing detail and wait for content
// ---------------------------------------------------------------------------
async function gotoListing(page: import('@playwright/test').Page) {
  await page.goto(`/listing/${LISTING_ID}`);
  await page.waitForLoadState('domcontentloaded');
}

// ---------------------------------------------------------------------------
// LDV1 — Authed buyer: Request Viewing journey intact
// ---------------------------------------------------------------------------
test.describe('@journey LDV1 — authed buyer: Request Viewing journey intact', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  test('LDV1 — authed buyer picks a date pill + time slot in the inline panel, submits', async ({ page }) => {
    test.skip(!hasUserCreds, 'SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD not set');

    await gotoListing(page);

    // Inline panel heading is visible (authed) — no modal/dialog involved.
    await expect(
      page.getByRole('heading', { level: 2, name: /request a viewing time/i }),
    ).toBeVisible({ timeout: 10_000 });
    // There must be no dialog for this flow anymore (D2-A/#1797: modal replaced by inline panel).
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Pick the first quick-pick date pill (tomorrow).
    const firstDatePill = page.locator('[data-testid^="viewing-date-pill-"]').first();
    await firstDatePill.waitFor({ state: 'visible', timeout: 5_000 });
    await firstDatePill.click();

    // Pick the first available time slot — revealed only after a date is chosen.
    const firstTimeSlot = page.locator('[data-testid^="viewing-time-slot-"]').first();
    await firstTimeSlot.waitFor({ state: 'visible', timeout: 5_000 });
    await firstTimeSlot.click();

    // Submit button becomes enabled after date + slot selection.
    const submitBtn = page.getByTestId('request-viewing-btn');
    await expect(submitBtn).toBeEnabled({ timeout: 5_000 });

    // Assert the underlying POST /api/bookings contract is unchanged: capture the
    // request payload and response status alongside the click (journey-intact check
    // for the API boundary, not just the UI).
    const [bookingRequest] = await Promise.all([
      page.waitForRequest(
        (req) => req.url().includes('/api/bookings') && req.method() === 'POST',
        { timeout: 10_000 },
      ),
      submitBtn.click(),
    ]);
    const payload = bookingRequest.postDataJSON() as {
      listingId?: string;
      requestedDate?: string;
      requestedTimeSlot?: string;
    };
    expect(payload.listingId).toBe(LISTING_ID);
    expect(payload.requestedDate).toBeTruthy();
    expect(payload.requestedTimeSlot).toBeTruthy();

    // Submit may succeed (201) or conflict (409 duplicate on a seeded listing). Both
    // outcomes are acceptable for the "journey intact" check. What is NOT acceptable:
    // the submit silently hanging with no feedback rendered at all.
    const success = page.getByTestId('viewing-request-success');
    const errorMsg = page.getByTestId('viewing-request-error');

    await expect
      .poll(
        async () => {
          if (await success.isVisible().catch(() => false)) return 'success-shown';
          if (await errorMsg.isVisible().catch(() => false)) return 'error-shown';
          return 'pending';
        },
        {
          message:
            'LDV1: expected the inline success state (viewing-request-success) or error state ' +
            '(viewing-request-error) to appear after submit — got neither; the submit may have silently broken',
          timeout: 12_000,
          intervals: [500, 500, 500, 1_000, 1_000, 1_000],
        },
      )
      .toMatch(/^(success-shown|error-shown)$/);

    // If the success path was reached, assert the honest "request, not a confirmed
    // booking" semantics carried over from the modal copy.
    if (await success.isVisible().catch(() => false)) {
      await expect(success).toHaveAttribute('role', 'status');
      await expect(success).toContainText(/not a confirmed booking/i);
    }
  });
});

// ---------------------------------------------------------------------------
// LDV2 — Authed buyer: "Contact Broker" button is absent (D2-A honesty fix)
// ---------------------------------------------------------------------------
test.describe('@journey LDV2 — authed buyer: Contact Broker button removed', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  test('LDV2 — Contact Broker button must not appear in the sidebar', async ({ page }) => {
    test.skip(!hasUserCreds, 'SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD not set');

    await gotoListing(page);

    // The inline viewing-request panel (its submit CTA) must be present.
    await expect(page.getByTestId('request-viewing-btn')).toBeVisible({ timeout: 10_000 });

    // "Contact Broker" must NOT be present anywhere on the page — the honesty fix from
    // D2-A carries over to the inline layout. (The inline contact-lister card that
    // conditionally shows a verified-broker phone number is a separate, in-scope-elsewhere
    // control and is not what this check is about — it asserts the OLD broken/no-op
    // "Contact Broker" button never reappears.)
    await expect(
      page.getByRole('button', { name: /contact broker/i }),
    ).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// LDV3 — Anonymous buyer: same interactive inline panel (Option A, #1797) —
// NOT a sign-in wall. Submitting routes to the in-page sign-in modal and does
// NOT call POST /api/bookings.
// ---------------------------------------------------------------------------
test('LDV3 — anonymous buyer sees the same interactive inline panel; submit opens sign-in without posting', async ({ page }) => {
  await gotoListing(page);

  // Anon buyers get the SAME inline panel — not a SignInGateCard wall.
  await expect(
    page.getByRole('heading', { level: 2, name: /request a viewing time/i }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('text=Sign in to view full details')).toHaveCount(0);

  // "Contact Broker" must also be absent
  await expect(
    page.getByRole('button', { name: /contact broker/i }),
  ).toHaveCount(0);

  // Pick a date pill + time slot exactly like an authed buyer would.
  const firstDatePill = page.locator('[data-testid^="viewing-date-pill-"]').first();
  await firstDatePill.waitFor({ state: 'visible', timeout: 5_000 });
  await firstDatePill.click();
  const firstTimeSlot = page.locator('[data-testid^="viewing-time-slot-"]').first();
  await firstTimeSlot.waitFor({ state: 'visible', timeout: 5_000 });
  await firstTimeSlot.click();

  const submitBtn = page.getByTestId('request-viewing-btn');
  await expect(submitBtn).toBeEnabled({ timeout: 5_000 });
  await expect(submitBtn).toHaveText(/sign in to request viewing/i);

  // Fail loudly if the anon submit ever posts to /api/bookings — there is no anon
  // submit path (no auth broadening); only sign-in should occur.
  let bookingPosted = false;
  page.on('request', (req) => {
    if (req.url().includes('/api/bookings') && req.method() === 'POST') bookingPosted = true;
  });

  await submitBtn.click();

  // The in-page sign-in modal (AuthModalContext) opens — no navigation to a hard wall.
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });

  expect(bookingPosted).toBe(false);

  // The intent (date + time slot ONLY — no PII) is preserved to sessionStorage so the
  // pick survives the sign-in round trip.
  const storedIntent = await page.evaluate((listingId) => {
    const raw = sessionStorage.getItem(`viewing-intent:${listingId}`);
    return raw ? JSON.parse(raw) : null;
  }, LISTING_ID);
  expect(storedIntent).not.toBeNull();
  expect(Object.keys(storedIntent).sort()).toEqual(['date', 'timeSlot']);
});

// ---------------------------------------------------------------------------
// LDV4 — Anonymous buyer: gallery first image visible; locked overlay at img 2
// ---------------------------------------------------------------------------
test('LDV4 — anonymous buyer: first image shown, gallery locks at image 2', async ({ page }) => {
  await gotoListing(page);
  await page.waitForLoadState('domcontentloaded');

  // No lock overlay at index 0
  await expect(page.locator('text=Sign in to view all photos')).toHaveCount(0, {
    timeout: 5_000,
  });

  // Check if there's a "Next image" button (listing may have only 1 image)
  const nextBtn = page.getByRole('button', { name: /next image/i });
  const hasMultiple = await nextBtn.isVisible({ timeout: 3_000 }).catch(() => false);

  if (hasMultiple) {
    await nextBtn.click();
    // Lock overlay must appear at image 2
    await expect(
      page.locator('text=Sign in to view all photos').first(),
    ).toBeVisible({ timeout: 5_000 });
    // The returnTo link must target the listing
    const lockCta = page.locator(`a[href*="/auth?returnTo"]`).last();
    const href = await lockCta.getAttribute('href');
    expect(decodeURIComponent(href ?? '')).toContain(`/listing/${LISTING_ID}`);
  } else {
    // Single-image listing: lock not testable — pass trivially
    test.info().annotations.push({
      type: 'note',
      description: 'LDV4: listing has only one image — gallery lock not testable',
    });
  }
});
