/**
 * DL1 — Full broker listing creation journey (residential single-page flow)
 *
 * Issue #1718 rewrite: the residential create flow (ResidentialListingForm,
 * mounted by NewListing.tsx for apartment/house/villa/residential_plot) is now
 * a SINGLE PAGE — there is no more "Save & continue" -> /broker/listings/:id/edit
 * navigation. A DRAFT is persisted inline (POST /api/listings on first "Save
 * draft"/"Review" click), and photos (InlinePhotos -> ImageUploader),
 * location (InlineLocation -> AddressPicker), and nearby places (InlineNearby
 * -> PoiManager) all mount inline against that real listing id, on the same
 * page. Review + submit also happen inline (mode='review' swaps the panel,
 * no route change) followed by an honest "Submitted for review" success panel.
 *
 * This spec drives that real inline flow end-to-end against the REAL backend
 * + shared Supabase for three residential subtypes — House, Villa, and
 * Residential Plot — which is the real validation of the backend submit-gate
 * fix that added villa/residential_plot to SUBMITTABLE_PROPERTY_TYPES
 * (see src/lib/listingStrength.ts).
 *
 * Prerequisites:
 *   - BROKER_EMAIL / BROKER_PASSWORD must be set
 *   - ADMIN_EMAIL / ADMIN_PASSWORD must be set (teardown uses the admin
 *     DELETE endpoint, which works for any listing status, incl. PENDING_REVIEW)
 *   - VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY must be set (token grant)
 *   - e2e/fixtures/flat1.jpg, flat2.jpg, flat3.jpg must exist
 *
 * Teardown (afterEach):
 *   - Admin delete via DELETE /api/admin/listings/{id} — idempotent, works
 *     regardless of listing status (mirrors e2e/global-teardown.ts's primary
 *     path). Failures are logged but do not affect the test result.
 *
 * Run locally:
 *   BROKER_EMAIL=... BROKER_PASSWORD=... ADMIN_EMAIL=... ADMIN_PASSWORD=... \
 *     npm run test:e2e:local -- --project=journey broker-listing-creation.spec.ts
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
// DL1 — Full listing creation journey (residential single-page flow)
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
    // Primary path: admin DELETE works for any listing status, including
    // PENDING_REVIEW (the status these tests leave the listing in on success) —
    // mirrors e2e/global-teardown.ts's primary path, no reject-then-delete
    // dance needed.
    const adminToken = await getToken(ADMIN_EMAIL, ADMIN_PASSWORD).catch(() => null);
    if (!adminToken) {
      console.log('[DL1 teardown] No admin token available — cannot clean up listing', id);
      return;
    }

    try {
      const res = await fetch(`${BACKEND}/api/admin/listings/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (res.ok || res.status === 404) {
        console.log(`[DL1 teardown] Admin deleted listing ${id} (status ${res.status})`);
      } else {
        const text = await res.text().catch(() => '<unreadable>');
        console.log(`[DL1 teardown] Admin delete failed (${res.status}): ${text}`);
      }
    } catch (err) {
      console.log(`[DL1 teardown] Admin delete threw: ${String(err)}`);
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

// ---------------------------------------------------------------------------
// Subtypes under test — covers the real backend submit-gate fix
// (villa/residential_plot newly added to SUBMITTABLE_PROPERTY_TYPES).
// Apartment is intentionally excluded here — it was already submittable
// pre-#1718 and additionally requires bedrooms + built-up area to clear the
// type-specific gate; House/Villa/Residential-Plot is the real regression
// surface for this issue.
// ---------------------------------------------------------------------------

interface Subtype {
  key: 'house' | 'villa' | 'residential_plot';
  radioName: string;
}

const SUBTYPES: readonly Subtype[] = [
  { key: 'house', radioName: 'House' },
  { key: 'villa', radioName: 'Villa' },
  { key: 'residential_plot', radioName: 'Residential Plot' },
];

for (const subtype of SUBTYPES) {
  // @journey
  test(`DL1 — full broker listing creation journey (${subtype.key})`, async ({ page }) => {
    test.setTimeout(120_000);
    test.skip(
      !hasRealCredentials(BROKER_EMAIL, BROKER_PASSWORD),
      'BROKER_EMAIL / BROKER_PASSWORD not set — skipping DL1',
    );

    page.on('console', (msg) => console.log(`[Browser ${msg.type().toUpperCase()}] ${msg.text()}`));
    page.on('pageerror', (err) => console.log('[Browser PAGEERROR]', err.message));
    page.on('response', (res) => {
      if (res.status() >= 400) {
        console.log(`[Browser RESPONSE] ${res.status()} ${res.request().method()} ${res.url()}`);
      }
    });

    // -------------------------------------------------------------------------
    // Section 1 — Property type & purpose (/broker/listings/new lands directly
    // on ResidentialListingForm; default type is Apartment, so pick the subtype
    // under test via its PropertyTypeCardSelector radio card).
    // -------------------------------------------------------------------------

    await page.goto('/broker/listings/new');
    await page.waitForLoadState('domcontentloaded');

    await page.getByRole('radio', { name: subtype.radioName, exact: true }).click();

    // -------------------------------------------------------------------------
    // Sections 2-4 — core facts (locality, title, price) + type-required field
    // -------------------------------------------------------------------------

    await page.locator('#locality').fill('Manipal');
    await page.locator('#title').fill(`E2E Test ${subtype.radioName} — delete me`);
    await page.locator('#price').fill('50 lakh');

    if (subtype.key === 'residential_plot') {
      // Real submit gate (listingStrength.ts) requires landArea + landAreaUnit
      // for residential_plot; landAreaUnit defaults to 'cent' already.
      await page.locator('#plotArea').fill('5');
    }

    // -------------------------------------------------------------------------
    // Persist DRAFT inline via "Save draft" — no navigation. Intercept the
    // real POST /api/listings response to capture the listing id for the
    // rest of the flow + teardown.
    // -------------------------------------------------------------------------

    const createResponsePromise = page.waitForResponse(
      (resp) => /\/api\/listings$/.test(resp.url()) && resp.request().method() === 'POST',
      { timeout: 20_000 },
    );
    await page.getByRole('button', { name: /^save draft$/i }).click();
    const createResponse = await createResponsePromise;
    expect(createResponse.ok(), `POST /api/listings should succeed for ${subtype.key}`).toBeTruthy();

    const created = await createResponse.json() as { id: string };
    createdListingId = created.id;
    console.log(`[DL1:${subtype.key}] Created listing: ${createdListingId}`);

    // -------------------------------------------------------------------------
    // Section 6 — Photos (InlinePhotos -> ImageUploader), mounted inline now
    // that listingId is set. Reuses DL1's original real drag-drop upload
    // approach with real fixture images.
    // -------------------------------------------------------------------------

    const dropZone = page.getByRole('button', { name: /drag & drop images here/i });
    await dropZone.waitFor({ state: 'visible', timeout: 15_000 });

    const [d1, d2, d3] = [
      Array.from(fs.readFileSync(path.join(FIXTURE_DIR, 'flat1.jpg'))),
      Array.from(fs.readFileSync(path.join(FIXTURE_DIR, 'flat2.jpg'))),
      Array.from(fs.readFileSync(path.join(FIXTURE_DIR, 'flat3.jpg'))),
    ];
    await dropZone.evaluate(
      (zone, { bytes1, bytes2, bytes3 }) => {
        const files = [
          new File([new Uint8Array(bytes1)], 'flat1.jpg', { type: 'image/jpeg' }),
          new File([new Uint8Array(bytes2)], 'flat2.jpg', { type: 'image/jpeg' }),
          new File([new Uint8Array(bytes3)], 'flat3.jpg', { type: 'image/jpeg' }),
        ];
        const dt = new DataTransfer();
        files.forEach((f) => dt.items.add(f));
        zone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
      },
      { bytes1: d1, bytes2: d2, bytes3: d3 },
    );

    // Wait for at least one preview thumbnail to confirm upload processing started.
    await expect(page.getByAltText(/^Listing image/).first()).toBeVisible({ timeout: 30_000 });

    // Wait for all 3 uploads to complete and TanStack Query to refetch.
    await expect(page.getByText('3/10 images')).toBeVisible({ timeout: 90_000 });

    // -------------------------------------------------------------------------
    // Section 6 — Location (InlineLocation -> AddressPicker), same section,
    // mounted alongside photos.
    // -------------------------------------------------------------------------

    // Diagnostic: log the real backend geocode proxy response so a genuine
    // Nominatim/network failure (zero results) is distinguishable from a
    // selector bug — AddressPicker.tsx renders a real result <li> with class
    // "cursor-pointer" + an onClick, vs. a plain non-interactive <li> with
    // "No locations found for ..." when the search comes back empty. Clicking
    // whichever <li> happens to render first (old approach) silently no-ops
    // on the "no results" row and never fires handleSelectResult/onConfirm.
    const geocodeResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/geocode?') && resp.request().method() === 'GET',
      { timeout: 15_000 },
    ).catch(() => null);

    await page
      .locator('input[placeholder="Search for a location (e.g. Manipal, Udupi)"]')
      .fill('Manipal, Udupi, Karnataka');

    await expect(page.locator('ul li').first()).toBeVisible({ timeout: 15_000 });

    const geocodeResponse = await geocodeResponsePromise;
    if (geocodeResponse) {
      const body = await geocodeResponse.json().catch(() => '<unparseable>');
      console.log(`[DL1:${subtype.key}] /api/geocode ${geocodeResponse.status()}:`, JSON.stringify(body).slice(0, 500));
    } else {
      console.log(`[DL1:${subtype.key}] /api/geocode response not captured.`);
    }

    // Real, clickable geocode result — excludes the non-interactive
    // "No locations found" row (see AddressPicker.tsx: only real results get
    // the cursor-pointer class + onClick={handleSelectResult}).
    const realResult = page.locator('ul li.cursor-pointer').first();
    const hasRealResult = await realResult.isVisible().catch(() => false);
    if (!hasRealResult) {
      const noResultsText = await page.getByText(/no locations found/i).textContent().catch(() => null);
      throw new Error(
        `[DL1:${subtype.key}] Real geocode search for "Manipal, Udupi, Karnataka" returned no ` +
        `selectable result (backend /api/geocode proxy to Nominatim) — cannot confirm a real ` +
        `location in this environment. Dropdown text: ${noResultsText ?? '<unknown>'}`,
      );
    }

    // Register the real PUT /api/listings/{id} (address confirm) response
    // BEFORE clicking, so the backend write is confirmed before we proceed —
    // the submit gate later depends on the backend's addressConfirmed field,
    // not just AddressPicker's local "confirmed" UI state.
    const confirmResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes(`/api/listings/${createdListingId}`) && resp.request().method() === 'PUT',
      { timeout: 15_000 },
    ).catch(() => null);

    await realResult.click({ timeout: 15_000 });

    await expect(page.getByText('Location confirmed')).toBeVisible({ timeout: 10_000 });
    const confirmResponse = await confirmResponsePromise;
    if (confirmResponse) {
      console.log(`[DL1:${subtype.key}] Address confirm PUT status: ${confirmResponse.status()}`);
      expect(confirmResponse.ok(), 'address-confirm PUT should succeed').toBeTruthy();
    } else {
      console.log(`[DL1:${subtype.key}] Address confirm PUT response not captured — continuing (UI already shows confirmed).`);
    }

    // -------------------------------------------------------------------------
    // Review — clicking "Review" persists any pending edits (PUT) then swaps
    // to the inline review panel. No route change.
    // -------------------------------------------------------------------------

    await page.getByRole('button', { name: /^review$/i }).click();
    await expect(page.getByRole('heading', { name: /review your listing/i })).toBeVisible({ timeout: 15_000 });

    const submitButton = page.getByRole('button', { name: /submit for review/i });
    await expect(submitButton).toBeEnabled({ timeout: 15_000 });

    // -------------------------------------------------------------------------
    // Submit — real POST /api/listings/{id}/submit; assert the honest
    // success state and PENDING_REVIEW status from the real response body.
    // -------------------------------------------------------------------------

    const submitResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes(`/api/listings/${createdListingId}/submit`) && resp.request().method() === 'POST',
      { timeout: 20_000 },
    );
    await submitButton.click();
    const submitResponse = await submitResponsePromise;
    expect(submitResponse.ok(), `POST /api/listings/${createdListingId}/submit should succeed for ${subtype.key}`).toBeTruthy();

    const submitted = await submitResponse.json() as { status: string };
    expect(submitted.status, `${subtype.key} should be PENDING_REVIEW after submit`).toBe('PENDING_REVIEW');

    await expect(page.getByRole('heading', { name: /submitted for review/i })).toBeVisible({ timeout: 15_000 });
    // Honest post-submit copy appears in two spots (status badge + explanatory
    // line); assert the first — the PENDING_REVIEW status itself is already
    // verified from the real submit response body above.
    await expect(page.getByText(/pending admin approval/i).first()).toBeVisible({ timeout: 10_000 });
  });
}
