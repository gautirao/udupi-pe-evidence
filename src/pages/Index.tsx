import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { PropertyMap } from '@/components/map/PropertyMap';
import { MapFilters } from '@/components/map/MapFilters';
import { usePropertyListings, PropertyFilters, PropertyListing, PropertyImage, PropertyType, useLocalities } from '@/hooks/usePropertyListings';
import { useDiscoverMarkers } from '@/hooks/useDiscoverMarkers';
import { useTrendsOptions } from '@/hooks/useTrendsOptions';
import { useDiscoverAreas } from '@/hooks/useDiscoverAreas';
import { useDiscoverCityListings } from '@/hooks/useDiscoverCityListings';
import { AreaPoint } from '@/components/map/AreaMarkerLayer';
import { CitySelect } from '@/components/discover/CitySelect';
import { DiscoverRightPanel } from '@/components/discover/DiscoverRightPanel';
import { useListingSearch } from '@/hooks/useListingSearch';
import { SchoolResult, useSchoolSearch } from '@/hooks/useSchoolSearch';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, MapPin, X, PenTool, GraduationCap, LogIn, Maximize2 } from 'lucide-react';
import { formatPrice } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { computeFocusBounds, computeTopLocalities } from '@/lib/mapUtils';
import { toggleLocality, isAtCap, CITY_CONFIG, DEFAULT_CITY } from '@/lib/localityUtils';
import { useAuth } from '@/contexts/AuthContext';

export const isNew = (createdAt: string | null | undefined): boolean => {
  if (!createdAt) return false;
  const t = new Date(createdAt).getTime();
  return !isNaN(t) && Date.now() - t <= 7 * 24 * 60 * 60 * 1000;
};

/** Zoom-band threshold: area overview rings show at zoom ≤ this; individual listing clusters show above it. */
const AREA_LAYER_MAX_ZOOM = 12;

