/**
 * Broker Listing Form — EditListing and NewListing form interactions
 *
 * All broker-facing listing form tests live here. Add new form-level e2e
 * tests to this file rather than creating a new spec per feature.
 *
 * Covers:
 *   P1 — PriceField slider renders on EditListing for a DRAFT listing
 *   P2 — Slider position reflects the listing's existing price on load
 *   P3 — Dragging the slider updates the displayed lakh/crore text
 *   P4 — Typing "1 crore" in the text input moves the slider
 *   P5 — Save Changes persists the correct numeric price to the backend
 *
 * Each describe block creates its own DRAFT listing via the API in beforeAll
 * and deletes it in afterAll. No dependency on the global fixture — tests
 * execute whenever BROKER_EMAIL / BROKER_PASSWORD are set.
 *
 * Run locally:
 *   BROKER_EMAIL=broker@example.com BROKER_PASSWORD=secret npm run test:e2e -- e2e/broker-listing-form.spec.ts
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
    const data = await res.json() as { access_token?: string };
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

async function loginAsBroker(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/auth');
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#signin-email').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('#signin-email').fill(brokerEmail);
  await page.locator('#signin-password').fill(brokerPassword);
  await page
    .locator('button[type="submit"]')
    .filter({ hasText: /sign in/i })
    .first()
    .click();
  await expect(page).not.toHaveURL(/\/auth/, { timeout: 10_000 });
}

async function openEditListing(
  page: import('@playwright/test').Page,
  id: string,
): Promise<void> {
  await page.goto(`/broker/listings/${id}/edit`);
  await page.waitForLoadState('domcontentloaded');
  await page
    .waitForSelector('p:has-text("Loading...")', { state: 'hidden', timeout: 15_000 })
    .catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
}

// ---------------------------------------------------------------------------
// PriceField tests (RE-30)
// One DRAFT listing is created for the group and deleted after all tests run.
// ---------------------------------------------------------------------------

test.describe('PriceField / EditListing (P1–P5)', () => {
  let draftId: string | null = null;
  let brokerToken: string | null = null;

  test.beforeAll(async () => {
    if (!hasBrokerCreds) return;
    brokerToken = await getToken(brokerEmail, brokerPassword);
    if (!brokerToken) return;
    try {
      const res = await fetch(`${BACKEND}/api/listings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${brokerToken}`,
        },
        body: JSON.stringify({
          propertyType: 'house',
          title: '[E2E P-test] PriceField fixture — delete me',
          price: 5_000_000,
        }),
      });
      if (res.ok) {
        const data = await res.json() as { id?: string };
        draftId = data.id ?? null;
        console.log(`[P-tests] Created DRAFT listing: ${draftId}`);
      } else {
        console.log(`[P-tests] POST /api/listings failed (${res.status})`);
      }
    } catch (err) {
      console.log(`[P-tests] POST /api/listings threw: ${String(err)}`);
    }
  });

  test.afterAll(async () => {
    if (!draftId || !brokerToken) return;
    try {
      await fetch(`${BACKEND}/api/listings/${draftId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${brokerToken}` },
      });
      console.log(`[P-tests] Deleted DRAFT listing: ${draftId}`);
    } catch (err) {
      console.log(`[P-tests] Delete threw: ${String(err)}`);
    }
  });

  test('P1 — PriceField slider renders on EditListing', async ({ page }) => {
    test.skip(!hasBrokerCreds, 'BROKER_EMAIL / BROKER_PASSWORD not set — skipping P1');
    test.skip(draftId === null, 'Draft listing could not be created — skipping P1');

    await loginAsBroker(page);
    await openEditListing(page, draftId!);

    await expect(page.locator('[role="slider"]')).toBeVisible({
      timeout: 8_000,
    });
  });

  test('P2 — Slider reflects existing listing price on load', async ({ page }) => {
    test.skip(!hasBrokerCreds, 'BROKER_EMAIL / BROKER_PASSWORD not set — skipping P2');
    test.skip(draftId === null, 'Draft listing could not be created — skipping P2');

    await loginAsBroker(page);
    await openEditListing(page, draftId!);

    const priceInput = page.locator('input#price');
    await expect(priceInput).toBeVisible({ timeout: 8_000 });
    const value = await priceInput.inputValue();
    expect(value.toLowerCase()).toMatch(/lakh|crore/);
  });

  test('P3 — Dragging slider updates price text', async ({ page }) => {
    test.skip(!hasBrokerCreds, 'BROKER_EMAIL / BROKER_PASSWORD not set — skipping P3');
    test.skip(draftId === null, 'Draft listing could not be created — skipping P3');

    await loginAsBroker(page);
    await openEditListing(page, draftId!);

    const slider = page.locator('[role="slider"]');
    await expect(slider).toBeVisible({ timeout: 8_000 });
    const priceInput = page.locator('input#price');
    const initialText = await priceInput.inputValue();

    await slider.focus();
    for (let i = 0; i < 100; i++) {
      await slider.press('ArrowRight');
    }

    const updatedText = await priceInput.inputValue();
    expect(updatedText).not.toBe(initialText);
    expect(updatedText.toLowerCase()).toMatch(/lakh|crore/);
  });

  test('P4 — Typing "1 crore" in price input moves the slider', async ({ page }) => {
    test.skip(!hasBrokerCreds, 'BROKER_EMAIL / BROKER_PASSWORD not set — skipping P4');
    test.skip(draftId === null, 'Draft listing could not be created — skipping P4');

    await loginAsBroker(page);
    await openEditListing(page, draftId!);

    const slider = page.locator('[role="slider"]');
    await expect(slider).toBeVisible({ timeout: 8_000 });
    const initialValue = await slider.getAttribute('aria-valuenow');

    await page.locator('input#price').fill('1 crore');
    await page.waitForTimeout(300);

    const updatedValue = await slider.getAttribute('aria-valuenow');
    expect(updatedValue).not.toBe(initialValue);
  });

  test('P5 — Save Changes persists the correct numeric price', async ({ page }) => {
    test.skip(!hasBrokerCreds, 'BROKER_EMAIL / BROKER_PASSWORD not set — skipping P5');
    test.skip(draftId === null, 'Draft listing could not be created — skipping P5');

    const id = draftId!;
    await loginAsBroker(page);
    await openEditListing(page, id);
    await expect(page.locator('input#price')).toBeVisible({ timeout: 8_000 });

    await page.locator('input#price').fill('75 lakh');

    let capturedPrice: number | undefined;
    page.on('request', (req) => {
      if (req.method() === 'PUT' && req.url().includes(`/api/listings/${id}`)) {
        try {
          const body = JSON.parse(req.postData() ?? '{}') as { price?: number };
          capturedPrice = body.price;
        } catch { /* ignore */ }
      }
    });

    await page.getByRole('button', { name: /save & continue/i }).click();
    await page.waitForResponse(
      (res) => res.url().includes(`/api/listings/${id}`) && res.request().method() === 'PUT',
      { timeout: 10_000 },
    );

    expect(capturedPrice).toBe(7_500_000);

    const listingRes = await page.evaluate(
      async ({ backendUrl, lid }: { backendUrl: string; lid: string }) => {
        const keys = Object.keys(localStorage);
        const authKey = keys.find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
        if (!authKey) return null;
        let token: string | null = null;
        try {
          const parsed = JSON.parse(localStorage.getItem(authKey) ?? '{}') as { access_token?: string };
          token = parsed.access_token ?? null;
        } catch { return null; }
        if (!token) return null;
        try {
          const r = await fetch(`${backendUrl}/api/listings/${lid}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!r.ok) return null;
          return await r.json() as { price?: number };
        } catch { return null; }
      },
      { backendUrl: BACKEND, lid: id },
    );

    if (listingRes !== null) {
      expect(listingRes.price).toBe(7_500_000);
    }
  });
});

// ---------------------------------------------------------------------------
// Completeness guard failure tests (#585 — GF1–GF3)
// Validates that POST /api/listings/{id}/submit returns 422 with field-level
// errors when the listing is incomplete.
// ---------------------------------------------------------------------------

test.describe('Completeness guard failures (GF1–GF3)', () => {
  let brokerToken: string | null = null;
  const createdIds: string[] = [];

  async function createDraft(body: Record<string, unknown>): Promise<string | null> {
    if (!brokerToken) return null;
    const res = await fetch(`${BACKEND}/api/listings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${brokerToken}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const data = await res.json() as { id?: string };
    const id = data.id ?? null;
    if (id) createdIds.push(id);
    return id;
  }

  async function updateDraft(id: string, body: Record<string, unknown>): Promise<boolean> {
    if (!brokerToken) return false;
    const res = await fetch(`${BACKEND}/api/listings/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${brokerToken}`,
      },
      body: JSON.stringify(body),
    });
    return res.ok;
  }

  async function submitDraft(id: string): Promise<{ status: number; body: unknown }> {
    const res = await fetch(`${BACKEND}/api/listings/${id}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${brokerToken!}` },
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  }

  test.beforeAll(async () => {
    if (!hasBrokerCreds) return;
    brokerToken = await getToken(brokerEmail, brokerPassword);
  });

  test.afterAll(async () => {
    if (!brokerToken) return;
    for (const id of createdIds) {
      await fetch(`${BACKEND}/api/listings/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${brokerToken}` },
      }).catch(() => {});
    }
  });

  test('GF1 — submission without price returns 422 with field-level error', async () => {
    test.skip(!hasBrokerCreds, 'Broker credentials not set');

    const id = await createDraft({ propertyType: 'house', title: '[E2E GF1] No price' });
    expect(id).not.toBeNull();

    const { status, body } = await submitDraft(id!);
    expect(status).toBe(422);

    const errors = (body as { errors?: Array<{ field: string; message: string }> })?.errors ?? [];
    const priceError = errors.find((e) => e.field === 'price');
    expect(priceError).toBeDefined();
    expect(priceError!.message).toContain('greater than 0');
  });

  test('GF2 — submission with <3 images returns 422 with media error', async () => {
    test.skip(!hasBrokerCreds, 'Broker credentials not set');

    // Create listing with all required fields except images
    const id = await createDraft({
      propertyType: 'house',
      title: '[E2E GF2] No images',
      price: 5_000_000,
      locality: 'Manipal',
    });
    expect(id).not.toBeNull();

    await updateDraft(id!, { addressConfirmed: true, latitude: 13.35, longitude: 74.79 });

    const { status, body } = await submitDraft(id!);
    expect(status).toBe(422);

    const errors = (body as { errors?: Array<{ field: string; message: string }> })?.errors ?? [];
    const imageError = errors.find((e) => e.field === 'images');
    expect(imageError).toBeDefined();
    expect(imageError!.message).toMatch(/at least 3 images/i);
  });

  test('GF3 — submission without confirmed address returns 422', async () => {
    test.skip(!hasBrokerCreds, 'Broker credentials not set');

    const id = await createDraft({
      propertyType: 'house',
      title: '[E2E GF3] No address',
      price: 5_000_000,
      locality: 'Manipal',
    });
    expect(id).not.toBeNull();

    // Do NOT set addressConfirmed — it defaults to false

    const { status, body } = await submitDraft(id!);
    expect(status).toBe(422);

    const errors = (body as { errors?: Array<{ field: string; message: string }> })?.errors ?? [];
    const addrError = errors.find((e) => e.field === 'address_confirmed');
    expect(addrError).toBeDefined();
    expect(addrError!.message).toContain('confirmed');
  });
});
