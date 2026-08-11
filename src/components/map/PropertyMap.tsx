import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { MapContainer, TileLayer, useMap, Circle, Marker, Polygon, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import { escapeHtml } from '@/lib/security';
import { formatPrice } from '@/lib/formatters';
import { getPropertyTypeVisual, GLYPH_SVG_PATHS } from '@/lib/propertyTypeConfig';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';
import type { PropertyListing, PropertyType, PropertyImage } from '@/hooks/usePropertyListings';
import { DrawControl } from '@/components/map/DrawControl';
import {
  AreaMarkerLayer,
  AreaDestinationMarkerLayer,
  type AreaPoint,
  type AreaMarkerClusterInfo,
} from '@/components/map/AreaMarkerLayer';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { CameraIntent } from '@/hooks/useDiscoverMapData';
import { SchoolMarkerLayer, SELECTED_SCHOOL_PANE_NAME } from '@/components/map/SchoolMarkerLayer';
import { SchoolZoneLabelLayer, type ZoneLabelPoint } from '@/components/map/SchoolZoneLabelLayer';
import type { DiscoverJourney } from '@/hooks/useDiscoverUrlState';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import { GROUP_BOUNDS_SYNTHETIC_KEY } from '@/utils/discoverGroupBounds';
import type { AgriMapListingItem } from '@/hooks/useAgriMapListings';
import { SectorOverlay } from '@/components/map/SectorOverlay';
import {
  AREA_LAYER_MAX_ZOOM,
  CLUSTER_DISABLE_AT_ZOOM,
  CLUSTER_MAX_RADIUS_PX,
  selectPrimaryMapLayer,
} from '@/lib/map/zoomPolicy';
import {
  computeCameraPadding,
  LEAF_FIT_MIN_ZOOM,
  LEAF_FIT_MAX_ZOOM,
  resolveMarkerRevealMode,
  computeSpiderfyDistanceMultiplier,
  SPIDERFY_DISTANCE_MULTIPLIER_BASE,
  type AreaPanReason,
} from '@/shared/map/zoomPolicy';
import { clusterCanSplit, hasSpatialSpread } from '@/shared/map/areaClusterSplit';
import { useZoomBand } from '@/hooks/useZoomBand';

/**
 * Maximum zoom at which the area-overview marker layer remains visible.
 *
 * Issue #1882 (Track A PR2 Slice S1) — re-exported here (rather than
 * duplicated) from the canonical `src/lib/map/zoomPolicy.ts`, which is now
 * the SOLE Discover area/cluster/marker zoom-band source. Consumers of this
 * name (AreaPanner below, and the drift-guard test in
 * `PropertyMap.areaPanner.test.tsx`) continue to import it from here
 * unchanged.
 *
 * Used by AreaPanner: when fitBounds receives a synthetic group-bounds
 * AreaPoint (areaKey === GROUP_BOUNDS_SYNTHETIC_KEY), clamping maxZoom to
 * this value keeps narrow groups (e.g. University Belt) within the zoom
 * band where the area-overview markers are still rendered (issue #1069).
 */
export const AREA_PANNER_GROUP_MAX_ZOOM = AREA_LAYER_MAX_ZOOM;

/**
 * Issue #1823 — naming-only extraction of MapController's agri focusBounds
 * fitBounds padding. This was an undocumented 4th padding tier (distinct
 * from MOBILE_CAMERA_PADDING/DESKTOP_CAMERA_PADDING/AreaPanner's own
 * padding) with no name of its own; zero behaviour change, same [50, 50]
 * value as before.
 */
const LEGACY_FOCUS_BOUNDS_PADDING: [number, number] = [50, 50];

/**
 * Max zoom for SchoolMarkerFocusPanner fitBounds (issue #1240).
 *
 * Why 13: a 5 km radius circle (10 km diameter) only fits the viewport at
 * zoom ≤ 13. When markers cluster tightly near the school, the
 * markerBounds ∩ radiusBounds intersection collapses to markerBounds and an
 * uncapped fitBounds zooms to ~15-17, pushing the radius circle off-screen.
 * 13 matches the anonymous URL zoom so the signed-in and anonymous
 * experiences stay consistent. 13 > AREA_LAYER_MAX_ZOOM (12) so capping here
 * does NOT retrigger the area-ring layer.
 *
 * Only SchoolMarkerFocusPanner is capped here — SchoolFocusPanner (Phase 1)
 * is intentionally left uncapped (qa-fast latent-debt note, issue #1240).
 */
export const SCHOOL_MARKER_FOCUS_MAX_ZOOM = 13;

// Extended listing with images for map display
export interface PropertyListingWithImages extends PropertyListing {
  images?: PropertyImage[];
  /** Issue #1373 — GeoJSON Polygon string for agri listings, forwarded from DiscoverFilteredMarker via filteredMarkerToPropertyListing. */
  boundary_geojson?: string | null;
  /**
   * Issue #2051 — coarse monthly-rent band string (e.g. "₹20–35K"), mirroring `priceBand`
   * but for the rent/lease value carried on `PropertyListing.monthly_rent` (already RUPEES,
   * exact). Populated only for ANONYMOUS callers viewing a rent/lease listing; mutually
   * exclusive with an authed caller's exact `monthly_rent`. Wired through by
   * cityListingToPropertyListing from DiscoverCityListingItem.monthlyRentBand.
   */
  monthlyRentBand?: string | null;
}

// Fix default marker icons in Leaflet
delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Udupi district center
const UDUPI_CENTER: [number, number] = [13.3409, 74.7421];
const DEFAULT_ZOOM = 11;

// Property type configuration is now sourced from getPropertyTypeVisual (propertyTypeConfig.ts).
// agricultural_land is treated as a fallback 'other' visual by getPropertyTypeVisual since it
// is not in PROPERTY_TYPE_VISUAL_MAP (agri markers render in agri-first journey, not area-first).

// Module-level icon cache — avoids creating a new DivIcon object on every render.
// R-A R1 fix: keyed by `${propertyType}|${colour}|${priceLabel}|${selected}` so:
//   - two types with the same formatted price get different icons (colour differs)
//   - selected variant is cached separately from default
//   - null/zero price always renders a '—' fallback (never ₹null / ₹NaN)
const iconCache = new Map<string, L.DivIcon>();

/**
 * Derive the price text shown inside the marker pill.
 *
 * Precedence (Issue #1942):
 *   1. Exact price (price != null && price > 0) → formatted price, `isBand: false`.
 *      This branch is BYTE-IDENTICAL to the pre-#1942 authed control flow — price
 *      === 0 does NOT satisfy `price > 0` and falls through to the band/residual
 *      branches below (0 is never treated as an exact price).
 *   2. Coarse `priceBand` (trimmed, non-empty) → the band string itself, `isBand: true`.
 *      Anonymous residential callers get `priceBand` in place of `price` (#1941);
 *      this is the fix for #1942 — anon pins previously showed a bare '—' because
 *      the icon builders only ever read `price`.
 *   3. Neither present → neutral '—' residual (type disc + glyph still render for
 *      distinguishability). Also covers price===0 with no band, and the agri path
 *      (agri never has a priceBand — always falls through to this residual).
 *
 * Returns `{ label, isPricePill, isBand }`. `isPricePill` is true whenever the pill
 * carries a real (non-residual) label — exact OR band — kept as the pre-existing
 * discriminant name; `isBand` further distinguishes an approximate band label from
 * an exact price so callers can pick the right aria-label copy.
 *
 * Issue #2051 (AC6c) — `monthlyRent`/`monthlyRentBand` extend the same precedence
 * for rent/lease listings, which previously fell through to the bare '—' residual
 * because sale's `price`/`priceBand` are always null for a rent-purpose row.
 * `monthlyRent` is already RUPEES (see [critical_finding_units] — do NOT divide by
 * 100), suffixed '/mo' per the repo's existing convention. Sale precedence (price >
 * priceBand) is checked FIRST and is byte-identical to the pre-#2051 behaviour; the
 * rent arms only apply when both sale fields are absent, which they always are for a
 * rent/lease-purpose row.
 */
function deriveMarkerLabel(
  propertyType: string,
  price: number | null | undefined,
  priceBand?: string | null,
  monthlyRent?: number | null,
  monthlyRentBand?: string | null,
): { label: string; isPricePill: boolean; isBand: boolean } {
  if (price != null && price > 0) {
    return { label: formatPrice(price, 'INR'), isPricePill: true, isBand: false };
  }
  const trimmedBand = priceBand != null ? priceBand.trim() : '';
  if (trimmedBand !== '') {
    return { label: trimmedBand, isPricePill: true, isBand: true };
  }
  if (monthlyRent != null && monthlyRent > 0) {
    return { label: `${formatPrice(monthlyRent, 'INR')}/mo`, isPricePill: true, isBand: false };
  }
  const trimmedRentBand = monthlyRentBand != null ? monthlyRentBand.trim() : '';
  if (trimmedRentBand !== '') {
    return { label: `${trimmedRentBand}/mo`, isPricePill: true, isBand: true };
  }
  // Preserve the isPricePill discriminant — used by callers that need to distinguish
  // a real formatted price from a null/zero fallback without inspecting label content.
  return { label: '—', isPricePill: false, isBand: false };
}

// Exported for unit testing; not part of the public component API.
export { deriveMarkerLabel };

/**
 * Build the inline SVG markup for a glyph disc.
 * Renders a 22×22 circle in `discColour` with a 12×12 white SVG path centred inside.
 */
function buildDiscSvg(glyphPath: string, discColour: string): string {
  return `<div style="
    width:22px;height:22px;border-radius:50%;background:${escapeHtml(discColour)};
    display:flex;align-items:center;justify-content:center;flex-shrink:0;">
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
         stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"
         aria-hidden="true">
      <path d="${escapeHtml(glyphPath)}"/>
    </svg>
  </div>`;
}

/**
 * R-A — White rounded pill marker icon.
 * Shape: bg-white rounded-full pill, left type-coloured disc + glyph, right price text.
 * NULL/zero price: shows '—'; pill is still TYPE-distinguishable via disc colour + glyph.
 *
 * Cache key includes type colour so two different types with the same formatted price
 * are never cache-collided (R1 invariant).
 */
const createMarkerIcon = (
  propertyType: string,
  price: number | null | undefined,
  priceBand?: string | null,
  monthlyRent?: number | null,
  monthlyRentBand?: string | null,
): L.DivIcon => {
  const { label, isBand } = deriveMarkerLabel(propertyType, price, priceBand, monthlyRent, monthlyRentBand);
  const visual = getPropertyTypeVisual(propertyType);
  // R1: key on colour (not just type) so that types sharing the same label get distinct icons.
  // The label now encodes exact price / band / '—' residual, so distinct bands (or a band
  // vs. an exact price sharing the same text) still produce distinct cache keys.
  const cacheKey = `${propertyType}|${visual.colour}|${label}|default`;
  const cached = iconCache.get(cacheKey);
  if (cached) return cached;

  const glyphPath = GLYPH_SVG_PATHS[visual.glyph];
  const discSvg = buildDiscSvg(glyphPath, visual.colour);
  const safeLabel = escapeHtml(label);
  // Issue #1942 — aria-label for the pill: residual → neutral "Price unavailable"
  // (under #1941's contract, anon responses always carry priceBand when a price
  // exists, so reaching residual means no price data exists — a sign-in prompt
  // would be a false promise); band → approximate-price copy; exact price → the
  // visible price text is itself the accessible name (no aria-label needed).
  const ariaLabel = isBand
    ? `aria-label="${escapeHtml(`Approximate price ${label}`)}"`
    : label === '—'
      ? `aria-label="${escapeHtml('Price unavailable')}"`
      : '';

  // Pill dimensions: disc (22px) + gap (7px) + text (~60px max) + h-padding (5+12=17px)
  // Width estimated; Leaflet will clip if too narrow — use auto width via transform.
  const pillHtml = `
    <div data-testid="property-marker" ${ariaLabel} style="
      background:#FFFFFF;
      border:1px solid rgba(0,0,0,0.12);
      border-radius:9999px;
      box-shadow:0 4px 10px rgba(17,24,39,0.07),0 2px 4px rgba(17,24,39,0.05);
      display:inline-flex;
      align-items:center;
      gap:7px;
      padding:5px 12px 5px 5px;
      white-space:nowrap;
      pointer-events:auto;
    ">
      ${discSvg}
      <span style="
        font-family:ui-monospace,'Geist Mono','SF Mono',monospace;
        font-size:12.5px;
        font-weight:700;
        letter-spacing:-0.01em;
        color:hsl(221 39% 11%);
        line-height:1;
      ">${safeLabel}</span>
    </div>`;

  // Wrap in a translate so the pill bottom-edge sits at the listing coordinates.
  const html = `<div style="transform:translate(-50%,-100%);display:inline-block;">${pillHtml}</div>`;

  // Issue #1074 — 'property-marker' class + data-testid for E2E selectors.
  const icon = L.divIcon({
    className: 'custom-marker property-marker',
    html,
    // iconAnchor [0,0] because we use CSS translate(-50%,-100%) on the wrapper.
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });

  iconCache.set(cacheKey, icon);
  return icon;
};

// Preserve: copper ring on selected marker (Issue #1547).
// Value grounded in design source: HSL 18 51% 46% → #B05C3A.
const COPPER_COLOR = '#B05C3A';

/**
 * Issue #1547 — selected-state marker icon.
 * R-A: navy pill background (#1B2A45), white price text, semi-transparent white disc
 * containing a white glyph. Outer box-shadow adds the #1547 copper ring (35% opacity).
 * Scale(1.09) applied via CSS transform on the wrapper for the slight size-up effect.
 *
 * R1 cache: keyed by `${propertyType}|${colour}|${label}|selected` — distinct from
 * the default variant AND from any other type that might share the same formatted price.
 */
const createSelectedMarkerIcon = (
  propertyType: string,
  price: number | null | undefined,
  priceBand?: string | null,
  monthlyRent?: number | null,
  monthlyRentBand?: string | null,
): L.DivIcon => {
  const { label, isBand } = deriveMarkerLabel(propertyType, price, priceBand, monthlyRent, monthlyRentBand);
  const visual = getPropertyTypeVisual(propertyType);
  // R1: include colour in key so types sharing the same price label are not collided.
  // The label encodes exact price / band / '—' residual — distinct bands get distinct keys.
  const cacheKey = `${propertyType}|${visual.colour}|${label}|selected`;
  const cached = iconCache.get(cacheKey);
  if (cached) return cached;

  const glyphPath = GLYPH_SVG_PATHS[visual.glyph];
  // SELECTED: disc = semi-transparent white on the navy pill background
  const discSvg = buildDiscSvg(glyphPath, 'rgba(255,255,255,0.18)');
  const safeLabel = escapeHtml(label);
  // Issue #1942 — same aria-label contract as createMarkerIcon (R5: selected-marker
  // parity); residual reads "Price unavailable", not a sign-in prompt.
  const ariaLabel = isBand
    ? `aria-label="${escapeHtml(`Approximate price ${label}`)}"`
    : label === '—'
      ? `aria-label="${escapeHtml('Price unavailable')}"`
      : '';

  // Navy pill — #1B2A45 = hsl(219 44% 19%) = --primary
  const pillHtml = `
    <div data-testid="property-marker" data-selected="true" ${ariaLabel} style="
      background:#1B2A45;
      border:1px solid rgba(0,0,0,0.15);
      border-radius:9999px;
      box-shadow:0 0 0 3px rgba(176,92,58,0.35),0 4px 10px rgba(17,24,39,0.12),0 2px 4px rgba(17,24,39,0.08);
      display:inline-flex;
      align-items:center;
      gap:7px;
      padding:5px 12px 5px 5px;
      white-space:nowrap;
      pointer-events:auto;
    ">
      ${discSvg}
      <span style="
        font-family:ui-monospace,'Geist Mono','SF Mono',monospace;
        font-size:12.5px;
        font-weight:700;
        letter-spacing:-0.01em;
        color:#FFFFFF;
        line-height:1;
      ">${safeLabel}</span>
    </div>`;

  // scale(1.09) gives the slight size-up; translate(-50%,-100%) anchors pill bottom to coords.
  const html = `<div style="transform:translate(-50%,-100%) scale(1.09);transform-origin:50% 100%;display:inline-block;">${pillHtml}</div>`;

  const icon = L.divIcon({
    className: 'custom-marker property-marker property-marker--selected',
    html,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });

  iconCache.set(cacheKey, icon);
  return icon;
};

// Issue #1942 — exported for unit testing (icon HTML/escaping/aria-label assertions);
// not part of the public component API. Additive: no existing export changed.
export { createMarkerIcon, createSelectedMarkerIcon };

export interface SchoolCircle {
  lat: number;
  lon: number;
  radiusKm: number;
  name: string;
}

interface PropertyMapProps {
  listings: PropertyListingWithImages[];
  selectedListing?: PropertyListingWithImages | null;
  onSelectListing?: (listing: PropertyListingWithImages | null) => void;
  focusBounds?: [[number, number], [number, number]] | null;
  /** Current polygon coordinates from draw-on-map. Passed to DrawControl for overlay rendering. */
  polygon?: [number, number][] | null;
  /** Called when the user finishes drawing a polygon on the map. */
  onPolygonDrawn?: (polygon: [number, number][]) => void;
  /** Called when the user clears the drawn polygon. */
  onPolygonCleared?: () => void;
  /** When set, displays a circle around the selected school on the map. */
  schoolCircle?: SchoolCircle;
  /**
   * Initial map center from URL (?lat=/?lon=). Used as the MapContainer's one-time
   * `center` prop to restore a bookmarked viewport. Distinct from `cityCenter`, which
   * drives post-mount flyTo on city change. When present, takes precedence over cityCenter
   * for the initial render.
   */
  initialCenter?: [number, number];
  /** Initial map zoom from URL (?zoom=). Paired with initialCenter. */
  initialZoom?: number;
  /** History action from the router (PUSH, REPLACE, POP), used to guard URL-viewport restores. */
  historyAction?: string;
  /** Override map center when city changes */
  cityCenter?: [number, number];
  /** Override map zoom when city changes */
  cityZoom?: number;
  /** Area markers from the areas table (geo_center_lat/lon for placement, bbox for fitBounds). */
  areas?: AreaPoint[];
  /** Called when an area marker is clicked (in addition to the built-in bbox fitBounds). */
  onAreaClick?: (area: AreaPoint) => void;
  /**
   * Issue #1801 — fired by AreaMarkerLayer's full-pin click handlers (never by
   * the dots or cluster handlers). Forwarded verbatim to AreaMarkerLayer's
   * `onAreaCameraIntent` prop; the caller (MapDiscovery, via
   * useDiscoverMapData.publishCameraIntent) is expected to synchronously
   * publish a CameraIntent and pass it back down via the `cameraIntent` prop.
   */
  onAreaCameraIntent?: (area: AreaPoint) => void;
  /**
   * Issue #1801 — single source of truth for area-navigation camera moves.
   * MapController fits/flies exactly once per new `seq` and suppresses the one
   * network-driven `focusBounds` refit that follows the same click navigation
   * (strict fit-once — see PropertyMap.cameraIntent.test.tsx).
   */
  cameraIntent?: CameraIntent | null;
  /**
   * When set, area markers NOT in this array are rendered at 0.3 opacity (dimmed).
   * Markers in the array remain at full opacity. Absent = all markers full opacity.
   * Passed through to AreaMarkerLayer unchanged.
   */
  focusedGroupAreas?: string[];
  /**
   * Issue #1798 PR-B — area-marker density degradation for dense area groups.
   * All passed through to AreaMarkerLayer unchanged; every one defaults to
   * undefined so existing callers are byte-for-byte unaffected.
   */
  enableAreaMarkerDegradation?: boolean;
  /** The currently-selected area's key. Passed through to AreaMarkerLayer. */
  selectedAreaKey?: string | null;
  /** Areas matching the active panel search. Passed through to AreaMarkerLayer. */
  areaSearchMatchKeys?: string[];
  /** The area currently hovered/focused in the panel. Passed through to AreaMarkerLayer. */
  hoveredAreaKey?: string | null;
  /** Fired when an area-cluster chip is clicked. Passed through to AreaMarkerLayer. */
  onAreaClusterClick?: (cluster: AreaMarkerClusterInfo) => void;
  /**
   * Issue #1806 (FIX-4) — fired ONLY for a splittable cluster click, with the
   * cluster's union bounds/center. Passed through to AreaMarkerLayer unchanged;
   * the caller is expected to publish it via
   * useDiscoverMapData.publishClusterCameraIntent and feed the result back
   * down via the existing `cameraIntent` prop — MapController's unmodified
   * 'overview' branch (maxZoom 12) then performs the actual camera move.
   */
  onAreaClusterCameraIntent?: (bounds: CameraIntent['bounds'], center: [number, number]) => void;
  /** Fired after each area-marker bucketing recompute with (shown, total). */
  onAreaMarkersComputed?: (shownCount: number, totalCount: number) => void;
  /**
   * Issue #1956 PR 2 (Slice 3, map half) — the ONE `useAreasNavigationJourney`
   * result MapDiscovery resolved (node/levelKind/children/selectNode), threaded
   * through UNCHANGED so the map's Direction destinations and the right
   * panel's cards read the identical node/counts/selectNode reference
   * (AC3.4/AC3.9/T3) rather than each re-deriving their own. `null`/absent
   * whenever the canonical Areas journey is not mounted.
   */
  areasNavigationJourney?: Pick<
    UseAreasNavigationJourneyResult,
    'node' | 'levelKind' | 'children' | 'selectNode'
  > | null;
  /**
   * Issue #1956 PR 2 (Slice 3, pass 4, AC3.9) — the ephemeral hover/focus
   * node_key MapDiscovery owns alongside `areasNavigationJourney`, threaded
   * through unchanged so `AreaDestinationMarkerLayer` and the right panel's
   * `NavigationChildCard` list highlight the SAME child by stable node_key.
   * Never written to the URL — no history entry, no camera fit.
   */
  hoveredNavigationNodeKey?: string | null;
  onNavigationNodeHoverChange?: (nodeKey: string | null) => void;
  /**
   * Issue #1956 PR 3 (bounded state-lift, AC4.12/AC4.5) — the ONE focused
   * visual-AREA-cluster identity MapDiscovery owns alongside
   * `hoveredNavigationNodeKey`, threaded through unchanged so
   * `AreaDestinationMarkerLayer` and the right panel's
   * `DiscoverAreasJourneyPanel` can never disagree on the focused member
   * set. Never written to the URL — no history entry, no camera fit.
   */
  focusedClusterMemberAreaKeys?: readonly string[] | null;
  onClusterFocusChange?: (memberAreaKeys: readonly string[] | null) => void;
  /**
   * REQUIRED CHANGE 6 (review fix, AC4.4/AC4.5) — fired ONLY when a
   * client-side VISUAL AREA CLUSTER (dense-AREA grouping under the canonical
   * Areas journey, never a real node) is clicked, with its member union
   * bounds/center. Passed through to `AreaDestinationMarkerLayer` unchanged;
   * mirrors `onAreaClusterCameraIntent`'s existing plumbing exactly — the
   * caller publishes it via the SAME `useDiscoverMapData.publishClusterCameraIntent`
   * producer (shared monotonic `cameraIntentSeqRef`) and feeds the result
   * back down via the existing `cameraIntent` prop. Reusing that producer is
   * safe here because the legacy `AreaMarkerLayer` and this canonical
   * `AreaDestinationMarkerLayer` are mutually exclusive
   * (`showAreasNavigationDestinations`) — the two call sites never fire in
   * the same render.
   */
  onAreaVisualClusterCameraIntent?: (bounds: CameraIntent['bounds'], center: [number, number]) => void;
  /**
   * Issue #1956 PR 2 (Slice 3, map half) — the SAME dual-preview-gate +
   * `journey === 'area-first'` condition `DiscoverRightPanelContainer`
   * already evaluates to decide whether `DiscoverAreasJourneyPanel` (rather
   * than the legacy panel) is mounted. When true, `AreaDestinationMarkerLayer`
   * replaces the legacy `AreaMarkerLayer` for this render — the two are
   * mutually exclusive, never both mounted, so they never double-render or
   * fight over the area-marker slot.
   */
  showAreasNavigationDestinations?: boolean;
  /** Called on every zoomend with the new zoom level. Used by zoom-band switching logic. */
  onZoomChange?: (zoom: number) => void;
  /**
   * Called after every map moveend/zoomend with the current center + zoom.
   * Intended for debounced URL viewport writes — the caller is responsible for debouncing.
   * Reports { lat, lon, zoom } rounded to map precision (not pre-rounded here).
   */
  onViewportChange?: (viewport: { lat: number; lon: number; zoom: number }) => void;
  /**
   * When set, pans/fits the map to this area. Driven by right-panel card
   * clicks only — never set by marker clicks. Issue #1823 — the `seq`/
   * `reason` fields are populated only by useDiscoverCameraOrchestration's
   * group/scope/canonical-node fit effects (via `guardedSetPanToArea`);
   * other callers keep passing a plain `AreaPoint`, which AreaPanner below
   * treats as an un-sequenced, always-fire legacy write.
   *
   * `consumedSeqRef` (fix cycle 3 — PR #2128 review) is populated alongside
   * `seq`/`reason` by the SAME publisher: a ref owned by
   * useDiscoverCameraOrchestration that survives AreaPanner's own
   * unmount/remount (mapInstanceKey bump, mobile Map dismiss/reopen). See
   * AreaPanner below for how it replaces the old locally-scoped guard ref.
   */
  panToArea?:
    | (AreaPoint & {
        seq?: number;
        reason?: AreaPanReason;
        consumedSeqRef?: MutableRefObject<number>;
      })
    | null;
  /**
   * PR #2128 review cycle 4/final (Finding 2, issue #1823) — additional
   * bottom-ONLY padding (px) added to AreaPanner's `paddingBottomRight`
   * fitBounds option (Leaflet's actual asymmetric-padding API — a single
   * `padding: [x, y]` tuple is NOT directional and would apply to both top
   * and bottom, at double the intended cost). Reserved by the caller
   * PROACTIVELY for any mobile-Map state where `isMarkerPopoverEligible`
   * allows a marker tap to open the compact listing-preview sheet (a
   * superset of the sheet's actual render gate — safe because it never
   * under-reserves, not because it's an exact match) — not reactively
   * toggled by whether that sheet happens to be open right now. See
   * MapDiscovery.tsx's call site and AreaPanner's own effect comment below
   * for why. Defaults to 0 (every existing caller omits it, unaffected).
   */
  bottomOcclusionPx?: number;
  /**
   * Issue #2129 (code-reviewer cycle 1, Finding 1) — the REACTIVE counterpart
   * to `bottomOcclusionPx` above. `bottomOcclusionPx` is a proactive
   * journey/capability signal (true for the whole mobile Map-mode browsing
   * session in an eligible journey, independent of whether the compact
   * preview sheet is actually mounted) — correct as AreaPanner's one-time
   * fit-time padding input, but WRONG as the input to a PERSISTENT viewport
   * clip: using it there would visibly shrink the map for the entire
   * session before any marker is ever tapped. `previewOcclusionPx` is 0
   * unless `MobileListingPreviewSheet` is actually selected/rendered right
   * now (MapDiscovery.tsx: `mobileMapOpen && selectedListingPreview`, the
   * SAME condition that gates the sheet's own render) — this is the value
   * the persistent Leaflet-container-clipping wrapper below must use.
   * Defaults to 0 (every existing caller omits it, unaffected).
   *
   * Issue #2129 (code-reviewer cycle 3) — while the sheet is open, the
   * caller now sources this from the sheet's own measured real height
   * (intrinsic-height content — no max-h/scroll — varies per listing), NOT
   * always the fixed `MOBILE_LISTING_PREVIEW_OCCLUSION_PX` guess; that fixed
   * value remains only the caller's safe first-frame fallback before the
   * sheet's ResizeObserver reports its first real measurement. This
   * component treats the number opaquely either way — it only ever needs
   * "how many px to reserve right now", never which source produced it.
   */
  previewOcclusionPx?: number;
  /** Incrementing tick that triggers a zoom reset to cityCenter/cityZoom. Incremented by handleAreaBack. */
  resetMapTick?: number;
  /** Called once when the Leaflet map instance has finished initialising. Use to gate data-readiness checks. */
  onReady?: () => void;
  /**
   * Called after every map moveend/zoomend (after the first mount event is skipped)
   * with the current bounding box as [south, west, north, east].
   * The caller is responsible for debouncing before triggering API refetches.
   * NaN/Infinity bboxes from hidden containers are suppressed before this fires.
   */
  onBoundsChange?: (bbox: [number, number, number, number]) => void;
  /**
   * Active journey type. Passed through to AreaMarkerLayer to drive the school-count
   * badge variant when journey='school-first' and no school is selected.
   */
  journey?: DiscoverJourney | null;
  /**
   * Currently selected school. Passed through to AreaMarkerLayer. When set,
   * the school-first badge reverts to property count (school already chosen).
   */
  selectedSchool?: SchoolResult | null;
  /**
   * Schools to display as markers on the map. Supplied by MapDiscovery from
   * useSchoolsByArea. Whether they actually render is gated by `showSchoolMarkers`.
   */
  schools?: SchoolResult[];
  /**
   * Issue #1157 rev-5 DEFECT A — master gate for mounting SchoolMarkerLayer.
   * MapDiscovery computes it as
   * `journey === 'school-first' || schoolPicking || (journey === 'area-first' && areaKey && schoolId)`
   * so school markers appear in the area-first school-picking sub-step and the
   * area-school-combined state. school-first's value is unchanged (the OR's first
   * term), so school-first marker rendering is byte-for-byte identical.
   */
  showSchoolMarkers?: boolean;
  /**
   * Called when a school marker is clicked. Should update URL with schoolId + radiusKm.
   */
  onSelectSchool?: (schoolId: string) => void;
  /**
   * Loading state from useSchoolsByArea. Passed to SchoolMarkerLayer for diagnostic UI.
   */
  schoolsIsLoading?: boolean;
  /**
   * Error state from useSchoolsByArea. Passed to SchoolMarkerLayer for diagnostic UI.
   */
  schoolsIsError?: boolean;
  /**
   * Error object from useSchoolsByArea. Passed to SchoolMarkerLayer for error message display.
   */
  schoolsError?: Error | null;
  /**
   * Incrementing tick that triggers a school-focus fitBounds/flyTo.
   * Incremented once per school-id change and once per radiusKm change in the
   * school-first journey. Uses the same handledTickRef guard as resetMapTick so
   * the fit fires exactly once per tick and never re-fires on viewport events.
   * Must only be non-zero when journey === 'school-first' and the school is hydrated.
   */
  schoolFocusTick?: number;
  /** School centre latitude for SchoolFocusPanner — companion to schoolFocusTick. */
  schoolFocusLat?: number;
  /** School centre longitude for SchoolFocusPanner — companion to schoolFocusTick. */
  schoolFocusLon?: number;
  /** School radius in km for SchoolFocusPanner — companion to schoolFocusTick. Falls back to flyTo zoom=14 when 0 or absent. */
  schoolFocusRadiusKm?: number;
  /**
   * Issue #1160 GAP 1 — Incrementing tick that triggers SchoolMarkerFocusPanner to fitBounds
   * over the school centre + marker positions. Fires after listings have settled (non-empty).
   * Phase-2 fit complements Phase-1 (SchoolFocusPanner) by tightening to actual marker extent.
   * Only fires when schoolMarkerPositions is non-empty. Uses handledTickRef guard.
   */
  schoolMarkerFocusTick?: number;
  /** Marker positions (lat/lon) for SchoolMarkerFocusPanner bounds computation. */
  schoolMarkerPositions?: Array<{ lat: number; lon: number }>;
  /**
   * Issue #1160 GAP 2 — Incrementing tick that triggers AreaRestorePanner to fly/fit to the
   * area context after Back is pressed from school-selected (level 2 → 1). Uses handledTickRef.
   */
  areaRestoreTick?: number;
  /** Area geo-centre latitude for AreaRestorePanner fallback flyTo. */
  areaRestoreLat?: number;
  /** Area geo-centre longitude for AreaRestorePanner fallback flyTo. */
  areaRestoreLon?: number;
  /** Area bbox [[s,w],[n,e]] for AreaRestorePanner fitBounds. Takes precedence over lat/lon flyTo. */
  areaRestoreBbox?: [[number, number], [number, number]];
  /**
   * Issue #1160 GAP 2 — Incrementing tick that triggers CityRestorePanner to fly to city
   * center after Back is pressed from schools-in-area (level 1 → 0). Uses handledTickRef.
   */
  cityRestoreTick?: number;
  /** City center [lat, lon] for CityRestorePanner flyTo. */
  cityRestoreCenter?: [number, number];
  /** City zoom for CityRestorePanner flyTo. */
  cityRestoreZoom?: number;
  /**
   * Issue #1372 — when true (journey=agri-first), renders agriculture markers in a
   * separate AgriMarkerClusterLayer with agri-specific cluster icons. The residential
   * MarkerClusterLayer is NOT rendered in agri mode.
   */
  isAgriMode?: boolean;
  /**
   * Issue #1373 — current map zoom level, forwarded from MapDiscovery.
   * Used by AgriPolygonLayer to gate polygon rendering at zoom >= 16
   * (same threshold as disableClusteringAtZoom in AgriMarkerClusterLayer).
   */
  mapZoom?: number;
  /**
   * Issue #1373 — selected agri polygon listing. Passed only to AgriPolygonLayer
   * (not MapController) to avoid unintended flyTo panning on polygon click.
   */
  selectedPolygonListing?: PropertyListingWithImages | null;
  /**
   * Issue #1410 — group-filtered agri listings from the public endpoint.
   * When non-null, overrides `listings` for AgriMarkerClusterLayer + AgriPolygonLayer.
   * When null/undefined, falls back to the existing `listings` prop (no regression).
   */
  agriGroupListings?: AgriMapListingItem[] | null;
  /**
   * Issue #1547 — ID of the currently selected listing (from the `listing` URL param).
   * When set, the corresponding residential marker renders with the copper selected-state
   * icon. Does NOT trigger any camera movement (MapController is not involved).
   * Only wired to MarkerClusterLayer (residential); agri and school markers unaffected.
   */
  selectedListingId?: string | null;
  /**
   * Issue #1547 — ephemeral hover/focus id for card→marker highlight.
   * When set, the matching residential marker renders with the copper selected-state icon.
   * Distinct from selectedListingId (URL-persisted): this is transient React state that
   * resets to null on card mouseleave/blur and never survives a journey switch.
   * Like selectedListingId, flows ONLY to MarkerClusterLayer visual — never to
   * MapController, so no flyTo / zoom / pan occurs on hover.
   */
  hoveredListingId?: string | null;
  /**
   * Issue #1429 — corridor sector overlay for agri corridor-first discovery.
   * When set, renders a non-interactive wedge polygon anchored at cityCenter
   * showing the selected corridor + distance tier.
   * Only shown for agricultural_land property type (caller must gate on this).
   */
  sectorOverlay?: {
    directionCode: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
    maxKm: 10 | 25 | 50 | 100;
  } | null;
  /**
   * School-first only — dark zone/group label pills for the overview map.
   * Supplied by MapDiscovery (gated to the browse/landing state at overview zoom);
   * positions are truthful (group focus point or member-area bounds-centre).
   * Empty/undefined → no zone labels render. Never set for area-first / agri-first.
   */
  schoolZoneLabels?: ZoneLabelPoint[];
  /** Called when a zone label pill is clicked — selects that group (sets groupId). */
  onSelectZone?: (groupId: string) => void;
  /**
   * a3 — Optional callback fired on residential marker click with the pixel position
   * of the click relative to the map container element. Used by MarkerPopoverCard in
   * MapDiscovery to auto-position the popover near the clicked pin. Only wired to
   * MarkerClusterLayer (residential); agri and school markers are unaffected.
   */
  onMarkerClickWithPosition?: (pos: { x: number; y: number }) => void;
  /**
   * Issue #1762 — fired ONLY for a splittable LISTING-marker cluster tap
   * (the leaflet.markercluster residential layer inside MarkerClusterLayer
   * below — NOT an area cluster; see `onAreaClusterCameraIntent` for that
   * producer), with the cluster's own member bounds/center. Passed through
   * to `MarkerClusterLayer` unchanged; the caller is expected to publish it
   * via `useDiscoverMapData.publishMarkerClusterCameraIntent` (shared
   * monotonic `cameraIntentSeqRef`, `framing: 'cluster'`) and feed the
   * result back down via the existing `cameraIntent` prop — MapController's
   * new 'cluster' framing branch performs the actual fit-to-members camera
   * move (never a direct Leaflet `zoomToBounds()` call).
   */
  onMarkerClusterCameraIntent?: (bounds: CameraIntent['bounds'], center: [number, number]) => void;
}

/**
 * Issue #1410 — adapter from the lean public AgriMapListingItem shape to the full
 * PropertyListingWithImages shape required by AgriMarkerClusterLayer + AgriPolygonLayer.
 * Items missing lat/lon are filtered out to prevent Leaflet errors.
 * All non-agri fields that are not available from the public endpoint are set to null.
 */
function adaptAgriMapListingsToMarkers(
  items: AgriMapListingItem[],
): PropertyListingWithImages[] {
  return items
    .filter(item => item.latitude != null && item.longitude != null)
    .map(
      (item): PropertyListingWithImages => ({
        // Required PropertyListing fields
        id: item.id,
        // PropertyType cast: the public endpoint returns 'agricultural_land' string
        property_type: item.propertyType as PropertyType,
        title: item.title ?? null,
        locality: item.locality ?? null,
        price: item.pricePaise != null ? item.pricePaise / 100 : null,
        price_unit: null,
        land_area: item.landArea ?? null,
        land_area_unit: item.landAreaUnit ?? null,
        built_area: null,
        built_area_unit: null,
        bedrooms: null,
        bathrooms: null,
        contact_info: null,
        contact_phone: null,
        description: null,
        latitude: item.latitude,
        longitude: item.longitude,
        confidence_score: null,
        language_detected: null,
        price_per_cent_paise: null,
        is_valid: true,
        // status/is_duplicate are not in AgriMapListingItem (server excludes them).
        // Set to expected LIVE/false so downstream consumers that inspect these fields
        // don't misbehave. The endpoint guarantees LIVE-only rows; is_duplicate=false
        // is likewise guaranteed by the service WHERE clause.
        is_duplicate: false,
        status: 'LIVE',
        // These are required string fields on PropertyListing — public endpoint does not
        // supply them; empty string satisfies the type without fabricating data.
        created_at: '',
        updated_at: '',
        raw_post_id: null,
        listing_purpose: 'sale',
        // Optional extended fields
        areaKey: item.areaKey,
        // PropertyListingWithImages extension
        images: [],
        boundary_geojson: item.boundaryGeoJson ?? null,
      }),
    );
}

/**
 * Fires `onReady` once when the Leaflet map has mounted and is ready.
 * Must be rendered inside a MapContainer so useMap() resolves.
 */
function MapReadySignal({ onReady }: { onReady?: () => void }) {
  useMap(); // ensures we're inside MapContainer — the hook itself resolves the instance
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  useEffect(() => {
    onReadyRef.current?.();
  }, []); // empty deps: fire once on mount; ref always holds the current callback
  return null;
}

/**
 * Issue #2130 — creates the dedicated Leaflet pane for the currently SELECTED
 * school's marker (SELECTED_SCHOOL_PANE_NAME, zIndex 550 — below the default
 * markerPane's 600), imperatively via `map.createPane`, matching this file's
 * existing MapReadySignal/ZoomWatcher useMap()-based controller pattern.
 * Guarded so it is a silent no-op against any test double whose `useMap()`
 * stub doesn't implement `createPane`/`getPane` (the common case across this
 * codebase's many `vi.mock('react-leaflet', ...)` unit tests) — real Leaflet
 * maps (production, E2E, browser) always implement both. Leaflet's own
 * `map.createPane` is NOT idempotent — it unconditionally creates a new DOM
 * div and overwrites the existing pane entry on every call — so this looks
 * up an existing pane via `getPane` first and only falls back to
 * `createPane` when none exists yet, making repeated mounts safe without
 * duplicating panes.
 */
function SelectedSchoolPaneSetup() {
  const map = useMap();
  useEffect(() => {
    if (typeof map?.createPane !== 'function') return;
    const pane = typeof map.getPane === 'function'
      ? map.getPane(SELECTED_SCHOOL_PANE_NAME) ?? map.createPane(SELECTED_SCHOOL_PANE_NAME)
      : map.createPane(SELECTED_SCHOOL_PANE_NAME);
    if (pane) pane.style.zIndex = '550';
  }, [map]);
  return null;
}

/**
 * Issue #2049 (defect 2) — "Map container is already initialized" crash on
 * Back navigation.
 *
 * Root cause (verified in node_modules/react-leaflet/lib/MapContainer.js):
 * its internal mapRef callback (L28-42) guards on `context === null`, but
 * that callback closes over an empty `[]` dep array — so the guard is
 * permanently frozen true from the FIRST render. Its teardown (L43-49) is a
 * PASSIVE useEffect cleanup, which React's offscreen/Activity reappear path
 * never runs when a hidden subtree becomes visible again. On reappear, the
 * SAME DOM node (which still owns Leaflet's internal `_leaflet_id`) is
 * handed back to `new L.Map(node)`, which throws.
 *
 * Fix: this component sits inside MapContainer (so useMap() resolves) and
 * runs its teardown in a LAYOUT effect cleanup — the mirror-image of React's
 * reappear path, so it fires at the exact moment react-leaflet's own passive
 * cleanup does not. `onTeardown` bumps PropertyMap's `mapInstanceKey`, which
 * remounts MapContainer with a fresh DOM node — see the `key={mapInstanceKey}`
 * prop below.
 *
 * Double-remove safety (REVISED, cycle 2 — see
 * e2e/discover-1939-listing-peek-url-restore.spec.ts AC3/AC4): the original
 * assumption below ("Leaflet's Map.remove() deletes `_containerId` and
 * `_container._leaflet_id` together, so a second remove() compares
 * undefined !== undefined and is a no-op") does NOT hold, and this was
 * verified empirically (instrumented trace) rather than by inspection alone.
 *
 * react-leaflet's OWN passive-effect cleanup (node_modules/react-leaflet/lib/
 * MapContainer.js L43-49: `context?.map.remove()`) still fires for THIS SAME
 * map instance after our layout-effect cleanup below has already removed it
 * — React defers passive-effect cleanup for a deleted tree until after the
 * remount's commit, so the redundant call always arrives.
 *
 * That second call is NOT a no-op: Leaflet's Map.remove()
 * (node_modules/leaflet/dist/leaflet-src.js L3854) calls
 * `this._initEvents(true)` as its very FIRST statement, and `_initEvents`
 * unconditionally does `this._targets[stamp(this._container)] = this;`
 * (same file, `_initEvents`). `stamp()` assigns a FRESH `_leaflet_id` onto
 * `_container` whenever the property is absent — which it is, because the
 * first remove() call already deleted it. This re-stamp happens BEFORE the
 * container-reuse guard on L3859 (`this._containerId !== this._container.
 * _leaflet_id`) runs, so the guard always sees undefined !== freshId and
 * throws "Map container is being reused by another instance" — on ANY
 * second remove() call, regardless of which physical DOM node `_container`
 * points to. (An earlier attempt at this fix repointed `_container` at a
 * detached scratch node on the theory that undefined-vs-undefined would
 * stay safe; instrumented traces showed the scratch node itself gets
 * stamped by this exact mechanism, so that approach still threw.)
 *
 * Fix: make removal idempotent on the instance itself, so the REAL teardown
 * (event listeners, layers, panes) runs exactly once — right here, on the
 * first call — and react-leaflet's later redundant call becomes a
 * structurally guaranteed no-op that never reaches Leaflet's internals
 * (hence never re-stamps anything, hence never throws). This does not skip
 * or delay any real teardown — the guard fires only on a call after the one
 * genuine remove() this component has already performed.
 */
function MapLifecycleGuard({ onTeardown }: { onTeardown: () => void }) {
  const map = useMap();
  useLayoutEffect(() => () => {
    let alreadyRemoved = false;
    const originalRemove = map.remove.bind(map);
    // Leaflet's public type declares `remove(): this` with no "already
    // removed" flag or idempotency contract — shadowing the instance method
    // is the only way to make a second call a no-op. Cast is unavoidable:
    // there is no typed public API for this.
    (map as unknown as { remove: () => typeof map }).remove = () => {
      if (alreadyRemoved) return map;
      alreadyRemoved = true;
      return originalRemove();
    };
    map.remove();
    onTeardown();
  }, [map, onTeardown]);
  return null;
}

/**
 * Issue #2049 (defect 1) — stale Leaflet `_size` cache after the map
 * CONTAINER's pixel dimensions change (not a camera move).
 *
 * A camera call (fitBounds/flyTo/setView/panTo/setZoom) never changes the
 * container's on-screen size, so it cannot invalidate Leaflet's cached
 * `_size` — only a layout change to the container element can. This is
 * deliberately a separate seam from the ~21 existing camera call sites
 * (adding invalidateSize there was explicitly ruled out): firing it from
 * inside a cameraIntent effect would also publish a transient intermediate
 * viewport to the URL mid-navigation (see PropertyMap.jitterDiagnostic.test.tsx
 * for that class of jitter bug).
 *
 * `animate: false` avoids fighting an in-flight flyTo; `debounceMoveend:
 * true` collapses a resize burst into a single moveend. Re-entrancy is safe:
 * Leaflet's invalidateSize returns early (before emitting any event) when
 * the computed offset is zero, so an unchanged container is a literal no-op,
 * and no watcher here writes cameraIntent or any tick ref, so the existing
 * fit-once guards are structurally unreachable from this component.
 *
 * Known, accepted consequence: AreaMarkerLayer already listens to
 * map.on('resize'), an event that previously never fired because nothing
 * called invalidateSize. It will now fire on a real container resize,
 * running its compass recompute where it previously did not — assessed
 * idempotent, not suppressed here.
 */
function MapContainerResizeSync() {
  const map = useMap();
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const container = map.getContainer();
    const ro = new ResizeObserver(() => {
      map.invalidateSize({ animate: false, pan: true, debounceMoveend: true });
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [map]);
  return null;
}

function ZoomWatcher({ onZoomChange }: { onZoomChange?: (zoom: number) => void }) {
  const map = useMap();
  useEffect(() => {
    if (!onZoomChange) return;
    const handler = () => onZoomChange(map.getZoom());
    map.on('zoomend', handler);
    return () => { map.off('zoomend', handler); };
  }, [map, onZoomChange]);
  return null;
}

/**
 * Fires onViewportChange after every moveend or zoomend.
 * The callback receives raw center + zoom; the caller (Index) debounces before writing to URL.
 */
function ViewportWatcher({
  onViewportChange,
}: {
  onViewportChange?: (vp: { lat: number; lon: number; zoom: number }) => void;
}) {
  const map = useMap();
  useEffect(() => {
    if (!onViewportChange) return;
    const handler = () => {
      const center = map.getCenter();
      onViewportChange({ lat: center.lat, lon: center.lng, zoom: map.getZoom() });
    };
    // Note: pinch-zoom and programmatic zoom fire BOTH zoomend and moveend in sequence
    // (zoomend first, then moveend as Leaflet recenters), so the handler runs twice for
    // those gestures. Scroll-wheel zoom only fires zoomend (no moveend), so it fires once.
    // The caller's debounce (reportViewport → 300 ms) collapses any double-fire into one
    // URL write, so the extra call has no visible effect.
    map.on('moveend', handler);
    map.on('zoomend', handler);
    return () => {
      map.off('moveend', handler);
      map.off('zoomend', handler);
    };
  }, [map, onViewportChange]);
  return null;
}

/**
 * Fires onBoundsChange with the current map bbox [south, west, north, east] after
 * every moveend or zoomend. The initial mount fire is suppressed (hasMountedRef guard)
 * so that URL-restored viewports don't trigger an immediate API refetch before the
 * user has interacted. The caller is responsible for debouncing if needed.
 *
 * Coalescing: Leaflet fires zoomend then moveend in rapid succession on pinch/scroll
 * zoom. The caller's debounce window (≥300 ms) collapses these into a single refetch.
 */
function BoundsWatcher({
  onBoundsChange,
}: {
  onBoundsChange?: (bbox: [number, number, number, number]) => void;
}) {
  const map = useMap();
  // Skip the first fire on mount — the initial viewport is already captured from
  // URL params; we only want to trigger refetches on genuine user pan/zoom.
  const hasMountedRef = useRef(false);

  useEffect(() => {
    if (!onBoundsChange) return;
    const handler = () => {
      if (!hasMountedRef.current) {
        hasMountedRef.current = true;
        return;
      }
      const b = map.getBounds();
      const s = b.getSouth();
      const w = b.getWest();
      const n = b.getNorth();
      const e = b.getEast();
      // Guard against degenerate bounds (NaN or Infinity) from hidden/unmounted containers.
      if ([s, w, n, e].every(Number.isFinite)) {
        onBoundsChange([s, w, n, e]);
      }
    };
    map.on('moveend', handler);
    map.on('zoomend', handler);
    return () => {
      map.off('moveend', handler);
      map.off('zoomend', handler);
    };
  }, [map, onBoundsChange]);
  return null;
}

function AreaPanner({
  panToArea,
  bottomOcclusionPx = 0,
}: {
  panToArea?:
    | (AreaPoint & { seq?: number; reason?: AreaPanReason; consumedSeqRef?: MutableRefObject<number> })
    | null;
  bottomOcclusionPx?: number;
}) {
  const map = useMap();
  // Issue #1823 (fix cycle 1) — plain monotonic seq guard, scoped to ONLY
  // the three sequenced reasons (group/scope/canonicalNode) that carry a
  // `seq`. A `panToArea` with no `seq` (area-click, deferred areaKey
  // hydration, handleStartOver's clear-to-null, etc.) is legacy/un-sequenced
  // and always fires on identity change, exactly as before this issue.
  //
  // This deliberately does NOT mirror MapController's adopt-on-mount
  // MECHANISM (silently absorb whatever seq the first effect run observes,
  // never firing it). MapController's adopt-on-mount is only sound because
  // its cameraIntent source is guaranteed to be null on a genuine first-ever
  // mount — nothing can publish to it before MapController itself renders.
  // AreaPanner has no such guarantee: react-leaflet mounts children
  // (including AreaPanner) ONE COMMIT AFTER MapContainer's own ref callback
  // runs, so on a warm-cache navigation the orchestration hook's
  // group/scope/canonicalNode fit effect can already have published seq 1
  // before AreaPanner ever renders — AreaPanner's first observed value IS
  // the genuine transition, not a stale remount echo. Adopting it silently
  // (the previous implementation) dropped the fit permanently, since the
  // orchestration hook's own prevGroupIdRef/prevScopeRef had already
  // advanced and nothing else re-triggers it.
  //
  // Issue #1823 (fix cycle 3 — PR #2128 review) — cycle 1/2 accepted a
  // PropertyMap-level remount (mapInstanceKey bump, or mobile map
  // dismiss/reopen) replaying an already-fired seq as a "harmless redundant
  // animation" trade-off. That conflicts with #1823's binding unmount/remount
  // requirement, so the guard is no longer purely local: `panToArea` now
  // carries `consumedSeqRef`, a ref owned by useDiscoverCameraOrchestration
  // (survives AreaPanner's own remounts, since the hook lives in
  // MapDiscovery, above PropertyMap). Gating against THAT ref instead of a
  // fresh per-mount local one means an already-consumed seq stays suppressed
  // across a remount, while a seq published before AreaPanner's very
  // first-ever mount (the react-leaflet race described above) still compares
  // against the ref's per-hook-lifetime initial value of 0 and fires.
  // `localFallbackSeqRef` only matters for a sequenced `panToArea` with no
  // `consumedSeqRef` attached (i.e. not constructed via publishPanToArea) —
  // every real sequenced write goes through that publisher.
  const localFallbackSeqRef = useRef(0);
  useEffect(() => {
    if (!panToArea) return;
    if (panToArea.seq != null) {
      const consumedSeqRef = panToArea.consumedSeqRef ?? localFallbackSeqRef;
      if (panToArea.seq <= consumedSeqRef.current) return;
      consumedSeqRef.current = panToArea.seq;
    }

    if (panToArea.bbox) {
      // Issue #1069: a synthetic group-bounds AreaPoint (from computeGroupBounds)
      // can fit at a zoom level above AREA_PANNER_GROUP_MAX_ZOOM for narrow groups,
      // which then trips MapDiscovery's zoom-band gate and hides the area markers
      // the user was meant to see. Clamp group fits to the area-layer threshold.
      // This clamp is OUTSIDE the seq/adopt gate above and applies whenever a
      // fit actually fires — it must never be skippable by that gate.
      const isGroupBounds = panToArea.areaKey === GROUP_BOUNDS_SYNTHETIC_KEY;
      const viewportWidthPx = typeof window !== 'undefined' ? window.innerWidth : undefined;
      // PR #2128 final review (HIGH) — a single `padding: [x, y]` fitBounds
      // option is NOT directional: Leaflet's own `_getBoundsCenterZoom`
      // (leaflet-src.js) defaults BOTH `paddingTopLeft` and
      // `paddingBottomRight` to it, so passing bottomOcclusionPx baked into
      // a single tuple (the previous approach) applied it to BOTH the top
      // AND the bottom — double the intended cost, and centered rather than
      // reserved at the bottom only. `paddingTopLeft`/`paddingBottomRight`
      // are Leaflet's actual asymmetric-padding API; only the bottom-right
      // corner carries the occlusion.
      const [padH, padV] = computeCameraPadding(viewportWidthPx);
      map.fitBounds(panToArea.bbox, {
        paddingTopLeft: [padH, padV],
        paddingBottomRight: [padH, padV + bottomOcclusionPx],
        maxZoom: isGroupBounds ? AREA_PANNER_GROUP_MAX_ZOOM : LEAF_FIT_MAX_ZOOM,
      });
    } else {
      map.flyTo([panToArea.geo_center_lat, panToArea.geo_center_lon], LEAF_FIT_MIN_ZOOM);
    }
    // `bottomOcclusionPx` is intentionally NOT a dep: this effect fires only
    // on a genuine panToArea transition (per the seq guard above), never on
    // an occlusion change alone. That is safe by DESIGN, not by accident —
    // the caller (MapDiscovery.tsx) reserves this padding PROACTIVELY for
    // any mobile-Map listing-capable state (gated on isMarkerPopoverEligible,
    // not on whether the preview sheet happens to be open right now), so the
    // authoritative fit for that state already bakes in the occlusion BEFORE
    // any marker tap could open the sheet. A reactive "refit when the sheet
    // opens/closes" trigger is deliberately NOT implemented here — it would
    // be a materially bigger behaviour change (a new camera-move source),
    // re-introducing exactly what this fix cycle avoids — and is unnecessary
    // once the padding is reserved up front.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panToArea, map]);
  return null;
}

/**
 * SchoolFocusPanner — Issue #1160
 *
 * Fires fitBounds (or flyTo when radius is zero) to frame the selected school
 * and its radius circle in the viewport. Triggered by schoolFocusTick, which
 * is incremented once per school-id change and once per radiusKm change in
 * MapDiscovery. The handledTickRef guard ensures the effect fires exactly once
 * per tick increment and never re-triggers on viewport events (no feedback loop
 * with ViewportWatcher → reportViewport).
 *
 * Degrees-per-km approximation: 1 km ≈ 1/111 degrees latitude; longitude is
 * adjusted by cos(lat). The resulting bounding box is passed to fitBounds with
 * 40 px padding so the radius circle sits comfortably within the viewport.
 *
 * Reuse note: adapted from AreaPanner (same file, ~line 301) and the
 * handledTickRef guard from MapController.resetMapTick (~line 442).
 *
 * Issue #1173 — radius-change zoom stability:
 * The same schoolFocusTick fires for both an initial school-focus (school-id
 * change) AND a radius change for the already-focused school. On a *radius
 * change only* (same school centre), we no longer unconditionally refit: if the
 * new radius circle still fits inside the current viewport we PRESERVE the
 * user's zoom/center (zero map mutation — which structurally breaks any fit
 * loop), and we REFIT (the original fitBounds) only when the new circle would be
 * clipped / mostly outside the current viewport. The initial focus and the
 * radius=0 flyTo path are UNCHANGED. The fits/clipped decision is keyed on the
 * radius-value change and reads the viewport imperatively via map.getBounds()
 * at decision time — viewport state is intentionally NOT in the dep array and no
 * moveend/zoomend listener is attached, so a fit-triggered move cannot re-trigger.
 */
function SchoolFocusPanner({
  schoolFocusTick,
  lat,
  lon,
  radiusKm,
}: {
  schoolFocusTick?: number;
  lat?: number;
  lon?: number;
  radiusKm?: number;
}) {
  const map = useMap();
  // RH1 (issue #1953): number | null — null means "not yet adopted this
  // mount". A map remount resets this ref to null while schoolFocusTick
  // (owned by MapDiscovery, which does NOT unmount with the map) keeps its
  // prior value, so without adopt-on-mount seeding the guard below would
  // spuriously fire on mount and throw the camera.
  const handledTickRef = useRef<number | null>(null);
  // Centre we last performed a fit/flyTo for. Lets us tell an initial focus
  // (centre changed / first fit) apart from a radius change for the same school.
  const focusedCenterRef = useRef<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    // Issue #1173 (clear → re-select-same-school regression): when the selected
    // school is cleared, lat/lon become null but schoolFocusTick does NOT
    // increment (MapDiscovery's tick effect early-returns before incrementing
    // when lat/lon are null), so the tick guard below would short-circuit before
    // we ever observe the clear. We therefore reset the persisted focus centre
    // HERE — before the tick guard — keyed only on the lat/lon-null prop change.
    // This makes a subsequent re-selection of the SAME school read as an INITIAL
    // focus (prevCentre == null → isRadiusChange false → refit), instead of being
    // mis-classified as a radius change that PRESERVES the zoomed-out city view.
    // Pure ref write: zero map mutation, no listener, no new viewport dep — the
    // fit-loop safeguard is unaffected. The AreaRestorePanner/CityRestorePanner
    // restore on clear is untouched (this only resets SchoolFocusPanner's own ref).
    if (lat == null || lon == null) {
      focusedCenterRef.current = null;
      return;
    }

    const tick = schoolFocusTick ?? 0;
    if (handledTickRef.current === null) {
      // RH1 adopt-on-mount: seed from the incoming tick without acting. On a
      // genuine first mount tick is 0, matching the prior `tick === 0` no-op.
      // On a remount, this absorbs the persisted tick instead of re-firing.
      handledTickRef.current = tick;
      return;
    }
    // Fire only when tick strictly exceeds the last handled value.
    // This prevents re-firing on every render and eliminates any feedback loop
    // where a fit-triggered moveend (→ ViewportWatcher → reportViewport) would
    // increment tick and cause another fit.
    if (tick === 0 || tick <= handledTickRef.current) return;
    handledTickRef.current = tick;

    const radius = radiusKm ?? 0;
    if (radius > 0) {
      // Derive a bounding box from centre ± radiusKm in degrees.
      // 1 degree lat ≈ 111.32 km; 1 degree lon ≈ 111.32 * cos(lat) km.
      const deltaLat = radius / 111.32;
      const deltaLon = radius / (111.32 * Math.cos((lat * Math.PI) / 180));
      const south = lat - deltaLat;
      const west = lon - deltaLon;
      const north = lat + deltaLat;
      const east = lon + deltaLon;
      const bounds: [[number, number], [number, number]] = [
        [south, west],
        [north, east],
      ];

      // A radius CHANGE = same school centre as the last fit. A centre change
      // (new school selected) is an initial focus and must always fit (AC5).
      const prevCentre = focusedCenterRef.current;
      const isRadiusChange =
        prevCentre != null && prevCentre.lat === lat && prevCentre.lon === lon;

      if (isRadiusChange) {
        // Read the current viewport imperatively at decision time. Viewport
        // state is deliberately NOT in the dep array and no map event listener
        // is attached, so this decision cannot feed back into itself
        // (Issue #1173 fit-loop safeguard).
        const viewport = map.getBounds?.();
        const fitsInViewport =
          viewport != null &&
          viewport.getSouth() <= south &&
          viewport.getWest() <= west &&
          viewport.getNorth() >= north &&
          viewport.getEast() >= east;
        if (fitsInViewport) {
          // PRESERVE branch (AC1): the new radius circle still fits — keep the
          // user's current zoom/center. ZERO map mutation by design.
          return;
        }
        // else fall through to REFIT (AC2): the circle would be clipped.
      }

      // Initial focus, or a radius change whose circle would be clipped: refit.
      focusedCenterRef.current = { lat, lon };
      map.fitBounds(bounds, { padding: [40, 40] });
    } else {
      // Zero or absent radius: fly to school centre at a fixed zoom suitable for
      // a neighbourhood view so the school marker is clearly visible.
      focusedCenterRef.current = { lat, lon };
      map.flyTo([lat, lon], 14, { duration: 1 });
    }
  }, [schoolFocusTick, lat, lon, radiusKm, map]);

  return null;
}

/**
 * SchoolMarkerFocusPanner — Issue #1160 GAP 1 (Phase 2)
 *
 * After listings settle (schoolMarkerFocusTick > 0), fitBounds to include both
 * the school centre and all marker positions. The bounds are further intersected
 * with the school's radius bounding box so a single far-outlier marker cannot
 * blow the viewport well outside the radius circle.
 *
 * Algorithm:
 *   1. Start from L.latLngBounds([school centre, ...marker positions]).
 *   2. Derive radiusBounds from school centre ± radiusKm in degrees.
 *   3. Intersect: clamp the bounds to radiusBounds so the fit never exceeds the
 *      radius circle's outer extent. Fall back to flyTo(school, 14) if bounds degenerate.
 *
 * Feedback-loop safety: same handledTickRef guard as SchoolFocusPanner. ViewportWatcher
 * writes only to URL params, never to schoolMarkerFocusTick.
 */
function SchoolMarkerFocusPanner({
  schoolMarkerFocusTick,
  lat,
  lon,
  radiusKm,
  markerPositions,
}: {
  schoolMarkerFocusTick?: number;
  lat?: number;
  lon?: number;
  radiusKm?: number;
  markerPositions?: Array<{ lat: number; lon: number }>;
}) {
  const map = useMap();
  // RH1 (issue #1953): adopt-on-mount — see SchoolFocusPanner above for the
  // full rationale (identical pattern across all five tick-guard sites).
  const handledTickRef = useRef<number | null>(null);

  useEffect(() => {
    const tick = schoolMarkerFocusTick ?? 0;
    if (handledTickRef.current === null) {
      handledTickRef.current = tick;
      return;
    }
    if (tick === 0 || tick <= handledTickRef.current) return;
    handledTickRef.current = tick;

    if (lat == null || lon == null) return;
    if (!markerPositions || markerPositions.length === 0) return;

    const radius = radiusKm ?? 0;

    // Build bounds from school centre + all marker positions
    const allPoints: [number, number][] = [
      [lat, lon],
      ...markerPositions.map((p) => [p.lat, p.lon] as [number, number]),
    ];
    const markerBounds = L.latLngBounds(allPoints);

    if (radius > 0) {
      // Clamp to radius bounding box so far outliers don't blow the viewport.
      const deltaLat = radius / 111.32;
      const deltaLon = radius / (111.32 * Math.cos((lat * Math.PI) / 180));
      const sw = L.latLng(lat - deltaLat, lon - deltaLon);
      const ne = L.latLng(lat + deltaLat, lon + deltaLon);
      const radiusBounds = L.latLngBounds(sw, ne);
      // Intersect: keep the tighter of the two bounds on each side.
      const south = Math.max(markerBounds.getSouth(), radiusBounds.getSouth());
      const west = Math.max(markerBounds.getWest(), radiusBounds.getWest());
      const north = Math.min(markerBounds.getNorth(), radiusBounds.getNorth());
      const east = Math.min(markerBounds.getEast(), radiusBounds.getEast());
      if (south < north && west < east) {
        map.fitBounds([[south, west], [north, east]], {
          padding: [40, 40],
          maxZoom: SCHOOL_MARKER_FOCUS_MAX_ZOOM,
        });
        return;
      }
    }

    // Fallback: fit to raw marker bounds if radius clamp produces degenerate result
    if (markerBounds.isValid()) {
      map.fitBounds(markerBounds, {
        padding: [40, 40],
        maxZoom: SCHOOL_MARKER_FOCUS_MAX_ZOOM,
      });
    } else {
      map.flyTo([lat, lon], SCHOOL_MARKER_FOCUS_MAX_ZOOM, { duration: 1 });
    }
  }, [schoolMarkerFocusTick, lat, lon, radiusKm, markerPositions, map]);

  return null;
}

/**
 * AreaRestorePanner — Issue #1160 GAP 2
 *
 * Fires fitBounds (bbox) or flyTo (geo-centre) to restore the map to the area
 * context after Back is pressed from school-selected (level 2 → 1) in school-first
 * journey. Uses handledTickRef guard (same pattern as SchoolFocusPanner).
 *
 * Feedback-loop safety: areaRestoreTick is only incremented by handleSchoolFirstBackLevel2,
 * never by ViewportWatcher or any map-event handler.
 */
function AreaRestorePanner({
  areaRestoreTick,
  lat,
  lon,
  bbox,
}: {
  areaRestoreTick?: number;
  lat?: number;
  lon?: number;
  bbox?: [[number, number], [number, number]];
}) {
  const map = useMap();
  // RH1 (issue #1953): adopt-on-mount — see SchoolFocusPanner above for the
  // full rationale (identical pattern across all five tick-guard sites).
  const handledTickRef = useRef<number | null>(null);

  useEffect(() => {
    const tick = areaRestoreTick ?? 0;
    if (handledTickRef.current === null) {
      handledTickRef.current = tick;
      return;
    }
    if (tick === 0 || tick <= handledTickRef.current) return;
    handledTickRef.current = tick;

    if (bbox) {
      map.fitBounds(bbox, { padding: [40, 40] });
    } else if (lat != null && lon != null) {
      map.flyTo([lat, lon], 13, { duration: 1 });
    }
    // If both bbox and lat/lon are absent, skip gracefully (discoverAreas not loaded).
  }, [areaRestoreTick, lat, lon, bbox, map]);

  return null;
}

/**
 * CityRestorePanner — Issue #1160 GAP 2
 *
 * Fires flyTo(cityCenter, cityZoom) to restore the map to city overview after Back
 * is pressed from schools-in-area (level 1 → 0) in school-first journey.
 * Uses handledTickRef guard (same pattern as MapController.resetMapTick).
 *
 * Feedback-loop safety: cityRestoreTick is only incremented by handleSchoolFirstBackLevel1,
 * never by ViewportWatcher or any map-event handler.
 */
function CityRestorePanner({
  cityRestoreTick,
  cityCenter,
  cityZoom,
}: {
  cityRestoreTick?: number;
  cityCenter?: [number, number];
  cityZoom?: number;
}) {
  const map = useMap();
  // RH1 (issue #1953): adopt-on-mount — see SchoolFocusPanner above for the
  // full rationale (identical pattern across all five tick-guard sites).
  const handledTickRef = useRef<number | null>(null);

  useEffect(() => {
    const tick = cityRestoreTick ?? 0;
    if (handledTickRef.current === null) {
      handledTickRef.current = tick;
      return;
    }
    if (tick === 0 || tick <= handledTickRef.current) return;
    handledTickRef.current = tick;

    if (cityCenter) {
      map.flyTo(cityCenter, cityZoom ?? DEFAULT_ZOOM, { duration: 1 });
    }
    // If cityCenter is absent (unlikely), skip gracefully.
  }, [cityRestoreTick, cityCenter, cityZoom, map]);

  return null;
}

function URLViewportController({
  initialCenter,
  initialZoom,
  historyAction,
}: {
  initialCenter?: [number, number];
  initialZoom?: number;
  historyAction?: string;
}) {
  const map = useMap();
  const isFirstRender = useRef(true);
  const lastAppliedViewportRef = useRef<{
    lat: number;
    lon: number;
    zoom: number;
  } | null>(null);

  useEffect(() => {
    // Skip if no viewport is specified
    if (!initialCenter || initialZoom === undefined) return;

    // Issue #2125: Only apply viewport from URL on mount or browser Back/Forward (POP)
    if (!isFirstRender.current && historyAction !== 'POP') {
      return;
    }
    isFirstRender.current = false;

    const [requestedLat, requestedLon] = initialCenter;
    const currentCenter = map.getCenter();
    const currentZoom = map.getZoom();

    // Tight tolerance: 0.0001 degrees (~11 meters) for lat/lon, exact for zoom
    const LAT_LON_TOLERANCE = 0.0001;
    const latDiff = Math.abs(currentCenter.lat - requestedLat);
    const lonDiff = Math.abs(currentCenter.lng - requestedLon);
    const zoomMatches = Math.round(currentZoom) === initialZoom;

    // Skip if viewport is already correct (within tolerance)
    if (
      latDiff <= LAT_LON_TOLERANCE &&
      lonDiff <= LAT_LON_TOLERANCE &&
      zoomMatches
    ) {
      return;
    }

    // Skip if already applied (prevent feedback loop with reportViewport debounce)
    const lastViewport = lastAppliedViewportRef.current;
    if (
      lastViewport &&
      lastViewport.lat === requestedLat &&
      lastViewport.lon === requestedLon &&
      lastViewport.zoom === initialZoom
    ) {
      return;
    }

    // Apply viewport without animation to avoid intermediate moveend events
    
    map.setView([requestedLat, requestedLon], initialZoom);
    lastAppliedViewportRef.current = {
      lat: requestedLat,
      lon: requestedLon,
      zoom: initialZoom,
    };
  }, [initialCenter, initialZoom, map, historyAction]);

  return null;
}

function MapController({
  selectedListing,
  focusBounds,
  cityCenter,
  cityZoom,
  resetMapTick,
  cameraIntent,
}: {
  selectedListing?: PropertyListing | null;
  focusBounds?: [[number, number], [number, number]] | null;
  cityCenter?: [number, number];
  cityZoom?: number;
  resetMapTick?: number;
  cameraIntent?: CameraIntent | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (selectedListing?.latitude && selectedListing?.longitude) {
      map.flyTo([selectedListing.latitude, selectedListing.longitude], 15, {
        duration: 1,
      });
    }
  }, [selectedListing, map]);

  // ── Issue #1801 (rework) — MapController is the SOLE camera owner for
  // area-marker navigation. lastHandledSeqRef guards against re-firing an
  // already-handled seq (e.g. a stale cameraIntent surviving a re-render/
  // forward-history nav without a fresh click).
  //
  // suppressForSeqRef/suppressArmedAtRef correlate the "swallow the next
  // network-driven refit" suppression to the SPECIFIC seq that armed it,
  // instead of a bare boolean:
  //   - Armed ONLY for framing === 'leaf'. 'overview' clicks keep zoom at/
  //     below AREA_LAYER_MAX_ZOOM, so markersEnabled never flips true and no
  //     activeFocusBounds/agriGroupFocusBounds refit can ever follow one —
  //     arming for them would create a suppression with no possible
  //     consumer, guaranteed to leak into a later, unrelated refit.
  //   - Time-bounded (CAMERA_SUPPRESS_TTL_MS): a leaf click's correlated
  //     refit (e.g. the agri-first agriGroupFocusBounds sync, or a future
  //     activeFocusBounds producer) normally lands within one network
  //     round-trip. If filters/journey state mean NO correlated refit ever
  //     arrives (e.g. filters.localities cleared on area-click, so
  //     computeFocusBounds stays null), the flag is guaranteed to expire on
  //     its own rather than staying armed forever — so it can never swallow
  //     a later, unrelated focusBounds change (a different navigation, a
  //     fitTick click, a locality-filter change).
  //   - Strict one-shot regardless: the very first focusBounds effect run
  //     after arming ALWAYS consumes (clears) the suppression — it either
  //     skips (still within the TTL window) or falls through and fits
  //     (already expired). Either way nothing is left armed afterwards.
  // RH1 (issue #1953) — SIXTH tick/seq-guard site of the same class as the
  // five handledTickRef sites converted elsewhere in this file (see
  // SchoolFocusPanner above for the full rationale). Missed by the original
  // sweep because that sweep was scoped by IDENTIFIER NAME (`handledTickRef`)
  // rather than by BEHAVIOUR — `lastHandledSeqRef` guards the exact same
  // hazard under a different name, so a name-scoped search could never find
  // it: cameraIntent lives in useDiscoverMapData (ABOVE DiscoverMapMount's
  // real-unmount boundary) and is never reset after consumption, while this
  // ref lives BELOW that boundary and was seeded to a fixed 0. On the second
  // mobile Map open, lastHandledSeqRef resets to 0 while the persisted
  // cameraIntent.seq is already >= 1, so the `<=` guard below would pass and
  // spuriously re-fire the last-consumed camera move, discarding whatever
  // viewport the remounted map had just re-initialised to from the URL — and
  // (via suppressForSeqRef below) also swallow the next legitimate leaf-click
  // refit within the TTL window. `null` means "not yet adopted this mount";
  // adopt-on-mount seeds from the incoming seq without firing, so a remount
  // absorbs the already-consumed sequence instead of treating it as new.
  const lastHandledSeqRef = useRef<number | null>(null);
  const suppressForSeqRef = useRef<number | null>(null);
  const suppressArmedAtRef = useRef(0);
  // Generous enough to cover a typical markers/agri refit round-trip after a
  // leaf click, short enough that a suppression that never gets a correlated
  // refit cannot linger and swallow something unrelated for long.
  const CAMERA_SUPPRESS_TTL_MS = 8000;

  useEffect(() => {
    // Adopt-on-mount, mirroring the handledTickRef sites exactly: compute the
    // sentinel-defaulted value BEFORE any early return, and seed on the very
    // first effect execution for THIS instance regardless of whether
    // cameraIntent happens to be null yet. useDiscoverMapData's
    // cameraIntentSeqRef starts at 0 and is incremented to >=1 before the
    // FIRST ever publish, and cameraIntent itself starts as useState(null)
    // and is never set before a user click — so a genuine first-ever mount
    // always observes seq 0 here (cameraIntent null), exactly like the
    // tick-guard sites always observe tick 0 on a genuine first mount. Only a
    // remount can observe a non-zero seq on this very first run, and adopting
    // it silently (instead of re-firing) is precisely the fix.
    const seq = cameraIntent?.seq ?? 0;
    if (lastHandledSeqRef.current === null) {
      lastHandledSeqRef.current = seq;
      return;
    }
    if (!cameraIntent) return;
    if (seq <= lastHandledSeqRef.current) return;
    lastHandledSeqRef.current = seq;
    if (cameraIntent.framing === 'leaf') {
      suppressForSeqRef.current = cameraIntent.seq;
      suppressArmedAtRef.current = Date.now();
    }

    // Issue #1882 (Track A PR2 Slice S4; corrected in the camera-padding
    // rework) — cameraIntent.padding is optional (responsive fitBounds
    // padding — see computeCameraPadding in useDiscoverMapData.ts), a
    // Leaflet-native [horizontalPx, verticalPx] tuple (matches L.point(x, y)
    // / fitBounds({ padding: [x, y] })). Defaults to the pre-#1882 symmetric
    // [40, 40] when absent so every pre-existing CameraIntent
    // producer/literal keeps behaving exactly as before.
    const [paddingX, paddingY] = cameraIntent.padding ?? [40, 40];

    if (cameraIntent.framing === 'overview') {
      // Macro-region / group pin — same framing the removed AreaMarkerLayer
      // code used to apply: fitBounds capped at the area-overview zoom band,
      // or flyTo(center, AREA_LAYER_MAX_ZOOM).
      if (cameraIntent.bounds) {
        map.fitBounds(cameraIntent.bounds, { padding: [paddingX, paddingY], maxZoom: AREA_LAYER_MAX_ZOOM });
      } else {
        map.flyTo(cameraIntent.center, AREA_LAYER_MAX_ZOOM);
      }
    } else if (cameraIntent.framing === 'cluster') {
      // Issue #1762 — listing-cluster tap fit-to-members. Mirrors the 'leaf'
      // branch's bounds->zoom computation (same getBoundsZoom + responsive
      // padding) but with a DIFFERENT clamp: the floor is the CURRENT zoom
      // + 1 (a cluster tap must never be a no-op — it is only ever published
      // once MarkerClusterLayer's clusterCanSplit gate has already confirmed
      // the target zoom exceeds the zoom at click time), and the ceiling is
      // CLUSTER_DISABLE_AT_ZOOM (16, where leaflet.markercluster itself stops
      // clustering) rather than the fixed [13,16] leaf band. Deliberately
      // does NOT arm suppressForSeqRef/suppressArmedAtRef above (that guard
      // only checks `=== 'leaf'`, so this branch is already excluded) — a
      // cluster tap never changes scope/node/filters, so there is no
      // correlated network-driven refit for the suppression to swallow.
      if (cameraIntent.bounds) {
        const rawZoom = map.getBoundsZoom(cameraIntent.bounds, false, L.point(paddingX, paddingY));
        const targetZoom = Math.min(CLUSTER_DISABLE_AT_ZOOM, Math.max(map.getZoom() + 1, rawZoom));
        const center = L.latLngBounds(cameraIntent.bounds).getCenter();
        map.setView(center, targetZoom, { animate: true });
      } else {
        // Degenerate/missing bounds fallback (resolveCameraFraming already
        // guards against a zero-area box) — still guarantee forward progress.
        map.flyTo(cameraIntent.center, Math.min(CLUSTER_DISABLE_AT_ZOOM, map.getZoom() + 1));
      }
    } else {
      // Real-area ("leaf") pin — land directly in the [13,16] listing-marker
      // zoom band. This REPLACES the removed map.once('zoomend', ...) → 13
      // correction: instead of fitting then correcting after the animation
      // settles, the target zoom is computed and clamped up-front.
      if (cameraIntent.bounds) {
        const rawZoom = map.getBoundsZoom(cameraIntent.bounds, false, L.point(paddingX, paddingY));
        const clampedZoom = Math.min(LEAF_FIT_MAX_ZOOM, Math.max(LEAF_FIT_MIN_ZOOM, rawZoom));
        const center = L.latLngBounds(cameraIntent.bounds).getCenter();
        map.setView(center, clampedZoom, { animate: true });
      } else {
        map.flyTo(cameraIntent.center, LEAF_FIT_MIN_ZOOM);
      }
    }
  }, [cameraIntent, map]);

  useEffect(() => {
    if (!focusBounds) return;
    if (suppressForSeqRef.current !== null) {
      const armedForMs = Date.now() - suppressArmedAtRef.current;
      // One-shot: this effect run always consumes the armed suppression,
      // whether it skips (below) or falls through to fit (expired).
      suppressForSeqRef.current = null;
      if (armedForMs <= CAMERA_SUPPRESS_TTL_MS) {
        return;
      }
      // Expired — no correlated refit ever arrived for the seq that armed
      // this suppression, so this focusBounds change is not it. Fit
      // normally; falls through to the logic below.
    }
    const [[s, w], [n, e]] = focusBounds;
    if (s === n && w === e) {
      // Single point — fitBounds on a zero-area bounds is degenerate; use flyTo
      map.flyTo([s, w], 15, { duration: 1 });
    } else {
      map.fitBounds(focusBounds, { padding: LEGACY_FOCUS_BOUNDS_PADDING });
    }
  }, [focusBounds, map]);

  // hasMountedRef: skip the first effect run so we don't immediately fly to
  // cityCenter on mount and overwrite a URL-specified initial viewport.
  // Only fly when the user actively changes city (post-mount cityCenter change).
  //
  // Cross-component coupling: MapContainer (parent) already positions the map at
  // initialCenter/initialZoom on mount — these are the one-time Leaflet props driven
  // by the URL's ?lat/?lon/?zoom= params. MapController must NOT call flyTo(cityCenter)
  // on the initial render, otherwise it clobbers whatever viewport the URL specified.
  // hasMountedRef enforces this invariant without MapController needing to know about
  // initialCenter/initialZoom directly.
  const hasMountedRef = useRef(false);
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    // Issue #1801 (qa-fast R6) — a city change is a brand-new navigation; a
    // suppression armed by a stale intent from the previous city must not
    // swallow a legitimate refit here.
    suppressForSeqRef.current = null;
    if (cityCenter) {
      map.flyTo(cityCenter, cityZoom ?? DEFAULT_ZOOM, { duration: 1 });
    }
  }, [cityCenter, cityZoom, map]);

  // Reset zoom to city overview when area is deselected (Back button).
  // handledTickRef tracks the last tick value we acted on so that a city change
  // (which also updates cityCenter/cityZoom deps) does not re-fire when the tick
  // has not changed. Only fires when tick strictly exceeds the last handled value.
  // RH1 (issue #1953): adopt-on-mount — see SchoolFocusPanner above for the
  // full rationale (identical pattern across all five tick-guard sites).
  const handledTickRef = useRef<number | null>(null);
  useEffect(() => {
    const tick = resetMapTick ?? 0;
    if (handledTickRef.current === null) {
      handledTickRef.current = tick;
      return;
    }
    if (tick === 0 || tick <= handledTickRef.current) return;
    handledTickRef.current = tick;
    // Issue #1801 (qa-fast R6) — area deselect/back is a new navigation; drop
    // any pending suppression armed by the just-abandoned click intent.
    suppressForSeqRef.current = null;
    if (cityCenter) {
      map.flyTo(cityCenter, cityZoom ?? DEFAULT_ZOOM, { duration: 1 });
    }
  }, [resetMapTick, map, cityCenter, cityZoom]);

  return null;
}

