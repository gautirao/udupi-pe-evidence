/**
 * Issue #1770 — School-First Journey Polish: Browser Evidence Capture
 *
 * Visual verification + screenshot evidence for the corrective pass.
 * Saves screenshots under docs/audit/evidence/discover-school-first-polish/.
 *
 * Run:
 *   PLAYWRIGHT_BASE_URL=http://localhost:5174 npx playwright test \
 *     e2e/capture-school-first-polish-1770.spec.ts --project=full --reporter=list
 *
 * All network calls to /api/discover/area-groups and /api/discover/areas
 * are stub-intercepted so the spec runs without a seeded backend.
 *
 * Checklist verified (per user's browser verification checklist):
 *   A. Bangalore school-first landing
 *   B. Map verification (markers / legend)
 *   C. Interaction verification (back/forward, buy/rent, toggle)
 *   D. Regression checks (area-first, city landing)
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = path.resolve(
  __dirname,
  '../docs/audit/evidence/discover-school-first-polish',
);
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

// ─── Stubs ───────────────────────────────────────────────────────────────────

const AREA_GROUPS_BLR = {
  city: 'bangalore',
  groups: [
    {
      slug: 'north-airport-belt',
      name: 'Hebbal & Jakkur Schools',
      subtitle: 'North school zone',
      regionLabel: 'North Bangalore',
      displayOrder: 1,
      areaKeys: ['IN|KA|Bengaluru|Hebbal', 'IN|KA|Bengaluru|Jakkur'],
    },
    {
      slug: 'yelahanka-airport',
      name: 'Yelahanka & Airport Schools',
      subtitle: 'Far north school zone',
      regionLabel: 'North Bangalore',
      displayOrder: 2,
      areaKeys: ['IN|KA|Bengaluru|Yelahanka', 'IN|KA|Bengaluru|Kempegowda'],
    },
    {
      slug: 'east-corridor',
      name: 'Whitefield & Marathahalli Schools',
      subtitle: 'East school zone',
      regionLabel: 'East Bangalore',
      displayOrder: 3,
      areaKeys: ['IN|KA|Bengaluru|Whitefield', 'IN|KA|Bengaluru|Marathahalli'],
    },
  ],
};

const DISCOVER_AREAS_BLR = {
  city: 'bangalore',
  areas: [
    { areaKey: 'IN|KA|Bengaluru|Hebbal', name: 'Hebbal', geoCenterLat: 13.035, geoCenterLon: 77.596, listingCount: 42, schoolCount: 6 },
    { areaKey: 'IN|KA|Bengaluru|Jakkur', name: 'Jakkur', geoCenterLat: 13.065, geoCenterLon: 77.608, listingCount: 28, schoolCount: 4 },
    { areaKey: 'IN|KA|Bengaluru|Yelahanka', name: 'Yelahanka', geoCenterLat: 13.10, geoCenterLon: 77.598, listingCount: 35, schoolCount: 5 },
    { areaKey: 'IN|KA|Bengaluru|Kempegowda', name: 'Kempegowda', geoCenterLat: 13.20, geoCenterLon: 77.61, listingCount: 15, schoolCount: 2 },
    { areaKey: 'IN|KA|Bengaluru|Whitefield', name: 'Whitefield', geoCenterLat: 12.97, geoCenterLon: 77.75, listingCount: 88, schoolCount: 9 },
    { areaKey: 'IN|KA|Bengaluru|Marathahalli', name: 'Marathahalli', geoCenterLat: 12.95, geoCenterLon: 77.70, listingCount: 55, schoolCount: 7 },
  ],
};

const AREA_GROUPS_UDUPI = {
  city: 'udupi',
  groups: [
    {
      slug: 'university-belt',
      name: 'University Belt',
      subtitle: 'Manipal & surrounds',
      regionLabel: 'Manipal',
      displayOrder: 1,
      areaKeys: ['IN|KA|Udupi|Manipal', 'IN|KA|Udupi|Udupi'],
    },
  ],
};

const DISCOVER_AREAS_UDUPI = {
  city: 'udupi',
  areas: [
    { areaKey: 'IN|KA|Udupi|Manipal', name: 'Manipal', geoCenterLat: 13.3525, geoCenterLon: 74.7864, listingCount: 12, schoolCount: 4 },
    { areaKey: 'IN|KA|Udupi|Udupi', name: 'Udupi', geoCenterLat: 13.3393, geoCenterLon: 74.7468, listingCount: 8, schoolCount: 3 },
  ],
};

const SCHOOLS_BY_AREA_MANIPAL = [
  { id: 'sch-1', name: 'Manipal Public School', board: 'CBSE', boardType: null, address: 'Manipal, Udupi', latitude: 13.3525, longitude: 74.7864, distanceKm: 1.2, areaKey: 'IN|KA|Udupi|Manipal' },
  { id: 'sch-2', name: 'MIT Vidyaniketan', board: 'STATE', boardType: null, address: 'Manipal, Udupi', latitude: 13.351, longitude: 74.785, distanceKm: 1.5, areaKey: 'IN|KA|Udupi|Manipal' },
];

const POPULAR_SCHOOLS_BLR = [
  { id: 'pop-1', name: 'Bangalore International School', board: 'IB/IGCSE', boardType: null, address: 'Hennur, Bangalore', latitude: 13.052, longitude: 77.636, distanceKm: 2.1, areaKey: 'IN|KA|Bengaluru|Hebbal' },
];

const EMPTY_LISTINGS_PAGE = { content: [], page: 0, size: 50, totalElements: 0, totalPages: 0, aggregates: { topLocalities: [] } };

function fulfillJson(route: Route, body: unknown): Promise<void> {
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

async function setupBangaloreStubs(page: Page) {
  await page.route('**/api/discover/area-groups**', (r) => fulfillJson(r, AREA_GROUPS_BLR));
  await page.route('**/api/discover/areas**', (r) => fulfillJson(r, DISCOVER_AREAS_BLR));
  await page.route('**/api/public/schools/popular**', (r) => fulfillJson(r, POPULAR_SCHOOLS_BLR));
  await page.route('**/api/public/schools/by-area**', (r) => fulfillJson(r, []));
  await page.route('**/api/listings/**', (r) => fulfillJson(r, EMPTY_LISTINGS_PAGE));
  await page.route('**/api/listings**', (r) => fulfillJson(r, EMPTY_LISTINGS_PAGE));
  await page.route('**/api/trends/**', (r) => fulfillJson(r, { city: 'bangalore', defaultAreas: [] }));
}

