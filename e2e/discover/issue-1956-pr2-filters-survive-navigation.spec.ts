/**
 * Issue #1956 PR-2 — Filters survive parent navigation (Slice 5, AC5.8).
 *
 * Validates the PR-2 CONSUMER/UI against the same FIXTURE-ONLY deterministic
 * promoted shallow tree as the sibling specs in this directory (see
 * `issue-1956-pr2-guarded-hierarchy-back.spec.ts`'s module doc for the full
 * ground truth / generator-vs-consumer disclaimer).
 *
 * Buy/Rent is `intent` in the URL (`city.ts`'s `setIntent` — a REPLACE
 * "preference change, not navigation", 'buy' is the default and omitted from
 * the URL, only 'rent' is ever written). `goToNode`/`goToAncestorNode`
 * (`navigation.ts`) never touch `intent`, so a real cross-navigation survival
 * check is a live assertion that the param is untouched by a level change —
 * not something JSDOM's URLSearchParams alone proves about the real browser
 * address bar / router integration.
 */
import { test, expect, type Page } from '@playwright/test';

const CITY = 'bangalore';
const BASE = `city=${CITY}&journey=area-first`;

const D_W = 'd:w';
const AREA_BASAVESHWARA = 'a:IN|KA|Bengaluru|Basaveshwara Nagar';

function cardTestId(nodeKey: string): string {
  return `navigation-child-card-${nodeKey}`;
}

function urlParam(page: Page, key: string): string | null {
  return new URL(page.url()).searchParams.get(key);
}

test.describe('@integration-ui #1956 PR-2 — Buy/Rent survives hierarchy navigation (AC5.8)', () => {
  test('switching to Rent, then drilling City -> Direction -> Area, keeps intent=rent at every level', async ({
    page,
  }) => {
    await page.goto(`/discover?${BASE}`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('navigation-level-panel')).toBeVisible({ timeout: 15_000 });

    // Positive: the intent control itself is really there before we touch it.
    const rentButton = page.getByTestId('intent-selector-rent');
    await expect(rentButton).toBeVisible();
    expect(urlParam(page, 'intent')).toBeNull(); // 'buy' default, omitted

    await rentButton.click();
    await expect.poll(() => urlParam(page, 'intent')).toBe('rent');
    await expect(rentButton).toHaveAttribute('aria-pressed', 'true');

    // Drill City -> Direction. intent must survive.
    await page.getByTestId(cardTestId(D_W)).click();
    await expect.poll(() => urlParam(page, 'node')).toBe(D_W);
    expect(urlParam(page, 'intent')).toBe('rent');
    await expect(page.getByTestId('intent-selector-rent')).toHaveAttribute('aria-pressed', 'true');

    // Drill Direction -> Area. intent must still survive.
    await page.getByTestId(cardTestId(AREA_BASAVESHWARA)).click();
    await expect.poll(() => urlParam(page, 'node')).toBe(AREA_BASAVESHWARA);
    expect(urlParam(page, 'intent')).toBe('rent');
    await expect(page.getByTestId('intent-selector-rent')).toHaveAttribute('aria-pressed', 'true');

    // And surviving a hierarchy-Back press too (Area -> Direction).
    await expect(page.getByTestId('areas-hierarchy-back')).toBeVisible();
    await page.getByTestId('areas-hierarchy-back').click();
    await expect.poll(() => urlParam(page, 'node')).toBe(D_W);
    expect(urlParam(page, 'intent')).toBe('rent');
    await expect(page.getByTestId('intent-selector-rent')).toHaveAttribute('aria-pressed', 'true');
  });
});
