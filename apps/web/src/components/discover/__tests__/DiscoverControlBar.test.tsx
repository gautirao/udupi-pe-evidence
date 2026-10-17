import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import type { DiscoverUrlState, DiscoverUrlActions } from '@/hooks/useDiscoverUrlState';
import type { DiscoverArea } from '@/hooks/useDiscoverAreas';
import { CITY_CONFIG } from '@/lib/localityUtils';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';

/**
 * Issue #1953 build step 5 — DiscoverControlBar (city + Buy/Rent + area
 * autocomplete). Mocks the facade module exactly like
 * DiscoverRightPanelContainer.test.tsx (the established pattern for this
 * codebase) so these tests exercise ONLY the control bar's own wiring, not
 * useDiscoverUrlState's URL-parsing internals.
 */
const { BASE_NAV, ACTIONS } = vi.hoisted(() => {
  const nav: DiscoverUrlState = {
    city: 'bangalore',
    areaKey: null,
    viewport: null,
    filters: {},
    schoolId: null,
    radiusKm: null,
    q: '',
    journey: null,
    groupId: null,
    selectedGroup: null,
    intent: 'buy',
    scope: null,
  };

  const actions: DiscoverUrlActions = {
    changeCity: vi.fn(),
    setCity: vi.fn(),
    selectArea: vi.fn(),
    deselectArea: vi.fn(),
    reportViewport: vi.fn(),
    setFiltersLive: vi.fn(),
    setFiltersCommitted: vi.fn(),
    setSchoolParams: vi.fn(),
    clearSchoolSelection: vi.fn(),
    clearAreaSelection: vi.fn(),
    setSearchQuery: vi.fn(),
    clearAllFiltersAndSearch: vi.fn(),
    setJourney: vi.fn(),
    selectGroup: vi.fn(),
    setBoardFilters: vi.fn(),
    setCategoryFilters: vi.fn(),
    clearAreaContext: vi.fn(),
    clearSchoolContext: vi.fn(),
    startOver: vi.fn(),
    enterSchoolPicking: vi.fn(),
    clearSchoolPicking: vi.fn(),
    backToSchoolPicking: vi.fn(),
    enterGroupResults: vi.fn(),
    clearGroupResults: vi.fn(),
    selectRegionalGroup: vi.fn(),
    setRegion: vi.fn(),
    setScope: vi.fn(),
    setRegionWithMaxKm: vi.fn(),
    setMaxKm: vi.fn(),
    clearRegionAndMaxKm: vi.fn(),
    setSelectedListing: vi.fn(),
    clearSelectedListing: vi.fn(),
    setLocality: vi.fn(),
    clearLocality: vi.fn(),
    clearAgriFilters: vi.fn(),
    setIntent: vi.fn(),
    setSchoolJourney: vi.fn(),
    // Issue #1956 PR 2 — canonical Areas hierarchy write actions.
    goToNode: vi.fn(),
    goToAncestorNode: vi.fn(),
    clearNode: vi.fn(),
    enterAreasJourney: vi.fn(),
    enterSchoolsJourney: vi.fn(),
    enterSchoolsJourneyAtArea: vi.fn(),
    buildNodeHref: vi.fn(),
    enterNodeListings: vi.fn(),
    clearNodeListings: vi.fn(),
    // Issue #2203 — journey-preserving node selection for School-first/Agri-first.
    goToNodeAndClearSchoolSelection: vi.fn(),
    goToNodeAndClearAgriculturalLocality: vi.fn(),
    // Issue #1943 — singleton auto-advance REPLACE variant of goToNode.
    goToNodeReplacingCurrent: vi.fn(),
    // Issue #2016 — result-scope commit.
    commitResultScope: vi.fn(),
    // Issue #2017 — multi-area AREA_SET commit.
    commitAreaSet: vi.fn(),
  };

  return { BASE_NAV: nav, ACTIONS: actions };
});

let currentNav: DiscoverUrlState = BASE_NAV;
let currentIsMobileShell = false;
// Issue #2729 R1 fix — `canonicalAreaLabel` now reads `shell.canonicalScopeLabel` (the value
// `AreaSelectedPanel` broadcasts, matching the Results title exactly) instead of independently
// re-deriving it from `nav`. Settable here so tests can drive it directly.
let currentCanonicalScopeLabel: string | null = null;

// #2750 PR-5 review-fix r3 (Codex P2 4292420356, discover-city-switch) — when `useLiveContext` is
// true the three hooks delegate to the REAL context hooks, so one `it` can mount the real
// <DiscoverProvider> (real useDiscoverUrlState + MemoryRouter) around the real control. Every other
// `it` leaves it false and sees exactly the mocks below.
let useLiveContext = false;

vi.mock('@/features/discover/context/useDiscoverContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/discover/context/useDiscoverContext')>();
  return {
    ...actual,
    useDiscoverNav: () => (useLiveContext ? actual.useDiscoverNav() : currentNav),
    useDiscoverActions: () => (useLiveContext ? actual.useDiscoverActions() : ACTIONS),
    useDiscoverShell: () =>
      useLiveContext
        ? actual.useDiscoverShell()
        : {
            isMobileShell: currentIsMobileShell,
            canonicalScopeLabel: currentCanonicalScopeLabel,
            setCanonicalScopeLabel: () => {},
          },
  };
});

