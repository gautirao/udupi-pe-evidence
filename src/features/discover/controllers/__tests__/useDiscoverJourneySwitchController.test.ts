import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { DiscoverUrlActions } from '@/hooks/useDiscoverUrlState';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { DiscoverNavContextValue } from '@/features/discover/context/types';

/**
 * Issue #2142 SOLID follow-up (commit 2) — `handleSelectJourney` moved out of
 * `surfaces/DiscoverPanelSurface.tsx` into this controller. These assertions
 * are PORTED from that surface's suite (the AC2/AC3 plain-PUSH test and the
 * #2124 "server-supplied areaKey, never a value parsed from node=" test) plus
 * the conversion arms that previously had only real-browser E2E coverage
 * (`issue-1956-pr6-journey-switch-conversion.spec.ts`). No new behaviour is
 * asserted — every branch below existed verbatim in the surface.
 *
 * The `useMutation`-backed resolver is mocked (rather than standing up a real
 * QueryClient + backend) exactly as the surface suite used to mock it; the
 * mock's `mutate` captures the options object so the success/error callbacks
 * can be invoked directly, which is what makes the two conversion outcomes
 * assertable at all.
 */
const mockMutate = vi.hoisted(() => vi.fn());
const mockResolver = vi.hoisted(() => ({ mutate: mockMutate, isPending: false }));
vi.mock('@/features/discover/navigation/useDiscoverAreaNavigationPath', () => ({
  useDiscoverAreaNavigationPathResolver: () => mockResolver,
}));

import { useDiscoverJourneySwitchController } from '../useDiscoverJourneySwitchController';

const AREA_LEAF_NODE = {
  nodeKey: 'a:IN|KA|Bangalore|AlsoWrongNodeKeyDerivedArea',
  nodeType: 'AREA' as const,
  displayLabel: 'Manipal',
  depth: 2,
  regionKey: 'east',
  ancestry: [],
  nextLevelType: 'LISTINGS' as const,
  children: [],
  revisionId: 1,
  bounds: null,
  descendantAreaKeys: null,
  areaKey: 'IN|KA|Bangalore|Manipal',
};

function makeJourney(
  node: UseAreasNavigationJourneyResult['node'] = null,
): UseAreasNavigationJourneyResult {
  return { node, children: [], selectNode: vi.fn() } as unknown as UseAreasNavigationJourneyResult;
}

function makeNav(overrides: Partial<DiscoverNavContextValue> = {}): DiscoverNavContextValue {
  return {
    city: 'bangalore',
    areaKey: null,
    filters: {},
    schoolId: null,
    radiusKm: null,
    q: '',
    journey: null,
    groupId: null,
    selectedGroup: null,
    intent: 'buy',
    scope: null,
    ...overrides,
  } as unknown as DiscoverNavContextValue;
}

function makeActions() {
  return {
    setJourney: vi.fn(),
    enterAreasJourney: vi.fn(),
    enterSchoolsJourneyAtArea: vi.fn(),
  } as unknown as DiscoverUrlActions & {
    setJourney: ReturnType<typeof vi.fn>;
    enterAreasJourney: ReturnType<typeof vi.fn>;
    enterSchoolsJourneyAtArea: ReturnType<typeof vi.fn>;
  };
}

function setup(params: {
  nav?: Partial<DiscoverNavContextValue>;
  node?: UseAreasNavigationJourneyResult['node'];
}) {
  const actions = makeActions();
  const toast = vi.fn();
  const { result } = renderHook(() =>
    useDiscoverJourneySwitchController({
      nav: makeNav(params.nav),
      actions,
      areasNavigationJourney: makeJourney(params.node ?? null),
      toast: toast as unknown as Parameters<
        typeof useDiscoverJourneySwitchController
      >[0]['toast'],
    }),
  );
  return { select: result.current.handleSelectJourney, actions, toast };
}

beforeEach(() => {
  mockMutate.mockReset();
  mockResolver.isPending = false;
});

