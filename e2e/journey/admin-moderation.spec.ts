/**
 * AM — Admin Moderation UI journey tests
 *
 * Covers:
 *   AM1 — Admin approves a PENDING_REVIEW listing via the /admin/listings UI
 *   AM2 — Admin rejects a second PENDING_REVIEW listing via the reject dialog
 *   AM3 — Broker sees the REJECTED listing (badge + rejection reason) on /broker/listings
 *
 * Prerequisites:
 *   - ADMIN_EMAIL / ADMIN_PASSWORD — admin account
 *   - BROKER_EMAIL / BROKER_PASSWORD (or DEALER_EMAIL / DEALER_PASSWORD) — broker account
 *   - VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY — for API token grant in beforeAll/afterAll
 *   - e2e/fixtures/admin-auth.json and e2e/fixtures/broker-auth.json must exist
 *     (written by global-setup.ts)
 *
 * Auth:
 *   AM1/AM2 use storageState from e2e/fixtures/admin-auth.json (admin session).
 *   AM3 opens a separate browser context with e2e/fixtures/broker-auth.json.
 *   The beforeAll/afterAll fixture helpers authenticate via Supabase token grant (API only).
 *
 * Run locally:
 *   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=... \
 *   BROKER_EMAIL=broker@example.com BROKER_PASSWORD=... \
 *   npm run test:e2e -- e2e/journey/admin-moderation.spec.ts
 *
 * This file is intentionally NOT included in the smoke Playwright project.
 * It runs under the full project only (all e2e/**\/*.spec.ts).
 */

import { test, expect } from '@playwright/test';
import { hasRealCredentials } from '../helpers';

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const BACKEND = process.env.BACKEND_BASE_URL ?? 'https://udupi-property-explorer.onrender.com';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? '';
const BROKER_EMAIL = process.env.BROKER_EMAIL ?? process.env.DEALER_EMAIL ?? '';
const BROKER_PASSWORD = process.env.BROKER_PASSWORD ?? process.env.DEALER_PASSWORD ?? '';

// ---------------------------------------------------------------------------
// Credential guard — all tests in this suite require admin + broker creds
// ---------------------------------------------------------------------------

const hasAllCreds = hasRealCredentials(
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  BROKER_EMAIL,
  BROKER_PASSWORD,
  SUPABASE_URL,
  SUPABASE_KEY,
);

// ---------------------------------------------------------------------------
// Module-level state shared across tests and beforeAll/afterAll
// ---------------------------------------------------------------------------

let listingAId: string | null = null; // for AM1 (approve)
let listingBId: string | null = null; // for AM2 (reject)

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/** Decode the `sub` claim (user UUID) from a JWT without verifying signature. */
function getUserIdFromToken(token: string): string {
  const payload = token.split('.')[1] ?? '';
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as { sub?: string };
  return decoded.sub ?? '';
}

/**
 * Obtain a Supabase access token via the password grant.
 * Returns null on any failure rather than throwing.
 * Used only in beforeAll/afterAll fixture setup — never inside test step bodies.
 */
async function getToken(email: string, password: string): Promise<string | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

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
      console.log(`[AM] Supabase auth failed (${res.status}): ${text}`);
      return null;
    }

    const data = (await res.json()) as { access_token?: string };
    return data.access_token ?? null;
  } catch (err) {
    clearTimeout(timer);
    console.log(`[AM] Supabase auth request threw: ${String(err)}`);
    return null;
  }
}

/**
 * Create a listing as broker and submit it to PENDING_REVIEW.
 * Follows the same steps as global-setup.ts:
 *   1. POST /api/listings (with locality)
 *   2. PUT /api/listings/{id} — set addressConfirmed=true
 *   3. POST /api/listings/{id}/images × 3 — stub image metadata
 *   4. POST /api/listings/{id}/submit
 * Returns the listing ID on success, null on any failure.
 */
