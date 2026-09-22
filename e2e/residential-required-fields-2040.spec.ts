/**
 * residential-required-fields-2040.spec.ts — E2E for issue #2040.
 *
 * For propertyType 'apartment', builtArea + builtAreaUnit are genuinely
 * required at submit by the backend (ListingTransitionPolicy.validateFields()
 * case "apartment"). This spec proves, in a REAL browser (desktop AND mobile
 * 390x844 — issue #2040 explicitly calls out both), what unit tests (JSDOM)
 * cannot:
 *
 *   1. AC1/AC2 — the Built-up area control is VISIBLE on the always-visible
 *      core "Property details" section WITHOUT expanding any collapsed
 *      section. This is the core regression guard: it must fail if the field
 *      ever moves back inside the collapsed "More details / Ownership &
 *      document details" section (see ResidentialListingForm.tsx Section 5).
 *   2. AC5 — with a draft already created and built-up area left empty,
 *      clicking "Review" does NOT navigate to review mode (persistDraft still
 *      fires — the draft is saved — but handleGoToReview's gate check keeps
 *      mode==='edit'), and the Built-up area input receives REAL focus and is
 *      REALLY scrolled into view. Real-browser focus/scroll are exactly what
 *      JSDOM only approximates.
 *   3. AC5 mobile occlusion (issue #2040's explicit risk callout) — at
 *      390x844 the sticky footer (`fixed inset-x-0 bottom-0`,
 *      ResidentialListingForm.tsx ~line 1531) can visually cover the focused
 *      control even though Playwright's toBeVisible() would still pass (it
 *      does not detect overlap). This spec compares bounding boxes directly:
 *      the built-up area input's box must not intersect the footer's box.
 *   4. The journey completes — filling built-up area and clicking Review a
 *      second time proceeds to the Review screen.
 *
 * SAFETY CONTRACT (mirrors e2e/residential-create-listing-1722.spec.ts):
 *   - Every backend call (/api/**) is intercepted via page.route() — NO live
 *     mutation against the shared Supabase DB or Spring Boot backend.
 *   - Auth is a fully SYNTHETIC broker session, injected the same way as the
 *     #1722 spec (fake sb-<ref>-auth-token in localStorage + mocked
 *     user_roles/profiles REST calls). Nothing reaches the live hosted
 *     Supabase project.
 *   - Locality resolve (Section 2 AddressSearch) and image upload/map-pin
 *     confirm (Section 6) ARE exercised, but only as scaffolding to reach the
 *     "every gate but builtArea is met" state assertions 2/3 need, and to let
 *     assertion 4 reach a genuine Review screen. The focus/scroll assertions
 *     themselves are keyed on builtArea specifically: handleGoToReview's gate
 *     check blocks on ANY unmet gate but only FOCUSES the first unmet gate
 *     that has a targetFieldId (see listingStrength.ts
 *     computeListingStrength) — images/locationEntered/pinConfirmed have
 *     none, so builtArea (the only gate left unmet at that point) is the one
 *     that receives focus.
 *
 * Run (fully mocked — no backend, no Supabase, no credentials required):
 *   PLAYWRIGHT_BASE_URL=http://localhost:5192 npx playwright test \
 *     e2e/residential-required-fields-2040.spec.ts --project=full --reporter=list
 */

import { test, expect, type Page } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, 'fixtures');

const LISTING_ID = 'e2e-residential-2040';

// Must match VITE_SUPABASE_URL's project ref (see .env) so the injected
// localStorage key and mocked REST routes line up with what supabase-js
// reads/calls — this is a fixed public project identifier, not a secret.
const SUPABASE_ORIGIN = 'https://elyqnysyqbqoxqqrpiir.supabase.co';
const FAKE_USER_ID = 'e2e-broker-2040-0000-0000-000000000000';

function fulfillJson(status: number, body: unknown) {
  return { status, contentType: 'application/json', body: JSON.stringify(body) };
}

