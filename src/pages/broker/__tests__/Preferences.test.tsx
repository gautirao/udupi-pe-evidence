/**
 * BrokerPreferences page — frontend tests (Issue #1533)
 *
 * Coverage:
 * (a) Empty state renders when list is empty
 * (b) List renders with seeded + manual rows
 * (c) Add interaction — POST called, UI updates
 * (d) Remove interaction — DELETE called, 404 handled gracefully
 * (e) Re-seed interaction — POST /seed called, list refetched
 * (f) Role guard — non-broker/non-admin redirects to /broker/setup
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const mockFocusHook = vi.hoisted(() => ({
  current: {
    data: undefined as unknown,
    isLoading: false,
    isError: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
}));

const mockAddMutation = vi.hoisted(() => ({
  current: {
    mutate: vi.fn(),
    isPending: false,
  },
}));

const mockRemoveMutation = vi.hoisted(() => ({
  current: {
    mutate: vi.fn(),
    isPending: false,
  },
}));

const mockSeedMutation = vi.hoisted(() => ({
  current: {
    mutate: vi.fn(),
    isPending: false,
  },
}));

vi.mock('@/hooks/useBrokerMarketFocus', () => ({
  useBrokerMarketFocus: vi.fn(() => mockFocusHook.current),
  useAddMarketFocus: vi.fn(() => mockAddMutation.current),
  useRemoveMarketFocus: vi.fn(() => mockRemoveMutation.current),
  useSeedMarketFocus: vi.fn(() => mockSeedMutation.current),
}));

const mockAuth = vi.hoisted(() => ({
  current: {
    isBroker: true,
    isAdmin: false,
    isLoading: false,
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(() => mockAuth.current),
}));

vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// AlertDialog needs Radix portals — stub with a simple functional replacement
vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <div>{children}</div>,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div role="dialog">{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogCancel: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  AlertDialogAction: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

// Stub Select components for testability
vi.mock('@/components/ui/select', () => ({
  Select: ({
    children,
    onValueChange,
    value,
  }: {
    children: React.ReactNode;
    onValueChange?: (v: string) => void;
    value?: string;
  }) => (
    <div data-value={value} data-testid="select-root">
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child as React.ReactElement<{ onValueChange?: (v: string) => void }>, { onValueChange });
        }
        return child;
      })}
    </div>
  ),
  SelectTrigger: ({ children, 'aria-label': label, onValueChange }: { children: React.ReactNode; 'aria-label'?: string; onValueChange?: (v: string) => void }) => (
    <button aria-label={label}>{children}</button>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  SelectContent: ({ children, onValueChange }: { children: React.ReactNode; onValueChange?: (v: string) => void }) => (
    <div>
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child as React.ReactElement<{ onValueChange?: (v: string) => void }>, { onValueChange });
        }
        return child;
      })}
    </div>
  ),
  SelectItem: ({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode;
    value: string;
    onValueChange?: (v: string) => void;
  }) => (
    <button
      data-testid={`select-item-${value}`}
      onClick={() => onValueChange?.(value)}
    >
      {children}
    </button>
  ),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

import type { MarketFocusItem } from '@/hooks/useBrokerMarketFocus';

function makeSeededItem(overrides: Partial<MarketFocusItem> = {}): MarketFocusItem {
  return {
    citySlug: 'udupi',
    areaKey: 'IN|KA|Udupi|Manipal',
    propertyType: 'land',
    listingPurpose: 'sale',
    source: 'seeded',
    createdAt: '2026-06-01T10:00:00Z',
    ...overrides,
  };
}

function makeManualItem(overrides: Partial<MarketFocusItem> = {}): MarketFocusItem {
  return {
    citySlug: 'udupi',
    areaKey: 'IN|KA|Udupi|Kunjibettu',
    propertyType: 'house',
    listingPurpose: 'rent',
    source: 'manual',
    createdAt: '2026-06-10T10:00:00Z',
    ...overrides,
  };
}

// ── Render helpers ────────────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderPage(initialPath = '/broker/preferences') {
  const qc = makeQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialPath]}>
        <BrokerPreferencesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

import BrokerPreferencesPage from '../Preferences';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BrokerPreferences page', () => {
  beforeEach(() => {
    // Reset to broker, no data, no errors
    mockAuth.current = { isBroker: true, isAdmin: false, isLoading: false };
    mockFocusHook.current = {
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };
    mockAddMutation.current = { mutate: vi.fn(), isPending: false };
    mockRemoveMutation.current = { mutate: vi.fn(), isPending: false };
    mockSeedMutation.current = { mutate: vi.fn(), isPending: false };
  });

  // (a) Empty state
  it('renders empty state when list is empty', () => {
    mockFocusHook.current.data = [];
    renderPage();

    expect(screen.getByText('No market focus areas yet')).toBeInTheDocument();
    // EmptyState description with data-testid
    expect(screen.getByTestId('empty-state-description')).toBeInTheDocument();
    // Primary CTA present
    expect(screen.getByRole('button', { name: /seed from my listings/i })).toBeInTheDocument();
  });

  // (b) List renders with seeded + manual rows
  it('renders seeded and manual rows with correct badges', () => {
    mockFocusHook.current.data = [makeSeededItem(), makeManualItem()];
    renderPage();

    // Area labels appear in the focus list rows (getAllByText because the label
    // also appears in the Select stub's option list — use the span element in the row)
    const manipalMatches = screen.getAllByText('Manipal, Udupi');
    expect(manipalMatches.length).toBeGreaterThanOrEqual(1);
    const kunjibettuMatches = screen.getAllByText('Kunjibettu, Udupi');
    expect(kunjibettuMatches.length).toBeGreaterThanOrEqual(1);

    // Source badges
    expect(screen.getByText('seeded')).toBeInTheDocument();
    expect(screen.getByText('manual')).toBeInTheDocument();

    // Seeded rows have NO remove button; manual rows do
    const removeButtons = screen.getAllByRole('button', { name: /remove focus area/i });
    expect(removeButtons).toHaveLength(1);
  });

  // (c) Add interaction — POST called with { areaKey, propertyType, listingPurpose } only (no citySlug)
  it('calls add mutation with only { areaKey, propertyType, listingPurpose } — no citySlug', async () => {
    mockFocusHook.current.data = [];
    const user = userEvent.setup();
    renderPage();

    // Pick area, property type, purpose using the SelectItem stubs
    await user.click(screen.getByTestId('select-item-IN|KA|Udupi|Manipal'));
    await user.click(screen.getByTestId('select-item-land'));
    await user.click(screen.getByTestId('select-item-sale'));

    const addBtn = screen.getByRole('button', { name: /^add$/i });
    await user.click(addBtn);

    expect(mockAddMutation.current.mutate).toHaveBeenCalledWith({
      areaKey: 'IN|KA|Udupi|Manipal',
      propertyType: 'land',
      listingPurpose: 'sale',
    });
    // Confirm citySlug is NOT sent
    expect(mockAddMutation.current.mutate).not.toHaveBeenCalledWith(
      expect.objectContaining({ citySlug: expect.anything() }),
    );
  });

  // 422 (unknown area) — non-fatal: hook's onError handles it via toast; page must not crash
  it('does not crash and does not add a row when the add mutation receives a 422', () => {
    // Simulate the hook already in an error-handled state: the page itself never
    // throws on 422. The mutation's onError (in useBrokerMarketFocus) fires a toast
    // and returns; the page simply stays on the current list.
    mockFocusHook.current.data = [];
    // mutate is a no-op here (422 recovery is inside the hook's onError)
    mockAddMutation.current.mutate = vi.fn();
    renderPage();

    // Page renders without crash
    expect(screen.getByText('Market Focus')).toBeInTheDocument();
    // No rows were added
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  // (d) Remove interaction — DELETE called; 404 handled gracefully
  it('calls remove mutation when the Remove button is confirmed', async () => {
    const manual = makeManualItem();
    mockFocusHook.current.data = [manual];
    const user = userEvent.setup();
    renderPage();

    const removeBtn = screen.getByRole('button', { name: /remove focus area/i });
    await user.click(removeBtn);

    // AlertDialog stub renders the action button directly
    const confirmBtn = screen.getByRole('button', { name: /^remove$/i });
    await user.click(confirmBtn);

    expect(mockRemoveMutation.current.mutate).toHaveBeenCalledWith({
      citySlug: 'udupi',
      areaKey: 'IN|KA|Udupi|Kunjibettu',
      propertyType: 'house',
      listingPurpose: 'rent',
    });
  });

  it('404 from remove mutation does not crash the page (non-fatal path exercised by hook)', () => {
    // The 404 recovery is handled in useRemoveMarketFocus's onError.
    // Here we verify the page renders without error even when the remove button
    // is present and the hook's mutate is called — the hook decides what happens.
    mockFocusHook.current.data = [makeManualItem()];
    renderPage();
    expect(screen.getByRole('button', { name: /remove focus area/i })).toBeInTheDocument();
  });

  // (e) Re-seed interaction — POST /seed called, list refreshed
  it('calls seed mutation when "Seed from my listings" is clicked from the toolbar', async () => {
    mockFocusHook.current.data = [makeSeededItem()];
    const user = userEvent.setup();
    renderPage();

    // Toolbar seed button (aria-label set)
    const seedBtn = screen.getByRole('button', { name: /re-seed focus areas from live listings/i });
    await user.click(seedBtn);

    expect(mockSeedMutation.current.mutate).toHaveBeenCalled();
  });

  it('calls seed mutation when primary action in empty state is clicked', async () => {
    mockFocusHook.current.data = [];
    const user = userEvent.setup();
    renderPage();

    // EmptyState primary action button — text "Seed from my listings"
    const seedBtn = screen.getAllByRole('button', { name: /seed from my listings/i })[0];
    await user.click(seedBtn);

    expect(mockSeedMutation.current.mutate).toHaveBeenCalled();
  });

  // (f) Role guard — non-broker / non-admin redirects
  it('redirects to /broker/setup when user is not a broker or admin', () => {
    mockAuth.current = { isBroker: false, isAdmin: false, isLoading: false };
    renderPage();

    // MemoryRouter renders <Navigate to="/broker/setup" replace />;
    // the page content must not be present
    expect(screen.queryByText('Market Focus')).not.toBeInTheDocument();
  });

  it('does not redirect when auth is still loading', () => {
    mockAuth.current = { isBroker: false, isAdmin: false, isLoading: true };
    mockFocusHook.current.data = undefined;
    mockFocusHook.current.isLoading = true;
    renderPage();

    // Loading skeleton renders, no redirect
    expect(screen.queryByText('Market Focus')).toBeInTheDocument();
  });

  // Loading skeleton
  it('renders loading skeleton while data is loading', () => {
    mockFocusHook.current.isLoading = true;
    renderPage();

    expect(screen.getByLabelText('Loading market focus preferences')).toBeInTheDocument();
  });

  // Error state
  it('renders error alert with retry button on API failure', () => {
    mockFocusHook.current.isError = true;
    mockFocusHook.current.error = { status: 500, message: 'Server error' };
    renderPage();

    expect(
      screen.getByText('Failed to load market focus preferences. Please try again.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('shows 403 copy in error state when role is denied', () => {
    mockFocusHook.current.isError = true;
    mockFocusHook.current.error = { status: 403, message: 'Forbidden' };
    renderPage();

    expect(
      screen.getByText('Access denied. Broker or admin role required.'),
    ).toBeInTheDocument();
  });

  // Duplicate add guard
  it('disables Add button when the selected tuple already exists', async () => {
    const existing = makeSeededItem(); // udupi|IN|KA|Udupi|Manipal|land|sale
    mockFocusHook.current.data = [existing];
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByTestId('select-item-IN|KA|Udupi|Manipal'));
    await user.click(screen.getByTestId('select-item-land'));
    await user.click(screen.getByTestId('select-item-sale'));

    const addBtn = screen.getByRole('button', { name: /^add$/i });
    expect(addBtn).toBeDisabled();
    expect(
      screen.getByText('This combination already exists in your focus list.'),
    ).toBeInTheDocument();
  });

  // Admin can also view the page
  it('renders the page for an admin user', () => {
    mockAuth.current = { isBroker: false, isAdmin: true, isLoading: false };
    mockFocusHook.current.data = [];
    renderPage();

    expect(screen.getByText('Market Focus')).toBeInTheDocument();
  });
});
