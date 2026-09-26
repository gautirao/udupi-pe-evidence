import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProcessPostsEditorController } from '../useProcessPostsEditorController';
import type { RawPost } from '@/hooks/useAdminData';

const mutateAsync = vi.hoisted(() => vi.fn());
const isPending = vi.hoisted(() => ({ value: false }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn() },
}));

vi.mock('@/hooks/useAdminData', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useAdminData')>('@/hooks/useAdminData');
  return {
    ...actual,
    useUpdateRawPost: () => ({ mutateAsync, get isPending() { return isPending.value; } }),
  };
});

function makePost(id: string): RawPost {
  return {
    id,
    feed_run_id: null,
    external_post_id: null,
    content: 'original content',
    posted_at: null,
    author_name: null,
    source_url: null,
    is_processed: false,
    created_at: '2026-01-01T00:00:00Z',
    images: [],
  };
}

describe('useProcessPostsEditorController', () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    isPending.value = false;
  });

  it('open() seeds editingPost and editContent from the post', () => {
    const { result } = renderHook(() => useProcessPostsEditorController({ refetchPosts: vi.fn() }));

    act(() => result.current.open(makePost('p1')));

    expect(result.current.editingPost?.id).toBe('p1');
    expect(result.current.editContent).toBe('original content');
  });

  it('close() clears editingPost but does NOT clear editContent (matches original onOpenChange)', () => {
    const { result } = renderHook(() => useProcessPostsEditorController({ refetchPosts: vi.fn() }));

    act(() => result.current.open(makePost('p1')));
    act(() => result.current.setContent('edited draft'));
    act(() => result.current.close());

    expect(result.current.editingPost).toBeNull();
    expect(result.current.editContent).toBe('edited draft');
  });

  it('save() sends the exact mutateAsync payload, then clears state and refetches', async () => {
    mutateAsync.mockResolvedValue(undefined);
    const refetchPosts = vi.fn();
    const { result } = renderHook(() => useProcessPostsEditorController({ refetchPosts }));

    act(() => result.current.open(makePost('p1')));
    act(() => result.current.setContent('new content'));

    await act(async () => {
      await result.current.save();
    });

    expect(mutateAsync).toHaveBeenCalledWith({
      id: 'p1',
      updates: { content: 'new content', is_processed: false },
    });
    expect(result.current.editingPost).toBeNull();
    expect(result.current.editContent).toBe('');
    expect(refetchPosts).toHaveBeenCalledTimes(1);
  });

  it('save() with no editingPost is a no-op: never calls mutateAsync or refetchPosts', async () => {
    const refetchPosts = vi.fn();
    const { result } = renderHook(() => useProcessPostsEditorController({ refetchPosts }));

    await act(async () => {
      await result.current.save();
    });

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(refetchPosts).not.toHaveBeenCalled();
  });

  it('save() has no try/catch: a rejected mutateAsync propagates and leaves the dialog open with no refetch', async () => {
    mutateAsync.mockRejectedValue(new Error('save failed'));
    const refetchPosts = vi.fn();
    const { result } = renderHook(() => useProcessPostsEditorController({ refetchPosts }));

    act(() => result.current.open(makePost('p1')));

    await expect(
      act(async () => {
        await result.current.save();
      }),
    ).rejects.toThrow('save failed');

    expect(result.current.editingPost?.id).toBe('p1');
    expect(refetchPosts).not.toHaveBeenCalled();
  });
});
