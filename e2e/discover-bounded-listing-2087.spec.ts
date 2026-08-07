import { test, expect } from '@playwright/test';

test.describe('Issue 2087: Bounded Listing Browse', () => {
  test('User can browse bounded listings from a node and URL updates correctly', async ({ page }) => {
    
    // Navigate to Bangalore discover page where navigation tree is fully seeded
    await page.goto(`/discover?city=bangalore`);

    // Click the "Explore by area" card to open the Navigation hierarchy
    const exploreByAreaBtn = page.getByText('Explore by area');
    await exploreByAreaBtn.waitFor({ state: 'visible', timeout: 10000 });
    await exploreByAreaBtn.click();

    // Now we are in the area hierarchy (NavigationLevelPanel) for Bangalore.
    // Click "Langford Gardens & Lavelle Road" region card (d:central).
    const regionBtn = page.getByText('Langford Gardens & Lavelle Road').first();
    await regionBtn.waitFor({ state: 'visible', timeout: 10000 });
    await regionBtn.click();

    // Now we are inside d:central. We need a node with 1-15 descendant areas.
    // Click "Domlur Layout & Kodihalli" cluster (which has 6 descendant areas).
    const clusterBtn = page.getByText('Domlur Layout & Kodihalli').first();
    await clusterBtn.waitFor({ state: 'visible', timeout: 10000 });
    await clusterBtn.click();

    // Dismiss the cookie banner if it exists, as it obscures the bottom of the panel
    const acceptCookiesBtn = page.getByRole('button', { name: 'Accept' });
    if (await acceptCookiesBtn.isVisible()) {
      await acceptCookiesBtn.click();
    }

    // Now we are in a cluster with 6 areas. Wait for the "Browse listings" button specifically.
    const browseListingsBtn = page.getByRole('button', { name: /Browse listings/i });
    
    // Wait for the button to appear.
    await expect(browseListingsBtn).toBeVisible({ timeout: 15000 });

    // Click the CTA
    await browseListingsBtn.click();

    // Verify ?nodeListings=1 is appended to the URL
    await expect(page).toHaveURL(/nodeListings=1/);

    // Verify NodeListingsSurface is visible by checking for "Back to" button
    const backBtn = page.getByRole('button', { name: /Back to/i });
    await expect(backBtn).toBeVisible();

    // Click "Back to"
    await backBtn.click();

    // Verify ?nodeListings=1 is removed from the URL
    await expect(page).not.toHaveURL(/nodeListings=1/);
  });
});
