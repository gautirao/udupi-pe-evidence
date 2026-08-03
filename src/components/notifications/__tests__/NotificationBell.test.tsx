import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { NotificationBell } from '../NotificationBell';

// ─── Polyfills for jsdom ─────────────────────────────────

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

// ─── Mocks ──────────────────────────────────────────────

const mockRefetch = vi.fn().mockResolvedValue({ data: [] });
const mockMutate = vi.fn();
const mockNavigate = vi.fn();

let mockNotifications: {
  data: Array<{
    id: string;
    type: string;
    title: string;
    message: string;
    metadata: string | null;
    isRead: boolean;
    createdAt: string;
  }>;
  isLoading: boolean;
  isError: boolean;
  refetch: typeof mockRefetch;
};

let mockUnreadCount: { data: { count: number } | undefined };

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/hooks/useNotifications', () => ({
  useNotifications: () => mockNotifications,
  useUnreadCount: () => mockUnreadCount,
  useMarkAsRead: () => ({ mutate: mockMutate }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

// ─── Helpers ────────────────────────────────────────────

function makeNotification(
  id: string,
  overrides: Partial<(typeof mockNotifications)['data'][number]> = {},
) {
  return {
    id,
    type: 'listing_approved',
    title: `Notification ${id}`,
    message: `Message for ${id}`,
    metadata: null,
    isRead: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function renderBell() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ─── Tests ──────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockNotifications = {
    data: [],
    isLoading: false,
    isError: false,
    refetch: mockRefetch,
  };
  mockUnreadCount = { data: { count: 0 } };
});

describe('NotificationBell', () => {
  // ── Badge count ───────────────────────────────────────
  //
  // Issue #2046 alleged the broker badge wrongly gets stuck at "99+".
  // Investigation DISPROVED the defect: measured at the canonical boundary
  // (GET /api/notifications/unread-count, HTTP 200), the reported broker
  // account genuinely has 444 unread notifications (450 total). Since
  // 444 >= 100, "99+" is the CORRECT rendering, not a bug. The count is
  // uncapped server-side; "99+" is purely client-side display formatting
  // in NotificationBell.tsx (`{unreadCount > 99 ? '99+' : unreadCount}`).
  //
  // These cases lock in the current, correct badge-count contract so a
  // future change can't silently reintroduce (or "fix") behaviour that
  // was never broken.

  it('hides badge when unread count is 0', () => {
    mockUnreadCount = { data: { count: 0 } };
    renderBell();

    // Assert the badge element itself is absent, not just the text "0" —
    // the badge is gated by `unreadCount > 0 && (...)`, so no badge span
    // should be rendered at all. Scoped to the badge's distinguishing class
    // (NotificationBell.tsx:61) rather than any <span>, so this doesn't
    // false-fail if an unrelated sr-only label span is later added to the
    // button for accessibility.
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(screen.queryByText('99+')).not.toBeInTheDocument();
    const bellButton = screen.getByRole('button');
    expect(bellButton.querySelector('.bg-destructive')).not.toBeInTheDocument();
  });

  it('shows unread count on badge', () => {
    mockUnreadCount = { data: { count: 5 } };
    renderBell();

    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('shows exactly "1" when unread count is 1', () => {
    mockUnreadCount = { data: { count: 1 } };
    renderBell();

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.queryByText('99+')).not.toBeInTheDocument();
  });

  it('shows exactly "99" (not "99+") when unread count is 99 — off-by-one boundary', () => {
    mockUnreadCount = { data: { count: 99 } };
    renderBell();

    expect(screen.getByText('99')).toBeInTheDocument();
    expect(screen.queryByText('99+')).not.toBeInTheDocument();
  });

  it('shows "99+" when unread count is exactly 100 — first saturating value', () => {
    mockUnreadCount = { data: { count: 100 } };
    renderBell();

    expect(screen.getByText('99+')).toBeInTheDocument();
    expect(screen.queryByText('100')).not.toBeInTheDocument();
  });

  it('shows "99+" when unread count is 150', () => {
    mockUnreadCount = { data: { count: 150 } };
    renderBell();

    expect(screen.getByText('99+')).toBeInTheDocument();
  });

  it('shows "99+" for count=444 — the real measured value from the #2046 investigation (broker account has 444 unread / 450 total)', () => {
    mockUnreadCount = { data: { count: 444 } };
    renderBell();

    expect(screen.getByText('99+')).toBeInTheDocument();
    expect(screen.queryByText('444')).not.toBeInTheDocument();
  });

  it('updates the badge in place when the unread count decreases after a mark-read, with no unmount/remount', async () => {
    // NOTE on scope: useNotifications/useUnreadCount/useMarkAsRead are mocked
    // wholesale in this file, so the component never exercises real
    // react-query cache invalidation. This test cannot and does not claim to
    // prove end-to-end query invalidation. What it DOES prove: given the
    // hook's return value changes (as it would after a real invalidated
    // refetch), the component re-renders the new count in place via the
    // same mounted tree — no navigation, no re-login, no remount. Element
    // identity of the button across the rerender is the falsifiable check:
    // a remount would produce a new DOM node, failing the `.toBe` assertion.
    mockUnreadCount = { data: { count: 3 } };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const tree = (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <NotificationBell />
        </MemoryRouter>
      </QueryClientProvider>
    );
    const { rerender } = render(tree);

    expect(screen.getByText('3')).toBeInTheDocument();
    const buttonBefore = screen.getByRole('button');

    mockUnreadCount = { data: { count: 2 } };
    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <NotificationBell />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByRole('button')).toBe(buttonBefore);
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.queryByText('3')).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  // ── Empty state ───────────────────────────────────────

  it('shows empty state when no notifications', async () => {
    const user = userEvent.setup();
    renderBell();

    await user.click(screen.getByRole('button'));
    expect(screen.getByText('No notifications')).toBeInTheDocument();
  });

  // ── Error state ───────────────────────────────────────

  it('shows error message when fetch fails', async () => {
    mockNotifications = {
      data: [],
      isLoading: false,
      isError: true,
      refetch: mockRefetch,
    };
    const user = userEvent.setup();
    renderBell();

    await user.click(screen.getByRole('button'));
    expect(screen.getByText('Unable to load notifications')).toBeInTheDocument();
  });

  // ── Notification list ─────────────────────────────────

  it('renders notifications in the dropdown', async () => {
    mockNotifications = {
      data: [
        makeNotification('1', { title: 'Listing approved' }),
        makeNotification('2', { title: 'New offer', isRead: true }),
      ],
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    };
    const user = userEvent.setup();
    renderBell();

    await user.click(screen.getByRole('button'));
    expect(screen.getByText('Listing approved')).toBeInTheDocument();
    expect(screen.getByText('New offer')).toBeInTheDocument();
  });

  // ── Refetch on open ───────────────────────────────────

  it('calls refetch when popover opens', async () => {
    const user = userEvent.setup();
    renderBell();

    await user.click(screen.getByRole('button'));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  // ── Mark as read ──────────────────────────────────────

  it('calls markAsRead.mutate for unread notification on click', async () => {
    mockNotifications = {
      data: [makeNotification('n-1', { title: 'Unread item' })],
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    };
    const user = userEvent.setup();
    renderBell();

    await user.click(screen.getByRole('button'));
    await user.click(screen.getByText('Unread item'));

    expect(mockMutate).toHaveBeenCalledWith('n-1');
  });

  it('does not call markAsRead for already-read notification', async () => {
    mockNotifications = {
      data: [makeNotification('n-2', { title: 'Read item', isRead: true })],
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    };
    const user = userEvent.setup();
    renderBell();

    await user.click(screen.getByRole('button'));
    await user.click(screen.getByText('Read item'));

    expect(mockMutate).not.toHaveBeenCalled();
  });

  // ── Navigation ────────────────────────────────────────

  it('navigates to listing when metadata contains listing_id', async () => {
    mockNotifications = {
      data: [
        makeNotification('n-3', {
          title: 'Nav test',
          metadata: JSON.stringify({ listing_id: 'abc-123' }),
        }),
      ],
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    };
    const user = userEvent.setup();
    renderBell();

    await user.click(screen.getByRole('button'));
    await user.click(screen.getByText('Nav test'));

    expect(mockNavigate).toHaveBeenCalledWith('/listing/abc-123');
  });

  it('does not navigate when metadata has no listing_id', async () => {
    mockNotifications = {
      data: [
        makeNotification('n-4', {
          title: 'No nav',
          metadata: JSON.stringify({ foo: 'bar' }),
        }),
      ],
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    };
    const user = userEvent.setup();
    renderBell();

    await user.click(screen.getByRole('button'));
    await user.click(screen.getByText('No nav'));

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  // ── Loading state ─────────────────────────────────────

  it('shows loading state', async () => {
    mockNotifications = {
      data: [],
      isLoading: true,
      isError: false,
      refetch: mockRefetch,
    };
    const user = userEvent.setup();
    renderBell();

    await user.click(screen.getByRole('button'));
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });
});
