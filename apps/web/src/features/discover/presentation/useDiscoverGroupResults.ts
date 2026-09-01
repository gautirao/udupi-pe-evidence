import { useMemo } from 'react';
import type { DiscoverListingItem, useDiscoverListings } from '@/hooks/useDiscoverListings';
import type { DiscoverCityListingItem, useDiscoverCityListings } from '@/hooks/useDiscoverCityListings';
import type { useDiscoverFilteredMarkers } from '@/hooks/useDiscoverFilteredMarkers';
import { PropertyListing, PropertyImage, PropertyFilters } from '@/hooks/usePropertyListings';
import { applyAnonPropertyFilters } from '@/features/discover/presentation/anonPropertyFilters';
import { filteredMarkerToPropertyListing } from '@/lib/discoverMappers';
import { resolveGroupResultsAnonMarkers } from '@/features/discover/adapters/anonMarkerAdapter';

type DiscoverListingsResult = ReturnType<typeof useDiscoverListings>;
type DiscoverCityListingsResult = ReturnType<typeof useDiscoverCityListings>;
type DiscoverFilteredMarkersResult = ReturnType<typeof useDiscoverFilteredMarkers>;

export interface UseDiscoverGroupResultsParams {
  isGroupResultsState: boolean;
  isAuthenticated: boolean;
  // ── Authenticated path inputs (from useDiscoverListings / useDiscoverFilteredMarkers) ──
  groupResultsAuthedData: DiscoverListingsResult['data'];
  isLoadingGroupResultsAuthed: boolean;
  isGroupResultsErrorAuthed: boolean;
  refetchGroupResultsAuthed: DiscoverListingsResult['refetch'];
  groupResultsMarkersData: DiscoverFilteredMarkersResult['data'];
  // ── Anonymous path inputs (from useDiscoverCityListings) ──
  groupResultsAnonData: DiscoverCityListingsResult['data'];
  isLoadingGroupResultsAnon: boolean;
  isGroupResultsErrorAnon: boolean;
  refetchGroupResultsAnon: DiscoverCityListingsResult['refetch'];
  anonGroupFilters: PropertyFilters;
}

export interface UseDiscoverGroupResultsResult {
  groupResultsListings: DiscoverListingItem[];
  groupResultsTotalElements: number | undefined;
  isLoadingGroupResults: boolean;
  isGroupResultsError: boolean;
  refetchGroupResults: DiscoverListingsResult['refetch'] | DiscoverCityListingsResult['refetch'];
  groupResultsMarkers: (PropertyListing & { images?: PropertyImage[] })[];
}

/**
 * Issue #1824 Slice S11b (C2) — the anon/auth group-results derivation, lifted
 * verbatim out of MapDiscovery.tsx (original L353-448). See
 * docs/audit/evidence/issue-1824-map-discovery-decomposition/slice-s11b-design.md.
 *
 * Behaviour-preserving lift-and-shift — bodies + dep arrays are byte-for-byte
 * from the original page. groupResultsAnonRaw/groupResultsAnonListings have no
 * reader outside this cluster and are kept INTERNAL (not returned).
 */
