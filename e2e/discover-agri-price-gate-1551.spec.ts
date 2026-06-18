/**
 * discover-agri-price-gate-1551.spec.ts
 *
 * E2E spec for issue #1551:
 *   "agri-map-listings: authed price + 5 new fields; school-first selected-results markers"
 *
 * Covers:
 *   AC-ANON   Anon agri locality card shows "Sign in to view price" / Lock; NO rupee glyph.
 *   AC-AUTHED Authed agri locality card shows a formatted rupee price; no Lock affordance.
 *   AC-CHIPS  Agri card with new fields (roadAccess, soilType, cultivationStatus, ownershipType)
 *             renders at least one human-label chip (e.g. "Tarred road", "Red laterite").
 *   AC-MKR    School-first + authed + zoom≥13 + schoolId → property markers visible alongside
 *             the school-circle overlay (AC12 + AC13 combined: overlay does NOT suppress markers).
 *   AC-ZOOM   After map settles in a school-first selected-school state, a programmatic map
 *             interaction does NOT snap zoom back (the #1547 zoom-stability guard holds for
 *             school-first).
 *   AC-AREA   Area-first narrowed layout still renders listing-card ≥ 1 (light AC17 smoke).
 *
 * Stubbing strategy:
 *   All Discover API routes intercepted → runs without a seeded backend.
 *   Anon tests: storageState: undefined — agri-map-listings skipAuth:true path.
 *   Authed tests: storageState: 'e2e/fixtures/user-auth.json' — hook sends Authorization
 *     header → backend returns exact price. We stub the same endpoint with pricePaise
 *     populated to simulate the authed projection.
 *   If user-auth.json is missing or the session is stale, authed tests are skipped
 *   gracefully (same pattern as discover-agri-journey-1375.spec.ts).
 *
 * Run (stub only — no backend required):
 *   npx playwright test e2e/discover-agri-price-gate-1551.spec.ts --project=chromium
 * Or via local harness (full project):
 *   bash scripts/run-e2e-local.sh --project=full e2e/discover-agri-price-gate-1551.spec.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { test, expect, type Page, type Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CITY = 'udupi';
const REGION = 'S';
const MAX_KM = '25';
const AREA_KEY = 'IN|KA|Udupi|Manipal';
const ENCODED_AREA_KEY = encodeURIComponent(AREA_KEY);

const MIT_SCHOOL_ID = '8c279ab2-5770-44dd-a15e-57526b0b4a91';
const MIT_LAT = 13.35250;
const MIT_LON = 74.79226;
const RADIUS_KM = 3;

// Agri listing used by anon/authed/chips tests
const AGRI_LISTING_ID = 'agri-1551-listing-001';

// Price in paise that the backend returns for authed users
// 48,00,000 → ₹48,00,000 formatted (lakh notation)
const AUTHED_PRICE_PAISE = 4800000_00; // 48,00,000 rupees × 100

// ---------------------------------------------------------------------------
// Auth guard helpers
// ---------------------------------------------------------------------------

const __dirname_esm = path.dirname(fileURLToPath(import.meta.url));
const USER_AUTH_PATH = path.join(__dirname_esm, 'fixtures', 'user-auth.json');

function userAuthStorageStateExists(): boolean {
  return fs.existsSync(USER_AUTH_PATH);
}

/**
 * Returns true if the page appears authenticated (Supabase session in localStorage).
 * Falls back to checking for absence of "Sign in" in page content.
 * Lightweight check — does NOT perform a real auth flow.
 */