describe('useDiscoverJourneySwitchController — handleSelectJourney', () => {
  it('AC2/AC3 — with no legacy groupId/areaKey context, takes the plain setJourney PUSH arm (the same writer every other journey switch uses)', () => {
    const { select, actions } = setup({ nav: { journey: 'area-first' } });
    select('school-first');
    expect(actions.setJourney).toHaveBeenCalledWith('school-first');
    expect(actions.enterAreasJourney).not.toHaveBeenCalled();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('#2124 — switching Areas -> Schools at an AREA leaf uses the resolved node\'s SERVER-supplied areaKey, never a value derived from the node key', () => {
    // The resolved node's `nodeKey` deliberately encodes a DIFFERENT area than
    // its own server-owned `areaKey` field. A regression that strips the `a:`
    // prefix off the node key instead of reading `areaKey` fails here.
    const { select, actions } = setup({
      nav: { journey: 'area-first' },
      node: AREA_LEAF_NODE,
    });
    select('school-first');
    expect(actions.enterSchoolsJourneyAtArea).toHaveBeenCalledWith('IN|KA|Bangalore|Manipal');
    expect(actions.enterSchoolsJourneyAtArea).not.toHaveBeenCalledWith(
      'IN|KA|Bangalore|AlsoWrongNodeKeyDerivedArea',
    );
    expect(actions.setJourney).not.toHaveBeenCalled();
  });

  it('the AREA-leaf schools shortcut does NOT apply when legacy area context is present (that click is a conversion, not a shortcut)', () => {
    const { select, actions } = setup({
      nav: { journey: 'area-first', areaKey: 'IN|KA|Bangalore|Yelahanka' },
      node: AREA_LEAF_NODE,
    });
    select('school-first');
    expect(actions.enterSchoolsJourneyAtArea).not.toHaveBeenCalled();
    // journey !== 'area-first' -> plain PUSH arm.
    expect(actions.setJourney).toHaveBeenCalledWith('school-first');
  });

  it('legacy areaKey + switch TO area-first: resolves through the server navigation-path endpoint, then enters canonical AT THAT NODE in ONE write', () => {
    const { select, actions } = setup({
      nav: { journey: 'school-first', areaKey: 'IN|KA|Bangalore|Yelahanka', city: 'bangalore' },
    });
    select('area-first');
    // No premature setJourney — the URL is untouched until the node resolves.
    expect(actions.setJourney).not.toHaveBeenCalled();
    expect(mockMutate).toHaveBeenCalledTimes(1);
    const [vars, options] = mockMutate.mock.calls[0];
    expect(vars).toEqual({ city: 'bangalore', areaKey: 'IN|KA|Bangalore|Yelahanka' });

    options.onSuccess({ nodeKey: 'a:IN|KA|Bangalore|Yelahanka' });
    expect(actions.enterAreasJourney).toHaveBeenCalledWith('a:IN|KA|Bangalore|Yelahanka');
  });

  it('an unresolved/stale areaKey (404) retains the current state — no navigation at all — and raises an honest destructive toast', () => {
    const { select, actions, toast } = setup({
      nav: { journey: 'school-first', areaKey: 'IN|KA|Bangalore|Stale' },
    });
    select('area-first');
    const [, options] = mockMutate.mock.calls[0];

    options.onError(new Error('404'));
    expect(actions.enterAreasJourney).not.toHaveBeenCalled();
    expect(actions.setJourney).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'destructive',
        title: "Couldn't switch to area view",
      }),
    );
  });

  it('never fires a second concurrent conversion while one is already in flight', () => {
    mockResolver.isPending = true;
    const { select, actions } = setup({
      nav: { journey: 'school-first', areaKey: 'IN|KA|Bangalore|Yelahanka' },
    });
    select('area-first');
    expect(mockMutate).not.toHaveBeenCalled();
    expect(actions.enterAreasJourney).not.toHaveBeenCalled();
  });

  it('groupId-only (no areaKey) mounts canonical at the city root directly — no network round trip', () => {
    const { select, actions } = setup({
      nav: { journey: 'school-first', groupId: 'airport-belt' },
    });
    select('area-first');
    expect(mockMutate).not.toHaveBeenCalled();
    expect(actions.enterAreasJourney).toHaveBeenCalledWith(null);
    expect(actions.setJourney).not.toHaveBeenCalled();
  });

  it('a journey OTHER than area-first with legacy context still takes the plain PUSH arm (conversion is area-first-only)', () => {
    const { select, actions } = setup({
      nav: { journey: 'area-first', groupId: 'airport-belt' },
    });
    select('agri-first');
    expect(actions.setJourney).toHaveBeenCalledWith('agri-first');
    expect(mockMutate).not.toHaveBeenCalled();
    expect(actions.enterAreasJourney).not.toHaveBeenCalled();
  });
});
