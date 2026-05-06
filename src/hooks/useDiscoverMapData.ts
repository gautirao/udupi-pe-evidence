import { useMemo } from 'react';
import { PropertyFilters, PropertyListing, PropertyImage } from '@/hooks/usePropertyListings';
import { useDiscoverListings } from '@/hooks/useDiscoverListings';
import { useDiscoverFilteredMarkers } from '@/hooks/useDiscoverFilteredMarkers';
import { useTrendsOptions } from '@/hooks/useTrendsOptions';
import { useDiscoverAreas, DiscoverAreasResponse } from '@/hooks/useDiscoverAreas';
import { useDiscoverCityListings, DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import { useListingSearch } from '@/hooks/useListingSearch';
import { useSchoolById, SchoolResult } from '@/hooks/useSchoolSearch';
import { AreaPoint } from '@/components/map/AreaMarkerLayer';
import { computeFocusBounds } from '@/lib/mapUtils';
import { CITY_CONFIG } from '@/lib/localityUtils';
import {
  filteredMarkerToPropertyListing,
  discoverListingToPropertyListing,
  cityListingToPropertyListing,
} from '@/lib/discoverMappers';

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
  /** Current page for the listing cards panel (0-indexed). */
  page: number;
  /**
   * Optional viewport bounding box [south, west, north, east] extracted from the map.
   * Passed through to useDiscoverListings and useDiscoverFilteredMarkers, which snap
   * it to a 0.02° grid before including it in the API call and query key.
   * When null/undefined the backend falls back to the full city query.
   */
  bbox?: [number, number, number, number] | null;
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
  listingsWithCoords: (PropertyListing & { images?: PropertyImage[] })[];
  filteredListings: (PropertyListing & { images?: PropertyImage[] })[];
  markerListings: (PropertyListing & { images?: PropertyImage[] })[];
  areaListings: DiscoverCityListingItem[];
  areaMarkerListings: (PropertyListing & { images?: PropertyImage[] })[];
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
  page,
  bbox,
}: UseDiscoverMapDataParams): UseDiscoverMapDataResult {
  const isCityValid = city in CITY_CONFIG;

  // ── Memoized city config ──────────────────────────────────────────────────
  const cityCenter = useMemo(() => CITY_CONFIG[city]?.center, [city]);
  const cityZoom = useMemo(() => CITY_CONFIG[city]?.zoom, [city]);

  // ── Listing search (text) — unchanged path ────────────────────────────────
  const singleLocality = filters.localities?.length === 1 ? filters.localities[0] : undefined;
  const singlePropertyType = filters.propertyTypes?.length === 1 ? filters.propertyTypes[0] : undefined;
  const singleBedrooms = filters.bedrooms?.length === 1 ? filters.bedrooms[0] : undefined;

  const {
    data: searchResults,
    isLoading: searchLoading,
    error: searchError,
  } = useListingSearch({
    q: debouncedSearch,
    locality: singleLocality,
    propertyType: singlePropertyType,
    bedrooms: singleBedrooms,
  });

  // ── Paginated discover listings (auth-only) ────────────────────────────────
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
    enabled: isAuthenticated && !debouncedSearch,
    bbox,
  });

  // ── Filtered markers (auth-only, same predicate as listings) ──────────────
  const {
    data: filteredMarkersData,
    isLoading: filteredMarkersLoading,
    isFetching: filteredMarkersFetching,
  } = useDiscoverFilteredMarkers(city, filters, markersEnabled, bbox);

  // ── Static data ───────────────────────────────────────────────────────────
  const { data: trendsOpts } = useTrendsOptions(city, true, 50);
  const { data: discoverAreasData, isLoading: areasLoading } = useDiscoverAreas(isCityValid ? city : '');

  // Area listing cards (right panel detail view)
  const discoverMinPrice = filters.priceMin != null ? filters.priceMin * 100 : undefined;
  const discoverMaxPrice = filters.priceMax != null ? filters.priceMax * 100 : undefined;
  const discoverBedrooms = filters.bedrooms?.length === 1 ? filters.bedrooms[0] : undefined;
  const discoverPropertyType = filters.propertyTypes?.length === 1 ? filters.propertyTypes[0] : undefined;

  const { data: cityListingsData, isLoading: isLoadingAreaListings } = useDiscoverCityListings({
    city,
    areaKeys: selectedArea ? [selectedArea.areaKey] : [],
    limitPerArea: 5,
    minPrice: discoverMinPrice,
    maxPrice: discoverMaxPrice,
    bedrooms: discoverBedrooms,
    propertyType: discoverPropertyType,
  });

  const {
    data: schoolById,
    isLoading: schoolByIdLoading,
    error: schoolByIdError,
  } = useSchoolById(urlSchoolId);

  // ── Derived: loading / error ──────────────────────────────────────────────
  const listingDataLoading = isAuthenticated && (debouncedSearch ? searchLoading : discoverListingsLoading);
  const markersLoading = filteredMarkersLoading;
  /** True while a filter-change refetch is in-flight (isFetching && !isLoading). */
  const isFetching = isAuthenticated && (discoverListingsFetching || filteredMarkersFetching);
  const error = isAuthenticated ? (debouncedSearch ? (searchError as Error | null) : (discoverListingsError as Error | null)) : null;

  // ── Derived: listing sets ─────────────────────────────────────────────────
  const filteredListings = useMemo(() => {
    if (!isAuthenticated) return [];
    if (debouncedSearch) return searchResults ?? [];
    const now = new Date().toISOString();
    return (discoverListingsPage?.content ?? []).map((l) =>
      discoverListingToPropertyListing(l, now),
    );
  }, [isAuthenticated, debouncedSearch, searchResults, discoverListingsPage]);

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
      trendDirection: a.trendDirection as 'rising' | 'falling' | 'stable' | null | undefined,
    }));
  }, [discoverAreasData]);

  // ── Derived: area listings ────────────────────────────────────────────────
  const areaListings = useMemo(
    () => cityListingsData?.areas.find((a) => a.areaKey === selectedArea?.areaKey)?.listings ?? [],
    [cityListingsData, selectedArea],
  );

  const markerListings = useMemo((): (PropertyListing & { images?: PropertyImage[] })[] => {
    if (!filteredMarkersData?.markers) return [];
    const now = new Date().toISOString();
    return filteredMarkersData.markers.map((m) => filteredMarkerToPropertyListing(m, now));
  }, [filteredMarkersData]);

  const areaMarkerListings = useMemo((): (PropertyListing & { images?: PropertyImage[] })[] => {
    if (!selectedArea || areaListings.length === 0) return [];
    const now = new Date().toISOString();
    return areaListings
      .filter((l): l is typeof l & { lat: number; lon: number } => l.lat != null && l.lon != null)
      .map((l) => cityListingToPropertyListing(l, now));
  }, [selectedArea, areaListings]);

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

  return {
    areasLoading,
    listingDataLoading,
    markersLoading,
    isLoadingAreaListings,
    isFetching,
    discoverAreas,
    discoverAreasData,
    listingsWithCoords,
    filteredListings,
    markerListings,
    areaListings,
    areaMarkerListings,
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
  };
}