async function isPageAuthenticated(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const storage = Object.keys(localStorage);
    return storage.some((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
  });
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TRENDS_OPTIONS_FIXTURE = {
  city: CITY,
  defaultAreas: [{ areaKey: 'IN|KA|Udupi|Padubidri', areaLabel: 'Padubidri' }],
};

const DISCOVER_AREAS_FIXTURE = {
  city: CITY,
  areas: [
    {
      areaKey: AREA_KEY,
      name: 'Manipal',
      geoCenterLat: 13.3509,
      geoCenterLon: 74.7932,
      minLat: 13.33,
      maxLat: 13.38,
      minLon: 74.77,
      maxLon: 74.82,
      listingCount: 2,
      listingCount90d: 2,
      schoolCount: 4,
      trendDirection: 'stable',
    },
  ],
};

const REGIONAL_AREA_GROUPS_FIXTURE = {
  city: CITY,
  groups: [
    {
      directionCode: REGION,
      groupName: 'South towards Udupi',
      availableMaxDistances: [
        {
          maxKm: 25,
          distanceLabel: 'Up to 25 km',
          includedBandCodes: ['0_10', '10_25'],
          listingCount: 1,
          areaKeys: ['IN|KA|Udupi|Brahmavar'],
        },
      ],
    },
  ],
};

/**
 * Agri listing fixture with all new #1551 fields populated.
 * pricePaise is null here — anon projection from backend.
 */
const AGRI_LISTINGS_FIXTURE_ANON = {
  city: CITY,
  truncated: false,
  limit: 250,
  listings: [
    {
      id: AGRI_LISTING_ID,
      areaKey: 'IN|KA|Udupi|Brahmavar',
      latitude: 13.18,
      longitude: 74.76,
      // Anon projection: coarsened coords (already reflected above), null price
      pricePaise: null,
      propertyType: 'agricultural_land',
      title: '[AGRI-1551] 4-Acre Farm, Brahmavar',
      locality: 'Brahmavar',
      landArea: 4.0,
      landAreaUnit: 'acres',
      computedAreaAcres: 3.97,
      boundaryGeoJson: null,
      listingPurpose: 'sale',
      landCategory: 'FARMLAND',
      farmhouseAvailable: false,
      fencingDone: true,
      waterSource: 'BOREWELL',
      // New #1551 fields
      roadAccess: 'TARRED_ROAD',
      soilType: 'RED_LATERITE',
      cultivationStatus: 'CULTIVATED',
      ownershipType: 'FREEHOLD',
      updatedAt: '2026-06-10T08:00:00Z',
    },
  ],
};

/**
 * Same listing, authed projection: pricePaise populated with exact price.
 * Exact (not coarsened) coordinates also returned by backend for authed users.
 */
const AGRI_LISTINGS_FIXTURE_AUTHED = {
  ...AGRI_LISTINGS_FIXTURE_ANON,
  listings: [
    {
      ...AGRI_LISTINGS_FIXTURE_ANON.listings[0],
      pricePaise: AUTHED_PRICE_PAISE,
      // Exact (non-coarsened) coords
      latitude: 13.181234,
      longitude: 74.762345,
    },
  ],
};

/**
 * Fixture for /api/discover/markers — residential markers near MIT.
 * Shape mirrors DiscoverFilteredMarkersResponse (useDiscoverFilteredMarkers.ts).
 * Residential only: agri excluded per #1463 (school-first excludePropertyType=agricultural_land).
 */
const FILTERED_MARKERS_FIXTURE = {
  city: CITY,
  bbox: null,
  markers: [
    {
      id: 'mk-1551-house-001',
      lat: MIT_LAT + 0.002,
      lon: MIT_LON + 0.002,
      pricePaise: 50_000_000,
      locality: 'Manipal',
      propertyType: 'house',
      boundary: null,
    },
    {
      id: 'mk-1551-apt-002',
      lat: MIT_LAT - 0.003,
      lon: MIT_LON + 0.001,
      pricePaise: 28_000_000,
      locality: 'Manipal',
      propertyType: 'apartment',
      boundary: null,
    },
  ],
  truncated: false,
  returnedElements: 2,
  totalFilteredElements: 2,
  boundsApplied: false,
};

// City listings (residential) for school-first and area-first tests
const CITY_LISTINGS_FIXTURE = {
  city: CITY,
  limitPerArea: 50,
  areas: [
    {
      areaKey: AREA_KEY,
      areaName: 'Manipal',
      listings: [
        {
          id: 'school-1551-listing-001',
          propertyType: 'house',
          title: 'House Near MIT',
          locality: 'Manipal',
          pricePaise: 50000000,
          lat: MIT_LAT + 0.004,
          lon: MIT_LON + 0.004,
          latitude: MIT_LAT + 0.004,
          longitude: MIT_LON + 0.004,
          listingPurpose: 'sale',
          bedrooms: 3,
          bathrooms: 2,
        },
        {
          id: 'school-1551-listing-002',
          propertyType: 'apartment',
          title: 'Flat Near MIT Campus',
          locality: 'Manipal',
          pricePaise: 28000000,
          lat: MIT_LAT - 0.005,
          lon: MIT_LON - 0.003,
          latitude: MIT_LAT - 0.005,
          longitude: MIT_LON - 0.003,
          listingPurpose: 'rent',
          bedrooms: 2,
          bathrooms: 1,
        },
      ],
    },
  ],
};

const MIT_SCHOOL = {
  id: MIT_SCHOOL_ID,
  name: 'Manipal Institute of Technology',
  board: 'DEEMED',
  boardType: null,
  address: 'Manipal, Udupi, Karnataka 576104',
  latitude: MIT_LAT,
  longitude: MIT_LON,
  distanceKm: 0.0,
  areaKey: AREA_KEY,
};

// School-radius listings for the public school-first path (anon property markers)
const SCHOOL_RADIUS_LISTINGS_FIXTURE = {
  content: [
    {
      id: 'sr-1551-001',
      listingNumber: 9100,
      propertyType: 'house',
      title: 'House Near MIT',
      locality: 'Manipal',
      areaKey: AREA_KEY,
      pricePaise: 50_000_000,
      landArea: null,
      landAreaUnit: null,
      builtArea: 1400,
      builtAreaUnit: 'sqft',
      bedrooms: 3,
      latitude: MIT_LAT + 0.001,
      longitude: MIT_LON + 0.001,
      heroImageUrl: null,
      listingPurpose: 'sale',
      possessionStatus: 'ready_to_move',
      daysOnMarket: 3,
      backOnMarket: false,
      createdAt: '2026-06-01T00:00:00Z',
    },
    {
      id: 'sr-1551-002',
      listingNumber: 9101,
      propertyType: 'apartment',
      title: 'Flat Near MIT Campus',
      locality: 'Manipal',
      areaKey: AREA_KEY,
      pricePaise: 28_000_000,
      landArea: null,
      landAreaUnit: null,
      builtArea: 900,
      builtAreaUnit: 'sqft',
      bedrooms: 2,
      latitude: MIT_LAT - 0.002,
      longitude: MIT_LON - 0.002,
      heroImageUrl: null,
      listingPurpose: 'rent',
      possessionStatus: 'ready_to_move',
      daysOnMarket: 7,
      backOnMarket: false,
      createdAt: '2026-06-01T00:00:00Z',
    },
  ],
  page: 0,
  size: 50,
  hasMore: false,
};

const EMPTY_LISTINGS_PAGE = {
  content: [],
  page: 0,
  size: 50,
  totalElements: 0,
  totalPages: 0,
  aggregates: { topLocalities: [] },
};

// ---------------------------------------------------------------------------
// Stub helpers
// ---------------------------------------------------------------------------

function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

/** Stubs used for agri-first journey tests (anon agri listings fixture). */
async function stubAgriAnon(page: Page): Promise<void> {
  // INTEGRATION-UI: stub justified — tests anon price gate without a seeded backend.
  await page.route('**/api/trends/options**', (r) => fulfillJson(r, 200, TRENDS_OPTIONS_FIXTURE));
  await page.route('**/api/discover/areas**', (r) => fulfillJson(r, 200, DISCOVER_AREAS_FIXTURE));
  await page.route('**/api/discover/regional-area-groups**', (r) =>
    fulfillJson(r, 200, REGIONAL_AREA_GROUPS_FIXTURE));
  await page.route('**/api/discover/agri-map-listings**', (r) =>
    fulfillJson(r, 200, AGRI_LISTINGS_FIXTURE_ANON));
  await page.route('**/api/discover/cities/*/listings**', (r) =>
    fulfillJson(r, 200, { city: CITY, limitPerArea: 50, areas: [] }));
  await page.route('**/api/discover/listings**', (r) => fulfillJson(r, 200, EMPTY_LISTINGS_PAGE));
  await page.route('**/api/public/schools/**', (r) => fulfillJson(r, 200, []));
  await page.route('**/api/public/listings/*', (r) =>
    fulfillJson(r, 200, { id: AGRI_LISTING_ID, title: '[AGRI-1551] 4-Acre Farm', status: 'LIVE' }));
}

/** Stubs for authed agri tests — agri-map-listings returns populated pricePaise. */
async function stubAgriAuthed(page: Page): Promise<void> {
  // INTEGRATION-UI: stub justified — simulates authed backend projection (price populated).
  await page.route('**/api/trends/options**', (r) => fulfillJson(r, 200, TRENDS_OPTIONS_FIXTURE));
  await page.route('**/api/discover/areas**', (r) => fulfillJson(r, 200, DISCOVER_AREAS_FIXTURE));
  await page.route('**/api/discover/regional-area-groups**', (r) =>
    fulfillJson(r, 200, REGIONAL_AREA_GROUPS_FIXTURE));
  await page.route('**/api/discover/agri-map-listings**', (r) =>
    fulfillJson(r, 200, AGRI_LISTINGS_FIXTURE_AUTHED));
  await page.route('**/api/discover/cities/*/listings**', (r) =>
    fulfillJson(r, 200, { city: CITY, limitPerArea: 50, areas: [] }));
  await page.route('**/api/discover/listings**', (r) => fulfillJson(r, 200, EMPTY_LISTINGS_PAGE));
  await page.route('**/api/public/schools/**', (r) => fulfillJson(r, 200, []));
  await page.route('**/api/public/listings/*', (r) =>
    fulfillJson(r, 200, { id: AGRI_LISTING_ID, title: '[AGRI-1551] 4-Acre Farm', status: 'LIVE' }));
}

/** Stubs for school-first tests (includes school-radius-listings for markers). */
async function stubSchoolFirst(page: Page): Promise<void> {
  // INTEGRATION-UI: stub justified — isolates school-first marker rendering from backend.
  await page.route('**/api/trends/options**', (r) => fulfillJson(r, 200, TRENDS_OPTIONS_FIXTURE));
  await page.route('**/api/discover/areas**', (r) => fulfillJson(r, 200, DISCOVER_AREAS_FIXTURE));
  await page.route('**/api/public/schools/popular**', (r) => fulfillJson(r, 200, [MIT_SCHOOL]));
  await page.route('**/api/public/schools/search**', (r) => fulfillJson(r, 200, [MIT_SCHOOL]));
  await page.route(`**/api/public/schools/${MIT_SCHOOL_ID}`, (r) =>
    fulfillJson(r, 200, MIT_SCHOOL));
  await page.route('**/api/public/schools/by-area**', (r) => fulfillJson(r, 200, []));
  // City listings — residential listings near MIT; feeds listing-card list
  await page.route('**/api/discover/cities/*/listings**', (r) =>
    fulfillJson(r, 200, CITY_LISTINGS_FIXTURE));
  // Auth-gated listings page (anon/authed stub)
  await page.route('**/api/discover/listings**', (r) => fulfillJson(r, 200, EMPTY_LISTINGS_PAGE));
  // School-radius-listings for property markers (post-#1261 anon marker source).
  // Registered AFTER the broader /listings glob — Playwright matches most-recently-added first.
  await page.route('**/api/discover/cities/*/school-radius-listings**', (r) =>
    fulfillJson(r, 200, SCHOOL_RADIUS_LISTINGS_FIXTURE));
  // Auth-gated /api/discover/markers — residential markers near MIT.
  // Required: at zoom=13 + authed, markersEnabled=true fires useDiscoverFilteredMarkers.
  // Without this stub the FE hits the live backend which returns 0 residential
  // markers near MIT (agri excluded per #1463) → AC12/AC13 would fail spuriously.
  // Residential only — no agricultural_land markers (per #1463 school-first contract).
  await page.route('**/api/discover/markers**', (r) =>
    fulfillJson(r, 200, FILTERED_MARKERS_FIXTURE));
  // Agri not needed for school tests but defensive stub prevents stray fetches
  await page.route('**/api/discover/agri-map-listings**', (r) =>
    fulfillJson(r, 200, { city: CITY, listings: [], truncated: false, limit: 250 }));
  await page.route('**/api/discover/regional-area-groups**', (r) =>
    fulfillJson(r, 200, REGIONAL_AREA_GROUPS_FIXTURE));
}

/** Stubs for area-first narrowed (AC-AREA smoke). */
async function stubAreaFirst(page: Page): Promise<void> {
  // INTEGRATION-UI: stub justified — verifies area-first layout regression.
  await page.route('**/api/discover/areas**', (r) => fulfillJson(r, 200, DISCOVER_AREAS_FIXTURE));
  await page.route('**/api/discover/cities/*/listings**', (r) =>
    fulfillJson(r, 200, CITY_LISTINGS_FIXTURE));
  await page.route('**/api/discover/listings**', (r) => fulfillJson(r, 200, EMPTY_LISTINGS_PAGE));
  await page.route('**/api/public/schools/**', (r) => fulfillJson(r, 200, []));
  await page.route('**/api/trends/options**', (r) => fulfillJson(r, 200, TRENDS_OPTIONS_FIXTURE));
}

// ---------------------------------------------------------------------------
// Navigation helpers
// ---------------------------------------------------------------------------

/** Navigate to an agri-first locality deep-link (region + maxKm + locality). */
async function gotoAgriLocality(page: Page, locality = 'Brahmavar'): Promise<void> {
  const params = new URLSearchParams({
    city: CITY,
    journey: 'agri-first',
    region: REGION,
    maxKm: MAX_KM,
    locality,
  });
  await page.goto(`/discover?${params.toString()}`);
  await page.waitForLoadState('domcontentloaded');
  // Locality panel must mount before assertions.
  await expect(page.getByTestId('agri-group-locality-panel')).toBeVisible({ timeout: 15_000 });
}

/**
 * Navigate to school-first selected-school state with zoom=13 (> AREA_LAYER_MAX_ZOOM=12).
 * Provides schoolId + areaKey so markers render without a school-search interaction.
 */
async function gotoSchoolSelected(page: Page): Promise<void> {
  const params = new URLSearchParams({
    city: CITY,
    journey: 'school-first',
    areaKey: AREA_KEY,
    lat: String(MIT_LAT),
    lon: String(MIT_LON),
    zoom: '13',
    schoolId: MIT_SCHOOL_ID,
    radiusKm: String(RADIUS_KM),
  });
  await page.goto(`/discover?${params.toString()}`);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 10_000 });
}

