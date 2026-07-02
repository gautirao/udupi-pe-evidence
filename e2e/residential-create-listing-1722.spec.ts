/**
 * residential-create-listing-1722.spec.ts — E2E for issue #1722 (residential
 * single-page create flow), covering correction #4's merged location flow.
 *
 * Correction #4 REPLACED the old InlineLocation component with a merged
 * Section-2/Section-6 location flow, split into:
 *   - AddressSearch.tsx  (Section 2 "Where is it?") — query input, "Find
 *     location" button, Enter-to-search, "Use my current location" (gated
 *     behind an in-app rationale card), results list with per-result "Use",
 *     a resolved-location chip, and a not-found recovery message.
 *   - MapPin.tsx (Section 6 "Photos & location") — "Pin location on map" CTA
 *     gated on a resolved location, a Dialog wrapping the EXISTING,
 *     UNMODIFIED AddressPicker with a labelled "Cancel" button, a "Buyers
 *     see only ..." caption, and an "Adjust pin" action after confirm.
 *   - useResidentialLocation.ts — ONE hook instance, owned by
 *     ResidentialListingForm and shared by both views, so resolving via
 *     either surface updates the SAME state (the AC-4.7 merge gate below).
 *
 * SAFETY CONTRACT (binding, mirrors e2e/residential-create-parity.spec.ts and
 * e2e/broker-demand-gaps.spec.ts):
 *   - Every backend call (/api/**) is intercepted via page.route() — NO live
 *     mutation against the shared Supabase DB or Spring Boot backend.
 *   - Auth is a fully SYNTHETIC broker session: a fake sb-<ref>-auth-token is
 *     injected into localStorage via page.addInitScript() before navigation,
 *     and the two Supabase REST calls AuthContext makes on mount
 *     (user_roles, profiles) are mocked via page.route(). A catch-all route
 *     on the real Supabase origin fulfills anything else locally, so NOTHING
 *     ever reaches the live hosted Supabase project, and no real broker
 *     account/credentials are required.
 *   - Image "upload" PUTs to a same-mocked signed URL, never real storage.
 *   - The forward/reverse-geocode dependency is stubbed via
 *     /api/geocode + /api/geocode/reverse (a Spring Boot proxy in the real
 *     app) — no live OSM/Nominatim network call is made from this spec.
 *   - navigator.geolocation is stubbed via page.addInitScript() — no real
 *     browser geolocation permission prompt is ever triggered.
 *
 * Scope (issue #1722 correction #4, AC-4.1 .. AC-4.7) plus regression of the
 * pre-existing AC1/AC3/AC4/AC5/AC6/AC7/AC8 flows under the NEW UI:
 *   1. AC-4.7 MERGE-GATE STATE PAIR (front-and-center, [merge_gate] extra
 *      check) — resolving a location via Section 2's AddressSearch flips
 *      Section 6's "Pin location on map" CTA from disabled to enabled, from
 *      that SAME resolve, with no separate Section-6 resolve.
 *   2. AC-4.1 privacy — the buyer preview shows ONLY the coarse publicLoc,
 *      never the full geocoded string (PIN code / taluk / state / country).
 *   3. AC-4.2 — the two "Listing strength" rows ("Location entered" /
 *      "Map pin confirmed") toggle independently across resolve -> pin.
 *   4. AC-4.3 — editing the search query after a resolve/pin invalidates
 *      both (pin CTA disables again, POIs hide, both rows un-check).
 *   5. AC-4.4 — an unsearchable query (<3 chars or no letters) shows the
 *      not-found recovery copy; Find is disabled while the query is empty.
 *   6. AC-4.5 — "Use my current location" shows an in-app rationale card
 *      BEFORE navigator.geolocation is ever called.
 *   7. AC-4.6 — the pin modal's "Cancel" reverts with no confirm; after a
 *      confirm, "Adjust pin" re-opens the modal seeded with the current pin.
 *   8. Regression — Find -> resolved -> pin-confirmed -> POIs-after-pin,
 *      persisted-pin cross-navigation proof, AC5 cover reorder, AC6 honest
 *      preview, AC7 submit, AC8 property-details grouping.
 *
 * Run (fully mocked — no backend, no Supabase, no credentials required):
 *   PLAYWRIGHT_BASE_URL=http://localhost:<port> npx playwright test \
 *     e2e/residential-create-listing-1722.spec.ts --project=chromium --reporter=list
 */

import { test, expect, type Page } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, 'fixtures');

