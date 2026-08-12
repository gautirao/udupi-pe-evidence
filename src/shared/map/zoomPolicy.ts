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

export function computeCameraPadding(viewportWidthPx?: number): CameraPadding {
  return viewportWidthPx != null && viewportWidthPx < DESKTOP_BREAKPOINT_PX
    ? MOBILE_CAMERA_PADDING
    : DESKTOP_CAMERA_PADDING;
}

/**
 * Issue #1823 (PR #2128, Finding 2) — deliberate CONSERVATIVE FIXED ESTIMATE
 * of the mobile compact listing-preview sheet's occluded height
 * (MobileListingPreviewSheet.tsx). NOT measured: that component is
 * explicitly documented as "intrinsic-height (no max-h/scroll)", so there is
 * no fixed CSS value to read, and a live ResizeObserver/ref-measurement
 * round-trip through MapDiscovery.tsx was judged a disproportionately
 * larger, riskier change (a new effect + callback prop on a
 * presentational-only, already-delivered component) for this fix cycle's
 * budget than a documented estimate.
 *
 * Derived from the sheet's own rendered content (drag handle 4px + its 10px
 * bottom margin, container pt-2.5/pb-4 = 10px + 16px, and the 78px preview
 * image — the tallest element in its flex row, since the text column beside
 * it is vertically centered and shorter): ~118px. Rounded up to 150px for
 * headroom against text wrapping / trust-badge rows on narrow devices.
 *
 * If MobileListingPreviewSheet.tsx's layout changes materially (e.g. a
 * taller image, an added row), this constant must be re-derived — it is not
 * self-updating.
 *
 * PR #2128 final review (HIGH fix) — this value is no longer passed through
 * `computeCameraPadding()` (a single `padding: [x, y]` fitBounds tuple is
 * NOT directional in Leaflet — it applies to both top and bottom). The
 * caller (AreaPanner in PropertyMap.tsx) instead adds it directly to only
 * the vertical component of `paddingBottomRight`, Leaflet's actual
 * asymmetric-padding API.
 */
export const MOBILE_LISTING_PREVIEW_OCCLUSION_PX = 150;

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
 * overview vs individual pins). Signals in priority order: (a) a low marker
 * count, legible regardless of zoom; (b) pin density vs viewport area — a
 * dense/high-count set stays clusteredOverview even ABOVE the zoom floor,
 * since revealing hundreds/thousands of individual pins purely because zoom
 * crossed a threshold is exactly the unsafe global-zoom-only decision #1823
 * exists to replace; (c) the zoom floor — reproduces today's
 * `CLUSTER_DISABLE_AT_ZOOM` boolean at the zoom-only decision boundary for
 * every NON-dense case (proven by an equivalence test), but density (b) is
 * checked first so it can override this floor instead of being bypassed by
 * it. Deliberately imports NOTHING from any clustering/rendering module —
 * #1762 wires an actual renderer consumer, this function only decides the
 * mode from already-known inputs.
 *
 * `fittedExtent` is part of the full contract #1762's real consumer will
 * need (e.g. to normalise density against geographic spread rather than
 * pure viewport pixels) but is DEFERRED — not yet consulted by this
 * pixel-density-only heuristic. Accepted into the signature now so it
 * doesn't need to change later, not because it currently contributes to the
 * decision.
 */
export function resolveMarkerRevealMode(
  zoomAfterFit: number,
  markerCount: number,
  viewportWidthPx: number,
  viewportHeightPx: number,
  fittedExtent: [[number, number], [number, number]] | null,
): MarkerRevealMode {
  if (markerCount <= MARKER_REVEAL_COUNT_FLOOR) return 'individualPins';

  const viewportAreaPx = viewportWidthPx * viewportHeightPx;
  const markersPer10kPx = viewportAreaPx > 0 ? (markerCount / viewportAreaPx) * 10_000 : 0;
  const isDense = viewportAreaPx > 0 && markersPer10kPx > MARKER_REVEAL_DENSITY_THRESHOLD_PER_10K_PX;

  // PR #2128 final review (HIGH) — density checked BEFORE the zoom floor,
  // so a dense/high-count set cannot be forced to individualPins purely by
  // crossing CLUSTER_DISABLE_AT_ZOOM. Previously the zoom check was an
  // unconditional early return above every other signal.
  if (isDense) return 'clusteredOverview';
  if (zoomAfterFit >= CLUSTER_DISABLE_AT_ZOOM) return 'individualPins';
  // Degenerate zero-area viewport, NOT dense (isDense is false whenever
  // viewportAreaPx <= 0) — preserves the original zero-area-at-low-zoom
  // fallback exactly.
  if (!(viewportAreaPx > 0)) return 'clusteredOverview';

  void fittedExtent;
  // Real viewport, above the count floor, NOT dense, and zoom below the
  // reveal threshold — matches the original density ternary's else-branch
  // (a genuinely low-density set stays legible regardless of zoom; see the
  // "high marker count spread over a large viewport stays individualPins"
  // test below, unaffected by this fix).
  return 'individualPins';
}