/** Navigate to area-first narrowed state (zoom=14 > AREA_LAYER_MAX_ZOOM). */
async function gotoAreaNarrowed(page: Page): Promise<void> {
  const params = new URLSearchParams({
    city: CITY,
    journey: 'area-first',
    areaKey: AREA_KEY,
    lat: '13.35500',
    lon: '74.80000',
    zoom: '14',
  });
  await page.goto(`/discover?${params.toString()}`);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 10_000 });
}

function getUrlParam(page: Page, key: string): string | null {
  return new URL(page.url()).searchParams.get(key);
}

// ===========================================================================
// AC-ANON: anon agri locality card — "Sign in to view price", no rupee glyph
// ===========================================================================
//
// Issue #1551: AgriGroupLocalityPanel isAuthenticated=false → renders the
// anon price gate (Lock + "Sign in to view price"). The agri-map-listings
// endpoint is called with skipAuth:true → backend returns pricePaise: null.
// We stub the response with pricePaise: null to mirror the backend projection.
// Business assertion: the ₹ glyph and formatted price must NOT appear anywhere
// in the locality panel DOM for ANY rendered agri card.

test.describe('@integration-ui 1551 — ANON agri price gate', () => {
  test.use({ storageState: undefined });

  test('anon agri locality card shows Lock + "Sign in to view price"; no rupee value in DOM', async ({
    page,
  }) => {
    await stubAgriAnon(page);
    await gotoAgriLocality(page);

    // Listing row must render.
    const row = page.locator('[data-testid="agri-locality-listing-row"]').first();
    await expect(row).toBeVisible({ timeout: 12_000 });

    // Anon price gate affordance: the dedicated testid on the Lock + copy span.
    await expect(page.locator('[data-testid="agri-locality-price-signin"]').first()).toBeVisible({
      timeout: 8_000,
    });

    // The copy must include the expected text.
    await expect(page.locator('[data-testid="agri-locality-price-signin"]').first()).toContainText(
      /sign in to view price/i,
    );

    // No rupee glyph anywhere in any rendered agri card.
    // AUTHED_PRICE_PAISE = 4800000_00 paise → ₹48,00,000 — no ₹ should appear anon.
    const panelText = await page.getByTestId('agri-group-locality-panel').textContent();
    expect(panelText).not.toContain('₹');
    expect(panelText).not.toMatch(/48,?00,?000/);
  });
});