const LISTING_ID = 'e2e-residential-1722';

// Must match VITE_SUPABASE_URL's project ref (see .env) so the injected
// localStorage key and mocked REST routes line up with what supabase-js
// reads/calls — this is a fixed public project identifier, not a secret.
const SUPABASE_ORIGIN = 'https://elyqnysyqbqoxqqrpiir.supabase.co';
const FAKE_USER_ID = 'e2e-broker-1722-0000-0000-000000000000';

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
      email: 'e2e-broker-1722@example.com',
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
  // live network — any call not covered by a more specific route below still
  // gets fulfilled locally.
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

interface MockImage {
  id: string;
  listingId: string;
  storagePath: string;
  url: string;
  position: number;
  createdAt: string;
}

/** One deterministic, non-settlement POI so the "Nearby Places" tab has a
 * real row once pins are confirmed — proves POIs actually LOAD (not just
 * that the empty state renders). */
const MOCK_POI = {
  id: 'poi-1722-cafe',
  category: 'CAFE',
  name: 'Manipal Lake View Cafe',
  approved: false,
  pinned: false,
  distanceMeters: 180,
};

// -----------------------------------------------------------------------
// Geocode fixtures — the forward result's `address` fields are chosen so
// derivePublicLoc() (src/components/broker/residential/deriveResolvedLocation.ts)
// produces a coarse "Manipal, Udupi" publicLoc, while `display_name` (the
// PRIVATE full string) carries a PIN code / taluk / state / country the
// AC-4.1 privacy test asserts never leaks to the buyer preview.
// -----------------------------------------------------------------------

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

const PUBLIC_LOC = 'Manipal, Udupi';
/** Substrings that must appear ONLY in the private formatted string, never on the buyer preview. */
const PRIVATE_ONLY_MARKERS = [/576104/, /taluk/i, /karnataka/i, /india/i];

const REVERSE_RESULT = {
  lat: 13.35,
  lon: 74.79,
  display_name: '4th Cross Road, Manipal, Udupi Taluk, Udupi District, Karnataka, 576104, India',
  address: {
    road: '4th Cross Road',
    suburb: 'Manipal',
    city: 'Udupi',
    county: 'Udupi District',
    state: 'Karnataka',
    postcode: '576104',
    country: 'India',
  },
};

interface MockServerState {
  listing: MockListing;
  images: MockImage[];
  /** Monotonic counter for upload-url storagePath naming. The 3-photo AC5
   * upload fires all 3 upload-url requests near-simultaneously (before any
   * of them has registered via POST /images), so numbering off `images.length`
   * would race and collide (every request would see length 0). A dedicated
   * counter, incremented synchronously inside the route handler, guarantees
   * distinct photo-N storage paths regardless of request interleaving. */
  uploadCounter: number;
}

function createMockServerState(): MockServerState {
  return {
    uploadCounter: 0,
    listing: {
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
    },
    images: [],
  };
}

/**
 * Stubs the full set of endpoints ResidentialListingForm's + EditListing's
 * inline composition touch: create, get, update, image upload trio + reorder,
 * POI suggestions, forward/reverse geocode, submit. Wired against a SHARED
 * `state` object (not a local closure) so a second Page (e.g. a fresh
 * EditListing tab used to prove cross-navigation persistence) sees the exact
 * same mutated "server" data — same pattern as
 * e2e/residential-create-parity.spec.ts, extended to support multiple Page
 * instances against one mock backend.
 */
