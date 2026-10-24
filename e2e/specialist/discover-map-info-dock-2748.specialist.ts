/**
 * Issue #2748 — the Map Info Dock (design PR #2747), Areas journey only.
 *
 * Consolidates three previously independently-floating map messages
 * (count pill, anonymous guidance, "Recenter on <city/area>") into one
 * deterministic dock: guidance → count → recenter, exactly one recenter at
 * all times, labelled with the current navigation node.
 *
 * Fixture: `d:southeast` has member areas RR Nagar, Vijayanagar, Nagarbhavi
 * (navigation-hierarchy-fixture-seed.sql). RR Nagar has seeded listings.
 *
 * Run:
 *   PLAYWRIGHT_BASE_URL=http://localhost:5193 BACKEND_BASE_URL=http://localhost:8193 \
 *     npx playwright test e2e/discover-map-info-dock-2748.spec.ts --project=full
 */

import { test, expect } from './support/specialist-test';
import type { Page } from '@playwright/test';

const CITY = 'bangalore';
const RR_NAGAR_NODE = 'a:IN|KA|Bengaluru|RR Nagar';

/**
 * Long enough to wrap to 3+ lines unclamped, and to exceed the dock's width
 * cap if that cap were not applied — same technique (and the same evidence
 * name) as the #2724 pass-4 test this suite supersedes: the real fixture
 * label is too short to organically wrap, so the already-rendered label
 * <span>'s DOM text is overwritten AFTER measuring its real, unforced
 * geometry. Only that one element's text is synthetic; layout/CSS are real.
 */
const FORCED_LONG_LABEL = 'Jayaprakash Narayana Extension & Kodihalli Layout Cross';

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

function intersects(a: BoundingBox, b: BoundingBox): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

/**
 * `Locator.boundingBox()` actionability-waits for the element to exist (up to
 * the default 30s timeout) rather than resolving immediately when nothing
 * matches — a plain `.catch(() => null)` therefore still burns the full
 * timeout for chrome that is legitimately absent in a given state (e.g.
 * "Search this area" outside the viewport-dirty state). `.count()` resolves
 * immediately regardless of match count, so it is checked first.
 */
async function safeBoundingBox(locator: ReturnType<Page['locator']>): Promise<BoundingBox | null> {
  if ((await locator.count()) === 0) return null;
  return locator.first().boundingBox();
}

// Owner feedback (round 5) — the Areas-journey legend variants (desktop only)
// now render as a real flex sibling of the dock in one bottom-left column
// (DiscoverMapSurface.tsx), with no absolute-position class of their own —
// a fixed-offset class selector can no longer find them. Every legend
// wrapper div (DiscoverMapLegend.tsx, both `inline` and `desktopAreaFirstSlot`
// modes) now carries `data-testid="discover-map-legend"` instead — stable
// across all three render modes (mobile-inline, desktop-inline for other
// journeys, desktop-slot for the Areas journey).
const LEGEND_SELECTOR = '[data-testid="discover-map-legend"]';

/**
 * Lane review (pass 4, ADVISORY-FIX #6) — the legend-overlap checks below used
 * to silently no-op (`if (await legend.count())`) whenever the legend wasn't
 * found, which passes identically whether the legend is legitimately absent OR
 * whether a real regression removed/renamed/repositioned it — a silent-pass
 * risk, not a real assertion. Callers that KNOW the legend must be present in
 * their state (area-first landing/area-selected always render a legend
 * variant) use this instead, which fails loudly if it's missing.
 */
async function requireLegendBox(page: Page, label: string): Promise<BoundingBox> {
  const legend = page.locator(LEGEND_SELECTOR);
  await expect(legend.first(), `${label}: the map legend must be present in this state`).toBeVisible({
    timeout: 10_000,
  });
  // Pre-push review (round 5 advisory-fix) — round 5 split legend rendering across TWO
  // call sites (DiscoverMapCanvas's `inline` mode, DiscoverMapSurface's
  // `desktopAreaFirstSlot` mode). `.first()` above would pass silently if BOTH ever
  // rendered the same variant at once (a suppression regression in either call site's
  // `renderAreaFirstVariantsHere`/`renderSchoolRadiusChromeHere` gate) — this catches
  // that duplication loudly, in every state this helper is used for.
  await expect(legend, `${label}: exactly one legend element must render, never a duplicate`).toHaveCount(1);
  const box = await legend.first().boundingBox();
  expect(box, `${label}: legend must have a real bounding box`).not.toBeNull();
  return box as BoundingBox;
}

async function declineConsentBannerIfPresent(page: Page): Promise<void> {
  const banner = page.getByTestId('discover-consent-banner');
  if (await banner.isVisible({ timeout: 5_000 }).catch(() => false)) {
    // Owner feedback (round 6) — at the new 821–1023px band a DIFFERENT, unrelated,
    // pre-existing narrow-shell element (`[@media(max-width:1023px)]:flex-1`, the
    // control bar's own responsive layout) sits over the Decline button. `{force:true}`
    // (tried first) still dispatches a raw mouse event at the button's coordinates,
    // which the browser then hit-tests to the OVERLAPPING element, not the button — the
    // banner never closed. `el.click()` via `.evaluate` invokes the DOM method directly
    // (firing React's onClick synchronously), bypassing hit-testing entirely. That
    // overlap is app-wide narrow-shell behaviour this fix does not touch (nothing in
    // this issue's diff changes DiscoverControlBar) — this is a test-only workaround.
    await banner.getByRole('button', { name: /decline/i }).evaluate((el: HTMLElement) => el.click());
    await expect(banner).not.toBeVisible({ timeout: 5_000 });
  }
}

/**
 * Owner feedback (round 5) — round 4 only asserted "no overlap", which a
 * large fixed worst-case offset trivially satisfied while leaving a big dead
 * gap above the dock. The real flex column (DiscoverMapSurface.tsx) now
 * gives the legend a small, CONSISTENT gap above the dock's actual rendered
 * height — asserted here as a tight, non-trivial numeric bound (0–16px), not
 * just "doesn't touch".
 */
function assertLegendStacksTightlyAbove(
  legendBox: BoundingBox,
  dockBox: BoundingBox,
  mapBox: BoundingBox,
  label: string,
): void {
  expect(intersects(dockBox, legendBox), `${label}: dock must not overlap the legend`).toBe(false);
  const gap = dockBox.y - (legendBox.y + legendBox.height);
  expect(gap, `${label}: legend must sit above the dock (positive gap)`).toBeGreaterThanOrEqual(0);
  expect(gap, `${label}: gap between legend and dock must be small and consistent (≤16px)`).toBeLessThanOrEqual(16);
  // Owner feedback (round 6) — containment in the 821–1023px narrow-desktop band: neither
  // the legend nor the dock itself may float above the map's own top edge, however short
  // the map strip is (DiscoverMapSurface.tsx's `max-h-[calc(100%-14px)] overflow-hidden`).
  expect(legendBox.y, `${label}: legend must stay within the map's top edge`).toBeGreaterThanOrEqual(mapBox.y);
  expect(dockBox.y, `${label}: dock must stay within the map's top edge`).toBeGreaterThanOrEqual(mapBox.y);
}