/**
 * Issue #1762 — sentinel `disableClusteringAtZoom` value used to HOLD a
 * dense cluster in its clustered-overview state past the normal
 * `CLUSTER_DISABLE_AT_ZOOM` (16) threshold, once `resolveMarkerRevealMode`
 * decides — after a cluster-tap fit settles — that the revealed marker set
 * is still too dense for individual pins to read cleanly. Comfortably above
 * any zoom this app's tile layer reaches (no explicit `maxZoom` is set on
 * `MapContainer`, so Leaflet's own default of 18 applies), so Leaflet's
 * `zoom >= disableClusteringAtZoom` declustering never fires while held.
 */
const MARKER_REVEAL_HOLD_ZOOM = 24;

// Marker cluster layer component
function MarkerClusterLayer({
  listings,
  onSelectListing,
  selectedListingId,
  hoveredListingId,
  onMarkerClickWithPosition,
  onMarkerClusterCameraIntent,
}: {
  listings: PropertyListingWithImages[];
  onSelectListing?: (listing: PropertyListingWithImages | null) => void;
  /** Issue #1547 — ID of the currently selected listing (URL-derived). When set, that
   *  listing's marker renders with the copper selected-state icon; no camera movement. */
  selectedListingId?: string | null;
  /** Issue #1547 — ephemeral hover/focus id (React state, NOT URL). When set, the
   *  matching marker renders with the copper icon; clears on mouseleave/blur. */
  hoveredListingId?: string | null;
  /** a3 — fires with the pixel position of the marker click relative to the map container. */
  onMarkerClickWithPosition?: (pos: { x: number; y: number }) => void;
  /**
   * Issue #1762 — fired ONLY for a splittable cluster click, with the
   * cluster's own member bounds/center. See PropertyMapProps's doc on the
   * same-named prop for the full contract.
   */
  onMarkerClusterCameraIntent?: (bounds: CameraIntent['bounds'], center: [number, number]) => void;
}) {
  const map = useMap();

  // Issue #1762 — dynamic declustering-at-zoom threshold, wired to
  // resolveMarkerRevealMode (zoomPolicy.ts). Defaults to the existing static
  // CLUSTER_DISABLE_AT_ZOOM — every state that never goes through a
  // cluster-tap fit (manual zoom/pan, initial load, area/browse/school-radius
  // entry) is byte-for-byte unaffected. Recomputed ONLY inside the
  // clusterclick/clusterkeypress handler's `map.once('moveend', ...)` below,
  // once the cluster-tap fit actually settles.
  const [markerRevealDisableAtZoom, setMarkerRevealDisableAtZoom] = useState<number>(CLUSTER_DISABLE_AT_ZOOM);
  // Tracks whether `listings` changed since the hold was last set, so a
  // genuinely new listing set (new area/scope/filter fetch) always starts
  // fresh at CLUSTER_DISABLE_AT_ZOOM rather than inheriting a stale hold
  // computed against a completely different marker set.
  const prevListingsRef = useRef<PropertyListingWithImages[] | null>(null);
  // Issue #1762 fix — the pending cluster-tap `moveend` one-shot handler
  // (if any), so effect teardown can explicitly cancel it via `map.off`.
  // Without this, a stale closure from a torn-down effect run stays armed
  // on the persistent `map` instance and fires on an unrelated later
  // moveend (see effect cleanup below).
  const pendingMoveendHandlerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const listingsChanged = prevListingsRef.current !== null && prevListingsRef.current !== listings;
    prevListingsRef.current = listings;
    const effectiveDisableAtZoom = listingsChanged ? CLUSTER_DISABLE_AT_ZOOM : markerRevealDisableAtZoom;
    if (listingsChanged && markerRevealDisableAtZoom !== CLUSTER_DISABLE_AT_ZOOM) {
      setMarkerRevealDisableAtZoom(CLUSTER_DISABLE_AT_ZOOM);
    }

    const clusterGroup = L.markerClusterGroup({
      chunkedLoading: true,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      // Issue #1762 — false: Leaflet's own zoomToBounds() bypasses this
      // app's CameraIntent/MapController camera authority and was landing
      // on the WRONG bounds on cluster tap (live-reproduced defect). With
      // this false, leaflet.markercluster's internal `_zoomOrSpiderfy`
      // becomes a safe no-op except the genuine "already bottomed-out at
      // max zoom" spiderfy case (verified against the installed
      // leaflet.markercluster@1.5.3 source — see the approved plan's
      // revision_1_responses.spiderfy_version_check) — spiderfyOnMaxZoom
      // stays true and coexists cleanly with the clusterclick/clusterkeypress
      // handler added below, which is now the SOLE camera mover for a
      // splittable cluster tap.
      zoomToBoundsOnClick: false,
      maxClusterRadius: CLUSTER_MAX_RADIUS_PX,
      disableClusteringAtZoom: effectiveDisableAtZoom,
      // Issue #1762 fix cycle 3 — live-reproduced regression: for a cluster
      // whose members share (near-)identical coordinates (verified via a
      // temporary debug probe against the real repro — sw/ne bounds were
      // EXACTLY coincident), `clusterCanSplit` above correctly declines to
      // move the camera (there is no zoom level that would visually separate
      // coincident points) — but leaflet.markercluster's OWN
      // `_zoomOrSpiderfy` listener (bound unconditionally whenever
      // `spiderfyOnMaxZoom` is true — see the `zoomToBoundsOnClick` comment
      // below) independently fires `cluster.spiderfy()` for exactly this
      // "bottomed-out, never splits below the group's max clustering zoom"
      // case. Leaflet's default `spiderfyDistanceMultiplier` (1) sizes the
      // circle-fan radius for its own small (~25-40px) pin icons
      // (`_generatePointsCircle`: legLength = max(circumference/2π, 35),
      // circumference = multiplier * 25 * (2 + count) — multiplier 1 floors
      // to a 35px radius for any count ≤ ~7). Our custom price-pill markers
      // (createMarkerIcon) are ~90px wide, so a 35px-radius fan puts adjacent
      // pills on top of each other — the exact "opens into stacked/
      // overlapping pins, not a readable fan" defect. 3.5 raises the radius
      // to ~97px for a 5-member circle (chord between adjacent pills ≈114px,
      // clearing the ~90px pill width) and scales the same multiplier into
      // `_generatePointsSpiral`'s separation for denser (≥9-member) clusters,
      // without changing the zoom/fit decision above or leaflet.markercluster's
      // own bottomed-out-cluster gating.
      //
      // Issue #1762 fix-cycle 5 — this is now only the CONSTRUCTION-time
      // default/ceiling (SPIDERFY_DISTANCE_MULTIPLIER_BASE). It is
      // dynamically narrowed per-click, per-cluster-childCount and
      // per-current-viewport by handleClusterActivate below (see that
      // handler's comment) via computeSpiderfyDistanceMultiplier
      // (zoomPolicy.ts) — a WORKDONE_REVIEW BLOCKING finding that this
      // flat value had no upper bound tied to viewport size/child count.
      spiderfyDistanceMultiplier: SPIDERFY_DISTANCE_MULTIPLIER_BASE,
      // Issue #1762 fix cycle 4 — live-reproduced regression: after a
      // coincident cluster spiderfies (cycle 3), clicking an individual
      // spiderfied price-pill marker did nothing (no popover, no URL
      // change). Leaflet's own spider "leg" polylines default to
      // `interactive: true` (no `interactive`/`clickable` override in this
      // group's default `spiderLegPolylineOptions`) and are drawn from the
      // cluster's origin point to EACH marker's spiderfied position — i.e.
      // every leg terminates exactly at a marker's anchor point, which for
      // our ~90-107px-wide price pills (anchored at their bottom-center via
      // `iconAnchor:[0,0]` + a CSS `translate(-50%,-100%)` wrapper, see
      // createMarkerIcon) sits directly under a large swath of the pill's
      // own clickable area. A click landing on that overlap can be captured
      // by the (invisible, thin but real-hit-area) leg instead of the pill
      // underneath/behind it, silently swallowing the click — the leg has
      // no app-level click handler, so nothing happens, and the leg's own
      // click still bubbles to the map's native 'click' listener that
      // leaflet.markercluster binds internally for unspiderfying, which is
      // why the fan can look inert rather than erroring. `interactive:
      // false` removes spider legs from hit-testing entirely so a click
      // always reaches the marker underneath; purely visual, no change to
      // leg rendering/animation.
      spiderLegPolylineOptions: { interactive: false },
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount();
        let size: 'small' | 'medium' | 'large' = 'small';
        // Sized with real padding around the 17px count + 8px "HOMES" label
        // (0.05em letter-spacing) so the label never crowds/overflows the
        // circle edge — the prior 38/42/48px tiers left almost no margin
        // once the circle's width/height were actually enforced.
        let sizeNum = 46;

        if (count > 50) {
          size = 'large';
          sizeNum = 62;
        } else if (count > 10) {
          size = 'medium';
          sizeNum = 54;
        }

        // Listing-cluster marker redesign — compact dark-navy circular badge
        // (count on top, "HOMES" label below), matching the reference
        // screenshot. Keyboard/hover contract mirrors AreaMarkerLayer's
        // .dp-region / .area-group-card bubbles exactly: tabindex/role="button"/
        // aria-label make the marker a real control, and a "Tap to zoom in ›"
        // caption (index.css .custom-marker-cluster-cap) reveals on hover/focus
        // using the SAME wording as those other marker tiers. The outer
        // .custom-marker-cluster class name is preserved unchanged — several
        // E2E specs select on it for presence/visibility only.
        const noun = count === 1 ? 'home' : 'homes';
        const ariaLabel = escapeHtml(
          `${count} ${noun} in this cluster. Activate to zoom in.`,
        );

        return L.divIcon({
          // Leaflet's divIcon sets iconSize on the OUTER wrapper it creates
          // around this html string, not on this inner div — without an
          // explicit width/height here, .custom-marker-cluster (a flex
          // container with no padding) collapses to hug its content instead
          // of filling that allocated circle, producing a cramped, padding-
          // less badge. Setting width/height explicitly (matching sizeNum,
          // the same value passed to iconSize below) fixes that.
          html: `<div class="custom-marker-cluster custom-marker-cluster-${size}" style="width:${sizeNum}px;height:${sizeNum}px;" tabindex="0" role="button" aria-label="${ariaLabel}">
            <span class="custom-marker-cluster-count">${count}</span>
            <span class="custom-marker-cluster-label">HOMES</span>
            <span class="custom-marker-cluster-cap" aria-hidden="true">Tap to zoom in <span class="custom-marker-cluster-cap-arrow">&#8250;</span></span>
          </div>`,
          className: '',
          iconSize: L.point(sizeNum, sizeNum),
        });
      },
    });

    const validListings = listings.filter((l) => l.latitude && l.longitude);

    validListings.forEach((listing) => {
      // Issue #1547 — copper icon when id matches the URL-selected listing OR the
      // ephemeral hover/focus id. Both conditions use the same copper visual;
      // no flyTo / camera movement occurs for either path.
      const isHighlighted =
        listing.id === selectedListingId || listing.id === hoveredListingId;
      // Issue #1942 — thread priceBand (anon coarse price, #1941) into both icon
      // builders so anon individual pins show the band instead of a bare '—'.
      // Issue #2051 — also thread monthly_rent/monthlyRentBand so rent/lease pins
      // render a price instead of falling through to the '—' residual (AC6c).
      const icon = isHighlighted
        ? createSelectedMarkerIcon(listing.property_type, listing.price, listing.priceBand, listing.monthly_rent, listing.monthlyRentBand)
        : createMarkerIcon(listing.property_type, listing.price, listing.priceBand, listing.monthly_rent, listing.monthlyRentBand);
      const marker = L.marker([listing.latitude!, listing.longitude!], { icon });

      // Attach listing-id to the marker element for E2E selectors.
      marker.on('add', () => {
        const el = marker.getElement();
        if (el) el.setAttribute('data-listing-id', listing.id);
      });

      marker.on('click', (e: L.LeafletMouseEvent) => {
        onSelectListing?.(listing);
        // a3 — fire pixel position so MarkerPopoverCard can auto-position near the pin.
        // containerPoint is the pixel position relative to the map container element.
        if (onMarkerClickWithPosition && e.containerPoint) {
          onMarkerClickWithPosition({ x: e.containerPoint.x, y: e.containerPoint.y });
        }
      });

      clusterGroup.addLayer(marker);
    });

    // Issue #1762 — the SOLE cluster-tap camera mover, replacing Leaflet's
    // disabled zoomToBoundsOnClick above. Bound on 'clusterclick
    // clusterkeypress' — the SAME two event names leaflet.markercluster's
    // own internal `_bindEvents`/`_zoomOrSpiderfy` listens on (verified
    // against the installed leaflet.markercluster@1.5.3 source) — so this
    // handler runs alongside Leaflet's own (now-inert-for-zoom) listener
    // rather than replacing it. `@types/leaflet.markercluster` has no typed
    // overload for these plugin-added event names (only leaflet's own
    // built-in event map is typed), so the event object needs an
    // unavoidable cast to read `.layer` (the clicked MarkerCluster) and
    // `.originalEvent` (the underlying DOM event, present for a real click).
    const handleClusterActivate = (e: L.LeafletEvent) => {
      const evt = e as unknown as {
        type: string;
        layer?: L.MarkerCluster;
        originalEvent?: KeyboardEvent;
      };
      // Mirrors leaflet.markercluster's own _zoomOrSpiderfy gate: a
      // 'clusterkeypress' only activates on Enter (keyCode 13). Not
      // reachable via the existing keydown bridge below today (that bridge
      // synthesizes a native .click(), which surfaces as 'clusterclick' —
      // this gate exists for parity with Leaflet's own contract in case
      // something else ever dispatches a real 'clusterkeypress').
      if (evt.type === 'clusterkeypress' && evt.originalEvent && evt.originalEvent.keyCode !== 13) {
        return;
      }
      const cluster = evt.layer;
      if (!cluster) return;

      // Issue #1762 fix-cycle 5 — viewport-aware spiderfy fan clamp
      // (WORKDONE_REVIEW BLOCKING finding on the fix-cycle-3 flat
      // spiderfyDistanceMultiplier:3.5). MUST run before the
      // clusterCanSplit early-return below: leaflet.markercluster's OWN
      // clusterclick/clusterkeypress listener (`_zoomOrSpiderfy`,
      // registered via `_bindEvents()` inside `map.addLayer(clusterGroup)`
      // further down this effect — i.e. AFTER this handler is registered
      // via `clusterGroup.on(...)` below) independently decides whether to
      // spiderfy a bottomed-out cluster, regardless of whether
      // clusterCanSplit declines to move the camera — a non-splittable
      // (coincident) cluster is exactly the case that spiderfies (see the
      // fix-cycle-3 comment on `spiderfyDistanceMultiplier` above).
      // L.Evented fires listeners for one event in registration order
      // (verified against the installed leaflet.markercluster@1.5.3
      // source), and `MarkerCluster.spiderfy()` reads
      // `this._group.options.spiderfyDistanceMultiplier` LIVE at call time
      // (verified: `_generatePointsCircle`/`_generatePointsSpiral` both
      // read `this._group.options.spiderfyDistanceMultiplier`, not a value
      // captured at construction) — so mutating `clusterGroup`'s live
      // options object here, before Leaflet's own listener runs later in
      // this SAME event dispatch, changes what that spiderfy call sees.
      // `@types/leaflet.markercluster`'s `MarkerClusterGroup` class does
      // not re-declare `options` as the more specific
      // `MarkerClusterGroupOptions` (it inherits leaflet's untyped
      // `Layer.options`), so reading/writing this field needs the same
      // kind of unavoidable cast already used for `_spiderfied` below.
      const clusterGroupOptions = (clusterGroup as unknown as {
        options: { spiderfyDistanceMultiplier?: number };
      }).options;
      const spiderfyViewport = map.getContainer();
      clusterGroupOptions.spiderfyDistanceMultiplier = computeSpiderfyDistanceMultiplier(
        cluster.getChildCount(),
        spiderfyViewport.clientWidth,
        spiderfyViewport.clientHeight,
      );

      const bounds = cluster.getBounds();
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();
      const currentZoom = map.getZoom();
      const cappedTargetZoom = Math.min(CLUSTER_DISABLE_AT_ZOOM, map.getBoundsZoom(bounds, false));
      const hasSpread = hasSpatialSpread([sw.lat, sw.lng], [ne.lat, ne.lng]);

      if (!clusterCanSplit(currentZoom, cappedTargetZoom, hasSpread)) {
        // Not splittable — publish nothing; leaflet.markercluster's own
        // spiderfyOnMaxZoom (still enabled) handles the bottomed-out-cluster
        // case, and the camera never moves for a non-splittable click.
        return;
      }

      const center = bounds.getCenter();
      onMarkerClusterCameraIntent?.(
        [[sw.lat, sw.lng], [ne.lat, ne.lng]],
        [center.lat, center.lng],
      );

      // Issue #1762 — resolveMarkerRevealMode wiring: once this fit settles,
      // decide whether the cluster's own members should reveal as
      // individual pins or stay a clustered overview, based on density (not
      // purely the zoom this fit lands at) — see MARKER_REVEAL_HOLD_ZOOM's
      // doc comment above for how that decision is applied.
      const markerCount = cluster.getChildCount();
      // Track the pending one-shot listener so effect teardown can cancel
      // it explicitly. Without this, a stale closure (capturing this
      // cluster's sw/ne/markerCount) stays armed on the persistent `map`
      // instance and fires on whatever unrelated moveend happens next if
      // this effect re-runs (e.g. hoveredListingId changing) before the
      // fit-to-members animation settles.
      //
      // A second cluster tap can also arm a new listener before the first
      // one's moveend has fired, with no effect re-run in between (the ref
      // slot alone can't track more than one). Explicitly cancel any
      // still-pending listener first so at most one from this effect is
      // ever live on `map` — otherwise both fire on the next moveend, the
      // first with stale cluster geometry, and its self-clearing first line
      // can clobber the ref out from under the still-armed second handler.
      if (pendingMoveendHandlerRef.current) {
        map.off('moveend', pendingMoveendHandlerRef.current);
        pendingMoveendHandlerRef.current = null;
      }
      pendingMoveendHandlerRef.current = () => {
        pendingMoveendHandlerRef.current = null;
        // Issue #1762 fix cycle 4 — a splittable cluster's own fit-to-bounds
        // pan/zoom can finish its 'moveend' while ANOTHER cluster (or this
        // same one, re-bottomed-out at the new zoom) is still showing an
        // active leaflet.markercluster spiderfy fan (spiderfyOnMaxZoom stays
        // on; see the zoomToBoundsOnClick comment above). Applying a reveal-
        // mode change here re-renders this component with a new
        // `markerRevealDisableAtZoom`, which is an effect dependency below —
        // the whole marker-cluster layer (and every marker instance in it,
        // spiderfied or not) gets torn down and recreated. Doing that while
        // a spiderfy is on-screen silently discards the live fan the user is
        // looking at: the individual pins they see are about to be replaced
        // out from under their next click, which reads as "clicking a
        // spiderfied marker does nothing". `_spiderfied` is
        // leaflet.markercluster's own live pointer to the currently-open
        // spiderfy (untyped — @types/leaflet.markercluster has no surface
        // for plugin-internal state); skip the reveal-mode recompute
        // entirely while it's set; the hold/disable-at-zoom value simply
        // stays whatever it already was until the user's next cluster tap.
        const clusterGroupInternal = clusterGroup as unknown as { _spiderfied?: unknown };
        if (clusterGroupInternal._spiderfied) {
          return;
        }
        const mapContainer = map.getContainer();
        const mode = resolveMarkerRevealMode(
          map.getZoom(),
          markerCount,
          mapContainer.clientWidth,
          mapContainer.clientHeight,
          [[sw.lat, sw.lng], [ne.lat, ne.lng]],
        );
        setMarkerRevealDisableAtZoom(
          mode === 'clusteredOverview' ? MARKER_REVEAL_HOLD_ZOOM : CLUSTER_DISABLE_AT_ZOOM,
        );
      };
      map.once('moveend', pendingMoveendHandlerRef.current);
    };
    clusterGroup.on('clusterclick clusterkeypress', handleClusterActivate);

    map.addLayer(clusterGroup);

    // Listing-cluster keyboard bridge. Leaflet.markercluster regenerates
    // cluster icons on every zoom/pan (unlike AreaMarkerLayer's static area
    // markers), so per-icon listener attachment on 'add' would need constant
    // re-wiring against an untyped plugin event. Delegate once on the map
    // container instead: Enter/Space on a focused .custom-marker-cluster
    // bubbles up here and is forwarded to a native .click() on the element,
    // which surfaces as a 'clusterclick' event — reaching both Leaflet's own
    // (now-inert-for-zoom) internal listener and handleClusterActivate above
    // — this makes the cluster-tap fit-to-members handler keyboard-reachable
    // without any separate keyboard-specific camera logic.
    const container = map.getContainer();
    const handleClusterKeydown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      const clusterEl = target.closest<HTMLElement>('.custom-marker-cluster');
      if (!clusterEl) return;
      e.preventDefault();
      clusterEl.click();
    };
    container.addEventListener('keydown', handleClusterKeydown);

    return () => {
      clusterGroup.off('clusterclick clusterkeypress', handleClusterActivate);
      map.removeLayer(clusterGroup);
      container.removeEventListener('keydown', handleClusterKeydown);
      // Cancel any still-pending cluster-tap moveend listener so a
      // mid-animation teardown (e.g. hover changing hoveredListingId)
      // can't leave a stale closure armed on the persistent map instance.
      if (pendingMoveendHandlerRef.current) {
        map.off('moveend', pendingMoveendHandlerRef.current);
        pendingMoveendHandlerRef.current = null;
      }
    };
  }, [
    listings,
    map,
    onSelectListing,
    selectedListingId,
    hoveredListingId,
    onMarkerClickWithPosition,
    onMarkerClusterCameraIntent,
    markerRevealDisableAtZoom,
  ]);

  return null;
}

