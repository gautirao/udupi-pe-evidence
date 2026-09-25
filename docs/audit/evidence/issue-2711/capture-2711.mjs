// Issue #2711 evidence capture. Adapted from docs/audit/evidence/issue-2708/capture-2708.mjs
// (same pattern: mocked /api/** so no live backend/fixture stack is needed, a live-URL overlay
// baked into the page, and screenshots + a JSON canonical-state report per arm).
// Usage: node capture-2711.mjs <before|after> <baseUrl> <outDir>
import { chromium } from '/Users/gouthamrao/projects/udupi-property-explorer/node_modules/playwright/index.mjs';

const [build, base, outDir] = process.argv.slice(2);
const START = '/discover?city=bangalore&type=apartment';
const SUPERSET = {
  city: 'bangalore', groups: [], defaultAreas: [], areas: [], markers: [], schools: [], options: [],
  content: [], localities: [], page: { number: 0, size: 20, totalElements: 0, totalPages: 0 },
  hasMore: false, total: 0, count: 0,
};
const VIEWPORT = { width: 390, height: 844 };
const CANON = ['city', 'intent', 'type', 'priceMin', 'priceMax', 'journey', 'beds', 'seller'];
const results = {};

const canon = (search) => {
  const p = new URLSearchParams(search);
  return Object.fromEntries(CANON.filter((k) => p.has(k)).map((k) => [k, p.get(k)]));
};

async function newPage(browser) {
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.route('**/api/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SUPERSET) }),
  );
  // Capture overlay: prints the LIVE window.location.search so the canonical filter state is
  // visible in the frame. Clearly labelled; it reads state, it does not set any (same technique
  // as issue-2708's capture script).
  await page.addInitScript(() => {
    const paint = () => {
      let el = document.getElementById('__ev2711');
      if (!el && document.body) {
        el = document.createElement('div');
        el.id = '__ev2711';
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
  await page.screenshot({ path: `${outDir}/${build}-${name}.jpg`, type: 'jpeg', quality: 85 });
}

async function enterMapAndOpenSheet(page) {
  await page.goto(base + START, { waitUntil: 'networkidle' });
  await page.locator('[data-testid="control-bar-map-trigger"]').click();
  const pill = page.locator('[data-testid="map-filters-pill"]');
  await pill.waitFor();
  await pill.click();
  await page.locator('[data-testid="map-filter-sheet"]').waitFor();
}

// AC1 scenario: Rent + a budget band staged together, then Apply.
async function scenarioRentBudget(browser) {
  const { ctx, page } = await newPage(browser);
  await enterMapAndOpenSheet(page);
  await shot(page, '01-rentbudget-sheet-open');

  await page.locator('[data-testid="map-filter-sheet-intent-rent"]').click();
  await page.locator('[data-testid="quick-chip-budget-15000"]').click();
  await shot(page, '02-rentbudget-staged');

  const beforeApply = await page.evaluate(() => location.search);
  await page.locator('[data-testid="map-filter-sheet-apply"]').click();
  await page
    .locator('[data-testid="map-filter-sheet"]')
    .waitFor({ state: 'detached', timeout: 5000 })
    .catch(() => {});
  await page.waitForFunction((s) => location.search !== s, beforeApply, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(800);
  const afterSearch = await page.evaluate(() => location.search);
  await shot(page, '03-rentbudget-after-apply');

  results.rentBudget = { beforeApply, afterSearch, canonAfter: canon(afterSearch) };
  await ctx.close();
}

// AC5 scenario: Rent + an UNRELATED staged field (bedrooms) together, then Apply — the exact
// combination the code-review-caught regression was about (bedrooms silently dropped when
// combined with an intent switch in one Apply).
async function scenarioRentPlusBedrooms(browser) {
  const { ctx, page } = await newPage(browser);
  await enterMapAndOpenSheet(page);

  await page.locator('[data-testid="quick-chip-2-bhk"]').click();
  await page.locator('[data-testid="map-filter-sheet-intent-rent"]').click();
  await shot(page, '04-rentbeds-staged');

  const beforeApply = await page.evaluate(() => location.search);
  await page.locator('[data-testid="map-filter-sheet-apply"]').click();
  await page
    .locator('[data-testid="map-filter-sheet"]')
    .waitFor({ state: 'detached', timeout: 5000 })
    .catch(() => {});
  await page.waitForFunction((s) => location.search !== s, beforeApply, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(800);
  const afterSearch = await page.evaluate(() => location.search);
  await shot(page, '05-rentbeds-after-apply');

  results.rentPlusBedrooms = { beforeApply, afterSearch, canonAfter: canon(afterSearch) };
  await ctx.close();
}

const browser = await chromium.launch();
try {
  await scenarioRentBudget(browser);
  await scenarioRentPlusBedrooms(browser);
} finally {
  await browser.close();
}
console.log(JSON.stringify({ build, base, results }, null, 2));
