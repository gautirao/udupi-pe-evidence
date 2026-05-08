/**
 * School journey panels.
 *
 * SchoolSelectedPanel is the full implementation (S3); other panels remain as
 * stubs until their milestones ship.
 */
import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, GraduationCap, MapPin, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { PanelHeader } from '../PanelHeader';
import { PropertyCard } from '../PropertyCard';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import type { DiscoverJourney } from '@/hooks/useDiscoverUrlState';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import { SchoolsInAreaPanel as RealSchoolsInAreaPanel } from './SchoolsInAreaPanel';

const RADIUS_OPTIONS = [1, 2, 3, 5] as const;
type RadiusKm = (typeof RADIUS_OPTIONS)[number];

// ─── Shared placeholder ───────────────────────────────────────────────────────

interface Milestone2PlaceholderProps {
  title: string;
  journey?: DiscoverJourney | null;
  onStartOver?: () => void;
}

function Milestone2Placeholder({ title, journey, onStartOver }: Milestone2PlaceholderProps) {
  return (
    <>
      <PanelHeader title={title} journey={journey} onStartOver={onStartOver} />
      <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center py-10 px-4">
        <EmptyState
          icon={<GraduationCap className="h-8 w-8 text-muted-foreground/40" />}
          heading="Coming in Milestone 2"
          description="School-journey features are not yet available"
        />
      </div>
    </>
  );
}

// ─── Exports ──────────────────────────────────────────────────────────────────

/** school-first journey — no area or school selected yet. */
export interface SchoolBrowsePanelProps {
  onStartOver?: () => void;
  journey?: DiscoverJourney | null;
}
export function SchoolBrowsePanel({ onStartOver, journey }: SchoolBrowsePanelProps) {
  return <Milestone2Placeholder title="Find a school" journey={journey} onStartOver={onStartOver} />;
}

/** school-first journey — area selected but no school selected yet. */
export interface SchoolsInAreaPanelProps {
  selectedArea: AreaPoint;
  onStartOver?: () => void;
  onBack?: () => void;
  journey?: DiscoverJourney | null;
}
export function SchoolsInAreaPanel({ onStartOver, journey }: SchoolsInAreaPanelProps) {
  return <RealSchoolsInAreaPanel journey={journey as 'school-first' | 'area-first'} onStartOver={onStartOver || (() => undefined)} />;
}

/** school-first journey — schoolId present. */
export interface SchoolSelectedPanelProps {
  /** The resolved school object. Null during cold-load while schoolById is fetching. */
  school: SchoolResult | null;
  /** Proximity-filtered listings from MapDiscovery (already server-filtered). */
  listings: DiscoverCityListingItem[];
  isLoadingListings: boolean;
  /** Current radius in km — null before URL param resolves (uses default). */
  radiusKm: number | null;
  /** Called when the user picks a new radius button. Parent writes URL + filter. */
  onRadiusChange: (radiusKm: number) => void;
  /** Current property filters — used for the "clear property filters" empty-state action. */
  filters?: PropertyFilters;
  /** Called when property filters are cleared via the empty-state CTA. */
  onFiltersChange?: (filters: PropertyFilters) => void;
  isAuthenticated?: boolean;
  onStartOver?: () => void;
  onBack?: () => void;
  journey?: DiscoverJourney | null;
  filtersContent?: React.ReactNode;
  activeContextChips?: React.ReactNode;
}

