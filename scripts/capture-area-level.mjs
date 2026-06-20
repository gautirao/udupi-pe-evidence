import { chromium } from 'playwright';
import path from 'path';
const EV = '/Users/gouthamrao/projects/udupi-property-explorer-school-results-polish/docs/audit/evidence/school-results-polish';
const FE = 'http://127.0.0.1:5175';
// Area level: areaKey set, NO schoolId -> schools-in-area panel.
const url = `${FE}/discover?city=udupi&journey=school-first&groupId=university-belt&lat=13.3515&lon=74.7868&zoom=13&areaKey=${encodeURIComponent('IN|KA|Udupi|Manipal')}`;
const b = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
p.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 160)));
await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
await p.waitForTimeout(3500);
const info = await p.evaluate(() => {
  const bc = document.querySelector('[data-testid="school-journey-breadcrumb"]');
  const segs = bc ? Array.from(bc.querySelectorAll('[data-testid^="breadcrumb-seg-"]')).map((e) => e.getAttribute('data-testid') + '=' + e.textContent) : null;
  const rp = document.querySelector('[data-testid="discover-right-panel"]');
  const header = document.querySelector('[data-testid="panel-header-back-button"]')?.closest('div');
  const cs = (el) => el ? getComputedStyle(el).backgroundColor : null;
  return {
    breadcrumbSegs: segs,
    panelBg: cs(rp),
    headerBg: header ? cs(header) : null,
  };
});
console.log(JSON.stringify(info, null, 2));
await p.screenshot({ path: path.join(EV, 'area-level-current.png') });
await b.close();
