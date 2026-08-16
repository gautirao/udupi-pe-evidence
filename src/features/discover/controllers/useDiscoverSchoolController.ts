import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSchoolsByArea } from '@/hooks/useSchoolsByArea';
import {
  useDiscoverJourneyTransitions,
  type UseDiscoverJourneyTransitionsParams,
} from '@/features/discover/state/useDiscoverJourneyTransitions';
import { useSchoolListings } from '@/features/discover/presentation/useSchoolListings';
import { useSchoolFirstCounts } from '@/features/discover/presentation/useSchoolFirstCounts';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import type { SchoolRadiusListingItem } from '@/hooks/useSchoolRadiusListings';
import type { PropertyListing, PropertyImage } from '@/hooks/usePropertyListings';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { DiscoverNavContextValue } from '@/features/discover/context/types';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';

export interface UseDiscoverSchoolControllerParams
  extends Omit<
    UseDiscoverJourneyTransitionsParams,
    'schools' | 'urlBoardFilters' | 'hasResolvedCanonicalArea'
  > {
  /**
   * Issue #2142 (correction pass) — `urlBoardFilters`,
   * `hasResolvedCanonicalArea`, `canonicalSchoolsAreaKey`, `schoolsAreaKey`
   * and `categoryFilters` are no longer caller inputs: all five are derived
   * INSIDE this controller from `nav` + `panelContent`, both of which it
   * already receives. They were five separate page-level consts whose ONLY
   * consumers were this controller's schools query and its journey-flip
   * guard.
   */
  nav: DiscoverNavContextValue;
  /** The ONE resolved canonical Areas journey — read for the #2124 AREA-leaf identity only. */
  areasNavigationJourney: UseAreasNavigationJourneyResult;
  /** Issue #1157 — the canonical area-dismissal Back, wrapped by handleAreaFirstBack below. */
  handleAreaBack: () => void;
  // useSchoolListings inputs beyond what JourneyTransitionsParams already covers
  // (filters/journey via urlState).
  isAuthenticated: boolean;
  areaListings: DiscoverCityListingItem[];
  schoolRadiusListings: SchoolRadiusListingItem[];
  filteredListings: (PropertyListing & { images?: PropertyImage[] })[];
  // useSchoolFirstCounts inputs beyond what's already covered (journey/groupId via urlState).
  selectedArea: AreaPoint | null;
  focusedGroup: AreaGroup | null;
}

/**
 * Issue #2142 Commit 3 (C5, per approved plan) — moved verbatim out of
 * MapDiscovery.tsx. Wraps `useSchoolsByArea` + `useDiscoverJourneyTransitions`
 * (issue #1824 Slice S6 — startOverTick/areaRestoreTick/cityRestoreTick +
 * composedResetMapTick, handleStartOver, handleSelectSchoolById,
 * handleRadiusChange, the school-first Back ladder, onClearSchool/
 * onClearArea, the handleSchoolSelect wrapper, the board-filter sync effect,
 * the schoolById restore/error effect, and the deferred areaKey hydration
 * effect) + `useSchoolListings` (issue #1824 Slice S11b C3) +
 * `useSchoolFirstCounts` (issue #1824 Slice S11b C5).
 *
 * `useDiscoverJourneyTransitions` was NOT deferred like
 * `resolveMarkerPopover`/other late-dependency hooks — confirmed by
 * team-lead against the architect's original plan that this hook belongs
 * to the School controller specifically (not Navigation, despite reading
 * as "the other half of navigation" — see
 * useDiscoverNavigationController.ts's own file-header comment for that
 * earlier finding). Its large params interface (extended here via
 * `UseDiscoverJourneyTransitionsParams`) reflects the hook's own real
 * dependency graph — reusing the hook's existing exported params type
 * directly rather than hand-retyping avoids drift from its true shape.
 *
 * Called LATE (same position as its pre-refactor call sites) — needs
 * outputs from useDiscoverPageState, useDiscoverMapData (schoolById/
 * schoolByIdError/discoverAreas/areasLoading/areaListings/
 * schoolRadiusListings/filteredListings), and `focusedGroup` (page-level
 * derivation via `resolveDiscoverGroupForAreaKey`, shared with the
 * page's own `groupListingsCount` badge derivation — not school-specific,
 * so not owned here).
 */
