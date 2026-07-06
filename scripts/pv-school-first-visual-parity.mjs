// Capture school-first visual-parity evidence screenshots (Udupi + Bangalore
// + area-first/agri-first regression states) against FE :5173 → BE :8085.
// Click-through flow exercises panel/map lockstep rather than deep links.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:5173';
const OUT =
  '/Users/gouthamrao/projects/udupi-property-explorer-worktrees/school-first-visual-parity-polish/docs/audit/evidence/discover-school-first-visual-parity';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1600, height: 1200 },
  deviceScaleFactor: 2,
});
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text().slice(0, 200));
});

const settle = async (ms = 2500) => {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(ms);
};

const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}`, fullPage: true });
  console.log('SHOT', name);
};

// Click the first element matching any of the given locators.
const clickFirst = async (locators, label) => {
  for (const loc of locators) {
    const el = loc.first();
    if ((await el.count()) > 0) {
      await el.scrollIntoViewIfNeeded().catch(() => {});
      await el.click();
      console.log('CLICKED', label);
      return true;
    }
  }
  console.log('CLICK_MISS', label);
  return false;
};

async function schoolFirstFlow(city, prefix, idx, zoneName, areaName, schoolName) {
  await page.goto(`${BASE}/discover?city=${city}&journey=school-first`, {
    waitUntil: 'networkidle',
    timeout: 60000,
  });
  await settle();
  await shot(`${idx[0]}_${prefix}_school_first_landing.png`);

  // Zone: prefer the named zone card's CTA, fall back to the first zone card CTA.
  await clickFirst(
    [
      page
        .locator(`[data-testid="zone-card"]`, { hasText: zoneName })
        .getByText(/Explore zone/i),
      page.getByText(zoneName, { exact: false }),
      page.getByText(/Explore zone/i),
    ],
    `zone:${zoneName}`
  );
  await settle();
  await shot(`${idx[1]}_${prefix}_school_zone_selected.png`);

  await clickFirst(
    [
      page
        .locator(`[data-testid="area-card"]`, { hasText: areaName })
        .getByText(/View schools/i),
      page.getByText(areaName, { exact: true }),
      page.getByText(/View schools/i),
    ],
    `area:${areaName}`
  );
  await settle();
  await shot(`${idx[2]}_${prefix}_school_area_selected.png`);

  await clickFirst(
    [
      page
        .locator(`[data-testid="school-card"]`, { hasText: schoolName })
        .getByText(/View homes/i),
      page.getByText(/View homes/i),
    ],
    `school:${schoolName}`
  );
  await settle(3500);
  await shot(`${idx[3]}_${prefix}_school_selected_radius.png`);
  console.log('URL_AFTER_' + prefix.toUpperCase(), page.url());
}

// 1-4: Udupi
await schoolFirstFlow(
  'udupi',
  'udupi',
  ['1', '2', '3', '4'],
  'University Belt',
  'Manipal',
  'Aloysius'
);

// 5-8: Bangalore
await schoolFirstFlow(
  'bangalore',
  'bangalore',
  ['5', '6', '7', '8'],
  'Hebbal',
  'Hebbal',
  'School'
);

// 9: area-first regression
await page.goto(`${BASE}/discover?city=udupi&journey=area-first`, {
  waitUntil: 'networkidle',
  timeout: 60000,
});
await settle();
await shot('9_area_first_regression_after_school_polish.png');

// 10: agri-first regression
await page.goto(`${BASE}/discover?city=udupi&journey=agri-first`, {
  waitUntil: 'networkidle',
  timeout: 60000,
});
await settle();
await shot('10_agri_first_regression_after_school_polish.png');

console.log('CONSOLE_ERRORS', JSON.stringify(errors.slice(0, 15), null, 2));
await browser.close();
