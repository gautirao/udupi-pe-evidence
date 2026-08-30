import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import type { QualityListing } from '@/types/listingQuality';
import { bandBadgeClass, bandLabel, type FilterKey } from '@/pages/broker/listingQualityModel';

interface QualityListingWorklistProps {
  listings: QualityListing[];
  activeFilter: FilterKey;
  selectedListing: QualityListing | null;
  onToggleListing: (listing: QualityListing) => void;
}

/**
 * Renders the filtered/sorted listing rows, or the empty state when the
 * current filter has no matches. No fetching or global page orchestration —
 * it only presents the `listings` it is given.
 */
export function QualityListingWorklist({
  listings,
  activeFilter,
  selectedListing,
  onToggleListing,
}: QualityListingWorklistProps) {
  if (listings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <CheckCircle2 className="h-10 w-10 text-muted-foreground mb-3" />
        <p className="font-medium text-foreground">No listings in this category</p>
        <p className="text-sm text-muted-foreground mt-1">
          {activeFilter === 'all'
            ? "You don't have any listings yet."
            : 'No listings match this filter.'}
        </p>
        {activeFilter === 'all' && (
          <Button asChild className="mt-4" size="sm">
            <Link to="/broker/listings/new">Create your first listing</Link>
          </Button>
        )}
      </div>
    );
  }

  return (
    <div
      className="divide-y divide-border rounded-lg border border-border overflow-hidden"
      role="list"
      aria-label="Listings worklist"
    >
      {listings.map(listing => {
        const isSelected = selectedListing?.listingId === listing.listingId;
        return (
          <div
            key={listing.listingId}
            role="button"
            tabIndex={0}
            aria-pressed={isSelected}
            onClick={() => onToggleListing(listing)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onToggleListing(listing);
              }
            }}
            className={`flex items-center gap-3 p-3 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
              isSelected
                ? 'bg-primary/5 border-l-2 border-l-primary'
                : 'bg-card hover:bg-muted/40'
            }`}
          >
            {/* Band indicator */}
            <div className="shrink-0">
              <Badge
                className={bandBadgeClass(listing.band)}
                variant="outline"
              >
                {bandLabel(listing.band)}
              </Badge>
            </div>

            {/* Listing info */}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">
                {listing.title ?? (
                  <span className="text-muted-foreground italic">Untitled</span>
                )}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-muted-foreground">{listing.status}</span>
                {listing.scoreStatus === 'NOT_SCORED' ? (
                  <span
                    className="text-xs text-muted-foreground"
                    data-testid={`not-scored-${listing.listingId}`}
                  >
                    · Not yet scored
                  </span>
                ) : listing.qualityScore !== null ? (
                  <span className="text-xs text-muted-foreground">
                    · Score: {listing.qualityScore}
                  </span>
                ) : null}
              </div>
            </div>

            {/* Fix count */}
            {listing.fixPlan.length > 0 && (
              <div className="shrink-0 text-xs text-muted-foreground">
                {listing.fixPlan.length} fix{listing.fixPlan.length !== 1 ? 'es' : ''}
              </div>
            )}

            <ChevronRight
              className={`h-4 w-4 shrink-0 transition-transform ${isSelected ? 'rotate-90 text-primary' : 'text-muted-foreground'}`}
            />
          </div>
        );
      })}
    </div>
  );
}
