/**
 * residential-create-parity.spec.ts — E2E for issue #1718 (residential
 * single-page create flow: inline reuse of ImageUploader/AddressPicker/
 * PoiManager, early-DRAFT persistence, review preview, honest submit copy).
 *
 * SAFETY CONTRACT (binding, mirrors e2e/broker-demand-gaps.spec.ts):
 *   - Every backend call (/api/**) is intercepted via page.route() — NO live
 *     mutation against the shared Supabase DB or Spring Boot backend.
 *   - Auth is a fully SYNTHETIC broker session: a fake sb-<ref>-auth-token is
 *     injected into localStorage via page.addInitScript() before navigation,
 *     and the two Supabase REST calls AuthContext makes on mount
 *     (user_roles, profiles) are mocked via page.route(). A catch-all route
 *     on the real Supabase origin fulfills anything else locally (e.g. an
 *     auto-refresh attempt) so NOTHING ever reaches the live hosted Supabase
 *     project, and no real broker account/credentials are required.
 *   - Image "upload" PUTs to a same-mocked signed URL, never real storage.
 *
 * Scope: apartment / sale happy path — create -> fill core facts -> persist
 * DRAFT inline (no navigation) -> upload >=3 mocked photos -> confirm pin via
 * mocked geocode -> generate a local (non-AI) draft description -> Review ->
 * Submit for review -> assert PENDING_REVIEW-oriented honest copy
 * ("Submitted for review" / "Pending admin approval" — never "Published").
 *
 * Run (fully mocked — no backend, no Supabase, no credentials required):
 *   PLAYWRIGHT_BASE_URL=http://localhost:<port> npx playwright test \
 *     e2e/residential-create-parity.spec.ts --project=chromium --reporter=list
 */

import { test, expect, type Page } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, 'fixtures');

const LISTING_ID = 'e2e-residential-1718';

// Must match VITE_SUPABASE_URL's project ref (see .env) so the injected
// localStorage key and mocked REST routes line up with what supabase-js
// reads/calls — this is a fixed public project identifier, not a secret.
const SUPABASE_ORIGIN = 'https://elyqnysyqbqoxqqrpiir.supabase.co';
const FAKE_USER_ID = 'e2e-broker-1718-0000-0000-000000000000';

/**
 * Injects a synthetic, never-expiring Supabase broker session into
 * localStorage and mocks every network call AuthContext/supabase-js could
 * make on mount, so the app treats the page as an authenticated broker
 * without any real login, real credentials, or live Supabase traffic.
 */
async function mockSupabaseAuth(page: Page) {
  const nowSec = Math.floor(Date.now() / 1000);
  const fakeSession = {
    access_token: 'e2e-mock-access-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: nowSec + 3600,
    refresh_token: 'e2e-mock-refresh-token',
    user: {
      id: FAKE_USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'e2e-broker@example.com',
      email_confirmed_at: new Date().toISOString(),
      phone: '',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: { email_verified: true },
      identities: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_anonymous: false,
    },
  };

  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    { key: 'sb-elyqnysyqbqoxqqrpiir-auth-token', value: fakeSession },
  );

  // Catch-all safety net FIRST (registered first = checked last by Playwright)
  // so nothing on the real Supabase origin ever escapes to the live network —
  // any call not covered by a more specific route below still gets fulfilled
  // locally.
  await page.route(`${SUPABASE_ORIGIN}/**`, (route) =>
    void route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));

  // AuthContext.fetchUserRole() — grant 'broker'.
  await page.route(`${SUPABASE_ORIGIN}/rest/v1/user_roles**`, (route) =>
    void route.fulfill(fulfillJson(200, { role: 'broker' })));

  // AuthContext.fetchInsightsAccess() — honest null (no fabricated access).
  await page.route(`${SUPABASE_ORIGIN}/rest/v1/profiles**`, (route) =>
    void route.fulfill(fulfillJson(200, { insights_access_until: null })));
}

