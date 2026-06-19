/**
 * Visual verification — area-first discovery landing polish
 * (feat/area-discovery-design-polish)
 *
 * Renders the REAL redesigned AreaGroupsLandingPanel in a real browser via the
 * Vite dev server. Only the two anonymous discover endpoints are stubbed
 * (area-groups + areas) with realistic Udupi-shaped data so the panel renders
 * without the full backend stack (Docker/Postgres/OpenSearch unavailable here).
 * Backend wiring is unchanged and covered by unit tests; this checks the UI.
 *
 * Data mirrors the Claude Design reference: 5 groups / 10 areas / 30 for sale.
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs/audit/evidence/area-first-polish');
fs.mkdirSync(OUT, { recursive: true });

const PORT = process.env.PORT || '5191';
const BASE = `http://127.0.0.1:${PORT}`;
const URL = `${BASE}/discover?city=udupi&lat=13.34090&lon=74.74210&zoom=11&journey=area-first`;

// areaKey -> [name, lat, lon, listingCount]
const AREAS = {
  'IN|KA|Udupi|Manipal': ['Manipal', 13.3525, 74.7853, 5],
  'IN|KA|Udupi|Eshwar Nagar': ['Eshwar Nagar', 13.3611, 74.7869, 3],
  'IN|KA|Udupi|Malpe': ['Malpe', 13.3496, 74.7036, 5],
  'IN|KA|Udupi|Kaup': ['Kaup', 13.2222, 74.7461, 4],
  'IN|KA|Udupi|Car Street': ['Car Street', 13.3409, 74.7421, 3],
  'IN|KA|Udupi|Kunjibettu': ['Kunjibettu', 13.3536, 74.7569, 2],
  'IN|KA|Udupi|Maruthi Veethika': ['Maruthi Veethika', 13.3389, 74.7489, 2],
  'IN|KA|Udupi|Brahmavar': ['Brahmavar', 13.4267, 74.7461, 2],
  'IN|KA|Udupi|Padubidri': ['Padubidri', 13.1389, 74.7669, 2],
  'IN|KA|Udupi|Shirva': ['Shirva', 13.2169, 74.8086, 2],
};

const GROUPS = [
  { slug: 'university-belt', name: 'University Belt', subtitle: 'Academic and student housing', regionLabel: 'Central Udupi', displayOrder: 1, areaKeys: ['IN|KA|Udupi|Manipal', 'IN|KA|Udupi|Eshwar Nagar'] },
  { slug: 'coastal-strip', name: 'Coastal Strip', subtitle: 'Beachside and fishing villages', regionLabel: 'West Udupi', displayOrder: 2, areaKeys: ['IN|KA|Udupi|Malpe', 'IN|KA|Udupi|Kaup'] },
  { slug: 'city-centre', name: 'City Centre', subtitle: 'Core urban and temple precinct', regionLabel: 'Central Udupi', displayOrder: 3, areaKeys: ['IN|KA|Udupi|Car Street', 'IN|KA|Udupi|Kunjibettu', 'IN|KA|Udupi|Maruthi Veethika'] },
  { slug: 'north-udupi', name: 'North Udupi', subtitle: 'Rapidly developing northern belt', regionLabel: 'North Udupi', displayOrder: 4, areaKeys: ['IN|KA|Udupi|Brahmavar'] },
  { slug: 'south-udupi', name: 'South Udupi', subtitle: 'Quiet residential southern belt', regionLabel: 'South Udupi', displayOrder: 5, areaKeys: ['IN|KA|Udupi|Padubidri', 'IN|KA|Udupi|Shirva'] },
];

const areasResponse = {
  city: 'udupi',
  areas: Object.entries(AREAS).map(([areaKey, [name, lat, lon, listingCount]]) => ({
    areaKey,
    name,
    geoCenterLat: lat,
    geoCenterLon: lon,
    listingCount,
    schoolCount: 0,
  })),
};

const log = (m) => console.log(`[verify] ${m}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } });

// Stub the two anonymous discover endpoints with realistic data.
await page.route('**/api/discover/area-groups**', (r) =>
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ city: 'udupi', groups: GROUPS }) }),
);
await page.route('**/api/discover/areas**', (r) =>
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(areasResponse) }),
);
// Any other backend call: return an empty-but-valid superset payload so the
// surrounding MapDiscovery shell mounts without crashing (we only exercise the
// area-first landing panel here).
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

log(`navigating ${URL}`);
await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 });

await page.waitForSelector('[data-testid="area-groups-list"]', { timeout: 20000 });
await page.waitForSelector('[data-testid="area-groups-intro"]', { timeout: 5000 });

// Assertions on rendered content (truthful, from stubbed-but-realistic data).
const introText = await page.locator('[data-testid="area-groups-intro"]').innerText();
const cardCount = await page.locator('[data-testid^="area-group-card-"]').count();
const exploreCount = await page.locator('text=Explore group').count();
log(`group cards rendered: ${cardCount}`);
log(`intro card text:\n${introText}`);
log(`"Explore group" affordances: ${exploreCount}`);

await page.screenshot({ path: path.join(OUT, 'area-first-landing-full.png'), fullPage: true });
// Right panel only
const panel = page.locator('[aria-label="Area groups"]');
if (await panel.count()) {
  await panel.first().screenshot({ path: path.join(OUT, 'area-first-panel.png') });
}

// Hover a card to capture the interactive/hover treatment.
const firstCard = page.locator('[data-testid^="area-group-card-"]').first();
await firstCard.hover();
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(OUT, 'area-first-card-hover.png'), fullPage: true });

log(`console errors: ${errors.length}`);
errors.slice(0, 10).forEach((e) => log(`  ERR: ${e}`));

await browser.close();
log(`screenshots written to ${OUT}`);
