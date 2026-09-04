import { useCallback, useMemo, useRef, useState } from 'react';
import { PropertyFilters, PropertyListing, PropertyImage, clampSchoolRadiusKm } from '@/hooks/usePropertyListings';
import { useDiscoverListings } from '@/hooks/useDiscoverListings';
import { useDiscoverFilteredMarkers } from '@/hooks/useDiscoverFilteredMarkers';
import { useTrendsOptions } from '@/hooks/useTrendsOptions';
import { useDiscoverAreas, DiscoverAreasResponse, DiscoverArea } from '@/hooks/useDiscoverAreas';
import { useDiscoverCityListings, DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import { useSchoolRadiusListings, mapSchoolRadiusCard, SchoolRadiusListingItem } from '@/hooks/useSchoolRadiusListings';
import { mapAnonViewportCard, type AnonViewportListingItem } from '@/lib/anonViewportListing';
import { useSchoolById, SchoolResult } from '@/hooks/useSchoolSearch';
import type { DiscoverJourney } from '@/hooks/useDiscoverUrlState';
// Issue #1953 AC12 — `import type`, NOT a value import. AreaPoint is an exported
// interface used only in type positions in this file. Under isolatedModules esbuild
// preserves a value-position import of a pure type, so this ONE line dragged
// AreaMarkerLayer — and therefore leaflet + react-leaflet — into the EAGER entry graph
// via MapDiscovery, which must stay eager because it IS the Discover page. A missed
// site from 009edc9b's sweep in this same PR.
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import { computeFocusBounds } from '@/lib/mapUtils';
import { CITY_CONFIG } from '@/lib/localityUtils';
import { AGRICULTURAL_LAND_PROPERTY_TYPE } from '@/lib/listing-constants';
import { shouldShowMarkers } from '@/lib/map/zoomPolicy';
import {
  deriveVisibleMemberSet,
  type VisibleMemberSet,
} from '@/features/discover/navigation/visibleMemberSet';
import {
  filteredMarkerToPropertyListing,
  discoverListingToPropertyListing,
  cityListingToPropertyListing,
  discoverListingToCityListing,
} from '@/lib/discoverMappers';
import type { DiscoverMarkerScope } from '@/features/discover/selectors/markerScope';
import type { ResultScope } from '@/features/discover/state/resultScope';

/**
 * Issue #1801 — optimistic camera-navigation intent for area-marker clicks.
 *
 * Published synchronously (same React click tick) by `publishCameraIntent`
 * below, which is wired to AreaMarkerLayer's `onAreaCameraIntent` — the ONLY
 * caller. MapController (PropertyMap.tsx) is the sole consumer/camera owner:
 * it fits/flies exactly once per new `seq`, replacing the two-to-three
 * uncoordinated map.fitBounds/flyTo/setZoom calls that used to fire
 * independently from AreaMarkerLayer and from the network-driven
 * `activeFocusBounds` effect (the "goes somewhere, then pulled back" jitter).
 */
export interface CameraIntent {
  /** Strictly monotonic — a fresh click always produces seq > any prior seq. */
  seq: number;
  /** area.bbox verbatim; null falls back to a flyTo on `center`. */
  bounds: [[number, number], [number, number]] | null;
  /** [area.geo_center_lat, area.geo_center_lon] — used when bounds is null. */
  center: [number, number];
  /**
   * 'overview' for macro-region/group/area-cluster pins (maxZoom 12); 'leaf'
   * for a real area (zoom clamped to [13,16]); 'cluster' (issue #1762) for a
   * splittable LISTING-marker cluster tap — fits to that cluster's own
   * member bounds, clamped to [currentZoom+1, CLUSTER_DISABLE_AT_ZOOM]. This
   * is a DISTINCT framing from 'overview' (which area clusters use): a
   * listing cluster is never bounded to AREA_LAYER_MAX_ZOOM (12) the way an
   * area/group pin is.
   */
  framing: 'overview' | 'leaf' | 'cluster';
  /**
   * Issue #1882 (Track A PR2 Slice S4; corrected in the camera-padding
   * rework) — responsive fitBounds padding as a Leaflet-native
   * `[horizontalPx, verticalPx]` tuple (matches Leaflet's own Point/padding
   * contract — `L.point(x, y)` and `fitBounds({ padding: [x, y] })`).
   * Optional and defaulted to the pre-existing `[40, 40]` by MapController
   * (PropertyMap.tsx) when absent, so every pre-#1882 CameraIntent literal
   * (tests included) keeps behaving exactly as before. See
   * `computeCameraPadding`.
   */
  padding?: CameraPadding;
  /**
   * Issue #2088 (commit 6) — set ONLY by `publishRecenterCameraIntent` below,
   * for the "Recenter on <label>" affordance. `Recenter` is an EXPLICIT user
   * action (a deliberate button press), never an automatic/network-driven
   * refit, and MUST always actually move the camera when pressed — never
   * silently no-op right after a pan, which is exactly when a user reaches
   * for this button.
   *
   * VERIFIED FINDING (read against `PropertyMap.tsx`'s `MapController`,
   * which this project does not edit — see the module doc on
   * `publishRecenterCameraIntent`): `CAMERA_SUPPRESS_TTL_MS` there gates a
   * DIFFERENT effect — the network-driven `focusBounds` refit that follows a
   * leaf area click — never the `cameraIntent` effect itself. That effect's
   * only guard is `seq <= lastHandledSeqRef.current`, which a fresh,
   * monotonically-bumped `seq` (every publisher, including this one,
   * increments the SAME `cameraIntentSeqRef`) always clears. A Recenter
   * click therefore already moves the camera unconditionally today, with NO
   * PropertyMap.tsx change required.
   *
   * This field exists to make that guarantee an explicit, typed part of the
   * `CameraIntent` CONTRACT rather than an implicit fact a future
   * `MapController` change could accidentally undo — a reviewer/consumer can
   * grep for `bypassSuppression` and see exactly which producer claims
   * "explicit user action, must not be swallowed" without re-deriving the
   * suppression-effect analysis above from scratch. `MapController` does not
   * currently need to READ this field for correctness (see above); if a
   * future change to that file's suppression logic ever grows a gate on the
   * `cameraIntent` effect itself, this field is the documented seam for that
   * change to key off, instead of re-discovering the requirement.
   */
  bypassSuppression?: boolean;
}

// Issue #1823 — CameraPadding/computeCameraPadding (and their supporting
// breakpoint/tier constants) moved to zoomPolicy.ts, the SOLE Discover
// zoom/camera-policy source; re-exported here for compatibility since
// nothing outside this file constructed these directly before the move
// (grepped repo-wide), but this keeps any future external import path
// working unchanged.
import {
  type CameraPadding,
  DESKTOP_BREAKPOINT_PX,
  MOBILE_CAMERA_PADDING,
  DESKTOP_CAMERA_PADDING,
  computeCameraPadding,
} from '@/shared/map/zoomPolicy';
export type { CameraPadding };
export { DESKTOP_BREAKPOINT_PX, MOBILE_CAMERA_PADDING, DESKTOP_CAMERA_PADDING, computeCameraPadding };

// PR #2128 (Finding 2, issue #1823) — deliberate scope boundary: the 3
// producers below (publishCameraIntent/publishClusterCameraIntent/
// publishRecenterCameraIntent, feeding MapController) are NOT
// occlusion-aware — only AreaPanner's fitBounds call in PropertyMap.tsx
// reserves bottomOcclusionPx. #1823's own scope is the three canonical
// listing-capable Area/Browse/school-radius states AreaPanner fits;
// widening occlusion-awareness to marker/cluster camera intents here is a
// separate, uncharted extension, not part of this fix.

/**
 * Real viewport width for camera-padding selection, read at the moment a
 * camera intent is published (inside publishCameraIntent/
 * publishClusterCameraIntent below) rather than threaded in as a manual
 * argument — so the public callback shapes ((area: AreaPoint) => void,
 * (bounds, center) => void) stay unchanged at every consumer layer
 * (AreaMarkerLayer → DiscoverMapCanvas → MapDiscovery all keep their
 * existing prop types). Returns undefined in non-browser contexts (SSR/
 * some test environments), which computeCameraPadding treats as desktop.
 */
function getViewportWidthPx(): number | undefined {
  return typeof window !== 'undefined' ? window.innerWidth : undefined;
}

/**
 * Issue #1882 (Track A PR2 Slice S4) — the region/group/area camera
 * fallback chain: valid bbox → synthetic pad around a valid centroid → city
 * bounds → city centre (bounds null; caller flyTo's to `center`).
 *
 * A bbox is treated as unfit-able ("degenerate") when its corners coincide
 * (min === max) — e.g. the real Basavanagudi single-area-group case, where
 * the backend reports `boundsStatus: 'APPROXIMATE'` for a group with no real
 * spatial spread. A degenerate bbox is NEVER passed through as `bounds` —
 * MapController's existing null-bounds branch already flies to `center`
 * instead of fitting, so routing a degenerate/missing bbox to `bounds: null`
 * here reuses that behaviour rather than inventing a synthetic fitBounds box.
 */
export interface CameraFramingInput {
  /** Region canonical bounds / group union bbox / area bbox — the primary candidate. */
  bbox: [[number, number], [number, number]] | null;
  /** Region centre / group focus point / area geo-center — used when bbox is null or degenerate. */
  centroid: [number, number] | null;
  /** City-level fallback bounds (union of all areas), used when neither bbox nor centroid resolve. */
  cityBounds?: [[number, number], [number, number]] | null;
  /** City centre — last-resort fallback when nothing else resolves. */
  cityCentre?: [number, number];
}

export interface ResolvedCameraFraming {
  /** Bounds to fitBounds, or null — caller should flyTo `center` instead. */
  bounds: [[number, number], [number, number]] | null;
  center: [number, number];
  /** True when the centroid fallback was used (bbox missing or degenerate) rather than fitting a real bbox. */
  usedCentroidFallback: boolean;
}

function isDegenerateBbox(bbox: [[number, number], [number, number]] | null): boolean {
  if (!bbox) return true;
  const [[s, w], [n, e]] = bbox;
  return s === n && w === e;
}

function centroidOfBbox(bbox: [[number, number], [number, number]]): [number, number] {
  const [[s, w], [n, e]] = bbox;
  return [(s + n) / 2, (w + e) / 2];
}

export function resolveCameraFraming(input: CameraFramingInput): ResolvedCameraFraming {
  const { bbox, centroid, cityBounds, cityCentre } = input;

  // 1. Valid, non-degenerate bbox — fit it directly.
  if (bbox && !isDegenerateBbox(bbox)) {
    return { bounds: bbox, center: centroidOfBbox(bbox), usedCentroidFallback: false };
  }

  // 2. Centroid fallback — covers a null bbox AND a degenerate/point-only
  //    bbox (e.g. Basavanagudi). bounds stays null so the caller flies to
  //    `center` instead of fitting a meaningless zero-area box.
  const centre = centroid ?? (bbox ? bbox[0] : null);
  if (centre) {
    return { bounds: null, center: centre, usedCentroidFallback: true };
  }

  // 3. City bounds.
  if (cityBounds && !isDegenerateBbox(cityBounds)) {
    return { bounds: cityBounds, center: centroidOfBbox(cityBounds), usedCentroidFallback: false };
  }

  // 4. City centre + default zoom — bounds null; caller flyTo's to `center`.
  return { bounds: null, center: cityCentre ?? [0, 0], usedCentroidFallback: false };
}

/**
 * Issue #1882 (Track A PR2 Slice S3) — scope-aware marker gating.
 *
 * Region and city scopes stay aggregated (they show the next hierarchy
 * level — groups/areas — never raw city-wide listing markers). Only
 * group/area scopes fetch individual listing markers, and only once the
 * map is zoomed in past the area-overview band.
 */
export type DiscoverScopeKind = 'city' | 'region' | 'group' | 'area';

export interface DiscoverScopeInput {
  /** Set once a specific area is selected/drilled into. */
  areaKey?: string | null;
  /** Set once a group is selected/drilled into (and no more specific area yet). */
  groupId?: string | null;
  /** URL macro-region scope (set at the region-overview level, no group/area yet). */
  scope?: string | null;
}

/** Derives the current Discover scope granularity from URL/selection state. */
export function deriveDiscoverScopeKind({ areaKey, groupId, scope }: DiscoverScopeInput): DiscoverScopeKind {
  if (areaKey) return 'area';
  if (groupId) return 'group';
  if (scope) return 'region';
  return 'city';
}

/**
 * markersEnabled = (scope.kind === 'group' || scope.kind === 'area') &&
 * zoomPolicy.shouldShowMarkers(zoom). City/region scopes never fetch raw
 * city-wide markers — they render the next hierarchy level instead.
 */
export function deriveScopeAwareMarkersEnabled(scopeKind: DiscoverScopeKind, zoom: number): boolean {
  return (scopeKind === 'group' || scopeKind === 'area') && shouldShowMarkers(zoom);
}

export interface UseDiscoverMapDataParams {
  city: string;
  selectedArea: AreaPoint | null;
  filters: PropertyFilters;
  debouncedSearch: string;
  /** School ID from URL — used to restore school on mount */
  urlSchoolId: string | null;
  isAuthenticated: boolean;
  /** fitTick is threaded in so activeFocusBounds reacts to refit clicks */
  fitTick: number;
  /** Pre-computed gate: true only when authenticated AND zoom > AREA_LAYER_MAX_ZOOM. */
  markersEnabled: boolean;
  /**
   * Issue #1655 — pre-computed gate: false at top-grouped journey levels where the right
   * panel shows groups/zones, not individual listings. Disables the useDiscoverListings
   * fetch to avoid fetching paginated listing data that has no consumer.
   * Defaults to true when omitted (backward-compatible).
   */
  listingsEnabled?: boolean;
  /** Current page for the listing cards panel (0-indexed). */
  page: number;
  /**
   * Optional viewport bounding box [south, west, north, east] extracted from the map.
   * Passed through to useDiscoverListings and useDiscoverFilteredMarkers, which snap
   * it to a 0.02° grid before including it in the API call and query key.
   * When null/undefined the backend falls back to the full city query.
   */
  bbox?: [number, number, number, number] | null;
  /**
   * Issue #1371 — active Discover journey from URL state. When 'agri-first',
   * the hook makes a SEPARATE agri-scoped useDiscoverAreas call (queryKey includes
   * 'agricultural_land' — AC10 cache-key isolation) and forces propertyType into
   * the area-click listings fetch. The BLENDED useDiscoverAreas (AreaPoint path) is
   * NEVER affected by journey/propertyType — AreaPoint.listingCount always
   * reflects the blended (all-property-type) count.
   * UPDATE (Issue #2083 RC_C, see the `listingPurpose` param below and its
   * threading into the blended `useDiscoverAreas` call ~479-483): the blended
   * path IS now purpose-scoped. When a Buy/Rent intent is active,
   * AreaPoint.listingCount — and therefore map marker labels and
   * `cityTotal` — reflects that purpose, not an unconditional Buy+Rent
   * blend. "Blended" here means "not journey/propertyType-filtered", not
   * "not purpose-filtered".
   */
  journey?: DiscoverJourney | null;
  /**
   * Issue #1494 — buy/rent intent mapped to backend listingPurpose ('sale'|'rent').
   * When undefined or 'sale', no listing_purpose filter is applied (backward-compatible).
   */
  listingPurpose?: string;
  /**
   * Issue #2185 S2 — the single geography-scope decision for the map's
   * marker fetch, computed once by the caller (via
   * `resolveDiscoverMarkerScope`) and forwarded verbatim to
   * useDiscoverFilteredMarkers. Defaults to `{kind:'city'}` (unscoped
   * city-wide, the pre-#2185 baseline) when omitted. See
   * `@/features/discover/selectors/markerScope` for the full precedence and
   * the #1806/#1597/#2087 producers this replaces.
   */
  scope?: DiscoverMarkerScope;
  /**
   * Issue #2016 — the committed geography (AREA_SET | POLYGON | VIEWPORT |
   * null) forwarded verbatim to useDiscoverListings/useDiscoverFilteredMarkers
   * so cards, markers, and totals share one scopeFingerprint identity, and so
   * a committed VIEWPORT's bounds reach the new `viewportScope` request
   * param. Defaults to null (existing callers that predate this param keep
   * compiling and behaving identically — no fingerprint/viewportScope sent).
   * Orthogonal to `scope` above (the navigation-resolution view); a
   * committed POLYGON already reaches this hook via `filters.polygon` (the
   * caller's bridge from the committed scope), so `resultScope` here is
   * purely for the shared query identity.
   */
  resultScope?: ResultScope;
}

export interface UseDiscoverMapDataResult {
  // Loading flags
  areasLoading: boolean;
  listingDataLoading: boolean;
  markersLoading: boolean;
  isLoadingAreaListings: boolean;
  /** True while a filter-change refetch is in-flight for listings or markers. */
  isFetching: boolean;

  // Data
  discoverAreas: AreaPoint[];
  discoverAreasData: DiscoverAreasResponse | undefined;
  /**
   * Issue #1371 — agri-scoped area summary rows, populated only when journey='agri-first'.
   * `listingCount` on each element is the AGRI-ONLY count (from the ?propertyType=agricultural_land
   * backend call). `agriAcreage` is present where the backend could compute it.
   * Undefined (and query idle) for every other journey so there is zero overhead.
   */
  agriAreasData: DiscoverArea[] | undefined;
  /** True while the agri-scoped areas query is in-flight. */
  isLoadingAgriAreas: boolean;
  listingsWithCoords: (PropertyListing & { images?: PropertyImage[] })[];
  filteredListings: (PropertyListing & { images?: PropertyImage[] })[];
  markerListings: (PropertyListing & { images?: PropertyImage[] })[];
  areaListings: DiscoverCityListingItem[];
  /**
   * Issue #1806 (DIRECTIVE 1) — true once the area-listings query has settled
   * WITH an error (404/500/timeout/etc.), as opposed to settling with a
   * genuinely empty result. useDiscoverCityListings does not otherwise expose
   * its error state; callers use this to distinguish "the area truly has zero
   * listings" (show nothing) from "the query failed" (a distinct case) rather
   * than conflating both into a bare empty array.
   */
  isErrorAreaListings: boolean;
  /**
   * Issue #2353 — refetches the SAME query `areaListings`/`isErrorAreaListings`
   * come from. Threaded down to any consumer of `areaListings` as its primary
   * data source (e.g. AreaLeafListingsSurface via the panel-surface pipeline)
   * so its Retry-on-error control is a real refetch, not a no-op.
   */
  refetchAreaListings: () => void;
  /**
   * Issue #2353 (code-review fix) — true while a refetch of the SAME query
   * `areaListings` comes from is in flight, INCLUDING the
   * `placeholderData: keepPreviousData` case where `areaListings` is still
   * showing the previous (stale) result and `isLoadingAreaListings` is
   * `false`. Distinct from `isLoadingAreaListings` (true only on a cold/
   * disabled->enabled transition with no data at all yet). Threaded down so
   * a consumer of `areaListings` as its primary data source (e.g.
   * AreaLeafListingsSurface) can still surface "refreshing" during a
   * filter/search rekey instead of presenting stale cards as settled.
   */
  isFetchingAreaListings: boolean;
  /**
   * Issue #1261 — cross-area listings within the selected school radius, sourced from
   * the PUBLIC /school-radius-listings endpoint. Populated for anon users (their only
   * listing source in radius mode) and for authenticated users when markersEnabled is
   * false (CTA not yet triggered) so the data can serve as radius-filtered marker pins.
   * PropertyFilters are applied client-side by the caller.
   */
  schoolRadiusListings: SchoolRadiusListingItem[];
  /** True while the anon school-radius query is in-flight. */
  schoolRadiusListingsLoading: boolean;
  /** True when the school-radius endpoint reports more listings beyond this page. */
  schoolRadiusHasMore: boolean;
  areaMarkerListings: (PropertyListing & { images?: PropertyImage[] })[];
  /**
   * Issue #2015 — true only for an anonymous caller with a COMMITTED VIEWPORT
   * `resultScope` (i.e. "Search this area" was triggered). Exposed so downstream marker
   * selection (`resolveMarkerListings.ts`) can gate the anon-viewport marker branch on the
   * exact same condition this hook uses to enable the bbox-only query, rather than
   * re-deriving `resultScope?.kind === 'VIEWPORT' && !isAuthenticated` a second time.
   */
  isAnonViewport: boolean;
  /**
   * Issue #2015 — anonymous "Search this area" (committed VIEWPORT `resultScope`, not
   * authenticated) reconciled listing set, sourced from the PUBLIC bbox-only mode of
   * `GET /api/discover/cities/{city}/listings` (never the auth-only markers/listings
   * endpoints — #1118 constraint). Empty whenever the branch isn't active (authenticated,
   * or resultScope isn't a committed VIEWPORT). Price fields are band-only by
   * construction (see `AnonViewportListingItem`).
   */
  anonViewportListings: AnonViewportListingItem[];
  /**
   * Issue #2015 — the SAME `anonViewportListings` array, mapped to the map layer's
   * `PropertyListing` shape via `cityListingToPropertyListing`. Deriving markers from the
   * identical array `anonViewportListings` is what guarantees cards and markers share the
   * exact same listing IDs (the #2015 hard data-integrity constraint) — there is no
   * separate marker fetch for this branch.
   */
  anonViewportMarkerListings: (PropertyListing & { images?: PropertyImage[] })[];
  /** True while the anon-viewport bbox-only query is in-flight. */
  anonViewportListingsLoading: boolean;
  /**
   * True once the anon-viewport query has settled with an error. Note
   * `anonViewportListings`/`anonViewportMarkerListings` are NOT cleared when this is
   * true (review fix 5087672619) — they keep showing the last successful "Search this
   * area" result set so a transient failure doesn't wipe the shopper's current view.
   * Callers should pair this flag with a Retry control (see `refetchAnonViewport`).
   */
  isErrorAnonViewport: boolean;
  /**
   * Issue #2015 review fix (5087672619) — refetches the SAME anon-viewport query (same
   * bbox/filters) so a Retry control driven off `isErrorAnonViewport` is a real refetch,
   * not a no-op. Mirrors `refetchAreaListings` (Issue #2353) for the AREA_SET branch.
   */
  refetchAnonViewport: () => void;
  /**
   * Issue #2015 — true only for an AUTHENTICATED caller with a COMMITTED VIEWPORT
   * `resultScope` (i.e. "Search this area" was triggered). Mirrors `isAnonViewport`
   * for the authenticated path — exposed so the right-panel caller can swap away from
   * the stale AREA_SET `areaListings` without re-deriving
   * `resultScope?.kind === 'VIEWPORT' && isAuthenticated` a second time.
   */
  isAuthViewport: boolean;
  /**
   * Issue #2015 — authenticated "Search this area" (committed VIEWPORT `resultScope`)
   * reconciled listing set. Sourced from the SAME `discoverListingsPage` query already
   * used for `filteredListings` (which is already resultScope-aware — see the
   * `useDiscoverListings` call above), just remapped via `discoverListingToCityListing`
   * so it can be rendered by `AreaSelectedPanel`'s `PropertyCard`. Empty whenever the
   * branch isn't active (anonymous, or resultScope isn't a committed VIEWPORT).
   */
  authViewportListings: DiscoverCityListingItem[];
  /** True while the authenticated-viewport listings query is in-flight. */
  authViewportListingsLoading: boolean;
  /** True once the authenticated-viewport listings query has settled with an error. */
  isErrorAuthViewport: boolean;
  topLocalities: { locality: string; count: number }[];
  activeFocusBounds: [[number, number], [number, number]] | null;
  localityToAreaKey: Map<string, string>;
  trendsAreaKeys: string[];
  cityCenter: [number, number] | undefined;
  cityZoom: number | undefined;
  /** The school matching the URL ?schoolId= param, or undefined while loading / not set / 404. */
  schoolById: SchoolResult | undefined;
  /** True while the school-by-ID request is in-flight. */
  schoolByIdLoading: boolean;
  /** Error from the school-by-ID request — caller uses this to detect 404 and drop the URL param. */
  schoolByIdError: Error | null;
  error: Error | null;
  /** Pagination metadata from the listings endpoint */
  totalElements: number;
  totalPages: number;
  /**
   * Marker truncation metadata — present only when the markers query has settled
   * and markersEnabled is true. All fields are undefined when not applicable
   * (e.g. anonymous path, query not yet enabled).
   */
  markersTruncated: boolean;
  markersReturnedElements: number | undefined;
  markersTotalFilteredElements: number | undefined;
  /** Issue #1801 — current optimistic camera-navigation intent (or null if none published yet). */
  cameraIntent: CameraIntent | null;
  /**
   * Issue #1801 — publishes a new CameraIntent derived from an AreaPoint. Call
   * SYNCHRONOUSLY from the area-marker click path (AreaMarkerLayer's
   * onAreaCameraIntent) — never from a delayed effect or post-fetch callback.
   * Issue #1882 (Slice S4; camera-padding rework) — internally selects
   * responsive fitBounds padding via `computeCameraPadding` +
   * `window.innerWidth`, read at call time (see `getViewportWidthPx`). This
   * keeps the public signature identical to the pre-#1882 callback shape —
   * no viewportWidthPx argument is threaded through AreaMarkerLayer/
   * DiscoverMapCanvas/MapDiscovery.
   */
  publishCameraIntent: (area: AreaPoint) => void;
  /**
   * Issue #1806 (FIX-4) — sibling producer to publishCameraIntent for an
   * area-CLUSTER click. Shares the same monotonic seq ref, so MapController's
   * existing seq-guard treats a cluster intent identically to an area intent
   * (a fresh click always wins over a stale one, regardless of which producer
   * published it). Always framing='overview' — a cluster is never a 'leaf'.
   * Caller passes the cluster's union bounds and center; this does NOT
   * recompute or validate them (the fallback chain is still applied for a
   * missing/degenerate bounds — see `resolveCameraFraming`). Selects
   * responsive padding the same way publishCameraIntent does (see above) —
   * no viewportWidthPx argument here either.
   */
  publishClusterCameraIntent: (
    bounds: CameraIntent['bounds'],
    center: [number, number],
  ) => void;
  /**
   * Issue #1762 — sibling producer to `publishCameraIntent`/
   * `publishClusterCameraIntent` for a splittable LISTING-marker cluster tap
   * (the leaflet.markercluster residential/agri layer, NOT an area cluster —
   * see `publishClusterCameraIntent` above for that producer). Shares the
   * SAME monotonic `cameraIntentSeqRef`, so a fresh listing-cluster tap
   * always wins over a stale intent from either producer and vice versa.
   * Always `framing: 'cluster'` — see that field's doc on `CameraIntent`.
   * Caller (MarkerClusterLayer's clusterclick/clusterkeypress handler in
   * PropertyMap.tsx) has already gated the click as splittable via
   * `clusterCanSplit`/`hasSpatialSpread` before calling this — this producer
   * does not re-validate, it only frames+publishes.
   */
  publishMarkerClusterCameraIntent: (
    bounds: CameraIntent['bounds'],
    center: [number, number],
  ) => void;
  /**
   * Issue #2088 (commit 6) — sibling producer to `publishCameraIntent`/
   * `publishClusterCameraIntent` for the "Recenter on <label>" affordance.
   * Shares the SAME monotonic `cameraIntentSeqRef`, so `MapController`'s
   * existing seq-guard treats this producer identically to the other two — a
   * fresh Recenter click always wins over a stale intent and vice versa.
   * Always sets `bypassSuppression: true` (see that field's doc on
   * `CameraIntent` for the verified finding on why no `PropertyMap.tsx`
   * change is required for this to actually move the camera). `framing` is
   * caller-supplied (`'leaf'` for a resolved AREA node, `'overview'`
   * otherwise) rather than hardcoded, since Recenter can be pressed at any
   * hierarchy level.
   */
  publishRecenterCameraIntent: (
    bounds: CameraIntent['bounds'],
    center: [number, number],
    framing: CameraIntent['framing'],
  ) => void;
  /**
   * Issue #1956 PR 1 (FE-3, item 2) — THE shared visible-member set for the
   * current destination scope, derived once here and handed to
   * `useDiscoverMapPresentation` so map and panel can never disagree about which
   * areas are members (AC1.12).
   *
   * ADDITIVE AND INERT in PR 1: exposed, threaded, and rendered by NOTHING.
   * Reading it is a later PR's job. See
   * `@/features/discover/navigation/visibleMemberSet`.
   */
  visibleMemberSet: VisibleMemberSet;
}

export function useDiscoverMapData({
  city,
  selectedArea,
  filters,
  debouncedSearch,
  urlSchoolId,
  isAuthenticated,
  fitTick,
  markersEnabled,
  listingsEnabled = true,
  page,
  bbox,
  journey,
  listingPurpose,
  scope = { kind: 'city' },
  resultScope = null,
}: UseDiscoverMapDataParams): UseDiscoverMapDataResult {
  const isCityValid = city in CITY_CONFIG;

  // ── Memoized city config ──────────────────────────────────────────────────
  const cityCenter = useMemo(() => CITY_CONFIG[city]?.center, [city]);
  const cityZoom = useMemo(() => CITY_CONFIG[city]?.zoom, [city]);

  // ── Paginated discover listings (auth-only) ────────────────────────────────
  // Issue #1655: gated by listingsEnabled so top-grouped journey states avoid fetching
  // individual listing data that the UI does not consume (right panel shows groups).
  const {
    data: discoverListingsPage,
    isLoading: discoverListingsLoading,
    isFetching: discoverListingsFetching,
    error: discoverListingsError,
  } = useDiscoverListings({
    city,
    page,
    size: 50,
    filters,
    includeAggregates: true,
    enabled: isAuthenticated && listingsEnabled,
    bbox,
    q: debouncedSearch || undefined,
    listingPurpose,
    // Issue #2016 — shared query identity across cards/markers/totals.
    resultScope,
  });

  // ── Filtered markers (auth-only, same predicate as listings) ──────────────
  // Issue #1371 — isAgriJourney gates both the areas call (below) and the markers call.
  // Declared here (before first use) to keep agriFilters readable.
  const isAgriJourney = journey === 'agri-first';
  // Issue #1463 — exclude agricultural_land markers from non-agri journeys so they don't
  // clutter area-first and school-first map views. In agri-first, undefined → no exclusion.
  const excludePropertyType = isAgriJourney ? undefined : AGRICULTURAL_LAND_PROPERTY_TYPE;
  // Issue #1372 — in agri-first journey, force propertyTypes to ['agricultural_land']
  // so markerListings contains only agri markers.
  const agriFilters: typeof filters = isAgriJourney
    ? { ...filters, propertyTypes: [AGRICULTURAL_LAND_PROPERTY_TYPE] }
    : filters;
  const {
    data: filteredMarkersData,
    isLoading: filteredMarkersLoading,
    isFetching: filteredMarkersFetching,
  } = useDiscoverFilteredMarkers(
    city,
    agriFilters,
    markersEnabled,
    bbox,
    debouncedSearch?.trim() || undefined,
    listingPurpose,
    excludePropertyType,
    // Issue #2185 S2 — the caller-resolved scope (city/node/legacy areas/
    // unresolved). Replaces the separate groupAreaKeys/nodeKey params.
    scope,
    // Issue #2016 — shared query identity across cards/markers/totals.
    resultScope,
  );

  // ── Static data ───────────────────────────────────────────────────────────
  const { data: trendsOpts } = useTrendsOptions(city, true, 50);
  // Blended areas — feeds AreaPoint.listingCount + map markers. NEVER filtered by propertyType.
  // Issue #2083 RC_C — threads `listingPurpose` ('sale'|'rent'|undefined) as the
  // new `purpose` query param so `cityTotal` (derived from this data in
  // MapDiscovery.tsx) becomes intent-aware against the backend's new
  // AreaSummaryService purpose filter, instead of always reporting the
  // blended (Buy+Rent) total regardless of the active Buy/Rent toggle.
  const { data: discoverAreasData, isLoading: areasLoading } = useDiscoverAreas(
    isCityValid ? city : '',
    undefined,
    listingPurpose,
  );

  // Issue #1371 — agri-scoped area summary. Only enabled in agri-first journey.
  // Uses a SEPARATE cache key (['discover-areas', city, 'agricultural_land']) so React Query
  // cannot cross-serve this with the blended response (AC10).
  // isAgriJourney is declared above (before agriFilters) — reused here.
  const {
    data: agriAreasResponseData,
    isLoading: isLoadingAgriAreas,
  } = useDiscoverAreas(
    isCityValid ? city : '',
    isAgriJourney ? AGRICULTURAL_LAND_PROPERTY_TYPE : undefined,
    isAgriJourney ? listingPurpose : undefined,
  );
  const agriAreasData: DiscoverArea[] | undefined = isAgriJourney
    ? (agriAreasResponseData?.areas ?? [])
    : undefined;

  // Area listing cards (right panel detail view)
  const discoverMinPrice = filters.priceMin != null ? filters.priceMin * 100 : undefined;
  const discoverMaxPrice = filters.priceMax != null ? filters.priceMax * 100 : undefined;
  const discoverBedrooms = filters.bedrooms?.length === 1 ? filters.bedrooms[0] : undefined;
  // Issue #1371 (AC6): in agri-first journey, force propertyType='agricultural_land'
  // for the area-click listing fetch regardless of what filters.propertyTypes contains.
  // The non-agri derivation (single-element filter wins) is left untouched for all
  // other journeys.
  const discoverPropertyType = isAgriJourney
    ? AGRICULTURAL_LAND_PROPERTY_TYPE
    : filters.propertyTypes?.length === 1
    ? filters.propertyTypes[0]
    : undefined;

  // Issue #2017 (owner manual-test fix) — a committed multi-area AREA_SET
  // scope must broaden the area-listings fetch to every committed areaKey,
  // not just `selectedArea.areaKey`. Previously this always fetched (and
  // `areaListings` below always derived) only the single selected area, so
  // "Show listings" after adding nearby areas silently kept showing the
  // pre-commit single-area result set. Mirrors the VIEWPORT
  // (`resultScope?.kind === 'VIEWPORT'`) resultScope-awareness already used
  // elsewhere in this hook (see isAuthViewport below).
  const activeAreaListingKeys = useMemo(() => {
    if (resultScope?.kind === 'AREA_SET' && resultScope.areaKeys.length > 0) {
      return resultScope.areaKeys;
    }
    return selectedArea ? [selectedArea.areaKey] : [];
  }, [resultScope, selectedArea]);

  const {
    data: cityListingsData,
    isLoading: isLoadingAreaListings,
    // Issue #1806 (DIRECTIVE 1) — useDiscoverCityListings previously had its error
    // state dropped entirely at this call site, so a 404/500/timeout was
    // indistinguishable from "the area genuinely has zero listings" (both settle
    // to isLoading=false, data=undefined → areaListings=[] downstream). Exposed
    // here so the caller's empty-area fallback can tell the two apart.
    isError: isErrorAreaListings,
    // Issue #2353 — exposed so a caller consuming `areaListings` as its
    // primary data source (AreaLeafListingsSurface, via the panel-surface
    // pipeline) can offer a working Retry on `isErrorAreaListings` instead of
    // a dead button — this IS the query that produced the error.
    refetch: refetchAreaListings,
    // Issue #2353 (code-review fix) — this query uses
    // `placeholderData: keepPreviousData` (see useDiscoverCityListings.ts), so
    // on a query-key change (filter/search rekey) it deliberately keeps
    // rendering the PREVIOUS response while the new one is in flight:
    // `isFetching: true` while `isLoading` can stay `false`. Exposed so a
    // caller consuming `areaListings` as its primary data source can still
    // surface that "showing stale data, refresh in flight" signal instead of
    // presenting the previous page's cards as fully settled/current.
    isFetching: isFetchingAreaListings,
  } = useDiscoverCityListings({
    city,
    areaKeys: activeAreaListingKeys,
    limitPerArea: 50, // Issue #1122: raised from 5; backend clamps at 20 server-side (effective ceiling = 20)
    minPrice: discoverMinPrice,
    maxPrice: discoverMaxPrice,
    bedrooms: discoverBedrooms,
    propertyType: discoverPropertyType,
    q: debouncedSearch?.trim() || undefined,
    listingPurpose,
    // Issue #1616: thread auth state into the hook so JWT is sent for authed users (they
    // receive exact pricePaise) and the cache key separates anon/authed buckets.
    isAuthenticated,
  });

  // Issue #1261 — cross-area school-radius listings (PUBLIC endpoint).
  // Enabled for anon users always (their only listing source in radius mode), and for
  // authenticated users when markersEnabled is false (CTA not yet triggered) so the
  // public-endpoint data serves as radius-filtered marker fallback pins. Automatically
  // idle when no school coordinates are set. Radius is clamped with the shared #1210
  // helper so a 0 km value does not collapse the result set.
  const schoolRadiusEnabled =
    filters.schoolLat != null && filters.schoolLon != null &&
    (!isAuthenticated || !markersEnabled);
  const schoolRadiusKmClamped =
    filters.schoolRadiusKm != null ? clampSchoolRadiusKm(filters.schoolRadiusKm) : undefined;
  const {
    data: schoolRadiusData,
    isLoading: schoolRadiusQueryLoading,
  } = useSchoolRadiusListings({
    city,
    schoolLat: filters.schoolLat,
    schoolLon: filters.schoolLon,
    schoolRadiusKm: schoolRadiusKmClamped,
    size: 50, // DECISION-2: request the full single page; surface hasMore as a hint.
    enabled: schoolRadiusEnabled,
    listingPurpose,
  });

  const {
    data: schoolById,
    isLoading: schoolByIdLoading,
    error: schoolByIdError,
  } = useSchoolById(urlSchoolId);

  // ── Derived: loading / error ──────────────────────────────────────────────
  const listingDataLoading = isAuthenticated && discoverListingsLoading;
  const markersLoading = filteredMarkersLoading;
  /** True while a filter-change refetch is in-flight (isFetching && !isLoading). */
  const isFetching = isAuthenticated && (discoverListingsFetching || filteredMarkersFetching);
  const error = isAuthenticated ? (discoverListingsError as Error | null) : null;

  // ── Derived: listing sets ─────────────────────────────────────────────────
  const filteredListings = useMemo(() => {
    if (!isAuthenticated) return [];
    const now = new Date().toISOString();
    return (discoverListingsPage?.content ?? []).map((l) =>
      discoverListingToPropertyListing(l, now),
    );
  }, [isAuthenticated, discoverListingsPage]);

  // ── Auth VIEWPORT listings (Issue #2015) ───────────────────────────────────
  // Active only for an AUTHENTICATED caller with a COMMITTED VIEWPORT resultScope (i.e.
  // "Search this area" was triggered). `discoverListingsPage` is already resultScope-aware
  // (it's passed directly to `useDiscoverListings` above), so this branch simply remaps
  // the SAME page content via `discoverListingToCityListing` into the shape
  // `AreaSelectedPanel`/`PropertyCard` expect — mirroring `anonViewportListings` for the
  // authenticated path, without a second network request.
  const isAuthViewport = isAuthenticated && resultScope?.kind === 'VIEWPORT';
  const authViewportListings = useMemo((): DiscoverCityListingItem[] => {
    if (!isAuthViewport) return [];
    return (discoverListingsPage?.content ?? []).map(discoverListingToCityListing);
  }, [isAuthViewport, discoverListingsPage]);
  const authViewportListingsLoading = isAuthViewport && discoverListingsLoading;
  const isErrorAuthViewport = isAuthViewport && discoverListingsError != null;

  const listingsWithCoords = useMemo(
    () => filteredListings.filter((l) => l.latitude && l.longitude),
    [filteredListings],
  );

  // ── Derived: discover areas ───────────────────────────────────────────────
  const discoverAreas = useMemo((): AreaPoint[] => {
    if (!discoverAreasData?.areas) return [];
    return discoverAreasData.areas.map((a) => ({
      areaKey: a.areaKey,
      areaLabel: a.name,
      geo_center_lat: a.geoCenterLat,
      geo_center_lon: a.geoCenterLon,
      bbox:
        a.minLat != null && a.minLon != null && a.maxLat != null && a.maxLon != null
          ? ([[a.minLat, a.minLon], [a.maxLat, a.maxLon]] as [[number, number], [number, number]])
          : null,
      listingCount: a.listingCount,
      schoolCount: a.schoolCount,
      trendDirection: a.trendDirection as 'rising' | 'falling' | 'stable' | null | undefined,
    }));
  }, [discoverAreasData]);

  // ── Derived: area listings ────────────────────────────────────────────────
  // Issue #2017 (owner manual-test fix) — aggregate across every committed
  // AREA_SET areaKey (activeAreaListingKeys), not just `selectedArea.areaKey`.
  // For the non-AREA_SET case activeAreaListingKeys is exactly
  // `[selectedArea.areaKey]`, so this is byte-for-byte the old single-area
  // behavior by construction.
  const areaListings = useMemo(
    () =>
      activeAreaListingKeys.flatMap(
        (key) => cityListingsData?.areas.find((a) => a.areaKey === key)?.listings ?? [],
      ),
    [cityListingsData, activeAreaListingKeys],
  );

  // ── Derived: anon school-radius listings (Issue #1261) ─────────────────────
  // Mapped to DiscoverCityListingItem so the school-first panels/map consume them
  // identically to areaListings. Empty for authenticated users.
  const schoolRadiusListings = useMemo(
    (): SchoolRadiusListingItem[] =>
      (schoolRadiusData?.content ?? []).map(mapSchoolRadiusCard),
    [schoolRadiusData],
  );
  const schoolRadiusListingsLoading = schoolRadiusEnabled && schoolRadiusQueryLoading;
  const schoolRadiusHasMore = schoolRadiusData?.hasMore ?? false;

  const markerListings = useMemo((): (PropertyListing & { images?: PropertyImage[] })[] => {
    if (!filteredMarkersData?.markers) return [];
    const now = new Date().toISOString();
    return filteredMarkersData.markers.map((m) => filteredMarkerToPropertyListing(m, now));
  }, [filteredMarkersData]);

  const areaMarkerListings = useMemo((): (PropertyListing & { images?: PropertyImage[] })[] => {
    if (!selectedArea || areaListings.length === 0) return [];
    const now = new Date().toISOString();
    // Filter listings with coordinates (handle both lat/lon and latitude/longitude)
    const withCoords = areaListings
      .filter((l) => (l.lat != null && l.lon != null) || (l.latitude != null && l.longitude != null))
      .map((l) => ({
        ...l,
        lat: l.lat ?? l.latitude,
        lon: l.lon ?? l.longitude,
      }))
      .filter((l) => l.lat != null && l.lon != null)
      .map((l) => ({ ...l, lat: l.lat as number, lon: l.lon as number }));
    return withCoords.map((l) => cityListingToPropertyListing(l as DiscoverCityListingItem & { lat: number; lon: number }, now));
  }, [selectedArea, areaListings]);

  // ── Anon VIEWPORT listings (Issue #2015) ───────────────────────────────────
  // Active only for an anonymous caller with a COMMITTED VIEWPORT resultScope (i.e.
  // "Search this area" was triggered) — never for the authenticated VIEWPORT path
  // (useDiscoverListings/useDiscoverFilteredMarkers, gated by isAuthenticated above and
  // unaffected by this branch) or the anon AREA_SET/POLYGON paths (schoolRadiusListings/
  // areaListings, which this branch does not touch). Sourced exclusively from the PUBLIC
  // bbox-only mode of GET /api/discover/cities/{city}/listings — never the auth-only
  // /api/discover/markers or /api/discover/listings endpoints (#1118 constraint).
  const anonViewportBbox: [number, number, number, number] | null =
    !isAuthenticated && resultScope?.kind === 'VIEWPORT'
      ? [resultScope.bounds.s, resultScope.bounds.w, resultScope.bounds.n, resultScope.bounds.e]
      : null;
  const isAnonViewport = anonViewportBbox != null;

  const {
    data: anonViewportRawData,
    isLoading: anonViewportQueryLoading,
    isError: isErrorAnonViewport,
    refetch: refetchAnonViewport,
  } = useDiscoverCityListings({
    city,
    // areaKeys deliberately empty — this is the bbox-only mode (#2015); the backend
    // groups the response by each listing's own discovered area instead of a requested
    // areaKeys list. useDiscoverCityListings.enabled requires bbox non-null when
    // areaKeys is empty, which anonViewportBbox provides only when this branch is active.
    areaKeys: [],
    bbox: anonViewportBbox,
    minPrice: discoverMinPrice,
    maxPrice: discoverMaxPrice,
    bedrooms: discoverBedrooms,
    propertyType: discoverPropertyType,
    q: debouncedSearch?.trim() || undefined,
    listingPurpose,
    // Always false: this branch only ever runs for an anonymous caller (see
    // anonViewportBbox above), and forcing it here (rather than passing the outer
    // isAuthenticated) keeps the anon (priceBand) cache bucket correct even if this
    // hook were ever reached with isAuthenticated=true and a stale VIEWPORT resultScope
    // (anonViewportBbox would already be null in that case, disabling the query, but
    // this keeps the param self-consistent rather than relying solely on that guard).
    isAuthenticated: false,
  });

  // Issue #2015 hard constraint: cards and markers for this branch are derived from the
  // SAME flattened array, guaranteeing identical listing IDs on both. mapAnonViewportCard
  // also enforces band-only pricing structurally (see AnonViewportListingItem).
  //
  // Review fix 5087672619 — a transient query error must NOT collapse the result set to
  // empty: it would silently wipe the shopper's current "Search this area" view with no
  // way back short of panning again. anonViewportLastGoodRef holds the last successful,
  // mapped result and is read only on error, so a genuine (non-error) empty bbox still
  // renders the real empty state (see I2). The ref is written as a plain statement during
  // render — not inside the memo callback — mirroring the existing during-render ref-write
  // convention already used in this codebase (see useZoomBand.ts's bandRef and
  // useDiscoverUrlState.ts's liveUrlParamsRef).
  const anonViewportLastGoodRef = useRef<AnonViewportListingItem[]>([]);
  const anonViewportListings = useMemo((): AnonViewportListingItem[] => {
    if (!isAnonViewport) return [];
    if (!anonViewportRawData) {
      return isErrorAnonViewport ? anonViewportLastGoodRef.current : [];
    }
    return anonViewportRawData.areas.flatMap((a) =>
      a.listings.map((l) => mapAnonViewportCard(l, a.areaKey)),
    );
  }, [isAnonViewport, anonViewportRawData, isErrorAnonViewport]);
  if (isAnonViewport && anonViewportRawData) {
    anonViewportLastGoodRef.current = anonViewportListings;
  }
  const anonViewportListingsLoading = isAnonViewport && anonViewportQueryLoading;

  const anonViewportMarkerListings = useMemo((): (PropertyListing & { images?: PropertyImage[] })[] => {
    if (anonViewportListings.length === 0) return [];
    const now = new Date().toISOString();
    const withCoords = anonViewportListings
      .filter((l) => (l.lat != null && l.lon != null) || (l.latitude != null && l.longitude != null))
      .map((l) => ({ ...l, lat: l.lat ?? l.latitude, lon: l.lon ?? l.longitude }))
      .filter((l) => l.lat != null && l.lon != null)
      .map((l) => ({ ...l, lat: l.lat as number, lon: l.lon as number }));
    return withCoords.map((l) => cityListingToPropertyListing(l, now));
  }, [anonViewportListings]);

  // ── Derived: topLocalities from aggregate response ────────────────────────
  // Full-filtered-set aggregate — does NOT change on page navigation.
  const topLocalities = useMemo(
    () => discoverListingsPage?.aggregates?.topLocalities ?? [],
    [discoverListingsPage],
  );

  // ── Derived: focus bounds from filtered markers (full set, not paginated) ─
  const focusBounds = useMemo(
    () =>
      computeFocusBounds(
        filteredMarkersData?.markers ?? [],
        filters.localities ?? [],
      ),
    [filteredMarkersData, filters.localities],
  );

  // fitTick in dep array forces a new reference on refit clicks
  const activeFocusBounds = useMemo(() => {
    void fitTick; // ← do NOT delete
    return focusBounds;
  }, [focusBounds, fitTick]);

  // ── Issue #1801 — optimistic camera-navigation intent ─────────────────────
  // See the CameraIntent doc comment above. seq lives in a ref (not state) so
  // publishing never itself triggers a re-render beyond the setCameraIntent below.
  const cameraIntentSeqRef = useRef(0);
  const [cameraIntent, setCameraIntent] = useState<CameraIntent | null>(null);
  const publishCameraIntent = useCallback(
    (area: AreaPoint) => {
      // Issue #1882 (Track A PR2 Slice S4) — route the area's bbox/centroid
      // through the fallback chain (valid bbox → synthetic pad around a
      // valid centroid → city bounds → city centre) rather than passing
      // area.bbox straight through. Covers missing bounds AND a degenerate
      // (point-only) bbox — e.g. the real Basavanagudi case — without ever
      // fitting a zero-area box.
      const framed = resolveCameraFraming({
        bbox: area.bbox,
        centroid: [area.geo_center_lat, area.geo_center_lon],
        cityCentre: cityCenter,
      });
      cameraIntentSeqRef.current += 1;
      setCameraIntent({
        seq: cameraIntentSeqRef.current,
        bounds: framed.bounds,
        center: framed.center,
        framing: area.isMacroRegion || area.isGroup ? 'overview' : 'leaf',
        // Read the real viewport width HERE (not threaded in as a manual
        // argument) — see getViewportWidthPx's doc comment. This keeps the
        // public (area: AreaPoint) => void shape unchanged at every layer.
        padding: computeCameraPadding(getViewportWidthPx()),
      });
    },
    [cityCenter],
  );

  // Issue #1806 (FIX-4) — sibling producer for an area-CLUSTER chip click.
  // Shares cameraIntentSeqRef with publishCameraIntent above so MapController's
  // seq-guard (`if (cameraIntent.seq <= lastHandledSeqRef.current) return;`)
  // treats the two producers as one monotonic stream — a fresh cluster click
  // always wins over a stale area click and vice versa. Always framing='overview':
  // a cluster is never framed as a 'leaf' (that would arm the 8s focusBounds
  // suppression with no correlated consumer, and drill past AREA_LAYER_MAX_ZOOM).
  const publishClusterCameraIntent = useCallback(
    (bounds: CameraIntent['bounds'], center: [number, number]) => {
      // Issue #1882 (Slice S4) — same fallback chain as publishCameraIntent,
      // so a cluster's union bounds degrading to a point never fits a
      // degenerate box either.
      const framed = resolveCameraFraming({
        bbox: bounds,
        centroid: center,
        cityCentre: cityCenter,
      });
      cameraIntentSeqRef.current += 1;
      setCameraIntent({
        seq: cameraIntentSeqRef.current,
        bounds: framed.bounds,
        center: framed.center,
        framing: 'overview',
        // Read the real viewport width HERE — see getViewportWidthPx's doc
        // comment on publishCameraIntent above.
        padding: computeCameraPadding(getViewportWidthPx()),
      });
    },
    [cityCenter],
  );

  // Issue #1762 — sibling producer for a splittable LISTING-cluster tap.
  // Shares cameraIntentSeqRef with the other two producers above so
  // MapController's seq-guard treats all three as one monotonic stream.
  // Always framing='cluster' — distinct from publishClusterCameraIntent's
  // 'overview' (area clusters stay bounded to AREA_LAYER_MAX_ZOOM; a listing
  // cluster's whole point is to zoom PAST that band).
  const publishMarkerClusterCameraIntent = useCallback(
    (bounds: CameraIntent['bounds'], center: [number, number]) => {
      // Same degenerate-bbox fallback chain as the other two producers —
      // a cluster's own bounds collapsing to a coincident point (already
      // excluded by the caller's hasSpatialSpread gate, but defence in
      // depth costs nothing here) never fits a zero-area box.
      const framed = resolveCameraFraming({
        bbox: bounds,
        centroid: center,
        cityCentre: cityCenter,
      });
      cameraIntentSeqRef.current += 1;
      setCameraIntent({
        seq: cameraIntentSeqRef.current,
        bounds: framed.bounds,
        center: framed.center,
        framing: 'cluster',
        padding: computeCameraPadding(getViewportWidthPx()),
      });
    },
    [cityCenter],
  );

  // Issue #2088 (commit 6) — Recenter producer. See the CameraIntent.bypassSuppression
  // and UseDiscoverMapDataResult.publishRecenterCameraIntent doc comments above.
  const publishRecenterCameraIntent = useCallback(
    (bounds: CameraIntent['bounds'], center: [number, number], framing: CameraIntent['framing']) => {
      const framed = resolveCameraFraming({
        bbox: bounds,
        centroid: center,
        cityCentre: cityCenter,
      });
      cameraIntentSeqRef.current += 1;
      setCameraIntent({
        seq: cameraIntentSeqRef.current,
        bounds: framed.bounds,
        center: framed.center,
        framing,
        padding: computeCameraPadding(getViewportWidthPx()),
        bypassSuppression: true,
      });
    },
    [cityCenter],
  );

  // ── Derived: locality → areaKey map ──────────────────────────────────────
  const localityToAreaKey = useMemo(() => {
    const m = new Map<string, string>();
    trendsOpts?.defaultAreas.forEach((a) => m.set(a.areaLabel, a.areaKey));
    discoverAreasData?.areas.forEach((a) => {
      if (!m.has(a.name)) m.set(a.name, a.areaKey);
    });
    return m;
  }, [trendsOpts, discoverAreasData]);

  // ── Derived: trendsAreaKeys ───────────────────────────────────────────────
  const trendsAreaKeys = useMemo(() => {
    if (selectedArea) return [selectedArea.areaKey];
    if (isAuthenticated) {
      if (!filters.localities || filters.localities.length === 0) return [];
      return filters.localities.flatMap((loc) => {
        const k = localityToAreaKey.get(loc);
        return k ? [k] : [];
      });
    }
    return [];
  }, [selectedArea, isAuthenticated, filters.localities, localityToAreaKey]);

  // ── Pagination metadata ───────────────────────────────────────────────────
  const totalElements = discoverListingsPage?.totalElements ?? 0;
  const totalPages = discoverListingsPage?.totalPages ?? 0;

  // ── Issue #1956 PR 1 (FE-3, item 2): THE shared visible-member set ─────────
  // ADDITIVE AND INERT. Derived here because this hook is UPSTREAM of
  // useDiscoverMapPresentation (MapDiscovery threads `discoverAreas` from here
  // into there), so this is the only point at which ONE set can reach both the
  // map and the panel side. Nothing reads it yet — no render output changes.
  // See visibleMemberSet.ts for why one shared set (not two derivations) is
  // what AC1.12 actually requires.
  // Issue #2185 S2 — scopedAreaKeys preserves the exact pre-#2185 semantics
  // (the legacy #1597 group producer only); a 'node' scope is a DIFFERENT
  // geography shape (no client-visible member-area list — see the
  // no-client-side-node->areaKeys-synthesis constraint on this issue) and is
  // intentionally NOT folded in here.
  const scopedAreaKeys = scope.kind === 'areas' ? scope.areaKeys : undefined;
  const visibleMemberSet = useMemo(
    () =>
      deriveVisibleMemberSet({
        candidateAreaKeys: discoverAreas.map((a) => a.areaKey),
        scopedAreaKeys,
      }),
    [discoverAreas, scopedAreaKeys],
  );

  // ── Marker truncation metadata ────────────────────────────────────────────
  const markersTruncated = filteredMarkersData?.truncated ?? false;
  const markersReturnedElements = filteredMarkersData?.returnedElements;
  const markersTotalFilteredElements = filteredMarkersData?.totalFilteredElements;

  return {
    areasLoading,
    listingDataLoading,
    markersLoading,
    isLoadingAreaListings,
    isFetching,
    discoverAreas,
    discoverAreasData,
    agriAreasData,
    isLoadingAgriAreas,
    listingsWithCoords,
    filteredListings,
    markerListings,
    areaListings,
    isErrorAreaListings,
    refetchAreaListings,
    isFetchingAreaListings,
    schoolRadiusListings,
    schoolRadiusListingsLoading,
    schoolRadiusHasMore,
    areaMarkerListings,
    isAnonViewport,
    anonViewportListings,
    anonViewportMarkerListings,
    anonViewportListingsLoading,
    isErrorAnonViewport,
    refetchAnonViewport,
    isAuthViewport,
    authViewportListings,
    authViewportListingsLoading,
    isErrorAuthViewport,
    topLocalities,
    activeFocusBounds,
    localityToAreaKey,
    trendsAreaKeys,
    cityCenter,
    cityZoom,
    schoolById,
    schoolByIdLoading,
    schoolByIdError: schoolByIdError as Error | null,
    error,
    totalElements,
    totalPages,
    markersTruncated,
    markersReturnedElements,
    markersTotalFilteredElements,
    cameraIntent,
    publishCameraIntent,
    publishClusterCameraIntent,
    publishMarkerClusterCameraIntent,
    publishRecenterCameraIntent,
    visibleMemberSet,
  };
}
