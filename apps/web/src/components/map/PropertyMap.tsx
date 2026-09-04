import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { MapContainer, TileLayer, useMap, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
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
import {
  resolveHierarchyCameraFit,
  type HierarchyChildAnchor,
  type UsableViewportRect,
} from '@/features/discover/navigation/hierarchyCameraFit';
import {
  clusterAreaMembers,
  isUsableCentroid,
  type ClusterableDestination,
} from '@/features/discover/navigation/areaClustering';
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
  selectPrimaryMapLayer,
} from '@/lib/map/zoomPolicy';
import {
  computeCameraPadding,
  LEAF_FIT_MIN_ZOOM,
  LEAF_FIT_MAX_ZOOM,
  type AreaPanReason,
} from '@/shared/map/zoomPolicy';
import { useZoomBand } from '@/hooks/useZoomBand';
// Issue #2382 — journey-specific Leaflet layer controllers + their
// icon-factory functions, extracted out of this file (page-health follow-up
// from #2296). The icon factories are re-exported below so existing test
// imports from '@/components/map/PropertyMap' keep working unchanged.
import { MarkerClusterLayer } from '@/components/map/layers/ResidentialMarkerClusterLayer';
import { AgriMarkerClusterLayer, AgriPolygonLayer } from '@/components/map/layers/AgriParcelLayer';
import { AgriDestinationMarkerLayer } from '@/components/map/layers/AgriDestinationMarkerLayer';
import { SchoolRadiusOverlay } from '@/components/map/layers/SchoolRadiusOverlay';

export {
  deriveMarkerLabel,
  createMarkerIcon,
  createSelectedMarkerIcon,
  createAgriDestinationBadgeIcon,
} from '@/components/map/layers/markerIcons';
export { buildAgriMarkerLabel } from '@/components/map/layers/AgriParcelLayer';

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
  /**
   * Issue #2143 (PR follow-up) — the canonical Areas navigation node's OWN
   * key, when a canonical Areas journey is active (same value
   * useDiscoverCameraOrchestration.ts's fit-once effect keys its transition
   * detection on). Paired with `isColdNavigate` to let URLViewportController
   * skip its own unconditional-on-mount viewport apply for exactly the cold
   * canonical-node case AreaPanner already owns — see that component's gate.
   */
  navigationNodeKey?: string | null;
  /**
   * Issue #2143 (PR follow-up) — the SAME isColdNavigate signal
   * useDiscoverCameraOrchestration.ts's guardedSetPanToArea uses internally.
   * Never recomputed here — this component only consults the value.
   */
  isColdNavigate?: boolean;
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
   * Issue #2017 — area keys currently in the multi-area AREA_SET draft
   * selection. Passed through to AreaMarkerLayer unchanged; absent/empty
   * means no AREA_SET candidate callouts render.
   */
  areaSetCandidateKeys?: string[];
  /**
   * Issue #2017 — fired when an AREA_SET candidate callout (or its
   * "View homes" line) is activated by click or keyboard. Passed through to
   * AreaMarkerLayer unchanged; unused unless areaSetCandidateKeys is also
   * provided.
   */
  onAreaSetCandidateSelect?: (areaKey: string) => void;
  /**
   * Issue #2017 (max-3 visual parity, PR #2424) — true when the AREA_SET
   * draft is at its cap (`useAreaSetDraft`'s `atLimit` — the single source of
   * truth also consumed by `AreaSetChips.tsx`'s own candidate-button disabled
   * styling). Passed through to AreaMarkerLayer unchanged; drives a muted,
   * non-interactive visual + click/keyboard no-op on not-yet-selected
   * candidate map pins once the cap is reached. Optional/defaults to false so
   * every existing caller/test fixture keeps behaving identically.
   */
  areaSetAtMax?: boolean;
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
   * Issue #1943 (singleton auto-advance, PR #2368 owner ruling 2026-08-28) —
   * REPLACE-mode counterpart to `areasNavigationJourney.selectNode`, passed
   * through unchanged to `AreaDestinationMarkerLayer`. Fired ONLY by the
   * layer's own automatic-transition detection, never by a user click — a
   * click always goes through `areasNavigationJourney.selectNode` (PUSH).
   */
  autoAdvanceSelectNode?: (nodeKey: string) => void;
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
        /**
         * Issue #1943 Slice B — attached ONLY on the canonicalNode publish
         * (useDiscoverCameraOrchestration.ts). AreaPanner below calls
         * resolveHierarchyCameraFit with THIS when reason === 'canonicalNode'.
         */
        hierarchyChildAnchors?: HierarchyChildAnchor[] | null;
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
   * Issue #2296 (PR #2381 second review) — Level-2 agri destination-bucket
   * markers, rendered by the dedicated AgriDestinationMarkerLayer (NOT
   * AgriMarkerClusterLayer). Deliberately a SEPARATE prop from
   * `agriGroupListings`/`listings` — those still drive AgriMarkerClusterLayer
   * for real Level-3 parcel listings, unchanged, so a Level-2 destination
   * marker can never fall into that layer's clustering policy and render a
   * generic "N properties" bubble instead of its own name + authoritative
   * parcel count. Each item MUST carry a defined `parcelCount` (items without
   * one are skipped) since that is the whole point of this layer.
   */
  agriDestinationMarkers?: AgriMapListingItem[] | null;
  /**
   * Issue #2296 (PR #2381 third review) — fired when a Level-2 agri
   * destination-bucket marker (AgriDestinationMarkerLayer) is clicked, with
   * that bucket's stable `areaKey`. The caller is expected to drill down
   * into that destination (`urlActions.setLocality(areaKey)` — PUSH
   * semantics, the same action `AgriGroupSelectedPanel`'s locality-row click
   * already uses), NOT the generic marker-selection/popover flow
   * `onSelectListing` drives for real listings.
   */
  onSelectAgriDestination?: (areaKey: string) => void;
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

