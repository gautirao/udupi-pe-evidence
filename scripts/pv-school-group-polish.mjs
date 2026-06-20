// Visual-verify the school-first University Belt GROUP page (areas-in-zone) polish.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const URL = 'http://localhost:5176/discover?city=udupi&journey=school-first&groupId=university-belt&lat=13.35296&lon=74.78814&zoom=13';
const OUT = '/Users/gouthamrao/projects/udupi-property-explorer-school-area-polish/docs/audit/evidence/school-area-polish';
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 2200 }, deviceScaleFactor: 2 });
await p.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
await p.waitForSelector('[data-testid="school-group-areas-list"]', { timeout: 30000 });
await p.waitForTimeout(2500);
await p.screenshot({ path: `${OUT}/02-group-page.png`, fullPage: true });
const probe = await p.evaluate(() => {
  const how = document.querySelector('[data-testid="school-how-it-works"]');
  const zone = document.querySelector('[data-testid="school-zone-summary"]');
  // Order: how-it-works should appear BEFORE the zone summary in document order.
  const howBeforeZone = how && zone ? !!(how.compareDocumentPosition(zone) & Node.DOCUMENT_POSITION_FOLLOWING) : null;
  const zoneName = zone?.querySelector('h3');
  const ff = (el) => el ? getComputedStyle(el).fontFamily : null;
  return {
    howBeforeZone,
    zoneNameText: zoneName?.textContent?.trim() ?? null,
    zoneNameFont: ff(zoneName),
    areaRows: document.querySelectorAll('[data-testid^="school-group-area-row-"]').length,
    panelTitleFont: ff(document.querySelector('h2')),
    bodyFont: ff(document.body),
  };
});
console.log(JSON.stringify(probe, null, 2));
await b.close();
