/**
 * Issue #1771 — Agri-First Discover Journey Polish: evidence capture.
 *
 * Fully offline: every Discover API the agri journey touches is route-mocked,
 * so the run needs only a local Vite dev server (no backend, no shared Supabase).
 *
 * Captures the 8 required evidence screenshots into
 * docs/audit/evidence/discover-agri-first-polish/ — Udupi routes are the
 * primary acceptance routes (1–3); Bangalore (4–6) mirrors the approved mock;
 * 7–8 are area-first / school-first regression checks.
 */
import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const EVIDENCE_DIR = path.resolve(__dirname, '../docs/audit/evidence/discover-agri-first-polish');

fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

async function saveEvidence(page: Page, filename: string) {
  const target = path.join(EVIDENCE_DIR, filename);
  await page.screenshot({ path: target, fullPage: true });
  console.log(`✓ Saved evidence to: ${target}`);
}

async function ensureCleanState(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('discover_telemetry_consent', 'granted');
  });
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const UDUPI_AREAS = [
  { areaKey: 'IN|KA|Udupi|Brahmavar', name: 'Brahmavar', geoCenterLat: 13.4534, geoCenterLon: 74.7402, listingCount: 3, schoolCount: 0, agriAcreage: 6.6 },
  { areaKey: 'IN|KA|Udupi|Barkur', name: 'Barkur', geoCenterLat: 13.4795, geoCenterLon: 74.7519, listingCount: 1, schoolCount: 0, agriAcreage: 2.8 },
  { areaKey: 'IN|KA|Udupi|Kundapur', name: 'Kundapur', geoCenterLat: 13.6224, geoCenterLon: 74.6913, listingCount: 2, schoolCount: 0, agriAcreage: 5.8 },
  { areaKey: 'IN|KA|Udupi|Manipal', name: 'Manipal', geoCenterLat: 13.3525, geoCenterLon: 74.7868, listingCount: 2, schoolCount: 0, agriAcreage: 4.9 },
  { areaKey: 'IN|KA|Udupi|Hiriyadka', name: 'Hiriyadka', geoCenterLat: 13.3648, geoCenterLon: 74.8354, listingCount: 2, schoolCount: 0, agriAcreage: 5.5 },
  { areaKey: 'IN|KA|Udupi|Perdoor', name: 'Perdoor', geoCenterLat: 13.3907, geoCenterLon: 74.8791, listingCount: 1, schoolCount: 0, agriAcreage: 1.9 },
  { areaKey: 'IN|KA|Udupi|Kaup', name: 'Kaup', geoCenterLat: 13.2244, geoCenterLon: 74.7423, listingCount: 2, schoolCount: 0, agriAcreage: 4.7 },
  { areaKey: 'IN|KA|Udupi|Padubidri', name: 'Padubidri', geoCenterLat: 13.1436, geoCenterLon: 74.7712, listingCount: 2, schoolCount: 0, agriAcreage: 3.9 },
];