test.describe('Discover Map Info Dock (#2748)', () => {
  test('desktop 1366x768 — dock rows order guidance -> count -> recenter, one recenter, clear of zoom/attribution/legend', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(`/discover?city=${CITY}`);
    await page.waitForLoadState('domcontentloaded');
    await declineConsentBannerIfPresent(page);

    const dock = page.getByTestId('map-info-dock');
    await expect(dock).toBeVisible({ timeout: 15_000 });
    // A11y fix (pre-push review) — the CARD itself carries no live-region role
    // (it would wrap the sign-in link and recenter button in one atomic
    // announcement); only the count row does, scoped to the text that actually
    // changes.
    await expect(dock).not.toHaveAttribute('role', 'status');
    await expect(page.getByTestId('discover-badge')).toHaveAttribute('role', 'status');

    // Row order: guidance, then count, then recenter (DOM order == visual order,
    // all rows are simple block children with no reordering CSS).
    // The count row keeps the legacy `discover-badge` testid (see MapInfoDock.tsx
    // doc comment) rather than a new `map-info-dock-*` one, so row order is
    // checked via DOM position (compareDocumentPosition) across all three ids.
    const order = await dock.evaluate((el) => {
      const guidance = el.querySelector('[data-testid="map-info-dock-guidance"]');
      const count = el.querySelector('[data-testid="discover-badge"]');
      const recenter = el.querySelector('[data-testid="map-info-dock-recenter"]');
      const before = (a: Element | null, b: Element | null) =>
        !!a && !!b && !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      return {
        guidanceBeforeCount: before(guidance, count),
        countBeforeRecenter: before(count, recenter),
      };
    });
    expect(order.guidanceBeforeCount, 'guidance row must precede the count row').toBe(true);
    expect(order.countBeforeRecenter, 'count row must precede the recenter row').toBe(true);

    // Exactly one recenter control overall.
    await expect(page.getByRole('button', { name: /^Recenter on /i })).toHaveCount(1);
    await expect(page.getByTestId('map-info-dock-recenter')).toHaveAccessibleName('Recenter on Bangalore');

    const dockBox = (await dock.boundingBox()) as BoundingBox;
    const zoomBox = (await page.locator('.leaflet-control-zoom').first().boundingBox()) as BoundingBox;
    const attributionBox = (await page
      .locator('.leaflet-control-attribution')
      .first()
      .boundingBox()) as BoundingBox;
    expect(dockBox).toBeTruthy();
    expect(zoomBox).toBeTruthy();
    expect(attributionBox).toBeTruthy();
    expect(intersects(dockBox, zoomBox), 'dock must not overlap the zoom control').toBe(false);
    expect(intersects(dockBox, attributionBox), 'dock must not overlap attribution').toBe(false);

    const legendBox = await requireLegendBox(page, '1366x768 city landing');
    expect(intersects(dockBox, legendBox), 'dock must not overlap the map legend').toBe(false);
  });

  test('desktop 1440x900 — drilling into an area replaces the recenter label; Back restores the parent', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/discover?city=${CITY}`);
    await page.waitForLoadState('domcontentloaded');
    await declineConsentBannerIfPresent(page);

    const recenter = page.getByTestId('map-info-dock-recenter');
    await expect(recenter).toHaveAccessibleName('Recenter on Bangalore');

    await page.goto(`/discover?city=${CITY}&node=${encodeURIComponent(RR_NAGAR_NODE)}`);
    await page.waitForLoadState('domcontentloaded');
    await declineConsentBannerIfPresent(page);
    await expect(recenter).toHaveAccessibleName('Recenter on RR Nagar');
    // Still exactly one — the legacy area-recenter portal must not coexist.
    await expect(page.getByRole('button', { name: /^Recenter on /i })).toHaveCount(1);
    await expect(page.getByTestId('areas-recenter-button')).toHaveCount(0);
    await expect(page.getByTestId('map-recenter-city-button')).toHaveCount(0);

    await page.goBack();
    await page.waitForLoadState('domcontentloaded');
    await expect(recenter).toHaveAccessibleName('Recenter on Bangalore');
    await expect(page.getByRole('button', { name: /^Recenter on /i })).toHaveCount(1);
  });

  const urlLatLon = (page: Page) => {
    const u = new URL(page.url());
    const lat = u.searchParams.get('lat');
    const lon = u.searchParams.get('lon');
    return lat != null && lon != null ? { lat: Number(lat), lon: Number(lon) } : null;
  };

  const distance = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) =>
    Math.hypot(a.lat - b.lat, a.lon - b.lon);

  /**
   * Pans the map by a real mouse drag. A single large `mouse.move(..., {
   * steps: 10 })` jump did not reliably register as a Leaflet drag (measured:
   * 0 URL change after 1.5s) — a slower, more granular move (small increments
   * with a short pause between them) does. `(cx, cy)` should be an off-centre
   * point on the map (never literal map centre, which at city landing sits
   * under a compass-positioned destination card, not the raw Leaflet surface).
   */
  async function panMap(page: Page, cx: number, cy: number, dx: number, dy: number) {
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    const STEPS = 20;
    for (let i = 1; i <= STEPS; i++) {
      await page.mouse.move(cx + (dx * i) / STEPS, cy + (dy * i) / STEPS);
      await page.waitForTimeout(20);
    }
    await page.mouse.up();
  }

  /**
   * Lane review (pass 4, ADVISORY-FIX #6) — strengthened from "the URL lat/lon
   * changed" (which a click that moves the camera in ANY direction, including
   * further away, would also satisfy) to "the camera moved CLOSER to the
   * target node's own centre than it was right after panning away" — a real
   * proof the recenter targets the correct node, not just that it does
   * something. Covers ROOT (city), a DIRECTION node, and Back-to-ROOT.
   */
  test('desktop — recenter moves the camera CLOSER to the target node (ROOT, a DIRECTION node, and Back-to-ROOT)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    const mapContainer = page.locator('.leaflet-container').first();

    // ---- ROOT (city) ----
    await page.goto(`/discover?city=${CITY}`);
    await page.waitForLoadState('domcontentloaded');
    await declineConsentBannerIfPresent(page);
    const recenter = page.getByTestId('map-info-dock-recenter');
    await expect(recenter).toHaveAccessibleName('Recenter on Bangalore');
    await expect(mapContainer).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(() => urlLatLon(page), { message: 'city-root camera-sync must settle lat/lon first', timeout: 15_000 })
      .not.toBeNull();
    const cityTarget = urlLatLon(page) as NonNullable<ReturnType<typeof urlLatLon>>;

    const mapBox = await mapContainer.boundingBox();
    expect(mapBox, 'map container needs a real bounding box to be dragged').not.toBeNull();
    const { x, y, width, height } = mapBox as NonNullable<typeof mapBox>;
    // Off-centre, not the literal map centre: at city landing the centre point
    // sits under a compass-positioned destination card, not the raw Leaflet
    // surface, and a drag starting there does not register as a map pan
    // (measured: 0 URL change). Top-right quadrant is clear of both the compass
    // cards and the dock's own bottom-left footprint.
    const cx = x + width * 0.85;
    const cy = y + height * 0.15;

    await panMap(page, cx, cy, -250, 150);
    await expect
      .poll(() => urlLatLon(page)?.lat, { message: 'panning must move the camera (URL lat changes)', timeout: 10_000 })
      .not.toBe(cityTarget.lat);
    const pannedAwayFromCity = urlLatLon(page) as NonNullable<ReturnType<typeof urlLatLon>>;
    const distanceAfterPan = distance(pannedAwayFromCity, cityTarget);

    await recenter.click();
    await expect
      .poll(
        () => {
          const now = urlLatLon(page);
          return now ? distance(now, cityTarget) : Infinity;
        },
        {
          message: 'clicking the dock recenter at city ROOT must move the camera CLOSER to the city centre',
          timeout: 10_000,
        },
      )
      .toBeLessThan(distanceAfterPan);

    // ---- DIRECTION node (South-East Bangalore) ----
    await page.goto(`/discover?city=${CITY}&node=d:southeast`);
    await page.waitForLoadState('domcontentloaded');
    await declineConsentBannerIfPresent(page);
    await expect(recenter).toHaveAccessibleName('Recenter on South-East Bangalore');
    await expect
      .poll(() => urlLatLon(page), { message: 'direction node camera-sync must settle lat/lon first', timeout: 15_000 })
      .not.toBeNull();
    const directionTarget = urlLatLon(page) as NonNullable<ReturnType<typeof urlLatLon>>;

    await panMap(page, cx, cy, -250, 150);
    await expect
      .poll(() => urlLatLon(page)?.lat, { message: 'panning must move the camera away from the direction node', timeout: 10_000 })
      .not.toBe(directionTarget.lat);
    const pannedAwayFromDirection = urlLatLon(page) as NonNullable<ReturnType<typeof urlLatLon>>;
    const distanceAfterPanDirection = distance(pannedAwayFromDirection, directionTarget);

    await recenter.click();
    await expect
      .poll(
        () => {
          const now = urlLatLon(page);
          return now ? distance(now, directionTarget) : Infinity;
        },
        {
          message: 'clicking the dock recenter at a DIRECTION node must move the camera CLOSER to that node',
          timeout: 10_000,
        },
      )
      .toBeLessThan(distanceAfterPanDirection);

    // ---- Back from a node to ROOT ----
    // A fresh ROOT navigation first: the DIRECTION-node section above already
    // pushed a history entry via `page.goto`, so `goBack()` after the next
    // `goto` would otherwise pop back to THAT entry (South-East Bangalore),
    // not to ROOT — measured: this exact staleness produced "Recenter on
    // South-East Bangalore" here before this fresh navigation was added.
    await page.goto(`/discover?city=${CITY}`);
    await page.waitForLoadState('domcontentloaded');
    await declineConsentBannerIfPresent(page);
    await page.goto(`/discover?city=${CITY}&node=${encodeURIComponent(RR_NAGAR_NODE)}`);
    await page.waitForLoadState('domcontentloaded');
    await declineConsentBannerIfPresent(page);
    await page.goBack();
    await page.waitForLoadState('domcontentloaded');
    await expect(recenter).toHaveAccessibleName('Recenter on Bangalore');
    await expect
      .poll(() => urlLatLon(page), { message: 'camera must settle lat/lon after Back', timeout: 15_000 })
      .not.toBeNull();

    await panMap(page, cx, cy, 150, 300);
    await expect
      .poll(() => urlLatLon(page)?.lat, { message: 'panning after Back must move the camera', timeout: 10_000 })
      .not.toBe(cityTarget.lat);
    const pannedAfterBack = urlLatLon(page) as NonNullable<ReturnType<typeof urlLatLon>>;
    const distanceAfterPanBack = distance(pannedAfterBack, cityTarget);

    await recenter.click();
    await expect
      .poll(
        () => {
          const now = urlLatLon(page);
          return now ? distance(now, cityTarget) : Infinity;
        },
        {
          message: 'clicking the dock recenter after Back-to-city must move the camera CLOSER to the city centre',
          timeout: 10_000,
        },
      )
      .toBeLessThan(distanceAfterPanBack);
  });

  test('desktop — guidance is absent once an area (a listing-capable scope) is selected', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(`/discover?city=${CITY}&node=${encodeURIComponent(RR_NAGAR_NODE)}`);
    await page.waitForLoadState('domcontentloaded');
    await declineConsentBannerIfPresent(page);

    await expect(page.getByTestId('map-info-dock')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('map-info-dock-guidance')).toHaveCount(0);
    await expect(page.getByTestId('discover-badge')).toBeVisible();
  });

  /**
   * Lane review — live-browser finding: because markers move freely under the
   * map's real geography as it pans/zooms (not a fixed compass layout), a
   * destination/direction marker CAN land inside the dock's fixed footprint.
   * Proven directly: `document.elementFromPoint` at a marker's click point
   * resolved to inside `[data-testid="map-info-dock"]`, and J1
   * (discover-real-data-smoke.spec.ts) hit exactly this — a real synthetic
   * click on a marker never reached the map because the dock's own solid card
   * intercepted it first. Fix (same technique as MapEmptyGuidance's #2724
   * fix): the card itself is `pointer-events-none`; only the "sign in" link
   * and the recenter button opt back in with their own `pointer-events-auto`.
   * This test proves BOTH halves: the card's own non-interactive background
   * lets a click straight through to the map beneath it (so a marker there is
   * never swallowed), while the recenter button and sign-in link remain the
   * real hit-test target at their own coordinates.
   */
  test('desktop — the dock\'s non-interactive background never intercepts a click (a marker underneath it must stay reachable), while the recenter button and sign-in link stay clickable', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`/discover?city=${CITY}`);
    await page.waitForLoadState('domcontentloaded');
    await declineConsentBannerIfPresent(page);

    const dock = page.getByTestId('map-info-dock');
    await expect(dock).toBeVisible({ timeout: 15_000 });

    // Lane review (pass 4, BLOCKING #2) — wait for the city-ROOT camera sync to
    // settle (zoom written into the URL) before recording `urlBefore`. Without
    // this, a click that lands before the initial camera settle can itself be
    // the thing that first writes lat/lon/zoom into the URL, making "the URL
    // changed" trivially true regardless of whether the click actually reached
    // the map through the dock or was swallowed by it.
    await expect(page.locator('.leaflet-control-zoom-in')).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(() => new URL(page.url()).searchParams.get('zoom'), {
        message: 'city-root camera-sync must settle a zoom into the URL before this test proceeds',
        timeout: 15_000,
      })
      .not.toBeNull();

    // A point on the guidance row's own background (left edge, away from the
    // sign-in link itself) — the topmost element there must be the LEAFLET MAP
    // itself (not merely "not the dock" — that would also pass if some OTHER
    // unrelated overlay happened to sit there instead of the map), proving the
    // card's background genuinely passes clicks through to the map.
    const guidance = page.getByTestId('map-info-dock-guidance');
    const guidanceBox = await guidance.boundingBox();
    expect(guidanceBox, 'guidance row must have a real bounding box').not.toBeNull();
    const bg = guidanceBox as NonNullable<typeof guidanceBox>;
    const bgPoint = { x: bg.x + 5, y: bg.y + bg.height / 2 };
    const bgTopmost = await page.evaluate(
      ([px, py]) => {
        const el = document.elementFromPoint(px as number, py as number) as Element | null;
        return {
          insideDock: Boolean(el?.closest('[data-testid="map-info-dock"]')),
          insideLeaflet: Boolean(el?.closest('.leaflet-container')),
        };
      },
      [bgPoint.x, bgPoint.y],
    );
    expect(bgTopmost.insideDock, "the dock's non-interactive background must not be the hit-test target").toBe(
      false,
    );
    expect(
      bgTopmost.insideLeaflet,
      'the hit-test target behind the dock background must be the Leaflet map itself',
    ).toBe(true);

    // A real synthetic gesture STARTING at that same background point must
    // reach the map underneath, not silently no-op on the dock. A drag (not a
    // static click) is used deliberately: a plain click on empty map tile
    // (no marker under this exact point in this state) produces no URL change
    // even when it correctly reaches the map, which would make a click-based
    // check pass or fail for the wrong reason. A pan reliably changes lat/lon
    // whenever the gesture actually reaches the Leaflet surface, regardless of
    // whether a marker happens to be there.
    const urlBeforeDrag = page.url();
    await panMap(page, bgPoint.x, bgPoint.y, 120, 80);
    await expect
      .poll(() => page.url(), {
        message: 'a drag starting on the dock background must reach the map (URL changes)',
        timeout: 10_000,
      })
      .not.toBe(urlBeforeDrag);

    // Re-navigate fresh (the click above may have panned/selected something).
    await page.goto(`/discover?city=${CITY}`);
    await page.waitForLoadState('domcontentloaded');
    await declineConsentBannerIfPresent(page);

    // The sign-in link, at its OWN coordinates (first client rect — the link
    // text can wrap onto its own line, whose aggregate boundingBox() would
    // otherwise centre on the gap BETWEEN lines), must still be the real
    // hit-test target — the fix must not have broken it.
    const signIn = guidance.getByRole('link', { name: 'sign in' });
    await expect(signIn).toBeVisible();
    const signInRect = await signIn.evaluate((el) => {
      const r = el.getClientRects()[0];
      return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
    });
    expect(signInRect, 'sign-in link must have a real client rect').not.toBeNull();
    const sr = signInRect as NonNullable<typeof signInRect>;
    const signInHittable = await page.evaluate(
      ([px, py]) =>
        Boolean(
          (document.elementFromPoint(px as number, py as number) as Element | null)?.closest('a[href*="/auth"]'),
        ),
      [sr.x + sr.width / 2, sr.y + sr.height / 2],
    );
    expect(signInHittable, 'the sign-in link must still be the real hit-test target').toBe(true);

    // The recenter button, at its own coordinates, must also still be the
    // real hit-test target (its own row legitimately blocks clicks — only the
    // card's non-interactive background is pass-through).
    const recenter = page.getByTestId('map-info-dock-recenter');
    const recenterBox = await recenter.boundingBox();
    expect(recenterBox, 'recenter button must have a real bounding box').not.toBeNull();
    const rb = recenterBox as NonNullable<typeof recenterBox>;
    const recenterHittable = await page.evaluate(
      ([px, py]) =>
        Boolean(
          (document.elementFromPoint(px as number, py as number) as Element | null)?.closest(
            '[data-testid="map-info-dock-recenter"]',
          ),
        ),
      [rb.x + rb.width / 2, rb.y + rb.height / 2],
    );
    expect(recenterHittable, 'the recenter button must still be the real hit-test target').toBe(true);
  });

  /**
   * Pre-push review (advisory-fix 2) — the deleted "#2724 pass 4" e2e proved,
   * with REAL layout, that a forced long label stays clamped and never
   * collides with neighbouring chrome. Its replacement (the unit test in
   * DiscoverMapSurface.test.tsx) only checks className strings under jsdom —
   * it can't see whether `line-clamp-2`/`max-w-*` actually constrain the
   * rendered box. This restores that real-browser coverage against the dock.
   */
  async function assertLongLabelStaysClamped(
    page: Page,
    label: string,
    options: { expectLegend: boolean } = { expectLegend: true },
  ) {
    const dock = page.getByTestId('map-info-dock');
    const recenter = page.getByTestId('map-info-dock-recenter');
    const countRow = page.getByTestId('discover-badge');

    const dockBoxBefore = (await dock.boundingBox()) as BoundingBox;
    expect(dockBoxBefore, `${label}: dock needs a real bounding box before forcing the long name`).toBeTruthy();

    // Overwrite the already-rendered label <span>s' DOM text (never the
    // button/row's own textContent, which would delete the clamp element).
    await recenter.locator('span').evaluate((el, text) => {
      el.textContent = `Recenter on ${text}`;
    }, FORCED_LONG_LABEL);
    await countRow.locator('span').evaluate((el, text) => {
      el.textContent = `Showing 6 verified properties across ${text}`;
    }, FORCED_LONG_LABEL);

    // Lane review (pass 4, ADVISORY-FIX #6) — no arbitrary `waitForTimeout`: the
    // DOM mutation above is synchronous, and `boundingBox()` itself forces a
    // fresh layout read, so there is nothing further to wait for.
    const dockBox = (await dock.boundingBox()) as BoundingBox;
    const recenterBox = (await recenter.boundingBox()) as BoundingBox;
    expect(dockBox, `${label}: dock needs a real bounding box after forcing the long name`).toBeTruthy();
    expect(recenterBox, `${label}: recenter needs a real bounding box after forcing the long name`).toBeTruthy();

    // Width cap: the dock (and therefore the recenter row inside it) must not
    // widen past its own cap (220/260px desktop, calc(100vw-2rem)/320px mobile).
    expect(
      dockBox.width,
      `${label}: forced long label must not widen the dock past its own width cap`,
    ).toBeLessThanOrEqual(dockBoxBefore.width + 2);

    // Height/line-clamp: derive the real 2-line bound from the label span's
    // own computed line-height/padding/border, not a hard-coded guess.
    const clampedHeightBound = await recenter.evaluate((el) => {
      const span = el.querySelector('span');
      if (!span) return null;
      const spanStyle = window.getComputedStyle(span);
      const btnStyle = window.getComputedStyle(el);
      const lineHeight = parseFloat(spanStyle.lineHeight);
      const paddingTop = parseFloat(btnStyle.paddingTop);
      const paddingBottom = parseFloat(btnStyle.paddingBottom);
      if (!Number.isFinite(lineHeight)) return null;
      return 2 * lineHeight + paddingTop + paddingBottom;
    });
    expect(clampedHeightBound, `${label}: could not derive a real 2-line height bound`).not.toBeNull();
    expect(
      recenterBox.height,
      `${label}: forced long label must not grow the recenter row past its own 2-line clamp`,
    ).toBeLessThanOrEqual((clampedHeightBound as number) + 4);

    // No collision with neighbouring chrome, even at the forced long length.
    const zoomBox = await safeBoundingBox(page.locator('.leaflet-control-zoom'));
    if (zoomBox) expect(intersects(dockBox, zoomBox), `${label}: must not collide with zoom`).toBe(false);
    const attributionBox = await safeBoundingBox(page.locator('.leaflet-control-attribution'));
    if (attributionBox) {
      expect(intersects(dockBox, attributionBox), `${label}: must not collide with attribution`).toBe(false);
    }
    // Lane review (pass 4, ADVISORY-FIX #6) — a legend is expected at
    // area-selected (MapMarkerLegend) and city-landing (MapAreaLegend), but a
    // mid-drill DIRECTION/CLUSTER node genuinely has neither variant — no
    // silent skip either way: callers say up front which they expect.
    if (options.expectLegend) {
      const legendBox = await requireLegendBox(page, label);
      expect(intersects(dockBox, legendBox), `${label}: must not collide with the legend`).toBe(false);
    } else {
      await expect(
        page.locator(LEGEND_SELECTOR),
        `${label}: no legend variant is expected at this node level`,
      ).toHaveCount(0);
    }
    const searchThisAreaBox = await safeBoundingBox(page.getByRole('button', { name: /search this area/i }));
    if (searchThisAreaBox) {
      expect(
        intersects(dockBox, searchThisAreaBox),
        `${label}: must not collide with "Search this area"`,
      ).toBe(false);
    }
  }

  test('desktop 1366x768 — a forced long recenter/count label stays clamped and clear of neighbouring chrome', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(`/discover?city=${CITY}&node=${encodeURIComponent(RR_NAGAR_NODE)}`);
    await page.waitForLoadState('domcontentloaded');
    await declineConsentBannerIfPresent(page);
    await expect(page.getByTestId('map-info-dock')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('discover-badge')).toBeVisible();
    await assertLongLabelStaysClamped(page, '1366x768');
  });

  test('mobile 390x844 — a forced long recenter/count label stays clamped and clear of neighbouring chrome', async ({
    page,
  }) => {
    // A DIRECTION node (not an AREA), deliberately: on mobile Map + an area
    // SELECTED, #2698's `hideDuplicateCountBadge` correctly suppresses the
    // count row entirely (the mobile results heading already states it) — a
    // DIRECTION node keeps the count row visible so this test can force a
    // long label into it.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/discover?city=${CITY}&node=d:southeast`);
    await expect(page.getByTestId('discover-control-bar')).toBeVisible({ timeout: 15_000 });
    await declineConsentBannerIfPresent(page);
    const mapTrigger = page.getByRole('button', { name: 'Map', exact: true });
    await expect(mapTrigger).toBeVisible({ timeout: 15_000 });
    await mapTrigger.click();
    await expect(page.locator('.leaflet-container')).toHaveCount(1, { timeout: 10_000 });
    await expect(page.getByTestId('map-info-dock')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('discover-badge')).toBeVisible();
    await assertLongLabelStaysClamped(page, '390x844', { expectLegend: false });
  });

  /**
   * Owner feedback (round 4) — the dock must sit FLUSH in the map's
   * bottom-left corner on desktop (mock: `left:14px; bottom:14px`), and any
   * bottom-left legend that renders alongside it in the Areas journey must
   * stack directly ABOVE it with no overlap, in every state: city landing
   * (MapAreaLegend), a DIRECTION node (no legend — must not silently pass),
   * and an area selected (MapMarkerLegend).
   */
  for (const vp of [
    // Owner feedback (round 6) — the 821–1023px narrow-desktop-shell band (short inline
    // map strip under the panel, `isMobileMapOverlay` false — see DiscoverMapSurface.tsx's
    // own doc comment on the wrapper's `max-h-[calc(100%-14px)]`/`lg:` split). Added to
    // THIS loop (not a separate one) so it gets the exact same flush/width-cap/containment
    // coverage as the ≥1024 floor. Live-measured strip heights at 900×700: city ~160px
    // (dock ~144px), area ~106px (dock ~78px).
    { width: 900, height: 700, label: '900x700' },
    { width: 1000, height: 700, label: '1000x700' },
    { width: 1024, height: 768, label: '1024x768' },
    { width: 1366, height: 768, label: '1366x768' },
    { width: 1440, height: 900, label: '1440x900' },
  ]) {
    test(`desktop ${vp.label} — dock is flush in the map's bottom-left corner, within its width cap`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`/discover?city=${CITY}`);
      await page.waitForLoadState('domcontentloaded');
      await declineConsentBannerIfPresent(page);

      const dock = page.getByTestId('map-info-dock');
      await expect(dock).toBeVisible({ timeout: 15_000 });
      const mapContainer = page.locator('.leaflet-container').first();
      await expect(mapContainer).toBeVisible({ timeout: 15_000 });

      const dockBox = (await dock.boundingBox()) as BoundingBox;
      const mapBox = (await mapContainer.boundingBox()) as BoundingBox;
      expect(dockBox, `${vp.label}: dock needs a real bounding box`).toBeTruthy();
      expect(mapBox, `${vp.label}: map container needs a real bounding box`).toBeTruthy();

      const bottomGap = mapBox.y + mapBox.height - (dockBox.y + dockBox.height);
      const leftGap = dockBox.x - mapBox.x;
      expect(bottomGap, `${vp.label}: dock bottom edge must be flush (~14px) with the map's bottom edge`).toBeGreaterThanOrEqual(
        0,
      );
      expect(bottomGap, `${vp.label}: dock bottom edge must be flush (~14px) with the map's bottom edge`).toBeLessThanOrEqual(
        18,
      );
      expect(leftGap, `${vp.label}: dock left edge must be flush (~14px) with the map's left edge`).toBeGreaterThanOrEqual(
        0,
      );
      expect(leftGap, `${vp.label}: dock left edge must be flush (~14px) with the map's left edge`).toBeLessThanOrEqual(
        18,
      );
      // Containment (owner feedback, round 6, the 821–1023px narrow band): the dock must
      // never float above the map's own top edge, however short the map strip is.
      expect(dockBox.y, `${vp.label}: dock top edge must stay within the map (≥ map top)`).toBeGreaterThanOrEqual(
        mapBox.y,
      );

      // Width cap — mock: min(288px, calc(50% - 92px)) of the map's own width.
      expect(dockBox.width, `${vp.label}: dock width must not exceed 288px`).toBeLessThanOrEqual(288);
      expect(
        dockBox.width,
        `${vp.label}: dock width must not exceed 50% - 92px of the map width`,
      ).toBeLessThanOrEqual(mapBox.width * 0.5 - 92 + 1);

      // No overlap with zoom/attribution/"Search this area" at the corner anchor either.
      const zoomBox = await safeBoundingBox(page.locator('.leaflet-control-zoom'));
      if (zoomBox) expect(intersects(dockBox, zoomBox), `${vp.label}: must not collide with zoom`).toBe(false);
      const attributionBox = await safeBoundingBox(page.locator('.leaflet-control-attribution'));
      if (attributionBox) {
        expect(intersects(dockBox, attributionBox), `${vp.label}: must not collide with attribution`).toBe(false);
      }
      const searchThisAreaBox = await safeBoundingBox(page.getByRole('button', { name: /search this area/i }));
      if (searchThisAreaBox) {
        expect(
          intersects(dockBox, searchThisAreaBox),
          `${vp.label}: must not collide with "Search this area"`,
        ).toBe(false);
      }

      // City landing always renders a legend (MapAreaLegend, "Areas with properties")
      // — required present, no silent skip, EXCEPT in the narrow band where the
      // city-landing dock (guidance + count + recenter, ~144px) leaves little or no
      // room in the strip (live-measured: city strip ~160px at 900×700, ~83px at
      // 844×390). There the legend's own `min-h-0` flex-shrink chain correctly
      // collapses it to 0 rather than overlapping the (protected, `shrink-0`) dock — a
      // deliberate degrade-the-informational/protect-the-interactive choice, not a bug.
      // Re-measure the dock AFTER the legend has settled: the legend and the dock's own
      // count row can resolve their async data (area markers / badge) at slightly
      // different times, and since they now share one real flex column (round 5), an
      // earlier dock measurement can be stale relative to the column's final layout once
      // the legend mounts — this was a genuine flake (measured: dockBox.y off by dozens
      // of px vs the settled DOM), not a false negative to relax away.
      const legendRequired = mapBox.height >= 200;
      if (legendRequired) {
        const legendBox = await requireLegendBox(page, `${vp.label} city landing`);
        const settledDockBox = (await dock.boundingBox()) as BoundingBox;
        assertLegendStacksTightlyAbove(legendBox, settledDockBox, mapBox, `${vp.label} city landing`);
      } else {
        const legend = page.locator(LEGEND_SELECTOR);
        const legendBoxOrNull = (await legend.count()) > 0 ? await legend.first().boundingBox() : null;
        if (legendBoxOrNull && legendBoxOrNull.height > 0) {
          const settledDockBox = (await dock.boundingBox()) as BoundingBox;
          assertLegendStacksTightlyAbove(legendBoxOrNull, settledDockBox, mapBox, `${vp.label} city landing (narrow)`);
        }
      }
    });

    test(`desktop ${vp.label} — area-selected: dock stays flush, MapMarkerLegend stacks above it with no overlap`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`/discover?city=${CITY}&node=${encodeURIComponent(RR_NAGAR_NODE)}`);
      await page.waitForLoadState('domcontentloaded');
      await declineConsentBannerIfPresent(page);

      const dock = page.getByTestId('map-info-dock');
      await expect(dock).toBeVisible({ timeout: 15_000 });
      const mapContainer = page.locator('.leaflet-container').first();
      const dockBox = (await dock.boundingBox()) as BoundingBox;
      const mapBox = (await mapContainer.boundingBox()) as BoundingBox;

      const bottomGap = mapBox.y + mapBox.height - (dockBox.y + dockBox.height);
      const leftGap = dockBox.x - mapBox.x;
      expect(bottomGap, `${vp.label} area-selected: dock bottom edge must stay flush (≥0)`).toBeGreaterThanOrEqual(0);
      expect(bottomGap, `${vp.label} area-selected: dock bottom edge must stay flush`).toBeLessThanOrEqual(18);
      expect(leftGap, `${vp.label} area-selected: dock left edge must stay flush (≥0)`).toBeGreaterThanOrEqual(0);
      expect(leftGap, `${vp.label} area-selected: dock left edge must stay flush`).toBeLessThanOrEqual(18);

      // Re-measure AFTER the legend settles — see the city-landing test's comment above.
      const legendBox = await requireLegendBox(page, `${vp.label} area-selected`);
      const settledDockBox = (await dock.boundingBox()) as BoundingBox;
      assertLegendStacksTightlyAbove(legendBox, settledDockBox, mapBox, `${vp.label} area-selected`);
    });

    test(`desktop ${vp.label} — area + school-radius combined: SchoolRadiusLegend stacks tightly above the dock`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });

      // Pre-push review (round 6) — the earlier version of this test reached its URL by
      // construction (`node=` + `schoolId=` + `radiusKm=`, no `areaKey=`), which
      // `derivePanelContent` (discoverPanelState.ts:124-125) does NOT recognise as
      // `area-school-combined` — it dispatches on the legacy `areaKey=` param, not `node=`
      // (see e2e/discover-1738-regression.spec.ts's own doc comment for this exact gotcha).
      // That URL silently rendered the ordinary area-selected MapMarkerLegend, not
      // SchoolRadiusLegend — the test could pass without ever exercising the combined state.
      //
      // Tried reaching it via the UI first, as suggested (area-selected → the
      // `area-set-schools-tile` "Add a school" CTA → click the fixture `school-card` by
      // name) — live-verified with a throwaway script: that real click sequence resolves
      // `schoolId=` but settles on a URL with NO `areaKey=` param at all (`onSelectSchool`,
      // the area-first branch `SchoolsInAreaPanel.handleSelectSchool` takes when embedded
      // this way, never sets one — only the OTHER branch, `setSchoolJourney`, does). So
      // TODAY this specific UI path does not actually reach `area-school-combined` — it's a
      // separate, pre-existing gap in that click path, unrelated to the dock/legend anchor
      // this issue is about, not something to silently paper over here. Flagged in the PR
      // review reply rather than "fixed" in scope. The URL below is the verified-working
      // combined-state entry (`journey=area-first` + explicit `areaKey=` + `node=`, matching
      // e2e/discover-1738-regression.spec.ts's own working pattern) — live-confirmed via the
      // same throwaway script to render `school-radius-legend` (not just `discover-badge`),
      // so it genuinely exercises the state this test claims to, even though it isn't
      // reached by clicking through in this particular test.
      await page.goto(
        `/discover?city=${CITY}&journey=area-first&areaKey=${encodeURIComponent('IN|KA|Bengaluru|RR Nagar')}` +
          `&node=${encodeURIComponent(RR_NAGAR_NODE)}&schoolId=f1713003-0000-0000-0000-000000000001&radiusKm=2`,
      );
      await page.waitForLoadState('domcontentloaded');
      await declineConsentBannerIfPresent(page);

      const dock = page.getByTestId('map-info-dock');
      await expect(dock).toBeVisible({ timeout: 15_000 });
      const mapContainer = page.locator('.leaflet-container').first();

      // SchoolRadiusLegend specifically (not just "a legend") — its own stable testid,
      // required present: the fixture school + area-first combined state always renders it.
      const schoolRadiusLegend = page.getByTestId('school-radius-legend');
      await expect(schoolRadiusLegend, `${vp.label} area+school: SchoolRadiusLegend must render`).toBeVisible({
        timeout: 15_000,
      });
      // And exactly one `discover-map-legend` wrapper overall — the duplicate-render guard,
      // same as every other `requireLegendBox` caller, applied here even though this test
      // reads the more specific `school-radius-legend` testid for its own box.
      await expect(
        page.locator(LEGEND_SELECTOR),
        `${vp.label} area+school: exactly one legend element must render, never a duplicate`,
      ).toHaveCount(1);

      const legendBox = (await schoolRadiusLegend.boundingBox()) as BoundingBox;
      const dockBox = (await dock.boundingBox()) as BoundingBox;
      const mapBox = (await mapContainer.boundingBox()) as BoundingBox;

      const bottomGap = mapBox.y + mapBox.height - (dockBox.y + dockBox.height);
      const leftGap = dockBox.x - mapBox.x;
      expect(bottomGap, `${vp.label} area+school: dock bottom edge must stay flush (≥0)`).toBeGreaterThanOrEqual(0);
      expect(bottomGap, `${vp.label} area+school: dock bottom edge must stay flush`).toBeLessThanOrEqual(18);
      expect(leftGap, `${vp.label} area+school: dock left edge must stay flush (≥0)`).toBeGreaterThanOrEqual(0);
      expect(leftGap, `${vp.label} area+school: dock left edge must stay flush`).toBeLessThanOrEqual(18);

      assertLegendStacksTightlyAbove(legendBox, dockBox, mapBox, `${vp.label} area+school`);

      // The dock's own count/guidance in this combined state: listingCapable (a real area is
      // selected) means no anon guidance row, and the count row reads the area's own summary
      // once its badge data settles (own longer timeout — a real, if occasionally slower,
      // async fetch, not a fixed layout property like the rows above).
      await expect(page.getByTestId('map-info-dock-guidance'), `${vp.label} area+school: no guidance row`).toHaveCount(
        0,
      );
      await expect(
        page.getByTestId('discover-badge'),
        `${vp.label} area+school: count row must render`,
      ).toBeVisible({ timeout: 15_000 });
    });

    test(`desktop ${vp.label} — a DIRECTION node has no legend variant, dock still flush and unobstructed`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`/discover?city=${CITY}&node=d:southeast`);
      await page.waitForLoadState('domcontentloaded');
      await declineConsentBannerIfPresent(page);

      const dock = page.getByTestId('map-info-dock');
      await expect(dock).toBeVisible({ timeout: 15_000 });
      // No silent skip: this state genuinely has no legend variant — asserted, not assumed.
      await expect(
        page.locator(LEGEND_SELECTOR),
        `${vp.label} direction node: no legend variant is expected at this level`,
      ).toHaveCount(0);

      const mapContainer = page.locator('.leaflet-container').first();
      const dockBox = (await dock.boundingBox()) as BoundingBox;
      const mapBox = (await mapContainer.boundingBox()) as BoundingBox;
      const bottomGap = mapBox.y + mapBox.height - (dockBox.y + dockBox.height);
      const leftGap = dockBox.x - mapBox.x;
      expect(bottomGap, `${vp.label} direction node: dock bottom edge must stay flush (≥0)`).toBeGreaterThanOrEqual(0);
      expect(bottomGap, `${vp.label} direction node: dock bottom edge must stay flush`).toBeLessThanOrEqual(18);
      expect(leftGap, `${vp.label} direction node: dock left edge must stay flush (≥0)`).toBeGreaterThanOrEqual(0);
      expect(leftGap, `${vp.label} direction node: dock left edge must stay flush`).toBeLessThanOrEqual(18);
      expect(
        dockBox.y,
        `${vp.label} direction node: dock top edge must stay within the map (≥ map top)`,
      ).toBeGreaterThanOrEqual(mapBox.y);
    });
  }

  for (const vp of [
    { width: 375, height: 667, label: '375x667' },
    { width: 390, height: 844, label: '390x844' },
    { width: 412, height: 915, label: '412x915' },
  ]) {
    test(`mobile ${vp.label} — the dock lives in the bottom info zone, no separate floating dock element beyond it`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`/discover?city=${CITY}`);
      await expect(page.getByTestId('discover-control-bar')).toBeVisible({ timeout: 15_000 });
      await declineConsentBannerIfPresent(page);

      // Open the full-screen mobile Map overlay (the only path where
      // isMobileMapOverlay is true) — mirrors discover-mobile-map-badge-zoom-2716.spec.ts.
      const mapTrigger = page.getByRole('button', { name: 'Map', exact: true });
      await expect(mapTrigger).toBeVisible({ timeout: 15_000 });
      await mapTrigger.click();
      await expect(page.locator('.leaflet-container')).toHaveCount(1, { timeout: 10_000 });

      const dock = page.getByTestId('map-info-dock');
      await expect(dock).toBeVisible({ timeout: 15_000 });
      // Exactly one dock element, one recenter, one count row (the dock's own —
      // `discover-badge` is reused, not duplicated) — consolidation REPLACES every
      // legacy mobile element rather than adding this dock alongside them.
      await expect(page.getByTestId('map-info-dock')).toHaveCount(1);
      await expect(page.getByRole('button', { name: /^Recenter on /i })).toHaveCount(1);
      await expect(page.getByTestId('discover-badge')).toHaveCount(1);
      await expect(page.getByTestId('areas-recenter-button')).toHaveCount(0);
      await expect(page.getByTestId('map-recenter-city-button')).toHaveCount(0);
      await expect(page.getByTestId('map-anon-zoom-prompt')).toHaveCount(0);
      await expect(page.getByTestId('map-anon-zoom-prompt-card')).toHaveCount(0);

      // No overlap with zoom/attribution/legend at this mobile width.
      const dockBox = (await dock.boundingBox()) as BoundingBox;
      expect(dockBox, `dock must have a real bounding box at ${vp.label}`).toBeTruthy();
      const zoomBox = await page.locator('.leaflet-control-zoom').first().boundingBox();
      if (zoomBox) {
        expect(intersects(dockBox, zoomBox), `dock must not overlap zoom at ${vp.label}`).toBe(false);
      }
      const attributionBox = await page.locator('.leaflet-control-attribution').first().boundingBox();
      if (attributionBox) {
        expect(
          intersects(dockBox, attributionBox),
          `dock must not overlap attribution at ${vp.label}`,
        ).toBe(false);
      }
      const legendBox = await requireLegendBox(page, vp.label);
      expect(intersects(dockBox, legendBox), `dock must not overlap the legend at ${vp.label}`).toBe(false);
    });
  }

  /**
   * Pre-push review (round 5 advisory-fix) — the loop above only exercises the
   * city-landing legend variant (MapAreaLegend) on mobile. This covers the
   * MapMarkerLegend variant (`isAreaFirstSelectedAreaState`) on mobile too — the
   * SAME `inline` render path DiscoverMapCanvas uses for every non-desktop-slot
   * case — so `requireLegendBox`'s new duplicate-detection also runs against a
   * real area-selected mobile state, not just city landing.
   */
  test('mobile 390x844 — area-selected: exactly one (inline) MapMarkerLegend, no duplicate from the desktop slot path', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/discover?city=${CITY}&node=${encodeURIComponent(RR_NAGAR_NODE)}`);
    await expect(page.getByTestId('discover-control-bar')).toBeVisible({ timeout: 15_000 });
    await declineConsentBannerIfPresent(page);

    const mapTrigger = page.getByRole('button', { name: 'Map', exact: true });
    await expect(mapTrigger).toBeVisible({ timeout: 15_000 });
    await mapTrigger.click();
    await expect(page.locator('.leaflet-container')).toHaveCount(1, { timeout: 10_000 });

    const dock = page.getByTestId('map-info-dock');
    await expect(dock).toBeVisible({ timeout: 15_000 });
    // requireLegendBox asserts exactly one legend element — the duplication check.
    await requireLegendBox(page, '390x844 area-selected (mobile)');
  });

  /**
   * Owner feedback (round 7) — landscape phones in the 821–1023px narrow-shell band
   * (NOT the mobile Map overlay — `isMobileMapOverlay` is false here) give the inline
   * map as little as ~55–95px of height. The map's own breadcrumb overlay
   * (`areas-breadcrumb-trail`, `z-[1000]`) used to sit ABOVE the dock's `z-[500]`
   * column there, so `elementFromPoint` on the recenter button's centre hit the
   * breadcrumb nav instead — live-measured (PR #2757 comment) as covered in
   * area-selected at every tested width and in city at 844×390. This is a
   * REACHABILITY regression from `main` (there the old recenter floated over the
   * panel, misplaced but clickable). Fixed by raising the column to `z-[1002]`
   * below `lg` only (`DiscoverMapSurface.tsx`) — verified here as a real hit-test,
   * not just a class-string assertion, plus a real click.
   */
  for (const vp of [
    { width: 844, height: 390, label: '844x390' },
    { width: 932, height: 430, label: '932x430' },
  ]) {
    for (const state of [
      { name: 'city', path: `/discover?city=${CITY}` },
      { name: 'direction', path: `/discover?city=${CITY}&node=d:southeast` },
      { name: 'area', path: `/discover?city=${CITY}&node=${encodeURIComponent(RR_NAGAR_NODE)}` },
    ]) {
      test(`desktop ${vp.label} narrow band, ${state.name} — recenter is the real hit target over the map breadcrumb, and stays clickable`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(state.path);
        await page.waitForLoadState('domcontentloaded');
        await declineConsentBannerIfPresent(page);

        const recenter = page.getByTestId('map-info-dock-recenter');
        await expect(recenter).toBeVisible({ timeout: 15_000 });
        const box = (await recenter.boundingBox()) as BoundingBox;
        expect(box, `${vp.label} ${state.name}: recenter needs a real bounding box`).toBeTruthy();
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;

        // The real hit-test: whatever `document.elementFromPoint` resolves to at the
        // recenter's own centre must be the recenter button itself, not the map
        // breadcrumb (or anything else) painted above it.
        const hit = await page.evaluate(
          ([x, y]) => {
            const el = document.elementFromPoint(x as number, y as number) as Element | null;
            return {
              insideRecenter: !!el?.closest('[data-testid="map-info-dock-recenter"]'),
              insideBreadcrumb: !!el?.closest('[data-testid="areas-breadcrumb-trail"]'),
            };
          },
          [cx, cy],
        );
        expect(
          hit.insideRecenter,
          `${vp.label} ${state.name}: the recenter button must be the real hit target at its own centre`,
        ).toBe(true);
        expect(
          hit.insideBreadcrumb,
          `${vp.label} ${state.name}: the map breadcrumb must not be the hit target there`,
        ).toBe(false);

        // A real click, proving it isn't just hit-testable but actually reachable — if
        // Playwright's own actionability check (which includes "receives events", i.e.
        // nothing else intercepts the click point) fails, this throws and fails the test.
        await recenter.click({ timeout: 3_000 });

        // Camera-move proof, same technique as the wider-viewport recenter test — but only
        // if the strip is tall enough to register a drag pan at all (a genuinely tiny strip
        // may not have room for an off-centre drag start point that isn't itself on the
        // dock/breadcrumb). Falls back to the hit-test + non-throwing click above, which the
        // review explicitly accepts as sufficient when a pan isn't feasible.
        const mapContainer = page.locator('.leaflet-container').first();
        const mapBox = await mapContainer.boundingBox();
        if (mapBox && mapBox.height >= 40) {
          await page.goto(state.path);
          await page.waitForLoadState('domcontentloaded');
          await declineConsentBannerIfPresent(page);
          await expect(mapContainer).toBeVisible({ timeout: 15_000 });
          await expect
            .poll(() => urlLatLon(page), { timeout: 10_000 })
            .not.toBeNull();
          const target = urlLatLon(page) as NonNullable<ReturnType<typeof urlLatLon>>;

          const panX = mapBox.x + mapBox.width * 0.85;
          const panY = mapBox.y + mapBox.height * 0.5;
          await panMap(page, panX, panY, -80, Math.min(30, mapBox.height * 0.3));
          const movedAway = await page
            .waitForFunction(
              (prevLat) => {
                const u = new URL(window.location.href);
                const lat = u.searchParams.get('lat');
                return lat != null && Number(lat) !== prevLat;
              },
              target.lat,
              { timeout: 5_000 },
            )
            .then(() => true)
            .catch(() => false);
          if (movedAway) {
            const pannedAway = urlLatLon(page) as NonNullable<ReturnType<typeof urlLatLon>>;
            const distanceAfterPan = distance(pannedAway, target);
            await recenter.click();
            await expect
              .poll(
                () => {
                  const now = urlLatLon(page);
                  return now ? distance(now, target) : Infinity;
                },
                {
                  message: `${vp.label} ${state.name}: recenter click must move the camera closer to the target`,
                  // Owner feedback (round 8) — measured flaky at 8s on a genuinely tiny
                  // strip (844×390 area): the flyToBounds easing occasionally hadn't
                  // settled yet; re-ran once and it passed. 15s gives real margin.
                  timeout: 15_000,
                },
              )
              .toBeLessThan(distanceAfterPan);
          }
          // If the strip didn't permit a real pan (movedAway false), the hit-test + the
          // non-throwing click above already satisfy this test — no further assertion.
        }
      });
    }
  }

  // Owner feedback (round 8, advisory-fix) — the OTHER side of the z-index invariant
  // (below `lg`, the dock must stay BELOW the 1001 overlays — DrawModeOverlay,
  // SearchThisAreaCta — so it can never steal a click from draw-mode Cancel/Undo or
  // "Search this area" where they overlap the dock's column) is NOT covered by a test
  // here. Two real trigger paths were attempted live at 844×390 and neither was
  // reachable for reasons unrelated to the z-index fix under test — draw mode requires
  // sign-in (`resolveDrawSearchAreaEligibility` hides it for anon unconditionally, and
  // a `storageState` built from `e2e/fixtures/user-auth-state` did not visibly
  // authenticate against this dev backend); "Search this area" requires a committed
  // AREA_SET (confirmed via `e2e/discover/issue-2494-mobile-return-camera-restore.spec.ts`'s
  // `reachCommittedRrNagarDeepanjaliAreaSet`), and reproducing that flow's "Add nearby
  // areas" step hit an unrelated panel-layout click-interception issue at this width.
  // Per this issue's own instruction, no vacuous/always-pass test is written for this —
  // see DiscoverMapSurface.tsx's own doc comment on `z-[1000]` for the geometric
  // argument (DrawModeOverlay's `max-w-sm` panel, centred, does overlap the dock
  // column's x-range at 844px) that motivated the conservative choice regardless.
});
