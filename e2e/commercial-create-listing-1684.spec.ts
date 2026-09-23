/**
 * commercial-create-listing-1684.spec.ts — E2E for issue #1684 (commercial
 * single-page create flow), the commercial sibling of
 * e2e/residential-create-listing-1722.spec.ts (#1626/#1718/#1722).
 *
 * Under test: src/components/broker/CommercialListingForm.tsx, mounted by
 * src/pages/broker/NewListing.tsx's COMMERCIAL_TYPES branch for the four
 * commercial property types (commercial / commercial_building / warehouse /
 * commercial_land). Reuses AddressSearch/MapPin/useResidentialLocation/
 * InlinePhotos/InlineNearby/StrengthMeter AS-IS from the residential flow,
 * but owns its own subtype/purpose-adaptive field-visibility tree
 * (src/lib/listingFieldConfig.ts's isListingFieldVisible), commercial option
 * vocabularies (src/lib/listing-constants.ts), and review/description
 * components (CommercialReviewPreview / CommercialDescriptionAssistant) — NONE
 * of that cross-layer tree (subtype selection -> purpose -> field-visibility
 * gating -> submit) is covered by the residential spec or any other existing
 * E2E file.
 *
 * SAFETY CONTRACT (binding, mirrors e2e/residential-create-listing-1722.spec.ts):
 *   - Every backend call (/api/**) is intercepted via page.route() — NO live
 *     mutation against the shared Supabase DB or Spring Boot backend.
 *   - Auth is a fully SYNTHETIC broker session: a fake sb-<ref>-auth-token is
 *     injected into localStorage via page.addInitScript() before navigation,
 *     and the two Supabase REST calls AuthContext makes on mount
 *     (user_roles, profiles) are mocked via page.route(). A catch-all route
 *     on the real Supabase origin fulfills anything else locally.
 *   - Image "upload" PUTs go to a same-mocked signed URL, never real storage.
 *   - The forward/reverse-geocode dependency is stubbed via
 *     /api/geocode + /api/geocode/reverse — no live OSM/Nominatim call.
 *
 * Scope (qa-fast E2E justification — new cross-layer subtype/purpose/field-
 * visibility tree, business-meaningful assertions only):
 *   1. Field-visibility gating — switching property type/subtype/purpose
 *      flips Section 3/4 fields per src/lib/listingFieldConfig.ts EXACTLY
 *      (SHOP vs OFFICE vs BUILDING vs WAREHOUSE vs LAND; SALE vs RENT/LEASE).
 *      #2505 removed the separate, unpersistable "For Lease" purpose option
 *      (chk_listing_purpose permits only sale/rent) — the control now offers
 *      "For Sale" and "For Rent / Lease", the latter persisting as `rent`.
 *   2. SHOP + RENT full flow — subtype selection -> address search -> map
 *      pin -> utilities/suitable-uses multi-select -> 3-photo upload + cover
 *      reorder -> buyer preview reflects monthly rent -> review -> submit ->
 *      PENDING_REVIEW.
 *   3. BUILDING + SALE full flow — same cross-layer shape with a DIFFERENT
 *      field set (floorMode/powerLoadKva/occupancyStatus, no floorChoice/
 *      hubType/officeSeats) and SALE terms (price + rental yield, not rent).
 *
 * Run (fully mocked — no backend, no Supabase, no credentials required):
 *   PLAYWRIGHT_BASE_URL=http://localhost:5188 npx playwright test \
 *     e2e/commercial-create-listing-1684.spec.ts --project=chromium --reporter=list
 */

import { test, expect, type Page } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, 'fixtures');

// Must match VITE_SUPABASE_URL's project ref (see .env) — a fixed public
// project identifier, not a secret. Same value as residential-create-listing-1722.spec.ts.
const SUPABASE_ORIGIN = 'https://elyqnysyqbqoxqqrpiir.supabase.co';
const FAKE_USER_ID = 'e2e-broker-1684-0000-0000-000000000000';

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
      email: 'e2e-broker-1684@example.com',
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

function fulfillJson(status: number, body: unknown) {
  return { status, contentType: 'application/json', body: JSON.stringify(body) };
}

