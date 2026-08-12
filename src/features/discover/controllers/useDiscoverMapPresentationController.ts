import { useMemo, useCallback } from 'react';
import { useDiscoverInteractionState } from '@/features/discover/state/useDiscoverInteractionState';
import { useAreaSearchState } from '@/features/discover/state/useAreaSearchState';
import { useRegionGuideState } from '@/features/discover/state/useRegionGuideState';
import { useReducedMotion } from '@/features/discover/state/useReducedMotion';
import {
  useDiscoverCameraOrchestration,
  type UseDiscoverCameraOrchestrationParams,
} from '@/features/discover/state/useDiscoverCameraOrchestration';
import { useDiscoverJourneyPredicates } from '@/features/discover/presentation/useDiscoverJourneyPredicates';
import { useDiscoverMapPresentation } from '@/features/discover/presentation/useDiscoverMapPresentation';
import { resolveScope, type ScopeNamespaces } from '@/features/discover/selectors/listingScope';
import {
  isSelectedNodeOutOfView as checkIsSelectedNodeOutOfView,
  getCameraIntentForRecenter,
} from '@/pages/MapDiscovery.recenter';
import type { DiscoverUrlState } from '@/hooks/useDiscoverUrlState';
import type { DiscoverPanelContent } from '@/features/discover/selectors/panelContent';
import type { AreaPoint, AreaMarkerClusterInfo } from '@/components/map/AreaMarkerLayer';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { CameraIntent } from '@/hooks/useDiscoverMapData';

export interface UseDiscoverMapPresentationControllerParams {
  // Recenter-affordance inputs (issue #2088 commit 6).
  showAreasNavigationJourney: boolean;
  areasNavigationJourney: UseAreasNavigationJourneyResult;
  mapBbox: [number, number, number, number] | null;
  publishRecenterCameraIntent: (
    bounds: CameraIntent['bounds'],
    centre: [number, number],
    kind: 'leaf' | 'overview',
  ) => void;

  // useDiscoverCameraOrchestration inputs (issue #1823/#2143 owner).
  urlState: DiscoverUrlState;
  cameraOrchestrationUrlState: UseDiscoverCameraOrchestrationParams['urlState'];
  selectedSchool: UseDiscoverCameraOrchestrationParams['selectedSchool'];
  setPanToArea: UseDiscoverCameraOrchestrationParams['setPanToArea'];
  isLoadingAreaListings: boolean;
  discoverAreas: AreaPoint[];
  areasLoading: boolean;
  areaGroupsData: UseDiscoverCameraOrchestrationParams['areaGroupsData'];
  isLoadingAreaGroups: boolean;
  agriMapListingsData: UseDiscoverCameraOrchestrationParams['agriMapListingsData'];
  cityCenter: [number, number] | undefined;
  focusedGroup: UseDiscoverCameraOrchestrationParams['focusedGroup'];
  summaryRegions: UseDiscoverCameraOrchestrationParams['summaryRegions'];
  selectedRegion: UseDiscoverCameraOrchestrationParams['selectedRegion'];
  selectedMaxKm: UseDiscoverCameraOrchestrationParams['selectedMaxKm'];
  schoolListings: UseDiscoverCameraOrchestrationParams['schoolListings'];
  regionScopedGroupsData: { groups?: UseDiscoverCameraOrchestrationParams['regionScopedGroups'] } | undefined;
  isLoadingRegionScopedGroups: boolean;

  // Shared single source-of-truth region/group namespaces, built once by
  // the Geography controller (Commit 3 batch 1) and reused here for
  // useDiscoverMapPresentation and handleOverviewAreaClick — NOT
  // recomputed, so classification can never drift between call sites.
  scopeNamespaces: ScopeNamespaces;

  // useDiscoverJourneyPredicates inputs.
  resolvedPanelContent: DiscoverPanelContent;
  effectiveSelectedArea: AreaPoint | null;
  cityTotal: number;
  isAgriJourney: boolean;
  mapZoom: number;

