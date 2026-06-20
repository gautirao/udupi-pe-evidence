/**
 * Visual verification — selected school-first discovery results page
 * (feat/school-results-design-polish)
 *
 * Backend stack (Postgres/PostGIS/Spring Boot) is unavailable in this env, so all
 * /api/** calls are stubbed in-browser per the area-first-visual-verify recipe.
 * This proves the FE layout/styling: continuous scroll container, copper school
 * name, and the navy distance badge.
 *
 *   FE: http://127.0.0.1:5175 (Vite dev, --strictPort)
 *   Anonymous (no auth) → school-radius-listings is the listing source.
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const EVIDENCE_DIR = path.join(ROOT, 'docs/audit/evidence/school-results-polish');
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

const FE = 'http://127.0.0.1:5175';
const SCHOOL_ID = '11111111-2222-3333-4444-555555555555';
const AREA_KEY = 'IN|KA|Udupi|Manipal';
const LAT = 13.35346;
const LON = 74.79106;

const SCHOOL = {
  id: SCHOOL_ID,
  name: 'Manipal Institute of Technology',
  board: 'University',
  boardType: 'University',
  address: 'Eshwar Nagar, Manipal',
  latitude: LAT,
  longitude: LON,
  areaKey: AREA_KEY,
  distanceKm: 0,
};

// Listings at increasing offsets so haversine distances span ~0.3–4.8 km.
const OFFSETS = [
  { d: 'a', dlat: 0.0027, dlon: 0.0, price: 26500000, bhk: 4, type: 'villa', title: '4 BHK villa, End Point Road', loc: 'Manipal' },
  { d: 'b', dlat: 0.0030, dlon: 0.0010, price: 13500000, bhk: 3, type: 'apartment', title: '3 BHK near Manipal University', loc: 'Manipal' },
  { d: 'c', dlat: -0.0036, dlon: 0.0, price: 8900000, bhk: 2, type: 'apartment', title: '2 BHK garden flat, Eshwar Nagar', loc: 'Manipal' },
  { d: 'e', dlat: 0.0050, dlon: 0.0040, price: 5200000, bhk: 1, type: 'apartment', title: '1 BHK studio, Tiger Circle', loc: 'Manipal' },
  { d: 'f', dlat: 0.0108, dlon: 0.0, price: 4800000, bhk: 1, type: 'apartment', title: 'Studio + loft, Manipal centre', loc: 'Manipal' },
  { d: 'g', dlat: 0.0350, dlon: 0.0, price: 11200000, bhk: 3, type: 'villa', title: '3 BHK villa, Parkala township', loc: 'Parkala' },
  { d: 'h', dlat: -0.0395, dlon: 0.0, price: 8800000, bhk: 3, type: 'apartment', title: '3 BHK in Kunjibettu', loc: 'Udupi' },
  { d: 'i', dlat: 0.0, dlon: 0.0440, price: 7800000, bhk: 2, type: 'apartment', title: '2 BHK in Brahmagiri', loc: 'Udupi' },
];

const RADIUS_CARDS = OFFSETS.map((o, i) => ({
  id: `listing-${o.d}`,
  propertyType: o.type,
  title: o.title,
  locality: o.loc,
  areaKey: AREA_KEY,
  pricePaise: o.price * 100,
  builtArea: 1100 + i * 90,
  builtAreaUnit: 'sqft',
  bedrooms: o.bhk,
  latitude: LAT + o.dlat,
  longitude: LON + o.dlon,
  heroImageUrl: `https://picsum.photos/seed/mit${i}/600/400`,
  listingPurpose: 'sale',
  possessionStatus: 'ready',
  createdAt: '2026-06-01T00:00:00Z',
}));

const RADIUS_PAGE = { content: RADIUS_CARDS, page: 0, size: 50, hasMore: false };

// Generic superset for any unmatched /api/** so the MapDiscovery shell never crashes.
const SUPERSET = {
  city: 'udupi', groups: [], defaultAreas: [], areas: [], markers: [],
  schools: [], options: [], content: [], localities: [],
  page: { number: 0, size: 50, totalElements: 0, totalPages: 0, hasMore: false },
};

function json(body) { return { status: 200, contentType: 'application/json', body: JSON.stringify(body) }; }

async function run() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 300)); });
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));

  await page.route('**/api/**', (route) => {
    const url = route.request().url();
    if (/\/api\/public\/schools\/[^/?]+(\?|$)/.test(url) && url.includes(SCHOOL_ID)) {
      console.log('[route] SCHOOL <-', url.replace(/^https?:\/\/[^/]+/, ''));
      return route.fulfill(json(SCHOOL));
    }
    if (url.includes('/school-radius-listings')) {
      console.log('[route] RADIUS_PAGE <-', url.replace(/^https?:\/\/[^/]+/, ''));
      return route.fulfill(json(RADIUS_PAGE));
    }
    if (/\/schools\/(by-area|popular|search|near)/.test(url)) {
      // These hooks expect a BARE SchoolResult[] array. Return the selected school
      // (with valid coords) so the map's SchoolMarkerLayer never builds an Invalid
      // LatLng from a coordless focus marker.
      return route.fulfill(json([SCHOOL]));
    }
    console.log('[route] SUPERSET <-', url.replace(/^https?:\/\/[^/]+/, ''));
    return route.fulfill(json(SUPERSET));
  });

  const target =
    `${FE}/discover?city=udupi&journey=school-first&groupId=university-belt` +
    `&lat=${LAT}&lon=${LON}&zoom=13&areaKey=${encodeURIComponent(AREA_KEY)}` +
    `&schoolId=${SCHOOL_ID}&radiusKm=3`;

  console.log('Navigating:', target);
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 });

  try {
    await page.waitForSelector('[data-testid="school-selected-scroll"]', { timeout: 15000 });
  } catch {
    await page.waitForTimeout(1500);
    const testids = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid]')).map((e) => e.getAttribute('data-testid')).slice(0, 40));
    const rightPanel = await page.locator('[data-testid="discover-right-panel"]').count();
    console.log('[diag] discover-right-panel count:', rightPanel);
    console.log('[diag] testids present:', JSON.stringify(testids));
    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'diag-state.png') });
    await browser.close();
    return { error: 'scroll-container-not-found', testids };
  }
  await page.waitForTimeout(2500);

  const scroll = page.locator('[data-testid="school-selected-scroll"]');
  const summaryName = page.locator('[data-testid="school-summary-name"]');
  const badges = page.locator('[data-testid="distance-badge"]');

  const nameText = await summaryName.textContent().catch(() => '(none)');
  const nameColor = await summaryName.evaluate((el) => getComputedStyle(el).color).catch(() => '(n/a)');
  const badgeCount = await badges.count();
  const firstBadgeText = badgeCount ? await badges.first().textContent() : '(none)';
  const badgeBg = badgeCount
    ? await badges.first().locator('span').first().evaluate((el) => getComputedStyle(el).backgroundColor).catch(() => '(n/a)')
    : '(n/a)';

  // Top-of-panel shot first (summary band + copper name + radius chips visible).
  await scroll.evaluate((el) => { el.scrollTop = 0; });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(EVIDENCE_DIR, 'school-results-top.png') });

  // Continuous-scroll proof: scrollHeight > clientHeight and we can scroll to bottom.
  const scrollMetrics = await scroll.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    return { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, scrollTop: el.scrollTop };
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(EVIDENCE_DIR, 'school-results-scrolled.png') });

  await browser.close();

  const result = {
    nameText: nameText?.trim(),
    nameColor,
    badgeCount,
    firstBadgeText: firstBadgeText?.trim(),
    badgeBg,
    scrollMetrics,
    scrollable: scrollMetrics.scrollHeight > scrollMetrics.clientHeight,
    scrolledToBottom: scrollMetrics.scrollTop > 0,
  };
  console.log('\n=== RESULT ===');
  console.log(JSON.stringify(result, null, 2));
  return result;
}

run().catch((e) => { console.error('FAILED:', e); process.exit(1); });