// ── Issue #1762 fix-cycle 5 — spiderfyDistanceMultiplier viewport clamp ──
//
// Fix-cycle 3 set MarkerClusterLayer's spiderfyDistanceMultiplier to a flat
// 3.5, tuned against a live-reproduced 5-member coincident cluster so
// leaflet.markercluster's circle-fan chord (2*legLength*sin(pi/count))
// clears our ~90px-wide price-pill markers (see PropertyMap.tsx's
// MarkerClusterLayer comment for the full derivation, verified against
// node_modules/leaflet.markercluster/dist/leaflet.markercluster-src.js
// _generatePointsCircle/_generatePointsSpiral). That flat value has no
// upper bound tied to viewport size or child count — the WORKDONE_REVIEW
// gate elevated code-reviewer's cycle-3 advisory note on this to BLOCKING:
// for a denser coincident cluster (up to leaflet.markercluster's own
// circle→spiral switchover at 9 members), the SAME 3.5 multiplier produces
// a visibly LARGER fan than the 5-member case it was tuned against
// (circumference = multiplier * 25 * (2 + count) — fan radius scales with
// childCount too, not just multiplier), and Leaflet's spiderfy never
// auto-pans to keep the fan on-screen. Tapped near a narrow mobile
// viewport's edge, an 8-member cluster's fan could theoretically extend
// off-screen or under the mobile compact-preview sheet.
//
// SPIDERFY_DISTANCE_MULTIPLIER_BASE is the fix-cycle-3 value, kept as the
// CEILING here — computeSpiderfyDistanceMultiplier never scales UP past it
// (no evidence a larger fan improves anything). It scales DOWN from that
// ceiling, per the ACTUAL clicked cluster's child count and the map's
// ACTUAL current viewport, so the fan's diameter stays within
// SPIDERFY_FAN_SAFE_VIEWPORT_FRACTION of the smaller viewport dimension —
// but never below a pill-clearance FLOOR re-derived (not assumed) from the
// same chord formula, for THAT child count: chord =
// 2*legLength*sin(pi/count) >= SPIDERFY_MIN_PILL_CLEARANCE_PX. That
// per-count floor is always <= the fix-cycle-3 base (3.5 was one
// conservative value chosen to cover every count up to the spiral
// switchover — see the worked example below), so this clamp can only ever
// narrow the fan toward the safe-viewport bound; it can never widen it
// past 3.5, and it can never drop the fan below what the live-reproduced
// stacking bug needs for that specific child count.
//
// Worked example (count=8, the densest circle-mode case): legLength at the
// 3.5 base = max(3.5*25*10/(2*pi), 35) ≈ 139px (diameter ≈ 278px) — fits a
// typical desktop viewport but can exceed a narrow mobile one. The
// re-derived per-count pill-clearance floor for count=8 is ≈2.96 (chord
// 90px), below 3.5 — so on a narrow viewport this clamp can legitimately
// return something in [2.96, 3.5) instead of always 3.5.
//
// Deliberately excludes spiral mode (count >= 9, leaflet.markercluster's
// own circle→spiral switchover): the spiral formula's legLength grows via
// an accumulating loop rather than a single closed-form circumference, so
// a matching per-count floor would require literally replicating that
// loop rather than reusing the same verified chord formula — a materially
// larger, less-evidence-based change for a case with no live-reproduced
// regression. Spiral-mode clusters keep the flat fix-cycle-3 base
// unchanged (byte-for-byte prior behaviour).
export const SPIDERFY_DISTANCE_MULTIPLIER_BASE = 3.5;
const SPIDERFY_FAN_SAFE_VIEWPORT_FRACTION = 0.35;
const SPIDERFY_MIN_PILL_CLEARANCE_PX = 90;
/** leaflet.markercluster's own MarkerCluster.Spiderfier _circleFootSeparation. */
const SPIDERFY_CIRCLE_FOOT_SEPARATION_PX = 25;
/** leaflet.markercluster's own MarkerCluster.Spiderfier _circleSpiralSwitchover. */
const SPIDERFY_CIRCLE_SPIRAL_SWITCHOVER_COUNT = 9;

