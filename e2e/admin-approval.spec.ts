/**
 * Admin Approval E2E — #652
 *
 * Verifies the full admin approval action through the UI:
 *   AA1 — PENDING_REVIEW listing is visible in /admin/listings/pending (title match)
 *   AA2 — Admin clicks Approve, listing status changes to LIVE (API verification)
 *   AA3 — Approved listing disappears from the pending queue
 *
 * Prerequisites:
 *   - ADMIN_EMAIL / ADMIN_PASSWORD — admin account
 *   - BROKER_EMAIL / BROKER_PASSWORD (or DEALER_EMAIL / DEALER_PASSWORD) — broker account
 *   - VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY — for API token grant
 *   - BACKEND_BASE_URL — backend API for listing creation + status check
 *   - e2e/fixtures/admin-auth.json (written by global-setup.ts)
 *
 * Placed in full project (not smoke) per Playwright config.
 *
 * Run locally:
 *   bash scripts/run-e2e-local.sh --project=full e2e/admin-approval.spec.ts
 */

import { test, expect } from '@playwright/test';
import { hasRealCredentials } from './helpers';

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

let listingId: string | null = null;
const LISTING_TITLE = `[E2E AA] Approval ${Date.now()}`;

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function getUserIdFromToken(token: string): string {
  const payload = token.split('.')[1] ?? '';
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as { sub?: string };
  return decoded.sub ?? '';
}

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

    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string };
    return data.access_token ?? null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

/**
 * Create a listing as broker and submit it to PENDING_REVIEW.
 * Same pattern as global-setup.ts and admin-moderation.spec.ts:
 *   1. POST /api/listings
 *   2. PUT addressConfirmed=true
 *   3. Register 3 stub images
 *   4. POST /api/listings/{id}/submit
 */
