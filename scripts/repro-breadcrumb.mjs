import { chromium } from 'playwright';
const FE = 'http://127.0.0.1:5175';
const AREA = encodeURIComponent('IN|KA|Udupi|Manipal');
const schoolUrl = `${FE}/discover?city=udupi&journey=school-first&groupId=university-belt&lat=13.3515&lon=74.7868&zoom=14&areaKey=${AREA}&schoolId=6c34c282-9f79-41de-a6a9-7f4cf73fc1af&radiusKm=3`;
const b = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
await p.goto(schoolUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
await p.waitForTimeout(3000);
const read = async (label) => {
  const segs = await p.evaluate(() => {
    const bc = document.querySelector('[data-testid="school-journey-breadcrumb"]');
    return bc ? Array.from(bc.querySelectorAll('[data-testid^="breadcrumb-seg-"]')).map((e) => e.textContent) : 'NO-BREADCRUMB';
  });
  console.log(label, JSON.stringify(segs), 'url=', new URL(p.url()).search.slice(0, 90));
};
await read('school-state:');
// Click the in-panel "Change school" / back affordance to return to area level.
const back = p.locator('[data-testid="change-school-btn"], [data-testid="panel-header-back-button"]').first();
if (await back.count()) { await back.click(); await p.waitForTimeout(2500); await read('after-back :'); }
else console.log('no back button found');
await b.close();
