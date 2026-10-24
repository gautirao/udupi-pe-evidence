/**
 * Issue #2729 — focused functional E2E for the Discover desktop Results reskin, at 1366x768
 * (AFTER only — this spec exercises CompactResultsHeader, the filter pills, and ScopeActionsMenu,
 * none of which exist pre-#2729; running it unmodified against the BEFORE arm is the
 * discriminating proof flow (5) below documents).
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/specialist-test';
import { grantDiscoverConsent, loginAsBroker } from '../helpers';

const SANJEEVINI_NAGAR_NODE = 'a%3AIN%7CKA%7CBengaluru%7CSanjeevini+Nagar';
const SANJEEVINI_NAGAR_RAREA = 'IN%7CKA%7CBengaluru%7CSanjeevini+Nagar';
const KORAMANGALA_RAREA = 'IN%7CKA%7CBengaluru%7CKoramangala';

const SINGLE_AREA_URL = `/discover?city=bangalore&node=${SANJEEVINI_NAGAR_NODE}&rscope=areas&rareas=${SANJEEVINI_NAGAR_RAREA}`;
const MULTI_AREA_URL =
  `/discover?city=bangalore&node=${SANJEEVINI_NAGAR_NODE}&rscope=areas` +
  `&rareas=${SANJEEVINI_NAGAR_RAREA}%2C${KORAMANGALA_RAREA}` +
  `&areaKey=${SANJEEVINI_NAGAR_RAREA}&rprev=areas%3A${SANJEEVINI_NAGAR_RAREA}`;

async function waitForRealCards(page: Page): Promise<void> {
  await expect
    .poll(async () => page.getByTestId('listing-skeleton').count(), { timeout: 20_000 })
    .toBe(0);
  await expect(page.getByTestId('listing-card').first()).toBeVisible({ timeout: 20_000 });
}

test.beforeEach(async ({ page }) => {
  await grantDiscoverConsent(page);
});

test.describe('#2729 — Residential single-area: Budget pill', () => {
  test('changing Budget via its pill popover updates URL priceMax and the result count', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(SINGLE_AREA_URL, { waitUntil: 'networkidle' });
    await waitForRealCards(page);

    const beforeCountText = await page.getByTestId('compact-results-count').textContent();
    const beforeUrl = new URL(page.url());
    expect(beforeUrl.searchParams.get('priceMax')).toBeNull();

    await page.getByTestId('filter-pill-budget').click();
    await expect(page.getByTestId('filter-pill-budget-popover')).toBeVisible();
    const band = page
      .getByTestId('filter-pill-budget-popover')
      .locator('[data-testid^="quick-chip-budget-"]:not([data-testid="quick-chip-budget-any"])')
      .first();
    await expect(band).toBeVisible();
    await band.click();

    // URL reflects the new priceMax — the same param the pre-#2729 stacked toolbar wrote.
    await expect
      .poll(() => new URL(page.url()).searchParams.get('priceMax'), { timeout: 10_000 })
      .not.toBeNull();

    // The pill itself reflects the selection (no longer "Any price"/"Any rent").
    await expect(page.getByTestId('filter-pill-budget')).not.toHaveText(/Any (price|rent)/);

    // List/count updates to match the new (narrower) filter — either the visible card count
    // changed, or at minimum the count label re-rendered against the new filter.
    await waitForRealCards(page);
    const afterCountText = await page.getByTestId('compact-results-count').textContent();
    const cardCount = await page.getByTestId('listing-card').count();
    expect(afterCountText).toContain(String(cardCount));
    // Not asserting beforeCountText !== afterCountText unconditionally — a narrower budget CAN
    // legitimately leave the same count if every fixture listing already fit both bands; the
    // discriminating assertion is the priceMax param + pill-label + count/label agreement above.
    void beforeCountText;
  });
});

test.describe('#2729 — Commercial family switch via the family pill', () => {
  test('switching to Commercial removes the BHK pill, shows the subtype pill, and updates the title', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(SINGLE_AREA_URL, { waitUntil: 'networkidle' });
    await waitForRealCards(page);

    await expect(page.getByTestId('filter-pill-family')).toHaveText(/Residential/);
    await expect(page.getByTestId('filter-pill-bhk')).toBeVisible();
    await expect(page.getByTestId('filter-pill-subtype')).toHaveCount(0);

    await page.getByTestId('filter-pill-family').click();
    await expect(page.getByTestId('filter-pill-family-popover')).toBeVisible();
    await page.getByTestId('quick-chip-family-commercial').click();

    await expect(page.getByTestId('filter-pill-family')).toHaveText(/Commercial/);
    await expect(page.getByTestId('filter-pill-bhk')).toHaveCount(0);
    await expect(page.getByTestId('filter-pill-subtype')).toBeVisible();
    await expect(page.getByTestId('compact-results-title')).toHaveText(/^Commercial properties in /);
  });
});

test.describe('#2729 — multi-area chips and Edit areas menu', () => {
  test('chips present; removing one updates rareas and the title; Edit areas menu lists all four actions', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(MULTI_AREA_URL, { waitUntil: 'networkidle' });
    await waitForRealCards(page);

    const koramangalaChip = page.locator('[data-testid^="area-set-panel-committed-chip-"]', {
      hasText: 'Koramangala',
    });
    const sanjeeviniChip = page.locator('[data-testid^="area-set-panel-committed-chip-"]', {
      hasText: 'Sanjeevini Nagar',
    });
    await expect(koramangalaChip).toBeVisible();
    await expect(sanjeeviniChip).toBeVisible();

    const koramangalaDismiss = koramangalaChip.locator('button[data-testid$="-dismiss"]');
    await koramangalaDismiss.click();

    await expect
      .poll(() => decodeURIComponent(new URL(page.url()).searchParams.get('rareas') ?? ''), {
        timeout: 10_000,
      })
      .not.toContain('Koramangala');

    // With only Sanjeevini Nagar left, the title reverts to the single-area heading (no longer
    // the joined AREA_SET title) — proves the chip removal actually mutated committed scope, not
    // just the chip row's own local state.
    await expect(page.getByTestId('compact-results-title')).not.toContainText('&');

    // Re-open with both areas to verify the menu contract independently of the removal above.
    await page.goto(MULTI_AREA_URL, { waitUntil: 'networkidle' });
    await waitForRealCards(page);
    await page.getByTestId('scope-actions-menu-trigger').click();
    const menu = page.getByTestId('scope-actions-menu-content');
    await expect(menu).toBeVisible();
    await expect(page.getByTestId('area-set-edit-areas')).toBeVisible();
    await expect(page.getByTestId('area-set-clear-areas')).toBeVisible();
    await expect(page.getByTestId('area-set-fit-all')).toBeVisible();
    await expect(page.getByTestId('area-set-create-alert')).toBeVisible();
  });
});

test.describe('#2729 — mobile layout unchanged at 390x844', () => {
  test('no compact toolbar/pills and no CompactResultsHeader on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(SINGLE_AREA_URL, { waitUntil: 'networkidle' });
    await waitForRealCards(page);

    await expect(page.getByTestId('compact-results-header')).toHaveCount(0);
    await expect(page.getByTestId('filter-pill-budget')).toHaveCount(0);
    await expect(page.getByTestId('filter-pill-family')).toHaveCount(0);
    // Issue #2729 (post-merge fix-verify) — `area-filters-sticky` no longer mounts below 1366 by
    // design (the sticky wrapper is now conditional on `isDesktopReskin`, see
    // AreaSelectedPanel.tsx's `filterToolbarNode`); the stacked toolbar renders as a direct child
    // instead. Assert the toolbar shape directly rather than scoping into a wrapper that doesn't
    // exist at this width.
    await expect(page.getByTestId('area-filters-sticky')).toHaveCount(0);
    await expect(page.locator('[data-design-component="filter-toolbar"]')).toHaveCount(1);
    await expect(page.locator('[data-design-component="filter-toolbar-compact"]')).toHaveCount(0);
  });
});

test.describe('#2729 — global search at 1366', () => {
  test('idle/draft/Escape/outside-click/select/Back contract', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(SINGLE_AREA_URL, { waitUntil: 'networkidle' });
    await waitForRealCards(page);

    const input = page.getByTestId('control-bar-area-input');
    await expect(input).toHaveValue('Sanjeevini Nagar');

    // Type a draft, then Escape reverts.
    await input.click();
    await input.fill('Koramangala');
    await expect(input).toHaveValue('Koramangala');
    await input.press('Escape');
    await expect(input).toHaveValue('Sanjeevini Nagar');

    // Type a draft, then an outside click reverts (native blur -> revertDraft).
    await input.click();
    await input.fill('Koramangala');
    await expect(input).toHaveValue('Koramangala');
    await page.getByTestId('compact-results-title').click();
    await expect(input).toHaveValue('Sanjeevini Nagar');

    // Selecting an option navigates.
    await input.click();
    await input.fill('Jayanagar');
    // Exact match — a substring query for "Jayanagar" also matches "Vijayanagar", and `.first()`
    // over an unanchored match is not guaranteed to land on the intended area.
    const option = page.getByRole('option', { name: 'Jayanagar', exact: true });
    await expect(option).toBeVisible();
    await option.click();
    await expect
      .poll(() => decodeURIComponent(page.url()), { timeout: 10_000 })
      .toContain('Jayanagar');
    expect(decodeURIComponent(page.url())).not.toContain('Vijayanagar');

    // Browser Back returns the idle value to the canonical area (Sanjeevini Nagar).
    await page.goBack();
    await waitForRealCards(page);
    await expect(page.getByTestId('control-bar-area-input')).toHaveValue('Sanjeevini Nagar');
  });
});

test.describe('#2729 — signed-in "Options" scope menu: Draw search area closes the menu', () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test.beforeEach(async ({ page }) => {
    await loginAsBroker(page, process.env.BROKER_EMAIL!, process.env.BROKER_PASSWORD!);
    await grantDiscoverConsent(page);
  });

  test('opening Options, clicking "Draw search area" closes the menu AND arms draw mode', async ({ page }) => {
    await page.goto(SINGLE_AREA_URL, { waitUntil: 'networkidle' });
    await waitForRealCards(page);

    const trigger = page.getByTestId('scope-actions-menu-trigger');
    await expect(trigger).toHaveText(/Options/);
    await trigger.click();
    const menuContent = page.getByTestId('scope-actions-menu-content');
    await expect(menuContent).toBeVisible();

    const drawEntry = page.getByTestId('area-set-draw-area');
    await expect(drawEntry).toBeVisible();
    await drawEntry.click();

    // The menu is gone (Radix's default select-closes-menu behaviour, matching every sibling
    // item) — not merely hidden behind something else.
    await expect(menuContent).not.toBeVisible();
    // Draw mode actually started — the real product indicator, not an inferred side effect.
    await expect(page.getByTestId('draw-mode-overlay')).toBeVisible({ timeout: 10_000 });
  });

  test('Escape closes the menu and returns focus to the scope-menu trigger', async ({ page }) => {
    await page.goto(SINGLE_AREA_URL, { waitUntil: 'networkidle' });
    await waitForRealCards(page);

    const trigger = page.getByTestId('scope-actions-menu-trigger');
    await trigger.click();
    await expect(page.getByTestId('scope-actions-menu-content')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByTestId('scope-actions-menu-content')).not.toBeVisible();
    await expect(trigger).toBeFocused();
  });
});