async function createPendingListing(brokerToken: string, title: string): Promise<string | null> {
  const brokerUserId = getUserIdFromToken(brokerToken);

  // 1. Create draft
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
    console.log(`[AA setup] POST /api/listings failed (${createRes.status}): ${text}`);
    return null;
  }
  const created = (await createRes.json()) as { id?: string };
  const id = created.id ?? null;
  if (!id) {
    console.log('[AA setup] POST /api/listings returned no id');
    return null;
  }

  // 2. Set addressConfirmed
  const putRes = await fetch(`${BACKEND}/api/listings/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${brokerToken}`,
    },
    body: JSON.stringify({ addressConfirmed: true }),
  });
  if (!putRes.ok) {
    console.log(`[AA setup] PUT addressConfirmed failed (${putRes.status})`);
    return id; // return for cleanup
  }

  // 3. Register 3 stub images
  for (const filename of ['aa-img1.jpg', 'aa-img2.jpg', 'aa-img3.jpg']) {
    const storagePath = `listings/${brokerUserId}/${id}/${filename}`;
    await fetch(`${BACKEND}/api/listings/${id}/images`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${brokerToken}`,
      },
      body: JSON.stringify({ storagePath, url: `https://placeholder.invalid/${filename}` }),
    }).catch(() => {});
  }

  // 4. Submit for review
  const submitRes = await fetch(`${BACKEND}/api/listings/${id}/submit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${brokerToken}` },
  });
  if (!submitRes.ok) {
    const text = await submitRes.text().catch(() => '<unreadable>');
    console.log(`[AA setup] Submit failed (${submitRes.status}): ${text}`);
    return id; // return for cleanup
  }

  console.log(`[AA setup] Created PENDING_REVIEW listing: ${id} ("${title}")`);
  return id;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe('AA — Admin approval action (#652)', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ storageState: 'e2e/fixtures/admin-auth.json' });

  // -------------------------------------------------------------------------
  // beforeAll — create a PENDING_REVIEW listing via broker API
  // -------------------------------------------------------------------------

  test.beforeAll(async () => {
    if (!hasAllCreds) return;

    const brokerToken = await getToken(BROKER_EMAIL, BROKER_PASSWORD);
    if (!brokerToken) {
      console.log('[AA beforeAll] Could not obtain broker token');
      return;
    }

    listingId = await createPendingListing(brokerToken, LISTING_TITLE);
    console.log(`[AA beforeAll] listingId=${listingId}`);
  });

  // -------------------------------------------------------------------------
  // afterAll — admin force-delete the listing
  // -------------------------------------------------------------------------

  test.afterAll(async () => {
    if (!listingId) return;

    const adminToken = await getToken(ADMIN_EMAIL, ADMIN_PASSWORD);
    if (!adminToken) {
      console.log('[AA afterAll] Could not obtain admin token — listing not deleted');
      return;
    }

    try {
      const res = await fetch(`${BACKEND}/api/admin/listings/${listingId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (res.ok || res.status === 404) {
        console.log(`[AA afterAll] Deleted listing ${listingId}`);
      } else {
        const text = await res.text().catch(() => '<unreadable>');
        console.log(`[AA afterAll] DELETE failed (${res.status}): ${text}`);
      }
    } catch (err) {
      console.log(`[AA afterAll] DELETE threw: ${String(err)}`);
    }
  });

  // -------------------------------------------------------------------------
  // AA1 — PENDING_REVIEW listing visible in pending queue (title match)
  // -------------------------------------------------------------------------

  test('AA1 — pending listing visible in /admin/listings/pending', async ({ page }) => {
    test.skip(!hasAllCreds, 'Admin/broker creds or Supabase keys not set');
    test.skip(listingId === null, 'Listing was not created in beforeAll');
    test.setTimeout(60_000);

    await page.goto('/admin/listings/pending');
    await page.waitForLoadState('domcontentloaded');

    // Wait for the pending listings table to render
    await page.waitForSelector('table', { timeout: 15_000 });

    // Verify our listing appears by title in the pending queue
    const listingRow = page.locator(`tr[data-testid="pending-row-${listingId}"]`);
    await expect(listingRow).toBeVisible({ timeout: 10_000 });

    // Verify the title text is present in the row
    await expect(listingRow.getByText(LISTING_TITLE)).toBeVisible({ timeout: 5_000 });
  });

  // -------------------------------------------------------------------------
  // AA2 — Admin clicks Approve; listing status changes to LIVE
  // -------------------------------------------------------------------------

  test('AA2 — admin approves listing, status becomes LIVE', async ({ page }) => {
    test.skip(!hasAllCreds, 'Admin/broker creds or Supabase keys not set');
    test.skip(listingId === null, 'Listing was not created in beforeAll');
    test.setTimeout(60_000);

    await page.goto('/admin/listings/pending');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('table', { timeout: 15_000 });

    // Find the row by data-testid
    const listingRow = page.locator(`tr[data-testid="pending-row-${listingId}"]`);
    await expect(listingRow).toBeVisible({ timeout: 10_000 });

    // Click Approve button in the row
    await listingRow.getByRole('button', { name: /approve/i }).click();

    // Assert success toast: "Listing Approved"
    await expect(
      page.getByText(/listing approved/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Verify the listing status is now LIVE via backend API
    const adminToken = await getToken(ADMIN_EMAIL, ADMIN_PASSWORD);
    expect(adminToken, 'Could not obtain admin token for API verification').toBeTruthy();

    const statusRes = await fetch(`${BACKEND}/api/listings/${listingId}`, {
      headers: { Authorization: `Bearer ${adminToken!}` },
    });
    expect(statusRes.ok, `GET /api/listings/${listingId} failed (${statusRes.status})`).toBe(true);

    const listing = (await statusRes.json()) as { status?: string };
    expect(listing.status).toBe('LIVE');
  });

  // -------------------------------------------------------------------------
  // AA3 — Approved listing disappears from the pending queue
  // -------------------------------------------------------------------------

  test('AA3 — approved listing no longer in pending queue', async ({ page }) => {
    test.skip(!hasAllCreds, 'Admin/broker creds or Supabase keys not set');
    test.skip(listingId === null, 'Listing was not created in beforeAll');
    test.setTimeout(60_000);

    await page.goto('/admin/listings/pending');
    await page.waitForLoadState('domcontentloaded');

    // Wait for page to settle (either table or empty state)
    await page.waitForSelector('table, .text-muted-foreground', { timeout: 15_000 });

    // The listing row should not be visible (it was approved in AA2)
    const listingRow = page.locator(`tr[data-testid="pending-row-${listingId}"]`);
    await expect(listingRow).not.toBeVisible({ timeout: 10_000 });
  });
});
