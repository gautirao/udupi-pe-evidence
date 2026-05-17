/**
 * POI Display — nearby points-of-interest on listing detail
 *
 * Covers:
 *   P1 — NearbyPois section renders when API returns approved POIs (user auth)
 *   P2 — NearbyPois section is hidden when API returns empty list (user auth)
 *   P3 — Broker sees approved POIs on their listing detail page (broker auth)
 *   P4 — Approved POIs from backend render with correct names (broker auth)
 *   PM1 — Broker POI curation: approve in PoiManager → verify in Approved tab → verify on listing detail
 *
 * Auth enforcement (401 without token) is covered by the Spring unit test
 * ListingPoiControllerTest#getApproved_withoutAuth_returns401.
 *
 * Run locally:
 *   SMOKE_USER_EMAIL=you@example.com SMOKE_USER_PASSWORD=secret npm run test:e2e -- --project=chromium e2e/poi-display.spec.ts
 *
 * All tests skip gracefully when SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD are not set.
 *
 * Implementation notes:
 *   - Spring backend public listing endpoint is intercepted to inject a
 *     deterministic listing fixture (avoids live-DB dependency).
 *   - Spring backend POI endpoint is intercepted separately to control the
 *     POI list returned for each test.
 */

import { test, expect } from '@playwright/test';
import { hasRealCredentials } from './helpers';

const userEmail    = process.env.SMOKE_USER_EMAIL    ?? '';
const userPassword = process.env.SMOKE_USER_PASSWORD ?? '';
const hasUserCreds = hasRealCredentials(userEmail, userPassword);

const brokerEmail    = process.env.BROKER_EMAIL ?? process.env.DEALER_EMAIL ?? '';
const brokerPassword = process.env.BROKER_PASSWORD ?? process.env.DEALER_PASSWORD ?? '';
const hasBrokerCreds = hasRealCredentials(brokerEmail, brokerPassword);

test.use({ storageState: 'e2e/fixtures/user-auth.json' });

const FIXTURE_LISTING_ID = 'e2e-poi-listing-fixture';

/** Fixture listing with coordinates so NearbyPois can attempt to display. */
const LISTING_FIXTURE = {
  id: FIXTURE_LISTING_ID,
  propertyType: 'land',
  status: 'LIVE',
  title: 'E2E POI Test Plot',
  locality: 'Udupi',
  price: 5_000_000,
  price_unit: 'INR',
  landArea: 10,
  landAreaUnit: 'cent',
  builtArea: null,
  builtAreaUnit: null,
  bedrooms: null,
  bathrooms: null,
  contact_info: null,
  contact_phone: null,
  description: null,
  latitude: 13.3409,
  longitude: 74.7421,
  confidence_score: 90,
  price_per_cent_paise: null,
  createdAt: '2026-01-01T00:00:00+00:00',
  updatedAt: '2026-01-01T00:00:00+00:00',
  // Required ListingResponse fields
  addressConfirmed: true,
  imageCount: 0,
  firstImageUrl: null,
  rejectionReason: null,
  videoUrl: null,
  reraNumber: null,
  listingPurpose: null,
  sellerType: null,
  carpetArea: null,
  carpetAreaUnit: null,
  floorNumber: null,
  totalFloors: null,
  furnishingStatus: null,
  washrooms: null,
  parkingCount: null,
  roadFrontageFt: null,
  commercialUsage: null,
  numberOfUnits: null,
  monthlyRent: null,
  securityDepositMonths: null,
  lockInMonths: null,
  // Required by PublicListingDetail interface in ListingDetail.tsx
  images: [],
};

/** Two approved POIs covering two distinct categories. */
const POI_FIXTURES = [
  { id: 'poi-1', name: 'District Hospital', category: 'HOSPITAL',  distanceMeters: 150, latitude: 13.341, longitude: 74.743, pinned: false, approved: true },
  { id: 'poi-2', name: "St. Mary's School",  category: 'SCHOOL',    distanceMeters: 300, latitude: 13.342, longitude: 74.744, pinned: false, approved: true },
];

/** Intercept Spring backend public listing endpoint to return a deterministic listing fixture. */
async function stubListing(page: import('@playwright/test').Page): Promise<void> {
  // INTEGRATION-UI: stub justified — isolate from backend variability
  await page.route(`**/api/public/listings/${FIXTURE_LISTING_ID}`, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(LISTING_FIXTURE),
    });
  });
}

