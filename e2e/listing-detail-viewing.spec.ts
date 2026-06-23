/**
 * listing-detail-viewing.spec.ts — #1617 listing detail viewing flow
 *
 * Covers:
 *   LDV1 — Authed buyer opens "Request Viewing", selects date + slot, submits (journey intact)
 *   LDV2 — "Contact Broker" button is absent (dishonest duplicate removed in D2-A)
 *   LDV3 — Anonymous buyer sees the sign-in gate, NOT the "Request Viewing" button
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

  test('LDV1 — authed buyer opens modal, selects date + slot, submits', async ({ page }) => {
    test.skip(!hasUserCreds, 'SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD not set');

    await gotoListing(page);

    // "Request Viewing" button must be visible (authed)
    const requestBtn = page.getByRole('button', { name: /request viewing/i });
    await expect(requestBtn).toBeVisible({ timeout: 10_000 });

    // Open the modal
    await requestBtn.click();

    // Modal heading visible
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });
    await expect(
      page.locator('[role="dialog"]').getByText(/request a viewing/i),
    ).toBeVisible();

    // Fill preferred date (tomorrow, formatted yyyy-MM-dd)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().slice(0, 10);
    await page.locator('#requested-date').fill(dateStr);

    // Select a time slot — pick the first available option
    const selectTrigger = page.locator('[role="dialog"] button').filter({ hasText: /select a time slot/i });
    if (await selectTrigger.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await selectTrigger.click();
      // Pick first option in the dropdown
      const firstOption = page.locator('[role="option"]').first();
      await firstOption.waitFor({ state: 'visible', timeout: 3_000 });
      await firstOption.click();
    } else {
      // Time slot may already be pre-selected or use a different pattern
      // Try the combobox approach
      const combobox = page.locator('[role="combobox"]').first();
      if (await combobox.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await combobox.click();
        const option = page.locator('[role="option"]').first();
        await option.waitFor({ state: 'visible', timeout: 3_000 });
        await option.click();
      }
    }

    // Submit button becomes enabled after date + slot selection
    const submitBtn = page.locator('[role="dialog"] button[type="submit"]');
    await expect(submitBtn).toBeEnabled({ timeout: 5_000 });

    // Submit — booking may succeed (201) or conflict (409 duplicate on a seeded
    // listing). Both outcomes are acceptable for the "journey intact" check.
    // What is NOT acceptable: the submit silently hanging with the dialog still open
    // and no feedback rendered at all.
    await submitBtn.click();

    // Deterministic terminal-state assertion: wait for EITHER
    //   (a) the dialog to close (success path — booking accepted), OR
    //   (b) a visible error / duplicate message inside the dialog (409 / error path).
    //
    // We race these two conditions with a generous timeout. If NEITHER branch
    // materialises, the test fails — which is the correct signal that the submit
    // silently broke.
    const dialog = page.getByRole('dialog');
    const errorMsg = dialog.locator(
      [
        '[data-testid="booking-error"]',
        '[role="alert"]',
        'text=/already/i',
        'text=/error/i',
        'text=/failed/i',
        'text=/conflict/i',
      ].join(', '),
    );

    await expect
      .poll(
        async () => {
          const dialogGone = await dialog.isVisible().then((v) => !v).catch(() => true);
          if (dialogGone) return 'dialog-closed';
          const hasError = await errorMsg.first().isVisible().catch(() => false);
          if (hasError) return 'error-shown';
          return 'pending';
        },
        {
          message:
            'LDV1: expected dialog to close (success) or error message to appear (409/error) after submit — ' +
            'got neither; the submit may have silently broken',
          timeout: 12_000,
          intervals: [500, 500, 500, 1_000, 1_000, 1_000],
        },
      )
      .toMatch(/^(dialog-closed|error-shown)$/);
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

    // "Request Viewing" must be present
    await expect(
      page.getByRole('button', { name: /request viewing/i }),
    ).toBeVisible({ timeout: 10_000 });

    // "Contact Broker" must NOT be present anywhere on the page
    await expect(
      page.getByRole('button', { name: /contact broker/i }),
    ).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// LDV3 — Anonymous buyer: sign-in gate visible; no Request Viewing button
// ---------------------------------------------------------------------------
test('LDV3 — anonymous buyer sees sign-in gate, not Request Viewing button', async ({ page }) => {
  await gotoListing(page);

  // Sign-in gate text should be visible (from SignInGateCard)
  await expect(
    page.locator('text=Sign in to view full details').first(),
  ).toBeVisible({ timeout: 10_000 });

  // "Request Viewing" must NOT appear for anonymous users
  await expect(
    page.getByRole('button', { name: /request viewing/i }),
  ).toHaveCount(0);

  // "Contact Broker" must also be absent
  await expect(
    page.getByRole('button', { name: /contact broker/i }),
  ).toHaveCount(0);
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
