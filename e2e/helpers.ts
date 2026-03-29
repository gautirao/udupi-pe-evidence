/**
 * Shared e2e test helpers.
 *
 * hasRealCredentials() — use instead of Boolean(email && password) to avoid
 * false positives when .env.e2e contains placeholder values from the example file.
 *
 * loginAs*() — navigate to /auth, fill credentials, wait for redirect.
 *   loginAsAdmin, loginAsBroker, loginAsUser are all identical in implementation
 *   but kept separate for semantic clarity. Use these for tests that explicitly
 *   test the login flow (AT3, Q3). All other auth tests use storageState.
 */

import { type Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Returns true only when ALL provided credential strings are non-empty.
 * Tests skip gracefully when credentials are absent rather than failing
 * with a timeout.
 *
 * @example
 * test.skip(!hasRealCredentials(userEmail, userPassword), 'Creds not configured');
 */
export function hasRealCredentials(...values: string[]): boolean {
  return values.length > 0 && values.every((v) => Boolean(v));
}

/**
 * Sign in as an admin user via the /auth page UI.
 * Waits until the URL no longer matches /auth before returning.
 */
export async function loginAsAdmin(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/auth');
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#signin-email').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('#signin-email').fill(email);
  await page.locator('#signin-password').fill(password);
  await page
    .locator('button[type="submit"]')
    .filter({ hasText: /sign in/i })
    .first()
    .click();
  await expect(page).not.toHaveURL(/\/auth/, { timeout: 10_000 });
}

/**
 * Sign in as a broker user via the /auth page UI.
 * Waits until the URL no longer matches /auth before returning.
 */
export async function loginAsBroker(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/auth');
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#signin-email').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('#signin-email').fill(email);
  await page.locator('#signin-password').fill(password);
  await page
    .locator('button[type="submit"]')
    .filter({ hasText: /sign in/i })
    .first()
    .click();
  await expect(page).not.toHaveURL(/\/auth/, { timeout: 10_000 });
}

/**
 * Sign in as a regular user via the /auth page UI.
 * Waits until the URL no longer matches /auth before returning.
 */
export async function loginAsUser(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/auth');
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#signin-email').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('#signin-email').fill(email);
  await page.locator('#signin-password').fill(password);
  await page
    .locator('button[type="submit"]')
    .filter({ hasText: /sign in/i })
    .first()
    .click();
  await expect(page).not.toHaveURL(/\/auth/, { timeout: 10_000 });
}
