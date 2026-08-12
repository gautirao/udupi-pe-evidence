import { MapPin, GraduationCap } from 'lucide-react';
import { DiscoverMapBreadcrumb, type DiscoverMapCrumb } from '@/components/discover/DiscoverMapBreadcrumb';
import { AreasBreadcrumbTrail } from '@/components/discover/navigation/AreasBreadcrumbTrail';
import { AreaIndicatorOverlay } from '@/components/discover/AreaIndicatorOverlay';
import { CITY_CONFIG } from '@/lib/localityUtils';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { NavigationNodeResponse } from '@/features/discover/navigation/types';

/**
 * Issue #1824 Slice S8 — top-left context overlay: routes between the four
 * breadcrumb/indicator variants MapDiscovery previously rendered inline
 * (~L2900-2953). PURE presentation: every gate/segment array is computed by
 * the page and received by prop. See
 * docs/audit/evidence/issue-1824-map-discovery-decomposition/slice-s8-design.md.
 *
 * Issue #1956 PR 2 (Slice 5) — adds a FIFTH, highest-priority branch: the
 * bounded canonical Areas breadcrumb (`AreasBreadcrumbTrail`), rendered
 * whenever `canonicalNavigationNode` is resolved (the canonical Areas
 * preview journey is active AND has a real node). This directly closes the
 * plan's "overlay-vs-panel breadcrumb inconsistency" open defect for the
 * canonical journey: that defect is the legacy `areaJourneySegments` fallback
 * arm (`useDiscoverMapPresentation.ts`, out of this PR's scope) firing
 * "whenever the overlay has no resolved navigationNode" — this branch now
 * ALWAYS wins ahead of it once a real node is resolved, so the generic
 * "Home > City > Areas" fallback can never show over a resolved canonical
 * node. MECHANISM-VERIFIED, not live-browser-confirmed (no backend fixture
 * data available this pass — see the handoff's evidence-blocked note).
 *
 * MV-1 FIX — the pre-existing `map-group-breadcrumb` branch below (legacy
 * area-groups journey, unrelated to the canonical node journey) passed NO
 * `containerClassName`, so `truncate` could never engage and AC5.14's
 * no-clip requirement was exposed on THIS branch even before this PR
 * (confirmed by qa-fast + independently spot-checked, `must_verify_not_established_fact_breadcrumb_maxwidth`
 * in the execution handoff). Given the SAME bounded max-width the school
 * branch already uses, rather than a new mechanism.
 */
export interface DiscoverMapContextOverlayProps {
  isAreaFirstCityLanding: boolean;
  showSchoolBreadcrumb: boolean;
  areaJourneySegments: DiscoverMapCrumb[];
  schoolJourneySegments: DiscoverMapCrumb[];
  selectedArea: AreaPoint | null;
  focusedGroup: AreaGroup | null;
  city: string;
  /**
   * Issue #1956 PR 2 (Slice 5) — the ONE resolved canonical Areas navigation
   * node (`useAreasNavigationJourney`'s `node`, threaded unchanged). `null`/
   * undefined when the canonical journey is not mounted or not yet resolved
   * — every other branch below is unaffected and behaves exactly as before.
   */
  canonicalNavigationNode?: NavigationNodeResponse | null;
  /**
   * Pure href builder for an ancestor's node key (`urlActions.buildNodeHref`).
   * Required whenever `canonicalNavigationNode` is supplied; unused otherwise.
   */
  buildNavigationNodeHref?: (nodeKey: string) => string | null;
}

