/**
 * useEditListingCommands — Issue #1838 PR C commit 3 hook-level unit tests.
 *
 * Composes the real domain field hooks (useBaseFields/useSharedFields/...)
 * plus useEditListingUiState/useEditListingNavigation exactly as
 * EditListingForm.tsx does, then exercises useEditListingCommands itself —
 * this is where "what a command actually DOES" is characterized, as
 * opposed to the step-component tests (LocationStep.test.tsx /
 * ReviewStep.test.tsx) which only assert that a command was CALLED.
 *
 * useSearchParams (inside useEditListingNavigation) requires Router context,
 * so every render is wrapped in MemoryRouter.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { createElement, type ReactNode } from 'react';
import type { ListingResponse } from '@/hooks/useBrokerListings';
import { useBaseFields } from '../useBaseFields';
import { useSharedFields } from '../useSharedFields';
import { useCommercialFields } from '../useCommercialFields';
import { useRentFields } from '../useRentFields';
import { useAgriFields } from '../useAgriFields';
import { useResidentialFields } from '../useResidentialFields';
import { useEditListingUiState } from '../useEditListingUiState';
import { useEditListingNavigation } from '../useEditListingNavigation';
import { useEditListingCommands } from '../useEditListingCommands';

const mockToast = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

function wrapperFor(initialEntries: string[] = ['/edit/test-id']) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(MemoryRouter, { initialEntries }, children);
  };
}

function makeListing(overrides: Partial<ListingResponse> = {}): ListingResponse {
  return {
    id: 'listing-1',
    status: 'DRAFT',
    propertyType: 'apartment',
    title: '',
    locality: 'Manipal',
    price: 5000000,
    description: null,
    landArea: null,
    landAreaUnit: null,
    bedrooms: null,
    builtArea: null,
    builtAreaUnit: null,
    latitude: 13.34,
    longitude: 74.74,
    addressConfirmed: false,
    imageCount: 0,
    firstImageUrl: null,
    rejectionReason: null,
    videoUrl: null,
    reraNumber: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    listingPurpose: 'sale',
    carpetArea: null,
    carpetAreaUnit: null,
    floorNumber: null,
    totalFloors: null,
    furnishingStatus: null,
    washrooms: null,
    parkingCount: null,
    roadFrontageFt: null,
    commercialUsage: null,
    numberOfUnits: null,
    monthlyRent: null,
    securityDepositMonths: null,
    lockInMonths: null,
    sellerType: null,
    earnedBadgeCount: 0,
    areaKey: null,
    waterSource: null,
    soilType: null,
    roadAccess: null,
    cultivationStatus: null,
    ownershipType: null,
    surveyNumber: null,
    ...overrides,
  };
}

function useTestHarness(listing: ListingResponse, updateIsPending: boolean, mockUpdateMutate: ReturnType<typeof vi.fn>) {
  const base = useBaseFields();
  const shared = useSharedFields();
  const commercial = useCommercialFields();
  const rent = useRentFields();
  const agri = useAgriFields();
  const residential = useResidentialFields();
  const ui = useEditListingUiState();
  const nav = useEditListingNavigation(base.values.propertyType);
  const { derived, commands } = useEditListingCommands({
    listing,
    fields: { base, shared, commercial, rent, agri, residential },
    ui,
    nav,
    mutations: {
      // Cast justified: TanStack's useUpdateListing/useSubmitListing return a
      // large mutation-result type; only `mutate`/`isPending` are read by
      // this hook, matching the mocking convention already used in
      // LocationStep.test.tsx / ReviewStep.test.tsx for the same types.
      updateListing: { mutate: mockUpdateMutate, isPending: updateIsPending } as unknown as Parameters<
        typeof useEditListingCommands
      >[0]['mutations']['updateListing'],
      submitListing: { mutate: vi.fn(), isPending: false } as unknown as Parameters<
        typeof useEditListingCommands
      >[0]['mutations']['submitListing'],
    },
  });
  return { base, shared, ui, commercial, derived, commands };
}

beforeEach(() => {
  mockToast.mockClear();
});

describe('useEditListingCommands', () => {
  describe('commands.review.resetTitleToLocality', () => {
    it('produces "Property in Kaup" from confirmedLocality "Kaup, Udupi"', () => {
      const mockUpdateMutate = vi.fn();
      const { result } = renderHook(
        () => useTestHarness(makeListing(), false, mockUpdateMutate),
        { wrapper: wrapperFor() },
      );

      act(() => {
        result.current.ui.setters.setConfirmedLocality('Kaup, Udupi');
      });
      act(() => {
        result.current.commands.review.resetTitleToLocality();
      });

      expect(result.current.base.values.title).toBe('Property in Kaup');
      expect(result.current.ui.values.titleManuallyEdited).toBe(false);
    });

    it('is a no-op when confirmedLocality is empty', () => {
      const mockUpdateMutate = vi.fn();
      const { result } = renderHook(
        () => useTestHarness(makeListing(), false, mockUpdateMutate),
        { wrapper: wrapperFor() },
      );

      act(() => {
        result.current.commands.review.resetTitleToLocality();
      });

      expect(result.current.base.values.title).toBe('');
    });
  });

  describe('commands.location.confirmLocality', () => {
    it('regenerates the title from the confirmed locality when the title has not been manually edited', () => {
      const mockUpdateMutate = vi.fn();
      const { result } = renderHook(
        () => useTestHarness(makeListing(), false, mockUpdateMutate),
        { wrapper: wrapperFor() },
      );

      act(() => {
        result.current.commands.location.confirmLocality('Manipal, Udupi', 13.35, 74.75);
      });

      expect(result.current.ui.values.confirmedLocality).toBe('Manipal, Udupi');
      expect(result.current.base.values.title).toBe('Property in Manipal');
    });

    it('updates confirmedLocality but does NOT overwrite the title once it has been manually edited', () => {
      const mockUpdateMutate = vi.fn();
      const { result } = renderHook(
        () => useTestHarness(makeListing({ title: 'My custom title' }), false, mockUpdateMutate),
        { wrapper: wrapperFor() },
      );

      act(() => {
        result.current.ui.setters.setTitleManuallyEdited(true);
        result.current.base.setters.setTitle('My custom title');
      });

      act(() => {
        result.current.commands.location.confirmLocality('Kaup, Udupi', 13.36, 74.76);
      });

      expect(result.current.ui.values.confirmedLocality).toBe('Kaup, Udupi');
      expect(result.current.base.values.title).toBe('My custom title');
    });
  });

  describe('commands.location isPending guard', () => {
    it('does not call updateListing.mutate from confirmAddress/unconfirmAddress while a save is already pending', () => {
      const mockUpdateMutate = vi.fn();
      const { result } = renderHook(
        () => useTestHarness(makeListing(), true, mockUpdateMutate),
        { wrapper: wrapperFor() },
      );

      act(() => {
        result.current.commands.location.confirmAddress({
          address_line1: '',
          lat: 13.35,
          lng: 74.75,
          address_confirmed: true,
        });
        result.current.commands.location.unconfirmAddress();
      });

      expect(mockUpdateMutate).not.toHaveBeenCalled();
    });

    it('calls updateListing.mutate from confirmAddress when no save is pending', () => {
      const mockUpdateMutate = vi.fn();
      const { result } = renderHook(
        () => useTestHarness(makeListing(), false, mockUpdateMutate),
        { wrapper: wrapperFor() },
      );

      act(() => {
        result.current.commands.location.confirmAddress({
          address_line1: '',
          lat: 13.35,
          lng: 74.75,
          address_confirmed: true,
        });
      });

      expect(mockUpdateMutate).toHaveBeenCalledWith({
        latitude: 13.35,
        longitude: 74.75,
        addressConfirmed: true,
      });
    });
  });

  describe('commands.describe.changePropertyType', () => {
    it('resets the explicit commercial subtype choice when switching away from commercial', () => {
      const mockUpdateMutate = vi.fn();
      const { result } = renderHook(
        () => useTestHarness(makeListing({ propertyType: 'commercial' }), false, mockUpdateMutate),
        { wrapper: wrapperFor() },
      );

      act(() => {
        result.current.commercial.setters.setExplicitSubtype('SHOP');
      });
      expect(result.current.commercial.values.explicitSubtype).toBe('SHOP');

      act(() => {
        result.current.commands.describe.basics.changePropertyType('apartment');
      });

      expect(result.current.base.values.propertyType).toBe('apartment');
      expect(result.current.derived.isCommercialType).toBe(false);
      expect(result.current.commercial.values.explicitSubtype).toBe('');
    });
  });

  // Issue #1838 PR E — "producer independence" check: DescribeStep's own
  // unit tests stub commands.dimensions.setXArea as plain vi.fn()s, so they
  // structurally cannot catch a hook-side miswiring (e.g. setBuiltArea
  // actually calling setLandArea/setLandAreaUnit). These tests exercise the
  // REAL producer wired up by useEditListingCommands, asserting the combined
  // (value, unit) setter lands in the correct pair of base/shared fields.
  describe('commands.describe.dimensions — producer independence', () => {
    it('setLandArea(value, unit) sets base.values.landArea and landAreaUnit', () => {
      const { result } = renderHook(
        () => useTestHarness(makeListing(), false, vi.fn()),
        { wrapper: wrapperFor() },
      );

      act(() => {
        result.current.commands.describe.dimensions.setLandArea(10, 'acre');
      });

      expect(result.current.base.values.landArea).toBe(10);
      expect(result.current.base.values.landAreaUnit).toBe('acre');
    });

    it('setBuiltArea(value, unit) sets base.values.builtArea and builtAreaUnit', () => {
      const { result } = renderHook(
        () => useTestHarness(makeListing(), false, vi.fn()),
        { wrapper: wrapperFor() },
      );

      act(() => {
        result.current.commands.describe.dimensions.setBuiltArea(1200, 'sqft');
      });

      expect(result.current.base.values.builtArea).toBe(1200);
      expect(result.current.base.values.builtAreaUnit).toBe('sqft');
    });

    it('setCarpetArea(value, unit) sets shared.values.carpetArea and carpetAreaUnit', () => {
      const { result } = renderHook(
        () => useTestHarness(makeListing(), false, vi.fn()),
        { wrapper: wrapperFor() },
      );

      act(() => {
        result.current.commands.describe.dimensions.setCarpetArea(500, 'sqft');
      });

      expect(result.current.shared.values.carpetArea).toBe(500);
      expect(result.current.shared.values.carpetAreaUnit).toBe('sqft');
    });
  });
});
