import { useState, type ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDiscoverUrlState } from '@/hooks/useDiscoverUrlState';
import { useDiscoverSchoolController } from '@/features/discover/controllers/useDiscoverSchoolController';
import { useDiscoverJourneyTransitions } from '@/features/discover/state/useDiscoverJourneyTransitions';
import {
  AreaSetTwoTileRow,
  DrawSearchAreaEntry,
} from '@/components/discover/panels/AreaSetSelectedExtras';
import { GuidedEntryPanel } from '@/components/discover/panels/GuidedEntryPanel';
import { CompactResultsHeader } from '@/features/discover/area-selected/sections/CompactResultsHeader';
import {
  ResultHeading,
  type ResultHeadingShellActions,
} from '@/features/discover/area-selected/sections/ResultHeading';
import { ListingsBody } from '@/features/discover/area-selected/sections/ListingsBody';
import { useResultScopeController } from '@/features/discover/area-selected/controllers/useResultScopeController';
import { useAreaSetScopeCommands } from '@/features/discover/area-selected/controllers/useAreaSetScopeCommands';
import {
  AreaSetDraftProvider,
  useAreaSetDraftContext,
} from '@/features/discover/state/AreaSetDraftContext';
import {
  makeAreaSetCandidateCalloutIcon,
  makeAreaSetDraftMemberIcon,
  type AreaSetCandidateCallout,
  type AreaSetDraftMemberMarker,
} from '@/components/map/AreaSetCandidateCalloutLayer';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import type { NearbyAreaCandidate } from '@/hooks/useNearbyAreaCandidates';
import type { ResultScope } from '@/features/discover/state/resultScope';

let mockAuthUser: { id: string; email: string } | null = null;
let mockAuthLoading = false;

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

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: mockAuthUser,
    isLoading: mockAuthLoading,
  }),
}));

let mockNavState: {
  city: string;
  scope?: string | null;
  intent?: 'buy' | 'rent';
  journey?: 'area-first' | 'school-first' | 'agri-first' | null;
  areaKey: string | null;
  filters: PropertyFilters;
  resultScope: {
    active: ResultScope | null;
    previous: ResultScope | null;
  };
} = {
  city: 'bangalore',
  scope: null,
  intent: 'buy',
  journey: 'area-first',
  areaKey: 'IN|KA|Bengaluru|RR Nagar',
  filters: {},
  resultScope: {
    active: { kind: 'AREA_SET', areaKeys: ['IN|KA|Bengaluru|RR Nagar'] },
    previous: null,
  },
};

let mockSetScopeHandler: ((scope: string | null) => void) | null = null;
let mockCommitResultScopeHandler: ((scope: ResultScope | null) => void) | null = null;

vi.mock('@/features/discover/context/useDiscoverContext', () => ({
  useDiscoverNav: () => mockNavState,
  useDiscoverActions: () => ({
    setScope: (scope: string | null) => {
      mockSetScopeHandler?.(scope);
    },
    commitResultScope: (scope: ResultScope | null) => {
      mockCommitResultScopeHandler?.(scope);
    },
    startDrawPolygon: vi.fn(),
  }),
  useDiscoverShell: () => ({
    isAreaSetDraftOpen: true,
    setIsAreaSetDraftOpen: vi.fn(),
    openAreaSetDraft: vi.fn(),
    setAreaSetCameraRestoreRequest: vi.fn(),
    fitAreaSet: vi.fn(),
    focusAreaSetMember: vi.fn(),
    startDrawSearchArea: vi.fn(),
    isMobileShell: false,
    setMobileView: vi.fn(),
  }),
  useDiscoverViewport: () => ({
    mapZoom: 14,
  }),
}));

vi.mock('@/hooks/useDiscoverRegionSummary', () => ({
  useDiscoverRegionSummary: () => ({
    data: {
      citySlug: 'udupi',
      regions: [
        { key: 'south', label: 'South', listingCount: 12 },
        { key: 'north', label: 'North', listingCount: 5 },
      ],
    },
    isLoading: false,
    isError: false,
  }),
}));

let mockNearbyCandidates: NearbyAreaCandidate[] = [];
vi.mock('@/hooks/useNearbyAreaCandidates', () => ({
  useNearbyAreaCandidates: () => ({
    data: {
      seedAreaKeys: ['IN|KA|Bengaluru|RR Nagar'],
      candidates: mockNearbyCandidates,
    },
    isLoading: false,
    isError: false,
  }),
}));

vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: () => ({
    data: {
      city: 'bangalore',
      totalListings: 13,
      areas: [
        {
          areaKey: 'IN|KA|Bengaluru|Sanjeevini Nagar',
          name: 'Sanjeevini Nagar',
          geoCenterLat: 13.03,
          geoCenterLon: 77.52,
          minLat: 13.01,
          minLon: 77.5,
          maxLat: 13.05,
          maxLon: 77.54,
          listingCount: 3,
        },
        {
          areaKey: 'IN|KA|Bengaluru|Koramangala',
          name: 'Koramangala',
          geoCenterLat: 12.935,
          geoCenterLon: 77.624,
          minLat: 12.92,
          minLon: 77.61,
          maxLat: 12.95,
          maxLon: 77.64,
          listingCount: 4,
        },
        {
          areaKey: 'IN|KA|Bengaluru|RR Nagar',
          name: 'RR Nagar',
          geoCenterLat: 12.9275,
          geoCenterLon: 77.515,
          minLat: 12.91,
          minLon: 77.5,
          maxLat: 12.94,
          maxLon: 77.53,
          listingCount: 6,
        },
      ],
    },
    isLoading: false,
    isError: false,
  }),
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

