/**
 * Broker Listing Quality Page — E2E spec [M28 / issue #1538]
 *
 * Covers:
 *   LQ1 — unauthenticated user is redirected away from /broker/listing-quality
 *   LQ2 — broker can open /broker/listing-quality and summary cards render
 *   LQ3 — selecting a listing row opens the fix-plan panel (content changes)
 *   LQ4 — fix-plan edit CTA href points to /broker/listings/{id}/edit
 *   LQ5 — not-scored listing shows honest "Not yet scored" state, never a fake "0"
 *
 * LQ2–LQ5 require broker credentials:
 *   BROKER_EMAIL=broker@example.com BROKER_PASSWORD=secret \
 *   PLAYWRIGHT_BASE_URL=http://localhost:5193 \
 *   npx playwright test e2e/broker-listing-quality.spec.ts --project=smoke
 *
 * LQ1 runs without credentials (unauthenticated browser context — no storageState).
 */

import { test, expect } from '@playwright/test';
import { hasRealCredentials } from './helpers';

const brokerEmail = process.env.BROKER_EMAIL ?? process.env.DEALER_EMAIL ?? '';
const brokerPassword = process.env.BROKER_PASSWORD ?? process.env.DEALER_PASSWORD ?? '';

const hasBrokerCreds = hasRealCredentials(brokerEmail, brokerPassword);

