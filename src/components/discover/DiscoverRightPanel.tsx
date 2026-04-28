import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, MapPin, SlidersHorizontal, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { AreaPoint } from '@/components/map/AreaMarkerLayer';
import { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import { formatPrice } from '@/lib/formatters';

interface DiscoverRightPanelProps {
  areas: AreaPoint[];
  selectedArea?: AreaPoint | null;
  areaListings?: DiscoverCityListingItem[];
  isLoadingListings?: boolean;
  onAreaSelect?: (area: AreaPoint) => void;
  onBack?: () => void;
  filtersContent?: React.ReactNode;
  trendsHref?: string;
}

export function DiscoverRightPanel({
  areas,
  selectedArea,
  areaListings,
  isLoadingListings,
  onAreaSelect,
  onBack,
  filtersContent,
  trendsHref,
}: DiscoverRightPanelProps) {
  const navigate = useNavigate();

  return (
    <div
      className="flex flex-col lg:w-1/2 border-l border-border bg-card overflow-hidden order-2 lg:order-2"
      data-testid="discover-right-panel"
    >
      {!selectedArea ? (
        <>
          {/* Empty-state header */}
          <div className="px-4 py-3 border-b border-border flex-shrink-0 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Properties</h2>
            {filtersContent && (
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <SlidersHorizontal className="h-4 w-4" />
                    Filters
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-80 p-0">
                  <SheetHeader className="sr-only">
                    <SheetTitle>Filters</SheetTitle>
                  </SheetHeader>
                  {filtersContent}
                </SheetContent>
              </Sheet>
            )}
          </div>

          {/* Empty state body */}
          <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center py-10 px-4">
            <div className="text-center">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <MapPin className="h-8 w-8 text-muted-foreground/40" />
              </div>
              <h3 className="font-semibold text-base text-foreground mb-2">
                Select an area to explore
              </h3>
              <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">
                Click on an area marker on the map to see available properties
              </p>
              {areas.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Quick select:</p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {areas.slice(0, 4).map((area) => (
                      <button
                        key={area.areaKey}
                        data-testid="quick-select-chip"
                        onClick={() => onAreaSelect?.(area)}
                        className="text-sm px-3 py-1.5 bg-card border border-border rounded-lg hover:border-primary/60 hover:bg-accent transition-colors"
                      >
                        {area.areaLabel}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Listings header */}
          <div className="px-4 py-3 border-b border-border flex-shrink-0 flex items-center gap-2">
            <button
              onClick={() => onBack?.()}
              data-testid="back-button"
              aria-label="Back to areas"
              className="p-1 rounded hover:bg-accent/50 transition-colors flex-shrink-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <h2 className="text-sm font-semibold truncate flex-1">{selectedArea.areaLabel}</h2>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {trendsHref && (
                <Button asChild variant="ghost" size="sm" className="gap-1.5 text-xs h-7 px-2">
                  <Link to={trendsHref}>
                    <TrendingUp className="h-3.5 w-3.5" />
                    Trends
                  </Link>
                </Button>
              )}
              {filtersContent && (
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="icon" className="h-7 w-7">
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      <span className="sr-only">Filters</span>
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="right" className="w-80 p-0">
                    <SheetHeader className="sr-only">
                      <SheetTitle>Filters</SheetTitle>
                    </SheetHeader>
                    {filtersContent}
                  </SheetContent>
                </Sheet>
              )}
            </div>
          </div>

          {/* Listings body */}
          <div className="flex-1 overflow-y-auto">
            {isLoadingListings ? (
              <div className="space-y-3 p-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} data-testid="listing-skeleton">
                    <Skeleton className="w-full h-36 rounded-md mb-2" />
                    <Skeleton className="h-4 w-1/3 mb-1" />
                    <Skeleton className="h-5 w-1/2 mb-1" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                ))}
              </div>
            ) : !areaListings || areaListings.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full">
                <MapPin className="h-8 w-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">No listings in this area yet</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {areaListings.map((listing) => (
                  <div
                    key={listing.id}
                    data-testid="listing-card"
                    className="p-4 hover:bg-accent/50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/listing/${listing.id}`)}
                  >
                    {/* Full-width image — fixed height, no aspect-video to avoid height conflict */}
                    <div className="w-full h-36 bg-muted rounded-md mb-3 overflow-hidden">
                      {listing.primaryImageUrl ? (
                        <img
                          src={listing.primaryImageUrl}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-muted/60">
                          <MapPin className="h-8 w-8 text-muted-foreground/30" />
                        </div>
                      )}
                    </div>

                    {/* Badges row: property type + listing purpose */}
                    <div className="flex flex-wrap gap-1.5 mb-1.5">
                      {listing.propertyType && (
                        <Badge variant="secondary" className="capitalize text-xs">
                          {listing.propertyType}
                        </Badge>
                      )}
                      {listing.listingPurpose && (
                        <Badge variant="outline" className="text-xs">
                          {listing.listingPurpose === 'sale' ? 'For Sale' : listing.listingPurpose === 'rent' ? 'For Rent' : listing.listingPurpose}
                        </Badge>
                      )}
                      {listing.bedrooms != null && (
                        <Badge variant="outline" className="text-xs">
                          {listing.bedrooms} BHK
                        </Badge>
                      )}
                    </div>

                    {/* Price */}
                    {listing.pricePaise != null && (
                      <p className="text-sm font-semibold text-foreground">
                        {formatPrice(Math.round(listing.pricePaise / 100), 'INR')}
                      </p>
                    )}

                    {/* Locality */}
                    {listing.locality && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <MapPin className="h-3 w-3" />
                        {listing.locality}
                      </p>
                    )}

                    {/* View details link */}
                    <p className="text-xs text-primary mt-1.5">View details →</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