function makeRouterWrapper(initialEntries: string[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  };
}

const DEFAULT_SHELL_ACTIONS: ResultHeadingShellActions = {
  fitAreaSet: vi.fn(),
  focusAreaSetMember: vi.fn(),
  startDrawSearchArea: vi.fn(),
  isMobileShell: false,
  setMobileView: vi.fn(),
};

const TEST_SCHOOL: SchoolResult = {
  id: 'sch-nps-manipal',
  name: 'Manipal Public School',
  city: 'udupi',
  areaKey: 'IN|KA|Udupi|Manipal',
  latitude: 13.3525,
  longitude: 74.7928,
  board: 'CBSE',
  category: 'Co-ed',
} as unknown as SchoolResult;

describe('Issue #2859 trim rows — L58 Area-selected school sub-flow (A3/D-C1, B-T2/D-C6, B-T5/D-C5)', () => {
  it('A3 & D-C1: AreaSetTwoTileRow renders "Schools in {Area}" tile with school count sub-label and fires onAddSchool', () => {
    const onAddNearbyAreas = vi.fn();
    const onAddSchool = vi.fn();

    const { rerender } = render(
      <AreaSetTwoTileRow
        primaryAreaName="Manipal"
        primaryAreaKey="IN|KA|Udupi|Manipal"
        city="udupi"
        fallbackSchoolCount={4}
        onAddNearbyAreas={onAddNearbyAreas}
        onAddSchool={onAddSchool}
      />,
    );

    const schoolsTile = screen.getByTestId('area-set-schools-tile');
    expect(schoolsTile).toHaveTextContent('Schools in Manipal');
    expect(schoolsTile).toHaveTextContent('4 schools · keeps this area');

    fireEvent.click(schoolsTile);
    expect(onAddSchool).toHaveBeenCalledTimes(1);

    rerender(
      <AreaSetTwoTileRow
        primaryAreaName="RR Nagar"
        primaryAreaKey="IN|KA|Bengaluru|RR Nagar"
        city="bangalore"
        fallbackSchoolCount={1}
        onAddNearbyAreas={onAddNearbyAreas}
        onAddSchool={onAddSchool}
      />,
    );
    expect(screen.getByTestId('area-set-schools-tile')).toHaveTextContent('Schools in RR Nagar');
    expect(screen.getByTestId('area-set-schools-tile')).toHaveTextContent(
      '1 school · keeps this area',
    );
  });

  it('B-T2 & D-C6: two-rung handleAreaFirstBack steps from area-school-combined -> schools-in-area (backToSchoolPicking) -> area-selected (clearSchoolPicking) while preserving journey=area-first, areaKey, and node', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = makeRouterWrapper([
      '/discover?city=bangalore&journey=area-first&node=a:IN%7CKA%7CBengaluru%7CRR%20Nagar&areaKey=IN%7CKA%7CBengaluru%7CRR%20Nagar&schoolId=sch-1&radiusKm=3',
    ]);

    const { result } = renderHook(
      () => {
        const [urlState, urlActions] = useDiscoverUrlState();
        const location = useLocation();
        const [selectedSchool, setSelectedSchool] = useState<SchoolResult | null>(TEST_SCHOOL);
        const [filters, setFilters] = useState<PropertyFilters>({
          schoolLat: 12.9275,
          schoolLon: 77.515,
          schoolRadiusKm: 3,
        });
        const [boundedTriggered, setBoundedTriggered] = useState(true);

        const schoolCtrl = useDiscoverSchoolController({
          nav: urlState,
          urlState,
          urlActions,
          areasNavigationJourney: {
            node: {
              nodeKey: 'a:IN|KA|Bengaluru|RR Nagar',
              nodeType: 'AREA',
              displayName: 'RR Nagar',
              areaKey: 'IN|KA|Bengaluru|RR Nagar',
            },
          } as unknown as Parameters<
            typeof useDiscoverSchoolController
          >[0]['areasNavigationJourney'],
          handleAreaBack: vi.fn(),
          selectedSchool,
          filters,
          setSelectedArea: vi.fn(),
          setSelectedSchool,
          setFilters,
          setSchoolBoardFilter: vi.fn(),
          setPanToArea: vi.fn(),
          resetMapTick: 0,
          pendingAreaKeyRef: { current: null },
          initialViewportRef: { current: null },
          initialViewportWasBareAreaRef: { current: false },
          resolveSignal: 0,
          handleSchoolSelect: vi.fn(),
          queryClient,
          schoolById: undefined,
          schoolByIdError: null,
          discoverAreas: [],
          areasLoading: false,
          schoolBoardFilter: [],
          panelContent: 'area-school-combined',
          city: 'bangalore',
          toast: vi.fn(),
          boundedSearchTriggered: boundedTriggered,
          setBoundedSearchTriggered: setBoundedTriggered,
          isAuthenticated: false,
          areaListings: [],
          schoolRadiusListings: [],
          filteredListings: [],
          selectedArea: null,
          focusedGroup: null,
        });

        return {
          urlState,
          search: location.search,
          selectedSchool,
          filters,
          boundedTriggered,
          schoolCtrl,
        };
      },
      { wrapper },
    );

    expect(result.current.urlState.journey).toBe('area-first');
    expect(result.current.urlState.schoolId).toBe('sch-1');
    expect(result.current.urlState.schoolPicking).toBeUndefined();

    // Rung 1: Back from area-school-combined -> schools-in-area (schoolPicking=1, schoolId & radiusKm removed)
    act(() => {
      result.current.schoolCtrl.handleAreaFirstBack();
    });

    expect(result.current.urlState.journey).toBe('area-first');
    expect(result.current.urlState.schoolId).toBeNull();
    expect(result.current.urlState.radiusKm).toBeNull();
    expect(result.current.urlState.schoolPicking).toBe(true);
    expect(result.current.urlState.areaKey).toBe('IN|KA|Bengaluru|RR Nagar');
    expect(result.current.urlState.rawNodeParam).toBe('a:IN|KA|Bengaluru|RR Nagar');
    expect(result.current.selectedSchool).toBeNull();
    expect(result.current.filters.schoolLat).toBeUndefined();
    expect(result.current.boundedTriggered).toBe(false);

    // Rung 2: Back from schools-in-area -> area-selected (schoolPicking removed, areaKey & node preserved)
    act(() => {
      result.current.schoolCtrl.handleAreaFirstBack();
    });

    expect(result.current.urlState.journey).toBe('area-first');
    expect(result.current.urlState.schoolPicking).toBeUndefined();
    expect(result.current.urlState.schoolId).toBeNull();
    expect(result.current.urlState.areaKey).toBe('IN|KA|Bengaluru|RR Nagar');
    expect(result.current.urlState.rawNodeParam).toBe('a:IN|KA|Bengaluru|RR Nagar');
  });

  it('B-T5 & D-C5: selecting a school during area-first schoolPicking=1 (both legacy areaKey and canonical node=a:...) calls setSchoolParams, clears schoolPicking, and preserves journey=area-first and node=', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = makeRouterWrapper([
      '/discover?city=bangalore&journey=area-first&node=a:IN%7CKA%7CBengaluru%7CRR%20Nagar&schoolPicking=1',
    ]);

    const { result } = renderHook(
      () => {
        const [urlState, urlActions] = useDiscoverUrlState();
        const [selectedSchool, setSelectedSchool] = useState<SchoolResult | null>(null);
        const [filters, setFilters] = useState<PropertyFilters>({});
        const [boundedSearchTriggered, setBoundedSearchTriggered] = useState(true);

        const transitions = useDiscoverJourneyTransitions({
          urlState,
          urlActions,
          selectedSchool,
          filters,
          setSelectedArea: vi.fn(),
          setSelectedSchool,
          setFilters,
          setSchoolBoardFilter: vi.fn(),
          setPanToArea: vi.fn(),
          resetMapTick: 0,
          pendingAreaKeyRef: { current: null },
          initialViewportRef: { current: null },
          initialViewportWasBareAreaRef: { current: false },
          resolveSignal: 0,
          handleSchoolSelect: vi.fn(),
          schools: [TEST_SCHOOL],
          queryClient,
          schoolById: undefined,
          schoolByIdError: null,
          discoverAreas: [],
          areasLoading: false,
          urlBoardFilters: [],
          schoolBoardFilter: [],
          panelContent: 'schools-in-area',
          city: 'bangalore',
          toast: vi.fn(),
          hasResolvedCanonicalArea: true,
          boundedSearchTriggered,
          setBoundedSearchTriggered,
        });

        return { urlState, selectedSchool, filters, boundedSearchTriggered, transitions };
      },
      { wrapper },
    );

    expect(result.current.urlState.journey).toBe('area-first');
    expect(result.current.urlState.schoolPicking).toBe(true);
    expect(result.current.urlState.rawNodeParam).toBe('a:IN|KA|Bengaluru|RR Nagar');

    act(() => {
      result.current.transitions.commands.selectSchoolById(TEST_SCHOOL.id);
    });

    // Must stay in area-first, keep canonical node=, clear schoolPicking, and set schoolId + radiusKm
    expect(result.current.urlState.journey).toBe('area-first');
    expect(result.current.urlState.rawNodeParam).toBe('a:IN|KA|Bengaluru|RR Nagar');
    expect(result.current.urlState.schoolPicking).toBeUndefined();
    expect(result.current.urlState.schoolId).toBe(TEST_SCHOOL.id);
    expect(result.current.urlState.radiusKm).toBe(3);
    expect(result.current.selectedSchool?.id).toBe(TEST_SCHOOL.id);
    expect(result.current.filters.schoolLat).toBe(TEST_SCHOOL.latitude);
    expect(result.current.boundedSearchTriggered).toBe(false);
  });
});

