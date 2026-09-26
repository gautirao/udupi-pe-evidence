import { describe, it, expect } from 'vitest';
import { partitionRawPosts } from '../rawPostPartitions';
import type { RawPost } from '@/hooks/useAdminData';

function makePost(overrides: Partial<RawPost> = {}): RawPost {
  return {
    id: 'p1',
    feed_run_id: null,
    external_post_id: null,
    content: 'content',
    posted_at: null,
    author_name: null,
    source_url: null,
    is_processed: false,
    created_at: '2026-01-01T00:00:00Z',
    images: [],
    ...overrides,
  };
}

describe('partitionRawPosts', () => {
  it('splits posts into unprocessed and processed buckets', () => {
    const posts = [
      makePost({ id: 'a', is_processed: false }),
      makePost({ id: 'b', is_processed: true }),
      makePost({ id: 'c', is_processed: false }),
    ];
    const { unprocessedPosts, processedPosts } = partitionRawPosts(posts);
    expect(unprocessedPosts.map((p) => p.id)).toEqual(['a', 'c']);
    expect(processedPosts.map((p) => p.id)).toEqual(['b']);
  });

  it('returns empty arrays for an empty input', () => {
    const { unprocessedPosts, processedPosts } = partitionRawPosts([]);
    expect(unprocessedPosts).toEqual([]);
    expect(processedPosts).toEqual([]);
  });
});
