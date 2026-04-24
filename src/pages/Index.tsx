import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { PropertyMap } from '@/components/map/PropertyMap';
import { MapFilters } from '@/components/map/MapFilters';
import { usePropertyListings, PropertyFilters, PropertyListing, PropertyImage, useTeaserListings, TeaserListing, useLocalities } from '@/hooks/usePropertyListings';
import { useTrendsOptions } from '@/hooks/useTrendsOptions';
import { useDiscoverAreas } from '@/hooks/useDiscoverAreas';
import { AreaPoint } from '@/components/map/AreaMarkerLayer';
import { useListingSearch } from '@/hooks/useListingSearch';
import { SchoolResult, useSchoolSearch } from '@/hooks/useSchoolSearch';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Loader2, MapPin, X, ChevronLeft, ChevronRight, Eye, SlidersHorizontal, PenTool, GraduationCap, LogIn, Maximize2, TrendingUp } from 'lucide-react';
import { formatPrice, formatArea, formatRelativeDate } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { computeAreaMedians, getMarketSignal } from '@/lib/priceAnalysis';
import { computeFocusBounds, computeTopLocalities } from '@/lib/mapUtils';
import { toggleLocality, isAtCap, CITY_CONFIG, DEFAULT_CITY, DISTRICT_TO_CITY_SLUG } from '@/lib/localityUtils';
import { NearbySchoolsBadge } from '@/components/listing/NearbySchoolsBadge';
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
  const navigate = useNavigate();
  const [urlParams, setUrlParams] = useSearchParams();
  const [filters, setFilters] = useState<PropertyFilters>({});
  const [selectedListing, setSelectedListing] = useState<(PropertyListing & { images?: PropertyImage[] }) | null>(null);
  const [showFilters, setShowFilters] = useState(true);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [mapZoom, setMapZoom] = useState<number>(CITY_CONFIG[DEFAULT_CITY]?.zoom ?? 11);

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

  // Both hooks are called unconditionally (Rules of Hooks). Data is selected
  // based on auth state below.
  const { data: listings = [], isLoading: listingsLoading, error: listingsError } = usePropertyListings(filters);
  const { data: teaserListings = [], isLoading: teaserLoading, error: teaserError } = useTeaserListings();

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

  const isLoading = isAuthenticated
    ? (debouncedSearch ? searchLoading : listingsLoading)
    : teaserLoading;
  const error = isAuthenticated
    ? (debouncedSearch ? searchError : listingsError)
    : teaserError;
  const filteredListings = isAuthenticated
    ? (debouncedSearch ? (searchResults ?? []) : listings)
    : [];

  // Anonymous users: no lat/lon in teaser response — pass empty array so no pins render
  const listingsWithCoords = isAuthenticated
    ? filteredListings.filter((l) => l.latitude && l.longitude)
    : [];

  const hasHydrated = useRef(false);
  const initialAnonAreaKeysRef = useRef<string[]>([]);

  const areaMedians = useMemo(() => computeAreaMedians(filteredListings), [filteredListings]);

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
  const { data: discoverAreasData } = useDiscoverAreas(city);
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

  const handleAreaClick = useCallback((area: AreaPoint) => {
    const params = new URLSearchParams({ city });
    params.append('areaKey', area.areaKey);
    navigate(`/trends?${params.toString()}`);
  }, [city, navigate]);

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

  const handleViewDetails = (listing: PropertyListing & { images?: PropertyImage[] }) => {
    navigate(`/listing/${listing.id}`);
  };

  return (
    <AppLayout>
      <div className="h-[calc(100vh-3.5rem)] flex relative">
        {/* Filters Panel — lg+ inline sidebar (visible to all users) */}
        <div
          className={cn(
            'hidden lg:block h-full border-r border-border bg-card transition-all duration-300 flex-shrink-0',
            showFilters ? 'w-72' : 'w-0 overflow-hidden'
          )}
        >
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
        </div>

        {/* Toggle Filters Button — lg+ only (visible to all users) */}
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'hidden lg:flex absolute top-1/2 -translate-y-1/2 z-10 h-8 w-6 rounded-l-none bg-card border border-l-0 border-border shadow-sm transition-all duration-300',
            showFilters ? 'left-72' : 'left-0'
          )}
          onClick={() => setShowFilters(!showFilters)}
        >
          {showFilters ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>

        {/* Mobile Filters Sheet — below lg only (visible to all users) */}
        <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
          <SheetTrigger asChild>
            <Button
              variant="secondary"
              size="sm"
              className="lg:hidden absolute top-3 left-3 z-10 gap-1.5 shadow-sm"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filters
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Filters</SheetTitle>
            </SheetHeader>
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
          </SheetContent>
        </Sheet>

        {/* Map Area */}
        <div className="flex-1 relative">
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Loading listings...</p>
              </div>
            </div>
          ) : error ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Card className="p-6 text-center max-w-sm">
                <p className="text-destructive font-medium">Failed to load listings</p>
                <p className="text-sm text-muted-foreground mt-1">Please try again later</p>
              </Card>
            </div>
          ) : (
            <PropertyMap
              listings={mapZoom > AREA_LAYER_MAX_ZOOM ? listingsWithCoords : []}
              selectedListing={selectedListing}
              onSelectListing={setSelectedListing}
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

          {/* Selected Listing Preview Card (authenticated only) */}
          {isAuthenticated && selectedListing && (
            <Card className="absolute bottom-4 right-4 z-[1000] w-80 bg-card/95 backdrop-blur shadow-lg overflow-hidden">
              {/* Thumbnail image */}
              {selectedListing.images && selectedListing.images.length > 0 && (
                <div className="h-32 bg-muted">
                  <img
                    src={selectedListing.images[0].url}
                    alt="Property"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
              )}
              <CardContent className="p-4">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="secondary" className="capitalize">
                      {selectedListing.property_type}
                    </Badge>
                    <NearbySchoolsBadge listingId={selectedListing.id} />
                    {isNew(selectedListing.created_at) && (
                      <Badge className="bg-orange-500 text-white text-xs px-1.5 py-0.5 rounded font-medium hover:bg-orange-500">
                        New
                      </Badge>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 -mr-2 -mt-1"
                    onClick={() => setSelectedListing(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {selectedListing.price && (
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-xl font-bold text-primary">
                      {formatPrice(selectedListing.price, selectedListing.price_unit)}
                    </p>
                    {(selectedListing.trustTier === 'A' || selectedListing.trustTier === 'B') && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-green-100 text-green-800">
                        {selectedListing.trustTier}
                      </span>
                    )}
                    {selectedListing.trustTier === 'C' && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-amber-100 text-amber-800">
                        C
                      </span>
                    )}
                  </div>
                )}
                {(() => {
                  const signal = getMarketSignal(selectedListing, areaMedians);
                  return signal ? (
                    <p className="text-xs text-green-700 mb-2">
                      ✅ {signal.percent}% below market
                    </p>
                  ) : null;
                })()}

                {selectedListing.locality && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5 mb-2">
                    <MapPin className="h-3.5 w-3.5" />
                    {selectedListing.locality}
                  </p>
                )}

                <div className="grid grid-cols-2 gap-2 text-sm">
                  {selectedListing.land_area && (
                    <div>
                      <span className="text-muted-foreground">Area: </span>
                      {formatArea(selectedListing.land_area, selectedListing.land_area_unit)}
                    </div>
                  )}
                  {selectedListing.bedrooms && (
                    <div>
                      <span className="text-muted-foreground">Beds: </span>
                      {selectedListing.bedrooms} BHK
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t">
                  <div className="flex flex-col gap-0.5">
                    <p className="text-xs text-muted-foreground">
                      Posted {formatRelativeDate(selectedListing.created_at)}
                    </p>
                    {selectedListing.areaKey && (() => {
                      const district = selectedListing.areaKey.split('|')[2];
                      const listingCity = (district && DISTRICT_TO_CITY_SLUG[district]) ?? DEFAULT_CITY;
                      return (
                        <Link
                          to={`/trends?city=${listingCity}&areaKey=${encodeURIComponent(selectedListing.areaKey)}`}
                          className="text-xs text-primary hover:underline flex items-center gap-0.5"
                        >
                          <TrendingUp className="h-3 w-3" aria-hidden="true" />
                          View Area Trends
                        </Link>
                      );
                    })()}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleViewDetails(selectedListing)}
                    className="gap-1.5"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    View Details
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Teaser listing cards — anonymous only */}
          {!isAuthenticated && !isLoading && !error && teaserListings.length > 0 && (
            <div className="absolute bottom-4 left-4 right-4 z-[1000]">
              <div className="overflow-x-auto scrollbar-none">
                <div className="flex gap-3 flex-nowrap pb-1">
                  {teaserListings.slice(0, 12).map((listing: TeaserListing) => (
                    <Card
                      key={listing.id}
                      className="flex-shrink-0 w-52 bg-card/95 backdrop-blur shadow-md overflow-hidden"
                    >
                      <div className="h-28 bg-muted">
                        {listing.primaryImageUrl ? (
                          <img
                            src={listing.primaryImageUrl}
                            alt="Property"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <MapPin className="h-8 w-8 text-muted-foreground/40" />
                          </div>
                        )}
                      </div>
                      <CardContent className="p-3">
                        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                          {listing.propertyType && (
                            <Badge variant="secondary" className="capitalize text-xs">
                              {listing.propertyType}
                            </Badge>
                          )}
                          {listing.listingPurpose && (
                            <Badge variant="outline" className="capitalize text-xs">
                              {listing.listingPurpose.toLowerCase()}
                            </Badge>
                          )}
                        </div>
                        {listing.price !== null && (
                          <p className="text-base font-bold text-primary leading-tight">
                            {formatPrice(listing.price, 'INR')}
                          </p>
                        )}
                        {listing.locality && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                            <MapPin className="h-3 w-3 flex-shrink-0" />
                            {listing.locality}
                          </p>
                        )}
                        <Button asChild size="sm" variant="outline" className="w-full mt-2 text-xs h-7">
                          <Link to={`/auth?returnTo=/listing/${listing.id}`}>Sign in to view</Link>
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