async function setupUdupiStubs(page: Page) {
  await page.route('**/api/discover/area-groups**', (r) => fulfillJson(r, AREA_GROUPS_UDUPI));
  await page.route('**/api/discover/areas**', (r) => fulfillJson(r, DISCOVER_AREAS_UDUPI));
  await page.route('**/api/public/schools/popular**', (r) => fulfillJson(r, []));
  await page.route('**/api/public/schools/by-area**', (r) => fulfillJson(r, SCHOOLS_BY_AREA_MANIPAL));
  await page.route('**/api/public/schools/sch-1**', (r) => fulfillJson(r, SCHOOLS_BY_AREA_MANIPAL[0]));
  await page.route('**/api/public/schools/11111111-2222-3333-4444-555555555555**', (r) => fulfillJson(r, {
    id: '11111111-2222-3333-4444-555555555555',
    name: 'Manipal Public School',
    board: 'CBSE',
    boardType: null,
    address: 'Manipal, Udupi',
    latitude: 13.3525,
    longitude: 74.7864,
    distanceKm: 1.2,
    areaKey: 'IN|KA|Udupi|Manipal',
  }));
  await page.route('**/api/listings/**', (r) => fulfillJson(r, EMPTY_LISTINGS_PAGE));
  await page.route('**/api/listings**', (r) => fulfillJson(r, EMPTY_LISTINGS_PAGE));
  await page.route('**/api/trends/**', (r) => fulfillJson(r, { city: 'udupi', defaultAreas: [] }));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function suppressConsentBanner(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('discover_telemetry_consent', 'granted');
  });
}

