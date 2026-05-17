import { test, expect } from '@playwright/test';

/**
 * Issue #1065: Property markers not rendering on area-first Discover journey
 *
 * Tests that the area-first (unauthenticated) Manipal journey loads and renders
 * without errors, indicating that the 4 production fixes are working:
 * 1. markersEnabled gate allows area-first
 * 2. Area-first listings rendering logic
 * 3. mapZoom sync from URL
 * 4. latitude/longitude coordinate mapping
 */

// @regression-correctness
test('#1065: Area-first Manipal journey loads and renders', async ({ page }) => {
  // Navigate to area-first Manipal URL (no authentication required)
  await page.goto(
    'http://localhost:5174/discover?city=udupi&journey=area-first&zoom=14&areaKey=IN%7CKA%7CUdupi%7CManipal',
    { waitUntil: 'networkidle' }
  );

  // Page should be interactive (right panel visible)
  const rightPanel = page.getByTestId('discover-right-panel');
  await expect(rightPanel).toBeVisible({ timeout: 10_000 });

  // Should have property cards displayed
  const propertyCards = page.getByTestId('listing-card');
  const cardCount = await propertyCards.count();
  expect(cardCount).toBeGreaterThan(0);

  // Map markers should be present (Leaflet marker-icon elements)
  const markers = page.locator('.leaflet-marker-icon');
  const markerCount = await markers.count();
  expect(markerCount).toBeGreaterThan(0);

  // No critical JavaScript errors
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  // Wait a bit for any errors to be logged
  await page.waitForTimeout(1000);

  const criticalErrors = errors.filter(
    (e) => !e.includes('404') && !e.includes('Network error') && !e.includes('401')
  );
  expect(criticalErrors).toHaveLength(0);
});

test('#1065: Area-first journey does not require authentication', async ({ page, context }) => {
  // Verify no auth cookie before navigation
  const initialCookies = await context.cookies();
  const hasAuth = initialCookies.some((c) => c.name.toLowerCase().includes('auth'));
  expect(hasAuth).toBe(false);

  // Navigate to area-first journey
  await page.goto(
    'http://localhost:5174/discover?city=udupi&zoom=14&areaKey=IN%7CKA%7CUdupi%7CManipal',
    { waitUntil: 'networkidle' }
  );

  // Page should load successfully (no redirect to auth)
  await expect(page.getByTestId('discover-right-panel')).toBeVisible({ timeout: 10_000 });

  // Still no auth (page didn't force login)
  const finalCookies = await context.cookies();
  const stillNoAuth = !finalCookies.some((c) => c.name.toLowerCase().includes('auth'));
  expect(stillNoAuth).toBe(true);
});