/**
 * Issue #1943 (Stage-B rework, TASK 1 "A-containable") — closes the
 * resolver/clusterer feedback gap from the CALL SITE, without touching
 * `hierarchyCameraFit.ts` (forbidden, Slice-A calibrated). The resolver
 * scores candidates purely on clipped-count/pair-count; it has no visibility
 * into the render layer's `clusterAreaMembers` merge pass, which silently
 * ABSORBS overlap by merging cards together. A maximally-wide camera can
 * therefore score PERFECTLY (nothing clips, nothing "intersects" because
 * everything already merged into one bubble) while being maximally
 * illegible to a real user. This predicts, at each integer candidate zoom in
 * `[minZoom, maxZoom]`, how many destination cards the SAME
 * `clusterAreaMembers` the render layer uses would actually produce, and
 * narrows the window to exclude zooms that collapse MORE than half of the
 * real destinations into fewer, merged cards — before the resolver ever
 * sees them. Pure computation, no map writes, no re-entry.
 *
 * Identity used for clustering here is POSITIONAL (index-based) — a
 * `HierarchyChildAnchor` (Slice-A type, forbidden to extend) carries no real
 * nodeKey, and none is needed: this only predicts the resulting CARD COUNT
 * at each zoom, never which specific destinations end up in which cell.
 *
 * Never returns an empty window. When fewer than two zooms clear the
 * legibility bar, it does NOT fall back to the un-narrowed range — that range
 * is exactly what produced the observed all-destinations-collapse-into-one-
 * bubble result, so reverting to it would silently disable this mechanism for
 * precisely the tightest nodes it exists to help. Instead it returns
 * `[argmax(cardCount), maxZoom]`, degrading toward the most legible camera
 * actually available. The un-narrowed range is NOT returned only in that one
 * case — it is also returned when there is no candidate data at all
 * (`ceil(minZoom) > floor(maxZoom)`) and, before any of the above runs, when
 * `destinationCount <= 1` (nothing to narrow against). Separately, when
 * `usableViewport` is supplied and no zoom in range achieves raw-anchor
 * containment, the returned `minZoom` reverts to the caller's own un-narrowed
 * floor (only `maxZoom` stays legibility-narrowed) — on real call sites,
 * post cluster-containment-gap fix, this is now the common outcome rather
 * than a rare degenerate case.
 *
 * Issue #1943 (Bug: destination/cluster cards render outside the map
 * container — "containment outranks legibility") — narrowing by card count
 * alone has no idea that raising `minZoom` (excluding wide/zoomed-out
 * candidates) can push anchors that are only in-frame at those wide zooms
 * out of the resolver's reachable window entirely. `resolveHierarchyCameraFit`
 * is strictly bounded by `[minZoom, maxZoom]`; if legibility narrowing
 * removes the only zoom at which every anchor's card rect actually fits the
 * viewport, the resolver has nothing clip-free left to pick from and a real
 * anchor renders off-screen. When `usableViewport` is supplied, this function
 * additionally finds the LARGEST zoom in the ORIGINAL `[minZoom, maxZoom]`
 * range at which every anchor's card rect (bottom-centre anchored, its own
 * per-anchor footprint, centre-pinned on the anchors' arithmetic-mean
 * centroid) is fully contained — the SAME containment model
 * `hierarchyCameraFit.ts`'s own `childZBase` search uses (reproduced here;
 * that module's rect helpers are private/unexported and the module itself is
 * forbidden to edit) — and widens the legibility-narrowed window, if
 * necessary, so that zoom stays reachable. Containment always wins: a
 * clip-free-but-illegible zoom is kept in the window over an
 * illegible-and-narrower one. This CANNOT invent a clip-free zoom where the
 * data genuinely has none in range — when no zoom anywhere in
 * `[minZoom, maxZoom]` achieves full containment, the floor widens back down
 * to the caller's own `minZoom` (never the legibility pass's raised one) and
 * the resolver's own least-bad-candidate scoring takes over. `usableViewport`
 * is optional so existing pure-legibility callers/tests are unaffected when
 * omitted.
 *
 * TWO-TIER CONTAINMENT, and the weaker tier is deliberate — stated here
 * because this is the doc a caller reads. Beyond the raw per-anchor check
 * above, it ALSO prefers a zoom at which every PREDICTED multi-member cluster
 * cell's own centroid card is contained, since the render draws such a cell
 * once at its members' centroid — a position no raw anchor occupies and one
 * the resolver's model never evaluates. That cluster check is a PREFERENCE,
 * NOT a veto: where no zoom satisfies both tiers, the largest RAW-contained
 * zoom is returned anyway. So the zoom this widens to MAY still clip a real
 * cluster card. That is intentional — vetoing instead would return null and
 * fall back to the pre-containment window, which is strictly worse — but it
 * means "contained" here guarantees the raw anchors, not every rendered card.
 */
export function narrowToLegibleZoomWindow(
  anchors: readonly HierarchyChildAnchor[],
  projectAtZoom: (lat: number, lon: number, zoom: number) => { x: number; y: number },
  minZoom: number,
  maxZoom: number,
  usableViewport?: UsableViewportRect,
): { minZoom: number; maxZoom: number } {
  const fallback = { minZoom, maxZoom };

  const usable = anchors.filter(
    (a): a is HierarchyChildAnchor & { lat: number; lon: number } =>
      isUsableCentroid(a.lat, a.lon),
  );
  const destinationCount = usable.length;
  // A single (or zero) usable destination can never illegibly "merge" —
  // nothing to narrow against.
  if (destinationCount <= 1) return fallback;

  // FOOTPRINT SOURCE — the SAME calibrated per-anchor footprints
  // (`destinationCardFootprint.ts`'s `estimateDestinationCardFootprint`,
  // baked in upstream by `useDiscoverCameraController.ts` when it builds
  // `hierarchyChildAnchors`) the render layer itself reduces to a single
  // conservative MAX width/height across the batch (see
  // `AreaMarkerLayer.tsx`'s "FOOTPRINT SOURCE" comment). NOT full parity,
  // though: this maxes only over `usable` (post `isUsableCentroid`
  // filtering above), while the render layer maxes over ALL children
  // regardless of centroid usability — a child with an unusable centroid
  // but the largest footprint makes this prediction UNDER-estimate relative
  // to what actually renders.
  const footprintWidthPx = Math.max(...usable.map((a) => a.footprintWidthPx));
  const footprintHeightPx = Math.max(...usable.map((a) => a.footprintHeightPx));

  const members: ClusterableDestination[] = usable.map((a, i) => ({
    identityKey: String(i),
    displayLabel: '',
    lat: a.lat,
    lon: a.lon,
    listingCount: 0,
    displayOrder: i,
    schoolCount: null,
  }));

  // ILLEGIBLE = fewer than half (rounded up, minimum 2) of the real
  // destinations survive as distinct, individually-selectable cards.
  const minLegibleCards = Math.max(2, Math.ceil(destinationCount / 2));

  const legibleZooms: number[] = [];
  // Track the argmax(cluster count) candidate across the loop. Cluster count
  // is monotone non-decreasing in zoom, so `legibleZooms.length < 2` can only
  // mean "at most the single tightest, most-collapsing zoom is legible" —
  // i.e. exactly the node this function exists to help. Falling back to the
  // UN-NARROWED `[minZoom, maxZoom]` on that branch (the old behaviour) hands
  // the resolver back the very window that produced the reported collapse.
  // `bestZoom` degrades toward the most-legible camera actually available
  // instead. Ties keep the SMALLEST zoom achieving the max count, so the
  // returned window is as wide as the data allows rather than collapsing to
  // a single point whenever possible.
  let bestZoom = Math.ceil(minZoom);
  let bestCount = -1;
  for (let zoom = Math.ceil(minZoom); zoom <= Math.floor(maxZoom); zoom += 1) {
    const project = (lat: number, lon: number) => projectAtZoom(lat, lon, zoom);
    const result = clusterAreaMembers(members, project, zoom, {
      footprintWidthPx,
      footprintHeightPx,
    });
    if (result.clusters.length > bestCount) {
      bestCount = result.clusters.length;
      bestZoom = zoom;
    }
    if (result.clusters.length >= minLegibleCards) legibleZooms.push(zoom);
  }

  // CONSTRAINT 2 — never narrow to empty or a single candidate UNLESS the
  // best-available zoom genuinely IS the only legible one (bestZoom === the
  // fallback's own maxZoom): degrade to the most-legible camera rather than
  // to the widest, un-narrowed range that reproduces the collapse.
  // `bestCount === -1` means the loop never ran at all (no integer zoom in
  // [minZoom, maxZoom]) — there is no candidate data to degrade toward, so
  // fall back to the caller's own un-narrowed window rather than risk
  // `bestZoom` (its pre-loop initial value) landing outside that window.
  if (bestCount === -1) return fallback;

  const legibilityNarrowed =
    legibleZooms.length < 2
      ? { minZoom: bestZoom, maxZoom }
      : { minZoom: Math.min(...legibleZooms), maxZoom: Math.max(...legibleZooms) };

  // CONTAINMENT OUTRANKS LEGIBILITY — see the module doc above. Only runs
  // when the caller supplies `usableViewport` (the real call site always
  // does; existing pure-legibility unit tests that omit it are unaffected).
  if (!usableViewport) return legibilityNarrowed;

  const usableRect = usableRectFromViewport(usableViewport);
  // Issue #1943 (Stage-B, LAST DEFECT — cluster-card containment gap) — the
  // raw-anchor containment check above (mirroring hierarchyCameraFit.ts's own
  // per-anchor `childZBase` search) only ever validates each RAW anchor's own
  // card rect. The render layer (`AreaMarkerLayer.tsx`) does not always draw
  // a raw anchor at its own position: a multi-member `clusterAreaMembers`
  // cell is drawn ONCE, at `cell.anchor` — a CENTROID of its members, a pixel
  // position no individual raw anchor occupies and that neither this
  // function's raw-anchor loop NOR `hierarchyCameraFit.ts`'s own childZBase
  // search (also raw-anchor-only, and forbidden to edit) ever evaluates. A
  // zoom can therefore look fully clip-free by the raw-anchor model while a
  // real cluster card, rendered at its members' centroid, clips for real.
  // This predicts the SAME per-zoom clustering the render layer will
  // actually produce (reusing the identical `members`/footprint this
  // function already computed for legibility above — never a second,
  // possibly-diverging clustering pass) and additionally requires every
  // MULTI-member cell's centroid card rect to be contained too. A
  // single-member cell renders at that one member's own raw position
  // (`centroidOf` of one point is that point) — already covered by the
  // raw-anchor loop, so it is skipped here to avoid a redundant check.
  const clusterAnchorsContained = (zoom: number, dx: number, dy: number): boolean => {
    const project = (lat: number, lon: number) => projectAtZoom(lat, lon, zoom);
    const result = clusterAreaMembers(members, project, zoom, { footprintWidthPx, footprintHeightPx });
    for (const cell of result.clusters) {
      if (cell.members.length <= 1) continue;
      const p = project(cell.anchor.lat, cell.anchor.lon);
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
      const rect = narrowingCardRectAt(p.x + dx, p.y + dy, footprintWidthPx, footprintHeightPx);
      if (!isNarrowingRectContained(rect, usableRect)) return false;
    }
    return true;
  };
  const containableZoom = largestContainableZoom(
    usable,
    projectAtZoom,
    usableRect,
    minZoom,
    maxZoom,
    clusterAnchorsContained,
  );

  // Nothing containable in range — widen back to the caller's own floor, not the raised one.
  if (containableZoom == null) return { minZoom, maxZoom: legibilityNarrowed.maxZoom };

  if (containableZoom < legibilityNarrowed.minZoom) {
    return { minZoom: containableZoom, maxZoom: legibilityNarrowed.maxZoom };
  }
  if (containableZoom > legibilityNarrowed.maxZoom) {
    return { minZoom: legibilityNarrowed.minZoom, maxZoom: containableZoom };
  }
  return legibilityNarrowed;
}