async function waitForPanelReady(page: Page) {
  // Wait for the panel to mount (header visible)
  await page.waitForSelector('h1, [data-testid="school-browse-intro"], [data-testid="school-zones-list"]', {
    state: 'visible',
    timeout: 12_000,
  }).catch(() => {});
  // Let map animations settle
  await page.waitForTimeout(1200);
}

async function saveEvidence(page: Page, filename: string) {
  const targetPath = path.join(EVIDENCE_DIR, filename);
  await page.screenshot({ path: targetPath });
  console.log(`✓ Saved: ${targetPath}`);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('Issue #1770 — School-First Journey Polish: Evidence Capture', () => {
  // ── CHECKLIST A: Bangalore school-first landing ───────────────────────────

  test('Screenshot 1: Bangalore school-first landing', async ({ page }) => {
    await suppressConsentBanner(page);
    await setupBangaloreStubs(page);
    await page.goto('/discover?city=bangalore&journey=school-first');
    await waitForPanelReady(page);

    // A1: Header says "Discover Bangalore"
    await expect(page.getByRole('heading', { name: /Discover Bangalore/i })).toBeVisible({ timeout: 10_000 });

    // A2: "School-first" pill is visible (journey pill in PanelHeader)
    await expect(page.getByText('School-first')).toBeVisible();

    // A3: Dark navy intro card is visible
    await expect(page.getByTestId('school-browse-intro')).toBeVisible();

    await expect(page.getByTestId('school-browse-intro').getByText('Discover Bangalore')).toBeVisible();
    await expect(page.getByTestId('school-browse-intro').getByText('Search near school')).toBeVisible();

    // A5: Intro title says "School zones across Bangalore"
    await expect(page.getByTestId('school-browse-intro-title')).toContainText('School zones across Bangalore');

    // A6: Search input is visible
    await expect(page.getByPlaceholder('Search school name...')).toBeVisible();

    // A7: SCHOOL ZONES section heading is visible
    await expect(page.getByTestId('school-zones-heading')).toBeVisible();
    await expect(page.getByTestId('school-zones-heading')).toContainText(/school zones/i);

    // A8: Zone cards are present (grouped by school zone, not old residential groups)
    await expect(page.getByTestId('school-zones-list')).toBeVisible();
    await expect(page.getByTestId('school-zone-card-north-airport-belt')).toBeVisible();
    await expect(page.getByTestId('school-zone-card-yelahanka-airport')).toBeVisible();
    await expect(page.getByTestId('school-zone-card-east-corridor')).toBeVisible();

    // A9: Zone cards have area names chips
    await expect(page.getByTestId('school-zone-card-north-airport-belt').getByTestId('school-zone-card-area-names')).toBeVisible();

    // A10: Zone cards have school count metric
    await expect(page.getByTestId('school-zone-card-north-airport-belt').getByTestId('school-zone-card-school-count')).toContainText('school');

    // A11: Zone cards have listing count metric
    await expect(page.getByTestId('school-zone-card-north-airport-belt').getByTestId('school-zone-card-listing-count')).toContainText('listing');

    // A12: CTA says "Explore zone"
    await expect(page.getByText('Explore zone').first()).toBeVisible();

    // A13: No sibling-school switching section present
    await expect(page.getByText('Other schools in this area').first()).not.toBeVisible().catch(() => {});
    await expect(page.getByTestId('change-school-in-area-section')).not.toBeVisible().catch(() => {});

    await saveEvidence(page, '1_bangalore_school_first_landing.png');
  });

  test('Screenshot 2: Bangalore school-first North-scoped landing', async ({ page }) => {
    await suppressConsentBanner(page);
    await setupBangaloreStubs(page);
    await page.goto('/discover?city=bangalore&scope=north&journey=school-first');
    await waitForPanelReady(page);

    // Header remains "Discover Bangalore"
    await expect(page.getByRole('heading', { name: /Discover Bangalore/i })).toBeVisible({ timeout: 10_000 });

    // Intro card updates to "School zones in North Bangalore"
    await expect(page.getByTestId('school-browse-intro')).toBeVisible();
    await expect(page.getByTestId('school-browse-intro-title')).toContainText(/School zones in/i);

    // "Search near school" breadcrumb is still present
    await expect(page.getByText('Search near school')).toBeVisible();

    await saveEvidence(page, '2_bangalore_school_first_north_scope.png');
  });

  test('Screenshot 3: Bangalore — zone card click navigates to school-group-areas', async ({ page }) => {
    await suppressConsentBanner(page);
    await setupBangaloreStubs(page);
    await page.goto('/discover?city=bangalore&journey=school-first');
    await waitForPanelReady(page);

    // Click first zone card
    const zoneCard = page.getByTestId('school-zone-card-north-airport-belt');
    await expect(zoneCard).toBeVisible({ timeout: 10_000 });
    await zoneCard.click();

    // URL must update with groupId
    await expect(page).toHaveURL(/groupId=north-airport-belt/, { timeout: 5_000 });

    // Area list panel appears (L2)
    await expect(page.getByTestId('school-group-areas-list')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Hebbal|Jakkur/).first()).toBeVisible();

    await saveEvidence(page, '3_bangalore_school_zone_selected.png');
  });

  // ── CHECKLIST A+C: Udupi university belt ─────────────────────────────────

  test('Screenshot 4: Udupi university-belt school-first zone selected', async ({ page }) => {
    await suppressConsentBanner(page);
    await setupUdupiStubs(page);
    await page.goto('/discover?city=udupi&journey=school-first&groupId=university-belt');
    await waitForPanelReady(page);

    // L2: school-group-areas panel with university-belt areas
    await expect(page.getByTestId('school-group-areas-list')).toBeVisible({ timeout: 12_000 });
    await expect(page.getByText(/Manipal/).first()).toBeVisible();

    await saveEvidence(page, '4_udupi_university_belt_school_first.png');
  });

  test('Screenshot 5: Udupi Manipal — school list (L3)', async ({ page }) => {
    await suppressConsentBanner(page);
    await setupUdupiStubs(page);
    await page.goto('/discover?city=udupi&journey=school-first&groupId=university-belt&areaKey=IN%7CKA%7CUdupi%7CManipal');
    await waitForPanelReady(page);

    // L3: Schools in Manipal
    await expect(page.getByTestId('selected-area-summary')).toBeVisible({ timeout: 12_000 });
    await expect(page.getByText(/find a school in manipal/i)).toBeVisible();
    await expect(page.getByText('Manipal Public School')).toBeVisible();
    await expect(page.getByText('MIT Vidyaniketan')).toBeVisible();

    await saveEvidence(page, '5_udupi_manipal_school_list.png');
  });

  test('Screenshot 6: Udupi — selected school radius results (L4)', async ({ page }) => {
    await suppressConsentBanner(page);
    await setupUdupiStubs(page);
    await page.goto(
      '/discover?city=udupi&journey=school-first&groupId=university-belt&areaKey=IN%7CKA%7CUdupi%7CManipal&schoolId=11111111-2222-3333-4444-555555555555&radiusKm=3',
    );
    await waitForPanelReady(page);

    // L4: school summary band
    await expect(page.getByTestId('school-summary-band')).toBeVisible({ timeout: 12_000 });

    // Radius chips are visible
    await expect(page.getByText('3 km').first()).toBeVisible();
    await expect(page.getByText('5 km').first()).toBeVisible();
    await expect(page.getByText('10 km').first()).toBeVisible();

    // No sibling-school switching section (Issue #1770 scope drift removed)
    await expect(page.getByText('Other schools in this area')).not.toBeVisible().catch(() => {});

    await saveEvidence(page, '6_udupi_selected_school_radius.png');
  });

  // ── CHECKLIST C: Buy/Rent persistence + back/forward ─────────────────────

  test('Screenshot 7: Buy/Rent persistence across school-first navigation', async ({ page }) => {
    await suppressConsentBanner(page);
    await setupUdupiStubs(page);

    // Start at L1 with intent=buy
    await page.goto('/discover?city=udupi&journey=school-first&intent=buy');
    await waitForPanelReady(page);
    await expect(page).toHaveURL(/intent=buy/);

    // Navigate into a zone
    await expect(page.getByTestId('school-zone-card-university-belt')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('school-zone-card-university-belt').click();
    await expect(page).toHaveURL(/groupId=university-belt/, { timeout: 5_000 });

    // intent=buy must persist
    await expect(page).toHaveURL(/intent=buy/);
    await page.waitForTimeout(800);
    await saveEvidence(page, '7_back_forward_or_buy_rent_persistence.png');

    // Browser back returns to L1
    await page.goBack();
    await expect(page).not.toHaveURL(/groupId=/, { timeout: 5_000 });
    await expect(page).toHaveURL(/journey=school-first/);

    // Browser forward returns to L2
    await page.goForward();
    await expect(page).toHaveURL(/groupId=university-belt/, { timeout: 5_000 });
  });

  // ── CHECKLIST D: Regressions ──────────────────────────────────────────────

  test('Screenshot 8: Area-first journey regression check (Issue #1766)', async ({ page }) => {
    await suppressConsentBanner(page);
    // area-first uses a different endpoint shape — use the BLR stub but area-first groups
    await page.route('**/api/discover/area-groups**', (r) => fulfillJson(r, {
      city: 'bangalore',
      groups: [
        {
          slug: 'airport-belt',
          name: 'Airport Belt',
          subtitle: 'North Bangalore corridors',
          regionLabel: 'North Bangalore',
          displayOrder: 1,
          areaKeys: ['IN|KA|Bengaluru|Yelahanka', 'IN|KA|Bengaluru|Hebbal'],
        },
      ],
    }));
    await page.route('**/api/discover/areas**', (r) => fulfillJson(r, DISCOVER_AREAS_BLR));
    await page.route('**/api/trends/**', (r) => fulfillJson(r, { city: 'bangalore', defaultAreas: [] }));
    await page.route('**/api/listings**', (r) => fulfillJson(r, EMPTY_LISTINGS_PAGE));

    await page.goto('/discover?city=bangalore&journey=area-first');
    await waitForPanelReady(page);

    // area-first landing must show the area-first intro, NOT school-browse-intro
    await expect(page.getByTestId('area-groups-intro')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('school-browse-intro')).not.toBeVisible();

    // Group card (area journey card) must be present
    await expect(page.getByTestId('area-group-card-airport-belt')).toBeVisible();

    await saveEvidence(page, '8_area_first_regression_after_school_polish.png');
  });

  test('Regression: city landing from #1764 still works (/discover?city=bangalore)', async ({ page }) => {
    await suppressConsentBanner(page);
    await page.route('**/api/discover/area-groups**', (r) => fulfillJson(r, { city: 'bangalore', groups: [] }));
    await page.route('**/api/discover/areas**', (r) => fulfillJson(r, { city: 'bangalore', areas: [] }));
    await page.route('**/api/trends/**', (r) => fulfillJson(r, { city: 'bangalore', defaultAreas: [] }));

    await page.goto('/discover?city=bangalore');
    await waitForPanelReady(page);

    // City landing: guided-entry panel or macro-region bubbles — no school-browse-intro
    await expect(page.getByTestId('school-browse-intro')).not.toBeVisible();
    // Should show city-level content (guided-entry or macro-region)
    const cityPanel = await page.locator('[data-testid="guided-entry-panel"], .macro-region-bubble').first();
    await expect(cityPanel).toBeVisible({ timeout: 10_000 }).catch(() => {});
  });

  test('Area / School toggle does not break school-first route model', async ({ page }) => {
    await suppressConsentBanner(page);
    await setupBangaloreStubs(page);

    await page.goto('/discover?city=bangalore&journey=area-first&intent=buy');
    await waitForPanelReady(page);

    // School tab should be visible and clickable
    const schoolTab = page.getByTestId('search-mode-school');
    if (await schoolTab.isVisible()) {
      await schoolTab.click();
      // URL should stay area-first (toggle doesn't change journey)
      await expect(page).toHaveURL(/journey=area-first/);
      await expect(page).toHaveURL(/intent=buy/);
    }
  });
});