export function useDiscoverSchoolController({
  nav,
  areasNavigationJourney,
  handleAreaBack,
  isAuthenticated,
  areaListings,
  schoolRadiusListings,
  filteredListings,
  selectedArea,
  focusedGroup,
  ...journeyTransitionsParams
}: UseDiscoverSchoolControllerParams) {
  const { urlState, urlActions, panelContent, setSchoolBoardFilter, setSelectedSchool, setFilters, setBoundedSearchTriggered } =
    journeyTransitionsParams;

  // Issue #1131 — URL-backed board filter for schools. The board filters live in
  // nav.filters.boardFilters (parsed from repeated ?board=CBSE&board=ICSE params).
  // The previous code read `nav.boardFilters`, which is undefined on the URL state
  // shape — boardFilters live under `filters`. That bug meant the URL never reached the
  // schools query.
  const urlBoardFilters = useMemo(
    () => nav.filters.boardFilters ?? [],
    [nav.filters.boardFilters],
  );

  // Issue #2124 (fix-cycle) — true when journey=area-first and the canonical Areas
  // hierarchy is resolved to an AREA leaf (node=a:...). `derivePanelContent`
  // (panelContent) only ever reads the LEGACY `areaKey`/`groupId` params, which
  // the canonical journey never sets — so panelContent alone cannot detect the
  // canonical "schools-in-area" sub-step. This is the server-resolved identity
  // (areasNavigationJourney.node, never parsed/reconstructed from `node=`) used by
  // both the schools query below and the school-select journey-flip guard in
  // useDiscoverJourneyTransitions.
  const hasResolvedCanonicalArea =
    nav.journey === 'area-first' && areasNavigationJourney.node?.nodeType === 'AREA';
  const canonicalSchoolsAreaKey =
    hasResolvedCanonicalArea && (nav.schoolPicking || nav.schoolId)
      ? areasNavigationJourney.node?.areaKey ?? undefined
      : undefined;

  // Issue #1798 — gate on panelContent (derivePanelContent's own routing result)
  // instead of re-deriving journey === 'area-first' / 'school-first' here.
  // derivePanelContent resolves to 'schools-in-area' for school-first+areaKey AND
  // for area-first+schoolPicking AND for the "journeyless" cold-load case (areaKey +
  // schoolPicking with no explicit journey param — e.g.
  // /discover?areaKey=...&groupId=... with no journey=, per #1745 Batch B). The prior
  // literal `journey === 'area-first' && schoolPicking` check missed that third case,
  // so area-first "Add school" silently returned 0 schools for journeyless area URLs
  // even though the SchoolsInAreaPanel itself rendered correctly (routed via the same
  // journeyless fallback in derivePanelContent). Reusing panelContent keeps this query
  // byte-for-byte in sync with the single source of truth for panel routing.
  // Issue #2124 (fix-cycle) — ALSO falls back to canonicalSchoolsAreaKey so the
  // canonical area-first schools-in-area sub-step gets a real areaKey too.
  const schoolsAreaKey =
    (panelContent === 'schools-in-area' ? nav.areaKey ?? undefined : undefined) ??
    canonicalSchoolsAreaKey;

  const categoryFilters = nav.filters.categoryFilters ?? [];

  const schoolsQuery = useSchoolsByArea(schoolsAreaKey, urlBoardFilters, categoryFilters, 20);

  const allSchools = useMemo(
    () => schoolsQuery.data?.pages.flatMap((p) => p.schools) ?? [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [schoolsQuery.data?.pages],
  );

  // Client-side filter — defends against stale server responses and provides instant
  // feedback before the next useSchoolsByArea refetch resolves. Board comparison is
  // case-insensitive (uppercased on both sides).
  const schools = useMemo(() => {
    if (urlBoardFilters.length === 0) return allSchools;
    const wanted = new Set(urlBoardFilters.map((b) => b.toUpperCase()));
    return allSchools.filter((s) => {
      const board = (s.board ?? s.boardType ?? '').toUpperCase();
      return wanted.has(board);
    });
  }, [allSchools, urlBoardFilters]);

  const { view: journeyView, commands: journeyCommands } = useDiscoverJourneyTransitions({
    ...journeyTransitionsParams,
    urlBoardFilters,
    hasResolvedCanonicalArea,
    schools,
  });

  // Issue #1817 (AC8) — after Start Over, move focus to the panel's h1 (city hero) so
  // keyboard users land somewhere sensible (design §8). Start Over always lands on the
  // guided-entry city landing (bare ?city=...), whose h1 carries id="discover-panel-h1"
  // (GuidedEntryPanel). Runs on the next paint after startOverTick changes, since the
  // panel tree must re-render to guided-entry (and mount the new h1) before it can be
  // focused; a plain synchronous focus() call would target the about-to-unmount node.
  // Issue #1824 Slice S6 — reads journeyView.startOverTick (moved-tick owner).
  // Issue #2142 (correction pass) — moved here from MapDiscovery.tsx, immediately
  // after the hook that owns the tick it reads.
  const prevStartOverTickRef = useRef(journeyView.startOverTick);
  useEffect(() => {
    if (journeyView.startOverTick === prevStartOverTickRef.current) return;
    prevStartOverTickRef.current = journeyView.startOverTick;
    const raf = requestAnimationFrame(() => {
      document.getElementById('discover-panel-h1')?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [journeyView.startOverTick]);

  // Single setter consumed by chip UI: updates URL (canonical) and local state (mirror).
  // Always uses REPLACE semantics (urlActions.setBoardFilters is REPLACE-only).
  const handleBoardFilterChange = useCallback(
    (boards: string[]) => {
      setSchoolBoardFilter(boards);
      urlActions.setBoardFilters(boards);
    },
    [setSchoolBoardFilter, urlActions],
  );

  // Issue #1157 — area-first Back wrapper. Ordering is significant (DEFECT B):
  //   1. schoolId set (area-school-combined) → backToSchoolPicking: drop schoolId +
  //      radiusKm, set schoolPicking=1, AND clear local school state (mirrors
  //      onClearSchool) so the radius circle + selected marker actually unmount and
  //      the area's schools-in-area markers reappear. journey/areaKey preserved.
  //   2. schoolPicking set (no schoolId) → clearSchoolPicking: return to area-selected.
  //   3. otherwise → canonical handleAreaBack (area dismissal). handleAreaBack is NOT
  //      modified.
  // schoolId is checked FIRST so combined → Back lands on schools-in-area, not
  // area-selected (the rev-4 ladder skipped this rung and fell through to area
  // dismissal without clearing the school).
  const handleAreaFirstBack = useCallback(() => {
    if (nav.schoolId) {
      // URL: drop schoolId + radiusKm, set schoolPicking=1 (single REPLACE).
      urlActions.backToSchoolPicking();
      // Local cleanup (modelled on onClearSchool): without this the cold-load/restore
      // effect would re-inject selectedSchool from a lingering urlSchoolId and the
      // schoolCircle (keyed off local selectedSchool + filters.schoolLat/Lon) would
      // stay drawn. After the REPLACE removes schoolId the restore effect is inert,
      // but the local clear must happen in the same handler.
      setSelectedSchool(null);
      setFilters((prev) => {
        const next = { ...prev };
        delete next.schoolLat;
        delete next.schoolLon;
        delete next.schoolRadiusKm;
        return next;
      });
      // Issue #1115 — school cleared; reset so CTA reappears on next school select.
      setBoundedSearchTriggered(false);
    } else if (nav.schoolPicking) {
      urlActions.clearSchoolPicking();
    } else {
      handleAreaBack();
    }
  }, [nav.schoolId, nav.schoolPicking, urlActions, handleAreaBack, setSelectedSchool, setFilters]);

  const { schoolListings, schoolRadiusFallbackMarkers } = useSchoolListings({
    isAuthenticated,
    filters: journeyTransitionsParams.filters,
    areaListings,
    schoolRadiusListings,
    filteredListings,
    journey: urlState.journey,
    schoolId: urlState.schoolId,
    // Issue #2183 — same legacy/school-first area bridge this controller already
    // threads to useSchoolFirstCounts below (see that call's own comment for why
    // legacySelectedArea, not effectiveSelectedArea, is correct here).
    selectedArea,
  });

  const {
    schoolFirstLandingSchoolCount,
    schoolFirstZoneSchoolCount,
    schoolFirstAreaSchoolCount,
    schoolZoneLabels,
  } = useSchoolFirstCounts({
    journey: urlState.journey,
    groupId: urlState.groupId,
    selectedArea,
    focusedGroup,
    areasLoading: journeyTransitionsParams.areasLoading,
    discoverAreas: journeyTransitionsParams.discoverAreas,
  });

  return {
    schoolsQuery,
    schools,
    handleBoardFilterChange,
    handleAreaFirstBack,
    journeyView,
    journeyCommands,
    schoolListings,
    schoolRadiusFallbackMarkers,
    schoolFirstLandingSchoolCount,
    schoolFirstZoneSchoolCount,
    schoolFirstAreaSchoolCount,
    schoolZoneLabels,
  };
}
