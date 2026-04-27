import { ChevronLeft, MapPin } from 'lucide-react';
import { AreaPoint } from '@/components/map/AreaMarkerLayer';
import { DiscoverAreaListingItem } from '@/hooks/useDiscoverAreaListings';
import { formatPrice } from '@/lib/formatters';

interface DiscoverRightPanelProps {
  areas: AreaPoint[];
  selectedArea?: AreaPoint | null;
  areaListings?: DiscoverAreaListingItem[];
  isLoadingListings?: boolean;
  onAreaSelect?: (area: AreaPoint) => void;
  onBack?: () => void;
  onListingSelect?: (listingId: string) => void;
}

export function DiscoverRightPanel({
  areas,
  selectedArea,
  areaListings,
  isLoadingListings,
  onAreaSelect,
  onBack,
  onListingSelect,
}: DiscoverRightPanelProps) {
  const mode = selectedArea ? 'listings' : 'areas';

  return (
    <div
      className="hidden lg:flex flex-col w-96 border-l border-border bg-card flex-shrink-0"
      data-testid="discover-right-panel"
    >
      {mode === 'areas' ? (
        <>
          {/* Areas header */}
          <div className="px-4 py-3 border-b border-border flex-shrink-0">
            <h2 className="text-sm font-semibold">Areas</h2>
            {areas.length > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {areas.length} areas
              </p>
            )}
          </div>

          {/* Areas body */}
          <div className="flex-1 overflow-y-auto">
            {areas.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full">
                <MapPin className="h-8 w-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">No areas found</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {areas.map((area) => (
                  <div
                    key={area.areaKey}
                    className={`px-4 py-3 hover:bg-accent/50 transition-colors cursor-pointer${
                      area.areaKey === selectedArea?.areaKey ? ' bg-accent' : ''
                    }`}
                    data-testid="area-card"
                    onClick={() => onAreaSelect?.(area)}
                  >
                    <p className="text-sm font-medium text-foreground">{area.areaLabel}</p>
                    {area.listingCount != null && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {area.listingCount.toLocaleString()} properties
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
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
            <h2 className="text-sm font-semibold truncate">{selectedArea!.areaLabel}</h2>
          </div>

          {/* Listings body */}
          <div className="flex-1 overflow-y-auto">
            {isLoadingListings ? (
              <div>
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    data-testid="listing-skeleton"
                    className="animate-pulse h-16 bg-muted rounded mx-4 my-3"
                  />
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
                    className="px-4 py-3 hover:bg-accent/50 transition-colors cursor-pointer"
                    onClick={() => onListingSelect?.(listing.id)}
                  >
                    <div className="h-20 bg-muted rounded mb-2 overflow-hidden">
                      {listing.primaryImageUrl ? (
                        <img
                          src={listing.primaryImageUrl}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <MapPin className="h-6 w-6 text-muted-foreground/40" />
                        </div>
                      )}
                    </div>
                    {listing.propertyType && (
                      <p className="text-xs text-muted-foreground capitalize">
                        {listing.propertyType}
                      </p>
                    )}
                    {listing.pricePaise != null && (
                      <p className="text-sm font-semibold text-foreground">
                        {formatPrice(Math.round(listing.pricePaise / 100), 'INR')}
                      </p>
                    )}
                    {listing.locality && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <MapPin className="h-3 w-3" />
                        {listing.locality}
                      </p>
                    )}
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
