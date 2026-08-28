/**
 * PA — Pending Approvals review (redesigned admin queue) journey tests.
 *
 * Issue #2369 acceptance criterion: "Browser/E2E coverage exercises approve,
 * return-for-edits, reject, stale-conflict and responsive drawer behaviour."
 *
 * Covers:
 *   PA1 — Admin opens the review drawer and approves a pending listing
 *   PA2 — Admin returns a pending listing for edits (checked reason + note)
 *   PA3 — Admin rejects a pending listing with a valid reason code
 *   PA4 — Stale conflict: a second actor processes the listing via the API
 *         while the drawer is open; the UI action surfaces the 409
 *         "already processed" message and the queue refreshes with no
 *         stale row left behind
 *   PA5 — Responsive drawer: at a narrow laptop viewport (1120x800) the
 *         page has no horizontal scroll and the sticky decision bar
 *         (Approve / Return for edits / Reject) is visible without
 *         scrolling inside the drawer
 *   PA1b — Confirmation gate: clicking the sticky-footer Approve / "Reject
 *         listing" buttons only opens an AlertDialog confirmation — the
 *         approve/reject mutation does not fire, and no success toast
 *         appears, until the dialog's own confirm action is clicked
 *
 * Approve/Reject confirmation dialog (added after exact-head review found
 * both actions previously fired directly on the first click): the sticky
 * footer's "Approve" button and the reject panel's "Reject listing" button
 * are now each an AlertDialogTrigger. Clicking them opens a Radix
 * AlertDialog (role="alertdialog") with a `data-testid="confirm-approve-action"`
 * / `data-testid="confirm-reject-action"` AlertDialogAction that performs the
 * actual mutation. PA1, PA3, and PA4 (which ends on a stale Approve click)
 * are updated below to click through that extra confirmation step.
 *
 * Prerequisites (same as e2e/journey/admin-moderation.spec.ts):
 *   - ADMIN_EMAIL / ADMIN_PASSWORD — admin account
 *   - BROKER_EMAIL / BROKER_PASSWORD (or DEALER_EMAIL / DEALER_PASSWORD) — broker account
 *   - VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY — for API token grant in beforeAll/afterAll
 *   - e2e/fixtures/admin-auth.json must exist (written by global-setup.ts)
 *
 * Fixture strategy: each scenario seeds its own PENDING_REVIEW listing via
 * the broker REST API (POST /api/listings → PUT addressConfirmed → POST
 * images ×3 → POST submit), exactly mirroring global-setup.ts /
 * admin-moderation.spec.ts's createAndSubmitListing helper. This avoids any
 * dependency on whatever happens to already be sitting in the shared queue.
 *
 * PA4 (stale-conflict) note: this repo's E2E suite has no fixture for a
 * second concurrent *browser* admin session. Per the task brief's fallback,
 * this test simulates the second actor by calling the approve endpoint
 * directly via fetch (same as global-setup.ts / admin-moderation.spec.ts's
 * own admin API calls) while the drawer for that listing is already open in
 * the test's page — i.e. the UI's in-memory listing object is stale by the
 * time the admin clicks Approve, which is exactly the race the backend's
 * 409 (ListingStatusException) exists to catch.
 *
 * Run locally:
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... BROKER_EMAIL=... BROKER_PASSWORD=... \
 *   npm run test:e2e -- e2e/journey/pending-approvals-review-2369.spec.ts
 *
 * This file is intentionally NOT included in the smoke Playwright project —
 * it runs under 'journey' (testMatch: e2e/journey/**) and 'full'.
 */

import { test, expect, type Page } from '@playwright/test';
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

const hasAllCreds = hasRealCredentials(
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  BROKER_EMAIL,
  BROKER_PASSWORD,
  SUPABASE_URL,
  SUPABASE_KEY,
);

// Unique run suffix so parallel worktree sessions (and repeated local runs)
// never collide on title text when locating a row via `hasText`.
const RUN_ID = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;

