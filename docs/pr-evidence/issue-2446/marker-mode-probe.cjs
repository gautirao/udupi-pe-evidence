// #2446 rendering-mode probe: count LEGACY vs CANONICAL marker DOM at the Udupi city root
// against whatever stack is live on PLAYWRIGHT_BASE_URL. No mocks. Read-only.
const { chromium } = require('/Users/gouthamrao/projects/udupi-property-explorer-worktrees/issue-2446-udupi-canonical-smoke/node_modules/@playwright/test');
const base = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5251';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const resolveStatuses = [];
  page.on('response', (r) => { if (r.url().includes('/navigation/resolve')) resolveStatuses.push(`${r.status()} ${r.url()}`); });
  await page.goto(`${base}/discover?city=udupi`);
  await page.waitForSelector('.leaflet-control-zoom-in', { timeout: 20000 });
  const banner = page.getByTestId('discover-consent-banner');
  if (await banner.isVisible({ timeout: 3000 }).catch(() => false)) {
    await banner.getByRole('button', { name: /decline/i }).click();
  }
  await page.waitForTimeout(6000);
  const counts = await page.evaluate(() => ({
    legacy_area_marker: document.querySelectorAll('.leaflet-marker-icon.area-marker').length,
    canonical_area_destination_marker: document.querySelectorAll('[data-testid="area-destination-marker"]').length,
    canonical_area_single_marker: document.querySelectorAll('[data-testid="area-single-marker"]').length,
    canonical_area_visual_cluster_marker: document.querySelectorAll('[data-testid="area-visual-cluster-marker"]').length,
  }));
  console.log(JSON.stringify({ profile: process.env.PROBE_LABEL || 'unlabelled', base, url_after_load: page.url(), counts, navigation_resolve_responses: resolveStatuses }, null, 2));
  await browser.close();
})().catch((e) => { console.error('PROBE_ERROR', e); process.exit(1); });