function fulfillJson(status: number, body: unknown) {
  return { status, contentType: 'application/json', body: JSON.stringify(body) };
}

interface MockListing {
  id: string;
  status: string;
  propertyType: string;
  title: string | null;
  locality: string | null;
  price: number | null;
  description: string | null;
  bedrooms: number | null;
  builtArea: number | null;
  builtAreaUnit: string | null;
  carpetArea: number | null;
  latitude: number | null;
  longitude: number | null;
  addressConfirmed: boolean;
  imageCount: number;
}

/**
 * Stubs the full set of endpoints ResidentialListingForm's inline composition
 * touches: create, get, update, image upload trio, POI suggestions, submit.
 * A single mutable `listing` + `images` array drives GET responses so the UI
 * reflects each mutation, matching real backend behavior.
 */
async function mockBackend(page: Page) {
  const listing: MockListing = {
    id: LISTING_ID,
    status: 'DRAFT',
    propertyType: 'apartment',
    title: null,
    locality: null,
    price: null,
    description: null,
    bedrooms: null,
    builtArea: null,
    builtAreaUnit: null,
    carpetArea: null,
    latitude: null,
    longitude: null,
    addressConfirmed: false,
    imageCount: 0,
  };
  const images: { id: string; listingId: string; storagePath: string; url: string; position: number; createdAt: string }[] = [];

  // Create DRAFT
  await page.route('**/api/listings', (route) => {
    if (route.request().method() !== 'POST') return void route.fallback();
    const body = route.request().postDataJSON() as Partial<MockListing>;
    Object.assign(listing, body);
    void route.fulfill(fulfillJson(200, listing));
  });

  // Get / update the draft
  await page.route(`**/api/listings/${LISTING_ID}`, (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      void route.fulfill(fulfillJson(200, { ...listing, imageCount: images.length }));
      return;
    }
    if (method === 'PUT') {
      const body = route.request().postDataJSON() as Partial<MockListing>;
      Object.assign(listing, body);
      void route.fulfill(fulfillJson(200, { ...listing, imageCount: images.length }));
      return;
    }
    void route.fallback();
  });

  // Images: list / upload-url / register
  await page.route(`**/api/listings/${LISTING_ID}/images`, (route) => {
    if (route.request().method() === 'GET') {
      void route.fulfill(fulfillJson(200, images));
      return;
    }
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { storagePath: string; url: string };
      images.push({
        id: `img-${images.length + 1}`,
        listingId: LISTING_ID,
        storagePath: body.storagePath,
        url: body.url,
        position: images.length,
        createdAt: new Date().toISOString(),
      });
      void route.fulfill(fulfillJson(200, images.at(-1)));
      return;
    }
    void route.fallback();
  });

  await page.route(`**/api/listings/${LISTING_ID}/images/upload-url`, (route) => {
    const n = images.length + 1;
    void route.fulfill(fulfillJson(200, {
      signedUrl: `https://mock-storage.e2e-test/upload/${n}`,
      storagePath: `listing-images/${LISTING_ID}/photo-${n}.jpg`,
      expiresAt: null,
    }));
  });

  // Mocked storage PUT target — never real Supabase Storage.
  await page.route('https://mock-storage.e2e-test/**', (route) => void route.fulfill({ status: 200 }));

  // POI suggestions — none in this fixture (honest empty state).
  await page.route(`**/api/listings/${LISTING_ID}/pois/suggestions`, (route) =>
    void route.fulfill(fulfillJson(200, [])));

  // Forward geocode proxy (AddressPicker search) — one deterministic result.
  await page.route('**/api/geocode?**', (route) =>
    void route.fulfill(fulfillJson(200, [
      {
        lat: 13.3492,
        lon: 74.7863,
        display_name: 'Manipal, Udupi District, Karnataka, India',
        address: { city: 'Manipal', county: 'Udupi', state: 'Karnataka', country: 'India' },
      },
    ])));

  // Submit for review
  await page.route(`**/api/listings/${LISTING_ID}/submit`, (route) => {
    listing.status = 'PENDING_REVIEW';
    void route.fulfill(fulfillJson(200, { ...listing, imageCount: images.length }));
  });

  // Broker dashboard/list endpoints touched by query invalidation — harmless stubs.
  await page.route('**/api/listings/mine**', (route) => void route.fulfill(fulfillJson(200, { content: [], page: { size: 20, number: 0, totalElements: 0, totalPages: 0 } })));
  await page.route('**/api/listings/mine/stats', (route) => void route.fulfill(fulfillJson(200, { draftCount: 0, pendingReviewCount: 0, liveCount: 0, rejectedCount: 0, totalCount: 0 })));

  return { listing, images };
}

