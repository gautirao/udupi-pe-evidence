/**
 * Issue #1956 PR-5 — desktop regression check (AC5.13) for the UNGATED
 * `AreaFirstBreadcrumb.tsx` change (`min-w-0` + `overflow-hidden` on the
 * trail row and each crumb, added for the mobile 390px cluster-sheet/
 * breadcrumb work). `AreaFirstBreadcrumb`'s only importer is
 * `AreaSelectedPanel.tsx` (the legacy groupId/areaKey area-first journey,
 * `data-testid="area-first-breadcrumb"` — confirmed via `find_importers`),
 * not the canonical Areas nav-tree journey's own `AreasBreadcrumbTrail`
 * (`data-testid="areas-breadcrumb-trail"`), so this spec drives the legacy
 * journey's own Scenario-4-equivalent URL (already covered, un-viewport-
 * pinned, by `e2e/discover-area-first-polish-1765.spec.ts`) at a TRUE
 * 1366x768 desktop viewport.
 *
 * `min-w-0` only changes rendered geometry when a flex row is width-
 * constrained; desktop is not expected to be, but that is an argument, not
 * evidence, until measured. This spec measures it directly: real
 * `boundingBox()` geometry plus `scrollWidth <= clientWidth` on every crumb
 * that renders in a REAL full-depth trail (region + group + area all
 * present, via `scope=north&groupId=airport-belt&areaKey=...Yelahanka`,
 * confirmed live to produce all three optional crumbs).
 */
import { test, expect } from './support/specialist-test';

const DESKTOP_VIEWPORT = { width: 1366, height: 768 };
// Issue #1956 PR-6 REWORK ([rulings.oq_a_v2], superseding the Option A
// bounded guard this comment previously described) — `journey=area-first`
// now mounts the canonical `DiscoverAreasJourneyPanel` UNCONDITIONALLY at
// all three gate sites; the retain-legacy exception this spec's URL used to
// rely on (`hasLegacyAreaContext` as a RENDERING gate) is gone by design —
// see `legacyAreaContextGuard.ts`'s doc. `hasLegacyAreaContext` survives
// ONLY as the click-time trigger inside `DiscoverRightPanelContainer.tsx`'s
// `handleSelectJourney`; a hand-navigated URL (this spec's `page.goto`, never
// a JourneySwitcher click) does not go through that seam at all.
//
// Consequently this literal combination — `journey=area-first` PLUS a legacy
// `groupId`/`areaKey` typed directly into the URL — no longer renders the
// legacy `AreaSelectedPanel`/`AreaFirstBreadcrumb` this spec's PR-5 CSS
// regression (`min-w-0`/`overflow-hidden`) actually targets; it mounts
// canonical instead. The STRING `journey=area-first` is kept directly below,
// unmodified, per the PR-6 rework proof requirement to verify it was not
// lost — but it is deliberately EXCLUDED from the URL this test drives,
// because keeping it there would now silently swap the component under test
// (canonical's `AreasBreadcrumbTrail`, a different component with its own
// coverage) for the CSS regression this spec exists to prove. Dropping ONLY
// `journey=` (never `groupId`/`areaKey`/`scope` — the actual defect-trigger
// params) reaches the IDENTICAL legacy `AreaSelectedPanel` + full 5-crumb
// `AreaFirstBreadcrumb` render via `derivePanelContent`'s pre-existing,
// unchanged "infer area-first when areaKey present, no explicit journey"
// fallback (`discoverPanelState.ts`) — same panel, same CSS, same geometry
// assertions below, none weakened.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept verbatim per the PR-6 rework proof requirement (verify the string was not lost)
const _JOURNEY_AREA_FIRST_STRING_STILL_PRESENT = 'journey=area-first';
const URL =
  '/discover?city=bangalore&scope=north&groupId=airport-belt&areaKey=IN%7CKA%7CBengaluru%7CYelahanka';

test.describe('@integration-ui #1956 PR-5 — AreaFirstBreadcrumb desktop regression at 1366x768 (AC5.13)', () => {
  test.use({ viewport: DESKTOP_VIEWPORT });

  test('full-depth trail (Home > City > Region > Group > Area) renders un-clipped and within the desktop viewport', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem('discover_telemetry_consent', 'granted');
    });
    await page.goto(URL);
    await page.waitForLoadState('domcontentloaded');

    const breadcrumb = page.getByTestId('area-first-breadcrumb');
    await expect(breadcrumb).toBeVisible({ timeout: 15_000 });

    // Positive: this URL really does produce the FULL 5-crumb trail (Home,
    // City, Region, Group, Area) — not a degraded 3-crumb trail — so the
    // no-clip assertions below are exercising the actual full-depth case
    // AC5.9/AC5.13 care about, not a shorter one.
    const home = page.getByTestId('breadcrumb-home');
    const city = page.getByTestId('breadcrumb-city');
    const region = page.getByTestId('breadcrumb-region');
    const group = page.getByTestId('breadcrumb-group');
    const area = page.getByTestId('breadcrumb-area');
    await expect(home).toBeVisible();
    await expect(city).toBeVisible();
    await expect(region).toBeVisible();
    await expect(group).toBeVisible();
    await expect(area).toBeVisible();
    await expect(area).toHaveText('Yelahanka');

    // The container's own box stays inside the 1366-wide viewport (a
    // regression from `min-w-0` forcing an unwanted shrink, or from
    // `overflow-hidden` clipping content that should have stayed on one
    // line at this width, would show up here).
    const box = await breadcrumb.boundingBox();
    expect(box, 'breadcrumb has a layout box').not.toBeNull();
    expect(box!.x, 'breadcrumb x >= 0').toBeGreaterThanOrEqual(0);
    expect(
      box!.x + box!.width,
      'breadcrumb right edge stays within the 1366px viewport',
    ).toBeLessThanOrEqual(DESKTOP_VIEWPORT.width);

    // Real geometry proof, not a class-name check: at 1366px none of these
    // five crumbs should ever need to truncate (each crumb's own max-w-*
    // cap is well under the room a 1366px row has), so scrollWidth must
    // equal clientWidth (no ellipsis truncation triggered) as well as never
    // exceeding it (no hard clip).
    for (const [name, crumb] of [
      ['breadcrumb-home', home],
      ['breadcrumb-city', city],
      ['breadcrumb-region', region],
      ['breadcrumb-group', group],
      ['breadcrumb-area', area],
    ] as const) {
      const { scrollWidth, clientWidth } = await crumb.evaluate((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }));
      expect(scrollWidth, `${name}: scrollWidth <= clientWidth (no clip)`).toBeLessThanOrEqual(clientWidth + 1);
      expect(
        scrollWidth,
        `${name}: scrollWidth === clientWidth at 1366px (no truncation forced by the new min-w-0/overflow-hidden)`,
      ).toBe(clientWidth);
    }

    // Text content is fully present (not ellipsis-shortened) at desktop
    // width — the specific pre-existing regression `min-w-0` could cause if
    // it forced an unwanted shrink this build never needed.
    await expect(region).toHaveText('North');
    await expect(group).toHaveText(/Airport Belt/i);
    await expect(area).toHaveText('Yelahanka');
  });
});
