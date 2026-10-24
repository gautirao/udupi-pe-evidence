import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MapInfoDock } from '@/components/discover/MapInfoDock';
import {
  deriveMapInfoDockContent,
  type DeriveMapInfoDockContentOptions,
} from '@/features/discover/surfaces/mapInfoDockContent';
import type { DiscoverMapSurfaceView } from '@/features/discover/surfaces/buildMapSurfaceModel';
import { MarkersTruncationNotice } from '@/components/discover/MapStatsBar';
import { ListingsBody } from '@/features/discover/area-selected/sections/ListingsBody';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  },
}));

vi.mock('@/components/discover/PropertyCard', () => ({
  PropertyCard: ({ listing }: { listing: DiscoverCityListingItem }) => (
    <div data-testid="listing-card" data-listing-id={listing.id}>
      {listing.title}
    </div>
  ),
}));

vi.mock('@/components/discover/RequestPropertyCard', () => ({
  RequestPropertyCard: () => <div data-testid="request-property-card" />,
}));

const RR_NAGAR_AREA: AreaPoint = {
  areaKey: 'IN|KA|Bengaluru|RR Nagar',
  area: 'RR Nagar',
  city: 'Bengaluru',
  state: 'KA',
  country: 'IN',
  count: 6,
  avgPrice: 8500000,
  geoCenterLat: 12.9275,
  geoCenterLon: 77.515,
};

function makeMockSurfaceView(
  overrides: {
    journey?: 'area-first' | 'school-first' | 'agri-first' | null;
    city?: string;
    node?: {
      id: string;
      nodeType: 'ROOT' | 'DIRECTION' | 'CLUSTER' | 'AREA';
      displayLabel: string;
    } | null;
    nodeListingCount?: number | null;
    isAreaFirstSelectedAreaState?: boolean;
    resolvedPanelContent?: string;
    selectedArea?: AreaPoint | null;
    cityTotal?: number;
    areaResultSummaryText?: string;
    badgeVisible?: boolean;
    badgeCount?: number | null;
    badgeState?: 'ready' | 'loading' | 'stale';
  } = {},
): DiscoverMapSurfaceView {
  return {
    navigation: {
      journey: overrides.journey !== undefined ? overrides.journey : 'area-first',
      city: overrides.city ?? 'bangalore',
      areasNavigationJourney:
        overrides.node !== undefined
          ? {
              node: overrides.node,
              nodeCount:
                overrides.nodeListingCount !== undefined && overrides.nodeListingCount !== null
                  ? { listingCount: overrides.nodeListingCount }
                  : null,
            }
          : null,
      isAreaFirstSelectedAreaState: overrides.isAreaFirstSelectedAreaState ?? false,
      resolvedPanelContent: overrides.resolvedPanelContent ?? 'area-groups-landing',
      focusedGroup: null,
      schoolJourneySegments: [],
    },
    areas: {
      selectedArea: overrides.selectedArea ?? null,
    },
    status: {
      discoverBadge: {
        visible: overrides.badgeVisible ?? true,
        count: overrides.badgeCount !== undefined ? overrides.badgeCount : 6,
        state: overrides.badgeState ?? 'ready',
      },
      cityTotal: overrides.cityTotal ?? 19,
      areaResultSummaryText:
        overrides.areaResultSummaryText ?? '6 verified properties for sale in RR Nagar',
      groupSelectedBadgeCopy: 'Showing 10 properties in South',
      isSchoolRadiusCountPending: false,
    },
    schools: {
      selectedSchool: null,
      schoolListings: [],
      schoolFirstZoneSchoolCount: null,
      schoolFirstAreaSchoolCount: null,
      schoolFirstLandingSchoolCount: null,
    },
    agri: {
      selectedRegion: null,
      selectedMaxKm: null,
      selectedLocality: null,
      agriLocalityArea: null,
      agriTotalCount: 0,
    },
  } as unknown as DiscoverMapSurfaceView;
}

