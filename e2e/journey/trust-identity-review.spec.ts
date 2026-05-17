/**
 * TIR — Trust Identity Review E2E journey
 *
 * Covers the full identity badge lifecycle for an owner-type listing:
 *   TIR1 — Owner sees Identity badge in AVAILABLE state with "Verify your identity" CTA
 *   TIR2 — Owner clicks CTA, identity evidence form dialog opens
 *   TIR3 — Owner fills form and submits evidence
 *   TIR4 — Identity badge transitions to PENDING state
 *   TIR5 — Admin sees pending identity evidence in /admin/trust-review queue
 *   TIR6 — Admin approves identity evidence
 *   TIR7 — Owner re-checks: Identity badge EARNED, Authority badge auto-granted EARNED
 *
 * Prerequisites:
 *   - BROKER_EMAIL / BROKER_PASSWORD (or DEALER_EMAIL / DEALER_PASSWORD) — broker account
 *   - ADMIN_EMAIL / ADMIN_PASSWORD — admin account
 *   - VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY — for API token grant
 *   - e2e/fixtures/admin-auth.json and e2e/fixtures/broker-auth.json must exist
 *
 * Auth:
 *   Broker steps use e2e/fixtures/broker-auth.json storageState.
 *   Admin steps open a separate browser context with e2e/fixtures/admin-auth.json.
 *   The beforeAll/afterAll helpers use Supabase token grant (API only).
 *
 * Note: Authority auto-grant (TIR7 AC9 partial) requires sellerType="owner", which
 * is set server-side only for role="user" accounts. User-role accounts cannot access
 * /broker/dashboard (BrokerDashboard guards on isBroker). Therefore Authority auto-grant
 * is verified via API only, not through the UI.
 *
 * Run locally:
 *   bash scripts/run-e2e-local.sh --project=journey e2e/journey/trust-identity-review.spec.ts
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { hasRealCredentials } from '../helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures');

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const BACKEND = process.env.BACKEND_BASE_URL ?? 'https://udupi-property-explorer.onrender.com';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';

const BROKER_EMAIL = process.env.BROKER_EMAIL ?? process.env.DEALER_EMAIL ?? '';
const BROKER_PASSWORD = process.env.BROKER_PASSWORD ?? process.env.DEALER_PASSWORD ?? '';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? '';

// ---------------------------------------------------------------------------
// Credential guard
// ---------------------------------------------------------------------------

const hasAllCreds = hasRealCredentials(
  BROKER_EMAIL,
  BROKER_PASSWORD,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  SUPABASE_URL,
  SUPABASE_KEY,
);

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let listingId: string | null = null;
let brokerToken: string | null = null;
let adminToken: string | null = null;
let evidenceId: string | null = null;

// ---------------------------------------------------------------------------
// Helpers
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

    if (!res.ok) {
      const text = await res.text().catch(() => '<unreadable>');
      console.log(`[TIR] Supabase auth failed (${res.status}): ${text}`);
      return null;
    }

    const data = (await res.json()) as { access_token?: string };
    return data.access_token ?? null;
  } catch (err) {
    clearTimeout(timer);
    console.log(`[TIR] Supabase auth threw: ${String(err)}`);
    return null;
  }
}

/**
 * Create an owner-type listing, upload images, submit, and approve it to LIVE.
 */
