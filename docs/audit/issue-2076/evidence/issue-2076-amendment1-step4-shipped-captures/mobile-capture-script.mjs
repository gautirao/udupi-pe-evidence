// Issue #2076 Amendment-1 Step 4 — AC14 mobile (390x844) shipped-side captures.
// READ-ONLY: navigations + screenshots only, against hosted Bangalore.
// Not a Stage-4 baseline; ad-hoc evidence-capture script, scoped to the audit evidence dir
// per approved-plan-amendment-1.toml [files].additional_globs_required (evidence/**).
import { chromium } from 'playwright';
import path from 'node:path';

const outDir = path.dirname(new URL(import.meta.url).pathname);

const targets = [
  {
    name: 'A01-mobile-city-default',
    url: 'https://udupi-property-explorer.pages.dev/discover?city=bangalore&journey=area-first',
  },
  {
    name: 'A08-A21-A23-mobile-area-listings',
    url: 'https://udupi-property-explorer.pages.dev/discover?city=bangalore&journey=area-first&node=a%3AIN%7CKA%7CBengaluru%7CKambipura',
  },
];

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();

for (const t of targets) {
  await page.goto(t.url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const vw = await page.evaluate(() => window.innerWidth);
  const vh = await page.evaluate(() => window.innerHeight);
  await page.screenshot({ path: path.join(outDir, `${t.name}.png`), fullPage: false });
  console.log(JSON.stringify({ name: t.name, url: page.url(), innerWidth: vw, innerHeight: vh }));
}

await browser.close();
