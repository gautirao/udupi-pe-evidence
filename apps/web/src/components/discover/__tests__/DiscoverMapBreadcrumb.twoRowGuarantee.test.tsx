/**
 * Issue #2089 fix cycle 3/4 — proves the mobile two-row breadcrumb cap is a
 * real, mathematically-derived GUARANTEE for every caller's worst-case
 * segment set, not just a bigger `overflow-hidden` safety margin that could
 * still silently hide an entire ancestor crumb.
 *
 * Context (fix cycle 3): a PR reviewer (plus independent code-reading) found
 * that several `DiscoverMapBreadcrumb` callers passed segments with NO
 * `maxWidthClass` at all (unbounded label width) into a container that
 * relies on `overflow-hidden` + a fixed `max-h` to bound the trail to two
 * wrapped rows. With an unbounded segment, a real long locality name could
 * force a 3rd row, and the old mechanism would CLIP that entire row — hiding
 * a whole ancestor crumb, not just truncating its text.
 *
 * Context (fix cycle 4, reviewer REQUEST CHANGES on the math itself): fix
 * cycle 3's arithmetic only proved the guarantee at a 390px viewport, but
 * `containerClassName="max-w-[min(88vw,520px)]"` has NO fixed floor — real
 * Android CSS widths commonly report as low as 320-360px, and the pill's own
 * chrome (padding/icon/gap, all Tailwind `rem`-based classes) grows under
 * OS/browser text-zoom while `maxWidthClass` values are literal, non-scaling
 * `px`. Both effects shrink the same margin fix cycle 3 relied on — at
 * common real widths the guarantee could silently fail and reintroduce the
 * exact clipping bug this cycle exists to fix. `useDiscoverMapPresentation.ts`
 * (`areaJourneySegmentsRaw` — map-group journey, 4 segments;
 * `schoolJourneySegmentsRaw` — school journey, 5 segments) and
 * `AreasBreadcrumbTrail.tsx` (canonical Areas journey, 4 segments — the
 * actual in-scope trail for issue #2089/#2133/PR #2141, and the one already
 * driven in a real browser by
 * `e2e/discover/issue-2089-breadcrumb-list-flex-layout.spec.ts`) now size
 * every `maxWidthClass` against an explicit, conservative floor: viewport
 * width >= 320px WITH UP TO ~20% text-zoom applied to every rem-based
 * dimension (see each file's own derivation comment for the exact
 * arithmetic). This file verifies that arithmetic holds for the WORST CASE —
 * every segment rendered at its full allowed max width simultaneously, with
 * a genuinely long synthetic label (so `truncate` — not `maxWidthClass` — is
 * what's doing the text-shortening) — across a SPREAD of viewport widths
 * (320/344/360/390px), not just the single 390px width fix cycle 3 checked,
 * so a regression in either the viewport assumption or a maxWidthClass value
 * is caught automatically.
 *
 * ── WHY A GREEDY-WRAP SIMULATION, NOT A REAL BROWSER MEASUREMENT ──
 * This suite runs under Vitest's `jsdom` environment (see vitest.config.ts),
 * which has no real layout engine — `getBoundingClientRect`/`scrollHeight`/
 * `clientHeight` are always 0 in jsdom, so a literal
 * `expect(scrollHeight).toBe(clientHeight)` here would be a trivial 0===0
 * pass with zero power to catch a regression (the exact "assertion that
 * cannot fail" trap). Instead, `simulateFlexWrapRows` below reimplements the
 * CSS flex-wrap line-breaking rule this component actually relies on (each
 * item's hypothetical/natural main-size decides the line break — the same
 * "row budget" reasoning `DiscoverMapBreadcrumb.tsx`'s own JSDoc and the
 * per-array derivation comments already use) driven by the REAL pixel
 * numbers read back off the rendered DOM (each segment's own `max-w-[Npx]`
 * class, and the real chevron `h-*` class the density prop produces) — not
 * duplicated magic constants — with the documented text-zoom scaling applied
 * on top, matching the production derivation exactly. A real 390x844-viewport
 * browser check of the canonical Areas trail's structure/no-clip already
 * exists (`e2e/discover/issue-2089-breadcrumb-list-flex-layout.spec.ts`);
 * this suite closes the coverage gap for the two journeys that previously
 * shipped fully or partially UNBOUNDED segments (school 5-item, map-group
 * 4-item), and additionally proves the canonical journey's OWN newly
 * tightened 80px cap (down from 140px pre-fix cycle 3, then 110px pre-fix
 * cycle 4) across the full supported viewport range.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MapPin, GraduationCap } from 'lucide-react';
import { DiscoverMapBreadcrumb, type DiscoverMapCrumb } from '../DiscoverMapBreadcrumb';
import {
  MAP_GROUP_BREADCRUMB_MAX_WIDTHS,
  SCHOOL_BREADCRUMB_MAX_WIDTHS,
} from '@/features/discover/presentation/useDiscoverMapPresentation';
import { AREAS_BREADCRUMB_MAX_WIDTH_CLASS } from '../navigation/AreasBreadcrumbTrail';

// 30-46 char synthetic long locality/school names — deliberately longer than
// any of the fix's `maxWidthClass` values, so `truncate` (not the label's
// own natural shortness) is what keeps each crumb inside its box.
const LONG_CITY = 'Greater North-Eastern Bengaluru Metro'; // 38 chars
const LONG_REGION = 'North-Eastern Corridor Development Zone'; // 40 chars
const LONG_ZONE = 'Kannamangala-Hoskote Industrial Cluster'; // 40 chars
const LONG_AREA = 'Whitefield-Hoskote Extension Layout Phase 2'; // 44 chars
const LONG_GROUP = 'University Belt Residential Township Zone'; // 42 chars
const LONG_SCHOOL = 'Dr TMA Pai International Composite PU College'; // 46 chars

// Issue #2089 fix cycle 4 — the reviewer-required spread of real-world
// viewport widths: 320px (the standard "smallest supported mobile" floor),
// 344/360px (common real Android CSS widths sitting right around fix cycle
// 3's un-checked break-even point), and 390px (fix cycle 3's original,
// insufficient single data point). Verifying every journey's worst case
// across all four catches a regression in either the viewport assumption
// itself or in a future maxWidthClass edit.
const VIEWPORT_WIDTHS = [320, 344, 360, 390] as const;

// Issue #2089 fix cycle 4 — the production derivation's chosen text-zoom
// margin: up to ~20% (1.2x), a conservative stand-in for Android/iOS
// "Larger Text" accessibility settings (which commonly reach 115-130%),
// applied to every rem-based chrome dimension (padding, leading icon,
// chevron, segmentGapClass) — but deliberately NOT to `maxWidthClass`
// values, which are literal, non-scaling `px`. This asymmetry (chrome grows
// with zoom, label caps don't) is exactly the gap fix cycle 3 missed.
const TEXT_ZOOM = 1.2;

/**
 * Mirrors `useDiscoverMapPresentation.ts`/`AreasBreadcrumbTrail.tsx`'s own
 * row-budget derivation: container = min(0.88*viewport, 520), minus the
 * pill's fixed chrome (BASE_CONTAINER's `px-3` padding = 24px nominal, and
 * the leading icon `h-3.5 w-3.5` (14px) + its `gap-1.5` (6px) to the `<ol>`
 * = 20px nominal — both NOT density-dependent), each scaled by `TEXT_ZOOM`
 * since they're rem-based.
 */
