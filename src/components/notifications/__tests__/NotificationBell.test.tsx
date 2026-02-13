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

  it('hides badge when unread count is 0', () => {
    mockUnreadCount = { data: { count: 0 } };
    renderBell();

    const badge = screen.queryByText('0');
    expect(badge).not.toBeInTheDocument();
  });

  it('shows unread count on badge', () => {
    mockUnreadCount = { data: { count: 5 } };
    renderBell();

    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('shows 99+ when unread count exceeds 99', () => {
    mockUnreadCount = { data: { count: 150 } };
    renderBell();

    expect(screen.getByText('99+')).toBeInTheDocument();
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

    expect(mockNavigate).toHaveBeenCalledWith('/listings/abc-123');
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
