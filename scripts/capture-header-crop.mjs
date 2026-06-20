import { chromium } from 'playwright';
import path from 'path';
const EV = '/Users/gouthamrao/projects/udupi-property-explorer-school-results-polish/docs/audit/evidence/school-results-polish';
const FE = 'http://127.0.0.1:5175';
const url = `${FE}/discover?city=udupi&journey=school-first&groupId=university-belt&lat=13.3515&lon=74.7868&zoom=13&areaKey=${encodeURIComponent('IN|KA|Udupi|Manipal')}`;
const b = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
await p.waitForSelector('[data-testid="panel-header-back-button"]', { timeout: 25000 });
await p.waitForTimeout(1500);
const box = await p.evaluate(() => {
  const back = document.querySelector('[data-testid="panel-header-back-button"]');
  const header = back.closest('div').parentElement; // sticky header container
  const r = header.getBoundingClientRect();
  return { x: r.x - 4, y: r.y - 4, width: r.width + 8, height: r.height + 8 };
});
await p.screenshot({ path: path.join(EV, 'area-header-crop.png'), clip: box });
const styles = await p.evaluate(() => {
  const h1 = document.querySelector('[data-testid="discover-right-panel"] h1');
  const back = document.querySelector('[data-testid="panel-header-back-button"]');
  const pill = h1?.parentElement?.querySelector('span');
  const cs = (el) => el ? getComputedStyle(el) : null;
  return {
    title: h1 ? { text: h1.textContent, font: cs(h1).fontFamily, size: cs(h1).fontSize } : null,
    backText: back?.textContent?.trim(),
    pill: pill ? { text: pill.textContent.trim(), color: cs(pill).color, bg: cs(pill).backgroundColor } : null,
  };
});
console.log(JSON.stringify(styles, null, 2));
await b.close();