const AREAS: DiscoverArea[] = [
  {
    areaKey: 'area:indiranagar',
    name: 'Indiranagar',
    geoCenterLat: 12.97,
    geoCenterLon: 77.64,
    listingCount: 12,
    schoolCount: 3,
  },
  {
    areaKey: 'area:koramangala',
    name: 'Koramangala',
    geoCenterLat: 12.93,
    geoCenterLon: 77.62,
    listingCount: 20,
    schoolCount: 5,
  },
  {
    areaKey: 'area:whitefield',
    name: 'Whitefield',
    geoCenterLat: 12.97,
    geoCenterLon: 77.75,
    listingCount: 8,
    schoolCount: 2,
  },
];

const mockUseDiscoverAreas = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useDiscoverAreas', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useDiscoverAreas')>();
  return { ...actual, useDiscoverAreas: mockUseDiscoverAreas };
});

/**
 * Issue #1956 PR 6 ([rulings.option_a_search_convergence_2026_08_03]) — the
 * area-search selection seam now resolves the picked areaKey through
 * useDiscoverAreaNavigationPathResolver (the same client caller the
 * JourneySwitcher conversion seam uses) instead of calling
 * ACTIONS.selectArea directly. Mocked the same way
 * DiscoverRightPanelContainer.test.tsx mocks it, but here `mutate` is a
 * controllable spy (not a bare vi.fn()) so tests can drive success/failure
 * and assert the exact {city, areaKey} the mutation was invoked with.
 */
const mockResolveMutate = vi.hoisted(() => vi.fn());
let mockResolveIsPending = false;
vi.mock('@/features/discover/navigation/useDiscoverAreaNavigationPath', () => ({
  useDiscoverAreaNavigationPathResolver: () => ({
    mutate: mockResolveMutate,
    get isPending() {
      return mockResolveIsPending;
    },
  }),
}));

const mockToast = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

import { DiscoverControlBar, AreaAutocomplete, CONTROL_BAR_CITIES } from '../DiscoverControlBar';

