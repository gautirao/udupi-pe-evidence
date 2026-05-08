/**
 * State-machine routing tests for DiscoverRightPanel.
 *
 * Each test passes panelContent directly as a prop, isolating the switch
 * logic from URL state derivation (which is tested in discoverPanelState.test.ts).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { DiscoverRightPanel } from '../DiscoverRightPanel';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: vi.fn((city) => {
    // Return mock area matching the test setup
    if (city === 'udupi') {
      return {
        data: [
          {
            areaKey: 'IN|KA|Udupi|Manipal',
            name: 'Manipal',
            geo_center_lat: 13.3,
            geo_center_lon: 74.7,
            bbox: null,
            listingCount: 5,
          },
        ],
        isLoading: false,
        error: null,
      };
    }
    return { data: [], isLoading: false, error: null };
  }),
}));

vi.mock('@/hooks/useDiscoverUrlState', () => ({
  useDiscoverUrlState: vi.fn(() => ({
    city: 'udupi',
    areaKey: 'IN|KA|Udupi|Manipal',
    boardFilters: [],
    categoryFilters: [],
  })),
}));

vi.mock('@/hooks/useSchoolsByArea', () => ({
  useSchoolsByArea: vi.fn(() => ({
    data: { pages: [] },
    isLoading: false,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  })),
}));

const makeArea = (areaKey: string, areaLabel: string): AreaPoint => ({
  areaKey,
  areaLabel,
  geo_center_lat: 13.3,
  geo_center_lon: 74.7,
  bbox: null,
  listingCount: 5,
});

const makeListing = (id: string): DiscoverCityListingItem => ({
  id,
  pricePaise: 500000 * 100,
  propertyType: 'apartment',
  locality: 'Manipal',
  primaryImageUrl: null,
});

const baseProps = {
  areas: [],
  onStartOver: vi.fn(),
  onSelectJourney: vi.fn(),
};

const renderPanel = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

describe('DiscoverRightPanel — state machine routing', () => {
  it('panelContent="guided-entry" renders GuidedEntryPanel with journey cards', () => {
    renderPanel(
      <DiscoverRightPanel {...baseProps} panelContent="guided-entry" />,
    );
    expect(screen.getByText('Find properties your way')).toBeInTheDocument();
    expect(screen.getByTestId('journey-card-area-first')).toBeInTheDocument();
    expect(screen.getByTestId('journey-card-school-first')).toBeInTheDocument();
  });

  it('panelContent="area-selection" renders AreaSelectionPanel placeholder', () => {
    renderPanel(
      <DiscoverRightPanel {...baseProps} panelContent="area-selection" />,
    );
    expect(screen.getByText('Explore by neighbourhood')).toBeInTheDocument();
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });

  it('panelContent="area-groups-landing" renders AreaGroupsLandingPanel with group cards', () => {
    const groups = [
      {
        id: 'south-zone',
        name: 'South Zone',
        subtitle: 'Koramangala, HSR',
        region_label: 'South',
        school_count: 5,
        area_keys: ['IN|KA|Bengaluru|Koramangala'],
      },
    ];
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-groups-landing"
        areaGroups={groups}
        isLoadingAreaGroups={false}
        onSelectGroup={vi.fn()}
        discoverAreas={[]}
        onSelectAreaKey={vi.fn()}
      />,
    );
    expect(screen.getByText('Select area')).toBeInTheDocument();
    expect(screen.getByTestId('area-group-card-south-zone')).toBeInTheDocument();
    expect(screen.getByText('South Zone')).toBeInTheDocument();
  });

  it('panelContent="area-groups-landing" shows loading skeletons when isLoadingAreaGroups=true', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-groups-landing"
        areaGroups={[]}
        isLoadingAreaGroups={true}
        onSelectGroup={vi.fn()}
        discoverAreas={[]}
        onSelectAreaKey={vi.fn()}
      />,
    );
    expect(screen.getByTestId('area-groups-loading')).toBeInTheDocument();
  });

  it('panelContent="area-selected" with listings renders AreaSelectedPanel', () => {
    const area = makeArea('k1', 'Manipal');
    const listings = [makeListing('l1')];
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        selectedArea={area}
        areaListings={listings}
        isLoadingListings={false}
        isAuthenticated={true}
        journey="area-first"
      />,
    );
    expect(screen.getAllByText('Manipal').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByTestId('listing-card')).toHaveLength(1);
  });

  it('panelContent="area-selected" with no selectedArea falls back to guided-entry', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        selectedArea={null}
      />,
    );
    // Defensive fallback: no area resolved yet — show entry screen
    expect(screen.getByText('Find properties your way')).toBeInTheDocument();
  });

  it('panelContent="school-browse" renders Milestone 2 placeholder', () => {
    renderPanel(
      <DiscoverRightPanel {...baseProps} panelContent="school-browse" />,
    );
    expect(screen.getByText(/coming in milestone 2/i)).toBeInTheDocument();
  });

  it('panelContent="schools-in-area" with selectedArea renders SchoolsInAreaPanel', () => {
    const area = makeArea('k1', 'Manipal');
    renderPanel(
      <DiscoverRightPanel {...baseProps} panelContent="schools-in-area" selectedArea={area} journey="school-first" />,
    );
    // Verify the real SchoolsInAreaPanel renders (PanelHeader + board filter chips)
    expect(screen.getByText(/schools in manipal/i)).toBeInTheDocument();
    // Verify board filter chips are present
    expect(screen.getByTestId('board-chip-cbse')).toBeInTheDocument();
  });

  it('panelContent="schools-in-area" with no selectedArea falls back to guided-entry', () => {
    renderPanel(
      <DiscoverRightPanel {...baseProps} panelContent="schools-in-area" selectedArea={null} />,
    );
    expect(screen.getByText('Find properties your way')).toBeInTheDocument();
  });

  it('panelContent="school-selected" renders SchoolSelectedPanel with radius selector', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="school-selected"
        selectedSchool={null}
        schoolListings={[]}
        schoolListingsLoading={false}
        radiusKm={3}
        onRadiusChange={vi.fn()}
      />,
    );
    // SchoolSelectedPanel renders — verify radius selector is present
    expect(screen.getByTestId('radius-btn-3')).toBeInTheDocument();
    expect(screen.getByTestId('radius-btn-1')).toBeInTheDocument();
    expect(screen.getByTestId('radius-btn-5')).toBeInTheDocument();
  });

  it('panelContent="area-school-combined" renders Milestone 2 placeholder', () => {
    renderPanel(
      <DiscoverRightPanel {...baseProps} panelContent="area-school-combined" />,
    );
    expect(screen.getByText(/coming in milestone 2/i)).toBeInTheDocument();
  });

  it('always renders data-testid="discover-right-panel" wrapper', () => {
    renderPanel(
      <DiscoverRightPanel {...baseProps} panelContent="guided-entry" />,
    );
    expect(screen.getByTestId('discover-right-panel')).toBeInTheDocument();
  });
});

describe('DiscoverRightPanel — area-selected content parity', () => {
  const area = makeArea('k1', 'Manipal');

  it('shows loading skeletons while isLoadingListings=true', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        selectedArea={area}
        areaListings={[]}
        isLoadingListings={true}
      />,
    );
    expect(screen.getAllByTestId('listing-skeleton').length).toBeGreaterThanOrEqual(1);
  });

  it('shows empty state when areaListings is empty and not loading', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        selectedArea={area}
        areaListings={[]}
        isLoadingListings={false}
      />,
    );
    expect(screen.getByText('No listings in this area yet')).toBeInTheDocument();
  });

  it('renders PropertyCard list with correct price', () => {
    const listings = [makeListing('l1')];
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        selectedArea={area}
        areaListings={listings}
        isLoadingListings={false}
        isAuthenticated={true}
      />,
    );
    expect(screen.getAllByTestId('listing-card')).toHaveLength(1);
    expect(screen.getByText('₹5 L')).toBeInTheDocument();
  });

  it('shows search input when onSearchChange is provided', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        selectedArea={area}
        areaListings={[]}
        isLoadingListings={false}
        searchQuery=""
        onSearchChange={vi.fn()}
      />,
    );
    expect(screen.getByPlaceholderText('Search listings by keyword')).toBeInTheDocument();
  });

  it('shows Trends button when trendsHref is provided', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        selectedArea={area}
        areaListings={[]}
        isLoadingListings={false}
        trendsHref="/trends?city=udupi&areaKey=k1"
      />,
    );
    expect(screen.getByText('Trends')).toBeInTheDocument();
  });
});
