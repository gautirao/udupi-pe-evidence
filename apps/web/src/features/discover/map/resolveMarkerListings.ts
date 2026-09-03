import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { PropertyListingWithImages } from '@/components/map/PropertyMap';
import type { DiscoverMapLayerKind } from '@/utils/discoverLayerRegistry';
import type { DiscoverJourney } from '@/hooks/useDiscoverUrlState';

/**
 * Issue #1824 Slice S3 — pure-selector extraction of the `currentMapMarkerListings`
 * resolution IIFE (previously inline at MapDiscovery.tsx L3244-3337). VERBATIM logic
 * transposition: branch order, the `<=` zoom comparison, and the nested-ternary
 * evaluation order are all load-bearing and must not be altered. See
 * docs/audit/evidence/issue-1824-map-discovery-decomposition/slice-s3-design.md.
 *
 * All 15 fields are REQUIRED (non-optional) so a dropped input at the call site is a
 * tsc error — a compile-time guard against the exact silent city-wide-marker-leak
 * failure mode this selector exists to prevent (see the FIX-1 / FIX-2 comments below).
 */
export interface ResolveMarkerListingsInput {
  mapLayerCategory: DiscoverMapLayerKind;
  selectedArea: AreaPoint | null;
  isGroupResultsState: boolean;
  /** Issue #2089 — bounded Browse state (`node`+`nodeListings=1`). True as soon as
   *  the URL flag is set, independent of whether the node/areaKeys have resolved
   *  yet (mirrors isGroupResultsState's loading-race handling). */
  isNodeListingsState: boolean;
  mapZoom: number;
  /** MapDiscovery's local AREA_LAYER_MAX_ZOOM const, passed in rather than duplicated
   *  or centralized (issue #1823 is an open, separate centralization effort). */
  areaLayerMaxZoom: number;
  isAuthenticated: boolean;
  journey: DiscoverJourney | null;
  schoolId: string | null;
  groupResultsMarkers: PropertyListingWithImages[];
  /** Issue #2089 — bounded Browse node-scoped markers (descendantAreaKeys / areaKey
   *  of the active `node`). [] while resolving or when the node has no listings;
   *  same empty-areaKeys-guard shape as groupResultsMarkers. */
  nodeListingsMarkers: PropertyListingWithImages[];
  markerListings: PropertyListingWithImages[];
  areaMarkerListings: PropertyListingWithImages[];
  schoolRadiusFallbackMarkers: PropertyListingWithImages[];
  isLoadingAreaListings: boolean;
  isErrorAreaListings: boolean;
  markersLoading: boolean;
  /**
   * Issue #2015 — true only for an anonymous caller with a COMMITTED VIEWPORT
   * `resultScope` ("Search this area"). Mirrors `useDiscoverMapData.ts`'s
   * `isAnonViewport` exactly (not re-derived here) so this selector and the query that
   * populates `anonViewportMarkerListings` can never disagree on when the branch is
   * active.
   */
  isAnonViewport: boolean;
  /**
   * Issue #2015 — anon-safe, band-priced marker set for the committed VIEWPORT scope,
   * sourced exclusively from the public bbox-only `GET /api/discover/cities/{city}/listings`
   * mode (never the auth-only `/api/discover/markers`/`/api/discover/listings` — #1118).
   * Only consulted when `isAnonViewport` is true.
   */
  anonViewportMarkerListings: PropertyListingWithImages[];
}

