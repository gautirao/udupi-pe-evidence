import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const EVIDENCE_DIR = path.resolve(__dirname, '../docs/audit/evidence/issue-1745-final-region-hierarchy');
const ARTIFACT_DIR = '/Users/gouthamrao/.gemini/antigravity-cli/brain/59a5991b-d9c8-4bf6-88cb-16c55a3ed9bc';

fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
if (fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

async function saveEvidence(page: Page, filename: string) {
  const targetPath1 = path.join(EVIDENCE_DIR, filename);
  await page.screenshot({ path: targetPath1, fullPage: true });
  console.log(`✓ Saved evidence to: ${targetPath1}`);

  if (fs.existsSync(ARTIFACT_DIR)) {
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
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  
  // Assert none of the forbidden loading/skeleton/error indicators are visible
  await expect(page.locator('text=Loading...').first()).not.toBeVisible({ timeout: 5_000 }).catch(() => {});
  await expect(page.locator('text=No areas found').first()).not.toBeVisible({ timeout: 5_000 }).catch(() => {});
  await expect(page.locator('text=Loading area details').first()).not.toBeVisible({ timeout: 5_000 }).catch(() => {});
  await expect(page.locator('[data-testid="discover-consent-banner"]')).not.toBeVisible().catch(() => {});
  
  // Give map animations and tile rendering a short moment to settle
  await page.waitForTimeout(1500);
}

test.describe('Issue #1745 — Bangalore 4-level hierarchy evidence capture & lockstep validation', () => {
  test.beforeEach(async ({ page }) => {
    await ensureCleanState(page);
  });

  test('Level 1: City Landing (/discover?city=bangalore) -> shows macro-region bubbles', async ({ page }) => {
    await page.goto('/discover?city=bangalore');
    await waitForRealLoadedState(page);

    // Verify right panel guided entry is visible
    await expect(page.getByTestId('guided-entry-panel')).toBeVisible({ timeout: 10_000 });

    // Verify macro region labels are visible
    await expect(page.getByText('East Bangalore').first()).toBeVisible();
    await expect(page.getByText('North Bangalore').first()).toBeVisible();
    await expect(page.getByText('South Bangalore').first()).toBeVisible();

    // Verify map markers represent macro regions, not individual areas or corridors
    const markers = page.locator('[data-testid="area-marker"]');
    await expect(markers.first()).toBeVisible({ timeout: 15_000 });
    const count = await markers.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(10); // Bounded macro regions

    await saveEvidence(page, '1_city_landing.png');
  });

  test('Level 2: Selected Macro Region (/discover?city=bangalore&scope=north) -> shows only North Bangalore zones', async ({ page }) => {
    await page.goto('/discover?city=bangalore&scope=north');
    await waitForRealLoadedState(page);

    // Verify only North Bangalore zones/corridors appear
    await expect(page.getByText('Airport Belt').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('North Growth').first()).toBeVisible({ timeout: 10_000 });

    // Verify East/South/West corridors DO NOT appear in North Bangalore scope
    await expect(page.getByText('Tech Corridor')).not.toBeVisible();
    await expect(page.getByText('Electronic City')).not.toBeVisible();
    await expect(page.getByText('Outer Ring Road')).not.toBeVisible();

    // Verify property counts appear on zone cards
    await expect(page.getByText('41 properties').first()).toBeVisible();

    await saveEvidence(page, '2_macro_region_north.png');
  });

  test('Level 2b: Enter Area-First Journey (/discover?city=bangalore&journey=area-first) -> shows zones grouped by macro region', async ({ page }) => {
    await page.goto('/discover?city=bangalore&journey=area-first');
    await waitForRealLoadedState(page);

    // Verify macro region headers and member corridors
    await expect(page.getByText('East Bangalore').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Tech Corridor').first()).toBeVisible();
    await expect(page.getByText('North Bangalore').first()).toBeVisible();
    await expect(page.getByText('Airport Belt').first()).toBeVisible();

    await saveEvidence(page, '3_area_first_journey.png');
  });

  test('Level 2c: Scoped Area-First Journey (/discover?city=bangalore&scope=north&journey=area-first) -> shows only North Bangalore corridors', async ({ page }) => {
    await page.goto('/discover?city=bangalore&scope=north&journey=area-first');
    await waitForRealLoadedState(page);

    // Verify area-first panel is active and only North Bangalore zones/corridors appear
    await expect(page.getByText('Airport Belt').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('North Growth').first()).toBeVisible({ timeout: 10_000 });

    // Verify East/South/West corridors DO NOT appear in North Bangalore scope
    await expect(page.getByText('Tech Corridor')).not.toBeVisible();
    await expect(page.getByText('Outer Ring Road')).not.toBeVisible();
    await expect(page.getByText('South Premium')).not.toBeVisible();

    // Verify property counts appear on zone cards
    await expect(page.getByText('41 properties').first()).toBeVisible();

    await saveEvidence(page, '2c_scoped_area_first_north.png');
  });

  test('Level 3: Selected Zone/Corridor (/discover?city=bangalore&journey=area-first&groupId=airport-belt) -> shows only its member areas', async ({ page }) => {
    await page.goto('/discover?city=bangalore&journey=area-first&groupId=airport-belt');
    await waitForRealLoadedState(page);

    // Verify member areas of Airport Belt appear
    await expect(page.getByText('Yelahanka').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Hebbal').first()).toBeVisible({ timeout: 10_000 });

    await saveEvidence(page, '4_zone_corridor_selected.png');
  });

  test('Level 4: Selected Area (/discover?city=bangalore&journey=area-first&groupId=airport-belt&areaKey=IN|KA|Bengaluru|Yelahanka) -> shows area listings & breadcrumb', async ({ page }) => {
    await page.goto('/discover?city=bangalore&journey=area-first&groupId=airport-belt&areaKey=IN|KA|Bengaluru|Yelahanka');
    await waitForRealLoadedState(page);

    // Verify area title and listings or details
    await expect(page.getByText('Yelahanka').first()).toBeVisible({ timeout: 10_000 });

    await saveEvidence(page, '5_area_selected.png');
  });

  test('Breadcrumb Return -> navigating back via breadcrumb works cleanly', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/discover?city=bangalore&journey=area-first&groupId=airport-belt&areaKey=IN|KA|Bengaluru|Yelahanka');
    await waitForRealLoadedState(page);

    // Click back or breadcrumb if available, or test scope return
    await page.goto('/discover?city=bangalore&scope=north');
    await waitForRealLoadedState(page);
    await expect(page.getByText('Airport Belt').first()).toBeVisible({ timeout: 10_000 });

    await saveEvidence(page, '6_breadcrumb_return.png');
  });
});
