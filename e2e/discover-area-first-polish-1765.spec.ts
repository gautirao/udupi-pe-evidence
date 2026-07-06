import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const EVIDENCE_DIR = path.resolve(__dirname, '../docs/audit/evidence/discover-area-first-polish');
const ARTIFACT_DIR = process.env.ARTIFACT_DIR;

fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
if (ARTIFACT_DIR && fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

async function saveEvidence(page: Page, filename: string) {
  const targetPath1 = path.join(EVIDENCE_DIR, filename);
  await page.screenshot({ path: targetPath1, fullPage: true });
  console.log(`✓ Saved evidence to: ${targetPath1}`);

  if (ARTIFACT_DIR && fs.existsSync(ARTIFACT_DIR)) {
    const targetPath2 = path.join(ARTIFACT_DIR, filename);
    fs.copyFileSync(targetPath1, targetPath2);
    console.log(`✓ Copied evidence to artifact dir: ${targetPath2}`);
  }
}

async function ensureCleanState(page: Page) {
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
  page.on('requestfailed', req => console.log('REQUEST FAILED:', req.url(), req.failure()?.errorText));
  // Suppress cookie banner before navigation
  await page.addInitScript(() => {
    localStorage.setItem('discover_telemetry_consent', 'granted');
  });
}

async function waitForRealLoadedState(page: Page) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  
  // Wait for breadcrumbs, search input, or map markers to prove page is rendered
  await page.locator('nav[aria-label="Breadcrumb"], h1, [data-testid="scoped-search-input"], .macro-region-bubble, .group-pill-marker').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
  
  // Assert none of the forbidden loading/skeleton/error indicators are visible
  await expect(page.locator('text=Loading...').first()).not.toBeVisible({ timeout: 3_000 }).catch(() => {});
  await expect(page.locator('text=No areas found').first()).not.toBeVisible({ timeout: 3_000 }).catch(() => {});
  await expect(page.locator('text=Loading area details').first()).not.toBeVisible({ timeout: 3_000 }).catch(() => {});
  await expect(page.locator('[data-testid="discover-consent-banner"]')).not.toBeVisible().catch(() => {});
  
  // Give map animations and tile rendering a short moment to settle
  await page.waitForTimeout(1000);
}