export function DiscoverMapContextOverlay({
  isAreaFirstCityLanding,
  showSchoolBreadcrumb,
  areaJourneySegments,
  schoolJourneySegments,
  selectedArea,
  focusedGroup,
  city,
  canonicalNavigationNode = null,
  buildNavigationNodeHref,
}: DiscoverMapContextOverlayProps) {
  return (
    // Issue #2089 (#2133 follow-up, PR #2141) — below the `lg` split-view
    // breakpoint (this file's siblings use the same 1024px cut, e.g.
    // MapDiscovery.tsx's `lg:flex-row`), the map canvas is a FULL-VIEWPORT
    // mobile overlay and the "List" toggle (`mobile-map-close-list-button`,
    // MapDiscovery.tsx-owned, `absolute right-4 top-4`) shares this same top
    // row. The PREVIOUS fix reserved a flat ~176px via an outer
    // `max-w-[calc(100vw-176px)]` shrink, which over-reserved space (the
    // real button is far narrower) and made the breadcrumb clip too
    // aggressively, losing location context at 390px. This wrapper is now a
    // REAL flex row: the breadcrumb side gets `min-w-0 flex-1` (claims
    // whatever width is genuinely free) and an invisible `shrink-0` spacer —
    // sized IDENTICALLY to the real button's own classes/label, never a
    // guessed pixel constant — reserves its EXACT footprint. The real button
    // itself lives in MapDiscovery.tsx (a file this fix does not touch — a
    // concurrent PR owns it), so this pixel-exact spacer, rather than a
    // single shared JSX parent, is what keeps the two from fighting for the
    // same pixels, matching Fix 2's "one flex composition" intent as closely
    // as is possible without editing that file. Scoped to below `lg` only —
    // the toggle button never renders at `lg`+ (desktop always shows the map
    // as a flex sibling, never this overlay), so desktop keeps its
    // unmodified, unbounded layout.
    <div className="pointer-events-none absolute top-4 left-4 z-[1000] [@media(max-width:1023px)]:right-4 [@media(max-width:1023px)]:flex [@media(max-width:1023px)]:items-start [@media(max-width:1023px)]:gap-2">
      {/* The wrapper spans the FULL row (including the reserved-space gap
          over the real toggle button below `lg`) so the ghost spacer can sit
          at its end — `pointer-events-none` above stops that transparent
          span from swallowing clicks meant for the real button underneath;
          this child re-enables pointer events for the actual breadcrumb
          content only. */}
      <div className="pointer-events-auto min-w-0 [@media(max-width:1023px)]:flex-1">
        {canonicalNavigationNode ? (
          <AreasBreadcrumbTrail
            node={canonicalNavigationNode}
            buildHref={buildNavigationNodeHref ?? (() => null)}
            // PR #2141 follow-up (Fix 1) — the real display label for the
            // synthesized City-root crumb, matching the label every other
            // branch in this file already uses for the city.
            cityLabel={CITY_CONFIG[city]?.label ?? city}
          />
        ) : isAreaFirstCityLanding ? (
        // Issue #1607 — the area-first city-level landing shows the
        // "Home › City › Areas" breadcrumb (mock placement). Home and the city
        // crumb route progressively; "Areas" is the terminal (current) page.
        <DiscoverMapBreadcrumb
          testId="area-first-landing-breadcrumb"
          containerClassName="px-3.5 shadow-md"
          leadingIcon={MapPin}
          leadingIconClassName="text-[hsl(var(--copper))]"
          segments={[
            { key: 'home', label: 'Home', href: '/' },
            {
              key: 'city',
              label: CITY_CONFIG[city]?.label ?? city,
              href: `/discover?city=${encodeURIComponent(city)}`,
              maxWidthClass: 'max-w-[140px]',
            },
            { key: 'areas', label: 'Areas', current: true, emphasis: 'strong' },
          ]}
        />
      ) : showSchoolBreadcrumb ? (
        <DiscoverMapBreadcrumb
          ariaLabel="Journey breadcrumb"
          testId="school-journey-breadcrumb"
          density="compact"
          containerClassName="max-w-[min(88vw,520px)] border-border/60 py-1.5 shadow-md"
          separatorClassName="text-muted-foreground/50"
          leadingIcon={GraduationCap}
          leadingIconClassName="text-[hsl(var(--plum))]"
          segments={schoolJourneySegments}
        />
      ) : areaJourneySegments.length > 1 ? (
        // Issue #1595 / Issue #1606 / Issue #1798 PR-B1 — unified City › Region › Group › Area
        // map breadcrumb across all area-first drill-down and return states.
        <DiscoverMapBreadcrumb
          testId="map-group-breadcrumb"
          leadingIcon={MapPin}
          leadingIconClassName="text-[hsl(var(--copper))]"
          // MV-1 fix (AC5.14) — this branch previously passed no
          // containerClassName at all, so `truncate` (applied per-segment by
          // DiscoverMapBreadcrumb) could never actually engage. Same bounded
          // max-width the school-journey branch above already uses.
          containerClassName="max-w-[min(88vw,520px)] shadow-md"
          segments={areaJourneySegments}
        />
      ) : (
        <AreaIndicatorOverlay
          cityLabel={CITY_CONFIG[city]?.label ?? city}
          focusedGroup={focusedGroup}
          selectedArea={selectedArea}
        />
        )}
      </div>
      {/* Mobile-only ghost spacer (Fix 2) — reserves the List/Map toggle
          button's EXACT rendered footprint so the breadcrumb's flex-1 side
          never grows under it. Deliberately mirrors the real button's own
          classes/label (MapDiscovery.tsx's `mobile-map-close-list-button`:
          `rounded-full border border-border px-4 py-2 text-sm font-medium`,
          text "List") rather than a guessed pixel width, so this stays
          pixel-accurate without this file needing to import or render the
          real button. `invisible` keeps it out of the accessibility tree and
          visual rendering while still occupying layout space; `shrink-0`
          stops the flex row from compressing it. */}
      <div
        aria-hidden="true"
        className="hidden [@media(max-width:1023px)]:block [@media(max-width:1023px)]:shrink-0 invisible pointer-events-none rounded-full border border-border px-4 py-2 text-sm font-medium"
      >
        List
      </div>
    </div>
  );
}
