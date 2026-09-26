import { useState } from 'react';
import { useUpdateRawPost, type RawPost } from '@/hooks/useAdminData';

export interface UseProcessPostsEditorControllerParams {
  refetchPosts: () => unknown;
}

/**
 * Issue #2662 — owns the Edit Post dialog's state and save flow
 * (`handleEditPost`/`handleSaveEdit` from the original page). `save()`
 * intentionally has no try/catch, matching the original: a rejected
 * `mutateAsync` propagates and leaves the dialog open with no refetch.
 */
export function useProcessPostsEditorController({ refetchPosts }: UseProcessPostsEditorControllerParams) {
  const updateRawPost = useUpdateRawPost();
  const [editingPost, setEditingPost] = useState<RawPost | null>(null);
  const [editContent, setEditContent] = useState('');

  const open = (post: RawPost) => {
    setEditingPost(post);
    setEditContent(post.content);
  };

  const close = () => {
    setEditingPost(null);
  };

  const setContent = (value: string) => {
    setEditContent(value);
  };

  const save = async () => {
    if (!editingPost) return;

    await updateRawPost.mutateAsync({
      id: editingPost.id,
      updates: { content: editContent, is_processed: false },
    });

    setEditingPost(null);
    setEditContent('');
    refetchPosts();
  };

  return {
    editingPost,
    editContent,
    isSaving: updateRawPost.isPending,
    open,
    close,
    setContent,
    save,
  };
}

export type ProcessPostsEditorController = ReturnType<typeof useProcessPostsEditorController>;
