/**
 * Issue #1806 (FIX-5) — pure, Leaflet-free predicates for the area-cluster
 * click "splittable vs not" decision (team-lead-plan.toml [[fixes]] id=FIX-5,
 * architect decision recorded there).
 *
 * Deliberately has ZERO dependency on Leaflet or areaMarkerBucketing.ts
 * (#1802 module, out of scope) so the branch is unit-testable without
 * mounting a map. AreaMarkerLayer's cluster click handler computes the
 * Leaflet-specific inputs (union bounds, map.getBoundsZoom, map.getZoom)
 * and passes only primitives here.
 */

/**
 * Maximum zoom at which the area-overview marker layer remains visible.
 *
 * Mirrors the canonical `AREA_LAYER_MAX_ZOOM` private constant in
 * src/pages/MapDiscovery.tsx (~line 76, =12) and the LITERAL `maxZoom: 12`
 * that MapController's 'overview' branch passes to map.fitBounds
 * (src/components/map/PropertyMap.tsx, MapController's cameraIntent effect).
 *
 * These three copies cannot share a single import without a circular module
 * dependency (MapDiscovery → PropertyMap → AreaMarkerLayer → this file), so —
 * mirroring the existing AREA_PANNER_GROUP_MAX_ZOOM precedent in
 * PropertyMap.tsx — they are kept in sync by a drift-guard test instead
 * (areaClusterSplit.test.ts). If this value ever diverges from either of the
 * other two, a cluster click can drill the camera past the area-marker
 * degradation layer and reproduce the "empty map after clicking +N areas"
 * bug (#1806) even after this fix.
 */
export const AREA_LAYER_MAX_ZOOM = 12;

/**
 * True when a cluster's union bounds cover more than a single point — i.e.
 * its member areas are not all at (effectively) the exact same coordinate.
 * A coincident-centre cluster has no meaningful "split": zooming in further
 * would not visually separate its members.
 */
export function hasSpatialSpread(
  southWest: [number, number],
  northEast: [number, number],
): boolean {
  const EPS = 1e-9;
  return (
    Math.abs(northEast[0] - southWest[0]) > EPS ||
    Math.abs(northEast[1] - southWest[1]) > EPS
  );
}

/**
 * Whether an area-cluster chip click should be treated as "splittable" —
 * i.e. whether moving the camera to the cluster's member bounds would
 * actually change anything the user can see.
 *
 * `cappedTargetZoom` MUST already be clamped to AREA_LAYER_MAX_ZOOM by the
 * caller (`Math.min(AREA_LAYER_MAX_ZOOM, map.getBoundsZoom(...))`) — this
 * function only compares, it does not re-clamp.
 *
 * false in either of two cases:
 *   - the cluster has no spatial spread (coincident member centres); OR
 *   - the capped target zoom would not exceed the current zoom (already as
 *     zoomed-in as the area layer allows, or the bounds are already
 *     comfortably in view).
 */
export function clusterCanSplit(
  currentZoom: number,
  cappedTargetZoom: number,
  hasSpread: boolean,
): boolean {
  return hasSpread && cappedTargetZoom > currentZoom;
}
