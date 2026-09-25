// Issue #2708 evidence capture. Usage: node capture-2708.mjs <before|after> <baseUrl> <outDir>
import { chromium } from '/Users/gouthamrao/projects/udupi-property-explorer-worktrees/lane-2708/node_modules/playwright/index.mjs';

const [build, base, outDir] = process.argv.slice(2);
const START = '/discover?city=udupi&type=residential_plot&priceMin=1000000&priceMax=5000000';
const SUPERSET = {
  city: 'udupi', groups: [], defaultAreas: [], areas: [], markers: [], schools: [], options: [],
  content: [], localities: [], page: { number: 0, size: 20, totalElements: 0, totalPages: 0 },
  hasMore: false, total: 0, count: 0,
};
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile390: { width: 390, height: 844 } };
const CANON = ['city', 'intent', 'type', 'priceMin', 'priceMax', 'journey', 'beds', 'seller'];
const results = {};

const canon = (search) => {
  const p = new URLSearchParams(search);
  return Object.fromEntries(CANON.filter((k) => p.has(k)).map((k) => [k, p.get(k)]));
};

async function newPage(browser, vp) {
  const ctx = await browser.newContext({ viewport: VIEWPORTS[vp], deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.route('**/api/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SUPERSET) }),
  );
  // Capture overlay: prints the LIVE window.location.search so the canonical filter state is
  // visible in the frame. Clearly labelled; it reads state, it does not set any.
  await page.addInitScript(() => {
    const paint = () => {
      let el = document.getElementById('__ev2708');
      if (!el && document.body) {
        el = document.createElement('div');
        el.id = '__ev2708';
        el.style.cssText =
          'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;background:#111;color:#0f0;' +
          'font:12px/1.35 monospace;padding:4px 6px;pointer-events:none;word-break:break-all;opacity:.92';
        document.body.appendChild(el);
      }
      if (el) el.textContent = '[capture overlay: live URL] ' + decodeURIComponent(location.search);
    };
    setInterval(paint, 100);
  });
  return { ctx, page };
}

async function shot(page, name) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${outDir}/${build}-${name}.jpg`, type: 'jpeg', quality: 80 });
}

async function listArm(browser, vp) {
  const { ctx, page } = await newPage(browser, vp);
  await page.goto(base + START, { waitUntil: 'networkidle' });
  const bar = page.locator('[data-testid="control-bar-intent-selector"]');
  await bar.waitFor();
  const inner = await page.evaluate(() => ({ w: innerWidth, h: innerHeight, m820: matchMedia('(max-width: 820px)').matches }));
  const startSearch = await page.evaluate(() => location.search);
  await shot(page, `${vp}-01-list-buy-plot-and-budget`);
  const rent = bar.locator('[data-testid="intent-selector-rent"]');
  await rent.click();
  await page.waitForFunction(() => new URLSearchParams(location.search).get('intent') === 'rent');
  if ((await rent.getAttribute('aria-pressed')) !== 'true') throw new Error('Rent not pressed after click');
  const afterSearch = await page.evaluate(() => location.search);
  await shot(page, `${vp}-02-list-after-rent-click`);
  let mapSummaryAfterList = null;
  if (vp === 'mobile390') {
    await page.locator('[data-testid="control-bar-map-trigger"]').click();
    await page.locator('[data-testid="map-filters-pill"]').waitFor();
    mapSummaryAfterList = await page.locator('[data-testid="map-results-heading"]').innerText().catch(() => null);
    await shot(page, `${vp}-03-map-view-after-list-rent`);
  }
  results[`${vp}:list`] = { viewport: inner, startSearch, afterSearch, canonAfter: canon(afterSearch), mapSummaryAfterList };
  await ctx.close();
}

async function mapArm(browser, vp) {
  const { ctx, page } = await newPage(browser, vp);
  await page.goto(base + START, { waitUntil: 'networkidle' });
  await page.locator('[data-testid="control-bar-map-trigger"]').click();
  const pill = page.locator('[data-testid="map-filters-pill"]');
  await pill.waitFor();
  await shot(page, `${vp}-04-map-view-buy-plot-and-budget`);
  await pill.click();
  await page.locator('[data-testid="map-filter-sheet"]').waitFor();
  const rent = page.locator('[data-testid="map-filter-sheet-intent-rent"]');
  await rent.click();
  const pressed = await rent.getAttribute('aria-pressed');
  const checked = await rent.getAttribute('aria-checked');
  if (pressed !== 'true' && checked !== 'true') throw new Error(`Map Rent not selected: pressed=${pressed} checked=${checked}`);
  const beforeApply = await page.evaluate(() => location.search);
  await page.locator('[data-testid="map-filter-sheet-apply"]').click();
  await page.locator('[data-testid="map-filter-sheet"]').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
  // Wait for the URL to change at all (the Apply click landed), not for a particular outcome.
  await page.waitForFunction((s) => location.search !== s, beforeApply, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(800);
  const afterSearch = await page.evaluate(() => location.search);
  if (afterSearch === beforeApply) throw new Error('Map Apply did not change the URL at all');
  const summary = await page.locator('[data-testid="map-results-heading"]').innerText().catch(() => null);
  results[`${vp}:map:summary`] = summary;
  await shot(page, `${vp}-05-map-after-apply-rent`);
  results[`${vp}:map`] = { afterSearch, canonAfter: canon(afterSearch) };
  await ctx.close();
}

const browser = await chromium.launch();
try {
  await listArm(browser, 'desktop');
  await listArm(browser, 'mobile390');
  await mapArm(browser, 'mobile390');
} finally {
  await browser.close();
}
const l = results['mobile390:list'].canonAfter;
const m = results['mobile390:map'].canonAfter;
results.parity_list_vs_map_mobile390 = JSON.stringify(l) === JSON.stringify(m);
console.log(JSON.stringify({ build, base, results }, null, 2));
