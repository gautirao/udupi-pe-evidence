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

/**
 * Issue #1882 (Track A PR3, Slice S1) — zoom hysteresis dead-band.
 *
 * `MapContainer` sets no `zoomSnap`/`zoomDelta`, so Leaflet defaults to
 * `zoomSnap = 1` — map zoom is INTEGER-only. There is no fractional zoom
 * oscillating around 12; the real flip-flop is the 12<->13 mount/unmount at
 * the exact integer boundary. `AREA_LAYER_MARKERS_EXIT_ZOOM = 11.5` therefore
 * makes the dead band exactly `{ zoom === 12 }` today — a zoom of 12 neither
 * re-enters 'markers' (not `> AREA_LAYER_MAX_ZOOM`) nor exits to 'overview'
 * (not `<= 11.5`), so `resolveZoomBand` holds the previously-committed band.
 * If `zoomSnap` is ever changed to something fractional (e.g. 0.5), the dead
 * band correctly widens to `(11.5, 12]` without this constant changing.
 */
export const AREA_LAYER_MARKERS_EXIT_ZOOM = 11.5;

/** The committed Discover map zoom band — see `resolveZoomBand`. */
export type ZoomBand = 'overview' | 'markers';

/**
 * Issue #1882 (Track A PR3, Slice S1) — pure zoom-hysteresis resolver.
 *
 * Enters 'markers' once zoom climbs strictly past `AREA_LAYER_MAX_ZOOM` (12).
 * Exits back to 'overview' only once zoom drops to `AREA_LAYER_MARKERS_EXIT_ZOOM`
 * (11.5) or below (i.e. <= 11 under integer zoomSnap). In the dead band
 * (`11.5 < zoom <= 12`, i.e. exactly `zoom === 12` today) the previously
 * committed band is held — this is what prevents a 12<->13 oscillation from
 * flipping the rendered layer on every step.
 *
 * PURE: no module state. Statefulness (the "previously committed" band) is
 * the caller's responsibility — see `useZoomBand`.
 */
export function resolveZoomBand(zoom: number, prevBand: ZoomBand): ZoomBand {
  if (zoom > AREA_LAYER_MAX_ZOOM) return 'markers';
  if (zoom <= AREA_LAYER_MARKERS_EXIT_ZOOM) return 'overview';
  return prevBand;
}

/**
 * Issue #1882 (Track A PR3, Slice S1) — extraction of the previously
 * hardcoded `MarkerClusterLayer`/`AgriMarkerClusterLayer` clustering options
 * (`disableClusteringAtZoom: 16`, `maxClusterRadius: 50`). Single threshold,
 * no intermediate band — behaviour-preserving (same numeric values as
 * before). See the PR3 evidence dir for the :5174 dense-group observation
 * that keeps 16 as the de-clustering zoom.
 */
export const CLUSTER_DISABLE_AT_ZOOM = 16;
export const CLUSTER_MAX_RADIUS_PX = 50;

/** The exactly-one primary Discover map hierarchy layer for a given render. */
export type PrimaryMapLayer = 'area' | 'residentialMarkers' | 'agriCoexist';

export interface SelectPrimaryMapLayerInput {
  /** The COMMITTED zoom band (post-hysteresis) — see `resolveZoomBand`/`useZoomBand`. */
  band: ZoomBand;
  /** Whether PropertyMap is in agri-first mode (`isAgriMode` prop). */
  isAgriMode: boolean;
  /** Whether the `areas` prop is non-empty (AreaMarkerLayer has something to render). */
  hasAreas: boolean;
}

/**
 * Issue #1882 (Track A PR3, Slice S1/S3) — pure one-primary-layer selector.
 *
 * Fixes the CONFIRMED emergent-only exclusivity gap between AreaMarkerLayer
 * and the residential MarkerClusterLayer: before this selector, PropertyMap
 * rendered AreaMarkerLayer whenever `areas.length > 0` and MarkerClusterLayer
 * UNCONDITIONALLY (whenever `!isAgriMode`) — the two could co-mount for a
 * transient window at the 12<->13 boundary while `listings` raced `areas`
 * over the network (the "double-mount" bug this issue fixes).
 *
 * - No areas to show → the residential layer always wins (matches the
 *   pre-existing default: an empty `areas` array never mounted
 *   AreaMarkerLayer anyway, so this is a no-op for that case).
 * - Areas present, committed band is 'overview' → AreaMarkerLayer is the
 *   primary layer; the residential cluster layer is suppressed (this is the
 *   actual fix — previously it stayed mounted underneath).
 * - Areas present, committed band is 'markers' → the residential cluster
 *   layer is the primary layer; AreaMarkerLayer is suppressed.
 * - Agri mode ('agriCoexist') is DELIBERATELY exempted from the
 *   area/residential exclusivity above: AgriMarkerClusterLayer's markers are
 *   NOT zoom-gated the way residential listing markers are (they're driven
 *   by corridor/region selection, not `shouldShowMarkers`), so today
 *   AreaMarkerLayer and the agri cluster layer intentionally coexist at any
 *   zoom — collapsing that pairing into the same exclusivity rule would be a
 *   real behaviour regression, not a bug fix. The caller renders the agri
 *   cluster + polygon layers unconditionally and additionally renders
 *   AreaMarkerLayer whenever `hasAreas` is true, exactly as before.
 */
export function selectPrimaryMapLayer(input: SelectPrimaryMapLayerInput): PrimaryMapLayer {
  if (input.isAgriMode) return 'agriCoexist';
  if (!input.hasAreas) return 'residentialMarkers';
  return input.band === 'overview' ? 'area' : 'residentialMarkers';
}
