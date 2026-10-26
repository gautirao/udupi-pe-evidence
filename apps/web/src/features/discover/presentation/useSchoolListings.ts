import { useMemo } from 'react';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import type { SchoolRadiusListingItem } from '@/hooks/useSchoolRadiusListings';
import type { DiscoverUrlState } from '@/hooks/useDiscoverUrlState';
import { clampSchoolRadiusKm, PropertyListing, PropertyImage, PropertyFilters } from '@/hooks/usePropertyListings';
import {
  applyAnonPropertyFilters,
  deriveAnonSchoolRadiusMarkers,
  filterSchoolRadiusListingsByAreaBbox,
} from '@/features/discover/presentation/anonPropertyFilters';

export interface UseSchoolListingsParams {
  isAuthenticated: boolean;
  filters: PropertyFilters;
  areaListings: DiscoverCityListingItem[];
  schoolRadiusListings: SchoolRadiusListingItem[];
  filteredListings: (PropertyListing & { images?: PropertyImage[] })[];
  journey: DiscoverUrlState['journey'];
  schoolId: DiscoverUrlState['schoolId'];
  /**
   * Issue #2183 — the area the school was picked within (null for pure
   * school-first with no area context). When set, its bbox is used to keep
   * the anon/pre-CTA school-radius fallback sources (schoolListings' anon
   * branch and schoolRadiusFallbackMarkers) consistent with the
   * authenticated path's area+school-radius combined scoping. See
   * filterSchoolRadiusListingsByAreaBbox's doc comment for the full
   * rationale.
   */
  selectedArea: AreaPoint | null;
}

export interface UseSchoolListingsResult {
  schoolListings: DiscoverCityListingItem[];
  schoolRadiusFallbackMarkers: (PropertyListing & { images?: PropertyImage[] })[];
}

/**
 * Issue #1824 Slice S11b (C3) — the school-listings + school-radius-fallback-markers
 * derivation, lifted verbatim out of MapDiscovery.tsx (original L1018-1093). See
 * docs/audit/evidence/issue-1824-map-discovery-decomposition/slice-s11b-design.md.
 *
 * Behaviour-preserving lift-and-shift — bodies + dep arrays are byte-for-byte
 * from the original page. MUST be called BEFORE the page-local discoverBadge
 * useMemo, which reads schoolListings.length (Issue #1175 v2 / #1152).
 */