export function useDiscoverGroupResults({
  isGroupResultsState,
  isAuthenticated,
  groupResultsAuthedData,
  isLoadingGroupResultsAuthed,
  isGroupResultsErrorAuthed,
  refetchGroupResultsAuthed,
  groupResultsMarkersData,
  groupResultsAnonData,
  isLoadingGroupResultsAnon,
  isGroupResultsErrorAnon,
  refetchGroupResultsAnon,
  anonGroupFilters,
}: UseDiscoverGroupResultsParams): UseDiscoverGroupResultsResult {
  // ── Anon teaser filter audit ───────────────────────────────────────────────
  // applyAnonPropertyFilters reads these fields from each listing item.
  // Fields are checked against DiscoverCityListingItem (the public endpoint shape):
  //
  //   SUPPORTED — field present on DiscoverCityListingItem; safe to apply:
  //     propertyTypes  → l.propertyType      ✓ present
  //     bedrooms       → l.bedrooms           ✓ present
  //     priceMin/Max   → l.pricePaise         ✓ present
  //     dateFrom/dateTo → l.createdAt         ✓ present
  //
  //   STRIPPED — field ABSENT from DiscoverCityListingItem; would false-empty the teaser:
  //     backOnMarket   → l.backOnMarket       ✗ absent (SchoolRadiusListingItem extension only)
  //     newToMarket    → l.daysOnMarket       ✗ absent (SchoolRadiusListingItem extension only)
  //     readyToMove    → l.possessionStatus   ✗ absent (SchoolRadiusListingItem extension only)
  //
  //   NOT READ by applyAnonPropertyFilters — these may remain on the spread filter object but
  //   the helper never reads them, so they cannot affect the anon result (no false-empty):
  //     reraRegistered, sellerTypes, categoryFilters (school-journey only)
  //
  // This is the documented anon teaser limitation: the anon path is a reduced experience.
  // The authed full path (useDiscoverListings + useDiscoverFilteredMarkers) applies ALL filters
  // server-side and is unaffected by this stripping.

  // Flatten the multi-area response into a single list for rendering.
  // Strip the three unsupported flags before delegating to applyAnonPropertyFilters so no
  // active URL flag can silently zero the anon teaser.
  const groupResultsAnonRaw: DiscoverCityListingItem[] = useMemo(() => {
    if (!isGroupResultsState || isAuthenticated) return [];
    const raw = (groupResultsAnonData?.areas ?? []).flatMap((a) => a.listings);
    // Strip STRIPPED flags (see audit above) via destructuring so they are not forwarded to
    // applyAnonPropertyFilters (the public DiscoverCityListingItem shape lacks their backing fields).
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { backOnMarket: _bom, newToMarket: _ntm, readyToMove: _rtm, ...supportedFilters } =
      anonGroupFilters;
    return applyAnonPropertyFilters(
      raw as Parameters<typeof applyAnonPropertyFilters>[0],
      supportedFilters,
    ) as DiscoverCityListingItem[];
  }, [isGroupResultsState, isAuthenticated, groupResultsAnonData, anonGroupFilters]);

  // Normalise anon city-listing items to DiscoverListingItem shape so the unified surface
  // is correctly typed without unsafe casts. Fields absent from the public endpoint default
  // to null/0/false — values the panel already guards against (null-checks, optional renders).
  // heroImageUrl ← primaryImageUrl (different field name between the two response shapes).
  const groupResultsAnonListings: DiscoverListingItem[] = useMemo(
    () =>
      groupResultsAnonRaw.map((l): DiscoverListingItem => ({
        id: l.id,
        listingNumber: null,
        propertyType: l.propertyType ?? '',
        title: l.title ?? null,
        locality: l.locality ?? null,
        areaKey: null,
        pricePaise: l.pricePaise ?? null,
        landArea: l.landArea ?? null,
        landAreaUnit: l.landAreaUnit ?? null,
        builtArea: l.builtArea ?? null,
        builtAreaUnit: l.builtAreaUnit ?? null,
        bedrooms: l.bedrooms ?? null,
        latitude: l.lat ?? l.latitude ?? null,
        longitude: l.lon ?? l.longitude ?? null,
        heroImageUrl: l.primaryImageUrl ?? null,
        createdAt: l.createdAt ?? new Date(0).toISOString(),
        updatedAt: null,
        firstPublishedAt: null,
        lastUpdatedAt: null,
        daysOnMarket: 0,
        backOnMarket: false,
        reraNumber: null,
        reraValid: false,
        trustBadge: l.trustBadge ?? null,
        possessionStatus: null,
        sellerType: null,
        listingPurpose: l.listingPurpose ?? null,
        status: 'active',
      })),
    [groupResultsAnonRaw],
  );

  // ── Unified group-results surface (authed or anon) ──
  // The right panel and map always read from these unified variables so downstream code
  // (DiscoverRightPanel props, groupResultsMarkers) is unaffected by the auth split.
  const groupResultsListings: DiscoverListingItem[] = isAuthenticated
    ? (groupResultsAuthedData?.content ?? [])
    : groupResultsAnonListings;
  const groupResultsTotalElements = isAuthenticated
    ? groupResultsAuthedData?.totalElements
    : groupResultsAnonListings.length;
  const isLoadingGroupResults = isAuthenticated ? isLoadingGroupResultsAuthed : isLoadingGroupResultsAnon;
  const isGroupResultsError = isAuthenticated ? isGroupResultsErrorAuthed : isGroupResultsErrorAnon;
  const refetchGroupResults = isAuthenticated ? refetchGroupResultsAuthed : refetchGroupResultsAnon;

  // Issue #1597 — convert group-filtered markers to PropertyListingWithImages[] for PropertyMap.
  // Auth path: filteredMarkerToPropertyListing from /api/discover/markers (full predicate).
  // Anon path: resolveGroupResultsAnonMarkers (shared anonMarkerAdapter, issue #2145) derived
  // from groupResultsAnonRaw — falls back from lat/lon to latitude/longitude (issue #2089's
  // fix, matching resolveNodeListingsAnonMarkers) before filtering out items with no coords.
  // Returns [] when:
  //   - Not in the group-results state (no-op for all other panel states)
  //   - areaGroupsData is still loading (resolvedGroupAreaKeys is empty → hook disabled → data undefined)
  //   - The query is still in-flight
  // This ensures NO unfiltered markers leak to the map while the query is pending.
  const groupResultsMarkers = useMemo((): (PropertyListing & { images?: PropertyImage[] })[] => {
    if (!isGroupResultsState) return [];
    if (isAuthenticated) {
      if (!groupResultsMarkersData?.markers) return [];
      const now = new Date().toISOString();
      return groupResultsMarkersData.markers.map((m) => filteredMarkerToPropertyListing(m, now));
    }
    const now = new Date().toISOString();
    return resolveGroupResultsAnonMarkers(groupResultsAnonRaw, now);
  }, [isGroupResultsState, isAuthenticated, groupResultsMarkersData, groupResultsAnonRaw]);

  return {
    groupResultsListings,
    groupResultsTotalElements,
    isLoadingGroupResults,
    isGroupResultsError,
    refetchGroupResults,
    groupResultsMarkers,
  };
}