interface MockListing {
  id: string;
  status: string;
  propertyType: string;
  listingPurpose: string | null;
  title: string | null;
  locality: string | null;
  price: number | null;
  monthlyRent: number | null;
  description: string | null;
  landArea: number | null;
  landAreaUnit: string | null;
  builtArea: number | null;
  builtAreaUnit: string | null;
  latitude: number | null;
  longitude: number | null;
  addressConfirmed: boolean;
  imageCount: number;
  // #1684 commercial typed fields — loosely typed via the index signature
  // below rather than enumerated exhaustively (mirrors the payload shape in
  // CommercialListingForm.buildPayload()).
  [key: string]: unknown;
}

interface MockImage {
  id: string;
  listingId: string;
  storagePath: string;
  url: string;
  position: number;
  createdAt: string;
}

/** One deterministic, non-settlement POI so "Nearby Places" has a real row once pinned. */
const MOCK_POI = {
  id: 'poi-1684-cafe',
  category: 'CAFE',
  name: 'Udupi Town Cafe',
  approved: false,
  pinned: false,
  distanceMeters: 150,
};

const FORWARD_RESULT = {
  lat: 13.3409,
  lon: 74.7421,
  display_name: '12, Car Street, Udupi Town, Udupi Taluk, Udupi District, Karnataka, 576101, India',
  address: {
    road: 'Car Street',
    suburb: 'Udupi Town',
    city: 'Udupi',
    county: 'Udupi District',
    state: 'Karnataka',
    postcode: '576101',
    country: 'India',
  },
};

function createMockListing(id: string, propertyType: string): MockListing {
  return {
    id,
    status: 'DRAFT',
    propertyType,
    listingPurpose: null,
    title: null,
    locality: null,
    price: null,
    monthlyRent: null,
    description: null,
    landArea: null,
    landAreaUnit: null,
    builtArea: null,
    builtAreaUnit: null,
    latitude: null,
    longitude: null,
    addressConfirmed: false,
    imageCount: 0,
  };
}

interface MockServerState {
  listing: MockListing;
  images: MockImage[];
  uploadCounter: number;
}

function createMockServerState(id: string, propertyType: string): MockServerState {
  return { listing: createMockListing(id, propertyType), images: [], uploadCounter: 0 };
}

/**
 * Stubs the full set of endpoints CommercialListingForm touches — same URL
 * contract as residential-create-listing-1722.spec.ts's mockBackend (both
 * forms reuse useCreateListing/useUpdateListing/useSubmitListing/useGetListing/
 * useListingImages, so the endpoints are identical).
 */