export function useSchoolListings({
  isAuthenticated,
  filters,
  areaListings,
  schoolRadiusListings,
  filteredListings,
  journey,
  schoolId,
  selectedArea,
}: UseSchoolListingsParams): UseSchoolListingsResult {
  // Issue #2806 — when the public `/school-radius-listings` request was already
  // server-scoped by `schoolAreaKey` (combined Area+School with no drawn polygon,
  // or explicit `filters.schoolAreaKey`) AND the current `schoolRadiusListings`
  // belong to that same scope (verified via `scopedAreaKey` or matching `areaKey`,
  // never stale placeholder rows from a previous Area), do NOT re-filter
  // `schoolRadiusListings` client-side with `selectedArea.bbox`: public coordinates
  // are privacy-coarsened via `GeoCoarsener.coarsen` (2 decimal places), so client
  // bbox clipping can falsely drop boundary listings that satisfied the server's
  // exact Area bounds. Preserve the legacy #2183 client bbox-filter fallback when
  // not server-scoped or when rows carry a mismatched previous-scope area key.
  const targetSchoolAreaKey = !filters.polygon
    ? (filters.schoolAreaKey ?? (schoolId && selectedArea?.areaKey ? selectedArea.areaKey : null))
    : null;
  const isServerScopedBySchoolAreaKey =
    targetSchoolAreaKey != null &&
    schoolRadiusListings.every((item) =>
      item.scopedAreaKey !== undefined
        ? item.scopedAreaKey === targetSchoolAreaKey
        : item.areaKey == null || item.areaKey === targetSchoolAreaKey,
    );
  const areaScopedSchoolRadiusListings = useMemo(
    () =>
      isServerScopedBySchoolAreaKey
        ? schoolRadiusListings
        : filterSchoolRadiusListingsByAreaBbox(schoolRadiusListings, selectedArea?.bbox),
    [isServerScopedBySchoolAreaKey, schoolRadiusListings, selectedArea],
  );
  // Convert filteredListings (PropertyListing[]) to DiscoverCityListingItem[] for
  // SchoolSelectedPanel card list. filteredListings is the school-proximity-filtered
  // set when schoolLat/Lon/RadiusKm filters are active.
  //
  // Issue #1122 — anonymous school-first path: filteredListings is always [] for anon
  // users because useDiscoverListings / useDiscoverFilteredMarkers are auth-gated.
  // Fall back to areaListings (from the public /api/discover/cities/{city}/listings
  // endpoint) so SchoolSelectedPanel cards are populated with full listing data.
  // areaListings is already typed as DiscoverCityListingItem[] — no mapping needed.
  //
  // Issue #1175 v2 — schoolListings is declared BEFORE discoverBadge so its .length
  // can be passed as schoolListingsCount into deriveDiscoverBadge without a second scan.
  const schoolListings = useMemo(
    (): DiscoverCityListingItem[] => {
      if (!isAuthenticated) {
        const sLat = filters.schoolLat;
        const sLon = filters.schoolLon;
        // Issue #1210: clamp so a 0 km radius does not silently filter out every
        // listing; the anon path mirrors the auth haversine filter's clamp.
        const radius = filters.schoolRadiusKm != null ? clampSchoolRadiusKm(filters.schoolRadiusKm) : null;
        if (sLat != null && sLon != null && radius != null) {
          // Issue #1261 — anon school-radius now sources from the PUBLIC
          // /school-radius-listings endpoint (cross-area, server-side ST_DWithin),
          // replacing the old single-area haversine over areaListings. The radius
          // circle now matches the listing set across area boundaries.
          //
          // DECISION-1 (Option A): the active PropertyFilters are NOT sent to this
          // endpoint (it has no filter params), so apply them CLIENT-SIDE here for
          // parity with the auth path. Only filters whose backing fields exist in the
          // 20-field anon contract are honoured. reraRegistered and sellerTypes rely on
          // server-EXCLUDED fields (reraNumber/sellerType) and are intentionally NOT
          // applied — anon never sees those fields (AC6).
          return applyAnonPropertyFilters(areaScopedSchoolRadiusListings, filters);
        }
        // No active school radius — fall back to area-scoped public browse.
        return areaListings;
      }
      // Authenticated path: map proximity-filtered listings (unchanged behaviour).
      return filteredListings.map((l) => ({
        id: l.id,
        propertyType: l.property_type,
        title: l.title,
        locality: l.locality,
        pricePaise: l.price != null ? l.price * 100 : undefined,
        primaryImageUrl: l.images?.[0]?.url ?? null,
        listingPurpose: l.listing_purpose,
        bedrooms: l.bedrooms,
        bathrooms: l.bathrooms,
        builtArea: l.built_area,
        builtAreaUnit: l.built_area_unit,
        landArea: l.land_area,
        landAreaUnit: l.land_area_unit,
        totalFloors: l.total_floors,
        parkingCount: l.parking_count,
        furnishingStatus: l.furnishing_status,
        createdAt: l.created_at,
        // Issue #1954 — l.trustTier (if present) is the DEALER contract's raw internal
        // letter grade (A/B/C/D — see usePropertyListings.ts) and must NEVER be read or
        // mapped here; only the public trustBadge word is safe to surface. That word is
        // now available on the auth discover-listings path (DiscoverListingItem.trustBadge,
        // threaded through discoverListingToPropertyListing), so pass it through instead of
        // hardcoding null. The letter-to-word mapping remains a backend-only concern
        // (TrustBadge.java) and must never be replicated client-side (#1567/#1616).
        trustBadge: l.trustBadge ?? null,
        lat: l.latitude,
        lon: l.longitude,
      }));
    },
    [isAuthenticated, areaListings, areaScopedSchoolRadiusListings, filteredListings, filters],
  );

  // Issue #1261 rev2 (AC11) — radius-filtered marker pins, active for both auth and
  // anon users. For anon: always the primary marker source (auth marker endpoint is
  // disabled). For auth: serves as marker fallback BEFORE the #1115 bounded-search
  // CTA is triggered (markersEnabled=false pre-CTA, so Tier 1's markerListings from
  // /api/discover/markers is empty — see resolveMarkerListings.ts). Once the CTA
  // fires, markersEnabled becomes true and markerListings populates, so
  // resolveMarkerListings' Tier 1 takes over from this fallback.
  //
  // Issue #2184 (fix-cycle, #2183 10km-radius investigation) — for AUTHENTICATED
  // users this now derives from `filteredListings`, not the anon
  // `areaScopedSchoolRadiusListings` (bbox-filtered view of the PUBLIC
  // /school-radius-listings endpoint). Root cause: that public endpoint is a
  // capped, city-wide `page=0&size=50` window (DECISION-2) with no ordering
  // guarantee that a given area's matches land within the first page —
  // `hasMore: true` is common. Once the #2183 fix additionally bbox-filters that
  // incomplete window, the intersection can spuriously come up empty even though
  // real, in-radius, in-area listings exist (confirmed live: 50-row public page
  // contained zero Jayanagar rows while the authenticated combined polygon+radius
  // query correctly returned 6). `filteredListings` has no such gap: it is the
  // SAME backend query (`effectiveFilters`, which already applies the area-bbox
  // `polygon` AND `schoolLat`/`schoolLon`/`schoolRadiusKm` server-side — see
  // useDiscoverMapDataController.ts) that `schoolListings`' authenticated branch
  // above already maps into panel cards, and is fetched unconditionally
  // (`listingsEnabled` does not depend on the bounded-search CTA). It still
  // shares the same page=0&size=50 cap as the panel — unlike the public
  // endpoint, that cap is applied AFTER the server-side area+radius filter, not
  // before, so panel and map agree by construction even at the cap. A
  // selected area+radius with genuinely >50 matches is a separate, pre-existing
  // pagination question, out of scope for this fix. Using it here guarantees
  // the map's pre-CTA fallback marker count agrees with the panel's listing
  // count, for both the combined (area+school) and pure school-first states.
  //
  // Anon users keep the pre-existing area-bbox-scoped public-endpoint derivation
  // (deriveAnonSchoolRadiusMarkers over areaScopedSchoolRadiusListings) — there is
  // no authenticated-only combined backend query available to anon callers, so
  // the public endpoint remains the best available source for them.
  const schoolRadiusFallbackMarkers = useMemo(
    () => {
      if (journey !== 'school-first' || !schoolId) return [];
      if (isAuthenticated) {
        return filteredListings.filter((l) => l.latitude != null && l.longitude != null);
      }
      return deriveAnonSchoolRadiusMarkers(areaScopedSchoolRadiusListings);
    },
    [journey, schoolId, isAuthenticated, filteredListings, areaScopedSchoolRadiusListings],
  );

  return { schoolListings, schoolRadiusFallbackMarkers };
}
