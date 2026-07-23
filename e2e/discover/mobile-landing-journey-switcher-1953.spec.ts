/**
 * E2E — Issue #1953 follow-up: mobile LANDING mode selector, one-row layout
 * (390×844), product-owner BLOCKING defect.
 *
 * Real-browser measurement for a defect class jsdom/unit tests structurally
 * cannot see: at 390×844 the landing JourneySwitcher (three full journey
 * cards, `compact=false`) previously stacked vertically and consumed ~91% of
 * the viewport (measured: heights [259,243,243], tops [220,491,746], stack
 * 769px). The frozen mock (`ui_kits/new_discover/index.html`) proves the same
 * three options fit in ONE row at ~122px tall. This spec is the ground-truth
 * proof that the fix matches the mock's order of magnitude, not just a
 * "looks right" screenshot — height, tops, and per-tab hit-testability are
 * all measured via `getBoundingClientRect()` / `document.elementFromPoint`,
 * exactly like the sibling FIX3 spec (control-bar-mobile-reachability-1953).
 *
 * ── Consent decision (same rationale as the sibling #1953 specs) ───────────
 * NOT pre-granted via an init script — the real first-visit state, banner and
 * all, is what a first-time mobile user actually sees stacked above/below
 * this exact control.
 *
 * Run locally (dev server already up on :5174, per the task brief):
 *   npx playwright test --project=full e2e/discover/mobile-landing-journey-switcher-1953.spec.ts
 */

import { test, expect, type Page, type Route } from '@playwright/test';

const CITY = 'bangalore';
const VIEWPORT = { width: 390, height: 844 };

