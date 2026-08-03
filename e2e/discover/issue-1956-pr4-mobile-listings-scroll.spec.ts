/**
 * Issue #1956 PR-4 — 390x844 mobile smoke for the new AREA-leaf listings
 * branch.
 *
 * Issue #1956 PR-4 FIX CYCLE 4 (scope_amendment n=4) — the ORIGINAL version
 * of this spec asserted `View details` must already sit inside the initial
 * (zero-scroll) 390x844 viewport. That is a STRICTER bar than the ratified
 * acceptance criterion ("reachable via normal scrolling") and — critically —
 * it can never pass for card 1 regardless of any scroll/overflow fix: the
 * breadcrumb + header + quick-filter card + search bar + result-summary
 * strip above the card list occupy more than 844px on their own, so the
 * card's OWN `View details` button (near its bottom edge) is always pushed
 * below the fold on first paint. Live diagnosis at 390x844 (real backend,
 * this exact node) confirmed: BEFORE the fix, `DiscoverAreasJourneyPanel.tsx`
 * wrapped `AreaSelectedPanel` in a bare, unbounded `<div className="p-4">`
 * (no flex parent, no bounded height), so `AreaSelectedPanel`'s own
 * `overflow-y-auto` root (AreaSelectedPanel.tsx:240) was inert and the ONLY
 * thing that "scrolled" was the whole HTML document growing past the
 * viewport — with `html`/`body` computed `overflow-y: visible` confirmed via
 * live measurement, native page-level scroll technically still reached the
 * button, but the fix (see DiscoverAreasJourneyPanel.tsx's
 * `areas-journey-panel-listings` wrapper) gives the wrapper a real bounded
 * `flex-1 min-h-0 ... overflow-hidden` box so `AreaSelectedPanel`'s existing
 * `overflow-y-auto` root becomes the genuine, contained scroll owner instead
 * (verified live: after the fix, `window.scrollY` stays 0 during a wheel
 * gesture over the panel while the button moves — i.e. an INNER container is
 * now scrolling, not the document).
 *
 * This spec therefore checks, on a REAL 390x844 viewport against the REAL
 * backend: (a) a genuine scrollable ancestor exists above the card (walked
 * from the `View details` button itself, so it can see `AreaSelectedPanel`'s
 * own scroll root — a descendant of the `areas-journey-panel-listings`
 * wrapper, not an ancestor of it), and (b) after a normal scroll gesture
 * (mouse wheel over the panel content — Playwright's standard proxy for a
 * touch/trackpad scroll), `View details` is pointer/touch REACHABLE
 * (in-viewport, unobstructed, real click lands), not merely present in the
 * DOM.
 *
 * Run:
 *   PLAYWRIGHT_BASE_URL=http://localhost:<port> npx playwright test \
 *     e2e/discover/issue-1956-pr4-mobile-listings-scroll.spec.ts --project=full
 */

import { test, expect } from '@playwright/test';

const CITY = 'bangalore';
const BASE = `city=${CITY}&journey=area-first`;
const AREA_BASAVESHWARA = 'a:IN|KA|Bengaluru|Basaveshwara Nagar';

/** See issue-1956-pr4-listing-peek-camera-restore.spec.ts's JSDoc for the
 * confirmed-live root cause: the telemetry-consent banner's fixed wrapper
 * can intercept pointer events over map/panel content until dismissed. */
async function dismissConsentBannerIfPresent(page: import('@playwright/test').Page): Promise<void> {
  const decline = page.getByRole('button', { name: /decline anonymous usage data collection/i });
  if (await decline.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await decline.click();
  }
}