/** Mirrors leaflet.markercluster's own `_generatePointsCircle` leg-length formula exactly. */
function circleFanLegLengthPx(multiplier: number, childCount: number): number {
  const circumference = multiplier * SPIDERFY_CIRCLE_FOOT_SEPARATION_PX * (2 + childCount);
  return Math.max(circumference / (2 * Math.PI), 35);
}

/**
 * Issue #1762 fix-cycle 5 — pure viewport-aware clamp for
 * `spiderfyDistanceMultiplier`. See the module comment above this function
 * for the full derivation. Pure: no Leaflet/DOM access — callers pass in
 * the already-read child count and viewport dimensions (e.g. from
 * `cluster.getChildCount()` and `map.getContainer().clientWidth/clientHeight`).
 */
export function computeSpiderfyDistanceMultiplier(
  childCount: number,
  viewportWidthPx: number,
  viewportHeightPx: number,
): number {
  if (childCount >= SPIDERFY_CIRCLE_SPIRAL_SWITCHOVER_COUNT || childCount < 2) {
    // Spiral mode, or a degenerate <2-member "cluster" (spiderfy never
    // fires for these) — fall back to the proven base unchanged.
    return SPIDERFY_DISTANCE_MULTIPLIER_BASE;
  }
  if (!(viewportWidthPx > 0) || !(viewportHeightPx > 0)) {
    // No usable viewport reading (e.g. container not yet laid out) —
    // don't clamp against a zero/invalid bound.
    return SPIDERFY_DISTANCE_MULTIPLIER_BASE;
  }

  const legLengthAtBase = circleFanLegLengthPx(SPIDERFY_DISTANCE_MULTIPLIER_BASE, childCount);
  const safeRadiusPx = (Math.min(viewportWidthPx, viewportHeightPx) * SPIDERFY_FAN_SAFE_VIEWPORT_FRACTION) / 2;
  if (legLengthAtBase <= safeRadiusPx) {
    return SPIDERFY_DISTANCE_MULTIPLIER_BASE;
  }

  // Scale the multiplier down proportionally — legLength is linear in
  // multiplier for any count/viewport combination that reaches this line
  // (the 35px leaflet.markercluster floor is never the binding constraint
  // here: it would require a multiplier well under the pill-clearance
  // floor derived below).
  const viewportScaledMultiplier = SPIDERFY_DISTANCE_MULTIPLIER_BASE * (safeRadiusPx / legLengthAtBase);

  // Re-derived (not assumed) per-count pill-clearance floor from the same
  // chord formula leaflet.markercluster's own circle layout produces:
  // adjacent spiderfied markers sit chord = 2*legLength*sin(pi/count)
  // apart.
  const minChordLegLength = SPIDERFY_MIN_PILL_CLEARANCE_PX / (2 * Math.sin(Math.PI / childCount));
  const pillClearanceFloorMultiplier =
    (minChordLegLength * 2 * Math.PI) / (SPIDERFY_CIRCLE_FOOT_SEPARATION_PX * (2 + childCount));

  return Math.min(
    SPIDERFY_DISTANCE_MULTIPLIER_BASE,
    Math.max(viewportScaledMultiplier, pillClearanceFloorMultiplier),
  );
}

