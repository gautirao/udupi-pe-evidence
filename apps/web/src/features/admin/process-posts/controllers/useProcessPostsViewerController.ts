import { useState } from 'react';
import type { RawPost } from '@/hooks/useAdminData';

export interface UseProcessPostsViewerControllerParams {
  openEditor: (post: RawPost) => void;
}

/**
 * Issue #2662 — owns the View Post dialog's state
 * (`handleViewPost`/`viewingPost` from the original page). `editViewed()` is
 * the View dialog's "Edit Post" button behavior: open the editor for the
 * viewed post, then close the viewer — in that exact order.
 */
export function useProcessPostsViewerController({ openEditor }: UseProcessPostsViewerControllerParams) {
  const [viewingPost, setViewingPost] = useState<RawPost | null>(null);

  const open = (post: RawPost) => {
    setViewingPost(post);
  };

  const close = () => {
    setViewingPost(null);
  };

  const editViewed = () => {
    if (viewingPost) {
      openEditor(viewingPost);
      setViewingPost(null);
    }
  };

  return {
    viewingPost,
    open,
    close,
    editViewed,
  };
}

export type ProcessPostsViewerController = ReturnType<typeof useProcessPostsViewerController>;