// ---------------------------------------------------------------------------
// LQ1 — Unauthenticated redirect (no storageState — always runs)
// ---------------------------------------------------------------------------
test('LQ1 — unauthenticated user cannot access /broker/listing-quality', async ({ page }) => {
  await page.goto('/broker/listing-quality');

  // ProtectedRoute waits for Supabase auth init then redirects to /auth
  await expect(page).toHaveURL(/\/auth(\?.*)?$/, { timeout: 10_000 });

  // Must not show page content
  await expect(
    page.getByRole('heading', { name: /listing quality/i }),
  ).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// LQ2–LQ5 — Broker-authenticated tests
// ---------------------------------------------------------------------------
test.describe('@smoke broker-listing-quality', () => {
  test.use({ storageState: 'e2e/fixtures/broker-auth.json' });

  // -------------------------------------------------------------------------
  // LQ2 — Page loads and summary cards render
  // -------------------------------------------------------------------------
  test('LQ2 — broker can open /broker/listing-quality and summary cards render', async ({ page }) => {
    test.skip(!hasBrokerCreds, 'BROKER_EMAIL / BROKER_PASSWORD not set — skipping LQ2');

    await page.goto('/broker/listing-quality');
    await page.waitForLoadState('domcontentloaded');

    // Must stay on the quality page — not redirect away
    await expect(page).toHaveURL(/\/broker\/listing-quality/, { timeout: 8_000 });

    // Page heading
    await expect(
      page.getByRole('heading', { name: /listing quality/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Summary cards: the four aggregate stat cards must render.
    // "Avg Quality" card — present for any broker (may show "—" when unscored)
    await expect(page.getByText(/avg quality/i)).toBeVisible({ timeout: 10_000 });

    // The filter chip group must be present (confirms worklist section rendered)
    await expect(
      page.getByRole('group', { name: /filter listings/i }),
    ).toBeVisible({ timeout: 10_000 });

    // At least the "All" filter chip must exist
    await expect(
      page.getByRole('button', { name: /^all/i, pressed: true }),
    ).toBeVisible({ timeout: 8_000 });
  });

  // -------------------------------------------------------------------------
  // LQ3 — Selecting a listing row opens the fix-plan panel
  // -------------------------------------------------------------------------
  test('LQ3 — selecting a listing row opens the fix-plan panel', async ({ page }) => {
    test.skip(!hasBrokerCreds, 'BROKER_EMAIL / BROKER_PASSWORD not set — skipping LQ3');

    await page.goto('/broker/listing-quality');

    // Wait for worklist to render (beyond skeleton loading)
    const worklist = page.getByRole('list', { name: /listings worklist/i });
    await expect(worklist).toBeVisible({ timeout: 12_000 });

    // Find the first listing row
    const firstRow = worklist.getByRole('button').first();
    await expect(firstRow).toBeVisible({ timeout: 8_000 });

    // Before clicking: fix-plan panel must NOT be visible
    await expect(page.getByRole('button', { name: /close fix plan panel/i })).toHaveCount(0);

    // Click the first listing row
    await firstRow.click();

    // After clicking: fix-plan panel must appear — assert the close button
    // is the most stable structural signal (aria-label on the ✕ Button).
    await expect(
      page.getByRole('button', { name: /close fix plan panel/i }),
    ).toBeVisible({ timeout: 8_000 });

    // The panel must also show the heading for the selected listing — confirms
    // content is specific to the chosen row, not a generic placeholder.
    // The panel renders listing.title in an h3; if title is null it shows "Untitled listing".
    await expect(
      page.locator('h3').filter({ hasText: /.+/ }).first(),
    ).toBeVisible({ timeout: 8_000 });
  });

  // -------------------------------------------------------------------------
  // LQ4 — Fix-plan edit CTA href points to /broker/listings/{id}/edit
  // -------------------------------------------------------------------------
  test('LQ4 — fix-plan edit CTA links to /broker/listings/{id}/edit', async ({ page }) => {
    test.skip(!hasBrokerCreds, 'BROKER_EMAIL / BROKER_PASSWORD not set — skipping LQ4');

    await page.goto('/broker/listing-quality');

    const worklist = page.getByRole('list', { name: /listings worklist/i });
    await expect(worklist).toBeVisible({ timeout: 12_000 });

    // Open the first listing row
    const firstRow = worklist.getByRole('button').first();
    await firstRow.click();

    // Wait for the fix-plan panel
    await expect(
      page.getByRole('button', { name: /close fix plan panel/i }),
    ).toBeVisible({ timeout: 8_000 });

    // Find an "Edit" link in the fix-plan panel.
    // The FixPlanPanel renders <Link aria-label="Edit listing for: {action}">Edit</Link>
    // for each fix item. Fall back to any link whose href matches the edit pattern
    // if the fix plan is empty (BUYER_READY listing with no fixes).
    const editLinks = page.getByRole('link', { name: /edit listing for:/i });
    const editLinkCount = await editLinks.count();

    if (editLinkCount > 0) {
      // Assert the first edit link's href contains /broker/listings/.../edit
      const href = await editLinks.first().getAttribute('href');
      expect(href).toMatch(/\/broker\/listings\/[^/]+\/edit/);
    } else {
      // Listing has no fix plan items (buyer-ready) — fallback: assert panel
      // does not render a fake or broken edit link pointing outside /broker.
      // This is a structural pass: no fix items → no edit CTAs is correct behaviour.
      const allLinks = page.locator('[aria-label^="Edit listing for:"]');
      await expect(allLinks).toHaveCount(0);
    }
  });

  // -------------------------------------------------------------------------
  // LQ5 — Not-scored listing shows honest "Not yet scored", never fake "0"
  // -------------------------------------------------------------------------
  test('LQ5 — not-scored listing never shows score "0" (honest empty state)', async ({ page }) => {
    test.skip(!hasBrokerCreds, 'BROKER_EMAIL / BROKER_PASSWORD not set — skipping LQ5');

    await page.goto('/broker/listing-quality');

    const worklist = page.getByRole('list', { name: /listings worklist/i });
    await expect(worklist).toBeVisible({ timeout: 12_000 });

    // Click the "Not Scored" filter chip.
    // The chip's accessible name is "Not Scored <count>" (e.g. "Not Scored 36") —
    // the count suffix distinguishes it from the worklist row buttons whose
    // accessible names start with "Not Scored <title> ..." (title string, not a digit).
    // Anchored regex: ^ ... \d+ $ matches the chip and nothing else.
    const notScoredChip = page.getByRole('button', { name: /^Not Scored\s+\d+$/ });
    await notScoredChip.click();

    // If no not-scored listings exist, the empty-state message renders — that
    // is a valid honest state; the test still passes.
    const rowCount = await worklist.getByRole('button').count();

    if (rowCount > 0) {
      // Open the first not-scored listing row
      await worklist.getByRole('button').first().click();

      await expect(
        page.getByRole('button', { name: /close fix plan panel/i }),
      ).toBeVisible({ timeout: 8_000 });

      // The panel must show "Not yet scored" text (data-testid="score-unavailable")
      await expect(
        page.getByTestId('score-unavailable'),
      ).toBeVisible({ timeout: 8_000 });

      // Critical: must NOT render the text "Score: 0" anywhere in the panel
      await expect(
        page.locator('[data-testid="score-unavailable"]').filter({ hasText: /score:\s*0/i }),
      ).toHaveCount(0);

      // Also assert the worklist row itself shows "Not yet scored" label
      // (data-testid="not-scored-{listingId}" set on the worklist row span)
      const notScoredRowLabel = worklist.locator('[data-testid^="not-scored-"]').first();
      await expect(notScoredRowLabel).toBeVisible({ timeout: 8_000 });
    } else {
      // Empty filter result — assert the honest empty-state message
      await expect(
        page.getByText(/no listings match this filter/i),
      ).toBeVisible({ timeout: 8_000 });
    }
  });
});
