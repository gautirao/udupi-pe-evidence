import { test, expect, type Page } from '@playwright/test';

/**
 * #2770 — compact selected-school context block.
 *
 * Fixture: Udupi > Manipal, school "Aloysius PU College", 3 km. Canonical area-first route:
 * /discover?city=udupi -> area "Manipal" -> "Schools in Manipal" -> pick the school.
 *
 * Bounds are the issue's pixel budgets (first listing card top <= 420 on desktop, summary band
 * <= 107px, first card inside the 844px mobile viewport). Measured on main (the pre-fix layout)
 * the same route puts the first card at ~605px desktop and ~897px mobile, so these assertions
 * are discriminating, not vacuous.
 */

const SCHOOL = 'Aloysius PU College';
const FIRST_CARD_MAX_TOP = 420;
const BAND_MAX_HEIGHT = 107;

async function seedConsentDenied(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('discover_telemetry_consent', 'denied');
    } catch {
      /* storage unavailable: nothing to seed */
    }
  });
}

async function selectSchoolViaCanonicalRoute(page: Page): Promise<void> {
  await page.goto('/discover?city=udupi');
  const areaInput = page.getByTestId('control-bar-area-input');
  await expect(areaInput).toBeVisible({ timeout: 20_000 });
  await areaInput.fill('Manipal');
  await page.getByTestId('control-bar-area-option-IN|KA|Udupi|Manipal').click();
  await page.getByText('Schools in Manipal').first().click();
  const card = page.locator('[data-testid="school-card"]').filter({ hasText: SCHOOL }).first();
  await expect(card, 'school picker must list the fixture school').toBeVisible({ timeout: 20_000 });
  await card.click();
  await expect(page.getByTestId('school-summary-band')).toBeVisible({ timeout: 20_000 });
  // Pin the fixture radius (3 km) so the result set is deterministic.
  await page.getByTestId('combined-radius-btn-3').click();
  await expect(page.getByTestId('combined-radius-btn-3')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('listing-card').first()).toBeVisible({ timeout: 20_000 });
}

async function firstCardTop(page: Page): Promise<number> {
  // Let layout settle (images/fonts) before measuring: poll until two reads agree.
  const card = page.getByTestId('listing-card').first();
  await expect(card).toBeVisible();
  let prev = -1;
  await expect
    .poll(async () => {
      const box = await card.boundingBox();
      const y = box ? Math.round(box.y) : -2;
      const stable = y === prev;
      prev = y;
      return stable;
    }, { timeout: 10_000, intervals: [250] })
    .toBe(true);
  const box = await card.boundingBox();
  if (!box) throw new Error('first listing card has no bounding box');
  return box.y;
}

test.describe('#2770 compact selected-school context', () => {
  for (const vp of [
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    test(`first listing card surfaces within ${FIRST_CARD_MAX_TOP}px at ${vp.width}x${vp.height}`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: vp });
      const page = await ctx.newPage();
      try {
        await seedConsentDenied(page);
        await selectSchoolViaCanonicalRoute(page);
        const panel = page.getByTestId('areas-journey-panel-school-combined');
        await expect(panel, 'selected-state panel must be visible before measuring').toBeVisible();
        const y = await firstCardTop(page);
        expect(y, `first listing card top at ${vp.width}x${vp.height}`).toBeLessThanOrEqual(FIRST_CARD_MAX_TOP);

        if (vp.width === 1366) {
          const band = await page.getByTestId('school-summary-band').boundingBox();
          expect(band, 'school-summary-band must have a box').not.toBeNull();
          expect(band!.height, 'school-summary-band height').toBeLessThanOrEqual(BAND_MAX_HEIGHT);
        }
      } finally {
        await ctx.close();
      }
    });
  }

  test('no Filters button inside the selected school panel; Change school returns to the schools list', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    try {
      await seedConsentDenied(page);
      await selectSchoolViaCanonicalRoute(page);
      const panel = page.getByTestId('areas-journey-panel-school-combined');
      await expect(panel).toBeVisible();
      const change = page.getByTestId('change-school-btn');
      await expect(change).toBeVisible();

      // Full negative assertion (panel + control proven present above, so zero is not vacuous).
      await expect(panel.getByRole('button', { name: /filters/i })).toHaveCount(0);

      await change.click();
      // Measured behaviour (unchanged by #2770): on the canonical area-first route "Change school"
      // clears the school and returns to the AREA panel (the area is kept), where the
      // "Schools in <area>" row is the way back into the schools list.
      await expect(page.getByTestId('school-summary-band')).toHaveCount(0, { timeout: 15_000 });
      const schoolsRow = page.getByText('Schools in Manipal').first();
      await expect(schoolsRow).toBeVisible({ timeout: 15_000 });
      await schoolsRow.click();
      await expect(page.getByTestId('school-search-input')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId('board-chip-cbse')).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test('mobile 390x844: first listing card is inside the viewport in List view', async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    try {
      await seedConsentDenied(page);
      await page.goto('/discover?city=udupi');
      const areaInput = page.getByTestId('control-bar-area-input');
      await expect(areaInput).toBeVisible({ timeout: 20_000 });
      await areaInput.fill('Manipal');
      await page.getByTestId('control-bar-area-option-IN|KA|Udupi|Manipal').click();
      await page.getByText('Schools in Manipal').first().click();
      const card = page.locator('[data-testid="school-card"]').filter({ hasText: SCHOOL }).first();
      await expect(card).toBeVisible({ timeout: 20_000 });
      await card.click();
      await expect(page.getByTestId('school-summary-band')).toBeVisible({ timeout: 20_000 });
      await page.getByTestId('combined-radius-btn-3').click();
      await expect(page.getByTestId('combined-radius-btn-3')).toHaveAttribute('aria-pressed', 'true');

      // List view (mobile opens on the map by default).
      const listBtn = page.getByTestId('mobile-map-close-list-button');
      if (await listBtn.count()) {
        await listBtn.first().click();
      }
      await expect(page.getByTestId('listing-card').first()).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId('school-summary-band')).toBeVisible();
      await expect(page.getByTestId('change-school-btn')).toBeVisible();
      const y = await firstCardTop(page);
      expect(y, 'first listing card top at 390x844').toBeLessThan(844);
    } finally {
      await ctx.close();
    }
  });
});