const UDUPI_CORRIDORS = {
  city: 'udupi',
  groups: [
    {
      directionCode: 'N',
      groupName: 'N towards Brahmavar & Kundapur',
      availableMaxDistances: [
        { maxKm: 10, distanceLabel: 'Within 10 km', includedBandCodes: ['0_10'], listingCount: 1, agriAcreage: 1.2, areaKeys: ['IN|KA|Udupi|Brahmavar'] },
        { maxKm: 25, distanceLabel: 'Up to 25 km', includedBandCodes: ['0_10', '10_25'], listingCount: 4, agriAcreage: 9.4, areaKeys: ['IN|KA|Udupi|Brahmavar', 'IN|KA|Udupi|Barkur'] },
        { maxKm: 50, distanceLabel: 'Up to 50 km', includedBandCodes: ['0_10', '10_25', '25_50'], listingCount: 6, agriAcreage: 15.2, areaKeys: ['IN|KA|Udupi|Brahmavar', 'IN|KA|Udupi|Barkur', 'IN|KA|Udupi|Kundapur'] },
        { maxKm: 100, distanceLabel: 'Up to 100 km', includedBandCodes: ['0_10', '10_25', '25_50', '50_100'], listingCount: 6, agriAcreage: 15.2, areaKeys: ['IN|KA|Udupi|Brahmavar', 'IN|KA|Udupi|Barkur', 'IN|KA|Udupi|Kundapur'] },
      ],
    },
    {
      directionCode: 'E',
      groupName: 'E towards Manipal & Hiriyadka',
      availableMaxDistances: [
        { maxKm: 25, distanceLabel: 'Up to 25 km', includedBandCodes: ['0_10', '10_25'], listingCount: 4, agriAcreage: 10.4, areaKeys: ['IN|KA|Udupi|Manipal', 'IN|KA|Udupi|Hiriyadka'] },
        { maxKm: 50, distanceLabel: 'Up to 50 km', includedBandCodes: ['0_10', '10_25', '25_50'], listingCount: 5, agriAcreage: 12.3, areaKeys: ['IN|KA|Udupi|Manipal', 'IN|KA|Udupi|Hiriyadka', 'IN|KA|Udupi|Perdoor'] },
      ],
    },
    {
      directionCode: 'S',
      groupName: 'S towards Kaup & Padubidri',
      availableMaxDistances: [
        { maxKm: 25, distanceLabel: 'Up to 25 km', includedBandCodes: ['0_10', '10_25'], listingCount: 2, agriAcreage: 4.7, areaKeys: ['IN|KA|Udupi|Kaup'] },
        { maxKm: 50, distanceLabel: 'Up to 50 km', includedBandCodes: ['0_10', '10_25', '25_50'], listingCount: 4, agriAcreage: 8.6, areaKeys: ['IN|KA|Udupi|Kaup', 'IN|KA|Udupi|Padubidri'] },
      ],
    },
  ],
};

// 4 parcels within 25 km N of Udupi — 3 in Brahmavar (locality page), 1 in Barkur.
const UDUPI_AGRI_LISTINGS = {
  city: 'udupi',
  truncated: false,
  limit: 250,
  listings: [
    {
      id: 'udp-agri-101',
      areaKey: 'IN|KA|Udupi|Brahmavar',
      latitude: 13.4534,
      longitude: 74.7402,
      propertyType: 'agricultural_land',
      title: '1.2-acre areca plantation, Brahmavar',
      locality: 'Brahmavar',
      landArea: 1.2,
      landAreaUnit: 'acres',
      computedAreaAcres: 1.2,
      pricePaise: 900000000,
      listingPurpose: 'sale',
      landCategory: 'PLANTATION',
      cultivationStatus: 'ARECA_PLANTATION',
      soilType: 'RED_LATERITE',
      waterSource: 'BOREWELL',
      roadAccess: 'TARRED_ROAD',
      ownershipType: 'FREEHOLD',
      fencingDone: true,
      updatedAt: '2026-06-20T10:00:00Z',
      boundaryGeoJson: JSON.stringify({
        type: 'Polygon',
        coordinates: [[[74.7392, 13.4524], [74.7412, 13.4524], [74.7412, 13.4544], [74.7392, 13.4544], [74.7392, 13.4524]]],
      }),
    },
    {
      id: 'udp-agri-102',
      areaKey: 'IN|KA|Udupi|Brahmavar',
      latitude: 13.4585,
      longitude: 74.7455,
      propertyType: 'agricultural_land',
      title: '2.4-acre paddy field, Brahmavar',
      locality: 'Brahmavar',
      landArea: 2.4,
      landAreaUnit: 'acres',
      computedAreaAcres: 2.4,
      pricePaise: 1550000000,
      listingPurpose: 'sale',
      landCategory: 'FARMLAND',
      cultivationStatus: 'CULTIVATED',
      soilType: 'ALLUVIAL',
      waterSource: 'WELL',
      roadAccess: 'KACHCHA_ROAD',
      farmhouseAvailable: true,
      updatedAt: '2026-06-28T10:00:00Z',
    },
    {
      id: 'udp-agri-103',
      areaKey: 'IN|KA|Udupi|Brahmavar',
      latitude: 13.4488,
      longitude: 74.7361,
      propertyType: 'agricultural_land',
      title: '3-acre coconut grove, Brahmavar',
      locality: 'Brahmavar',
      landArea: 3.0,
      landAreaUnit: 'acres',
      computedAreaAcres: 3.0,
      pricePaise: 2100000000,
      listingPurpose: 'sale',
      landCategory: 'PLANTATION',
      cultivationStatus: 'COCONUT_PLANTATION',
      soilType: 'SANDY_LOAM',
      waterSource: 'POND',
      roadAccess: 'TARRED_ROAD',
      ownershipType: 'INHERITED',
      updatedAt: '2026-07-01T10:00:00Z',
    },
    {
      id: 'udp-agri-104',
      areaKey: 'IN|KA|Udupi|Barkur',
      latitude: 13.4795,
      longitude: 74.7519,
      propertyType: 'agricultural_land',
      title: '2.8-acre farm plot, Barkur',
      locality: 'Barkur',
      landArea: 2.8,
      landAreaUnit: 'acres',
      computedAreaAcres: 2.8,
      pricePaise: 1200000000,
      listingPurpose: 'sale',
      landCategory: 'FARM_PLOT',
      soilType: 'RED_LATERITE',
      waterSource: 'BOREWELL',
      roadAccess: 'TARRED_ROAD',
      updatedAt: '2026-06-15T10:00:00Z',
    },
  ],
};