function computeRowWidth(viewportWidth: number): number {
  const containerMaxWidth = Math.min(0.88 * viewportWidth, 520);
  const scaledPadding = 24 * TEXT_ZOOM;
  const scaledIconOverhead = 20 * TEXT_ZOOM;
  return containerMaxWidth - scaledPadding - scaledIconOverhead;
}

/** Tailwind fixed chevron sizes this component actually emits (h-3 / h-3.5), nominal (unscaled) px. */
const CHEVRON_PX: Record<string, number> = { 'h-3': 12, 'h-3.5': 14 };

function readMaxWidthPx(el: Element): number {
  const match = Array.from(el.classList)
    .map((c) => /^max-w-\[(\d+)px\]$/.exec(c))
    .find((m): m is RegExpExecArray => m !== null);
  if (!match) throw new Error(`Expected a max-w-[Npx] class on ${el.className}`);
  return Number(match[1]);
}

function readChevronPx(nav: Element): number {
  const chevron = nav.querySelectorAll('svg')[1]; // [0] is the leading icon
  if (!chevron) throw new Error('Expected at least one chevron separator');
  const sizeClass = Array.from(chevron.classList).find((c) => c in CHEVRON_PX);
  if (!sizeClass) throw new Error(`No known chevron size class on ${chevron.className}`);
  return CHEVRON_PX[sizeClass];
}

