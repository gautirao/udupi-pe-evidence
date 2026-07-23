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

import { DiscoverControlBar, AreaAutocomplete, CONTROL_BAR_CITIES } from '../DiscoverControlBar';

describe('DiscoverControlBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentNav = BASE_NAV;
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
    it('filters by typed text but resolves the canonical areaKey (never display text) to selectArea', async () => {
      const user = userEvent.setup();
      render(<DiscoverControlBar />);
      const input = screen.getByTestId('control-bar-area-input');
      await user.type(input, 'koramangala');
      await user.click(screen.getByTestId('control-bar-area-option-area:koramangala'));

      expect(ACTIONS.selectArea).toHaveBeenCalledTimes(1);
      expect(ACTIONS.selectArea).toHaveBeenCalledWith('area:koramangala');
      // Never called with the display name.
      expect(ACTIONS.selectArea).not.toHaveBeenCalledWith('Koramangala');
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
