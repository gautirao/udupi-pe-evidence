import { useMemo } from 'react';
import { isSchoolRadiusOverlayState } from '@/components/discover/SchoolRadiusMapOverlay';
import { deriveShowSchoolMarkers } from '@/features/discover/presentation/schoolFirstCounts';
import { resolveIsSelectedGroupState } from '@/features/discover/selectors/displayEligibility';
import { slugifyFromAreaKey } from '@/lib/areaSlug';
import type { DiscoverPanelContent } from '@/features/discover/selectors/panelContent';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { DiscoverNavContextValue } from '@/features/discover/context/types';

export interface UseDiscoverJourneyChromeControllerParams {
  nav: DiscoverNavContextValue;
  resolvedPanelContent: DiscoverPanelContent;
  effectiveSelectedArea: AreaPoint | null;
  /** Correct ONLY where the branch is provably legacy-areaKey-only — see each use below. */
  legacySelectedArea: AreaPoint | null;
  focusedGroup: AreaGroup | null;
  selectedSchool: SchoolResult | null;
  city: string;
}

/**
 * Issue #2142 (correction pass) — WHICH JOURNEY CHROME THE MAP IS SHOWING.
 *
 * Seven pure predicates/derivations that answer exactly one question — "given
 * the resolved panel content plus the current selection, what chrome does this
 * step render?" — and which were previously scattered across ~450 lines of
 * MapDiscovery.tsx, two of them below the city-validity early return.
 *
 * All are total functions of their inputs, so this controller owns no state
 * and fires no effect; the `useMemo` exists solely to give the surface
 * builders a stable object identity.
 *
 * BRIDGE DISCIPLINE (issue #2083 cycle 4) — one of these reads the RAW
 * `legacySelectedArea` and is individually justified:
 *   - showSchoolBreadcrumb: outer-ANDed with journey === 'school-first', a
 *     journey the canonical node hierarchy never drives.
 * Everything else reads `effectiveSelectedArea`, including
 * `isAreaFirstSelectedAreaState` (issue #2408 fix — see its own comment
 * below for why the earlier legacy-only reasoning didn't hold).
 */
