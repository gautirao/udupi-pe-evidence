import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, MapPin, SlidersHorizontal, TrendingUp,
  BedDouble, Bath, Ruler, Calendar, ShieldCheck, Lock, Building2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { AreaPoint } from '@/components/map/AreaMarkerLayer';
import { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import { formatPrice, formatArea, formatRelativeDate } from '@/lib/formatters';

interface DiscoverRightPanelProps {
  areas: AreaPoint[];
  selectedArea?: AreaPoint | null;
  areaListings?: DiscoverCityListingItem[];
  isLoadingListings?: boolean;
  isAuthenticated?: boolean;
  onAreaSelect?: (area: AreaPoint) => void;
  onBack?: () => void;
  filtersContent?: React.ReactNode;
  trendsHref?: string;
}

function capitalize(s: string | null | undefined): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function purposeLabel(p: string | null | undefined): string {
  if (p === 'sale') return 'For Sale';
  if (p === 'rent') return 'For Rent';
  return capitalize(p ?? '');
}

export function DiscoverRightPanel({
  areas,
  selectedArea,
  areaListings,
  isLoadingListings,
  isAuthenticated = false,
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
                  <div key={i} data-testid="listing-skeleton" className="rounded-lg border border-border p-3">
                    <Skeleton className="w-full h-40 rounded-lg mb-3" />
                    <Skeleton className="h-4 w-2/3 mb-2" />
                    <Skeleton className="h-3 w-1/3 mb-2" />
                    <Skeleton className="h-3 w-1/2" />
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
                  <ListingCard
                    key={listing.id}
                    listing={listing}
                    isAuthenticated={isAuthenticated}
                    onNavigate={() => navigate(`/listing/${listing.id}`)}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Listing card ────────────────────────────────────────────────────────────

interface ListingCardProps {
  listing: DiscoverCityListingItem;
  isAuthenticated: boolean;
  onNavigate: () => void;
}

function ListingCard({ listing, isAuthenticated, onNavigate }: ListingCardProps) {
  const isTrusted = listing.trustTier === 'A' || listing.trustTier === 'B';

  const fallbackTitle = listing.propertyType
    ? `${capitalize(listing.propertyType)} ${purposeLabel(listing.listingPurpose)}`
    : purposeLabel(listing.listingPurpose) || 'Property';

  const hasMetadata =
    listing.bedrooms != null ||
    listing.bathrooms != null ||
    listing.builtArea != null ||
    listing.landArea != null ||
    listing.totalFloors != null ||
    listing.parkingCount != null ||
    listing.furnishingStatus;

  const chips: string[] = [];
  if (listing.propertyType) chips.push(capitalize(listing.propertyType));
  if (listing.listingPurpose) chips.push(purposeLabel(listing.listingPurpose));
  const visibleChips = chips.slice(0, 3);

  return (
    <div
      data-testid="listing-card"
      className="p-4 hover:bg-accent/50 transition-colors cursor-pointer"
      onClick={onNavigate}
    >
      {/* Image with Trusted badge overlay */}
      <div className="relative w-full h-44 bg-muted rounded-lg mb-3 overflow-hidden">
        {listing.primaryImageUrl ? (
          <img
            src={listing.primaryImageUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted/60">
            <Building2 className="h-10 w-10 text-muted-foreground/30" />
          </div>
        )}
        {isTrusted && (
          <div className="absolute top-2 right-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-medium text-white">
              <ShieldCheck className="h-3 w-3" />
              Trusted
            </span>
          </div>
        )}
      </div>

      {/* Title */}
      <h3 className="text-sm font-semibold text-primary line-clamp-2 mb-1">
        {listing.title || fallbackTitle}
      </h3>

      {/* Location */}
      {listing.locality && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
          <MapPin className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{listing.locality}</span>
        </p>
      )}

      {/* Metadata row — render only non-null values */}
      {hasMetadata && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mb-2">
          {listing.bedrooms != null && (
            <span className="flex items-center gap-1">
              <BedDouble className="h-3.5 w-3.5" />
              {listing.bedrooms} BHK
            </span>
          )}
          {listing.bathrooms != null && (
            <span className="flex items-center gap-1">
              <Bath className="h-3.5 w-3.5" />
              {listing.bathrooms}
            </span>
          )}
          {listing.builtArea != null && (
            <span className="flex items-center gap-1">
              <Ruler className="h-3.5 w-3.5" />
              {formatArea(listing.builtArea, listing.builtAreaUnit)}
            </span>
          )}
          {listing.landArea != null && (
            <span className="flex items-center gap-1">
              <Ruler className="h-3.5 w-3.5" />
              {formatArea(listing.landArea, listing.landAreaUnit)}
            </span>
          )}
          {listing.totalFloors != null && (
            <span>{listing.totalFloors} floors</span>
          )}
          {listing.parkingCount != null && (
            <span>{listing.parkingCount} parking</span>
          )}
          {listing.furnishingStatus && (
            <span>{capitalize(listing.furnishingStatus)}</span>
          )}
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-border my-2" />

      {/* Price + listed date row */}
      <div className="flex items-center justify-between gap-2">
        {/* Price — blurred for anonymous users */}
        {isAuthenticated ? (
          listing.pricePaise != null ? (
            <p className="text-sm font-semibold text-foreground">
              {formatPrice(Math.round(listing.pricePaise / 100), 'INR')}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Price on request</p>
          )
        ) : (
          <div className="flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <span className="text-xs text-muted-foreground">Sign in to view price</span>
          </div>
        )}

        {/* Listed date */}
        {listing.createdAt && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
            <Calendar className="h-3 w-3" />
            {formatRelativeDate(listing.createdAt)}
          </p>
        )}
      </div>

      {/* Tag chips */}
      {visibleChips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {visibleChips.map((chip) => (
            <span
              key={chip}
              className="text-xs px-2 py-0.5 bg-muted rounded-full text-muted-foreground"
            >
              {chip}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
