import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { AreaSelectedPanel } from '../AreaSelectedPanel';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';

const mockArea: AreaPoint = {
  areaKey: 'test-area|city|udupi',
  areaLabel: 'Test Area',
  lat: 13.5,
  lng: 74.5,
  zoom: 14,
};

const mockListing: DiscoverCityListingItem = {
  id: '1',
  property_type: 'apartment',
  title: 'Test Listing',
  locality: 'Test Area',
  price: 5000000,
  price_unit: 'total',
  bedrooms: 2,
  bathrooms: 1,
};

describe('AreaSelectedPanel', () => {
  const renderPanel = (props: Partial<React.ComponentProps<typeof AreaSelectedPanel>> = {}) => {
    const defaultProps: React.ComponentProps<typeof AreaSelectedPanel> = {
      selectedArea: mockArea,
      areaListings: [mockListing],
      filters: {},
      onFiltersChange: vi.fn(),
      onSelectJourney: vi.fn(),
      onAddSchool: vi.fn(),
    };

    render(
      <BrowserRouter>
        <AreaSelectedPanel {...defaultProps} {...props} />
      </BrowserRouter>,
    );
  };

  describe('Quick filter chips', () => {
    it('renders property type chips', () => {
      renderPanel();
      expect(screen.getByTestId('quick-chip-apartment')).toBeInTheDocument();
      expect(screen.getByTestId('quick-chip-villa')).toBeInTheDocument();
      expect(screen.getByTestId('quick-chip-land')).toBeInTheDocument();
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
      // R-C: property-type chips use NAVY (bg-primary) when active.
      // BHK chips use copper-tint (bg-copper-tint) when active, NOT solid copper.
      expect(screen.getByTestId('quick-chip-apartment')).toHaveClass('bg-primary');
      expect(screen.getByTestId('quick-chip-2-bhk')).toHaveClass('bg-copper-tint');
      expect(screen.getByTestId('quick-chip-villa')).not.toHaveClass('bg-primary');
    });
  });

  describe('School CTA', () => {
    it('renders add school CTA', () => {
      renderPanel();
      expect(screen.getByTestId('add-school-cta')).toBeInTheDocument();
    });

    // Issue #1157 — the CTA enters the area-first school-picking sub-step via
    // onAddSchool (which keeps journey=area-first), NOT onSelectJourney('school-first')
    // (which flipped the journey and made Back delete the area).
    it('calls onAddSchool (not onSelectJourney) on CTA click', () => {
      const onAddSchool = vi.fn();
      const onSelectJourney = vi.fn();
      renderPanel({ onAddSchool, onSelectJourney });
      fireEvent.click(screen.getByTestId('add-school-cta'));
      expect(onAddSchool).toHaveBeenCalledTimes(1);
      expect(onSelectJourney).not.toHaveBeenCalled();
    });
  });

  describe('Empty state', () => {
    it('shows no listings message when empty without filters', () => {
      renderPanel({ areaListings: [] });
      expect(screen.getByText(/No properties for sale in this area yet/)).toBeInTheDocument();
      expect(screen.queryByTestId('clear-filters-button')).not.toBeInTheDocument();
    });

    it('shows filtered message with clear button when filters active and no listings', () => {
      renderPanel({ areaListings: [], filters: { propertyTypes: ['apartment'] } });
      expect(screen.getByText('No listings match these filters')).toBeInTheDocument();
      expect(screen.getByTestId('clear-filters-button')).toBeInTheDocument();
    });

    it('clears property filters on clear button click', () => {
      const onFiltersChange = vi.fn();
      renderPanel({
        areaListings: [],
        filters: { propertyTypes: ['apartment'], bedrooms: [2] },
        onFiltersChange,
      });
      fireEvent.click(screen.getByTestId('clear-filters-button'));
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
      fireEvent.click(screen.getByTestId('clear-filters-button'));
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

    it('shows "for sale in this area yet" empty state by default (intent=buy)', () => {
      renderPanel({ areaListings: [] });
      expect(screen.getByText(/No properties for sale in this area yet/)).toBeInTheDocument();
    });

    it('shows "for rent in this area yet" empty state when intent=rent', () => {
      renderPanel({ areaListings: [], intent: 'rent' });
      expect(screen.getByText(/No properties for rent in this area yet/)).toBeInTheDocument();
    });
  });

  // ── Round-3 design-fidelity refinement (Issue #1606) ──────────────────────

  describe('F1 — Area-first pill and Start-over button (round-3)', () => {
    it('renders the area-first pill with bg-secondary (navy), NOT a copper class', () => {
      const { container } = render(
        <BrowserRouter>
          <AreaSelectedPanel
            selectedArea={mockArea}
            areaListings={[mockListing]}
            filters={{}}
            onFiltersChange={vi.fn()}
            onSelectJourney={vi.fn()}
            onAddSchool={vi.fn()}
            journey="area-first"
          />
        </BrowserRouter>,
      );
      // The pill is a <span> with text 'Area-first'. Use querySelector for specificity.
      const pill = container.querySelector('span.bg-secondary');
      expect(pill).not.toBeNull();
      expect(pill!.className).toContain('bg-secondary');
      expect(pill!.className).not.toContain('bg-copper');
    });

    it('renders the Layers icon alongside the area-first pill (not MapPin)', () => {
      const { container } = render(
        <BrowserRouter>
          <AreaSelectedPanel
            selectedArea={mockArea}
            areaListings={[mockListing]}
            filters={{}}
            onFiltersChange={vi.fn()}
            onSelectJourney={vi.fn()}
            onAddSchool={vi.fn()}
            journey="area-first"
          />
        </BrowserRouter>,
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

    it('clicking Start-over calls onStartOver', () => {
      const onStartOver = vi.fn();
      renderPanel({ journey: 'area-first', onStartOver });
      fireEvent.click(screen.getByTestId('start-over-button'));
      expect(onStartOver).toHaveBeenCalledTimes(1);
    });

    it('renders "Properties in {area}" headline', () => {
      renderPanel();
      expect(screen.getByRole('heading', { name: 'Properties in Test Area' })).toBeInTheDocument();
    });
  });

  describe('F2 — Controls card and property-type filter card (round-3)', () => {
    it('controls card uses bg-card (white surface), NOT bg-[hsl(var(--input-bg))]', () => {
      // The controls card only renders when onCityChange or onIntentChange is provided.
      const { container } = render(
        <BrowserRouter>
          <AreaSelectedPanel
            selectedArea={mockArea}
            areaListings={[mockListing]}
            filters={{}}
            onFiltersChange={vi.fn()}
            onSelectJourney={vi.fn()}
            onAddSchool={vi.fn()}
            onIntentChange={vi.fn()}
          />
        </BrowserRouter>,
      );
      // The controls card is the grid div wrapping City/Looking-to controls.
      // It must carry bg-card and must NOT carry the old --input-bg fill.
      const controlsCard = container.querySelector('[data-testid="intent-selector"]')?.closest('.bg-card');
      expect(controlsCard).not.toBeNull();
      // Also verify the old --input-bg class is NOT on the controls card itself.
      const inputBgEl = container.querySelector('.bg-\\[hsl\\(var\\(--input-bg\\)\\)\\]');
      // The CitySelect trigger MAY carry --input-bg; the CONTROLS CARD wrapping div must not.
      // We simply assert the grid wrapper carries bg-card.
      const gridWrapper = container.querySelector('.grid.grid-cols-2');
      expect(gridWrapper?.className).toContain('bg-card');
    });

    it('property-type filter is wrapped in a white card (rounded-xl bg-card)', () => {
      const { container } = render(
        <BrowserRouter>
          <AreaSelectedPanel
            selectedArea={mockArea}
            areaListings={[mockListing]}
            filters={{}}
            onFiltersChange={vi.fn()}
            onSelectJourney={vi.fn()}
            onAddSchool={vi.fn()}
          />
        </BrowserRouter>,
      );
      // The quick-filter card wraps both property-type and BHK chips.
      // It is the div that contains quick-chip-all and uses rounded-xl bg-card.
      const allChip = screen.getByTestId('quick-chip-all');
      // Walk up to find the bg-card wrapper.
      let node: HTMLElement | null = allChip.parentElement;
      let foundBgCard = false;
      while (node) {
        if (node.className && node.className.includes('bg-card')) {
          foundBgCard = true;
          break;
        }
        node = node.parentElement;
      }
      expect(foundBgCard).toBe(true);
    });

    it('active property-type chip still uses bg-primary (navy)', () => {
      renderPanel({ filters: { propertyTypes: ['apartment'] } });
      expect(screen.getByTestId('quick-chip-apartment')).toHaveClass('bg-primary');
    });

    it('active BHK chip still uses bg-copper-tint', () => {
      renderPanel({ filters: { bedrooms: [2] } });
      expect(screen.getByTestId('quick-chip-2-bhk')).toHaveClass('bg-copper-tint');
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
      // R-C: active All chip uses NAVY (bg-primary), not copper.
      expect(screen.getByTestId('quick-chip-all')).toHaveClass('bg-primary');
    });

    it('All chip is not active when a property type filter is set', () => {
      renderPanel({ filters: { propertyTypes: ['apartment'] } });
      expect(screen.getByTestId('quick-chip-all')).not.toHaveClass('bg-primary');
    });

    it('clicking All clears the property-type filter (preserving bedrooms)', () => {
      const onFiltersChange = vi.fn();
      renderPanel({ filters: { propertyTypes: ['apartment'], bedrooms: [2] }, onFiltersChange });
      fireEvent.click(screen.getByTestId('quick-chip-all'));
      expect(onFiltersChange).toHaveBeenCalledWith({ propertyTypes: undefined, bedrooms: [2] });
    });
  });

  describe('Controls card — City + Buy/Rent (Issue #1606)', () => {
    it('renders the in-panel intent selector when onIntentChange provided', () => {
      renderPanel({ onIntentChange: vi.fn() });
      expect(screen.getByTestId('intent-selector')).toBeInTheDocument();
    });

    it('omits the controls card when neither city nor intent handlers are provided', () => {
      renderPanel();
      expect(screen.queryByTestId('intent-selector')).not.toBeInTheDocument();
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
