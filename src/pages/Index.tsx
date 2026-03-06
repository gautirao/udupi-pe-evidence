import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { PropertyMap } from '@/components/map/PropertyMap';
import { MapFilters } from '@/components/map/MapFilters';
import { usePropertyListings, PropertyFilters, PropertyListing, PropertyImage } from '@/hooks/usePropertyListings';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Loader2, MapPin, X, ChevronLeft, ChevronRight, Eye, SlidersHorizontal } from 'lucide-react';
import { formatPrice, formatArea, formatRelativeDate } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { computeAreaMedians, getMarketSignal } from '@/lib/priceAnalysis';
import { computeFocusBounds, computeTopLocalities } from '@/lib/mapUtils';

export default function Index() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<PropertyFilters>({});
  const [selectedListing, setSelectedListing] = useState<(PropertyListing & { images?: PropertyImage[] }) | null>(null);
  const [showFilters, setShowFilters] = useState(true);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 250);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const { data: listings = [], isLoading, error } = usePropertyListings(filters);

  const filteredListings = useMemo(() => {
    if (!debouncedSearch) return listings;
    const q = debouncedSearch.toLowerCase();
    return listings.filter(
      (l) =>
        l.title?.toLowerCase().includes(q) ||
        l.description?.toLowerCase().includes(q) ||
        l.locality?.toLowerCase().includes(q)
    );
  }, [listings, debouncedSearch]);

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
          <MapFilters filters={filters} onFiltersChange={setFilters} searchQuery={searchQuery} onSearchChange={setSearchQuery} />
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
            <MapFilters filters={filters} onFiltersChange={setFilters} searchQuery={searchQuery} onSearchChange={setSearchQuery} />
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
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-primary" />
                  <span className="font-medium">{listingsWithCoords.length}</span>
                  <span className="text-muted-foreground">on map</span>
                </div>
                <div className="text-muted-foreground">|</div>
                <div className="text-muted-foreground">
                  {filteredListings.length} total listings
                </div>
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
                  <Badge variant="secondary" className="capitalize">
                    {selectedListing.property_type}
                  </Badge>
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
                  <p className="text-xl font-bold text-primary mb-2">
                    {formatPrice(selectedListing.price, selectedListing.price_unit)}
                  </p>
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
