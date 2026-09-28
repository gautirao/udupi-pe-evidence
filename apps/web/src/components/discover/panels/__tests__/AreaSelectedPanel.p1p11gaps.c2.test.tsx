import React from 'react';
import { screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { AreaSelectedPanel } from '../AreaSelectedPanel';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import { AreaSetDraftProvider } from '@/features/discover/state/AreaSetDraftContext';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import { toAreaSelectedPanelContract, type AreaSelectedPanelFlatTestProps } from './areaSelectedPanelTestAdapter';

/**
 * Issue #2658 (C2) — targeted P1-P11 gap-fill for AreaSelectedPanel.tsx.
 *
 * This is NOT a from-scratch P1-P11 characterization: reading the file
 * confirmed substantial existing coverage already pins most of it
 * (AreaSelectedPanel.scopeBar.test.tsx for P2/P7's resultScopeKind and
 * return-label logic, AreaSelectedPanel.relaxationSeam.test.tsx for the
 * zero-result relaxation wrapper's override/memory clearing,
 * AreaSelectedPanel.dod2555/.familyResync/.density2596 for P1/P3,
 * AreaZeroResultRecovery.test.tsx for P10's recovery-stack shape). This
 * file covers the specific gaps found while reading that are NOT already
 * asserted anywhere: the two-fallback P6 chain's SECOND expression
 * (`cityLabel ?? city ?? ''` then `|| areaLabel`, distinct from the
 * `city || nav.city || DEFAULT_CITY` chain the C0 guard already pins), and
 * the listings-body dimming rule (P9: dims while fetching but NOT on
 * initial load).
 */

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
  return renderWithProviders(
    <DiscoverProvider>
      <AreaSetDraftProvider>
        <AreaSelectedPanel view={view} commands={commands} />
      </AreaSetDraftProvider>
    </DiscoverProvider>,
    { router: 'browser' },
  );
};

describe('#2658 C2 — AreaSelectedPanel P1-P11 gap-fill', () => {
  describe('P6 (second fallback) — resolvedCityLabel = cityLabel ?? city ?? \'\', then || areaLabel', () => {
    it('uses cityLabel when supplied, over city and areaLabel', () => {
      renderPanel({ cityLabel: 'Udupi', city: 'other-city' });
      // AreaFirstBreadcrumb renders the resolved city label as its city crumb text.
      expect(screen.getByText('Udupi')).toBeInTheDocument();
    });

    it('falls through to city when cityLabel is omitted', () => {
      renderPanel({ cityLabel: undefined, city: 'mangalore' });
      expect(screen.getByText('mangalore')).toBeInTheDocument();
    });

    it('falls through to areaLabel when BOTH cityLabel and city are absent (the `|| areaLabel` half)', () => {
      renderPanel({ cityLabel: undefined, city: undefined });
      // resolvedCityLabel resolves to '' when neither is supplied, and the
      // `resolvedCityLabel || areaLabel` sites then fall through to the
      // area's own label — asserted here via the breadcrumb, which reads
      // `cityLabel={resolvedCityLabel || areaLabel}`.
      expect(screen.getAllByText('Test Area').length).toBeGreaterThan(0);
    });
  });

  describe('P9 — listings body dims while fetching but NOT on initial load', () => {
    it('does not dim on isInitialLoading (even with isFetching true)', () => {
      renderPanel({ isFetching: true, isInitialLoading: true, isLoadingListings: true });
      // isLoadingListings renders the skeleton branch directly, which carries
      // no opacity class at all — the dimming wrapper still exists around it
      // but must read opacity-100, not opacity-50, per the isInitialLoading
      // exception.
      const dimWrapper = screen.getAllByTestId('listing-skeleton')[0]?.closest(
        '.transition-opacity',
      );
      expect(dimWrapper).not.toBeNull();
      expect(dimWrapper?.className).toContain('opacity-100');
      expect(dimWrapper?.className).not.toContain('opacity-50');
    });

    it('dims (opacity-50) while fetching AFTER the initial load has completed', () => {
      renderPanel({ isFetching: true, isInitialLoading: false, isLoadingListings: false });
      const summary = screen.getByTestId('area-result-summary');
      const dimWrapper = summary.closest('.transition-opacity');
      expect(dimWrapper).not.toBeNull();
      expect(dimWrapper?.className).toContain('opacity-50');
      expect(dimWrapper?.className).toContain('pointer-events-none');
    });

    it('is fully opaque once fetching settles', () => {
      renderPanel({ isFetching: false, isInitialLoading: false, isLoadingListings: false });
      const summary = screen.getByTestId('area-result-summary');
      const dimWrapper = summary.closest('.transition-opacity');
      expect(dimWrapper?.className).toContain('opacity-100');
      expect(dimWrapper?.className).not.toContain('pointer-events-none');
    });
  });
});