export function useDiscoverJourneyChromeController({
  nav,
  resolvedPanelContent,
  effectiveSelectedArea,
  legacySelectedArea,
  focusedGroup,
  selectedSchool,
  city,
}: UseDiscoverJourneyChromeControllerParams) {
  // Issue #1157 rev-5 DEFECT A — gate for mounting the school-marker layer.
  // school-first keeps markers (first OR term). Additionally surface markers in the
  // area-first school-picking sub-step (schoolPicking) and in area-school-combined
  // (area-first + areaKey + schoolId), so the area-first flow shows both school
  // CARDS and map MARKERS. Reuses the schools[] already passed to PropertyMap —
  // no extra fetch.
  //
  // Visual-parity polish (cycle 3) — the school-first term is additionally gated on
  // `areaKey` being resolved. `schools` is fetched via
  // useSchoolsByArea(schoolsAreaKey, ...), and schoolsAreaKey is `undefined` for
  // school-first until an area is selected — so on the landing (school-browse) and
  // zone-selected (school-group-areas) states `schools` is ALWAYS empty regardless
  // of this gate. Un-gated, SchoolMarkerLayer still mounted at those two states
  // (journey === 'school-first' alone was true) and rendered its "No schools found
  // in this area" empty-state overlay even though the map is correctly showing zone/
  // area clusters, not individual school pins, at that zoom level — a stale/confusing
  // toast pre-dating this branch. Requiring `areaKey` removes the toast at exactly the
  // two states where there was never any real school-marker data to report, while
  // leaving schools-in-area / school-selected / area-school-combined (all of which
  // resolve an areaKey by construction — see setSchoolJourney) byte-for-byte unchanged.
  const showSchoolMarkers = deriveShowSchoolMarkers({
    journey: nav.journey,
    areaKey: nav.areaKey,
    schoolPicking: nav.schoolPicking,
    schoolId: nav.schoolId,
  });

  // Issue #2083 (F2 class sweep) — was the bare `selectedArea`, so a resolved
  // canonical-AREA-leaf node journey lost its area-scoped Trends link and
  // fell back to the generic (undefined / city-wide) trends surface even
  // though the panel and map both show that area's context.
  const trendsHref = effectiveSelectedArea
    ? `/trends/${city}/areas/${slugifyFromAreaKey(effectiveSelectedArea.areaKey)}`
    : undefined;

  // Selected-school radius map overlays (radius legend) only render when a school is
  // selected AND the panel is school-selected/area-school-combined.
  const schoolRadiusOverlay = isSchoolRadiusOverlayState(resolvedPanelContent, !!selectedSchool);

  // The journey breadcrumb (City › Zone › Area › School) renders progressively across
  // ALL school-first drill-down states — zone selected, area selected, and school
  // selected — not only the radius state. The breadcrumb component omits segments whose
  // label is null, so a zone-only context reads "Udupi › University Belt" and an
  // area context reads "Udupi › University Belt › Manipal". Other journeys (area-first,
  // agri-first) keep the generic AreaIndicatorOverlay.
  const showSchoolBreadcrumb =
    nav.journey === 'school-first' &&
    // Issue #2083 cycle 4 — genuinely legacy-only: outer-ANDed with
    // journey === 'school-first', a journey the canonical node hierarchy
    // never drives (verified by code review).
    (!!nav.groupId || !!nav.areaKey || !!legacySelectedArea || !!selectedSchool);

  // Issue #1588 — public-landing marker set. The public landing shows ONLY areas that
  // have live properties — never muted/transparent 0-property markers. A clean, calm
  // empty map (with the centered empty-state message) is preferred over decorative pins,
  // so a city with no live properties (e.g. Bangalore) renders no area markers at all.
  // Drill-down states keep the full area set (unchanged).
  const isLandingState = resolvedPanelContent === 'guided-entry';

  // Issue #1595 — the area-first selected-group drill-down state (a group is focused,
  // no specific area selected yet). Drives the mock-aligned map chrome for this step:
  // the city switcher is hidden, the "verified properties in {group}" pill is centred
  // at the bottom, and the Areas legend is shown.
  // Issue #2083 cycle 4 (code-review BLOCKING fix, 4th recurrence of this bug
  // class) — was the bare legacy value, which is null under a pure canonical
  // node journey (?journey=area-first&groupId=<group>&node=<AREA leaf in that
  // group>, no legacy areaKey). resolvedPanelContent === 'area-groups-landing'
  // is reached there (discoverPanelState.ts:167) and focusedGroup still
  // resolves (node/groupId are independent URL axes — navigation.test.ts:72-78,
  // AC1.4), so this wrongly evaluated true and showed group-overview chrome
  // for a user who had already drilled into a specific area. Mirrors the
  // sibling guard isTopGroupedLevel, which already reads effectiveSelectedArea
  // correctly. Formula extracted to the exported, pure
  // `resolveIsSelectedGroupState` so a regression test can exercise the REAL
  // production predicate — see MapDiscovery.issue2083.selectedGroupState.test.ts.
  const isSelectedGroupState = resolveIsSelectedGroupState(
    resolvedPanelContent,
    focusedGroup,
    effectiveSelectedArea,
  );

  // Issue #1606 — area-first selected-AREA results state (terminal area chosen). Drives
  // the redesigned Manipal-style results panel and the 3-level map breadcrumb. Distinct
  // from isSelectedGroupState (no area yet) — here selectedArea is present.
  //
  // Issue #2408 (5th recurrence of the #2083 bug class) — was gated on
  // `resolvedPanelContent === 'area-selected' && !!legacySelectedArea`. That
  // reasoning ("derivePanelContent only ever returns 'area-selected' when the
  // legacy areaKey is truthy") was correct as far as it went, but incomplete:
  // a canonical `node=` drill-down to a single AREA leaf under the area-first
  // journey (no legacy `areaKey=`) never reaches `derivePanelContent`'s
  // areaKey-gated branch at all — it stays on `resolvedPanelContent ===
  // 'area-groups-landing'` (the plain area-first entry point; #1956 PR-1's
  // non-regression matrix pins `node` as a routing no-op for that function).
  // `effectiveSelectedArea` still resolves correctly there via the
  // node-bridge, so the ONLY thing missing was this predicate's own branch
  // for "area-groups-landing, but a specific area IS resolved" — i.e. the
  // canonical mirror of the legacy 'area-selected' panel. Confirmed live:
  // this state rendered the map's "N homes in {area}" pill at the
  // collision-prone bottom-right position (behind the Leaflet zoom control)
  // instead of the safe centered position, at
  // ?journey=area-first&node=<AREA leaf> with no areaKey param.
  //
  // Issue #2408 review fix (worker 48) — the first cut of this ALSO required
  // `!focusedGroup`, on the assumption that a focused group implies no area
  // is selected yet. That's false: `node`/`groupId` are independent URL
  // axes (see isSelectedGroupState's own #2083 cycle-4 comment above), so
  // `?journey=area-first&groupId=<group>&node=<AREA leaf in that group>` is
  // reachable with BOTH focusedGroup and effectiveSelectedArea truthy. The
  // `!focusedGroup` guard wrongly excluded exactly that state, leaving both
  // this predicate and isSelectedGroupState false and the badge falling
  // through to the collision-prone fallback again. No separate guard is
  // needed here: isSelectedGroupState already requires `!effectiveSelectedArea`
  // (mutually exclusive with this branch by construction), so the two stay
  // disjoint without this predicate re-deriving that exclusion itself.
  const isAreaFirstSelectedAreaState =
    nav.journey === 'area-first' &&
    !!effectiveSelectedArea &&
    (resolvedPanelContent === 'area-selected' ||
      resolvedPanelContent === 'area-groups-landing');

  return useMemo(
    () => ({
      showSchoolMarkers,
      trendsHref,
      schoolRadiusOverlay,
      showSchoolBreadcrumb,
      isLandingState,
      isSelectedGroupState,
      isAreaFirstSelectedAreaState,
    }),
    [
      showSchoolMarkers,
      trendsHref,
      schoolRadiusOverlay,
      showSchoolBreadcrumb,
      isLandingState,
      isSelectedGroupState,
      isAreaFirstSelectedAreaState,
    ],
  );
}