/**
 * Issue #1465 — Build a safe hover-tooltip label for an agri map marker.
 *
 * Priority: escaped title → locality + acreage fallback → acreage only →
 * generic. Never returns "undefined", "null", or an empty string.
 *
 * Exported for unit testing; not part of the public component API.
 */
export function buildAgriMarkerLabel(
  title: string | null | undefined,
  locality: string | null | undefined,
  landArea: number | null | undefined,
  landAreaUnit: string | null | undefined,
): string {
  // Title takes priority when non-blank.
  if (title != null && title.trim() !== '') {
    return escapeHtml(title.trim());
  }

  // Derive a human-readable acreage string when possible.
  const hasAcreage = landArea != null && landArea > 0;
  const unit = landAreaUnit ?? 'acres';
  const acreageStr = hasAcreage ? `${landArea} ${escapeHtml(unit)}` : null;

  const hasLocality = locality != null && locality.trim() !== '';
  const localityStr = hasLocality ? escapeHtml(locality!.trim()) : null;

  if (localityStr && acreageStr) return `${localityStr} · ${acreageStr}`;
  if (acreageStr) return acreageStr;
  if (localityStr) return localityStr;
  return 'Agricultural land';
}

// Issue #1372 — agriculture-specific cluster layer.
// Identical structure to MarkerClusterLayer but uses agri-themed cluster icons
// so agricultural land pins are visually distinct in the agri-first journey.
function AgriMarkerClusterLayer({
  listings,
  onSelectListing,
  selectedListingId,
  hoveredListingId,
}: {
  listings: PropertyListingWithImages[];
  onSelectListing?: (listing: PropertyListingWithImages | null) => void;
  /** Issue #1547 — ID of the currently selected agri listing (URL-derived). Renders copper icon. */
  selectedListingId?: string | null;
  /** Issue #1547 — ephemeral hover/focus id for agri card→marker highlight. */
  hoveredListingId?: string | null;
}) {
  const map = useMap();

  useEffect(() => {
    const clusterGroup = L.markerClusterGroup({
      chunkedLoading: true,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      maxClusterRadius: CLUSTER_MAX_RADIUS_PX,
      disableClusteringAtZoom: CLUSTER_DISABLE_AT_ZOOM,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount();
        let size: 'small' | 'medium' | 'large' = 'small';
        let sizeNum = 36;

        if (count > 50) {
          size = 'large';
          sizeNum = 52;
        } else if (count > 10) {
          size = 'medium';
          sizeNum = 44;
        }

        return L.divIcon({
          html: `<div class="agri-cluster agri-cluster-${size}">🌾 ${count} ${count === 1 ? 'property' : 'properties'}</div>`,
          className: '',
          iconSize: undefined,
          iconAnchor: [0, 0],
        });
      },
    });

    const validListings = listings.filter((l) => l.latitude && l.longitude);

    validListings.forEach((listing) => {
      const isHighlighted =
        listing.id === selectedListingId || listing.id === hoveredListingId;
      // Issue #1942 — pass priceBand for signature consistency with MarkerClusterLayer.
      // Agri listings never carry a priceBand (null), so this branch stays byte-identical
      // '—' — the same shared helper is just called with an always-absent 3rd arg here.
      const icon = isHighlighted
        ? createSelectedMarkerIcon(listing.property_type, listing.price, listing.priceBand)
        : createMarkerIcon(listing.property_type, listing.price, listing.priceBand);
      const marker = L.marker([listing.latitude!, listing.longitude!], { icon });

      // Attach listing-id to the marker element for E2E selectors.
      marker.on('add', () => {
        const el = marker.getElement();
        if (el) el.setAttribute('data-listing-id', listing.id);
      });

      marker.on('click', () => {
        onSelectListing?.(listing);
      });

      // Issue #1465 — lightweight hover tooltip; orthogonal to click handler.
      const tooltipLabel = buildAgriMarkerLabel(
        listing.title,
        listing.locality,
        listing.land_area,
        listing.land_area_unit,
      );
      marker.bindTooltip(tooltipLabel, {
        permanent: false,
        direction: 'top',
        offset: [0, -20],
      });

      clusterGroup.addLayer(marker);
    });

    map.addLayer(clusterGroup);

    return () => {
      map.removeLayer(clusterGroup);
    };
  }, [listings, map, onSelectListing, selectedListingId, hoveredListingId]);

  return null;
}