/**
 * Local mirror of `hierarchyCameraFit.ts`'s own bottom-centre card-rect and
 * centre-pinned-placement containment check (see that file's
 * "Card rect anchored bottom-centre..." comment for the anchoring contract
 * this must agree with). Duplicated rather than imported because that
 * module's rect helpers are intentionally private/unexported and the module
 * itself is forbidden to edit (Slice-A, calibrated) — this is READ-ONLY
 * agreement with its documented model, not a dependency on its internals.
 */
interface NarrowingRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const NARROWING_CONTAINMENT_EPS = 1e-6;

function narrowingCardRectAt(x: number, y: number, widthPx: number, heightPx: number): NarrowingRect {
  const halfW = widthPx / 2;
  return { left: x - halfW, right: x + halfW, top: y - heightPx, bottom: y };
}

function isNarrowingRectContained(inner: NarrowingRect, outer: NarrowingRect): boolean {
  return (
    inner.left >= outer.left - NARROWING_CONTAINMENT_EPS &&
    inner.right <= outer.right + NARROWING_CONTAINMENT_EPS &&
    inner.top >= outer.top - NARROWING_CONTAINMENT_EPS &&
    inner.bottom <= outer.bottom + NARROWING_CONTAINMENT_EPS
  );
}

function usableRectFromViewport(viewport: UsableViewportRect): NarrowingRect {
  return {
    left: viewport.insetLeftPx,
    right: viewport.widthPx - viewport.insetRightPx,
    top: viewport.insetTopPx,
    bottom: viewport.heightPx - viewport.insetBottomPx,
  };
}

/**
 * Largest integer zoom in `[minZoom, maxZoom]` at which EVERY anchor's own
 * card rect (bottom-centre anchored, its OWN per-anchor footprint — never
 * the MAX-reduced footprint the legibility prediction above uses, since this
 * must mirror `hierarchyCameraFit.ts`'s per-anchor `childZBase` check, not
 * the render layer's clustering) is fully contained inside `usableRect` once
 * the camera is centre-pinned on the anchors' arithmetic-mean centroid, AND
 * (when `clusterAnchorsContained` is supplied) every multi-member cluster
 * card the render layer would actually draw at that zoom is contained too
 * (see the call site's doc — a cluster centroid is a position no raw anchor
 * occupies and this function's own per-anchor loop can never check it).
 *
 * The cluster check is a PREFERENCE over raw-anchor-only containment, never
 * a veto that can make this return null where raw-anchor-only containment
 * alone would have returned a zoom: the two constraints are anti-correlated
 * (raw containment gets harder as zoom rises and anchors spread, while
 * multi-member cells — the only zooms the cluster check can reject — exist
 * precisely at the low zooms where raw containment is easiest), so "every
 * raw-contained zoom also has a clipping cluster card" is a real, reachable
 * regime, not a corner case. If no zoom satisfies both, fall back to the
 * largest zoom that satisfies raw-anchor containment alone, so this can
 * only ever IMPROVE on (never regress behind) the raw-anchor-only result.
 * Returns `null` only when no zoom in range achieves even raw-anchor-only
 * containment — this cannot invent a clip-free zoom where none exists.
 */
function largestContainableZoom(
  usable: readonly { lat: number; lon: number; footprintWidthPx: number; footprintHeightPx: number }[],
  projectAtZoom: (lat: number, lon: number, zoom: number) => { x: number; y: number },
  usableRect: NarrowingRect,
  minZoom: number,
  maxZoom: number,
  clusterAnchorsContained?: (zoom: number, dx: number, dy: number) => boolean,
): number | null {
  if (usable.length === 0) return null;
  const centreLat = usable.reduce((sum, a) => sum + a.lat, 0) / usable.length;
  const centreLon = usable.reduce((sum, a) => sum + a.lon, 0) / usable.length;
  const usableCentreX = (usableRect.left + usableRect.right) / 2;
  const usableCentreY = (usableRect.top + usableRect.bottom) / 2;

  // Largest zoom satisfying raw-anchor containment ALONE, tracked so the
  // cluster-card check below can never regress behind it — see the doc
  // above on why "cluster check vetoes every raw-contained zoom" is a real,
  // reachable regime rather than a corner case.
  let rawOnlyFallback: number | null = null;

  for (let zoom = Math.floor(maxZoom); zoom >= Math.ceil(minZoom); zoom -= 1) {
    const centreProjected = projectAtZoom(centreLat, centreLon, zoom);
    if (!Number.isFinite(centreProjected.x) || !Number.isFinite(centreProjected.y)) continue;
    const dx = usableCentreX - centreProjected.x;
    const dy = usableCentreY - centreProjected.y;

    let allContained = true;
    for (const a of usable) {
      const p = projectAtZoom(a.lat, a.lon, zoom);
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
        allContained = false;
        break;
      }
      const rect = narrowingCardRectAt(p.x + dx, p.y + dy, a.footprintWidthPx, a.footprintHeightPx);
      if (!isNarrowingRectContained(rect, usableRect)) {
        allContained = false;
        break;
      }
    }
    if (allContained) {
      if (!clusterAnchorsContained || clusterAnchorsContained(zoom, dx, dy)) return zoom;
      if (rawOnlyFallback === null) rawOnlyFallback = zoom;
    }
  }
  return rawOnlyFallback;
}