test.describe('@residential-create-parity /broker/listings/new', () => {
  test('apartment / sale — inline create through submit-for-review, honest copy throughout', async ({ page }) => {
    await mockSupabaseAuth(page);
    await mockBackend(page);

    await page.goto('/broker/listings/new');
    await page.waitForLoadState('domcontentloaded');

    // Apartment is the default preselected type (#1626 Phase-7A).
    await expect(page.getByRole('heading', { name: /create a listing/i })).toBeVisible({ timeout: 10_000 });

    // Section 2 — core facts
    await page.getByLabel(/locality \/ area/i).fill('Manipal');
    await page.getByLabel(/listing title/i).fill('3 BHK Apartment in Manipal');
    await page.getByLabel(/price \(inr\)/i).fill('50 lakh');

    // Section 3 — apartment type-specific submit gate (bedrooms + built-up area)
    const bedroomsGroup = page.locator('#bedrooms');
    await bedroomsGroup.getByRole('radio', { name: '3', exact: true }).click();
    await page.locator('#builtArea').fill('1150');

    // Persist the DRAFT inline — no navigation away from this page.
    await page.getByRole('button', { name: /save draft/i }).click();
    await expect(page).toHaveURL(/\/broker\/listings\/new/);

    // Section 6 — inline photos (real ImageUploader, mocked upload endpoints)
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([
      path.join(FIXTURE_DIR, 'flat1.jpg'),
      path.join(FIXTURE_DIR, 'flat2.jpg'),
      path.join(FIXTURE_DIR, 'flat3.jpg'),
    ]);
    await expect(page.getByText(/3\/10 images/i)).toBeVisible({ timeout: 10_000 });

    // Inline location — real AddressPicker, mocked geocode proxy.
    await page.getByPlaceholder(/search for an address/i).or(page.locator('input[id^="locality"]')).first().fill('Manipal');
    const geocodeResult = page.getByText(/Manipal, Udupi District/i).first();
    await geocodeResult.click();
    await expect(page.getByText(/location pinned|pin confirmed|confirmed/i).first()).toBeVisible({ timeout: 10_000 });

    // Description — deterministic local draft, never "AI-generated".
    await page.getByRole('button', { name: /generate draft description/i }).click();
    await expect(page.locator('textarea').last()).not.toHaveValue('', { timeout: 5_000 });
    await expect(page.getByText(/ai-generated/i)).toHaveCount(0);

    // Move to review — persists any core-field edits, no navigation.
    await page.getByRole('button', { name: /^review$/i }).click();
    await expect(page.getByRole('heading', { name: /review your listing/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/published/i)).toHaveCount(0);

    const submitButton = page.getByRole('button', { name: /submit for review/i });
    await expect(submitButton).toBeEnabled({ timeout: 10_000 });
    await submitButton.click();

    // Honest success copy — PENDING_REVIEW, never "Published".
    await expect(page.getByText(/submitted for review/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/pending admin approval/i)).toBeVisible();
    await expect(page.getByText(/published/i)).toHaveCount(0);
  });
});