  // useDiscoverMapPresentation inputs (beyond what's already covered above).
  isLoadingRegionalAreaGroups: boolean;
  isLandingState: boolean;
  corridorGroups: import('@/hooks/useRegionalAreaGroups').CorridorGroupData[];
  agriAreasData: import('@/hooks/useDiscoverAreas').DiscoverAreasResponse['areas'] | undefined;
  city: string;
  selectedMarkerListing: import('@/hooks/usePropertyListings').PropertyListing & { images?: import('@/hooks/usePropertyListings').PropertyImage[] } | null;
  visibleMemberSet: import('@/features/discover/navigation/visibleMemberSet').VisibleMemberSet | undefined;

  // handleOverviewAreaClick inputs.
  actions: import('@/hooks/useDiscoverUrlState').DiscoverUrlActions;
  handleAreaClick: (area: AreaPoint) => void;
}

/**
 * Issue #2142 Commit 3 (C4, per approved plan) — moved verbatim out of
 * MapDiscovery.tsx. Wraps useDiscoverInteractionState + useAreaSearchState +
 * useRegionGuideState + useReducedMotion (all self-contained, no-arg) + the
 * "Recenter on <label>" affordance (issue #2088 commit 6 —
 * isSelectedNodeOutOfView/handleRecenterOnSelectedNode) +
 * useDiscoverCameraOrchestration (the #1823 camera/framing authority and
 * #2143 canonical Area camera-fit race invariant owner, unchanged) +
 * useDiscoverJourneyPredicates + useDiscoverMapPresentation +
 * handleOverviewAreaClick.
 *
 * This is the last of the 8 approved controllers — flagged as missing by
 * code-reviewer during the Commit 1-3 gate and built as a continuation of
 * Commit 3, not deferred to Commit 4 surfaces.
 *
 * Consolidated into ONE call, positioned LATE (matching
 * useDiscoverCameraOrchestration's pre-refactor position) — same rationale
 * as the School controller: the 4 self-contained early hooks
 * (interactionState/areaSearchState/regionGuideState/reducedMotion) have NO
 * consumer between their pre-refactor early position and this late one
 * (verified), while useDiscoverCameraOrchestration/useDiscoverJourneyPredicates/
 * useDiscoverMapPresentation all genuinely need late-resolving inputs
 * (focusedGroup, summaryRegions, schoolListings, cityTotal, etc.) — so
 * consolidating necessarily picks the latest position. The recenter
 * affordance (mapBbox/areasNavigationJourney/publishRecenterCameraIntent —
 * all available immediately after useDiscoverMapData, much earlier) has no
 * consumer before this point either, so folding it in here does not change
 * its behavior, only its declaration position.
 *
 * Does NOT move `mapBbox`/`bboxTimerRef`/`handleBoundsChange` themselves
 * (already owned by useDiscoverViewportTracker, Commit 3 batch 1) or the
 * `window.__debug` effect that reads this controller's outputs (page-level,
 * untouched — its object SHAPE must stay byte-identical, E2E contract).
 */
