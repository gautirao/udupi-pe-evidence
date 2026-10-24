/**
 * E2E — Issue #1953: desktop simultaneous map + right panel, single-row
 * control bar, live backend.
 *
 * NO page.route() mocks — hits the real backend (real seeded Bangalore
 * data). Companion to mobile-list-map-shell-1953.spec.ts: that spec proves
 * the mobile List/Map shell truly unmounts the map; this spec proves the
 * desktop shape is unaffected — map and right panel are both always
 * present, the mobile Map/List trigger does not exist at this width, the
 * control bar stays a single row with no horizontal scroll, and its three
 * core controls (city, Buy/Rent, area autocomplete) are all present AND
 * interactively usable, not just visible.
 *
 * ── Consent decision ──────────────────────────────────────────────────────
 * Same choice as the mobile spec, for the same reason (see that file's
 * header comment for the full rationale): consent is NOT pre-granted via an
 * init script. The banner is dismissed via a real "Accept" click if it
 * appears, so a future regression that repositions the banner over any of
 * these desktop controls would fail this test rather than being silently
 * invisible to it.
 *
 * Run locally (dev server + backend already up, per the task brief):
 *   npx playwright test --project=full e2e/discover/desktop-control-bar-shell-1953.spec.ts
 */

import { test, expect } from './support/specialist-test';
import type { Page } from '@playwright/test';

const CITY = 'bangalore';
const VIEWPORT = { width: 1366, height: 768 };

/**
 * Ground-truth reachability check (same technique as
 * control-bar-mobile-reachability-1953.spec.ts's isHitTestable): is the
 * element the browser would ACTUALLY deliver a click to, at this locator's
 * on-screen center, the element itself (or a descendant) — not some other
 * element stacked on top of it. Used below instead of a raw `.click()`
 * because a raw click retries against actionability for the full test
 * timeout when something else is intercepting, which turns a real, instant,
 * deterministic defect into a 30s timeout with a noisy trace instead of a
 * clean assertion.
 */
async function isHitTestable(page: Page, testId: string): Promise<boolean> {
  const locator = page.getByTestId(testId).first();
  const box = await locator.boundingBox();
  if (!box) return false;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  return page.evaluate(
    ({ x, y, testId }) => {
      const target = document.querySelector(`[data-testid="${testId}"]`);
      if (!target) return false;
      const hit = document.elementFromPoint(x, y);
      return !!hit && (hit === target || target.contains(hit));
    },
    { x, y, testId },
  );
}