/**
 * Injects a synthetic, never-expiring Supabase broker session into
 * localStorage and mocks every network call AuthContext/supabase-js could
 * make on mount — same pattern as residential-create-listing-1722.spec.ts.
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
      email: 'e2e-broker-2040@example.com',
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

  // Catch-all safety net FIRST (registered first = checked last by
  // Playwright) so nothing on the real Supabase origin ever escapes to the
  // live network.
  await page.route(`${SUPABASE_ORIGIN}/**`, (route) =>
    void route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));

  await page.route(`${SUPABASE_ORIGIN}/rest/v1/user_roles**`, (route) =>
    void route.fulfill(fulfillJson(200, { role: 'broker' })));

  await page.route(`${SUPABASE_ORIGIN}/rest/v1/profiles**`, (route) =>
    void route.fulfill(fulfillJson(200, { insights_access_until: null })));
}

// Locality has no direct text input in this form — it is ONLY set via
// useResidentialLocation's onPublicLoc callback, which fires when a search
// result is resolved (Section 2's AddressSearch "Find location" -> "Use"
// flow, mirroring residential-create-listing-1722.spec.ts). This fixture's
// `address` fields are chosen only to produce a non-blank publicLoc — the
// privacy/PIN-code assertions from the #1722 spec are out of scope here.
const FORWARD_RESULT = {
  lat: 13.3492,
  lon: 74.7863,
  display_name: '123, MIT Road, Manipal, Udupi Taluk, Udupi District, Karnataka, 576104, India',
  address: {
    road: 'MIT Road',
    suburb: 'Manipal',
    city: 'Udupi',
    county: 'Udupi District',
    state: 'Karnataka',
    postcode: '576104',
    country: 'India',
  },
};

interface MockListing {
  id: string;
  status: string;
  propertyType: string;
  title: string | null;
  locality: string | null;
  price: number | null;
  bedrooms: number | null;
  builtArea: number | null;
  builtAreaUnit: string | null;
  carpetArea: number | null;
  addressConfirmed: boolean;
  imageCount: number;
}

interface MockImage {
  id: string;
  listingId: string;
  storagePath: string;
  url: string;
  position: number;
  createdAt: string;
}

interface MockServerState {
  listing: MockListing;
  images: MockImage[];
  uploadCounter: number;
}

function createMockServerState(): MockServerState {
  return {
    uploadCounter: 0,
    images: [],
    listing: {
      id: LISTING_ID,
      status: 'DRAFT',
      propertyType: 'apartment',
      title: null,
      locality: null,
      price: null,
      bedrooms: null,
      builtArea: null,
      builtAreaUnit: null,
      carpetArea: null,
      addressConfirmed: false,
      imageCount: 0,
    },
  };
}

/**
 * Stubs the endpoint set the apartment create form touches: create/get/
 * update draft, image upload trio (so assertion 4's "journey completes" can
 * actually satisfy the images>=3 gate), forward geocode (locality resolve +
 * map-pin modal), POI suggestions (mounted once addressConfirmed flips
 * true), and the harmless dashboard list/stats stubs.
 */
