/**
 * Issue #1956 PR-5 — reusable reachability helper implementing the approved
 * plan's `[reachability_definition]` verbatim (team-lead-plan-pr5.toml).
 *
 * "Reachable", per that definition, is NOT "present in the DOM" — it is a
 * six-step mechanical proof, and step 5 (the hit test) is the decisive one:
 * it is what catches a control covered by the z-[60] mobile map overlay, a
 * sheet backdrop, or the consent banner, which `toBeVisible()` alone sails
 * straight past. Every AC5.11-named control must be run through this helper
 * at a TRUE 390x844 viewport — screenshots are supporting evidence only,
 * never the proof.
 */
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export interface ReachabilityResult {
  boundingBox: { x: number; y: number; width: number; height: number };
  meetsRecommendedTouchTarget: boolean;
}

/**
 * Runs steps 1-5 of `[reachability_definition]` against `locator` and
 * returns the measured box for reporting. Step 6 (perform the interaction)
 * is deliberately NOT done here — it is action-specific (click vs a
 * secondary control) and callers perform it themselves immediately after
 * calling this, with no `{ force: true }`, per the definition's own
 * invalidation rule.
 */
export async function assertReachable(page: Page, locator: Locator): Promise<ReachabilityResult> {
  // 1. Visible — rules out display:none / zero-size.
  await expect(locator).toBeVisible();

  // 2. Bring into view only by a means a real user has.
  await locator.scrollIntoViewIfNeeded();

  // 3. Actually within the viewport rectangle after step 2.
  await expect(locator).toBeInViewport();

  // 4. boundingBox() fully inside the viewport.
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('assertReachable: boundingBox() returned null — locator has no layout box');
  }
  const viewport = page.viewportSize();
  if (!viewport) {
    throw new Error('assertReachable: page has no viewport size set (test.use({ viewport }) missing?)');
  }
  expect(box.x, 'boundingBox.x >= 0').toBeGreaterThanOrEqual(0);
  expect(box.y, 'boundingBox.y >= 0').toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, 'boundingBox right edge <= viewport width').toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height, 'boundingBox bottom edge <= viewport height').toBeLessThanOrEqual(viewport.height);

  // 5. HIT TEST — decisive step. document.elementFromPoint at the control's
  // centre must resolve to the control itself or a descendant of it. This
  // is what an occluding z-[60] overlay/sheet-backdrop/consent-banner fails.
  const centreX = box.x + box.width / 2;
  const centreY = box.y + box.height / 2;
  const isHit = await locator.evaluate(
    (el, [cx, cy]) => {
      const atPoint = document.elementFromPoint(cx, cy);
      return atPoint != null && (atPoint === el || el.contains(atPoint));
    },
    [centreX, centreY] as const,
  );
  expect(isHit, 'document.elementFromPoint at the control centre must resolve to it or a descendant').toBe(true);

  return {
    boundingBox: box,
    meetsRecommendedTouchTarget: box.width >= 44 && box.height >= 44,
  };
}

/** See `[reachability_definition].target_size_note` — advisory only, never a blocking gate (#1960 stays out of scope). */
export function reportTouchTargetSize(name: string, result: ReachabilityResult): string {
  const { width, height } = result.boundingBox;
  return `${name}: ${width.toFixed(0)}x${height.toFixed(0)}px (${result.meetsRecommendedTouchTarget ? 'meets' : 'BELOW'} the >=44x44 recommendation)`;
}
