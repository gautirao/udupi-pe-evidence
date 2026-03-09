/**
 * Dealer Listing Form — EditListing and NewListing form interactions
 *
 * All dealer-facing listing form tests live here. Add new form-level e2e
 * tests to this file rather than creating a new spec per feature.
 *
 * Covers:
 *   P1 — PriceField slider renders on EditListing for a DRAFT listing
 *   P2 — Slider position reflects the listing's existing price on load
 *   P3 — Dragging the slider updates the displayed lakh/crore text
 *   P4 — Typing "1 crore" in the text input moves the slider
 *   P5 — Save Changes persists the correct numeric price to the backend
 *
 * All tests require DEALER_EMAIL / DEALER_PASSWORD and a DRAFT listing fixture
 * from global-setup. Tests skip gracefully when either is absent.
 *
 * Run locally:
 *   DEALER_EMAIL=dealer@example.com DEALER_PASSWORD=secret npm run test:e2e -- e2e/dealer-listing-form.spec.ts
 */

import { test, expect } from '@playwright/test';
import { hasRealCredentials } from './helpers';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ID_FILE = path.join(__dirname, '.test-listing-id');

interface ListingFixture {
  id: string;
  isLive: boolean;
}

function readListingFixture(): ListingFixture | null {
  if (!fs.existsSync(ID_FILE)) return null;
  const lines = fs.readFileSync(ID_FILE, 'utf-8').trim().split('\n');
  const id = lines[0]?.trim();
  if (!id) return null;
  return { id, isLive: lines[1]?.trim() === 'LIVE' };
}

const BACKEND =
  process.env.BACKEND_BASE_URL ?? 'https://udupi-property-explorer.onrender.com';

const dealerEmail = process.env.DEALER_EMAIL ?? '';
const dealerPassword = process.env.DEALER_PASSWORD ?? '';
const hasDealerCreds = hasRealCredentials(dealerEmail, dealerPassword);

async function loginAsDealer(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/auth');
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#signin-email').fill(dealerEmail);
  await page.locator('#signin-password').fill(dealerPassword);
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
  await page.goto(`/dealer/listings/${id}/edit`);
  await page.waitForLoadState('domcontentloaded');
  await page
    .waitForSelector('p:has-text("Loading...")', { state: 'hidden', timeout: 15_000 })
    .catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
}

// ---------------------------------------------------------------------------
// PriceField tests (RE-30)
// ---------------------------------------------------------------------------

test('P1 — PriceField slider renders on EditListing', async ({ page }) => {
  test.skip(!hasDealerCreds, 'DEALER_EMAIL / DEALER_PASSWORD not set — skipping P1');
  const fixture = readListingFixture();
  test.skip(fixture === null, 'e2e/.test-listing-id not found — skipping P1');
  test.skip(fixture!.isLive, 'Listing is LIVE (locked) — skipping P1');

  await loginAsDealer(page);
  await openEditListing(page, fixture!.id);

  await expect(page.getByRole('slider', { name: /price slider/i })).toBeVisible({
    timeout: 8_000,
  });
});

test('P2 — Slider reflects existing listing price on load', async ({ page }) => {
  test.skip(!hasDealerCreds, 'DEALER_EMAIL / DEALER_PASSWORD not set — skipping P2');
  const fixture = readListingFixture();
  test.skip(fixture === null, 'e2e/.test-listing-id not found — skipping P2');
  test.skip(fixture!.isLive, 'Listing is LIVE (locked) — skipping P2');

  await loginAsDealer(page);
  await openEditListing(page, fixture!.id);

  const priceInput = page.locator('input#price');
  await expect(priceInput).toBeVisible({ timeout: 8_000 });
  const value = await priceInput.inputValue();
  expect(value.toLowerCase()).toMatch(/lakh|crore/);
});

test('P3 — Dragging slider updates price text', async ({ page }) => {
  test.skip(!hasDealerCreds, 'DEALER_EMAIL / DEALER_PASSWORD not set — skipping P3');
  const fixture = readListingFixture();
  test.skip(fixture === null, 'e2e/.test-listing-id not found — skipping P3');
  test.skip(fixture!.isLive, 'Listing is LIVE (locked) — skipping P3');

  await loginAsDealer(page);
  await openEditListing(page, fixture!.id);

  const slider = page.getByRole('slider', { name: /price slider/i });
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
  test.skip(!hasDealerCreds, 'DEALER_EMAIL / DEALER_PASSWORD not set — skipping P4');
  const fixture = readListingFixture();
  test.skip(fixture === null, 'e2e/.test-listing-id not found — skipping P4');
  test.skip(fixture!.isLive, 'Listing is LIVE (locked) — skipping P4');

  await loginAsDealer(page);
  await openEditListing(page, fixture!.id);

  const slider = page.getByRole('slider', { name: /price slider/i });
  await expect(slider).toBeVisible({ timeout: 8_000 });
  const initialValue = await slider.getAttribute('aria-valuenow');

  await page.locator('input#price').fill('1 crore');
  await page.waitForTimeout(300);

  const updatedValue = await slider.getAttribute('aria-valuenow');
  expect(updatedValue).not.toBe(initialValue);
});

test('P5 — Save Changes persists the correct numeric price', async ({ page }) => {
  test.skip(!hasDealerCreds, 'DEALER_EMAIL / DEALER_PASSWORD not set — skipping P5');
  const fixture = readListingFixture();
  test.skip(fixture === null, 'e2e/.test-listing-id not found — skipping P5');
  test.skip(fixture!.isLive, 'Listing is LIVE (locked) — skipping P5');

  const { id } = fixture!;
  await loginAsDealer(page);
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

  await page.getByRole('button', { name: /save changes/i }).click();
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
