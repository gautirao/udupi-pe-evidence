import React from 'react';
import { screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { AreaSelectedPanel } from '../AreaSelectedPanel';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import { AreaSetDraftProvider } from '@/features/discover/state/AreaSetDraftContext';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import * as DiscoverContextHooks from '@/features/discover/context/useDiscoverContext';
import { toAreaSelectedPanelContract, type AreaSelectedPanelFlatTestProps } from './areaSelectedPanelTestAdapter';

const mockArea: AreaPoint = {
  areaKey: 'test-area|city|udupi',
  areaLabel: 'Test Area',
  geo_center_lat: 13.5,
  geo_center_lon: 74.5,
  bbox: null,
};

const mockListing: DiscoverCityListingItem = {
  id: '1',
  propertyType: 'apartment',
  title: 'Test Listing',
  locality: 'Test Area',
  pricePaise: 5000000,
  bedrooms: 2,
  bathrooms: 1,
};

describe('AreaSelectedPanel', () => {
  const renderPanel = (props: Partial<AreaSelectedPanelFlatTestProps> = {}) => {
    const defaultProps: AreaSelectedPanelFlatTestProps = {
      selectedArea: mockArea,
      areaListings: [mockListing],
      filters: {},
      onFiltersChange: vi.fn(),
      onSelectJourney: vi.fn(),
      onAddSchool: vi.fn(),
    };
    const { view, commands } = toAreaSelectedPanelContract({ ...defaultProps, ...props });

    // Issue #2017 — AreaSelectedPanel now consumes the DiscoverProvider
    // facade (useDiscoverNav/useDiscoverActions/useDiscoverShell) to detect
    // and render a committed multi-area AREA_SET scope, so every render
    // needs a real <DiscoverProvider> ancestor now (matches the established
    // DiscoverRightPanel.test.tsx / SchoolJourneyPanels.test.tsx convention).
    // Issue #2018 — the zero-result branch now renders
    // AreaZeroResultRecovery, which reads the shared #2017 AREA_SET draft
    // (useAreaSetDraftContext) to offer "Add" on a nearby-area suggestion.
    // That accessor THROWS outside its provider by design, so the provider
    // is wired here rather than papered over with an optional accessor that
    // would silently degrade in production too. Production mounts it above
    // both the map and panel trees (pages/MapDiscovery.tsx).
    renderWithProviders(
      <DiscoverProvider>
        <AreaSetDraftProvider>
          <AreaSelectedPanel view={view} commands={commands} />
        </AreaSetDraftProvider>
      </DiscoverProvider>,
      { router: 'browser' },
    );
  };

  describe('Quick filter chips', () => {
    it('renders property type chips', () => {
      renderPanel();
      expect(screen.getByTestId('quick-chip-apartment')).toBeInTheDocument();
      expect(screen.getByTestId('quick-chip-villa')).toBeInTheDocument();
      expect(screen.getByTestId('quick-chip-residential_plot')).toBeInTheDocument();
    });

    // Issue #2605 regression — the Residential "Plots" chip must emit the `residential_plot`
    // canonical type, not the generic `land` type. `land` and `residential_plot` are distinct,
    // independently-allowlisted values on the backend (PropertyType.java); the buyer-facing
    // Plots inventory is stored as `residential_plot`, so emitting `land` filtered to a type
    // with no matching rows and silently returned zero results. This is mutation-proof: reverting
    // the QUICK_PROPERTY_TYPES token back to 'land' makes this assertion fail.
    it('emits residential_plot (not land) when the Plots chip is clicked', () => {
      const onFiltersChange = vi.fn();
      renderPanel({ onFiltersChange });
      fireEvent.click(screen.getByTestId('quick-chip-residential_plot'));
      expect(onFiltersChange).toHaveBeenCalledWith({ propertyTypes: ['residential_plot'] });
    });

    it('renders BHK chips', () => {
      renderPanel();
      expect(screen.getByTestId('quick-chip-2-bhk')).toBeInTheDocument();
      expect(screen.getByTestId('quick-chip-3-bhk')).toBeInTheDocument();
    });

    it('toggles property type on click', () => {
      const onFiltersChange = vi.fn();
      renderPanel({ onFiltersChange });
      fireEvent.click(screen.getByTestId('quick-chip-apartment'));
      expect(onFiltersChange).toHaveBeenCalledWith({ propertyTypes: ['apartment'] });
    });

    it('toggles BHK on click', () => {
      const onFiltersChange = vi.fn();
      renderPanel({ onFiltersChange });
      fireEvent.click(screen.getByTestId('quick-chip-2-bhk'));
      expect(onFiltersChange).toHaveBeenCalledWith({ bedrooms: [2] });
    });

    it('deselects chip when clicked again', () => {
      const onFiltersChange = vi.fn();
      renderPanel({ filters: { propertyTypes: ['apartment'] }, onFiltersChange });
      fireEvent.click(screen.getByTestId('quick-chip-apartment'));
      expect(onFiltersChange).toHaveBeenCalledWith({ propertyTypes: undefined });
    });

    it('highlights active chips', () => {
      renderPanel({ filters: { propertyTypes: ['apartment'], bedrooms: [2] } });
      // Residential controls use default active --accent (bg-copper) when active.
      expect(screen.getByTestId('quick-chip-apartment')).toHaveClass('bg-copper');
      expect(screen.getByTestId('quick-chip-2-bhk')).toHaveClass('bg-copper');
      expect(screen.getByTestId('quick-chip-villa')).not.toHaveClass('bg-copper');
    });
  });

  // Issue #2023 — Budget (fixed bands) and Ready-to-move chips, from the frozen mock
  // (docs/design/retrends-design-system/ui_kits/new_discover/src/ExpPanel.jsx).
  describe('Budget and Ready to move chips', () => {
    it('renders budget chips', () => {
      renderPanel();
      expect(screen.getByTestId('quick-chip-budget-any')).toBeInTheDocument();
      expect(screen.getByTestId('quick-chip-budget-5000000')).toBeInTheDocument();
      expect(screen.getByTestId('quick-chip-budget-8000000')).toBeInTheDocument();
      expect(screen.getByTestId('quick-chip-budget-12000000')).toBeInTheDocument();
    });

    it('renders the ready-to-move chip', () => {
      renderPanel();
      expect(screen.getByTestId('quick-chip-ready-to-move')).toBeInTheDocument();
    });

    it('sets priceMax (and clears priceMin) when a budget chip is clicked', () => {
      const onFiltersChange = vi.fn();
      renderPanel({ onFiltersChange });
      fireEvent.click(screen.getByTestId('quick-chip-budget-5000000'));
      expect(onFiltersChange).toHaveBeenCalledWith({ priceMin: undefined, priceMax: 5_000_000 });
    });

    it('clears priceMin/priceMax when "Any price" is clicked', () => {
      const onFiltersChange = vi.fn();
      renderPanel({ filters: { priceMax: 8_000_000 }, onFiltersChange });
      fireEvent.click(screen.getByTestId('quick-chip-budget-any'));
      expect(onFiltersChange).toHaveBeenCalledWith({ priceMin: undefined, priceMax: undefined });
    });

    it('sets readyToMove on click', () => {
      const onFiltersChange = vi.fn();
      renderPanel({ onFiltersChange });
      fireEvent.click(screen.getByTestId('quick-chip-ready-to-move'));
      expect(onFiltersChange).toHaveBeenCalledWith({ readyToMove: true });
    });

    it('clears readyToMove when toggled again', () => {
      const onFiltersChange = vi.fn();
      renderPanel({ filters: { readyToMove: true }, onFiltersChange });
      fireEvent.click(screen.getByTestId('quick-chip-ready-to-move'));
      expect(onFiltersChange).toHaveBeenCalledWith({ readyToMove: undefined });
    });

    // Issue #2555 — the owner-approved mock specifies COPPER as Budget's selected treatment,
    // deliberately distinct from the gold used by the family / subtype / area controls so the
    // buyer can tell at a glance which axis they just narrowed. These arms previously pinned
    // navy (`bg-primary`); the token changed with the approved design, the contract did not.
    it('highlights the active budget chip', () => {
      renderPanel({ filters: { priceMax: 8_000_000 } });
      expect(screen.getByTestId('quick-chip-budget-8000000')).toHaveClass('bg-copper');
      expect(screen.getByTestId('quick-chip-budget-any')).not.toHaveClass('bg-copper');
      expect(screen.getByTestId('quick-chip-budget-5000000')).not.toHaveClass('bg-copper');
    });

    it('highlights "Any price" as active when no priceMax is set', () => {
      renderPanel();
      expect(screen.getByTestId('quick-chip-budget-any')).toHaveClass('bg-copper');
    });

    it('highlights the ready-to-move chip when active', () => {
      renderPanel({ filters: { readyToMove: true } });
      expect(screen.getByTestId('quick-chip-ready-to-move')).toHaveClass('bg-evergreen-tint');
      expect(screen.getByTestId('quick-chip-ready-to-move')).toHaveAttribute('aria-pressed', 'true');
    });

    it('is not highlighted when readyToMove is not set', () => {
      renderPanel();
      expect(screen.getByTestId('quick-chip-ready-to-move')).not.toHaveClass('bg-evergreen-tint');
      expect(screen.getByTestId('quick-chip-ready-to-move')).toHaveAttribute('aria-pressed', 'false');
    });
  });

  // Issue #2023 code-review follow-up — a surface whose listings hook can't
  // actually filter on readyToMove (e.g. the area-leaf surface backed by
  // useDiscoverCityListings) must render the chip disabled/inert instead of
  // letting the user toggle it into an active-looking state with no effect.
  describe('isReadyToMoveSupported', () => {
    it('renders the chip disabled and clicking it has no effect when unsupported', () => {
      const onFiltersChange = vi.fn();
      renderPanel({ onFiltersChange, isReadyToMoveSupported: false });
      const chip = screen.getByTestId('quick-chip-ready-to-move');
      expect(chip).toBeDisabled();
      fireEvent.click(chip);
      expect(onFiltersChange).not.toHaveBeenCalled();
    });

    it('gives the disabled chip an explanatory title', () => {
      renderPanel({ isReadyToMoveSupported: false });
      expect(screen.getByTestId('quick-chip-ready-to-move')).toHaveAttribute(
        'title',
        expect.stringContaining('Browse all'),
      );
    });

    it('never renders aria-pressed=true when unsupported, even if readyToMove is already truthy', () => {
      renderPanel({ filters: { readyToMove: true }, isReadyToMoveSupported: false });
      const chip = screen.getByTestId('quick-chip-ready-to-move');
      expect(chip).toHaveAttribute('aria-pressed', 'false');
      expect(chip).not.toHaveClass('bg-evergreen-tint');
      expect(chip).toBeDisabled();
    });

    it('keeps the chip enabled and functional when isReadyToMoveSupported is omitted (default true)', () => {
      const onFiltersChange = vi.fn();
      renderPanel({ onFiltersChange });
      const chip = screen.getByTestId('quick-chip-ready-to-move');
      expect(chip).not.toBeDisabled();
      fireEvent.click(chip);
      expect(onFiltersChange).toHaveBeenCalledWith({ readyToMove: true });
    });

    it('keeps the chip enabled when isReadyToMoveSupported is explicitly true', () => {
      const onFiltersChange = vi.fn();
      renderPanel({ onFiltersChange, isReadyToMoveSupported: true });
      const chip = screen.getByTestId('quick-chip-ready-to-move');
      expect(chip).not.toBeDisabled();
      fireEvent.click(chip);
      expect(onFiltersChange).toHaveBeenCalledWith({ readyToMove: true });
    });
  });

  // Issue #2017 (release-blocking fix) — the single-Area landing now renders
  // the two-tile "Schools in X / Add nearby areas" row (`AreaSetTwoTileRow`)
  // instead of the old standalone `add-school-cta` card. The schools tile
  // keeps testid `area-set-schools-tile` and the SAME onAddSchool wiring;
  // only the surrounding markup/testid changed (see PR #2424 STATE
  // MAP/VISUAL CONTRACT comment for the mock parity this restores).
  describe('School CTA (two-tile row)', () => {
    it('renders the schools tile', () => {
      renderPanel();
      expect(screen.getByTestId('area-set-schools-tile')).toBeInTheDocument();
    });

    // Issue #1157 — the tile enters the area-first school-picking sub-step via
    // onAddSchool (which keeps journey=area-first), NOT onSelectJourney('school-first')
    // (which flipped the journey and made Back delete the area).
    it('calls onAddSchool (not onSelectJourney) on tile click', () => {
      const onAddSchool = vi.fn();
      const onSelectJourney = vi.fn();
      renderPanel({ onAddSchool, onSelectJourney });
      fireEvent.click(screen.getByTestId('area-set-schools-tile'));
      expect(onAddSchool).toHaveBeenCalledTimes(1);
      expect(onSelectJourney).not.toHaveBeenCalled();
    });

    it('calls openAreaSetDraft (and NOT setMobileView MAP) on Add nearby areas tile click', () => {
      const openAreaSetDraft = vi.fn();
      const setMobileView = vi.fn();
      vi.spyOn(DiscoverContextHooks, 'useDiscoverShell').mockReturnValue({
        mobileView: 'LIST',
        setMobileView,
        isMobileShell: false,
        isAreaSetDraftOpen: false,
        openAreaSetDraft,
        closeAreaSetDraft: vi.fn(),
        fitAreaSet: vi.fn(),
        focusAreaSetMember: vi.fn(),
        registerAreaSetCameraActions: vi.fn(),
        getAreaSetCameraRestoreRequest: vi.fn(() => null),
        setAreaSetCameraRestoreRequest: vi.fn(),
      });
      renderPanel();
      fireEvent.click(screen.getByTestId('area-set-add-nearby-tile'));
      expect(openAreaSetDraft).toHaveBeenCalledTimes(1);
      expect(setMobileView).not.toHaveBeenCalledWith('MAP');
    });
  });

  // Issue #1817 (AC7) — this block predates the cause-routed empty state (design §7)
  // and is superseded by the "AC7 — empty-state cause routing" describe block below,
  // which covers all 4 causes against the shared EmptyState component + testid
  // (area-empty-state / data-empty-cause). Kept here, updated in place, so the
  // "clears/preserves other filters" behavioural assertions are not lost.
  describe('Empty state', () => {
    // Issue #2018 — the AREA/AREA_SET zero-result branch now renders the
    // recovery stack instead of the generic EmptyState, so the headings
    // below moved. The CAUSE routing itself is unchanged and still owned by
    // deriveDiscoverEmptyStateCopy (covered by emptyStateCopy.test.ts).
    it('names the area honestly when it is genuinely empty (no filters, no search)', () => {
      renderPanel({ areaListings: [] });
      expect(screen.getByTestId('area-zero-recovery-heading')).toHaveTextContent(
        'Test Area has no homes listed right now',
      );
      // Nothing to clear, so no clear action is offered.
      expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
    });

    it('shows filtered message with clear button when filters active and no listings', () => {
      renderPanel({ areaListings: [], filters: { propertyTypes: ['apartment'] } });
      expect(screen.getByTestId('area-zero-recovery-heading')).toHaveTextContent(
        'No matching homes in Test Area',
      );
      expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
    });

    it('clears property filters on clear button click', () => {
      const onFiltersChange = vi.fn();
      renderPanel({
        areaListings: [],
        filters: { propertyTypes: ['apartment'], bedrooms: [2] },
        onFiltersChange,
      });
      fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
      expect(onFiltersChange).toHaveBeenCalledWith({
        propertyTypes: undefined,
        bedrooms: undefined,
        priceMin: undefined,
        priceMax: undefined,
        localities: undefined,
        sellerTypes: undefined,
        backOnMarket: undefined,
        newToMarket: undefined,
        reraRegistered: undefined,
        readyToMove: undefined,
      });
    });

    it('preserves school and polygon filters when clearing property filters', () => {
      const onFiltersChange = vi.fn();
      renderPanel({
        areaListings: [],
        filters: {
          propertyTypes: ['apartment'],
          bedrooms: [2],
          schoolLat: 13.5,
          schoolLon: 74.5,
          polygon: [[13.5, 74.5], [13.6, 74.6]],
        },
        onFiltersChange,
      });
      fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
      const callArg = onFiltersChange.mock.calls[0][0];
      expect(callArg.schoolLat).toBe(13.5);
      expect(callArg.schoolLon).toBe(74.5);
      expect(callArg.polygon).toEqual([[13.5, 74.5], [13.6, 74.6]]);
      expect(callArg.propertyTypes).toBeUndefined();
      expect(callArg.bedrooms).toBeUndefined();
    });
  });

  describe('Listings rendering', () => {
    it('renders property cards when listings present', () => {
      renderPanel({ areaListings: [mockListing] });
      expect(screen.getByText('Test Listing')).toBeInTheDocument();
    });

    it('renders loading skeletons when isLoadingListings is true', () => {
      renderPanel({ isLoadingListings: true });
      expect(screen.getAllByTestId('listing-skeleton')).toHaveLength(3);
    });
  });

  describe('Search input', () => {
    it('shows area-scoped search input when onSearchChange provided', () => {
      renderPanel({ onSearchChange: vi.fn() });
      // Issue #1606 — placeholder is now area-scoped ("Search properties in {area}").
      expect(screen.getByPlaceholderText('Search properties in Test Area')).toBeInTheDocument();
    });

    it('calls onSearchChange on input change', () => {
      const onSearchChange = vi.fn();
      renderPanel({ onSearchChange });
      const input = screen.getByPlaceholderText('Search properties in Test Area');
      fireEvent.change(input, { target: { value: 'test' } });
      expect(onSearchChange).toHaveBeenCalledWith('test');
    });
  });

  // ── Issue #1494 — intent-aware copy (AC4/AC10 area journey) ──────────────

  describe('intent-aware result summary and empty state (Issue #1494)', () => {
    it('shows "for sale" result summary by default (intent=buy)', () => {
      renderPanel({ areaListings: [mockListing] });
      expect(screen.getByTestId('area-result-summary')).toHaveTextContent('for sale');
      expect(screen.getByTestId('area-result-summary')).toHaveTextContent('Test Area');
    });

    it('shows "for rent" result summary when intent=rent', () => {
      renderPanel({ areaListings: [mockListing], intent: 'rent' });
      expect(screen.getByTestId('area-result-summary')).toHaveTextContent('for rent');
      // Issue #1606 — summary now reads "{n} verified {property} for {sale|rent} in {area}".
      expect(screen.getByTestId('area-result-summary')).toHaveTextContent('1 verified property for rent in Test Area');
    });

    // Issue #1817 (code-review follow-up, AC5) — MapDiscovery now precomputes the
    // result-summary text via the SAME formatDiscoverBadgeCopy(discoverBadge, ...) call
    // that drives the map badge pill, and forwards it as `areaResultSummaryText`. When
    // provided, the panel must render it VERBATIM (not its own local {count}-based
    // text) — this is what guarantees the panel stat and the map badge can never diverge.
    it('renders the wired areaResultSummaryText verbatim when provided (M-of-N form)', () => {
      renderPanel({
        areaListings: [mockListing],
        areaResultSummaryText: '1 of 18 match your filters in Test Area',
      });
      expect(screen.getByTestId('area-result-summary-text')).toHaveTextContent(
        '1 of 18 match your filters in Test Area',
      );
      expect(screen.queryByText(/verified property for sale/)).not.toBeInTheDocument();
    });

    it('falls back to the local "{count} verified..." text when areaResultSummaryText is not provided (back-compat)', () => {
      renderPanel({ areaListings: [mockListing] });
      expect(screen.getByTestId('area-result-summary-text')).toHaveTextContent(
        '1 verified property for sale in Test Area',
      );
    });

    // Issue #1817 (AC7) — genuinely-empty (no filters/search) now routes through the
    // shared cause-based copy ("No listings here yet"), replacing the old intent-only
    // "No properties for {sale|rent} in this area yet" wording. Cause routing itself
    // (filters/search/both) is covered in the "AC7 — empty-state cause routing" block.
    it('routes the genuinely-empty cause through the recovery stack (no filters/search)', () => {
      renderPanel({ areaListings: [] });
      expect(screen.getByTestId('area-zero-result-recovery')).toHaveAttribute(
        'data-empty-cause',
        'empty',
      );
      expect(screen.getByTestId('area-zero-recovery-heading')).toHaveTextContent(
        'Test Area has no homes listed right now',
      );
    });
  });

  // ── PR #2180 review fix — header hero-count truthfulness ─────────────────
  // areaListings is the bounded per-area fetch slice (caller wires
  // useDiscoverCityListings with limitPerArea: 50), not an authoritative
  // total — so the header's hero count must never be labelled in a way that
  // implies it IS the total (e.g. bare "for sale"/"for rent"), since for any
  // area with more matches than the fetch limit that would silently
  // understate the real total.
  describe('Header hero count (PR #2180 review fix)', () => {
    it('labels the hero count "shown", never implying it is the area total', () => {
      // areaListings here stands in for a bounded fetch slice (3 items),
      // while areaResultSummaryText encodes a true total of 87 — via the
      // same "M of N" form the map badge uses — that exceeds it.
      renderPanel({
        areaListings: [mockListing, { ...mockListing, id: '2' }, { ...mockListing, id: '3' }],
        areaResultSummaryText: '3 of 87 match your filters in Test Area',
      });
      const hero = screen.getByTestId('area-header-count');
      expect(hero).toHaveTextContent('3');
      expect(hero).toHaveTextContent('shown for sale');
      // The true total (87) must never appear in the hero block — this
      // component has no wiring to it and must not imply one.
      expect(hero).not.toHaveTextContent('87');
      // The pre-fix wording ("3" + bare "for sale") reads as "3 properties
      // for sale, total" — assert the bare (total-implying) form is gone.
      expect(within(hero).queryByText('for sale', { exact: true })).not.toBeInTheDocument();
    });

    it('shows "shown for rent" when intent=rent', () => {
      renderPanel({ areaListings: [mockListing], intent: 'rent' });
      expect(screen.getByTestId('area-header-count')).toHaveTextContent('shown for rent');
    });
  });

  // ── Issue #1817 (AC7) — empty-state cause routing (design §7) ─────────────
  // Each cause (filters / search / both / genuinely-empty) must render distinct,
  // honest copy + the correct primary/secondary actions — never a generic
  // "no properties" message that could be misread as "this area is empty".

  describe('AC7 — empty-state cause routing', () => {
    it('filters-only: "No homes match these filters" + Clear filters action', () => {
      const onFiltersChange = vi.fn();
      renderPanel({
        areaListings: [],
        filters: { propertyTypes: ['apartment'] },
        onFiltersChange,
      });
      const empty = screen.getByTestId('area-zero-result-recovery');
      expect(empty).toHaveAttribute('data-empty-cause', 'filters');
      expect(within(empty).getByTestId('area-zero-recovery-heading')).toHaveTextContent(
        'No matching homes in Test Area',
      );
      const clearBtn = within(empty).getByRole('button', { name: 'Clear filters' });
      fireEvent.click(clearBtn);
      expect(onFiltersChange).toHaveBeenCalledWith(
        expect.objectContaining({ propertyTypes: undefined, bedrooms: undefined, priceMin: undefined, priceMax: undefined }),
      );
    });

    it('search-only: \'No results for "{q}"\' + Clear search action', () => {
      const onSearchChange = vi.fn();
      renderPanel({
        areaListings: [],
        searchQuery: 'corner plot',
        onSearchChange,
      });
      const empty = screen.getByTestId('area-zero-result-recovery');
      expect(empty).toHaveAttribute('data-empty-cause', 'search');
      // Issue #2018 — the search term is preserved and named back to the
      // shopper on the scope/filter line, so the state says exactly what was
      // searched rather than dropping it.
      expect(within(empty).getByTestId('area-zero-recovery-scope-line')).toHaveTextContent(
        'corner plot',
      );
      // Scoped to the empty-state block — the search input's own × (data-testid
      // area-search-clear) also carries aria-label "Clear search" and would otherwise
      // make this query ambiguous.
      fireEvent.click(within(empty).getByRole('button', { name: 'Clear search' }));
      expect(onSearchChange).toHaveBeenCalledWith('');
    });

    it('filters + search both active: "No homes match your search and filters" with Clear search AND Clear filters', () => {
      const onFiltersChange = vi.fn();
      const onSearchChange = vi.fn();
      renderPanel({
        areaListings: [],
        filters: { propertyTypes: ['apartment'] },
        searchQuery: 'corner plot',
        onFiltersChange,
        onSearchChange,
      });
      const empty = screen.getByTestId('area-zero-result-recovery');
      expect(empty).toHaveAttribute('data-empty-cause', 'both');
      expect(within(empty).getByTestId('area-zero-recovery-heading')).toHaveTextContent(
        'No matching homes in Test Area',
      );
      expect(within(empty).getByRole('button', { name: 'Clear search' })).toBeInTheDocument();
      expect(within(empty).getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
      fireEvent.click(within(empty).getByRole('button', { name: 'Clear search' }));
      expect(onSearchChange).toHaveBeenCalledWith('');
      fireEvent.click(within(empty).getByRole('button', { name: 'Clear filters' }));
      expect(onFiltersChange).toHaveBeenCalled();
    });

    it('genuinely empty (N=0, no filters/search): area confirmed valid, no filter/search action offered', () => {
      renderPanel({ areaListings: [] });
      const empty = screen.getByTestId('area-zero-result-recovery');
      expect(empty).toHaveAttribute('data-empty-cause', 'empty');
      // Issue #2018 "zero-content canonical areas" — the state must confirm
      // the area is valid and say nothing is listed today, never imply that
      // filters are hiding listings that do not exist.
      expect(within(empty).getByTestId('area-zero-recovery-heading')).toHaveTextContent(
        'Test Area has no homes listed right now',
      );
      expect(within(empty).getByTestId('area-zero-recovery-note')).toHaveTextContent(
        'not a filtered-out result',
      );
      expect(within(empty).queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
      expect(within(empty).queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument();
    });
  });

  // ── Issue #2018 requirement A — error is not empty ────────────────────────
  // A failed listings request must never reach the zero-result recovery: that
  // state asserts "no matching listings in {scope}" as a fact about the
  // marketplace, and a request that never returned cannot support it.
  describe('Issue #2018 — a failed request is not an empty market', () => {
    it('first-load failure renders the request-failure state, never the zero-result recovery', () => {
      renderPanel({ areaListings: [], isListingsError: true, onRetryListings: vi.fn() });

      const error = screen.getByTestId('area-listings-error');
      expect(within(error).getByText('We could not load these results')).toBeInTheDocument();
      expect(
        within(error).getByText(/This is a request failure, not an empty market/),
      ).toBeInTheDocument();
      // The load-bearing assertion: the recovery UI is unreachable here.
      expect(screen.queryByTestId('area-zero-result-recovery')).not.toBeInTheDocument();
    });

    it('Retry on a first-load failure re-issues the failed request', () => {
      const onRetryListings = vi.fn();
      renderPanel({ areaListings: [], isListingsError: true, onRetryListings });

      fireEvent.click(screen.getByTestId('area-listings-error-retry'));
      expect(onRetryListings).toHaveBeenCalledTimes(1);
    });

    it('omits Retry rather than rendering a dead button when no refetch is wired', () => {
      renderPanel({ areaListings: [], isListingsError: true });
      expect(screen.getByTestId('area-listings-error')).toBeInTheDocument();
      expect(screen.queryByTestId('area-listings-error-retry')).not.toBeInTheDocument();
    });

    it('a failure AFTER a good load keeps the last results and shows an inline retry banner', () => {
      const onRetryListings = vi.fn();
      renderPanel({ areaListings: [mockListing], isListingsError: true, onRetryListings });

      // The issue's rule: "the last successful results preserved where available".
      expect(screen.getByText('Test Listing')).toBeInTheDocument();
      expect(screen.getByTestId('area-listings-retry-banner')).toHaveTextContent(
        "Couldn't refresh these results",
      );
      // Not the full-replace state, and not the recovery either.
      expect(screen.queryByTestId('area-listings-error')).not.toBeInTheDocument();
      expect(screen.queryByTestId('area-zero-result-recovery')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('area-listings-retry-banner-btn'));
      expect(onRetryListings).toHaveBeenCalledTimes(1);
    });

    it('a genuine zero with no error still gets the recovery, not an error state', () => {
      renderPanel({ areaListings: [], filters: { propertyTypes: ['apartment'] } });
      expect(screen.getByTestId('area-zero-result-recovery')).toBeInTheDocument();
      expect(screen.queryByTestId('area-listings-error')).not.toBeInTheDocument();
      expect(screen.queryByTestId('area-listings-retry-banner')).not.toBeInTheDocument();
    });

    it('loading still wins over the error branch (no flash of failure mid-refetch)', () => {
      renderPanel({ areaListings: [], isListingsError: true, isLoadingListings: true });
      expect(screen.getAllByTestId('listing-skeleton').length).toBeGreaterThan(0);
      expect(screen.queryByTestId('area-listings-error')).not.toBeInTheDocument();
    });
  });

  // ── Round-3 design-fidelity refinement (Issue #1606) ──────────────────────

  describe('F1 — Area-first pill and Start-over button (round-3)', () => {
    it('renders the area-first pill with bg-secondary (navy), NOT a copper class', () => {
      const { view, commands } = toAreaSelectedPanelContract({
        selectedArea: mockArea,
        areaListings: [mockListing],
        filters: {},
        onFiltersChange: vi.fn(),
        onSelectJourney: vi.fn(),
        onAddSchool: vi.fn(),
        journey: 'area-first',
      });
      const { container } = renderWithProviders(
        <DiscoverProvider>
          <AreaSelectedPanel view={view} commands={commands} />
        </DiscoverProvider>,
        { router: 'browser' },
      );
      // The pill is a <span> with text 'Area-first'. Use querySelector for specificity.
      const pill = container.querySelector('span.bg-secondary');
      expect(pill).not.toBeNull();
      expect(pill!.className).toContain('bg-secondary');
      expect(pill!.className).not.toContain('bg-copper');
    });

    it('renders the Layers icon alongside the area-first pill (not MapPin)', () => {
      const { view, commands } = toAreaSelectedPanelContract({
        selectedArea: mockArea,
        areaListings: [mockListing],
        filters: {},
        onFiltersChange: vi.fn(),
        onSelectJourney: vi.fn(),
        onAddSchool: vi.fn(),
        journey: 'area-first',
      });
      const { container } = renderWithProviders(
        <DiscoverProvider>
          <AreaSelectedPanel view={view} commands={commands} />
        </DiscoverProvider>,
        { router: 'browser' },
      );
      // The pill span carries bg-secondary and contains the Layers svg icon.
      const pill = container.querySelector('span.bg-secondary');
      expect(pill).not.toBeNull();
      const svg = pill!.querySelector('svg');
      expect(svg).not.toBeNull();
    });

    it('renders the Start-over button when journey + onStartOver are both provided', () => {
      const onStartOver = vi.fn();
      renderPanel({ journey: 'area-first', onStartOver });
      expect(screen.getByTestId('start-over-button')).toBeInTheDocument();
    });

    it('does NOT render the Start-over button when onStartOver is absent', () => {
      renderPanel({ journey: 'area-first' });
      expect(screen.queryByTestId('start-over-button')).not.toBeInTheDocument();
    });

    it('Start-over button has outline variant (contains "border" in class or role button)', () => {
      const onStartOver = vi.fn();
      renderPanel({ journey: 'area-first', onStartOver });
      const btn = screen.getByTestId('start-over-button');
      expect(btn).toBeInTheDocument();
      // Outline variant renders border classes.
      expect(btn.className).toMatch(/border/);
    });

    it('Start-over button has rounded-full class', () => {
      const onStartOver = vi.fn();
      renderPanel({ journey: 'area-first', onStartOver });
      const btn = screen.getByTestId('start-over-button');
      expect(btn.className).toContain('rounded-full');
    });

    // Issue #1817 (AC8) — an area is selected in this panel (deeper than a region),
    // so Start over always confirms first (design §8) rather than resetting immediately.
    // NOTE: raised timeout (default is 5000ms) — this is a proven test-environment
    // timing artifact, not a real bug. Investigation (see PR description / issue
    // #2017 notes) instrumented requestAnimationFrame, MutationObserver/TreeWalker,
    // setTimeout/setInterval registration+fire time, queueMicrotask, and
    // Promise.prototype.then call volume across the full async gap between the
    // click and the popover becoming visible. Findings:
    //   - The popover's presence is confirmed by a *synchronous* query immediately
    //     after the click (before any awaiting) — Radix/floating-ui already render
    //     it in the same tick, so there is zero real-user-facing delay.
    //   - No busy loop was observed: rAF/TreeWalker/queueMicrotask call counts were
    //     zero during the stall, and Promise.prototype.then call volume stayed in
    //     the single digits (no runaway microtask chain).
    //   - The only thing that stalls is @testing-library/react's internal
    //     asyncWrapper's zero-delay `setTimeout(() => resolve(), 0)` (pure.js) used
    //     purely to flush pending microtasks after `findByTestId` resolves — a
    //     test-harness implementation detail with no browser-runtime analog.
    //   - The stall reproduces identically running this test in isolation (with
    //     all 70 sibling tests skipped via `-t`), ruling out cross-test leakage.
    //   - This machine runs multiple concurrent background agent processes; the
    //     delay pattern (an otherwise-idle 0ms Node timer taking >10s to fire, with
    //     no JS-observable cause) is consistent with OS-level scheduling
    //     contention, not application or test logic.
    it('clicking Start-over shows a confirm popover; confirming calls onStartOver', async () => {
      const onStartOver = vi.fn();
      renderPanel({ journey: 'area-first', onStartOver });
      fireEvent.click(screen.getByTestId('start-over-button'));
      expect(onStartOver).not.toHaveBeenCalled();
      expect(await screen.findByTestId('start-over-confirm-popover')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('start-over-confirm'));
      expect(onStartOver).toHaveBeenCalledTimes(1);
    }, 20000);

    it('renders "Properties in {area}" headline', () => {
      renderPanel();
      expect(screen.getByRole('heading', { name: 'Properties in Test Area' })).toBeInTheDocument();
    });
  });

  describe('F2 — Controls card and property-type filter card (round-3)', () => {
    // Issue #1953 (product-owner ruling, Buy/Rent single-owner) — the in-panel
    // "Looking to" controls card (this describe block used to assert its
    // bg-card styling) was RETIRED along with the Buy/Rent control it existed
    // solely to hold: City had already been removed from it in build step 6,
    // and Buy/Rent was its only remaining occupant. The persistent
    // DiscoverControlBar is now the SOLE Buy/Rent control on /discover.
    // Replaces the old styling assertion with the stronger single-owner
    // invariant: no Buy/Rent control (and therefore no now-vestigial "Looking
    // to" wrapper) renders here even when onIntentChange/intent are supplied.
    it('renders no Buy/Rent control (the "Looking to" controls card is retired), even when onIntentChange/intent are provided', () => {
      {
        const { view, commands } = toAreaSelectedPanelContract({
          selectedArea: mockArea,
          areaListings: [mockListing],
          filters: {},
          onFiltersChange: vi.fn(),
          onSelectJourney: vi.fn(),
          onAddSchool: vi.fn(),
          intent: 'buy',
          onIntentChange: vi.fn(),
        });
        renderWithProviders(
          <DiscoverProvider>
            <AreaSelectedPanel view={view} commands={commands} />
          </DiscoverProvider>,
          { router: 'browser' },
        );
      }
      expect(screen.queryByTestId('intent-selector')).not.toBeInTheDocument();
      expect(screen.queryByText('Looking to')).not.toBeInTheDocument();
      // The intent-aware price helper (a separate, unconditional element) is unaffected.
      expect(screen.getByTestId('area-intent-helper')).toBeInTheDocument();
    });

    // Issue #2596 — the white card container box (bg-card) wrapping filter controls was removed
    // so filter controls render directly on the clean canvas surface (#F6F5F2 / bg-background).
    it('property-type filter sits directly on the clean canvas surface without bg-card wrapper', () => {
      {
        const { view, commands } = toAreaSelectedPanelContract({
          selectedArea: mockArea,
          areaListings: [mockListing],
          filters: {},
          onFiltersChange: vi.fn(),
          onSelectJourney: vi.fn(),
          onAddSchool: vi.fn(),
        });
        renderWithProviders(
          <DiscoverProvider>
            <AreaSelectedPanel view={view} commands={commands} />
          </DiscoverProvider>,
          { router: 'browser' },
        );
      }
      // The quick-filter block sits on the canvas background.
      const allChip = screen.getByTestId('quick-chip-all');
      // Walk up to verify no bg-card wrapper exists around the quick filter controls.
      let node: HTMLElement | null = allChip.parentElement;
      let foundBgCard = false;
      while (node && node !== document.body) {
        if (node.className && node.className.includes('bg-card')) {
          foundBgCard = true;
          break;
        }
        node = node.parentElement;
      }
      expect(foundBgCard).toBe(false);
    });

    it('active property-type chip uses bg-copper (--accent)', () => {
      renderPanel({ filters: { propertyTypes: ['apartment'] } });
      expect(screen.getByTestId('quick-chip-apartment')).toHaveClass('bg-copper');
    });

    it('active BHK chip uses bg-copper (--accent)', () => {
      renderPanel({ filters: { bedrooms: [2] } });
      expect(screen.getByTestId('quick-chip-2-bhk')).toHaveClass('bg-copper');
    });
  });

  // ── Issue #1606 — area-first results redesign ──────────────────────────────

  describe('Header + headline (Issue #1606)', () => {
    it('renders the "Properties in {area}" headline and area-derived subcopy', () => {
      renderPanel();
      expect(screen.getByRole('heading', { name: 'Properties in Test Area' })).toBeInTheDocument();
      expect(
        screen.getByText('Explore verified listings around Test Area, with map context and area-first filters.'),
      ).toBeInTheDocument();
    });

    it('shows the intent-aware price helper (buy default)', () => {
      renderPanel();
      expect(screen.getByTestId('area-intent-helper')).toHaveTextContent('Showing sale prices in ₹ for Test Area');
    });

    it('shows rent price helper when intent=rent', () => {
      renderPanel({ intent: 'rent' });
      expect(screen.getByTestId('area-intent-helper')).toHaveTextContent('Showing rent prices in ₹ for Test Area');
    });

    it('renders the verification trust strip', () => {
      renderPanel();
      expect(screen.getByTestId('area-trust-strip')).toHaveTextContent('Every listing is verified.');
    });
  });

  describe('Verified result count (Issue #1606)', () => {
    it('reads "{n} verified properties for sale in {area}"', () => {
      renderPanel({ areaListings: [mockListing, { ...mockListing, id: '2' }] });
      expect(screen.getByTestId('area-result-summary')).toHaveTextContent('2 verified properties for sale in Test Area');
    });
  });

  describe('"All" property-type chip (Issue #1606)', () => {
    it('renders an All chip that is active when no property type is selected', () => {
      renderPanel({ filters: {} });
      // Residential controls use default active --accent (bg-copper).
      expect(screen.getByTestId('quick-chip-all')).toHaveClass('bg-copper');
    });

    it('All chip is not active when a property type filter is set', () => {
      renderPanel({ filters: { propertyTypes: ['apartment'] } });
      expect(screen.getByTestId('quick-chip-all')).not.toHaveClass('bg-copper');
    });

    it('clicking All clears the property-type filter (preserving bedrooms)', () => {
      const onFiltersChange = vi.fn();
      renderPanel({ filters: { propertyTypes: ['apartment'], bedrooms: [2] }, onFiltersChange });
      fireEvent.click(screen.getByTestId('quick-chip-all'));
      expect(onFiltersChange).toHaveBeenCalledWith({ propertyTypes: undefined, bedrooms: [2] });
    });
  });

  describe('Controls card — City + Buy/Rent (Issue #1606, retired in #1953)', () => {
    // Issue #1953 (product-owner ruling) — the in-panel Buy/Rent control this
    // describe block used to assert was REMOVED (single-owner: the persistent
    // DiscoverControlBar is now the SOLE Buy/Rent control on /discover). Both
    // cases — onIntentChange provided or not — now converge on "never renders".
    it('never renders the in-panel intent selector, even when onIntentChange is provided', () => {
      renderPanel({ onIntentChange: vi.fn() });
      expect(screen.queryByTestId('intent-selector')).not.toBeInTheDocument();
    });

    it('omits the controls card when neither city nor intent handlers are provided', () => {
      renderPanel();
      expect(screen.queryByTestId('intent-selector')).not.toBeInTheDocument();
    });
  });

  // ── Issue #2596 — area-leaf information architecture, second reorder ──────
  //
  // SUPERSEDES ISSUE #2084 AC8's ordering clause. AC8 ruled "school CTA ->
  // search -> filters"; the approved kit (ExpPanel.jsx) puts the FILTERS above
  // the heading — desktop in the fixed top section (L886), mobile at the top of
  // the scrolling body (L894-898) — and then, inside `EPAreaActions` (L371),
  // the search box (L379) BEFORE the two-tile grid (L385). The product owner
  // ruled this order for #2596 knowing AC8 said otherwise, so this assertion is
  // updated to the newly approved order rather than deleted. AC8's OTHER claim
  // — that the school shortcut is not a descendant of the quick-filter box —
  // is unchanged and still asserted below.
  describe('#2596 — landmark DOM order and school-CTA placement', () => {
    it('renders filters -> heading -> search -> recommendation tiles -> result-count -> cards in that DOM order', () => {
      renderPanel({ areaListings: [mockListing], onSearchChange: vi.fn() });
      const filterCard = screen.getByTestId('quick-chip-all');
      const heading = screen.getByRole('heading', { level: 1 });
      const search = screen.getByTestId('area-search-input');
      const schoolCta = screen.getByTestId('area-set-schools-tile');
      const resultSummary = screen.getByTestId('area-result-summary');
      const cards = screen.getByText('Test Listing');

      const FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING;
      // Filters now lead, ahead of the headline — the clause #2596 exists to fix.
      expect(filterCard.compareDocumentPosition(heading) & FOLLOWING).toBeTruthy();
      expect(heading.compareDocumentPosition(search) & FOLLOWING).toBeTruthy();
      // Search before the tiles — the half that reverses #2084 AC8.
      expect(search.compareDocumentPosition(schoolCta) & FOLLOWING).toBeTruthy();
      expect(schoolCta.compareDocumentPosition(resultSummary) & FOLLOWING).toBeTruthy();
      expect(resultSummary.compareDocumentPosition(cards) & FOLLOWING).toBeTruthy();

      // The superseded order must be genuinely GONE, not merely un-asserted:
      // under #2084 AC8 the tiles preceded the search and the filters trailed
      // both. Both of those are now false.
      expect(schoolCta.compareDocumentPosition(search) & FOLLOWING).toBeFalsy();
      expect(search.compareDocumentPosition(filterCard) & FOLLOWING).toBeFalsy();
    });

    // Issue #2596 ruling 2 — "one visual group". The kit's `EPAreaActions` is a
    // single flex column with `gap: 8px` and NO rule between the search box and
    // the tile grid; the app previously drew a `border-b` hairline under each.
    it('puts the search and the recommendation tiles in ONE bordered group with no divider between them', () => {
      renderPanel({ onSearchChange: vi.fn() });
      const tileRow = screen.getByTestId('area-set-two-tile-row');
      const search = screen.getByTestId('area-search-input');

      // The tile row no longer draws its own separation...
      expect(tileRow.className).not.toMatch(/border-b/);
      // ...because it shares one container with the search box, and THAT
      // container owns the single hairline for the pair.
      const group = tileRow.parentElement!;
      expect(group.contains(search)).toBe(true);
      expect(group.className).toMatch(/border-b/);
    });

    // Issue #2596 ruling 6 — the tiles stack one-per-row below `sm` and only go
    // two-up from `sm`, a deliberate adaptation of the kit's `1fr 1fr` (two
    // columns at ~390px wrapped the labels into three ragged lines; measured in
    // the preceding density pass). This is a STRUCTURAL guard, not visual
    // proof: the same edit that stripped this row's border and padding rewrote
    // this className, so the responsive rule needs something holding it in
    // place. Rendered geometry is the visual gate's business, not this test's.
    it('keeps the tiles stacked below sm and two-up from sm', () => {
      renderPanel();
      const tileRow = screen.getByTestId('area-set-two-tile-row');
      expect(tileRow).toHaveClass('grid-cols-1');
      expect(tileRow).toHaveClass('sm:grid-cols-2');
    });

    // Issue #2596, owner-authorised kit parity (PR #2601 final pass).
    //
    // THESE ARE CLASS GUARDS, NOT VALUE PROOFS, and the distinction matters because this
    // project OVERRIDES the radius scale. JSDOM loads no stylesheet, so no test here can
    // read a computed radius or height. The values were proved separately by emitting the
    // real Tailwind CSS:
    //   .rounded-md -> calc(var(--radius) - 2px), with --radius: 0.625rem  => 8px  (kit 8px)
    //   .h-10       -> 2.5rem                                              => 40px (kit 40px)
    // The OLD classes emit 10px and 36px, which is exactly what the independent browser
    // certification measured — so the token chain is corroborated at both ends rather than
    // assumed from Tailwind's defaults (where `rounded-md` would be 6px, not 8px).
    //
    // What these guards buy is regression cover: `rounded-lg` and `h-9` read as innocuous
    // and would silently walk these two values back off-kit.
    it('pins the tile corner radius to the kit token (rounded-md = 8px here, not rounded-lg = 10px)', () => {
      renderPanel();
      for (const id of ['area-set-schools-tile', 'area-set-add-nearby-tile']) {
        expect(screen.getByTestId(id)).toHaveClass('rounded-md');
        expect(screen.getByTestId(id)).not.toHaveClass('rounded-lg');
      }
    });

    it('pins the property-search height to the kit 40px (h-10, not h-9 = 36px)', () => {
      renderPanel({ onSearchChange: vi.fn() });
      const search = screen.getByTestId('area-search-input');
      expect(search).toHaveClass('h-10');
      expect(search).not.toHaveClass('h-9');
    });

    it('the school CTA is NOT a descendant of the quick-filter box', () => {
      renderPanel({ areaListings: [mockListing] });
      const schoolCta = screen.getByTestId('area-set-schools-tile');
      // Walk up from the property-type "All" chip (a real member of the
      // filter box) to find its wrapper, then assert the school CTA
      // is not contained within that same wrapper.
      const allChip = screen.getByTestId('quick-chip-all');
      let filterBox: HTMLElement | null = allChip.parentElement;
      while (filterBox && !(filterBox.className && filterBox.className.includes('space-y-1'))) {
        filterBox = filterBox.parentElement;
      }
      expect(filterBox).not.toBeNull();
      expect(filterBox!.contains(schoolCta)).toBe(false);
    });

    // Issue #2017 fix — the two-tile row's schools tile is DISABLED (not
    // unmounted) when onAddSchool is absent, matching AreaSetTwoTileRow's
    // own `disabled={!onAddSchool}` contract (mirrors the multi-area case,
    // which always showed a disabled schools tile the same way). The
    // "Add nearby areas" tile stays fully present/enabled regardless.
    it('disables (but still renders) the schools tile when onAddSchool is not supplied', () => {
      renderPanel({ onAddSchool: undefined });
      const schoolsTile = screen.getByTestId('area-set-schools-tile');
      expect(schoolsTile).toBeInTheDocument();
      expect(schoolsTile).toBeDisabled();
      expect(screen.getByTestId('area-set-add-nearby-tile')).toBeInTheDocument();
      expect(screen.getByTestId('area-set-add-nearby-tile')).not.toBeDisabled();
    });
  });

  // ── Issue #2596 rulings 3 & 4 — recommendation-tile copy ──────────────────
  describe('#2596 — recommendation tile copy', () => {
    // Ruling 3. Truthful on this surface: the row renders only in the
    // single-area state, so one area is committed and the cap of 3 leaves two.
    it('uses the approved "Add up to 2 nearby areas" sub-label', () => {
      renderPanel();
      const sub = screen.getByTestId('area-set-add-nearby-tile-sub');
      expect(sub).toHaveTextContent('Add up to 2 nearby areas');
      // The superseded copy is gone, not merely unasserted.
      expect(sub).not.toHaveTextContent('Up to 3 areas total');
    });

    // Ruling 4. The kit reads "{N} schools · keeps this area". The count must be
    // REAL: it comes from the shared areas query, falling back to the count the
    // caller's own AreaPoint already carries.
    it('renders the real school count when the selected area carries one', () => {
      renderPanel({ selectedArea: { ...mockArea, schoolCount: 4 } });
      expect(screen.getByTestId('area-set-schools-tile-sub')).toHaveTextContent(
        '4 schools · keeps this area',
      );
    });

    it('says "school", not "schools", when the area has exactly one', () => {
      renderPanel({ selectedArea: { ...mockArea, schoolCount: 1 } });
      const sub = screen.getByTestId('area-set-schools-tile-sub');
      expect(sub).toHaveTextContent('1 school · keeps this area');
      expect(sub).not.toHaveTextContent('1 schools');
    });

    // A genuine zero is the data speaking, so it is shown.
    it('shows a genuine zero rather than hiding it', () => {
      renderPanel({ selectedArea: { ...mockArea, schoolCount: 0 } });
      expect(screen.getByTestId('area-set-schools-tile-sub')).toHaveTextContent(
        '0 schools · keeps this area',
      );
    });

    // THE HONEST-DEGRADE ARM. `mockArea` carries no schoolCount and the areas
    // query does not resolve here, so no count is truthfully available. The tile
    // must fall back to its previous wording rather than invent a number — and
    // in particular must NOT claim zero, which the data never stated.
    it('falls back to "See nearby schools" when no count is available, and never fabricates one', () => {
      renderPanel();
      const sub = screen.getByTestId('area-set-schools-tile-sub');
      expect(sub).toHaveTextContent('See nearby schools');
      expect(sub.textContent).not.toMatch(/\d/);
      expect(sub).not.toHaveTextContent('keeps this area');
    });
  });

  // ── Issue #2601 "option D" — VIEWPORT scope carries NO visual delta ───────
  //
  // Three gates independently failed to find any reachable route to VIEWPORT
  // scope, so this surface has never been witnessed rendering in either arm.
  // Rather than certify a PASS nobody could observe, the owner ruled that this
  // PR must leave the VIEWPORT CTA exactly as the merge base `cdb3c7d0` had it:
  // its own bordered strip, below the heading and ABOVE the search — NOT folded
  // into the search + tiles workflow group the AREA_SET path uses.
  //
  // These assertions stand in for browser evidence that does not exist. They
  // cannot prove the surface renders correctly to a person; they prove the
  // structure this PR is required not to change.
  describe('#2601 option D — VIEWPORT-scope school CTA keeps its merge-base presentation', () => {
    const renderViewport = () =>
      renderPanel({ isViewportScope: true, onAddSchool: vi.fn(), onSearchChange: vi.fn() });

    it('renders the CTA in its OWN bordered strip, not inside the search group', () => {
      renderViewport();
      const cta = screen.getByTestId('add-school-cta');
      const search = screen.getByTestId('area-search-input');

      // Its wrapper is a bordered strip of its own...
      const wrapper = cta.parentElement!;
      expect(wrapper.className).toMatch(/border-b/);
      // ...which must NOT be the shared workflow group: the search box lives
      // somewhere else entirely.
      expect(wrapper.contains(search)).toBe(false);
    });

    it('places the CTA ABOVE the property search, as at the merge base', () => {
      renderViewport();
      const cta = screen.getByTestId('add-school-cta');
      const search = screen.getByTestId('area-search-input');
      const FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING;
      expect(cta.compareDocumentPosition(search) & FOLLOWING).toBeTruthy();
      // And explicitly NOT the arrangement the AREA_SET path uses.
      expect(search.compareDocumentPosition(cta) & FOLLOWING).toBeFalsy();
    });

    it('does not render the two-tile row under VIEWPORT scope', () => {
      renderViewport();
      expect(screen.queryByTestId('area-set-two-tile-row')).not.toBeInTheDocument();
      expect(screen.queryByTestId('area-set-schools-tile')).not.toBeInTheDocument();
    });

    // The gate is `onAddSchool`, unchanged from the merge base.
    it('renders nothing when onAddSchool is absent', () => {
      renderPanel({ isViewportScope: true, onAddSchool: undefined, onSearchChange: vi.fn() });
      expect(screen.queryByTestId('add-school-cta')).not.toBeInTheDocument();
    });
  });

  describe('Breadcrumb (Issue #1606)', () => {
    it('renders Home › City › Group › Area when a group context is present', () => {
      renderPanel({ cityLabel: 'Udupi', groupName: 'University Belt' });
      expect(screen.getByTestId('breadcrumb-home')).toHaveTextContent('Home');
      expect(screen.getByTestId('breadcrumb-city')).toHaveTextContent('Udupi');
      expect(screen.getByTestId('breadcrumb-group')).toHaveTextContent('University Belt');
      expect(screen.getByTestId('breadcrumb-area')).toHaveTextContent('Test Area');
    });

    it('omits the group crumb when there is no group context', () => {
      renderPanel({ cityLabel: 'Udupi', groupName: null });
      expect(screen.queryByTestId('breadcrumb-group')).not.toBeInTheDocument();
      expect(screen.getByTestId('breadcrumb-city')).toHaveTextContent('Udupi');
      expect(screen.getByTestId('breadcrumb-area')).toHaveTextContent('Test Area');
    });

    it('does NOT use school-first wording in the breadcrumb', () => {
      renderPanel({ cityLabel: 'Udupi', groupName: 'University Belt' });
      expect(screen.getByTestId('area-first-breadcrumb')).not.toHaveTextContent(/Selected school/i);
    });

    it('wires progressive navigation: Home, City, Group crumbs call their handlers', () => {
      const onCrumbHome = vi.fn();
      const onCrumbCity = vi.fn();
      const onCrumbGroup = vi.fn();
      renderPanel({
        cityLabel: 'Udupi',
        groupName: 'University Belt',
        onCrumbHome,
        onCrumbCity,
        onCrumbGroup,
      });
      fireEvent.click(screen.getByTestId('breadcrumb-home'));
      fireEvent.click(screen.getByTestId('breadcrumb-city'));
      fireEvent.click(screen.getByTestId('breadcrumb-group'));
      expect(onCrumbHome).toHaveBeenCalledTimes(1);
      expect(onCrumbCity).toHaveBeenCalledTimes(1);
      expect(onCrumbGroup).toHaveBeenCalledTimes(1);
    });
  });
});
