/**
 * Broker Market Focus Preferences — E2E spec [M30 / issue #1533]
 *
 * Covers:
 *   BP1 — unauthenticated user is redirected away from /broker/preferences
 *   BP2 — broker can load /broker/preferences and the page heading renders
 *   BP3 — empty state renders when GET /api/broker/market-focus returns []
 *   BP4 — add round-trip: POST fires with {areaKey, propertyType, listingPurpose}
 *         (NO citySlug) and the new row appears with a "manual" badge
 *   BP5 — remove round-trip: DELETE fires and the row disappears
 *
 * BP2–BP5 use:
 *   - broker storageState (test.use({ storageState: 'e2e/fixtures/broker-auth.json' }))
 *   - Playwright route mocking for the 4 market-focus API endpoints so the smoke
 *     is deterministic and does not require the backend stack to be running.
 *
 * Run targeted:
 *   BROKER_EMAIL=broker@example.com BROKER_PASSWORD=secret \
 *   PLAYWRIGHT_BASE_URL=http://localhost:5193 \
 *   npx playwright test e2e/broker-preferences.spec.ts --project=chromium
 *
 * BP1 runs without credentials (unauthenticated browser context — no storageState).
 */

import { test, expect, type Page, type Route } from '@playwright/test';
import { hasRealCredentials } from './helpers';

const brokerEmail = process.env.BROKER_EMAIL ?? process.env.DEALER_EMAIL ?? '';
const brokerPassword = process.env.BROKER_PASSWORD ?? process.env.DEALER_PASSWORD ?? '';

const hasBrokerCreds = hasRealCredentials(brokerEmail, brokerPassword);

// ---------------------------------------------------------------------------
// Mock data — mirrors the API response shape defined in the feature spec
// ---------------------------------------------------------------------------

/** A seeded focus row returned by GET /api/broker/market-focus */
const SEEDED_ROW = {
  citySlug: 'Udupi',
  areaKey: 'IN|KA|Udupi|Manipal',
  propertyType: 'house',
  listingPurpose: 'sale',
  source: 'seeded' as const,
  createdAt: '2026-06-01T10:00:00Z',
};

/** A manual focus row that will appear after BP4's POST completes */
const MANUAL_ROW = {
  citySlug: 'Mangalore',
  areaKey: 'IN|KA|Mangalore|Kadri',
  propertyType: 'apartment',
  listingPurpose: 'rent',
  source: 'manual' as const,
  createdAt: '2026-06-21T10:00:00Z',
};

// ---------------------------------------------------------------------------
// Helper: stub all 4 market-focus API endpoints for a page context.
//
// The helper returns an interceptor object so tests can inspect captured
// request bodies via capturedAddBody / capturedDeleteBody.
// ---------------------------------------------------------------------------

interface StubHandles {
  getStub: (rows: object[]) => Promise<void>;
  capturedAddBody: () => object | null;
  capturedDeleteBody: () => object | null;
}

/**
 * Wire Playwright route stubs for the market-focus API.
 * Call BEFORE page.goto so stubs are active on first load.
 *
 * @param page      - Playwright Page
 * @param initialRows - rows returned by the first GET (may be mutated by tests)
 */
async function stubMarketFocusApi(
  page: Page,
  initialRows: object[],
): Promise<StubHandles> {
  // Mutable state shared across route handlers
  let currentRows: object[] = [...initialRows];
  let capturedAddBodyValue: object | null = null;
  let capturedDeleteBodyValue: object | null = null;

  // GET /api/broker/market-focus — return currentRows (updated after POST)
  await page.route('**/api/broker/market-focus', async (route: Route) => {
    const method = route.request().method();

    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(currentRows),
      });
      return;
    }

    if (method === 'POST') {
      // Capture request body for assertion in BP4
      const bodyText = route.request().postData() ?? '{}';
      capturedAddBodyValue = JSON.parse(bodyText) as object;

      // Simulate server resolving citySlug and appending the manual row
      currentRows = [...currentRows, MANUAL_ROW];

      await route.fulfill({
        status: 204,
        body: '',
      });
      return;
    }

    if (method === 'DELETE') {
      // Capture request body for assertion in BP5
      const bodyText = route.request().postData() ?? '{}';
      capturedDeleteBodyValue = JSON.parse(bodyText) as object;

      // Remove the matching row from state
      const deleted = JSON.parse(bodyText) as { citySlug?: string; areaKey?: string };
      currentRows = currentRows.filter(
        (r) =>
          (r as typeof MANUAL_ROW).areaKey !== deleted.areaKey ||
          (r as typeof MANUAL_ROW).citySlug !== deleted.citySlug,
      );

      await route.fulfill({
        status: 204,
        body: '',
      });
      return;
    }

    // Fallback: continue (should not happen in these tests)
    await route.continue();
  });

  // POST /api/broker/market-focus/seed — return { inserted: 0 } (no live listings)
  await page.route('**/api/broker/market-focus/seed', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ inserted: 0 }),
    });
  });

  return {
    getStub: async (rows: object[]) => {
      currentRows = [...rows];
    },
    capturedAddBody: () => capturedAddBodyValue,
    capturedDeleteBody: () => capturedDeleteBodyValue,
  };
}

