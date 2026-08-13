import { useMemo, useCallback } from 'react';
import {
  useDiscoverCameraOrchestration,
  type UseDiscoverCameraOrchestrationParams,
} from '@/features/discover/state/useDiscoverCameraOrchestration';
import {
  isSelectedNodeOutOfView as checkIsSelectedNodeOutOfView,
  getCameraIntentForRecenter,
} from '@/pages/MapDiscovery.recenter';
import type { ScopeNamespaces } from '@/features/discover/selectors/listingScope';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { CameraIntent } from '@/hooks/useDiscoverMapData';
import type { DiscoverViewport } from '@/hooks/useDiscoverUrlState';
import type { DiscoverAreasResponse } from '@/hooks/useDiscoverAreas';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';

export interface UseDiscoverCameraControllerParams {
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
  schoolListings: DiscoverCityListingItem[];
  scopeNamespaces: ScopeNamespaces;
  regionScopedGroupsData: { groups?: UseDiscoverCameraOrchestrationParams['regionScopedGroups'] } | undefined;
  isLoadingRegionScopedGroups: boolean;

  // Camera-adjacent stable-identity memos (see the file doc's "identity
  // stabilisers" note): the values the three imperative panner effects
  // (URLViewportController / AreaRestorePanner / SchoolMarkerFocusPanner)
  // take as their own effect dependencies.
  viewport: DiscoverViewport | null;
  areaKey: string | null;
  discoverAreasData: DiscoverAreasResponse | undefined;
}

/**
 * Issue #2142 (correction pass) — split out of the former
 * `useDiscoverMapPresentationController`.
 *
 * THE SINGLE OWNER of the Discover map's camera policy:
 *   - Invariant #1823 (camera-fit policy) — via `useDiscoverCameraOrchestration`,
 *     whose call site here is byte-identical to the pre-split one.
 *   - Invariant #2143 (canonical-node camera fix; cold-navigate vs POP-restore)
 *     — `canonicalNodeFitCount` / `isColdNavigate` are re-exported UNRENAMED
 *     because the `window.__debug.mapState` bridge publishes them under those
 *     exact names and Playwright specs assert on them.
 *   - The issue #2088 commit 6 "Recenter on <label>" affordance.
 *
 * NOTHING ELSE IN THE APP MAY IMPORT `useDiscoverCameraOrchestration` —
 * enforced by a static guard in
 * `__tests__/cameraControllerSoleOwnership.guard.test.ts`.
 *
 * IDENTITY STABILISERS: `memoizedInitialCenter` / `areaRestoreArea` /
 * `schoolMarkerPositions` live here rather than in a surface builder because
 * they are not display values — they are referential-identity stabilisers
 * consumed as effect dependencies by URLViewportController, AreaRestorePanner
 * and SchoolMarkerFocusPanner respectively (issue #1547 ITEM 6, issue #1160
 * GAP 2). A builder recomputes on every render and would re-fire those
 * imperative camera effects; they must stay `useMemo` with identical deps.
 */
export function useDiscoverCameraController({
  showAreasNavigationJourney,
  areasNavigationJourney,
  mapBbox,
  publishRecenterCameraIntent,
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
  scopeNamespaces,
  regionScopedGroupsData,
  isLoadingRegionScopedGroups,
  viewport,
  areaKey,
  discoverAreasData,
}: UseDiscoverCameraControllerParams) {
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

  // Memoize initialCenter to prevent URLViewportController effect re-runs on every parent render.
  const memoizedInitialCenter = useMemo(
    () => viewport ? [viewport.lat, viewport.lon] as [number, number] : undefined,
    [viewport],
  );

  // Issue #1160 GAP 2 — derive area coordinates for AreaRestorePanner.
  // Re-derived from discoverAreas at render time (not captured at click time) so the
  // panner always has fresh coords. If discoverAreas hasn't loaded yet, the panner
  // receives null values and skips the restore (no crash).
  const areaRestoreArea = useMemo(() => {
    if (!areaKey) return null;
    return discoverAreasData?.areas?.find((a) => a.areaKey === areaKey) ?? null;
  }, [areaKey, discoverAreasData]);

  // Issue #1547 ITEM 6 — memoize school marker positions to prevent SchoolMarkerFocusPanner
  // from re-running its useEffect on every render due to inline array recreation.
  // schoolListings is already a memoized array; filter+map creates a new identity each render.
  const schoolMarkerPositions = useMemo(
    () =>
      schoolListings
        .filter((l) => l.lat != null && l.lon != null)
        .map((l) => ({ lat: l.lat as number, lon: l.lon as number })),
    [schoolListings],
  );

  return {
    isSelectedNodeOutOfView,
    handleRecenterOnSelectedNode,
    schoolFocusTick,
    schoolMarkerFocusTick,
    selectedSchoolLat,
    selectedSchoolLon,
    agriGroupFocusBounds,
    canonicalNodeFitCount,
    isColdNavigate,
    memoizedInitialCenter,
    areaRestoreArea,
    schoolMarkerPositions,
  };
}
