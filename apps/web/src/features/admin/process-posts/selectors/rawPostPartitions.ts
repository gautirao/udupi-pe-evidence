import type { RawPost } from '@/hooks/useAdminData';

/**
 * Issue #2662 — pure partition of the admin ProcessPosts raw-posts array into
 * pending (unprocessed) and processed buckets. Moved verbatim from
 * ProcessPosts.tsx's two inline `.filter()` calls; no behavior change.
 */
export interface RawPostPartitions {
  unprocessedPosts: RawPost[];
  processedPosts: RawPost[];
}

export function partitionRawPosts(rawPosts: RawPost[]): RawPostPartitions {
  return {
    unprocessedPosts: rawPosts.filter((p) => !p.is_processed),
    processedPosts: rawPosts.filter((p) => p.is_processed),
  };
}
