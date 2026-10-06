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
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { PropertyCard } from '../../../PropertyCard';
import type { DiscoverIntent } from '@/hooks/useDiscoverUrlState';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import type { ListingWithDistance } from './sortListingsBySchoolDistance';
import { RadiusChips } from './RadiusChips';
import { isSchoolRadiusCountPending } from './isSchoolRadiusCountPending';
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
  /**
   * Issue #1793 SR-024 — the school-radius request failed. With no listings to fall back on this
   * renders the request-failure block + Retry INSTEAD of SchoolRadiusEmptyState; results retained
   * alongside an error keep rendering their cards.
   */
  isError?: boolean;
  /** Issue #1793 — Retry target for the request-failure block (the real query refetch). */
  onRetry?: () => void;
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
  /**
   * Issue #2770 — how the radius chips are laid out for the selected-school state:
   *   'default' — the original stacked "Search radius" block (any caller that passes nothing);
   *   'compact' — bounded compaction below the desktop reskin (caption sr-only, >=44px chips);
   *   'desktop' — chips are NOT rendered here: SchoolContextHeader (rendered by the panel) owns
   *               them in the single compact context block.
   */
  density?: 'default' | 'compact' | 'desktop';
}

export function SchoolRadiusListings({
  variant,
  school,
  areaLabel,
  listings,
  sortedListingsWithDistance,
  isLoadingListings,
  isError = false,
  onRetry,
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
  density = 'default',
}: SchoolRadiusListingsProps) {
  const navigate = useNavigate();

  const radiusTestIdPrefix = variant === 'selected' ? 'radius-btn' : 'combined-radius-btn';
  const listingsBodyTestId = variant === 'selected' ? 'school-listings-body' : 'combined-listings-body';
  const listingSkeletonTestId = variant === 'selected' ? 'listing-skeleton' : 'combined-listing-skeleton';

  return (
    <>
      {/* Radius chips */}
      {density !== 'desktop' && (
        <RadiusChips
          effectiveRadius={effectiveRadius}
          listingCount={listings.length}
          intent={intent}
          onRadiusChange={onRadiusChange}
          testIdPrefix={radiusTestIdPrefix}
          compact={density === 'compact'}
          countPending={isSchoolRadiusCountPending({
            isAuthenticated,
            isLoading: isLoadingListings,
            isError,
            listingCount: listings.length,
          })}
        />
      )}

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
          'discover-panel-container transition-opacity duration-150',
          isFetching && !isLoadingListings ? 'opacity-50 pointer-events-none' : 'opacity-100',
        )}
      >
        {isLoadingListings ? (
          <div className="discover-results-grid grid grid-cols-1 gap-3 p-4">
            {[0, 1, 2, 3].map((i) => (
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
        ) : isError && listings.length === 0 ? (
          // Issue #1793 SR-024 — "error is not empty". A settled request failure with nothing to
          // fall back on gets the explicit request-failure state, NEVER the "no homes within N km"
          // empty state below. Markup/copy mirrors ListingsBody's area-listings-error block
          // (features/discover/area-selected/sections/ListingsBody.tsx), with school-radius testids.
          <div
            className="m-4 flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-12 text-center"
            data-testid="school-radius-listings-error"
          >
            <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
            <h2 className="text-base font-semibold text-foreground">We could not load these results</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              This is a request failure, not an empty market. Your scope and filters are unchanged.
            </p>
            {onRetry && (
              <Button variant="outline" size="sm" onClick={onRetry} data-testid="school-radius-listings-error-retry">
                Retry
              </Button>
            )}
          </div>
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
          <div className="discover-results-grid grid grid-cols-1 gap-3 p-3">
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