describe('Issue #2859 trim rows — L60 GuidedEntryPanel region scope & history Back/Forward (B3, B7) + L66 startOver (N15)', () => {
  it('B3: GuidedEntryPanel region card click writes scope=south with aria-pressed="true", and Clear removes scope', () => {
    const wrapper = makeRouterWrapper(['/discover?city=udupi']);

    function Harness() {
      const [urlState, urlActions] = useDiscoverUrlState();
      const location = useLocation();
      mockNavState.scope = urlState.scope;
      mockSetScopeHandler = urlActions.setScope;

      return (
        <div>
          <div data-testid="current-search">{location.search}</div>
          <GuidedEntryPanel
            city="udupi"
            onCityChange={urlActions.changeCity}
            intent={urlState.intent}
            onIntentChange={urlActions.setIntent}
            totalProperties={17}
            areasCount={6}
            onSelectJourney={urlActions.setJourney}
          />
        </div>
      );
    }

    render(<Harness />, { wrapper });

    const grid = screen.getByTestId('guided-entry-regions-grid');
    const southBtn = Array.from(grid.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('South'),
    )!;
    expect(southBtn).toBeDefined();
    expect(southBtn).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: /Clear/i })).toBeNull();

    // Select South region
    fireEvent.click(southBtn);
    expect(southBtn).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('current-search').textContent).toContain('scope=south');

    // Clear region filter
    const clearBtn = screen.getByRole('button', { name: /Clear/i });
    fireEvent.click(clearBtn);
    expect(southBtn).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('current-search').textContent).not.toContain('scope=');
  });

  it('B7: selecting a region (scope=south) then pushing an area selection preserves scope=south across browser Back and Forward', () => {
    const wrapper = makeRouterWrapper(['/discover?city=udupi']);

    const { result } = renderHook(
      () => {
        const [urlState, urlActions] = useDiscoverUrlState();
        const navigate = useNavigate();
        return { urlState, urlActions, navigate };
      },
      { wrapper },
    );

    // 1. Select region South (REPLACE)
    act(() => {
      result.current.urlActions.setScope('south');
    });
    expect(result.current.urlState.scope).toBe('south');
    expect(result.current.urlState.areaKey).toBeNull();

    // 2. Select area Manipal (PUSH)
    act(() => {
      result.current.urlActions.selectArea('IN|KA|Udupi|Manipal');
    });
    expect(result.current.urlState.scope).toBe('south');
    expect(result.current.urlState.areaKey).toBe('IN|KA|Udupi|Manipal');

    // 3. History Back (-1) -> restores scope=south with areaKey=null
    act(() => {
      result.current.navigate(-1);
    });
    expect(result.current.urlState.scope).toBe('south');
    expect(result.current.urlState.areaKey).toBeNull();

    // 4. History Forward (+1) -> restores areaKey=IN|KA|Udupi|Manipal + scope=south
    act(() => {
      result.current.navigate(1);
    });
    expect(result.current.urlState.scope).toBe('south');
    expect(result.current.urlState.areaKey).toBe('IN|KA|Udupi|Manipal');
  });

  it('L66 N15: startOver clears areaKey, journey param, lat, lon, and zoom=14, producing exact ?city=udupi and incrementing startOverTick', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = makeRouterWrapper([
      '/discover?city=udupi&journey=area-first&areaKey=IN%7CKA%7CUdupi%7CManipal&lat=13.35&lon=74.79&zoom=14',
    ]);

    const { result } = renderHook(
      () => {
        const [urlState, urlActions] = useDiscoverUrlState();
        const location = useLocation();
        const [selectedArea, setSelectedArea] = useState<AreaPoint | null>({
          areaKey: 'IN|KA|Udupi|Manipal',
          area: 'Manipal',
          city: 'Udupi',
          state: 'KA',
          country: 'IN',
          count: 8,
          avgPrice: null,
          geoCenterLat: 13.35,
          geoCenterLon: 74.79,
        });
        const [selectedSchool, setSelectedSchool] = useState<SchoolResult | null>(null);
        const [filters, setFilters] = useState<PropertyFilters>({ bedrooms: [3] });
        const [boundedSearchTriggered, setBoundedSearchTriggered] = useState(true);

        const transitions = useDiscoverJourneyTransitions({
          urlState,
          urlActions,
          selectedSchool,
          filters,
          setSelectedArea,
          setSelectedSchool,
          setFilters,
          setSchoolBoardFilter: vi.fn(),
          setPanToArea: vi.fn(),
          resetMapTick: 0,
          pendingAreaKeyRef: { current: null },
          initialViewportRef: { current: null },
          initialViewportWasBareAreaRef: { current: false },
          resolveSignal: 0,
          handleSchoolSelect: vi.fn(),
          schools: [],
          queryClient,
          schoolById: undefined,
          schoolByIdError: null,
          discoverAreas: [],
          areasLoading: false,
          urlBoardFilters: [],
          schoolBoardFilter: [],
          panelContent: 'area-selected',
          city: 'udupi',
          toast: vi.fn(),
          boundedSearchTriggered,
          setBoundedSearchTriggered,
        });

        return {
          urlState,
          search: location.search,
          selectedArea,
          filters,
          transitions,
        };
      },
      { wrapper },
    );

    expect(result.current.urlState.areaKey).toBe('IN|KA|Udupi|Manipal');
    expect(result.current.urlState.viewport?.zoom).toBe(14);
    expect(result.current.transitions.view.composedResetMapTick).toBe(0);

    act(() => {
      result.current.transitions.commands.startOver();
    });

    expect(result.current.search).toBe('?city=udupi');
    expect(result.current.urlState.areaKey).toBeNull();
    expect(result.current.urlState.viewport).toBeNull();
    expect(result.current.selectedArea).toBeNull();
    expect(result.current.filters).toEqual({});
    expect(result.current.transitions.view.composedResetMapTick).toBe(1);
  });
});

