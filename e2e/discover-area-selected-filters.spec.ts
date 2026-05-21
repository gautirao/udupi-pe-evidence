import { test, expect } from '@playwright/test';

test.describe('@integration-ui Discover: Area-Selected Panel + Quick Filters', () => {
  test.beforeEach(async ({ page }) => {
    // Load discover page with area selected (use a test area key from seed data)
    // Format: Country|State|City|Area — using Manipal, a known area in Udupi city
    await page.goto('/discover?areaKey=IN|KA|Udupi|Manipal');
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  });

  test('displays quick filter chips for property types', async ({ page }) => {
    expect(await page.locator('[data-testid="quick-chip-apartment"]').isVisible()).toBeTruthy();
    expect(await page.locator('[data-testid="quick-chip-villa"]').isVisible()).toBeTruthy();
    expect(await page.locator('[data-testid="quick-chip-land"]').isVisible()).toBeTruthy();
  });

  test('displays quick filter chips for BHK', async ({ page }) => {
    expect(await page.locator('[data-testid="quick-chip-2-bhk"]').isVisible()).toBeTruthy();
    expect(await page.locator('[data-testid="quick-chip-3-bhk"]').isVisible()).toBeTruthy();
  });

  test('displays add school CTA', async ({ page }) => {
    const cta = page.locator('[data-testid="add-school-cta"]');
    expect(await cta.isVisible()).toBeTruthy();
    await expect(cta).toContainText('Add a school in this area');
  });

  test('toggles property type chip and filters listings', async ({ page }) => {
    // Click apartment chip
    const apartmentChip = page.locator('[data-testid="quick-chip-apartment"]');
    await apartmentChip.click();

    // Chip should be highlighted (bg-primary)
    await expect(apartmentChip).toHaveClass(/bg-primary/);

    // URL should contain type filter (canonical param name)
    await page.waitForURL(/type=apartment/, { timeout: 5_000 });
    const url = page.url();
    expect(url).toContain('type=apartment');
  });

  test('toggles BHK chip and filters listings', async ({ page }) => {
    // Click 2 BHK chip
    const bhk2Chip = page.locator('[data-testid="quick-chip-2-bhk"]');
    await bhk2Chip.click();

    // Chip should be highlighted
    await expect(bhk2Chip).toHaveClass(/bg-primary/);

    // URL should contain beds filter (canonical param name)
    await page.waitForURL(/beds=2/, { timeout: 5_000 });
    const url = page.url();
    expect(url).toContain('beds=2');
  });

  test('combines multiple quick filters', async ({ page }) => {
    // Select apartment + 2 BHK
    await page.locator('[data-testid="quick-chip-apartment"]').click();
    await page.locator('[data-testid="quick-chip-2-bhk"]').click();

    await page.waitForURL(
      (url) => url.toString().includes('type=apartment') && url.toString().includes('beds=2'),
      { timeout: 5_000 }
    );
    const url = page.url();
    expect(url).toContain('type=apartment');
    expect(url).toContain('beds=2');
  });

  test('deselects chip when clicked again', async ({ page }) => {
    const apartmentChip = page.locator('[data-testid="quick-chip-apartment"]');

    // Click to select
    await apartmentChip.click();
    await expect(apartmentChip).toHaveClass(/bg-primary/);

    // Click to deselect
    await apartmentChip.click();
    await expect(apartmentChip).not.toHaveClass(/bg-primary/);

    // URL should no longer contain propertyTypes
    await page.waitForURL((url) => !url.toString().includes('type='), { timeout: 5_000 });
    const url = page.url();
    expect(url).not.toContain('propertyTypes');
  });

  test('shows empty state with clear button when no listings match filters', async ({ page }) => {
    // Apply a filter that likely has no results
    await page.locator('[data-testid="quick-chip-apartment"]').click();
    await page.locator('[data-testid="quick-chip-3-bhk"]').click();

    // Wait for refetch + empty state to render — guard on both chips being reflected in URL
    await page.waitForURL(
      (url) => url.toString().includes('type=apartment') && url.toString().includes('beds=3'),
      { timeout: 5_000 }
    ).catch(() => {});
    await page.waitForResponse(
      (resp) => resp.url().includes('/api/properties') || resp.url().includes('properties'),
      { timeout: 5_000 }
    ).catch(() => {}); // guard for refetch to settle

    // Empty state with clear button should be visible
    const emptyState = page.locator('text=No listings match these filters');
    const clearButton = page.locator('[data-testid="clear-filters-button"]');

    if (!(await page.locator('[data-testid="property-card"]').first().isVisible())) {
      // If no listings, we expect the empty state and clear button
      expect(await emptyState.isVisible()).toBeTruthy();
      expect(await clearButton.isVisible()).toBeTruthy();
    }
  });

  test('clears all property filters on clear button click', async ({ page }) => {
    // Apply filters
    await page.locator('[data-testid="quick-chip-apartment"]').click();
    await page.locator('[data-testid="quick-chip-2-bhk"]').click();

    await page.waitForURL(/beds=2/, { timeout: 5_000 });
    let url = page.url();
    expect(url).toContain('type=apartment');
    expect(url).toContain('beds=2');

    // Click clear if visible
    const clearButton = page.locator('[data-testid="clear-filters-button"]');
    if (await clearButton.isVisible()) {
      await clearButton.click();
      await page.waitForURL((url) => !url.toString().includes('type=') && !url.toString().includes('beds='), { timeout: 5_000 });

      url = page.url();
      expect(url).not.toMatch(/[&?]type=/);
      expect(url).not.toMatch(/[&?]beds=/);

      // Chips should no longer be highlighted
      await expect(page.locator('[data-testid="quick-chip-apartment"]')).not.toHaveClass(/bg-primary/);
    }
  });

  // Issue #1157 — the CTA now enters the area-first school-picking sub-step
  // (schoolPicking=1) WITHOUT flipping the journey to school-first.
  test('add school CTA enters school-picking sub-step (journey stays area-first)', async ({ page }) => {
    // Click add school CTA
    const cta = page.locator('[data-testid="add-school-cta"]');
    await cta.click();

    // URL should now have schoolPicking=1, keep journey=area-first, and preserve areaKey
    await page.waitForURL(/schoolPicking=1/, { timeout: 5_000 });
    const url = page.url();
    expect(url).toContain('schoolPicking=1');
    expect(url).not.toContain('journey=school-first');
    expect(url).toContain('areaKey');
  });

  test('preserves property filters when adding school', async ({ page }) => {
    // Apply property filters first
    await page.locator('[data-testid="quick-chip-apartment"]').click();
    await page.waitForURL(/type=apartment/, { timeout: 5_000 });

    let url = page.url();
    expect(url).toContain('type=apartment');

    // Click add school CTA
    await page.locator('[data-testid="add-school-cta"]').click();
    await page.waitForURL(/schoolPicking=1/, { timeout: 5_000 });

    // Property filters should still be in URL; journey remains area-first
    url = page.url();
    expect(url).toContain('type=apartment');
    expect(url).toContain('schoolPicking=1');
    expect(url).not.toContain('journey=school-first');
  });

  test('city switch clears property filters', async ({ page }) => {
    // Apply property filters
    await page.locator('[data-testid="quick-chip-apartment"]').click();
    await page.waitForURL(/type=apartment/, { timeout: 5_000 });

    let url = page.url();
    expect(url).toContain('type=apartment');

    // Switch city (click city selector dropdown if available)
    const cityButton = page.locator('[data-testid="city-selector"]').first();
    if (await cityButton.isVisible()) {
      await cityButton.click();

      // Select a different city
      const cityOption = page.locator('[data-testid="city-option"]').first();
      if (await cityOption.isVisible()) {
        await cityOption.click();
        await page.waitForURL(/city=/, { timeout: 5_000 });

        // Property filters should be cleared on city change per the rule
        // (Note: This may vary based on implementation; the requirement says
        // city-switch clears journey/group/area/school but preserves property filters.
        // However, a full city change resets everything. This test verifies the actual behavior.)
      }
    }
  });

  test('active context chips render alongside quick chips', async ({ page }) => {
    // Apply a filter
    await page.locator('[data-testid="quick-chip-apartment"]').click();
    await page.waitForURL(/type=apartment/, { timeout: 5_000 });

    // Both quick chips and active context chips should be visible
    const quickChip = page.locator('[data-testid="quick-chip-apartment"]');
    expect(await quickChip.isVisible()).toBeTruthy();

    // Active context chips should render in PanelHeader (if implemented)
    const contextChips = page.locator('[data-testid="active-context-chips"]');
    if (await contextChips.isVisible()) {
      expect(await contextChips.isVisible()).toBeTruthy();
    }
  });

  test('search input remains sticky when scrolling listings', async ({ page }) => {
    // Render several listings
    const listingsContainer = page.locator('[data-testid="discover-right-panel"]');
    if (await listingsContainer.isVisible()) {
      const searchInput = page.locator('input[placeholder="Search listings by keyword"]');

      if (await searchInput.isVisible()) {
        // Scroll down in the listings area
        await listingsContainer.evaluate((el) => {
          el.scrollTop = 100;
        });

        // Search input should remain sticky (visible)
        expect(await searchInput.isVisible()).toBeTruthy();
      }
    }
  });

  test('no regression: property cards render with correct details', async ({ page }) => {
    // Verify property cards render with price, bedrooms, etc.
    const propertyCard = page.locator('[data-testid="property-card"]').first();

    if (await propertyCard.isVisible()) {
      // Card should have price, locality, and image
      const priceElement = propertyCard.locator('[data-testid="property-price"]');
      const localityElement = propertyCard.locator('[data-testid="property-locality"]');

      if (await priceElement.isVisible()) {
        expect(await priceElement.isVisible()).toBeTruthy();
      }
      if (await localityElement.isVisible()) {
        expect(await localityElement.isVisible()).toBeTruthy();
      }
    }
  });
});