async function mockBackend(page: Page, listingId: string, state: MockServerState) {
  await page.route('**/api/listings', (route) => {
    if (route.request().method() !== 'POST') return void route.fallback();
    const body = route.request().postDataJSON() as Partial<MockListing>;
    Object.assign(state.listing, body);
    void route.fulfill(fulfillJson(200, state.listing));
  });

  await page.route(`**/api/listings/${listingId}`, (route) => {
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

  await page.route(`**/api/listings/${listingId}/images`, (route) => {
    if (route.request().method() === 'GET') {
      void route.fulfill(fulfillJson(200, state.images));
      return;
    }
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { storagePath: string; url: string };
      state.images.push({
        id: `img-${state.images.length + 1}`,
        listingId,
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

  await page.route(`**/api/listings/${listingId}/images/upload-url`, (route) => {
    state.uploadCounter += 1;
    const n = state.uploadCounter;
    void route.fulfill(fulfillJson(200, {
      signedUrl: `https://mock-storage.e2e-test/upload/${n}`,
      storagePath: `listing-images/${listingId}/photo-${n}.jpg`,
      expiresAt: null,
    }));
  });

  await page.route(`**/api/listings/${listingId}/images/reorder`, (route) => {
    const body = route.request().postDataJSON() as { imageIds: string[] };
    const byId = new Map(state.images.map((img) => [img.id, img]));
    state.images = body.imageIds
      .map((id, i) => {
        const img = byId.get(id);
        return img ? { ...img, position: i } : undefined;
      })
      .filter((img): img is MockImage => img !== undefined);
    void route.fulfill(fulfillJson(200, state.images));
  });

  await page.route('https://mock-storage.e2e-test/**', (route) => void route.fulfill({ status: 200 }));

  await page.route(`**/api/listings/${listingId}/pois/suggestions`, (route) =>
    void route.fulfill(fulfillJson(200, [MOCK_POI])));

  await page.route('**/api/geocode?**', (route) =>
    void route.fulfill(fulfillJson(200, [FORWARD_RESULT])));

  await page.route('**/api/geocode/reverse**', (route) =>
    void route.fulfill(fulfillJson(200, FORWARD_RESULT)));

  await page.route(`**/api/listings/${listingId}/submit`, (route) => {
    state.listing.status = 'PENDING_REVIEW';
    void route.fulfill(fulfillJson(200, { ...state.listing, imageCount: state.images.length }));
  });

  await page.route('**/api/listings/mine**', (route) => void route.fulfill(fulfillJson(200, { content: [], page: { size: 20, number: 0, totalElements: 0, totalPages: 0 } })));
  await page.route('**/api/listings/mine/stats', (route) => void route.fulfill(fulfillJson(200, { draftCount: 0, pendingReviewCount: 0, liveCount: 0, rejectedCount: 0, totalCount: 0 })));
}

/** Navigates to /broker/listings/new (defaults to the RESIDENTIAL composition —
 * M38-13A Phase-7A default — see NewListing.tsx), clicks "Switch flow" to
 * reach the generic 10-type selector, then picks `cardLabel` (a
 * PROPERTY_TYPES label) which — for the four commercial values — re-mounts
 * CommercialListingForm via the COMMERCIAL_TYPES branch. */
async function gotoCommercialForm(page: Page, cardLabel: string) {
  await page.goto('/broker/listings/new');
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByRole('heading', { name: /create a listing/i })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: /switch flow/i }).click();
  const genericSelector = page.getByRole('radiogroup', { name: 'Property type' });
  await expect(genericSelector).toBeVisible({ timeout: 10_000 });

  await genericSelector.getByRole('radio', { name: cardLabel, exact: true }).click();

  // Re-mounted CommercialListingForm — its own "Property type & purpose"
  // section heading proves the COMMERCIAL_TYPES branch actually took.
  await expect(page.getByText('Commercial listing', { exact: true })).toBeVisible({ timeout: 10_000 });
}

/** AddressSearch resolve (Section 2) — identical mechanism/markup to the
 * residential flow (AddressSearch.tsx is reused AS-IS). */
async function resolveLocationViaSearch(page: Page, query = 'Car Street') {
  const searchInput = page.getByPlaceholder(/search for a location/i);
  await searchInput.fill(query);
  await page.getByRole('button', { name: 'Find location', exact: true }).click();

  const useButton = page.getByRole('button', { name: 'Use', exact: true });
  await expect(useButton).toBeVisible({ timeout: 10_000 });
  await useButton.click();

  await expect(page.getByText(/location confirmed —/i)).toBeVisible({ timeout: 10_000 });
}

/** MapPin modal confirm (Section 6) — identical mechanism/markup to the
 * residential flow (MapPin.tsx is reused AS-IS). This is the ONLY path that
 * persists addressConfirmed:true. */
async function confirmPinViaModal(page: Page) {
  const pinButton = page.getByTestId('map-pin-open-picker');
  await expect(pinButton).toBeEnabled();
  await pinButton.click();

  const pinDialog = page.getByRole('dialog', { name: /pin the exact location/i });
  await expect(pinDialog).toBeVisible({ timeout: 10_000 });

  const confirmPinButton = pinDialog.getByRole('button', { name: /confirm location/i });
  await expect(confirmPinButton).toBeVisible({ timeout: 10_000 });
  await confirmPinButton.click();

  await expect(pinDialog).toBeHidden({ timeout: 10_000 });
  await expect(page.getByTestId('map-pin-status')).toBeVisible({ timeout: 10_000 });
}

/** Uploads 3 photos and promotes the 3rd (tile-2) to cover via inline
 * "Set cover" — same mechanism as residential AC5. Returns the promoted
 * image's captured src for the buyer-preview cross-check. */
async function uploadThreePhotosAndPromoteCover(page: Page): Promise<string> {
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles([
    path.join(FIXTURE_DIR, 'flat1.jpg'),
    path.join(FIXTURE_DIR, 'flat2.jpg'),
    path.join(FIXTURE_DIR, 'flat3.jpg'),
  ]);

  const photoGrid = page.getByTestId('photo-tile-grid');
  await expect(photoGrid.getByTestId('photo-tile-0')).toBeVisible({ timeout: 10_000 });
  await expect(photoGrid.getByTestId('photo-tile-2')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/3\/5 photos/i)).toBeVisible({ timeout: 10_000 });

  await expect(photoGrid.getByTestId('photo-tile-0').getByText('Cover')).toBeVisible();
  const tile2Src = await photoGrid.getByTestId('photo-tile-2').locator('img').getAttribute('src');
  expect(tile2Src).toBeTruthy();

  await photoGrid.getByTestId('photo-tile-2').getByRole('button', { name: /set cover/i }).click();
  await expect(photoGrid.getByTestId('photo-tile-0').locator('img')).toHaveAttribute('src', tile2Src!, { timeout: 10_000 });
  await expect(photoGrid.getByTestId('photo-tile-0').getByText('Cover')).toBeVisible();

  return tile2Src!;
}

test.describe('@commercial-create-listing-1684 /broker/listings/new — commercial single-page create flow', () => {
  // -------------------------------------------------------------------------
  // Field-visibility gating — the heart of #1684: switching property
  // type/subtype/purpose must flip Section 3/4 fields EXACTLY per
  // src/lib/listingFieldConfig.ts's isListingFieldVisible commercial switch.
  // A regression here (a field bleeding into the wrong subtype, or missing
  // from the right one) is exactly what the backend's validateCommercialFields
  // would 400 on, or silently drop.
  // -------------------------------------------------------------------------
  test('field-visibility gating — SHOP vs OFFICE vs BUILDING vs WAREHOUSE vs LAND show disjoint Section-3 fields', async ({ page }) => {
    const listingId = 'e2e-commercial-1684-gating';
    const serverState = createMockServerState(listingId, 'commercial');
    await mockSupabaseAuth(page);
    await mockBackend(page, listingId, serverState);

    await gotoCommercialForm(page, 'Commercial Shop/Office');

    // Nothing subtype-specific renders until SHOP/OFFICE is explicitly chosen.
    await expect(page.locator('#floorChoice')).toHaveCount(0);
    await expect(page.locator('#officeSeats')).toHaveCount(0);

    // SHOP — floorChoice + hubType (shop vocab) + occupancyStatus, no office fields.
    await page.getByLabel(/is this a shop or an office/i).click();
    await page.getByRole('option', { name: 'Shop', exact: true }).click();
    await expect(page.locator('#floorChoice')).toBeVisible();
    await expect(page.locator('#hubType')).toBeVisible();
    await expect(page.locator('#occupancyStatus')).toBeVisible();
    await expect(page.locator('#officeSeats')).toHaveCount(0);
    await expect(page.locator('#floorMode')).toHaveCount(0);
    // Shop-vocab hub type, not office-vocab.
    await page.locator('#hubType').click();
    await expect(page.getByRole('option', { name: 'Mall', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: 'IT park', exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');

    // OFFICE — officeSeats/Cabins/MeetingRooms + hubType (office vocab), NO occupancyStatus.
    await page.getByLabel(/is this a shop or an office/i).click();
    await page.getByRole('option', { name: 'Office', exact: true }).click();
    await expect(page.locator('#officeSeats')).toBeVisible();
    await expect(page.locator('#officeCabins')).toBeVisible();
    await expect(page.locator('#officeMeetingRooms')).toBeVisible();
    await expect(page.locator('#occupancyStatus')).toHaveCount(0);
    await page.locator('#hubType').click();
    await expect(page.getByRole('option', { name: 'IT park', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Mall', exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');

    // Switch to BUILDING (own propertyType, no explicit-subtype selector) —
    // floorMode/powerLoadKva/occupancyStatus, NOT floorChoice/hubType/office fields.
    await page.getByRole('button', { name: /switch flow/i }).click();
    await page.getByRole('radiogroup', { name: 'Property type' }).getByRole('radio', { name: 'Commercial Building', exact: true }).click();
    await expect(page.locator('#commercialSubtype')).toHaveCount(0); // no explicit shop/office selector for this type
    await expect(page.locator('#floorMode')).toBeVisible();
    await expect(page.locator('#powerLoadKva')).toBeVisible();
    await expect(page.locator('#occupancyStatus')).toBeVisible();
    await expect(page.locator('#floorChoice')).toHaveCount(0);
    await expect(page.locator('#hubType')).toHaveCount(0);
    await expect(page.locator('#officeSeats')).toHaveCount(0);

    // Switch to WAREHOUSE — clearHeight/loadingBays/truckAccess/flooring, NOT
    // occupancyStatus/floorMode (BUILDING-only) or floorChoice (SHOP/OFFICE-only).
    await page.getByRole('button', { name: /switch flow/i }).click();
    await page.getByRole('radiogroup', { name: 'Property type' }).getByRole('radio', { name: 'Warehouse / Godown', exact: true }).click();
    await expect(page.locator('#warehouseClearHeightFt')).toBeVisible();
    await expect(page.locator('#warehouseLoadingBays')).toBeVisible();
    await expect(page.getByRole('switch', { name: /truck access/i })).toBeVisible();
    await expect(page.locator('#warehouseFlooring')).toBeVisible();
    await expect(page.locator('#occupancyStatus')).toHaveCount(0);
    await expect(page.locator('#floorMode')).toHaveCount(0);
    await expect(page.locator('#floorChoice')).toHaveCount(0);

    // Switch to LAND — zoning/ownership/approvals, and built-space fields
    // (washrooms/parking/furnishing/utilities) are HIDDEN entirely for LAND
    // (backend rejects them) even though they're visible for every other subtype.
    await page.getByRole('button', { name: /switch flow/i }).click();
    await page.getByRole('radiogroup', { name: 'Property type' }).getByRole('radio', { name: 'Commercial Land', exact: true }).click();
    await expect(page.locator('#commercialZoning')).toBeVisible();
    await expect(page.locator('#commercialOwnership')).toBeVisible();
    await expect(page.locator('#commercialApprovals')).toBeVisible();
    await expect(page.locator('#warehouseClearHeightFt')).toHaveCount(0);
    // "More details" panel — open it to check washrooms/parking/utilities are absent for LAND.
    await page.getByRole('button', { name: /more details/i }).click();
    await expect(page.getByText('Public washrooms')).toHaveCount(0);
    await expect(page.getByText('Private parking')).toHaveCount(0);
    await expect(page.getByTestId('chip-group-utilities')).toHaveCount(0);
    // suitableUses IS shown for LAND (no LAND exclusion on that key).
    await expect(page.getByTestId('chip-group-suitable-uses')).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Purpose-adaptive gating — SALE shows price + rental-yield/income fields;
  // RENT/LEASE show monthly rent + lease term/escalation instead. Both are
  // mutually exclusive per isListingFieldVisible's purpose switch.
  // -------------------------------------------------------------------------
  test('purpose gating — SALE shows price/yield, RENT/LEASE shows rent/lease-term (mutually exclusive)', async ({ page }) => {
    const listingId = 'e2e-commercial-1684-purpose';
    const serverState = createMockServerState(listingId, 'commercial_building');
    await mockSupabaseAuth(page);
    await mockBackend(page, listingId, serverState);

    await gotoCommercialForm(page, 'Commercial Building');

    // Default purpose is Sale.
    await expect(page.getByLabel(/price \(inr\)/i)).toBeVisible();
    await expect(page.locator('#expectedRentalYieldPct')).toBeVisible();
    await expect(page.locator('#monthlyRent')).toHaveCount(0);
    await expect(page.locator('#leaseTermMonths')).toHaveCount(0);

    // Switch to Rent / Lease. #2505 — this is the only non-Sale option; it
    // persists as `rent` (chk_listing_purpose permits only sale/rent).
    await page.getByRole('button', { name: 'For Rent / Lease', exact: true }).click();
    await expect(page.locator('#monthlyRent')).toBeVisible();
    await expect(page.locator('#leaseTermMonths')).toBeVisible();
    await expect(page.locator('#leaseEscalationPct')).toBeVisible();
    await expect(page.getByLabel(/price \(inr\)/i)).toHaveCount(0);
    await expect(page.locator('#expectedRentalYieldPct')).toHaveCount(0);
  });

  // -------------------------------------------------------------------------
  // #2505 — the purpose control no longer offers a separate, unpersistable
  // "For Lease" option (chk_listing_purpose permits only sale/rent). A
  // broker cannot select a listing purpose the system cannot store.
  // -------------------------------------------------------------------------
  test('purpose control offers only Sale and Rent / Lease — no separate unpersistable Lease option', async ({ page }) => {
    const listingId = 'e2e-commercial-1684-purpose-vocab';
    const serverState = createMockServerState(listingId, 'commercial_building');
    await mockSupabaseAuth(page);
    await mockBackend(page, listingId, serverState);

    await gotoCommercialForm(page, 'Commercial Building');

    const purposeGroup = page.getByRole('group', { name: 'Listing purpose' });
    await expect(purposeGroup.getByRole('button', { name: 'For Sale', exact: true })).toBeVisible();
    await expect(purposeGroup.getByRole('button', { name: 'For Rent / Lease', exact: true })).toBeVisible();
    await expect(purposeGroup.getByRole('button', { name: 'For Lease', exact: true })).toHaveCount(0);
  });

  // -------------------------------------------------------------------------
  // SHOP + RENT — full cross-layer flow.
  // -------------------------------------------------------------------------
  test('SHOP + RENT — subtype select, address+pin, utilities/suitable-uses, cover photo, buyer preview, submit -> PENDING_REVIEW', async ({ page }) => {
    const listingId = 'e2e-commercial-1684-shop-lease';
    const serverState = createMockServerState(listingId, 'commercial');
    await mockSupabaseAuth(page);
    await mockBackend(page, listingId, serverState);

    await gotoCommercialForm(page, 'Commercial Shop/Office');

    // Subtype (explicit — propertyType 'commercial' requires a choice).
    await page.getByLabel(/is this a shop or an office/i).click();
    await page.getByRole('option', { name: 'Shop', exact: true }).click();

    // Purpose — Rent / Lease. #2505 — persists as `rent`, the only
    // non-Sale, non-`lease` persistable value.
    await page.getByRole('button', { name: 'For Rent / Lease', exact: true }).click();

    // Title (Section 2).
    await page.locator('#title').fill('500 sqft Shop on Car Street');

    // Monthly rent (Section 4) — required for canSubmit/Save-draft gate.
    await page.locator('#monthlyRent').fill('45000');

    // Save draft — mounts Section 6 (photos + map).
    await page.getByRole('button', { name: /save draft/i }).click();
    await expect(page).toHaveURL(/\/broker\/listings\/new/);
    await expect(page.getByTestId('map-pin-open-picker')).toBeVisible({ timeout: 10_000 });

    // Address search -> pin confirm (merge-gate mechanism reused AS-IS).
    const pinButton = page.getByTestId('map-pin-open-picker');
    await expect(pinButton).toBeDisabled();
    await resolveLocationViaSearch(page);
    await expect(pinButton).toBeEnabled();
    await confirmPinViaModal(page);

    // Nearby places load once pinned (merge-gate positive state).
    await expect(page.getByRole('heading', { name: /nearby points of interest/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(MOCK_POI.name)).toBeVisible({ timeout: 10_000 });

    // "More details" — utilities (multi-select) + suitable uses (SHOP vocab).
    await page.getByRole('button', { name: /more details/i }).click();
    const utilitiesGroup = page.getByTestId('chip-group-utilities');
    await utilitiesGroup.getByRole('button', { name: 'CCTV', exact: true }).click();
    await utilitiesGroup.getByRole('button', { name: 'Internet', exact: true }).click();
    await expect(utilitiesGroup.getByRole('button', { name: 'CCTV', exact: true })).toHaveAttribute('data-state', 'on');
    await expect(utilitiesGroup.getByRole('button', { name: 'Internet', exact: true })).toHaveAttribute('data-state', 'on');

    const suitableUsesGroup = page.getByTestId('chip-group-suitable-uses');
    await suitableUsesGroup.getByRole('button', { name: 'Retail', exact: true }).click();
    await expect(suitableUsesGroup.getByRole('button', { name: 'Retail', exact: true })).toHaveAttribute('data-state', 'on');
    // OFFICE-only use ('Co-working') must NOT be offered for a SHOP subtype.
    await expect(suitableUsesGroup.getByRole('button', { name: 'Co-working', exact: true })).toHaveCount(0);

    // 3 photos + cover reorder (AC5-equivalent).
    const coverSrc = await uploadThreePhotosAndPromoteCover(page);

    // Buyer preview — reflects the real cover photo, confirmed pin, and the
    // MONTHLY RENT (not a sale price) since purpose is rent.
    const buyerPreview = page.getByTestId('buyer-preview-card');
    await expect(buyerPreview).toBeVisible({ timeout: 10_000 });
    await expect(buyerPreview.getByTestId('buyer-preview-cover-image')).toHaveAttribute('src', coverSrc, { timeout: 10_000 });
    await expect(buyerPreview.getByTestId('buyer-preview-location-confirmed')).toBeVisible();
    // formatPrice(45000) -> "₹45K" (thousands branch, formatters.ts) + "/mo" (isRent).
    await expect(buyerPreview.getByText(/₹45K\/mo/)).toBeVisible();

    // Listing-strength sidebar (real submit gate) is now fully met — the
    // "images" gate row's indicator flips to the met (border-primary) state.
    // (Its label always shows the running count, e.g. "Add at least 3 photos
    // (3/3)", so we assert on the indicator's state class, not text absence.)
    const strengthSidebar = page.getByTestId('strength-meter-sidebar');
    await expect(strengthSidebar).toBeVisible();
    const imagesGateRow = strengthSidebar.locator('li', { hasText: 'Add at least 3 photos' });
    await expect(imagesGateRow.locator('span').first()).toHaveClass(/border-primary/);

    // Review.
    await page.getByRole('button', { name: /^review$/i }).click();
    await expect(page.getByRole('heading', { name: /review your listing/i })).toBeVisible({ timeout: 10_000 });
    const reviewPreview = page.getByTestId('commercial-review-preview');
    await expect(reviewPreview).toBeVisible();
    await expect(reviewPreview.getByText('Shop', { exact: true })).toBeVisible();
    await expect(reviewPreview.getByText('For rent', { exact: true })).toBeVisible();
    await expect(page.getByText(/verified broker/i)).toHaveCount(0);

    // Submit -> PENDING_REVIEW.
    const submitButton = page.getByRole('button', { name: /submit for review/i });
    await expect(submitButton).toBeEnabled({ timeout: 10_000 });
    await submitButton.click();

    await expect(page.getByTestId('commercial-submitted-panel')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('heading', { name: /submitted for review/i })).toBeVisible();
    // Scoped with .first() — the same copy also appears in the toast
    // notification region, which would otherwise trip Playwright's
    // strict-mode multiple-match check (mirrors residential-create-listing-1722.spec.ts).
    await expect(page.getByText(/pending admin approval/i).first()).toBeVisible();
    expect(serverState.listing.status).toBe('PENDING_REVIEW');
  });

  // -------------------------------------------------------------------------
  // BUILDING + SALE — full cross-layer flow with a DIFFERENT field set
  // (floorMode/powerLoadKva/occupancyStatus; no explicit subtype selector —
  // BUILDING is derived from propertyType) and SALE terms (price, not rent).
  // -------------------------------------------------------------------------
  test('BUILDING + SALE — derived subtype (no picker), address+pin, occupancy/utilities, cover photo, buyer preview, submit -> PENDING_REVIEW', async ({ page }) => {
    const listingId = 'e2e-commercial-1684-building-sale';
    const serverState = createMockServerState(listingId, 'commercial_building');
    await mockSupabaseAuth(page);
    await mockBackend(page, listingId, serverState);

    await gotoCommercialForm(page, 'Commercial Building');

    // No "Is this a shop or an office?" selector for commercial_building —
    // deriveCommercialSubtype resolves it to BUILDING automatically.
    await expect(page.locator('#commercialSubtype')).toHaveCount(0);

    // Purpose stays Sale (default).
    await page.locator('#title').fill('3-storey commercial building, Udupi');

    await page.locator('#builtArea').fill('4200');
    await page.getByLabel(/price \(inr\)/i).fill('3.5 crore');

    // BUILDING-only fields.
    await page.locator('#floorMode').click();
    await page.getByRole('option', { name: 'Whole building', exact: true }).click();
    await page.locator('#occupancyStatus').click();
    await page.getByRole('option', { name: 'Vacant', exact: true }).click();

    await page.getByRole('button', { name: /save draft/i }).click();
    await expect(page).toHaveURL(/\/broker\/listings\/new/);
    await expect(page.getByTestId('map-pin-open-picker')).toBeVisible({ timeout: 10_000 });

    await resolveLocationViaSearch(page);
    await confirmPinViaModal(page);

    // "More details" — utilities + occupancy already set above; add furnishing.
    // NOTE: the Furnishing SingleChipGroup is a Radix ToggleGroup type="single",
    // which renders each item with role="radio" (unlike the multi-select
    // utilities/suitable-uses groups below, which render role="button").
    await page.getByRole('button', { name: /more details/i }).click();
    await page.getByRole('radio', { name: 'Semi furnished', exact: true }).click();
    const utilitiesGroup = page.getByTestId('chip-group-utilities');
    await utilitiesGroup.getByRole('button', { name: 'DG backup', exact: true }).click();
    await expect(utilitiesGroup.getByRole('button', { name: 'DG backup', exact: true })).toHaveAttribute('data-state', 'on');

    const coverSrc = await uploadThreePhotosAndPromoteCover(page);

    const buyerPreview = page.getByTestId('buyer-preview-card');
    await expect(buyerPreview).toBeVisible({ timeout: 10_000 });
    await expect(buyerPreview.getByTestId('buyer-preview-cover-image')).toHaveAttribute('src', coverSrc, { timeout: 10_000 });
    // Sale listing — formatPrice(35_000_000) -> "₹3.50 Cr" (crores branch,
    // formatters.ts), shown WITHOUT a "/mo" suffix (distinguishes it from
    // the SHOP+LEASE test's monthly-rent assertion above).
    await expect(buyerPreview.getByText(/₹3\.50 Cr/)).toBeVisible();
    await expect(buyerPreview.getByText(/\/mo/)).toHaveCount(0);

    await page.getByRole('button', { name: /^review$/i }).click();
    await expect(page.getByRole('heading', { name: /review your listing/i })).toBeVisible({ timeout: 10_000 });
    const reviewPreview = page.getByTestId('commercial-review-preview');
    await expect(reviewPreview.getByText('Commercial building', { exact: true })).toBeVisible();
    await expect(reviewPreview.getByText('For sale', { exact: true })).toBeVisible();
    await expect(reviewPreview.getByText('Vacant', { exact: true })).toBeVisible();

    const submitButton = page.getByRole('button', { name: /submit for review/i });
    await expect(submitButton).toBeEnabled({ timeout: 10_000 });
    await submitButton.click();

    await expect(page.getByTestId('commercial-submitted-panel')).toBeVisible({ timeout: 10_000 });
    expect(serverState.listing.status).toBe('PENDING_REVIEW');
    // SALE payload sent commercialSubtype:undefined (BUILDING is derived, never explicit).
    expect(serverState.listing.commercialSubtype).toBeUndefined();
    expect(serverState.listing.floorMode).toBe('WHOLE_BUILDING');
  });
});
