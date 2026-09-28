/**
 * Issue #2660 (C5) — the production mapping from `AreaFirstJourneyPanel`'s
 * own slices onto `DiscoverAreasJourneyPanel`'s `{view, commands}` contract.
 * The flat call it replaced passed 45 values; this proves every one still
 * reaches the panel as the SAME reference (grouping only, no re-derivation,
 * no copied query/URL state), and that the committed POLYGON/VIEWPORT signals
 * converge into the ONE discriminated result source.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AreaFirstJourneyPanel } from '../AreaFirstJourneyPanel';
import type { AreaFirstJourneyPanelCommands, AreaFirstJourneyPanelView } from '../AreaFirstJourneyPanel';
import type { DiscoverAreasJourneyPanelProps } from '@/features/discover/views/DiscoverAreasJourneyPanel';
import { makeJourney, makeListing } from '@/features/discover/areas-journey/testing/areasJourneyPanelTestAdapter';

const captured = vi.hoisted(() => ({ props: null as unknown }));
vi.mock('@/features/discover/views/DiscoverAreasJourneyPanel', () => ({
  DiscoverAreasJourneyPanel: (props: unknown) => {
    captured.props = props;
    return null;
  },
}));
vi.mock('../DiscoverJourneyPanelShell', () => ({
  DiscoverJourneyPanelShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const journey = makeJourney();
const areaListings = [makeListing({ id: 'area-1' })];
const polygonListings = [makeListing({ id: 'poly-1' })];
const schools = [{ id: 's1' }];
const schoolListings = [makeListing({ id: 'school-1' })];
const filters = { bedrooms: [2] };
const selectedSchool = { id: 's1' };
const fn = () => vi.fn();
const schoolsQuery = { isLoading: true, isError: false, isFetching: true, refetch: fn() };

const geography = {
  areaListings,
  isLoadingAreaListings: false,
  isErrorAreaListings: true,
  isFetchingAreaListings: true,
  selectedArea: { areaKey: 'IN|KA|Bangalore|Manipal' },
  isAnonViewport: false,
  anonViewportListings: [],
  anonViewportListingsLoading: false,
  isAuthViewport: false,
  authViewportListings: [],
  authViewportListingsLoading: false,
  isPolygonScope: true,
  polygonListings,
  polygonListingsLoading: true,
  isErrorPolygonListings: false,
  refetchPolygonListings: fn(),
};

// The renderer's view/commands types are Picks over the full page slices; this
// fixture supplies only the fields AreaFirstJourneyPanel reads, so it is cast
// once here rather than building every unrelated page field.
const view = {
  pageContext: { nav: { nodeListings: true, radiusKm: 3 }, isMobileShell: false },
  routing: { city: 'bangalore' },
  navigation: {
    areasNavigationJourney: journey,
    hoveredNavigationNodeKey: 'd:hover',
    focusedClusterMemberAreaKeys: ['area-9'],
  },
  geography,
  filters: { filters },
  schools: { selectedSchool, schools, schoolsQuery, schoolListings },
  results: { listingDataLoading: true },
  interaction: { prefersReducedMotion: false },
} as unknown as AreaFirstJourneyPanelView;

const commands = {
  pageContext: {
    actions: { clearNodeListings: fn(), enterNodeListings: fn(), buildNodeHref: fn(), enterSchoolPicking: fn() },
  },
  navigation: {
    onNavigationNodeHoverChange: fn(),
    onClusterFocusChange: fn(),
    onSelectedListingPreviewChange: fn(),
    journeyCommands: { changeRadius: fn(), clearSchool: fn(), selectSchoolById: fn(), startOver: fn() },
    selectJourney: fn(),
  },
  filters: { handleFiltersChange: fn() },
  geography: { handleAreaFirstBack: fn(), refetchAreaListings: fn(), handleRedrawPolygon: fn() },
} as unknown as AreaFirstJourneyPanelCommands;

function panelProps(): DiscoverAreasJourneyPanelProps {
  render(<AreaFirstJourneyPanel view={view} commands={commands} />);
  return captured.props as DiscoverAreasJourneyPanelProps;
}

beforeEach(() => {
  captured.props = null;
});

describe('AreaFirstJourneyPanel -> DiscoverAreasJourneyPanel {view, commands} mapping (Issue #2660)', () => {
  it('view groups carry the SAME references the flat call passed', () => {
    const p = panelProps();
    expect(p.view.hierarchy.journey).toBe(journey);
    expect(p.view.hierarchy.hoveredNodeKey).toBe('d:hover');
    expect(p.view.hierarchy.isNodeListingsActive).toBe(true);
    expect(p.view.cluster.focusedMemberAreaKeys).toBe(view.navigation.focusedClusterMemberAreaKeys);
    expect(p.view.results.filters).toBe(filters);
    expect(p.view.schools.inArea).toEqual({ data: schools, loading: true, fetching: true, error: false });
    expect(p.view.schools.inArea.data).toBe(schools);
    expect(p.view.schools.selected).toBe(selectedSchool);
    expect(p.view.schools.selectedListings.data).toBe(schoolListings);
    expect(p.view.schools.selectedListings.loading).toBe(true);
    expect(p.view.schools.radiusKm).toBe(3);
    expect(p.view.city.label).toBe('Bangalore');
  });

  it('the map AREA_SET base is keyed to the page\'s effective selected area (the #2353 identity guard input)', () => {
    const { areaBase } = panelProps().view.results.source;
    expect(areaBase).toEqual({
      listings: areaListings,
      areaKey: 'IN|KA|Bangalore|Manipal',
      loading: false,
      fetching: true,
      error: true,
      retry: commands.geography.refetchAreaListings,
    });
    expect(areaBase?.listings).toBe(areaListings);
  });

  it('the committed POLYGON signals converge into ONE discriminated scope carrying only polygon data', () => {
    expect(panelProps().view.results.source.scope).toEqual({
      kind: 'polygon',
      listings: polygonListings,
      loading: true,
      error: false,
      retry: geography.refetchPolygonListings,
    });
  });

  it('command groups carry the SAME function references (no wrappers, no second handler)', () => {
    const c = panelProps().commands;
    const { actions } = commands.pageContext;
    const { journeyCommands } = commands.navigation;
    expect(c.hierarchy.selectNode).toBe(journey.selectNode);
    expect(c.hierarchy.retry).toBe(journey.refetch);
    expect(c.hierarchy.hoverNode).toBe(commands.navigation.onNavigationNodeHoverChange);
    expect(c.cluster.changeFocus).toBe(commands.navigation.onClusterFocusChange);
    expect(c.results.changeFilters).toBe(commands.filters.handleFiltersChange);
    expect(c.results.reportSelectedListingPreview).toBe(commands.navigation.onSelectedListingPreviewChange);
    expect(c.results.redrawPolygon).toBe(commands.geography.handleRedrawPolygon);
    expect(c.schools.enterPicking).toBe(actions.enterSchoolPicking);
    expect(c.schools.select).toBe(journeyCommands.selectSchoolById);
    expect(c.schools.clear).toBe(journeyCommands.clearSchool);
    expect(c.schools.retry).toBe(schoolsQuery.refetch);
    expect(c.schools.changeRadius).toBe(journeyCommands.changeRadius);
    expect(c.schools.back).toBe(commands.geography.handleAreaFirstBack);
    expect(c.navigation.buildNodeHref).toBe(actions.buildNodeHref);
    expect(c.navigation.browseListings).toBe(actions.enterNodeListings);
    expect(c.navigation.clearNodeListings).toBe(actions.clearNodeListings);
    expect(c.navigation.startOver).toBe(journeyCommands.startOver);
  });
});
