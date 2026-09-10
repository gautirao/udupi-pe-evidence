/**
 * Real-backend Discover map driving helpers (#2446).
 *
 * Extracted verbatim in behaviour from e2e/discover-real-data-smoke.spec.ts so the
 * dedicated canonical-Udupi smoke (e2e/discover-udupi-canonical-smoke.spec.ts) can
 * walk the same real anonymous click path without the Bangalore spec being touched
 * (that file keeps its own private copies — folding it onto this module is a
 * follow-up, deliberately out of #2446's "no unrelated test changes" scope).
 *
 * Every helper waits on REAL app state (URL camera, element existence) rather than
 * sleeping, and ends in a hard assertion so an unreachable target fails loudly.
 */

import { expect, type Locator, type Page } from '@playwright/test';

export function urlParam(page: Page, name: string): string | null {
  return new URL(page.url()).searchParams.get(name);
}

export function urlZoom(page: Page): number {
  return Number(urlParam(page, 'zoom') ?? 0);
}

/**
 * Dismiss the Discover telemetry-consent banner before driving the map. DECLINE is
 * chosen deliberately: it is the privacy-preserving option, and the specs must not
 * depend on telemetry being switched on.
 */
export async function declineConsentBannerIfPresent(page: Page): Promise<void> {
  const banner = page.getByTestId('discover-consent-banner');
  if (await banner.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await banner.getByRole('button', { name: /decline/i }).click();
    await expect(banner).not.toBeVisible({ timeout: 5_000 });
  }
}

/**
 * Click the map's own zoom control with a real synthetic mouse click at a point
 * `elementFromPoint` proves is genuinely the control (the floating `discover-badge`
 * pill can sit partly on top of it). Throws if no such point exists.
 */
export async function clickMapZoomControl(page: Page, direction: 'in' | 'out'): Promise<void> {
  const btn = page.locator(`.leaflet-control-zoom-${direction}`);
  await expect(btn, `the Discover map "zoom ${direction}" control must be available`).toBeVisible({ timeout: 10_000 });
  const box = await btn.boundingBox();
  if (!box) {
    throw new Error(`leaflet zoom-${direction} control has no bounding box`);
  }
  const candidates: Array<[number, number]> = [
    [box.x + box.width / 2, box.y + box.height / 2],
    [box.x + box.width - 2, box.y + box.height / 2],
    [box.x + box.width - 2, box.y + 2],
    [box.x + 2, box.y + 2],
  ];
  for (const [x, y] of candidates) {
    const reachable = await page.evaluate(
      ([px, py, sel]) =>
        Boolean((document.elementFromPoint(px as number, py as number) as Element | null)?.closest(sel as string)),
      [x, y, `.leaflet-control-zoom-${direction}`] as [number, number, string],
    );
    if (!reachable) continue;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.up();
    return;
  }
  throw new Error(`leaflet zoom-${direction} control is fully obscured by a floating overlay`);
}

/**
 * Is this marker actually clickable — rendered AND inside the visible viewport?
 * Leaflet keeps off-screen markers in the DOM, and `toBeVisible()` is satisfied by
 * them, so a click at their coordinates would land on nothing.
 */
export async function markerHittable(page: Page, locator: Locator): Promise<boolean> {
  if ((await locator.count()) === 0) return false;
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('page has no viewport size');
  const box = await locator.first().boundingBox();
  if (!box) return false;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  return cx >= 0 && cy >= 0 && cx <= viewport.width && cy <= viewport.height;
}

/** The visual cluster currently swallowing `nodeKey`, if any (AREA keys appear unprefixed). */
export function clusterContaining(page: Page, nodeKey: string): Locator {
  const member = nodeKey.replace(/^a:/, '');
  return page.locator(`[data-testid="area-visual-cluster-marker"][data-node-key*="${member}"]`);
}

/** The cluster-focus panel entry for `nodeKey`. */
export function clusterFocusMember(page: Page, nodeKey: string): Locator {
  return page.locator(`[data-testid="areas-cluster-focus-member-${nodeKey}"]`);
}

/** Real synthetic mouse click at a locator's own bounding-box centre. */
export async function clickLocatorCentre(page: Page, locator: Locator): Promise<void> {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('locator has no bounding box');
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
}

/**
 * Walk the real supported anonymous click path until `nodeKey` is activated:
 * its own marker, its cluster-focus row, break open the cluster holding it, and
 * only then zoom in. Ends in a hard assertion.
 */
export async function activateMapNode(
  page: Page,
  testId: string,
  nodeKey: string,
  maxSteps = 10,
): Promise<void> {
  const target = page.locator(`[data-testid="${testId}"][data-node-key="${nodeKey}"]`);
  const focusRow = clusterFocusMember(page, nodeKey);

  await page
    .locator(
      '[data-testid="area-destination-marker"], [data-testid="area-single-marker"], [data-testid="area-visual-cluster-marker"]',
    )
    .first()
    .waitFor({ state: 'attached', timeout: 15_000 })
    .catch(() => {
      // Non-fatal: the loop below is the recovery, and its closing assertion
      // still fails loudly if nothing ever renders.
    });

  for (let i = 0; i < maxSteps; i += 1) {
    if (await markerHittable(page, target)) {
      await clickLocatorCentre(page, target.first());
      return;
    }
    if (await markerHittable(page, focusRow)) {
      await clickLocatorCentre(page, focusRow.first());
      return;
    }

    const cluster = clusterContaining(page, nodeKey);
    if (await markerHittable(page, cluster)) {
      const urlBefore = page.url();
      await clickLocatorCentre(page, cluster.first());
      await expect
        .poll(() => page.url(), {
          message: `clicking the visual cluster holding ${nodeKey} must change the app's URL state`,
          timeout: 10_000,
        })
        .not.toBe(urlBefore);
      continue;
    }

    const zoomBefore = urlZoom(page);
    await clickMapZoomControl(page, 'in');
    await expect
      .poll(() => urlZoom(page), {
        message: `the map "Zoom in" control must advance the URL zoom past ${zoomBefore}`,
        timeout: 10_000,
      })
      .toBeGreaterThan(zoomBefore);
  }

  expect(
    (await markerHittable(page, target)) || (await markerHittable(page, focusRow)),
    `${nodeKey} must become activatable — as its own ${testId}, or as a row in the ` +
      'cluster-focus panel — before this journey can continue',
  ).toBe(true);
}
