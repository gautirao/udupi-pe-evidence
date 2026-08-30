/**
 * Listings.tsx (admin inventory workspace) — issue #2370 unit tests.
 *
 * Coverage contract:
 *  - Loading state renders (skeleton rows)
 *  - Empty state renders when no listings are loaded
 *  - Tab counts reflect the server-side tab-counts query
 *  - Search filters the table (via the server-side page query params)
 *  - "Open" launches the editor drawer for the right listing
 *  - A real server-reported total (beyond a single page) drives pagination,
 *    not a client-truncated snapshot (#2370 core fix)
 *  - A `?edit=<id>` deep link for a listing outside the current page resolves
 *    via the direct-by-id lookup instead of being misreported as not found
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import Listings from '../Listings';
import type { AdminListingRow } from '@/hooks/useAdminData';

const mockUseAdminListingsPage = vi.hoisted(() => vi.fn());
const mockUseAdminListingsTabCounts = vi.hoisted(() => vi.fn());
const mockUseAdminListingFilterOptions = vi.hoisted(() => vi.fn());
const mockUseAdminListingById = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useAdminData', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useAdminData')>('@/hooks/useAdminData');
  return {
    ...actual,
    useAdminListingsPage: (...args: unknown[]) => mockUseAdminListingsPage(...args),
    useAdminListingsTabCounts: () => mockUseAdminListingsTabCounts(),
    useAdminListingFilterOptions: () => mockUseAdminListingFilterOptions(),
    useAdminListingById: (...args: unknown[]) => mockUseAdminListingById(...args),
  };
});

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isAdmin: true }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/admin/listings/ListingEditorDrawer', () => ({
  ListingEditorDrawer: ({
    listing,
    isResolvingListing,
    open,
  }: {
    listing: AdminListingRow | null | undefined;
    isResolvingListing?: boolean;
    open: boolean;
  }) =>
    open ? (
      <div data-testid="editor-drawer">
        {isResolvingListing ? 'resolving' : listing ? `editing:${listing.id}` : 'editing:none'}
      </div>
    ) : null,
}));

function makeListing(overrides: Partial<AdminListingRow> = {}): AdminListingRow {
  return {
    id: 'listing-1',
    title: 'Sea view villa',
    property_type: 'villa',
    locality: 'Malpe',
    latitude: 13.34,
    longitude: 74.74,
    price: 5000000,
    price_unit: 'INR',
    land_area: null,
    land_area_unit: null,
    built_area: null,
    built_area_unit: null,
    carpet_area: null,
    carpet_area_unit: null,
    super_built_area: null,
    super_built_area_unit: null,
    bedrooms: 3,
    bathrooms: 2,
    description: 'A lovely villa',
    seller_type: 'owner',
    status: 'LIVE',
    is_valid: true,
    is_duplicate: false,
    confidence_score: 90,
    quality_score: 85,
    quality_breakdown: null,
    quality_computed_at: null,
    listing_number: 101,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    raw_post_id: null,
    raw_posts: null,
    listing_purpose: 'sale',
    language_detected: null,
    price_per_cent_paise: null,
    updated_by: null,
    ...overrides,
  } as unknown as AdminListingRow;
}

function renderPage(initialEntries = ['/admin/listings']) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <Listings />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const DEFAULT_TAB_COUNTS = { all: 0, published: 0, pending: 0, 'needs-attention': 0, archived: 0 };
const DEFAULT_FILTER_OPTIONS = { propertyTypes: [], localities: [], sellerTypes: [] };

beforeEach(() => {
  mockUseAdminListingsPage.mockReset();
  mockUseAdminListingsTabCounts.mockReset();
  mockUseAdminListingFilterOptions.mockReset();
  mockUseAdminListingById.mockReset();

  mockUseAdminListingsTabCounts.mockReturnValue({ data: DEFAULT_TAB_COUNTS });
  mockUseAdminListingFilterOptions.mockReturnValue({ data: DEFAULT_FILTER_OPTIONS });
  mockUseAdminListingById.mockReturnValue({ data: undefined, isLoading: false });
});

describe('Listings — loading and empty states', () => {
  it('renders a loading skeleton while fetching', () => {
    mockUseAdminListingsPage.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    });
    const { container } = renderPage();
    expect(container.querySelectorAll('[class*="skeleton"], .animate-pulse').length).toBeGreaterThan(0);
  });

  it('renders an empty state when there are no listings', () => {
    mockUseAdminListingsPage.mockReturnValue({
      data: { items: [], totalCount: 0 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByText(/no listings yet/i)).toBeInTheDocument();
  });

  it('renders an error state with retry', () => {
    const refetch = vi.fn();
    mockUseAdminListingsPage.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });
    renderPage();
    expect(screen.getByText(/couldn't load listings/i)).toBeInTheDocument();
  });
});

describe('Listings — tab counts and search', () => {
  beforeEach(() => {
    mockUseAdminListingsPage.mockReturnValue({
      data: {
        items: [
          makeListing({ id: 'a', status: 'LIVE', title: 'Sea view villa' }),
          makeListing({ id: 'b', status: 'PENDING_REVIEW', is_valid: false, title: 'Pending plot' }),
          makeListing({ id: 'c', status: 'ARCHIVED', is_valid: false, title: 'Old warehouse' }),
        ],
        totalCount: 3,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseAdminListingsTabCounts.mockReturnValue({
      data: { all: 3, published: 1, pending: 1, 'needs-attention': 0, archived: 1 },
    });
  });

  it('shows tab counts from the server-side tab-counts query', () => {
    renderPage();
    expect(screen.getByRole('tab', { name: /all\s*3/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /published\s*1/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /pending approval\s*1/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /archived\s*1/i })).toBeInTheDocument();
  });

  it('passes the search text through to the server-side query params', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByText('Sea view villa')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Search listings'), 'sea view');

    await waitFor(() => {
      const lastCall = mockUseAdminListingsPage.mock.calls.at(-1);
      expect(lastCall?.[0]).toMatchObject({ q: 'sea view', page: 1 });
    });
  });

  it('opens the editor drawer for the clicked row', async () => {
    const user = userEvent.setup();
    renderPage();

    const openButtons = screen.getAllByRole('button', { name: 'Open' });
    await user.click(openButtons[0]);

    expect(await screen.findByTestId('editor-drawer')).toHaveTextContent('editing:a');
  });
});

describe('Listings — real server-side total drives pagination (#2370)', () => {
  it('reflects a total count far beyond a single page, not a truncated snapshot', () => {
    // Simulate an inventory of 250 real rows — more than the old 200-row
    // client-side snapshot — with only the current page's 25 rows in memory.
    const pageOfTwentyFive = Array.from({ length: 25 }, (_, i) =>
      makeListing({ id: `row-${i}`, title: `Listing ${i}` }),
    );
    mockUseAdminListingsPage.mockReturnValue({
      data: { items: pageOfTwentyFive, totalCount: 250 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseAdminListingsTabCounts.mockReturnValue({ data: { ...DEFAULT_TAB_COUNTS, all: 250 } });

    renderPage();

    expect(screen.getByText(/showing 1–25 of 250 total/i)).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 10')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /all\s*250/i })).toBeInTheDocument();
  });

  it('requests the next page from the server when "Next" is clicked, reaching rows outside the old 200-row window', async () => {
    const user = userEvent.setup();
    const pageOfTwentyFive = Array.from({ length: 25 }, (_, i) =>
      makeListing({ id: `row-${i}`, title: `Listing ${i}` }),
    );
    mockUseAdminListingsPage.mockReturnValue({
      data: { items: pageOfTwentyFive, totalCount: 250 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseAdminListingsTabCounts.mockReturnValue({ data: { ...DEFAULT_TAB_COUNTS, all: 250 } });

    renderPage();
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      const lastCall = mockUseAdminListingsPage.mock.calls.at(-1);
      // Page 9 (rows 201-225) is entirely outside the old 200-row FETCH_LIMIT
      // snapshot — reachable now because pagination is a real server query.
      expect(lastCall?.[0]).toMatchObject({ page: 2 });
    });
  });
});

describe('Listings — ?edit=<id> deep link outside the current page (#2370)', () => {
  it('resolves a listing outside the current page via the direct-by-id lookup instead of "not found"', async () => {
    mockUseAdminListingsPage.mockReturnValue({
      data: { items: [makeListing({ id: 'on-page' })], totalCount: 201 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    const outOfWindowListing = makeListing({ id: 'row-200', title: 'Old scraped listing' });
    mockUseAdminListingById.mockReturnValue({ data: outOfWindowListing, isLoading: false });

    renderPage(['/admin/listings?edit=row-200']);

    expect(mockUseAdminListingById).toHaveBeenCalledWith('row-200');
    expect(await screen.findByTestId('editor-drawer')).toHaveTextContent('editing:row-200');
  });

  it('shows the resolving state (not "not found") while the direct-by-id lookup is still in flight', () => {
    mockUseAdminListingsPage.mockReturnValue({
      data: { items: [makeListing({ id: 'on-page' })], totalCount: 201 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseAdminListingById.mockReturnValue({ data: undefined, isLoading: true });

    renderPage(['/admin/listings?edit=row-200']);

    expect(screen.getByTestId('editor-drawer')).toHaveTextContent('resolving');
  });

  it('does not issue a direct-by-id lookup for a listing already present on the current page', () => {
    mockUseAdminListingsPage.mockReturnValue({
      data: { items: [makeListing({ id: 'a' })], totalCount: 1 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage(['/admin/listings?edit=a']);

    expect(mockUseAdminListingById).toHaveBeenCalledWith(null);
  });
});
