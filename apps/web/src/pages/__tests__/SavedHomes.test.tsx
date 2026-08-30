import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import SavedHomes from '../SavedHomes';
import type { SavedListingCard } from '@/hooks/useSavedListings';

// ─── Polyfills ─────────────────────────────────────────────────
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

// ─── Hoisted mocks ────────────────────────────────────────────
const mockUseSavedListings = vi.hoisted(() => vi.fn());
const mockUnsaveMutate = vi.hoisted(() => vi.fn());
const mockUnsavePending = vi.hoisted(() => ({ current: false }));
const mockRefetch = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useSavedListings', () => ({
  useSavedListings: () => mockUseSavedListings(),
  useUnsaveListing: () => ({ mutate: mockUnsaveMutate, isPending: mockUnsavePending.current }),
}));

// AppLayout pulls in auth/notification context — mock it down to a plain shell
// so this test focuses on SavedHomes' own list/empty/error/loading states.
vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <SavedHomes />
    </MemoryRouter>,
  );
}

const CARD_A: SavedListingCard = {
  id: 's1',
  listingId: 'l1',
  title: 'Green View Apartment',
  locality: 'Manipal',
  propertyType: 'apartment',
  listingPurpose: 'sale',
  pricePaise: 5000000 * 100,
  available: true,
};

const CARD_B: SavedListingCard = {
  id: 's2',
  listingId: 'l2',
  title: 'Old Villa',
  propertyType: 'villa',
  listingPurpose: 'sale',
  available: false,
};

describe('SavedHomes', () => {
  beforeEach(() => {
    mockUseSavedListings.mockReset();
    mockUnsaveMutate.mockReset();
    mockUnsavePending.current = false;
    mockRefetch.mockReset();
  });

  it('shows a loading skeleton while fetching', () => {
    mockUseSavedListings.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: mockRefetch });
    renderPage();
    expect(screen.getByText('Saved homes')).toBeInTheDocument();
    expect(screen.queryByTestId('saved-listing-card')).not.toBeInTheDocument();
  });

  it('shows an error state with a retry action', async () => {
    mockUseSavedListings.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: mockRefetch });
    renderPage();

    expect(screen.getByText(/couldn.t load your saved homes/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('shows the exact empty-state copy with a link back to /discover', () => {
    mockUseSavedListings.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: mockRefetch });
    renderPage();

    expect(screen.getByText('No saved homes yet.')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /browse discover to find your next home/i });
    expect(link).toHaveAttribute('href', '/discover');
  });

  it('renders each saved listing as a card', () => {
    mockUseSavedListings.mockReturnValue({ data: [CARD_A, CARD_B], isLoading: false, isError: false, refetch: mockRefetch });
    renderPage();

    expect(screen.getAllByTestId('saved-listing-card')).toHaveLength(2);
    expect(screen.getByText('Green View Apartment')).toBeInTheDocument();
    expect(screen.getByText('Old Villa')).toBeInTheDocument();
  });

  it('badges a listing with available=false as "No longer available"', () => {
    mockUseSavedListings.mockReturnValue({ data: [CARD_A, CARD_B], isLoading: false, isError: false, refetch: mockRefetch });
    renderPage();

    const card = screen.getByText('Old Villa').closest('li');
    expect(card).not.toBeNull();
    expect(card!.querySelector('[data-testid="unavailable-badge"]')).toHaveTextContent('No longer available');

    const availableCard = screen.getByText('Green View Apartment').closest('li');
    expect(availableCard!.querySelector('[data-testid="unavailable-badge"]')).toBeNull();
  });

  it('remove action calls useUnsaveListing with the listingId', async () => {
    mockUseSavedListings.mockReturnValue({ data: [CARD_A], isLoading: false, isError: false, refetch: mockRefetch });
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /remove saved property/i }));
    expect(mockUnsaveMutate).toHaveBeenCalledWith('l1');
  });

  it('an optimistic removal (hook now returns the shorter list) removes the card from the DOM', async () => {
    mockUseSavedListings.mockReturnValue({ data: [CARD_A, CARD_B], isLoading: false, isError: false, refetch: mockRefetch });
    const { rerender } = renderPage();

    expect(screen.getAllByTestId('saved-listing-card')).toHaveLength(2);

    // Simulate the optimistic cache update removing CARD_A from the query result.
    mockUseSavedListings.mockReturnValue({ data: [CARD_B], isLoading: false, isError: false, refetch: mockRefetch });
    rerender(
      <MemoryRouter>
        <SavedHomes />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('saved-listing-card')).toHaveLength(1);
    });
    expect(screen.queryByText('Green View Apartment')).not.toBeInTheDocument();
  });
});
