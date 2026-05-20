/**
 * E2E: seller / date / boolean filter chips in ActiveContextChips — Issue #1151.
 *
 * Verifies:
 *   FC-1  Cold-load with seller + date + boolean params → all chips present
 *   FC-2  Seller chip ✕ → seller= removed from URL, other params untouched, chip gone
 *   FC-3  Date chip ✕  → both from= and to= removed atomically, chip gone
 *   FC-4  ntm chip ✕   → ntm= removed, rera= retained
 *
 * Run: bash scripts/run-e2e-local.sh --project=full e2e/discover-filter-chips.spec.ts
 */

import { test, expect } from '@playwright/test';

// Base URL that provides a deterministic starting state:
// - city param ensures the page loads correctly
// - seller, from, to, ntm, rera give us 4 chip dimensions to assert
const BASE_URL =
  '/discover?city=udupi&seller=owner&from=2025-01-15&to=2025-02-01&ntm=1&rera=1';

test.describe('@integration-ui Discover — filter chips (Issue #1151)', () => {
  test('FC-1: cold-load shows seller, date, ntm and rera chips', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');

    // Wait for the chips container to be in the DOM
    await expect(page.getByTestId('active-context-chips')).toBeVisible({ timeout: 10_000 });

    // Seller chip
    await expect(page.getByTestId('chip-seller')).toBeVisible();

    // Date range chip
    await expect(page.getByTestId('chip-date')).toBeVisible();

    // Boolean chips
    await expect(page.getByTestId('chip-bool-ntm')).toBeVisible();
    await expect(page.getByTestId('chip-bool-rera')).toBeVisible();
  });

  test('FC-2: clicking seller chip ✕ removes seller= from URL, other params preserved', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('chip-seller')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('chip-seller-dismiss').click();

    // seller= must be gone
    await page.waitForURL((url) => !url.searchParams.has('seller'));

    const url = new URL(page.url());
    expect(url.searchParams.has('seller')).toBe(false);

    // Other params must be intact
    expect(url.searchParams.get('from')).toBe('2025-01-15');
    expect(url.searchParams.get('to')).toBe('2025-02-01');
    expect(url.searchParams.get('ntm')).toBe('1');
    expect(url.searchParams.get('rera')).toBe('1');

    // Chip must be gone from DOM
    await expect(page.getByTestId('chip-seller')).not.toBeVisible();
  });

  test('FC-3: clicking date chip ✕ removes both from= and to= atomically', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('chip-date')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('chip-date-dismiss').click();

    // Both from= and to= must be gone
    await page.waitForURL((url) => !url.searchParams.has('from') && !url.searchParams.has('to'));

    const url = new URL(page.url());
    expect(url.searchParams.has('from')).toBe(false);
    expect(url.searchParams.has('to')).toBe(false);

    // Other params must be intact
    expect(url.searchParams.get('seller')).toBe('owner');
    expect(url.searchParams.get('ntm')).toBe('1');
    expect(url.searchParams.get('rera')).toBe('1');

    // Chip must be gone from DOM
    await expect(page.getByTestId('chip-date')).not.toBeVisible();
  });

  test('FC-4: clicking ntm chip ✕ removes ntm=, rera= is retained', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('chip-bool-ntm')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('chip-bool-ntm-dismiss').click();

    // ntm= must be gone
    await page.waitForURL((url) => !url.searchParams.has('ntm'));

    const url = new URL(page.url());
    expect(url.searchParams.has('ntm')).toBe(false);

    // rera= must still be present
    expect(url.searchParams.get('rera')).toBe('1');

    // ntm chip gone; rera chip still visible
    await expect(page.getByTestId('chip-bool-ntm')).not.toBeVisible();
    await expect(page.getByTestId('chip-bool-rera')).toBeVisible();
  });

  test('FC-5: cleared seller filter does not resurrect when area is subsequently selected', async ({ page }) => {
    // Load with seller + ntm, no area — chips must appear in guided-entry state (AC5).
    await page.goto('/discover?city=udupi&seller=owner&ntm=1');
    await page.waitForLoadState('domcontentloaded');

    // Both chips visible (no area selected — this is the core AC5 assertion).
    await expect(page.getByTestId('chip-seller')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('chip-bool-ntm')).toBeVisible();

    // Clear the seller chip.
    await page.getByTestId('chip-seller-dismiss').click();
    await page.waitForURL((url) => !url.searchParams.has('seller'));

    // seller= gone, ntm= still present.
    let url = new URL(page.url());
    expect(url.searchParams.has('seller')).toBe(false);
    expect(url.searchParams.get('ntm')).toBe('1');
    await expect(page.getByTestId('chip-seller')).not.toBeVisible();

    // Select an area by navigating with areaKey (mirrors the URL written by
    // handleAreaSelect / urlActions.selectArea — same pattern used by
    // discover-area-selected-filters.spec.ts).  Preserves existing query params
    // by reading current URL and appending areaKey.
    const currentUrl = new URL(page.url());
    currentUrl.searchParams.set('areaKey', 'IN|KA|Udupi|Manipal');
    await page.goto(currentUrl.toString());
    await page.waitForLoadState('domcontentloaded');

    // After area selection, seller= must NOT have been resurrected.
    url = new URL(page.url());
    expect(url.searchParams.has('seller')).toBe(false);

    // The remaining chip (ntm=1) must still be visible.
    await expect(page.getByTestId('chip-bool-ntm')).toBeVisible({ timeout: 10_000 });
  });
});