// ---------------------------------------------------------------------------
// Fixture helpers (mirrors e2e/global-setup.ts / e2e/journey/admin-moderation.spec.ts)
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
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
      body: JSON.stringify({ email, password }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const text = await res.text().catch(() => '<unreadable>');
      console.log(`[PA] Supabase auth failed (${res.status}): ${text}`);
      return null;
    }
    const data = (await res.json()) as { access_token?: string };
    return data.access_token ?? null;
  } catch (err) {
    clearTimeout(timer);
    console.log(`[PA] Supabase auth request threw: ${String(err)}`);
    return null;
  }
}

/**
 * Create a listing as broker and submit it to PENDING_REVIEW.
 * Returns the listing ID on success, null on any failure.
 */
async function createAndSubmitListing(brokerToken: string, title: string): Promise<string | null> {
  const brokerUserId = getUserIdFromToken(brokerToken);

  let listingId: string | null = null;
  try {
    const createRes = await fetch(`${BACKEND}/api/listings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${brokerToken}` },
      body: JSON.stringify({
        title,
        propertyType: 'house',
        listingType: 'sale',
        price: 1_000_000,
        locality: 'Manipal',
      }),
    });
    if (!createRes.ok) {
      const text = await createRes.text().catch(() => '<unreadable>');
      console.log(`[PA beforeAll] POST /api/listings failed (${createRes.status}): ${text}`);
      return null;
    }
    const created = (await createRes.json()) as { id?: string };
    listingId = created.id ?? null;
    if (!listingId) {
      console.log('[PA beforeAll] POST /api/listings returned no id');
      return null;
    }
  } catch (err) {
    console.log(`[PA beforeAll] POST /api/listings threw: ${String(err)}`);
    return null;
  }

  try {
    const putRes = await fetch(`${BACKEND}/api/listings/${listingId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${brokerToken}` },
      body: JSON.stringify({ addressConfirmed: true }),
    });
    if (!putRes.ok) {
      const text = await putRes.text().catch(() => '<unreadable>');
      console.log(`[PA beforeAll] PUT addressConfirmed failed (${putRes.status}): ${text}`);
      return listingId;
    }
  } catch (err) {
    console.log(`[PA beforeAll] PUT addressConfirmed threw: ${String(err)}`);
    return listingId;
  }

  const stubImages = ['img-1.jpg', 'img-2.jpg', 'img-3.jpg'];
  let imagesRegistered = 0;
  for (const filename of stubImages) {
    const storagePath = `listings/${brokerUserId}/${listingId}/${filename}`;
    try {
      const imgRes = await fetch(`${BACKEND}/api/listings/${listingId}/images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${brokerToken}` },
        body: JSON.stringify({ storagePath, url: `https://placeholder.invalid/${filename}` }),
      });
      if (imgRes.ok || imgRes.status === 409) {
        imagesRegistered++;
      } else {
        const text = await imgRes.text().catch(() => '<unreadable>');
        console.log(`[PA beforeAll] Register image ${filename} failed (${imgRes.status}): ${text}`);
      }
    } catch (err) {
      console.log(`[PA beforeAll] Register image ${filename} threw: ${String(err)}`);
    }
  }
  if (imagesRegistered < 3) {
    console.log(`[PA beforeAll] Only ${imagesRegistered}/3 images registered — submit may fail`);
  }

  try {
    const submitRes = await fetch(`${BACKEND}/api/listings/${listingId}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${brokerToken}` },
    });
    if (!submitRes.ok) {
      const text = await submitRes.text().catch(() => '<unreadable>');
      console.log(`[PA beforeAll] POST /api/listings/${listingId}/submit failed (${submitRes.status}): ${text}`);
      return listingId;
    }
    console.log(`[PA beforeAll] Created and submitted listing ${listingId} ("${title}")`);
    return listingId;
  } catch (err) {
    console.log(`[PA beforeAll] POST /api/listings/${listingId}/submit threw: ${String(err)}`);
    return listingId;
  }
}

