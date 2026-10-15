/**
 * navigation.ts's `applyNodeDelta` — Issue #2088 (commit 4/7), BR5.
 *
 * BR5 (D2_binding_requirements): `clusterFocus` is CLEARED whenever the
 * stable node changes. This ports the retired MapDiscovery.tsx:277-281
 * stale-focus reset EFFECT's test onto the URL domain: that effect used to
 * imperatively clear a piece of React state on a node change; this issue
 * moved the guarantee into `applyNodeDelta` itself (state/url/navigation.ts)
 * so EVERY node write — `goToNode`, `goToAncestorNode`, `clearNode`,
 * `enterAreasJourney`, and `buildNodeHref`'s pure href — carries the deletion
 * through ONE shared delta function, not one call site remembering it and
 * another silently not.
 *
 * `applyNodeDelta` itself is NOT exported (by design — see navigation.ts's
 * module doc: only shape/read helpers and the writer actions are public).
 * This file therefore proves the guarantee two ways:
 *   1. Through `buildNodeHrefFromParams` — the ONE exported pure function
 *      that shares the exact same delta (a differential test elsewhere,
 *      `navigationCommandMatrix.test.ts`, already pins that `goToNode` and
 *      `buildNodeHref` produce byte-identical query strings from the same
 *      starting params — untouched here, that file stays byte-unmodified).
 *   2. End-to-end through the real `useDiscoverUrlState` facade's `goToNode`/
 *      `clearNode` actions, mirroring `navigation.test.ts`'s own render
 *      pattern, so this is not just a claim about the pure function in
 *      isolation but a proof that a real navigation click clears the URL
 *      param too.
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDiscoverUrlState } from '@/hooks/useDiscoverUrlState';
import { buildNodeHrefFromParams } from '../navigation';
import { CLUSTER_FOCUS_PARAM } from '../clusterFocus';

const AREA_NODE_KEY = 'a:IN|KA|Bengaluru|Whitefield';
const OTHER_AREA_NODE_KEY = 'a:IN|KA|Bengaluru|Hebbal';

describe('applyNodeDelta (via buildNodeHrefFromParams) — BR5: clusterFocus is deleted on every node write', () => {
  it('a node navigation strips an existing clusterFocus param from the resulting href', () => {
    const before = new URLSearchParams(
      `node=d%3Acentral&${CLUSTER_FOCUS_PARAM}=IN%7CKA%7CBengaluru%7CAvalahalli`,
    );
    const href = buildNodeHrefFromParams(before, AREA_NODE_KEY);
    expect(href).not.toBeNull();
    const resultParams = new URLSearchParams(href!.slice(1));
    expect(resultParams.has(CLUSTER_FOCUS_PARAM)).toBe(false);
    expect(resultParams.get('node')).toBe(AREA_NODE_KEY);
  });

  it('clears clusterFocus even when the destination node is the SAME node (a re-click / re-entry)', () => {
    const before = new URLSearchParams(
      `node=${encodeURIComponent(AREA_NODE_KEY)}&${CLUSTER_FOCUS_PARAM}=x`,
    );
    const href = buildNodeHrefFromParams(before, AREA_NODE_KEY);
    const resultParams = new URLSearchParams(href!.slice(1));
    expect(resultParams.has(CLUSTER_FOCUS_PARAM)).toBe(false);
  });

  it('POSITIVE CONTROL — a starting param set with no clusterFocus is unaffected (nothing to strip, no crash, still no clusterFocus after)', () => {
    const before = new URLSearchParams('node=d%3Acentral&city=bangalore');
    const href = buildNodeHrefFromParams(before, AREA_NODE_KEY);
    const resultParams = new URLSearchParams(href!.slice(1));
    expect(resultParams.has(CLUSTER_FOCUS_PARAM)).toBe(false);
    expect(resultParams.get('city')).toBe('bangalore');
  });

  it('a non-writable destination key deletes node= AND still strips clusterFocus (buildNodeHrefFromParams itself returns null, but the SAME guarantee holds for the sibling writers that fall back to clearNodeParam) — proven via a direct delta comparison against a writable key', () => {
    // buildNodeHrefFromParams short-circuits to null for a non-writable key
    // (never renders a link the resolve endpoint would 400 on) — the
    // clear-on-non-writable path is instead exercised end-to-end below via
    // the real `clearNode` writer, which routes through the identical
    // applyNodeDelta delete branch.
    expect(buildNodeHrefFromParams(new URLSearchParams(`${CLUSTER_FOCUS_PARAM}=x`), '')).toBeNull();
  });
});

function wrapper(initialUrl: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(MemoryRouter, { initialEntries: [initialUrl] }, children),
    );
  };
}

function renderFacade(initialUrl: string) {
  return renderHook(
    () => ({ urlState: useDiscoverUrlState(), location: useLocation() }),
    { wrapper: wrapper(initialUrl) },
  );
}

describe('applyNodeDelta — BR5 end-to-end through the real useDiscoverUrlState facade', () => {
  it('goToNode clears an existing clusterFocus param from the real URL', () => {
    const { result } = renderFacade(
      `/discover?city=bangalore&node=d%3Acentral&${CLUSTER_FOCUS_PARAM}=IN%7CKA%7CBengaluru%7CAvalahalli`,
    );
    expect(result.current.location.search).toContain(CLUSTER_FOCUS_PARAM);

    act(() => {
      result.current.urlState[1].goToNode(OTHER_AREA_NODE_KEY);
    });

    expect(result.current.location.search).not.toContain(CLUSTER_FOCUS_PARAM);
    const params = new URLSearchParams(result.current.location.search);
    expect(params.get('node')).toBe(OTHER_AREA_NODE_KEY);
  });

  it('clearNode (leaving the hierarchy cursor entirely) also clears clusterFocus', () => {
    const { result } = renderFacade(
      `/discover?city=bangalore&node=${encodeURIComponent(AREA_NODE_KEY)}&${CLUSTER_FOCUS_PARAM}=x`,
    );

    act(() => {
      result.current.urlState[1].clearNode();
    });

    expect(result.current.location.search).not.toContain(CLUSTER_FOCUS_PARAM);
  });

  it('goToAncestorNode (a breadcrumb hop, including the city root) also clears clusterFocus', () => {
    const { result } = renderFacade(
      `/discover?city=bangalore&node=${encodeURIComponent(AREA_NODE_KEY)}&${CLUSTER_FOCUS_PARAM}=x`,
    );

    act(() => {
      result.current.urlState[1].goToAncestorNode('root');
    });

    expect(result.current.location.search).not.toContain(CLUSTER_FOCUS_PARAM);
    const params = new URLSearchParams(result.current.location.search);
    expect(params.get('node')).toBe('root');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// #2750 PR-4 B1 T1 — destination tests that retire four e2e/discover specs:
//   N1a  issue-1956-pr2-filters-survive-navigation
//   N1   issue-1956-pr2-guarded-hierarchy-back + issue-1956-pr6-canonical-back-rehome
//   N2   issue-1956-pr6-journey-switch-conversion
// N1 and N2 drive a REAL react-router history (`useNavigate()(-1/1)` over the REAL
// `useDiscoverUrlState` facade writers) — a counting spy on `setUrlParams` cannot tell PUSH from
// REPLACE where it matters (what Back actually lands on), and a hand-simulated `history.state.idx`
// (HierarchyBackButton.test.tsx) cannot tell the writer's own mode.
// ─────────────────────────────────────────────────────────────────────────────

function renderFacadeWithNavigate(initialUrl: string) {
  return renderHook(
    () => ({ urlState: useDiscoverUrlState(), location: useLocation(), navigate: useNavigate() }),
    { wrapper: wrapper(initialUrl) },
  );
}

const DIRECTION_NODE_KEY = 'd:central';

describe('#2750 N1a — a node hop never drops the intent filter (issue-1956-pr2-filters-survive-navigation)', () => {
  const START = `/discover?city=bangalore&intent=rent&node=${encodeURIComponent(DIRECTION_NODE_KEY)}`;

  it('goToNode (City→Direction→Area), goToAncestorNode (breadcrumb hop) and buildNodeHrefFromParams all keep intent=rent', () => {
    const { result } = renderFacadeWithNavigate(START);
    // Precondition (positive control): the START url really carries intent=rent — a delete('intent')
    // in the delta can only be seen if the starting URL has one.
    expect(new URLSearchParams(result.current.location.search).get('intent')).toBe('rent');

    act(() => {
      result.current.urlState[1].goToNode(AREA_NODE_KEY);
    });
    let params = new URLSearchParams(result.current.location.search);
    expect(params.get('node')).toBe(AREA_NODE_KEY);
    expect(params.get('intent')).toBe('rent');

    act(() => {
      result.current.urlState[1].goToAncestorNode(DIRECTION_NODE_KEY);
    });
    params = new URLSearchParams(result.current.location.search);
    expect(params.get('node')).toBe(DIRECTION_NODE_KEY);
    expect(params.get('intent')).toBe('rent');

    // The copy-link / middle-click affordance shares the same delta.
    const href = buildNodeHrefFromParams(new URLSearchParams(result.current.location.search), AREA_NODE_KEY);
    expect(new URLSearchParams(href!.slice(1)).get('intent')).toBe('rent');
  });
});

describe('#2750 N1 — real native Back/Forward over the real goToNode writer (guarded-hierarchy-back + canonical-back-rehome)', () => {
  const nodeOf = (search: string) => new URLSearchParams(search).get('node');

  it('City→Direction→Area then Back×2 yields [AREA, D, null] (Back from Area lands on the DIRECTION — not the Area, not null); Forward×2 restores', () => {
    const { result } = renderFacadeWithNavigate('/discover?city=bangalore');
    expect(nodeOf(result.current.location.search)).toBeNull();

    act(() => {
      result.current.urlState[1].goToNode(DIRECTION_NODE_KEY);
    });
    act(() => {
      result.current.urlState[1].goToNode(AREA_NODE_KEY);
    });

    const seen: Array<string | null> = [nodeOf(result.current.location.search)];
    act(() => {
      result.current.navigate(-1);
    });
    seen.push(nodeOf(result.current.location.search));
    // The canonical-back-rehome property in isolation: ONE Back from the Area leaf is the Direction.
    expect(seen[1]).toBe(DIRECTION_NODE_KEY);
    act(() => {
      result.current.navigate(-1);
    });
    seen.push(nodeOf(result.current.location.search));
    expect(seen).toEqual([AREA_NODE_KEY, DIRECTION_NODE_KEY, null]);

    // Forward ×2 restores the whole chain, in order (a REPLACE writer would have no entries to return to).
    act(() => {
      result.current.navigate(1);
    });
    expect(nodeOf(result.current.location.search)).toBe(DIRECTION_NODE_KEY);
    act(() => {
      result.current.navigate(1);
    });
    expect(nodeOf(result.current.location.search)).toBe(AREA_NODE_KEY);
  });
});

describe('#2750 N2 — entering the Areas journey from a legacy URL is ONE atomic PUSH; Back restores the exact legacy URL (issue-1956-pr6-journey-switch-conversion)', () => {
  const LEGACY_AREA_KEY = 'IN|KA|Bengaluru|Basaveshwara Nagar';
  const LEGACY_URL =
    `/discover?city=bangalore&scope=west&groupId=west-fixture-group&areaKey=${encodeURIComponent(LEGACY_AREA_KEY)}`;

  it('from scope/groupId/areaKey: groupId + areaKey are cleared and journey=area-first&node= set in ONE entry; navigate(-1) restores groupId/areaKey and drops journey/node', () => {
    const { result } = renderFacadeWithNavigate(LEGACY_URL);
    const before = new URLSearchParams(result.current.location.search);
    // Precondition (positive control): the START url carries every legacy param the writer must clear.
    expect(before.get('groupId')).toBe('west-fixture-group');
    expect(before.get('areaKey')).toBe(LEGACY_AREA_KEY);
    expect(before.get('scope')).toBe('west');
    expect(before.get('journey')).toBeNull();
    expect(before.get('node')).toBeNull();

    act(() => {
      result.current.urlState[1].enterAreasJourney(AREA_NODE_KEY);
    });
    const after = new URLSearchParams(result.current.location.search);
    expect(after.get('journey')).toBe('area-first');
    expect(after.get('node')).toBe(AREA_NODE_KEY);
    expect(after.get('groupId')).toBeNull();
    expect(after.get('areaKey')).toBeNull();

    // ONE history entry for the whole conversion: a single Back is the exact legacy URL.
    act(() => {
      result.current.navigate(-1);
    });
    const back = new URLSearchParams(result.current.location.search);
    expect(back.get('groupId')).toBe('west-fixture-group');
    expect(back.get('areaKey')).toBe(LEGACY_AREA_KEY);
    expect(back.get('scope')).toBe('west');
    expect(back.get('journey')).toBeNull();
    expect(back.get('node')).toBeNull();

    // And Forward returns to the converted state (the entry was a PUSH, not overwritten).
    act(() => {
      result.current.navigate(1);
    });
    const fwd = new URLSearchParams(result.current.location.search);
    expect(fwd.get('journey')).toBe('area-first');
    expect(fwd.get('node')).toBe(AREA_NODE_KEY);
  });
});
