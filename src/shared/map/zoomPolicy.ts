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

// ── Issue #1823 — responsive fitBounds padding (moved from
// useDiscoverMapData.ts, which now re-exports these for compatibility) ──
//
// Issue #1882 (Track A PR2 Slice S4; corrected in the camera-padding rework)
// — Leaflet-native `[horizontalPx, verticalPx]` order (Leaflet's
// Point/padding contract is `[x, y]` = `[horizontal, vertical]`).
//
// Layout finding (verified against the actual JSX, not assumed): the
// Discover map and right panel are FLEX ROW SIBLINGS at the `lg:` breakpoint
// — the panel never overlays the map at any supported breakpoint; below
// `lg:` they stack vertically. So the extra desktop horizontal padding is
// breathing room for the narrower half-width map viewport at desktop widths
// — NOT occlusion avoidance.
//
// `viewportWidthPx` is optional (omitted in non-browser/test contexts or
// when the caller has no viewport signal) — undefined degrades to the
// desktop padding. The breakpoint (1024px) matches the app's existing
// Tailwind `lg:` breakpoint that governs this layout split.
export type CameraPadding = [horizontalPx: number, verticalPx: number];
export const DESKTOP_BREAKPOINT_PX = 1024;
export const MOBILE_CAMERA_PADDING: CameraPadding = [40, 40];
export const DESKTOP_CAMERA_PADDING: CameraPadding = [120, 40];

/**
 * `bottomOcclusionPx` (PR #2128 review cycle 3) — additional bottom padding
 * for viewport chrome that overlaps the map but carries no fitBounds
 * awareness of its own: the mobile compact listing-preview sheet
 * (MobileListingPreviewSheet.tsx) and mobile top controls are the two the
 * caller is responsible for measuring/estimating and passing in. Defaults to
 * 0 — every existing call site (none of which currently has an occlusion
 * signal to pass) is byte-for-byte unaffected.
 */
export function computeCameraPadding(viewportWidthPx?: number, bottomOcclusionPx = 0): CameraPadding {
  const [horizontal, vertical] =
    viewportWidthPx != null && viewportWidthPx < DESKTOP_BREAKPOINT_PX
      ? MOBILE_CAMERA_PADDING
      : DESKTOP_CAMERA_PADDING;
  return [horizontal, vertical + bottomOcclusionPx];
}

// ── Issue #1823 — leaf (real-area) fit zoom clamp ────────────────────────
// Previously inline literals: PropertyMap.tsx's MapController leaf-framing
// branch (`Math.min(16, Math.max(13, rawZoom))`) and AreaPanner's fitBounds
// maxZoom for non-group bounds. Named here so both consumers share one
// source instead of duplicating the [13,16] band.
export const LEAF_FIT_MIN_ZOOM = 13;
export const LEAF_FIT_MAX_ZOOM = 16;

// ── Issue #1823 — AreaPanner seq/reason discriminant ─────────────────────
// Shared between useDiscoverCameraOrchestration.ts (the publisher) and
// PropertyMap.tsx's AreaPanner (the consumer) via this neutral module,
// rather than one importing the other's feature-layer type directly.
export type AreaPanReason = 'group' | 'scope' | 'canonicalNode';

// ── Issue #1823 — restore-wins-on-POP guard ──────────────────────────────
export interface IsRestoreAuthoritativeInput {
  historyAction: string | null | undefined;
  viewport: unknown;
}

/**
 * True when a browser Back/Forward (POP) landed on a URL that already
 * carries a persisted viewport — in that case PropertyMap's
 * URLViewportController is the sole authority for replaying the camera, and
 * any one-shot bbox-derived fit (group/scope/canonical-node) must suppress
 * its own write rather than race it (#2083). Enforced once at the
 * setPanToArea publish boundary (see useDiscoverCameraOrchestration.ts)
 * instead of being copied into each fit effect.
 */
export function isRestoreAuthoritative({ historyAction, viewport }: IsRestoreAuthoritativeInput): boolean {
  return historyAction === 'POP' && viewport != null;
}

// ── Issue #1823 — marker-mode transition input (ships unwired; #1762 wires
// an actual renderer consumer) ───────────────────────────────────────────
export type MarkerRevealMode = 'clusteredOverview' | 'individualPins';

/** Below this many markers, individual pins stay legible at any zoom. */
const MARKER_REVEAL_COUNT_FLOOR = 12;

/** Density tiebreaker threshold — markers per 10,000px^2 of viewport. */
const MARKER_REVEAL_DENSITY_THRESHOLD_PER_10K_PX = 0.5;

/**
 * Pure evidence-based input for #1762's marker-mode transition (clustered
 * overview vs individual pins). Signals in priority order: (a) the zoom
 * floor — reproduces today's `CLUSTER_DISABLE_AT_ZOOM` boolean exactly at
 * the zoom-only decision boundary (proven by an equivalence test); (b) a
 * low marker count, legible regardless of zoom; (c) pin density vs viewport
 * area as a tiebreaker. Deliberately imports NOTHING from any clustering/
 * rendering module — #1762 wires an actual renderer consumer, this function
 * only decides the mode from already-known inputs.
 *
 * `fittedExtent` is part of the full contract #1762's real consumer will
 * need (e.g. to normalise density against geographic spread rather than
 * pure viewport pixels) but is not yet consulted by this pixel-density-only
 * heuristic — accepted now so the signature doesn't need to change later.
 */
export function resolveMarkerRevealMode(
  zoomAfterFit: number,
  markerCount: number,
  viewportWidthPx: number,
  viewportHeightPx: number,
  fittedExtent: [[number, number], [number, number]] | null,
): MarkerRevealMode {
  if (zoomAfterFit >= CLUSTER_DISABLE_AT_ZOOM) return 'individualPins';
  if (markerCount <= MARKER_REVEAL_COUNT_FLOOR) return 'individualPins';

  const viewportAreaPx = viewportWidthPx * viewportHeightPx;
  if (!(viewportAreaPx > 0)) return 'clusteredOverview';

  void fittedExtent;
  const markersPer10kPx = (markerCount / viewportAreaPx) * 10_000;
  return markersPer10kPx > MARKER_REVEAL_DENSITY_THRESHOLD_PER_10K_PX ? 'clusteredOverview' : 'individualPins';
}
