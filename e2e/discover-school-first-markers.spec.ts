import { test, expect } from '@playwright/test';

/**
 * Issue #1074 — School-first journey property markers + right-panel listings.
 *
 * Slice A: school-first + areaKey (no schoolId) → school markers + area
 *          property markers + right-panel property cards.
 * Slice B: school-first + schoolId → highlighted school + radius circle +
 *          property markers OR explicit empty banner; right-panel listing list.
 *
 * Regression target #1065: area-first journey still renders property markers.
 *
 * Manipal areaKey: 'IN|KA|Udupi|Manipal' (URL-encoded as IN%7CKA%7CUdupi%7CManipal).
 * The school-first "Manipal" area selection is the canonical Slice A path.
 */

const MANIPAL_AREA_KEY = 'IN%7CKA%7CUdupi%7CManipal';

test.describe('Issue #1074 — school-first markers', () => {
  test('Slice A: school-first + Manipal area → schools + property markers + right-panel cards', async ({ page }) => {
    await page.goto(
      `http://localhost:5174/discover?city=udupi&journey=school-first&zoom=14&areaKey=${MANIPAL_AREA_KEY}`,
      { waitUntil: 'networkidle' },
    );

    // Right panel renders the schools-in-area panel
    await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 10_000 });

    // Property markers must be present alongside school markers
    const propertyMarkers = page.locator('[data-testid="property-marker"]');
    await expect(propertyMarkers.first()).toBeVisible({ timeout: 10_000 });
    expect(await propertyMarkers.count()).toBeGreaterThan(0);

    // School markers continue rendering — selector matches PropertyMap's schoolMarkerIcon className
    const schoolMarkers = page.locator('.school-marker');
    expect(await schoolMarkers.count()).toBeGreaterThan(0);

    // Right-panel "Homes in this area" section + at least one property card
    await expect(page.getByTestId('schools-in-area-properties')).toBeVisible();
    const propertyCards = page.getByTestId('listing-card');
    expect(await propertyCards.count()).toBeGreaterThan(0);
  });

  test('Slice B: school-first + school selected → radius circle + markers OR empty banner', async ({ page }) => {
    // Start at the Manipal area panel, then click the first school card to enter school-selected state
    await page.goto(
      `http://localhost:5174/discover?city=udupi&journey=school-first&zoom=14&areaKey=${MANIPAL_AREA_KEY}`,
      { waitUntil: 'networkidle' },
    );
    await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 10_000 });

    const firstSchoolCard = page.getByTestId('school-card').first();
    await expect(firstSchoolCard).toBeVisible({ timeout: 10_000 });
    await firstSchoolCard.click();

    // URL gains schoolId — wait for transition to school-selected panel
    await expect(page).toHaveURL(/schoolId=/, { timeout: 8_000 });

    // Leaflet Circle for the radius (SVG path inside leaflet-overlay-pane)
    const radiusCircle = page.locator('.leaflet-overlay-pane svg path').first();
    await expect(radiusCircle).toBeVisible({ timeout: 10_000 });

    // Either property markers exist OR the empty-state banner is shown.
    // Both are acceptable per AC2 + AC3.
    const propertyMarkers = page.locator('[data-testid="property-marker"]');
    const emptyBanner = page.getByTestId('empty-state-message');

    const markerCount = await propertyMarkers.count();
    if (markerCount === 0) {
      await expect(emptyBanner).toBeVisible();
    } else {
      expect(markerCount).toBeGreaterThan(0);
    }
  });

  test('AC5 regression: area-first Manipal journey still renders property markers', async ({ page }) => {
    await page.goto(
      `http://localhost:5174/discover?city=udupi&journey=area-first&zoom=14&areaKey=${MANIPAL_AREA_KEY}`,
      { waitUntil: 'networkidle' },
    );

    await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 10_000 });
    const propertyMarkers = page.locator('[data-testid="property-marker"]');
    await expect(propertyMarkers.first()).toBeVisible({ timeout: 10_000 });
    expect(await propertyMarkers.count()).toBeGreaterThan(0);

    // Right-panel property cards still render (issue-1065-final regression)
    const propertyCards = page.getByTestId('listing-card');
    expect(await propertyCards.count()).toBeGreaterThan(0);
  });
});