/**
 * Mirrors the CSS flex-wrap line-break rule `DiscoverMapBreadcrumb.tsx`'s
 * `<ol className="flex flex-wrap ...">` relies on: each item's own
 * (unshrunk) natural width decides whether it starts a new line, using the
 * real per-item gap (`segmentGapClass`, both the ol's column-gap between
 * `<li>`s and each `<li>`'s own internal chevron-to-label gap).
 */
function simulateFlexWrapRows(itemWidths: number[], gap: number, rowWidth: number): number {
  let rows = 1;
  let running = 0;
  for (const w of itemWidths) {
    const needed = running === 0 ? w : gap + w;
    if (running + needed > rowWidth) {
      rows += 1;
      running = w;
    } else {
      running += needed;
    }
  }
  return rows;
}

/**
 * Renders `segments` and asserts the greedy-wrap simulation (fed the REAL
 * `max-w-[Npx]`/chevron classes rendered, scaled by `TEXT_ZOOM` to model
 * rem-based chrome growth under OS text-zoom) resolves to <=2 rows at every
 * width in `VIEWPORT_WIDTHS` — the same worst-case check performed for the
 * production derivation, parametrized so a regression at any real supported
 * viewport is caught, not just the single width fix cycle 3 checked.
 */
function assertTwoRowsAcrossViewports(params: {
  testId: string;
  density?: 'default' | 'compact';
  leadingIcon: typeof MapPin;
  segments: DiscoverMapCrumb[];
  nominalGap: number;
}): void {
  const { testId, density, leadingIcon: LeadingIcon, segments, nominalGap } = params;
  const scaledGap = nominalGap * TEXT_ZOOM;

  for (const viewportWidth of VIEWPORT_WIDTHS) {
    it(`resolves to <=2 rows at a ${viewportWidth}px viewport (with ~20% text-zoom modeled)`, () => {
      const { container } = render(
        <DiscoverMapBreadcrumb
          testId={testId}
          density={density}
          containerClassName="max-w-[min(88vw,520px)]"
          leadingIcon={LeadingIcon}
          segments={segments}
        />,
      );
      const nav = screen.getByTestId(testId);
      const chevronPxNominal = readChevronPx(nav);
      const scaledChevron = chevronPxNominal * TEXT_ZOOM;
      const lis = Array.from(container.querySelectorAll('ol > li'));
      expect(lis).toHaveLength(segments.length);

      const itemWidths = lis.map((li, i) => {
        const crumbEl = li.querySelector('a, span');
        if (!crumbEl) throw new Error('Expected a crumb element inside li');
        // Only the label's px cap is real/measured; the chevron+gap overhead
        // is the scaled (text-zoom-modeled) value, matching production.
        const labelWidth = readMaxWidthPx(crumbEl);
        return i === 0 ? labelWidth : scaledChevron + scaledGap + labelWidth;
      });

      const rowWidth = computeRowWidth(viewportWidth);
      const rows = simulateFlexWrapRows(itemWidths, scaledGap, rowWidth);
      expect(
        rows,
        `${segments.length}-segment "${testId}" at its fixed max widths (${itemWidths.join(', ')}px, ` +
          `text-zoom-scaled chrome) against a ${rowWidth.toFixed(1)}px row budget (${viewportWidth}px ` +
          'viewport) must resolve to <=2 rows, or a 3rd row would be silently clipped by the ' +
          'overflow-hidden backstop, hiding a whole crumb',
      ).toBeLessThanOrEqual(2);
    });
  }
}

