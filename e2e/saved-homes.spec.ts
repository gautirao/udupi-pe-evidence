/**
 * Saved Homes round-trip — #1566
 *
 * Single focused happy-path covering the server-backed save/unsave flow end to end:
 *   1. Sign in (storageState fixture — same pattern as UJ1 in user-journeys.spec.ts).
 *   2. Discover: click the heart on a listing card → it fills (aria-pressed=true).
 *   3. /saved-homes: the listing appears in the list.
 *   4. /saved-homes: remove it → it disappears (empty state if it was the only one).
 *   5. Discover: revisit the same card → heart is unfilled again — proves the state
 *      round-tripped through the backend (POST/DELETE /api/me/saved-listings), not a
 *      client-only toggle.
 *
 * Auth: reuses the exact storageState fixture pattern from user-journeys.spec.ts (UJ1) —
 * e2e/fixtures/user-auth.json, written by e2e/global-setup.ts from SMOKE_USER_EMAIL /
 * SMOKE_USER_PASSWORD. No new auth mechanism introduced.
 *
 * Listing source: navigates to the Manipal area on the Udupi Discover map
 * (city=udupi&areaKey=IN|KA|Udupi|Manipal), the same seeded-listing area used by
 * discover-real-data-smoke.spec.ts (J1/J4) and requires the same seed
 * (scripts/seed-discover-listings.mjs) to be present.
 *
 * The listing is re-identified by its rendered title (not a captured id) so the test
 * does not depend on any internal id plumbing — only on the public DOM contract
 * (data-testid="listing-card" / "listing-save-button" / "saved-listing-card").
 *
 * Run locally:
 *   npx playwright test e2e/saved-homes.spec.ts --project=full
 */

import { test, expect } from '@playwright/test';
import { hasRealCredentials } from './helpers';

const userEmail = process.env.SMOKE_USER_EMAIL ?? '';
const userPassword = process.env.SMOKE_USER_PASSWORD ?? '';
const hasUserCreds = hasRealCredentials(userEmail, userPassword);

const MANIPAL_AREA_KEY = 'IN|KA|Udupi|Manipal';
const DISCOVER_URL = `/discover?city=udupi&areaKey=${encodeURIComponent(MANIPAL_AREA_KEY)}`;

test.describe('saved-homes-1566: save/unsave round-trips through /saved-homes', () => {
  // Same fixture UJ1 uses in user-journeys.spec.ts — written by global-setup.ts.
  // Empty storageState is written when creds are absent, so this never throws ENOENT;
  // the test itself skips gracefully via hasUserCreds below.
  test.use({ storageState: 'e2e/fixtures/user-auth.json' });

  test('save a Discover listing, see it on /saved-homes, remove it, heart resets on Discover', async ({ page }) => {
    test.skip(!hasUserCreds, 'SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD not set — skipping saved-homes round-trip');

    // ── Step 1: Discover — locate the first listing card and its heart (save) button ──
    await page.goto(DISCOVER_URL);
    await page.waitForSelector('[data-testid="listing-card"]', { timeout: 15_000 });

    const firstCard = page.locator('[data-testid="listing-card"]').first();
    await expect(firstCard).toBeVisible({ timeout: 10_000 });

    // Re-identify the same listing later by its rendered title rather than an id.
    const cardTitle = (await firstCard.locator('h3').first().innerText()).trim();
    expect(cardTitle.length, 'Discover card must render a non-empty title').toBeGreaterThan(0);

    const saveButton = firstCard.locator('[data-testid="listing-save-button"]');
    await expect(saveButton).toBeVisible({ timeout: 10_000 });

    // Defensive pre-clean: if a prior failed run left this listing saved, unsave it
    // first so the test starts from a known (unsaved) state.
    if ((await saveButton.getAttribute('aria-pressed')) === 'true') {
      await saveButton.click();
      await expect(saveButton).toHaveAttribute('aria-pressed', 'false', { timeout: 10_000 });
    }

    // ── Step 2: Click the heart — fills, flips to the "remove" affordance ──
    await saveButton.click();
    await expect(saveButton).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
    await expect(saveButton).toHaveAttribute('aria-label', 'Remove saved property');

    // ── Step 3: /saved-homes shows the saved listing (server-backed persistence) ──
    await page.goto('/saved-homes');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: 'Saved homes' })).toBeVisible({ timeout: 10_000 });

    const savedCard = page.locator('[data-testid="saved-listing-card"]', { hasText: cardTitle }).first();
    await expect(savedCard).toBeVisible({ timeout: 10_000 });

    const totalSavedBefore = await page.locator('[data-testid="saved-listing-card"]').count();

    // ── Step 4: Remove it from /saved-homes ──
    await savedCard.getByRole('button', { name: 'Remove saved property' }).click();
    await expect(savedCard).toBeHidden({ timeout: 10_000 });

    if (totalSavedBefore === 1) {
      await expect(page.getByText('No saved homes yet.')).toBeVisible({ timeout: 10_000 });
    }

    // ── Step 5: Back on Discover — the same card's heart is unfilled again ──
    await page.goto(DISCOVER_URL);
    await page.waitForSelector('[data-testid="listing-card"]', { timeout: 15_000 });

    const cardAgain = page.locator('[data-testid="listing-card"]', { hasText: cardTitle }).first();
    const saveButtonAgain = cardAgain.locator('[data-testid="listing-save-button"]');
    await expect(saveButtonAgain).toHaveAttribute('aria-pressed', 'false', { timeout: 10_000 });
    await expect(saveButtonAgain).toHaveAttribute('aria-label', 'Save property');
  });
});
