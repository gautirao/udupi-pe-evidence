import { useMemo } from 'react';
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

export interface UseDiscoverSchoolControllerParams
  extends Omit<UseDiscoverJourneyTransitionsParams, 'schools'> {
  // useSchoolsByArea inputs (schoolsAreaKey/categoryFilters derived+passed by caller;
  // urlBoardFilters is already part of UseDiscoverJourneyTransitionsParams above).
  // `schools` itself is now computed INSIDE this controller (from
  // useSchoolsByArea + the board-filter client-side filter), not a caller
  // input — omitted from the inherited type above.
  schoolsAreaKey: string | undefined;
  categoryFilters: string[];
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
  schoolsAreaKey,
  categoryFilters,
  isAuthenticated,
  areaListings,
  schoolRadiusListings,
  filteredListings,
  selectedArea,
  focusedGroup,
  ...journeyTransitionsParams
}: UseDiscoverSchoolControllerParams) {
  const { urlState, urlBoardFilters } = journeyTransitionsParams;

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
    schools,
  });

  const { schoolListings, schoolRadiusFallbackMarkers } = useSchoolListings({
    isAuthenticated,
    filters: journeyTransitionsParams.filters,
    areaListings,
    schoolRadiusListings,
    filteredListings,
    journey: urlState.journey,
    schoolId: urlState.schoolId,
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