// ---------------------------------------------------------------------------
// BP1 — Unauthenticated redirect (no storageState — always runs)
// ---------------------------------------------------------------------------

test('BP1 — unauthenticated user cannot access /broker/preferences', async ({ page }) => {
  await page.goto('/broker/preferences');

  // ProtectedRoute waits for Supabase auth init then redirects to /auth
  await expect(page).toHaveURL(/\/auth(\?.*)?$/, { timeout: 10_000 });

  // Must not show page content
  await expect(
    page.getByRole('heading', { name: /market focus/i }),
  ).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// BP2–BP5 — Broker-authenticated tests (use storageState + route mocks)
// ---------------------------------------------------------------------------

test.describe('@smoke broker-preferences', () => {
  test.use({ storageState: 'e2e/fixtures/broker-auth.json' });

  // -------------------------------------------------------------------------
  // BP2 — Page loads: heading and main landmark render without error
  // -------------------------------------------------------------------------
  test('BP2 — broker can open /broker/preferences and the Market Focus heading renders', async ({ page }) => {
    test.skip(!hasBrokerCreds, 'BROKER_EMAIL / BROKER_PASSWORD not set — skipping BP2');

    // Stub API: return one seeded row so the page is in a non-empty, non-error state
    await stubMarketFocusApi(page, [SEEDED_ROW]);

    await page.goto('/broker/preferences');
    await page.waitForLoadState('domcontentloaded');

    // Must remain on the preferences page — no redirect
    await expect(page).toHaveURL(/\/broker\/preferences/, { timeout: 8_000 });

    // Primary heading must be visible
    await expect(
      page.getByRole('heading', { name: /market focus/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Re-seed action button must be present (always rendered once data loads)
    await expect(
      page.getByRole('button', { name: /re-seed focus areas from live listings/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  // -------------------------------------------------------------------------
  // BP3 — Empty state: EmptyState component renders when GET returns []
  // -------------------------------------------------------------------------
  test('BP3 — empty state renders when broker has no market focus areas', async ({ page }) => {
    test.skip(!hasBrokerCreds, 'BROKER_EMAIL / BROKER_PASSWORD not set — skipping BP3');

    // Stub API: return empty array to trigger empty state
    await stubMarketFocusApi(page, []);

    await page.goto('/broker/preferences');
    await page.waitForLoadState('domcontentloaded');

    await expect(page).toHaveURL(/\/broker\/preferences/, { timeout: 8_000 });

    // EmptyState renders data-testid="empty-state-description" when description prop is set
    const emptyDescription = page.getByTestId('empty-state-description');
    await expect(emptyDescription).toBeVisible({ timeout: 10_000 });

    // The description must mention seeding or adding
    await expect(emptyDescription).toContainText(/seed|add/i);

    // Primary action (seed) must be present
    await expect(
      page.getByRole('button', { name: /seed from my listings/i }),
    ).toBeVisible({ timeout: 8_000 });

    // Secondary action (add a listing) must be present as a link
    await expect(
      page.getByRole('link', { name: /add a listing/i }),
    ).toBeVisible({ timeout: 8_000 });
  });

  // -------------------------------------------------------------------------
  // BP4 — Add round-trip: POST fires with {areaKey, propertyType, listingPurpose}
  //       and NOT citySlug; the new row appears with a "manual" badge
  // -------------------------------------------------------------------------
  test('BP4 — add focus area fires POST without citySlug and row appears with manual badge', async ({ page }) => {
    test.skip(!hasBrokerCreds, 'BROKER_EMAIL / BROKER_PASSWORD not set — skipping BP4');

    const stubs = await stubMarketFocusApi(page, []);

    await page.goto('/broker/preferences');
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/\/broker\/preferences/, { timeout: 8_000 });

    // Wait for the Add form to be visible (card with "Add Focus Area" heading)
    await expect(
      page.getByRole('heading', { name: /add focus area/i }),
    ).toBeVisible({ timeout: 10_000 });

    // --- Fill the Add form ---

    // 1. Select area: "Kadri, Mangalore"
    await page.getByRole('combobox', { name: /select area/i }).click();
    await page.getByRole('option', { name: /kadri/i }).click();

    // 2. Select property type: "Apartment"
    await page.getByRole('combobox', { name: /select property type/i }).click();
    await page.getByRole('option', { name: /^apartment$/i }).click();

    // 3. Select listing purpose: "For Rent"
    await page.getByRole('combobox', { name: /select listing purpose/i }).click();
    await page.getByRole('option', { name: /for rent/i }).click();

    // Capture the POST response before clicking Add
    const postResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/broker/market-focus') &&
        response.request().method() === 'POST',
      { timeout: 8_000 },
    );

    // 4. Click Add
    await page.getByRole('button', { name: /^add$/i }).click();

    // Wait for the POST to complete
    const postResponse = await postResponsePromise;
    expect(postResponse.status()).toBe(204);

    // --- KEY CORRECTNESS GUARANTEE: POST body must NOT contain citySlug ---
    const addBody = stubs.capturedAddBody() as Record<string, unknown> | null;
    expect(addBody).not.toBeNull();
    expect(addBody).not.toHaveProperty('citySlug');
    expect(addBody).toHaveProperty('areaKey', 'IN|KA|Mangalore|Kadri');
    expect(addBody).toHaveProperty('propertyType', 'apartment');
    expect(addBody).toHaveProperty('listingPurpose', 'rent');

    // After the mutation invalidates + GET refetches, the manual row must appear
    // in the list container (aria-label="Market focus areas" on the div — not a
    // landmark region role, so we select it by label attribute).
    const focusList = page.locator('[aria-label="Market focus areas"]');
    await expect(focusList).toBeVisible({ timeout: 8_000 });

    // Area label "Kadri, Mangalore" must appear in the list
    await expect(focusList.getByText(/kadri/i)).toBeVisible({ timeout: 8_000 });

    // The "manual" source badge must be present
    await expect(focusList.getByText('manual')).toBeVisible({ timeout: 8_000 });
  });

  // -------------------------------------------------------------------------
  // BP5 — Remove round-trip: DELETE fires and the manual row disappears
  // -------------------------------------------------------------------------
  test('BP5 — remove manual focus area fires DELETE and row disappears', async ({ page }) => {
    test.skip(!hasBrokerCreds, 'BROKER_EMAIL / BROKER_PASSWORD not set — skipping BP5');

    // Start with one manual row already present
    const stubs = await stubMarketFocusApi(page, [MANUAL_ROW]);

    await page.goto('/broker/preferences');
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/\/broker\/preferences/, { timeout: 8_000 });

    // The focus list must be visible and contain the manual row
    // (aria-label on a div — not a landmark region; select by label attribute)
    const focusList = page.locator('[aria-label="Market focus areas"]');
    await expect(focusList).toBeVisible({ timeout: 10_000 });
    await expect(focusList.getByText(/kadri/i)).toBeVisible({ timeout: 8_000 });

    // Click the remove button for "Kadri, Mangalore"
    await page.getByRole('button', { name: /remove focus area: kadri/i }).click();

    // Confirm dialog appears — click the destructive "Remove" action
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog).toContainText(/remove focus area/i);

    const deleteResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/broker/market-focus') &&
        response.request().method() === 'DELETE',
      { timeout: 8_000 },
    );

    await dialog.getByRole('button', { name: /^remove$/i }).click();

    // Wait for DELETE to complete
    const deleteResponse = await deleteResponsePromise;
    expect(deleteResponse.status()).toBe(204);

    // Verify DELETE body contained the full tuple (citySlug + the 3 fields)
    const deleteBody = stubs.capturedDeleteBody() as Record<string, unknown> | null;
    expect(deleteBody).not.toBeNull();
    expect(deleteBody).toHaveProperty('citySlug', 'Mangalore');
    expect(deleteBody).toHaveProperty('areaKey', 'IN|KA|Mangalore|Kadri');
    expect(deleteBody).toHaveProperty('propertyType', 'apartment');
    expect(deleteBody).toHaveProperty('listingPurpose', 'rent');

    // After the GET refetch, the Kadri row must no longer be visible.
    // When the list empties, EmptyState replaces the list container entirely.
    await expect(focusList.getByText(/kadri/i)).toHaveCount(0, { timeout: 8_000 });
    await expect(page.getByTestId('empty-state-description')).toBeVisible({ timeout: 8_000 });
  });
});
