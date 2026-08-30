import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
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
