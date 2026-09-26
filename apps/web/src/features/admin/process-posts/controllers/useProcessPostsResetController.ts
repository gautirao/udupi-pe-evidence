import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useResetPostForReprocessing, type RawPost } from '@/hooks/useAdminData';
import type { useDebugLogs } from '@/components/admin/DebugConsole';

export interface UseProcessPostsResetControllerParams {
  processedPosts: RawPost[];
  refetchPosts: () => unknown;
  debug: ReturnType<typeof useDebugLogs>;
}

/**
 * Issue #2662 — owns single-post and reset-all-processed-posts flows
 * (`handleResetPost`/`handleResetAllPosts` from the original page).
 *
 * `resetAll()` deliberately keeps the direct
 * `supabase.from('raw_posts').update(...)` call rather than a new
 * `useAdminData.ts` hook — `useAdminData.ts` must stay diff-empty against
 * main for this refactor.
 */
export function useProcessPostsResetController({
  processedPosts,
  refetchPosts,
  debug,
}: UseProcessPostsResetControllerParams) {
  const resetPostForReprocessing = useResetPostForReprocessing();
  const { toast } = useToast();
  const [isResettingAll, setIsResettingAll] = useState(false);

  const resetPost = async (postId: string) => {
    await resetPostForReprocessing.mutateAsync(postId);
    refetchPosts();
  };

  const resetAll = async () => {
    if (processedPosts.length === 0) return;

    setIsResettingAll(true);
    debug.info(`Resetting all processed posts`, `${processedPosts.length} posts`);

    try {
      const { error } = await supabase
        .from('raw_posts')
        .update({ is_processed: false })
        .eq('is_processed', true);

      if (error) throw error;

      debug.success(`Reset ${processedPosts.length} posts for reprocessing`);
      toast({
        title: 'Posts Reset',
        description: `${processedPosts.length} posts marked for reprocessing`,
      });

      await refetchPosts();
    } catch (err) {
      debug.error('Failed to reset posts', err instanceof Error ? err.message : 'Unknown error');
      toast({
        title: 'Reset Failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsResettingAll(false);
    }
  };

  return {
    isResettingAll,
    resetPost,
    resetAll,
  };
}

export type ProcessPostsResetController = ReturnType<typeof useProcessPostsResetController>;
