import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProcessPostsResetController } from '../useProcessPostsResetController';
import type { RawPost } from '@/hooks/useAdminData';

const resetMutateAsync = vi.hoisted(() => vi.fn());
const mockToast = vi.hoisted(() => vi.fn());
const supabaseUpdate = vi.hoisted(() => vi.fn());
const supabaseEq = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useAdminData', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useAdminData')>('@/hooks/useAdminData');
  return {
    ...actual,
    useResetPostForReprocessing: () => ({ mutateAsync: resetMutateAsync }),
  };
});

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      update: supabaseUpdate,
    })),
  },
}));

function makePost(id: string): RawPost {
  return {
    id,
    feed_run_id: null,
    external_post_id: null,
    content: 'content',
    posted_at: null,
    author_name: null,
    source_url: null,
    is_processed: true,
    created_at: '2026-01-01T00:00:00Z',
    images: [],
  };
}

function makeDebug() {
  return {
    logs: [],
    addLog: vi.fn(),
    clearLogs: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    ai: vi.fn(),
  };
}

describe('useProcessPostsResetController — resetPost', () => {
  beforeEach(() => {
    resetMutateAsync.mockReset();
    mockToast.mockReset();
    supabaseUpdate.mockReset();
    supabaseEq.mockReset();
  });

  it('awaits the mutation then refetches posts', async () => {
    resetMutateAsync.mockResolvedValue(undefined);
    const refetchPosts = vi.fn();
    const { result } = renderHook(() =>
      useProcessPostsResetController({ processedPosts: [], refetchPosts, debug: makeDebug() }),
    );

    await act(async () => {
      await result.current.resetPost('post-1');
    });

    expect(resetMutateAsync).toHaveBeenCalledWith('post-1');
    expect(refetchPosts).toHaveBeenCalledTimes(1);
  });
});

describe('useProcessPostsResetController — resetAll', () => {
  beforeEach(() => {
    resetMutateAsync.mockReset();
    mockToast.mockReset();
    supabaseUpdate.mockReset();
    supabaseEq.mockReset();
    supabaseUpdate.mockReturnValue({ eq: supabaseEq });
  });

  it('is a no-op when there are no processed posts', async () => {
    const refetchPosts = vi.fn();
    const debug = makeDebug();
    const { result } = renderHook(() =>
      useProcessPostsResetController({ processedPosts: [], refetchPosts, debug }),
    );

    await act(async () => {
      await result.current.resetAll();
    });

    expect(supabaseUpdate).not.toHaveBeenCalled();
    expect(refetchPosts).not.toHaveBeenCalled();
  });

  it('on success: updates via the direct supabase call, toasts, awaits refetch, and clears isResettingAll', async () => {
    supabaseEq.mockResolvedValue({ error: null });
    const refetchPosts = vi.fn().mockResolvedValue(undefined);
    const debug = makeDebug();
    const processedPosts = [makePost('a'), makePost('b')];
    const { result } = renderHook(() =>
      useProcessPostsResetController({ processedPosts, refetchPosts, debug }),
    );

    await act(async () => {
      await result.current.resetAll();
    });

    expect(supabaseUpdate).toHaveBeenCalledWith({ is_processed: false });
    expect(supabaseEq).toHaveBeenCalledWith('is_processed', true);
    expect(refetchPosts).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Posts Reset' }),
    );
    expect(result.current.isResettingAll).toBe(false);
  });

  it('on supabase error: shows a destructive toast, logs via debug.error, and clears isResettingAll', async () => {
    supabaseEq.mockResolvedValue({ error: new Error('db exploded') });
    const refetchPosts = vi.fn();
    const debug = makeDebug();
    const processedPosts = [makePost('a')];
    const { result } = renderHook(() =>
      useProcessPostsResetController({ processedPosts, refetchPosts, debug }),
    );

    await act(async () => {
      await result.current.resetAll();
    });

    expect(debug.error).toHaveBeenCalledWith('Failed to reset posts', 'db exploded');
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Reset Failed', variant: 'destructive' }),
    );
    expect(refetchPosts).not.toHaveBeenCalled();
    expect(result.current.isResettingAll).toBe(false);
  });
});