describe('Issue #2859 trim rows — L73 MapInfoDock & deriveMapInfoDockContent (D1a, D4, D7b, D9)', () => {
  it('D1a: renders a single map-info-dock container without role="status" on the outer wrapper, role="status" on discover-badge, and strict guidance -> count -> recenter DOM order', () => {
    const onRecenter = vi.fn();
    const content = deriveMapInfoDockContent(makeMockSurfaceView());
    expect(content).not.toBeNull();

    const { container } = render(
      <MemoryRouter>
        <MapInfoDock
          {...content!}
          isAuthenticated={false}
          onRecenter={onRecenter}
          isMobile={false}
        />
      </MemoryRouter>,
    );

    const dock = screen.getByTestId('map-info-dock');
    expect(dock.getAttribute('role')).toBeNull();
    expect(dock.className).toContain('pointer-events-none');

    const guidance = screen.getByTestId('map-info-dock-guidance');
    const badge = screen.getByTestId('discover-badge');
    const recenter = screen.getByTestId('map-info-dock-recenter');

    expect(guidance).toHaveTextContent(
      'Select an area to see properties — or sign in to explore the full map',
    );
    expect(badge).toHaveAttribute('role', 'status');
    expect(badge).toHaveTextContent('Showing 19 verified properties across Bangalore');
    expect(recenter).toHaveAccessibleName('Recenter on Bangalore');
    expect(recenter.className).toContain('pointer-events-auto');

    // Verify top-to-bottom DOM order: guidance -> count -> recenter
    const testIds = Array.from(container.querySelectorAll('[data-testid]')).map((el) =>
      el.getAttribute('data-testid'),
    );
    expect(testIds).toEqual([
      'map-info-dock',
      'map-info-dock-guidance',
      'discover-badge',
      'map-info-dock-recenter',
    ]);
  });

  it('D4: hides map-info-dock-guidance when a leaf area is selected (listingCapable=true) while keeping discover-badge and map-info-dock-recenter visible', () => {
    const content = deriveMapInfoDockContent(
      makeMockSurfaceView({
        isAreaFirstSelectedAreaState: true,
        resolvedPanelContent: 'area-selected',
        selectedArea: RR_NAGAR_AREA,
        node: {
          id: 'a:IN|KA|Bengaluru|RR Nagar',
          nodeType: 'AREA',
          displayLabel: 'RR Nagar',
        },
      }),
    );

    expect(content).not.toBeNull();
    expect(content!.listingCapable).toBe(true);

    render(
      <MemoryRouter>
        <MapInfoDock
          {...content!}
          isAuthenticated={false}
          onRecenter={vi.fn()}
          isMobile={false}
        />
      </MemoryRouter>,
    );

    expect(screen.queryByTestId('map-info-dock-guidance')).toBeNull();
    expect(screen.getByTestId('discover-badge')).toHaveTextContent(
      '6 verified properties for sale in RR Nagar',
    );
    expect(screen.getByTestId('map-info-dock-recenter')).toHaveAccessibleName(
      'Recenter on RR Nagar',
    );
  });

  it('D7b: updates recenter accessible name and scopeKey across City -> Area -> area-school-combined -> City transitions and invokes onRecenter', () => {
    const onRecenter = vi.fn();

    // 1. City landing: Recenter on Bangalore
    const cityContent = deriveMapInfoDockContent(
      makeMockSurfaceView({
        node: { id: 'root:bangalore', nodeType: 'ROOT', displayLabel: 'Bangalore' },
      }),
    );
    const { rerender } = render(
      <MemoryRouter>
        <MapInfoDock
          {...cityContent!}
          isAuthenticated={false}
          onRecenter={onRecenter}
          isMobile={false}
        />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('map-info-dock-recenter')).toHaveAccessibleName(
      'Recenter on Bangalore',
    );
    expect(cityContent!.scopeKey).toBe('areas:node:root:bangalore');

    // 2. Drill into RR Nagar: Recenter on RR Nagar
    const areaContent = deriveMapInfoDockContent(
      makeMockSurfaceView({
        isAreaFirstSelectedAreaState: true,
        resolvedPanelContent: 'area-selected',
        selectedArea: RR_NAGAR_AREA,
        node: {
          id: 'a:IN|KA|Bengaluru|RR Nagar',
          nodeType: 'AREA',
          displayLabel: 'RR Nagar',
        },
      }),
    );
    rerender(
      <MemoryRouter>
        <MapInfoDock
          {...areaContent!}
          isAuthenticated={false}
          onRecenter={onRecenter}
          isMobile={false}
        />
      </MemoryRouter>,
    );
    const areaRecenterBtn = screen.getByTestId('map-info-dock-recenter');
    expect(areaRecenterBtn).toHaveAccessibleName('Recenter on RR Nagar');
    expect(areaContent!.scopeKey).toBe('areas:node:a:IN|KA|Bengaluru|RR Nagar');
    fireEvent.click(areaRecenterBtn);
    expect(onRecenter).toHaveBeenCalledTimes(1);

    // 3. area-school-combined sub-step: preserves RR Nagar recenter and keeps guidance hidden (listingCapable=true)
    const combinedContent = deriveMapInfoDockContent(
      makeMockSurfaceView({
        isAreaFirstSelectedAreaState: false,
        resolvedPanelContent: 'area-school-combined',
        selectedArea: RR_NAGAR_AREA,
        node: {
          id: 'a:IN|KA|Bengaluru|RR Nagar',
          nodeType: 'AREA',
          displayLabel: 'RR Nagar',
        },
      }),
    );
    expect(combinedContent!.listingCapable).toBe(true);
    rerender(
      <MemoryRouter>
        <MapInfoDock
          {...combinedContent!}
          isAuthenticated={false}
          onRecenter={onRecenter}
          isMobile={false}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('map-info-dock-guidance')).toBeNull();
    expect(screen.getByTestId('map-info-dock-recenter')).toHaveAccessibleName(
      'Recenter on RR Nagar',
    );

    // 4. Back to Bangalore city root: Recenter on Bangalore
    rerender(
      <MemoryRouter>
        <MapInfoDock
          {...cityContent!}
          isAuthenticated={false}
          onRecenter={onRecenter}
          isMobile={false}
        />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('map-info-dock-recenter')).toHaveAccessibleName(
      'Recenter on Bangalore',
    );
  });

  it('D9: renders a single map-info-dock and single map-info-dock-recenter on mobile (isMobile=true) with zero legacy duplicate buttons', () => {
    const mobileLandingOptions: DeriveMapInfoDockContentOptions = {
      hideDuplicateCountBadge: false,
    };
    const mobileLandingContent = deriveMapInfoDockContent(
      makeMockSurfaceView(),
      mobileLandingOptions,
    );

    const { container, rerender } = render(
      <MemoryRouter>
        <MapInfoDock
          {...mobileLandingContent!}
          isAuthenticated={false}
          onRecenter={vi.fn()}
          isMobile={true}
        />
      </MemoryRouter>,
    );

    expect(screen.getAllByTestId('map-info-dock')).toHaveLength(1);
    expect(screen.getAllByTestId('map-info-dock-recenter')).toHaveLength(1);
    expect(screen.getByTestId('map-info-dock-guidance')).toHaveTextContent(
      'Select an area to see properties — or sign in for the full map',
    );
    expect(screen.getByTestId('discover-badge')).toHaveTextContent(
      'Showing 19 verified properties across Bangalore',
    );
    expect(container.querySelector('[data-testid="areas-recenter-button"]')).toBeNull();
    expect(container.querySelector('[data-testid="map-recenter-city-button"]')).toBeNull();
    expect(container.querySelector('[data-testid="map-anon-zoom-prompt"]')).toBeNull();

    // When hideDuplicateCountBadge=true on mobile (e.g. mobile map-results-heading owns the count),
    // the count row is omitted while the single recenter button remains mounted.
    const mobileAreaContent = deriveMapInfoDockContent(
      makeMockSurfaceView({
        isAreaFirstSelectedAreaState: true,
        resolvedPanelContent: 'area-selected',
        selectedArea: RR_NAGAR_AREA,
        node: {
          id: 'a:IN|KA|Bengaluru|RR Nagar',
          nodeType: 'AREA',
          displayLabel: 'RR Nagar',
        },
      }),
      { hideDuplicateCountBadge: true },
    );
    rerender(
      <MemoryRouter>
        <MapInfoDock
          {...mobileAreaContent!}
          isAuthenticated={false}
          onRecenter={vi.fn()}
          isMobile={true}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('discover-badge')).toBeNull();
    expect(screen.getByTestId('map-info-dock-recenter')).toHaveAccessibleName(
      'Recenter on RR Nagar',
    );
  });
});

