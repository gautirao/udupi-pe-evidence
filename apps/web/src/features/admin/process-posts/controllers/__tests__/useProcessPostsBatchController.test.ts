import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useProcessPostsBatchController } from '../useProcessPostsBatchController';
import type { RawPost } from '@/hooks/useAdminData';

const mockToast = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
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
    is_processed: false,
    created_at: '2026-01-01T00:00:00Z',
    images: [],
  };
}

function sseStream(lines: string[]) {
  const encoder = new TextEncoder();
  let i = 0;
  return {
    body: {
      getReader: () => ({
        read: async () => {
          if (i >= lines.length) return { done: true, value: undefined };
          const value = encoder.encode(lines[i]);
          i += 1;
          return { done: false, value };
        },
      }),
    },
    ok: true,
    status: 200,
  } as unknown as Response;
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

function renderBatchController(params: Partial<Parameters<typeof useProcessPostsBatchController>[0]> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
  const debug = makeDebug();
  const refetchPosts = vi.fn().mockResolvedValue(undefined);
  const refetchListings = vi.fn().mockResolvedValue(undefined);
  const expandConsole = vi.fn();

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  const hook = renderHook(
    () =>
      useProcessPostsBatchController({
        unprocessedPosts: [makePost('p1')],
        refetchPosts,
        refetchListings,
        debug,
        expandConsole,
        ...params,
      }),
    { wrapper },
  );

  return { ...hook, debug, refetchPosts, refetchListings, expandConsole, invalidateQueries };
}

beforeEach(() => {
  mockToast.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useProcessPostsBatchController — zero pending posts', () => {
  it('shows a toast and never calls fetch', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { result } = renderBatchController({ unprocessedPosts: [] });

    await act(async () => {
      await result.current.process(10);
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'No posts to process' }),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('useProcessPostsBatchController — SSE parsing and completion', () => {
  it('parses progress, done, and skips malformed JSON, then completes in the documented order', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseStream([
          'data: {"type":"info","message":"Processing post 3/10"}\n',
          'not-a-data-line\n',
          'data: not-json\n',
          'data: {"type":"done","processed":3,"listings_created":2,"failed":1,"failed_posts":[{"id":"x","reason":"bad","content_preview":"..."}],"geocoded":2}\n',
        ]),
      ),
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { result, debug, refetchPosts, refetchListings, expandConsole, invalidateQueries } =
      renderBatchController();

    await act(async () => {
      await result.current.process(10);
    });

    // Progress parsed from "Processing post 3/10" → 30%, then set to 100 on stream end.
    expect(result.current.progress).toBe(100);
    // 'done' payload becomes the result, never passed to addLog.
    expect(result.current.result).toMatchObject({
      success: true,
      processed: 3,
      listings_created: 2,
      failed: 1,
    });
    expect(debug.addLog).not.toHaveBeenCalledWith('done', expect.anything(), expect.anything());
    expect(debug.addLog).toHaveBeenCalledWith('info', 'Processing post 3/10', undefined);
    expect(warnSpy).toHaveBeenCalledWith('Failed to parse SSE event:', 'data: not-json');
    expect(expandConsole).toHaveBeenCalled();

    // Completion order: both refetches, then (un-awaited) invalidate, then debug.success.
    expect(refetchPosts).toHaveBeenCalledTimes(1);
    expect(refetchListings).toHaveBeenCalledTimes(1);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['property-listings'] });
    expect(debug.success).toHaveBeenCalledWith('Data refreshed');
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Processing Complete' }));

    warnSpy.mockRestore();
  });

  it('drops a trailing unterminated SSE line at stream end', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseStream([
          'data: {"type":"done","processed":1,"listings_created":0,"failed":0,"geocoded":0}\n',
          'data: {"type":"info","message":"trailing, no newline"}',
        ]),
      ),
    );
    const { result, debug } = renderBatchController();

    await act(async () => {
      await result.current.process(10);
    });

    // The trailing unterminated line was never flushed as a complete line,
    // so it is never logged.
    expect(debug.addLog).not.toHaveBeenCalledWith('info', 'trailing, no newline', undefined);
  });

  it('sets isProcessing false in finally on both success and error paths, and resets progress after 2000ms with no cleanup', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseStream(['data: {"type":"done","processed":1,"listings_created":1,"failed":0,"geocoded":1}\n'])));
    const { result } = renderBatchController();

    let processPromise!: Promise<void>;
    act(() => {
      processPromise = result.current.process(10);
    });
    await act(async () => {
      await processPromise;
    });

    expect(result.current.isProcessing).toBe(false);
    expect(result.current.progress).toBe(100);

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.progress).toBe(0);
  });

  it('on fetch/network error: shows destructive toast, logs via debug.error, does not touch refetches, and still clears isProcessing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const { result, debug, refetchPosts, refetchListings } = renderBatchController();

    await act(async () => {
      await result.current.process(10);
    });

    expect(result.current.isProcessing).toBe(false);
    expect(debug.error).toHaveBeenCalledWith('Processing failed', 'network down');
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Processing Failed', variant: 'destructive' }),
    );
    expect(refetchPosts).not.toHaveBeenCalled();
    expect(refetchListings).not.toHaveBeenCalled();
  });

  it('throws on a non-OK response before reading the body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response));
    const { result, debug } = renderBatchController();

    await act(async () => {
      await result.current.process(10);
    });

    expect(debug.error).toHaveBeenCalledWith('Processing failed', 'HTTP error: 500');
  });

  it('posts the exact URL, method, headers, and body', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(sseStream(['data: {"type":"done","processed":0,"listings_created":0,"failed":0,"geocoded":0}\n']));
    vi.stubGlobal('fetch', fetchSpy);
    const { result } = renderBatchController();

    await act(async () => {
      await result.current.process(25);
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-posts`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        }),
        body: JSON.stringify({ batch_size: 25, stream: true }),
      }),
    );
  });
});
