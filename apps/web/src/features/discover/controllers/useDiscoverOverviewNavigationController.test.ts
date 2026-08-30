import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDiscoverOverviewNavigationController } from './useDiscoverOverviewNavigationController';
import type { UseDiscoverOverviewNavigationControllerParams } from './useDiscoverOverviewNavigationController';

const SCOPE_NAMESPACES = { regionKeys: new Set<string>(), groupSlugs: new Set<string>() };

function makeActions() {
  return {
    setRegionWithMaxKm: vi.fn(),
    setScope: vi.fn(),
    selectGroup: vi.fn(),
    selectArea: vi.fn(),
    enterSchoolsJourney: vi.fn(),
    goToNode: vi.fn(),
    goToNodeAndClearSchoolSelection: vi.fn(),
  };
}

function baseParams(
  overrides: Partial<UseDiscoverOverviewNavigationControllerParams> = {},
): UseDiscoverOverviewNavigationControllerParams {
  return {
    isTopGroupedAgri: false,
    corridorGroups: [],
    scopeNamespaces: SCOPE_NAMESPACES,
    mapLayerKind: 'all-areas' as never,
    armRegionSelect: vi.fn(),
    handleAreaClick: vi.fn(),
    journey: 'area-first',
    areasNavigationJourney: { node: null, children: [], isLoading: false, error: null, selectNode: vi.fn() } as never,
    discoverAreas: [],
    handleAreaSelect: vi.fn(),
    actions: makeActions() as never,
    ...overrides,
  };
}

/**
 * Issue #2142 (correction pass) — the two handleOverviewAreaClick assertions
 * are inherited verbatim from the deleted
 * useDiscoverMapPresentationController.test.ts. The handleCanonicalNodeSelect /
 * activeAreasNavigationJourney assertions are NEW: that logic previously lived
 * inline on MapDiscovery.tsx with no controller-level test of its own.
 */
