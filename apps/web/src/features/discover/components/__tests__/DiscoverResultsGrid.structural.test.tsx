import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { onAuthStateChange: vi.fn(), getSession: vi.fn() },
    from: vi.fn(() => ({ select: vi.fn() }))
  }
}));

vi.mock('@/components/discover/PropertyCard', () => ({
  PropertyCard: ({ listing }: any) => <div data-testid="mock-property-card">{listing?.title || 'Mock Card'}</div>
}));

import { ListingsBody } from '@/features/discover/area-selected/sections/ListingsBody';
import { SchoolRadiusListings } from '@/components/discover/panels/schools/radius/SchoolRadiusListings';
import { AgriGroupLocalityPanel } from '@/components/discover/panels/AgriGroupLocalityPanel';

describe('DiscoverResultsGrid shared structural contract (Issue #2769)', () => {
  const renderWithRouter = (ui: React.ReactElement) => {
    return render(<MemoryRouter>{ui}</MemoryRouter>);
  };

  describe('Area (ListingsBody)', () => {
    it('applies the shared grid class to the populated listings container', () => {
      const { container } = renderWithRouter(
        <ListingsBody
          isFetching={false}
          isInitialLoading={false}
          isLoadingListings={false}
          areaListings={[{ id: '1', title: 'Test Home' } as any]}
          hasPropertyFilters={false}
          searchQuery=""
          listingCount={1}
          areaLabel="Test"
          resolvedCityLabel="City"
          commercialFromFilters={false}
          intentNoun="homes"
          multiAreaKeys={null}
          fallbackAreaKey="test"
          resolvedAreasCity="City"
          filters={{}}
          activeScope={{ type: 'AREA', id: '1' } as any}
          resultScopeKind="AREA"
          count={1}
          isViewportScope={false}
          onNavigateToListing={() => {}}
          selectedListingId={null}
          hoveredListingId={null}
          registerCardRef={() => () => {}}
        />
      );
      
      const grid = container.querySelector('.discover-results-grid');
      expect(grid).toBeInTheDocument();
      // Ensure it's the container for the listings
      expect(screen.getByText('Test Home')).toBeInTheDocument();
    });

    it('applies the shared grid class to the loading skeleton container', () => {
      const { container } = renderWithRouter(
        <ListingsBody
          isFetching={true}
          isInitialLoading={true}
          isLoadingListings={true}
          hasPropertyFilters={false}
          searchQuery=""
          listingCount={0}
          areaLabel="Test"
          resolvedCityLabel="City"
          commercialFromFilters={false}
          intentNoun="homes"
          multiAreaKeys={null}
          fallbackAreaKey="test"
          resolvedAreasCity="City"
          filters={{}}
          activeScope={{ type: 'AREA', id: '1' } as any}
          resultScopeKind="AREA"
          count={0}
          isViewportScope={false}
          onNavigateToListing={() => {}}
          selectedListingId={null}
          hoveredListingId={null}
          registerCardRef={() => () => {}}
        />
      );
      
      const grid = container.querySelector('.discover-results-grid');
      expect(grid).toBeInTheDocument();
      expect(screen.getAllByTestId('listing-skeleton').length).toBeGreaterThan(0);
    });
  });

  describe('School (SchoolRadiusListings)', () => {
    it('applies the shared grid class and panel container to the populated listings', () => {
      const mockCardRefs = { current: new Map() };
      const { container } = renderWithRouter(
        <SchoolRadiusListings
          variant="selected"
          school={null}
          areaLabel="Test"
          listings={[{ id: '1' } as any]}
          sortedListingsWithDistance={[{ listing: { id: '1', title: 'School Home' } as any, distanceKm: 1 }]}
          isLoadingListings={false}
          isFetching={false}
          hasMissingCoords={false}
          hasPropertyFilters={false}
          effectiveRadius={2}
          onRadiusChange={() => {}}
          onClearSchool={() => {}}
          onClearPropertyFilters={() => {}}
          intent="buy"
          isAuthenticated={false}
          selectedListingId={null}
          cardRefs={mockCardRefs}
        />
      );
      
      const panelContainer = container.querySelector('.discover-panel-container');
      expect(panelContainer).toBeInTheDocument();

      const grid = container.querySelector('.discover-results-grid');
      expect(grid).toBeInTheDocument();
      expect(screen.getByText('School Home')).toBeInTheDocument();
    });

    it('applies the shared grid class to the loading skeleton container', () => {
      const mockCardRefs = { current: new Map() };
      const { container } = renderWithRouter(
        <SchoolRadiusListings
          variant="selected"
          school={null}
          areaLabel="Test"
          listings={[]}
          sortedListingsWithDistance={[]}
          isLoadingListings={true}
          isFetching={true}
          hasMissingCoords={false}
          hasPropertyFilters={false}
          effectiveRadius={2}
          onRadiusChange={() => {}}
          onClearSchool={() => {}}
          onClearPropertyFilters={() => {}}
          intent="buy"
          isAuthenticated={false}
          selectedListingId={null}
          cardRefs={mockCardRefs}
        />
      );
      
      const grid = container.querySelector('.discover-results-grid');
      expect(grid).toBeInTheDocument();
      expect(screen.getAllByTestId('listing-skeleton').length).toBeGreaterThan(0);
    });
  });

  describe('Agricultural (AgriGroupLocalityPanel)', () => {
    it('applies the shared grid class and panel container to the populated listings', () => {
      const { container } = renderWithRouter(
        <AgriGroupLocalityPanel
          localityName="Test Locality"
          listings={[{ id: '1', title: 'Agri Parcel' } as any]}
          isLoading={false}
          isError={false}
          onRetry={() => {}}
          onSelectListing={() => {}}
          onClose={() => {}}
        />
      );
      
      const panelContainer = container.querySelector('.discover-panel-container');
      expect(panelContainer).toBeInTheDocument();

      const grid = container.querySelector('.discover-results-grid');
      expect(grid).toBeInTheDocument();
      expect(screen.getByText('Agri Parcel')).toBeInTheDocument();
    });

    it('applies the shared grid class to the loading skeleton container', () => {
      const { container } = renderWithRouter(
        <AgriGroupLocalityPanel
          localityName="Test Locality"
          listings={[]}
          isLoading={true}
          isError={false}
          onRetry={() => {}}
          onSelectListing={() => {}}
          onClose={() => {}}
        />
      );
      
      const grid = container.querySelector('.discover-results-grid');
      expect(grid).toBeInTheDocument();
      expect(screen.getAllByTestId('agri-locality-listing-skeleton').length).toBeGreaterThan(0);
    });
  });
});