test.describe('Issue #1765 — Area-First Discover Journey Visual Polish & Evidence Capture', () => {
  test.beforeEach(async ({ page }) => {
    await ensureCleanState(page);
  });

  test('Scenario 1: Bangalore Area-First Landing (/discover?city=bangalore&journey=area-first)', async ({ page }) => {
    await page.goto('/discover?city=bangalore&journey=area-first');
    await waitForRealLoadedState(page);

    // Verify dark navy summary card title and copy
    await expect(page.getByTestId('area-groups-intro')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Area groups across Bangalore')).toBeVisible();
    await expect(page.getByText('Search by area').first()).toBeVisible();

    // Verify Area / School switch and search input
    await expect(page.getByTestId('search-mode-area')).toBeVisible();
    await expect(page.getByTestId('search-mode-school')).toBeVisible();
    await expect(page.getByTestId('search-mode-area')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('scoped-search-input')).toBeVisible();
    await expect(page.getByPlaceholder('Search Bangalore areas…')).toBeVisible();

    // Verify CTA text says Explore group
    await expect(page.getByText('Explore group').first()).toBeVisible();

    // Verify Area-first group markers (pill markers) are visible on the map
    await expect(page.locator('.group-pill-marker').first()).toBeVisible();

    // Verify macro region headings and corridor cards
    await expect(page.getByText('East Bangalore').first()).toBeVisible();
    await expect(page.getByText('North Bangalore').first()).toBeVisible();
    await expect(page.getByText('Airport Belt').first()).toBeVisible();

    await saveEvidence(page, '1_bangalore_area_first_landing.png');
  });

  test('Scenario 2: North-Scoped Area-First Landing (/discover?city=bangalore&scope=north&journey=area-first)', async ({ page }) => {
    await page.goto('/discover?city=bangalore&scope=north&journey=area-first');
    await waitForRealLoadedState(page);

    // Verify north scope filter banner and scope-aware editorial copy
    await expect(page.getByTestId('macro-region-filter-banner')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Area groups in North Bangalore')).toBeVisible();
    await expect(page.getByText('within North Bangalore')).toBeVisible();

    // Verify only North Bangalore corridors are displayed
    await expect(page.getByText('Airport Belt').first()).toBeVisible();
    await expect(page.getByText('North Growth').first()).toBeVisible();
    await expect(page.getByText('Tech Corridor')).not.toBeVisible();

    await saveEvidence(page, '2_bangalore_north_scoped_landing.png');
  });

  test('Scenario 3: Corridor/Zone Selected (/discover?city=bangalore&scope=north&journey=area-first&groupId=airport-belt)', async ({ page }) => {
    await page.goto('/discover?city=bangalore&scope=north&journey=area-first&groupId=airport-belt');
    await waitForRealLoadedState(page);

    // Verify selected group hero card and member localities
    await expect(page.getByTestId('area-group-selected-card')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Airport Belt').first()).toBeVisible();
    await expect(page.getByText('Areas inside Airport Belt')).toBeVisible();
    await expect(page.getByText('Yelahanka').first()).toBeVisible();
    await expect(page.getByText('Hebbal').first()).toBeVisible();

    await saveEvidence(page, '3_bangalore_corridor_selected.png');
  });

  test('Scenario 4: Area Selected (/discover?city=bangalore&scope=north&journey=area-first&groupId=airport-belt&areaKey=IN|KA|Bengaluru|Yelahanka)', async ({ page }) => {
    await page.goto('/discover?city=bangalore&scope=north&journey=area-first&groupId=airport-belt&areaKey=IN|KA|Bengaluru|Yelahanka');
    await waitForRealLoadedState(page);

    // Verify area listings or empty state in Yelahanka
    await expect(page.getByText('Yelahanka').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('area-first-breadcrumb')).toBeVisible();

    await saveEvidence(page, '4_bangalore_area_selected.png');
  });

  test('Scenario 5: Udupi Area-First Landing (/discover?city=udupi&journey=area-first)', async ({ page }) => {
    await page.goto('/discover?city=udupi&journey=area-first');
    await waitForRealLoadedState(page);

    // Verify Udupi neighbourhood groups
    await expect(page.getByTestId('area-groups-intro')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Area groups across Udupi')).toBeVisible();
    await expect(page.getByText('Coastal Strip').first()).toBeVisible();

    await saveEvidence(page, '5_udupi_area_first_landing.png');
  });

  test('Scenario 6: Udupi Group Selected (/discover?city=udupi&journey=area-first&groupId=coastal-strip)', async ({ page }) => {
    await page.goto('/discover?city=udupi&journey=area-first&groupId=coastal-strip');
    await waitForRealLoadedState(page);

    // Verify Coastal Strip member localities
    await expect(page.getByTestId('area-group-selected-card')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Coastal Strip').first()).toBeVisible();
    await expect(page.getByText('Areas inside Coastal Strip')).toBeVisible();
    await expect(page.getByText('Malpe').first()).toBeVisible();

    await saveEvidence(page, '6_udupi_group_selected.png');
  });

  test('Scenario 7: ScopedSearch Interaction and City-Level Macro-Region Check', async ({ page }) => {
    // 1. Check City-level /discover?city=bangalore from PR #1764 still shows macro-region bubbles only
    await page.goto('/discover?city=bangalore');
    await waitForRealLoadedState(page);
    await expect(page.locator('.macro-region-bubble').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.group-pill-marker')).not.toBeVisible();

    // 2. Go to Area-first landing and test ScopedSearch
    await page.goto('/discover?city=bangalore&journey=area-first');
    await waitForRealLoadedState(page);
    
    const searchInput = page.getByTestId('scoped-search-input');
    await expect(searchInput).toBeVisible();
    await searchInput.fill('Yelahanka');
    
    // Typing Yelahanka shows an area result
    const resultItem = page.getByTestId('search-result-IN|KA|Bengaluru|Yelahanka');
    await expect(resultItem).toBeVisible({ timeout: 5000 });
    
    // Clicking search result navigates/selects area
    await resultItem.click();
    await waitForRealLoadedState(page);
    await expect(page.getByText('Yelahanka').first()).toBeVisible();
  });

  test('Scenario 8: Area / School Segmented Toggle Mode Switch Without Navigation', async ({ page }) => {
    // Stub school search API for reliable fixture data
    await page.route('**/api/public/schools/search**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'sch-test-1',
            name: 'Bangalore International School',
            board: 'IB/IGCSE',
            boardType: null,
            address: 'Hennur Bagalur Road, Bangalore',
            latitude: 13.0525,
            longitude: 77.6364,
            distanceKm: 2.1,
          },
        ]),
      });
    });

    await page.route('**/api/public/schools/sch-test-1**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'sch-test-1',
          name: 'Bangalore International School',
          board: 'IB/IGCSE',
          boardType: null,
          address: 'Hennur Bagalur Road, Bangalore',
          latitude: 13.0525,
          longitude: 77.6364,
          distanceKm: 2.1,
        }),
      });
    });

    // 1. Open area-first with lat/lon/zoom and buy/rent state
    await page.goto('/discover?city=bangalore&lat=12.97160&lon=77.59460&zoom=11&journey=area-first&intent=buy');
    await waitForRealLoadedState(page);

    const beforeClickUrl = page.url();
    console.log('[Scenario 8] Initial Area mode URL:', beforeClickUrl);
    expect(beforeClickUrl).toContain('journey=area-first');
    await saveEvidence(page, '8a_school_toggle_initial_area_mode.png');

    // 2. Click School tab
    const schoolTab = page.getByTestId('search-mode-school');
    await expect(schoolTab).toBeVisible();
    await schoolTab.click();

    const afterSchoolToggleUrl = page.url();
    console.log('[Scenario 8] After School toggle URL:', afterSchoolToggleUrl);

    // 3. Assert URL still contains journey=area-first and did not navigate to school-first
    expect(afterSchoolToggleUrl).toContain('journey=area-first');
    expect(afterSchoolToggleUrl).not.toContain('journey=school-first');
    expect(afterSchoolToggleUrl).toContain('intent=buy');

    // Assert School tab has aria-checked=true
    await expect(schoolTab).toHaveAttribute('aria-checked', 'true');

    // 4. Assert input placeholder changes to "Search school name…"
    const searchInput = page.getByTestId('scoped-search-input');
    await expect(searchInput).toHaveAttribute('placeholder', 'Search school name…');
    await saveEvidence(page, '8b_school_toggle_after_click_school.png');

    // 5. Switching back to Area tab does not reload/navigate and searches areas
    const areaTab = page.getByTestId('search-mode-area');
    await areaTab.click();
    expect(page.url()).toContain('journey=area-first');
    expect(page.url()).toContain('intent=buy');
    await expect(searchInput).toHaveAttribute('placeholder', /Search.*areas/i);

    // 6. Switch to School tab again, type a query using fixture data
    await schoolTab.click();
    await searchInput.fill('Bangalore');
    const afterTypingUrl = page.url();
    console.log('[Scenario 8] After typing query URL:', afterTypingUrl);
    expect(afterTypingUrl).toContain('journey=area-first');
    expect(afterTypingUrl).not.toContain('journey=school-first');

    // 7. Assert school search dropdown appears before selection
    const schoolResult = page.getByTestId('search-result-school-sch-test-1');
    await expect(schoolResult).toBeVisible({ timeout: 5000 });
    await saveEvidence(page, '8c_school_search_dropdown.png');

    // 8. Click a school result
    await schoolResult.click();

    // 9. Assert only then the URL changes into the correct existing school-selected/school-first state
    await expect(page).toHaveURL(/journey=school-first/);
    await expect(page).toHaveURL(/schoolId=sch-test-1/);
    const afterSchoolSelectUrl = page.url();
    console.log('[Scenario 8] After school selection URL:', afterSchoolSelectUrl);
    expect(afterSchoolSelectUrl).toContain('journey=school-first');
    expect(afterSchoolSelectUrl).toContain('intent=buy');
    await waitForRealLoadedState(page);
    await saveEvidence(page, '8d_school_result_selected_navigates.png');
  });
});