describe('Issue #2859 trim rows — L98 MarkersTruncationNotice & ListingsBody independence (MT-1, MT-2, MT-3)', () => {
  it('MT-1 (N7 positive): renders formatted truncation notice inside an aria-live="polite" region when truncated=true', () => {
    const { container } = render(
      <MarkersTruncationNotice
        truncated={true}
        returnedElements={1000}
        totalFilteredElements={4200}
      />,
    );

    const liveRegion = container.querySelector('[aria-live="polite"][aria-atomic="true"]');
    expect(liveRegion).not.toBeNull();
    expect(liveRegion).toHaveTextContent(
      'Showing 1,000 of 4,200 pins in this map area — zoom in to refine',
    );
  });

  it('MT-2 (N7 negative): keeps the aria-live="polite" container mounted in the DOM when truncated=false so screen readers detect transitions, without rendering truncation copy', () => {
    const { container } = render(
      <MarkersTruncationNotice
        truncated={false}
        returnedElements={42}
        totalFilteredElements={42}
      />,
    );

    const liveRegion = container.querySelector('[aria-live="polite"][aria-atomic="true"]');
    expect(liveRegion).not.toBeNull();
    expect(liveRegion).not.toHaveTextContent('pins in this map area');
  });

  it('MT-3 (N8): right-panel ListingsBody renders all areaListings cards unaffected when map markers are truncated', () => {
    const mockListings: DiscoverCityListingItem[] = [
      {
        id: 'trunc-prop-1',
        title: '3BHK Manipal Prime Residency',
        price: 8500000,
        propertyType: 'apartment',
        bedrooms: 3,
        bathrooms: 3,
        area: 1650,
        locality: 'Manipal',
        city: 'Udupi',
        latitude: 13.3525,
        longitude: 74.7928,
        images: [],
        verificationStatus: 'verified',
      } as unknown as DiscoverCityListingItem,
      {
        id: 'trunc-prop-2',
        title: '2BHK Manipal Valley View',
        price: 5800000,
        propertyType: 'apartment',
        bedrooms: 2,
        bathrooms: 2,
        area: 1200,
        locality: 'Manipal',
        city: 'Udupi',
        latitude: 13.354,
        longitude: 74.795,
        images: [],
        verificationStatus: 'verified',
      } as unknown as DiscoverCityListingItem,
    ];

    render(
      <MemoryRouter>
        <div>
          <MarkersTruncationNotice
            truncated={true}
            returnedElements={1}
            totalFilteredElements={50}
          />
          <ListingsBody
            isFetching={false}
            isInitialLoading={false}
            areaListings={mockListings}
            hasPropertyFilters={false}
            searchQuery=""
            listingCount={2}
            areaLabel="Manipal"
            resolvedCityLabel="Udupi"
            commercialFromFilters={false}
            intentNoun="sale"
            multiAreaKeys={null}
            fallbackAreaKey="IN|KA|Udupi|Manipal"
            resolvedAreasCity="udupi"
            filters={{}}
            activeScope={{ kind: 'AREA_SET', areaKeys: ['IN|KA|Udupi|Manipal'] }}
            resultScopeKind="AREA"
            areaResultSummaryText="2 verified properties for sale in Manipal"
            count={2}
            isViewportScope={false}
            onNavigateToListing={vi.fn()}
            selectedListingId={null}
            hoveredListingId={null}
            registerCardRef={() => () => {}}
          />
        </div>
      </MemoryRouter>,
    );

    expect(
      screen.getByText('Showing 1 of 50 pins in this map area — zoom in to refine'),
    ).toBeInTheDocument();
    const cards = screen.getAllByTestId('listing-card');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent('3BHK Manipal Prime Residency');
    expect(cards[1]).toHaveTextContent('2BHK Manipal Valley View');
  });
});
