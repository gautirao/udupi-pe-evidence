import { useRawPosts, useAdminListings } from '@/hooks/useAdminData';
import { partitionRawPosts } from '../selectors/rawPostPartitions';
import { summarizeListings } from '../selectors/listingSummary';

/**
 * Issue #2662 — owns the two server-state reads ProcessPosts needs
 * (`useRawPosts`/`useAdminListings`), the unprocessed/processed partition,
 * and the recent/valid listings summary. `refresh()` matches the original
 * `handleRefresh` exactly: both refetches are fired without being awaited.
 */
export function useProcessPostsDataController() {
  const { data: rawPosts = [], isLoading: isLoadingPosts, refetch: refetchPosts } = useRawPosts(undefined, 200);
  const { data: listings = [], isLoading: isLoadingListings, refetch: refetchListings } = useAdminListings(50);

  const { unprocessedPosts, processedPosts } = partitionRawPosts(rawPosts);
  const { recentListings, validListingCount } = summarizeListings(listings);

  const refresh = () => {
    refetchPosts();
    refetchListings();
  };

  return {
    rawPosts,
    listings,
    isLoadingPosts,
    isLoadingListings,
    refetchPosts,
    refetchListings,
    unprocessedPosts,
    processedPosts,
    recentListings,
    validListingCount,
    refresh,
  };
}

export type ProcessPostsDataController = ReturnType<typeof useProcessPostsDataController>;