// ── Issue #2139 — coincident-coordinate marker separation ──
//
// leaflet.markercluster sets its own internal `_maxZoom` to
// `disableClusteringAtZoom - 1` and only builds its distance-grid
// clustering/spiderfy machinery UP TO that zoom (verified against
// node_modules/leaflet.markercluster/dist/leaflet.markercluster-src.js:
// `_maxZoom = this.options.disableClusteringAtZoom - 1`, and `_addLayer`'s
// zoom-descending grid lookup starts at `_maxZoom`). At or above
// disableClusteringAtZoom there is no clustering grid at all — every
// listing renders as a raw individual `L.marker` leaf with ZERO
// coincident-point handling. Listings whose geocoded coordinates are
// (near-)identical — a known fallback-tier geocoding artifact for
// same-area listings sharing weak address data — collapse onto the exact
// same pixel position once the map crosses that threshold: live-reproduced
// via DOM inspection (identical `translate3d` transform for distinct
// listing IDs), all fully present and CSS-visible but 100% occluded and
// pointer-unreachable except the topmost DOM node.
//
// This computes a tiny deterministic per-listing geographic nudge so
// coincident listings always resolve to distinct pixel positions, at every
// zoom — including BELOW disableClusteringAtZoom, where leaflet.markercluster
// still owns real clustering/spiderfy. The offset radius is small enough in
// real-world terms (tens of metres) to stay well inside a single cluster's
// grouping radius (CLUSTER_MAX_RADIUS_PX, 50px) at any zoom below the
// disable threshold, so it never changes which cluster a listing joins or
// disturbs the spiderfy fan leaflet.markercluster already produces
// correctly today — it only becomes the SOLE separation mechanism once the
// map crosses into the zoom band where leaflet.markercluster provides none.
//
// Code-review follow-up (#2139, corrected again in #2140) — radiusMeters
// below scales with Math.sqrt(groupSize / 2) and is capped so a large
// coincident group can't grow the offset past a safe bound.
//
// #2140 finding: the ORIGINAL cap compared radiusMeters (the distance from
// the shared origin to EACH member) against the ~230m zoom-15
// cluster-grouping distance (CLUSTER_MAX_RADIUS_PX at CLUSTER_DISABLE_AT_ZOOM
// - 1) as if radius were the relevant figure. It isn't: every member sits
// `radiusMeters` from a shared origin on a circle, so two members on
// OPPOSITE sides of that circle can be up to `2 * radiusMeters` — the fan
// DIAMETER — apart. Comparing the diameter (not the radius) against the
// grouping distance is what actually determines whether the offset can
// split a coincident group across leaflet.markercluster's own internal
// distance-grid clustering, which still groups markers by their ACTUAL
// (offset) rendered position independently of the raw-coordinate shadow map
// that only protects #1762's tap-fit/split decision.
//
// maxSafeCoincidentOffsetRadiusMeters (below) derives the real danger
// distance in metres-per-pixel terms at the given latitude (reusing the
// same cos(latitude) longitude-scaling this function already needs, rather
// than a single hardcoded ~13°N approximation) and keeps the DIAMETER at
// half that distance — a 2x safety margin that absorbs the approximation
// error in "danger distance" itself and any future modest change to
// CLUSTER_MAX_RADIUS_PX/CLUSTER_DISABLE_AT_ZOOM without silently eroding to
// zero headroom. Asserted by a unit test that runs offset positions through
// a REAL `L.markerClusterGroup` at zoom 15 (see
// zoomPolicy.coincidentClusterMembership.test.ts) — a pure-formula check
// alone previously passed while the underlying diameter/radius bug shipped.

/** Metres of geographic separation applied per member of a coincident-coordinate group. */
const COINCIDENT_OFFSET_RADIUS_METERS = 30;
/** Approx metres per degree of latitude (WGS84) — no higher precision needed for a tens-of-metres nudge. */
const METERS_PER_DEGREE_LATITUDE = 111_320;
/**
 * Keeps the fan DIAMETER (2 * radiusMeters) at half of the real zoom-15
 * cluster-grouping distance in metres — see the module comment above for
 * the radius-vs-diameter derivation.
 */
const COINCIDENT_OFFSET_DIAMETER_SAFETY_MARGIN = 0.5;
/**
 * Standard Web Mercator (256px tile) ground resolution constant: metres
 * represented by one screen pixel at zoom 0 on the equator. Resolution at
 * any zoom/latitude is `EQUATOR_METERS_PER_PIXEL_AT_ZOOM_0 * cos(latitude) /
 * 2^zoom` — the same slippy-map tile math Leaflet itself uses internally.
 */
