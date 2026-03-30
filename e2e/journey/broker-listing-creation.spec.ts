/**
 * DL1 — Full broker listing creation journey
 *
 * Exercises the complete new-listing wizard from /broker/listings/new through
 * all four EditListing steps, including real image upload, address confirmation,
 * and final submission to PENDING_REVIEW status.
 *
 * Prerequisites:
 *   - BROKER_EMAIL / BROKER_PASSWORD must be set
 *   - VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY must be set (token grant)
 *   - e2e/fixtures/flat1.jpg, flat2.jpg, flat3.jpg must exist
 *
 * Teardown (afterEach):
 *   - Admin reject via POST /api/admin/listings/{id}/reject
 *   - Broker delete via DELETE /api/listings/{id}
 *   - Failures are logged but do not affect the test result
 *
 * Run locally:
 *   BROKER_EMAIL=broker@example.com BROKER_PASSWORD=secret npm run test:e2e -- e2e/journey/broker-listing-creation.spec.ts
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { hasRealCredentials } from '../helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BACKEND = process.env.BACKEND_BASE_URL ?? 'https://udupi-property-explorer.onrender.com';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';

const BROKER_EMAIL = process.env.BROKER_EMAIL ?? process.env.DEALER_EMAIL ?? '';
const BROKER_PASSWORD = process.env.BROKER_PASSWORD ?? process.env.DEALER_PASSWORD ?? '';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? '';

const FIXTURE_DIR = path.join(__dirname, '..', 'fixtures');
// fixtures/test-image.jpg — checked-in JPEG for future single-image upload tests (#667 AC)
// Currently unused here; flat1/2/3.jpg cover the 3-image DL1 upload path.

// ---------------------------------------------------------------------------
// Token helper — mirrors global-setup.ts getToken exactly
// ---------------------------------------------------------------------------

async function getToken(email: string, password: string): Promise<string | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.log('[DL1] VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY not set — cannot obtain token.');
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);

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
      console.log(`[DL1] Supabase auth failed (${res.status}): ${text}`);
      return null;
    }

    const data = await res.json() as { access_token?: string };
    return data.access_token ?? null;
  } catch (err) {
    clearTimeout(timer);
    console.log(`[DL1] Supabase auth request threw: ${String(err)}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// DL1 — Full listing creation journey
// ---------------------------------------------------------------------------

test.use({ storageState: 'e2e/fixtures/broker-auth.json' });

let createdListingId: string | null = null;

test.beforeEach(() => {
  createdListingId = null;
});

test.afterEach(async () => {
  if (!createdListingId) {
    console.log('[DL1 teardown] No listing ID captured — nothing to clean up.');
    return;
  }

  const id = createdListingId;
  const CLEANUP_TIMEOUT_MS = 10_000;

  const doCleanup = async (): Promise<void> => {
    // Attempt admin reject so the broker can delete
    let rejected = false;
    const adminToken = await getToken(ADMIN_EMAIL, ADMIN_PASSWORD).catch(() => null);
    if (adminToken) {
      try {
        const rejectRes = await fetch(`${BACKEND}/api/admin/listings/${id}/reject`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({ rejectionReason: 'E2E teardown' }),
        });
        if (rejectRes.ok) {
          rejected = true;
          console.log(`[DL1 teardown] Rejected listing ${id}`);
        } else {
          const text = await rejectRes.text().catch(() => '<unreadable>');
          console.log(`[DL1 teardown] Admin reject failed (${rejectRes.status}): ${text}`);
        }
      } catch (err) {
        console.log(`[DL1 teardown] Admin reject threw: ${String(err)}`);
      }
    } else {
      console.log('[DL1 teardown] No admin token available — skipping reject step.');
    }

    // Broker delete — only attempt if rejection succeeded (backend requires REJECTED status to allow delete)
    if (rejected) {
      const brokerToken = await getToken(BROKER_EMAIL, BROKER_PASSWORD).catch(() => null);
      if (brokerToken) {
        try {
          const deleteRes = await fetch(`${BACKEND}/api/listings/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${brokerToken}` },
          });
          if (deleteRes.ok) {
            console.log(`[DL1 teardown] Deleted listing ${id}`);
          } else {
            const text = await deleteRes.text().catch(() => '<unreadable>');
            console.log(`[DL1 teardown] Broker delete failed (${deleteRes.status}): ${text}`);
          }
        } catch (err) {
          console.log(`[DL1 teardown] Broker delete threw: ${String(err)}`);
        }
      } else {
        console.log('[DL1 teardown] Could not obtain broker token for delete.');
      }
    } else {
      console.log('[DL1 teardown] Reject did not succeed — skipping delete to avoid orphan cleanup failure.');
    }
  };

  await Promise.race([
    doCleanup(),
    new Promise<void>(resolve => {
      setTimeout(() => {
        console.warn('[DL1 teardown] Cleanup timed out after 10 s — moving on.');
        resolve();
      }, CLEANUP_TIMEOUT_MS);
    }),
  ]);
});

test('DL1 — full broker listing creation journey', async ({ page }) => {
  test.setTimeout(120_000);
  test.skip(
    !hasRealCredentials(BROKER_EMAIL, BROKER_PASSWORD),
    'BROKER_EMAIL / BROKER_PASSWORD not set — skipping DL1',
  );

  // -------------------------------------------------------------------------
  // Step 1 — NewListing form at /broker/listings/new
  // -------------------------------------------------------------------------

  // Capture browser console messages for upload diagnostics
  page.on('console', (msg) => console.log(`[Browser ${msg.type().toUpperCase()}] ${msg.text()}`));
  page.on('pageerror', (err) => console.log('[Browser PAGEERROR]', err.message));
  page.on('response', async (res) => {
    const url = res.url();
    if (res.status() >= 400) {
      console.log(`[Browser RESPONSE] ${res.status()} ${res.request().method()} ${url}`);
    }
    // Log geocode responses to diagnose lat/lon NaN issue
    if (url.includes('/api/geocode') && !url.includes('reverse')) {
      try {
        const body = await res.json().catch(() => '<unparseable>');
        console.log(`[DL1 geocode] ${res.status()} body:`, JSON.stringify(body).slice(0, 500));
      } catch { /* ignore */ }
    }
  });

  await page.goto('/broker/listings/new');
  await page.waitForLoadState('domcontentloaded');

  // Select property type "House"
  await page.locator('#propertyType').click();
  await page.getByRole('option', { name: 'House', exact: true }).click();

  // Fill title
  await page.locator('#title').fill('E2E Test House — delete me');

  // Fill price via PriceField text input
  await page.locator('input#price').fill('50 lakh');

  // Submit step 1 (NewListing form)
  await page.getByRole('button', { name: /save & continue/i }).click();

  // Wait for navigation to EditListing URL
  await page.waitForURL(/\/broker\/listings\/.+\/edit/, { timeout: 30_000 });

  // Capture listing ID from URL
  const urlMatch = page.url().match(/\/listings\/([^/]+)\/edit/);
  if (!urlMatch || !urlMatch[1]) {
    throw new Error('DL1: Could not extract listing ID from URL after NewListing submit');
  }
  createdListingId = urlMatch[1];
  console.log(`[DL1] Created listing: ${createdListingId}`);

  // -------------------------------------------------------------------------
  // Step 2 — EditListing step 1: fill locality
  // -------------------------------------------------------------------------

  await page.goto(`/broker/listings/${createdListingId}/edit?step=1`);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('[data-testid="step-1-panel"]')).toBeVisible({ timeout: 15_000 });

  await page.locator('#locality').fill('Manipal');

  // Save & Continue advances to step 2
  await page.locator('button[type="submit"]').click();
  await expect(page.locator('[data-testid="step-2-panel"]')).toBeVisible({ timeout: 15_000 });

  // -------------------------------------------------------------------------
  // Step 3 — Image upload (step 2)
  // -------------------------------------------------------------------------

  // Wait for ImageUploader to finish loading (skeleton → real UI with drop zone)
  const dropZone = page.locator('[data-testid="step-2-panel"] [role="button"]').filter({ hasText: /drag/i });
  await dropZone.waitFor({ state: 'visible', timeout: 15_000 });

  // Simulate a file-drop DragEvent with real File objects.
  //
  // Files are read in Node.js and passed as plain byte arrays (JSON-serialisable);
  // File objects are created inside page.evaluate so they have real content.
  // A native DragEvent is dispatched on the drop zone — this reliably triggers the
  // React onDrop handler in headless Chromium without needing to introspect React
  // internals.
  const [d1, d2, d3] = [
    Array.from(fs.readFileSync(path.join(FIXTURE_DIR, 'flat1.jpg'))),
    Array.from(fs.readFileSync(path.join(FIXTURE_DIR, 'flat2.jpg'))),
    Array.from(fs.readFileSync(path.join(FIXTURE_DIR, 'flat3.jpg'))),
  ];
  await page.evaluate(
    ({ bytes1, bytes2, bytes3, sel }) => {
      const zone = document.querySelector<HTMLElement>(sel);
      console.log('[DL1-eval] drop zone found:', !!zone, 'selector:', sel);
      if (!zone) throw new Error(`Drop zone not found: ${sel}`);

      const files = [
        new File([new Uint8Array(bytes1)], 'flat1.jpg', { type: 'image/jpeg' }),
        new File([new Uint8Array(bytes2)], 'flat2.jpg', { type: 'image/jpeg' }),
        new File([new Uint8Array(bytes3)], 'flat3.jpg', { type: 'image/jpeg' }),
      ];
      console.log('[DL1-eval] created', files.length, 'File objects');

      const dt = new DataTransfer();
      files.forEach(f => dt.items.add(f));
      zone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
      console.log('[DL1-eval] DragEvent dispatched');
    },
    // tabindex="0" uniquely identifies the drop zone vs upload action buttons (Delete/Retry)
    { bytes1: d1, bytes2: d2, bytes3: d3, sel: '[data-testid="step-2-panel"] [role="button"][tabindex="0"]' },
  );

  // Wait for at least one preview thumbnail to confirm upload processing has started
  await expect(
    page.locator('[data-testid="step-2-panel"] img').first(),
  ).toBeVisible({ timeout: 30_000 });

  const step2Text = await page.locator('[data-testid="step-2-panel"]').innerText().catch(() => '<not found>');
  console.log('[DL1] Step-2 panel text (after first thumbnail visible):', step2Text.substring(0, 300));

  // Diagnostic: check Supabase session in localStorage
  const authDiag = await page.evaluate(() => {
    const keys = Object.keys(localStorage).filter(k => k.toLowerCase().includes('auth') || k.toLowerCase().includes('supabase'));
    const session = keys.map(k => ({ key: k, hasValue: !!localStorage.getItem(k)?.length }));
    return { keys: session, totalKeys: Object.keys(localStorage).length };
  });
  console.log('[DL1] Auth localStorage diag:', JSON.stringify(authDiag));

  // Wait for all 3 uploads to complete and TanStack Query to refetch
  await expect(page.getByText('3/10 images')).toBeVisible({ timeout: 90_000 });

  // Advance to step 3
  await page.locator('[data-testid="step-2-panel"] button:has-text("Save & Continue")').click();
  await expect(page.locator('[data-testid="step-3-panel"]')).toBeVisible({ timeout: 15_000 });

  // -------------------------------------------------------------------------
  // Step 4 — Address confirmation (step 3)
  // -------------------------------------------------------------------------

  await page
    .locator('input[placeholder="Search for a location (e.g. Manipal, Udupi)"]')
    .fill('Manipal, Udupi, Karnataka');

  // Wait for the autocomplete dropdown
  await expect(
    page.locator('[data-testid="step-3-panel"] ul li').first(),
  ).toBeVisible({ timeout: 15_000 });

  // Click the first result
  await page.locator('[data-testid="step-3-panel"] ul li').first().click({ timeout: 15_000 });

  // Confirm the green "Location confirmed" indicator appears within step 3
  await expect(
    page.locator('[data-testid="step-3-panel"]').getByText('Location confirmed'),
  ).toBeVisible({ timeout: 10_000 });

  // Advance to step 4
  await page.locator('[data-testid="step-3-panel"] button:has-text("Save & Continue")').click();
  await expect(page.locator('[data-testid="step-4-panel"]')).toBeVisible({ timeout: 15_000 });

  // -------------------------------------------------------------------------
  // Step 5 — Review & Submit (step 4)
  // -------------------------------------------------------------------------

  // All 3 checklist items must show check icons
  await expect(
    page.locator('[data-testid="step-4-panel"] svg.lucide-check'),
  ).toHaveCount(3, { timeout: 10_000 });

  // Submit button must be enabled
  const submitButton = page.getByRole('button', { name: /submit for review/i });
  await expect(submitButton).toBeEnabled({ timeout: 10_000 });

  await submitButton.click();

  // After submission the UI navigates to /broker/listings
  await page.waitForURL(/\/broker\/listings$/, { timeout: 30_000 });

  // The newly submitted listing should appear with "Under Review" badge
  await expect(page.getByText('Under Review').first()).toBeVisible({ timeout: 10_000 });
});