async function mockBackend(page: Page, state: MockServerState) {
  await page.route('**/api/listings', (route) => {
    if (route.request().method() !== 'POST') return void route.fallback();
    const body = route.request().postDataJSON() as Partial<MockListing>;
    Object.assign(state.listing, body);
    void route.fulfill(fulfillJson(200, state.listing));
  });

  await page.route(`**/api/listings/${LISTING_ID}`, (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      void route.fulfill(fulfillJson(200, { ...state.listing, imageCount: state.images.length }));
      return;
    }
    if (method === 'PUT') {
      const body = route.request().postDataJSON() as Partial<MockListing>;
      Object.assign(state.listing, body);
      void route.fulfill(fulfillJson(200, { ...state.listing, imageCount: state.images.length }));
      return;
    }
    void route.fallback();
  });

  await page.route(`**/api/listings/${LISTING_ID}/images`, (route) => {
    if (route.request().method() === 'GET') {
      void route.fulfill(fulfillJson(200, state.images));
      return;
    }
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { storagePath: string; url: string };
      state.images.push({
        id: `img-${state.images.length + 1}`,
        listingId: LISTING_ID,
        storagePath: body.storagePath,
        url: body.url,
        position: state.images.length,
        createdAt: new Date().toISOString(),
      });
      void route.fulfill(fulfillJson(200, state.images.at(-1)));
      return;
    }
    void route.fallback();
  });

  await page.route(`**/api/listings/${LISTING_ID}/images/upload-url`, (route) => {
    state.uploadCounter += 1;
    const n = state.uploadCounter;
    void route.fulfill(fulfillJson(200, {
      signedUrl: `https://mock-storage.e2e-test/upload/${n}`,
      storagePath: `listing-images/${LISTING_ID}/photo-${n}.jpg`,
      expiresAt: null,
    }));
  });

  await page.route('https://mock-storage.e2e-test/**', (route) => void route.fulfill({ status: 200 }));

  await page.route(`**/api/listings/${LISTING_ID}/pois/suggestions`, (route) =>
    void route.fulfill(fulfillJson(200, [])));

  // Forward geocode proxy — resolves the locality via Section 2's
  // AddressSearch (locality has no plain text input; see FORWARD_RESULT doc
  // comment above) and backs the Section 6 map-pin modal's AddressPicker.
  await page.route('**/api/geocode?**', (route) =>
    void route.fulfill(fulfillJson(200, [FORWARD_RESULT])));

  await page.route('**/api/listings/mine**', (route) =>
    void route.fulfill(fulfillJson(200, { content: [], page: { size: 20, number: 0, totalElements: 0, totalPages: 0 } })));
  await page.route('**/api/listings/mine/stats', (route) =>
    void route.fulfill(fulfillJson(200, { draftCount: 0, pendingReviewCount: 0, liveCount: 0, rejectedCount: 0, totalCount: 0 })));
}

/**
 * Navigates directly to the residential single-page create flow (issue
 * #1719's deep link, App.tsx `/broker/listings/new/residential`) and waits
 * for it to render. `/broker/listings/new` alone is the journey PICKER
 * (residential/commercial/agricultural cards) — this spec is scoped to the
 * residential apartment form, so it skips straight past that picker.
 */
async function gotoNewListing(page: Page) {
  await page.goto('/broker/listings/new/residential');
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByRole('heading', { name: /create a listing/i })).toBeVisible({ timeout: 10_000 });
}

/**
 * Fills the fields needed to persist a draft AND satisfy every submit gate
 * EXCEPT the apartment typeSpecific gate (builtArea) — bedrooms + carpetArea
 * are filled so the "Add bedrooms (BHK) and built-up area" combined label
 * narrows to specifically "Add built-up area" (listingStrength.ts
 * typeSpecificGateDetails), matching the AC5 scenario precisely: exactly one
 * missing required field, and it must be builtArea.
 */
async function fillCoreFieldsLeavingBuiltAreaEmpty(page: Page) {
  await page.locator('#title').fill('3 BHK Apartment in Manipal');

  // Resolve a locality via AddressSearch (Find -> Use) — the only way
  // `locality` gets set in this form (see FORWARD_RESULT doc comment above).
  const searchInput = page.getByPlaceholder(/search for a location/i);
  await searchInput.fill('Manipal');
  await page.getByRole('button', { name: 'Find location', exact: true }).click();
  const useButton = page.getByRole('button', { name: 'Use', exact: true });
  await expect(useButton).toBeVisible({ timeout: 10_000 });
  await useButton.click();
  await expect(page.getByText(/location confirmed —/i)).toBeVisible({ timeout: 10_000 });

  await page.getByLabel(/price \(inr\)/i).fill('50 lakh');
  await page.locator('#bedrooms').getByRole('radio', { name: '3 BHK', exact: true }).click();
  await page.locator('#carpetArea').fill('1150');
  // Deliberately do NOT fill #builtArea.
}

