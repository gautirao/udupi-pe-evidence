/**
 * E2E coverage for the admin Listings inventory redesign (#2370).
 *
 * Scope (per qa-fast risk assessment):
 *   1. No-implicit-approval boundary — saving a PENDING_REVIEW listing from the
 *      inventory editor must NEVER flip its status (that workflow belongs
 *      exclusively to the separate #2369 Pending Approvals page).
 *   2. Publish/unpublish gating — the publish toggle only ever affects a LIVE
 *      listing's `is_valid` flag, and is disabled for any non-LIVE listing.
 *   3. Deep-link not-found — `?edit=<nonexistent-id>` must show an explicit
 *      "not found" state, never an indefinite spinner, and must close cleanly.
 *   4. Archive/restore + responsive — archiving hides a listing from public
 *      view and moves it to the Archived tab; restoring reverses that; and the
 *      table remains usable (no page-level horizontal scroll, key columns
 *      visible) at a narrower laptop viewport.
 *
 * Fixtures are created directly against the backend/Supabase REST APIs in
 * each test's setup (mirrors e2e/journey/admin-moderation.spec.ts and
 * e2e/journey/admin-duplicates.spec.ts) rather than relying on global-setup's
 * single shared listing, since these flows need listings in specific,
 * mutually exclusive lifecycle states (PENDING_REVIEW, LIVE, DRAFT).
 *
 * Explicitly OUT OF SCOPE: src/pages/admin/PendingListings.tsx (owned by a
 * parallel worker on #2369) is never navigated to or exercised here.
 */

import { test, expect, type Page } from '@playwright/test';
import { hasRealCredentials } from '../helpers';

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

// A syntactically-valid UUID that will never exist as a real listing id.
const NONEXISTENT_LISTING_ID = '00000000-0000-4000-8000-000000000000';

// ---------------------------------------------------------------------------
// Auth + fixture helpers (fetch-based, no Playwright page context needed)
// ---------------------------------------------------------------------------

async function getToken(email: string, password: string): Promise<string | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      console.log(`[2370] Supabase auth failed (${res.status}): ${await res.text().catch(() => '<unreadable>')}`);
      return null;
    }
    const data = (await res.json()) as { access_token?: string };
    return data.access_token ?? null;
  } catch (err) {
    console.log(`[2370] Supabase auth threw: ${String(err)}`);
    return null;
  }
}

function getUserIdFromToken(token: string): string {
  const payload = token.split('.')[1] ?? '';
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as { sub?: string };
  return decoded.sub ?? '';
}

/** Create a minimal DRAFT listing via the backend API and return its ID. */
async function createDraftListing(brokerToken: string, title: string): Promise<string> {
  const res = await fetch(`${BACKEND}/api/listings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${brokerToken}` },
    body: JSON.stringify({
      propertyType: 'house',
      title,
      locality: 'Manipal',
      price: 5_000_000,
      description: 'Auto-created by admin-listings-inventory-2370 E2E spec. Safe to delete.',
    }),
  });
  if (!res.ok) {
    throw new Error(`POST /api/listings failed (${res.status}): ${await res.text().catch(() => '<unreadable>')}`);
  }
  const data = (await res.json()) as { id?: string };
  if (!data.id) throw new Error('POST /api/listings response missing id');
  return data.id;
}

/**
 * Create a listing as broker and submit it to PENDING_REVIEW. Follows the
 * same steps as e2e/global-setup.ts / admin-moderation.spec.ts.
 */
async function createAndSubmitListing(brokerToken: string, title: string): Promise<string> {
  const brokerUserId = getUserIdFromToken(brokerToken);
  const listingId = await createDraftListing(brokerToken, title);

  const putRes = await fetch(`${BACKEND}/api/listings/${listingId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${brokerToken}` },
    body: JSON.stringify({ addressConfirmed: true }),
  });
  if (!putRes.ok) {
    throw new Error(`PUT addressConfirmed failed (${putRes.status}): ${await putRes.text().catch(() => '<unreadable>')}`);
  }

  for (const filename of ['img-1.jpg', 'img-2.jpg', 'img-3.jpg']) {
    const storagePath = `listings/${brokerUserId}/${listingId}/${filename}`;
    const imgRes = await fetch(`${BACKEND}/api/listings/${listingId}/images`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${brokerToken}` },
      body: JSON.stringify({ storagePath, url: `https://placeholder.invalid/${filename}` }),
    });
    if (!imgRes.ok && imgRes.status !== 409) {
      console.log(`[2370] Register image ${filename} failed (${imgRes.status})`);
    }
  }

  const submitRes = await fetch(`${BACKEND}/api/listings/${listingId}/submit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${brokerToken}` },
  });
  if (!submitRes.ok) {
    throw new Error(`POST submit failed (${submitRes.status}): ${await submitRes.text().catch(() => '<unreadable>')}`);
  }
  return listingId;
}

