import type { BuildProcessPostsSurfaceParams, ProcessPostsSurfaceView } from './processPostsSurfaceContract';

/**
 * Issue #2662 — pure function, controller outputs in, `view` object out.
 * No renames: every field keeps the name its owning controller/selector
 * gave it, except the two counts (`pendingCount`/`processedCount`) which
 * are the array lengths the original page rendered inline
 * (`unprocessedPosts.length`/`processedPosts.length`) and `hasUnprocessed`,
 * the batch card's own derived guard (`unprocessedPosts.length === 0`).
 */
export function buildProcessPostsSurfaceModel(params: BuildProcessPostsSurfaceParams): ProcessPostsSurfaceView {
  const {
    data: {
      unprocessedPosts,
      processedPosts,
      recentListings,
      validListingCount,
      listings,
      isLoadingPosts,
      isLoadingListings,
    },
    console: { debug, isCollapsed },
    batch: { isProcessing, progress, result },
    editor: { editingPost, editContent, isSaving },
    viewer: { viewingPost },
    reset: { isResettingAll },
  } = params;

  return {
    header: { isLoadingPosts },
    stats: {
      pendingCount: unprocessedPosts.length,
      processedCount: processedPosts.length,
      listingsCount: listings.length,
      validCount: validListingCount,
    },
    batch: {
      isProcessing,
      progress,
      result,
      hasUnprocessed: unprocessedPosts.length > 0,
    },
    rawPosts: {
      unprocessedPosts,
      processedPosts,
      isResettingAll,
    },
    listings: {
      recentListings,
      isLoadingListings,
    },
    console: {
      logs: debug.logs,
      isCollapsed,
    },
    editor: {
      editingPost,
      editContent,
      isSaving,
    },
    viewer: {
      viewingPost,
    },
  };
}