const BANGALORE_AREAS = [
  { areaKey: 'IN|KA|Bangalore|Yelahanka Rural', name: 'Yelahanka Rural', geoCenterLat: 13.135, geoCenterLon: 77.596, listingCount: 2, schoolCount: 0, agriAcreage: 3.4 },
  { areaKey: 'IN|KA|Bangalore|Doddaballapur', name: 'Doddaballapur', geoCenterLat: 13.292, geoCenterLon: 77.537, listingCount: 2, schoolCount: 0, agriAcreage: 4.7 },
  { areaKey: 'IN|KA|Bangalore|Chikkaballapur', name: 'Chikkaballapur', geoCenterLat: 13.435, geoCenterLon: 77.727, listingCount: 2, schoolCount: 0, agriAcreage: 9.5 },
  { areaKey: 'IN|KA|Bangalore|Hoskote', name: 'Hoskote', geoCenterLat: 13.07, geoCenterLon: 77.798, listingCount: 2, schoolCount: 0, agriAcreage: 7.1 },
  { areaKey: 'IN|KA|Bangalore|Malur', name: 'Malur', geoCenterLat: 13.003, geoCenterLon: 77.938, listingCount: 2, schoolCount: 0, agriAcreage: 7.0 },
  { areaKey: 'IN|KA|Bangalore|Kolar', name: 'Kolar', geoCenterLat: 13.137, geoCenterLon: 78.13, listingCount: 2, schoolCount: 0, agriAcreage: 7.1 },
  { areaKey: 'IN|KA|Bangalore|Harohalli', name: 'Harohalli', geoCenterLat: 12.681, geoCenterLon: 77.472, listingCount: 2, schoolCount: 0, agriAcreage: 8.2 },
  { areaKey: 'IN|KA|Bangalore|Kanakapura', name: 'Kanakapura', geoCenterLat: 12.546, geoCenterLon: 77.42, listingCount: 2, schoolCount: 0, agriAcreage: 8.3 },
  { areaKey: 'IN|KA|Bangalore|Sathanur', name: 'Sathanur', geoCenterLat: 12.472, geoCenterLon: 77.359, listingCount: 2, schoolCount: 0, agriAcreage: 8.0 },
  { areaKey: 'IN|KA|Bangalore|Nelamangala', name: 'Nelamangala', geoCenterLat: 13.099, geoCenterLon: 77.394, listingCount: 2, schoolCount: 0, agriAcreage: 6.2 },
  { areaKey: 'IN|KA|Bangalore|Magadi', name: 'Magadi', geoCenterLat: 12.957, geoCenterLon: 77.226, listingCount: 2, schoolCount: 0, agriAcreage: 6.2 },
  { areaKey: 'IN|KA|Bangalore|Ramanagara', name: 'Ramanagara', geoCenterLat: 12.715, geoCenterLon: 77.281, listingCount: 2, schoolCount: 0, agriAcreage: 6.2 },
];

