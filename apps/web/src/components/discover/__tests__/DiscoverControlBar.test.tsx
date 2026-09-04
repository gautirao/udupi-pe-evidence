import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import type { DiscoverUrlState, DiscoverUrlActions } from '@/hooks/useDiscoverUrlState';
import type { DiscoverArea } from '@/hooks/useDiscoverAreas';
import { CITY_CONFIG } from '@/lib/localityUtils';

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

vi.mock('@/features/discover/context/useDiscoverContext', () => ({
  useDiscoverNav: () => currentNav,
  useDiscoverActions: () => ACTIONS,
}));

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
});
