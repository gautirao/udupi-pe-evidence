import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const EVIDENCE_DIR = path.resolve(__dirname, '../docs/audit/evidence/discover-city-landing-polish');
const ARTIFACT_DIR = process.env.DISCOVER_POLISH_ARTIFACT_DIR;

fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
if (ARTIFACT_DIR) {
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
  await page.addInitScript(() => {
    localStorage.setItem('discover_telemetry_consent', 'granted');
  });
}

async function waitForRealLoadedState(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await expect(page.locator('text=Loading...').first()).not.toBeVisible({ timeout: 5_000 }).catch(() => {});
  await expect(page.locator('[data-testid="discover-consent-banner"]')).not.toBeVisible().catch(() => {});
  await page.waitForTimeout(1500);
}

test.describe('Discover City Landing Visual Polish Validation', () => {
  test.beforeEach(async ({ page }) => {
    await ensureCleanState(page);
  });

  test('1. Desktop screenshot of city landing page (/discover?city=bangalore)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/discover?city=bangalore');
    await waitForRealLoadedState(page);

    await expect(page.getByTestId('guided-entry-panel')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Find your place in Bangalore, your way.')).toBeVisible();
    await expect(page.getByText('Choose how you want to search')).toBeVisible();
    await expect(page.getByText('Or start with a region')).toBeVisible();

    // Explicit assertions for macro-region entries
    await expect(page.getByText('North Bangalore', { exact: false })).toBeVisible();
    await expect(page.getByText('East Bangalore', { exact: false })).toBeVisible();
    await expect(page.getByText('South Bangalore', { exact: false })).toBeVisible();
    await expect(page.getByText('Other Bangalore', { exact: false })).toBeVisible();

    // Explicit assertions that Tech Corridor and Airport Belt are not visible at city level
    await expect(page.getByText('Tech Corridor', { exact: false })).not.toBeVisible();
    await expect(page.getByText('Airport Belt', { exact: false })).not.toBeVisible();

    await saveEvidence(page, '1_desktop_city_landing.png');
  });

  test('2. Tablet screenshot of city landing page', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/discover?city=bangalore');
    await waitForRealLoadedState(page);

    await expect(page.getByTestId('guided-entry-panel')).toBeVisible({ timeout: 10_000 });
    await saveEvidence(page, '2_tablet_city_landing.png');
  });

  test('3. Test hover/focus states of switcher and CTA cards, and Buy/Rent toggle stability', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/discover?city=bangalore');
    await waitForRealLoadedState(page);

    // Hover over intent switcher
    const rentBtn = page.getByTestId('intent-selector-rent');
    await rentBtn.hover();
    await page.waitForTimeout(500);
    await saveEvidence(page, '3_hover_intent_switcher.png');

    // Click Rent toggle and assert it does not collapse the city landing or remove landing shell
    await rentBtn.click();
    await page.waitForTimeout(500);
    expect(page.url()).toContain('intent=rent');
    await expect(page.getByTestId('guided-entry-panel')).toBeVisible();
    await expect(page.getByText('Find your place in Bangalore, your way.')).toBeVisible();
    await expect(page.getByText('Or start with a region')).toBeVisible();

    // Hover over journey CTA card
    const areaCard = page.getByTestId('journey-card-area-first');
    await areaCard.hover();
    await page.waitForTimeout(500);
    await saveEvidence(page, '4_hover_journey_card.png');
  });

  test('4. Test click on a macro-region card (verify highlight + URL state) and clear selection', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/discover?city=bangalore');
    await waitForRealLoadedState(page);

    // Click on North Bangalore macro-region card
    const northBtn = page.locator('[data-testid="guided-entry-regions-grid"] button').filter({ hasText: 'North' }).first();
    await northBtn.click();
    await page.waitForTimeout(1000);

    // Verify URL state updated with scope=north
    expect(page.url()).toContain('scope=north');
    // Verify scoped state is visible and stable
    await expect(page.getByTestId('guided-entry-panel')).toBeVisible();
    await expect(northBtn).toHaveAttribute('aria-pressed', 'true');
    await saveEvidence(page, '5_macro_region_selected.png');

    // Click Clear button
    const clearBtn = page.getByText('Clear', { exact: true });
    await expect(clearBtn).toBeVisible();
    await clearBtn.click();
    await page.waitForTimeout(1000);

    // Verify URL no longer contains scope=
    expect(page.url()).not.toContain('scope=');
    await expect(northBtn).toHaveAttribute('aria-pressed', 'false');
    await saveEvidence(page, '6_macro_region_cleared.png');
  });
});