const BANGALORE_CORRIDORS = {
  city: 'bangalore',
  groups: [
    {
      directionCode: 'N',
      groupName: 'N towards Doddaballapur',
      availableMaxDistances: [
        { maxKm: 10, distanceLabel: 'Within 10 km', includedBandCodes: ['0_10'], listingCount: 0, areaKeys: [] },
        { maxKm: 25, distanceLabel: 'Up to 25 km', includedBandCodes: ['0_10', '10_25'], listingCount: 2, agriAcreage: 3.4, areaKeys: ['IN|KA|Bangalore|Yelahanka Rural'] },
        { maxKm: 50, distanceLabel: 'Up to 50 km', includedBandCodes: ['0_10', '10_25', '25_50'], listingCount: 4, agriAcreage: 8.1, areaKeys: ['IN|KA|Bangalore|Yelahanka Rural', 'IN|KA|Bangalore|Doddaballapur'] },
        { maxKm: 100, distanceLabel: 'Up to 100 km', includedBandCodes: ['0_10', '10_25', '25_50', '50_100'], listingCount: 6, agriAcreage: 17.6, areaKeys: ['IN|KA|Bangalore|Yelahanka Rural', 'IN|KA|Bangalore|Doddaballapur', 'IN|KA|Bangalore|Chikkaballapur'] },
      ],
    },
    {
      directionCode: 'E',
      groupName: 'E towards Hoskote & Kolar',
      availableMaxDistances: [
        { maxKm: 50, distanceLabel: 'Up to 50 km', includedBandCodes: ['0_10', '10_25', '25_50'], listingCount: 4, agriAcreage: 14.1, areaKeys: ['IN|KA|Bangalore|Hoskote', 'IN|KA|Bangalore|Malur'] },
        { maxKm: 100, distanceLabel: 'Up to 100 km', includedBandCodes: ['0_10', '10_25', '25_50', '50_100'], listingCount: 6, agriAcreage: 21.2, areaKeys: ['IN|KA|Bangalore|Hoskote', 'IN|KA|Bangalore|Malur', 'IN|KA|Bangalore|Kolar'] },
      ],
    },
    {
      directionCode: 'S',
      groupName: 'S towards Kanakapura',
      availableMaxDistances: [
        { maxKm: 50, distanceLabel: 'Up to 50 km', includedBandCodes: ['0_10', '10_25', '25_50'], listingCount: 4, agriAcreage: 16.5, areaKeys: ['IN|KA|Bangalore|Harohalli', 'IN|KA|Bangalore|Kanakapura'] },
        { maxKm: 100, distanceLabel: 'Up to 100 km', includedBandCodes: ['0_10', '10_25', '25_50', '50_100'], listingCount: 6, agriAcreage: 24.5, areaKeys: ['IN|KA|Bangalore|Harohalli', 'IN|KA|Bangalore|Kanakapura', 'IN|KA|Bangalore|Sathanur'] },
      ],
    },
    {
      directionCode: 'W',
      groupName: 'W towards Magadi & Ramanagara',
      availableMaxDistances: [
        { maxKm: 50, distanceLabel: 'Up to 50 km', includedBandCodes: ['0_10', '10_25', '25_50'], listingCount: 4, agriAcreage: 12.4, areaKeys: ['IN|KA|Bangalore|Nelamangala', 'IN|KA|Bangalore|Magadi'] },
        { maxKm: 100, distanceLabel: 'Up to 100 km', includedBandCodes: ['0_10', '10_25', '25_50', '50_100'], listingCount: 6, agriAcreage: 18.6, areaKeys: ['IN|KA|Bangalore|Nelamangala', 'IN|KA|Bangalore|Magadi', 'IN|KA|Bangalore|Ramanagara'] },
      ],
    },
  ],
};

