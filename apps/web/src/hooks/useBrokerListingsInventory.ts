import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useBrokerMyListingsInfinite } from '@/hooks/useBrokerListings';

/**
 * Owns broker "My Listings" status/sort filter state and the underlying
 * infinite query. Deliberately has no knowledge of selection or lifecycle
 * mutations — see useBrokerListingSelection and BrokerListingActions.
 */
export function useBrokerListingsInventory() {
  const [searchParams] = useSearchParams();
  const [activeFilter, setActiveFilter] = useState(searchParams.get('status') ?? '');
  const [activeSort, setActiveSort] = useState('createdAt,desc');

  const {
    data,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useBrokerMyListingsInfinite({ status: activeFilter, sort: activeSort });

  const listings = useMemo(() => data?.pages.flatMap((p) => p.listings) ?? [], [data?.pages]);
  const totalElements = data?.pages[0]?.totalElements ?? 0;

  return {
    activeFilter,
    setActiveFilter,
    activeSort,
    setActiveSort,
    listings,
    totalElements,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  };
}