const DISCOVER_AREAS_FIXTURE = {
  city: CITY,
  areas: [
    { areaKey: 'IN|KA|Bangalore|Indiranagar', name: 'Indiranagar', geoCenterLat: 12.97, geoCenterLon: 77.64, listingCount: 12, schoolCount: 2 },
    { areaKey: 'IN|KA|Bangalore|Whitefield', name: 'Whitefield', geoCenterLat: 12.98, geoCenterLon: 77.75, listingCount: 18, schoolCount: 3 },
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
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function stubBaseRoutes(page: Page): Promise<void> {
  await page.route('**/api/trends/options**', (route) => fulfillJson(route, 200, { city: CITY, defaultAreas: [] }));
  await page.route('**/api/discover/cities/*/listings**', (route) => fulfillJson(route, 200, CITY_LISTINGS_FIXTURE));
  await page.route('**/api/discover/listings**', (route) => fulfillJson(route, 200, EMPTY_LISTINGS_FIXTURE));
  await page.route('**/api/discover/areas**', (route) => fulfillJson(route, 200, DISCOVER_AREAS_FIXTURE));
  await page.route('**/api/discover/markers**', (route) => fulfillJson(route, 200, []));
  await page.route('**/api/public/schools/popular**', (route) => fulfillJson(route, 200, []));
}

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

const TAB_TESTIDS = ['journey-card-area-first', 'journey-card-school-first', 'journey-card-agri-first'];

test.describe('Issue #1953 follow-up — mobile LANDING mode selector one-row layout (390×844)', () => {
  test.use({ viewport: VIEWPORT });

  test('three journey tabs render in ONE row, at the mock order of magnitude, all hit-testable, consent banner present', async ({
    page,
  }) => {
    await stubBaseRoutes(page);

    await page.goto(`/discover?city=${CITY}`);
    await expect(page.getByTestId('journey-switcher-section')).toBeVisible({ timeout: 15_000 });

    // Real first-load path — dismiss the consent banner like an actual user
    // would, if it renders at all (r.4: run WITH the banner present).
    const consentBanner = page.getByTestId('discover-consent-banner');
    if (await consentBanner.isVisible().catch(() => false)) {
      await consentBanner.getByRole('button', { name: /accept/i }).click();
      await expect(consentBanner).not.toBeVisible();
    }

    for (const testId of TAB_TESTIDS) {
      await expect(page.getByTestId(testId)).toBeVisible();
    }

    // ── Ground-truth geometry: heights, tops, sameRow, total stack height ──
    const boxes = await Promise.all(
      TAB_TESTIDS.map((id) => page.getByTestId(id).boundingBox()),
    );
    for (const box of boxes) {
      expect(box, 'each journey tab must be measurable').not.toBeNull();
    }
    const tops = boxes.map((b) => b!.y);
    const heights = boxes.map((b) => b!.height);
    const bottoms = boxes.map((b) => b!.y + b!.height);
    const stackTop = Math.min(...tops);
    const stackBottom = Math.max(...bottoms);
    const stackHeight = stackBottom - stackTop;
    const maxTopDelta = Math.max(...tops) - Math.min(...tops);
    const sameRow = maxTopDelta < 4; // sub-pixel/rounding tolerance only

    // eslint-disable-next-line no-console
    console.log('[1953 landing-selector geometry]', {
      tops,
      heights,
      stackHeight,
      sameRow,
      viewportHeightPct: Math.round((stackHeight / VIEWPORT.height) * 1000) / 10,
    });

    // r1/r2 — one horizontal row, no scrolling required to see all three.
    expect(sameRow, `tabs must share one row (tops: ${tops.join(', ')})`).toBe(true);
    expect(stackBottom, 'all three tabs must fit inside the 844px viewport without scrolling').toBeLessThanOrEqual(
      VIEWPORT.height,
    );

    // r3 — order of magnitude of the mock's ~122px card, not the old ~769px
    // stack (91% of the viewport). Generous upper bound (200px) still rejects
    // the old stacked shape by more than 3x.
    expect(stackHeight, `selector stack height ${stackHeight}px must be on the order of the mock's ~122px`).toBeLessThan(
      200,
    );

    // r6 — richer than the 37px compact strip.
    for (const h of heights) {
      expect(h).toBeGreaterThan(37);
    }

    // ── Hit-test, not just visibility (r.3 in the evidence discipline) ────
    for (const testId of TAB_TESTIDS) {
      expect(await isHitTestable(page, testId), `${testId} must be hit-testable`).toBe(true);
    }

    // r4 — landing has no selection; do not change that.
    for (const testId of TAB_TESTIDS) {
      await expect(page.getByTestId(testId)).toHaveAttribute('aria-selected', 'false');
    }

    // r7 — no horizontal page overflow.
    const docOverflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(docOverflow.scrollWidth, 'no horizontal page overflow').toBeLessThanOrEqual(docOverflow.clientWidth);

    // r8 — labels readable without hover: title text present without a hover
    // interaction having occurred anywhere in this test.
    await expect(page.getByTestId('journey-card-area-first')).toContainText('Explore by area');
    await expect(page.getByTestId('journey-card-school-first')).toContainText('Search near a school');
    await expect(page.getByTestId('journey-card-agri-first')).toContainText('Find agricultural land');
  });

  test('PINNED KNOWN-BAD: non-landing compact strip 3rd tab is unreachable at 390×844 (pre-existing, not fixed here)', async ({
    page,
  }) => {
    // PINS A KNOWN-BAD BASELINE rather than merely measuring it.
    //
    // The compact-strip 3rd-tab hit-test gap is PRE-EXISTING and deliberately NOT
    // fixed by this landing-only change (this spec never touches the `compact`
    // branch of JourneySwitcher.tsx).
    //
    // An earlier version of this test only console.log'd the numbers and asserted
    // nothing about its own subject. It therefore could not fail for the reason its
    // title claimed, and would have stayed green if the compact strip silently
    // regressed. That is the assertion-free-spec class this repository has an
    // explicit rule against, and review caught it.
    //
    // So it now CHARACTERISES the gap: agri-first is UNREACHABLE at 390 today. That
    // makes it fail loudly in BOTH directions — if someone fixes the gap (good, but
    // this pin must then be updated deliberately) or breaks the other two (bad).
    // A pinned known-bad is honest; a silent measurement is not.
    await stubBaseRoutes(page);
    await page.goto(`/discover?city=${CITY}&journey=area-first&areaKey=${DISCOVER_AREAS_FIXTURE.areas[0].areaKey}`);
    await expect(page.getByTestId('discover-control-bar')).toBeVisible({ timeout: 15_000 });

    const consentBanner = page.getByTestId('discover-consent-banner');
    if (await consentBanner.isVisible().catch(() => false)) {
      await consentBanner.getByRole('button', { name: /accept/i }).click();
      await expect(consentBanner).not.toBeVisible();
    }

    // No runtime self-skip. A test that opts out when its subject is absent reports
    // success for the one case that most needs to fail — if the compact strip is not
    // rendered in this panel state, that is itself the regression.
    await expect(page.getByTestId('journey-switcher-section')).toBeVisible({ timeout: 15_000 });

    const lefts: Record<string, number | null> = {};
    const reachable: Record<string, boolean> = {};
    for (const testId of TAB_TESTIDS) {
      const box = await page.getByTestId(testId).boundingBox();
      lefts[testId] = box ? box.x : null;
      reachable[testId] = await isHitTestable(page, testId);
    }

    // Positive anchor: all three tabs must exist and be laid out, so this cannot
    // pass against an unmounted or empty strip.
    for (const testId of TAB_TESTIDS) {
      expect(lefts[testId], `${testId} must have a layout box`).not.toBeNull();
    }
    // The first two are reachable today and must stay so.
    expect(reachable['journey-card-area-first']).toBe(true);
    expect(reachable['journey-card-school-first']).toBe(true);
    // The third is NOT, because the strip is overflow-x-auto and it sits past the
    // right edge at 390. Pinned deliberately — see the comment above.
    expect(
      reachable['journey-card-agri-first'],
      'agri-first is expected UNREACHABLE at 390 (pre-existing overflow-x-auto gap). '
        + 'If this now fails, the gap was fixed or worsened — update this pin deliberately.',
    ).toBe(false);
  });
});