// ===========================================================================
// AC-AUTHED: authed agri locality card — formatted rupee price visible
// ===========================================================================
//
// Issue #1551: AgriGroupLocalityPanel isAuthenticated=true → renders the
// priceLabel (formatPrice output). We stub agri-map-listings with the authed
// projection (pricePaise populated). The Lock affordance must NOT be present.
// This is the core fix: authed users were previously seeing "Price on request"
// because isAuthenticated was not threaded through.
//
// If user-auth.json does not exist or the session is stale, the test is skipped
// rather than failing with a hard error — matches the 1375 spec pattern.

test.describe('@integration-ui 1551 — AUTHED agri price visible', () => {
  test.use({
    storageState: userAuthStorageStateExists() ? 'e2e/fixtures/user-auth.json' : undefined,
  });

  test('authed agri locality card shows formatted rupee price; no Lock affordance', async ({
    page,
  }) => {
    // If no auth fixture exists, skip gracefully.
    if (!userAuthStorageStateExists()) {
      test.skip(true, 'user-auth.json not found — cannot run authed agri price test');
      return;
    }

    await stubAgriAuthed(page);
    await gotoAgriLocality(page);

    // Verify the session was actually restored (guard against stale storageState).
    const authed = await isPageAuthenticated(page);
    if (!authed) {
      test.skip(true, 'storageState did not restore a live Supabase session — test skipped');
      return;
    }

    // Listing row must render.
    const row = page.locator('[data-testid="agri-locality-listing-row"]').first();
    await expect(row).toBeVisible({ timeout: 12_000 });

    // Lock / "Sign in" affordance must NOT be present for authed users.
    await expect(page.locator('[data-testid="agri-locality-price-signin"]')).toHaveCount(0);

    // A formatted rupee price must appear in the card.
    // AUTHED_PRICE_PAISE = 4800000_00 paise → formatPrice renders ₹48,00,000 or similar.
    // We assert the ₹ glyph is present somewhere in the card; this would fail if
    // isAuthenticated is false (card would show "Price on request" without ₹).
    const panelText = await page.getByTestId('agri-group-locality-panel').textContent();
    expect(panelText).toContain('₹');
  });
});