describe('useDiscoverOverviewNavigationController', () => {
  it('handleOverviewAreaClick resolves scope via the SAME scopeNamespaces (not a reconstructed copy) and routes macro-region bubbles through setScope', () => {
    const regionKeys = new Set(['north']);
    const scopeNamespaces = { regionKeys, groupSlugs: new Set<string>() };
    const actions = makeActions();
    const { result } = renderHook(() =>
      useDiscoverOverviewNavigationController(
        baseParams({ scopeNamespaces, actions: actions as never, mapLayerKind: 'macro-region-bubbles' as never }),
      ),
    );
    act(() => result.current.handleOverviewAreaClick({ areaKey: 'north' } as never));
    expect(actions.setScope).toHaveBeenCalledWith('north');
  });

  it('handleOverviewAreaClick falls back to handleAreaClick for a plain area (no scope match)', () => {
    const handleAreaClick = vi.fn();
    const area = { areaKey: 'IN|KA|Udupi|Manipal' } as never;
    const { result } = renderHook(() =>
      useDiscoverOverviewNavigationController(baseParams({ handleAreaClick })),
    );
    act(() => result.current.handleOverviewAreaClick(area));
    expect(handleAreaClick).toHaveBeenCalledWith(area);
  });

  it('handleOverviewAreaClick routes an agri corridor direction through setRegionWithMaxKm before any scope resolution', () => {
    const actions = makeActions();
    const { result } = renderHook(() =>
      useDiscoverOverviewNavigationController(
        baseParams({
          isTopGroupedAgri: true,
          corridorGroups: [{ directionCode: 'd:north' }] as never,
          actions: actions as never,
        }),
      ),
    );
    act(() => result.current.handleOverviewAreaClick({ areaKey: 'd:north' } as never));
    expect(actions.setRegionWithMaxKm).toHaveBeenCalledWith('d:north');
    expect(actions.setScope).not.toHaveBeenCalled();
  });

  // ── Schools-canonical-geography (#2124) selection-routing equivalence ──
  it('selectNode for a non-school-first journey delegates straight to actions.goToNode', () => {
    const actions = makeActions();
    const { result } = renderHook(() =>
      useDiscoverOverviewNavigationController(baseParams({ actions: actions as never })),
    );
    act(() => result.current.activeAreasNavigationJourney.selectNode('n:1'));
    expect(actions.goToNode).toHaveBeenCalledWith('n:1');
  });

  it('school-first + AREA child present in discoverAreas takes the SAME path as the panel row (handleAreaSelect)', () => {
    const actions = makeActions();
    const handleAreaSelect = vi.fn();
    const match = { areaKey: 'a:1' };
    const { result } = renderHook(() =>
      useDiscoverOverviewNavigationController(
        baseParams({
          journey: 'school-first',
          areasNavigationJourney: {
            node: { children: [{ nodeKey: 'n:1', nodeType: 'AREA', areaKey: 'a:1' }] },
            children: [],
            isLoading: false,
            error: null,
            selectNode: vi.fn(),
          } as never,
          discoverAreas: [match] as never,
          handleAreaSelect,
          actions: actions as never,
        }),
      ),
    );
    act(() => result.current.activeAreasNavigationJourney.selectNode('n:1'));
    expect(handleAreaSelect).toHaveBeenCalledWith(match);
    expect(actions.selectArea).not.toHaveBeenCalled();
  });

  // Issue #2216 — the not-found-in-discoverAreas fallback now writes the
  // canonical journey-preserving node= param (goToNodeAndClearSchoolSelection)
  // instead of the legacy areaKey= param (selectArea), mirroring #2203/#2211's
  // DiscoverControlBar fix.
  it('school-first + AREA child NOT yet in discoverAreas falls back to actions.goToNodeAndClearSchoolSelection (journey-preserving canonical write)', () => {
    const actions = makeActions();
    const { result } = renderHook(() =>
      useDiscoverOverviewNavigationController(
        baseParams({
          journey: 'school-first',
          areasNavigationJourney: {
            node: { children: [{ nodeKey: 'n:1', nodeType: 'AREA', areaKey: 'a:1' }] },
            children: [],
            isLoading: false,
            error: null,
            selectNode: vi.fn(),
          } as never,
          discoverAreas: [],
          actions: actions as never,
        }),
      ),
    );
    act(() => result.current.activeAreasNavigationJourney.selectNode('n:1'));
    expect(actions.goToNodeAndClearSchoolSelection).toHaveBeenCalledWith('n:1');
    expect(actions.selectArea).not.toHaveBeenCalled();
  });

  it('school-first + non-AREA child enters the schools journey at that node', () => {
    const actions = makeActions();
    const { result } = renderHook(() =>
      useDiscoverOverviewNavigationController(
        baseParams({
          journey: 'school-first',
          areasNavigationJourney: {
            node: { children: [{ nodeKey: 'n:1', nodeType: 'GROUP', areaKey: null }] },
            children: [],
            isLoading: false,
            error: null,
            selectNode: vi.fn(),
          } as never,
          actions: actions as never,
        }),
      ),
    );
    act(() => result.current.activeAreasNavigationJourney.selectNode('n:1'));
    expect(actions.enterSchoolsJourney).toHaveBeenCalledWith('n:1');
  });

  it('activeAreasNavigationJourney preserves every other field of the source journey by reference', () => {
    const source = {
      node: { nodeKey: 'n:root' },
      children: [{ nodeKey: 'n:1' }],
      isLoading: true,
      error: null,
      selectNode: vi.fn(),
    } as never;
    const { result } = renderHook(() =>
      useDiscoverOverviewNavigationController(baseParams({ areasNavigationJourney: source })),
    );
    expect(result.current.activeAreasNavigationJourney.node).toBe(
      (source as unknown as { node: unknown }).node,
    );
    expect(result.current.activeAreasNavigationJourney.children).toBe(
      (source as unknown as { children: unknown }).children,
    );
    // ...but selectNode is the intercepting override, never the source's own.
    expect(result.current.activeAreasNavigationJourney.selectNode).not.toBe(
      (source as unknown as { selectNode: unknown }).selectNode,
    );
    expect(result.current.activeAreasNavigationJourney.selectNode).toBe(
      result.current.handleCanonicalNodeSelect,
    );
  });
});
