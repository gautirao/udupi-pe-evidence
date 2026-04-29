import { Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PropertyFilters } from '@/hooks/usePropertyListings';
import { toggleLocality, isAtCap } from '@/lib/localityUtils';
import { DiscoverUrlActions } from '@/hooks/useDiscoverUrlState';

interface LocalityChipsBarProps {
  filters: PropertyFilters;
  topLocalities: { locality: string; count: number }[];
  onFiltersChange: (next: PropertyFilters) => void;
  setFitTick: React.Dispatch<React.SetStateAction<number>>;
  urlActions: DiscoverUrlActions;
}

/**
 * Horizontal scrollable locality chip strip shown at the top of the map for
 * authenticated users when there are top localities to display.
 * Includes a "Fit to selected areas" button when 2+ localities are selected.
 */
export function LocalityChipsBar({
  filters,
  topLocalities,
  onFiltersChange,
  setFitTick,
  urlActions,
}: LocalityChipsBarProps) {
  return (
    <div className="absolute top-3 left-16 right-52 z-[1000] lg:left-3 overflow-x-auto scrollbar-none">
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
                isActive &&
                  'bg-primary text-primary-foreground border-primary hover:bg-primary/90 hover:text-primary-foreground',
              )}
              onClick={() => {
                const result = toggleLocality(filters.localities, locality);
                if (!result) return;
                const next = { ...filters, localities: result };
                onFiltersChange(next);
                // Write locality-driven filter changes as live (debounced replace).
                // areaKey URL param is managed by area card selection only —
                // locality chip toggling does not affect the single selectedArea URL param.
                urlActions.setFiltersLive({
                  propertyTypes: next.propertyTypes,
                  bedrooms: next.bedrooms,
                  priceMin: next.priceMin,
                  priceMax: next.priceMax,
                  sellerType: next.sellerTypes?.length === 1 ? next.sellerTypes[0] : undefined,
                });
              }}
            >
              {locality}
              <span
                className={cn(
                  'inline-flex items-center justify-center rounded-full text-[10px] px-1 min-w-[16px] h-4',
                  isActive
                    ? 'bg-primary-foreground/20 text-primary-foreground'
                    : 'bg-muted text-muted-foreground',
                )}
              >
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
  );
}