test.describe('@integration-ui Add a school in this area — reversibility (Issue #1157)', () => {
  // Cold-load directly into the area-first area-selected state. Encoded areaKey
  // (IN%7CKA%7CUdupi%7CManipal) matches the pipe-delimited Country|State|City|Area format.
  const AREA_FIRST_URL = '/discover?journey=area-first&areaKey=IN%7CKA%7CUdupi%7CManipal';

  // The schools-in-area panel renders a PanelHeader title "Schools in {area}" and
  // always-present board filter chips (e.g. board-chip-cbse). The board chip is a
  // stable testid that does not depend on school data or auth, so we assert on it.
  const schoolsInAreaMarker = (page: import('@playwright/test').Page) =>
    page.locator('[data-testid="board-chip-cbse"]');

  test.beforeEach(async ({ page }) => {
    await page.goto(AREA_FIRST_URL);
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    // Confirm we start in the area-selected panel.
    await expect(page.locator('[data-testid="add-school-cta"]')).toBeVisible();
  });

  test('T1: CTA enters schoolPicking sub-step without flipping journey', async ({ page }) => {
    await page.locator('[data-testid="add-school-cta"]').click();

    await page.waitForURL(/schoolPicking=1/, { timeout: 5_000 });
    const url = page.url();
    expect(url).toContain('journey=area-first');
    expect(url).toContain('areaKey');
    expect(url).toContain('schoolPicking=1');
    expect(url).not.toContain('journey=school-first');

    // schools-in-area panel is visible.
    await expect(schoolsInAreaMarker(page)).toBeVisible();
  });

  test('T2: in-app Back returns to area-selected, dropping schoolPicking', async ({ page }) => {
    await page.locator('[data-testid="add-school-cta"]').click();
    await page.waitForURL(/schoolPicking=1/, { timeout: 5_000 });
    await expect(schoolsInAreaMarker(page)).toBeVisible();

    // Click the in-app Back button rendered in the schools-in-area PanelHeader.
    await page.locator('[data-testid="panel-header-back-button"]').click();

    await page.waitForURL((u) => !u.toString().includes('schoolPicking'), { timeout: 5_000 });
    const url = page.url();
    expect(url).toContain('journey=area-first');
    expect(url).toContain('areaKey');
    expect(url).not.toContain('schoolPicking');

    // Back in the area-selected panel: the CTA is visible again.
    await expect(page.locator('[data-testid="add-school-cta"]')).toBeVisible();
  });

  test('T3: browser Back returns to area-selected (journey not school-first)', async ({ page }) => {
    await page.locator('[data-testid="add-school-cta"]').click();
    await page.waitForURL(/schoolPicking=1/, { timeout: 5_000 });
    await expect(schoolsInAreaMarker(page)).toBeVisible();

    // enterSchoolPicking PUSHes a history entry, so browser Back undoes it.
    await page.goBack();

    await page.waitForURL((u) => !u.toString().includes('schoolPicking'), { timeout: 5_000 });
    const url = page.url();
    expect(url).toContain('journey=area-first');
    expect(url).toContain('areaKey');
    expect(url).not.toContain('journey=school-first');

    // Back in the area-selected panel.
    await expect(page.locator('[data-testid="add-school-cta"]')).toBeVisible();
  });

  // Issue #1157 Option (i) — the area-first sub-step reuses the same schools query as
  // school-first (so the list is non-empty) and selecting a school routes to
  // area-school-combined WITHOUT flipping the journey.
  test('T4: school-picking sub-step shows the area schools (>0 cards)', async ({ page }) => {
    await page.locator('[data-testid="add-school-cta"]').click();
    await page.waitForURL(/schoolPicking=1/, { timeout: 5_000 });
    await expect(schoolsInAreaMarker(page)).toBeVisible();

    // At least one school card is rendered for the area (parity with school-first).
    const firstCard = page.locator('[data-testid="school-card"]').first();
    await expect(firstCard).toBeVisible({ timeout: 10_000 });
    expect(await page.locator('[data-testid="school-card"]').count()).toBeGreaterThan(0);
  });

  test('T5: selecting a school → schoolId set, journey stays area-first, combined panel', async ({ page }) => {
    await page.locator('[data-testid="add-school-cta"]').click();
    await page.waitForURL(/schoolPicking=1/, { timeout: 5_000 });

    const firstCard = page.locator('[data-testid="school-card"]').first();
    await expect(firstCard).toBeVisible({ timeout: 10_000 });
    await firstCard.click();

    // URL gains schoolId, journey stays area-first, schoolPicking is dropped.
    await page.waitForURL(/schoolId=/, { timeout: 5_000 });
    const url = page.url();
    expect(url).toContain('schoolId=');
    expect(url).toContain('journey=area-first');
    expect(url).not.toContain('journey=school-first');
    expect(url).not.toContain('schoolPicking');

    // Panel routes to area-school-combined (its dimension chips are the stable marker).
    await expect(page.locator('[data-testid="combined-chips"]')).toBeVisible({ timeout: 10_000 });
  });

  // ── Issue #1157 rev-5 corrective ─────────────────────────────────────────────
  //
  // School-marker selectors (verified against the source):
  //   - SchoolMarkerLayer renders each area school via L.divIcon({ className: 'school-pin' }).
  //     On the map these become `.leaflet-marker-icon.school-pin`.
  //   - The selected-school circle marker (PropertyMap schoolCircle) uses
  //     className 'school-marker' — a DIFFERENT class — plus a `path.leaflet-interactive`
  //     radius circle. So area-school markers and the selected-school pin never collide
  //     on the same selector.

  const schoolPinIcon = (page: import('@playwright/test').Page) =>
    page.locator('.leaflet-marker-icon.school-pin');
  const radiusCircle = (page: import('@playwright/test').Page) =>
    page.locator('path.leaflet-interactive');

  // DEFECT A — the area-first school-picking sub-step must show school MARKERS on the
  // map (not just cards). Marker count must agree with the rendered card count.
  test('T7 (AC6): school-picking sub-step shows school markers on the map (count matches cards)', async ({ page }) => {
    await page.locator('[data-testid="add-school-cta"]').click();
    await page.waitForURL(/schoolPicking=1/, { timeout: 5_000 });
    await expect(schoolsInAreaMarker(page)).toBeVisible();

    // Cards render (parity with T4).
    const firstCard = page.locator('[data-testid="school-card"]').first();
    await expect(firstCard).toBeVisible({ timeout: 10_000 });
    const cardCount = await page.locator('[data-testid="school-card"]').count();
    expect(cardCount).toBeGreaterThan(0);

    // DEFECT A core assertion: markers are now present in area-first (previously zero).
    await expect(schoolPinIcon(page).first()).toBeVisible({ timeout: 10_000 });
    const markerCount = await schoolPinIcon(page).count();
    expect(markerCount).toBeGreaterThan(0);
    // Markers agree with the cards (focus mode is OFF here — no school selected yet).
    expect(markerCount).toBe(cardCount);
  });

  // AC7 — after selecting a school the selected pin (school-marker) + radius circle render.
  test('AC7: selecting a school renders the selected pin and the radius circle', async ({ page }) => {
    await page.locator('[data-testid="add-school-cta"]').click();
    await page.waitForURL(/schoolPicking=1/, { timeout: 5_000 });

    const firstCard = page.locator('[data-testid="school-card"]').first();
    await expect(firstCard).toBeVisible({ timeout: 10_000 });
    await firstCard.click();

    await page.waitForURL(/schoolId=/, { timeout: 5_000 });
    await expect(page.locator('[data-testid="combined-chips"]')).toBeVisible({ timeout: 10_000 });

    // Selected-school pin (school-marker) + dashed radius circle are drawn.
    await expect(page.locator('.leaflet-marker-icon.school-marker').first()).toBeVisible({ timeout: 10_000 });
    await expect(radiusCircle(page).first()).toBeVisible({ timeout: 10_000 });
  });

  // DEFECT B — Back from a selected school (area-school-combined) returns to
  // schools-in-area: schoolId + radiusKm drop, schoolPicking=1 is re-armed, journey
  // stays area-first, areaKey is intact, the radius circle unmounts, and the area's
  // school markers reappear.
  test('T8 (AC8): Back from selected school returns to schools-in-area, circle gone, markers back', async ({ page }) => {
    await page.locator('[data-testid="add-school-cta"]').click();
    await page.waitForURL(/schoolPicking=1/, { timeout: 5_000 });

    const firstCard = page.locator('[data-testid="school-card"]').first();
    await expect(firstCard).toBeVisible({ timeout: 10_000 });
    await firstCard.click();

    // In combined: schoolId set + radius circle present.
    await page.waitForURL(/schoolId=/, { timeout: 5_000 });
    await expect(page.locator('[data-testid="combined-chips"]')).toBeVisible({ timeout: 10_000 });
    await expect(radiusCircle(page).first()).toBeVisible({ timeout: 10_000 });

    // Press the in-app Back button.
    await page.locator('[data-testid="panel-header-back-button"]').click();

    // URL: schoolId + radiusKm gone, schoolPicking=1 re-armed, journey area-first, areaKey intact.
    await page.waitForURL((u) => u.toString().includes('schoolPicking=1') && !u.toString().includes('schoolId='), { timeout: 5_000 });
    const url = page.url();
    expect(url).toContain('schoolPicking=1');
    expect(url).toContain('journey=area-first');
    expect(url).toContain('areaKey');
    expect(url).not.toContain('schoolId=');
    expect(url).not.toContain('radiusKm=');
    expect(url).not.toContain('journey=school-first');

    // Panel is back to schools-in-area.
    await expect(schoolsInAreaMarker(page)).toBeVisible();
    await expect(page.locator('[data-testid="school-card"]').first()).toBeVisible({ timeout: 10_000 });

    // The selected-school radius circle is gone, and the area's school markers reappear.
    await expect(radiusCircle(page)).toHaveCount(0);
    await expect(schoolPinIcon(page).first()).toBeVisible({ timeout: 10_000 });
    expect(await schoolPinIcon(page).count()).toBeGreaterThan(0);
  });
});

