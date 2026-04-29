import { useMemo } from 'react';
import { usePropertyListings, PropertyFilters, PropertyListing, PropertyImage } from '@/hooks/usePropertyListings';
import { useDiscoverMarkers } from '@/hooks/useDiscoverMarkers';
import { useTrendsOptions } from '@/hooks/useTrendsOptions';
import { useDiscoverAreas, DiscoverAreasResponse } from '@/hooks/useDiscoverAreas';
import { useDiscoverCityListings, DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import { useListingSearch } from '@/hooks/useListingSearch';
import { useSchoolSearch, SchoolResult } from '@/hooks/useSchoolSearch';
import { AreaPoint } from '@/components/map/AreaMarkerLayer';
import { computeFocusBounds, computeTopLocalities } from '@/lib/mapUtils';
import { CITY_CONFIG } from '@/lib/localityUtils';
import { markerToPropertyListing, cityListingToPropertyListing } from '@/lib/discoverMappers';

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
}

export interface UseDiscoverMapDataResult {
  // Loading flags
  areasLoading: boolean;
  listingDataLoading: boolean;
  markersLoading: boolean;
  isLoadingAreaListings: boolean;

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
  schoolSearchResults: SchoolResult[] | undefined;
  error: Error | null;
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
}: UseDiscoverMapDataParams): UseDiscoverMapDataResult {
  const isCityValid = city in CITY_CONFIG;

  // ── Memoized city config ──────────────────────────────────────────────────
  // Stabilize so PropertyMap doesn't get a new array reference on every render.
  const cityCenter = useMemo(() => CITY_CONFIG[city]?.center, [city]);
  const cityZoom = useMemo(() => CITY_CONFIG[city]?.zoom, [city]);

  // Merge city into filters so the React Query key changes on city switch and the
  // client-side city filter in usePropertyListings scopes results correctly.
  // `filters` is a stable useState ref from useDiscoverPageState — only changes
  // on user-driven filter actions, so this memo does not fire on every render.
  const filtersWithCity = useMemo(() => ({ ...filters, city }), [filters, city]);

  // ── Data hooks ───────────────────────────────────────────────────────────
  const {
    data: listings = [],
    isLoading: listingsLoading,
    error: listingsError,
  } = usePropertyListings(filtersWithCity);

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

  const { data: trendsOpts } = useTrendsOptions(city, true, 50);
  const { data: discoverAreasData, isLoading: areasLoading } = useDiscoverAreas(isCityValid ? city : '');
  const { data: markersData, isLoading: markersLoading } = useDiscoverMarkers(city, null, markersEnabled);

  // Map filter state to discover listing params.
  // priceMin/priceMax in PropertyFilters are rupees; backend expects paise.
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

  const { data: schoolSearchResults } = useSchoolSearch(urlSchoolId ?? '');

  // ── Derived: loading / error ──────────────────────────────────────────────
  const listingDataLoading = isAuthenticated && (debouncedSearch ? searchLoading : listingsLoading);
  const error = isAuthenticated ? (debouncedSearch ? searchError : listingsError) : null;

  // ── Derived: listing sets ─────────────────────────────────────────────────
  const filteredListings = useMemo(
    () =>
      isAuthenticated
        ? (debouncedSearch ? (searchResults ?? []) : listings)
        : [],
    [isAuthenticated, debouncedSearch, searchResults, listings],
  );

  // Anonymous users: no lat/lon in teaser response — pass empty array so no pins render.
  const listingsWithCoords = useMemo(
    () =>
      isAuthenticated
        ? filteredListings.filter((l) => l.latitude && l.longitude)
        : [],
    [isAuthenticated, filteredListings],
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
    if (!markersData?.markers) return [];
    const now = new Date().toISOString();
    return markersData.markers.map((m) => markerToPropertyListing(m, now));
  }, [markersData]);

  const areaMarkerListings = useMemo((): (PropertyListing & { images?: PropertyImage[] })[] => {
    if (!selectedArea || areaListings.length === 0) return [];
    const now = new Date().toISOString();
    return areaListings
      .filter((l): l is typeof l & { lat: number; lon: number } => l.lat != null && l.lon != null)
      .map((l) => cityListingToPropertyListing(l, now));
  }, [selectedArea, areaListings]);

  // ── Derived: top localities & focus bounds ────────────────────────────────
  const topLocalities = useMemo(
    () => computeTopLocalities(listingsWithCoords),
    [listingsWithCoords],
  );

  const focusBounds = useMemo(
    () => computeFocusBounds(listingsWithCoords, filters.localities ?? []),
    [filters.localities, listingsWithCoords],
  );

  // fitTick is in the dep array solely to force a new reference on refit clicks
  const activeFocusBounds = useMemo(() => {
    void fitTick; // ← do NOT delete this line
    return focusBounds;
  }, [focusBounds, fitTick]);

  // ── Derived: locality → areaKey map ──────────────────────────────────────
  // Primary source: area_overview_stats via /api/trends/options (backend-authoritative, limit=50).
  // Secondary: /api/discover/areas (all seeded areas, including zero-listing).
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

  return {
    areasLoading,
    listingDataLoading,
    markersLoading,
    isLoadingAreaListings,
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
    schoolSearchResults,
    error,
  };
}