// ===========================================================================
// AC-CHIPS: agri card new-field chips render for non-null values
// ===========================================================================
//
// Issue #1551: AgriGroupLocalityPanel.agriChips() now includes roadAccess,
// soilType, cultivationStatus, ownershipType. When these fields are non-null
// in the listing, the corresponding human-readable label must appear as a chip.
// Tested anon (chips render regardless of auth state — they are field metadata,
// not price-gated). At least one chip must appear for the fixture's new fields.

test.describe('@integration-ui 1551 — agri new-field chips', () => {
  test.use({ storageState: undefined });

  test('agri card renders at least one #1551 chip label for non-null new fields', async ({
    page,
  }) => {
    await stubAgriAnon(page);
    await gotoAgriLocality(page);

    const row = page.locator('[data-testid="agri-locality-listing-row"]').first();
    await expect(row).toBeVisible({ timeout: 12_000 });

    // The fixture has: roadAccess=TARRED_ROAD, soilType=RED_LATERITE,
    // cultivationStatus=CULTIVATED, ownershipType=FREEHOLD.
    // Labels from agriFieldLabels.ts:
    //   TARRED_ROAD    → 'Tarred road'
    //   RED_LATERITE   → 'Red laterite'
    //   CULTIVATED     → 'Cultivated'
    //   FREEHOLD       → 'Freehold'
    // At least one must appear. If NONE appear, it means the agriChips() function
    // silently dropped all new fields — the core regression this AC guards against.
    const newFieldLabels = ['Tarred road', 'Red laterite', 'Cultivated', 'Freehold'];
    const cardText = await row.textContent() ?? '';
    const foundAny = newFieldLabels.some((label) => cardText.includes(label));
    expect(foundAny).toBe(true);
  });
});

