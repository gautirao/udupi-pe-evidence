/**
 * Issue #1956 PR-4 — pure canonical-AREA-node → in-memory `AreaPoint` bridge
 * (Option C, [scope.three_areakeys].in_memory_selectedArea).
 *
 * Bridges a resolved canonical AREA leaf (`NavigationNodeResponse`, from the
 * `node=` journey's `useAreasNavigationJourney`) into the exact `AreaPoint`
 * shape the pre-existing `selectedArea`-driven listing/marker/popover
 * machinery already consumes (useDiscoverMapData, resolveMarkerListings,
 * resolveMarkerPopover). Pure derivation only — no fetch, no side effects,
 * no React. `NavigationNodeResponse.areaKey` is non-null for an AREA node and
 * `bounds` carries centre + min/max (types.ts NavigationBounds), which is
 * exactly the AreaPoint shape (AreaMarkerLayer.tsx's AreaPoint).
 *
 * Transitional states this module is responsible for (team-lead-plan-pr4.toml
 * "TRANSITIONAL STATES", qa-fast pre-implementation scan):
 *   (a) node resolved, nodeType AREA, bounds populated with a usable centre
 *       -> a real AreaPoint.
 *   (b) node null, or node.areaKey null (cold load / not an AREA leaf)
 *       -> null. Never treated as a leaf.
 *   (c) node.areaKey non-null but node.bounds null
 *       -> null. NEVER synthesize a partial AreaPoint — this is exactly the
 *       crash / blank-map state qa-fast flagged; AreaPoint.geo_center_lat/lon
 *       are non-nullable numbers, so there is no safe partial value here.
 *   (d) bounds present but centreLat/centreLon individually null
 *       -> null, same reason as (c).
 *   (e) node.nodeType is not 'AREA' (Direction/Cluster/root)
 *       -> null. Never broaden gates 1/2/4 past the AREA leaf level.
 *
 * `deriveAreaPointFromNode` is a pure function of `node` alone — callers are
 * responsible for memoising on `node`'s identity (which
 * `useAreasNavigationJourney` already keeps stable — AC3.4/AC3.9/T3) and for
 * only calling it while the canonical Areas journey is actually active
 * (never for the legacy `areaKey=`-driven journeys, which have their own
 * `selectedArea` source and must not be touched by this bridge).
 */
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { NavigationNodeResponse } from './types';

/**
 * True only for a resolved node whose `nodeType` is `'AREA'` AND whose
 * `areaKey` is non-null. A node with `nodeType === 'AREA'` but a null
 * `areaKey` (should not happen per the backend contract, but is not assumed
 * here) is NOT treated as a leaf — every consumer of this predicate (the
 * marker-popover eligibility widening, the layer-registry leaf token) must
 * never admit a leaf on `nodeType` alone.
 */
export function isResolvedAreaLeafNode(
  node: Pick<NavigationNodeResponse, 'nodeType' | 'areaKey'> | null | undefined,
): node is Pick<NavigationNodeResponse, 'nodeType' | 'areaKey'> & { areaKey: string } {
  return node != null && node.nodeType === 'AREA' && node.areaKey != null;
}

/**
 * Pure derivation: `NavigationNodeResponse | null` -> `AreaPoint | null`.
 * Returns null for every transitional/non-leaf state described above rather
 * than throwing or synthesizing a partial value.
 */
export function deriveAreaPointFromNode(
  node: NavigationNodeResponse | null | undefined,
): AreaPoint | null {
  if (!isResolvedAreaLeafNode(node)) return null;
  const bounds = node.bounds;
  if (!bounds) return null; // (c)
  const { centreLat, centreLon, minLat, minLon, maxLat, maxLon } = bounds;
  if (centreLat == null || centreLon == null) return null; // (d)
  const bbox: AreaPoint['bbox'] =
    minLat != null && minLon != null && maxLat != null && maxLon != null
      ? [
          [minLat, minLon],
          [maxLat, maxLon],
        ]
      : null;
  return {
    areaKey: node.areaKey,
    areaLabel: node.displayLabel,
    geo_center_lat: centreLat,
    geo_center_lon: centreLon,
    bbox,
  };
}
