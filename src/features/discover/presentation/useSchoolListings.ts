import { useMemo } from 'react';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import type { SchoolRadiusListingItem } from '@/hooks/useSchoolRadiusListings';
import type { DiscoverUrlState } from '@/hooks/useDiscoverUrlState';
import { clampSchoolRadiusKm, PropertyListing, PropertyImage, PropertyFilters } from '@/hooks/usePropertyListings';
import { applyAnonPropertyFilters, deriveAnonSchoolRadiusMarkers } from '@/features/discover/presentation/anonPropertyFilters';

export interface UseSchoolListingsParams {
  isAuthenticated: boolean;
  filters: PropertyFilters;
  areaListings: DiscoverCityListingItem[];
  schoolRadiusListings: SchoolRadiusListingItem[];
  filteredListings: (PropertyListing & { images?: PropertyImage[] })[];
  journey: DiscoverUrlState['journey'];
  schoolId: DiscoverUrlState['schoolId'];
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
}: UseSchoolListingsParams): UseSchoolListingsResult {
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
          return applyAnonPropertyFilters(schoolRadiusListings, filters);
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
        // l.trustTier here is the DEALER contract's raw internal letter grade
        // (A/B/C/D — see usePropertyListings.ts), not the public-safe badge word.
        // DiscoverCityListingItem.trustBadge is public vocabulary only
        // ("verified"/"trusted"/"listed"); the letter-to-word mapping is a backend-only
        // concern (TrustBadge.java) and must never be replicated client-side (#1567/#1616).
        // The dealer endpoint does not (yet) expose a public-safe badge field, so there is
        // no honest value to pass through here — null (no badge) is correct, not a regression.
        trustBadge: null,
        lat: l.latitude,
        lon: l.longitude,
      }));
    },
    [isAuthenticated, areaListings, schoolRadiusListings, filteredListings, filters],
  );

  // Issue #1261 rev2 (AC11) — radius-filtered marker pins from the PUBLIC school-radius
  // endpoint for both auth and anon users. For anon: always the primary marker source
  // (auth marker endpoint is disabled). For auth: serves as marker fallback BEFORE the
  // #1115 bounded-search CTA is triggered (markersEnabled=false → schoolRadiusEnabled=true
  // in the hook, so schoolRadiusListings is populated). Once CTA fires, markersEnabled
  // becomes true, schoolRadiusEnabled becomes false, schoolRadiusListings drains, and the
  // IIFE below switches to the richer auth markerListings instead.
  // Derives from schoolRadiusListings (public endpoint, server-side ST_DWithin — genuinely
  // radius-filtered) rather than schoolListings (which for auth users = city-wide
  // filteredListings — NOT radius-filtered, wrong source for marker pins).
  const schoolRadiusFallbackMarkers = useMemo(
    () =>
      journey === 'school-first' && schoolId
        ? deriveAnonSchoolRadiusMarkers(schoolRadiusListings)
        : [],
    [journey, schoolId, schoolRadiusListings],
  );

  return { schoolListings, schoolRadiusFallbackMarkers };
}