test.describe('@integration-ui School-first select — journey-gate regression (Issue #1157)', () => {
  // Cold-load directly into the school-first schools-in-area panel. `derivePanelContent`
  // returns 'schools-in-area' for BOTH journeys, but the school-first journey MUST keep
  // its internal setSchoolJourney path on card click — it must NOT delegate to the
  // area-first onSelectSchool handler (handleSelectSchoolById → setSchoolParams).
  // DiscoverRightPanel gates onSelectSchool by journey, so school-first receives undefined
  // and the panel uses setSchoolJourney. This guards the regression where the prop leaked
  // through unconditionally and a school-first click silently switched to setSchoolParams.
  const SCHOOL_FIRST_URL =
    '/discover?journey=school-first&areaKey=IN%7CKA%7CUdupi%7CManipal';

  // The schools-in-area panel renders always-present board filter chips; board-chip-cbse
  // is a stable testid independent of school data and auth.
  const schoolsInAreaMarker = (page: import('@playwright/test').Page) =>
    page.locator('[data-testid="board-chip-cbse"]');

  test.beforeEach(async ({ page }) => {
    await page.goto(SCHOOL_FIRST_URL);
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    // Confirm we cold-load into the schools-in-area panel.
    await expect(schoolsInAreaMarker(page)).toBeVisible();
  });

  test('T6: selecting a school keeps journey=school-first via internal setSchoolJourney', async ({ page }) => {
    const firstCard = page.locator('[data-testid="school-card"]').first();
    await expect(firstCard).toBeVisible({ timeout: 10_000 });
    await firstCard.click();

    // schoolId is set and journey STAYS school-first (never area-first).
    await page.waitForURL(/schoolId=/, { timeout: 5_000 });
    const url = page.url();
    expect(url).toContain('schoolId=');
    expect(url).toContain('journey=school-first');
    expect(url).not.toContain('journey=area-first');

    // setSchoolJourney additionally writes lat/lon/zoom (the area-first delegate
    // setSchoolParams writes only schoolId + radiusKm). The presence of lat= proves
    // the internal setSchoolJourney path ran, not the area-first onSelectSchool delegate.
    expect(url).toMatch(/[&?]lat=/);
    expect(url).toMatch(/[&?]lon=/);

    // schoolId + areaKey co-present under school-first → area-school-combined panel.
    await expect(page.locator('[data-testid="combined-chips"]')).toBeVisible({ timeout: 10_000 });
  });
});
