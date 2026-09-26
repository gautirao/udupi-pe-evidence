import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useProcessPostsDataController } from '../useProcessPostsDataController';
import type { RawPost } from '@/hooks/useAdminData';

const refetchPosts = vi.hoisted(() => vi.fn());
const refetchListings = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn() },
}));

vi.mock('@/hooks/useAdminData', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useAdminData')>('@/hooks/useAdminData');
  return {
    ...actual,
    useRawPosts: vi.fn(),
    useAdminListings: vi.fn(),
  };
});

import { useRawPosts, useAdminListings } from '@/hooks/useAdminData';

function makePost(id: string, isProcessed: boolean): RawPost {
  return {
    id,
    feed_run_id: null,
    external_post_id: null,
    content: `content-${id}`,
    posted_at: null,
    author_name: null,
    source_url: null,
    is_processed: isProcessed,
    created_at: '2026-01-01T00:00:00Z',
    images: [],
  };
}

describe('useProcessPostsDataController', () => {
  it('partitions raw posts and summarizes listings from the two underlying queries', () => {
    vi.mocked(useRawPosts).mockReturnValue({
      data: [makePost('a', false), makePost('b', true)],
      isLoading: false,
      refetch: refetchPosts,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    vi.mocked(useAdminListings).mockReturnValue({
      data: [],
      isLoading: false,
      refetch: refetchListings,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { result } = renderHook(() => useProcessPostsDataController());

    expect(result.current.unprocessedPosts).toHaveLength(1);
    expect(result.current.unprocessedPosts[0].id).toBe('a');
    expect(result.current.processedPosts).toHaveLength(1);
    expect(result.current.processedPosts[0].id).toBe('b');
    expect(useRawPosts).toHaveBeenCalledWith(undefined, 200);
    expect(useAdminListings).toHaveBeenCalledWith(50);
  });

  it('refresh() fires both refetches without awaiting either', () => {
    vi.mocked(useRawPosts).mockReturnValue({
      data: [],
      isLoading: false,
      refetch: refetchPosts,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    vi.mocked(useAdminListings).mockReturnValue({
      data: [],
      isLoading: false,
      refetch: refetchListings,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    refetchPosts.mockClear();
    refetchListings.mockClear();

    const { result } = renderHook(() => useProcessPostsDataController());
    const returnValue = result.current.refresh();

    expect(refetchPosts).toHaveBeenCalledTimes(1);
    expect(refetchListings).toHaveBeenCalledTimes(1);
    expect(returnValue).toBeUndefined();
  });
});
