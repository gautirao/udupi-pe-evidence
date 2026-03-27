import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { PropertyMap } from '@/components/map/PropertyMap';
import { MapFilters } from '@/components/map/MapFilters';
import { usePropertyListings, PropertyFilters, PropertyListing, PropertyImage } from '@/hooks/usePropertyListings';
import { useListingSearch } from '@/hooks/useListingSearch';
import { SchoolResult, useSchoolSearch } from '@/hooks/useSchoolSearch';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Loader2, MapPin, X, ChevronLeft, ChevronRight, Eye, SlidersHorizontal, PenTool, GraduationCap } from 'lucide-react';
import { formatPrice, formatArea, formatRelativeDate } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { computeAreaMedians, getMarketSignal } from '@/lib/priceAnalysis';
import { computeFocusBounds, computeTopLocalities } from '@/lib/mapUtils';
import { NearbySchoolsBadge } from '@/components/listing/NearbySchoolsBadge';

export default function Index() {
  const navigate = useNavigate();
  const [urlParams, setUrlParams] = useSearchParams();
  const [filters, setFilters] = useState<PropertyFilters>({});
  const [selectedListing, setSelectedListing] = useState<(PropertyListing & { images?: PropertyImage[] }) | null>(null);
  const [showFilters, setShowFilters] = useState(true);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // School search state
  const [selectedSchool, setSelectedSchool] = useState<SchoolResult | null>(null);
  const [schoolBoardFilter, setSchoolBoardFilter] = useState<string[]>([]);

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

  const isLoading = debouncedSearch ? searchLoading : listingsLoading;
  const error = debouncedSearch ? searchError : listingsError;
  const filteredListings = debouncedSearch ? (searchResults ?? []) : listings;

  const listingsWithCoords = filteredListings.filter((l) => l.latitude && l.longitude);

  const areaMedians = useMemo(() => computeAreaMedians(filteredListings), [filteredListings]);

  const topLocalities = useMemo(
    () => computeTopLocalities(listingsWithCoords),
    [listingsWithCoords]
  );

  const focusBounds = useMemo(
    () => computeFocusBounds(listingsWithCoords, filters.localities ?? []),
    [filters.localities, listingsWithCoords]
  );

  const handleViewDetails = (listing: PropertyListing & { images?: PropertyImage[] }) => {
    navigate(`/listing/${listing.id}`);
  };

  return (
    <AppLayout>
      <div className="h-[calc(100vh-3.5rem)] flex relative">
        {/* Filters Panel — lg+ inline sidebar */}
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
          />
        </div>

        {/* Toggle Filters Button — lg+ only */}
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

        {/* Mobile Filters Sheet — below lg only */}
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
              listings={listingsWithCoords}
              selectedListing={selectedListing}
              onSelectListing={setSelectedListing}
              focusBounds={focusBounds}
              polygon={filters.polygon}
              onPolygonDrawn={handlePolygonDrawn}
              onPolygonCleared={handlePolygonCleared}
              schoolCircle={selectedSchool ? {
                lat: selectedSchool.latitude,
                lon: selectedSchool.longitude,
                radiusKm: filters.schoolRadiusKm ?? 2,
                name: selectedSchool.name,
              } : undefined}
            />
          )}

          {/* Locality Quick-Chips */}
          {!isLoading && topLocalities.length > 0 && (
            <div className="absolute top-3 left-16 right-36 z-[1000] lg:left-3 overflow-x-auto scrollbar-none">
              <div className="flex gap-1.5 flex-nowrap pb-1">
                {topLocalities.map(({ locality, count }) => {
                  const isActive = filters.localities?.includes(locality) ?? false;
                  return (
                    <Button
                      key={locality}
                      variant="outline"
                      size="sm"
                      className={cn(
                        'flex-shrink-0 h-7 text-xs gap-1.5 bg-card/90 backdrop-blur shadow-sm',
                        isActive && 'bg-primary text-primary-foreground border-primary hover:bg-primary/90 hover:text-primary-foreground'
                      )}
                      onClick={() => {
                        const current = filters.localities ?? [];
                        const newLocalities = isActive
                          ? current.filter((l) => l !== locality)
                          : [...current, locality];
                        setFilters({
                          ...filters,
                          localities: newLocalities.length > 0 ? newLocalities : undefined,
                        });
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
              </div>
            </div>
          )}

          {/* Stats Bar */}
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

          {/* Selected Listing Preview Card */}
          {selectedListing && (
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
                  <p className="text-xs text-muted-foreground">
                    Posted {formatRelativeDate(selectedListing.created_at)}
                  </p>
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
        </div>
      </div>
    </AppLayout>
  );
}
