import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = path.resolve(__dirname, '../docs/audit/evidence/issue-2616');

function validateLocalhostUrl(urlStr: string) {
  const url = new URL(urlStr);
  const allowed = ['localhost', '127.0.0.1'];
  if (!allowed.includes(url.hostname)) {
    throw new Error(`Hostname validation failed: ${urlStr} is not localhost / 127.0.0.1`);
  }
}

test('Capture Issue #2616 Visual Evidence from Local Stack with Strict Invariant Verification', async ({ page, baseURL }) => {
  const targetBase = baseURL || 'http://localhost:5194';
  validateLocalhostUrl(targetBase);

  // Clean output directory for fresh capture
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

  // 1. Residential — full desktop AFTER (1672x941)
  await page.setViewportSize({ width: 1672, height: 941 });
  const resUrl = `${targetBase}/discover?city=bangalore&node=a%3AIN%7CKA%7CBengaluru%7CRR%20Nagar&journey=area-first&rscope=areas&rareas=IN%7CKA%7CBengaluru%7CRR%20Nagar&lat=12.94995&lon=77.52490&zoom=14`;
  validateLocalhostUrl(resUrl);
  await page.goto(resUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // Assert PropertySignal visible text check & Search Results heading
  await expect(page.locator('body')).toContainText(/PropertySignal/i);
  await expect(page.locator('body')).toContainText(/Hebbal|Properties|Schools/i);

  // Capture Screenshot 1: Residential Search Results
  const path1 = path.join(EVIDENCE_DIR, '1_residential_search_results_after.png');
  await page.screenshot({ path: path1, fullPage: false });

  // 2. Commercial — full desktop AFTER (1672x941)
  const commBtn = page.locator('[data-testid="quick-chip-family-commercial"]').or(page.getByRole('button', { name: 'Commercial' })).first();
  await expect(commBtn).toBeVisible({ timeout: 10000 });
  await commBtn.click();
  await page.waitForTimeout(2000);

  // Assert Commercial mode active and filter bar / listings visible
  await expect(page.locator('body')).toContainText(/Commercial|Shop|Office|Warehouse|Building|Land/i);

  // Capture Screenshot 2: Commercial Search Results
  const path2 = path.join(EVIDENCE_DIR, '2_commercial_search_results_after.png');
  await page.screenshot({ path: path2, fullPage: false });

  // Switch back to Residential mode
  const resBtn = page.locator('[data-testid="quick-chip-family-residential"]').or(page.getByRole('button', { name: 'Residential' })).first();
  await expect(resBtn).toBeVisible({ timeout: 10000 });
  await resBtn.click();
  await page.waitForTimeout(2000);

  // 3. Add nearby areas — BEFORE ADD
  // Click "Add nearby areas" trigger tile
  const addTile = page.locator('[data-testid="area-set-add-nearby-tile"]').or(page.locator('[data-testid="area-set-add-trigger"]')).first();
  await expect(addTile).toBeVisible({ timeout: 10000 });
  await addTile.click();
  await page.waitForTimeout(2000);

  // Verify candidate panel opened and suggestions exist
  const firstCandidateRow = page.locator('[data-testid^="area-set-draft-panel-suggestion-"]').first();
  await expect(firstCandidateRow).toBeVisible({ timeout: 10000 });

  // Extract candidate information (Name, N listings, M schools) dynamically
  const candidateText = await firstCandidateRow.innerText();
  console.log('Raw Candidate Row Text:', candidateText);

  const candidateAreaName = candidateText.split('\n')[0].trim();
  console.log('Candidate Area Name:', candidateAreaName);

  // Extract N listings and M schools using regex
  const listingMatch = candidateText.match(/(\d+)\s+listings?/i);
  const schoolMatch = candidateText.match(/(\d+)\s+schools?/i);

  if (!listingMatch || !schoolMatch) {
    throw new Error(`Failed to parse candidate listing/school counts from text: "${candidateText}"`);
  }

  const beforeListingCount = parseInt(listingMatch[1], 10);
  const beforeSchoolCount = parseInt(schoolMatch[1], 10);

  console.log(`EXTRACTED CANDIDATE STATS -> Area: ${candidateAreaName}, Listings: ${beforeListingCount}, Schools: ${beforeSchoolCount}`);

  // Capture Screenshot 3: Add nearby areas BEFORE ADD
  const path3 = path.join(EVIDENCE_DIR, '3_add_nearby_areas_before_add.png');
  await page.screenshot({ path: path3, fullPage: false });

  // 4. Add nearby areas — AFTER ADD (Strict non-optional click & member card assertion)
  const addButton = page.locator('[data-testid^="area-set-draft-panel-suggestion-"][data-testid$="-add"]').first();
  await expect(addButton).toBeVisible({ timeout: 10000 });
  await addButton.click();
  await page.waitForTimeout(2500);

  // Assert placed map draft member marker for candidateAreaName is visible
  const memberMarker = page.locator('[data-testid="area-set-draft-member-marker"]').filter({ hasText: candidateAreaName }).first();
  await expect(memberMarker).toBeVisible({ timeout: 10000 });

  const markerText = await memberMarker.innerText();
  console.log('Placed Map Member Card Text:', markerText);

  // Extract counts from map card text
  const afterListingMatch = markerText.match(/(\d+)\s+LISTINGS?/i);
  const afterSchoolMatch = markerText.match(/(\d+)\s+schools?/i);

  if (!afterListingMatch || !afterSchoolMatch) {
    throw new Error(`Failed to parse member marker listing/school counts from text: "${markerText}"`);
  }

  const afterListingCount = parseInt(afterListingMatch[1], 10);
  const afterSchoolCount = parseInt(afterSchoolMatch[1], 10);

  console.log(`VERIFYING MAP CARD STATS -> Listings: ${afterListingCount}, Schools: ${afterSchoolCount}`);

  // STRICT INVARIANT ASSERTION
  expect(afterListingCount).toBe(beforeListingCount);
  expect(afterSchoolCount).toBe(beforeSchoolCount);

  // Capture Screenshot 4: Add nearby areas AFTER ADD
  const path4 = path.join(EVIDENCE_DIR, '4_add_nearby_areas_after_add.png');
  await page.screenshot({ path: path4, fullPage: false });

  // 5. Area disclosure removal verification screenshot
  const pageText = await page.innerText('body');
  expect(pageText).not.toContain('Compares built-up area for homes; plot size for plots');
  const path5 = path.join(EVIDENCE_DIR, '5_area_disclosure_removed.png');
  await page.screenshot({ path: path5, fullPage: false });

  // 6. Responsive mobile state (390x844)
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(resUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const path6 = path.join(EVIDENCE_DIR, '6_responsive_mobile_after.png');
  await page.screenshot({ path: path6, fullPage: false });

  console.log('All 6 screenshots captured & verified successfully under:', EVIDENCE_DIR);
});
