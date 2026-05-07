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
    };

    render(
      <BrowserRouter>
        <AreaSelectedPanel {...defaultProps} {...(props as any)} />
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
      expect(screen.getByTestId('quick-chip-apartment')).toHaveClass('bg-primary');
      expect(screen.getByTestId('quick-chip-2-bhk')).toHaveClass('bg-primary');
      expect(screen.getByTestId('quick-chip-villa')).not.toHaveClass('bg-primary');
    });
  });

  describe('School CTA', () => {
    it('renders add school CTA', () => {
      renderPanel();
      expect(screen.getByTestId('add-school-cta')).toBeInTheDocument();
    });

    it('calls onSelectJourney with school-first on CTA click', () => {
      const onSelectJourney = vi.fn();
      renderPanel({ onSelectJourney });
      fireEvent.click(screen.getByTestId('add-school-cta'));
      expect(onSelectJourney).toHaveBeenCalledWith('school-first');
    });
  });

  describe('Empty state', () => {
    it('shows no listings message when empty without filters', () => {
      renderPanel({ areaListings: [] });
      expect(screen.getByText('No listings in this area yet')).toBeInTheDocument();
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
    it('shows search input when onSearchChange provided', () => {
      renderPanel({ onSearchChange: vi.fn() });
      expect(screen.getByPlaceholderText('Search listings by keyword')).toBeInTheDocument();
    });

    it('calls onSearchChange on input change', () => {
      const onSearchChange = vi.fn();
      renderPanel({ onSearchChange });
      const input = screen.getByPlaceholderText('Search listings by keyword');
      fireEvent.change(input, { target: { value: 'test' } });
      expect(onSearchChange).toHaveBeenCalledWith('test');
    });
  });
});