/**
 * Issue #1373 — renders saved agricultural plot boundaries as Leaflet Polygons.
 *
 * Only active when:
 *   - mapZoom >= 16 (same threshold as AgriMarkerClusterLayer.disableClusteringAtZoom)
 *   - listing.boundary_geojson is a non-null, non-empty string
 *
 * Coordinate transform: GeoJSON stores [longitude, latitude] pairs; Leaflet uses
 * [latitude, longitude]. This component converts on-the-fly when building positions.
 * The fails-without-fix unit test in PropertyMap.agriPolygon.test.tsx asserts this.
 *
 * Null-boundary agri listings fall back to AgriMarkerClusterLayer (no polygon here).
 * Non-agri listings are not passed to this layer (AgriPolygonLayer only mounts in isAgriMode).
 */
function AgriPolygonLayer({
  listings,
  selectedListing,
  onSelectListing,
  mapZoom,
}: {
  listings: PropertyListingWithImages[];
  selectedListing?: PropertyListingWithImages | null;
  onSelectListing?: (listing: PropertyListingWithImages | null) => void;
  mapZoom?: number;
}) {
  // Gate: only render at zoom >= 16
  if (mapZoom == null || mapZoom < 16) return null;

  const agriListingsWithBoundary = listings.filter(
    (l) => l.property_type === 'agricultural_land' && l.boundary_geojson,
  );

  if (agriListingsWithBoundary.length === 0) return null;

  return (
    <>
      {agriListingsWithBoundary.map((listing) => {
        let positions: [number, number][] = [];
        try {
          // GeoJSON Polygon: { type: "Polygon", coordinates: [[[lng, lat], ...]] }
          // Leaflet Polygon positions: [[lat, lng], ...]
          // Transform: each [lng, lat] pair → [lat, lng]
          const geo = JSON.parse(listing.boundary_geojson!);
          // Guard: only handle GeoJSON Polygon type
          if (geo.type !== 'Polygon' || !Array.isArray(geo.coordinates?.[0])) return null;
          const ring: [number, number][] = geo.coordinates[0];
          positions = ring.map(([lng, lat]: [number, number]) => [lat, lng]);
        } catch {
          return null;
        }
        if (positions.length < 3) return null;

        const isSelected = selectedListing?.id === listing.id;

        return (
          <Polygon
            key={listing.id}
            positions={positions}
            pathOptions={{
              color: isSelected ? '#f97316' : '#65a30d',
              fillColor: isSelected ? '#f97316' : '#65a30d',
              fillOpacity: isSelected ? 0.35 : 0.2,
              weight: isSelected ? 3 : 2,
            }}
            eventHandlers={{
              click: () => onSelectListing?.(listing),
            }}
          />
        );
      })}
    </>
  );
}

