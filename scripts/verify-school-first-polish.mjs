/**
 * Visual verification — school-first discovery polish
 * (feat/school-discovery-design-polish)
 *
 * Renders the REAL redesigned school-first panels in a real browser via the Vite
 * dev server. Only the two anonymous discover endpoints are stubbed (area-groups
 * + areas) with realistic Udupi-shaped data so the panels render without the full
 * backend stack (Docker/Postgres/OpenSearch unavailable here). Backend wiring is
 * unchanged and covered by unit tests; this checks the UI only.
 *
 * Counts mirror the Claude Design reference for University Belt:
 *   4 areas · 19 schools · 7 homes for sale.
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs/audit/evidence/school-first-polish');
fs.mkdirSync(OUT, { recursive: true });

const PORT = process.env.PORT || '5174';
const BASE = `http://127.0.0.1:${PORT}`;
const COMMON = `city=udupi&lat=13.34090&lon=74.74210&zoom=11&journey=school-first`;
const BROWSE_URL = `${BASE}/discover?${COMMON}`;
const ZONE_URL = `${BASE}/discover?${COMMON}&groupId=university-belt`;

// areaKey -> [name, lat, lon, schoolCount, listingCount]
const AREAS = {
  'IN|KA|Udupi|Manipal': ['Manipal', 13.3525, 74.7853, 12, 5],
  'IN|KA|Udupi|Katapadi': ['Katapadi', 13.3833, 74.7536, 3, 0],
  'IN|KA|Udupi|Udyavara': ['Udyavara', 13.3072, 74.7461, 2, 1],
  'IN|KA|Udupi|Parkala': ['Parkala', 13.3650, 74.7689, 2, 1],
};

const GROUPS = [
  {
    slug: 'university-belt',
    name: 'University Belt',
    subtitle: 'Academic and student housing',
    regionLabel: 'Central Udupi',
    displayOrder: 1,
    areaKeys: Object.keys(AREAS),
  },
];

const areasResponse = {
  city: 'udupi',
  areas: Object.entries(AREAS).map(([areaKey, [name, lat, lon, schoolCount, listingCount]]) => ({
    areaKey,
    name,
    geoCenterLat: lat,
    geoCenterLon: lon,
    listingCount,
    schoolCount,
  })),
};

const log = (m) => console.log(`[verify] ${m}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1700 } });

await page.route('**/api/discover/area-groups**', (r) =>
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ city: 'udupi', groups: GROUPS }) }),
);
await page.route('**/api/discover/areas**', (r) =>
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(areasResponse) }),
);
// Any other backend call: empty-but-valid superset payload so the MapDiscovery
// shell mounts without crashing (we only exercise the school-first panels here).
await page.route('**/api/**', (r) => {
  const u = r.request().url();
  if (u.includes('/discover/area-groups') || /\/discover\/areas(\?|$)/.test(u)) return r.fallback();
  return r.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      city: 'udupi', groups: [], defaultAreas: [], areas: [], markers: [],
      schools: [], options: [], content: [], localities: [],
      page: { size: 0, number: 0, totalElements: 0, totalPages: 0 },
    }),
  });
});

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

// ── State 2: zone selected → areas inside University Belt (the screenshot) ──────
log(`navigating ${ZONE_URL}`);
await page.goto(ZONE_URL, { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForSelector('[data-testid="school-group-areas-list"]', { timeout: 20000 });
await page.waitForSelector('[data-testid="school-zone-summary"]', { timeout: 5000 });
await page.waitForSelector('[data-testid="school-how-it-works"]', { timeout: 5000 });

const summaryText = await page.locator('[data-testid="school-zone-summary"]').innerText();
const areaCards = await page.locator('[data-testid^="school-group-area-row-"]').count();
log(`area cards rendered: ${areaCards}`);
log(`zone summary text:\n${summaryText}`);

await page.screenshot({ path: path.join(OUT, 'school-first-zone-full.png'), fullPage: true });
const panel = page.locator('[data-testid="school-group-areas-list"]');
if (await panel.count()) {
  await panel.first().screenshot({ path: path.join(OUT, 'school-first-zone-panel.png') });
}

// Hover an area card to capture the interactive/hover treatment.
const firstCard = page.locator('[data-testid^="school-group-area-row-"]').first();
await firstCard.hover();
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(OUT, 'school-first-zone-hover.png'), fullPage: true });

// ── State 1: landing / browse (the literal verify URL, no groupId) ──────────────
log(`navigating ${BROWSE_URL}`);
await page.goto(BROWSE_URL, { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForSelector('[data-testid="school-zones-list"]', { timeout: 20000 });
await page.screenshot({ path: path.join(OUT, 'school-first-browse-full.png'), fullPage: true });

log(`console errors: ${errors.length}`);
errors.slice(0, 10).forEach((e) => log(`  ERR: ${e}`));

await browser.close();
log(`screenshots written to ${OUT}`);
