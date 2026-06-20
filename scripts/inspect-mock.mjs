import { chromium } from 'playwright';
import path from 'path';
const EV = '/Users/gouthamrao/projects/udupi-property-explorer-school-results-polish/docs/audit/evidence/school-results-polish';
const url = 'http://127.0.0.1:5188/ui_kits/school-discovery/index.html?journey=school-first&groupId=university-belt&areaId=manipal&schoolId=s-manipal&radiusKm=5';
const b = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
p.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
await p.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
await p.waitForTimeout(2500);
// The navy summary band: find the div whose background resolves to navy and contains an h2.
const data = await p.evaluate(() => {
  const h2 = Array.from(document.querySelectorAll('h2')).find((h) => /Manipal Academy/i.test(h.textContent));
  if (!h2) return { error: 'no h2', bodyText: document.body.innerText.slice(0, 400) };
  let band = h2;
  while (band && getComputedStyle(band).backgroundColor === 'rgba(0, 0, 0, 0)') band = band.parentElement;
  const cs = (el) => el ? getComputedStyle(el) : null;
  const eyebrow = Array.from(band.querySelectorAll('span')).find((s) => /selected school/i.test(s.textContent));
  const badge = Array.from(band.querySelectorAll('span')).find((s) => /university|state|cbse|icse/i.test(s.textContent) && s.textContent.length < 20);
  const iconBox = band.querySelector('div > svg')?.closest('div');
  return {
    bandBg: cs(band).backgroundColor,
    bandRadius: cs(band).borderRadius,
    h2: { color: cs(h2).color, fontFamily: cs(h2).fontFamily, fontSize: cs(h2).fontSize, fontWeight: cs(h2).fontWeight },
    eyebrow: eyebrow ? { text: eyebrow.textContent, color: cs(eyebrow).color, fontSize: cs(eyebrow).fontSize } : null,
    badge: badge ? { text: badge.textContent, color: cs(badge).color, bg: cs(badge).backgroundColor, border: cs(badge).border, radius: cs(badge).borderRadius, padding: cs(badge).padding } : null,
    iconBox: iconBox ? { bg: cs(iconBox).backgroundColor, w: cs(iconBox).width, h: cs(iconBox).height, radius: cs(iconBox).borderRadius } : null,
  };
});
console.log(JSON.stringify(data, null, 2));
// Screenshot the band region
const h2box = await p.evaluate(() => {
  const h2 = Array.from(document.querySelectorAll('h2')).find((h) => /Manipal Academy/i.test(h.textContent));
  let band = h2; while (band && getComputedStyle(band).backgroundColor === 'rgba(0, 0, 0, 0)') band = band.parentElement;
  const r = band.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height };
});
if (h2box) await p.screenshot({ path: path.join(EV, 'mock-summary-band.png'), clip: h2box });
await b.close();
