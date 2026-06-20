// Visual-verify the school-first selected-area / choose-school page polish.
// Real browser (Playwright/Chromium) against FE :5176 → BE :8087 (real data).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL =
  'http://localhost:5176/discover?city=udupi&journey=school-first&groupId=university-belt&lat=13.35296&lon=74.78814&zoom=13&areaKey=IN%7CKA%7CUdupi%7CManipal';
const OUT = '/Users/gouthamrao/projects/udupi-property-explorer-school-area-polish/docs/audit/evidence/school-area-polish';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 2200 }, deviceScaleFactor: 2 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));

await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });

let summaryOk = false;
try {
  await page.waitForSelector('[data-testid="selected-area-summary"]', { timeout: 30000 });
  summaryOk = true;
} catch { /* report below */ }

// Give the homes grid + markers a moment to settle.
await page.waitForTimeout(2500);

await page.screenshot({ path: `${OUT}/01-full-page.png`, fullPage: true });

// Targeted captures of the right panel for design review.
const probe = await page.evaluate(() => {
  const txt = (sel) => document.querySelector(sel)?.textContent?.trim() ?? null;
  const summary = document.querySelector('[data-testid="selected-area-summary"]');
  return {
    hasSummary: !!summary,
    summaryText: summary?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 400) ?? null,
    chooseSchoolCopy: !!Array.from(document.querySelectorAll('p')).find((p) =>
      /Choose a school in .* to filter homes within reach of it\./.test(p.textContent || '')),
    searchInput: !!document.querySelector('[data-testid="school-search-input"]'),
    searchRadiusFull: (() => {
      const el = document.querySelector('[data-testid="school-search-input"]');
      if (!el) return null;
      return getComputedStyle(el).borderRadius;
    })(),
    schoolCards: document.querySelectorAll('[data-testid="school-card"]').length,
    listingCards: document.querySelectorAll('[data-testid="listing-card"]').length,
    saveButtons: document.querySelectorAll('[data-testid="listing-save-button"]').length,
    saveAriaLabels: Array.from(document.querySelectorAll('[data-testid="listing-save-button"]')).map((b) => b.getAttribute('aria-label')),
    trustBadgeText: Array.from(document.querySelectorAll('[data-testid="listing-card"] img'))
      .map((img) => img.closest('[data-testid="listing-card"]'))
      .map((c) => c?.textContent?.match(/Verified|Trusted|Listed/)?.[0] ?? null),
  };
});

console.log('SUMMARY_OK', summaryOk);
console.log(JSON.stringify(probe, null, 2));
console.log('CONSOLE_ERRORS', JSON.stringify(errors.slice(0, 10), null, 2));

await browser.close();