// Issue #1954 — school marker recolored from blue (#2563eb) to the plum design-system
// token, matching the school-first V2 identity used throughout SchoolJourneyPanels
// (bg-plum-tint / text-plum). Does not touch area/agri marker colours elsewhere in
// this file (Polygon pathOptions above, AreaMarkerLayer, etc.) — school-only change.
const schoolMarkerIcon = L.divIcon({
  className: 'school-marker',
  html: `
    <div style="
      width: 36px;
      height: 36px;
      background-color: hsl(var(--plum));
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      line-height: 1;
    ">🎓</div>
  `,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

export function PropertyMap({
  listings,
  selectedListing,
  onSelectListing,
  focusBounds,
  polygon,
  onPolygonDrawn,
  onPolygonCleared,
  schoolCircle,
  initialCenter,
  initialZoom,
  historyAction,
  cityCenter,
  cityZoom,
  areas = [],
  onAreaClick,
  onAreaCameraIntent,
  cameraIntent,
  focusedGroupAreas,
  enableAreaMarkerDegradation,
  selectedAreaKey,
  areaSearchMatchKeys,
  hoveredAreaKey,
  onAreaClusterClick,
  onAreaClusterCameraIntent,
  onAreaMarkersComputed,
  areasNavigationJourney = null,
  hoveredNavigationNodeKey = null,
  onNavigationNodeHoverChange,
  focusedClusterMemberAreaKeys = null,
  onClusterFocusChange,
  onAreaVisualClusterCameraIntent,
  showAreasNavigationDestinations = false,
  onZoomChange,
  onViewportChange,
  onBoundsChange,
  panToArea,
  bottomOcclusionPx = 0,
  previewOcclusionPx = 0,
  resetMapTick,
  onReady,
  journey,
  selectedSchool,
  schools = [],
  showSchoolMarkers = false,
  onSelectSchool,
  schoolsIsLoading = false,
  schoolsIsError = false,
  schoolsError = null,
  schoolFocusTick,
  schoolFocusLat,
  schoolFocusLon,
  schoolFocusRadiusKm,
  schoolMarkerFocusTick,
  schoolMarkerPositions,
  areaRestoreTick,
  areaRestoreLat,
  areaRestoreLon,
  areaRestoreBbox,
  cityRestoreTick,
  cityRestoreCenter,
  cityRestoreZoom,
  isAgriMode = false,
  mapZoom,
  selectedPolygonListing,
  agriGroupListings,
  sectorOverlay = null,
  selectedListingId,
  hoveredListingId,
  schoolZoneLabels,
  onSelectZone,
  onMarkerClickWithPosition,
  onMarkerClusterCameraIntent,
}: PropertyMapProps) {
  // Issue #1410 — when agriGroupListings is provided (non-null), use the adapted items
  // for AgriMarkerClusterLayer and AgriPolygonLayer instead of the raw `listings` prop.
  // An empty array is intentional (0 markers for the selected group = correct behaviour).
  // When null/undefined (no group selected), falls back to `listings` (no regression).
  const agriLayerListings: PropertyListingWithImages[] = useMemo(
    () =>
      isAgriMode && agriGroupListings != null
        ? adaptAgriMapListingsToMarkers(agriGroupListings)
        : listings,
    [isAgriMode, agriGroupListings, listings],
  );

  // Derive the selected school ID for SchoolMarkerLayer focus mode.
  const selectedSchoolId = selectedSchool?.id ?? null;

  // Issue #1882 (Track A PR3, Slice S2/S3) — committed zoom band + the
  // one-primary-layer selector. useZoomBand is called HERE (inside
  // PropertyMap, against its existing `mapZoom` prop) rather than in
  // MapDiscovery, because PropertyMap does not unmount across zoom/pan
  // changes — the ref it holds internally persists correctly for the
  // lifetime of a single Discover map session. Falls back to DEFAULT_ZOOM
  // (the overview band) when `mapZoom` hasn't been supplied yet (e.g. before
  // the first ZoomWatcher zoomend, or in tests that don't pass it) — this
  // matches AreaMarkerLayer's pre-existing implicit "areas render whenever
  // present" default for that case.
  const committedZoomBand = useZoomBand(mapZoom ?? DEFAULT_ZOOM);
  const primaryMapLayer = selectPrimaryMapLayer({
    band: committedZoomBand,
    isAgriMode,
    hasAreas: areas.length > 0,
  });

  // Issue #2049 (defect 2) — bumped by MapLifecycleGuard's onTeardown whenever
  // react-leaflet's reappear path would otherwise hand the same (already
  // `_leaflet_id`-tagged) DOM node back to a fresh `new L.Map(node)` call.
  // Changing MapContainer's `key` forces React to mount a brand-new DOM node
  // for the remount, sidestepping the crash. useCallback keeps onTeardown's
  // identity stable across renders (MapLifecycleGuard's cleanup depends on it).
  const [mapInstanceKey, setMapInstanceKey] = useState(0);
  const handleMapTeardown = useCallback(() => {
    setMapInstanceKey((key) => key + 1);
  }, []);

  return (
    <div className="w-full h-full relative">
      {/* Issue #2129 — mobile lower-map marker occlusion (follow-up to
          #1823/PR #2128). AreaPanner's one-time fitBounds padding
          (bottomOcclusionPx, above) only reserves the bottom band at the
          MOMENT of a canonical-node fit; a plain user pan/drag AFTER that
          fit is not re-guarded by anything, so a marker can drift into the
          band the compact preview sheet (MobileListingPreviewSheet,
          z-[1100], bottom-anchored in this same stacking context) will
          later cover. Rather than adding a second camera writer (would
          violate the #1823 single-writer invariant) or reactively
          re-fitting on every pan, this wrapper shrinks the LEAFLET
          CONTAINER's own clipped viewport — but on `previewOcclusionPx`,
          NOT `bottomOcclusionPx` (code-reviewer cycle 1, Finding 1):
          bottomOcclusionPx is the proactive journey/capability signal
          (true for the WHOLE mobile Map-mode browsing session in an
          eligible journey, before any marker is ever tapped) and is
          correct as AreaPanner's one-time fit-time padding input, but
          using it here would visibly shrink the map for the entire
          session even when the sheet is never open. previewOcclusionPx
          is 0 unless the sheet is ACTUALLY selected/rendered right now
          (see this prop's own doc comment above). Leaflet's container has
          `overflow: hidden`, so once MapContainerResizeSync's existing
          ResizeObserver (Issue #2049) observes this height change and
          calls invalidateSize(), NO marker can ever be positioned behind
          the sheet while it is actually open, for ANY subsequent
          pan/zoom/drag — the guarantee holds continuously, not just at
          fit time — while ordinary browsing before any tap keeps the full
          map height. When previewOcclusionPx is 0 (sheet not open, or
          desktop) this wrapper is a no-op (100% height, byte-identical to
          the prior unwrapped layout). data-testid/data-bottom-occlusion-px
          exposed for the E2E hit-test QA will author separately. */}
      <div
        className="w-full"
        style={{ height: previewOcclusionPx > 0 ? `calc(100% - ${previewOcclusionPx}px)` : '100%' }}
        data-testid="discover-map-usable-viewport"
        data-bottom-occlusion-px={previewOcclusionPx}
      >
      <MapContainer
        key={mapInstanceKey}
        center={initialCenter ?? cityCenter ?? UDUPI_CENTER}
        zoom={initialZoom ?? cityZoom ?? DEFAULT_ZOOM}
        className="w-full h-full rounded-lg z-0"
        scrollWheelZoom
        zoomControl={false}
      >
        {/* Zoom +/- sits bottom-right (matches the ReTrends mock) — clear of the
            top-left "Udupi" pill AND the bottom-left area-count legend (#1588). */}
        <ZoomControl position="bottomright" />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {/* Issue #2130 — dedicated pane (zIndex 550, below the default
            markerPane's 600) for the currently SELECTED school's marker only
            (see SchoolMarkerLayer.tsx's SELECTED_SCHOOL_PANE_NAME doc comment).
            Mounted early so its pane exists before any layer below references
            it by name. Property/listing markers stay in the default markerPane
            and therefore always paint — and hit-test — above it, fixing #2130
            (selected-school marker intercepting taps on an overlapping
            property marker) without touching schoolPicking/candidate-school
            marker stacking. Created imperatively via useMap() (matching this
            file's existing MapReadySignal/ZoomWatcher pattern) rather than
            react-leaflet's declarative <Pane> — a new named export off
            'react-leaflet' would need adding to every one of this codebase's
            many `vi.mock('react-leaflet', ...)` test doubles; the imperative
            call needs no new export and is a no-op (guarded) on any mock
            `useMap()` stub that doesn't implement createPane. */}
        <SelectedSchoolPaneSetup />
        {/* Issue #2049 — lifecycle guard (defect 2 fix) and container-resize
            sync (defect 1 fix). Both mount alongside the existing controllers
            below; neither touches any camera call site. */}
        <MapLifecycleGuard onTeardown={handleMapTeardown} />
        <MapContainerResizeSync />
        <MapReadySignal onReady={onReady} />
        <URLViewportController initialCenter={initialCenter} initialZoom={initialZoom} historyAction={historyAction} />
        <MapController
          selectedListing={selectedListing}
          focusBounds={focusBounds}
          cityCenter={cityCenter}
          cityZoom={cityZoom}
          resetMapTick={resetMapTick}
          cameraIntent={cameraIntent}
        />
        <ZoomWatcher onZoomChange={onZoomChange} />
        <ViewportWatcher onViewportChange={onViewportChange} />
        <BoundsWatcher onBoundsChange={onBoundsChange} />
        <AreaPanner panToArea={panToArea} bottomOcclusionPx={bottomOcclusionPx} />
        <SchoolFocusPanner
          schoolFocusTick={schoolFocusTick}
          lat={schoolFocusLat}
          lon={schoolFocusLon}
          radiusKm={schoolFocusRadiusKm}
        />
        <SchoolMarkerFocusPanner
          schoolMarkerFocusTick={schoolMarkerFocusTick}
          lat={schoolFocusLat}
          lon={schoolFocusLon}
          radiusKm={schoolFocusRadiusKm}
          markerPositions={schoolMarkerPositions}
        />
        <AreaRestorePanner
          areaRestoreTick={areaRestoreTick}
          lat={areaRestoreLat}
          lon={areaRestoreLon}
          bbox={areaRestoreBbox}
        />
        <CityRestorePanner
          cityRestoreTick={cityRestoreTick}
          cityCenter={cityRestoreCenter}
          cityZoom={cityRestoreZoom}
        />
        {isAgriMode ? (
          <>
            {/* Issue #1410: agriLayerListings = adaptAgriMapListingsToMarkers(agriGroupListings)
                when a regional group is selected; falls back to listings prop otherwise. */}
            <AgriMarkerClusterLayer
              listings={agriLayerListings}
              onSelectListing={onSelectListing}
              selectedListingId={selectedListingId}
              hoveredListingId={hoveredListingId}
            />
            <AgriPolygonLayer
              listings={agriLayerListings}
              selectedListing={selectedPolygonListing}
              onSelectListing={onSelectListing}
              mapZoom={mapZoom}
            />
          </>
        ) : (
          // Issue #1882 (Track A PR3, Slice S3) — the residential cluster layer
          // is the ONE primary layer opposite AreaMarkerLayer; primaryMapLayer
          // suppresses it while the committed zoom band is 'overview' AND areas
          // are present, eliminating the transient 12<->13 boundary double-mount.
          // When areas is empty, selectPrimaryMapLayer always returns
          // 'residentialMarkers' (no conflict to resolve), so this reproduces
          // the pre-#1882 unconditional-render behaviour exactly.
          primaryMapLayer === 'residentialMarkers' && (
            <MarkerClusterLayer
              listings={listings}
              onSelectListing={onSelectListing}
              selectedListingId={selectedListingId}
              hoveredListingId={hoveredListingId}
              onMarkerClickWithPosition={onMarkerClickWithPosition}
              onMarkerClusterCameraIntent={onMarkerClusterCameraIntent}
            />
          )
        )}
        {/* Issue #1956 PR 2 (Slice 3, map half) — the canonical Areas-journey
            Direction destinations are MUTUALLY EXCLUSIVE with the legacy
            AreaMarkerLayer below (never both mounted): when the SAME gate
            DiscoverRightPanelContainer uses to mount DiscoverAreasJourneyPanel
            is active, this layer takes the area-marker slot instead. */}
        {showAreasNavigationDestinations && areasNavigationJourney ? (
          // TODO(#2124): Map school-count badges on markers: conservative MVP shows listing count on markers; school-count marker badges are a visual-only follow-up.
          <AreaDestinationMarkerLayer
            node={areasNavigationJourney.node}
            levelKind={areasNavigationJourney.levelKind}
            children={areasNavigationJourney.children}
            onSelect={areasNavigationJourney.selectNode}
            hoveredNodeKey={hoveredNavigationNodeKey}
            onHoverChange={onNavigationNodeHoverChange}
            journey={journey}
            focusedClusterMemberAreaKeys={focusedClusterMemberAreaKeys}
            onClusterFocusChange={onClusterFocusChange}
            onAreaVisualClusterCameraIntent={onAreaVisualClusterCameraIntent}
          />
        ) : (
          // Issue #1882 (Track A PR3, Slice S3) — AreaMarkerLayer renders when it's
          // the selected primary layer ('area') OR when agri mode intentionally
          // coexists with it ('agriCoexist', unchanged pre-#1882 behaviour) —
          // never when the residential cluster layer won the exclusivity check.
          areas.length > 0 && (primaryMapLayer === 'area' || primaryMapLayer === 'agriCoexist') && (
            <AreaMarkerLayer
              areas={areas}
              onAreaClick={onAreaClick}
              onAreaCameraIntent={onAreaCameraIntent}
              focusedGroupAreas={focusedGroupAreas}
              journey={journey}
              selectedSchool={selectedSchool}
              enableDegradation={enableAreaMarkerDegradation}
              selectedAreaKey={selectedAreaKey}
              searchMatchKeys={areaSearchMatchKeys}
              hoveredAreaKey={hoveredAreaKey}
              onAreaClusterClick={onAreaClusterClick}
              onAreaClusterCameraIntent={onAreaClusterCameraIntent}
              onMarkersComputed={onAreaMarkersComputed}
            />
          )
        )}
        {schoolZoneLabels && schoolZoneLabels.length > 0 && (
          <SchoolZoneLabelLayer zones={schoolZoneLabels} onZoneClick={onSelectZone} />
        )}
        {showSchoolMarkers && (
          <SchoolMarkerLayer
            schools={schools}
            onSelectSchool={onSelectSchool}
            showSchoolMarkers={showSchoolMarkers}
            journey={journey}
            isLoading={schoolsIsLoading}
            isError={schoolsIsError}
            error={schoolsError}
            selectedSchoolId={selectedSchoolId}
          />
        )}
        {onPolygonDrawn && onPolygonCleared && (
          <DrawControl
            polygon={polygon}
            onPolygonDrawn={onPolygonDrawn}
            onPolygonCleared={onPolygonCleared}
          />
        )}
        {/* Issue #1429 — sector overlay for agri corridor-first discovery.
            Rendered before school circle (below markers in z-order via overlayPane). */}
        {sectorOverlay && (
          <SectorOverlay
            centerLat={cityCenter?.[0] ?? UDUPI_CENTER[0]}
            centerLon={cityCenter?.[1] ?? UDUPI_CENTER[1]}
            directionCode={sectorOverlay.directionCode}
            maxKm={sectorOverlay.maxKm}
          />
        )}
        {schoolCircle && (
          <>
            <Circle
              center={[schoolCircle.lat, schoolCircle.lon]}
              radius={schoolCircle.radiusKm * 1000}
              pathOptions={{
                // Issue #1954 — plum dashed radius ring (was blue #2563eb), matching
                // the plum school marker icon above. dashArray/weight/fillOpacity unchanged.
                color: 'hsl(var(--plum))',
                fillColor: 'hsl(var(--plum))',
                fillOpacity: 0.08,
                weight: 2,
                dashArray: '6 4',
              }}
            />
            {/* School location marker (🎓). The school name is intentionally NOT
                labelled on the map — the journey breadcrumb overlay already shows it,
                so a permanent tooltip here would just duplicate it.
                Issue #2130 — rendered into the dedicated selected-school pane
                (below the default markerPane) so it can never occlude an
                overlapping property marker's tap target; see the <Pane> above. */}
            <Marker
              position={[schoolCircle.lat, schoolCircle.lon]}
              icon={schoolMarkerIcon}
              pane={SELECTED_SCHOOL_PANE_NAME}
            />
          </>
        )}
      </MapContainer>
      </div>
    </div>
  );
}
