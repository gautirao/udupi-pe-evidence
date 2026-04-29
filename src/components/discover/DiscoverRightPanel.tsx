import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, MapPin, SlidersHorizontal, TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { AreaPoint } from '@/components/map/AreaMarkerLayer';
import { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import { PropertyCard } from './PropertyCard';

interface RightPanelHeaderProps {
  title: string;
  onBack?: () => void;
  filtersContent?: React.ReactNode;
  actions?: React.ReactNode;
}

function RightPanelHeader({ title, onBack, filtersContent, actions }: RightPanelHeaderProps) {
  const hasBack = onBack != null;

  return (
    <div
      className={`px-4 py-3 border-b border-border flex-shrink-0 flex items-center ${
        hasBack ? 'gap-2' : 'justify-between'
      }`}
    >
      {hasBack && (
        <button
          onClick={onBack}
          data-testid="back-button"
          aria-label="Back to areas"
          className="p-1 rounded hover:bg-accent/50 transition-colors flex-shrink-0"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}
      <h2 className={`text-sm font-semibold ${hasBack ? 'truncate flex-1' : ''}`}>{title}</h2>
      <div className={hasBack ? 'flex items-center gap-1.5 flex-shrink-0' : undefined}>
        {actions}
        {filtersContent && (
          hasBack ? (
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
          ) : (
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
          )
        )}
      </div>
    </div>
  );
}

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
          <RightPanelHeader
            title="Properties"
            filtersContent={filtersContent}
          />

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
          <RightPanelHeader
            title={selectedArea.areaLabel}
            onBack={onBack}
            filtersContent={filtersContent}
            actions={trendsHref && (
              <Button asChild variant="ghost" size="sm" className="gap-1.5 text-xs h-7 px-2">
                <Link to={trendsHref}>
                  <TrendingUp className="h-3.5 w-3.5" />
                  Trends
                </Link>
              </Button>
            )}
          />

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
                  <PropertyCard
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

