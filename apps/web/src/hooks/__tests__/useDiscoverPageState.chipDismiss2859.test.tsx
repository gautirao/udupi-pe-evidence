/**
 * #2859 batch B5 (umbrella #2750) — L68 FC6 hop: chip dismiss -> the chrome controller -> the REAL
 * page-state handleFiltersChange (useDiscoverPageState.ts) -> urlActions.setFiltersLive -> the URL.
 *
 * The PR-5 rows FC-2..FC-4 (useDiscoverFilterChromeController.area2459.test.tsx) stop at a vi.fn()
 * handleFiltersChange, and the #2431 commercialSubtype file calls handleFiltersChange directly; neither
 * proves that clicking the chip's x actually removes the param from the address bar. This file composes the
 * three REAL hooks exactly as the page does (nav = the URL state, filters/setFilters/handleFiltersChange =
 * the page state's own) inside a MemoryRouter and reads the URL after the 300 ms live debounce.
 *
 * PATH NAMED (R_live_stale): the oracle reads the URL-committed path (MemoryRouter location.search after
 * setFiltersLive's debounce), not the LIVE local `filters` state.
 * Four filter chips = MAX_VISIBLE_FILTER_CHIPS, so no Radix overflow popover is opened.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useDiscoverUrlState } from '../useDiscoverUrlState';
import { useDiscoverPageState } from '../useDiscoverPageState';
import { useDiscoverFilterChromeController } from '@/features/discover/controllers/useDiscoverFilterChromeController';

const COLD_URL = '/discover?city=udupi&seller=owner&from=2025-01-15&to=2025-02-01&ntm=1&rera=1';

function Harness() {
  const [urlState, urlActions] = useDiscoverUrlState();
  const page = useDiscoverPageState({ urlState, urlActions });
  const chrome = useDiscoverFilterChromeController({
    nav: urlState,
    actions: urlActions,
    filters: page.filters,
    setFilters: page.setFilters,
    handleFiltersChange: page.handleFiltersChange,
    selectedSchool: null,
    onSchoolSelect: () => {},
    schoolBoardFilter: [],
    onSchoolBoardFilterChange: () => {},
    city: urlState.city,
    effectiveSelectedArea: null,
    trendsAreaKeys: undefined,
    isFetching: false,
  });
  const location = useLocation();
  return (
    <>
      {chrome.activeContextChips}
      <output data-testid="url-search">{location.search}</output>
    </>
  );
}

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[COLD_URL]}>
        <Harness />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const urlParams = () => new URLSearchParams(screen.getByTestId('url-search').textContent ?? '');

async function dismiss(chipTestId: string) {
  await userEvent.setup().click(within(screen.getByTestId(chipTestId)).getByRole('button'));
}

describe('chip dismiss reaches the URL through the real page state (#2859 B5 L68 FC6)', () => {
  beforeEach(() => {
    // No journey/scope in the URL -> the area domain fires a default-journey probe; keep it offline.
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline (test)'));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('seller chip x: seller leaves the URL after the live debounce; from/to/ntm/rera stay (control)', async () => {
    mount();
    // Before: the cold URL carries all five params and the seller chip is mounted from them.
    expect(urlParams().get('seller')).toBe('owner');
    expect(screen.getByTestId('chip-seller')).toBeInTheDocument();

    await dismiss('chip-seller');

    await waitFor(() => expect(urlParams().has('seller')).toBe(false), { timeout: 2000 });
    const after = urlParams();
    expect(after.get('from')).toBe('2025-01-15');
    expect(after.get('to')).toBe('2025-02-01');
    expect(after.get('ntm')).toBe('1');
    expect(after.get('rera')).toBe('1');
    expect(after.get('city')).toBe('udupi');
    expect(screen.queryByTestId('chip-seller')).not.toBeInTheDocument();
  });

  it('date chip x: BOTH from and to leave the URL; seller/ntm/rera stay (control)', async () => {
    mount();
    expect(urlParams().get('from')).toBe('2025-01-15');
    expect(urlParams().get('to')).toBe('2025-02-01');

    await dismiss('chip-date');

    await waitFor(() => expect(urlParams().has('from')).toBe(false), { timeout: 2000 });
    const after = urlParams();
    expect(after.has('to')).toBe(false);
    expect(after.get('seller')).toBe('owner');
    expect(after.get('ntm')).toBe('1');
    expect(after.get('rera')).toBe('1');
  });
});
