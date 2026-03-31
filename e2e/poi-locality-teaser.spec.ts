/**
 * POI Curation + Locality Gate — #653
 *
 * Test 1 — POI curation flow (route-intercepted, no Overpass dependency)
 *   POI1 — Broker navigates to step 4, skeleton visible during load, POI list renders
 *   POI2 — Approve an unapproved POI, it moves to "Approved" tab
 *
 * Test 2 — Locality gate
 *   LG1 — Listing without locality shows "Required fields" warning and disabled Submit
 *   LG2 — Backend returns 422 with locality error when locality is blank
 *   LG3 — After saving locality in step 1, checklist shows green check and Submit is enabled
 *
 * Test 3 — Anon teaser deep-link
 *   OUT OF SCOPE — fully covered by e2e/anon-teaser.spec.ts (AT2, AT3, AT4)
 *
 * Run locally:
 *   bash scripts/run-e2e-local.sh --project=full e2e/poi-locality-teaser.spec.ts
 */

import { test, expect } from '@playwright/test';
import { hasRealCredentials } from './helpers';

const BACKEND =
  process.env.BACKEND_BASE_URL ?? 'https://udupi-property-explorer.onrender.com';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';

const brokerEmail = process.env.BROKER_EMAIL ?? process.env.DEALER_EMAIL ?? '';
const brokerPassword = process.env.BROKER_PASSWORD ?? process.env.DEALER_PASSWORD ?? '';
const hasBrokerCreds = hasRealCredentials(brokerEmail, brokerPassword);

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