test.describe('Issue #1953 — desktop control bar + simultaneous map/panel (1366×768)', () => {
  test.use({ viewport: VIEWPORT });

  // Shared setup: navigate + real first-load consent handling (see decision
  // note above). Each test below re-runs this from a clean page rather than
  // sharing state, so the known city-dropdown finding (test 2) cannot block
  // or contaminate the other three tests' pass/fail signal.
  async function gotoDiscover(page: Page): Promise<void> {
    await page.goto(`/discover?city=${CITY}`);
    await expect(page.getByTestId('discover-control-bar')).toBeVisible({ timeout: 15_000 });

    const consentBanner = page.getByTestId('discover-consent-banner');
    if (await consentBanner.isVisible().catch(() => false)) {
      await consentBanner.getByRole('button', { name: /accept/i }).click();
      await expect(consentBanner).not.toBeVisible();
    }
  }

  test('map and right panel render simultaneously; no mobile trigger; single-row control bar', async ({
    page,
  }) => {
    await gotoDiscover(page);

    // Map and right panel simultaneously visible — desktop never unmounts
    // DiscoverMapMount (isMobileShell is false above the 820px breakpoint).
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('discover-areas-journey-panel-shell')).toBeVisible();
    await expect(page.getByTestId('areas-journey-panel')).toBeVisible();

    // The mobile Map/List trigger must not exist at all at this width —
    // DiscoverControlBar only receives `mobileMapTrigger` when isMobileShell.
    await expect(page.getByRole('button', { name: 'Map', exact: true })).toHaveCount(0);

    // Single-row control bar: no horizontal scroll on the row itself.
    const barOverflow = await page.evaluate(() => {
      const bar = document.querySelector(
        '[data-testid="discover-control-bar-row"], [data-testid="discover-control-bar"]',
      );
      if (!bar) return null;
      return { scrollWidth: bar.scrollWidth, clientWidth: bar.clientWidth };
    });
    expect(barOverflow, 'discover-control-bar-row must be present').not.toBeNull();
    expect(barOverflow!.scrollWidth).toBeLessThanOrEqual(barOverflow!.clientWidth);

    // No horizontal scroll on the page as a whole.
    const docOverflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(docOverflow.scrollWidth).toBe(docOverflow.clientWidth);
  });

  test('city dropdown option must be hit-testable when open', async ({ page }) => {
    await gotoDiscover(page);

    // ── City select: present, and REACHABLE (not just visible) ───────────
    //
    // REGRESSION GUARD for a fixed defect (was "KNOWN FAILING" in this spec
    // prior to the #1953 occlusion-sweep fix):
    //
    // At the bare city landing (?city=bangalore, no journey/area yet),
    // DiscoverMapCanvas renders ExploreMapPanel ("Explore the map" guidance
    // card) at `absolute z-[1000] top-[66px] left-[18px]`. Issue #1953 moved
    // city selection into the PERSISTENT top-of-page control bar, at the FAR
    // LEFT — directly above where ExploreMapPanel is anchored.
    // CityDropdown's open listbox is a `document.body`-portaled element
    // positioned directly below the trigger
    // (`top: triggerRect.bottom + 6, left: triggerRect.left`), which put it
    // squarely inside ExploreMapPanel's z-[1000] footprint while the listbox
    // itself was only `z-50` — the guidance card's own <p> text node won the
    // hit-test and swallowed the click meant for the "Bangalore" option
    // underneath it.
    //
    // Fix (DiscoverControlBar.tsx): both the city and area-autocomplete
    // portaled listboxes are raised to `z-[1100]`, matching this repo's
    // existing convention for "floating interactive control over map chrome"
    // (AddressPicker.tsx / AddressSearch.tsx / PoiManager.tsx already use
    // z-[1100] for the identical situation). An open, interactive popover
    // must always win a hit-test against static map chrome underneath it.
    //
    // This was the same bug CLASS the #1953 FIX3 spec
    // (control-bar-mobile-reachability-1953.spec.ts) was built to catch
    // (a `fixed`/`absolute` overlay silently covering a control-bar control)
    // — just a different collision pair, on desktop, only reachable once the
    // dropdown is actually opened against the live landing state. Do not
    // "fix" this by dismissing ExploreMapPanel first or re-anchoring the
    // hit-test point — that would hide a defect real first-time desktop
    // users hit on every cold landing in Bangalore (and, per the seeded
    // regions above, every city).
    const citySelect = page.getByTestId('control-bar-city-select');
    await expect(citySelect).toBeVisible();
    await citySelect.getByRole('button').click();
    const cityListbox = page.getByTestId('control-bar-city-listbox');
    await expect(cityListbox).toBeVisible();

    expect(
      await isHitTestable(page, `control-bar-city-option-${CITY}`),
      `control-bar-city-option-${CITY} must be hit-testable when the city dropdown is open — ` +
        'if this fails, a map-chrome overlay (z-[1000]) is covering the portaled city listbox; ' +
        'see the finding comment above this assertion',
    ).toBe(true);

    // Close the dropdown via an outside click rather than the (potentially
    // blocked) option itself.
    await page.mouse.click(VIEWPORT.width - 20, 20);
    await expect(cityListbox).not.toBeVisible();
  });

  test('every city dropdown option is hit-testable when open (full sweep, not just Bangalore)', async ({
    page,
  }) => {
    // Task-brief requirement: "do not report fixed on the basis that the
    // three named options now pass" — this sweeps ALL seven roster entries
    // (both reachable-but-real and disabled-"Soon" placeholders), since the
    // occlusion defect hit real options (Udupi/Mangalore/Bangalore) while
    // leaving disabled placeholders (Mumbai/Pune/Hyderabad) untouched, and a
    // partial check would have missed exactly that asymmetry.
    await gotoDiscover(page);

    await page.getByTestId('control-bar-city-select').getByRole('button').click();
    await expect(page.getByTestId('control-bar-city-listbox')).toBeVisible();

    for (const cityKey of [
      'udupi',
      'kundapur',
      'mangalore',
      'bangalore',
      'mumbai',
      'pune',
      'hyderabad',
    ]) {
      expect(
        await isHitTestable(page, `control-bar-city-option-${cityKey}`),
        `control-bar-city-option-${cityKey} must be hit-testable when the city dropdown is open`,
      ).toBe(true);
    }

    await page.mouse.click(VIEWPORT.width - 20, 20);
  });

  test('Buy/Rent segmented control is usable', async ({ page }) => {
    await gotoDiscover(page);

    // ── Buy/Rent (IntentSelector): present and usable ────────────────────
    // Scoped to the control bar's own instance — DiscoverRightPanel mounts a
    // SECOND IntentSelector with the same child testids
    // (intent-selector-buy/-rent), so an unscoped query would be ambiguous.
    const controlBarIntent = page.getByTestId('control-bar-intent-selector');
    await expect(controlBarIntent).toBeVisible();
    const rentButton = controlBarIntent.getByTestId('intent-selector-rent');
    const buyButton = controlBarIntent.getByTestId('intent-selector-buy');
    await expect(buyButton).toBeVisible();
    await expect(rentButton).toBeVisible();
    await rentButton.click();
    await expect(rentButton).toHaveAttribute('aria-pressed', 'true');
    await expect(buyButton).toHaveAttribute('aria-pressed', 'false');
    // Restore to Buy so this test does not leave a mutated URL/intent as a
    // side effect for anything that might run against the same server after it.
    await buyButton.click();
    await expect(buyButton).toHaveAttribute('aria-pressed', 'true');
  });

  test('area autocomplete surfaces real seeded areas', async ({ page }) => {
    await gotoDiscover(page);

    // ── Area autocomplete: present and usable — typing surfaces real
    //    seeded Bangalore areas from the live backend.
    const areaInput = page.getByTestId('control-bar-area-input');
    await expect(areaInput).toBeVisible();
    await areaInput.fill('a');
    const areaListbox = page.getByTestId('control-bar-area-listbox');
    await expect(areaListbox).toBeVisible({ timeout: 10_000 });
    const areaOptionCount = await areaListbox.getByRole('option').count();
    expect(
      areaOptionCount,
      'typing "a" must surface at least one real seeded Bangalore area',
    ).toBeGreaterThan(0);
  });
});