async function deleteListing(adminToken: string, label: string, id: string | null): Promise<void> {
  if (!id) return;
  try {
    const res = await fetch(`${BACKEND}/api/admin/listings/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (res.ok || res.status === 404) {
      console.log(`[PA afterAll] Deleted listing ${label} (${id})`);
    } else {
      const text = await res.text().catch(() => '<unreadable>');
      console.log(`[PA afterAll] DELETE listing ${label} (${id}) failed (${res.status}): ${text}`);
    }
  } catch (err) {
    console.log(`[PA afterAll] DELETE listing ${label} (${id}) threw: ${String(err)}`);
  }
}

/**
 * Open the review drawer for a listing row identified by its title text.
 *
 * The queue's table is client-side paginated at 20 rows/page (see
 * PendingListings.tsx TABLE_PAGE_SIZE) and defaults to an "oldest first"
 * sort, so on a shared dev/test backend with many accumulated pending
 * fixtures a freshly-created (newest) listing can sit well past page 1 and
 * never appear in `tr` at all. The queue's own search box (client-side
 * substring match over title/displayId/locality — see
 * pendingApprovalsHelpers.matchesSearch) filters that down to just this
 * fixture's row regardless of queue size or sort order, so use it here
 * rather than relying on pagination/sort to surface the row.
 */
async function openDrawerFor(page: Page, title: string) {
  const searchInput = page.getByPlaceholder('Search title, listing ID, or locality');
  await expect(searchInput).toBeVisible({ timeout: 15_000 });
  await searchInput.fill(title);

  await page.waitForSelector('table', { timeout: 15_000 });
  const row = page.locator('tr', { hasText: title });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole('button', { name: /review/i }).click();
  const drawer = page.getByTestId('listing-review-drawer');
  await expect(drawer).toBeVisible({ timeout: 10_000 });
  await expect(drawer.getByText(title)).toBeVisible();
  return { row, drawer };
}

// ---------------------------------------------------------------------------
// Titles
// ---------------------------------------------------------------------------

const TITLE_APPROVE = `PA2369 Approve ${RUN_ID}`;
const TITLE_RETURN = `PA2369 Return ${RUN_ID}`;
const TITLE_REJECT = `PA2369 Reject ${RUN_ID}`;
const TITLE_STALE = `PA2369 Stale ${RUN_ID}`;
const TITLE_RESPONSIVE = `PA2369 Responsive ${RUN_ID}`;
// Dedicated fixtures for the PA1b confirmation-gate negative assertion —
// kept separate from TITLE_APPROVE / TITLE_REJECT so PA1b never actually
// approves/rejects them; they stay PENDING_REVIEW for the whole run.
const TITLE_APPROVE_GATE = `PA2369 ApproveGate ${RUN_ID}`;
const TITLE_REJECT_GATE = `PA2369 RejectGate ${RUN_ID}`;

let idApprove: string | null = null;
let idReturn: string | null = null;
let idReject: string | null = null;
let idStale: string | null = null;
let idResponsive: string | null = null;
let idApproveGate: string | null = null;
let idRejectGate: string | null = null;

// ---------------------------------------------------------------------------
// PA1–PA5 — serial suite (shared admin session, deterministic titles)
// ---------------------------------------------------------------------------

test.describe('@integration-ui PA — Pending approvals review drawer journey', () => {
  test.describe.configure({ mode: 'serial' });

  test.use({ storageState: 'e2e/fixtures/admin-auth.json' });

  test.beforeAll(async () => {
    if (!hasAllCreds) return;

    const brokerToken = await getToken(BROKER_EMAIL, BROKER_PASSWORD);
    if (!brokerToken) {
      console.log('[PA beforeAll] Could not obtain broker token — listings not created');
      return;
    }

    // Sequential (not parallel) to avoid the pessimistic-lock contention that
    // hits the same backend/DB under rapid concurrent submit calls (RE-164).
    idApprove = await createAndSubmitListing(brokerToken, TITLE_APPROVE);
    idReturn = await createAndSubmitListing(brokerToken, TITLE_RETURN);
    idReject = await createAndSubmitListing(brokerToken, TITLE_REJECT);
    idStale = await createAndSubmitListing(brokerToken, TITLE_STALE);
    idResponsive = await createAndSubmitListing(brokerToken, TITLE_RESPONSIVE);
    idApproveGate = await createAndSubmitListing(brokerToken, TITLE_APPROVE_GATE);
    idRejectGate = await createAndSubmitListing(brokerToken, TITLE_REJECT_GATE);

    console.log(
      `[PA beforeAll] idApprove=${idApprove} idReturn=${idReturn} idReject=${idReject} ` +
        `idStale=${idStale} idResponsive=${idResponsive} idApproveGate=${idApproveGate} ` +
        `idRejectGate=${idRejectGate}`,
    );
  });

  test.afterAll(async () => {
    if (!hasAllCreds) return;
    const adminToken = await getToken(ADMIN_EMAIL, ADMIN_PASSWORD);
    if (!adminToken) {
      console.log('[PA afterAll] Could not obtain admin token — listings not deleted');
      return;
    }
    await deleteListing(adminToken, 'approve', idApprove);
    await deleteListing(adminToken, 'return', idReturn);
    await deleteListing(adminToken, 'reject', idReject);
    await deleteListing(adminToken, 'stale', idStale);
    await deleteListing(adminToken, 'responsive', idResponsive);
    await deleteListing(adminToken, 'approve-gate', idApproveGate);
    await deleteListing(adminToken, 'reject-gate', idRejectGate);
  });

  // -------------------------------------------------------------------------
  // PA1 — Approve
  // -------------------------------------------------------------------------
  test('PA1 — admin opens the drawer and approves a pending listing', async ({ page }) => {
    test.skip(!hasAllCreds, 'PA1: admin/broker creds or Supabase keys not set — skipping');
    test.skip(idApprove === null, 'PA1: listing was not created in beforeAll — skipping');

    await page.goto('/admin/listings/pending');
    await page.waitForLoadState('domcontentloaded');

    const { row, drawer } = await openDrawerFor(page, TITLE_APPROVE);

    // Clicking "Approve" only opens the confirmation dialog — it must not
    // approve the listing on the first click.
    await drawer.getByRole('button', { name: /^approve$/i }).click();

    const confirmDialog = page.getByRole('alertdialog');
    await expect(confirmDialog).toBeVisible({ timeout: 10_000 });
    await expect(confirmDialog.getByRole('heading', { name: /approve this listing\?/i })).toBeVisible();
    await expect(confirmDialog).toContainText(TITLE_APPROVE);

    // Second click, inside the dialog, actually performs the approval.
    await confirmDialog.getByTestId('confirm-approve-action').click();

    await expect(page.getByText(/listing approved/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(drawer).not.toBeVisible({ timeout: 10_000 });
    await expect(row).not.toBeVisible({ timeout: 10_000 });
  });

  // -------------------------------------------------------------------------
  // PA2 — Return for edits
  // -------------------------------------------------------------------------
  test('PA2 — admin returns a pending listing for edits', async ({ page }) => {
    test.skip(!hasAllCreds, 'PA2: admin/broker creds or Supabase keys not set — skipping');
    test.skip(idReturn === null, 'PA2: listing was not created in beforeAll — skipping');

    await page.goto('/admin/listings/pending');
    await page.waitForLoadState('domcontentloaded');

    const { row, drawer } = await openDrawerFor(page, TITLE_RETURN);

    await drawer.getByRole('button', { name: /return for edits/i }).click();

    // Check at least one reason checkbox.
    await drawer.getByRole('checkbox', { name: /incorrect or incomplete details/i }).click();
    await drawer.locator('#drawer-return-note').fill('Automated E2E return-for-edits note');

    await drawer.getByRole('button', { name: /send back to broker/i }).click();

    await expect(page.getByText(/returned for edits/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(drawer).not.toBeVisible({ timeout: 10_000 });
    await expect(row).not.toBeVisible({ timeout: 10_000 });
  });

  // -------------------------------------------------------------------------
  // PA3 — Reject
  // -------------------------------------------------------------------------
  test('PA3 — admin rejects a pending listing with a valid reason code', async ({ page }) => {
    test.skip(!hasAllCreds, 'PA3: admin/broker creds or Supabase keys not set — skipping');
    test.skip(idReject === null, 'PA3: listing was not created in beforeAll — skipping');

    await page.goto('/admin/listings/pending');
    await page.waitForLoadState('domcontentloaded');

    const { row, drawer } = await openDrawerFor(page, TITLE_REJECT);

    await drawer.getByRole('button', { name: /^reject$/i }).click();

    await drawer.locator('#drawer-rejection-code').click();
    await page.getByRole('option').first().click();
    await drawer.locator('#drawer-rejection-note').fill('Automated E2E rejection note');

    // Clicking "Reject listing" only opens the confirmation dialog — it must
    // not reject the listing on the first click.
    await drawer.getByRole('button', { name: /reject listing/i }).click();

    const confirmDialog = page.getByRole('alertdialog');
    await expect(confirmDialog).toBeVisible({ timeout: 10_000 });
    await expect(confirmDialog.getByRole('heading', { name: /reject this listing\?/i })).toBeVisible();
    await expect(confirmDialog).toContainText(TITLE_REJECT);

    // Second click, inside the dialog, actually performs the rejection.
    await confirmDialog.getByTestId('confirm-reject-action').click();

    await expect(page.getByText(/listing rejected/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(drawer).not.toBeVisible({ timeout: 10_000 });
    await expect(row).not.toBeVisible({ timeout: 10_000 });
  });

  // -------------------------------------------------------------------------
  // PA4 — Stale conflict: a second actor processes the listing via the API
  // while the drawer sits open with the now-stale in-memory listing.
  // -------------------------------------------------------------------------
  test('PA4 — stale conflict surfaces "already processed" and refreshes the queue', async ({ page }) => {
    test.skip(!hasAllCreds, 'PA4: admin/broker creds or Supabase keys not set — skipping');
    test.skip(idStale === null, 'PA4: listing was not created in beforeAll — skipping');

    await page.goto('/admin/listings/pending');
    await page.waitForLoadState('domcontentloaded');

    const { row, drawer } = await openDrawerFor(page, TITLE_STALE);

    // Simulate a second admin actor already approving this exact listing
    // out from under the open drawer, via a direct API call (no second
    // browser context is wired up in this suite yet — see file header note).
    const adminToken = await getToken(ADMIN_EMAIL, ADMIN_PASSWORD);
    expect(adminToken, 'PA4: could not obtain a second admin token to simulate the race').not.toBeNull();
    const secondActorRes = await fetch(`${BACKEND}/api/admin/listings/${idStale}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(secondActorRes.ok, 'PA4: second-actor approve call must itself succeed').toBe(true);

    // Now the admin, unaware the listing was already actioned, clicks
    // Approve on the still-open (stale) drawer, confirms in the dialog, and
    // only then hits the backend's 409.
    await drawer.getByRole('button', { name: /^approve$/i }).click();

    const confirmDialog = page.getByRole('alertdialog');
    await expect(confirmDialog).toBeVisible({ timeout: 10_000 });
    await confirmDialog.getByTestId('confirm-approve-action').click();

    await expect(page.getByText(/already processed/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText(/this listing was already processed by another admin/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Drawer must close and the queue must refresh with no stale row left.
    await expect(drawer).not.toBeVisible({ timeout: 10_000 });
    await expect(row).not.toBeVisible({ timeout: 10_000 });
    await expect(page.locator('tr', { hasText: TITLE_STALE })).toHaveCount(0);
  });

  // -------------------------------------------------------------------------
  // PA5 — Responsive drawer at a narrow laptop viewport
  // -------------------------------------------------------------------------
  test('PA5 — drawer has no horizontal scroll/clipping and a visible sticky decision bar at 1120px', async ({
    page,
  }) => {
    test.skip(!hasAllCreds, 'PA5: admin/broker creds or Supabase keys not set — skipping');
    test.skip(idResponsive === null, 'PA5: listing was not created in beforeAll — skipping');

    await page.setViewportSize({ width: 1120, height: 800 });
    await page.goto('/admin/listings/pending');
    await page.waitForLoadState('domcontentloaded');

    const { drawer } = await openDrawerFor(page, TITLE_RESPONSIVE);

    // No horizontal page scroll/clipping at this viewport width.
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(
      overflow.scrollWidth,
      `page scrollWidth (${overflow.scrollWidth}) must not exceed clientWidth (${overflow.clientWidth}) at 1120px`,
    ).toBeLessThanOrEqual(overflow.clientWidth + 1);

    // The sticky decision bar (Approve / Return for edits / Reject) must be
    // visible within the viewport immediately after opening — i.e. without
    // the admin having to scroll the drawer's content.
    const approveButton = drawer.getByRole('button', { name: /^approve$/i });
    const returnButton = drawer.getByRole('button', { name: /return for edits/i });
    const rejectButton = drawer.getByRole('button', { name: /^reject$/i });

    await expect(approveButton).toBeInViewport();
    await expect(returnButton).toBeInViewport();
    await expect(rejectButton).toBeInViewport();
  });

  // -------------------------------------------------------------------------
  // PA1b — Confirmation gate: the first click only opens the dialog; the
  // approve/reject mutation must not fire (and no success toast must
  // appear) until the dialog's own confirm action is clicked.
  // -------------------------------------------------------------------------
  test('PA1b — Approve/Reject buttons open a confirmation dialog and do not call the mutation until confirmed', async ({
    page,
  }) => {
    test.skip(!hasAllCreds, 'PA1b: admin/broker creds or Supabase keys not set — skipping');
    test.skip(
      idApproveGate === null || idRejectGate === null,
      'PA1b: listing(s) were not created in beforeAll — skipping',
    );

    await page.goto('/admin/listings/pending');
    await page.waitForLoadState('domcontentloaded');

    // --- Approve gate -------------------------------------------------------
    let approveCalled = false;
    const onApproveRequest = (req: import('@playwright/test').Request) => {
      if (req.method() === 'POST' && /\/api\/admin\/listings\/[^/]+\/approve$/.test(req.url())) {
        approveCalled = true;
      }
    };
    page.on('request', onApproveRequest);

    const { row: approveRow, drawer: approveDrawer } = await openDrawerFor(page, TITLE_APPROVE_GATE);
    await approveDrawer.getByRole('button', { name: /^approve$/i }).click();

    const approveDialog = page.getByRole('alertdialog');
    await expect(approveDialog).toBeVisible({ timeout: 10_000 });

    // Give any (incorrect) direct-call implementation a moment to fire
    // before asserting its absence.
    await page.waitForTimeout(500);
    expect(approveCalled, 'the approve endpoint must not be called before the dialog is confirmed').toBe(
      false,
    );
    await expect(page.getByText(/listing approved/i)).toHaveCount(0);

    // Dismiss via Cancel — the listing must remain untouched in the queue.
    await approveDialog.getByRole('button', { name: /^cancel$/i }).click();
    await expect(approveDialog).not.toBeVisible({ timeout: 5_000 });
    await expect(approveDrawer).toBeVisible();
    await expect(approveRow).toBeVisible();
    page.off('request', onApproveRequest);

    await page.keyboard.press('Escape');
    await expect(approveDrawer).not.toBeVisible({ timeout: 5_000 });

    // --- Reject gate ----------------------------------------------------------
    let rejectCalled = false;
    const onRejectRequest = (req: import('@playwright/test').Request) => {
      if (req.method() === 'POST' && /\/api\/admin\/listings\/[^/]+\/reject$/.test(req.url())) {
        rejectCalled = true;
      }
    };
    page.on('request', onRejectRequest);

    const { row: rejectRow, drawer: rejectDrawer } = await openDrawerFor(page, TITLE_REJECT_GATE);
    await rejectDrawer.getByRole('button', { name: /^reject$/i }).click();
    await rejectDrawer.locator('#drawer-rejection-code').click();
    await page.getByRole('option').first().click();
    await rejectDrawer.getByRole('button', { name: /reject listing/i }).click();

    const rejectDialog = page.getByRole('alertdialog');
    await expect(rejectDialog).toBeVisible({ timeout: 10_000 });

    await page.waitForTimeout(500);
    expect(rejectCalled, 'the reject endpoint must not be called before the dialog is confirmed').toBe(
      false,
    );
    await expect(page.getByText(/listing rejected/i)).toHaveCount(0);

    await rejectDialog.getByRole('button', { name: /^cancel$/i }).click();
    await expect(rejectDialog).not.toBeVisible({ timeout: 5_000 });
    await expect(rejectDrawer).toBeVisible();
    await expect(rejectRow).toBeVisible();
    page.off('request', onRejectRequest);
  });
});