export function SchoolSelectedPanel({
  school,
  listings,
  isLoadingListings,
  radiusKm,
  onRadiusChange,
  filters = {},
  onFiltersChange,
  isAuthenticated = false,
  onStartOver,
  onBack,
  journey,
  filtersContent,
  activeContextChips,
}: SchoolSelectedPanelProps) {
  const navigate = useNavigate();

  const effectiveRadius = radiusKm ?? 3;

  // Intentionally scoped to the four filters surfaced in the "Clear filters" chip
  // (price range, bedrooms, property types). Toggle filters (sellerTypes, backOnMarket,
  // newToMarket, reraRegistered, readyToMove) are not shown in this panel's chip row
  // and are excluded by design.
  const hasPropertyFilters = Boolean(
    filters.propertyTypes?.length ||
    filters.bedrooms?.length ||
    filters.priceMin != null ||
    filters.priceMax != null,
  );

  // Cycle to next radius value; stays at 5 if already at max.
  const nextRadius = (): RadiusKm => {
    const idx = RADIUS_OPTIONS.indexOf(effectiveRadius as RadiusKm);
    return idx >= 0 && idx < RADIUS_OPTIONS.length - 1
      ? RADIUS_OPTIONS[idx + 1]
      : RADIUS_OPTIONS[RADIUS_OPTIONS.length - 1];
  };

  const handleIncreaseRadius = () => {
    onRadiusChange(nextRadius());
  };

  const handleClearPropertyFilters = useCallback(() => {
    if (!onFiltersChange) return;
    onFiltersChange({
      ...filters,
      propertyTypes: undefined,
      bedrooms: undefined,
      priceMin: undefined,
      priceMax: undefined,
    });
  }, [filters, onFiltersChange]);

  const isAtMaxRadius = effectiveRadius >= RADIUS_OPTIONS[RADIUS_OPTIONS.length - 1];

  return (
    <>
      <PanelHeader
        title={school ? school.name : 'School'}
        journey={journey}
        onStartOver={onStartOver}
        activeContextChips={activeContextChips}
        actions={
          <>
            {onBack && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onBack}
                aria-label="Back"
                data-testid="school-panel-back-button"
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

      {/* School info */}
      {school && (
        <div className="px-4 py-3 border-b border-border">
          {(school.board || school.boardType) && (
            <p className="text-xs text-muted-foreground mb-0.5">
              {school.board ?? school.boardType}
            </p>
          )}
          {school.address && (
            <p className="text-xs text-muted-foreground truncate">{school.address}</p>
          )}
        </div>
      )}

      {/* Radius selector */}
      <div className="px-4 py-3 border-b border-border">
        <p className="text-xs font-medium text-muted-foreground mb-2">Radius</p>
        <div className="flex gap-2" role="group" aria-label="Select search radius">
          {RADIUS_OPTIONS.map((km) => (
            <Button
              key={km}
              variant={effectiveRadius === km ? 'default' : 'outline'}
              size="sm"
              className={cn(
                'h-8 text-xs px-3 flex-1',
                effectiveRadius === km && 'bg-primary text-primary-foreground',
              )}
              onClick={() => onRadiusChange(km)}
              aria-pressed={effectiveRadius === km}
              data-testid={`radius-btn-${km}`}
            >
              {km} km
            </Button>
          ))}
        </div>
      </div>

      {/* Listing body */}
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
        ) : listings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center">
            <MapPin className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground mb-4" data-testid="empty-state-message">
              No properties found within {effectiveRadius} km
              {school ? ` of ${school.name}` : ''}
            </p>
            <div className="flex flex-col gap-2 w-full max-w-xs">
              <Button
                variant="outline"
                size="sm"
                onClick={handleIncreaseRadius}
                disabled={isAtMaxRadius}
                data-testid="increase-radius-btn"
              >
                Increase radius
              </Button>
              {hasPropertyFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearPropertyFilters}
                  data-testid="clear-filters-btn"
                >
                  Clear property filters
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {listings.map((listing) => (
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
  );
}

/** Both area and school are selected (cross-journey). */
export interface AreaSchoolCombinedPanelProps {
  selectedArea?: AreaPoint | null;
  schoolId?: string | null;
  onStartOver?: () => void;
  onBack?: () => void;
  journey?: DiscoverJourney | null;
}
export function AreaSchoolCombinedPanel({ onStartOver, journey }: AreaSchoolCombinedPanelProps) {
  return <Milestone2Placeholder title="Area + school view" journey={journey} onStartOver={onStartOver} />;
}