describe('DiscoverMapBreadcrumb — real two-row guarantee across viewports (Issue #2089 fix cycle 4)', () => {
  describe('school journey worst case (5 segments, compact density)', () => {
    // Issue #2089 fix cycle 4 review (MEDIUM) — imported from
    // `useDiscoverMapPresentation.ts` (not restated as literals) so this
    // fixture always tracks the REAL shipped value; a future edit that
    // widens/narrows a cap here changes what this test actually validates.
    const segments: DiscoverMapCrumb[] = [
      { key: 'city', label: LONG_CITY, maxWidthClass: SCHOOL_BREADCRUMB_MAX_WIDTHS.city },
      { key: 'region', label: LONG_REGION, maxWidthClass: SCHOOL_BREADCRUMB_MAX_WIDTHS.region },
      { key: 'zone', label: LONG_ZONE, maxWidthClass: SCHOOL_BREADCRUMB_MAX_WIDTHS.zone },
      { key: 'area', label: LONG_AREA, maxWidthClass: SCHOOL_BREADCRUMB_MAX_WIDTHS.area },
      { key: 'school', label: LONG_SCHOOL, emphasis: 'school', maxWidthClass: SCHOOL_BREADCRUMB_MAX_WIDTHS.school },
    ];

    it('renders every one of the 5 segments — none dropped/hidden from the DOM', () => {
      render(
        <DiscoverMapBreadcrumb
          testId="school-journey-breadcrumb"
          density="compact"
          containerClassName="max-w-[min(88vw,520px)]"
          leadingIcon={GraduationCap}
          segments={segments}
        />,
      );
      for (const seg of segments) {
        const el = screen.getByTestId(`breadcrumb-seg-${seg.key}`);
        expect(el).toBeInTheDocument();
        // The FULL label is present in the DOM even though CSS `truncate`
        // will visually ellipsize it — proves text-shortening, not
        // crumb-hiding, is what's happening.
        expect(el).toHaveTextContent(seg.label);
      }
    });

    it('every segment keeps truncate + its assigned maxWidthClass (text truncated, never hidden)', () => {
      render(
        <DiscoverMapBreadcrumb
          testId="school-journey-breadcrumb"
          density="compact"
          containerClassName="max-w-[min(88vw,520px)]"
          leadingIcon={GraduationCap}
          segments={segments}
        />,
      );
      for (const seg of segments) {
        const el = screen.getByTestId(`breadcrumb-seg-${seg.key}`);
        expect(el).toHaveClass('truncate', seg.maxWidthClass!);
      }
    });

    it('the defensive overflow-hidden/max-h backstop is still present, unchanged', () => {
      render(
        <DiscoverMapBreadcrumb
          testId="school-journey-breadcrumb"
          density="compact"
          containerClassName="max-w-[min(88vw,520px)]"
          leadingIcon={GraduationCap}
          segments={segments}
        />,
      );
      const ol = screen.getByTestId('school-journey-breadcrumb').querySelector('ol');
      expect(ol).toHaveClass('overflow-hidden', 'max-h-[38px]');
    });

    describe('mathematically requires <=2 rows at the actual assigned max widths, even at every segment simultaneously maxed out', () => {
      assertTwoRowsAcrossViewports({
        testId: 'school-journey-breadcrumb',
        density: 'compact',
        leadingIcon: GraduationCap,
        segments,
        nominalGap: 4, // compact segmentGapClass = gap-1 = 4px nominal
      });
    });
  });

  describe('map-group journey worst case (4 segments, default density)', () => {
    // Issue #2089 fix cycle 4 review (MEDIUM) — imported from
    // `useDiscoverMapPresentation.ts` (not restated as literals), same
    // rationale as the school journey fixture above.
    const segments: DiscoverMapCrumb[] = [
      { key: 'city', label: LONG_CITY, maxWidthClass: MAP_GROUP_BREADCRUMB_MAX_WIDTHS.city },
      { key: 'region', label: LONG_REGION, maxWidthClass: MAP_GROUP_BREADCRUMB_MAX_WIDTHS.region, emphasis: 'muted' },
      { key: 'group', label: LONG_GROUP, maxWidthClass: MAP_GROUP_BREADCRUMB_MAX_WIDTHS.group, emphasis: 'muted' },
      { key: 'area', label: LONG_AREA, maxWidthClass: MAP_GROUP_BREADCRUMB_MAX_WIDTHS.area, emphasis: 'strong' },
    ];

    it('renders every one of the 4 segments — none dropped/hidden from the DOM', () => {
      render(
        <DiscoverMapBreadcrumb
          testId="map-group-breadcrumb"
          containerClassName="max-w-[min(88vw,520px)]"
          leadingIcon={MapPin}
          segments={segments}
        />,
      );
      for (const seg of segments) {
        const el = screen.getByTestId(`breadcrumb-seg-${seg.key}`);
        expect(el).toBeInTheDocument();
        expect(el).toHaveTextContent(seg.label);
      }
    });

    it('every segment keeps truncate + its assigned maxWidthClass (text truncated, never hidden)', () => {
      render(
        <DiscoverMapBreadcrumb
          testId="map-group-breadcrumb"
          containerClassName="max-w-[min(88vw,520px)]"
          leadingIcon={MapPin}
          segments={segments}
        />,
      );
      for (const seg of segments) {
        const el = screen.getByTestId(`breadcrumb-seg-${seg.key}`);
        expect(el).toHaveClass('truncate', seg.maxWidthClass!);
      }
    });

    it('the defensive overflow-hidden/max-h backstop is still present, unchanged', () => {
      render(
        <DiscoverMapBreadcrumb
          testId="map-group-breadcrumb"
          containerClassName="max-w-[min(88vw,520px)]"
          leadingIcon={MapPin}
          segments={segments}
        />,
      );
      const ol = screen.getByTestId('map-group-breadcrumb').querySelector('ol');
      expect(ol).toHaveClass('overflow-hidden', 'max-h-[44px]');
    });

    describe('mathematically requires <=2 rows at the actual assigned max widths, even at every segment simultaneously maxed out', () => {
      assertTwoRowsAcrossViewports({
        testId: 'map-group-breadcrumb',
        leadingIcon: MapPin,
        segments,
        nominalGap: 6, // default segmentGapClass = gap-1.5 = 6px nominal
      });
    });
  });

  describe('canonical Areas journey worst case (4 segments, default density, 80px cap)', () => {
    // Issue #2089 fix cycle 3/4 — this is the CANONICAL, most load-bearing
    // journey (`AreasBreadcrumbTrail.tsx`, the actual in-scope trail for
    // issue #2089/#2133/PR #2141, and the one
    // `e2e/discover/issue-2089-breadcrumb-list-flex-layout.spec.ts` drives in
    // a real browser). Its original 140px per-crumb cap was tightened to
    // 110px in fix cycle 3 (390px-only analysis), then to 80px in fix cycle
    // 4 once the real 320px viewport floor + text-zoom were accounted for —
    // see that file's own per-crumb comment for the full arithmetic.
    //
    // Issue #2089 fix cycle 4 review (MEDIUM) — imported from
    // `AreasBreadcrumbTrail.tsx` (not restated as a literal), same
    // rationale as the other two journeys' fixtures above.
    const segments: DiscoverMapCrumb[] = [
      { key: 'root', label: LONG_CITY, maxWidthClass: AREAS_BREADCRUMB_MAX_WIDTH_CLASS },
      { key: 'd:north', label: LONG_REGION, maxWidthClass: AREAS_BREADCRUMB_MAX_WIDTH_CLASS, emphasis: 'muted' },
      { key: 'c:north:hebbal', label: LONG_GROUP, maxWidthClass: AREAS_BREADCRUMB_MAX_WIDTH_CLASS, emphasis: 'muted' },
      { key: 'a:whitefield', label: LONG_AREA, maxWidthClass: AREAS_BREADCRUMB_MAX_WIDTH_CLASS, current: true, emphasis: 'strong' },
    ];

    it('renders every one of the 4 segments — none dropped/hidden from the DOM', () => {
      render(
        <DiscoverMapBreadcrumb
          testId="areas-breadcrumb-trail"
          containerClassName="max-w-[min(88vw,520px)]"
          leadingIcon={MapPin}
          segments={segments}
        />,
      );
      for (const seg of segments) {
        const el = screen.getByTestId(`breadcrumb-seg-${seg.key}`);
        expect(el).toBeInTheDocument();
        expect(el).toHaveTextContent(seg.label);
      }
    });

    it('every segment keeps truncate + its assigned maxWidthClass (text truncated, never hidden)', () => {
      render(
        <DiscoverMapBreadcrumb
          testId="areas-breadcrumb-trail"
          containerClassName="max-w-[min(88vw,520px)]"
          leadingIcon={MapPin}
          segments={segments}
        />,
      );
      for (const seg of segments) {
        const el = screen.getByTestId(`breadcrumb-seg-${seg.key}`);
        expect(el).toHaveClass('truncate', seg.maxWidthClass!);
      }
    });

    it('the defensive overflow-hidden/max-h backstop is still present, unchanged', () => {
      render(
        <DiscoverMapBreadcrumb
          testId="areas-breadcrumb-trail"
          containerClassName="max-w-[min(88vw,520px)]"
          leadingIcon={MapPin}
          segments={segments}
        />,
      );
      const ol = screen.getByTestId('areas-breadcrumb-trail').querySelector('ol');
      expect(ol).toHaveClass('overflow-hidden', 'max-h-[44px]');
    });

    describe('mathematically requires <=2 rows at the actual assigned max widths, even at every segment simultaneously maxed out', () => {
      assertTwoRowsAcrossViewports({
        testId: 'areas-breadcrumb-trail',
        leadingIcon: MapPin,
        segments,
        nominalGap: 6, // default segmentGapClass = gap-1.5 = 6px nominal
      });
    });

    it('sanity-checks that the fix cycle 3 110px cap would have failed at a 320px viewport with text-zoom', () => {
      const scaledChevron = 14 * TEXT_ZOOM;
      const scaledGap = 6 * TEXT_ZOOM;
      const oldItemWidths = [110, scaledChevron + scaledGap + 110, scaledChevron + scaledGap + 110, scaledChevron + scaledGap + 110];
      const rows = simulateFlexWrapRows(oldItemWidths, scaledGap, computeRowWidth(320));
      expect(
        rows,
        'proves the 110px cap fix cycle 4 replaced was genuinely unsafe (not just theoretically ' +
          'tight) once the real 320px viewport floor + text-zoom are modeled, even though it was ' +
          'proven safe at 390px with no zoom in fix cycle 3',
      ).toBeGreaterThan(2);
    });
  });

  describe('regression guard: a naively-widened maxWidthClass would fail the 2-row guarantee', () => {
    it('sanity-checks the simulator itself: 5 unbounded-width (400px) segments need 3+ rows', () => {
      const wideItemWidths = [400, 16 + 400, 16 + 400, 16 + 400, 16 + 400];
      const rows = simulateFlexWrapRows(wideItemWidths, 4, computeRowWidth(320));
      expect(rows).toBeGreaterThan(2);
    });
  });
});
