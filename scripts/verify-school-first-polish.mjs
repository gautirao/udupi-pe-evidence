/**
 * Visual verification — school-first discovery polish
 * (feat/school-discovery-design-polish)
 *
 * Renders the REAL redesigned school-first panels + the new dark zone/group
 * label map layer in a real browser via the Vite dev server. Only the two
 * anonymous discover endpoints are stubbed (area-groups + areas) with realistic
 * Udupi-shaped data so the UI renders without the full backend stack. Backend
 * wiring is unchanged and covered by unit tests; this checks the UI only.
 *
 * Zone-label positions exercise BOTH truthful paths:
 *   - groups WITH focusLat/focusLon (durable backend-authored anchor)
 *   - groups WITHOUT focus → centroid derived from member-area coordinates
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
  'IN|KA|Udupi|Malpe': ['Malpe', 13.3496, 74.7036, 4, 3],
  'IN|KA|Udupi|Kaup': ['Kaup', 13.2222, 74.7461, 3, 2],
  'IN|KA|Udupi|Brahmavar': ['Brahmavar', 13.4267, 74.7461, 3, 2],
  'IN|KA|Udupi|Hebri': ['Hebri', 13.4711, 75.0492, 2, 1],
};

const GROUPS = [
  // WITH focus point (durable backend anchor)
  {
    slug: 'university-belt', name: 'University Belt', subtitle: 'Academic and student housing',
    regionLabel: 'Central Udupi', displayOrder: 1,
    areaKeys: ['IN|KA|Udupi|Manipal', 'IN|KA|Udupi|Katapadi', 'IN|KA|Udupi|Udyavara', 'IN|KA|Udupi|Parkala'],
    focusLat: 13.3525, focusLon: 74.7853,
  },
  // WITHOUT focus → centroid derived from member-area coordinates
  {
    slug: 'coastal-strip', name: 'Coastal Strip', subtitle: 'Beachside and fishing villages',
    regionLabel: 'West Udupi', displayOrder: 2,
    areaKeys: ['IN|KA|Udupi|Malpe', 'IN|KA|Udupi|Kaup'],
  },
  {
    slug: 'north-udupi', name: 'North Udupi', subtitle: 'Rapidly developing northern belt',
    regionLabel: 'North Udupi', displayOrder: 3,
    areaKeys: ['IN|KA|Udupi|Brahmavar', 'IN|KA|Udupi|Hebri'],
  },
];

const areasResponse = {
  city: 'udupi',
  areas: Object.entries(AREAS).map(([areaKey, [name, lat, lon, schoolCount, listingCount]]) => ({
    areaKey, name, geoCenterLat: lat, geoCenterLon: lon, listingCount, schoolCount,
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
await page.route('**/api/**', (r) => {
  const u = r.request().url();
  if (u.includes('/discover/area-groups') || /\/discover\/areas(\?|$)/.test(u)) return r.fallback();
  return r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      city: 'udupi', groups: [], defaultAreas: [], areas: [], markers: [],
      schools: [], options: [], content: [], localities: [],
      page: { size: 0, number: 0, totalElements: 0, totalPages: 0 },
    }),
  });
});

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

// ── State 1: landing / browse — dark zone labels on the map (the new layer) ─────
log(`navigating ${BROWSE_URL}`);
await page.goto(BROWSE_URL, { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForSelector('[data-testid="school-zones-list"]', { timeout: 20000 });
await page.waitForSelector('[data-testid="school-zone-label"]', { timeout: 10000 });
const zoneLabelCount = await page.locator('[data-testid="school-zone-label"]').count();
const zoneLabelText = await page.locator('[data-testid="school-zone-label"]').allInnerTexts();
log(`zone labels on map: ${zoneLabelCount}`);
log(`zone label text: ${JSON.stringify(zoneLabelText)}`);
await page.screenshot({ path: path.join(OUT, 'school-first-browse-zonelabels.png'), fullPage: true });
// Map crop (left half) to show the dark pills clearly.
await page.screenshot({
  path: path.join(OUT, 'school-first-browse-map.png'),
  clip: { x: 0, y: 60, width: 720, height: 1100 },
});

// ── State 2: zone selected → areas inside University Belt (panel, unchanged) ────
log(`navigating ${ZONE_URL}`);
await page.goto(ZONE_URL, { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForSelector('[data-testid="school-group-areas-list"]', { timeout: 20000 });
await page.waitForSelector('[data-testid="school-zone-summary"]', { timeout: 5000 });
// Zone labels must NOT render once a group is selected (drill-down state).
const zoneLabelsInDrill = await page.locator('[data-testid="school-zone-label"]').count();
log(`zone labels in group-selected state (expect 0): ${zoneLabelsInDrill}`);
await page.screenshot({ path: path.join(OUT, 'school-first-zone-full.png'), fullPage: true });
const panel = page.locator('[data-testid="school-group-areas-list"]');
if (await panel.count()) {
  await panel.first().screenshot({ path: path.join(OUT, 'school-first-zone-panel.png') });
}

log(`console errors: ${errors.length}`);
errors.slice(0, 10).forEach((e) => log(`  ERR: ${e}`));

await browser.close();
log(`screenshots written to ${OUT}`);