export function useDiscoverMapPresentationController({
  showAreasNavigationJourney,
  areasNavigationJourney,
  mapBbox,
  publishRecenterCameraIntent,
  urlState,
  cameraOrchestrationUrlState,
  selectedSchool,
  setPanToArea,
  isLoadingAreaListings,
  discoverAreas,
  areasLoading,
  areaGroupsData,
  isLoadingAreaGroups,
  agriMapListingsData,
  cityCenter,
  focusedGroup,
  summaryRegions,
  selectedRegion,
  selectedMaxKm,
  schoolListings,
  regionScopedGroupsData,
  isLoadingRegionScopedGroups,
  scopeNamespaces,
  resolvedPanelContent,
  effectiveSelectedArea,
  cityTotal,
  isAgriJourney,
  mapZoom,
  isLoadingRegionalAreaGroups,
  isLandingState,
  corridorGroups,
  agriAreasData,
  city,
  selectedMarkerListing,
  visibleMemberSet,
  actions,
  handleAreaClick,
}: UseDiscoverMapPresentationControllerParams) {
  // Issue #1824 Slice S1 — ephemeral hover/emphasis cluster (hoveredListingId,
  // hoveredAreaKeyForMap, highlightedAreaKeys) — never written to the URL.
  const { view: interactionView, commands: interactionCommands } = useDiscoverInteractionState();
  const { hoveredListingId, hoveredAreaKeyForMap, highlightedAreaKeys } = interactionView;

  // Issue #1806 (FIX-5d) — non-splittable area-cluster chip click -> highlight the
  // panel's member-area rows. Never drives any camera movement.
  const handleAreaClusterClick = useCallback((cluster: AreaMarkerClusterInfo) => {
    interactionCommands.setHighlightedAreas(cluster.areas.map((a) => a.areaKey));
  }, [interactionCommands]);

  // Issue #1798 PR-B / #1824 S2c — panel<->map area-marker plumbing.
  const { areaSearchQuery, debouncedAreaSearchQuery, setAreaSearchQuery } = useAreaSearchState();

  // Issue #1824 S2b — regionSelectSource/regionSelectNonce/regionGuideDismissed/armRegionSelect.
  const { view: regionGuideView, commands: regionGuideCommands } = useRegionGuideState();
  const { regionSelectSource, regionSelectNonce, regionGuideDismissed } = regionGuideView;
  const { armRegionSelect, dismissRegionGuide } = regionGuideCommands;

  // Issue #1808 §8 / #1824 Slice S2a — reduced-motion detection for the guidance ring/nudge.
  const prefersReducedMotion = useReducedMotion();

  // ── Issue #2088 (commit 6) — "Recenter on <label>" affordance ──
  const isSelectedNodeOutOfView = useMemo(() => {
    if (!showAreasNavigationJourney) return false;
    return checkIsSelectedNodeOutOfView(areasNavigationJourney.node, mapBbox);
  }, [showAreasNavigationJourney, mapBbox, areasNavigationJourney.node]);

  const handleRecenterOnSelectedNode = useCallback(() => {
    const intent = getCameraIntentForRecenter(areasNavigationJourney.node);
    if (!intent) return;
    publishRecenterCameraIntent(intent.cameraBounds, intent.centre, intent.kind);
  }, [areasNavigationJourney.node, publishRecenterCameraIntent]);

  // Issue #1824 Slice S7 (R9) — camera panner/tick orchestration: schoolFocusTick +
  // schoolMarkerFocusTick + the #1547 fit-once listingsReadyKey guard + the
  // group/scope/agri fitBounds effects. THE #1823/#2143 invariant owner.
  const {
    schoolFocusTick,
    schoolMarkerFocusTick,
    schoolFocusLat: selectedSchoolLat,
    schoolFocusLon: selectedSchoolLon,
    agriGroupFocusBounds,
    canonicalNodeFitCount,
    isColdNavigate,
  } = useDiscoverCameraOrchestration({
    urlState: cameraOrchestrationUrlState,
    selectedSchool,
    setPanToArea,
    isLoadingAreaListings,
    discoverAreas,
    areasLoading,
    areaGroupsData,
    isLoadingAreaGroups,
    agriMapListingsData,
    cityCenter,
    focusedGroup,
    summaryRegions,
    selectedRegion,
    selectedMaxKm,
    schoolListings,
    scopeNamespaces,
    regionScopedGroups: regionScopedGroupsData?.groups,
    isLoadingRegionScopedGroups,
    navigationNodeKey: areasNavigationJourney.node?.nodeKey ?? null,
    navigationNodeBounds: areasNavigationJourney.node?.bounds ?? null,
  });

  // Issue #1824 Slice S11d — pre-layer "C1" predicate cluster.
  const {
    mapLayerKind,
    mapLayerCategory,
    isAreaFirstCityLanding,
    liveAreas,
    cityHasNoListings,
    isTopGroupedAreaOrSchool,
    isTopGroupedAgri,
  } = useDiscoverJourneyPredicates({
    resolvedPanelContent,
    focusedGroup,
    selectedArea: effectiveSelectedArea,
    selectedSchool,
    discoverAreas,
    areasLoading,
    cityTotal,
    urlState,
    isAgriJourney,
    mapZoom,
  });

  // Issue #1824 Slice S9b1/S9b2 — overviewAreas + areaSearchMatchKeys + region/breadcrumb cluster.
  const {
    overviewAreas,
    areaSearchMatchKeys,
    resolvedRegionLabel,
    isRegionOverview,
    regionOverviewMarkerKind,
    regionOverviewShortLabel,
    areaJourneySegments,
    schoolJourneySegments,
  } = useDiscoverMapPresentation({
    mapLayerKind,
    isLoadingAreaGroups,
    isLoadingRegionalAreaGroups,
    isLandingState,
    isAreaFirstCityLanding,
    areaGroupsData,
    discoverAreas,
    corridorGroups,
    agriAreasData,
    liveAreas,
    urlState,
    summaryRegions,
    cityCenter,
    focusedGroup,
    debouncedAreaSearchQuery,
    city,
    selectedArea: effectiveSelectedArea,
    selectedSchool,
    selectedMarkerListing,
    scopeNamespaces,
    regionScopedGroups: regionScopedGroupsData?.groups,
    visibleMemberSet,
  });

  // Issue #1910 (PR2) — resolveScope-based classification for the journeyless
  // overview-area click (macro-region bubble / group bubble / plain area).
  const handleOverviewAreaClick = useCallback((area: AreaPoint) => {
    if (isTopGroupedAgri && corridorGroups.some((c) => c.directionCode === area.areaKey)) {
      actions.setRegionWithMaxKm(area.areaKey);
      return;
    }
    const resolvedAreaKeyScope = resolveScope(area.areaKey, scopeNamespaces);
    if (mapLayerKind === 'macro-region-bubbles' && resolvedAreaKeyScope.kind !== 'none') {
      actions.setScope(area.areaKey);
      armRegionSelect('map');
      return;
    }
    if (resolvedAreaKeyScope.kind === 'group') {
      actions.selectGroup(area.areaKey);
      return;
    }
    handleAreaClick(area);
  }, [isTopGroupedAgri, corridorGroups, scopeNamespaces, mapLayerKind, actions, handleAreaClick, armRegionSelect]);

  return {
    hoveredListingId,
    hoveredAreaKeyForMap,
    highlightedAreaKeys,
    interactionCommands,
    handleAreaClusterClick,
    areaSearchQuery,
    debouncedAreaSearchQuery,
    setAreaSearchQuery,
    regionSelectSource,
    regionSelectNonce,
    regionGuideDismissed,
    armRegionSelect,
    dismissRegionGuide,
    prefersReducedMotion,
    isSelectedNodeOutOfView,
    handleRecenterOnSelectedNode,
    schoolFocusTick,
    schoolMarkerFocusTick,
    selectedSchoolLat,
    selectedSchoolLon,
    agriGroupFocusBounds,
    canonicalNodeFitCount,
    isColdNavigate,
    mapLayerKind,
    mapLayerCategory,
    isAreaFirstCityLanding,
    liveAreas,
    cityHasNoListings,
    isTopGroupedAreaOrSchool,
    isTopGroupedAgri,
    overviewAreas,
    areaSearchMatchKeys,
    resolvedRegionLabel,
    isRegionOverview,
    regionOverviewMarkerKind,
    regionOverviewShortLabel,
    areaJourneySegments,
    schoolJourneySegments,
    handleOverviewAreaClick,
  };
}
