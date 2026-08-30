import type { QueryClient } from '@tanstack/react-query';

/**
 * #2370: the admin inventory table now reads from `useAdminListingsPage` /
 * `useAdminListingsTabCounts` / `useAdminListingById` (server-side
 * pagination), not the old `useAdminListings` snapshot — every lifecycle
 * mutation in the editor drawer (save, publish/unpublish, archive, restore,
 * approve-scraped, restore-rejected) must invalidate all of them, or the
 * table and tab counts go stale after an action taken from the drawer.
 *
 * Single shared function (not duplicated per hook) so `useListingEditorState`
 * and `useListingLifecycleActions` can't drift out of sync on which query
 * keys get invalidated.
 */
export function invalidateListingQueries(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['admin-listings'] }),
    queryClient.invalidateQueries({ queryKey: ['admin-listings-page'] }),
    queryClient.invalidateQueries({ queryKey: ['admin-listings-tab-counts'] }),
    queryClient.invalidateQueries({ queryKey: ['admin-listing-by-id'] }),
  ]);
}