const EQUATOR_METERS_PER_PIXEL_AT_ZOOM_0 = 156_543.03392;

/**
 * The real-world cluster-grouping danger distance (metres) at the given
 * latitude, at CLUSTER_DISABLE_AT_ZOOM - 1 — the densest zoom
 * leaflet.markercluster still actively groups markers at (see the module
 * comment above `computeCoincidentMarkerOffsets`). Latitude-aware (not a
 * single hardcoded ~13°N figure) so the bound stays correct if this
 * function is ever reused outside this project's current latitude band.
 */
function coincidentClusterDangerRadiusMeters(latitudeDegrees: number): number {
  const metersPerPixel =
    (EQUATOR_METERS_PER_PIXEL_AT_ZOOM_0 * Math.cos((latitudeDegrees * Math.PI) / 180)) /
    2 ** (CLUSTER_DISABLE_AT_ZOOM - 1);
  return CLUSTER_MAX_RADIUS_PX * metersPerPixel;
}

/**
 * Maximum per-member offset RADIUS (not diameter) that keeps
 * `2 * radiusMeters` at or below half of `coincidentClusterDangerRadiusMeters`
 * for the given latitude.
 */
function maxSafeCoincidentOffsetRadiusMeters(latitudeDegrees: number): number {
  return (coincidentClusterDangerRadiusMeters(latitudeDegrees) * COINCIDENT_OFFSET_DIAMETER_SAFETY_MARGIN) / 2;
}

export interface CoincidentOffsetListing {
  id: string;
  latitude: number;
  longitude: number;
}

export interface CoincidentOffsetPosition {
  latitude: number;
  longitude: number;
}

/**
 * Groups listings by rounded coordinate (5 decimal places, ~1m of latitude
 * — coarser than raw float equality so near-duplicate fallback-tier
 * geocodes are treated as coincident too, not just byte-identical ones).
 * Listings alone at their coordinate are returned unchanged. Listings that
 * share a coordinate with 1+ others are fanned out to small deterministic
 * positions around that shared point (radius scales mildly with group size
 * so denser coincident groups still separate). Fan ordering is by listing
 * id (stable sort) so the same group always produces the same output
 * across repeated calls/rebuilds — required so a listing's marker doesn't
 * jump on every unrelated buildLayer() rebuild.
 *
 * Every input listing id appears exactly once in the returned map — this
 * function never adds or drops a listing, only repositions it.
 */
export function computeCoincidentMarkerOffsets(
  listings: readonly CoincidentOffsetListing[],
): Map<string, CoincidentOffsetPosition> {
  const groups = new Map<string, CoincidentOffsetListing[]>();
  for (const listing of listings) {
    const key = `${listing.latitude.toFixed(5)},${listing.longitude.toFixed(5)}`;
    const group = groups.get(key);
    if (group) {
      group.push(listing);
    } else {
      groups.set(key, [listing]);
    }
  }

  const offsets = new Map<string, CoincidentOffsetPosition>();
  for (const group of groups.values()) {
    if (group.length === 1) {
      const [listing] = group;
      offsets.set(listing.id, { latitude: listing.latitude, longitude: listing.longitude });
      continue;
    }

    const ordered = [...group].sort((a, b) => a.id.localeCompare(b.id));
    const originLat = ordered[0].latitude;
    const originLng = ordered[0].longitude;
    const radiusMeters = Math.min(
      maxSafeCoincidentOffsetRadiusMeters(originLat),
      COINCIDENT_OFFSET_RADIUS_METERS * Math.max(1, Math.sqrt(ordered.length / 2)),
    );
    const metersPerDegreeLongitude =
      METERS_PER_DEGREE_LATITUDE * Math.cos((originLat * Math.PI) / 180) || METERS_PER_DEGREE_LATITUDE;

    ordered.forEach((listing, index) => {
      const angle = (2 * Math.PI * index) / ordered.length;
      const dLat = (radiusMeters * Math.sin(angle)) / METERS_PER_DEGREE_LATITUDE;
      const dLng = (radiusMeters * Math.cos(angle)) / metersPerDegreeLongitude;
      offsets.set(listing.id, {
        latitude: originLat + dLat,
        longitude: originLng + dLng,
      });
    });
  }

  return offsets;
}
