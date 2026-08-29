import { useMemo, useState } from 'react';
import { useBrokerListingQuality } from '@/hooks/useBrokerListingQuality';
import type { QualityListing } from '@/types/listingQuality';
import {
  deriveTodaysPriority,
  filterListings,
  sortListings,
  type FilterKey,
  type SortKey,
} from './listingQualityModel';

/**
 * Owns the listing-quality page's server-state dependency plus the
 * filter/sort/selection view state derived from it.
 *
 * The page consumes a small view model instead of knowing the query hook,
 * filter/sort predicates, or the "today's priority" selection rule.
 */
export function useListingQualityView() {
  const { data, isLoading, isError, error, refetch } = useBrokerListingQuality();

  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const [sortKey, setSortKey] = useState<SortKey>('band');
  const [selectedListing, setSelectedListing] = useState<QualityListing | null>(null);

  // All hooks must be called unconditionally before any early return in the page.
  const todaysPriority = useMemo(
    () => (data ? deriveTodaysPriority(data.listings) : null),
    [data],
  );

  const filteredAndSorted = useMemo(() => {
    if (!data) return [];
    const filtered = filterListings(data.listings, activeFilter);
    return sortListings(filtered, sortKey);
  }, [data, activeFilter, sortKey]);

  const filterCounts = data?.aggregates.filterCounts;

  function selectFilter(filter: FilterKey) {
    setActiveFilter(filter);
    setSelectedListing(null);
  }

  function toggleListing(listing: QualityListing) {
    setSelectedListing(prev =>
      prev?.listingId === listing.listingId ? null : listing,
    );
  }

  return {
    data,
    isLoading,
    isError,
    error,
    refetch,
    activeFilter,
    sortKey,
    setSortKey,
    selectFilter,
    selectedListing,
    setSelectedListing,
    toggleListing,
    todaysPriority,
    filteredAndSorted,
    filterCounts,
  };
}