// 6 parcels in the N corridor — Yelahanka Rural pair mirrors the approved mock cards.
const BANGALORE_AGRI_LISTINGS = {
  city: 'bangalore',
  truncated: false,
  limit: 250,
  listings: [
    {
      id: 'blr-agri-201',
      areaKey: 'IN|KA|Bangalore|Yelahanka Rural',
      latitude: 13.12,
      longitude: 77.58,
      propertyType: 'agricultural_land',
      title: '1-acre nursery plot, Yelahanka Rural',
      locality: 'Yelahanka Rural',
      landArea: 1.0,
      landAreaUnit: 'acres',
      computedAreaAcres: 1.0,
      pricePaise: 900000000,
      listingPurpose: 'sale',
      landCategory: 'FARM_PLOT',
      cultivationStatus: 'CULTIVATED',
      soilType: 'RED_LATERITE',
      waterSource: 'BOREWELL',
      roadAccess: 'TARRED_ROAD',
      updatedAt: '2026-06-25T10:00:00Z',
    },
    {
      id: 'blr-agri-202',
      areaKey: 'IN|KA|Bangalore|Yelahanka Rural',
      latitude: 13.135,
      longitude: 77.59,
      propertyType: 'agricultural_land',
      title: '2.4-acre vegetable farm, Yelahanka Rural',
      locality: 'Yelahanka Rural',
      landArea: 2.4,
      landAreaUnit: 'acres',
      computedAreaAcres: 2.4,
      pricePaise: 1550000000,
      listingPurpose: 'sale',
      landCategory: 'FARMLAND',
      cultivationStatus: 'CULTIVATED',
      soilType: 'RED_LATERITE',
      waterSource: 'BOREWELL',
      roadAccess: 'TARRED_ROAD',
      farmhouseAvailable: true,
      updatedAt: '2026-06-30T10:00:00Z',
    },
    {
      id: 'blr-agri-203',
      areaKey: 'IN|KA|Bangalore|Doddaballapur',
      latitude: 13.292,
      longitude: 77.537,
      propertyType: 'agricultural_land',
      title: '2-acre vineyard, Doddaballapur',
      locality: 'Doddaballapur',
      landArea: 2.0,
      landAreaUnit: 'acres',
      computedAreaAcres: 2.0,
      pricePaise: 1300000000,
      listingPurpose: 'sale',
      landCategory: 'PLANTATION',
      soilType: 'RED_GRAVEL',
      waterSource: 'BOREWELL',
      roadAccess: 'TARRED_ROAD',
    },
    {
      id: 'blr-agri-204',
      areaKey: 'IN|KA|Bangalore|Doddaballapur',
      latitude: 13.301,
      longitude: 77.545,
      propertyType: 'agricultural_land',
      title: '2.7-acre floriculture farm, Doddaballapur',
      locality: 'Doddaballapur',
      landArea: 2.7,
      landAreaUnit: 'acres',
      computedAreaAcres: 2.7,
      pricePaise: 1700000000,
      listingPurpose: 'sale',
      landCategory: 'FARMLAND',
      waterSource: 'BOREWELL',
      roadAccess: 'HIGHWAY_FRONTAGE',
    },
    {
      id: 'blr-agri-205',
      areaKey: 'IN|KA|Bangalore|Chikkaballapur',
      latitude: 13.435,
      longitude: 77.727,
      propertyType: 'agricultural_land',
      title: '4.5-acre grape farm, Chikkaballapur',
      locality: 'Chikkaballapur',
      landArea: 4.5,
      landAreaUnit: 'acres',
      computedAreaAcres: 4.5,
      pricePaise: 2500000000,
      listingPurpose: 'sale',
      landCategory: 'FARMLAND',
      cultivationStatus: 'CULTIVATED',
      waterSource: 'BOREWELL',
      roadAccess: 'TARRED_ROAD',
    },
    {
      id: 'blr-agri-206',
      areaKey: 'IN|KA|Bangalore|Chikkaballapur',
      latitude: 13.442,
      longitude: 77.735,
      propertyType: 'agricultural_land',
      title: '5-acre vegetable farm, Chikkaballapur',
      locality: 'Chikkaballapur',
      landArea: 5.0,
      landAreaUnit: 'acres',
      computedAreaAcres: 5.0,
      pricePaise: 2800000000,
      listingPurpose: 'sale',
      landCategory: 'FARMLAND',
      waterSource: 'WELL',
      roadAccess: 'KACHCHA_ROAD',
    },
  ],
};