async function createAndSubmitListing(
  brokerToken: string,
  title: string,
): Promise<string | null> {
  const brokerUserId = getUserIdFromToken(brokerToken);

  // Step 1: create draft
  let listingId: string | null = null;
  try {
    const createRes = await fetch(`${BACKEND}/api/listings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${brokerToken}`,
      },
      body: JSON.stringify({
        title,
        propertyType: 'house',
        listingType: 'sale',
        price: 1_000_000,
        locality: 'Udupi',
      }),
    });
    if (!createRes.ok) {
      const text = await createRes.text().catch(() => '<unreadable>');
      console.log(`[AM beforeAll] POST /api/listings failed (${createRes.status}): ${text}`);
      return null;
    }
    const created = (await createRes.json()) as { id?: string };
    listingId = created.id ?? null;
    if (!listingId) {
      console.log('[AM beforeAll] POST /api/listings returned no id');
      return null;
    }
  } catch (err) {
    console.log(`[AM beforeAll] POST /api/listings threw: ${String(err)}`);
    return null;
  }

  // Step 2: set addressConfirmed=true (required for submission)
  try {
    const putRes = await fetch(`${BACKEND}/api/listings/${listingId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${brokerToken}`,
      },
      body: JSON.stringify({ addressConfirmed: true }),
    });
    if (!putRes.ok) {
      const text = await putRes.text().catch(() => '<unreadable>');
      console.log(`[AM beforeAll] PUT addressConfirmed failed (${putRes.status}): ${text}`);
      return listingId; // return ID so afterAll can clean up
    }
  } catch (err) {
    console.log(`[AM beforeAll] PUT addressConfirmed threw: ${String(err)}`);
    return listingId;
  }

  // Step 3: register 3 stub images (metadata only — no real file upload)
  const stubImages = ['img-1.jpg', 'img-2.jpg', 'img-3.jpg'];
  let imagesRegistered = 0;
  for (const filename of stubImages) {
    const storagePath = `listings/${brokerUserId}/${listingId}/${filename}`;
    try {
      const imgRes = await fetch(`${BACKEND}/api/listings/${listingId}/images`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${brokerToken}`,
        },
        body: JSON.stringify({ storagePath, url: `https://placeholder.invalid/${filename}` }),
      });
      if (imgRes.ok || imgRes.status === 409) {
        imagesRegistered++;
      } else {
        const text = await imgRes.text().catch(() => '<unreadable>');
        console.log(`[AM beforeAll] Register image ${filename} failed (${imgRes.status}): ${text}`);
      }
    } catch (err) {
      console.log(`[AM beforeAll] Register image ${filename} threw: ${String(err)}`);
    }
  }
  if (imagesRegistered < 3) {
    console.log(`[AM beforeAll] Only ${imagesRegistered}/3 images registered — submit may fail`);
  }

  // Step 4: submit to PENDING_REVIEW
  try {
    const submitRes = await fetch(`${BACKEND}/api/listings/${listingId}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${brokerToken}` },
    });
    if (!submitRes.ok) {
      const text = await submitRes.text().catch(() => '<unreadable>');
      console.log(`[AM beforeAll] POST /api/listings/${listingId}/submit failed (${submitRes.status}): ${text}`);
      // Return the ID anyway so afterAll can still delete it
      return listingId;
    }
    console.log(`[AM beforeAll] Created and submitted listing ${listingId} ("${title}")`);
    return listingId;
  } catch (err) {
    console.log(`[AM beforeAll] POST /api/listings/${listingId}/submit threw: ${String(err)}`);
    return listingId;
  }
}

// ---------------------------------------------------------------------------
// AM1, AM2, AM3 — serial test suite
// ---------------------------------------------------------------------------

