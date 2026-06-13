/**
 * State-machine routing tests for DiscoverRightPanel.
 *
 * Each test passes panelContent directly as a prop, isolating the switch
 * logic from URL state derivation (which is tested in discoverPanelState.test.ts).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { DiscoverRightPanel } from '../DiscoverRightPanel';
import { derivePanelContent } from '@/utils/discoverPanelState';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';

const { mockSetSchoolJourney } = vi.hoisted(() => ({
  mockSetSchoolJourney: vi.fn(),
}));

// Prevent "supabaseUrl is required" crash from transitive usePropertyListings import
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
    }),
    removeChannel: vi.fn(),
  },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: vi.fn((city) => {
    // Return mock matching DiscoverAreasResponse shape: { city, areas[] }
    if (city === 'udupi') {
      return {
        data: {
          city: 'udupi',
          areas: [
            {
              areaKey: 'IN|KA|Udupi|Manipal',
              name: 'Manipal',
              geo_center_lat: 13.3,
              geo_center_lon: 74.7,
              bbox: null,
              listingCount: 5,
              schoolCount: 3,
            },
          ],
        },
        isLoading: false,
        error: null,
      };
    }
    return { data: { city, areas: [] }, isLoading: false, error: null };
  }),
}));

vi.mock('@/hooks/useDiscoverUrlState', () => ({
  useDiscoverUrlState: vi.fn(() => [
    {
      city: 'udupi',
      areaKey: 'IN|KA|Udupi|Manipal',
      boardFilters: [],
      categoryFilters: [],
      schoolId: null,
      radiusKm: null,
      q: '',
      journey: 'school-first' as const,
      groupId: null,
      viewport: null,
      filters: {},
    },
    {
      selectArea: vi.fn(),
      deselectArea: vi.fn(),
      setSchoolParams: vi.fn(),
      setFiltersLive: vi.fn(),
      setFiltersCommitted: vi.fn(),
      setBoardFilters: vi.fn(),
      setCategoryFilters: vi.fn(),
      clearAreaContext: vi.fn(),
      clearSchoolContext: vi.fn(),
      startOver: vi.fn(),
      setJourney: vi.fn(),
      selectGroup: vi.fn(),
      setSchoolJourney: mockSetSchoolJourney,
      setSearchQuery: vi.fn(),
      reportViewport: vi.fn(),
      setCity: vi.fn(),
      changeCity: vi.fn(),
    },
  ]),
}));

vi.mock('@/hooks/useSchoolSearch', () => ({
  useSchoolSearch: vi.fn(() => ({
    data: [],
    isLoading: false,
    error: null,
  })),
}));

vi.mock('@/hooks/usePopularSchools', () => ({
  usePopularSchools: vi.fn(() => ({
    data: [
      {
        id: 'sch-1',
        name: 'Manipal Public School',
        board: 'CBSE',
        boardType: null,
        address: 'Manipal, Udupi',
        latitude: 13.3525,
        longitude: 74.7864,
        distanceKm: 1.2,
      },
    ],
    isLoading: false,
    error: null,
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

  it('panelContent="school-browse" renders header, search input, popular schools, and area cards', () => {
    const onSelectSchool = vi.fn();
    const onSelectAreaKey = vi.fn();
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="school-browse"
        journey="school-first"
        onSelectSchool={onSelectSchool}
        onSelectAreaKey={onSelectAreaKey}
      />,
    );
    expect(screen.getByText('Find homes near a school')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search school name...')).toBeInTheDocument();
    // Popular schools section (from usePopularSchools mock)
    expect(screen.getByText('Manipal Public School')).toBeInTheDocument();
  });

  it('panelContent="school-browse" school card click calls setSchoolJourney with schoolId', async () => {
    const onSelectSchool = vi.fn();
    mockSetSchoolJourney.mockClear();
    const { getByText } = renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="school-browse"
        journey="school-first"
        onSelectSchool={onSelectSchool}
        onSelectAreaKey={vi.fn()}
      />,
    );
    getByText('Manipal Public School').click();
    // Assert setSchoolJourney was called with the correct school and coordinates from the mock fixture.
    // Since #1160 cycle-3, SchoolBrowsePanel calls setSchoolJourney directly (not onSelectSchool)
    // to write journey + schoolId + radiusKm + areaKey atomically in a single URL push.
    expect(mockSetSchoolJourney).toHaveBeenCalledWith(
      expect.objectContaining({ schoolId: 'sch-1', radiusKm: expect.any(Number), lat: 13.3525, lon: 74.7864 }),
    );
    // Regression guard: onSelectSchool must NOT be called (it is accepted by the prop interface
    // but intentionally unused in SchoolBrowsePanel since #1160 cycle-3).
    expect(onSelectSchool).not.toHaveBeenCalled();
  });

  it('panelContent="school-browse" area card click calls onSelectAreaKey with areaKey', () => {
    const onSelectAreaKey = vi.fn();
    const { getByText } = renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="school-browse"
        journey="school-first"
        city="udupi"
        onSelectSchool={vi.fn()}
        onSelectAreaKey={onSelectAreaKey}
      />,
    );
    // Area card for 'Manipal' comes from the useDiscoverAreas mock (data.areas)
    // Use data-testid selector — more stable than text which can appear in multiple nodes
    screen.getByTestId('area-card').click();
    expect(onSelectAreaKey).toHaveBeenCalledWith('IN|KA|Udupi|Manipal');
    expect(screen.getByText(/3 schools/i)).toBeInTheDocument();
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

  it('panelContent="area-school-combined" renders AreaSchoolCombinedPanel', () => {
    const mockArea: AreaPoint = makeArea('IN|KA|Udupi|Manipal', 'Manipal');
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-school-combined"
        selectedArea={mockArea}
        selectedSchool={null}
        schoolListings={[]}
        schoolListingsLoading={false}
        radiusKm={3}
        onRadiusChange={vi.fn()}
        onClearSchool={vi.fn()}
        onClearArea={vi.fn()}
      />,
    );
    // selectedSchool is null → loading skeleton shown, not radius buttons
    expect(screen.getByTestId('combined-loading-skeleton')).toBeInTheDocument();
  });

  it('always renders data-testid="discover-right-panel" wrapper', () => {
    renderPanel(
      <DiscoverRightPanel {...baseProps} panelContent="guided-entry" />,
    );
    expect(screen.getByTestId('discover-right-panel')).toBeInTheDocument();
  });
});

describe('DiscoverRightPanel — groupId deep-link without journey (issue #1154)', () => {
  it('derivePanelContent routes groupId-only deep-link to area-groups-landing', () => {
    // Validates the derivation path: groupId present, journey absent → area-groups-landing
    const panelContent = derivePanelContent({
      city: 'udupi',
      areaKey: null,
      schoolId: null,
      groupId: 'coastal-homes',
      journey: null,
      q: '',
      radiusKm: null,
      viewport: null,
      filters: {},
      selectedGroup: null,
    });
    expect(panelContent).toBe('area-groups-landing');
  });

  it('renders AreaGroupsLandingPanel when panelContent=area-groups-landing (groupId deep-link result)', () => {
    // When derivePanelContent returns area-groups-landing for a groupId deep-link,
    // the panel must render the landing panel (not guided-entry).
    render(
      <MemoryRouter>
        <DiscoverRightPanel
          areas={[]}
          onStartOver={vi.fn()}
          onSelectJourney={vi.fn()}
          panelContent="area-groups-landing"
          areaGroups={[]}
          isLoadingAreaGroups={false}
          onSelectGroup={vi.fn()}
          discoverAreas={[]}
          onSelectAreaKey={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Select area')).toBeInTheDocument();
    // Guided-entry headline must NOT appear — wrong panel
    expect(screen.queryByText('Find properties your way')).not.toBeInTheDocument();
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

// ─── Issue #1425: agri-group-selected panel ───────────────────────────────────

describe('DiscoverRightPanel — agri-group-selected (Issue #1425)', () => {
  const makeAgriMapListing = (id: string) => ({
    id,
    areaKey: 'IN|KA|Udupi|Manipal',
    latitude: 13.35,
    longitude: 74.79,
    propertyType: 'agricultural_land' as const,
    locality: `Locality ${id}`,
    landArea: 2.5,
    landAreaUnit: 'acre',
  });

  it('renders agri-group-selected-panel testid', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-group-selected"
        agriGroupLabel="North · 10–25 km"
        agriGroupListings={[]}
        isLoadingAgriGroupListings={false}
        isAgriGroupListingsError={false}
        onClearRegionalGroup={vi.fn()}
        onRetryAgriGroupListings={vi.fn()}
      />,
    );
    expect(screen.getByTestId('agri-group-selected-panel')).toBeInTheDocument();
  });

  it('renders the group label in the header chip', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-group-selected"
        agriGroupLabel="North · 10–25 km"
        agriGroupListings={[]}
        isLoadingAgriGroupListings={false}
        isAgriGroupListingsError={false}
        onClearRegionalGroup={vi.fn()}
      />,
    );
    expect(screen.getByTestId('agri-group-selected-label')).toHaveTextContent('North · 10–25 km');
  });

  it('renders loading skeletons when isLoadingAgriGroupListings=true', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-group-selected"
        agriGroupLabel="North"
        agriGroupListings={null}
        isLoadingAgriGroupListings={true}
        isAgriGroupListingsError={false}
        onClearRegionalGroup={vi.fn()}
      />,
    );
    expect(screen.getAllByTestId('agri-group-listing-skeleton').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByTestId('agri-group-listing-row')).not.toBeInTheDocument();
  });

  it('renders locality buttons (not listing rows) when listings are available', () => {
    // Issue #1480 — Level 2 is towns-only; inline listing rows removed
    const listings = [makeAgriMapListing('g1'), makeAgriMapListing('g2')];
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-group-selected"
        agriGroupLabel="North"
        agriGroupListings={listings}
        isLoadingAgriGroupListings={false}
        isAgriGroupListingsError={false}
        onClearRegionalGroup={vi.fn()}
      />,
    );
    // g1 and g2 have distinct localities → 2 locality buttons, 0 listing rows
    expect(screen.getAllByTestId('agri-group-locality-btn')).toHaveLength(2);
    expect(screen.queryByTestId('agri-group-listing-row')).not.toBeInTheDocument();
  });

  it('renders error state and retry/back buttons when isAgriGroupListingsError=true', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-group-selected"
        agriGroupLabel="North"
        agriGroupListings={null}
        isLoadingAgriGroupListings={false}
        isAgriGroupListingsError={true}
        onClearRegionalGroup={vi.fn()}
        onRetryAgriGroupListings={vi.fn()}
      />,
    );
    expect(screen.getByTestId('agri-group-error-state')).toBeInTheDocument();
    expect(screen.getByTestId('agri-group-retry-btn')).toBeInTheDocument();
  });

  it('regression: agri-landing panel still renders for panelContent=agri-landing (agri-group-selected is a separate state)', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-landing"
        selectedArea={null}
        areaListings={[]}
      />,
    );
    // No corridorGroups passed → CorridorLandingPanel renders its empty state
    expect(screen.getByTestId('corridor-landing-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('agri-group-selected-panel')).not.toBeInTheDocument();
  });
});

// ─── Issue #1371: agri-selected panel ─────────────────────────────────────────

describe('DiscoverRightPanel — agri-selected (Issue #1371)', () => {
  const agriArea = makeArea('IN|KA|Udupi|Manipal', 'Manipal');

  const makeAgriListing = (id: string): DiscoverCityListingItem => ({
    id,
    propertyType: 'agricultural_land',
    locality: 'Manipal',
    primaryImageUrl: null,
    landArea: 2,
    landAreaUnit: 'acre',
  });

  it('renders the agri-selected summary strip; count comes from agriAreasData (authoritative), not areaListings.length', () => {
    // agriAreasData is the authoritative count source (backend total, not fetch-capped).
    // Pass 2 listings but agriAreasData says 7 — rendered count must be 7, not 2.
    const listings = [makeAgriListing('a1'), makeAgriListing('a2')];
    const agriAreasData = [{
      areaKey: 'IN|KA|Udupi|Manipal',
      name: 'Manipal',
      geoCenterLat: 13.3,
      geoCenterLon: 74.7,
      listingCount: 7,
      schoolCount: 3,
    }];
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-selected"
        selectedArea={agriArea}
        areaListings={listings}
        isLoadingListings={false}
        agriAreasData={agriAreasData}
      />,
    );
    expect(screen.getByTestId('agri-selected-summary')).toBeInTheDocument();
    // Must show 7 (authoritative), NOT 2 (areaListings.length)
    expect(screen.getByTestId('agri-count')).toHaveTextContent('7 agricultural listings');
  });

  it('renders agri listing cards for each agri listing', () => {
    const listings = [makeAgriListing('a1'), makeAgriListing('a2'), makeAgriListing('a3')];
    // agriAreasData must have non-zero listingCount — empty-state guard is agriCount===0,
    // not areaListings.length===0. Without this, agriCount defaults to 0 and empty state fires.
    const agriAreasData = [{
      areaKey: 'IN|KA|Udupi|Manipal',
      name: 'Manipal',
      geoCenterLat: 13.3,
      geoCenterLon: 74.7,
      listingCount: 3,
      schoolCount: 3,
    }];
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-selected"
        selectedArea={agriArea}
        areaListings={listings}
        isLoadingListings={false}
        agriAreasData={agriAreasData}
      />,
    );
    expect(screen.getAllByTestId('agri-listing-card')).toHaveLength(3);
  });

  it('renders land area on listing cards when present', () => {
    const listings = [makeAgriListing('a1')];
    // agriAreasData must have non-zero listingCount to suppress the empty-state guard.
    const agriAreasData = [{
      areaKey: 'IN|KA|Udupi|Manipal',
      name: 'Manipal',
      geoCenterLat: 13.3,
      geoCenterLon: 74.7,
      listingCount: 1,
      schoolCount: 3,
    }];
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-selected"
        selectedArea={agriArea}
        areaListings={listings}
        isLoadingListings={false}
        agriAreasData={agriAreasData}
      />,
    );
    expect(screen.getByTestId('agri-land-area')).toHaveTextContent('2 acre');
  });

  it('shows backend agri count from agriAreasData when provided (overrides areaListings.length)', () => {
    const agriAreasData = [
      {
        areaKey: 'IN|KA|Udupi|Manipal',
        name: 'Manipal',
        geoCenterLat: 13.35,
        geoCenterLon: 74.79,
        listingCount: 15,   // backend total > loaded listings
        schoolCount: 3,
      },
    ];
    const listings = [makeAgriListing('a1')]; // only 1 loaded but backend says 15
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-selected"
        selectedArea={agriArea}
        areaListings={listings}
        isLoadingListings={false}
        agriAreasData={agriAreasData}
      />,
    );
    // Must show backend count (15), not areaListings.length (1)
    expect(screen.getByTestId('agri-count')).toHaveTextContent('15 agricultural listings');
  });

  it('renders optional acreage when agriAcreage is present in agriAreasData', () => {
    const agriAreasData = [
      {
        areaKey: 'IN|KA|Udupi|Manipal',
        name: 'Manipal',
        geoCenterLat: 13.35,
        geoCenterLon: 74.79,
        listingCount: 5,
        schoolCount: 3,
        agriAcreage: 12.5,
      },
    ];
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-selected"
        selectedArea={agriArea}
        areaListings={[makeAgriListing('a1')]}
        isLoadingListings={false}
        agriAreasData={agriAreasData}
      />,
    );
    expect(screen.getByTestId('agri-acreage')).toHaveTextContent('12.5 acres');
  });

  it('does NOT render acreage element when agriAcreage is absent', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-selected"
        selectedArea={agriArea}
        areaListings={[makeAgriListing('a1')]}
        isLoadingListings={false}
        // no agriAreasData → agriAcreage = undefined
      />,
    );
    expect(screen.queryByTestId('agri-acreage')).not.toBeInTheDocument();
  });

  it('AC8: shows zero-agri empty state when areaListings is empty and not loading', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-selected"
        selectedArea={agriArea}
        areaListings={[]}
        isLoadingListings={false}
      />,
    );
    expect(screen.getByTestId('agri-empty-state')).toBeInTheDocument();
    expect(screen.getByText('No agricultural listings in this area yet')).toBeInTheDocument();
    expect(screen.getByTestId('agri-empty-start-over')).toBeInTheDocument();
  });

  it('AC8: shows loading skeletons when isLoadingListings=true', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-selected"
        selectedArea={agriArea}
        areaListings={[]}
        isLoadingListings={true}
      />,
    );
    expect(screen.getAllByTestId('agri-listing-skeleton').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByTestId('agri-empty-state')).not.toBeInTheDocument();
  });

  it('shows loading indicator in summary strip when isLoadingListings=true', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-selected"
        selectedArea={agriArea}
        areaListings={[]}
        isLoadingListings={true}
      />,
    );
    expect(screen.getByTestId('agri-count-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('agri-count')).not.toBeInTheDocument();
  });

  // Regression: non-agri panels are unchanged
  it('regression: agri-landing panel is still rendered for panelContent=agri-landing', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-landing"
        selectedArea={null}
        areaListings={[]}
      />,
    );
    // No corridorGroups passed → CorridorLandingPanel renders its empty state
    expect(screen.getByTestId('corridor-landing-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('agri-selected-summary')).not.toBeInTheDocument();
  });

  it('regression: area-selected panel is not shown when panelContent=agri-selected', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-selected"
        selectedArea={agriArea}
        areaListings={[]}
        isLoadingListings={false}
      />,
    );
    // area-selected renders a MapPin icon + "No listings in this area yet" text
    expect(screen.queryByText('No listings in this area yet')).not.toBeInTheDocument();
    // agri-selected renders its own empty state
    expect(screen.getByTestId('agri-empty-state')).toBeInTheDocument();
  });
});