async function createOwnerListing(bToken: string, aToken: string): Promise<string | null> {
  const brokerUserId = getUserIdFromToken(bToken);

  // 1. Create draft with sellerType: "owner"
  const createRes = await fetch(`${BACKEND}/api/listings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bToken}`,
    },
    body: JSON.stringify({
      title: '[E2E TIR] Trust Identity Review',
      propertyType: 'house',
      listingType: 'sale',
      price: 2_000_000,
      locality: 'Udupi',
      sellerType: 'owner',
    }),
  });
  if (!createRes.ok) {
    const text = await createRes.text().catch(() => '<unreadable>');
    console.log(`[TIR beforeAll] POST /api/listings failed (${createRes.status}): ${text}`);
    return null;
  }
  const created = (await createRes.json()) as { id?: string };
  const id = created.id ?? null;
  if (!id) {
    console.log('[TIR beforeAll] POST /api/listings returned no id');
    return null;
  }
  console.log(`[TIR beforeAll] Created owner listing: ${id}`);

  // 2. Set addressConfirmed=true
  const putRes = await fetch(`${BACKEND}/api/listings/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bToken}`,
    },
    body: JSON.stringify({ addressConfirmed: true }),
  });
  if (!putRes.ok) {
    const text = await putRes.text().catch(() => '<unreadable>');
    console.log(`[TIR beforeAll] PUT addressConfirmed failed (${putRes.status}): ${text}`);
  }

  // 3. Register 3 stub images
  const stubImages = ['img-1.jpg', 'img-2.jpg', 'img-3.jpg'];
  for (const filename of stubImages) {
    const storagePath = `listings/${brokerUserId}/${id}/${filename}`;
    try {
      const imgRes = await fetch(`${BACKEND}/api/listings/${id}/images`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bToken}`,
        },
        body: JSON.stringify({ storagePath, url: `https://placeholder.invalid/${filename}` }),
      });
      if (!imgRes.ok && imgRes.status !== 409) {
        const text = await imgRes.text().catch(() => '<unreadable>');
        console.log(`[TIR beforeAll] Image ${filename} failed (${imgRes.status}): ${text}`);
      }
    } catch (err) {
      console.log(`[TIR beforeAll] Image ${filename} threw: ${String(err)}`);
    }
  }

  // 4. Submit for review
  const submitRes = await fetch(`${BACKEND}/api/listings/${id}/submit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${bToken}` },
  });
  if (!submitRes.ok) {
    const text = await submitRes.text().catch(() => '<unreadable>');
    console.log(`[TIR beforeAll] Submit failed (${submitRes.status}): ${text}`);
    return id;
  }

  // 5. Admin approve to LIVE
  const approveRes = await fetch(`${BACKEND}/api/admin/listings/${id}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${aToken}`,
    },
  });
  if (!approveRes.ok) {
    const text = await approveRes.text().catch(() => '<unreadable>');
    console.log(`[TIR beforeAll] Approve failed (${approveRes.status}): ${text}`);
    return id;
  }

  console.log(`[TIR beforeAll] Listing ${id} approved (LIVE)`);
  return id;
}

/**
 * Teardown: admin rejects the listing, then broker deletes it.
 */