// ─── Route mocks ──────────────────────────────────────────────────────────────

async function setupAgriMocks(page: Page) {
  await page.route('**/api/discover/regional-area-groups?*', async (route) => {
    const url = route.request().url();
    const body = url.includes('city=udupi') ? UDUPI_CORRIDORS : BANGALORE_CORRIDORS;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  await page.route('**/api/discover/agri-map-listings?*', async (route) => {
    const url = route.request().url();
    const body = url.includes('city=udupi') ? UDUPI_AGRI_LISTINGS : BANGALORE_AGRI_LISTINGS;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  await page.route('**/api/discover/areas?*', async (route) => {
    const url = route.request().url();
    const body = url.includes('city=udupi')
      ? { city: 'udupi', areas: UDUPI_AREAS }
      : { city: 'bangalore', areas: BANGALORE_AREAS };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

async function waitForRealLoadedState(page: Page) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});

  await page.locator(
    '[data-testid="agri-landing-intro"], [data-testid="agri-group-selected-panel"], [data-testid="agri-group-locality-panel"], [data-testid="area-groups-intro"], [data-testid="school-browse-intro"], nav[aria-label="Breadcrumb"], h1',
  ).first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});

  await expect(page.locator('text=Loading corridors…').first()).not.toBeVisible({ timeout: 3_000 }).catch(() => {});
  await expect(page.locator('[data-testid="discover-consent-banner"]')).not.toBeVisible().catch(() => {});

  // Let map tiles settle for a stable capture.
  await page.waitForTimeout(2_000);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('Issue #1771 — Agri-First Discover polish evidence capture', () => {
  test.beforeEach(async ({ page }) => {
    await ensureCleanState(page);
    await setupAgriMocks(page);
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test('1. Udupi agri landing (primary acceptance route)', async ({ page }) => {
    await page.goto('/discover?city=udupi&lat=13.34090&lon=74.74210&zoom=11&journey=agri-first');
    await waitForRealLoadedState(page);

    await expect(page.getByTestId('agri-landing-intro')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Agricultural land near Udupi')).toBeVisible();
    // Corridor cards carry the mock structure: stat bands + town chips + explore CTA.
    await expect(page.getByTestId('corridor-card').first()).toBeVisible();
    await expect(page.getByText('Explore direction').first()).toBeVisible();
    await expect(page.getByTestId('agri-map-legend')).toHaveAttribute('data-stage', 'landing');

    await saveEvidence(page, '1_udupi_agri_first_landing.png');
  });

  test('2. Udupi corridor selected (region=N&maxKm=25)', async ({ page }) => {
    await page.goto('/discover?city=udupi&lat=13.45334&lon=74.74023&zoom=12&journey=agri-first&region=N&maxKm=25');
    await waitForRealLoadedState(page);

    await expect(page.getByTestId('agri-group-selected-panel')).toBeVisible({ timeout: 10_000 });
    // Navy hero with corridor title + back link
    await expect(page.getByTestId('agri-group-summary-band')).toBeVisible();
    await expect(page.getByText('Back to directions')).toBeVisible();
    // Distance chips with counts; 25 selected
    await expect(page.getByTestId('distance-chip-25')).toHaveAttribute('aria-pressed', 'true');
    // Pale green summary band + town cards
    await expect(page.getByTestId('agri-group-count-band')).toBeVisible();
    await expect(page.getByTestId('agri-group-locality-btn').first()).toBeVisible();
    await expect(page.getByTestId('agri-map-legend')).toHaveAttribute('data-stage', 'corridor');

    await saveEvidence(page, '2_udupi_agri_direction_selected.png');
  });

  test('3. Udupi locality selected (destKey=<Brahmavar areaKey>)', async ({ page }) => {
    // Taller viewport: the right panel is an inner scroll container, so fullPage
    // cannot expand it — the extra height keeps hero + filters + parcel cards in frame.
    await page.setViewportSize({ width: 1440, height: 1750 });
    // Issue #2151 PR C (C-F1) — the destination identity URL param is the canonical
    // areas.area_key, not free display text. This spec hits the REAL hosted backend (no
    // stubs), so the value here MUST be the actual live area_key for "Brahmavar" — a plain
    // 'Brahmavar' string will NOT resolve (no display-text lookup exists client-side; see
    // agricultural.ts's migration-effect doc). Naming convention matches this repo's other
    // Udupi fixtures (e.g. 'IN|KA|Udupi|Manipal'); confirm against the live agri-destinations
    // response for the N/25km corridor before trusting this value.
    await page.goto('/discover?city=udupi&lat=13.45340&lon=74.74033&zoom=12&journey=agri-first&region=N&maxKm=25&destKey=' + encodeURIComponent('IN|KA|Udupi|Brahmavar'));
    await waitForRealLoadedState(page);

    await expect(page.getByTestId('agri-group-locality-panel')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('agri-locality-name')).toHaveText('Brahmavar');
    // Grouped filter block + image-led parcel cards
    await expect(page.getByTestId('agri-locality-filters')).toBeVisible();
    expect(await page.getByTestId('agri-locality-listing-row').count()).toBeGreaterThanOrEqual(2);
    await expect(page.getByTestId('agri-map-legend')).toHaveAttribute('data-stage', 'locality');

    await saveEvidence(page, '3_udupi_agri_locality_selected.png');
  });

  test('4. Bangalore agri landing (mock mirror)', async ({ page }) => {
    await page.goto('/discover?city=bangalore&journey=agri-first');
    await waitForRealLoadedState(page);

    await expect(page.getByTestId('agri-landing-intro')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Agricultural land near Bangalore')).toBeVisible();
    expect(await page.getByTestId('corridor-card').count()).toBe(4);

    await saveEvidence(page, '4_bangalore_agri_first_landing.png');
  });

  test('5. Bangalore corridor selected (region=N&maxKm=100)', async ({ page }) => {
    await page.goto('/discover?city=bangalore&journey=agri-first&region=N&maxKm=100');
    await waitForRealLoadedState(page);

    await expect(page.getByTestId('agri-group-selected-panel')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('distance-chip-100')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('agri-group-count-band')).toBeVisible();

    await saveEvidence(page, '5_bangalore_agri_direction_selected.png');
  });

  test('6. Bangalore locality selected (destKey=<Yelahanka Rural areaKey>)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1750 });
    // Issue #2151 PR C (C-F1) — see test 3's comment: destKey must be the real live area_key,
    // not the display name. Verify against the live agri-destinations response before trusting.
    await page.goto('/discover?city=bangalore&journey=agri-first&region=N&maxKm=100&destKey=' + encodeURIComponent('IN|KA|Bangalore|Yelahanka Rural'));
    await waitForRealLoadedState(page);

    await expect(page.getByTestId('agri-group-locality-panel')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('agri-locality-name')).toHaveText('Yelahanka Rural');
    expect(await page.getByTestId('agri-locality-listing-row').count()).toBeGreaterThanOrEqual(2);

    await saveEvidence(page, '6_bangalore_agri_locality_selected.png');
  });

  test('7. Area-first regression check', async ({ page }) => {
    await page.goto('/discover?city=bangalore&journey=area-first');
    await waitForRealLoadedState(page);

    await expect(
      page.getByRole('heading', { name: 'Choose an area in Bangalore' }),
    ).toBeVisible({ timeout: 10_000 });

    await saveEvidence(page, '7_area_first_regression_after_agri_polish.png');
  });

  test('8. School-first regression check', async ({ page }) => {
    await page.goto('/discover?city=bangalore&journey=school-first');
    await waitForRealLoadedState(page);

    await expect(page.getByTestId('school-browse-intro')).toBeVisible({ timeout: 10_000 });

    await saveEvidence(page, '8_school_first_regression_after_agri_polish.png');
  });
});
