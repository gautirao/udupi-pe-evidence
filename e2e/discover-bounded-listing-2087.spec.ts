import { test, expect } from '@playwright/test';

/**
 * Issue #2087 — Bounded Listing Browse — Playwright integration proof.
 *
 * Proves end-to-end:
 *   - Browse listings CTA appears for a node with ≤ 15 descendant areas
 *   - Clicking CTA updates URL with `nodeListings=1`
 *   - NodeListingsSurface mounts and shows the Back-to button
 *   - Listing API call carries `nodeKey` (not a frontend-expanded area-key list)
 *   - Back-navigation removes `nodeListings=1` from URL
 *
 * Boundary eligibility (15 eligible / 16 ineligible / root-never-eligible / shallow eligible)
 * and pagination controls are covered by focused unit tests:
 *   - NavigationLevelPanel.test.tsx  → eligibility boundary + root guard
 *   - NodeListingsSurface.2087.test.tsx → pagination controls
 */
test.describe('Issue 2087: Bounded Listing Browse', () => {
  test('CTA, URL update, nodeKey scoping, and Back-navigation', async ({ page }) => {
    // Capture all listing API requests so we can assert nodeKey scoping.
    const listingApiUrls: string[] = [];
    await page.route('**/api/discover/listings**', async (route) => {
      listingApiUrls.push(route.request().url());
      await route.continue();
    });

    // Navigate to Bangalore discover page where navigation tree is fully seeded.
    await page.goto('/discover?city=bangalore');

    // Click the "Explore by area" card to open the Navigation hierarchy.
    const exploreByAreaBtn = page.getByText('Explore by area');
    await exploreByAreaBtn.waitFor({ state: 'visible', timeout: 10000 });
    await exploreByAreaBtn.click();

    // Navigate into d:central (Langford Gardens & Lavelle Road region).
    const regionBtn = page.getByText('Langford Gardens & Lavelle Road').first();
    await regionBtn.waitFor({ state: 'visible', timeout: 10000 });
    await regionBtn.click();

    // Navigate into a cluster with ≤ 15 descendant areas.
    const clusterBtn = page.getByText('Domlur Layout & Kodihalli').first();
    await clusterBtn.waitFor({ state: 'visible', timeout: 10000 });
    await clusterBtn.click();

    // Dismiss cookie banner if present.
    const acceptCookiesBtn = page.getByRole('button', { name: 'Accept' });
    if (await acceptCookiesBtn.isVisible()) {
      await acceptCookiesBtn.click();
    }

    // ── CTA visibility ──
    const browseListingsBtn = page.getByRole('button', { name: /Browse listings/i });
    await expect(browseListingsBtn).toBeVisible({ timeout: 15000 });

    // Reset captured URLs before clicking so we only inspect the triggered call.
    listingApiUrls.length = 0;
    await browseListingsBtn.click();

    // ── URL update ──
    await expect(page).toHaveURL(/nodeListings=1/);

    // ── NodeListingsSurface is mounted ──
    const backBtn = page.getByRole('button', { name: /Back to/i });
    await expect(backBtn).toBeVisible();

    // ── Canonical nodeKey scoping: the listing request must carry nodeKey, not areaKeys ──
    // Wait briefly for the API request to be captured.
    await page.waitForTimeout(500);
    // At least one listing request was made after clicking Browse.
    expect(listingApiUrls.length).toBeGreaterThan(0);
    // Every captured request must carry a nodeKey param (not an areaKeys[] list).
    for (const url of listingApiUrls) {
      const u = new URL(url);
      expect(u.searchParams.has('nodeKey'), `nodeKey missing in: ${url}`).toBe(true);
      expect(u.searchParams.has('areaKeys'), `areaKeys must not be present in: ${url}`).toBe(false);
    }
    // The nodeKey value must be the cluster's node key, not 'root' or the city.
    const firstNodeKey = new URL(listingApiUrls[0]).searchParams.get('nodeKey') ?? '';
    expect(firstNodeKey).not.toBe('root');
    expect(firstNodeKey.length).toBeGreaterThan(0);

    // ── Back-navigation ──
    await backBtn.click();
    await expect(page).not.toHaveURL(/nodeListings=1/);
  });
});
