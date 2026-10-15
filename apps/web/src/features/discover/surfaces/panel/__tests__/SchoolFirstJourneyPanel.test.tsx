/**
 * Issue #2216 — SchoolFirstJourneyPanel's `onSelectAreaKey` else/fallback
 * branch (the "area not yet loaded in discoverAreas" path) previously wrote
 * the legacy `urlActions.selectArea(areaKey)` param. It now reverse-derives
 * the AREA child's `nodeKey` off the same `areasNavigationJourney.node.children`
 * tree the map-side controller (`useDiscoverOverviewNavigationController`)
 * already uses, and writes the canonical journey-preserving
 * `urlActions.goToNodeAndClearSchoolSelection(nodeKey)` instead — mirroring
 * #2203/#2211's DiscoverControlBar fix.
 *
 * This suite was previously non-existent — the matched-area (if) branch was
 * exercised only indirectly via higher-level surface tests. Both branches of
 * `onSelectAreaKey` are covered here directly against the real component.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import type { SchoolsNavigationJourneyPanelProps } from '@/features/discover/views/SchoolsNavigationJourneyPanel';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';

// The shell mounts DiscoverControlBar (desktop-only), which reads
// useDiscoverNav()/DiscoverProvider — irrelevant to this suite's scope
// (onSelectAreaKey routing only), so it is stubbed out like its sibling
// leaf below.
vi.mock('../DiscoverJourneyPanelShell', () => ({
  DiscoverJourneyPanelShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/features/discover/views/SchoolsNavigationJourneyPanel', () => ({
  SchoolsNavigationJourneyPanel: (props: SchoolsNavigationJourneyPanelProps) => (
    <div>
      <button onClick={() => props.onSelectAreaKey('a:not-loaded')}>select-not-loaded</button>
      <button onClick={() => props.onSelectAreaKey('a:loaded')}>select-loaded</button>
      <button onClick={() => props.onSelectAreaKey('a:unresolvable')}>select-unresolvable</button>
    </div>
  ),
}));

import { SchoolFirstJourneyPanel } from '../SchoolFirstJourneyPanel';
import type {
  SchoolFirstJourneyPanelView,
  SchoolFirstJourneyPanelCommands,
} from '../SchoolFirstJourneyPanel';

function makeJourney(
  children: Array<{ nodeKey: string; areaKey: string | null }>,
): UseAreasNavigationJourneyResult {
  return {
    isLoading: false,
    isError: false,
    error: null,
    node: {
      nodeKey: 'n:root',
      children: children.map((c) => ({ ...c, nodeType: 'AREA' })),
    } as never,
    levelKind: 'areas',
    children: [],
    wasTruncated: false,
    resolutionNotice: null,
    nodeCount: null,
    selectNode: vi.fn(),
    refetch: vi.fn(),
    historyAdjacencyLog: [],
  } as unknown as UseAreasNavigationJourneyResult;
}

function makeProps(overrides: {
  discoverAreas?: AreaPoint[];
  areasNavigationJourney?: UseAreasNavigationJourneyResult;
  handleAreaSelect?: ReturnType<typeof vi.fn>;
  selectArea?: ReturnType<typeof vi.fn>;
  goToNodeAndClearSchoolSelection?: ReturnType<typeof vi.fn>;
}) {
  const handleAreaSelect = overrides.handleAreaSelect ?? vi.fn();
  const selectArea = overrides.selectArea ?? vi.fn();
  const goToNodeAndClearSchoolSelection = overrides.goToNodeAndClearSchoolSelection ?? vi.fn();

  const view: SchoolFirstJourneyPanelView = {
    pageContext: { isMobileShell: false, hostsHeaderControls: false, headerHostsJourneyTabs: false },
    routing: { city: 'bangalore' },
    geography: { discoverAreas: overrides.discoverAreas ?? [] },
    navigation: {
      areasNavigationJourney: overrides.areasNavigationJourney ?? makeJourney([]),
      hoveredNavigationNodeKey: null,
      focusedClusterMemberAreaKeys: null,
    },
    interaction: { prefersReducedMotion: false },
  };

  const commands: SchoolFirstJourneyPanelCommands = {
    pageContext: {
      actions: {
        selectArea,
        buildNodeHref: vi.fn(),
        goToNodeAndClearSchoolSelection,
      } as never,
    },
    geography: { handleAreaSelect },
    navigation: {
      onNavigationNodeHoverChange: vi.fn(),
      onClusterFocusChange: vi.fn(),
      selectJourney: vi.fn(),
    },
  };

  return { view, commands, handleAreaSelect, selectArea, goToNodeAndClearSchoolSelection };
}

describe('SchoolFirstJourneyPanel onSelectAreaKey', () => {
  it('matched area (already in discoverAreas) routes through handleAreaSelect, not any URL-writer action', async () => {
    const user = userEvent.setup();
    const match = { areaKey: 'a:loaded' } as AreaPoint;
    const { view, commands, handleAreaSelect, selectArea, goToNodeAndClearSchoolSelection } =
      makeProps({ discoverAreas: [match] });

    render(<SchoolFirstJourneyPanel view={view} commands={commands} />);
    await user.click(screen.getByText('select-loaded'));

    expect(handleAreaSelect).toHaveBeenCalledWith(match);
    expect(selectArea).not.toHaveBeenCalled();
    expect(goToNodeAndClearSchoolSelection).not.toHaveBeenCalled();
  });

  it('unmatched area (not yet in discoverAreas) falls back to goToNodeAndClearSchoolSelection with the reverse-derived nodeKey', async () => {
    const user = userEvent.setup();
    const journey = makeJourney([{ nodeKey: 'n:not-loaded', areaKey: 'a:not-loaded' }]);
    const { view, commands, handleAreaSelect, selectArea, goToNodeAndClearSchoolSelection } =
      makeProps({ discoverAreas: [], areasNavigationJourney: journey });

    render(<SchoolFirstJourneyPanel view={view} commands={commands} />);
    await user.click(screen.getByText('select-not-loaded'));

    expect(goToNodeAndClearSchoolSelection).toHaveBeenCalledWith('n:not-loaded');
    expect(selectArea).not.toHaveBeenCalled();
    expect(handleAreaSelect).not.toHaveBeenCalled();
  });

  it('fail-closed no-op: areaKey with no corresponding node.children entry never writes any URL action, legacy or canonical', async () => {
    const user = userEvent.setup();
    // journey tree has no child matching 'a:unresolvable' at all.
    const journey = makeJourney([{ nodeKey: 'n:other', areaKey: 'a:other' }]);
    const { view, commands, handleAreaSelect, selectArea, goToNodeAndClearSchoolSelection } =
      makeProps({
        discoverAreas: [],
        areasNavigationJourney: journey,
      });

    render(<SchoolFirstJourneyPanel view={view} commands={commands} />);
    await user.click(screen.getByText('select-unresolvable'));

    expect(selectArea).not.toHaveBeenCalled();
    expect(goToNodeAndClearSchoolSelection).not.toHaveBeenCalled();
    expect(handleAreaSelect).not.toHaveBeenCalled();
  });
});

// #2750 PR-4 — retires e2e issue-2142-hierarchy-back-direction-root (school-first arm, spec L60-75).
// The suite above stubs SchoolsNavigationJourneyPanel, so it cannot see whether the school-first panel
// MOUNTS the hierarchy Back control. This `it` swaps in the REAL panel (file-scoped mocks above stay
// for every other `it`) and queries ONLY inside the school-first panel container, because
// `areas-hierarchy-back` is the same testid the Areas-journey panel renders.
describe('SchoolFirstJourneyPanel — hierarchy Back control (#2142)', () => {
  it('a top-level DIRECTION with empty ancestry mounts "Back to Bangalore" inside the school-first panel; the city root mounts none', async () => {
    vi.resetModules();
    vi.doUnmock('@/features/discover/views/SchoolsNavigationJourneyPanel');
    vi.doMock('@/features/discover/context/useDiscoverContext', () => ({
      useDiscoverActions: () => ({}),
      useDiscoverViewport: () => null,
    }));
    vi.doMock('@/hooks/useSchoolSearch', () => ({
      useSchoolSearch: () => ({ isLoading: false, data: [] }),
    }));
    const { SchoolFirstJourneyPanel: RealPanel } = await import('../SchoolFirstJourneyPanel');

    const directionJourney = {
      ...makeJourney([]),
      node: {
        nodeKey: 'd:central',
        nodeType: 'DIRECTION',
        displayLabel: 'Central Bangalore',
        depth: 0,
        // The live server shape for a top-level Direction: EMPTY ancestry (it is NOT the city root).
        ancestry: [],
        nextLevelType: 'AREA',
        children: [],
        revisionId: 1,
      } as never,
    } as UseAreasNavigationJourneyResult;
    const rootJourney = {
      ...makeJourney([]),
      node: {
        nodeKey: 'root',
        nodeType: 'ROOT',
        displayLabel: 'Bangalore',
        depth: -1,
        ancestry: [],
        nextLevelType: 'DIRECTION',
        children: [],
        revisionId: 1,
      } as never,
    } as UseAreasNavigationJourneyResult;

    const direction = makeProps({ areasNavigationJourney: directionJourney });
    direction.commands.pageContext.actions.buildNodeHref = vi.fn((k: string) => `/discover?node=${k}`);
    const { unmount } = render(
      <MemoryRouter>
        <RealPanel view={direction.view} commands={direction.commands} />
      </MemoryRouter>,
    );

    const panel = screen.getByTestId('schools-journey-panel');
    const back = within(panel).getByTestId('areas-hierarchy-back');
    expect(back).toHaveTextContent('Back to Bangalore');
    expect(back).toHaveAttribute('href', '/discover?node=root');
    unmount();

    // Control arm: the city root has no parent, so the same panel must mount NO Back control there.
    const root = makeProps({ areasNavigationJourney: rootJourney });
    root.commands.pageContext.actions.buildNodeHref = vi.fn((k: string) => `/discover?node=${k}`);
    render(
      <MemoryRouter>
        <RealPanel view={root.view} commands={root.commands} />
      </MemoryRouter>,
    );
    const rootPanel = screen.getByTestId('schools-journey-panel');
    expect(within(rootPanel).queryByTestId('areas-hierarchy-back')).toBeNull();
  });
});