describe('Issue #2859 trim rows — L78 Multi-area chip dismiss in CompactResultsHeader (issue #2729)', () => {
  it('renders 2 committed area chips with "&" title and collapses to single-area "Properties in <Area>" when second chip is dismissed', () => {
    const wrapper = makeRouterWrapper([
      '/discover?city=bangalore&journey=area-first&rscope=areas&rareas=IN%7CKA%7CBengaluru%7CSanjeevini%20Nagar,IN%7CKA%7CBengaluru%7CKoramangala',
    ]);

    function HeaderHarness() {
      const [urlState, urlActions] = useDiscoverUrlState();
      mockNavState.city = urlState.city;
      mockNavState.resultScope = urlState.resultScope;
      mockCommitResultScopeHandler = urlActions.commitResultScope;

      const scopeCtrl = useResultScopeController({
        city: urlState.city,
        isViewportScope: urlState.resultScope.active?.kind === 'VIEWPORT',
      });

      const areaSetCommands = useAreaSetScopeCommands({
        multiAreaKeys: scopeCtrl.multiAreaKeys,
      });

      return (
        <div>
          <div data-testid="rareas-url">
            {urlState.resultScope.active?.kind === 'AREA_SET'
              ? urlState.resultScope.active.areaKeys.join(',')
              : ''}
          </div>
          <CompactResultsHeader
            multiAreaKeys={scopeCtrl.multiAreaKeys}
            resolvedAreasCity="bangalore"
            count={5}
            headingNoun="Properties"
            countNoun="properties for sale"
            areaLabel="Sanjeevini Nagar"
            resultScopeKind={scopeCtrl.resultScopeKind}
            isViewportScope={urlState.resultScope.active?.kind === 'VIEWPORT'}
            scopeActions={{
              onEditAreas: areaSetCommands.commands.editAreas,
              onClearAreas: scopeCtrl.commands.clearAreas,
              returnLabel: scopeCtrl.returnLabel,
              onReturn: scopeCtrl.commands.returnToPrevious,
            }}
            onRemoveArea={areaSetCommands.commands.removeCommittedArea}
          />
        </div>
      );
    }

    render(<HeaderHarness />, { wrapper });

    const title = screen.getByTestId('compact-results-title');
    expect(title).toHaveTextContent('Sanjeevini Nagar · Koramangala');

    const chips = screen.getAllByTestId(/^area-set-panel-committed-chip-IN\|KA\|Bengaluru\|/);
    // Filter out the -dismiss buttons which share the prefix
    const chipPills = chips.filter(
      (el) => !el.getAttribute('data-testid')?.endsWith('-dismiss'),
    );
    expect(chipPills).toHaveLength(2);

    // Dismiss Koramangala chip
    const dismissKoramangala = screen.getByTestId(
      'area-set-panel-committed-chip-IN|KA|Bengaluru|Koramangala-dismiss',
    );
    fireEvent.click(dismissKoramangala);

    // URL rareas collapses to Sanjeevini Nagar only, and title switches to single-area heading
    expect(screen.getByTestId('rareas-url')).toHaveTextContent(
      'IN|KA|Bengaluru|Sanjeevini Nagar',
    );
    expect(screen.getByTestId('compact-results-title')).toHaveTextContent(
      'Properties in Sanjeevini Nagar',
    );
    expect(screen.getByTestId('compact-results-title').textContent).not.toContain('·');
  });
});

