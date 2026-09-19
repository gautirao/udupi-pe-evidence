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

test('Capture Issue #2622 Visual Evidence from Local Stack', async ({ page, baseURL }) => {
  const targetBase = baseURL || 'http://localhost:5173';
  validateLocalhostUrl(targetBase);

  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

  // 1. Residential Default — full desktop AFTER (1672x941)
  await page.setViewportSize({ width: 1672, height: 941 });
  const discoverUrl = `${targetBase}/discover?city=bangalore&node=a%3AIN%7CKA%7CBengaluru%7CRR%20Nagar&journey=area-first&rscope=areas&rareas=IN%7CKA%7CBengaluru%7CRR%20Nagar&lat=12.94995&lon=77.52490&zoom=14`;
  validateLocalhostUrl(discoverUrl);
  await page.goto(discoverUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // Assert Residential mode active and quick chips present
  const resBtn = page.locator('[data-testid="quick-chip-family-residential"]').or(page.getByRole('button', { name: 'Residential' })).first();
  await expect(resBtn).toBeVisible({ timeout: 10000 });

  // Capture Screenshot 1: Residential Default
  const path1 = path.join(EVIDENCE_DIR, '01_residential_family_default_after.png');
  await page.screenshot({ path: path1, fullPage: false });

  // 2. Switch to Commercial
  const commBtn = page.locator('[data-testid="quick-chip-family-commercial"]').or(page.getByRole('button', { name: 'Commercial' })).first();
  await expect(commBtn).toBeVisible({ timeout: 10000 });
  await commBtn.click();
  await page.waitForTimeout(2000);

  // Capture Screenshot 2: Commercial Switch
  const path2 = path.join(EVIDENCE_DIR, '02_commercial_family_switch_after.png');
  await page.screenshot({ path: path2, fullPage: false });

  // 3. Switch back to Residential
  await resBtn.click();
  await page.waitForTimeout(2000);

  // Capture Screenshot 3: Restored Residential
  const path3 = path.join(EVIDENCE_DIR, '03_residential_switch_back_after.png');
  await page.screenshot({ path: path3, fullPage: false });

  // 4. Responsive Mobile View (390x844)
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(discoverUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Capture Screenshot 4: Mobile View
  const path4 = path.join(EVIDENCE_DIR, '04_responsive_mobile_after.png');
  await page.screenshot({ path: path4, fullPage: false });

  console.log('Issue #2622 visual evidence captured in:', EVIDENCE_DIR);
});
