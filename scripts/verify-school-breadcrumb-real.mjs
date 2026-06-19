/**
 * Breadcrumb verification against the REAL backend (localhost:8085), using the
 * user's exact URLs. No API stubbing — confirms the progressive breadcrumb with
 * real Udupi group/area data.
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'docs/audit/evidence/school-first-polish');
fs.mkdirSync(OUT, { recursive: true });

const URLS = [
  ['zone', 'http://127.0.0.1:5174/discover?city=udupi&lat=13.33901&lon=74.69650&zoom=12&journey=school-first&groupId=university-belt', 'breadcrumb-zone-real.png'],
  ['area', 'http://127.0.0.1:5174/discover?city=udupi&lat=13.35500&lon=74.80000&zoom=14&journey=school-first&groupId=university-belt&areaKey=IN%7CKA%7CUdupi%7CManipal', 'breadcrumb-area-real.png'],
  ['school', 'http://127.0.0.1:5174/discover?city=udupi&lat=13.35501&lon=74.80003&zoom=14&journey=school-first&groupId=university-belt&areaKey=IN%7CKA%7CUdupi%7CManipal&schoolId=sch-1', 'breadcrumb-school-real.png'],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const log = (m) => console.log(`[bc] ${m}`);

for (const [label, url, shot] of URLS) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(2000);
  const bc = page.locator('[data-testid="school-journey-breadcrumb"]');
  const ai = page.locator('[data-testid="area-indicator-overlay"]');
  const bcN = await bc.count();
  const aiN = await ai.count();
  const bcTxt = bcN ? (await bc.first().innerText()).replace(/\n+/g, ' ') : '(none)';
  const aiTxt = aiN ? (await ai.first().innerText()).replace(/\n+/g, ' ') : '(none)';
  log(`${label}: breadcrumb=${bcN ? 'YES' : 'NO'} "${bcTxt}" | areaIndicator=${aiN ? 'YES' : 'NO'} "${aiTxt}"`);
  await page.locator('.absolute.top-4.left-4').first().screenshot({ path: path.join(OUT, shot) }).catch(() => {});
}

await browser.close();
