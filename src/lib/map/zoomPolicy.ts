/**
 * zoomPolicy — Issue #1882 (Track A PR2, Slice S1).
 *
 * The SOLE source of truth for the Discover area/cluster/marker zoom bands.
 * Before this module existed, `AREA_LAYER_MAX_ZOOM = 12` was independently
 * duplicated in three places (src/pages/MapDiscovery.tsx, the literal
 * `maxZoom: 12` in PropertyMap.tsx's MapController 'overview' branch, and
 * src/lib/map/areaClusterSplit.ts) and kept in sync only by a drift-guard
 * test. Consolidating here removes that drift risk — every consumer imports
 * from this module instead of re-declaring the constant.
 *
 * SCHOOL_MARKER_FOCUS_MAX_ZOOM (#1240, =13) is a DISTINCT, unrelated zoom
 * threshold for the school-marker-focus camera (SchoolMarkerFocusPanner in
 * PropertyMap.tsx) — it is NOT part of the area/cluster/marker band and must
 * never be merged with AREA_LAYER_MAX_ZOOM.
 */

/**
 * Maximum zoom at which the area-overview marker layer (area rings /
 * group bubbles / macro-region bubbles) remains visible. Above this zoom,
 * the overview layer degrades and individual listing markers/clusters take
 * over (see `shouldShowMarkers`).
 */
export const AREA_LAYER_MAX_ZOOM = 12;

/**
 * True once the map is zoomed in past the area-overview band — the zoom
 * level at which individual listing markers/clusters should render instead
 * of area/group/region overview bubbles.
 */
export function shouldShowMarkers(zoom: number): boolean {
  return zoom > AREA_LAYER_MAX_ZOOM;
}

/**
 * True while the map is at or within the area-overview band — the inverse
 * of `shouldShowMarkers`, provided so callers that reason in terms of "is
 * the overview layer still active" don't have to re-derive the negation.
 */
export function isOverviewZoomBand(zoom: number): boolean {
  return zoom <= AREA_LAYER_MAX_ZOOM;
}
