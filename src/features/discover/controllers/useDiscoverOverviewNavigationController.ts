import { useMemo, useCallback } from 'react';
import { resolveScope, type ScopeNamespaces } from '@/features/discover/selectors/listingScope';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { DiscoverMapLayerKind } from '@/features/discover/selectors/mapLayerCategory';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { DiscoverUrlActions } from '@/hooks/useDiscoverUrlState';
import type { CorridorGroupData } from '@/hooks/useRegionalAreaGroups';

export interface UseDiscoverOverviewNavigationControllerParams {
  // handleOverviewAreaClick inputs (issue #1910 PR2).
  isTopGroupedAgri: boolean;
  corridorGroups: CorridorGroupData[];
  scopeNamespaces: ScopeNamespaces;
  mapLayerKind: DiscoverMapLayerKind;
  armRegionSelect: (source: 'map' | 'panel') => void;
  handleAreaClick: (area: AreaPoint) => void;

  // handleCanonicalNodeSelect inputs (issue #2124 AREA-leaf seam).
  journey: string | null;
  areasNavigationJourney: UseAreasNavigationJourneyResult;
  discoverAreas: AreaPoint[];
  handleAreaSelect: (area: AreaPoint) => void;

  actions: DiscoverUrlActions;
}

/**
 * Issue #2142 (correction pass) — split out of the former
 * `useDiscoverMapPresentationController` (`handleOverviewAreaClick`) and
 * lifted off MapDiscovery.tsx (`handleCanonicalNodeSelect` /
 * `activeAreasNavigationJourney`).
 *
 * OWNS "what happens when the user picks a destination off the map overview":
 * the journeyless overview-area click classification (issue #1910 PR2) and the
 * canonical-node select interception (issue #2124).
 *
 * SOLE OWNER of the Schools-canonical-geography (#2124) selection-routing
 * equivalence: a leaf AREA chosen from the MAP (`AreaDestinationMarkerLayer` →
 * `journey.selectNode`) must follow the identical semantic path as the same
 * leaf chosen from the PANEL (`onSelectAreaKey`). `activeAreasNavigationJourney`
 * is the single object that carries that interception to both surfaces — there
 * is exactly one `selectNode` override in the app, and it is here.
 */
export function useDiscoverOverviewNavigationController({
  isTopGroupedAgri,
  corridorGroups,
  scopeNamespaces,
  mapLayerKind,
  armRegionSelect,
  handleAreaClick,
  journey,
  areasNavigationJourney,
  discoverAreas,
  handleAreaSelect,
  actions,
}: UseDiscoverOverviewNavigationControllerParams) {
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

  // Issue #2124 — Map and panel canonical node equivalence (AREA leaf seam).
  // The panel uses onSelectAreaKey to enter the SchoolsInArea path when a leaf AREA is clicked,
  // but the map marker layer (`AreaDestinationMarkerLayer`) fires `journey.selectNode(nodeKey)`.
  // Here we intercept `selectNode` for the school-first journey so map markers and panel rows
  // follow the identical semantic path for AREA children.
  const handleCanonicalNodeSelect = useCallback((nodeKey: string) => {
    if (journey === 'school-first') {
      const child = areasNavigationJourney.node?.children.find((c) => c.nodeKey === nodeKey);
      if (child?.nodeType === 'AREA' && child.areaKey) {
        // Equivalent to the panel's onSelectAreaKey behaviour:
        const match = discoverAreas.find((a) => a.areaKey === child.areaKey);
        if (match) {
          handleAreaSelect(match);
        } else {
          actions.selectArea(child.areaKey);
        }
      } else {
        actions.enterSchoolsJourney(nodeKey);
      }
    } else {
      actions.goToNode(nodeKey);
    }
  }, [journey, areasNavigationJourney.node?.children, discoverAreas, handleAreaSelect, actions]);

  const activeAreasNavigationJourney = useMemo(() => ({
    ...areasNavigationJourney,
    selectNode: handleCanonicalNodeSelect,
  }), [areasNavigationJourney, handleCanonicalNodeSelect]);

  return {
    handleOverviewAreaClick,
    handleCanonicalNodeSelect,
    activeAreasNavigationJourney,
  };
}