async function persistDraftAndWaitForListingId(page: Page) {
  await page.getByRole('button', { name: /save draft/i }).click();
  await expect(page).toHaveURL(/\/broker\/listings\/new/);
  // Post-draft (listingId set), the authoritative StrengthMeter renders
  // testid "strength-meter-sidebar" (the pre-draft legacy widget's
  // "listing-strength-meter" testid must NOT co-render — see the "exactly
  // ONE Listing strength widget at a time" contract in
  // ResidentialListingForm.tsx around the strengthMeterRef div).
  await expect(page.getByTestId('strength-meter-sidebar')).toBeVisible({ timeout: 10_000 });
}

/**
 * Satisfies every OTHER submit gate besides builtArea (3 photos, confirmed
 * map pin) so assertion 4 ("the journey completes") reaches the real Review
 * screen rather than staying blocked on a still-unmet images/pinConfirmed
 * gate — handleGoToReview blocks on ANY unmet gate, not just the one whose
 * control it focuses (see listingStrength.ts computeListingStrength).
 */
async function completeRemainingGates(page: Page) {
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles([
    path.join(FIXTURE_DIR, 'flat1.jpg'),
    path.join(FIXTURE_DIR, 'flat2.jpg'),
    path.join(FIXTURE_DIR, 'flat3.jpg'),
  ]);
  await expect(page.getByText(/3\/5 photos/i)).toBeVisible({ timeout: 10_000 });

  // #2647 — addressed by testid: InlineNearby (Section 7) now renders a second
  // button with this same accessible name once a locality resolves, and
  // getByRole is strict-mode. This locator is Section 6's MapPin CTA.
  const pinButton = page.getByTestId('map-pin-open-picker');
  await expect(pinButton).toBeEnabled({ timeout: 10_000 });
  await pinButton.click();

  const pinDialog = page.getByRole('dialog', { name: /pin the exact location/i });
  await expect(pinDialog).toBeVisible({ timeout: 10_000 });
  const confirmPinButton = pinDialog.getByRole('button', { name: /confirm location/i });
  await expect(confirmPinButton).toBeVisible({ timeout: 10_000 });
  await confirmPinButton.click();
  await expect(pinDialog).toBeHidden({ timeout: 10_000 });
  await expect(page.getByTestId('map-pin-status')).toBeVisible({ timeout: 10_000 });
}