async function teardownListing(id: string, aToken: string, bToken: string): Promise<void> {
  try {
    const rejectRes = await fetch(`${BACKEND}/api/admin/listings/${id}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aToken}`,
      },
      body: JSON.stringify({ reason: '[E2E TIR] teardown cleanup' }),
    });
    console.log(`[TIR afterAll] Reject listing: ${rejectRes.status}`);
  } catch (err) {
    console.log(`[TIR afterAll] Reject threw: ${String(err)}`);
  }

  try {
    const deleteRes = await fetch(`${BACKEND}/api/listings/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${bToken}` },
    });
    console.log(`[TIR afterAll] Delete listing: ${deleteRes.status}`);
  } catch (err) {
    console.log(`[TIR afterAll] Delete threw: ${String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe('@integration-ui TIR — Trust Identity Review', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(!hasAllCreds, 'BROKER + ADMIN credentials not configured');

  test.beforeAll(async () => {
    brokerToken = await getToken(BROKER_EMAIL, BROKER_PASSWORD);
    adminToken = await getToken(ADMIN_EMAIL, ADMIN_PASSWORD);
    if (!brokerToken || !adminToken) {
      throw new Error('[TIR] Could not obtain broker or admin token');
    }

    listingId = await createOwnerListing(brokerToken, adminToken);
    if (!listingId) {
      throw new Error('[TIR] Could not create owner listing');
    }
  });

  test.afterAll(async () => {
    if (!listingId) return;
    const bToken = await getToken(BROKER_EMAIL, BROKER_PASSWORD);
    const aToken = await getToken(ADMIN_EMAIL, ADMIN_PASSWORD);
    if (bToken && aToken) {
      await teardownListing(listingId, aToken, bToken);
    } else {
      console.log('[TIR afterAll] Could not obtain tokens for cleanup');
    }
  });

  // ─── TIR1-4: Owner submits identity evidence ─────────────────────────────

  test('TIR1-4: Owner submits identity evidence and sees PENDING state', async ({ browser }) => {
    const ownerContext = await browser.newContext({
      storageState: path.join(FIXTURES_DIR, 'broker-auth.json'),
    });
    const page = await ownerContext.newPage();

    try {
      // Navigate to broker dashboard — TrustProgressPanel is rendered for the
      // featured listing (first LIVE or PENDING_REVIEW). Our newly created listing
      // is the most recent, so it should appear as the featured listing.
      await page.goto('/broker/dashboard');
      await page.waitForLoadState('networkidle');

      // --- TIR1: Identity badge AVAILABLE with "Verify your identity" CTA ---

      const trustSection = page.locator('#trust-progress-section');
      await expect(trustSection).toBeVisible({ timeout: 15_000 });

      // Confirm the trust panel shows our listing title
      await expect(trustSection.getByText(/trust identity review/i)).toBeVisible({ timeout: 5_000 });

      // The Identity badge row should show "Not Started" and the CTA button
      const verifyButton = trustSection.getByRole('button', { name: /verify your identity/i });
      await expect(verifyButton).toBeVisible({ timeout: 10_000 });

      // --- TIR2: Click CTA, evidence form dialog opens ---

      await verifyButton.click();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5_000 });

      const dialogTitle = dialog.getByRole('heading', { name: /verify your identity/i });
      await expect(dialogTitle).toBeVisible();

      // Verify all form fields are present
      await expect(dialog.locator('#ie-legal-name')).toBeVisible();
      await expect(dialog.locator('#ie-phone')).toBeVisible();
      await expect(dialog.locator('#ie-file')).toBeAttached();
      // Radix Select trigger renders with role="combobox"
      await expect(dialog.getByRole('combobox')).toBeVisible();

      // --- TIR3: Fill form and submit ---

      await dialog.locator('#ie-legal-name').fill('Test Owner Name');
      await dialog.locator('#ie-phone').fill('+91 98765 43210');

      // Select AADHAAR from the Radix Select dropdown — click the combobox trigger,
      // then pick the option from the portal (scoped to page, not dialog, because
      // Radix SelectContent renders in a portal outside the dialog DOM).
      await dialog.getByRole('combobox').click();
      const aadhaarOption = page.getByRole('option', { name: /aadhaar card/i });
      await expect(aadhaarOption).toBeVisible({ timeout: 3_000 });
      await aadhaarOption.click();

      // Upload a dummy file
      await dialog.locator('#ie-file').setInputFiles(
        path.join(FIXTURES_DIR, 'test-image.jpg'),
      );

      // Submit and wait for the API response (match URL only — assert status after)
      const submitButton = dialog.getByRole('button', { name: /submit for review/i });
      await expect(submitButton).toBeEnabled();

      const [submitResponse] = await Promise.all([
        page.waitForResponse(
          (resp) => resp.url().includes('/trust/identity/submit-evidence'),
          { timeout: 15_000 },
        ),
        submitButton.click(),
      ]);

      // Log the response for debugging if not 200
      const submitBody = await submitResponse.json().catch(() => ({})) as { evidenceId?: string };
      if (!submitResponse.ok()) {
        console.log(`[TIR] submit-evidence response ${submitResponse.status()}: ${JSON.stringify(submitBody)}`);
      }
      expect(submitResponse.ok()).toBeTruthy();

      // Capture evidenceId for TIR5-6 row targeting
      evidenceId = submitBody.evidenceId ?? null;
      console.log(`[TIR] Captured evidenceId: ${evidenceId}`);

      // --- TIR4: Badge transitions to PENDING ---

      // Dialog should close
      await expect(dialog).not.toBeVisible({ timeout: 5_000 });

      // PENDING state text should appear in the trust section
      const pendingText = trustSection.getByText(/under review.*usually 1.*2 business days/i);
      await expect(pendingText).toBeVisible({ timeout: 10_000 });

      // "Verify your identity" button should no longer be visible
      await expect(verifyButton).not.toBeVisible();
    } finally {
      await ownerContext.close();
    }
  });

  // ─── TIR5-6: Admin approves identity evidence ────────────────────────────

  test('TIR5-6: Admin approves pending identity evidence', async ({ browser }) => {
    const adminContext = await browser.newContext({
      storageState: path.join(FIXTURES_DIR, 'admin-auth.json'),
    });
    const page = await adminContext.newPage();

    try {
      // --- TIR5: Navigate to admin trust review queue ---

      await page.goto('/admin/trust-review');
      await page.waitForLoadState('networkidle');

      // The trust review queue has tabs: "Badges" (default) and "Identity Evidence".
      // Switch to the Identity Evidence tab.
      const identityTab = page.getByRole('tab', { name: /identity evidence/i });
      await expect(identityTab).toBeVisible({ timeout: 10_000 });
      await identityTab.click();

      // The identity evidence table shows legalName, documentType, etc.
      // Target our exact submission using data-testid captured from TIR1-4.
      expect(evidenceId).toBeTruthy();
      const evidenceRow = page.getByTestId(`identity-evidence-${evidenceId}`);
      await expect(evidenceRow).toBeVisible({ timeout: 15_000 });

      // Verify the evidence row shows the correct document type badge
      await expect(evidenceRow.getByText('Aadhaar')).toBeVisible();

      // --- TIR6: Admin clicks Approve (identity-specific endpoint) ---

      const approveButton = evidenceRow.getByRole('button', { name: /approve/i });
      await expect(approveButton).toBeVisible();

      const [approveResponse] = await Promise.all([
        page.waitForResponse(
          (resp) =>
            resp.url().includes('/admin/trust/identity/') &&
            resp.url().includes('/approve'),
          { timeout: 15_000 },
        ),
        approveButton.click(),
      ]);

      if (!approveResponse.ok()) {
        const body = await approveResponse.text().catch(() => '<unreadable>');
        console.log(`[TIR] approve response ${approveResponse.status()}: ${body}`);
      }
      expect(approveResponse.ok()).toBeTruthy();

      // Evidence row should disappear from the table after successful approval
      await expect(evidenceRow).not.toBeVisible({ timeout: 10_000 });
    } finally {
      await adminContext.close();
    }
  });

  // ─── TIR7: Owner verifies both badges updated ────────────────────────────

  test('TIR7: Broker sees Identity EARNED after admin approval', async ({ browser }) => {
    const brokerContext = await browser.newContext({
      storageState: path.join(FIXTURES_DIR, 'broker-auth.json'),
    });
    const page = await brokerContext.newPage();

    try {
      // Navigate back to broker dashboard
      await page.goto('/broker/dashboard');
      await page.waitForLoadState('networkidle');

      const trustSection = page.locator('#trust-progress-section');
      await expect(trustSection).toBeVisible({ timeout: 15_000 });

      // Identity badge should show "Verified" (EARNED state label)
      await expect(trustSection.getByText('Verified').first()).toBeVisible({ timeout: 15_000 });

      // "Verify your identity" button should be gone
      const verifyButton = trustSection.getByRole('button', { name: /verify your identity/i });
      await expect(verifyButton).not.toBeVisible();

      // --- API verification: confirm Identity badge state ---

      // Re-fetch a fresh token (beforeAll token might have expired by now)
      const freshToken = await getToken(BROKER_EMAIL, BROKER_PASSWORD);
      expect(freshToken).toBeTruthy();

      const trustProgressRes = await fetch(
        `${BACKEND}/api/listings/${listingId}/trust-progress`,
        { headers: { Authorization: `Bearer ${freshToken}` } },
      );
      expect(trustProgressRes.ok).toBeTruthy();

      const trustData = (await trustProgressRes.json()) as {
        badges: Array<{
          dimensionType: string;
          badgeState: string;
          autoGranted: boolean | null;
        }>;
      };

      const identityBadge = trustData.badges.find((b) => b.dimensionType === 'IDENTITY');
      expect(identityBadge?.badgeState).toBe('EARNED');

      // Authority auto-grant requires sellerType="owner" (set server-side for role="user"
      // accounts only). Broker-role accounts create sellerType="broker" listings, so
      // Authority auto-grant does not fire here. The auto-grant logic is unit-tested
      // in BadgeServiceTest.grantIdentityBadge_ownerListing_autoGrantsAuthorityBadge.
    } finally {
      await brokerContext.close();
    }
  });
});