describe('Issue #2859 trim rows — L179 ResultScope contract (N6a, N13, N14) & L185 Polygon panel parity (N16)', () => {
  beforeEach(() => {
    mockAuthUser = null;
    mockAuthLoading = false;
  });

  it('N6a: anonymous shopper does not see DrawSearchAreaEntry (area-set-draw-area count === 0) while rscope=areas & rareas round-trip cleanly across mount', () => {
    mockAuthUser = null;
    mockAuthLoading = false;

    const wrapper = makeRouterWrapper([
      '/discover?city=bangalore&journey=area-first&rscope=areas&rareas=IN%7CKA%7CBengaluru%7CKoramangala',
    ]);

    function AnonScopeHarness() {
      const [urlState, urlActions] = useDiscoverUrlState();
      mockNavState.city = urlState.city;
      mockNavState.resultScope = urlState.resultScope;
      mockCommitResultScopeHandler = urlActions.commitResultScope;

      const isViewportScope = urlState.resultScope.active?.kind === 'VIEWPORT';
      const scopeCtrl = useResultScopeController({
        city: urlState.city,
        isViewportScope,
      });

      return (
        <div>
          <DrawSearchAreaEntry
            hasResidentialListingScope
            onDrawSearchArea={DEFAULT_SHELL_ACTIONS.startDrawSearchArea}
          />
          <ResultHeading
            multiAreaKeys={scopeCtrl.multiAreaKeys}
            resolvedAreasCity="bangalore"
            count={4}
            intentNoun="sale"
            onEditAreas={vi.fn()}
            onClearAreas={scopeCtrl.commands.clearAreas}
            onRemoveArea={vi.fn()}
            shell={DEFAULT_SHELL_ACTIONS}
            isViewportScope={isViewportScope}
            resultScopeKind={scopeCtrl.resultScopeKind}
            headingNoun="Properties"
            countNoun="properties"
            areaLabel="Koramangala"
            returnLabel={scopeCtrl.returnLabel}
            onReturn={scopeCtrl.commands.returnToPrevious}
            onRedrawPolygon={DEFAULT_SHELL_ACTIONS.startDrawSearchArea}
          />
        </div>
      );
    }

    render(<AnonScopeHarness />, { wrapper });

    expect(screen.queryByTestId('area-set-draw-area')).toBeNull();
    expect(screen.getByText('Properties in Koramangala')).toBeInTheDocument();
  });

  it('N13: cold-loading rscope=vp&rvp=12.9,77.5,13.1,77.7&rprev=areas:IN|KA|Bengaluru|Koramangala restores VIEWPORT scope and Return restores previous AREA_SET', () => {
    const wrapper = makeRouterWrapper([
      '/discover?city=bangalore&journey=area-first&rscope=vp&rvp=12.9,77.5,13.1,77.7&rprev=areas:IN%7CKA%7CBengaluru%7CKoramangala',
    ]);

    function ViewportScopeHarness() {
      const [urlState, urlActions] = useDiscoverUrlState();
      mockNavState.city = urlState.city;
      mockNavState.resultScope = urlState.resultScope;
      mockCommitResultScopeHandler = urlActions.commitResultScope;

      const isViewportScope = urlState.resultScope.active?.kind === 'VIEWPORT';
      const scopeCtrl = useResultScopeController({
        city: urlState.city,
        isViewportScope,
      });

      return (
        <div>
          <div data-testid="active-kind">{scopeCtrl.resultScopeKind}</div>
          <ResultHeading
            multiAreaKeys={scopeCtrl.multiAreaKeys}
            resolvedAreasCity="bangalore"
            count={4}
            intentNoun="sale"
            onEditAreas={vi.fn()}
            onClearAreas={scopeCtrl.commands.clearAreas}
            onRemoveArea={vi.fn()}
            shell={DEFAULT_SHELL_ACTIONS}
            isViewportScope={isViewportScope}
            resultScopeKind={scopeCtrl.resultScopeKind}
            headingNoun="Properties"
            countNoun="properties"
            areaLabel="Koramangala"
            returnLabel={scopeCtrl.returnLabel}
            onReturn={scopeCtrl.commands.returnToPrevious}
            onRedrawPolygon={DEFAULT_SHELL_ACTIONS.startDrawSearchArea}
          />
        </div>
      );
    }

    render(<ViewportScopeHarness />, { wrapper });

    expect(screen.getByTestId('active-kind')).toHaveTextContent('VIEWPORT');
    expect(screen.getByText('On screen right now')).toBeInTheDocument();
    expect(screen.getByTestId('area-panel-scope-bar-viewport')).toBeInTheDocument();

    const returnBtn = screen.getByTestId('area-panel-scope-bar-return');
    expect(returnBtn).toHaveTextContent('Return to Koramangala');

    // Click Return to Koramangala -> transitions active scope to AREA_SET (Koramangala)
    fireEvent.click(returnBtn);
    expect(screen.getByTestId('active-kind')).toHaveTextContent('AREA');
    expect(screen.getByText('Properties in Koramangala')).toBeInTheDocument();
  });

  it('N14: navigating from committed rscope=areas to /listing/:id and pressing browser Back preserves rscope=areas and rareas intact', () => {
    const wrapper = makeRouterWrapper([
      '/discover?city=bangalore&journey=area-first&node=a:IN%7CKA%7CBengaluru%7CKoramangala&rscope=areas&rareas=IN%7CKA%7CBengaluru%7CKoramangala',
    ]);

    function DiscoverRoute() {
      const [urlState] = useDiscoverUrlState();
      const navigate = useNavigate();
      const location = useLocation();
      return (
        <div>
          <div data-testid="discover-search">{location.search}</div>
          <div data-testid="discover-rscope">{urlState.resultScope.active?.kind ?? 'NONE'}</div>
          <button
            type="button"
            data-testid="open-listing"
            onClick={() => navigate('/listing/test-prop-1')}
          >
            Open listing
          </button>
        </div>
      );
    }

    function ListingRoute() {
      const navigate = useNavigate();
      return (
        <div>
          <div data-testid="listing-detail">Listing Detail Page</div>
          <button type="button" data-testid="go-back" onClick={() => navigate(-1)}>
            Back
          </button>
        </div>
      );
    }

    render(
      <Routes>
        <Route path="/discover" element={<DiscoverRoute />} />
        <Route path="/listing/:id" element={<ListingRoute />} />
      </Routes>,
      { wrapper },
    );

    expect(screen.getByTestId('discover-rscope')).toHaveTextContent('AREA_SET');
    fireEvent.click(screen.getByTestId('open-listing'));
    expect(screen.getByTestId('listing-detail')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('go-back'));
    expect(screen.getByTestId('discover-rscope')).toHaveTextContent('AREA_SET');
    expect(screen.getByTestId('discover-search').textContent).toContain('rscope=areas');
    expect(screen.getByTestId('discover-search').textContent).toContain('Koramangala');
  });

  it('L185 N16: committed POLYGON scope renders area-panel-scope-bar-polygon, Drawn area heading/summary copy, and zero legacy active-scope-chip-polygon', () => {
    const wrapper = makeRouterWrapper([
      '/discover?city=bangalore&journey=area-first&rscope=poly&rpoly=12.97:77.59;12.98:77.60;12.96:77.61&rprev=areas:IN%7CKA%7CBengaluru%7CKoramangala',
    ]);

    function PolygonScopeHarness() {
      const [urlState, urlActions] = useDiscoverUrlState();
      mockNavState.city = urlState.city;
      mockNavState.resultScope = urlState.resultScope;
      mockCommitResultScopeHandler = urlActions.commitResultScope;

      const isViewportScope = urlState.resultScope.active?.kind === 'VIEWPORT';
      const scopeCtrl = useResultScopeController({
        city: urlState.city,
        isViewportScope,
      });

      const mockListings: DiscoverCityListingItem[] = [
        {
          id: 'poly-prop-1',
          title: 'Koramangala Polygon Home',
          price: 9500000,
          propertyType: 'apartment',
        } as unknown as DiscoverCityListingItem,
      ];

      return (
        <div>
          <ResultHeading
            multiAreaKeys={scopeCtrl.multiAreaKeys}
            resolvedAreasCity="bangalore"
            count={2}
            intentNoun="sale"
            onEditAreas={vi.fn()}
            onClearAreas={scopeCtrl.commands.clearAreas}
            onRemoveArea={vi.fn()}
            shell={DEFAULT_SHELL_ACTIONS}
            isViewportScope={isViewportScope}
            resultScopeKind={scopeCtrl.resultScopeKind}
            headingNoun="Properties"
            countNoun="properties"
            areaLabel="Koramangala"
            returnLabel={scopeCtrl.returnLabel}
            onReturn={scopeCtrl.commands.returnToPrevious}
            onRedrawPolygon={DEFAULT_SHELL_ACTIONS.startDrawSearchArea}
          />
          <ListingsBody
            isFetching={false}
            isInitialLoading={false}
            areaListings={mockListings}
            hasPropertyFilters={false}
            searchQuery=""
            listingCount={2}
            areaLabel="Koramangala"
            resolvedCityLabel="Bangalore"
            commercialFromFilters={false}
            intentNoun="sale"
            multiAreaKeys={null}
            fallbackAreaKey="IN|KA|Bengaluru|Koramangala"
            resolvedAreasCity="bangalore"
            filters={{}}
            activeScope={scopeCtrl.activeScope!}
            resultScopeKind={scopeCtrl.resultScopeKind}
            areaResultSummaryText="2 verified properties for sale in your drawn area"
            count={2}
            isViewportScope={false}
            onNavigateToListing={vi.fn()}
            selectedListingId={null}
            hoveredListingId={null}
            registerCardRef={() => () => {}}
          />
        </div>
      );
    }

    const { container } = render(<PolygonScopeHarness />, { wrapper });

    expect(screen.getByText('Result scope — Drawn area')).toBeInTheDocument();
    expect(screen.getByText('Properties in your drawn area')).toBeInTheDocument();
    expect(screen.getByTestId('area-panel-scope-bar-polygon')).toBeInTheDocument();
    expect(screen.getByTestId('area-panel-scope-bar-redraw')).toBeInTheDocument();
    expect(screen.getByTestId('area-panel-scope-bar-return')).toHaveTextContent(
      'Return to Koramangala',
    );
    expect(screen.getByTestId('area-result-summary-text')).toHaveTextContent(
      '2 verified properties for sale in your drawn area',
    );
    // Floating active-scope-chip-polygon was retired in #2478 in favour of area-panel-scope-bar-polygon
    expect(container.querySelector('[data-testid="active-scope-chip-polygon"]')).toBeNull();
  });
});