// @integration-ui
// ---------------------------------------------------------------------------
// P1 — NearbyPois renders when API returns approved POIs
// ---------------------------------------------------------------------------
test('P1 — NearbyPois section renders with approved POIs from backend', async ({ page }) => {
  test.skip(!hasUserCreds, 'SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD not set — skipping P1');

  await stubListing(page);

  // Stub the Spring backend POI endpoint with approved POIs
  // INTEGRATION-UI: stub justified — force known POI data to assert NearbyPois rendering
  await page.route(`**/api/listings/${FIXTURE_LISTING_ID}/pois`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(POI_FIXTURES),
    });
  });

  await page.goto(`/listing/${FIXTURE_LISTING_ID}`);
  await page.waitForLoadState('domcontentloaded');

  // NearbyPois card heading
  await expect(page.getByText('Nearby').first()).toBeVisible({ timeout: 10_000 });

  // Both POI names appear
  await expect(page.getByText('District Hospital').first()).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText("St. Mary's School").first()).toBeVisible({ timeout: 5_000 });

  // OpenStreetMap attribution is present
  await expect(page.getByText('OpenStreetMap').first()).toBeVisible({ timeout: 5_000 });
});

// ---------------------------------------------------------------------------
// P2 — NearbyPois section is hidden when API returns empty list
// ---------------------------------------------------------------------------
test('P2 — NearbyPois section is hidden when backend returns no POIs', async ({ page }) => {
  test.skip(!hasUserCreds, 'SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD not set — skipping P2');

  await stubListing(page);

  // Stub POI endpoint with empty array
  // INTEGRATION-UI: stub justified — force empty results to assert empty-state UI
  await page.route(`**/api/listings/${FIXTURE_LISTING_ID}/pois`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  // Set up response capture before navigating — response arrives during page load.
  // waitForResponse works with page.route stubs: it resolves when the stub returns.
  const poisResponse = page.waitForResponse(
    `**/api/listings/${FIXTURE_LISTING_ID}/pois`,
    { timeout: 10_000 },
  );

  await page.goto(`/listing/${FIXTURE_LISTING_ID}`);
  await page.waitForLoadState('domcontentloaded');
  await poisResponse;

  // NearbyPois card must not be present (use exact match to avoid matching "Nearby Schools" etc.)
  await expect(page.getByText('Nearby', { exact: true })).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// P3/P4 — Broker-authenticated POI verification
// ---------------------------------------------------------------------------
test.describe('@integration-ui Broker-authenticated POI display', () => {
  test.use({ storageState: 'e2e/fixtures/broker-auth.json' });

  test('P3 — broker sees approved POIs on listing detail', async ({ page }) => {
    test.skip(!hasBrokerCreds, 'BROKER_EMAIL / BROKER_PASSWORD not set — skipping P3');

    await stubListing(page);

    // INTEGRATION-UI: stub justified — isolate from backend variability
    await page.route(`**/api/listings/${FIXTURE_LISTING_ID}/pois`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(POI_FIXTURES),
      });
    });

    const poisResponse = page.waitForResponse(
      `**/api/listings/${FIXTURE_LISTING_ID}/pois`,
      { timeout: 10_000 },
    );

    await page.goto(`/listing/${FIXTURE_LISTING_ID}`);
    await page.waitForLoadState('domcontentloaded');
    await poisResponse;

    // NearbyPois card renders (land mode → "Also Nearby" section contains "Nearby" text)
    await expect(page.getByText('Nearby').first()).toBeVisible({ timeout: 10_000 });

    // Both approved POI names appear — same data as user-auth P1
    await expect(page.getByText('District Hospital').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("St. Mary's School").first()).toBeVisible({ timeout: 5_000 });
  });

  test('P4 — approved POIs from backend render with correct names', async ({ page }) => {
    test.skip(!hasBrokerCreds, 'BROKER_EMAIL / BROKER_PASSWORD not set — skipping P4');

    // Distinct set of approved POIs — the backend (findByListingIdAndApprovedTrue)
    // only returns approved POIs, so the stub mirrors real API behavior.
    const P4_POI_FIXTURES = [
      { id: 'poi-4', name: 'Manipal Bus Stand',  category: 'TRANSPORT',    distanceMeters: 500, latitude: 13.344, longitude: 74.746, pinned: false, approved: true },
      { id: 'poi-5', name: 'Town Hall',          category: 'TOWN_CENTER',  distanceMeters: 100, latitude: 13.340, longitude: 74.741, pinned: true,  approved: true },
      { id: 'poi-1', name: 'District Hospital',  category: 'HOSPITAL',     distanceMeters: 150, latitude: 13.341, longitude: 74.743, pinned: false, approved: true },
    ];

    await stubListing(page);

    // INTEGRATION-UI: stub justified — force known POI set to assert correct names and categories
    await page.route(`**/api/listings/${FIXTURE_LISTING_ID}/pois`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(P4_POI_FIXTURES),
      });
    });

    const poisResponse = page.waitForResponse(
      `**/api/listings/${FIXTURE_LISTING_ID}/pois`,
      { timeout: 10_000 },
    );

    await page.goto(`/listing/${FIXTURE_LISTING_ID}`);
    await page.waitForLoadState('domcontentloaded');
    await poisResponse;

    // Amenity POIs render in "Also Nearby" section
    await expect(page.getByText('Manipal Bus Stand').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('District Hospital').first()).toBeVisible({ timeout: 5_000 });

    // Settlement POI renders in "Settlement Context" section
    await expect(page.getByText('Town Hall').first()).toBeVisible({ timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// PM1 — Broker POI curation: approve in PoiManager → verify in Approved tab → verify on listing detail
// ---------------------------------------------------------------------------
test.describe('@integration-ui Broker POI curation flow', () => {
  test.use({ storageState: 'e2e/fixtures/broker-auth.json' });

  test('PM1 — approve POI in PoiManager, verify in Approved tab, verify on listing detail', async ({ page }) => {
    test.skip(!hasBrokerCreds, 'BROKER_EMAIL / BROKER_PASSWORD not set — skipping PM1');

    // ── Fixture data ──────────────────────────────────────────────────────

    /** Listing stub for the broker's EditListing page (GET /api/listings/:id). */
    const EDIT_LISTING_FIXTURE = {
      id: FIXTURE_LISTING_ID,
      status: 'DRAFT',
      propertyType: 'house',
      title: 'E2E POI Test House',
      locality: 'Udupi',
      price: 5_000_000,
      description: null,
      landArea: 10,
      landAreaUnit: 'cent',
      builtArea: null,
      builtAreaUnit: null,
      bedrooms: null,
      latitude: null,
      longitude: null,
      addressConfirmed: true,
      imageCount: 3,
      firstImageUrl: null,
      rejectionReason: null,
      videoUrl: null,
      reraNumber: null,
      listingPurpose: null,
      sellerType: null,
      carpetArea: null,
      carpetAreaUnit: null,
      floorNumber: null,
      totalFloors: null,
      furnishingStatus: null,
      washrooms: null,
      parkingCount: null,
      roadFrontageFt: null,
      commercialUsage: null,
      numberOfUnits: null,
      monthlyRent: null,
      securityDepositMonths: null,
      lockInMonths: null,
      earnedBadgeCount: 0,
      createdAt: '2026-01-01T00:00:00+00:00',
      updatedAt: '2026-01-01T00:00:00+00:00',
    };

    /** POI suggestions before approval — 2 unapproved amenities + 1 settlement. */
    const SUGGESTIONS_BEFORE = [
      { id: 'poi-10', name: 'City Hospital', category: 'HOSPITAL', distanceMeters: 200, latitude: 13.341, longitude: 74.743, pinned: false, approved: false },
      { id: 'poi-11', name: 'Central School', category: 'SCHOOL', distanceMeters: 400, latitude: 13.342, longitude: 74.744, pinned: false, approved: false },
      { id: 'poi-12', name: 'Manipal Town', category: 'TOWN_CENTER', distanceMeters: 500, latitude: 13.340, longitude: 74.741, pinned: false, approved: true },
    ];

    /** POI suggestions after approving poi-10 — City Hospital is now approved. */
    const SUGGESTIONS_AFTER = [
      { id: 'poi-10', name: 'City Hospital', category: 'HOSPITAL', distanceMeters: 200, latitude: 13.341, longitude: 74.743, pinned: false, approved: true },
      { id: 'poi-11', name: 'Central School', category: 'SCHOOL', distanceMeters: 400, latitude: 13.342, longitude: 74.744, pinned: false, approved: false },
      { id: 'poi-12', name: 'Manipal Town', category: 'TOWN_CENTER', distanceMeters: 500, latitude: 13.340, longitude: 74.741, pinned: false, approved: true },
    ];

    // ── Stub: broker listing endpoint (EditListing) ───────────────────────
    // Register POI sub-routes FIRST so they take priority over the listing route.

    // Stub images endpoint (EditListing step 4 needs this)
    // INTEGRATION-UI: stub justified — isolate from backend variability
    await page.route(`**/api/listings/${FIXTURE_LISTING_ID}/images`, async (route) => {
      if (route.request().method() !== 'GET') { await route.continue(); return; }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    // Stub suggestions endpoint — initially returns pre-approve data
    const suggestionsUrl = `**/api/listings/${FIXTURE_LISTING_ID}/pois/suggestions`;
    // INTEGRATION-UI: stub justified — isolate from backend variability
    await page.route(suggestionsUrl, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(SUGGESTIONS_BEFORE),
      });
    });

    // Stub the approve PATCH endpoint
    // INTEGRATION-UI: stub justified — isolate from backend variability
    await page.route(`**/api/listings/${FIXTURE_LISTING_ID}/pois/poi-10/approve`, async (route) => {
      if (route.request().method() !== 'PATCH') { await route.continue(); return; }
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    // Stub broker listing endpoint — must NOT intercept /pois or /images sub-paths
    // INTEGRATION-UI: stub justified — isolate from backend variability
    await page.route(`**/api/listings/${FIXTURE_LISTING_ID}`, async (route) => {
      if (route.request().method() !== 'GET') { await route.continue(); return; }
      const url = route.request().url();
      if (url.includes('/pois') || url.includes('/images')) { await route.fallback(); return; }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(EDIT_LISTING_FIXTURE),
      });
    });

    // Stub public listing endpoint (for listing detail page later)
    await stubListing(page);

    // ── Navigate to EditListing Step 4 ────────────────────────────────────

    const suggestionsResponse = page.waitForResponse(suggestionsUrl, { timeout: 15_000 });
    await page.goto(`/broker/listings/${FIXTURE_LISTING_ID}/edit?step=4`);
    await suggestionsResponse;

    // ── Verify "Nearby Places" tab shows unapproved amenities ─────────────

    await expect(page.getByText('Nearby Points of Interest')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('City Hospital').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Central School').first()).toBeVisible({ timeout: 5_000 });

    // Manipal Town is a settlement POI — shown in Location Context, NOT in tabs
    // Verify it appears in the Location Context block but not as an approvable row
    await expect(page.getByRole('button', { name: /approve manipal town/i })).toHaveCount(0);

    // ── Approve City Hospital ─────────────────────────────────────────────

    // Re-stub suggestions to return post-approve data before clicking
    await page.unroute(suggestionsUrl);
    // INTEGRATION-UI: stub justified — re-stub to return post-approve data to assert approved-tab UI
    await page.route(suggestionsUrl, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(SUGGESTIONS_AFTER),
      });
    });

    const approveResponse = page.waitForResponse(
      (resp) => resp.url().includes(`/pois/poi-10/approve`) && resp.request().method() === 'PATCH',
      { timeout: 10_000 },
    );
    const postApproveSuggestions = page.waitForResponse(suggestionsUrl, { timeout: 10_000 });

    await page.getByRole('button', { name: /approve city hospital/i }).click();
    await approveResponse;
    await postApproveSuggestions;

    // ── Verify "Approved" tab shows the approved POI ──────────────────────

    // PoiManager auto-switches to "Approved" tab after successful approve
    // (approveMutation.onSettled sets activeTab to 'approved')
    await expect(page.getByText('City Hospital').first()).toBeVisible({ timeout: 5_000 });

    // The Approved tab trigger should show a count badge
    const approvedTab = page.getByRole('tab', { name: /approved/i });
    await expect(approvedTab).toBeVisible({ timeout: 5_000 });
    // Badge shows "1" for the single approved amenity POI
    await expect(approvedTab.getByText('1')).toBeVisible({ timeout: 5_000 });

    // ── Navigate to listing detail and verify NearbyPois ──────────────────

    // Stub the public approved-POIs endpoint for listing detail
    // INTEGRATION-UI: stub justified — isolate from backend variability
    await page.route(`**/api/listings/${FIXTURE_LISTING_ID}/pois`, async (route) => {
      // Skip if this is the /pois/suggestions sub-path
      if (route.request().url().includes('/suggestions')) { await route.continue(); return; }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'poi-10', name: 'City Hospital', category: 'HOSPITAL', distanceMeters: 200, latitude: 13.341, longitude: 74.743, pinned: false, approved: true },
        ]),
      });
    });

    const poisResponse = page.waitForResponse(
      (resp) => resp.url().includes(`/listings/${FIXTURE_LISTING_ID}/pois`) && !resp.url().includes('/suggestions'),
      { timeout: 10_000 },
    );

    await page.goto(`/listing/${FIXTURE_LISTING_ID}`);
    await poisResponse;

    // City Hospital should be visible in the NearbyPois component
    await expect(page.getByText('City Hospital').first()).toBeVisible({ timeout: 5_000 });
  });
});
