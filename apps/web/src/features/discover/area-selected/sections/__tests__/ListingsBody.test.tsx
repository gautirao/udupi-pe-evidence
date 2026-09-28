import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '@/test/renderWithProviders';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import { ListingsBody } from '../ListingsBody';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';

const render = (ui: React.ReactElement) => renderWithProviders(<DiscoverProvider>{ui}</DiscoverProvider>);

const listing: DiscoverCityListingItem = {
  id: '1',
  propertyType: 'apartment',
  title: 'Test Listing',
  locality: 'Kalsanka',
  pricePaise: 5000000,
  bedrooms: 2,
  bathrooms: 1,
};

const baseProps = {
  isFetching: false,
  isInitialLoading: false,
  isLoadingListings: false,
  areaListings: [listing],
  isListingsError: false,
  hasPropertyFilters: false,
  searchQuery: '',
  listingCount: null,
  areaLabel: 'Kalsanka',
  resolvedCityLabel: 'Udupi',
  commercialFromFilters: false,
  intentNoun: 'sale' as const,
  multiAreaKeys: null,
  fallbackAreaKey: 'kalsanka|city|udupi',
  resolvedAreasCity: 'udupi',
  filters: {},
  activeScope: null,
  resultScopeKind: 'AREA' as const,
  count: 1,
  isViewportScope: false,
  onNavigateToListing: vi.fn(),
  selectedListingId: null,
  hoveredListingId: null,
  registerCardRef: () => () => {},
};

describe('#2658 C3 — ListingsBody', () => {
  it('renders skeleton cards while loading', () => {
    render(<ListingsBody {...baseProps} isLoadingListings />);
    expect(screen.getAllByTestId('listing-skeleton')).toHaveLength(3);
  });

  it('renders the request-failure error state when there are no listings to fall back on', () => {
    const onRetryListings = vi.fn();
    render(
      <ListingsBody {...baseProps} areaListings={[]} isListingsError onRetryListings={onRetryListings} />,
    );
    expect(screen.getByTestId('area-listings-error')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('area-listings-error-retry'));
    expect(onRetryListings).toHaveBeenCalledTimes(1);
  });

  it('shows the stale-results retry banner (not the full-page error) when a refresh fails but prior listings remain', () => {
    render(<ListingsBody {...baseProps} isListingsError />);
    expect(screen.getByTestId('area-listings-retry-banner')).toBeInTheDocument();
    expect(screen.queryByTestId('area-listings-error')).not.toBeInTheDocument();
    // The stale cards themselves must still render.
    expect(screen.getByText('Test Listing')).toBeInTheDocument();
  });

  it('renders the populated grid with the default result-summary text', () => {
    render(<ListingsBody {...baseProps} />);
    expect(screen.getByTestId('area-result-summary-text')).toHaveTextContent(
      '1 verified property for sale in Kalsanka',
    );
    expect(screen.getByText('Test Listing')).toBeInTheDocument();
  });

  it('prefers the caller-precomputed areaResultSummaryText over the derived default', () => {
    render(<ListingsBody {...baseProps} areaResultSummaryText="42 verified properties" />);
    expect(screen.getByTestId('area-result-summary-text')).toHaveTextContent('42 verified properties');
  });

  it('renders the zero-result recovery component (not the grid or error state) when there are no listings and no error', () => {
    render(<ListingsBody {...baseProps} areaListings={[]} />);
    expect(screen.getByTestId('area-zero-result-recovery')).toBeInTheDocument();
    expect(screen.queryByTestId('area-listings-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('area-result-summary')).not.toBeInTheDocument();
  });

  it('calls onNavigateToListing with the listing id when a card is clicked', () => {
    const onNavigateToListing = vi.fn();
    render(<ListingsBody {...baseProps} onNavigateToListing={onNavigateToListing} />);
    fireEvent.click(screen.getByText('Test Listing'));
    expect(onNavigateToListing).toHaveBeenCalledWith('1');
  });
});
