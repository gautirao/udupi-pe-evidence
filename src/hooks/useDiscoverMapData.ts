import { useMemo } from 'react';
import { PropertyFilters, PropertyListing, PropertyImage, clampSchoolRadiusKm } from '@/hooks/usePropertyListings';
import { useDiscoverListings } from '@/hooks/useDiscoverListings';
import { useDiscoverFilteredMarkers } from '@/hooks/useDiscoverFilteredMarkers';
import { useTrendsOptions } from '@/hooks/useTrendsOptions';
import { useDiscoverAreas, DiscoverAreasResponse, DiscoverArea } from '@/hooks/useDiscoverAreas';
import { useDiscoverCityListings, DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import { useSchoolRadiusListings, mapSchoolRadiusCard, SchoolRadiusListingItem } from '@/hooks/useSchoolRadiusListings';
import { useSchoolById, SchoolResult } from '@/hooks/useSchoolSearch';
import type { DiscoverJourney } from '@/hooks/useDiscoverUrlState';
import { AreaPoint } from '@/components/map/AreaMarkerLayer';
import { computeFocusBounds } from '@/lib/mapUtils';
import { CITY_CONFIG } from '@/lib/localityUtils';
import { AGRICULTURAL_LAND_PROPERTY_TYPE } from '@/lib/listing-constants';
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
  /**
   * Issue #1371 — active Discover journey from URL state. When 'agri-first',
   * the hook makes a SEPARATE agri-scoped useDiscoverAreas call (queryKey includes
   * 'agricultural_land' — AC10 cache-key isolation) and forces propertyType into
   * the area-click listings fetch. The BLENDED useDiscoverAreas (AreaPoint path) is
   * NEVER affected — AreaPoint.listingCount always reflects the blended count.
   */
  journey?: DiscoverJourney | null;
  /**
   * Issue #1494 — buy/rent intent mapped to backend listingPurpose ('sale'|'rent').
   * When undefined or 'sale', no listing_purpose filter is applied (backward-compatible).
   */
  listingPurpose?: string;
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
  journey,
  listingPurpose,
}: UseDiscoverMapDataParams): UseDiscoverMapDataResult {
  const isCityValid = city in CITY_CONFIG;

  // ── Memoized city config ──────────────────────────────────────────────────
  const cityCenter = useMemo(() => CITY_CONFIG[city]?.center, [city]);
  const cityZoom = useMemo(() => CITY_CONFIG[city]?.zoom, [city]);

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
    enabled: isAuthenticated,
    bbox,
    q: debouncedSearch || undefined,
    listingPurpose,
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
  } = useDiscoverFilteredMarkers(city, agriFilters, markersEnabled, bbox, debouncedSearch?.trim() || undefined, listingPurpose, excludePropertyType);

  // ── Static data ───────────────────────────────────────────────────────────
  const { data: trendsOpts } = useTrendsOptions(city, true, 50);
  // Blended areas — feeds AreaPoint.listingCount + map markers. NEVER filtered by propertyType.
  const { data: discoverAreasData, isLoading: areasLoading } = useDiscoverAreas(isCityValid ? city : '');

  // Issue #1371 — agri-scoped area summary. Only enabled in agri-first journey.
  // Uses a SEPARATE cache key (['discover-areas', city, 'agricultural_land']) so React Query
  // cannot cross-serve this with the blended response (AC10).
  // isAgriJourney is declared above (before agriFilters) — reused here.
  const {
    data: agriAreasResponseData,
    isLoading: isLoadingAgriAreas,
  } = useDiscoverAreas(isCityValid ? city : '', isAgriJourney ? AGRICULTURAL_LAND_PROPERTY_TYPE : undefined);
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

  const { data: cityListingsData, isLoading: isLoadingAreaListings } = useDiscoverCityListings({
    city,
    areaKeys: selectedArea ? [selectedArea.areaKey] : [],
    limitPerArea: 50, // Issue #1122: raised from 5; backend clamps at 20 server-side (effective ceiling = 20)
    minPrice: discoverMinPrice,
    maxPrice: discoverMaxPrice,
    bedrooms: discoverBedrooms,
    propertyType: discoverPropertyType,
    q: debouncedSearch?.trim() || undefined,
    listingPurpose,
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
  const areaListings = useMemo(
    () => cityListingsData?.areas.find((a) => a.areaKey === selectedArea?.areaKey)?.listings ?? [],
    [cityListingsData, selectedArea],
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
    schoolRadiusListings,
    schoolRadiusListingsLoading,
    schoolRadiusHasMore,
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
    markersTruncated,
    markersReturnedElements,
    markersTotalFilteredElements,
  };
}
