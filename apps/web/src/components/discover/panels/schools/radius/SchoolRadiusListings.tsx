/**
 * SchoolRadiusListings — the radius-chips + result-heading + dimmed listing
 * body (skeleton / missing-coords / empty / distance-sorted grid) duplicated
 * verbatim by SchoolSelectedPanel and AreaSchoolCombinedPanel, unified behind
 * a `variant` prop that controls testid naming only (Issue #2661 commit 4).
 *
 * Before this extraction, commit 1's R7 differential test
 * (SchoolSelectedPanel.AreaSchoolCombinedPanel.differential.test.tsx) proved
 * the two panels' listing bodies already produce identical sort/filter output
 * for the same inputs — that test is re-run unchanged after this unification
 * and must still pass.
 *
 * The bounded-search CTA/count block is SchoolSelectedPanel-only (no
 * AreaSchoolCombinedPanel counterpart) and is NOT part of this shared body —
 * callers render it themselves and pass it in via `boundedSearchSlot`, which
 * renders between the radius chips and the result heading.
 */
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { PropertyCard } from '../../../PropertyCard';
import type { DiscoverIntent } from '@/hooks/useDiscoverUrlState';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import type { ListingWithDistance } from './sortListingsBySchoolDistance';
import { RadiusChips } from './RadiusChips';
import { RadiusResultHeading } from './RadiusResultHeading';
import { SchoolRadiusEmptyState } from './SchoolRadiusEmptyState';
import { MissingCoordsEmptyState } from './MissingCoordsEmptyState';
import type { ReactNode } from 'react';

export type SchoolRadiusListingsVariant = 'selected' | 'combined';

export interface SchoolRadiusListingsProps {
  variant: SchoolRadiusListingsVariant;
  school: SchoolResult | null;
  /**
   * Area label for the empty states' "View all homes in {areaLabel}" copy.
   * Derivation differs per caller (SchoolSelectedPanel falls back through
   * urlState.areaKey; AreaSchoolCombinedPanel reads selectedArea.areaLabel) —
   * callers compute it and pass it in rather than this component re-deriving it.
   */
  areaLabel: string | null;
  listings: DiscoverCityListingItem[];
  sortedListingsWithDistance: ListingWithDistance[];
  isLoadingListings: boolean;
  isFetching: boolean;
  hasMissingCoords: boolean;
  hasPropertyFilters: boolean;
  effectiveRadius: number;
  onRadiusChange: (km: number) => void;
  onClearSchool: () => void;
  onClearPropertyFilters: () => void;
  intent: DiscoverIntent;
  isAuthenticated: boolean;
  selectedListingId: string | null;
  onSelectListing?: (id: string) => void;
  onHoverListing?: (id: string | null) => void;
  cardRefs: React.MutableRefObject<Map<string, HTMLDivElement | null>>;
  /** SchoolSelectedPanel-only bounded-search CTA/count — absent for 'combined'. */
  boundedSearchSlot?: ReactNode;
}

export function SchoolRadiusListings({
  variant,
  school,
  areaLabel,
  listings,
  sortedListingsWithDistance,
  isLoadingListings,
  isFetching,
  hasMissingCoords,
  hasPropertyFilters,
  effectiveRadius,
  onRadiusChange,
  onClearSchool,
  onClearPropertyFilters,
  intent,
  isAuthenticated,
  selectedListingId,
  onSelectListing,
  onHoverListing,
  cardRefs,
  boundedSearchSlot,
}: SchoolRadiusListingsProps) {
  const navigate = useNavigate();

  const radiusTestIdPrefix = variant === 'selected' ? 'radius-btn' : 'combined-radius-btn';
  const listingsBodyTestId = variant === 'selected' ? 'school-listings-body' : 'combined-listings-body';
  const listingSkeletonTestId = variant === 'selected' ? 'listing-skeleton' : 'combined-listing-skeleton';

  return (
    <>
      {/* Radius chips */}
      <RadiusChips
        effectiveRadius={effectiveRadius}
        listingCount={listings.length}
        intent={intent}
        onRadiusChange={onRadiusChange}
        testIdPrefix={radiusTestIdPrefix}
      />

      {boundedSearchSlot}

      {/* Result heading — only when we have listings or are loaded */}
      {!isLoadingListings && !hasMissingCoords && listings.length > 0 && (
        <RadiusResultHeading
          listingCount={listings.length}
          effectiveRadius={effectiveRadius}
          intent={intent}
          schoolName={school?.name}
        />
      )}

      {/* Listing body — Issue #1170: AreaSelectedPanel-style dim on an in-flight
          refetch (isFetching) but NOT during the initial skeleton load, so cached
          responses never flash and the settled empty state stays readable/clickable.
          Scroll is owned by the parent scroll container, so this wrapper carries
          only the refetch dim — not its own overflow. */}
      <div
        data-testid={listingsBodyTestId}
        className={cn(
          'transition-opacity duration-150',
          isFetching && !isLoadingListings ? 'opacity-50 pointer-events-none' : 'opacity-100',
        )}
      >
        {isLoadingListings ? (
          <div className="space-y-3 p-4">
            {[0, 1, 2].map((i) => (
              <div key={i} data-testid={listingSkeletonTestId} className="rounded-lg border border-border p-3">
                <Skeleton className="w-full h-40 rounded-lg mb-3" />
                <Skeleton className="h-4 w-2/3 mb-2" />
                <Skeleton className="h-3 w-1/3 mb-2" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : hasMissingCoords ? (
          <MissingCoordsEmptyState
            school={school!}
            areaLabel={areaLabel}
            onClearSchool={onClearSchool}
          />
        ) : listings.length === 0 ? (
          <SchoolRadiusEmptyState
            school={school!}
            areaLabel={areaLabel}
            effectiveRadius={effectiveRadius}
            intent={intent}
            hasPropertyFilters={hasPropertyFilters}
            onRadiusChange={onRadiusChange}
            onClearSchool={onClearSchool}
            onClearPropertyFilters={onClearPropertyFilters}
          />
        ) : (
          <div className="grid grid-cols-1 2xl:grid-cols-2 gap-3 p-3">
            {sortedListingsWithDistance.map(({ listing, distanceKm }) => (
              <div
                key={listing.id}
                ref={(node) => {
                  if (node) cardRefs.current.set(listing.id, node);
                  else cardRefs.current.delete(listing.id);
                }}
              >
                <PropertyCard
                  listing={listing}
                  isAuthenticated={isAuthenticated}
                  onNavigate={() => navigate(`/listing/${listing.id}`)}
                  isSelected={selectedListingId === listing.id}
                  onSelect={onSelectListing}
                  onHover={onHoverListing}
                  distanceKm={distanceKm}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
