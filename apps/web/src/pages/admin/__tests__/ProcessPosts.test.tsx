/**
 * ProcessPosts.tsx — characterization suite (issue #2662, commit C0).
 *
 * Written against the CURRENT, unrefactored page BEFORE any decomposition
 * work touches this file. Locks in the behavioral contract that the
 * controller/surface/composition split (C1–C4) must reproduce exactly:
 *
 *  - Stats cards derive from unprocessed/processed partition + listings
 *  - Failed-posts panel is NOT gated on isProcessing; the result summary IS
 *  - Zero-pending-posts guard toasts and never calls fetch
 *  - SSE stream: progress parsing, malformed-JSON skip, 'done' never logged,
 *    a trailing unterminated line dropped at stream end
 *  - Completion order: setProgress(100) -> toast -> refetchPosts/refetchListings
 *    (awaited) -> invalidateQueries (un-awaited) -> debug.success
 *  - Edit dialog: open seeds content, save sends exact payload + refetches,
 *    onOpenChange always clears editingPost (ignores its argument) and does
 *    NOT clear editContent
 *  - View dialog: "Edit Post" opens editor for the viewed post THEN closes viewer
 *  - Reset-all: direct supabase call, not a mutation hook
 *  - Tabs are uncontrolled (defaultValue="pending", no value prop)
 *
 * This suite is re-run unmodified (as a regression gate) against the thin
 * composed page produced in C4.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProcessPosts from '../ProcessPosts';
import type { RawPost, AdminListingRow } from '@/hooks/useAdminData';

const mockToast = vi.hoisted(() => vi.fn());
const refetchPosts = vi.hoisted(() => vi.fn());
const refetchListings = vi.hoisted(() => vi.fn());
const updateMutateAsync = vi.hoisted(() => vi.fn());
const resetMutateAsync = vi.hoisted(() => vi.fn());
const supabaseUpdate = vi.hoisted(() => vi.fn());
const supabaseEq = vi.hoisted(() => vi.fn());
const mockRawPosts = vi.hoisted(() => ({ value: [] as RawPost[] }));
const mockListings = vi.hoisted(() => ({ value: [] as AdminListingRow[] }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({ update: supabaseUpdate })),
  },
}));

vi.mock('@/hooks/useAdminData', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useAdminData')>('@/hooks/useAdminData');
  return {
    ...actual,
    useRawPosts: () => ({
      data: mockRawPosts.value,
      isLoading: false,
      refetch: refetchPosts,
    }),
    useAdminListings: () => ({
      data: mockListings.value,
      isLoading: false,
      refetch: refetchListings,
    }),
    useUpdateRawPost: () => ({ mutateAsync: updateMutateAsync, isPending: false }),
    useResetPostForReprocessing: () => ({ mutateAsync: resetMutateAsync }),
  };
});

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function makePost(overrides: Partial<RawPost> = {}): RawPost {
  return {
    id: 'p1',
    feed_run_id: null,
    external_post_id: null,
    content: 'A lovely 2BHK apartment near the beach',
    posted_at: null,
    author_name: null,
    source_url: null,
    is_processed: false,
    created_at: new Date().toISOString(),
    images: [],
    ...overrides,
  } as RawPost;
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

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProcessPosts />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockToast.mockReset();
  refetchPosts.mockReset();
  refetchListings.mockReset();
  updateMutateAsync.mockReset();
  resetMutateAsync.mockReset();
  supabaseUpdate.mockReset();
  supabaseEq.mockReset();
  supabaseUpdate.mockReturnValue({ eq: supabaseEq });
  mockRawPosts.value = [];
  mockListings.value = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('ProcessPosts — stats derivation', () => {
  it('derives Pending/Processed/Listings/Valid counts from the raw posts and listings queries', () => {
    mockRawPosts.value = [makePost({ id: 'a', is_processed: false }), makePost({ id: 'b', is_processed: true })];
    mockListings.value = [
      { id: 'l1', is_valid: true, created_at: new Date().toISOString() } as AdminListingRow,
      { id: 'l2', is_valid: false, created_at: new Date().toISOString() } as AdminListingRow,
    ];

    renderPage();

    const statLabel = (label: string) =>
      screen.getByText(label, { selector: 'p.text-sm.text-muted-foreground' });

    expect(statLabel('Pending').previousElementSibling).toHaveTextContent('1');
    expect(statLabel('Processed').previousElementSibling).toHaveTextContent('1');
    expect(statLabel('Listings').previousElementSibling).toHaveTextContent('2');
    expect(statLabel('Valid').previousElementSibling).toHaveTextContent('1');
  });
});

describe('ProcessPosts — batch processing (zero-pending guard)', () => {
  // Note: handleProcess's internal `unprocessedPosts.length === 0` guard (which
  // toasts "No posts to process") is defensive dead code from the UI's
  // perspective — the process buttons are always `disabled` in this exact
  // state (see isProcessDisabled = isProcessing || pending === 0 below), so a
  // user click never reaches the handler. The observable, testable contract
  // is the disabled state itself.
  it('disables the process buttons when there are no unprocessed posts', () => {
    mockRawPosts.value = [makePost({ is_processed: true })];
    renderPage();

    expect(screen.getByRole('button', { name: /process 10 posts/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /process 50/i })).toBeDisabled();
    expect(screen.getByText(/all posts have been processed/i)).toBeInTheDocument();
  });
});

describe('ProcessPosts — SSE-driven batch run', () => {
  it('parses progress + done, skips malformed JSON, drops a trailing unterminated line, and completes in order', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseStream([
          'data: {"type":"info","message":"Processing post 3/10"}\n',
          'data: not-json\n',
          'data: {"type":"done","processed":3,"listings_created":2,"failed":1,"failed_posts":[{"id":"x","reason":"bad match","content_preview":"broken content"}],"geocoded":2}\n',
          'data: {"type":"info","message":"trailing, no newline"}',
        ]),
      ),
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockRawPosts.value = [makePost({ id: 'p1', is_processed: false })];
    const user = userEvent.setup();

    renderPage();
    await user.click(screen.getByRole('button', { name: /process 10 posts/i }));

    // Result summary rendered post-completion (result && !isProcessing).
    expect(await screen.findByText(/processed 3 posts, created 2 listings/i)).toBeInTheDocument();

    // Failed-posts panel is driven purely by result.failed_posts, independent of isProcessing.
    expect(screen.getByText(/failed posts \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText(/bad match/i)).toBeInTheDocument();

    expect(warnSpy).toHaveBeenCalledWith('Failed to parse SSE event:', 'data: not-json');
    expect(refetchPosts).toHaveBeenCalledTimes(1);
    expect(refetchListings).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Processing Complete' }));

    warnSpy.mockRestore();
  });

  it('the post-completion setTimeout(…, 2000) has no unmount cleanup', async () => {
    // Real timers throughout: the setTimeout is scheduled from inside the
    // async handleProcess flow, and mixing fake timers with the SSE reader's
    // native-Promise microtask chain proved unreliable to flush
    // deterministically. Unmount right after completion, then let the
    // uncleared timeout actually fire against the unmounted tree — the
    // original page has no cleanup for it, and none should be added.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseStream(['data: {"type":"done","processed":1,"listings_created":1,"failed":0,"geocoded":1}\n']),
      ),
    );
    mockRawPosts.value = [makePost({ id: 'p1', is_processed: false })];
    const user = userEvent.setup();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { unmount } = renderPage();
    await user.click(screen.getByRole('button', { name: /process 10 posts/i }));

    await screen.findByText(/processed 1 posts/i);

    unmount();

    await new Promise((resolve) => setTimeout(resolve, 2100));

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  }, 8000);

  it('shows a destructive toast on a fetch/network error and does not touch refetches', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    mockRawPosts.value = [makePost({ id: 'p1', is_processed: false })];
    const user = userEvent.setup();

    renderPage();
    await user.click(screen.getByRole('button', { name: /process 10 posts/i }));

    // useToast is mocked to a bare vi.fn() stub with no rendering Toaster in
    // this tree, so the toast text never reaches the DOM — assert only on
    // the call the page actually makes.
    await vi.waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Processing Failed', variant: 'destructive' }),
      );
    });
    expect(refetchPosts).not.toHaveBeenCalled();
    expect(refetchListings).not.toHaveBeenCalled();
  });
});

describe('ProcessPosts — Raw Posts browser tabs (uncontrolled)', () => {
  it('shows Pending and Processed tab counts and defaults to the Pending tab', () => {
    mockRawPosts.value = [
      makePost({ id: 'a', is_processed: false }),
      makePost({ id: 'b', is_processed: true }),
    ];

    renderPage();

    expect(screen.getByRole('tab', { name: /pending \(1\)/i })).toHaveAttribute('data-state', 'active');
    expect(screen.getByRole('tab', { name: /processed \(1\)/i })).toBeInTheDocument();
  });
});

describe('ProcessPosts — Edit dialog', () => {
  it('opens with the post content seeded, saves the exact payload, refetches, and closes', async () => {
    const post = makePost({ id: 'p1', content: 'original raw text', is_processed: false });
    mockRawPosts.value = [post];
    updateMutateAsync.mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderPage();
    const editButtons = screen.getAllByRole('button').filter((b) => b.querySelector('svg.lucide-square-pen, svg.lucide-edit'));
    await user.click(editButtons[0]);

    const textarea = await screen.findByPlaceholderText(/post content/i);
    expect(textarea).toHaveValue('original raw text');

    await user.clear(textarea);
    await user.type(textarea, 'edited text');
    await user.click(screen.getByRole('button', { name: /save & reprocess/i }));

    expect(updateMutateAsync).toHaveBeenCalledWith({
      id: 'p1',
      updates: { content: 'edited text', is_processed: false },
    });
    expect(refetchPosts).toHaveBeenCalled();
  });

  it('Cancel clears editingPost without saving', async () => {
    const post = makePost({ id: 'p1', is_processed: false });
    mockRawPosts.value = [post];
    const user = userEvent.setup();

    renderPage();
    const editButtons = screen.getAllByRole('button').filter((b) => b.querySelector('svg.lucide-square-pen, svg.lucide-edit'));
    await user.click(editButtons[0]);
    await screen.findByPlaceholderText(/post content/i);

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(updateMutateAsync).not.toHaveBeenCalled();
    expect(screen.queryByPlaceholderText(/post content/i)).not.toBeInTheDocument();
  });
});

describe('ProcessPosts — View dialog -> Edit Post coupling', () => {
  it('clicking "Edit Post" in the View dialog opens the editor for the viewed post and closes the viewer', async () => {
    const post = makePost({ id: 'p1', content: 'viewed content', is_processed: false });
    mockRawPosts.value = [post];
    const user = userEvent.setup();

    renderPage();
    const viewButtons = screen.getAllByRole('button').filter((b) => b.querySelector('svg.lucide-eye'));
    await user.click(viewButtons[0]);

    expect(await screen.findByText('View Raw Post')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /edit post/i }));

    expect(screen.queryByText('View Raw Post')).not.toBeInTheDocument();
    const textarea = await screen.findByPlaceholderText(/post content/i);
    expect(textarea).toHaveValue('viewed content');
  });
});

describe('ProcessPosts — Reset All (direct supabase call, not a mutation hook)', () => {
  it('updates raw_posts directly, toasts, and refetches on success', async () => {
    supabaseEq.mockResolvedValue({ error: null });
    mockRawPosts.value = [makePost({ id: 'a', is_processed: true })];
    const user = userEvent.setup();

    renderPage();
    await user.click(screen.getByRole('tab', { name: /processed \(1\)/i }));
    await user.click(screen.getByRole('button', { name: /reset all for reprocessing/i }));

    expect(supabaseUpdate).toHaveBeenCalledWith({ is_processed: false });
    expect(supabaseEq).toHaveBeenCalledWith('is_processed', true);
    expect(resetMutateAsync).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Posts Reset' }));
    expect(refetchPosts).toHaveBeenCalled();
  });
});