// ===========================================================================
// AC-MKR: school-first authed + zoom≥13 + schoolId → markers + overlay (AC12 + AC13)
// ===========================================================================
//
// Issue #1551 AC12: authenticated + zoom>12 + schoolId + boundedSearchTriggered
// → property markers visible on map.
// Issue #1551 AC13 (ADVISORY): school circle/zone overlay present alongside markers.
//
// markersEnabled = isAuthenticated && zoom > AREA_LAYER_MAX_ZOOM (12)
// With a stub that provides school-radius-listings, property markers must render.
// The school circle overlay is rendered by MapDiscovery → MapController when
// schoolId + radiusKm are present; it does not depend on auth state.
//
// This test requires a live Supabase session (isAuthenticated=true from React context)
// because markersEnabled gates on it. Without auth, markers stay hidden at zoom=13.
// The stub provides property-marker data; auth state drives whether they render.

test.describe('@integration-ui 1551 — school-first markers (AC12 + AC13)', () => {
  test.use({
    storageState: userAuthStorageStateExists() ? 'e2e/fixtures/user-auth.json' : undefined,
  });

  test('authed school-first at zoom=13 shows property markers + school circle overlay', async ({
    page,
  }) => {
    if (!userAuthStorageStateExists()) {
      test.skip(
        true,
        'user-auth.json not found — AC12 requires authed session for markersEnabled=true',
      );
      return;
    }

    await stubSchoolFirst(page);
    await gotoSchoolSelected(page);

    // Verify session was actually restored.
    const authed = await isPageAuthenticated(page);
    if (!authed) {
      test.skip(true, 'storageState did not restore a live session — AC12 skipped');
      return;
    }

    // Issue #1115: school-first markers require boundedSearchTriggered=true.
    // The CTA button ("Search within N km") sets this flag. Click it if visible.
    // (At zoom=13 + authed + schoolId, the CTA is shown before the user triggers the search.)
    const ctaButton = page.locator('[data-testid="school-bounded-search-cta"]');
    const ctaVisible = await ctaButton.isVisible().catch(() => false);
    if (ctaVisible) {
      await ctaButton.click();
    }

    // AC12: property markers must render on map at zoom=13 (> AREA_LAYER_MAX_ZOOM=12).
    // markersEnabled = isAuthenticated && zoom > 12 && schoolId set && boundedSearchTriggered.
    // The stub returns 2 residential markers near MIT. Nearby markers may be grouped by
    // Leaflet MarkerCluster into a `.custom-marker-cluster` element. Accept both individual
    // markers AND clusters as evidence that the FE rendered markers from the stub response.
    const propertyMarkersOrClusters = page.locator(
      '[data-testid="property-marker"], .custom-marker-cluster',
    );
    await expect(propertyMarkersOrClusters.first()).toBeVisible({ timeout: 15_000 });
    expect(await propertyMarkersOrClusters.count()).toBeGreaterThan(0);

    // AC13: school zone circle overlay must ALSO be present (Leaflet SVG circle from
    // MapController.schoolCircleRadius, rendered as a Leaflet path element).
    // The school-first journey with schoolId+radiusKm draws a circle regardless of auth.
    // Assert the Leaflet SVG path layer container is present — it only mounts when
    // MapController draws the school radius circle.
    const leafletPaths = page.locator('.leaflet-overlay-pane svg path');
    await expect(leafletPaths.first()).toBeVisible({ timeout: 12_000 });

    // Both must coexist: overlay did NOT suppress markers.
    expect(await propertyMarkersOrClusters.count()).toBeGreaterThan(0);
    expect(await leafletPaths.count()).toBeGreaterThan(0);
  });
});

