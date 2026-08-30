import type { ListingResponse } from '@/hooks/useBrokerListings';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { BrokerListingCard } from './BrokerListingCard';

interface BrokerListingsListProps {
  listings: ListingResponse[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  hasNextPage: boolean | undefined;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}

/** Renders loaded listings as cards plus the "Load more" control. */
export function BrokerListingsList({
  listings,
  selectedIds,
  onToggleSelect,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: BrokerListingsListProps) {
  return (
    <>
      {listings.map((listing) => (
        <BrokerListingCard
          key={listing.id}
          listing={listing}
          isSelected={selectedIds.has(listing.id)}
          onToggleSelect={onToggleSelect}
        />
      ))}
      {hasNextPage && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" size="sm" disabled={isFetchingNextPage} onClick={onLoadMore}>
            {isFetchingNextPage ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                Loading…
              </>
            ) : (
              'Load more'
            )}
          </Button>
        </div>
      )}
    </>
  );
}
