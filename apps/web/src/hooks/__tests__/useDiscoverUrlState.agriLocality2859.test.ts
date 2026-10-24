/**
 * #2859 B6 (handoff 285906) AC6(b) — e2e/discover-telemetry-consent-1531.spec.ts row 1 (csv92), derive half.
 *
 * Runs the REAL useDiscoverUrlState on the spec's exact deep link and feeds its state to the REAL
 * derivePanelContent. Product behaviour at 44bf41a5: a FREE-TEXT `locality=` is never promoted to
 * selectedLocality (AREA_KEY_FORMAT, features/discover/state/url/agricultural.ts:56, read guard :126-137,
 * cold-load migration drops it :262-273), so the spec URL derives `agri-group-selected`; only an
 * area_key-shaped locality reaches `agri-group-locality` (discoverPanelState.ts:88-90).
 */
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDiscoverUrlState } from '../useDiscoverUrlState';
import { derivePanelContent } from '@/utils/discoverPanelState';

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

const specUrl = (locality: string) =>
  `/discover?${new URLSearchParams({ city: 'udupi', journey: 'agri-first', region: 'S', maxKm: '25', locality }).toString()}`;

describe('#2859 B6 AC6(b) agri deep link locality= -> URL state -> panelContent', () => {
  it('1531-1.derive (L92): the spec URL (locality=Brahmavar, free text) keeps selectedLocality null and derives agri-group-selected; control in the same it: an area_key locality derives agri-group-locality', () => {
    const free = renderHook(() => useDiscoverUrlState(), { wrapper: wrapper(specUrl('Brahmavar')) });
    const freeState = free.result.current[0];
    expect(freeState.selectedRegion).toBe('S');
    expect(freeState.selectedMaxKm).toBe(25);
    expect(freeState.selectedLocality).toBeNull();
    expect(derivePanelContent(freeState)).toBe('agri-group-selected');
    free.unmount();

    const keyed = renderHook(() => useDiscoverUrlState(), { wrapper: wrapper(specUrl('IN|KA|Udupi|Brahmavar')) });
    const keyedState = keyed.result.current[0];
    expect(keyedState.selectedRegion).toBe('S');
    expect(keyedState.selectedMaxKm).toBe(25);
    expect(keyedState.selectedLocality).toBe('IN|KA|Udupi|Brahmavar');
    expect(derivePanelContent(keyedState)).toBe('agri-group-locality');
    keyed.unmount();
  });
});