function AreaPanner({
  panToArea,
  bottomOcclusionPx = 0,
}: {
  panToArea?:
    | (AreaPoint & {
        seq?: number;
        reason?: AreaPanReason;
        consumedSeqRef?: MutableRefObject<number>;
        hierarchyChildAnchors?: HierarchyChildAnchor[] | null;
      })
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

    // Issue #2143 (PR follow-up, third defect) — mobile List<->Map toggle
    // real-unmounts/remounts the whole map (DiscoverMapMount returns null in
    // List view). Two distinct problems on that remount path, both
    // confirmed live with instrumentation:
    //
    // (a) Leaflet's DEFAULT animated fitBounds/flyTo silently fails to
    //     complete on a just-attached container — `map.getCenter()`/
    //     `getZoom()` showed ZERO change even seconds after the call,
    //     although `map.getSize()` and the bbox/options passed in were all
    //     correct. `animate: false` (the same pattern URLViewportController
    //     already uses for its own programmatic viewport restore, "to
    //     avoid intermediate moveend events") makes the write apply
    //     synchronously and reliably instead.
    // (b) Belt-and-braces: if this effect's ONE fit opportunity ever DOES
    //     fire while the container is still genuinely 0x0 (a real
    //     `getSize()` reading of zero — a distinct Leaflet pitfall from (a)
    //     that `MapContainerResizeSync`'s ResizeObserver/invalidateSize
    //     (issue #2049) is designed to detect but never retries the
    //     ORIGINAL fitBounds/flyTo target for), the seq must NOT be marked
    //     consumed — only the branch that actually writes to a live, sized
    //     map may consume it. `map.getSize` is guarded — test stubs that
    //     omit it are treated as always-ready (unchanged pre-existing test
    //     behaviour); real Leaflet always has it.
    const isMapSized = (): boolean => {
      if (typeof map.getSize !== 'function') return true;
      const size = map.getSize();
      return size.x > 0 && size.y > 0;
    };

    const applyFit = () => {
      // Issue #1943 Slice B — hierarchy camera-fit branch. Reuses this
      // effect's OWN seq gate / isMapSized() check / 0x0 resize retry
      // unchanged (this leading branch lives INSIDE applyFit for exactly
      // that reason). A NULL resolver result, or a non-null result whose
      // chosen candidate still clips, falls through to today's fitBounds
      // block verbatim, below, unmodified.
      if (panToArea.reason === 'canonicalNode' && panToArea.hierarchyChildAnchors?.length) {
        const viewportWidthPx = typeof window !== 'undefined' ? window.innerWidth : undefined;
        const [padH, padV] = computeCameraPadding(viewportWidthPx);
        // Issue #1943 Slice B (code review fix 2) — read `map.getSize()`
        // directly. Safety here is PLATFORM-guaranteed, not gate-guaranteed:
        // real Leaflet always defines `getSize`. Note `isMapSized()` above
        // does NOT establish that — it returns true precisely when `getSize`
        // is absent; what it does establish is a non-zero size when present.
        // A window.innerWidth/innerHeight fallback would substitute a
        // DIFFERENT geometry (viewport, not container) and must never be
        // reached in production.
        const size = map.getSize();
        // Issue #1943 Slice B (mobile double-count warning) — do NOT add
        // MOBILE_LISTING_PREVIEW_OCCLUSION_PX here: the mobile preview sheet
        // already physically clips the Leaflet container, so `map.getSize()`
        // is already occlusion-corrected. `bottomOcclusionPx` (the proactive
        // signal this effect already reserves for the bbox path below) is
        // the only additional inset needed.
        const usableViewport: UsableViewportRect = {
          widthPx: size.x,
          heightPx: size.y,
          insetTopPx: padV,
          insetRightPx: padH,
          insetBottomPx: padV + bottomOcclusionPx,
          insetLeftPx: padH,
        };
        // Issue #1943 Slice B (code review fix 1) — containmentBounds is
        // size-only and position-insensitive (see hierarchyCameraFit.ts's
        // module doc): passing the node's own bbox here can only pull
        // zBase DOWN, never up. Without it, a canonical node with one
        // child (or several tightly-coincident children) has a near-zero
        // child-rect footprint, so zBase climbs straight to the clamp and
        // the camera lands on a meaningless pinpoint instead of framing
        // the node's real geographic extent.
        const nodeBbox = panToArea.bbox;
        // Issue #1943 (Slice B+C merge, item 5 — the open Slice-B minZoom
        // floor) — the flat LEAF_FIT_MIN_ZOOM (13) constant CLIPS: the
        // merged-scope diagnostic proved neither Udupi's nor Bangalore's
        // datasets have a single zoom in [13,16] that is simultaneously
        // clipped==0 and pairs==0. The principled floor is the
        // fitBounds-equivalent CONTAINMENT zoom for this node — the largest
        // zoom at which the node's own envelope (its stored bbox, or, when
        // it has none — e.g. Udupi's synthetic root — the union of its
        // direct children's own lat/lon) still fits the CURRENT container.
        // That zoom, by construction, contains every child, so it is a safe
        // lower bound to start the resolver's candidate search from — never
        // `map.getMinZoom()` raw (0 on this production-configured
        // MapContainer), which would let the resolver pick an absurdly wide
        // camera whose zero collisions are an artefact of everything being
        // tiny. `map.getBoundsZoom` is Leaflet's OWN containment-zoom
        // routine (never hand-rolled), mirroring the `map.project` rule just
        // below. Falls back to LEAF_FIT_MIN_ZOOM only when no usable
        // envelope exists at all (no bbox AND no anchors with a lat/lon).
        //
        // Issue #1943 (remaining scope, "useful-first root/structural
        // presentation") — the ANCHOR extent is now preferred over
        // `nodeBbox`, falling back to `nodeBbox` only when the anchors'
        // own spread is degenerate (0-1 usable anchor, or every anchor
        // coincident). This mirrors hierarchyCameraFit.ts's own
        // "fallback only, not a co-equal floor" fix to the SAME anti-
        // pattern one call downstream: `nodeBbox` is the union of every
        // DESCENDANT area's full extent — several levels below what is
        // actually rendered at this level — and has no on-screen
        // representation at all, while the anchors are the EXACT
        // positions the destination cards are painted at
        // (AreaMarkerLayer.tsx reads the same `centreLat`/`centreLon`).
        // Framing the camera to the invisible bbox instead of the visible
        // cards systematically over-zooms-out, which is precisely the
        // "unnecessary declutter" defect this slice fixes. `nodeBbox`
        // remains the fallback for the one case anchors alone cannot
        // describe a real extent for — a single child, or several
        // tightly-coincident ones — which is the same degenerate
        // signature this file's own over-zoom guard (just above) already
        // exists to protect against.
        const anchorLatLngs: [number, number][] = panToArea.hierarchyChildAnchors
          .filter(
            (anchor): anchor is HierarchyChildAnchor & { lat: number; lon: number } =>
              anchor.lat != null && anchor.lon != null,
          )
          .map((anchor) => [anchor.lat, anchor.lon] as [number, number]);
        const isAnchorSpreadDegenerate =
          anchorLatLngs.length < 2 ||
          (anchorLatLngs.every(([lat]) => lat === anchorLatLngs[0][0]) &&
            anchorLatLngs.every(([, lon]) => lon === anchorLatLngs[0][1]));
        const envelopeLatLngs: [number, number][] = isAnchorSpreadDegenerate
          ? nodeBbox
            ? [nodeBbox[0], nodeBbox[1]]
            : anchorLatLngs
          : anchorLatLngs;
        let derivedMinZoom = LEAF_FIT_MIN_ZOOM;
        // Issue #2314 — `getBoundsZoom` below only ever sees LAT/LON POINTS
        // (`envelopeLatLngs`), so left unmodified this floor is a
        // dimensionless-point containment zoom: it has no allowance for the
        // actual rendered destination-card footprint, and is therefore
        // systematically ~1 zoom level too high relative to what a camera
        // fit that accounts for real card pixel size could achieve.
        // `panToArea.hierarchyChildAnchors` already carries each anchor's
        // own `footprintWidthPx`/`footprintHeightPx` (calibrated upstream by
        // `useDiscoverCameraController.ts` via the SAME
        // `estimateDestinationCardFootprint` the resolver itself uses — see
        // that module's own over-estimating, "never under" safe-direction
        // doc), so reuse it rather than re-deriving card size here. Cards
        // anchor bottom-centre at their point (`cardRectAt`,
        // hierarchyCameraFit.ts:237-240: `translate(-50%,-100%)`), i.e. a
        // card extends `±widthPx/2` horizontally and the FULL `heightPx`
        // upward — never below. Since Leaflet's `getBoundsZoom` padding is a
        // single symmetric inset per dimension (not edge-selective, see the
        // FIX 2 comment just below), the max footprint's full width and full
        // height are folded into the horizontal/vertical padding totals so
        // the worst-case card — whichever anchor happens to sit at the
        // envelope's edge — is guaranteed room, general across any city's
        // node shape (no hard-coded city or zoom value).
        let maxFootprintWidthPx = 0;
        let maxFootprintHeightPx = 0;
        for (const anchor of panToArea.hierarchyChildAnchors) {
          if (anchor.lat == null || anchor.lon == null) continue;
          maxFootprintWidthPx = Math.max(maxFootprintWidthPx, anchor.footprintWidthPx);
          maxFootprintHeightPx = Math.max(maxFootprintHeightPx, anchor.footprintHeightPx);
        }
        // Guarded the same way `isMapSized()` guards `map.getSize` above:
        // real Leaflet always defines both `L.latLngBounds` and
        // `map.getBoundsZoom`; a test double that omits either falls back to
        // the flat LEAF_FIT_MIN_ZOOM floor rather than throwing.
        if (
          envelopeLatLngs.length > 0 &&
          typeof L.latLngBounds === 'function' &&
          typeof map.getBoundsZoom === 'function'
        ) {
          const envelopeBounds = L.latLngBounds(envelopeLatLngs);
          // Issue #1943 (Slice B, code review cycle 2, FIX 3) — a degenerate
          // (zero-span) envelope — no bbox and coincident/near-coincident
          // anchors — makes `getBoundsZoom` return the map's own maximum
          // zoom, which then clamps `derivedMinZoom` straight to
          // LEAF_FIT_MAX_ZOOM. That collapses the resolver's candidate
          // window to a single zoom (minZoom === maxZoom), a regression from
          // the previous [LEAF_FIT_MIN_ZOOM, LEAF_FIT_MAX_ZOOM] search range.
          // Skip the derivation entirely in that case and keep the flat
          // LEAF_FIT_MIN_ZOOM floor, preserving a real search window.
          const isDegenerateEnvelope =
            envelopeBounds.isValid() &&
            envelopeBounds.getNorth() === envelopeBounds.getSouth() &&
            envelopeBounds.getEast() === envelopeBounds.getWest();
          if (envelopeBounds.isValid() && !isDegenerateEnvelope) {
            // Issue #1943 (Slice B, code review cycle 3, F2) — Leaflet's
            // `getBoundsZoom(bounds, inside, padding)` subtracts `padding`
            // from the container ONCE, in full (leaflet-src.js:3980-3987);
            // its own `fitBounds` caller sums paddingTL + paddingBR before
            // passing it in (leaflet-src.js:3370-3373). So this padding
            // argument must equal the resolver's TOTAL inset, not one
            // edge's share of it: the resolver's usableViewport insets by
            // padH on BOTH left and right, and by padV on top plus
            // (padV + bottomOcclusionPx) on the bottom, so the total inset
            // is 2*padH horizontally and 2*padV + bottomOcclusionPx
            // vertically. Passing only the bottom-right half (the previous
            // code) under-pads the computation, which can return a zoom one
            // level too high and clip the envelope. Mirrors this file's own
            // `fitBounds` call further down in this same effect, which achieves
            // the same total by passing `paddingTopLeft`/`paddingBottomRight`
            // separately and letting Leaflet sum them. Issue #2314 —
            // `maxFootprintWidthPx`/`maxFootprintHeightPx` (computed above)
            // extend this same total inset with the worst-case card
            // footprint, so the floor accounts for real card pixel size
            // instead of treating anchors as dimensionless points.
            const chromePadX = padH * 2;
            const chromePadY = padV * 2 + bottomOcclusionPx;
            const footprintPaddedX = chromePadX + maxFootprintWidthPx;
            const footprintPaddedY = chromePadY + maxFootprintHeightPx;
            // Issue #2413 — on a narrow mobile viewport, `footprintPaddedX`
            // (two horizontal chrome insets plus a worst-case card's own
            // full width) can meet or exceed the container's actual width —
            // routine once several sibling root destinations are in play,
            // since a single card's footprint alone is comparable to a
            // phone's viewport width. Leaflet's `getBoundsZoom` has no
            // defense against the resulting non-positive "padded size":
            // `size.subtract(padding)` goes zero/negative, its internal
            // scale computation degenerates, and it silently returns the
            // map's own `maxZoom` instead of a real containment floor — the
            // SAME failure mode the `isDegenerateEnvelope` guard above
            // defends against, via a different trigger (padding-vs-
            // container, not anchor spread). That bogus ceiling then got
            // clamped to `LEAF_FIT_MAX_ZOOM` and adopted as `derivedMinZoom`,
            // collapsing `narrowToLegibleZoomWindow`'s candidate window to a
            // single degenerate zoom regardless of the anchors' real
            // placement — reproduced live at 390x844: a Bangalore root fit
            // with 5 well-separated destinations landed on zoom=16
            // (LEAF_FIT_MAX_ZOOM), clipping every one of them.
            //
            // Fall back to chrome-only padding (still a REAL geometry-
            // derived containment zoom, just without the worst-case-
            // footprint over-estimate this specific container cannot
            // structurally accommodate) whenever the footprint-padded size
            // would be non-positive on either axis. `resolveHierarchyCameraFit`'s
            // own per-anchor card-rect placement below still does the
            // precise, footprint-aware containment/overlap check against the
            // real `usableViewport` — this is only the coarse starting
            // floor, never the final legibility decision.
            const useFootprintPadding =
              size.x - footprintPaddedX > 0 && size.y - footprintPaddedY > 0;
            const paddingPoint = useFootprintPadding
              ? L.point(footprintPaddedX, footprintPaddedY)
              : L.point(chromePadX, chromePadY);
            if (size.x - paddingPoint.x > 0 && size.y - paddingPoint.y > 0) {
              const containmentZoom = map.getBoundsZoom(envelopeBounds, false, paddingPoint);
              if (Number.isFinite(containmentZoom)) {
                derivedMinZoom = Math.max(0, Math.min(Math.floor(containmentZoom), LEAF_FIT_MAX_ZOOM));
              }
            }
          }
        }
        // Issue #1943 (Stage-B rework, TASK 1 "A-containable") — narrow the
        // resolver's own candidate window to exclude zooms that would be
        // illegible AFTER the render layer's clusterAreaMembers merge pass.
        // See narrowToLegibleZoomWindow's doc above for why this closes the
        // resolver/clusterer feedback gap without touching
        // hierarchyCameraFit.ts. Never narrows to empty/one candidate —
        // falls back to [derivedMinZoom, LEAF_FIT_MAX_ZOOM] unnarrowed.
        const narrowedWindow = narrowToLegibleZoomWindow(
          panToArea.hierarchyChildAnchors,
          (lat, lon, zoom) => map.project([lat, lon], zoom),
          derivedMinZoom,
          LEAF_FIT_MAX_ZOOM,
          usableViewport,
        );
        const hierarchyResult = resolveHierarchyCameraFit({
          anchors: panToArea.hierarchyChildAnchors,
          containmentBounds: nodeBbox
            ? {
                south: nodeBbox[0][0],
                west: nodeBbox[0][1],
                north: nodeBbox[1][0],
                east: nodeBbox[1][1],
              }
            : null,
          viewport: usableViewport,
          // Issue #1943 Slice B (risk R5) — Leaflet's OWN projection,
          // literally. Never hand-roll a Mercator here.
          project: (lat, lon, zoom) => map.project([lat, lon], zoom),
          minZoom: narrowedWindow.minZoom,
          maxZoom: narrowedWindow.maxZoom,
        });
        // Issue #1943 (Slice B, reroute cycle 2, OPTION 2) used to discard
        // any `chosen` candidate that still clipped, because the pre-#2312
        // score weighted clipping only by COUNT — once every candidate in
        // the window clipped, that term saturated identically across all of
        // them and `chosen` degenerated to whichever candidate had the
        // fewest pairs, with no signal for how far off-screen it actually
        // was. Issue #2312 fixed the score itself (added `clipOverflowPx`,
        // a magnitude-aware overflow term — see hierarchyCameraFit.ts's
        // module doc), so `chosen` is now a genuine best-of-window pick even
        // when it still clips: strictly better than the coarse fitBounds
        // fallback below, which has no concept of per-card containment at
        // all. Commit it unconditionally rather than re-discarding a result
        // the resolver already ranked correctly.
        if (hierarchyResult) {
          map.setView(hierarchyResult.centre, hierarchyResult.zoom, { animate: false });
          return;
        }
        // The resolver returned null (no usable anchors after filtering):
        // fall through to today's fitBounds/flyTo block below, verbatim.
      }
      if (panToArea.bbox) {
        // Issue #1069: a synthetic group-bounds AreaPoint (from computeGroupBounds)
        // can fit at a zoom level above AREA_PANNER_GROUP_MAX_ZOOM for narrow groups,
        // which then trips MapDiscovery's zoom-band gate and hides the area markers
        // the user was meant to see. Clamp group fits to the area-layer threshold.
        // This clamp is OUTSIDE the seq/adopt gate and applies whenever a
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
          // Issue #2143 (PR follow-up) — see rationale (a) above.
          animate: false,
        });
      } else {
        map.flyTo([panToArea.geo_center_lat, panToArea.geo_center_lon], LEAF_FIT_MIN_ZOOM, {
          animate: false,
        });
      }
    };

    const seq = panToArea.seq;
    const consumedSeqRef = seq != null ? (panToArea.consumedSeqRef ?? localFallbackSeqRef) : null;
    const isSuperseded = () => consumedSeqRef != null && seq != null && seq <= consumedSeqRef.current;
    const consume = () => {
      if (consumedSeqRef != null && seq != null) consumedSeqRef.current = seq;
    };

    if (isSuperseded()) return;

    if (isMapSized()) {
      consume();
      applyFit();
      return;
    }

    // Container not ready — do NOT consume the seq. Retry once on the next
    // real Leaflet resize; re-check both readiness and the seq guard at
    // that point (a newer panToArea/seq may have superseded this one in
    // the meantime, e.g. a fast second navigation before the container
    // ever settled).
    const handleResize = () => {
      if (!isMapSized()) return;
      map.off('resize', handleResize);
      if (isSuperseded()) return;
      consume();
      applyFit();
    };
    map.on('resize', handleResize);
    return () => map.off('resize', handleResize);
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
  navigationNodeKey,
  isColdNavigate,
}: {
  initialCenter?: [number, number];
  initialZoom?: number;
  historyAction?: string;
  navigationNodeKey?: string | null;
  isColdNavigate?: boolean;
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

    // Issue #2143 (PR follow-up) — a (re)mount (isFirstRender still true;
    // this component genuinely remounts on the mobile List<->Map toggle's
    // real unmount/remount of the whole map, not just the page's initial
    // load) whose viewport is a COLD canonical-node transition must NOT
    // apply this raw, possibly-stale/foreign URL viewport at all: the
    // useDiscoverCameraOrchestration fit-once effect (AreaPanner) already
    // owns that exact transition and will fit fresh to the node's own
    // bounds. Applying it here first would either get silently overwritten
    // a moment later (harmless but wasteful) or — since AreaPanner's fit
    // depends on an async node-bounds resolution while this effect is
    // synchronous — LAND AFTER it and clobber the correct fit with the
    // stale viewport, a non-deterministic race (confirmed live: repeated
    // identical cold `node=` loads sometimes fit correctly, sometimes
    // stayed pinned at the URL's stale zoom with markers off-screen).
    // Every other case is unchanged: no node in play at all (a plain
    // viewport-only deep link, #2125's original intent) still applies
    // unconditionally on mount; a genuine restore/reload/back-forward
    // (isColdNavigate false) is correct to trust here since AreaPanner
    // won't be firing a competing fit for it either.
    if (isFirstRender.current && navigationNodeKey != null && isColdNavigate) {
      isFirstRender.current = false;
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
  }, [initialCenter, initialZoom, map, historyAction, navigationNodeKey, isColdNavigate]);

  return null;
}

