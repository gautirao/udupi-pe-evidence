import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDiscoverUrlState } from '@/hooks/useDiscoverUrlState';

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

describe('setSchoolJourney URL state transition', () => {
  it('clears stale canonical node context so cross-branch searches do not incorrectly restore old hierarchy on Back', () => {
    // Start with a URL that already has a canonical node (e.g., navigating down the North Bangalore branch)
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=bengaluru&journey=school-first&node=d:north'),
    });

    // The current node is correctly set
    expect(result.current[0].node).toBe('d:north');

    // Simulate cross-branch school search selection
    act(() => {
      result.current[1].setSchoolJourney({
        schoolId: '12345',
        radiusKm: 3,
        lat: 13.0,
        lon: 77.6,
        zoom: 12,
        areaKey: 'koramangala', // Area in South, not North
      });
    });

    // Node MUST be cleared when entering a direct school selection
    expect(result.current[0].node).toBeNull();
    expect(result.current[0].schoolId).toBe('12345');
    expect(result.current[0].areaKey).toBe('koramangala');
  });

  it('#2205 — clears a stale groupId on school-first journey entry, matching enterSchoolsJourney/enterSchoolsJourneyAtArea', () => {
    // Start with a URL carrying an area-first group focus (groupId), e.g. after
    // a user focused an area-group before performing a cross-branch school search.
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=bengaluru&journey=area-first&groupId=IN%7CKA%7CUdupi%7CManipal'),
    });

    act(() => {
      result.current[1].setSchoolJourney({
        schoolId: '12345',
        radiusKm: 3,
        lat: 13.0,
        lon: 77.6,
        zoom: 12,
        areaKey: 'koramangala',
      });
    });

    // groupId MUST be cleared so markerScope.ts rule 6 cannot incorrectly
    // scope the school-first map to the stale area-group's member areas.
    expect(result.current[0].groupId).toBeNull();
    expect(result.current[0].schoolId).toBe('12345');
  });
});

// ─── G2-N1 / G2-N2 / G2-N3 (#2750 PR-3 B1) — real history, >= 2 prior entries ──────────
// Declarative MemoryRouter with initialEntries + initialIndex (createMemoryRouter builds a
// fetch Request per navigation and jsdom's AbortSignal rejects it). `navigate(-1)` is the
// browser Back. With only ONE prior entry a PUSH and a REPLACE both land "without schoolId",
// so the entry list below has THREE entries and the area entry sits at index 2.
// Retires: school-first-back-nav BN-4, school-first-markers BACK-1, school-first-map-focus MF-5
// (G2-N1/G2-N2); school-first-hardening HRD-5 board-survives-selection (G2-N3).
describe('G2 school selection is a history PUSH and keeps board/category (#2750 PR-3 B1)', () => {
  const LANDING = '/discover?city=udupi';
  const BROWSE = '/discover?city=udupi&journey=school-first';
  const AREA = '/discover?city=udupi&journey=school-first&areaKey=IN%7CKA%7CUdupi%7CManipal';

  function historyWrapper(entries: string[]) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return function Wrapper({ children }: { children: React.ReactNode }) {
      return React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(MemoryRouter, { initialEntries: entries, initialIndex: entries.length - 1 }, children),
      );
    };
  }

  function renderWithHistory(entries: string[]) {
    return renderHook(
      () => ({ url: useDiscoverUrlState(), navigate: useNavigate(), location: useLocation() }),
      { wrapper: historyWrapper(entries) },
    );
  }

  const SCHOOL = { schoolId: 'sch-1', radiusKm: 3, lat: 13.35, lon: 74.79, zoom: 13 };

  it('G2-N1 setSchoolJourney is a PUSH: browser Back returns to the area URL (areaKey kept, no schoolId)', () => {
    const { result } = renderWithHistory([LANDING, BROWSE, AREA]);
    expect(new URLSearchParams(result.current.location.search).get('areaKey')).toBe('IN|KA|Udupi|Manipal');

    act(() => {
      result.current.url[1].setSchoolJourney({ ...SCHOOL, areaKey: 'IN|KA|Udupi|Manipal' });
    });
    expect(new URLSearchParams(result.current.location.search).get('schoolId')).toBe('sch-1');

    act(() => {
      result.current.navigate(-1);
    });
    const back = new URLSearchParams(result.current.location.search);
    expect(back.get('areaKey')).toBe('IN|KA|Udupi|Manipal');
    expect(back.has('schoolId')).toBe(false);
    expect(back.has('radiusKm')).toBe(false);
  });

  it('G2-N2 setSchoolParams({schoolId, radiusKm}) with no options is a PUSH: Back drops schoolId, areaKey kept', () => {
    const { result } = renderWithHistory([LANDING, BROWSE, AREA]);

    act(() => {
      result.current.url[1].setSchoolParams({ schoolId: 'sch-1', radiusKm: 3 });
    });
    expect(new URLSearchParams(result.current.location.search).get('schoolId')).toBe('sch-1');

    act(() => {
      result.current.navigate(-1);
    });
    const back = new URLSearchParams(result.current.location.search);
    expect(back.has('schoolId')).toBe(false);
    expect(back.get('areaKey')).toBe('IN|KA|Udupi|Manipal');
  });

  it('G2-N3 board + category survive setSchoolJourney (both still in location.search, exact values)', () => {
    const { result } = renderWithHistory([
      LANDING,
      BROWSE,
      `${AREA}&board=CBSE&category=secondary`,
    ]);

    act(() => {
      result.current.url[1].setSchoolJourney({ ...SCHOOL, areaKey: 'IN|KA|Udupi|Manipal' });
    });

    const now = new URLSearchParams(result.current.location.search);
    expect(now.getAll('board')).toEqual(['CBSE']);
    expect(now.getAll('category')).toEqual(['secondary']);
    expect(now.get('schoolId')).toBe('sch-1');
  });
});