// ===========================================================================
// AC-ZOOM: school-first zoom stability — user zoom not snapped back (#1547 guard)
// ===========================================================================
//
// Issue #1547 introduced a lastFittedListingsKeyRef guard so that refetch-toggle
// re-fires of listingsReadyKey do NOT re-fit the map and snap zoom back.
// This test verifies the guard holds for the school-first journey:
// after the map settles at the schoolId-focussed zoom, simulating a user
// zoom-out via Leaflet keyboard shortcuts and checking the URL zoom param
// remains at the user-set value (not snapped back).
//
// No auth required — zoom stability is independent of auth state.

test.describe('@integration-ui 1551 — school-first zoom stability (#1547 guard)', () => {
  test.use({ storageState: undefined });

  test('zoom param set by user is retained after map settles; no snap-back', async ({ page }) => {
    await stubSchoolFirst(page);
    await gotoSchoolSelected(page);

    // Wait for the right panel to fully mount and school-radius listings to have been fetched.
    await page.waitForResponse(
      (resp) =>
        resp.url().includes('school-radius-listings') ||
        resp.url().includes('cities/') && resp.url().includes('listings'),
      { timeout: 15_000 },
    ).catch(() => {
      // school-radius-listings may already be fulfilled from the initial load
    });

    // Capture the initial zoom written to the URL by gotoSchoolSelected (zoom=13).
    const initialZoom = getUrlParam(page, 'zoom');
    expect(initialZoom).not.toBeNull();

    // Simulate user zooming the Leaflet map via keyboard shortcut ('-' = zoom out).
    // This fires Leaflet's zoom event which writes a new zoom level to the URL via
    // ViewportWatcher. We use the map canvas area to ensure focus.
    const mapContainer = page.locator('.leaflet-container');
    await expect(mapContainer).toBeVisible({ timeout: 8_000 });
    await mapContainer.click({ position: { x: 200, y: 200 } });
    await mapContainer.press('-');

    // Wait for the URL zoom param to CHANGE from the initial value.
    // This is critical: the initial URL already has zoom=13 (non-null), so polling for
    // "not.toBeNull()" resolves immediately and captures the stale pre-keypress value.
    // Instead, we wait for the value to actually differ from initialZoom, proving the
    // ViewportWatcher debounce has flushed the user's zoom-out event into the URL.
    await expect
      .poll(() => getUrlParam(page, 'zoom'), { timeout: 5_000 })
      .not.toBe(initialZoom);

    // Now capture the user-set zoom (post-debounce flush, definitely changed).
    const userZoom = getUrlParam(page, 'zoom');
    expect(userZoom).not.toBeNull();

    // Allow any potential snap-back window (1.5s, matching the 1547 flyTo-duration guard).
    // If the guard is broken, a fitBounds re-fire would overwrite the zoom within this window.
    await page.waitForTimeout(1_500);

    // Zoom must remain at whatever the user set — NOT snapped back to the initial value.
    // If snap-back fires, zoom would revert to initialZoom=13 regardless of user interaction.
    const finalZoom = getUrlParam(page, 'zoom');
    expect(finalZoom).toBe(userZoom);
  });
});

// ===========================================================================
// AC-AREA: area-first narrowed layout smoke (AC17 — #1547 layout regression guard)
// ===========================================================================
//
// Light smoke: area-first narrowed state still renders listing-card ≥ 1 in the
// right panel. Guards against a regression in the #1547 card layout introduced
// by the #1551 diff (MapDiscovery.tsx isAuthenticated threading). This is the
// same navigation used in discover-results-redesign-1547.spec.ts scenario (a),
// deliberately kept minimal here to avoid duplicating the full #1547 coverage.

test.describe('@integration-ui 1551 — area-first narrowed layout smoke (AC17)', () => {
  test.use({ storageState: undefined });

  test('area-first narrowed state renders at least one listing-card in the right panel', async ({
    page,
  }) => {
    await stubAreaFirst(page);
    await gotoAreaNarrowed(page);

    // At least one listing card must render in the narrowed panel.
    const cards = page.getByTestId('listing-card');
    await expect(cards.first()).toBeVisible({ timeout: 15_000 });
    expect(await cards.count()).toBeGreaterThanOrEqual(1);

    // The card must display a property title (not empty / skeleton).
    const firstCardText = await cards.first().textContent() ?? '';
    expect(firstCardText.trim().length).toBeGreaterThan(0);
  });
});