export default function Index() {
  const { user, isLoading: authLoading } = useAuth();
  const [urlParams, setUrlParams] = useSearchParams();
  const [filters, setFilters] = useState<PropertyFilters>({});
  const [selectedArea, setSelectedArea] = useState<AreaPoint | null>(null);
  const [panToArea, setPanToArea] = useState<AreaPoint | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [mapZoom, setMapZoom] = useState<number>(CITY_CONFIG[DEFAULT_CITY]?.zoom ?? 11);

  // Map readiness: set to true once Leaflet's MapContainer has initialised.
  // Prevents the loader from disappearing the moment the map DOM mounts,
  // before area marker data has arrived.
  const [mapReady, setMapReady] = useState(false);

  // Delayed-show: only render the full-screen spinner if the load takes > 200 ms.
  // This prevents a visible flicker on fast loads / warm cache hits.
  const [showLoader, setShowLoader] = useState(false);

  // School search state
  const [selectedSchool, setSelectedSchool] = useState<SchoolResult | null>(null);
  const [schoolBoardFilter, setSchoolBoardFilter] = useState<string[]>([]);

  // City state
  const [city, setCity] = useState(DEFAULT_CITY);
  const handleCityChange = useCallback((newCity: string) => {
    setCity(newCity);
    setFilters((prev) => ({ ...prev, localities: undefined }));
    setMapZoom(CITY_CONFIG[newCity]?.zoom ?? 11);
  }, []);

  // Restore school from URL params on mount
  const urlSchoolId = urlParams.get('schoolId');
  const urlRadiusKm = urlParams.get('radiusKm');
  const { data: schoolSearchResults } = useSchoolSearch(urlSchoolId ?? '');

  useEffect(() => {
    if (urlSchoolId && schoolSearchResults && schoolSearchResults.length > 0 && !selectedSchool) {
      const match = schoolSearchResults.find((s) => s.id === urlSchoolId);
      if (match) {
        const radius = urlRadiusKm ? parseInt(urlRadiusKm, 10) || 2 : 2;
        setSelectedSchool(match);
        setFilters((prev) => ({
          ...prev,
          schoolLat: match.latitude,
          schoolLon: match.longitude,
          schoolRadiusKm: radius,
        }));
      }
    }
  }, [urlSchoolId, urlRadiusKm, schoolSearchResults, selectedSchool]);

  const handleSchoolSelect = useCallback((school: SchoolResult | null) => {
    setSelectedSchool(school);
    if (school) {
      const radiusKm = filters.schoolRadiusKm ?? 2;
      setFilters((prev) => ({
        ...prev,
        schoolLat: school.latitude,
        schoolLon: school.longitude,
        schoolRadiusKm: radiusKm,
      }));
      setUrlParams((prev) => {
        prev.set('schoolId', school.id);
        prev.set('radiusKm', String(radiusKm));
        return prev;
      });
    } else {
      setFilters((prev) => {
        const { schoolLat: _a, schoolLon: _b, schoolRadiusKm: _c, ...rest } = prev;
        return rest;
      });
      setUrlParams((prev) => {
        prev.delete('schoolId');
        prev.delete('radiusKm');
        return prev;
      });
    }
  }, [filters.schoolRadiusKm, setUrlParams]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 250);
    return () => clearTimeout(t);
  }, [searchQuery]);

  /** Wraps setFilters to keep radiusKm URL param in sync when school filter is active. */
  const handleFiltersChange = useCallback((next: PropertyFilters) => {
    setFilters(next);
    if (next.schoolRadiusKm != null && selectedSchool) {
      setUrlParams((prev) => {
        prev.set('radiusKm', String(next.schoolRadiusKm));
        return prev;
      });
    }
  }, [selectedSchool, setUrlParams]);

  const handlePolygonDrawn = useCallback((polygon: [number, number][]) => {
    setFilters((prev) => ({ ...prev, polygon }));
  }, []);

  const handlePolygonCleared = useCallback(() => {
    setFilters((prev) => {
      const { polygon: _removed, ...rest } = prev;
      return rest;
    });
  }, []);

  const { data: listings = [], isLoading: listingsLoading, error: listingsError } = usePropertyListings(filters);

  const singleLocality = filters.localities?.length === 1 ? filters.localities[0] : undefined;
  const singlePropertyType = filters.propertyTypes?.length === 1 ? filters.propertyTypes[0] : undefined;
  const singleBedrooms = filters.bedrooms?.length === 1 ? filters.bedrooms[0] : undefined;

  const { data: searchResults, isLoading: searchLoading, error: searchError } = useListingSearch({
    q: debouncedSearch,
    locality: singleLocality,
    propertyType: singlePropertyType,
    bedrooms: singleBedrooms,
  });

  const isAuthenticated = !authLoading && user !== null;

  const listingDataLoading = isAuthenticated && (debouncedSearch ? searchLoading : listingsLoading);
  const error = isAuthenticated ? (debouncedSearch ? searchError : listingsError) : null;
  const filteredListings = isAuthenticated
    ? (debouncedSearch ? (searchResults ?? []) : listings)
    : [];

  // Anonymous users: no lat/lon in teaser response — pass empty array so no pins render
  const listingsWithCoords = isAuthenticated
    ? filteredListings.filter((l) => l.latitude && l.longitude)
    : [];

  const hasHydrated = useRef(false);
  const initialAnonAreaKeysRef = useRef<string[]>([]);

  const topLocalities = useMemo(
    () => computeTopLocalities(listingsWithCoords),
    [listingsWithCoords]
  );

  const focusBounds = useMemo(
    () => computeFocusBounds(listingsWithCoords, filters.localities ?? []),
    [filters.localities, listingsWithCoords]
  );

  // Tick counter to force map refit when "Fit to selected areas" is clicked
  const [fitTick, setFitTick] = useState(0);

  // Tick counter to trigger map zoom reset on area deselection
  const [resetMapTick, setResetMapTick] = useState(0);
  const activeFocusBounds = useMemo(() => {
    // fitTick is in the dep array solely to force a new reference on refit clicks
    void fitTick;
    return focusBounds;
  }, [focusBounds, fitTick]);

  // Locality options + trends options — used together for locality→areaKey mapping.
  // Primary source: area_overview_stats via /api/trends/options (backend-authoritative, limit=50).
  // Secondary: /api/discover/areas (all seeded areas, including zero-listing).
  // Fallback: property_listings.area_key (sparse backfill from PR #745).
  const { data: localityOptions = [] } = useLocalities(city);
  const { data: trendsOpts } = useTrendsOptions(city, true, 50);
  const { data: discoverAreasData, isLoading: areasLoading } = useDiscoverAreas(city);
  // Map filter state to discover listing params.
  // priceMin/priceMax in PropertyFilters are rupees; backend expects paise.
  const discoverMinPrice = filters.priceMin != null ? filters.priceMin * 100 : undefined;
  const discoverMaxPrice = filters.priceMax != null ? filters.priceMax * 100 : undefined;
  // bedrooms/propertyType: only forward when a single value is selected (backend takes one).
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
  const localityToAreaKey = useMemo(() => {
    const m = new Map<string, string>();
    trendsOpts?.defaultAreas.forEach((a) => m.set(a.areaLabel, a.areaKey));
    discoverAreasData?.areas.forEach((a) => {
      if (!m.has(a.name)) m.set(a.name, a.areaKey);
    });
    localityOptions.forEach((o) => {
      if (o.areaKey && !m.has(o.locality)) m.set(o.locality, o.areaKey);
    });
    return m;
  }, [trendsOpts, discoverAreasData, localityOptions]);

  // Derive areaKeys for "View Trends" button and URL write-back.
  // For anonymous users: fall back to URL params (set on mount from Home navigation).
  const trendsAreaKeys = useMemo(() => {
    if (isAuthenticated) {
      if (!filters.localities || filters.localities.length === 0) return [];
      return filters.localities.flatMap((loc) => {
        const k = localityToAreaKey.get(loc);
        return k ? [k] : [];
      });
    }
    return initialAnonAreaKeysRef.current.filter((k) => k.length > 0);
  }, [isAuthenticated, filters.localities, localityToAreaKey]);

  const discoverAreas = useMemo((): AreaPoint[] => {
    if (!discoverAreasData?.areas) return [];
    return discoverAreasData.areas.map((a) => ({
      areaKey: a.areaKey,
      areaLabel: a.name,
      geo_center_lat: a.geoCenterLat,
      geo_center_lon: a.geoCenterLon,
      bbox: (a.minLat != null && a.minLon != null && a.maxLat != null && a.maxLon != null)
        ? [[a.minLat, a.minLon] as [number, number], [a.maxLat, a.maxLon] as [number, number]]
        : null,
      listingCount: a.listingCount90d,
      trendDirection: a.trendDirection as 'rising' | 'falling' | 'stable' | null | undefined,
    }));
  }, [discoverAreasData]);

  const trendsHref = selectedArea
    ? `/trends?city=${city}&areaKey=${encodeURIComponent(selectedArea.areaKey)}`
    : undefined;

  const handleAreaClick = useCallback((area: AreaPoint) => {
    // AreaMarkerLayer owns fitBounds on marker click — do NOT set panToArea here.
    // We only set selectedArea so the right panel switches to listings mode.
    // Reset filters so the discover listings query starts fresh for the new area (AC6).
    setFilters({});
    setSelectedArea(area);
  }, []);

  const handleAreaSelect = useCallback((area: AreaPoint) => {
    setFilters({});
    setSelectedArea(area);
    setPanToArea(area); // Panel card click → drive the map via AreaPanner
  }, []);

  const handleAreaBack = useCallback(() => {
    setSelectedArea(null);
    setPanToArea(null);
    setResetMapTick((t) => t + 1);
  }, []);

  const { data: markersData, isLoading: markersLoading } = useDiscoverMarkers(city);

  // True page readiness: auth settled + map mounted + area cards loaded + (at high zoom, markers loaded).
  // mapReady gates on Leaflet initialisation — avoids an empty-map flash where the DOM
  // mounts before area marker data arrives.
  // listingDataLoading covers authenticated listing search and anonymous teaser fetch.
  // areasLoading is always included — area cards are the primary visual at low zoom.
  // markersLoading is added only when authenticated and zoomed past the area layer threshold,
  // because that is the only state where markers are the primary visible content.
  // Background refetch (isFetching) intentionally excluded — must not block visible UI.
  const isLoading =
    authLoading
    || !mapReady
    || areasLoading
    || listingDataLoading
    || (isAuthenticated && mapZoom > AREA_LAYER_MAX_ZOOM && markersLoading);

  // Delayed-show effect: only surface the full-screen spinner when the load takes > 200 ms.
  // This prevents a flicker on fast loads where isLoading resolves before the threshold.
  useEffect(() => {
    if (!isLoading) {
      setShowLoader(false);
      return;
    }
    const t = setTimeout(() => setShowLoader(true), 200);
    return () => clearTimeout(t);
  }, [isLoading]);

  const now = new Date().toISOString();
  const markerListings = useMemo((): (PropertyListing & { images?: PropertyImage[] })[] => {
    if (!markersData?.markers) return [];
    return markersData.markers.map((m) => ({
      id: m.id,
      latitude: m.lat,
      longitude: m.lon,
      property_type: 'other' as PropertyType,
      price: m.pricePaise != null ? Math.round(m.pricePaise / 100) : null,
      price_unit: null,
      title: null,
      locality: null,
      land_area: null,
      land_area_unit: null,
      built_area: null,
      built_area_unit: null,
      bedrooms: null,
      bathrooms: null,
      contact_info: null,
      contact_phone: null,
      description: null,
      confidence_score: null,
      language_detected: null,
      price_per_cent_paise: null,
      is_valid: true,
      is_duplicate: false,
      status: 'LIVE',
      created_at: now,
      updated_at: now,
      listing_purpose: '',
      carpet_area: null,
      carpet_area_unit: null,
      floor_number: null,
      total_floors: null,
      furnishing_status: null,
      washrooms: null,
      parking_count: null,
      road_frontage_ft: null,
      commercial_usage: null,
      number_of_units: null,
      monthly_rent: null,
      security_deposit_months: null,
      lock_in_months: null,
      seller_type: null,
      raw_post_id: null,
    }));
  }, [markersData, now]);

  // URL sync: write city + areaKey params whenever they change.
  // Declared before the read-mount effect so it fires first on initial render
  // (hasHydrated is still false → skipped), preventing it from overwriting URL
  // params before they have been read.
  useEffect(() => {
    if (!hasHydrated.current) return;
    // Skip write-back while listings are still loading — prevents overwriting URL
    // areaKey params before the resolved listing set is available.
    if (listingsLoading) return;
    setUrlParams(
      (prev) => {
        prev.set('city', city);
        prev.delete('areaKey');
        trendsAreaKeys.forEach((k) => prev.append('areaKey', k));
        return prev;
      },
      { replace: true }
    );
  }, [city, trendsAreaKeys, setUrlParams, listingsLoading]);

  // Read city + areaKey from URL on mount only; must be declared AFTER the
  // write-back effect so the write-back fires (and skips) before this sets
  // hasHydrated = true.
  useEffect(() => {
    const urlCity = urlParams.get('city');
    const urlAreaKeys = urlParams.getAll('areaKey').slice(0, 3);
    initialAnonAreaKeysRef.current = urlAreaKeys;
    if (urlCity) setCity(urlCity);
    if (urlAreaKeys.length > 0) {
      const localityNames = urlAreaKeys
        .filter((k) => k.split('|').length >= 2)
        .map((k) => k.split('|').pop())
        .filter((n): n is string => Boolean(n));
      if (localityNames.length > 0) {
        setFilters((prev) => ({ ...prev, localities: localityNames }));
      }
    }
    hasHydrated.current = true;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtersContent = (
    <MapFilters
      filters={filters}
      onFiltersChange={handleFiltersChange}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      selectedSchool={selectedSchool}
      onSchoolSelect={handleSchoolSelect}
      schoolBoardFilter={schoolBoardFilter}
      onSchoolBoardFilterChange={setSchoolBoardFilter}
      city={city}
      onCityChange={handleCityChange}
      allListings={listingsWithCoords}
      trendsAreaKeys={trendsAreaKeys}
    />
  );

  return (
    <AppLayout>
      <div className="h-[calc(100vh-3.5rem)] flex flex-col lg:flex-row relative">
        {/* Map Area */}
        <div className="lg:w-1/2 h-64 lg:h-full relative order-2 lg:order-1">
          {/* Full-screen loader: only shown after 200 ms to prevent flicker on fast loads.
              The PropertyMap is always rendered (below the overlay) so that the Leaflet
              instance can initialise and fire onReady, which clears the mapReady gate. */}
          {showLoader && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Loading map...</p>
              </div>
            </div>
          )}
          {error ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Card className="p-6 text-center max-w-sm">
                <p className="text-destructive font-medium">Failed to load listings</p>
                <p className="text-sm text-muted-foreground mt-1">Please try again later</p>
              </Card>
            </div>
          ) : (
            <PropertyMap
              listings={mapZoom > AREA_LAYER_MAX_ZOOM && isAuthenticated ? markerListings : []}
              focusBounds={activeFocusBounds}
              polygon={filters.polygon}
              onPolygonDrawn={handlePolygonDrawn}
              onPolygonCleared={handlePolygonCleared}
              schoolCircle={selectedSchool ? {
                lat: selectedSchool.latitude,
                lon: selectedSchool.longitude,
                radiusKm: filters.schoolRadiusKm ?? 2,
                name: selectedSchool.name,
              } : undefined}
              cityCenter={CITY_CONFIG[city]?.center}
              cityZoom={CITY_CONFIG[city]?.zoom}
              areas={mapZoom <= AREA_LAYER_MAX_ZOOM ? discoverAreas : []}
              onAreaClick={handleAreaClick}
              onZoomChange={setMapZoom}
              panToArea={panToArea}
              resetMapTick={resetMapTick}
              onReady={() => setMapReady(true)}
            />
          )}

          {/* Anonymous login CTA — overlaid above map */}
          {!isAuthenticated && !authLoading && (
            <div className="absolute top-4 left-4 right-4 z-[1000] flex justify-center">
              <div className="flex items-center gap-3 px-5 py-3 bg-card/95 backdrop-blur border border-border rounded-lg shadow-md">
                <LogIn className="h-5 w-5 text-primary flex-shrink-0" />
                <p className="text-sm text-foreground">
                  Sign in to see full details and contact brokers
                </p>
                <Button asChild size="sm" className="flex-shrink-0">
                  <Link to="/auth">Sign in</Link>
                </Button>
              </div>
            </div>
          )}

          {/* Area overview map overlays — city chip, city select, summary stat */}
          {mapZoom <= AREA_LAYER_MAX_ZOOM && (
            <>
              {/* City chip — top-left */}
              <div className="absolute top-4 left-4 z-[1000]">
                <div className="flex items-center gap-1.5 bg-white rounded-full px-3 py-2 shadow-sm border border-border text-sm font-medium select-none">
                  <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
                  <span>{CITY_CONFIG[city]?.label ?? city}</span>
                </div>
              </div>

              {/* City select — top-right */}
              <div className="absolute top-4 right-4 z-[1000] w-44">
                <CitySelect value={city} onChange={handleCityChange} className="bg-white shadow-sm" />
              </div>

              {/* Bottom-right summary — total listing count from area rollup */}
              {discoverAreas.length > 0 && (
                <div className="absolute bottom-16 right-4 z-[1000]">
                  <div className="bg-white/95 rounded-lg px-4 py-2 shadow-sm text-sm border border-border">
                    Showing{' '}
                    <strong>
                      {discoverAreas
                        .reduce((sum, a) => sum + (a.listingCount ?? 0), 0)
                        .toLocaleString()}
                    </strong>{' '}
                    properties
                  </div>
                </div>
              )}
            </>
          )}

          {/* Locality Quick-Chips (authenticated only) */}
          {isAuthenticated && !isLoading && topLocalities.length > 0 && (
            <div className="absolute top-3 left-16 right-36 z-[1000] lg:left-3 overflow-x-auto scrollbar-none">
              <div className="flex gap-1.5 flex-nowrap pb-1">
                {topLocalities.map(({ locality, count }) => {
                  const isActive = filters.localities?.includes(locality) ?? false;
                  return (
                    <Button
                      key={locality}
                      variant="outline"
                      size="sm"
                      disabled={isAtCap(filters.localities) && !isActive}
                      className={cn(
                        'flex-shrink-0 h-7 text-xs gap-1.5 bg-card/90 backdrop-blur shadow-sm',
                        isActive && 'bg-primary text-primary-foreground border-primary hover:bg-primary/90 hover:text-primary-foreground'
                      )}
                      onClick={() => {
                        const result = toggleLocality(filters.localities, locality);
                        if (!result) return;
                        setFilters((prev) => ({ ...prev, localities: result }));
                        const newAreaKeys = result
                          .map((loc) => listings.find((l) => l.locality === loc && l.areaKey)?.areaKey)
                          .filter((k): k is string => k != null && k.length > 0);
                        setUrlParams((prev) => {
                          prev.set('city', city);
                          prev.delete('areaKey');
                          newAreaKeys.forEach((k) => prev.append('areaKey', k));
                          return prev;
                        }, { replace: true });
                      }}
                    >
                      {locality}
                      <span className={cn(
                        'inline-flex items-center justify-center rounded-full text-[10px] px-1 min-w-[16px] h-4',
                        isActive
                          ? 'bg-primary-foreground/20 text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                      )}>
                        {count}
                      </span>
                    </Button>
                  );
                })}
                {filters.localities && filters.localities.length >= 2 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-shrink-0 h-7 text-xs gap-1 bg-card/90 backdrop-blur shadow-sm"
                    onClick={() => setFitTick((t) => t + 1)}
                  >
                    <Maximize2 className="h-3 w-3" />
                    Fit to selected areas
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Stats Bar (authenticated only) */}
          {isAuthenticated && (
            <div className="absolute top-4 right-4 z-[1000]">
              <Card className="px-3 py-2 bg-card/95 backdrop-blur">
                <div className="flex items-center gap-4 text-sm">
                  {filters.polygon && (
                    <>
                      <div className="flex items-center gap-1.5 text-primary">
                        <PenTool className="h-4 w-4" />
                        <span className="font-medium">Area search</span>
                      </div>
                      <div className="text-muted-foreground">|</div>
                    </>
                  )}
                  {selectedSchool && (
                    <>
                      <div className="flex items-center gap-1.5 text-primary">
                        <GraduationCap className="h-4 w-4" />
                        <span className="font-medium truncate max-w-[150px]">{selectedSchool.name}</span>
                        <span className="text-xs text-muted-foreground">({filters.schoolRadiusKm ?? 2} km)</span>
                      </div>
                      <div className="text-muted-foreground">|</div>
                    </>
                  )}
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 text-primary" />
                    <span className="font-medium">{listingsWithCoords.length}</span>
                    <span className="text-muted-foreground">on map</span>
                  </div>
                  <div className="text-muted-foreground">|</div>
                  <div className="text-muted-foreground">
                    {filteredListings.length} total listings
                  </div>
                  {filters.polygon && (
                    <>
                      <div className="text-muted-foreground">|</div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                        onClick={handlePolygonCleared}
                        aria-label="Clear polygon search"
                      >
                        <X className="h-3.5 w-3.5 mr-1" />
                        Clear area
                      </Button>
                    </>
                  )}
                </div>
              </Card>
            </div>
          )}

          {/* Empty / sparse map guidance (authenticated only) */}
          {isAuthenticated && !isLoading && (() => {
            const visibleCount = listingsWithCoords.length;
            const cityLabel = CITY_CONFIG[city]?.label ?? city;
            const hasLocalities = (filters.localities?.length ?? 0) > 0;

            let message: string | null = null;

            if (visibleCount === 0 && hasLocalities) {
              message = 'No properties found in the selected areas. Try removing a filter or selecting different localities.';
            } else if (visibleCount === 0) {
              message = `No properties listed in ${cityLabel} yet. Try switching to a different city.`;
            } else if (visibleCount <= 2 && !hasLocalities) {
              message = `Properties in ${cityLabel} are concentrated in specific areas. Select a locality to zoom in.`;
            }

            if (!message) return null;

            return (
              <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-[1000] max-w-sm">
                <div className="bg-card/95 backdrop-blur rounded-lg border shadow-lg px-4 py-3 text-center">
                  <p className="text-sm text-muted-foreground">{message}</p>
                </div>
              </div>
            );
          })()}

        </div>

        <DiscoverRightPanel
          areas={discoverAreas}
          selectedArea={selectedArea}
          areaListings={cityListingsData?.areas.find(a => a.areaKey === selectedArea?.areaKey)?.listings ?? []}
          isLoadingListings={isLoadingAreaListings}
          onAreaSelect={handleAreaSelect}
          onBack={handleAreaBack}
          filtersContent={filtersContent}
          trendsHref={trendsHref}
        />
      </div>
    </AppLayout>
  );
}
