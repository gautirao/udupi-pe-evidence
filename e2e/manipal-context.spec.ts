import { test, expect } from '@playwright/test';

test('Manipal context preservation across journeys', async ({ page }) => {
  // 1. Open Discover
  await page.goto('/discover?city=udupi');

  // 2. Use the visible search input and type/search for Manipal
  // Assuming the search input has a placeholder like 'Search city, area...' or a specific test ID.
  // I will use a generic placeholder or locator based on common patterns, but I might need to adjust.
  // Let's use getByPlaceholder or getByRole.
  const searchInput = page.getByRole('combobox', { name: /search/i }).or(page.getByPlaceholder(/search/i));
  await searchInput.fill('Manipal');

  // 3. Select the real Manipal result returned from the remote data.
  // We'll wait for the dropdown to show Manipal.
  const manipalOption = page.getByRole('option', { name: /Manipal/i });
  await manipalOption.waitFor({ state: 'visible' });
  await manipalOption.click();

  // 4. Wait until the By area journey has settled.
  // Wait for network idle or for specific listings to appear.
  await page.waitForLoadState('networkidle');
  // Or wait for map to load / listings to appear
  // For safety, wait for a short timeout as well
  await page.waitForTimeout(2000);

  // 5. Take Screenshot 1
  await page.screenshot({ path: 'docs/pr-evidence/2779/manipal/1_Manipal_By_area_listings.png', fullPage: true });

  // 6. Click Near a school / Schools
  // We must click the actual journey switch control (which preserves context), NOT the global nav link (which resets to city).
  const schoolTab = page.getByTestId('discover-header-journey-tab-school-first').or(page.getByTestId('journey-card-school-first'));
  await schoolTab.click();

  // 7. Wait for school journey to settle
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // 8. Take Screenshot 2
  await page.screenshot({ path: 'docs/pr-evidence/2779/manipal/2_Manipal_Schools.png', fullPage: true });

  // 9. Click Agricultural land
  const agriTab = page.getByTestId('discover-header-journey-tab-agri-first').or(page.getByTestId('journey-card-agri-first'));
  await agriTab.click();

  // 10. Wait for agri journey to settle
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // 11. Take Screenshot 3
  await page.screenshot({ path: 'docs/pr-evidence/2779/manipal/3_Manipal_Agricultural_land.png', fullPage: true });
});
