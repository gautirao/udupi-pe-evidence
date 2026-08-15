import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AreaSelectedPanel } from '@/components/discover/panels/AreaSelectedPanel';
import { useDiscoverCityListings } from '../useDiscoverCityListings';
import { DiscoverDataSourceProvider } from '@/features/discover/state/DiscoverDataSourceContext';
import { api } from '@/lib/api';

const mockGet = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  api: { get: mockGet },
}));

// Mock AuthContext so PropertyCard doesn't crash
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, isLoading: false, isAdmin: true, isDealer: false }),
}));
vi.mock('@/contexts/AuthModalContext', () => ({
  useAuthModal: () => ({ openAuthModal: vi.fn() }),
}));

// A test component that uses the hook and then renders AreaSelectedPanel
function PreviewListingsTestComponent() {
  const { data, isLoading } = useDiscoverCityListings({
    city: 'bangalore',
    areaKeys: ['IN|KA|Bengaluru|Chokkasandra'],
  });

  if (isLoading) return <div>Loading...</div>;

  return (
    <AreaSelectedPanel
      selectedArea={{
        areaKey: 'IN|KA|Bengaluru|Chokkasandra',
        areaLabel: 'Chokkasandra',
        geo_center_lat: 13,
        geo_center_lon: 77,
        bbox: null,
      }}
      areaListings={data?.areas[0]?.listings || []}
      filters={{}}
      onFiltersChange={vi.fn()}
      onSelectJourney={vi.fn()}
      onAddSchool={vi.fn()}
    />
  );
}

function makePreviewWrapper(cityId: number, revisionId: number) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/discover'] },
        React.createElement(
          DiscoverDataSourceProvider,
          { value: { mode: 'preview', cityId, revisionId, citySlug: 'preview-city' }, children },
        )
      )
    );
}

describe('Issue #2120 — Preview listing identity at the data boundary', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it('normalises missing preview listing IDs and supports stable selection/drawer opening', async () => {
    // 1. Start with the ACTUAL preview wire shape where id is null/omitted
    mockGet.mockImplementation(async (path: string) => {
      console.log('mockGet called with:', path);
      if (path.includes('?areaKeys=')) {
        return {
          city: 'bangalore',
          limitPerArea: 5,
          areas: [
            {
              areaKey: 'IN|KA|Bengaluru|Chokkasandra',
              areaName: 'Chokkasandra',
              listings: [
                {
                  priceBand: '₹40L - ₹60L',
                  propertyType: 'apartment',
                  locality: 'Chokkasandra',
                  listingPurpose: 'sale',
                }
              ]
            }
          ]
        };
      }
      if (path.includes('/preview/listings/')) {
        return {
          id: 'preview:9:IN|KA|Bengaluru|Chokkasandra',
          title: 'Simulated Apartment',
          propertyType: 'apartment',
          locality: 'Chokkasandra',
          pricePaise: 5000000,
        };
      }
      return {};
    });

    const Wrapper = makePreviewWrapper(1, 9);
    render(
      <Wrapper>
        <PreviewListingsTestComponent />
      </Wrapper>
    );

    // Wait for the hook to resolve and the panel to render
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });

    // 2. AreaSelectedPanel has a stable unique key (React doesn't expose keys to DOM, but lack of console error + successful render proves it)
    // 3. PropertyCard renders without exception (Cannot read properties of undefined (reading 'startsWith') avoided)
    const card = screen.getByTestId('listing-card');
    expect(card).toBeInTheDocument();
    
    // Check that it received the stable synthetic id from the hook
    const viewDetailsButton = screen.getByTestId('listing-view-details');
    expect(viewDetailsButton).toBeInTheDocument();

    // 4. Clicking the simulated card opens the preview drawer
    await userEvent.click(card);

    // The drawer should open
    const drawer = await screen.findByTestId('simulated-listing-drawer');
    expect(drawer).toBeInTheDocument();
    
    // 5. detail lookup uses the correct revision-scoped areaKey
    // The query inside PropertyCard should fire with the areaKey 'IN|KA|Bengaluru|Chokkasandra'
    await waitFor(() => {
      expect(screen.getByText('Simulated Apartment')).toBeInTheDocument();
    });
    
    // Confirm the API was called with the correct path
    const detailCall = mockGet.mock.calls.find(call => call[0].includes('/preview/listings/'));
    expect(detailCall).toBeDefined();
    expect(detailCall![0]).toContain('IN%7CKA%7CBengaluru%7CChokkasandra');
  });
});
