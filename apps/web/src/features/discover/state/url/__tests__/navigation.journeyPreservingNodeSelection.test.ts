/**
 * Issue #2203 (Option A') — journey-preserving node selection.
 *
 * School-first and Agri-first area selection now resolve the authoritative
 * navigation path (the SAME resolver DiscoverControlBar.tsx's area-first
 * branch already uses) and write the result via a journey-preserving node
 * action — `goToNodeAndClearSchoolSelection` / `goToNodeAndClearAgriculturalLocality`
 * — that:
 *   - writes `node=<resolvedKey>` (identical delta to `goToNode`)
 *   - NEVER touches `journey`
 *   - clears the geography-dependent leaf the just-left Area owned
 *     (school-first: `schoolId`; agri-first: the destKey-based
 *     `selectedLocality`, i.e. `destKey`/`locality`/`town`)
 *   - does this in ONE `setUrlParams` call — one history entry, not two
 *
 * Mirrors `navigation.applyNodeDelta.test.ts`'s render pattern: exercises the
 * REAL `useDiscoverUrlState` facade end-to-end so this is proof against the
 * actual URL, not just a claim about an isolated pure function.
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDiscoverUrlState } from '@/hooks/useDiscoverUrlState';

const AREA_NODE_KEY = 'a:IN|KA|Bengaluru|Whitefield';
const OTHER_AREA_NODE_KEY = 'a:IN|KA|Bengaluru|Hebbal';

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
    () => ({
      urlState: useDiscoverUrlState(),
      location: useLocation(),
      historyAction: useNavigationType(),
    }),
    { wrapper: wrapper(initialUrl) },
  );
}

describe('goToNodeAndClearSchoolSelection — school-first Area re-pick', () => {
  it('writes node=, keeps journey=school-first, and clears an existing schoolId — in ONE write', () => {
    const { result } = renderFacade(
      `/discover?city=bangalore&journey=school-first&node=${encodeURIComponent(AREA_NODE_KEY)}&schoolId=school-123&radiusKm=5`,
    );

    act(() => {
      result.current.urlState[1].goToNodeAndClearSchoolSelection(OTHER_AREA_NODE_KEY);
    });

    const params = new URLSearchParams(result.current.location.search);
    expect(params.get('journey')).toBe('school-first');
    expect(params.get('node')).toBe(OTHER_AREA_NODE_KEY);
    expect(params.has('schoolId')).toBe(false);
    // Mirrors enterSchoolsJourney's own precedent: only schoolId is cleared.
    expect(params.get('radiusKm')).toBe('5');
  });

  it('is a no-op when the school-first URL carries no schoolId (nothing to clear)', () => {
    const { result } = renderFacade(
      `/discover?city=bangalore&journey=school-first&node=${encodeURIComponent(AREA_NODE_KEY)}`,
    );

    act(() => {
      result.current.urlState[1].goToNodeAndClearSchoolSelection(OTHER_AREA_NODE_KEY);
    });

    const params = new URLSearchParams(result.current.location.search);
    expect(params.get('journey')).toBe('school-first');
    expect(params.get('node')).toBe(OTHER_AREA_NODE_KEY);
    expect(params.has('schoolId')).toBe(false);
  });

  it('is a single history PUSH (one entry, not two writes/history entries)', () => {
    const { result } = renderFacade(
      `/discover?city=bangalore&journey=school-first&node=${encodeURIComponent(AREA_NODE_KEY)}&schoolId=school-123&radiusKm=5`,
    );

    act(() => {
      result.current.urlState[1].goToNodeAndClearSchoolSelection(OTHER_AREA_NODE_KEY);
    });

    expect(result.current.historyAction).toBe('PUSH');
  });

  it('re-selecting the Area the node cursor is already on is a no-op (zero writes)', () => {
    const { result } = renderFacade(
      `/discover?city=bangalore&journey=school-first&node=${encodeURIComponent(AREA_NODE_KEY)}&schoolId=school-123&radiusKm=5`,
    );

    act(() => {
      result.current.urlState[1].goToNodeAndClearSchoolSelection(AREA_NODE_KEY);
    });

    // No-op guard (same as writeNode/goToNode): schoolId survives because
    // nothing was written at all.
    const params = new URLSearchParams(result.current.location.search);
    expect(params.get('schoolId')).toBe('school-123');
  });

  // Review follow-up (PR #2211, reviewer-bot @ 07c92a3b) — a stale legacy
  // `areaKey=` left over from a prior area-first visit (or any other
  // historical path that once wrote it) must NOT survive a School-first
  // Area re-pick. Per `useDiscoverNavigationController.ts`'s
  // `isSchoolsNavNodeLevel = nav.journey === 'school-first' && !nav.areaKey
  // && !nav.schoolId`, a surviving `areaKey` would directly flip that gate
  // false and suppress `nodeAreaPoint` (effectiveArea.ts) for the newly
  // written node.
  it('legacy-start URL: clears a stale legacy areaKey= present BEFORE the pick, in the SAME write', () => {
    const { result } = renderFacade(
      `/discover?city=bangalore&journey=school-first&node=${encodeURIComponent(AREA_NODE_KEY)}&schoolId=school-123&areaKey=${encodeURIComponent('IN|KA|Bengaluru|OldTown')}`,
    );

    act(() => {
      result.current.urlState[1].goToNodeAndClearSchoolSelection(OTHER_AREA_NODE_KEY);
    });

    const params = new URLSearchParams(result.current.location.search);
    expect(params.get('journey')).toBe('school-first');
    expect(params.get('node')).toBe(OTHER_AREA_NODE_KEY);
    expect(params.has('schoolId')).toBe(false);
    expect(params.has('areaKey')).toBe(false);
  });
});

describe('goToNodeAndClearAgriculturalLocality — agri-first Area re-pick', () => {
  it('writes node=, keeps journey=agri-first, and clears an existing destKey — in ONE write', () => {
    const { result } = renderFacade(
      `/discover?city=bangalore&journey=agri-first&node=${encodeURIComponent(AREA_NODE_KEY)}&region=NW&maxKm=25&destKey=${encodeURIComponent('IN|KA|Bengaluru|OldTown')}`,
    );

    act(() => {
      result.current.urlState[1].goToNodeAndClearAgriculturalLocality(OTHER_AREA_NODE_KEY);
    });

    const params = new URLSearchParams(result.current.location.search);
    expect(params.get('journey')).toBe('agri-first');
    expect(params.get('node')).toBe(OTHER_AREA_NODE_KEY);
    expect(params.has('destKey')).toBe(false);
    expect(params.has('locality')).toBe(false);
    expect(params.has('town')).toBe(false);
  });

  it('preserves selectedRegion (region=) and selectedMaxKm (maxKm=) unchanged — journey-wide filters, not geography-dependent leaves', () => {
    const { result } = renderFacade(
      `/discover?city=bangalore&journey=agri-first&node=${encodeURIComponent(AREA_NODE_KEY)}&region=NW&maxKm=25&destKey=${encodeURIComponent('IN|KA|Bengaluru|OldTown')}`,
    );

    act(() => {
      result.current.urlState[1].goToNodeAndClearAgriculturalLocality(OTHER_AREA_NODE_KEY);
    });

    const params = new URLSearchParams(result.current.location.search);
    expect(params.get('region')).toBe('NW');
    expect(params.get('maxKm')).toBe('25');
  });

  it('also clears the legacy locality=/town= aliases if somehow still present', () => {
    const { result } = renderFacade(
      `/discover?city=bangalore&journey=agri-first&node=${encodeURIComponent(AREA_NODE_KEY)}&locality=${encodeURIComponent('IN|KA|Bengaluru|OldTown')}`,
    );

    act(() => {
      result.current.urlState[1].goToNodeAndClearAgriculturalLocality(OTHER_AREA_NODE_KEY);
    });

    const params = new URLSearchParams(result.current.location.search);
    expect(params.has('locality')).toBe(false);
  });

  it('is a single history PUSH (one entry)', () => {
    const { result } = renderFacade(
      `/discover?city=bangalore&journey=agri-first&node=${encodeURIComponent(AREA_NODE_KEY)}&region=NW&maxKm=25&destKey=${encodeURIComponent('IN|KA|Bengaluru|OldTown')}`,
    );

    act(() => {
      result.current.urlState[1].goToNodeAndClearAgriculturalLocality(OTHER_AREA_NODE_KEY);
    });

    expect(result.current.historyAction).toBe('PUSH');
  });

  it('re-selecting the Area the node cursor is already on is a no-op (zero writes)', () => {
    const { result } = renderFacade(
      `/discover?city=bangalore&journey=agri-first&node=${encodeURIComponent(AREA_NODE_KEY)}&destKey=${encodeURIComponent('IN|KA|Bengaluru|OldTown')}`,
    );

    act(() => {
      result.current.urlState[1].goToNodeAndClearAgriculturalLocality(AREA_NODE_KEY);
    });

    const params = new URLSearchParams(result.current.location.search);
    expect(params.get('destKey')).toBe('IN|KA|Bengaluru|OldTown');
  });

  // Review follow-up (PR #2211, reviewer-bot @ 07c92a3b) — a stale legacy
  // `areaKey=` left over from a prior area-first visit must NOT survive an
  // Agri-first Area re-pick. Unlike school-first, `isAgriNavNodeLevel` does
  // NOT read `nav.areaKey`, so a surviving `areaKey` would not suppress
  // `nodeAreaPoint` directly — but it WOULD resolve `legacySelectedArea`
  // non-null (useDiscoverPageState.ts's areaKey-sync effect), which then
  // wins over `nodeAreaPoint` via `resolveEffectiveSelectedArea`'s
  // `selectedArea ?? nodeAreaPoint` precedence (effectiveArea.ts).
  it('legacy-start URL: clears a stale legacy areaKey= present BEFORE the pick, in the SAME write', () => {
    const { result } = renderFacade(
      `/discover?city=bangalore&journey=agri-first&node=${encodeURIComponent(AREA_NODE_KEY)}&destKey=${encodeURIComponent('IN|KA|Bengaluru|OldTown')}&areaKey=${encodeURIComponent('IN|KA|Bengaluru|OldTown')}`,
    );

    act(() => {
      result.current.urlState[1].goToNodeAndClearAgriculturalLocality(OTHER_AREA_NODE_KEY);
    });

    const params = new URLSearchParams(result.current.location.search);
    expect(params.get('journey')).toBe('agri-first');
    expect(params.get('node')).toBe(OTHER_AREA_NODE_KEY);
    expect(params.has('destKey')).toBe(false);
    expect(params.has('areaKey')).toBe(false);
  });
});