function MapController({
  selectedListing,
  focusBounds,
  cityCenter,
  cityZoom,
  resetMapTick,
  cameraIntent,
  isDestinationClusterLevel,
  isClusterDrillIntentRef,
}: {
  selectedListing?: PropertyListing | null;
  focusBounds?: [[number, number], [number, number]] | null;
  cityCenter?: [number, number];
  cityZoom?: number;
  resetMapTick?: number;
  cameraIntent?: CameraIntent | null;
  /**
   * Issue #1943 (Stage-B rework, TASK 2 "Option B") — true only while the
   * canonical Areas hierarchy is showing its 'clusters'/'directions' level
   * (a destination CLUSTER card, never a real AREA/listing). Widens the
   * 'overview' framing's zoom ceiling below (from AREA_LAYER_MAX_ZOOM to
   * LEAF_FIT_MAX_ZOOM) for exactly that context, so a cluster-card drill-in
   * click can actually reach a zoom that decomposes it, instead of
   * recentring at a capped zoom that never separates the members.
   *
   * SAFE to widen only here: `deriveDiscoverScopeKind`
   * (useDiscoverMapData.ts) — the sole gate on `markersEnabled` — returns
   * 'city' whenever no legacy areaKey/groupId/scope URL param is set, which
   * is always true while browsing the node-key-based 'clusters'/'directions'
   * hierarchy levels (they never set those legacy params). So a zoom above
   * AREA_LAYER_MAX_ZOOM reached HERE cannot flip markersEnabled true or
   * trigger any correlated listings refit — the exact hazard the
   * surrounding suppression comment below documents for the general
   * 'overview' case remains structurally impossible in this one context.
   */
  isDestinationClusterLevel?: boolean;
  /**
   * Issue #1943 (Stage-B fix-cycle — cluster drill-in never zooms out). Set
   * to true by PropertyMap's `handleAreaVisualClusterCameraIntent` wrapper
   * immediately before it forwards a destination-cluster-card click to the
   * real `onAreaVisualClusterCameraIntent` publisher (which synchronously
   * bumps `cameraIntent.seq`), and read-then-reset the moment this effect
   * processes that intent below — so the "always zoom in" clamp applies to
   * EXACTLY the click that armed it, never to a later, unrelated 'overview'
   * intent that happens to arrive while `isDestinationClusterLevel` is still
   * true (that broader flag covers the whole 'clusters'/'directions'
   * navigation level, not just the instant of a cluster-card click).
   */
  isClusterDrillIntentRef?: MutableRefObject<boolean>;
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
      //
      // Issue #1943 (Stage-B rework, TASK 2 "Option B") — `overviewMaxZoom`
      // is AREA_LAYER_MAX_ZOOM for every 'overview' intent EXCEPT a
      // destination-cluster-card drill-in click (see
      // `isDestinationClusterLevel`'s doc on this component's props for why
      // widening the ceiling there is safe). Every other 'overview' producer
      // (macro-region pin, legacy area-group chip) is unaffected — this
      // widens the ceiling ONLY while `isDestinationClusterLevel` is true.
      const overviewMaxZoom = isDestinationClusterLevel ? LEAF_FIT_MAX_ZOOM : AREA_LAYER_MAX_ZOOM;

      // Issue #1943 (Stage-B fix-cycle — cluster drill-in never zooms out).
      // isClusterDrillIntent is read-then-reset here so it applies to EXACTLY
      // this intent, never a later one. Raising overviewMaxZoom to
      // LEAF_FIT_MAX_ZOOM above PERMITS a closer fit but does not FORCE one —
      // fitBounds/flyTo on the members' own bounds can legitimately compute a
      // zoom at or below the current one (wide member bounds relative to the
      // viewport, or near-coincident members). For every OTHER 'overview'
      // producer (macro-region pin, legacy area-group chip) that is correct:
      // it is simply the pin's own natural fit. For a cluster-card drill-in
      // click it actively makes things worse — the bubble stays collapsed and
      // whatever else was on screen gets zoomed OUT from under it. Scoped to
      // isClusterDrillIntent ONLY; every other 'overview' intent falls
      // through to the unmodified fitBounds/flyTo(maxZoom) below.
      const isClusterDrillIntent = isClusterDrillIntentRef?.current === true;
      if (isClusterDrillIntentRef) {
        isClusterDrillIntentRef.current = false;
      }

      if (isClusterDrillIntent) {
        const currentZoom = map.getZoom();
        const center = cameraIntent.bounds
          ? L.latLngBounds(cameraIntent.bounds).getCenter()
          : L.latLng(cameraIntent.center[0], cameraIntent.center[1]);
        if (currentZoom >= overviewMaxZoom) {
          // Already at the ceiling — there is no room left to drill in
          // further. Explicit no-op (recenter only, no zoom change) rather
          // than silently falling through to the unmodified fit below, which
          // could compute a zoom at or below currentZoom and reproduce the
          // exact "drill-in that doesn't drill in" bug this fix exists to
          // close.
          map.panTo(center);
        } else {
          const rawZoom = cameraIntent.bounds
            ? map.getBoundsZoom(cameraIntent.bounds, false, L.point(paddingX, paddingY))
            : overviewMaxZoom;
          // Issue #1943 (Stage-B fix-cycle — code-reviewer HIGH finding).
          // Two properties are both required here, and they are in tension:
          //   (1) FORWARD PROGRESS — a cluster-card click must ALWAYS zoom
          //       IN: strictly greater than the zoom at click time, never
          //       equal, never below (b3a430db's original bug: a click at
          //       13 produced 12).
          //   (2) CONTAINMENT — the target must not exceed rawZoom, the
          //       largest zoom at which the CLICKED CLUSTER'S OWN MEMBERS
          //       still fit their padded bounds. rawZoom is a HARD CEILING,
          //       never just a floor competitor with currentZoom + 1. The
          //       previous `Math.min(overviewMaxZoom, Math.max(currentZoom +
          //       1, rawZoom))` treated "+1" as a guarantee that competed
          //       with rawZoom via Math.max — so whenever rawZoom was <=
          //       currentZoom, the clamp forced the camera to currentZoom + 1
          //       anyway, past the members' own containment fit, clipping
          //       member anchors off-screen. This mirrors exactly why the
          //       sibling 'cluster' framing branch above (Issue #1762
          //       fix-cycle 10/11) removed the identical construct and made
          //       its own padded rawZoom a hard ceiling.
          //
          //       Scope of that bug, stated precisely because an earlier
          //       draft of this comment overstated it: map zoom here is
          //       INTEGER-only (MapContainer sets no zoomSnap/zoomDelta, so
          //       Leaflet defaults to zoomSnap = 1 — see zoomPolicy.ts:47-48),
          //       and `getBoundsZoom` floors to that snap. With integer inputs
          //       the old and new expressions agree on every REACHABLE input,
          //       so this rewrite is a clarity and honesty fix, NOT a
          //       behaviour change. The fractional handling below is
          //       forward-compatibility should zoomSnap ever change; note that
          //       if it did, `setView` -> `_limitZoom` would round a
          //       fractional target back down, which could silently cost the
          //       forward progress property (1) guarantees.
          //
          // When rawZoom > currentZoom, both properties hold at once:
          // min(overviewMaxZoom, rawZoom) is a real containment fit AND
          // strictly greater than currentZoom (overviewMaxZoom is already
          // known > currentZoom here, via the ceiling check above).
          //
          // When rawZoom <= currentZoom, the members do not fit any better
          // above the current zoom than they already do at it — there is no
          // zoom > currentZoom anywhere that is both a real fit and forward
          // progress. Property (1) wins here: the click must still do
          // something visible, so the camera advances exactly one level.
          // This is a DELIBERATE, NAMED exception — containment is NOT
          // guaranteed on this branch, and one or more of the cluster's own
          // members may render outside the frame. (Separately: rawZoom
          // itself is computed by passing one edge's padding share to
          // `getBoundsZoom`, which subtracts it once in full — this file's
          // pre-existing F2 convention, shared with the 'leaf'/'cluster'
          // branches — so rawZoom already runs slightly optimistic before
          // this reasoning is even applied.)
          const targetZoom =
            rawZoom > currentZoom
              ? Math.min(overviewMaxZoom, rawZoom)
              : Math.min(overviewMaxZoom, currentZoom + 1);
          map.setView(center, targetZoom, { animate: true });
        }
      } else if (cameraIntent.bounds) {
        map.fitBounds(cameraIntent.bounds, { padding: [paddingX, paddingY], maxZoom: overviewMaxZoom });
      } else {
        map.flyTo(cameraIntent.center, overviewMaxZoom);
      }
    } else if (cameraIntent.framing === 'cluster') {
      // Issue #1762 — listing-cluster tap fit-to-members. Mirrors the 'leaf'
      // branch's bounds->zoom computation (same getBoundsZoom + responsive
      // padding), with the ceiling CLUSTER_DISABLE_AT_ZOOM (16, where
      // leaflet.markercluster itself stops clustering) rather than the fixed
      // [13,16] leaf band. Deliberately does NOT arm
      // suppressForSeqRef/suppressArmedAtRef above (that guard only checks
      // `=== 'leaf'`, so this branch is already excluded) — a cluster tap
      // never changes scope/node/filters, so there is no correlated
      // network-driven refit for the suppression to swallow.
      //
      // Issue #1762 fix-cycle 10 (WORKDONE_REVIEW BLOCKING_PARTIAL) — this
      // PADDED getBoundsZoom call is the sole authority on how far the
      // camera may actually advance. The previous
      // `Math.max(currentZoom + 1, rawZoom)` floor treated "+1" as a hard
      // guarantee that a tap always zooms in, which could push targetZoom
      // PAST what the padded viewport fits whenever padding cost more than
      // one zoom level versus MarkerClusterLayer's handleClusterActivate
      // unpadded pre-check (line ~2140) — clipping one or more of the
      // tapped cluster's own members off-screen. rawZoom (capped at
      // CLUSTER_DISABLE_AT_ZOOM) is now a hard ceiling, never just a floor
      // competitor: the target zoom only ever advances up to that capped
      // value, and — per #1762's explicit allowance that a cluster unable
      // to split while keeping all members inside the usable viewport may
      // remain clustered — falls back to a same-zoom re-center (no forced
      // zoom-in) when the padded fit doesn't justify advancing past the
      // current zoom. Does NOT duplicate this padding policy in
      // MarkerClusterLayer's cheap unpadded clusterCanSplit pre-check
      // (still used there only to decide whether to publish a CameraIntent
      // at all); this branch remains the single authoritative padded-fit
      // decision.
      //
      // Issue #1762 fix-cycle 11 (PR reviewer BLOCKING, narrowed) — holding
      // at currentZoom when cappedRawZoom < currentZoom is not a true fit:
      // the tapped cluster's members are only guaranteed to fit the usable
      // viewport at cappedRawZoom, not at currentZoom. Calling setView at
      // currentZoom in that case presents an unverified zoom as if it were
      // the authoritative padded fit. Per the reviewer's narrowed ask
      // ("perform that fit, or decline/no-op the action before moving it"),
      // this declines the camera action entirely (no setView, no re-center)
      // rather than mandate a zoom-out — whether a cluster tap should ever
      // zoom the camera OUT remains a separate, deliberately-deferred
      // product/backlog decision.
      if (cameraIntent.bounds) {
        const rawZoom = map.getBoundsZoom(cameraIntent.bounds, false, L.point(paddingX, paddingY));
        const currentZoom = map.getZoom();
        const cappedRawZoom = Math.min(CLUSTER_DISABLE_AT_ZOOM, rawZoom);
        if (cappedRawZoom < currentZoom) {
          // Padded fit is below the current zoom — holding at currentZoom
          // (or advancing) would not be a verified fit. Decline the camera
          // action: no setView, no camera movement at all for this intent.
          return;
        }
        const targetZoom = cappedRawZoom;
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

// Issue #2382 — MarkerClusterLayer (residential markers + clustering),
// AgriMarkerClusterLayer + AgriPolygonLayer (agri Level-3 parcels +
// polygons), AgriDestinationMarkerLayer (agri Level-2 destinations), and
// the school circle/radius overlay were extracted verbatim out of this
// file into src/components/map/layers/ (page-health follow-up from
// #2296). See the imports at the top of this file — PropertyMap keeps
// only map composition, shared state ownership, and wiring these layers
// via props.

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
  navigationNodeKey,
  isColdNavigate,
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
  areaSetCandidateKeys,
  onAreaSetCandidateSelect,
  areaSetAtMax = false,
  areasNavigationJourney = null,
  hoveredNavigationNodeKey = null,
  onNavigationNodeHoverChange,
  focusedClusterMemberAreaKeys = null,
  onClusterFocusChange,
  onAreaVisualClusterCameraIntent,
  autoAdvanceSelectNode,
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
  agriDestinationMarkers = null,
  onSelectAgriDestination,
  sectorOverlay = null,
  selectedListingId,
  hoveredListingId,
  schoolZoneLabels,
  onSelectZone,
  onMarkerClickWithPosition,
  onMarkerClusterCameraIntent,
}: PropertyMapProps) {
  // Issue #1943 (Stage-B fix-cycle — cluster drill-in never zooms out) — a
  // ref, not state: it must be readable synchronously inside MapController's
  // cameraIntent effect on the very same commit the click produced, with no
  // extra render in between. Set to true for exactly one cameraIntent
  // (immediately before invoking the real onAreaVisualClusterCameraIntent
  // below, which synchronously bumps cameraIntent's seq) and consumed
  // (read-then-reset) by MapController the moment it processes that intent —
  // never left armed for a LATER, unrelated 'overview' intent. Narrower than
  // `isDestinationClusterLevel`: that flag is true for the whole
  // 'clusters'/'directions' navigation level, not just the instant of a
  // cluster-card click, so keying the "always zoom in" clamp off it alone
  // would also force a zoom-in on some other 'overview' producer that
  // happened to fire while browsing that level. This ref ties the clamp to
  // the actual click, not the ambient level.
  const isClusterDrillIntentRef = useRef(false);
  const handleAreaVisualClusterCameraIntent = useCallback<
    NonNullable<PropertyMapProps['onAreaVisualClusterCameraIntent']>
  >(
    (bounds, center) => {
      isClusterDrillIntentRef.current = true;
      onAreaVisualClusterCameraIntent?.(bounds, center);
    },
    [onAreaVisualClusterCameraIntent],
  );

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
        <URLViewportController
          initialCenter={initialCenter}
          initialZoom={initialZoom}
          historyAction={historyAction}
          navigationNodeKey={navigationNodeKey}
          isColdNavigate={isColdNavigate}
        />
        <MapController
          selectedListing={selectedListing}
          focusBounds={focusBounds}
          cityCenter={cityCenter}
          cityZoom={cityZoom}
          resetMapTick={resetMapTick}
          cameraIntent={cameraIntent}
          isDestinationClusterLevel={
            areasNavigationJourney?.levelKind === 'clusters' ||
            areasNavigationJourney?.levelKind === 'directions' ||
            // Issue #1943 (owner repro, 2026-08-28) — the 'areas' level's own
            // multi-group visual-cluster card (AreaMarkerLayer.tsx's second
            // `makeAreaVisualClusterCard` call site) fires the exact same
            // `onAreaVisualClusterCameraIntent` -> `handleAreaVisualClusterCameraIntent`
            // drill-in intent as the 'clusters'/'directions' level's card. Excluding
            // 'areas' here left `overviewMaxZoom` clamped to AREA_LAYER_MAX_ZOOM (12)
            // for it — and because the AREA-level hierarchy routinely sits at or above
            // zoom 12 already (unlike the shallower 'clusters'/'directions' levels this
            // flag was written for), the "already at the ceiling" branch below fired on
            // the very first click, so the intent could only ever pan, never zoom in.
            // A single click did nothing visible; only Leaflet's native dblclick-zoom
            // (a completely separate code path) actually revealed the members. The
            // `deriveDiscoverScopeKind` safety argument on this prop's doc comment
            // applies identically here: 'areas' is the same node-key-based hierarchy
            // level (still driven by `node=`, never the legacy areaKey/groupId/scope
            // params), so widening the ceiling for it is exactly as safe as it already
            // is for 'clusters'/'directions'.
            areasNavigationJourney?.levelKind === 'areas'
          }
          isClusterDrillIntentRef={isClusterDrillIntentRef}
        />
        <ZoomWatcher onZoomChange={onZoomChange} />
        <ViewportWatcher onViewportChange={onViewportChange} />
        <BoundsWatcher onBoundsChange={onBoundsChange} />
        <AreaPanner
          panToArea={panToArea}
          bottomOcclusionPx={bottomOcclusionPx}
        />
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
            {/* Issue #2296 (PR #2381 second review) — Level-2 agri destination-bucket
                markers, rendered by a DEDICATED non-clustering layer via the separate
                `agriDestinationMarkers` prop (never routed through agriLayerListings/
                AgriMarkerClusterLayer's clustering policy, so two nearby destinations
                can never collapse into a generic "N properties" bubble). Renders
                nothing when the prop is null/empty. */}
            <AgriDestinationMarkerLayer
              destinations={agriDestinationMarkers ?? []}
              onSelectAgriDestination={onSelectAgriDestination}
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
            onAreaVisualClusterCameraIntent={handleAreaVisualClusterCameraIntent}
            autoAdvanceSelectNode={autoAdvanceSelectNode}
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
              areaSetCandidateKeys={areaSetCandidateKeys}
              onAreaSetCandidateSelect={onAreaSetCandidateSelect}
              areaSetAtMax={areaSetAtMax}
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
        {/* Issue #2382 — school circle/radius ring + pin extracted into
            SchoolRadiusOverlay (src/components/map/layers/SchoolRadiusOverlay.tsx),
            page-health follow-up from #2296. Same no-op-when-absent gate as
            before this extraction. */}
        <SchoolRadiusOverlay schoolCircle={schoolCircle} />
      </MapContainer>
      </div>
    </div>
  );
}