async function mockBackend(page: Page, state: MockServerState) {
  // Create DRAFT
  await page.route('**/api/listings', (route) => {
    if (route.request().method() !== 'POST') return void route.fallback();
    const body = route.request().postDataJSON() as Partial<MockListing>;
    Object.assign(state.listing, body);
    void route.fulfill(fulfillJson(200, state.listing));
  });

  // Get / update the draft (also backs EditListing's useGetListing/useUpdateListing)
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

  // Images: list / upload-url / register / reorder
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

  // AC5 — inline "Set cover" reorder: PUT the full ordered id list, reflect it
  // back so photo-tile-0 becomes whichever image the broker just promoted.
  await page.route(`**/api/listings/${LISTING_ID}/images/reorder`, (route) => {
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

  // Mocked storage PUT target — never real Supabase Storage.
  await page.route('https://mock-storage.e2e-test/**', (route) => void route.fulfill({ status: 200 }));

  // POI suggestions — merge-gate: only ever fetched once InlineNearby mounts
  // PoiManager, i.e. only after addressConfirmed flips true. Returns a real
  // (non-settlement) POI so the positive-state assertion proves an actual
  // load, not just an absence of the empty-state copy.
  await page.route(`**/api/listings/${LISTING_ID}/pois/suggestions`, (route) =>
    void route.fulfill(fulfillJson(200, [MOCK_POI])));

  // Forward geocode proxy (AddressSearch's Find + the modal AddressPicker) —
  // one deterministic result reused across specs.
  await page.route('**/api/geocode?**', (route) =>
    void route.fulfill(fulfillJson(200, [FORWARD_RESULT])));

  // Reverse geocode proxy (AC-4.5 "Use my current location").
  await page.route('**/api/geocode/reverse**', (route) =>
    void route.fulfill(fulfillJson(200, REVERSE_RESULT)));

  // Submit for review
  await page.route(`**/api/listings/${LISTING_ID}/submit`, (route) => {
    state.listing.status = 'PENDING_REVIEW';
    void route.fulfill(fulfillJson(200, { ...state.listing, imageCount: state.images.length }));
  });

  // Broker dashboard/list endpoints touched by query invalidation — harmless stubs.
  await page.route('**/api/listings/mine**', (route) => void route.fulfill(fulfillJson(200, { content: [], page: { size: 20, number: 0, totalElements: 0, totalPages: 0 } })));
  await page.route('**/api/listings/mine/stats', (route) => void route.fulfill(fulfillJson(200, { draftCount: 0, pendingReviewCount: 0, liveCount: 0, rejectedCount: 0, totalCount: 0 })));
}

/** Stubs navigator.geolocation BEFORE navigation so AC-4.5 can prove exactly
 * when (if ever) it gets called, without a real OS permission prompt. */
async function stubGeolocation(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __geoCalls: number }).__geoCalls = 0;
    Object.defineProperty(window.navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) => {
          (window as unknown as { __geoCalls: number }).__geoCalls += 1;
          success({
            coords: {
              latitude: 13.35,
              longitude: 74.79,
              accuracy: 10,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
            },
            timestamp: Date.now(),
          } as GeolocationPosition);
        },
      },
    });
  });
}

/** Navigates to the create-listing page and waits for it to render. */
async function gotoNewListing(page: Page) {
  await page.goto('/broker/listings/new');
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByRole('heading', { name: /create a listing/i })).toBeVisible({ timeout: 10_000 });
}

/** Fills the minimum fields required to enable "Save draft" (canSubmit =
 * priceValid only — see ResidentialListingForm.tsx) and persists the draft,
 * so Section 6's <MapPin> (gated on listingId) mounts. */
async function persistMinimalDraft(page: Page) {
  await page.getByLabel(/price \(inr\)/i).fill('50 lakh');
  await page.getByRole('button', { name: /save draft/i }).click();
  await expect(page).toHaveURL(/\/broker\/listings\/new/);
  await expect(page.getByRole('button', { name: /pin location on map/i })).toBeVisible({ timeout: 10_000 });
}

/** AC1/#2 regression — Find -> debounced/explicit search -> "Use" -> resolved
 * chip. Reaches state 2 (resolved, NOT yet pinned); a search-result pick must
 * never itself confirm the map pin. */
async function resolveLocationViaSearch(page: Page, query = 'Manipal') {
  const searchInput = page.getByPlaceholder(/search for a location/i);
  await searchInput.fill(query);
  await page.getByRole('button', { name: 'Find location', exact: true }).click();

  const useButton = page.getByRole('button', { name: 'Use', exact: true });
  await expect(useButton).toBeVisible({ timeout: 10_000 });
  await useButton.click();

  await expect(page.getByText(/location confirmed —/i)).toBeVisible({ timeout: 10_000 });
}

/** AC3/AC4 — open the Section 6 map modal and confirm the draggable pin. This
 * is the ONLY path that persists {latitude, longitude, addressConfirmed:true}
 * via PUT /api/listings/{id} — reaches state 3 (pin confirmed). */
async function confirmPinViaModal(page: Page) {
  const pinButton = page.getByRole('button', { name: /pin location on map/i });
  await expect(pinButton).toBeEnabled();
  await pinButton.click();

  const pinDialog = page.getByRole('dialog', { name: /pin the exact location/i });
  await expect(pinDialog).toBeVisible({ timeout: 10_000 });

  const confirmPinButton = pinDialog.getByRole('button', { name: /confirm location/i });
  await expect(confirmPinButton).toBeVisible({ timeout: 10_000 });
  await confirmPinButton.click();

  await expect(pinDialog).toBeHidden({ timeout: 10_000 });
  await expect(page.getByText(/pin confirmed —/i)).toBeVisible({ timeout: 10_000 });
}

