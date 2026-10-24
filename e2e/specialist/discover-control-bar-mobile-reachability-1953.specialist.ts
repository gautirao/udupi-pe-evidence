/**
 * E2E regression guard — Issue #1953 FIX3: control bar mobile reachability.
 *
 * Real-browser hit-testing (`document.elementFromPoint`) for a defect class
 * that jsdom/unit tests structurally cannot see: at 390×844 the control
 * bar's Buy/Rent segment and area-search input were CSS-visible (a
 * `toBeVisible()`-style check would have passed) but were actually
 * intercepted by the mobile "Map" trigger, a `fixed top-20 right-4` button
 * anchored into the same top-right space the control bar was later mounted
 * into. jsdom has no layout engine and no `elementFromPoint`, so an
 * overlapping `fixed` element is invisible to a unit test — this spec is
 * the layer that can actually catch it.
 *
 * Author note: written per the #1953 FIX3 task instructions but NOT run by
 * the authoring specialist — the worktree owner reserves the dev-server /
 * Playwright ports for this task (unit tests only was the constraint this
 * spec was authored under). Run locally with:
 *   bash scripts/run-e2e-local.sh --project=full e2e/discover/control-bar-mobile-reachability-1953.spec.ts
 */

import { test, expect } from './support/specialist-test';
import type { Page, Route } from '@playwright/test';

const CITY = 'bangalore';
// Exact defect viewport from the #1953 hit-test report (390×844).
const VIEWPORT = { width: 390, height: 844 };

const DISCOVER_AREAS_FIXTURE = {
  city: CITY,
  // ADVERSARIAL BY DESIGN. This is a LAYOUT guard, and row width is a function of
  // content, so a fixture of short convenient names would guard nothing — it would pass
  // while production data overflowed, i.e. blind to the exact regression it exists to
  // catch. These are the THREE LONGEST REAL Bangalore area names in the seeded data
  // (43, 38 and 37 chars), read from GET /api/discover/areas?city=bangalore.
  areas: [
    {
      areaKey: 'IN|KA|Bangalore|BangaloreCityMunicipalCorporationLayout',
      name: 'Bangalore City Municipal Corporation Layout',
      geoCenterLat: 12.97,
      geoCenterLon: 77.64,
      listingCount: 4,
      schoolCount: 1,
    },
    {
      areaKey: 'IN|KA|Bangalore|KannamangalaWhitefieldHoskoteRoad',
      name: 'Kannamangala - Whitefield Hoskote Road',
      geoCenterLat: 12.98,
      geoCenterLon: 77.75,
      listingCount: 3,
      schoolCount: 1,
    },
    {
      areaKey: 'IN|KA|Bangalore|RamanashreeCaliforniaGardensLayout',
      name: 'Ramanashree California Gardens Layout',
      geoCenterLat: 12.99,
      geoCenterLon: 77.66,
      listingCount: 2,
      schoolCount: 0,
    },
  ],
};

const CITY_LISTINGS_FIXTURE = { city: CITY, limitPerArea: 50, areas: [] };
const EMPTY_LISTINGS_FIXTURE = {
  content: [],
  page: 0,
  size: 50,
  totalElements: 0,
  totalPages: 0,
  aggregates: { topLocalities: [] },
};

function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function stubBaseRoutes(page: Page): Promise<void> {
  await page.route('**/api/trends/options**', (route) =>
    fulfillJson(route, 200, { city: CITY, defaultAreas: [] }),
  );
  await page.route('**/api/discover/cities/*/listings**', (route) =>
    fulfillJson(route, 200, CITY_LISTINGS_FIXTURE),
  );
  await page.route('**/api/discover/listings**', (route) =>
    fulfillJson(route, 200, EMPTY_LISTINGS_FIXTURE),
  );
  await page.route('**/api/discover/areas**', (route) =>
    fulfillJson(route, 200, DISCOVER_AREAS_FIXTURE),
  );
  await page.route('**/api/discover/markers**', (route) => fulfillJson(route, 200, []));
  await page.route('**/api/public/schools/popular**', (route) => fulfillJson(route, 200, []));
}

/**
 * Ground-truth reachability: is the element the browser would ACTUALLY
 * deliver a click to, at this testId's on-screen center, the element
 * itself (or a descendant — e.g. an icon inside a button) — not some other
 * element (or overlay) occupying the same screen point. This is exactly
 * what `document.elementFromPoint` answers and `toBeVisible()` does not: a
 * CSS-visible element can still be hit-test-blocked by something stacked on
 * top of it, which is the precise #1953 defect (control bar controls were
 * visible; the `fixed` Map trigger sat on top of two of them).
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

test.describe('Issue #1953 FIX3 — control bar mobile reachability (390×844)', () => {
  test.use({ viewport: VIEWPORT });

  test('city select, Buy/Rent, area input, and the Map trigger are all hit-testable — none blocked by another control', async ({
    page,
  }) => {
    await stubBaseRoutes(page);

    await page.goto(`/discover?city=${CITY}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('discover-control-bar')).toBeVisible({ timeout: 10_000 });

    // Every control-bar control must resolve elementFromPoint to itself (or
    // a descendant) — not to the Map trigger, or anything else, covering it.
    for (const testId of [
      'control-bar-city-select',
      'control-bar-intent-selector',
      'control-bar-area-input',
      'control-bar-map-trigger',
    ]) {
      expect(
        await isHitTestable(page, testId),
        `${testId} must be hit-testable, not blocked by another element`,
      ).toBe(true);
    }

    // No horizontal scroll on the bar — a control merely scrolled
    // off-screen is still unreachable, so wrapping (not scrolling) is the
    // only acceptable fix shape.
    const barOverflow = await page.evaluate(() => {
      const bar = document.querySelector('[data-testid="discover-control-bar-row"]');
      if (!bar) return null;
      return { scrollWidth: bar.scrollWidth, clientWidth: bar.clientWidth };
    });
    expect(barOverflow, 'discover-control-bar-row must be present').not.toBeNull();
    expect(barOverflow!.scrollWidth).toBeLessThanOrEqual(barOverflow!.clientWidth);
  });

  test('the city dropdown menu opens un-clipped and its options are hit-testable', async ({
    page,
  }) => {
    await stubBaseRoutes(page);

    await page.goto(`/discover?city=${CITY}`);
    await page.waitForLoadState('networkidle');

    await page.getByTestId('control-bar-city-select').getByRole('button').click();

    const listbox = page.getByTestId('control-bar-city-listbox');
    await expect(listbox).toBeVisible({ timeout: 5_000 });

    // A dropdown clipped by an overflow ancestor reports a near-zero-height
    // box even in configurations where toBeVisible() still passes on the
    // (visually clipped) element — assert real rendered pixels.
    const box = await listbox.boundingBox();
    expect(box, 'city listbox must be measurable').not.toBeNull();
    expect(box!.height).toBeGreaterThan(10);

    // The option itself must be hit-testable, not just "present in the DOM".
    expect(
      await isHitTestable(page, 'control-bar-city-option-bangalore'),
      'control-bar-city-option-bangalore must be hit-testable, not clipped',
    ).toBe(true);
  });
});
