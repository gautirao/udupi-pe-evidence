import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProcessPostsViewerController } from '../useProcessPostsViewerController';
import type { RawPost } from '@/hooks/useAdminData';

function makePost(id: string): RawPost {
  return {
    id,
    feed_run_id: null,
    external_post_id: null,
    content: 'content',
    posted_at: null,
    author_name: null,
    source_url: null,
    is_processed: false,
    created_at: '2026-01-01T00:00:00Z',
    images: [],
  };
}

describe('useProcessPostsViewerController', () => {
  it('open() sets viewingPost; close() clears it', () => {
    const { result } = renderHook(() => useProcessPostsViewerController({ openEditor: vi.fn() }));

    act(() => result.current.open(makePost('v1')));
    expect(result.current.viewingPost?.id).toBe('v1');

    act(() => result.current.close());
    expect(result.current.viewingPost).toBeNull();
  });

  it('editViewed() opens the editor for the viewed post THEN closes the viewer, in that order', () => {
    const calls: string[] = [];
    const openEditor = vi.fn((post: RawPost) => calls.push(`openEditor:${post.id}`));
    const { result } = renderHook(() => useProcessPostsViewerController({ openEditor }));

    act(() => result.current.open(makePost('v1')));
    act(() => result.current.editViewed());

    expect(openEditor).toHaveBeenCalledWith(expect.objectContaining({ id: 'v1' }));
    expect(result.current.viewingPost).toBeNull();
  });

  it('editViewed() is a no-op when nothing is being viewed', () => {
    const openEditor = vi.fn();
    const { result } = renderHook(() => useProcessPostsViewerController({ openEditor }));

    act(() => result.current.editViewed());

    expect(openEditor).not.toHaveBeenCalled();
    expect(result.current.viewingPost).toBeNull();
  });
});
