/**
 * Listing Rejection + Broker Re-submit E2E (RR1)
 *
 * Verifies the full rejection-to-resubmit lifecycle:
 *   1. Admin rejects a PENDING_REVIEW listing via API
 *   2. Broker sees REJECTED badge + rejection reason on /broker/listings
 *   3. Broker navigates to Edit Listing from the REJECTED card
 *   4. Broker makes an edit and re-submits
 *   5. Listing transitions back to PENDING_REVIEW
 *
 * Preconditions:
 *   - BROKER_EMAIL/BROKER_PASSWORD (or DEALER_EMAIL/DEALER_PASSWORD)
 *   - ADMIN_EMAIL/ADMIN_PASSWORD
 *   - VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY
 *   - BACKEND_BASE_URL (defaults to render)
 */

import { test, expect } from '@playwright/test';
import { hasRealCredentials } from './helpers';

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const BACKEND =
  process.env.BACKEND_BASE_URL ?? 'https://udupi-property-explorer.onrender.com';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';

const BROKER_EMAIL = process.env.BROKER_EMAIL ?? process.env.DEALER_EMAIL ?? '';
const BROKER_PASSWORD = process.env.BROKER_PASSWORD ?? process.env.DEALER_PASSWORD ?? '';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? '';

const hasBrokerCreds = hasRealCredentials(BROKER_EMAIL, BROKER_PASSWORD);
const hasAdminCreds = hasRealCredentials(ADMIN_EMAIL, ADMIN_PASSWORD);

const REJECTION_REASON = 'E2E RR1: photos do not match property description';

// ---------------------------------------------------------------------------
// Helpers (same pattern as listing-lifecycle.spec.ts)
// ---------------------------------------------------------------------------

async function getToken(email: string, password: string): Promise<string | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string };
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

function getUserIdFromToken(token: string): string {
  const payload = token.split('.')[1] ?? '';
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as {
    sub?: string;
  };
  return decoded.sub ?? '';
}

// ---------------------------------------------------------------------------
// RR1 — Rejection + Re-submit lifecycle
// ---------------------------------------------------------------------------

