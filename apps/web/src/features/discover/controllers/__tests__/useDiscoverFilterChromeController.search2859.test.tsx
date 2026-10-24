/**
 * #2859 batch B5 (umbrella #2750) — L55 K3.dismiss + K3.request hop, in ONE it: dismissing the search chip
 * clears `q` from the URL (keeping areaKey), empties the search input state, and the NEXT city-listings
 * request the area panel issues carries areaKeys and no q.
 *
 * REAL: useDiscoverUrlState (URL facade), useDiscoverSearchState (LIVE search state, reverse URL sync),
 * useDiscoverFilterChromeController (the chip row the page renders and its onClearSearch wiring),
 * useDiscoverCityListings + '@/lib/api' (the request that reaches fetch). Stubbed: global fetch (transport)
 * and the Supabase session source (anonymous).
 *
 * Disclosed seam (R_injected): the page composes the city-listings call inside useDiscoverMapData
 * (useDiscoverMapData.ts:859-879, `q: debouncedSearch?.trim() || undefined`, areaKeys = [selected area]);
 * this harness reproduces that one argument mapping instead of mounting useDiscoverMapData.
 *
 * PATHS NAMED (R_live_stale): the URL oracle reads location.search (URL-committed); the request oracle
 * reads the LIVE path (debouncedSearch -> request), which is what the page's area-listings query uses.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession: mockGetSession } },
}));

import { useDiscoverUrlState } from '@/hooks/useDiscoverUrlState';
import { useDiscoverSearchState } from '@/features/discover/state/useDiscoverSearchState';
import { useDiscoverCityListings } from '@/hooks/useDiscoverCityListings';
import { projectUrlFilters } from '@/features/discover/selectors/urlFiltersProjection';
import { useDiscoverFilterChromeController } from '../useDiscoverFilterChromeController';

const AREA_KEY = 'udupi|manipal';
const COLD_URL = `/discover?city=udupi&areaKey=${encodeURIComponent(AREA_KEY)}&q=villa`;
const LISTINGS_PATH = '/api/discover/cities/udupi/listings';

function Harness() {
  const [urlState, urlActions] = useDiscoverUrlState();
  const search = useDiscoverSearchState({ urlQ: urlState.q, setUrlSearch: urlActions.setSearchQuery });
  const filters = projectUrlFilters(urlState.filters);
  const chrome = useDiscoverFilterChromeController({
    nav: urlState,
    actions: urlActions,
    filters,
    setFilters: () => {},
    handleFiltersChange: () => {},
    selectedSchool: null,
    onSchoolSelect: () => {},
    schoolBoardFilter: [],
    onSchoolBoardFilterChange: () => {},
    city: urlState.city,
    effectiveSelectedArea: null,
    trendsAreaKeys: undefined,
    isFetching: false,
  });
  // Same argument mapping as useDiscoverMapData.ts:859-879 for a single selected area.
  useDiscoverCityListings({
    city: urlState.city,
    areaKeys: urlState.areaKey ? [urlState.areaKey] : [],
    limitPerArea: 50,
    q: search.debouncedSearch?.trim() || undefined,
    isAuthenticated: false,
  });
  const location = useLocation();
  return (
    <>
      {chrome.activeContextChips}
      <output data-testid="url-search">{location.search}</output>
      <output data-testid="search-input-value">{search.searchQuery}</output>
    </>
  );
}

let fetchSpy: ReturnType<typeof vi.spyOn>;

/** Every city-listings request that reached fetch, in order. */
function listingsRequests(): URL[] {
  return fetchSpy.mock.calls
    .map(([u]) => new URL(String(u)))
    .filter((u) => u.pathname === LISTINGS_PATH);
}

beforeEach(() => {
  mockGetSession.mockReset();
  mockGetSession.mockResolvedValue({ data: { session: null } });
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input));
    if (url.pathname === LISTINGS_PATH) {
      return new Response(
        JSON.stringify({ city: 'udupi', limitPerArea: 50, areas: [{ areaKey: AREA_KEY, areaName: 'Manipal', listings: [] }] }),
        { status: 200 },
      );
    }
    throw new TypeError('offline (test)');
  });
});

afterEach(() => {
  fetchSpy.mockRestore();
});

describe('search chip dismiss -> URL and next city-listings request (#2859 B5 L55 K3.dismiss + K3.request)', () => {
  it('before: request has areaKeys + q=villa; dismiss chip-search; after: URL q gone (areaKey kept), input empty, next request has areaKeys and no q', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[COLD_URL]}>
          <Harness />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const urlParams = () => new URLSearchParams(screen.getByTestId('url-search').textContent ?? '');

    // ── Before ───────────────────────────────────────────────────────────────
    await waitFor(() => expect(listingsRequests().length).toBe(1));
    const before = listingsRequests()[0];
    expect(before.searchParams.getAll('areaKeys')).toEqual([AREA_KEY]);
    expect(before.searchParams.get('q')).toBe('villa');
    expect(urlParams().get('q')).toBe('villa');
    expect(screen.getByTestId('search-input-value').textContent).toBe('villa');
    expect(screen.getByTestId('chip-search')).toHaveTextContent('Search: "villa"');

    // ── Action ───────────────────────────────────────────────────────────────
    await userEvent.setup().click(screen.getByTestId('chip-search-dismiss'));

    // ── After (soft, so a broken dismiss reports BOTH the URL and the request expectation) ──
    await waitFor(() => expect(urlParams().has('q')).toBe(false), { timeout: 1500 }).catch(() => undefined);
    expect.soft(urlParams().has('q'), 'URL q after dismiss').toBe(false);
    expect.soft(urlParams().get('areaKey'), 'areaKey kept (control)').toBe(AREA_KEY);
    expect.soft(screen.getByTestId('search-input-value').textContent, 'input reverse-synced').toBe('');

    await waitFor(() => expect(listingsRequests().length).toBe(2), { timeout: 1500 }).catch(() => undefined);
    const after = listingsRequests()[1];
    expect.soft(after?.searchParams.getAll('areaKeys'), 'post-dismiss request areaKeys').toEqual([AREA_KEY]);
    expect.soft(after?.searchParams.has('q'), 'post-dismiss request has no q').toBe(false);
    expect.soft(screen.queryByTestId('chip-search'), 'chip-search gone').not.toBeInTheDocument();
  });
});