test.describe('AM — Admin moderation UI journey', () => {
  test.describe.configure({ mode: 'serial' });

  // AM1 and AM2 use admin storageState. AM3 overrides with broker context manually.
  test.use({ storageState: 'e2e/fixtures/admin-auth.json' });

  // -------------------------------------------------------------------------
  // beforeAll — create two PENDING_REVIEW listings via broker API
  // -------------------------------------------------------------------------

  test.beforeAll(async () => {
    if (!hasAllCreds) return;

    const brokerToken = await getToken(BROKER_EMAIL, BROKER_PASSWORD);
    if (!brokerToken) {
      console.log('[AM beforeAll] Could not obtain broker token — listings not created');
      return;
    }

    listingAId = await createAndSubmitListing(brokerToken, 'AM Test Listing A');
    listingBId = await createAndSubmitListing(brokerToken, 'AM Test Listing B');

    console.log(`[AM beforeAll] listingAId=${listingAId} listingBId=${listingBId}`);
  });

  // -------------------------------------------------------------------------
  // afterAll — delete both listings via admin API
  // -------------------------------------------------------------------------

  test.afterAll(async () => {
    if (!hasAllCreds) return;

    const adminToken = await getToken(ADMIN_EMAIL, ADMIN_PASSWORD);
    if (!adminToken) {
      console.log('[AM afterAll] Could not obtain admin token — listings not deleted');
      return;
    }

    for (const [label, id] of [['A', listingAId], ['B', listingBId]] as const) {
      if (!id) continue;
      try {
        const res = await fetch(`${BACKEND}/api/admin/listings/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        if (res.ok || res.status === 404) {
          console.log(`[AM afterAll] Deleted listing ${label} (${id})`);
        } else {
          const text = await res.text().catch(() => '<unreadable>');
          console.log(`[AM afterAll] DELETE listing ${label} (${id}) failed (${res.status}): ${text}`);
        }
      } catch (err) {
        console.log(`[AM afterAll] DELETE listing ${label} (${id}) threw: ${String(err)}`);
      }
    }
  });

  // -------------------------------------------------------------------------
  // AM1 — Admin approves listing A via /admin/listings UI
  // -------------------------------------------------------------------------

  test('AM1 — admin approves a pending listing', async ({ page }) => {
    test.skip(!hasAllCreds, 'AM1: admin/broker creds or Supabase keys not set — skipping');
    test.skip(listingAId === null, 'AM1: listing A was not created in beforeAll — skipping');

    await page.goto('/admin/listings/pending');
    await page.waitForLoadState('domcontentloaded');

    // Wait for the pending listings table to render
    await page.waitForSelector('table', { timeout: 15_000 });

    // Find the row containing listing A's title and click its Approve button.
    // The PendingListings table renders listing title text in a TableCell.
    const listingRow = page.locator('tr', { hasText: 'AM Test Listing A' });
    await expect(listingRow).toBeVisible({ timeout: 10_000 });

    await listingRow.getByRole('button', { name: /approve/i }).click();

    // Assert success toast: title is "Listing Approved"
    await expect(
      page.getByText(/listing approved/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Assert the row disappears from the queue after cache invalidation + refetch
    await expect(listingRow).not.toBeVisible({ timeout: 10_000 });
  });

  // -------------------------------------------------------------------------
  // AM2 — Admin rejects listing B via the reject dialog
  // -------------------------------------------------------------------------

  test('AM2 — admin rejects a pending listing via dialog', async ({ page }) => {
    test.skip(!hasAllCreds, 'AM2: admin/broker creds or Supabase keys not set — skipping');
    test.skip(listingBId === null, 'AM2: listing B was not created in beforeAll — skipping');

    await page.goto('/admin/listings/pending');
    await page.waitForLoadState('domcontentloaded');

    // Wait for the pending listings table to render
    await page.waitForSelector('table', { timeout: 15_000 });

    // Find the row containing listing B's title and open the reject dialog
    const listingRow = page.locator('tr', { hasText: 'AM Test Listing B' });
    await expect(listingRow).toBeVisible({ timeout: 10_000 });

    await listingRow.getByRole('button', { name: /reject/i }).click();

    // Wait for the reject dialog to open
    await page.waitForSelector('[role="dialog"]', { timeout: 10_000 });

    // Select a rejection reason from the <Select> component.
    // The SelectTrigger has id="rejection-reason-code"; click it to open the dropdown.
    await page.locator('#rejection-reason-code').click();

    // Pick the first available option in the dropdown
    await page.getByRole('option').first().click();

    // Fill the rejection note textarea (id="rejection-note")
    await page.locator('#rejection-note').fill('Automated E2E rejection note');

    // Click the destructive submit button
    await page.getByRole('button', { name: /reject listing/i }).click();

    // Assert success toast: title is "Listing Rejected"
    await expect(
      page.getByText(/listing rejected/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Assert the row disappears from the queue after cache invalidation + refetch
    await expect(listingRow).not.toBeVisible({ timeout: 10_000 });
  });

  // -------------------------------------------------------------------------
  // AM3 — Broker sees the rejected listing on /broker/listings
  // Uses a separate browser context with broker storageState.
  // -------------------------------------------------------------------------

  test('AM3 — broker sees rejected listing with reason', async ({ browser }) => {
    test.skip(!hasAllCreds, 'AM3: admin/broker creds or Supabase keys not set — skipping');
    test.skip(listingBId === null, 'AM3: listing B was not created in beforeAll — skipping');

    const context = await browser.newContext({
      storageState: 'e2e/fixtures/broker-auth.json',
    });
    const page = await context.newPage();

    try {
      await page.goto('/broker/listings');
      await page.waitForLoadState('domcontentloaded');

      // Wait for auth to settle and page heading to render
      await page.waitForSelector('h1', { timeout: 15_000 });

      // Wait for listings to load (networkidle or the listing card to appear)
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

      // Locate listing B by its title text
      const titleLocator = page.getByText('AM Test Listing B').first();
      await expect(titleLocator).toBeVisible({ timeout: 15_000 });

      // Assert REJECTED status badge is visible near the listing title.
      // BrokerListings renders each listing in a Card with class "overflow-hidden".
      // STATUS_LABELS['REJECTED'] = 'Rejected' is rendered in a <Badge> inside the card.
      const card = page.locator('[class*="overflow-hidden"]').filter({ hasText: 'AM Test Listing B' }).first();
      await expect(
        card.getByText('Rejected', { exact: true }),
      ).toBeVisible({ timeout: 10_000 });

      // Assert rejection reason text is visible.
      // BrokerListings renders: <p>Rejection reason: {listing.rejectionReason}</p>
      await expect(
        card.getByText(/rejection reason/i),
      ).toBeVisible({ timeout: 10_000 });
    } finally {
      await context.close();
    }
  });
});
