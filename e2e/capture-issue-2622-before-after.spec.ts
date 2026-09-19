import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = path.resolve(__dirname, '../docs/pr-evidence/issue-2622');

function validateLocalhostUrl(urlStr: string) {
  const url = new URL(urlStr);
  const allowed = ['localhost', '127.0.0.1'];
  if (!allowed.includes(url.hostname)) {
    throw new Error(`Hostname validation failed: ${urlStr} is not localhost / 127.0.0.1`);
  }
}

test('Capture Issue #2622 BEFORE and AFTER Comparative Visual Evidence', async ({ page, baseURL }) => {
  const targetBase = baseURL || 'http://localhost:5173';
  validateLocalhostUrl(targetBase);

  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const discoverUrl = `${targetBase}/discover?city=bangalore&node=a%3AIN%7CKA%7CBengaluru%7CRR%20Nagar&journey=area-first&rscope=areas&rareas=IN%7CKA%7CBengaluru%7CRR%20Nagar&lat=12.94995&lon=77.52490&zoom=14`;
  validateLocalhostUrl(discoverUrl);

  // -------------------------------------------------------------
  // BEFORE STATE CAPTURE (Simulating pre-#2622 mixed inventory)
  // Intercept backend listings call to strip propertyType filter
  // -------------------------------------------------------------
  await page.route('**/api/v1/discover/listings*', async (route) => {
    const reqUrl = new URL(route.request().url());
    reqUrl.searchParams.delete('propertyType');
    reqUrl.searchParams.delete('family');
    const response = await route.fetch({ url: reqUrl.toString() });
    await route.fulfill({ response });
  });

  // 1. BEFORE Desktop View (1672x941) — Default Search
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto(discoverUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  const before1 = path.join(EVIDENCE_DIR, '01_before_residential_family_default.png');
  await page.screenshot({ path: before1, fullPage: false });

  // 2. BEFORE Commercial Switch
  const commBtnBefore = page.locator('[data-testid="quick-chip-family-commercial"]').or(page.getByRole('button', { name: 'Commercial' })).first();
  if (await commBtnBefore.isVisible()) {
    await commBtnBefore.click();
    await page.waitForTimeout(2000);
  }
  const before2 = path.join(EVIDENCE_DIR, '02_before_commercial_family_switch.png');
  await page.screenshot({ path: before2, fullPage: false });

  // 3. BEFORE Switch Back
  const resBtnBefore = page.locator('[data-testid="quick-chip-family-residential"]').or(page.getByRole('button', { name: 'Residential' })).first();
  if (await resBtnBefore.isVisible()) {
    await resBtnBefore.click();
    await page.waitForTimeout(2000);
  }
  const before3 = path.join(EVIDENCE_DIR, '03_before_residential_switch_back.png');
  await page.screenshot({ path: before3, fullPage: false });

  // 4. BEFORE Mobile View (390x844)
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(discoverUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const before4 = path.join(EVIDENCE_DIR, '04_before_responsive_mobile.png');
  await page.screenshot({ path: before4, fullPage: false });

  // -------------------------------------------------------------
  // AFTER STATE CAPTURE (Current HEAD with #2622 fix)
  // Unroute route intercept so real defaulted query logic runs
  // -------------------------------------------------------------
  await page.unroute('**/api/v1/discover/listings*');

  // 1. AFTER Desktop View (1672x941) — Default Search
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto(discoverUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  const after1 = path.join(EVIDENCE_DIR, '01_after_residential_family_default.png');
  await page.screenshot({ path: after1, fullPage: false });

  // 2. AFTER Commercial Switch
  const commBtnAfter = page.locator('[data-testid="quick-chip-family-commercial"]').or(page.getByRole('button', { name: 'Commercial' })).first();
  await expect(commBtnAfter).toBeVisible({ timeout: 10000 });
  await commBtnAfter.click();
  await page.waitForTimeout(2000);

  const after2 = path.join(EVIDENCE_DIR, '02_after_commercial_family_switch.png');
  await page.screenshot({ path: after2, fullPage: false });

  // 3. AFTER Switch Back to Residential
  const resBtnAfter = page.locator('[data-testid="quick-chip-family-residential"]').or(page.getByRole('button', { name: 'Residential' })).first();
  await expect(resBtnAfter).toBeVisible({ timeout: 10000 });
  await resBtnAfter.click();
  await page.waitForTimeout(2000);

  const after3 = path.join(EVIDENCE_DIR, '03_after_residential_switch_back.png');
  await page.screenshot({ path: after3, fullPage: false });

  // 4. AFTER Mobile View (390x844)
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(discoverUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const after4 = path.join(EVIDENCE_DIR, '04_after_responsive_mobile.png');
  await page.screenshot({ path: after4, fullPage: false });

  console.log('Comparative BEFORE and AFTER visual evidence capture complete in:', EVIDENCE_DIR);
});
