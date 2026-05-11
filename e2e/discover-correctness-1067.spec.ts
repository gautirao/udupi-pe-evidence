/**
 * E2E for Issue #1067 — school-first Discover correctness.
 *
 *  AC1: school-first deep link with Padubidri areaKey renders SchoolsInAreaPanel
 *       (not the silent GuidedEntryPanel fall-back).
 *  AC2: known Padubidri school name is visible in the panel.
 *  AC3: in-session right-panel area-card click triggers both URL update AND
 *       map flyTo (viewport centers on the area's geo_center).
 *
 * Run: bash scripts/run-e2e-local.sh --project=full e2e/discover-correctness-1067.spec.ts
 */
import { test, expect } from '@playwright/test';

const AREA_MARKER = '.leaflet-marker-icon.area-marker';
const PADUBIDRI_AREA_KEY = 'IN|KA|Udupi|Padubidri';
const PADUBIDRI_CENTER = { lat: 13.1843, lon: 74.7841 };

const KNOWN_PADUBIDRI_SCHOOLS = [
  'Kinara Global School',
  'Mahalakshmi English Medium School. Uchila',
  'School Play Ground',
];

test.describe('Issue #1067 — School-first Discover correctness', () => {
  test('Spec 1 (AC1+AC2) — Padubidri school-first deep link renders SchoolsInAreaPanel with school names', async ({ page }) => {
    // No stubs — useSchoolsByArea now goes through api.get (absolute URL) so the
    // local backend's anonymous endpoint serves the Padubidri schools natively.
    const padubidriSchoolFirstUrl =
      `/discover?city=udupi&journey=school-first` +
      `&areaKey=${encodeURIComponent(PADUBIDRI_AREA_KEY)}`;
    await page.goto(padubidriSchoolFirstUrl);
    await page.waitForLoadState('domcontentloaded');

    // AC1: SchoolsInAreaPanel header visible.
    await expect(
      page.getByRole('heading', { name: /Schools in Padubidri/i, level: 2 }),
    ).toBeVisible({ timeout: 15_000 });

    // AC2: at least one of the three known Padubidri school names is visible.
    const knownSchoolPattern = new RegExp(
      KNOWN_PADUBIDRI_SCHOOLS.map((s) => s.replace(/[.|]/g, '\\$&')).join('|'),
      'i',
    );
    await expect(page.getByText(knownSchoolPattern).first()).toBeVisible({ timeout: 15_000 });

    // Regression: GuidedEntryPanel signature must NOT render.
    await expect(page.getByText('Find properties your way')).not.toBeVisible();
  });

  test('Spec 2 (AC3) — right-panel area card click updates URL AND pans map', async ({ page }) => {
    await page.goto('/discover?city=udupi&journey=school-first');
    await page.waitForLoadState('domcontentloaded');

    // Wait for area markers — confirms useDiscoverAreas hydrated.
    await expect(page.locator(AREA_MARKER).first()).toBeVisible({ timeout: 10_000 });

    // Find the Padubidri area card in the right panel. SchoolBrowsePanel renders
    // each area as a <button data-testid="area-card"> with the area name as the
    // first label. Filter the testid set to the one containing "Padubidri" to
    // avoid the leaflet area marker (which also has role=button).
    const padubidriCard = page
      .locator('[data-testid="area-card"]')
      .filter({ hasText: /Padubidri/i })
      .first();
    await expect(padubidriCard).toBeVisible({ timeout: 10_000 });
    await padubidriCard.click();

    // AC3 — URL gains areaKey=Padubidri.
    await expect(page).toHaveURL(
      new RegExp(`areaKey=${encodeURIComponent(PADUBIDRI_AREA_KEY).replace(/\|/g, '\\|')}`),
      { timeout: 5_000 },
    );

    // AC3 — viewport center within 0.01° of Padubidri geo_center.
    // The URL viewport controller writes lat/lon/zoom to the URL after the
    // flyTo finishes. Wait for both lat= and lon= to appear with values close
    // to Padubidri's geo_center.
    await expect.poll(
      () => {
        const u = new URL(page.url());
        const lat = parseFloat(u.searchParams.get('lat') ?? 'NaN');
        const lon = parseFloat(u.searchParams.get('lon') ?? 'NaN');
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        return Math.max(
          Math.abs(lat - PADUBIDRI_CENTER.lat),
          Math.abs(lon - PADUBIDRI_CENTER.lon),
        );
      },
      { timeout: 15_000, intervals: [200, 400, 800, 1500] },
    ).toBeLessThan(0.01);
  });
});
