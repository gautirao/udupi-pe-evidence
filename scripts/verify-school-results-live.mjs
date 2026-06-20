/**
 * LIVE verification — selected school-first results page against the real backend.
 *   FE: http://127.0.0.1:5175 (Vite, VITE_API_BASE_URL=http://localhost:8086)
 *   BE: http://localhost:8086 (Spring Boot -> remote Supabase), CORS allows :5175
 * No route stubbing — all /api calls hit the live backend. Anonymous session.
 */
import { chromium } from 'playwright';
import path from 'path';

const EVIDENCE_DIR = '/Users/gouthamrao/projects/udupi-property-explorer-school-results-polish/docs/audit/evidence/school-results-polish';
const FE = 'http://127.0.0.1:5175';
const SCHOOL_ID = '11111111-2222-3333-4444-555555555555';
const AREA_KEY = 'IN|KA|Udupi|Manipal';

const target =
  `${FE}/discover?city=udupi&journey=school-first&groupId=university-belt` +
  `&lat=13.35346&lon=74.79106&zoom=13&areaKey=${encodeURIComponent(AREA_KEY)}` +
  `&schoolId=${SCHOOL_ID}&radiusKm=3`;

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();
const corsErrors = [];
page.on('console', (m) => { if (m.type() === 'error' && /CORS|Access-Control/i.test(m.text())) corsErrors.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));

console.log('Navigating LIVE:', target);
await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 });

let ok = true;
try {
  await page.waitForSelector('[data-testid="combined-selected-scroll"]', { timeout: 25000 });
} catch {
  ok = false;
  const testids = await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid]')).map((e) => e.getAttribute('data-testid')).slice(0, 30));
  console.log('[diag] testids:', JSON.stringify(testids));
}
await page.waitForTimeout(3000);

const scroll = page.locator('[data-testid="combined-selected-scroll"]');
const name = page.locator('[data-testid="school-summary-name"]');
const badges = page.locator('[data-testid="distance-badge"]');

const result = {
  ok,
  nameText: await name.textContent().catch(() => '(none)'),
  nameColor: await name.evaluate((el) => getComputedStyle(el).color).catch(() => '(n/a)'),
  count: await page.locator('[data-testid="school-summary-count"]').textContent().catch(() => '(n/a)'),
  badgeCount: await badges.count(),
  firstBadge: (await badges.count()) ? (await badges.first().textContent())?.trim() : '(none)',
  badgeBg: (await badges.count()) ? await badges.first().locator('span').first().evaluate((el) => getComputedStyle(el).backgroundColor).catch(() => '(n/a)') : '(n/a)',
};

await scroll.evaluate((el) => { el.scrollTop = 0; }).catch(() => {});
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(EVIDENCE_DIR, 'live-top.png') });
const metrics = await scroll.evaluate((el) => { el.scrollTop = el.scrollHeight; return { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, scrollTop: el.scrollTop }; }).catch(() => null);
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(EVIDENCE_DIR, 'live-scrolled.png') });
await page.screenshot({ path: path.join(EVIDENCE_DIR, 'live-full.png'), fullPage: true });

result.scrollMetrics = metrics;
result.scrollable = metrics ? metrics.scrollHeight > metrics.clientHeight : null;
result.corsErrors = corsErrors;
await browser.close();
console.log('\n=== LIVE RESULT ===');
console.log(JSON.stringify(result, null, 2));