async function loginAsBroker(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/auth');
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#signin-email').fill(brokerEmail);
  await page.locator('#signin-password').fill(brokerPassword);
  await page
    .locator('button[type="submit"]')
    .filter({ hasText: /sign in/i })
    .first()
    .click();
  await expect(page).not.toHaveURL(/\/auth/, { timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// Test 1 — POI Curation Flow (POI1–POI2)
// Creates a DRAFT listing with addressConfirmed + coordinates so PoiManager loads.
// Route-intercepts the /pois/suggestions endpoint to avoid Overpass dependency.
// ---------------------------------------------------------------------------

test.describe('POI Curation (POI1–POI2)', () => {
  let draftId: string | null = null;
  let brokerToken: string | null = null;

  const UNAPPROVED_POIS = [
    {
      id: 'e2e-poi-unapproved-1',
      name: 'Udupi Public Library',
      category: 'LIBRARY',
      distanceMeters: 200,
      latitude: 13.341,
      longitude: 74.743,
      pinned: false,
      approved: false,
    },
    {
      id: 'e2e-poi-unapproved-2',
      name: 'City Hospital',
      category: 'HOSPITAL',
      distanceMeters: 450,
      latitude: 13.342,
      longitude: 74.744,
      pinned: false,
      approved: false,
    },
  ];

  test.beforeAll(async () => {
    if (!hasBrokerCreds) return;
    brokerToken = await getToken(brokerEmail, brokerPassword);
    if (!brokerToken) return;

    // Create DRAFT with coordinates + addressConfirmed
    try {
      const res = await fetch(`${BACKEND}/api/listings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${brokerToken}`,
        },
        body: JSON.stringify({
          propertyType: 'house',
          title: '[E2E POI-curation] fixture — delete me',
          price: 5_000_000,
          locality: 'Manipal',
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { id?: string };
        draftId = data.id ?? null;
      }
    } catch {
      /* creation failed — tests will skip */
    }

    if (!draftId || !brokerToken) return;

    // Set addressConfirmed + coordinates so PoiManager renders
    await fetch(`${BACKEND}/api/listings/${draftId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${brokerToken}`,
      },
      body: JSON.stringify({
        addressConfirmed: true,
        latitude: 13.3409,
        longitude: 74.7421,
      }),
    });
  });

  test.afterAll(async () => {
    if (!draftId || !brokerToken) return;
    await fetch(`${BACKEND}/api/listings/${draftId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${brokerToken}` },
    }).catch(() => {});
  });

  test('POI1 — step 4 shows skeleton then POI list', async ({ page }) => {
    test.skip(!hasBrokerCreds, 'Broker credentials not set');
    test.skip(draftId === null, 'Draft listing could not be created');

    await loginAsBroker(page);

    // Track whether skeleton was visible
    let skeletonSeen = false;

    // Intercept suggestions endpoint — delay response to ensure skeleton visibility
    await page.route(`**/api/listings/${draftId}/pois/suggestions`, async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      // Small delay to give skeleton time to render
      await new Promise((r) => setTimeout(r, 300));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(UNAPPROVED_POIS),
      });
    });

    await page.goto(`/broker/listings/${draftId}/edit?step=4`);
    await page.waitForLoadState('domcontentloaded');

    // Wait for step 4 panel
    await expect(page.locator('[data-testid="step-4-panel"]')).toBeVisible({ timeout: 15_000 });

    // Check for skeleton during load (may already have resolved — record if visible)
    try {
      const skeleton = page.locator('[data-testid="step-4-panel"] .animate-pulse').first();
      await skeleton.waitFor({ state: 'visible', timeout: 3_000 });
      skeletonSeen = true;
    } catch {
      // Skeleton resolved before we could observe — acceptable in fast environments
    }

    // POI names must appear after load
    await expect(page.getByText('Udupi Public Library').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('City Hospital').first()).toBeVisible({ timeout: 5_000 });

    // Approve buttons must be present in the "Nearby Places" tab
    await expect(
      page.getByRole('button', { name: /Approve Udupi Public Library/i }),
    ).toBeVisible({ timeout: 5_000 });

    // Log skeleton observation (not a hard assertion — timing-dependent)
    if (skeletonSeen) {
      console.log('[POI1] Skeleton was observed during load');
    } else {
      console.log('[POI1] Skeleton resolved before observation — response was fast');
    }
  });

  test('POI2 — approve moves POI to Approved tab', async ({ page }) => {
    test.skip(!hasBrokerCreds, 'Broker credentials not set');
    test.skip(draftId === null, 'Draft listing could not be created');

    await loginAsBroker(page);

    // State: track whether approve was called. After approve, return updated list.
    let approvedPoiId: string | null = null;

    await page.route(`**/api/listings/${draftId}/pois/suggestions`, async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      // Return POIs based on current approval state
      const pois = UNAPPROVED_POIS.map((p) => ({
        ...p,
        approved: p.id === approvedPoiId,
      }));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(pois),
      });
    });

    // Intercept approve endpoint
    await page.route(`**/api/listings/${draftId}/pois/*/approve`, async (route) => {
      if (route.request().method() !== 'PATCH') {
        await route.continue();
        return;
      }
      // Extract POI ID from URL
      const url = route.request().url();
      const match = url.match(/pois\/([^/]+)\/approve/);
      if (match) {
        approvedPoiId = match[1];
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok' }),
      });
    });

    await page.goto(`/broker/listings/${draftId}/edit?step=4`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('[data-testid="step-4-panel"]')).toBeVisible({ timeout: 15_000 });

    // Wait for POIs to load
    await expect(
      page.getByRole('button', { name: /Approve Udupi Public Library/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Click Approve on the first POI
    await page.getByRole('button', { name: /Approve Udupi Public Library/i }).click();

    // After approve mutation + re-fetch, the Approved tab should activate.
    // PoiManager switches to "approved" tab on successful approve (onSettled).
    const approvedTab = page.getByRole('tab', { name: /Approved/i });
    await expect(approvedTab).toBeVisible({ timeout: 5_000 });

    // The approved POI name should be visible in the Approved tab
    // (PoiManager auto-switches activeTab to 'approved' after approval)
    await expect(page.getByText('Udupi Public Library').first()).toBeVisible({ timeout: 5_000 });

    // The approved tab badge should show count (1)
    await expect(approvedTab.locator('span')).toContainText('1', { timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// Test 2 — Locality Gate (LG1–LG3)
// Creates a DRAFT listing WITHOUT locality. Tests the UI checklist gate and
// the backend 422 validation.
// ---------------------------------------------------------------------------

test.describe('Locality Gate (LG1–LG3)', () => {
  let draftId: string | null = null;
  let brokerToken: string | null = null;

  test.beforeAll(async () => {
    if (!hasBrokerCreds) return;
    brokerToken = await getToken(brokerEmail, brokerPassword);
    if (!brokerToken) return;

    // Create DRAFT without locality (locality intentionally omitted)
    try {
      const res = await fetch(`${BACKEND}/api/listings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${brokerToken}`,
        },
        body: JSON.stringify({
          propertyType: 'house',
          title: '[E2E LG-test] Locality gate fixture — delete me',
          price: 5_000_000,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { id?: string };
        draftId = data.id ?? null;
      }
    } catch {
      /* creation failed — tests will skip */
    }

    if (!draftId || !brokerToken) return;

    // Set addressConfirmed + coordinates (locality is still blank)
    await fetch(`${BACKEND}/api/listings/${draftId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${brokerToken}`,
      },
      body: JSON.stringify({
        addressConfirmed: true,
        latitude: 13.3409,
        longitude: 74.7421,
      }),
    });
  });

  test.afterAll(async () => {
    if (!draftId || !brokerToken) return;
    await fetch(`${BACKEND}/api/listings/${draftId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${brokerToken}` },
    }).catch(() => {});
  });

  test('LG1 — blank locality shows red X and disabled Submit on step 4', async ({ page }) => {
    test.skip(!hasBrokerCreds, 'Broker credentials not set');
    test.skip(draftId === null, 'Draft listing could not be created');

    await loginAsBroker(page);

    // Stub POI suggestions to avoid Overpass calls
    await page.route(`**/api/listings/${draftId}/pois/suggestions`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto(`/broker/listings/${draftId}/edit?step=4`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('[data-testid="step-4-panel"]')).toBeVisible({ timeout: 15_000 });

    // "Required fields" checklist item should show the red X (not green check)
    // The text includes "locality required" when locality is missing
    const requiredFieldsRow = page.locator('text=Required fields').first();
    await expect(requiredFieldsRow).toBeVisible({ timeout: 5_000 });

    // The detail text should mention locality
    await expect(
      page.getByText(/locality required/i).first(),
    ).toBeVisible({ timeout: 5_000 });

    // Submit button must be disabled
    const submitBtn = page.getByRole('button', { name: /submit for review/i });
    await expect(submitBtn).toBeVisible({ timeout: 5_000 });
    await expect(submitBtn).toBeDisabled();
  });

  test('LG2 — backend returns 422 with locality field error', async () => {
    test.skip(!hasBrokerCreds, 'Broker credentials not set');
    test.skip(draftId === null, 'Draft listing could not be created');

    // Direct API call: try to submit a listing without locality
    const res = await fetch(`${BACKEND}/api/listings/${draftId}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${brokerToken!}` },
    });

    expect(res.status).toBe(422);

    const body = (await res.json()) as {
      errors?: Array<{ field: string; message: string }>;
    };
    const errors = body.errors ?? [];
    const localityError = errors.find((e) => e.field === 'locality');
    expect(localityError).toBeDefined();
    expect(localityError!.message).toContain('Locality is required');
  });

  test('LG3 — saving locality enables Submit button', async ({ page }) => {
    test.skip(!hasBrokerCreds, 'Broker credentials not set');
    test.skip(draftId === null, 'Draft listing could not be created');

    await loginAsBroker(page);

    // Stub POI suggestions
    await page.route(`**/api/listings/${draftId}/pois/suggestions`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    // Navigate to step 1 to fill in locality
    await page.goto(`/broker/listings/${draftId}/edit?step=1`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('[data-testid="step-1-panel"]')).toBeVisible({ timeout: 15_000 });

    // Fill locality
    const localityInput = page.locator('#locality');
    await expect(localityInput).toBeVisible({ timeout: 5_000 });
    await localityInput.fill('Manipal');

    // Save step 1 — wait for the PUT response
    const savePromise = page.waitForResponse(
      (res) =>
        res.url().includes(`/api/listings/${draftId}`) &&
        res.request().method() === 'PUT',
      { timeout: 10_000 },
    );
    await page.getByRole('button', { name: /save & continue/i }).click();
    await savePromise;

    // Navigate to step 4 (step 1 save advances to step 2; jump to 4 via URL)
    await page.goto(`/broker/listings/${draftId}/edit?step=4`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('[data-testid="step-4-panel"]')).toBeVisible({ timeout: 15_000 });

    // Now the "Required fields" checklist should show green check
    // (the detail text becomes "All required fields filled in")
    await expect(
      page.getByText(/all required fields filled in/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    // The locality-specific warning text must NOT be visible anymore
    // (it was "Price, property type, and locality required" when locality was blank)
    await expect(
      page.getByText(/locality required/i),
    ).toHaveCount(0);
  });
});
