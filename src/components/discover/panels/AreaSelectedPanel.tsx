import React, { useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, MapPin, Search, TrendingUp, X, Plus, GraduationCap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { AreaPoint } from '@/components/map/AreaMarkerLayer';
import { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import { PropertyCard } from '../PropertyCard';
import { PanelHeader } from '../PanelHeader';
import type { DiscoverJourney, DiscoverIntent } from '@/hooks/useDiscoverUrlState';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { SlidersHorizontal } from 'lucide-react';

// Quick filter options (hardcoded MVP)
const QUICK_PROPERTY_TYPES = ['apartment', 'villa', 'land'] as const;
const QUICK_BEDROOMS = [2, 3] as const;

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  apartment: 'Apartments',
  villa: 'Villas',
  land: 'Plots',
};

interface AreaSelectedPanelProps {
  selectedArea: AreaPoint;
  areaListings?: DiscoverCityListingItem[];
  isLoadingListings?: boolean;
  isAuthenticated?: boolean;
  onBack?: () => void;
  onStartOver?: () => void;
  journey?: DiscoverJourney | null;
  filtersContent?: React.ReactNode;
  trendsHref?: string;
  isFetching?: boolean;
  isInitialLoading?: boolean;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  /** Active context chips forwarded to PanelHeader centre slot. */
  activeContextChips?: React.ReactNode;
  /** Current property filters. */
  filters?: PropertyFilters;
  /** Called when property filters change (from quick chips or clear action). */
  onFiltersChange?: (filters: PropertyFilters) => void;
  /** Called for genuine journey switches (kept for non-CTA usage). */
  onSelectJourney?: (journey: DiscoverJourney) => void;
  /**
   * Called when the user clicks the "Add a school in this area" CTA (Issue #1157).
   * Enters the area-first school-picking sub-step WITHOUT flipping the journey, so
   * Back returns to area-selected instead of deleting the area.
   */
  onAddSchool?: () => void;
  /** Issue #1494 — current buy/rent intent for summary/empty-state copy. Default 'buy'. */
  intent?: DiscoverIntent;
}

export function AreaSelectedPanel({
  selectedArea,
  areaListings,
  isLoadingListings,
  isAuthenticated = false,
  onBack,
  onStartOver,
  journey,
  filtersContent,
  trendsHref,
  isFetching = false,
  isInitialLoading = false,
  searchQuery = '',
  onSearchChange,
  activeContextChips,
  filters = {},
  onFiltersChange,
  onSelectJourney,
  onAddSchool,
  intent = 'buy',
}: AreaSelectedPanelProps) {
  const navigate = useNavigate();

  // Compute active property types and bedrooms from current filters
  const activePropertyTypes = useMemo(
    () => new Set(filters.propertyTypes || []),
    [filters.propertyTypes],
  );
  const activeBedrooms = useMemo(
    () => new Set(filters.bedrooms || []),
    [filters.bedrooms],
  );

  const hasPropertyFilters = Boolean(
    filters.propertyTypes?.length || filters.bedrooms?.length || filters.priceMin || filters.priceMax
  );

  // Toggle property type: add if not present, remove if already active
  const handleTogglePropertyType = useCallback(
    (type: string) => {
      if (!onFiltersChange) return;
      const current = filters.propertyTypes || [];
      const updated = activePropertyTypes.has(type)
        ? current.filter((t) => t !== type)
        : [...current, type];
      onFiltersChange({ ...filters, propertyTypes: updated.length > 0 ? updated : undefined });
    },
    [filters, activePropertyTypes, onFiltersChange],
  );

  // Toggle bedroom count: add if not present, remove if already active
  const handleToggleBedroom = useCallback(
    (bed: number) => {
      if (!onFiltersChange) return;
      const current = filters.bedrooms || [];
      const updated = activeBedrooms.has(bed)
        ? current.filter((b) => b !== bed)
        : [...current, bed];
      onFiltersChange({ ...filters, bedrooms: updated.length > 0 ? updated : undefined });
    },
    [filters, activeBedrooms, onFiltersChange],
  );

  // Clear property-type filters only; preserve school, polygon, city, date, and other active filters
  const handleClearPropertyFilters = useCallback(() => {
    if (!onFiltersChange) return;
    onFiltersChange({
      ...filters,
      propertyTypes: undefined,
      bedrooms: undefined,
      priceMin: undefined,
      priceMax: undefined,
      localities: undefined,
      sellerTypes: undefined,
      backOnMarket: undefined,
      newToMarket: undefined,
      reraRegistered: undefined,
      readyToMove: undefined,
    });
  }, [filters, onFiltersChange]);

  // Add school in this area (Issue #1157): enter the area-first school-picking
  // sub-step via onAddSchool. This keeps journey=area-first (instead of flipping to
  // school-first), so Back returns to area-selected rather than deleting the area.
  const handleAddSchool = useCallback(() => {
    onAddSchool?.();
  }, [onAddSchool]);

  return (
    <>
      <PanelHeader
        title={selectedArea.areaLabel}
        journey={journey}
        onStartOver={onStartOver}
        activeContextChips={activeContextChips}
        actions={
          <>
            {trendsHref && (
              <Button asChild variant="ghost" size="sm" className="gap-1.5 text-xs h-7 px-2">
                <Link to={trendsHref}>
                  <TrendingUp className="h-3.5 w-3.5" />
                  Trends
                </Link>
              </Button>
            )}
            {onBack && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onBack}
                aria-label="Back to areas"
                data-testid="back-button"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
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
          </>
        }
      />

      {/* Quick filter chips section */}
      <div className="border-b border-border px-3 py-3 space-y-2">
        {/* Property type chips */}
        <div className="flex flex-wrap gap-1.5">
          {QUICK_PROPERTY_TYPES.map((type) => (
            <Button
              key={type}
              variant={activePropertyTypes.has(type) ? 'default' : 'outline'}
              size="sm"
              className={cn(
                'h-8 text-xs px-3',
                activePropertyTypes.has(type) && 'bg-primary text-primary-foreground',
              )}
              onClick={() => handleTogglePropertyType(type)}
              data-testid={`quick-chip-${type}`}
            >
              {PROPERTY_TYPE_LABELS[type]}
            </Button>
          ))}
        </div>

        {/* BHK chips */}
        <div className="flex flex-wrap gap-1.5">
          {QUICK_BEDROOMS.map((bed) => (
            <Button
              key={bed}
              variant={activeBedrooms.has(bed) ? 'default' : 'outline'}
              size="sm"
              className={cn(
                'h-8 text-xs px-3',
                activeBedrooms.has(bed) && 'bg-primary text-primary-foreground',
              )}
              onClick={() => handleToggleBedroom(bed)}
              data-testid={`quick-chip-${bed}-bhk`}
            >
              {bed} BHK
            </Button>
          ))}
        </div>

        {/* Add school CTA */}
        <Button
          variant="outline"
          size="sm"
          className="w-full h-8 text-xs gap-1.5"
          onClick={handleAddSchool}
          data-testid="add-school-cta"
        >
          <Plus className="h-3.5 w-3.5" />
          Add a school in this area
        </Button>
      </div>

      {/* Search input — sticky below header, above listing cards */}
      {onSearchChange && (
        <div className="sticky top-[49px] z-10 bg-card border-b border-border p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search listings by keyword"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-8 h-9 text-sm pr-8"
              data-testid="area-search-input"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                onClick={() => onSearchChange('')}
                aria-label="Clear search"
                data-testid="area-search-clear"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Listings body */}
      <div
        className={cn(
          'flex-1 overflow-y-auto transition-opacity duration-150',
          isFetching && !isInitialLoading ? 'opacity-50 pointer-events-none' : 'opacity-100',
        )}
      >
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
          <div className="flex flex-col items-center justify-center h-full p-4">
            <MapPin className="h-8 w-8 text-muted-foreground/40 mb-2" />
            {hasPropertyFilters && searchQuery ? (
              <>
                <p className="text-sm text-muted-foreground mb-4">No listings match this search and filters</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearPropertyFilters}
                  data-testid="clear-filters-button"
                >
                  Clear filters
                </Button>
              </>
            ) : searchQuery ? (
              <p className="text-sm text-muted-foreground">No listings match this search</p>
            ) : hasPropertyFilters ? (
              <>
                <p className="text-sm text-muted-foreground mb-4">No listings match these filters</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearPropertyFilters}
                  data-testid="clear-filters-button"
                >
                  Clear filters
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
              No properties for {intent === 'rent' ? 'rent' : 'sale'} in this area yet
            </p>
            )}
          </div>
        ) : (
          <>
            {/* Issue #1494 — intent-aware result summary (AC4) */}
            <div className="px-4 py-2 border-b border-border bg-muted/20" data-testid="area-result-summary">
              <p className="text-xs text-muted-foreground">
                {areaListings.length}{' '}
                {areaListings.length === 1 ? 'property' : 'properties'} for{' '}
                {intent === 'rent' ? 'rent' : 'sale'} in {selectedArea.areaLabel}
              </p>
            </div>
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
          </>
        )}
      </div>
    </>
  );
}
