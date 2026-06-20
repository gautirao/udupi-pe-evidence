import { chromium } from 'playwright';
import path from 'path';
const EV = '/Users/gouthamrao/projects/udupi-property-explorer-school-results-polish/docs/audit/evidence/school-results-polish';
const FE = 'http://127.0.0.1:5175';
const url = `${FE}/discover?city=udupi&journey=school-first&groupId=university-belt&lat=13.35150&lon=74.78681&zoom=14&areaKey=${encodeURIComponent('IN|KA|Udupi|Manipal')}&schoolId=6c34c282-9f79-41de-a6a9-7f4cf73fc1af&radiusKm=3`;
const b = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
await p.waitForSelector('[data-testid="school-summary-band"]', { timeout: 25000 });
await p.waitForTimeout(1500);
const band = p.locator('[data-testid="school-summary-band"]');
const styles = await band.evaluate((el) => {
  const cs = (n) => n ? getComputedStyle(n) : null;
  const pick = (n, props) => { const s = cs(n); return s ? Object.fromEntries(props.map(k => [k, s[k]])) : null; };
  const q = (sel) => el.querySelector(sel);
  return {
    band: pick(el, ['backgroundColor', 'borderRadius', 'padding', 'boxShadow']),
    changeSchool: pick(el.querySelector('[data-testid="change-school-btn"]'), ['color', 'fontSize']),
    breadcrumb: pick(el.querySelector('nav ol li'), ['color', 'fontSize']),
    eyebrow: (() => { const sp = Array.from(el.querySelectorAll('span')).find(s => /selected school/i.test(s.textContent)); return sp ? { color: getComputedStyle(sp).color, fontSize: getComputedStyle(sp).fontSize, text: sp.textContent } : null; })(),
    badge: (() => { const sp = Array.from(el.querySelectorAll('span')).find(s => s.className.includes('rounded-full')); return sp ? { color: getComputedStyle(sp).color, backgroundColor: getComputedStyle(sp).backgroundColor, borderColor: getComputedStyle(sp).borderColor, text: sp.textContent } : null; })(),
    name: pick(el.querySelector('[data-testid="school-summary-name"]'), ['color', 'fontSize', 'fontWeight', 'backgroundColor']),
    count: pick(el.querySelector('[data-testid="school-summary-count"]'), ['color', 'fontSize']),
  };
});
await band.screenshot({ path: path.join(EV, 'live-summary-band.png') });
await b.close();
console.log(JSON.stringify(styles, null, 2));