test.describe('@residential-required-fields-2040 apartment builtArea — always-visible + blocked-Review focus', () => {
  test.describe('desktop', () => {
    test('AC1/AC2 — Built-up area is visible in core Property details section without expanding any collapsed section', async ({ page }) => {
      const serverState = createMockServerState();
      await mockSupabaseAuth(page);
      await mockBackend(page, serverState);

      await gotoNewListing(page);

      // No interaction with any "More details" / disclosure control at all —
      // the very first assertion is that the control is already visible.
      const propertyDetailsHeading = page.getByRole('heading', { name: /property details/i });
      await expect(propertyDetailsHeading).toBeVisible();

      const builtAreaInput = page.locator('#builtArea');
      await expect(builtAreaInput).toBeVisible();
      await expect(page.getByText(/^built-up area/i)).toBeVisible();

      // Regression guard: builtArea's label appears in the DOM within the
      // core section (before "More details"), and the collapsed
      // "More details / Ownership & document details" trigger is a SEPARATE
      // section that this control does not live inside — the "Set cover"/
      // ownership fields it gates (e.g. superBuiltArea) are the ones behind
      // the collapse, not builtArea.
      const moreDetailsTrigger = page.getByRole('button', { name: /more details.*ownership.*document details/i });
      await expect(moreDetailsTrigger).toBeVisible();
      // Before any click on the trigger, builtArea is already interactable.
      await builtAreaInput.fill('1234');
      await expect(builtAreaInput).toHaveValue('1234');
    });

    test('AC5 — blocked Review scrolls+focuses Built-up area, then filling it lets Review proceed', async ({ page }) => {
      const serverState = createMockServerState();
      await mockSupabaseAuth(page);
      await mockBackend(page, serverState);

      await gotoNewListing(page);
      await fillCoreFieldsLeavingBuiltAreaEmpty(page);
      await persistDraftAndWaitForListingId(page);

      const builtAreaInput = page.locator('#builtArea');
      await expect(builtAreaInput).toHaveValue('');

      // --- Blocked attempt ---
      await page.getByRole('button', { name: /^review$/i }).click();

      // Never navigates to review mode.
      await expect(page.getByRole('heading', { name: /review your listing/i })).toHaveCount(0, { timeout: 5_000 });
      await expect(page.getByRole('heading', { name: /create a listing/i })).toBeVisible();

      // Real-browser scroll: the control is scrolled into the viewport.
      await expect(builtAreaInput).toBeInViewport({ timeout: 10_000 });
      // Real-browser focus: builtArea is the actually-focused element,
      // proven via document.activeElement rather than a CSS-only check.
      await expect(builtAreaInput).toBeFocused({ timeout: 10_000 });

      // --- Fill it, satisfy the remaining gates (photos + pin), then Review proceeds ---
      await builtAreaInput.fill('1200');
      await completeRemainingGates(page);
      await page.getByRole('button', { name: /^review$/i }).click();
      await expect(page.getByRole('heading', { name: /review your listing/i })).toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe('mobile 390x844', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('AC1/AC2 — Built-up area is visible without expanding any collapsed section (mobile)', async ({ page }) => {
      const serverState = createMockServerState();
      await mockSupabaseAuth(page);
      await mockBackend(page, serverState);

      await gotoNewListing(page);

      const builtAreaInput = page.locator('#builtArea');
      await expect(builtAreaInput).toBeVisible();
    });

    test('AC5 mobile occlusion — focused Built-up area is not covered by the fixed sticky footer', async ({ page }) => {
      const serverState = createMockServerState();
      await mockSupabaseAuth(page);
      await mockBackend(page, serverState);

      await gotoNewListing(page);
      await fillCoreFieldsLeavingBuiltAreaEmpty(page);
      await persistDraftAndWaitForListingId(page);

      const builtAreaInput = page.locator('#builtArea');

      await page.getByRole('button', { name: /^review$/i }).click();
      await expect(page.getByRole('heading', { name: /review your listing/i })).toHaveCount(0, { timeout: 5_000 });

      await expect(builtAreaInput).toBeInViewport({ timeout: 10_000 });
      await expect(builtAreaInput).toBeFocused({ timeout: 10_000 });

      // toBeVisible()/toBeInViewport() do NOT detect overlap by another
      // fixed-position element — the sticky footer
      // (`fixed inset-x-0 bottom-0`, ResidentialListingForm.tsx ~line 1531)
      // sits on top of the document flow at every scroll position. Compare
      // bounding boxes directly to catch real visual occlusion.
      const footer = page.locator('div.fixed.inset-x-0.bottom-0');
      await expect(footer).toBeVisible();

      const inputBox = await builtAreaInput.boundingBox();
      const footerBox = await footer.boundingBox();
      expect(inputBox).not.toBeNull();
      expect(footerBox).not.toBeNull();

      const inputBottom = inputBox!.y + inputBox!.height;
      const footerTop = footerBox!.y;
      // The focused control's bottom edge must sit above the footer's top
      // edge — i.e. no vertical overlap between the two boxes.
      expect(inputBottom).toBeLessThanOrEqual(footerTop);

      // Positive control: the control is also genuinely within the visible
      // viewport height (not scrolled off above/below entirely).
      expect(inputBox!.y).toBeGreaterThanOrEqual(0);
      expect(inputBox!.y).toBeLessThanOrEqual(844);
    });
  });
});
