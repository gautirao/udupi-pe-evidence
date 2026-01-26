import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { PropertyMap } from '@/components/map/PropertyMap';
import { MapFilters } from '@/components/map/MapFilters';
import { usePropertyListings, PropertyFilters, PropertyListing, PropertyImage } from '@/hooks/usePropertyListings';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, MapPin, X, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { formatPrice, formatArea, formatRelativeDate } from '@/lib/formatters';
import { cn } from '@/lib/utils';

export default function Index() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<PropertyFilters>({});
  const [selectedListing, setSelectedListing] = useState<(PropertyListing & { images?: PropertyImage[] }) | null>(null);
  const [showFilters, setShowFilters] = useState(true);

  const { data: listings = [], isLoading, error } = usePropertyListings(filters);

  const listingsWithCoords = listings.filter((l) => l.latitude && l.longitude);

  const handleViewDetails = (listing: PropertyListing & { images?: PropertyImage[] }) => {
    navigate(`/listing/${listing.id}`);
  };

  return (
    <AppLayout>
      <div className="h-[calc(100vh-3.5rem)] flex relative">
        {/* Filters Panel */}
        <div
          className={cn(
            'h-full border-r border-border bg-card transition-all duration-300 flex-shrink-0',
            showFilters ? 'w-72' : 'w-0 overflow-hidden'
          )}
        >
          <MapFilters filters={filters} onFiltersChange={setFilters} />
        </div>

        {/* Toggle Filters Button */}
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'absolute top-1/2 -translate-y-1/2 z-10 h-8 w-6 rounded-l-none bg-card border border-l-0 border-border shadow-sm transition-all duration-300',
            showFilters ? 'left-72' : 'left-0'
          )}
          onClick={() => setShowFilters(!showFilters)}
        >
          {showFilters ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>

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
            />
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
                  {listings.length} total listings
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