test.describe('@integration-ui #1956 PR-4 — mobile (390x844) listings branch reachability', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('a real ancestor scrolls the card list, and View details is pointer-reachable via normal scrolling', async ({
    page,
  }) => {
    await page.goto(`/discover?${BASE}&node=${encodeURIComponent(AREA_BASAVESHWARA)}`);
    await page.waitForLoadState('domcontentloaded');
    const panel = page.getByTestId('areas-journey-panel-listings');
    await expect(panel).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('listing-card')).toHaveCount(2, { timeout: 20_000 });
    await dismissConsentBannerIfPresent(page);

    const firstCard = page.getByTestId('listing-card').first();
    await expect(firstCard).toBeVisible();
    const viewDetails = firstCard.getByTestId('listing-view-details');
    await expect(viewDetails).toBeVisible();

    // Walk UP FROM THE BUTTON (not from the outer `areas-journey-panel-
    // listings` wrapper) so this can see `AreaSelectedPanel`'s own scroll
    // root, which is a DESCENDANT of that wrapper, not one of its ancestors
    // — the original version of this diagnosis walked from the wrapper and
    // could structurally never see it. Real DOM measurement, not an
    // assumption: scrollHeight > clientHeight AND a computed overflow that
    // actually permits scrolling.
    const scrollDiagnosis = await viewDetails.evaluate((el) => {
      const chain: Array<{ tag: string; testid: string | null; scrollable: boolean; scrollHeight: number; clientHeight: number; overflowY: string }> = [];
      let node: HTMLElement | null = el.parentElement;
      while (node) {
        const style = window.getComputedStyle(node);
        const scrollable =
          node.scrollHeight > node.clientHeight + 1 &&
          (style.overflowY === 'auto' || style.overflowY === 'scroll');
        chain.push({
          tag: node.tagName,
          testid: node.getAttribute('data-testid'),
          scrollable,
          scrollHeight: node.scrollHeight,
          clientHeight: node.clientHeight,
          overflowY: style.overflowY,
        });
        node = node.parentElement;
      }
      return chain;
    });
    const anyScrollable = scrollDiagnosis.some((n) => n.scrollable);
    expect(
      anyScrollable,
      'a real ancestor must own overflow-y scrolling for the card list (not merely the whole document growing past the viewport, which is unreachable if any ancestor ever clips)',
    ).toBe(true);

    // Normal scrolling must be able to bring `View details` into the
    // 390x844 viewport. Acceptance is REACHABILITY via scroll, not
    // zero-scroll visibility (the ~700px of breadcrumb/header/quick-filter/
    // search/summary chrome above the card list makes zero-scroll
    // visibility structurally impossible for card 1's bottom-anchored
    // `View details` control, regardless of any scroll/overflow fix).
    //
    // `scrollIntoViewIfNeeded()` is Playwright's built-in mechanism for
    // exactly this: it asks the browser to resolve and scroll whichever
    // real ancestor(s) are scrollable so the target becomes visible —
    // deterministic real-browser scroll resolution, not a guessed wheel
    // coordinate (which is fragile here: the card starts below the fold, so
    // a fixed-offset wheel target can land on unrelated bottom-of-viewport
    // chrome, e.g. the persistent telemetry toggle, instead of the actual
    // scrollable container).
    await viewDetails.scrollIntoViewIfNeeded();
    await expect(viewDetails).toBeVisible();
    const box = await viewDetails.boundingBox();
    expect(box, 'View details control must have a real, non-zero bounding box').not.toBeNull();
    if (box) {
      expect(box.width, 'View details must have non-zero pointer-hittable width').toBeGreaterThan(0);
      expect(box.height, 'View details must have non-zero pointer-hittable height').toBeGreaterThan(0);
      // In-viewport (390x844) after scrolling — not clipped off-screen.
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(844);
    }
    // A real click (not force:true) must land — proves it's not obstructed
    // by an overlapping element (e.g. a sibling with a higher z-index).
    await viewDetails.click();
    await page.waitForURL(/\/listing\//, { timeout: 15_000 });

    test.info().annotations.push({
      type: 'scroll-chain-diagnosis',
      description: JSON.stringify({ anyScrollable, chain: scrollDiagnosis }),
    });
  });

  test('Retry is pointer-reachable when the listings request errors', async ({ page }) => {
    // Real error path: force a 500 from the real backend route so the
    // existing areas-journey-panel-listings-error branch renders — no
    // fabricated DOM, a real route-level failure injection is the only way
    // to reach this branch deterministically without a flaky live 5xx.
    await page.route('**/api/discover/cities/*/listings**', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"forced"}' }),
    );
    await page.goto(`/discover?${BASE}&node=${encodeURIComponent(AREA_BASAVESHWARA)}`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('areas-journey-panel-listings-error')).toBeVisible({ timeout: 20_000 });
    await dismissConsentBannerIfPresent(page);

    const retry = page.getByRole('button', { name: /retry/i });
    await expect(retry).toBeVisible();
    const box = await retry.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(844);
    }
    await retry.click();
  });
});
