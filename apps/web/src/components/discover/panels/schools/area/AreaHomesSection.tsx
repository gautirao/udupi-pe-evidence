/**
 * AreaHomesSection — the "Homes in area" footer body rendered inside the real
 * SchoolsInAreaPanel picker's `footerSlot`, moved verbatim from the
 * SchoolsInAreaPanel wrapper in SchoolJourneyPanels.tsx (Issue #2661 commit 4,
 * no logic/JSX changes).
 *
 * Homes in the same area (Issue #1074 Slice A), restyled to the ReTrends
 * two-column grid. Rendered as the panel's footerSlot so it lives INSIDE the
 * school panel's single scroll surface — the whole right panel scrolls as one
 * page (no nested scrollbars). Buy/Rent-aware wording; agri excluded; card↔
 * marker hover + selected-frame preserved.
 */
import { useNavigate } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { PropertyCard } from '../../../PropertyCard';
import type { DiscoverIntent } from '@/hooks/useDiscoverUrlState';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import { AGRICULTURAL_LAND_PROPERTY_TYPE } from '@/lib/listing-constants';

export interface AreaHomesSectionProps {
  areaListings: DiscoverCityListingItem[] | undefined;
  isLoadingAreaListings?: boolean;
  isFetching?: boolean;
  isAuthenticated?: boolean;
  /**
   * Raw (possibly undefined) area label, exactly as `selectedArea?.areaLabel`
   * reads at the call site. The heading falls back to "this area" when absent;
   * PropertyCard receives the RAW value (undefined, not defaulted) — preserved
   * distinction from the pre-extraction source.
   */
  selectedAreaLabel?: string;
  intent: DiscoverIntent;
  selectedListingId?: string | null;
  onSelectListing?: (id: string) => void;
  onHoverListing?: (id: string | null) => void;
  cardRefs: React.MutableRefObject<Map<string, HTMLDivElement | null>>;
}

export function AreaHomesSection({
  areaListings,
  isLoadingAreaListings,
  isFetching = false,
  isAuthenticated = false,
  selectedAreaLabel,
  intent,
  selectedListingId = null,
  onSelectListing,
  onHoverListing,
  cardRefs,
}: AreaHomesSectionProps) {
  const navigate = useNavigate();
  const areaLabel = selectedAreaLabel || 'this area';
  const homesTitle = intent === 'rent' ? 'Rentals' : 'Homes for sale';

  // School-first must EXCLUDE agricultural land (design + #1463). Defensive client-side
  // guard on top of the backend exclusion: never surface an agri listing in this journey.
  const homeListings = (areaListings ?? []).filter(
    (l) => (l.propertyType ?? '').toLowerCase() !== AGRICULTURAL_LAND_PROPERTY_TYPE,
  );

  if (areaListings === undefined && !isLoadingAreaListings) return null;

  return (
    <div className="border-t border-border bg-card" data-testid="schools-in-area-properties">
      <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-2.5">
        <h3 className="text-sm font-semibold text-foreground">
          {homesTitle} in {areaLabel}
        </h3>
        {!isLoadingAreaListings && (
          <span className="shrink-0 text-xs text-muted-foreground" data-testid="schools-in-area-homes-count">
            <span className="font-mono font-semibold tabular-nums text-foreground">
              {homeListings.length}
            </span>{' '}
            {intent === 'rent'
              ? homeListings.length === 1 ? 'rental available' : 'rentals available'
              : homeListings.length === 1 ? 'home for sale' : 'homes for sale'}
          </span>
        )}
      </div>
      {/* Issue #1170 — dim during an in-flight refetch (isFetching) but NOT during the
          initial skeleton load. No overflow here: the parent scroll surface owns scrolling. */}
      <div
        className={cn(
          'transition-opacity duration-150',
          isFetching && !isLoadingAreaListings ? 'opacity-50 pointer-events-none' : 'opacity-100',
        )}
      >
        {isLoadingAreaListings ? (
          <div className="grid grid-cols-1 gap-3 p-3 2xl:grid-cols-2">
            {[0, 1, 2].map((i) => (
              <div key={i} data-testid="listing-skeleton" className="rounded-lg border border-border p-3">
                <Skeleton className="mb-3 h-32 w-full rounded-lg" />
                <Skeleton className="mb-2 h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            ))}
          </div>
        ) : homeListings.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-6 text-center">
            <MapPin className="mb-2 h-6 w-6 text-muted-foreground/40" aria-hidden />
            <p className="text-sm text-muted-foreground">
              No {intent === 'rent' ? 'rentals' : 'homes for sale'} in {areaLabel} yet
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 p-3 2xl:grid-cols-2">
            {homeListings.map((listing) => (
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
                  areaLabel={selectedAreaLabel}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