/** Admin-approves a PENDING_REVIEW listing to LIVE. */
async function approveListing(adminToken: string, listingId: string): Promise<void> {
  const res = await fetch(`${BACKEND}/api/admin/listings/${listingId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
  });
  if (!res.ok) {
    throw new Error(`POST approve failed (${res.status}): ${await res.text().catch(() => '<unreadable>')}`);
  }
}

/** Create a fully LIVE + is_valid=true listing (submit -> approve -> force is_valid=true). */
async function createLiveListing(brokerToken: string, adminToken: string, title: string): Promise<string> {
  const listingId = await createAndSubmitListing(brokerToken, title);
  await approveListing(adminToken, listingId);
  // Force is_valid=true regardless of the approve endpoint's default, so the
  // fixture deterministically satisfies "LIVE + is_valid=true" (Supabase REST,
  // same write path the admin session's frontend code uses).
  await patchListingValid(adminToken, listingId, true);
  return listingId;
}

/** Direct Supabase REST read of a listing's status/is_valid — independent of the UI. */
async function getListingRow(
  adminToken: string,
  listingId: string,
): Promise<{ status: string; is_valid: boolean } | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/property_listings?id=eq.${listingId}&select=status,is_valid`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${adminToken}` } },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ status: string; is_valid: boolean }>;
  return rows[0] ?? null;
}

/** Direct Supabase REST write of is_valid — used only for fixture setup, not as the flow under test. */
async function patchListingValid(adminToken: string, listingId: string, isValid: boolean): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/property_listings?id=eq.${listingId}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ is_valid: isValid }),
  });
  if (!res.ok) {
    throw new Error(`PATCH is_valid failed (${res.status}): ${await res.text().catch(() => '<unreadable>')}`);
  }
}

async function forceDeleteListing(adminToken: string, listingId: string): Promise<void> {
  try {
    const res = await fetch(`${BACKEND}/api/admin/listings/${listingId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (!res.ok && res.status !== 404) {
      console.log(`[2370] DELETE listing ${listingId} failed (${res.status}): ${await res.text().catch(() => '<unreadable>')}`);
    }
  } catch (err) {
    console.log(`[2370] DELETE listing ${listingId} threw: ${String(err)}`);
  }
}

/** Opens the inventory editor drawer for a listing via the documented deep-link contract. */
async function openEditorDeepLink(page: Page, listingId: string): Promise<void> {
  await page.goto(`/admin/listings?edit=${listingId}`);
  await page.waitForLoadState('domcontentloaded');
}

const drawer = (page: Page) => page.getByRole('dialog');

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

test.describe('@integration-ui Admin Listings inventory (#2370)', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ storageState: 'e2e/fixtures/admin-auth.json' });

  let adminToken: string | null = null;
  let brokerToken: string | null = null;
  const cleanupIds: string[] = [];

  test.beforeAll(async () => {
    if (!hasAllCreds) return;
    adminToken = await getToken(ADMIN_EMAIL, ADMIN_PASSWORD);
    brokerToken = await getToken(BROKER_EMAIL, BROKER_PASSWORD);
  });

  test.afterAll(async () => {
    if (!hasAllCreds || !adminToken) return;
    for (const id of cleanupIds) {
      await forceDeleteListing(adminToken, id);
    }
  });

  // -------------------------------------------------------------------------
  // 1. No-implicit-approval boundary
  // -------------------------------------------------------------------------
  test('INV1 — saving a PENDING_REVIEW listing never flips its status', async ({ page }) => {
    test.skip(!hasAllCreds, 'INV1: admin/broker creds or Supabase keys not set — skipping');
    test.skip(!adminToken || !brokerToken, 'INV1: could not obtain auth tokens — skipping');

    const title = `INV1 Pending Listing ${Date.now()}`;
    const listingId = await createAndSubmitListing(brokerToken!, title);
    cleanupIds.push(listingId);

    // Sanity: confirm the fixture really is PENDING_REVIEW before testing anything.
    const before = await getListingRow(adminToken!, listingId);
    expect(before?.status).toBe('PENDING_REVIEW');

    await openEditorDeepLink(page, listingId);

    const panel = drawer(page);
    await expect(panel).toBeVisible({ timeout: 15_000 });
    await expect(panel.getByText('PENDING_REVIEW', { exact: true })).toBeVisible();
    await expect(panel.getByText(/awaiting moderation/i)).toBeVisible();
    await expect(panel.getByText(/never approves, rejects, or changes its status/i)).toBeVisible();

    // Edit a plain, non-status field.
    const titleInput = page.locator('#listing-editor-title');
    await expect(titleInput).toBeVisible();
    await titleInput.fill(`${title} (edited)`);

    const saveButton = panel.getByRole('button', { name: 'Save changes' });
    await expect(saveButton).toBeEnabled();
    await saveButton.click();

    // Save succeeded (toast) and the drawer still reports PENDING_REVIEW — the
    // save path never touches `status` (see stripStatusFromUpdate).
    await expect(page.getByText(/listing updated/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(panel.getByText('PENDING_REVIEW', { exact: true })).toBeVisible();
    await expect(panel.getByText(/awaiting moderation/i)).toBeVisible();

    // Independent, non-UI confirmation straight from the database.
    const afterUiSave = await getListingRow(adminToken!, listingId);
    expect(afterUiSave?.status).toBe('PENDING_REVIEW');

    // Close and re-navigate to the inventory's "Pending approval" tab — the
    // listing (with its edited title) must still be there.
    await panel.getByRole('button', { name: 'Cancel' }).click();
    await expect(panel).not.toBeVisible({ timeout: 5_000 });

    await page.goto('/admin/listings?tab=pending');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('tab', { name: /pending approval/i })).toHaveAttribute('data-state', 'active');
    await expect(page.locator('tr', { hasText: `${title} (edited)` })).toBeVisible({ timeout: 15_000 });
  });

  // -------------------------------------------------------------------------
  // 2. Publish/unpublish LIVE-only gating
  // -------------------------------------------------------------------------
  test('INV2 — publish toggle flips is_valid for a LIVE listing and is gated for non-LIVE', async ({ page }) => {
    test.skip(!hasAllCreds, 'INV2: admin/broker creds or Supabase keys not set — skipping');
    test.skip(!adminToken || !brokerToken, 'INV2: could not obtain auth tokens — skipping');

    const liveTitle = `INV2 Live Listing ${Date.now()}`;
    const liveId = await createLiveListing(brokerToken!, adminToken!, liveTitle);
    cleanupIds.push(liveId);

    const pendingTitle = `INV2 Pending Listing ${Date.now()}`;
    const pendingId = await createAndSubmitListing(brokerToken!, pendingTitle);
    cleanupIds.push(pendingId);

    const before = await getListingRow(adminToken!, liveId);
    expect(before).toEqual({ status: 'LIVE', is_valid: true });

    // --- Part A: LIVE listing — unpublish then re-publish ---
    await openEditorDeepLink(page, liveId);
    const panel = drawer(page);
    await expect(panel).toBeVisible({ timeout: 15_000 });

    const toggle = panel.getByRole('switch', { name: /toggle public visibility/i });
    await expect(toggle).toBeEnabled();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(panel.getByText('Public', { exact: true })).toBeVisible();

    await toggle.click();
    await expect(page.getByRole('alertdialog').getByText('Unpublish this listing?')).toBeVisible();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm' }).click();

    await expect(toggle).toHaveAttribute('aria-checked', 'false', { timeout: 10_000 });
    await expect(panel.getByText('Hidden', { exact: true })).toBeVisible();

    const afterUnpublish = await getListingRow(adminToken!, liveId);
    expect(afterUnpublish).toEqual({ status: 'LIVE', is_valid: false });

    await toggle.click();
    await expect(page.getByRole('alertdialog').getByText('Publish this listing?')).toBeVisible();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm' }).click();

    await expect(toggle).toHaveAttribute('aria-checked', 'true', { timeout: 10_000 });
    await expect(panel.getByText('Public', { exact: true })).toBeVisible();

    const afterRepublish = await getListingRow(adminToken!, liveId);
    expect(afterRepublish).toEqual({ status: 'LIVE', is_valid: true });

    await panel.getByRole('button', { name: 'Cancel' }).click();
    await expect(panel).not.toBeVisible({ timeout: 5_000 });

    // --- Part B: non-LIVE (PENDING_REVIEW) listing — toggle is disabled ---
    await openEditorDeepLink(page, pendingId);
    await expect(panel).toBeVisible({ timeout: 15_000 });
    const disabledToggle = panel.getByRole('switch', { name: /toggle public visibility/i });
    await expect(disabledToggle).toBeDisabled();
    await expect(panel.getByText(/only live listings can be published\/unpublished/i)).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 3. Deep-link not-found state
  // -------------------------------------------------------------------------
  test('INV3 — deep-linking a nonexistent listing id shows an explicit not-found state', async ({ page }) => {
    test.skip(!hasAllCreds, 'INV3: admin/broker creds or Supabase keys not set — skipping');

    await openEditorDeepLink(page, NONEXISTENT_LISTING_ID);

    const panel = drawer(page);
    await expect(panel).toBeVisible({ timeout: 15_000 });
    await expect(panel.getByText('Listing not found')).toBeVisible({ timeout: 15_000 });
    await expect(panel.getByText(/deleted, or it's outside the/i)).toBeVisible();

    // It must not be an indefinite spinner: no loading spinner should remain
    // once the not-found state has rendered.
    await expect(panel.locator('.animate-spin')).toHaveCount(0);

    // Closing works cleanly: the panel disappears and the ?edit param is dropped.
    await panel.getByRole('button', { name: 'Close panel' }).click();
    await expect(panel).not.toBeVisible({ timeout: 5_000 });
    await expect(page).not.toHaveURL(/[?&]edit=/);
  });

  // -------------------------------------------------------------------------
  // 4. Archive / restore + responsive
  // -------------------------------------------------------------------------
  test('INV4a — archiving hides a listing from public view; restoring reverses it', async ({ page }) => {
    test.skip(!hasAllCreds, 'INV4a: admin/broker creds or Supabase keys not set — skipping');
    test.skip(!adminToken || !brokerToken, 'INV4a: could not obtain auth tokens — skipping');

    const title = `INV4 Archive Listing ${Date.now()}`;
    const listingId = await createLiveListing(brokerToken!, adminToken!, title);
    cleanupIds.push(listingId);

    const before = await getListingRow(adminToken!, listingId);
    expect(before).toEqual({ status: 'LIVE', is_valid: true });

    await openEditorDeepLink(page, listingId);
    const panel = drawer(page);
    await expect(panel).toBeVisible({ timeout: 15_000 });
    await expect(panel.getByText('Public', { exact: true })).toBeVisible();

    await panel.getByRole('button', { name: /^archive$/i }).click();
    const archiveDialog = page.getByRole('alertdialog').filter({ hasText: 'Archive this listing?' });
    await expect(archiveDialog).toBeVisible();
    await archiveDialog.locator('#archive-reason').fill('Automated E2E archive reason — INV4a');
    await archiveDialog.getByRole('button', { name: /^archive$/i }).click();

    await expect(page.getByText(/listing archived/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(panel.getByText('ARCHIVED', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(panel.getByText('Hidden', { exact: true })).toBeVisible();

    const afterArchive = await getListingRow(adminToken!, listingId);
    expect(afterArchive?.status).toBe('ARCHIVED');
    // isPubliclyVisible requires status === LIVE regardless of is_valid, so an
    // ARCHIVED listing is never publicly visible.
    expect(afterArchive?.status === 'LIVE' && afterArchive?.is_valid === true).toBe(false);

    // Confirm it now lives in the Archived tab of the inventory.
    await panel.getByRole('button', { name: 'Cancel' }).click();
    await expect(panel).not.toBeVisible({ timeout: 5_000 });
    await page.goto('/admin/listings?tab=archived');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('tr', { hasText: title })).toBeVisible({ timeout: 15_000 });

    // Restore it back.
    await openEditorDeepLink(page, listingId);
    await expect(panel).toBeVisible({ timeout: 15_000 });
    await panel.getByRole('button', { name: /restore to draft/i }).click();
    const restoreDialog = page.getByRole('alertdialog').filter({ hasText: 'Restore this listing?' });
    await expect(restoreDialog).toBeVisible();
    await restoreDialog.getByRole('button', { name: 'Restore' }).click();

    await expect(page.getByText(/listing restored to draft/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(panel.getByText('DRAFT', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(panel.getByText('Hidden', { exact: true })).toBeVisible();

    const afterRestore = await getListingRow(adminToken!, listingId);
    expect(afterRestore?.status).toBe('DRAFT');
    expect(afterRestore?.status === 'LIVE' && afterRestore?.is_valid === true).toBe(false);
  });

  test('INV4b — narrower laptop viewport keeps the inventory table usable with no page-level horizontal scroll', async ({
    page,
  }) => {
    test.skip(!hasAllCreds, 'INV4b: admin/broker creds or Supabase keys not set — skipping');
    test.skip(!adminToken || !brokerToken, 'INV4b: could not obtain auth tokens — skipping');

    const title = `INV4b Responsive Listing ${Date.now()}`;
    const listingId = await createLiveListing(brokerToken!, adminToken!, title);
    cleanupIds.push(listingId);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/admin/listings');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('table', { timeout: 15_000 });

    const row = page.locator('tr', { hasText: title });
    await expect(row).toBeVisible({ timeout: 15_000 });

    // No page-level horizontal scroll — the table's own overflow-x container
    // may scroll internally, but <body>/<html> must not.
    const bodyOverflowsViewport = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(bodyOverflowsViewport).toBe(false);

    // Listing identity, lifecycle, visibility, and the Open action stay visible.
    await expect(row.getByText(/^PROP-\d+$/)).toBeVisible();
    await expect(row.getByText('live', { exact: false })).toBeVisible();
    await expect(row.getByText('Public', { exact: true })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Open' })).toBeVisible();
  });
});
