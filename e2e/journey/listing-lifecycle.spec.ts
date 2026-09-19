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
 *   L5 — notification bell click navigates to /listing/:id (regression: RE-168 URL fix)
 *   LC1 — LIVE → ARCHIVED → DRAFT re-edit workflow (#586)
 */

import { test, expect } from '@playwright/test';
import { hasRealCredentials } from '../helpers';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const ID_FILE = path.join(__dirname, '..', '.test-listing-id');

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
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';

const brokerEmail    = process.env.BROKER_EMAIL    ?? process.env.DEALER_EMAIL    ?? '';
const brokerPassword = process.env.BROKER_PASSWORD ?? process.env.DEALER_PASSWORD ?? '';
const adminEmail = process.env.ADMIN_EMAIL ?? '';
const adminPassword = process.env.ADMIN_PASSWORD ?? '';
const userEmail = process.env.SMOKE_USER_EMAIL ?? '';
const userPassword = process.env.SMOKE_USER_PASSWORD ?? '';

const hasBrokerCreds = hasRealCredentials(brokerEmail, brokerPassword);
const hasAdminCreds = hasRealCredentials(adminEmail, adminPassword);
const hasUserCreds = hasRealCredentials(userEmail, userPassword);

async function getToken(email: string, password: string): Promise<string | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { access_token?: string };
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

function getUserIdFromToken(token: string): string {
  const payload = token.split('.')[1] ?? '';
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as { sub?: string };
  return decoded.sub ?? '';
}

// ---------------------------------------------------------------------------
// L1, L2, L5 — Broker-authenticated tests
// ---------------------------------------------------------------------------
test.describe('@integration-ui broker-authenticated', () => {
  test.use({ storageState: 'e2e/fixtures/broker-auth.json' });

  // ---------------------------------------------------------------------------
  // L1 — Created listing appears in broker /broker/listings page
  // ---------------------------------------------------------------------------
  test('L1 — created listing appears in broker /broker/listings', async ({ page }) => {
    test.skip(
      !hasBrokerCreds,
      'BROKER_EMAIL / DEALER_EMAIL / DEALER_PASSWORD not set — skipping L1',
    );

    const fixture = readListingFixture();
    test.skip(
      fixture === null,
      'e2e/.test-listing-id not found — global-setup may have skipped listing creation',
    );

    // TypeScript narrowing: fixture is non-null after the skip above
    const { id } = fixture!;

    // #1721: /dealer/listings is not a defined route (only /broker/listings exists in
    // App.tsx) — navigating there now produces a genuine app 404. Navigate directly to
    // the real route the test actually verifies.
    await page.goto('/broker/listings');
    await page.waitForLoadState('domcontentloaded');

    await expect(page).toHaveURL(/\/broker\/listings/, { timeout: 8_000 });

    // ProtectedRoute shows a "Loading..." paragraph while Supabase auth resolves.
    // Wait for it to disappear before asserting listing content.
    await page.waitForSelector('p:has-text("Loading...")', { state: 'hidden', timeout: 15_000 }).catch(() => {});
    // Then wait for the listings API fetch to settle.
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    // The listing card must contain either the UUID or the test title substring.
    // #1721: this used to be a single one-shot `.isVisible().catch()` check with no
    // Playwright auto-retry, racing the broker-listings fetch/render — replaced with a
    // proper polling assertion so a slow (but successful) fetch doesn't false-fail.
    const byIdOrTitle = page
      .locator(`text=${id}`)
      .or(page.locator('text=[E2E Test Listing]'));

    await expect(
      byIdOrTitle.first(),
      `L1: Neither the listing ID (${id}) nor the test title was visible on /broker/listings`,
    ).toBeVisible({ timeout: 15_000 });
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
      !hasBrokerCreds,
      'BROKER_EMAIL / DEALER_EMAIL / DEALER_PASSWORD not set — /listing/:id requires auth; skipping L2',
    );

    const { id } = fixture!;

    // /listing/:id is a ProtectedRoute — must be logged in before navigating.
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

});

// ---------------------------------------------------------------------------
// L3 — User-authenticated tests
// ---------------------------------------------------------------------------
test.describe('user-authenticated', () => {
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

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
    // Log in as user (not broker — "Request Viewing" is for non-broker users).
    await page.goto(`/listing/${id}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('p:has-text("Loading...")', { state: 'hidden', timeout: 15_000 }).catch(() => {});

    await expect(
      page.getByRole('button', { name: /request viewing/i }),
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// L5 — Notification bell click navigates to /listing/:id (RE-168 regression guard)
// ---------------------------------------------------------------------------
test.describe('L5 — broker-authenticated', () => {
  test.use({ storageState: 'e2e/fixtures/broker-auth.json' });

  // ---------------------------------------------------------------------------
  // L5 — Notification bell click navigates to /listing/:id (RE-168 regression guard)
  //
  // Preconditions:
  //   - Listing fixture must be LIVE (admin approved it in global-setup).
  //   - Admin approval fires NotificationEventListener.onListingApproved (@Async,
  //     AFTER_COMMIT), which inserts a "listing_approved" notification for the broker.
  //   - Broker creds required to log in and see the notification bell.
  //
  // This test guards against the URL typo fixed in RE-168:
  //   /listings/${listingId}  →  /listing/${listingId}
  // ---------------------------------------------------------------------------
  test('L5 — notification bell click navigates to /listing/:id', async ({ page }) => {
    const fixture = readListingFixture();
    test.skip(
      fixture === null,
      'e2e/.test-listing-id not found — global-setup may have skipped listing creation',
    );
    test.skip(
      !fixture!.isLive,
      'Listing is not LIVE — listing_approved notification requires admin approval; skipping L5',
    );
    test.skip(
      !hasBrokerCreds,
      'BROKER_EMAIL / BROKER_PASSWORD not set — cannot log in to see notification bell; skipping L5',
    );

    const { id: listingId } = fixture!;

    // Navigate to broker dashboard so the AppLayout (and NotificationBell) renders.
    await page.goto('/broker/dashboard');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('p:has-text("Loading...")', { state: 'hidden', timeout: 15_000 }).catch(() => {});

    // Open the notification bell popover.
    // lucide-react 0.462 renders SVG with class "lucide-bell" (no data-lucide attr).
    const bellButton = page.locator('button').filter({ has: page.locator('svg.lucide-bell') });
    await expect(bellButton).toBeVisible({ timeout: 8_000 });
    await bellButton.click();

    // The "listing_approved" notification for this listing must appear in the popover.
    // The async event listener (@Async + AFTER_COMMIT) may still be landing — poll
    // by waiting for the notification item to become visible within 15 s.
    //
    // LC1's beforeAll may create a newer "listing_approved" notification that appears
    // first (most recent). Filter by the global-setup listing title "[E2E Test Listing]"
    // which appears in the notification message body to ensure we click the correct one.
    const notificationItem = page.locator(
      `button:has-text("[E2E Test Listing]")`,
    ).first();

    await expect(notificationItem).toBeVisible({ timeout: 15_000 });

    // Click the notification — this calls handleClick → navigate(`/listing/${listingId}`)
    await notificationItem.click();

    // Assert we landed on the correct listing detail route.
    // Prior to RE-168 fix this navigated to /listings/:id (404). Now it must be /listing/:id.
    await expect(page).toHaveURL(new RegExp(`/listing/${listingId}`), { timeout: 10_000 });

    // Confirm the listing title is rendered (not an error page).
    await page.waitForSelector('p:has-text("Loading...")', { state: 'hidden', timeout: 15_000 }).catch(() => {});
    await expect(
      page.locator('text=[E2E Test Listing]').first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// LC1 — LIVE → ARCHIVED → DRAFT re-edit workflow (#586)
//
// Self-contained: creates its own LIVE listing via API, then tests the full
// archive → reopen-as-draft → edit lifecycle through the UI.
//
// Preconditions:
//   - BROKER_EMAIL, BROKER_PASSWORD, ADMIN_EMAIL, ADMIN_PASSWORD
//   - VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY
// ---------------------------------------------------------------------------

test.describe('LIVE → ARCHIVED → DRAFT lifecycle (LC1)', () => {
  test.use({ storageState: 'e2e/fixtures/broker-auth.json' });

  let listingId: string | null = null;
  let brokerToken: string | null = null;
  let adminToken: string | null = null;

  test.beforeAll(async () => {
    if (!hasBrokerCreds || !hasAdminCreds) return;

    brokerToken = await getToken(brokerEmail, brokerPassword);
    adminToken = await getToken(adminEmail, adminPassword);
    if (!brokerToken || !adminToken) return;

    const brokerUserId = getUserIdFromToken(brokerToken);

    // 1. Create DRAFT listing
    const createRes = await fetch(`${BACKEND}/api/listings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${brokerToken}` },
      body: JSON.stringify({ propertyType: 'house', title: '[E2E LC1] Archive/Reopen test', price: 5_000_000, locality: 'Manipal' }),
    });
    if (!createRes.ok) { console.log('[LC1] Create failed'); return; }
    const created = await createRes.json() as { id?: string };
    listingId = created.id ?? null;
    if (!listingId) return;
    console.log(`[LC1] Created listing: ${listingId}`);

    // 2. Set addressConfirmed
    await fetch(`${BACKEND}/api/listings/${listingId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${brokerToken}` },
      body: JSON.stringify({ addressConfirmed: true, latitude: 13.35, longitude: 74.79 }),
    });

    // 3. Register 3 stub images (metadata only — same pattern as global-setup)
    for (const fn of ['lc1-img1.jpg', 'lc1-img2.jpg', 'lc1-img3.jpg']) {
      const storagePath = `listings/${brokerUserId}/${listingId}/${fn}`;
      await fetch(`${BACKEND}/api/listings/${listingId}/images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${brokerToken}` },
        body: JSON.stringify({ storagePath }),
      });
    }

    // 4. Submit for review
    const submitRes = await fetch(`${BACKEND}/api/listings/${listingId}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${brokerToken}` },
    });
    if (!submitRes.ok) {
      const text = await submitRes.text().catch(() => '');
      console.log(`[LC1] Submit failed (${submitRes.status}): ${text}`);
      return;
    }

    // 5. Admin approve → LIVE
    const approveRes = await fetch(`${BACKEND}/api/admin/listings/${listingId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    });
    if (!approveRes.ok) {
      const text = await approveRes.text().catch(() => '');
      console.log(`[LC1] Approve failed (${approveRes.status}): ${text}`);
    } else {
      console.log(`[LC1] Listing ${listingId} is now LIVE`);
    }
  });

  test.afterAll(async () => {
    if (!listingId || !adminToken) return;
    // Admin force-delete (works for any status)
    await fetch(`${BACKEND}/api/admin/listings/${listingId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    }).catch(() => {});
    console.log(`[LC1] Cleaned up listing ${listingId}`);
  });

  test('LC1 — Take Offline → Reopen for Editing → Edit', async ({ page }) => {
    test.setTimeout(90_000);
    test.skip(!hasBrokerCreds || !hasAdminCreds, 'Broker + Admin credentials required');
    test.skip(listingId === null, 'LIVE listing could not be created');

    const id = listingId!;

    // --- Phase 1: LIVE listing — "Take Offline" button visible ---
    await page.goto(`/listing/${id}?preview=true`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('p:has-text("Loading...")', { state: 'hidden', timeout: 15_000 }).catch(() => {});

    const takeOfflineBtn = page.getByRole('button', { name: /take offline/i });
    await expect(takeOfflineBtn).toBeVisible({ timeout: 10_000 });

    // Click "Take Offline" → confirmation dialog appears
    await takeOfflineBtn.click();
    await expect(page.getByText(/remove it from public search/i)).toBeVisible({ timeout: 5_000 });

    // Confirm the dialog
    const confirmBtn = page.getByRole('button', { name: /take offline/i }).last();
    await confirmBtn.click();

    // Wait for the toast confirming archive
    await expect(page.getByText(/listing archived/i).first()).toBeVisible({ timeout: 10_000 });

    // --- Phase 2: ARCHIVED listing — "Reopen for Editing" button visible ---
    // Page should update reactively, but reload to ensure fresh state
    await page.goto(`/listing/${id}?preview=true`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('p:has-text("Loading...")', { state: 'hidden', timeout: 15_000 }).catch(() => {});

    // Verify archived banner
    await expect(page.getByText(/archived and not visible/i)).toBeVisible({ timeout: 10_000 });

    const reopenBtn = page.getByRole('button', { name: /reopen for editing/i });
    await expect(reopenBtn).toBeVisible({ timeout: 10_000 });

    // Click "Reopen for Editing"
    await reopenBtn.click();
    await expect(page.getByText(/listing reopened/i).first()).toBeVisible({ timeout: 10_000 });

    // --- Phase 3: DRAFT listing — "Edit Listing" link visible ---
    await page.goto(`/listing/${id}?preview=true`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('p:has-text("Loading...")', { state: 'hidden', timeout: 15_000 }).catch(() => {});

    // Verify draft banner
    await expect(page.getByText(/this listing is a draft/i)).toBeVisible({ timeout: 10_000 });

    // "Edit Listing" link should be visible
    await expect(page.getByRole('link', { name: /edit listing/i })).toBeVisible({ timeout: 5_000 });
  });
});