export function resolveMarkerListings(input: ResolveMarkerListingsInput): PropertyListingWithImages[] {
  const {
    mapLayerCategory,
    selectedArea,
    isGroupResultsState,
    isNodeListingsState,
    mapZoom,
    areaLayerMaxZoom,
    isAuthenticated,
    journey,
    schoolId,
    groupResultsMarkers,
    nodeListingsMarkers,
    markerListings,
    areaMarkerListings,
    schoolRadiusFallbackMarkers,
    isLoadingAreaListings,
    isErrorAreaListings,
    markersLoading,
    isAnonViewport,
    anonViewportMarkerListings,
  } = input;

  // Issue #1745 Batch B map-hierarchy fix — zoom-independent grouped/landing
  // check (mapLayerCategory ignores the current zoom bucket by construction),
  // so listing markers stay suppressed at these states even if the user
  // manually zooms in. Extends the pre-existing isTopGroupedAreaOrSchool /
  // isTopGroupedAgri suppression to the two NEW journeyless-landing states
  // (macro-region-bubbles / region-zone-areas), matching AC1/AC2 ("no listing
  // markers"); every other state (area/school/agri drill-down) is unaffected —
  // mapLayerCategory resolves to 'all-areas' or 'agri-drilldown' there, neither
  // of which is in this list, so this line is a no-op for those states exactly
  // as before.
  if (
    mapLayerCategory === 'area-group-bubbles' ||
    mapLayerCategory === 'agri-corridor-bubbles' ||
    mapLayerCategory === 'macro-region-bubbles' ||
    mapLayerCategory === 'region-zone-areas'
  ) return [];
  // Issue #2089 — bounded Browse bypasses the zoom-suppression threshold, same
  // as the group-results carve-out below (#2087 already does this for the
  // markersEnabled gate upstream; this mirrors it in the selector itself so a
  // bounded-Browse session opened at/below areaLayerMaxZoom is not silently
  // suppressed to []).
  if (!selectedArea && !isGroupResultsState && !isNodeListingsState && mapZoom <= areaLayerMaxZoom) return [];
  // Issue #2015 — a committed anon VIEWPORT scope ("Search this area") is checked here,
  // ahead of the legacy group/node/journey/selectedArea branches below. Per #2016's
  // ResultScope contract, resultScope is "the single canonical geography that controls
  // which listings/markers/totals are shown on Discover, strictly separate from
  // navigation" — so once VIEWPORT is committed it takes priority over those
  // navigation-derived states, while still respecting the zoom/layer-category
  // suppression check immediately above (unchanged — an independent map-UX rule).
  if (isAnonViewport) return anonViewportMarkerListings;
  // Issue #1597 — area-group-results state: serve ONLY the group-filtered
  // markers. Must come before the area-first/school-first branches so no
  // unfiltered city-wide markerListings leak as ghost/shadow markers.
  // groupResultsMarkers is [] when the query is pending or the group has no
  // resolved area_keys (empty-areaKeys guard prevents the fetch).
  if (isGroupResultsState) return groupResultsMarkers;
  // Issue #2089 — bounded Browse (node + nodeListings=1): serve ONLY the
  // node-scoped markers. Intentionally checked AFTER isGroupResultsState above
  // (isGroupResultsState wins if both are somehow true) — must come before
  // journey/selectedArea branches (same no-leakage ordering rationale as
  // isGroupResultsState above) so a bounded
  // node whose scope isn't a single "selectedArea" (e.g. a group/region node
  // with multiple descendant areas) never falls through to the unscoped
  // city-wide markerListings tail branch.
  if (isNodeListingsState) return nodeListingsMarkers;
  // school-first journey
  if (journey === 'school-first') {
    // schoolId set: proximity markerListings drive the school-radius surface.
    // Issue #1118: before school selection, markersEnabled was false so
    // placeholderData has no previous data. Keep area markers visible until
    // the school-proximity query settles to avoid a blank-map flash.
    if (schoolId) {
      // Issue #1261 rev2 (AC11+AC12) — three-tier marker priority for school-radius:
      //
      // Tier 1: richer auth markers (markersEnabled=true, CTA triggered, query resolved).
      if (markerListings.length > 0) return markerListings;
      //
      // Tier 2: school-radius fallback markers (both auth+anon). schoolRadiusFallbackMarkers
      // derives from schoolRadiusListings (public endpoint, server-side ST_DWithin —
      // genuinely radius-filtered). For anon: always active (auth endpoint disabled).
      // For auth: active before CTA (schoolRadiusEnabled=!markersEnabled=true in the hook);
      // drains automatically once markersEnabled flips true (auth query fires).
      // This satisfies the product truth: markers visible for ALL users regardless of auth.
      if (schoolRadiusFallbackMarkers.length > 0) return schoolRadiusFallbackMarkers;
      //
      // Tier 3: area-scoped markers while the auth proximity query is in-flight
      // (markersLoading=true after CTA, before the first /api/discover/markers response).
      if (markersLoading && selectedArea && areaMarkerListings.length > 0) {
        return areaMarkerListings;
      }
      return [];
    }
    // Issue #1074 Slice A: school-first + areaKey (no schoolId) → surface
    // the area's property markers alongside the schools list. Mirrors the
    // area-first fallback below.
    if (selectedArea) {
      // Issue #1806 (FIX-2 / DIRECTIVE 1) — see the area-first branch below
      // for the full settled/error/genuinely-empty rationale (identical here).
      return isLoadingAreaListings
        ? []
        : (areaMarkerListings.length > 0
            ? areaMarkerListings
            : (isErrorAreaListings ? markerListings : []));
    }
    return [];
  }
  // area-first or area-selected: show property markers for the selected area
  // Works for both explicit area-first journey AND implicit area selection
  if (selectedArea) {
    // Issue #1806 (FIX-2 / DIRECTIVE 1) — a selected area with genuinely
    // ZERO listings must show an empty state, not borrowed markers from
    // elsewhere (the original bug: after FIX-1, `markerListings` is
    // group-scoped rather than city-wide, so falling back to it here would
    // still leak "other areas in the same group" — still a scope lie).
    //
    // "Settled" = !isLoadingAreaListings (query is no longer pending — it
    // has resolved to either success or error). Within settled, distinguish:
    //   - areaMarkerListings non-empty → the area has real listings; use them.
    //   - settled + empty + isErrorAreaListings → the area-listings query
    //     itself failed (404/500/timeout — previously indistinguishable from
    //     a genuinely empty area, since useDiscoverCityListings' error state
    //     was never extracted at the useDiscoverMapData call site). Preserve
    //     the pre-existing fallback ONLY for this case, so a query failure
    //     still shows something rather than a silently blank map.
    //   - settled + empty + NOT isErrorAreaListings → the area genuinely has
    //     zero listings with coordinates. Return [] — never markerListings.
    return isLoadingAreaListings
      ? []
      : (areaMarkerListings.length > 0
          ? areaMarkerListings
          : (isErrorAreaListings ? markerListings : []));
  }
  // No area selected: show markers only if authenticated
  return isAuthenticated ? markerListings : [];
}