test.describe('@residential-create-listing-1722 /broker/listings/new — correction #4 location flow', () => {
  // -------------------------------------------------------------------------
  // AC-4.7 — MERGE-GATE STATE PAIR (mandatory, front-and-center). Proves
  // Section 2 (<AddressSearch>) and Section 6 (<MapPin>) share ONE resolved
  // state: resolving via Section 2 alone flips Section 6's CTA, with no
  // separate Section-6 resolve. This is the explicit [merge_gate] extra_check.
  // -------------------------------------------------------------------------
  test('AC-4.7 MERGE GATE — resolving via Section 2 AddressSearch enables Section 6 MapPin CTA from the SAME shared state', async ({ page }) => {
    const serverState = createMockServerState();
    await mockSupabaseAuth(page);
    await mockBackend(page, serverState);

    await gotoNewListing(page);
    await persistMinimalDraft(page);

    const pinButton = page.getByRole('button', { name: /pin location on map/i });

    // Negative state — before ANY resolve, Section 6's CTA is disabled and
    // says why.
    await expect(pinButton).toBeDisabled();
    await expect(page.getByText(/confirm a location above to pin it on the map/i)).toBeVisible();

    // The ONLY action taken is a Section 2 resolve — no Section 6 interaction
    // at all yet.
    await resolveLocationViaSearch(page);

    // Positive state — Section 6's CTA is now enabled, purely from the
    // Section 2 resolve, proving both views read the SAME
    // useResidentialLocation instance (contract: ONE hook, shared by both).
    await expect(pinButton).toBeEnabled();
    await expect(page.getByText(/confirm a location above to pin it on the map/i)).toHaveCount(0);

    // Inverse/consistency — "Change" on Section 2 (the same hook's `clear`)
    // drops the resolve, and Section 6's CTA goes back to disabled, again
    // with no direct Section-6 interaction.
    await page.getByRole('button', { name: /^change$/i }).click();
    await expect(pinButton).toBeDisabled();
  });

  // -------------------------------------------------------------------------
  // AC-4.1 — privacy: the buyer preview shows ONLY the coarse publicLoc,
  // never the private full geocoded string (PIN code / taluk / state /
  // country), and the "Buyers see only ..." disclosure renders.
  // -------------------------------------------------------------------------
  test('AC-4.1 privacy — buyer preview shows only the public locality, never the full geocoded string', async ({ page }) => {
    const serverState = createMockServerState();
    await mockSupabaseAuth(page);
    await mockBackend(page, serverState);

    await gotoNewListing(page);
    await persistMinimalDraft(page);
    await resolveLocationViaSearch(page);

    // Section 2 disclosure — restates what buyers actually see.
    const searchCaption = page.getByTestId('address-search-privacy-caption');
    await expect(searchCaption).toBeVisible();
    await expect(searchCaption).toHaveText(`Buyers see only "${PUBLIC_LOC}".`);

    const buyerPreview = page.getByTestId('buyer-preview-card');
    await expect(buyerPreview).toBeVisible();
    await expect(buyerPreview.getByText(PUBLIC_LOC, { exact: true })).toBeVisible();

    for (const marker of PRIVATE_ONLY_MARKERS) {
      await expect(buyerPreview.getByText(marker)).toHaveCount(0);
    }

    // Confirming the pin doesn't leak the private string either.
    await confirmPinViaModal(page);
    await expect(buyerPreview.getByText(PUBLIC_LOC, { exact: true })).toBeVisible();
    for (const marker of PRIVATE_ONLY_MARKERS) {
      await expect(buyerPreview.getByText(marker)).toHaveCount(0);
    }

    const pinCaption = page.getByTestId('map-pin-privacy-caption');
    // Dialog is closed post-confirm, but re-open to check the caption text.
    await page.getByRole('button', { name: /adjust pin/i }).click();
    await expect(pinCaption).toHaveText(`Buyers see only "${PUBLIC_LOC}" — the exact pin and address stay private.`);
  });

  // -------------------------------------------------------------------------
  // AC-4.2 — two independent "Listing strength" rows: "Location entered" and
  // "Map pin confirmed".
  // -------------------------------------------------------------------------
  test('AC-4.2 strength meter — "Location entered" and "Map pin confirmed" toggle independently', async ({ page }) => {
    const serverState = createMockServerState();
    await mockSupabaseAuth(page);
    await mockBackend(page, serverState);

    await gotoNewListing(page);
    await persistMinimalDraft(page);

    const strengthMeter = page.getByTestId('strength-meter-sidebar');
    const locationEnteredRow = strengthMeter.locator('li', { hasText: 'Location entered' });
    const pinConfirmedRow = strengthMeter.locator('li', { hasText: 'Map pin confirmed' });

    // Before any resolve — neither row met.
    await expect(locationEnteredRow.locator('span').first()).not.toHaveClass(/border-primary/);
    await expect(pinConfirmedRow.locator('span').first()).not.toHaveClass(/border-primary/);

    // After resolve (before pin) — "Location entered" met, "Map pin
    // confirmed" NOT met.
    await resolveLocationViaSearch(page);
    await expect(locationEnteredRow.locator('span').first()).toHaveClass(/border-primary/);
    await expect(pinConfirmedRow.locator('span').first()).not.toHaveClass(/border-primary/);

    // After pin-confirm — both met.
    await confirmPinViaModal(page);
    await expect(locationEnteredRow.locator('span').first()).toHaveClass(/border-primary/);
    await expect(pinConfirmedRow.locator('span').first()).toHaveClass(/border-primary/);
  });

  // -------------------------------------------------------------------------
  // AC-4.3 — editing the search query after a resolve/pin-confirm invalidates
  // both: pin CTA disables again, nearby POIs hide, "Map pin confirmed"
  // un-checks.
  // -------------------------------------------------------------------------
  test('AC-4.3 query-edit invalidation — editing the query after pin-confirm clears resolved + pin state', async ({ page }) => {
    const serverState = createMockServerState();
    await mockSupabaseAuth(page);
    await mockBackend(page, serverState);

    await gotoNewListing(page);
    await persistMinimalDraft(page);
    await resolveLocationViaSearch(page);
    await confirmPinViaModal(page);

    await expect(page.getByRole('heading', { name: /nearby points of interest/i })).toBeVisible({ timeout: 10_000 });

    const strengthMeter = page.getByTestId('strength-meter-sidebar');
    const pinConfirmedRow = strengthMeter.locator('li', { hasText: 'Map pin confirmed' });
    await expect(pinConfirmedRow.locator('span').first()).toHaveClass(/border-primary/);

    // Edit the query — diverges from the value backing the current
    // `resolved`, which is a "real edit" per useResidentialLocation.editQuery.
    const searchInput = page.getByPlaceholder(/search for a location/i);
    await searchInput.fill(FORWARD_RESULT.display_name + ' extra');

    const pinButton = page.getByRole('button', { name: /pin location on map/i });
    await expect(pinButton).toBeDisabled({ timeout: 10_000 });
    await expect(page.getByRole('heading', { name: /nearby points of interest/i })).toHaveCount(0, { timeout: 10_000 });
    await expect(pinConfirmedRow.locator('span').first()).not.toHaveClass(/border-primary/);
  });

  // -------------------------------------------------------------------------
  // AC-4.4 — not-found recovery copy for an unsearchable query; Find disabled
  // while empty.
  // -------------------------------------------------------------------------
  test('AC-4.4 not-found — unsearchable query shows recovery copy; Find disabled while empty', async ({ page }) => {
    const serverState = createMockServerState();
    await mockSupabaseAuth(page);
    await mockBackend(page, serverState);

    await gotoNewListing(page);

    const searchInput = page.getByPlaceholder(/search for a location/i);
    const findButton = page.getByRole('button', { name: 'Find location', exact: true });

    // Empty query — Find disabled.
    await expect(findButton).toBeDisabled();

    // <3-char query (isUnsearchable — length check, no network call needed).
    await searchInput.fill('ab');
    await expect(findButton).toBeEnabled();
    await findButton.click();
    await expect(page.getByText(/no results for "ab"/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/try adding a landmark, road name, or pin code/i)).toBeVisible();

    // No-letters query (all-numeric — isUnsearchable's second branch).
    await searchInput.fill('12345');
    await findButton.click();
    await expect(page.getByText(/no results for "12345"/i)).toBeVisible({ timeout: 10_000 });
  });

  // -------------------------------------------------------------------------
  // AC-4.5 — "Use my current location" shows the in-app rationale card
  // BEFORE navigator.geolocation.getCurrentPosition is ever called.
  // -------------------------------------------------------------------------
  test('AC-4.5 geo rationale — rationale card gates navigator.geolocation until "Allow"', async ({ page }) => {
    const serverState = createMockServerState();
    await mockSupabaseAuth(page);
    await mockBackend(page, serverState);
    await stubGeolocation(page);

    await gotoNewListing(page);

    await page.getByRole('button', { name: /use my current location/i }).click();

    const rationale = page.getByRole('dialog', { name: /use current location/i });
    await expect(rationale).toBeVisible({ timeout: 10_000 });

    // navigator.geolocation must NOT have been called yet.
    expect(await page.evaluate(() => (window as unknown as { __geoCalls: number }).__geoCalls)).toBe(0);

    await rationale.getByRole('button', { name: 'Allow', exact: true }).click();

    // Now (and only now) getCurrentPosition was invoked, exactly once.
    await expect(page.getByText(/location confirmed —/i)).toBeVisible({ timeout: 10_000 });
    expect(await page.evaluate(() => (window as unknown as { __geoCalls: number }).__geoCalls)).toBe(1);
  });

  test('AC-4.5 geo rationale — "Not now" dismisses without ever calling navigator.geolocation', async ({ page }) => {
    const serverState = createMockServerState();
    await mockSupabaseAuth(page);
    await mockBackend(page, serverState);
    await stubGeolocation(page);

    await gotoNewListing(page);

    await page.getByRole('button', { name: /use my current location/i }).click();
    const rationale = page.getByRole('dialog', { name: /use current location/i });
    await expect(rationale).toBeVisible({ timeout: 10_000 });

    await rationale.getByRole('button', { name: 'Not now', exact: true }).click();
    await expect(rationale).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __geoCalls: number }).__geoCalls)).toBe(0);
  });

  // -------------------------------------------------------------------------
  // AC-4.6 — pin modal Cancel reverts with no confirm; Adjust pin re-opens
  // seeded with the current pin.
  // -------------------------------------------------------------------------
  test('AC-4.6 picker Cancel/Adjust — Cancel reverts, Adjust pin re-opens seeded with the current pin', async ({ page }) => {
    const serverState = createMockServerState();
    await mockSupabaseAuth(page);
    await mockBackend(page, serverState);

    await gotoNewListing(page);
    await persistMinimalDraft(page);
    await resolveLocationViaSearch(page);

    // Open the modal and Cancel WITHOUT confirming.
    const pinButton = page.getByRole('button', { name: /pin location on map/i });
    await pinButton.click();
    const pinDialog = page.getByRole('dialog', { name: /pin the exact location/i });
    await expect(pinDialog).toBeVisible({ timeout: 10_000 });

    await pinDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(pinDialog).toBeHidden({ timeout: 10_000 });

    // No confirm happened — CTA still says "Pin location on map" (not
    // "Pin confirmed"), and no PUT with addressConfirmed:true was sent.
    await expect(page.getByRole('button', { name: /pin location on map/i })).toBeVisible();
    await expect(page.getByText(/pin confirmed —/i)).toHaveCount(0);
    expect(serverState.listing.addressConfirmed).toBe(false);

    // Now actually confirm, then re-open via "Adjust pin".
    await confirmPinViaModal(page);
    await page.getByRole('button', { name: /adjust pin/i }).click();

    const reopenedDialog = page.getByRole('dialog', { name: /pin the exact location/i });
    await expect(reopenedDialog).toBeVisible({ timeout: 10_000 });
    // Seeded with the current (already-confirmed) pin — AddressPicker shows
    // its "Confirm Location" action immediately (a pin is already placed),
    // not the empty "search or click the map" state.
    await expect(reopenedDialog.getByRole('button', { name: /confirm location/i })).toBeVisible({ timeout: 10_000 });
    await expect(reopenedDialog.getByText(/search for a location above, click the map/i)).toHaveCount(0);

    await reopenedDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(reopenedDialog).toBeHidden({ timeout: 10_000 });
    // Cancelling the re-open doesn't unconfirm the already-persisted pin.
    await expect(page.getByText(/pin confirmed —/i)).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Regression — full create flow under the NEW UI: Find -> resolved ->
  // pin-confirmed, POI/strength gating, persisted-pin cross-navigation proof,
  // AC5 cover reorder, AC6 honest preview, AC7 submit, AC8 property details.
  // -------------------------------------------------------------------------
  test('regression — two-stage location, POI/strength gating, cover reorder, honest preview, submit', async ({ page }) => {
    const serverState = createMockServerState();
    await mockSupabaseAuth(page);
    await mockBackend(page, serverState);

    await gotoNewListing(page);

    // Apartment is the default preselected type (#1626 Phase-7A).
    // --- Section 2 — core facts ---
    await page.locator('#title').fill('3 BHK Apartment in Manipal');
    await page.getByLabel(/price \(inr\)/i).fill('50 lakh');

    // --- Section 3 — apartment type-specific submit gate (bedrooms + carpet area) ---
    await page.locator('#bedrooms').getByRole('radio', { name: '3 BHK', exact: true }).click();
    await page.locator('#carpetArea').fill('1150');

    // --- Section 5 "More details" — built-up area is REQUIRED to submit for
    // apartments (src/lib/listingStrength.ts typeSpecificGateMet), but lives
    // in the collapsed "More details" panel (AC8 grouping), not Section 3.
    await page.getByRole('button', { name: /more details.*ownership.*document details/i }).click();
    await page.locator('#builtArea').fill('1200');

    // Persist the DRAFT inline — no navigation away from this page (issue #1718).
    await page.getByRole('button', { name: /save draft/i }).click();
    await expect(page).toHaveURL(/\/broker\/listings\/new/);
    await expect(page.getByPlaceholder(/search for a location/i)).toBeVisible({ timeout: 10_000 });

    // -----------------------------------------------------------------------
    // AC3 — "Pin location on map" is DISABLED until a starting location is
    // resolved (state 1: nothing confirmed yet).
    // -----------------------------------------------------------------------
    const pinButton = page.getByRole('button', { name: /pin location on map/i });
    await expect(pinButton).toBeDisabled();

    // -----------------------------------------------------------------------
    // #2/AC1 — Find -> results -> "Use" -> confirmed STARTING location chip.
    // Reaches state 2 (resolved, NOT yet pinned) — selecting a search result
    // must never itself confirm the map pin.
    // -----------------------------------------------------------------------
    await resolveLocationViaSearch(page);
    await expect(pinButton).toBeEnabled();

    // -----------------------------------------------------------------------
    // MERGE-GATE NEGATIVE-STATE ASSERTION — at state 2 a resolved search
    // result is NOT a confirmed map pin: nearby POIs must NOT be
    // loaded/visible, and the strength meter's pin-related row is NOT met.
    // -----------------------------------------------------------------------
    await expect(page.getByRole('heading', { name: /nearby points of interest/i })).toHaveCount(0);

    const strengthMeter = page.getByTestId('listing-strength-meter');
    const pinnedRow = strengthMeter.locator('li', { hasText: 'Location pinned' });
    await expect(pinnedRow).toBeVisible();
    await expect(pinnedRow.locator('span').first()).toHaveClass(/border-border/);
    await expect(pinnedRow.locator('span').first()).not.toHaveClass(/border-primary/);

    // -----------------------------------------------------------------------
    // AC3/AC4 — open the map modal and confirm the draggable pin. Reaches
    // state 3 (pin confirmed).
    // -----------------------------------------------------------------------
    await confirmPinViaModal(page);

    // -----------------------------------------------------------------------
    // MERGE-GATE POSITIVE-STATE ASSERTION — now that the pin is confirmed,
    // nearby POIs load and the strength meter marks the pin/location step
    // complete.
    // -----------------------------------------------------------------------
    await expect(page.getByRole('heading', { name: /nearby points of interest/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(MOCK_POI.name)).toBeVisible({ timeout: 10_000 });

    await expect(pinnedRow.locator('span').first()).toHaveClass(/border-primary/);

    // -----------------------------------------------------------------------
    // Persisted-pin proof (substitutes for a same-route reload —
    // ResidentialListingForm keeps listingId in local React state and
    // /broker/listings/new carries no id in the URL, so a literal
    // page.reload() would restart the wizard from scratch rather than
    // proving server-side persistence). A genuine fresh navigation to the
    // id-bearing EditListing route, backed by the SAME mocked
    // GET /api/listings/{id}, must still show the pin confirmed.
    // -----------------------------------------------------------------------
    // A genuine, fully independent browser context/tab (own localStorage
    // partition — a same-context newPage() would fire a cross-tab `storage`
    // event when its addInitScript writes the Supabase auth key, which
    // supabase-js's GoTrueClient listens for and uses to resync/reset auth
    // state in EVERY open tab, including the in-progress create-flow `page`;
    // an isolated context avoids that storage cross-talk entirely) forces a
    // real fresh navigation/load of the id-bearing EditListing route WITHOUT
    // tearing down the in-progress create-flow page's React state.
    const browser = page.context().browser();
    const editContext = await browser!.newContext();
    const editPage = await editContext.newPage();
    await mockSupabaseAuth(editPage);
    await mockBackend(editPage, serverState);
    await editPage.goto(`/broker/listings/${LISTING_ID}/edit`);
    await editPage.waitForLoadState('domcontentloaded');
    // EditListing's step stepper computes "Pin Location" completeness directly
    // from listing.addressConfirmed (server state) — this is the honest,
    // robust cross-page proof that the pin survived a real navigation/reload.
    await expect(editPage.getByRole('button', { name: /step 3: pin location \(complete\)/i })).toBeVisible({ timeout: 10_000 });
    await editContext.close();

    // -----------------------------------------------------------------------
    // AC5 — 5-tile photo grid + inline "Set cover" reorder-to-index-0.
    // -----------------------------------------------------------------------
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([
      path.join(FIXTURE_DIR, 'flat1.jpg'),
      path.join(FIXTURE_DIR, 'flat2.jpg'),
      path.join(FIXTURE_DIR, 'flat3.jpg'),
    ]);

    const photoGrid = page.getByTestId('photo-tile-grid');
    await expect(photoGrid.getByTestId('photo-tile-0')).toBeVisible({ timeout: 10_000 });
    await expect(photoGrid.getByTestId('photo-tile-2')).toBeVisible({ timeout: 10_000 });
    // Wait for all 3 uploads to fully register (their upload-url requests
    // race, so which storagePath number lands on which tile is not
    // deterministic — the assertions below compare against a captured src,
    // never a hardcoded "photo-N", to stay independent of that race).
    await expect(page.getByText(/3\/5 photos/i)).toBeVisible({ timeout: 10_000 });

    // Cover badge starts on tile 0 (the first upload).
    await expect(photoGrid.getByTestId('photo-tile-0').getByText('Cover')).toBeVisible();
    const tile2SrcBeforePromotion = await photoGrid.getByTestId('photo-tile-2').locator('img').getAttribute('src');
    expect(tile2SrcBeforePromotion).toBeTruthy();

    // Promote tile 2 to cover via the inline "Set cover" action. toHaveURL-
    // style polling — the reorder is a real PUT + query invalidation round
    // trip, not an instant local-state flip.
    await photoGrid.getByTestId('photo-tile-2').getByRole('button', { name: /set cover/i }).click();
    await expect(photoGrid.getByTestId('photo-tile-0').locator('img')).toHaveAttribute('src', tile2SrcBeforePromotion!, { timeout: 10_000 });
    await expect(photoGrid.getByTestId('photo-tile-0').getByText('Cover')).toBeVisible();

    // -----------------------------------------------------------------------
    // AC6 — honest buyer preview: real cover thumbnail (reflects the reorder
    // above), reflects the confirmed location, and carries NO "Verified
    // broker" badge anywhere on the page.
    // -----------------------------------------------------------------------
    const buyerPreview = page.getByTestId('buyer-preview-card');
    await expect(buyerPreview).toBeVisible({ timeout: 10_000 });
    await expect(buyerPreview.getByTestId('buyer-preview-cover-image')).toHaveAttribute('src', tile2SrcBeforePromotion!, { timeout: 10_000 });
    await expect(buyerPreview.getByTestId('buyer-preview-location-confirmed')).toBeVisible();
    await expect(page.getByText(/verified broker/i)).toHaveCount(0);

    // -----------------------------------------------------------------------
    // AC7 — Move to review, then submit -> PENDING_REVIEW-oriented honest copy.
    // -----------------------------------------------------------------------
    await page.getByRole('button', { name: /^review$/i }).click();
    await expect(page.getByRole('heading', { name: /review your listing/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/published/i)).toHaveCount(0);
    await expect(page.getByText(/verified broker/i)).toHaveCount(0);

    const submitButton = page.getByRole('button', { name: /submit for review/i });
    await expect(submitButton).toBeEnabled({ timeout: 10_000 });
    await submitButton.click();

    // Scoped to the heading — the same copy also appears in the toast
    // notification region, which would otherwise trip Playwright's
    // strict-mode multiple-match check.
    await expect(page.getByRole('heading', { name: /submitted for review/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/pending admin approval/i).first()).toBeVisible();
    await expect(page.getByText(/published/i)).toHaveCount(0);
  });
});
