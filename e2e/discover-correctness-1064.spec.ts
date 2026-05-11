/**
 * E2E for Issue #1064 — Symptom 2 (Start Over viewport reset)
 *                       and Symptom 3 (Malpe school-first hydration).
 *
 * Symptom 1 (anonymous Manipal markers) is DEFERRED to follow-up #1065.
 *
 * Run: bash scripts/run-e2e-local.sh --project=full e2e/discover-correctness-1064.spec.ts
 */
import { test, expect, type Page, type Route } from '@playwright/test';

const AREA_MARKER = '.leaflet-marker-icon.area-marker';
const MANIPAL_AREA_KEY = 'IN|KA|Udupi|Manipal';
const MALPE_AREA_KEY = 'IN|KA|Udupi|Malpe';

const KNOWN_MALPE_SCHOOLS = [
  'Kodavoor School',
  'PRETTY ANGELS PRE SCHOOL MALPE',
  'KADAL SURF SCHOOL | SUP | KAYAKING',
  'Noor ul Furqan special school',
];

// Project convention (see e2e/discover-school-first-journey.spec.ts) — stub
// /api/public/schools/by-area because the Vite dev server does not proxy
// /api/** to the backend, and useSchoolsByArea uses a raw relative `fetch()`
// (unlike other discover hooks which go through lib/api with absolute URLs).
// The fixture mirrors the live local-backend response for areaKey=Malpe so the
// assertion still verifies real user-visible behaviour (one of the 4 known
// schools renders).
const MALPE_SCHOOLS_FIXTURE = [
  {
    id: '5d8089d1-03c9-41b1-8e60-779d1c518145',
    name: 'KADAL SURF SCHOOL | SUP | KAYAKING',
    boardType: 'Government',
    board: null,
    latitude: 13.3818981,
    longitude: 74.7000141,
    address: 'Govt School, Thottam, Badanidiyur, Udupi, Karnataka 576115, India',
    distanceKm: null,
    prominenceTier: 'notable',
    schoolCategory: null,
  },
  {
    id: 'f09b6bc6-fe47-460f-bb2c-e60037a7ec50',
    name: 'Kodavoor School',
    boardType: null,
    board: null,
    latitude: 13.3583376,
    longitude: 74.71469,
    address: 'Malpe, Udupi, Karnataka 576106, India',
    distanceKm: null,
    prominenceTier: 'notable',
    schoolCategory: null,
  },
  {
    id: '378c6bd4-9646-476b-a3e8-deab503b6b89',
    name: 'Noor ul Furqan special school',
    boardType: null,
    board: null,
    latitude: 13.3908828,
    longitude: 74.7214967,
    address: '9PRC+9H5, Santhekatte, Karnataka 576115, India',
    distanceKm: null,
    prominenceTier: 'notable',
    schoolCategory: null,
  },
  {
    id: '110b5961-5f65-4229-9ed9-1aff79daeecb',
    name: 'PRETTY ANGELS PRE SCHOOL MALPE',
    boardType: null,
    board: null,
    latitude: 13.3419164,
    longitude: 74.7083519,
    address: '29-72, Baputhota Rd, Kodavoor, Malpe, Karnataka 576108, India',
    distanceKm: null,
    prominenceTier: 'notable',
    schoolCategory: 'Primary',
  },
];

function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function stubSchoolsByArea(page: Page, schools: unknown[]): Promise<void> {
  await page.route('**/api/public/schools/by-area**', (route) =>
    fulfillJson(route, 200, schools),
  );
}

test.describe('Issue #1064 — Discover correctness (Symptoms 2 + 3)', () => {
  test('Spec 2 — Start Over resets URL and viewport to city overview', async ({ page }) => {
    // Step 1: deep-link to Manipal area at zoom=14 (deeper than DEFAULT_ZOOM=11).
    // journey=area-first is required for PanelHeader to render the Start Over
    // button (PanelHeader shows it only when journey != null && onStartOver != null;
    // this matches real users who reach this state by selecting area-first from
    // GuidedEntryPanel before clicking an area marker).
    const areaZoomedUrl =
      `/discover?city=udupi&journey=area-first` +
      `&areaKey=${encodeURIComponent(MANIPAL_AREA_KEY)}` +
      `&lat=13.35&lon=74.79&zoom=14`;
    await page.goto(areaZoomedUrl);
    await page.waitForLoadState('domcontentloaded');

    // Sanity — URL has the deep-link state.
    expect(page.url()).toContain('areaKey=');
    expect(page.url()).toContain('zoom=14');

    // Step 2: click Start Over (right-panel header).
    const startOver = page.getByTestId('start-over-button').first();
    await startOver.waitFor({ state: 'visible', timeout: 10_000 });
    await startOver.click();

    // Step 3a: URL becomes ?city=udupi (areaKey + zoom + lat/lon + journey cleared).
    await expect(page).toHaveURL(/\?city=udupi(&|$)/, { timeout: 5_000 });
    const afterUrl = page.url();
    expect(afterUrl).not.toContain('areaKey=');
    expect(afterUrl).not.toContain('zoom=14');
    expect(afterUrl).not.toContain('journey=');

    // Step 3b: viewport snapped back to city overview — area markers must be visible again
    // (only render at zoom <= AREA_LAYER_MAX_ZOOM=12). DEFAULT_ZOOM=11 ≤ 12.
    await expect(page.locator(AREA_MARKER).first()).toBeVisible({ timeout: 8_000 });
  });

  test('Spec 3 — Malpe school-first deep link renders SchoolsInAreaPanel', async ({ page }) => {
    // Stub schools-by-area (see fixture comment above) — required because Vite
    // dev server does not proxy /api/** and useSchoolsByArea uses raw fetch().
    await stubSchoolsByArea(page, MALPE_SCHOOLS_FIXTURE);

    const malpeSchoolFirstUrl =
      `/discover?city=udupi&journey=school-first` +
      `&areaKey=${encodeURIComponent(MALPE_AREA_KEY)}`;
    await page.goto(malpeSchoolFirstUrl);
    await page.waitForLoadState('domcontentloaded');

    // After hydration, the right panel must render SchoolsInAreaPanel (not the silent
    // GuidedEntryPanel fall-back from the #1064 hydration race bug). The panel
    // header is the load-bearing signal — once "Schools in Malpe" appears we know
    // the schools-in-area branch hydrated correctly.
    await expect(
      page.getByRole('heading', { name: /Schools in Malpe/i, level: 2 }),
    ).toBeVisible({ timeout: 15_000 });

    // Assert at least one known Malpe school name is visible (data flowed through
    // the panel correctly).
    const schoolLocator = page
      .getByText(new RegExp(KNOWN_MALPE_SCHOOLS.map((s) => s.replace(/[|]/g, '\\|')).join('|'), 'i'))
      .first();
    await expect(schoolLocator).toBeVisible({ timeout: 15_000 });

    // GuidedEntryPanel signature must NOT render.
    await expect(page.getByText('Find properties your way')).not.toBeVisible();
  });
});