describe('Issue #2859 trim rows — L184 AreaSetDraftContext & Map candidate callout parity (issue #2456)', () => {
  beforeEach(() => {
    mockNavState = {
      city: 'bangalore',
      scope: null,
      intent: 'buy',
      journey: 'area-first',
      areaKey: 'IN|KA|Bengaluru|RR Nagar',
      filters: {},
      resultScope: {
        active: { kind: 'AREA_SET', areaKeys: ['IN|KA|Bengaluru|RR Nagar'] },
        previous: null,
      },
    };
    mockNearbyCandidates = [
      {
        areaKey: 'IN|KA|Bengaluru|Kengeri',
        area: 'Kengeri',
        distanceKm: 4.2,
        eligibleListingCount: 5,
        schoolCount: 2,
        geoCenterLat: 12.908,
        geoCenterLon: 77.485,
      } as unknown as NearbyAreaCandidate,
      {
        areaKey: 'IN|KA|Bengaluru|Banashankari',
        area: 'Banashankari',
        distanceKm: 6.1,
        eligibleListingCount: 9,
        schoolCount: 4,
        geoCenterLat: 12.925,
        geoCenterLon: 77.546,
      } as unknown as NearbyAreaCandidate,
    ];
  });

  it('maintains 1:1 parity between nearby candidates and map callout icons, renders non-interactive callout markup, promotes Added candidate to draft member marker, and restores on resetToCommitted', () => {
    function DraftMapParityHarness() {
      const { view, commands, draftMemberStatsByAreaKey, data } = useAreaSetDraftContext();
      const draftKeySet = new Set(view.draftAreaKeys);
      const remainingCandidates = (data?.candidates ?? []).filter(
        (c) => !draftKeySet.has(c.areaKey),
      );

      const callouts: AreaSetCandidateCallout[] = remainingCandidates.map((c) => ({
        areaKey: c.areaKey,
        label: c.area,
        lat: c.geoCenterLat!,
        lon: c.geoCenterLon!,
        count: c.eligibleListingCount,
      }));

      const members: AreaSetDraftMemberMarker[] = view.draftAreaKeys.map((key) => {
        const stats = draftMemberStatsByAreaKey[key];
        return {
          areaKey: key,
          label: key.split('|').pop() ?? key,
          lat: 12.9275,
          lon: 77.515,
          count: stats?.eligibleListingCount ?? 6,
        };
      });

      return (
        <div>
          <div data-testid="panel-candidates">
            {remainingCandidates.map((c) => (
              <button
                key={c.areaKey}
                type="button"
                data-testid={`panel-add-${c.areaKey}`}
                onClick={() =>
                  commands.addCandidate({
                    areaKey: c.areaKey,
                    eligibleListingCount: c.eligibleListingCount,
                    schoolCount: 2,
                  })
                }
              >
                {c.area} ({c.eligibleListingCount})
              </button>
            ))}
          </div>
          <div
            data-testid="map-callouts"
            dangerouslySetInnerHTML={{
              __html: callouts
                .map((c) => makeAreaSetCandidateCalloutIcon(c).options.html ?? '')
                .join(''),
            }}
          />
          <div
            data-testid="map-draft-members"
            dangerouslySetInnerHTML={{
              __html: members
                .map((m) => makeAreaSetDraftMemberIcon(m).options.html ?? '')
                .join(''),
            }}
          />
          <button
            type="button"
            data-testid="cancel-draft"
            onClick={() => commands.resetToCommitted()}
          >
            Cancel
          </button>
        </div>
      );
    }

    const { container } = render(
      <AreaSetDraftProvider>
        <DraftMapParityHarness />
      </AreaSetDraftProvider>,
    );

    // 1. Initial state: 2 nearby candidates in panel and 2 callouts on map; 1 draft member (RR Nagar)
    const initialCallouts = container.querySelectorAll('[data-testid="area-set-candidate-callout"]');
    expect(initialCallouts).toHaveLength(2);
    expect(initialCallouts[0]).toHaveAttribute('data-area-key', 'IN|KA|Bengaluru|Kengeri');
    expect(initialCallouts[0]).toHaveAttribute('aria-hidden', 'true');
    expect(initialCallouts[0].getAttribute('role')).toBeNull();
    expect(initialCallouts[0].getAttribute('tabindex')).toBeNull();
    expect(initialCallouts[0].getAttribute('style')).toContain('pointer-events:none');
    expect(initialCallouts[0]).toHaveTextContent('Kengeri');
    expect(initialCallouts[0]).toHaveTextContent('5');

    const initialMembers = container.querySelectorAll(
      '[data-testid="area-set-draft-member-marker"]',
    );
    expect(initialMembers).toHaveLength(1);
    expect(initialMembers[0]).toHaveAttribute('data-node-key', 'IN|KA|Bengaluru|RR Nagar');
    expect(initialMembers[0]).toHaveAttribute('data-selected', 'true');
    expect(initialMembers[0]).toHaveAttribute('data-interactive', 'false');
    expect(initialMembers[0]).toHaveTextContent('View homes');

    // 2. Click Add on Kengeri -> Kengeri moves from callouts to draft member markers
    fireEvent.click(screen.getByTestId('panel-add-IN|KA|Bengaluru|Kengeri'));

    const afterAddCallouts = container.querySelectorAll(
      '[data-testid="area-set-candidate-callout"]',
    );
    expect(afterAddCallouts).toHaveLength(1);
    expect(afterAddCallouts[0]).toHaveAttribute('data-area-key', 'IN|KA|Bengaluru|Banashankari');

    const afterAddMembers = container.querySelectorAll(
      '[data-testid="area-set-draft-member-marker"]',
    );
    expect(afterAddMembers).toHaveLength(2);
    expect(afterAddMembers[1]).toHaveAttribute('data-node-key', 'IN|KA|Bengaluru|Kengeri');
    expect(afterAddMembers[1]).toHaveTextContent('Kengeri');
    expect(afterAddMembers[1]).toHaveTextContent('5');
    expect(afterAddMembers[1]).toHaveTextContent('LISTINGS');

    // 3. Cancel / resetToCommitted -> reverts back to 1 committed member and 2 callouts
    fireEvent.click(screen.getByTestId('cancel-draft'));
    expect(container.querySelectorAll('[data-testid="area-set-candidate-callout"]')).toHaveLength(
      2,
    );
    expect(
      container.querySelectorAll('[data-testid="area-set-draft-member-marker"]'),
    ).toHaveLength(1);
  });
});