test.describe('@integration-ui Listing rejection + broker re-submit (RR1)', () => {
  test.use({ storageState: 'e2e/fixtures/broker-auth.json' });

  let listingId: string | null = null;
  let brokerToken: string | null = null;
  let adminToken: string | null = null;

  // -----------------------------------------------------------------------
  // beforeAll: create DRAFT -> upload images -> submit -> PENDING_REVIEW
  // -----------------------------------------------------------------------
  test.beforeAll(async () => {
    if (!hasBrokerCreds || !hasAdminCreds) return;

    brokerToken = await getToken(BROKER_EMAIL, BROKER_PASSWORD);
    adminToken = await getToken(ADMIN_EMAIL, ADMIN_PASSWORD);
    if (!brokerToken || !adminToken) return;

    const brokerUserId = getUserIdFromToken(brokerToken);

    // 1. Create DRAFT listing
    const createRes = await fetch(`${BACKEND}/api/listings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${brokerToken}`,
      },
      body: JSON.stringify({
        propertyType: 'house',
        title: '[E2E RR1] Rejection resubmit test',
        price: 4_500_000,
        locality: 'Manipal',
      }),
    });
    if (!createRes.ok) {
      console.log(`[RR1] Create failed (${createRes.status})`);
      return;
    }
    const created = (await createRes.json()) as { id?: string };
    listingId = created.id ?? null;
    if (!listingId) return;
    console.log(`[RR1] Created listing: ${listingId}`);

    // 2. Set addressConfirmed + coordinates
    await fetch(`${BACKEND}/api/listings/${listingId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${brokerToken}`,
      },
      body: JSON.stringify({
        addressConfirmed: true,
        latitude: 13.35,
        longitude: 74.79,
      }),
    });

    // 3. Register 3 stub images (metadata only)
    for (const fn of ['rr1-img1.jpg', 'rr1-img2.jpg', 'rr1-img3.jpg']) {
      const storagePath = `listings/${brokerUserId}/${listingId}/${fn}`;
      await fetch(`${BACKEND}/api/listings/${listingId}/images`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${brokerToken}`,
        },
        body: JSON.stringify({ storagePath }),
      });
    }

    // 4. Submit for review -> PENDING_REVIEW
    const submitRes = await fetch(`${BACKEND}/api/listings/${listingId}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${brokerToken}` },
    });
    if (!submitRes.ok) {
      const text = await submitRes.text().catch(() => '');
      console.log(`[RR1] Submit failed (${submitRes.status}): ${text}`);
      return;
    }
    console.log(`[RR1] Listing ${listingId} is now PENDING_REVIEW`);
  });

  // -----------------------------------------------------------------------
  // afterAll: admin force-delete (works for any status)
  // -----------------------------------------------------------------------
  test.afterAll(async () => {
    if (!listingId || !adminToken) return;
    await fetch(`${BACKEND}/api/admin/listings/${listingId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    }).catch(() => {});
    console.log(`[RR1] Cleaned up listing ${listingId}`);
  });

  // -----------------------------------------------------------------------
  // Test: full rejection -> re-submit flow
  // -----------------------------------------------------------------------
  test('RR1 — admin rejects, broker sees rejection, edits, and re-submits', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    test.skip(!hasBrokerCreds || !hasAdminCreds, 'Broker + Admin credentials required');
    test.skip(listingId === null, 'PENDING_REVIEW listing could not be created');

    // =====================================================================
    // Step 1: Admin rejects listing via API
    // =====================================================================
    const rejectRes = await fetch(`${BACKEND}/api/admin/listings/${listingId}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken!}`,
      },
      body: JSON.stringify({ rejectionReason: REJECTION_REASON }),
    });
    expect(rejectRes.ok, `Admin reject should succeed (got ${rejectRes.status})`).toBe(
      true,
    );

    // Verify status via API
    const statusRes = await fetch(`${BACKEND}/api/listings/${listingId}`, {
      headers: { Authorization: `Bearer ${brokerToken!}` },
    });
    expect(statusRes.ok).toBe(true);
    const statusData = (await statusRes.json()) as { status?: string };
    expect(statusData.status).toBe('REJECTED');
    console.log(`[RR1] Listing ${listingId} is now REJECTED`);

    // =====================================================================
    // Step 2: Broker navigates to /broker/listings, REJECTED badge visible
    // =====================================================================
    await page.goto('/broker/listings');
    await page.waitForLoadState('domcontentloaded');

    // Wait for listings to load (spinner disappears)
    await page
      .locator('.animate-spin')
      .first()
      .waitFor({ state: 'hidden', timeout: 15_000 })
      .catch(() => {});

    // Find our listing card by title
    const listingCard = page.locator('text=[E2E RR1] Rejection resubmit test').first();
    await expect(listingCard).toBeVisible({ timeout: 15_000 });

    // Verify REJECTED badge is visible on the page
    const rejectedBadge = page.locator('text=Rejected').first();
    await expect(rejectedBadge).toBeVisible({ timeout: 5_000 });

    // Verify rejection reason text is shown
    const rejectionText = page.locator(`text=${REJECTION_REASON}`).first();
    await expect(rejectionText).toBeVisible({ timeout: 5_000 });

    // =====================================================================
    // Step 3: Broker sees "Edit & Resubmit" link, navigates to Edit Listing
    // =====================================================================
    // Verify the "Edit & Resubmit" link is available for REJECTED listings
    const editResubmitLink = page
      .getByRole('link', { name: /edit & resubmit/i })
      .first();
    await expect(editResubmitLink).toBeVisible({ timeout: 5_000 });

    // Navigate to EditListing via direct URL (avoids SPA routing race with
    // query cache that can briefly trigger the error boundary)
    await page.goto(`/broker/listings/${listingId}/edit`);
    await page.waitForLoadState('domcontentloaded');

    // Wait for the listing data to load (spinner hidden)
    await page
      .locator('.animate-spin')
      .first()
      .waitFor({ state: 'hidden', timeout: 15_000 })
      .catch(() => {});

    // Verify we are on the EditListing page and it rendered properly
    const titleInput = page.locator('#title');
    await expect(titleInput).toBeVisible({ timeout: 15_000 });

    // Verify the rejection reason alert is displayed on the Edit page
    await expect(
      page.getByText(/rejection reason:/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    // =====================================================================
    // Step 4: Broker makes an edit (title change on step 1) and saves
    // =====================================================================
    await titleInput.clear();
    await titleInput.fill('[E2E RR1] Rejection resubmit test - edited');

    // Click "Save & Continue" to save step 1
    const saveBtn = page
      .getByRole('button', { name: /save & continue/i })
      .first();
    await expect(saveBtn).toBeVisible({ timeout: 5_000 });

    // Wait for the save API response
    const savePromise = page.waitForResponse(
      (res) =>
        res.url().includes(`/api/listings/${listingId}`) &&
        res.request().method() === 'PUT',
      { timeout: 15_000 },
    );
    await saveBtn.click();
    const saveResponse = await savePromise;
    expect(saveResponse.ok(), 'Step 1 save should succeed').toBe(true);

    // =====================================================================
    // Step 5: Navigate to step 4 (Review & Submit) and re-submit
    // =====================================================================
    // After saving step 1, we auto-advance to step 2. Navigate to step 4 via URL.
    await page.goto(`/broker/listings/${listingId}/edit?step=4`);
    await page.waitForLoadState('domcontentloaded');

    // Wait for listing data to load
    await page
      .locator('.animate-spin')
      .first()
      .waitFor({ state: 'hidden', timeout: 15_000 })
      .catch(() => {});

    // Find and click "Submit for Review" button
    const submitBtn = page.getByRole('button', { name: /submit for review/i });
    await expect(submitBtn).toBeVisible({ timeout: 10_000 });

    // The button should be enabled (all conditions met from beforeAll setup)
    await expect(submitBtn).toBeEnabled({ timeout: 5_000 });

    // Wait for the submit API response
    const submitPromise = page.waitForResponse(
      (res) =>
        res.url().includes(`/api/listings/${listingId}/submit`) &&
        res.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await submitBtn.click();
    await submitPromise;

    // Should navigate back to /broker/listings after successful submit
    await expect(page).toHaveURL(/\/broker\/listings/, { timeout: 10_000 });

    // =====================================================================
    // Step 6: Verify listing is now PENDING_REVIEW (API verification)
    // =====================================================================
    // Poll API to confirm status transition (up to 10s)
    let finalStatus = '';
    for (let attempt = 0; attempt < 10; attempt++) {
      const verifyRes = await fetch(`${BACKEND}/api/listings/${listingId}`, {
        headers: { Authorization: `Bearer ${brokerToken!}` },
      });
      if (verifyRes.ok) {
        const data = (await verifyRes.json()) as { status?: string };
        finalStatus = data.status ?? '';
        if (finalStatus === 'PENDING_REVIEW') break;
      }
      // Wait 1s before retrying (only if not yet PENDING_REVIEW)
      if (attempt < 9) {
        await new Promise((r) => setTimeout(r, 1_000));
      }
    }
    expect(finalStatus).toBe('PENDING_REVIEW');
    console.log(`[RR1] Listing ${listingId} successfully re-submitted to PENDING_REVIEW`);

    // Also verify the "Under Review" badge appears on the UI
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page
      .locator('.animate-spin')
      .first()
      .waitFor({ state: 'hidden', timeout: 15_000 })
      .catch(() => {});

    const underReviewBadge = page.locator('text=Under Review').first();
    await expect(underReviewBadge).toBeVisible({ timeout: 10_000 });
  });
});