describe('DiscoverControlBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentNav = BASE_NAV;
    currentIsMobileShell = false;
    currentCanonicalScopeLabel = null;
    useLiveContext = false;
    mockResolveIsPending = false;
    mockUseDiscoverAreas.mockReturnValue({ data: { city: 'bangalore', areas: AREAS } });
  });

  // ─── AC5 — city selector ────────────────────────────────────────────
  describe('city selector', () => {
    it('renders Bangalore as active and the other three cities disabled with a Soon affordance', async () => {
      const user = userEvent.setup();
      render(<DiscoverControlBar />);
      await user.click(screen.getByRole('button', { name: /bangalore/i }));

      const bangalore = screen.getByTestId('control-bar-city-option-bangalore');
      expect(bangalore).not.toBeDisabled();

      for (const key of ['mumbai', 'pune', 'hyderabad']) {
        const option = screen.getByTestId(`control-bar-city-option-${key}`);
        expect(option).toBeDisabled();
        expect(option).toHaveTextContent('Soon');
      }
    });

    it('has a data-testid on the city select control', () => {
      render(<DiscoverControlBar />);
      expect(screen.getByTestId('control-bar-city-select')).toBeInTheDocument();
    });

    it('clicking a disabled city invokes NO facade action at all', async () => {
      const user = userEvent.setup();
      render(<DiscoverControlBar />);
      await user.click(screen.getByRole('button', { name: /bangalore/i }));
      await user.click(screen.getByTestId('control-bar-city-option-mumbai'));

      expect(ACTIONS.changeCity).not.toHaveBeenCalled();
      expect(ACTIONS.setCity).not.toHaveBeenCalled();
    });

    it('re-selecting the already-active city is a no-op (does not call changeCity again)', async () => {
      const user = userEvent.setup();
      render(<DiscoverControlBar />);
      await user.click(screen.getByRole('button', { name: /bangalore/i }));
      await user.click(screen.getByTestId('control-bar-city-option-bangalore'));

      expect(ACTIONS.changeCity).not.toHaveBeenCalled();
    });

    // #2750 PR-5 city-switch-N1 — the trigger label is derived from the URL city, not a fixed default.
    // (The city listbox is a plain portaled <ul role="listbox">, not a Radix Popover/Select: D13 does not apply.)
    it('the city control shows the URL city (Udupi), not a fixed default', () => {
      currentNav = { ...BASE_NAV, city: 'udupi' };
      render(<DiscoverControlBar />);

      expect(screen.getByRole('button', { name: /udupi/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /bangalore/i })).not.toBeInTheDocument();
    });

    // #2750 PR-5 city-switch-N2
    it("choosing Mangalore calls changeCity('mangalore') exactly once", async () => {
      const user = userEvent.setup();
      render(<DiscoverControlBar />);
      await user.click(screen.getByRole('button', { name: /bangalore/i }));
      await user.click(screen.getByTestId('control-bar-city-option-mangalore'));

      expect(ACTIONS.changeCity).toHaveBeenCalledTimes(1);
      expect(ACTIONS.changeCity).toHaveBeenCalledWith('mangalore');
      expect(ACTIONS.setCity).not.toHaveBeenCalled();
    });

    // #2750 PR-5 review-fix r3 (Codex P2 4292420356) — the COMPOSED path option -> real facade/provider
    // -> URL -> re-rendered control. No mocked changeCity, no mocked nav: the real <DiscoverProvider>
    // (useDiscoverUrlState over a MemoryRouter) feeds the real control, and a location probe reads the URL.
    it('composed: clicking Mangalore through the REAL DiscoverProvider writes ?city=mangalore, drops a stale areaKey, and the control re-renders as Mangalore', async () => {
      useLiveContext = true;
      const user = userEvent.setup();
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      function LocationProbe() {
        const loc = useLocation();
        return <output data-testid="probe-search">{loc.search}</output>;
      }
      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={['/discover?city=udupi&areaKey=IN%7CKA%7CUdupi%7CManipal']}>
            <DiscoverProvider>
              <DiscoverControlBar />
              <LocationProbe />
            </DiscoverProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(screen.getByRole('button', { name: /udupi/i })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /udupi/i }));
      await user.click(screen.getByTestId('control-bar-city-option-mangalore'));

      await waitFor(() => {
        expect(new URLSearchParams(screen.getByTestId('probe-search').textContent ?? '').get('city')).toBe('mangalore');
      });
      const finalParams = new URLSearchParams(screen.getByTestId('probe-search').textContent ?? '');
      expect(finalParams.getAll('areaKey')).toHaveLength(0);
      expect(screen.getByRole('button', { name: /mangalore/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /udupi/i })).not.toBeInTheDocument();
    });

    it('sanity: the 3 declared coming-soon cities are disabled; everything else is active', () => {
      const comingSoon = ['mumbai', 'pune', 'hyderabad'];
      for (const key of comingSoon) {
        expect(CONTROL_BAR_CITIES.find((c) => c.key === key)?.active).toBe(false);
      }
      expect(
        CONTROL_BAR_CITIES.filter((c) => !comingSoon.includes(c.key)).every(
          (c) => c.active === true,
        ),
      ).toBe(true);
    });

    // Regression guard for the #1953 defect: DiscoverControlBar became the
    // SOLE owner of city selection when the four panel-level CitySelects
    // were removed, but its roster was a hand-typed literal that happened to
    // match CITY_CONFIG's four keys by coincidence, not derivation — so
    // udupi/kundapur/mangalore silently had no way to be selected back to
    // from the control bar. This asserts OVER CITY_CONFIG's real entries
    // (not a copy of today's four names) so a fifth city added to
    // CITY_CONFIG and forgotten here fails this test instead of shipping
    // unreachable.
    it('exposes every CITY_CONFIG city as active, labelled with its CITY_CONFIG label', () => {
      const configEntries = Object.entries(CITY_CONFIG);
      expect(configEntries.length).toBeGreaterThan(0);

      for (const [key, config] of configEntries) {
        const entry = CONTROL_BAR_CITIES.find((c) => c.key === key);
        expect(entry, `expected CONTROL_BAR_CITIES to include CITY_CONFIG key "${key}"`).toBeDefined();
        expect(entry?.active).toBe(true);
        expect(entry?.label).toBe(config.label);
      }
    });

    it('renders every CITY_CONFIG city as a selectable, non-disabled dropdown option with its label', async () => {
      const user = userEvent.setup();
      render(<DiscoverControlBar />);
      await user.click(screen.getByRole('button', { name: /bangalore/i }));

      for (const [key, config] of Object.entries(CITY_CONFIG)) {
        const option = screen.getByTestId(`control-bar-city-option-${key}`);
        expect(option).not.toBeDisabled();
        expect(option).toHaveTextContent(config.label);
      }
    });
  });

  // ─── AC6 — Buy/Rent ─────────────────────────────────────────────────
  describe('Buy/Rent intent', () => {
    it('renders the existing IntentSelector wired to the facade setIntent action', async () => {
      const user = userEvent.setup();
      render(<DiscoverControlBar />);
      await user.click(screen.getByTestId('intent-selector-rent'));
      expect(ACTIONS.setIntent).toHaveBeenCalledTimes(1);
      expect(ACTIONS.setIntent).toHaveBeenCalledWith('rent');
    });

    it('calling setIntent does not touch changeCity/selectArea (no invented history semantics)', async () => {
      const user = userEvent.setup();
      render(<DiscoverControlBar />);
      await user.click(screen.getByTestId('intent-selector-rent'));
      expect(ACTIONS.changeCity).not.toHaveBeenCalled();
      expect(ACTIONS.selectArea).not.toHaveBeenCalled();
    });
  });

  // ─── AC7 — area autocomplete ────────────────────────────────────────
  describe('area autocomplete', () => {
    // Issue #1956 PR 6 (option_a_search_convergence) — the two-arm defect
    // this closes: with the legacy gate open (canonical default), the
    // search control used to write areaKey= directly and the canonical
    // panel never read it (camera moved, panel stayed at city root). These
    // four tests pin the replacement seam FOR journey=area-first ONLY:
    // resolve-then-enter on success, and "preserve state, toast, don't
    // touch enterAreasJourney" on failure — never a bare selectArea()
    // write in either case. journey must be set explicitly here (rather
    // than relying on BASE_NAV's null default) because the canonical
    // convergence seam is scoped to the explicit area-first journey — see
    // the "shared control seam by journey" describe block below for the
    // school-first/agri-first/journey-less branch these tests do NOT cover.
    it('resolves the canonical areaKey (never display text) through the navigation-path resolver, never calling the legacy selectArea', async () => {
      currentNav = { ...BASE_NAV, journey: 'area-first' };
      const user = userEvent.setup();
      render(<DiscoverControlBar />);
      const input = screen.getByTestId('control-bar-area-input');
      await user.type(input, 'koramangala');
      await user.click(screen.getByTestId('control-bar-area-option-area:koramangala'));

      expect(mockResolveMutate).toHaveBeenCalledTimes(1);
      const [params] = mockResolveMutate.mock.calls[0];
      expect(params).toEqual({ city: 'bangalore', areaKey: 'area:koramangala' });
      // The legacy areaKey= writer must never be called from this seam.
      expect(ACTIONS.selectArea).not.toHaveBeenCalled();
    });

    it('on resolution SUCCESS, commits the server-returned node via the SAME atomic writer guided selection uses (enterAreasJourney), never a client-constructed node key', async () => {
      currentNav = { ...BASE_NAV, journey: 'area-first' };
      const user = userEvent.setup();
      mockResolveMutate.mockImplementation((_params, { onSuccess }) => {
        onSuccess({
          areaKey: 'area:koramangala',
          nodeKey: 'a:area:koramangala',
          displayLabel: 'Koramangala',
          ancestry: [],
          revisionId: 1,
        });
      });
      render(<DiscoverControlBar />);
      await user.type(screen.getByTestId('control-bar-area-input'), 'koramangala');
      await user.click(screen.getByTestId('control-bar-area-option-area:koramangala'));

      expect(ACTIONS.enterAreasJourney).toHaveBeenCalledTimes(1);
      expect(ACTIONS.enterAreasJourney).toHaveBeenCalledWith('a:area:koramangala');
      expect(ACTIONS.selectArea).not.toHaveBeenCalled();
      expect(mockToast).not.toHaveBeenCalled();
    });

    it('on resolution FAILURE, leaves navigation untouched (no enterAreasJourney, no selectArea) and shows the existing safe stale-link toast', async () => {
      currentNav = { ...BASE_NAV, journey: 'area-first' };
      const user = userEvent.setup();
      mockResolveMutate.mockImplementation((_params, { onError }) => {
        onError(new Error('404'));
      });
      render(<DiscoverControlBar />);
      await user.type(screen.getByTestId('control-bar-area-input'), 'koramangala');
      await user.click(screen.getByTestId('control-bar-area-option-area:koramangala'));

      expect(ACTIONS.enterAreasJourney).not.toHaveBeenCalled();
      expect(ACTIONS.selectArea).not.toHaveBeenCalled();
      expect(mockToast).toHaveBeenCalledTimes(1);
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      );
    });

    it('ignores a second selection while a resolution is already in flight (no concurrent request/history write)', async () => {
      currentNav = { ...BASE_NAV, journey: 'area-first' };
      const user = userEvent.setup();
      mockResolveIsPending = true;
      render(<DiscoverControlBar />);
      await user.type(screen.getByTestId('control-bar-area-input'), 'koramangala');
      await user.click(screen.getByTestId('control-bar-area-option-area:koramangala'));

      expect(mockResolveMutate).not.toHaveBeenCalled();
    });

    // Issue #2729 (post-merge fix-verify, reviewer-required) — keyboard selection (ArrowDown then
    // Enter) never goes through the mousedown/mouseup/click sequence `isSelectingRef` guards at
    // all (it calls `commitSelection` directly from `handleKeyDown`'s Enter branch), so this
    // proves the new guard didn't accidentally couple keyboard selection to pointer-gesture state.
    it('keyboard selection (ArrowDown, Enter) still commits, independent of the pointer-gesture guard', async () => {
      currentNav = { ...BASE_NAV, journey: 'area-first' };
      const user = userEvent.setup();
      render(<DiscoverControlBar />);
      const input = screen.getByTestId('control-bar-area-input');
      await user.type(input, 'koramangala');
      await user.keyboard('{ArrowDown}');
      await user.keyboard('{Enter}');

      expect(mockResolveMutate).toHaveBeenCalledTimes(1);
      expect(mockResolveMutate).toHaveBeenCalledWith(
        { city: 'bangalore', areaKey: 'area:koramangala' },
        expect.anything(),
      );
    });

    // Issue #2203 (Option A') — the canonical resolve seam above is now
    // SHARED across all three explicit journeys (area-first, school-first,
    // agri-first). School-first/agri-first must resolve through the SAME
    // resolver as area-first but write via a JOURNEY-PRESERVING node action
    // — never enterAreasJourney (which would eject the user into
    // area-first, the cross-journey-ejection regression the #1956 PR 6
    // rework originally guarded against). Only the journey-less landing
    // keeps the untouched legacy `selectArea` behaviour. Each case gets its
    // own test per the established "a test per journey" convention.
    describe('shared control seam by journey — school-first/agri-first resolve+preserve, journey-less stays legacy', () => {
      it('school-first: resolves through the SAME resolver as area-first (never the legacy selectArea)', async () => {
        currentNav = { ...BASE_NAV, journey: 'school-first' };
        const user = userEvent.setup();
        render(<DiscoverControlBar />);
        await user.type(screen.getByTestId('control-bar-area-input'), 'koramangala');
        await user.click(screen.getByTestId('control-bar-area-option-area:koramangala'));

        expect(mockResolveMutate).toHaveBeenCalledTimes(1);
        const [params] = mockResolveMutate.mock.calls[0];
        expect(params).toEqual({ city: 'bangalore', areaKey: 'area:koramangala' });
        expect(ACTIONS.selectArea).not.toHaveBeenCalled();
      });

      it('school-first: on resolution SUCCESS, writes the resolved node via goToNodeAndClearSchoolSelection — never enterAreasJourney (journey preserved)', async () => {
        currentNav = { ...BASE_NAV, journey: 'school-first' };
        const user = userEvent.setup();
        mockResolveMutate.mockImplementation((_params, { onSuccess }) => {
          onSuccess({
            areaKey: 'area:koramangala',
            nodeKey: 'a:area:koramangala',
            displayLabel: 'Koramangala',
            ancestry: [],
            revisionId: 1,
          });
        });
        render(<DiscoverControlBar />);
        await user.type(screen.getByTestId('control-bar-area-input'), 'koramangala');
        await user.click(screen.getByTestId('control-bar-area-option-area:koramangala'));

        expect(ACTIONS.goToNodeAndClearSchoolSelection).toHaveBeenCalledTimes(1);
        expect(ACTIONS.goToNodeAndClearSchoolSelection).toHaveBeenCalledWith('a:area:koramangala');
        expect(ACTIONS.enterAreasJourney).not.toHaveBeenCalled();
        expect(ACTIONS.selectArea).not.toHaveBeenCalled();
        expect(mockToast).not.toHaveBeenCalled();
      });

      it('school-first: on resolution FAILURE, writes nothing and shows the existing stale-link toast', async () => {
        currentNav = { ...BASE_NAV, journey: 'school-first' };
        const user = userEvent.setup();
        mockResolveMutate.mockImplementation((_params, { onError }) => {
          onError(new Error('404'));
        });
        render(<DiscoverControlBar />);
        await user.type(screen.getByTestId('control-bar-area-input'), 'koramangala');
        await user.click(screen.getByTestId('control-bar-area-option-area:koramangala'));

        expect(ACTIONS.goToNodeAndClearSchoolSelection).not.toHaveBeenCalled();
        expect(ACTIONS.enterAreasJourney).not.toHaveBeenCalled();
        expect(ACTIONS.selectArea).not.toHaveBeenCalled();
        expect(mockToast).toHaveBeenCalledTimes(1);
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
      });

      it('agri-first: resolves through the SAME resolver as area-first (never the legacy selectArea)', async () => {
        currentNav = { ...BASE_NAV, journey: 'agri-first' };
        const user = userEvent.setup();
        render(<DiscoverControlBar />);
        await user.type(screen.getByTestId('control-bar-area-input'), 'koramangala');
        await user.click(screen.getByTestId('control-bar-area-option-area:koramangala'));

        expect(mockResolveMutate).toHaveBeenCalledTimes(1);
        const [params] = mockResolveMutate.mock.calls[0];
        expect(params).toEqual({ city: 'bangalore', areaKey: 'area:koramangala' });
        expect(ACTIONS.selectArea).not.toHaveBeenCalled();
      });

      it('agri-first: on resolution SUCCESS, writes the resolved node via goToNodeAndClearAgriculturalLocality — never enterAreasJourney (journey preserved)', async () => {
        currentNav = { ...BASE_NAV, journey: 'agri-first' };
        const user = userEvent.setup();
        mockResolveMutate.mockImplementation((_params, { onSuccess }) => {
          onSuccess({
            areaKey: 'area:koramangala',
            nodeKey: 'a:area:koramangala',
            displayLabel: 'Koramangala',
            ancestry: [],
            revisionId: 1,
          });
        });
        render(<DiscoverControlBar />);
        await user.type(screen.getByTestId('control-bar-area-input'), 'koramangala');
        await user.click(screen.getByTestId('control-bar-area-option-area:koramangala'));

        expect(ACTIONS.goToNodeAndClearAgriculturalLocality).toHaveBeenCalledTimes(1);
        expect(ACTIONS.goToNodeAndClearAgriculturalLocality).toHaveBeenCalledWith('a:area:koramangala');
        expect(ACTIONS.enterAreasJourney).not.toHaveBeenCalled();
        expect(ACTIONS.selectArea).not.toHaveBeenCalled();
        expect(mockToast).not.toHaveBeenCalled();
      });

      it('agri-first: on resolution FAILURE, writes nothing and shows the existing stale-link toast', async () => {
        currentNav = { ...BASE_NAV, journey: 'agri-first' };
        const user = userEvent.setup();
        mockResolveMutate.mockImplementation((_params, { onError }) => {
          onError(new Error('404'));
        });
        render(<DiscoverControlBar />);
        await user.type(screen.getByTestId('control-bar-area-input'), 'koramangala');
        await user.click(screen.getByTestId('control-bar-area-option-area:koramangala'));

        expect(ACTIONS.goToNodeAndClearAgriculturalLocality).not.toHaveBeenCalled();
        expect(ACTIONS.enterAreasJourney).not.toHaveBeenCalled();
        expect(ACTIONS.selectArea).not.toHaveBeenCalled();
        expect(mockToast).toHaveBeenCalledTimes(1);
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
      });

      it('journey-less (landing, journey=null): selecting an area calls the legacy selectArea, never enterAreasJourney or the resolver — the copy fallback to area-first text is display-only and must not extend to behaviour', async () => {
        currentNav = { ...BASE_NAV, journey: null };
        const user = userEvent.setup();
        render(<DiscoverControlBar />);
        await user.type(screen.getByTestId('control-bar-area-input'), 'koramangala');
        await user.click(screen.getByTestId('control-bar-area-option-area:koramangala'));

        expect(ACTIONS.selectArea).toHaveBeenCalledTimes(1);
        expect(ACTIONS.selectArea).toHaveBeenCalledWith('area:koramangala');
        expect(mockResolveMutate).not.toHaveBeenCalled();
        expect(ACTIONS.enterAreasJourney).not.toHaveBeenCalled();
        expect(ACTIONS.goToNodeAndClearSchoolSelection).not.toHaveBeenCalled();
        expect(ACTIONS.goToNodeAndClearAgriculturalLocality).not.toHaveBeenCalled();
      });

      it('journey-less landing never toasts (selectArea is synchronous, no resolver involved)', async () => {
        currentNav = { ...BASE_NAV, journey: null };
        const user = userEvent.setup();
        render(<DiscoverControlBar />);
        await user.type(screen.getByTestId('control-bar-area-input'), 'koramangala');
        await user.click(screen.getByTestId('control-bar-area-option-area:koramangala'));

        expect(mockToast).not.toHaveBeenCalled();
      });

      it('school-first: ignores a second selection while a resolution is already in flight', async () => {
        currentNav = { ...BASE_NAV, journey: 'school-first' };
        const user = userEvent.setup();
        mockResolveIsPending = true;
        render(<DiscoverControlBar />);
        await user.type(screen.getByTestId('control-bar-area-input'), 'koramangala');
        await user.click(screen.getByTestId('control-bar-area-option-area:koramangala'));

        expect(mockResolveMutate).not.toHaveBeenCalled();
      });
    });

    it.each([
      ['area-first' as const, 'Search areas to explore'],
      ['school-first' as const, 'Search areas near a school'],
      ['agri-first' as const, 'Search corridor or locality'],
    ])('mode-aware label for journey=%s', (journey, expectedLabel) => {
      currentNav = { ...BASE_NAV, journey };
      render(<DiscoverControlBar />);
      expect(screen.getByRole('combobox', { name: expectedLabel })).toBeInTheDocument();
    });

    it('defaults to the generic label when no journey is active', () => {
      currentNav = { ...BASE_NAV, journey: null };
      render(<DiscoverControlBar />);
      expect(screen.getByRole('combobox', { name: 'Search areas to explore' })).toBeInTheDocument();
    });
  });

  // ─── AC8 — listbox semantics (tested directly on AreaAutocomplete) ──
  describe('AreaAutocomplete listbox semantics (AC8)', () => {
    const onSelectArea = vi.fn();
    beforeEach(() => onSelectArea.mockClear());

    it('exposes role=listbox / role=option once results are open', async () => {
      const user = userEvent.setup();
      render(<AreaAutocomplete areas={AREAS} journey={null} onSelectArea={onSelectArea} />);
      await user.type(screen.getByTestId('control-bar-area-input'), 'a');
      expect(screen.getByRole('listbox')).toBeInTheDocument();
      expect(screen.getAllByRole('option').length).toBeGreaterThan(0);
    });

    it('ArrowDown/ArrowUp move the highlighted option', async () => {
      const user = userEvent.setup();
      render(<AreaAutocomplete areas={AREAS} journey={null} onSelectArea={onSelectArea} />);
      const input = screen.getByTestId('control-bar-area-input');
      await user.type(input, 'a'); // matches Indiranagar, Koramangala, Whitefield (all contain "a")
      await user.keyboard('{ArrowDown}');
      expect(screen.getByRole('option', { name: 'Koramangala' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await user.keyboard('{ArrowUp}');
      expect(screen.getByRole('option', { name: 'Indiranagar' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    });

    it('Enter selects the highlighted option via the canonical areaKey', async () => {
      const user = userEvent.setup();
      render(<AreaAutocomplete areas={AREAS} journey={null} onSelectArea={onSelectArea} />);
      const input = screen.getByTestId('control-bar-area-input');
      await user.type(input, 'a');
      await user.keyboard('{ArrowDown}'); // highlight index 1 = Koramangala
      await user.keyboard('{Enter}');
      expect(onSelectArea).toHaveBeenCalledWith('area:koramangala');
    });

    it('Escape closes the listbox and returns focus to the input', async () => {
      const user = userEvent.setup();
      render(<AreaAutocomplete areas={AREAS} journey={null} onSelectArea={onSelectArea} />);
      const input = screen.getByTestId('control-bar-area-input');
      await user.type(input, 'a');
      expect(screen.getByRole('listbox')).toBeInTheDocument();
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      await waitFor(() => expect(input).toHaveFocus());
    });

    it('shows an explicit no-results state for a query matching nothing', async () => {
      const user = userEvent.setup();
      render(<AreaAutocomplete areas={AREAS} journey={null} onSelectArea={onSelectArea} />);
      await user.type(screen.getByTestId('control-bar-area-input'), 'zzz-no-match');
      expect(screen.getByTestId('control-bar-area-no-results')).toBeInTheDocument();
      expect(screen.queryAllByRole('option')).toHaveLength(0);
    });

    it('clicking an option also returns focus to the input after selection', async () => {
      const user = userEvent.setup();
      render(<AreaAutocomplete areas={AREAS} journey={null} onSelectArea={onSelectArea} />);
      const input = screen.getByTestId('control-bar-area-input');
      await user.type(input, 'koramangala');
      await user.click(screen.getByRole('option', { name: 'Koramangala' }));
      expect(onSelectArea).toHaveBeenCalledWith('area:koramangala');
      await waitFor(() => expect(input).toHaveFocus());
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  // ─── "Looking to" label — hidden only when the header hosts this bar ──
  // jsdom carries no real stylesheet, so class tokens (not computed visibility)
  // are what these assert: `lg:inline` present means the label is shown at
  // lg+ real-browser widths, exactly main's "hidden lg:inline" class — its
  // absence is what makes the label permanently hidden for the header's copy.
  // The component no longer derives `hostsHeaderControls` itself (it is
  // threaded from the single computed source at each mount site), so these
  // assert directly on the prop rather than mocking a viewport width.
  describe('"Looking to" label visibility', () => {
    it('with hostsHeaderControls omitted (defaults false, matches every mount site below the header threshold), the label keeps main\'s "hidden lg:inline" class (visible at lg+)', () => {
      render(<DiscoverControlBar />);
      const label = screen.getByText('Looking to');
      expect(label).toBeInTheDocument();
      expect(label).toHaveClass('lg:inline');
    });

    it('with hostsHeaderControls=true (the header mount site), the label loses the lg:inline override and stays hidden (the header owns naming via its own aria-label)', () => {
      render(<DiscoverControlBar hostsHeaderControls />);
      const label = screen.getByText('Looking to');
      expect(label).toHaveClass('hidden');
      expect(label).not.toHaveClass('lg:inline');
    });
  });

  // ─── Issue #2729 §1/R1/P1 — idle canonical area / draft / revert ────
  describe('idle canonical area / draft / revert (#2729 §1, R1 fix, P1 mobile-leak fix)', () => {
    // Issue #2729 R1 fix — round-2 browser verification found the FIRST fix (deriving the label
    // from `nav.resultScope`) could disagree with the Results title: `resultScope`/`rareas` is
    // the COMMITTED result scope, which can be STALE relative to the current hierarchy position
    // (`node=`, which the title follows) — e.g. right after picking a new area from this very
    // search, before a fresh scope commit lands. `canonicalAreaLabel` now reads
    // `shell.canonicalScopeLabel`, the EXACT string `AreaSelectedPanel` broadcasts as what the
    // Results heading is rendering, so the two can never independently disagree — these tests
    // drive that shared value directly instead of reconstructing `nav.resultScope`/`nav.areaKey`.
    //
    // Issue #2729 P1 fix (pre-push reviewer, BLOCKING) — `AreaSelectedPanel` broadcasts
    // `canonicalScopeLabel` unconditionally, but THIS component mounts at THREE sites
    // (`hostsHeaderControls=true` in the shared header at ≥1366; `false` in the 1024–1365 panel
    // row and the mobile row), and only the header-hosted instance may show the idle label — the
    // issue requires the other two byte-for-byte unchanged below 1366. Every test below now
    // renders with `hostsHeaderControls` explicitly, and a new "mobile/panel-row leak" block
    // covers the `false` instances.
    it('idle (header-hosted instance): shows the canonical scope label AreaSelectedPanel broadcast, not a blank field', () => {
      currentCanonicalScopeLabel = 'Koramangala';
      render(<DiscoverControlBar hostsHeaderControls />);
      const input = screen.getByTestId('control-bar-area-input') as HTMLInputElement;
      expect(input.value).toBe('Koramangala');
    });

    it('idle with no canonical scope (no AreaSelectedPanel mounted — school-first/agri-first/journey-less/landing) falls back to the empty field', () => {
      currentCanonicalScopeLabel = null;
      render(<DiscoverControlBar hostsHeaderControls />);
      const input = screen.getByTestId('control-bar-area-input') as HTMLInputElement;
      expect(input.value).toBe('');
    });

    it('MUTATION CHECK: without the idle branch (canonicalAreaLabel treated as always null) this first assertion fails — proves the idle display is actually gated on shell.canonicalScopeLabel, not a static default', () => {
      currentCanonicalScopeLabel = 'Koramangala';
      render(<DiscoverControlBar hostsHeaderControls />);
      const input = screen.getByTestId('control-bar-area-input') as HTMLInputElement;
      expect(input.value).not.toBe(''); // would read '' if the gating were mutated out
      expect(input.value).toBe('Koramangala');
    });

    it('focusing the idle field starts a draft: typing shows the typed text, not the canonical value', async () => {
      currentCanonicalScopeLabel = 'Koramangala';
      const user = userEvent.setup();
      render(<DiscoverControlBar hostsHeaderControls />);
      const input = screen.getByTestId('control-bar-area-input') as HTMLInputElement;
      await user.click(input);
      await user.type(input, 'white');
      expect(input.value).toBe('white');
    });

    it('Escape after typing an abandoned draft reverts the field to the canonical area', async () => {
      currentCanonicalScopeLabel = 'Koramangala';
      const user = userEvent.setup();
      render(<DiscoverControlBar hostsHeaderControls />);
      const input = screen.getByTestId('control-bar-area-input') as HTMLInputElement;
      await user.click(input);
      await user.type(input, 'white');
      expect(input.value).toBe('white');
      await user.keyboard('{Escape}');
      expect(input.value).toBe('Koramangala');
    });

    it('blurring (outside click) an abandoned draft reverts the field to the canonical area', async () => {
      currentCanonicalScopeLabel = 'Koramangala';
      const user = userEvent.setup();
      render(
        <div>
          <DiscoverControlBar hostsHeaderControls />
          <button type="button">elsewhere</button>
        </div>,
      );
      const input = screen.getByTestId('control-bar-area-input') as HTMLInputElement;
      await user.click(input);
      await user.type(input, 'white');
      expect(input.value).toBe('white');
      await user.click(screen.getByRole('button', { name: 'elsewhere' }));
      expect(input.value).toBe('Koramangala');
    });

    it('selecting a result still commits the new scope through the navigation-path resolver (draft/canonical wiring does not change the existing selection seam)', async () => {
      currentNav = { ...BASE_NAV, journey: 'area-first' };
      currentCanonicalScopeLabel = 'Koramangala';
      const user = userEvent.setup();
      render(<DiscoverControlBar hostsHeaderControls />);
      const input = screen.getByTestId('control-bar-area-input') as HTMLInputElement;
      await user.click(input);
      await user.type(input, 'whitefield');
      await user.click(screen.getByTestId('control-bar-area-option-area:whitefield'));
      expect(mockResolveMutate).toHaveBeenCalledWith(
        { city: 'bangalore', areaKey: 'area:whitefield' },
        expect.anything(),
      );
    });

    // Issue #2729 R2 fix — previously `isEditing` stayed true after a commit, so the field showed
    // an empty DRAFT indefinitely even though a real selection had just been made. It now leaves
    // draft mode on selection, so the field shows the CANONICAL value again immediately — here
    // that's still the OLD "Koramangala" (this static mock never round-trips a real navigation),
    // which is the honestly correct behaviour: never blank, and the NEXT render (once the async
    // selection resolves and `canonicalScopeLabel` updates for real) is what shows "Whitefield".
    it('R2 FIX: after selecting a result, the field leaves draft mode and shows the (still-current) canonical value — never blank', async () => {
      currentNav = { ...BASE_NAV, journey: 'area-first' };
      currentCanonicalScopeLabel = 'Koramangala';
      const user = userEvent.setup();
      render(<DiscoverControlBar hostsHeaderControls />);
      const input = screen.getByTestId('control-bar-area-input') as HTMLInputElement;
      await user.click(input);
      await user.type(input, 'whitefield');
      await user.click(screen.getByTestId('control-bar-area-option-area:whitefield'));
      expect(input.value).toBe('Koramangala');
      expect(input.value).not.toBe('');
    });
  });

  // ─── Issue #2729 P1 fix — mobile/1024-1365 panel-row leak regression guard ──
  describe('P1 fix — canonical idle label does NOT leak below the desktop-reskin floor', () => {
    it('panel-row instance (1024–1365, hostsHeaderControls=false): idle field stays empty even with a real canonical scope broadcast', () => {
      currentCanonicalScopeLabel = 'Koramangala';
      render(<DiscoverControlBar />); // default hostsHeaderControls=false — the panel-row/mobile-row shape
      const input = screen.getByTestId('control-bar-area-input') as HTMLInputElement;
      expect(input.value).toBe('');
    });

    it('mobile-row instance (hostsHeaderControls=false, explicit): idle field stays empty too — same component, same gate', () => {
      currentCanonicalScopeLabel = 'Koramangala';
      render(<DiscoverControlBar hostsHeaderControls={false} />);
      const input = screen.getByTestId('control-bar-area-input') as HTMLInputElement;
      expect(input.value).toBe('');
    });

    it('MUTATION CHECK: the SAME canonicalScopeLabel produces OPPOSITE idle values purely as a function of hostsHeaderControls — proves the leak fix is a real gate, not incidental', () => {
      currentCanonicalScopeLabel = 'Koramangala';
      const { unmount } = render(<DiscoverControlBar hostsHeaderControls={false} />);
      expect((screen.getByTestId('control-bar-area-input') as HTMLInputElement).value).toBe('');
      unmount();

      render(<DiscoverControlBar hostsHeaderControls />);
      expect((screen.getByTestId('control-bar-area-input') as HTMLInputElement).value).toBe('Koramangala');
    });

    // Issue #2729 (post-merge fix-verify, BLOCKING) — the delta reviewer found the new
    // draft/revert semantics (§1) were only gated on `canonicalAreaLabel` (already null below
    // 1366), NOT on the blur/Escape BEHAVIOUR itself. At 3dd9e26f (pre-#2729) the input had no
    // `onBlur` at all and `value` was always `query`, so typing a partial name then blurring KEPT
    // the text. These two tests prove that invariant now holds again at a non-header instance.
    it('non-header instance (hostsHeaderControls=false): typing a partial query then blurring KEEPS the text, matching 3dd9e26f (no onBlur wipe)', () => {
      currentCanonicalScopeLabel = 'Koramangala';
      render(
        <div>
          <div data-testid="outside-target">outside</div>
          <DiscoverControlBar /> {/* default hostsHeaderControls=false */}
        </div>,
      );
      const input = screen.getByTestId('control-bar-area-input') as HTMLInputElement;
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: 'White' } });
      expect(input.value).toBe('White');
      fireEvent.blur(input);
      // 3dd9e26f had no onBlur handler at all — blurring never touched `query`, so the typed
      // text survives. At `hostsHeaderControls=true` this same gesture would revert to the
      // canonical value; here it must not.
      expect(input.value).toBe('White');
    });

    it('non-header instance (hostsHeaderControls=false): Escape closes the listbox and refocuses WITHOUT clearing the typed query, matching 3dd9e26f exactly', async () => {
      currentCanonicalScopeLabel = 'Koramangala';
      const user = userEvent.setup();
      render(<DiscoverControlBar />); // default hostsHeaderControls=false
      const input = screen.getByTestId('control-bar-area-input') as HTMLInputElement;
      await user.click(input);
      await user.type(input, 'White');
      expect(input.value).toBe('White');
      expect(screen.getByRole('listbox')).toBeInTheDocument();

      await user.keyboard('{Escape}');

      // 3dd9e26f's Escape only closed the listbox and refocused (`closeAndRefocus`) — it never
      // touched `query`. At `hostsHeaderControls=true` Escape now ABANDONS the draft and clears
      // the text; at the non-header instance it must not.
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(input.value).toBe('White');
      await waitFor(() => expect(input).toHaveFocus());
    });
  });
});
