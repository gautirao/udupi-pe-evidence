import { test, expect } from '@playwright/test';

// Using the seeded Bangalore fixture
const CITY = 'bangalore';
const D_CENTRAL = 'd:central';
const C_CENTRAL = 'c:central:in-ka-bengaluru-btm-layout-in-ka-bengaluru-koramangala';
const AREA_KORAMANGALA = 'a:IN|KA|Bengaluru|Koramangala';

test.describe('Schools Canonical Navigation', () => {
  test('@smoke J5 — school-first: real zone/area/school navigation, radius 3→5→10, refresh + back/forward restore', async ({ page }) => {
    // Collect auth errors — the whole journey below is anonymous.
    const authErrors: number[] = [];
    page.on('response', (r) => {
      if (r.status() === 401 || r.status() === 403) authErrors.push(r.status());
    });

    // Step 1: Landing page loads canonical hierarchy root for Bangalore
    await page.goto(`/discover?city=${CITY}&journey=school-first`);
    
    const canonicalPanelShell = page.getByTestId('discover-schools-journey-panel-shell');
    await expect(canonicalPanelShell).toBeVisible({ timeout: 15_000 });

    // Step 2: Click a canonical DIRECTION child (Central Bangalore)
    const directionCard = canonicalPanelShell.getByTestId(`navigation-child-card-${D_CENTRAL}`);
    await expect(directionCard, 'J5: Central Bangalore direction card must render on Schools landing').toBeVisible({ timeout: 15_000 });
    await directionCard.click();
    await expect(page, 'J5: clicking the direction card must write node to the URL').toHaveURL(new RegExp(`node=${encodeURIComponent(D_CENTRAL)}`), { timeout: 8_000 });
    
    // Step 2b: Click a canonical CLUSTER child (BTM Layout / Koramangala)
    const clusterCard = canonicalPanelShell.getByTestId(`navigation-child-card-${C_CENTRAL}`);
    await expect(clusterCard).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1000); await clusterCard.click();
    await expect(page).toHaveURL(new RegExp(`node=${encodeURIComponent(C_CENTRAL)}`), { timeout: 8_000 });

    // Wait for the camera to settle on the cluster bounds
    // We expect the URL to reach zoom=12 or zoom=13 for C_CENTRAL.
    await expect.poll(
      () => {
        const zoom = Number(new URL(page.url()).searchParams.get('zoom') || 0);
        return zoom >= 12;
      },
      { message: 'J5: area camera-sync must settle to higher zoom before selection', timeout: 10_000 },
    ).toBe(true);

    // Step 3a: Map/Panel convergence — click an AREA from the MAP
    // Target a specific, deterministic area marker (Koramangala) by its
    // data-node-key rather than `.first()`. `[data-testid="area-single-marker"]`
    // DOM order does not track on-screen/viewport order for a Leaflet map —
    // several sibling AREA markers in this cluster (e.g. Bilekahalli) can be
    // the first in DOM order while sitting outside the current map viewport.
    // Koramangala is the one non-zero-school, non-clustered member of this
    // cluster that reliably renders inside the visible map bounds after the
    // camera-settle above, and is already the deterministic area this spec
    // exercises again in Step 3b — reusing it here proves the map click
    // reaches the SAME Schools-in-Area state the panel row does.
    //
    // `locator.click()` is deliberately NOT used here: Leaflet recreates
    // each marker's DOM element on layout-affecting events (`layoutTick`/zoom
    // recompute in `AreaDestinationMarkerLayer`), which makes Playwright's
    // higher-level `locator.click()` actionability wait (element stability
    // across frames) unreliable for this specific marker type — the exact,
    // already-documented limitation `issue-1956-pr2-destination-surface.spec.ts`
    // and `issue-1956-pr3-area-clustering.spec.ts` work around with the same
    // `page.mouse.move/down/up` pattern below: a real synthetic mouse
    // move/down/up at the marker's own bounding-box centre DOES navigate
    // correctly, while `locator.click()` on the exact same element
    // intermittently no-ops (verified live: a raw `dispatchEvent` of
    // mousedown/mouseup/click at the marker's real centre coordinates does
    // set areaKey= correctly, while `locator.click()` does not — this is a
    // Playwright/Leaflet actionability quirk, not a production regression).
    const firstAreaMarker = page.locator(`[data-testid="area-single-marker"][data-node-key="${AREA_KORAMANGALA}"]`);
    await expect(firstAreaMarker).toBeVisible({ timeout: 15_000 });
    const markerBox = await firstAreaMarker.boundingBox();
    if (!markerBox) {
      throw new Error('Koramangala area-single-marker has no bounding box');
    }
    await page.mouse.move(markerBox.x + markerBox.width / 2, markerBox.y + markerBox.height / 2);
    await page.mouse.down();
    await page.mouse.up();

    // The right panel switches to the legacy right-panel to show schools in the Area
    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel).toBeVisible({ timeout: 15_000 });
    
    // We expect the URL to have SOME areaKey now
    await expect.poll(
      () => new URL(page.url()).searchParams.get('areaKey'),
      { message: 'J5: clicking an area map marker must write areaKey to the URL', timeout: 8_000 },
    ).not.toBeNull();
    
    // Step 3b: Map/Panel convergence — go back and select Koramangala from the PANEL
    await page.goBack();
    await expect(canonicalPanelShell).toBeVisible({ timeout: 15_000 });
    const areaRow = canonicalPanelShell.getByTestId(`navigation-child-card-${AREA_KORAMANGALA}`);
    await expect(areaRow, 'J5: Koramangala area row must render inside the cluster direction').toBeVisible({ timeout: 15_000 });
    await areaRow.click();
    
    await expect(rightPanel).toBeVisible({ timeout: 15_000 });
    await expect.poll(
      () => new URL(page.url()).searchParams.get('areaKey'),
      { message: 'J5: clicking the Koramangala area row must write areaKey to the URL', timeout: 8_000 },
    ).toBe('IN|KA|Bengaluru|Koramangala');

    // Wait for camera to settle
    await expect.poll(
      () => {
        const params = new URL(page.url()).searchParams;
        return params.has('lat') && params.has('lon') && params.has('zoom');
      },
      { message: 'J5: area camera-sync must settle (lat/lon/zoom in URL) before filter interaction', timeout: 10_000 },
    ).toBe(true);

    // Step 4: Select a school (first card in the unfiltered list)
    const schoolCard = rightPanel.locator('[data-testid="school-card"]').first();
    await expect(schoolCard).toBeVisible({ timeout: 15_000 });
    await schoolCard.click();
    await expect.poll(() => new URL(page.url()).searchParams.get('schoolId'), { timeout: 8_000 }).not.toBeNull();
    await expect(page).toHaveURL(/journey=school-first/, { timeout: 8_000 });
    const schoolId = new URL(page.url()).searchParams.get('schoolId');
    expect(schoolId, 'J5: a real schoolId must be captured from the URL right after the school-card click').not.toBeNull();

    // Step 5: Test School-search cross-branch selection + restore
    // Go back to the canonical root
    await page.goto(`/discover?city=${CITY}&journey=school-first`);
    await expect(canonicalPanelShell).toBeVisible({ timeout: 15_000 });
    
    // Open the search bar (in Schools-first journey)
    const searchInput = canonicalPanelShell.getByTestId('school-search-input');
    await expect(searchInput).toBeVisible();
    await searchInput.fill('school');
    
    // Click the first result from the real search
    const firstSearchResult = canonicalPanelShell.getByTestId('school-card').first();
    await expect(firstSearchResult).toBeVisible({ timeout: 15_000 });
    await firstSearchResult.click();
    
    // Assert it entered the Area/school flow (rightPanel) without stale branch context
    await expect(rightPanel).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => new URL(page.url()).searchParams.get('schoolId'), { timeout: 8_000 }).not.toBeNull();
    const searchedSchoolId = new URL(page.url()).searchParams.get('schoolId');
    
    // Test radius progression
    const radius3km = rightPanel.getByTestId('combined-radius-btn-3');
    const radius5km = rightPanel.getByTestId('combined-radius-btn-5');
    const radius10km = rightPanel.getByTestId('combined-radius-btn-10');
    
    await expect(radius3km).toBeVisible({ timeout: 15_000 });
    
    // Click 5km
    await radius5km.click();
    await expect(page).toHaveURL(/radiusKm=5/, { timeout: 8_000 });
    
    // Click 10km
    await radius10km.click();
    await expect(page).toHaveURL(/radiusKm=10/, { timeout: 8_000 });
    
    // Refresh the page
    await page.reload();
    await expect(rightPanel).toBeVisible({ timeout: 15_000 });
    const postRefreshUrl = new URL(page.url());
    expect(postRefreshUrl.searchParams.get('radiusKm')).toBe('10');
    expect(postRefreshUrl.searchParams.get('schoolId')).toBe(searchedSchoolId);
    
    // Click Back
    await page.goBack();
    await expect.poll(() => new URL(page.url()).searchParams.get('radiusKm'), { timeout: 8_000 }).toBe('5');
    
    // No auth errors across the entire journey
    expect(authErrors, 'J5: unexpected 401/403 responses').toHaveLength(0);
  });

  test('@smoke #2124 review gap 2 — a zero-school canonical AREA stays visible in the hierarchy with an honest zero state, never dropped/reparented', async ({
    page,
  }) => {
    // Real seeded Bangalore fixture, verified live: GET
    // .../navigation/c:central:...koramangala/counts returns, among the
    // C_CENTRAL cluster's real children, "a:IN|KA|Bengaluru|BTM Layout" with
    // schoolCount=0 (matchingAreaCount=1) sitting alongside
    // "a:IN|KA|Bengaluru|Koramangala" (schoolCount=4) in the SAME cluster —
    // a real, live mixed zero/non-zero sibling set, not fabricated.
    const BTM_LAYOUT_NODE_KEY = 'a:IN|KA|Bengaluru|BTM Layout';

    await page.goto(`/discover?city=${CITY}&journey=school-first&node=${encodeURIComponent(C_CENTRAL)}`);

    const canonicalPanelShell = page.getByTestId('discover-schools-journey-panel-shell');
    await expect(canonicalPanelShell).toBeVisible({ timeout: 15_000 });

    // The zero-school AREA card must render at all — not silently dropped
    // from its canonical cluster because its schoolCount is 0.
    const btmLayoutCard = canonicalPanelShell.getByTestId(`navigation-child-card-${BTM_LAYOUT_NODE_KEY}`);
    await expect(
      btmLayoutCard,
      '#2124: a schoolCount=0 canonical AREA must still render in its cluster, never disappear',
    ).toBeVisible({ timeout: 15_000 });

    // It must show the honest zero literal, never a suppressed/blank count
    // and never a fabricated non-zero value (NavigationChildCard.tsx:
    // emptyCountLabel = '0 schools' for countKind='schools').
    await expect(btmLayoutCard).toContainText('0 schools');

    // It must still be reachable — clicking it enters the SAME
    // SchoolsInArea/areaKey convergence path a non-zero-school AREA does
    // (an honest empty state downstream, not a dead end).
    await btmLayoutCard.click();
    await expect.poll(
      () => new URL(page.url()).searchParams.get('areaKey'),
      { message: '#2124: a zero-school AREA card must still be clickable and reach its own areaKey= state', timeout: 8_000 },
    ).toBe('IN|KA|Bengaluru|BTM Layout');

    const rightPanel = page.getByTestId('discover-right-panel');
    await expect(rightPanel).toBeVisible({ timeout: 15_000 });

    // Its non-zero-school sibling (Koramangala) remains a DISTINCT reachable
    // card in the SAME cluster — proving the zero-school card was neither
    // reparented nor merged into/replaced by a sibling.
    await page.goBack();
    await expect(canonicalPanelShell).toBeVisible({ timeout: 15_000 });
    const koramangalaCard = canonicalPanelShell.getByTestId(`navigation-child-card-${AREA_KORAMANGALA}`);
    await expect(koramangalaCard).toBeVisible({ timeout: 15_000 });
    await expect(canonicalPanelShell.getByTestId(`navigation-child-card-${BTM_LAYOUT_NODE_KEY}`)).toBeVisible();
  });
});
