/**
 * clusterFocus URL domain — pure-function coverage for D2_binding_requirements
 * BR1, BR5-BR8 (Issue #2088). BR3/BR4 (replace-vs-push behaviour) require a
 * router harness and are exercised by the hook-level/component-level specs;
 * this file covers the domain's pure param algebra.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDiscoverUrlState } from '@/hooks/useDiscoverUrlState';
import {
  CLUSTER_FOCUS_PARAM,
  MAX_CLUSTER_FOCUS_KEYS,
  readClusterFocusParam,
  clearClusterFocusParam,
  applyClusterFocusDelta,
  useClusterFocusUrlParam,
} from '../clusterFocus';
import { isWritableNodeKey } from '../navigation';
import { AVALAHALLI_CLUSTER_MEMBER_AREA_KEYS } from '@/features/discover/navigation/__fixtures__/candidateNavigationTree';

const AREA_KEY_WITH_SPACE = 'IN|KA|Bengaluru|Electronic City';
const AREA_KEY_2 = 'IN|KA|Bengaluru|Whitefield';

describe('clusterFocus — encode/decode round trip (pipe-delimited, space-containing area keys)', () => {
  it('round-trips a multi-member focus through the URL, spaces and pipes intact', () => {
    const written = applyClusterFocusDelta(new URLSearchParams(), [AREA_KEY_WITH_SPACE, AREA_KEY_2]);
    const read = readClusterFocusParam(written);
    expect(read).toEqual([AREA_KEY_WITH_SPACE, AREA_KEY_2]);
  });

  it('a comma inside a real area key never collides with the delimiter', () => {
    const weirdKey = 'IN|KA|Bengaluru|A, B Layout';
    const written = applyClusterFocusDelta(new URLSearchParams(), [weirdKey, AREA_KEY_2]);
    expect(readClusterFocusParam(written)).toEqual([weirdKey, AREA_KEY_2]);
  });
});

describe('clusterFocus — BR1: never a hierarchy node key', () => {
  it('the written param name is `clusterFocus`, never `node`', () => {
    const written = applyClusterFocusDelta(new URLSearchParams(), [AREA_KEY_WITH_SPACE]);
    expect(written.has('node')).toBe(false);
    expect(written.has(CLUSTER_FOCUS_PARAM)).toBe(true);
  });
});

describe('clusterFocus — BR2: never touches node/breadcrumb/ancestry params', () => {
  it('applyClusterFocusDelta only ever adds/removes the clusterFocus key', () => {
    const before = new URLSearchParams('node=d%3Acentral&city=bangalore&lat=12.9&lon=77.5&zoom=13');
    const after = applyClusterFocusDelta(before, [AREA_KEY_WITH_SPACE]);
    expect(after.get('node')).toBe(before.get('node'));
    expect(after.get('city')).toBe(before.get('city'));
    expect(after.get('lat')).toBe(before.get('lat'));
    expect(after.get('lon')).toBe(before.get('lon'));
    expect(after.get('zoom')).toBe(before.get('zoom'));
  });
});

describe('clusterFocus — BR8: shape/cardinality validation, safe strip (never throw)', () => {
  it('an absent param reads as null (not [])', () => {
    expect(readClusterFocusParam(new URLSearchParams())).toBeNull();
  });

  it('an empty-string param reads as null — the [] truthy-in-JS trap is closed', () => {
    const params = new URLSearchParams();
    params.set(CLUSTER_FOCUS_PARAM, '');
    expect(readClusterFocusParam(params)).toBeNull();
  });

  it('a value with only empty segments (e.g. a stray ",") reads as null', () => {
    const params = new URLSearchParams();
    params.set(CLUSTER_FOCUS_PARAM, ',,');
    expect(readClusterFocusParam(params)).toBeNull();
  });

  it('a value exceeding MAX_CLUSTER_FOCUS_KEYS is stripped entirely (whole value invalid, never partially truncated)', () => {
    const tooMany = Array.from({ length: MAX_CLUSTER_FOCUS_KEYS + 1 }, (_, i) => `IN|KA|Bengaluru|Area${i}`);
    const written = applyClusterFocusDelta(new URLSearchParams(), tooMany);
    // applyClusterFocusDelta itself refuses to write an over-cap value...
    expect(written.has(CLUSTER_FOCUS_PARAM)).toBe(false);
    // ...and a value that somehow reached the URL anyway (hand-crafted/forged)
    // is read back as null, never partially accepted.
    const forged = new URLSearchParams();
    forged.set(CLUSTER_FOCUS_PARAM, tooMany.map(encodeURIComponent).join(','));
    expect(readClusterFocusParam(forged)).toBeNull();
  });

  it('never throws on a malformed percent-encoding', () => {
    const params = new URLSearchParams();
    params.set(CLUSTER_FOCUS_PARAM, '%E0%A4%A');
    expect(() => readClusterFocusParam(params)).not.toThrow();
  });
});

describe('clusterFocus — BR5/BR6: clearClusterFocusParam is the one delete point', () => {
  it('clears the param and leaves everything else untouched', () => {
    const before = new URLSearchParams(`node=d%3Acentral&${CLUSTER_FOCUS_PARAM}=x`);
    const after = clearClusterFocusParam(before);
    expect(after.has(CLUSTER_FOCUS_PARAM)).toBe(false);
    expect(after.get('node')).toBe('d:central');
  });

  it('applyClusterFocusDelta(null) clears an existing focus (BR6 — "Show all")', () => {
    const before = new URLSearchParams(`${CLUSTER_FOCUS_PARAM}=x`);
    const after = applyClusterFocusDelta(before, null);
    expect(after.has(CLUSTER_FOCUS_PARAM)).toBe(false);
  });

  it('applyClusterFocusDelta([]) also clears — the empty array is never written as a degenerate present value', () => {
    const before = new URLSearchParams(`${CLUSTER_FOCUS_PARAM}=x`);
    const after = applyClusterFocusDelta(before, []);
    expect(after.has(CLUSTER_FOCUS_PARAM)).toBe(false);
  });
});

describe('clusterFocus — BR1: isWritableNodeKey(clusterFocusValue) is false for every candidate-derived cluster key', () => {
  // Owner-binding requirement, read literally: not merely "the param name is
  // different" (already covered above) but the NODE-KEY SHAPE VALIDATOR
  // ITSELF (`isWritableNodeKey`, `state/url/navigation.ts` — the ONE gate
  // every real `node=` write passes through) must reject every value this
  // domain can ever encode, individually AND as the joined/encoded string
  // actually written to the URL. Real, #2113-candidate-derived member
  // areaKeys (AVALAHALLI_CLUSTER_MEMBER_AREA_KEYS), not hand-typed
  // look-alikes — this is the same fixture BR8's parent-mismatch behavioural
  // test (AreaMarkerLayer) draws from, so both tests are proven against the
  // identical real data.
  it('no individual candidate-derived member areaKey is ever a writable node key', () => {
    for (const areaKey of AVALAHALLI_CLUSTER_MEMBER_AREA_KEYS) {
      expect(isWritableNodeKey(areaKey), `unexpectedly writable: ${areaKey}`).toBe(false);
    }
  });

  it('the full encoded clusterFocus= value (comma-joined, percent-encoded) is also never a writable node key', () => {
    const written = applyClusterFocusDelta(new URLSearchParams(), AVALAHALLI_CLUSTER_MEMBER_AREA_KEYS);
    const encodedValue = written.get(CLUSTER_FOCUS_PARAM);
    expect(encodedValue).not.toBeNull();
    expect(isWritableNodeKey(encodedValue)).toBe(false);
  });

  it('POSITIVE CONTROL — isWritableNodeKey really does accept a real node key, so the negatives above are not vacuously true of a validator that rejects everything', () => {
    expect(isWritableNodeKey('a:IN|KA|Bengaluru|Avalahalli')).toBe(true);
    expect(isWritableNodeKey('d:central')).toBe(true);
    expect(isWritableNodeKey('root')).toBe(true);
  });
});

describe('clusterFocus — BR7: excluded from hierarchy static-sweep scope', () => {
  it('this module does not live under features/discover/navigation/ (the swept directory)', () => {
    // A structural, not textual, assertion: staticSweep.test.ts walks
    // NAV_DIR = features/discover/navigation only. This file's own path
    // (state/url/clusterFocus.ts) is outside that walk by construction —
    // this test exists so a future relocation of this module INTO the
    // navigation/ directory is caught here rather than silently starting to
    // participate in sweeps that assume it does not exist.
    const path = new URL(import.meta.url).pathname;
    expect(path).toContain('/state/url/');
    expect(path).not.toContain('/navigation/__tests__/');
  });
});

// ─── #2750 PR-5 B1 T2 destination tests (BR3 / BR4 history behaviour, real router) ───
// Rows: cluster-N1 (select REPLACEs: Back skips it), cluster-N2 (replace then push then Back).
// D6: a real MemoryRouter + useNavigate(-1), never a spy on setSearchParams.
describe('clusterFocus — BR3/BR4 history behaviour through a real router (#2750 PR-5 T2)', () => {
  const ROOT_ENTRY = '/discover?city=bangalore&journey=area-first';
  const NODE_ENTRY = '/discover?city=bangalore&journey=area-first&node=d%3Acentral';

  beforeEach(() => {
    // The facade fires a default-journey probe only when no journey is in the URL; every URL here
    // carries journey=area-first, but keep any stray call offline so a dev backend can never answer.
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline (test)'));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderHistoryHarness(entries: string[], initialIndex: number) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    function Wrapper({ children }: { children: React.ReactNode }) {
      return React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(MemoryRouter, { initialEntries: entries, initialIndex }, children),
      );
    }
    return renderHook(
      () => ({
        focus: useClusterFocusUrlParam(),
        urlState: useDiscoverUrlState(),
        location: useLocation(),
        navigationType: useNavigationType(),
        navigate: useNavigate(),
      }),
      { wrapper: Wrapper },
    );
  }

  // #2750 PR-5 cluster-N1
  it('selecting a cluster REPLACEs the current entry: Back skips it and lands on the entry before', () => {
    const { result } = renderHistoryHarness([ROOT_ENTRY, NODE_ENTRY], 1);
    const keyBefore = result.current.location.key;

    act(() => {
      result.current.focus.setClusterFocus([AREA_KEY_WITH_SPACE, AREA_KEY_2]);
    });

    const focused = new URLSearchParams(result.current.location.search);
    expect(focused.has(CLUSTER_FOCUS_PARAM)).toBe(true);
    expect(focused.get('node')).toBe('d:central');
    expect(result.current.location.key).not.toBe(keyBefore);
    expect(result.current.navigationType).toBe('REPLACE');

    // One Back press must leave the cluster-focused entry AND land on the FIRST entry (no node):
    // had the focus been a PUSH, Back would only have un-focused the cluster on the same node.
    act(() => {
      result.current.navigate(-1);
    });
    const afterBack = new URLSearchParams(result.current.location.search);
    expect(afterBack.has('node')).toBe(false);
    expect(afterBack.has(CLUSTER_FOCUS_PARAM)).toBe(false);
    expect(result.current.location.search).toBe('?city=bangalore&journey=area-first');
  });

  // #2750 PR-5 cluster-N2
  it('replace(cluster focus) then push(area) then Back restores the cluster-focused entry exactly', () => {
    const { result } = renderHistoryHarness([ROOT_ENTRY, NODE_ENTRY], 1);

    act(() => {
      result.current.focus.setClusterFocus([AREA_KEY_WITH_SPACE, AREA_KEY_2]);
    });
    const focusedSearch = result.current.location.search;
    expect(new URLSearchParams(focusedSearch).has(CLUSTER_FOCUS_PARAM)).toBe(true);

    // Drilling into an area is a PUSH: a NEW entry, with the cluster focus dropped from it.
    act(() => {
      result.current.urlState[1].goToNode('a:IN|KA|Bengaluru|Hoskote');
    });
    expect(result.current.navigationType).toBe('PUSH');
    const pushed = new URLSearchParams(result.current.location.search);
    expect(pushed.get('node')).toBe('a:IN|KA|Bengaluru|Hoskote');
    expect(pushed.has(CLUSTER_FOCUS_PARAM)).toBe(false);

    // Back returns to the cluster-focused entry (same node, same clusterFocus value), not the root.
    act(() => {
      result.current.navigate(-1);
    });
    expect(result.current.location.search).toBe(focusedSearch);
    const restored = new URLSearchParams(result.current.location.search);
    expect(restored.get('node')).toBe('d:central');
    expect(restored.get(CLUSTER_FOCUS_PARAM)).toBe(
      applyClusterFocusDelta(new URLSearchParams(), [AREA_KEY_WITH_SPACE, AREA_KEY_2]).get(
        CLUSTER_FOCUS_PARAM,
      ),
    );
  });

  // B2-N3 (#2858 batch 2, manifest L116 issue-1956-pr3-area-clustering AC4.7), per the
  // approved revision_1: mirrors the legacy legs (spec :396-434) — push SW, focus a cluster
  // (REPLACE onto the SW entry), Back to root, push W, Back to root, push SW AGAIN — and asserts
  // the exact location.search at every leg. Back never revisits the focused entry here: the
  // revisit is a FRESH PUSH built by applyNodeDelta from the root URL, which never carried
  // clusterFocus. The mutation B2-M2 (delete clearClusterFocusParam in applyNodeDelta) is
  // does NOT turn this `it` red (the source URL has no clusterFocus; see mutation/B2-M2.log), so
  // this `it` is not mutation-credited. It is an end-state check only.
  it('revisit (#2858/#1956 AC4.7): focus a cluster on SW, Back to root, visit W, Back to root, re-enter SW: no clusterFocus and focus is null at every leg', () => {
    const ROOT_SEARCH = '?city=bangalore&journey=area-first';
    const { result } = renderHistoryHarness([ROOT_ENTRY], 0);
    expect(result.current.location.search).toBe(ROOT_SEARCH);

    // Setup: enter SW (PUSH), then focus a cluster on it (REPLACE).
    act(() => {
      result.current.urlState[1].goToNode('d:southwest');
    });
    expect(result.current.navigationType).toBe('PUSH');
    act(() => {
      result.current.focus.setClusterFocus([AREA_KEY_WITH_SPACE, AREA_KEY_2]);
    });

    // (1) after focus: node=SW and clusterFocus present.
    const focusedSearch = new URLSearchParams(result.current.location.search);
    expect(focusedSearch.get('node')).toBe('d:southwest');
    expect(focusedSearch.has(CLUSTER_FOCUS_PARAM)).toBe(true);
    expect(result.current.focus.clusterFocus).toEqual([AREA_KEY_WITH_SPACE, AREA_KEY_2]);

    // (2) Back: root entry, no node, no clusterFocus (the REPLACE means one Back leaves SW entirely).
    act(() => {
      result.current.navigate(-1);
    });
    expect(result.current.location.search).toBe(ROOT_SEARCH);
    expect(result.current.focus.clusterFocus).toBeNull();

    // (3) push W: node=W, no clusterFocus.
    act(() => {
      result.current.urlState[1].goToNode('d:west');
    });
    expect(result.current.location.search).toBe(`${ROOT_SEARCH}&node=d%3Awest`);
    expect(result.current.focus.clusterFocus).toBeNull();

    // (4) Back: root, no clusterFocus.
    act(() => {
      result.current.navigate(-1);
    });
    expect(result.current.location.search).toBe(ROOT_SEARCH);
    expect(result.current.focus.clusterFocus).toBeNull();

    // (5) push SW again: a FRESH entry for the same node — no stale subset, focus null.
    act(() => {
      result.current.urlState[1].goToNode('d:southwest');
    });
    expect(result.current.navigationType).toBe('PUSH');
    expect(result.current.location.search).toBe(`${ROOT_SEARCH}&node=d%3Asouthwest`);
    expect(new URLSearchParams(result.current.location.search).has(CLUSTER_FOCUS_PARAM)).toBe(false);
    expect(result.current.focus.clusterFocus).toBeNull();
  });
});
