/**
 * LocationStep — Issue #1838 slice 6a characterisation tests.
 *
 * LocationStep is a STATELESS presentational component extracted from
 * EditListingForm.tsx's step-3 ("Pin Location") render block.
 *
 * AddressPicker (and any react-leaflet map internals it pulls in) is mocked
 * to a lightweight stub per the #1837 OOM lesson — no real Leaflet map is
 * ever mounted in this suite.
 *
 * Issue #1838 PR C commit 3 — updated to the {view, commands} prop contract
 * (see ../stepContracts.ts). This suite now asserts that the AddressPicker
 * callbacks are wired straight through to the `commands` functions passed
 * in — WHAT those commands actually do (the isPending guard, the mutate
 * call shape) is characterized at the hook level in
 * useEditListingCommands.test.ts, not here.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocationStep } from '../LocationStep';
import type { ListingResponse } from '@/hooks/useBrokerListings';
import type { LocationStepProps } from '../stepContracts';

// Issue #1838 slice 8 — module-scope mount-tracking spies. Stable across
// rerenders so the "mounts exactly once, never remounts on nav away+back"
// assertions can observe cumulative call counts.
const mountSpy = vi.fn();
const unmountSpy = vi.fn();

vi.mock('@/components/broker/AddressPicker', () => ({
  AddressPicker: (props: {
    initialLatitude: number | null;
    initialLongitude: number | null;
    onConfirm: (addr: { lat: number; lng: number }) => void;
    onUnconfirm: () => void;
    onLocalityConfirmed: (locality: string, lat: number, lng: number) => void;
  }) => {
    React.useEffect(() => {
      mountSpy();
      return () => {
        unmountSpy();
      };
    }, []);
    return (
      <div data-testid="address-picker-stub">
        <span data-testid="address-picker-lat">{props.initialLatitude}</span>
        <button type="button" onClick={() => props.onConfirm({ lat: 13.35, lng: 74.75 })}>
          confirm-pin
        </button>
        <button type="button" onClick={() => props.onUnconfirm()}>
          unconfirm-pin
        </button>
        <button type="button" onClick={() => props.onLocalityConfirmed('Manipal, Udupi', 13.35, 74.75)}>
          confirm-locality
        </button>
      </div>
    );
  },
}));

function makeListing(overrides: Partial<ListingResponse> = {}): ListingResponse {
  return {
    id: 'listing-1',
    status: 'DRAFT',
    propertyType: 'house',
    title: 'Test House',
    locality: null,
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
    imageCount: 3,
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

function baseProps(overrides: {
  view?: Partial<LocationStepProps['view']>;
  commands?: Partial<LocationStepProps['commands']>;
} = {}): LocationStepProps {
  return {
    view: {
      isSubmittable: true,
      listing: makeListing(),
      currentStep: 3,
      ...overrides.view,
    },
    commands: {
      confirmAddress: vi.fn(),
      unconfirmAddress: vi.fn(),
      confirmLocality: vi.fn(),
      saveAndContinue: vi.fn(),
      ...overrides.commands,
    },
  };
}

describe('LocationStep', () => {
  beforeEach(() => {
    mountSpy.mockClear();
    unmountSpy.mockClear();
  });

  it('renders AddressPicker wired to the listing coordinates', () => {
    render(<LocationStep {...baseProps()} />);
    expect(screen.getByTestId('address-picker-stub')).toBeInTheDocument();
    expect(screen.getByTestId('address-picker-lat')).toHaveTextContent('13.34');
  });

  it('disables continue while addressConfirmed is false', () => {
    render(<LocationStep {...baseProps({ view: { listing: makeListing({ addressConfirmed: false }) } })} />);
    expect(screen.getByRole('button', { name: /save & continue/i })).toBeDisabled();
    expect(screen.getByText(/confirm your pin location/i)).toBeInTheDocument();
  });

  it('enables continue and calls commands.saveAndContinue when addressConfirmed is true', async () => {
    const user = userEvent.setup();
    const saveAndContinue = vi.fn();
    render(
      <LocationStep
        {...baseProps({ view: { listing: makeListing({ addressConfirmed: true }) }, commands: { saveAndContinue } })}
      />,
    );
    const continueBtn = screen.getByRole('button', { name: /save & continue/i });
    expect(continueBtn).toBeEnabled();
    await user.click(continueBtn);
    expect(saveAndContinue).toHaveBeenCalledOnce();
  });

  it('wires AddressPicker confirm/unconfirm/locality-confirmed straight through to the commands passed in', async () => {
    const user = userEvent.setup();
    const confirmAddress = vi.fn();
    const unconfirmAddress = vi.fn();
    const confirmLocality = vi.fn();
    render(
      <LocationStep
        {...baseProps({ commands: { confirmAddress, unconfirmAddress, confirmLocality } })}
      />,
    );

    await user.click(screen.getByText('confirm-pin'));
    expect(confirmAddress).toHaveBeenCalledWith({ lat: 13.35, lng: 74.75 });

    await user.click(screen.getByText('unconfirm-pin'));
    expect(unconfirmAddress).toHaveBeenCalledOnce();

    await user.click(screen.getByText('confirm-locality'));
    expect(confirmLocality).toHaveBeenCalledWith('Manipal, Udupi', 13.35, 74.75);
  });

  it('renders nothing when isSubmittable is false', () => {
    render(<LocationStep {...baseProps({ view: { isSubmittable: false } })} />);
    expect(screen.queryByTestId('address-picker-stub')).not.toBeInTheDocument();
  });

  describe('Issue #1838 slice 8 — mount-on-first-visit latch', () => {
    it('is not mounted before the first step-3 visit', () => {
      render(<LocationStep {...baseProps({ view: { currentStep: 1 } })} />);
      expect(screen.queryByTestId('address-picker-stub')).not.toBeInTheDocument();
      expect(mountSpy).not.toHaveBeenCalled();
      expect(screen.getByText(/visit the location step/i)).toBeInTheDocument();
    });

    it('mounts exactly once on the first step-3 visit', () => {
      const { rerender } = render(<LocationStep {...baseProps({ view: { currentStep: 1 } })} />);
      rerender(<LocationStep {...baseProps({ view: { currentStep: 3 } })} />);
      expect(screen.getByTestId('address-picker-stub')).toBeInTheDocument();
      expect(mountSpy).toHaveBeenCalledOnce();
      expect(unmountSpy).not.toHaveBeenCalled();
    });

    it('stays mounted across navigation away and back (primary proof of Option C)', () => {
      const { rerender } = render(<LocationStep {...baseProps({ view: { currentStep: 1 } })} />);
      rerender(<LocationStep {...baseProps({ view: { currentStep: 3 } })} />);
      expect(mountSpy).toHaveBeenCalledOnce();

      // Navigate away from step 3
      rerender(<LocationStep {...baseProps({ view: { currentStep: 1 } })} />);
      expect(unmountSpy).not.toHaveBeenCalled();
      expect(screen.getByTestId('address-picker-stub')).toBeInTheDocument();

      // Navigate back to step 3
      rerender(<LocationStep {...baseProps({ view: { currentStep: 3 } })} />);
      expect(mountSpy).toHaveBeenCalledOnce();
      expect(unmountSpy).not.toHaveBeenCalled();
      expect(screen.getByTestId('address-picker-stub')).toBeInTheDocument();
    });

    it('reflects the listing-derived initial coordinates once mounted', () => {
      const { rerender } = render(
        <LocationStep {...baseProps({ view: { currentStep: 1, listing: makeListing({ latitude: 13.99 }) } })} />,
      );
      rerender(
        <LocationStep {...baseProps({ view: { currentStep: 3, listing: makeListing({ latitude: 13.99 }) } })} />,
      );
      expect(screen.getByTestId('address-picker-lat')).toHaveTextContent('13.99');
    });
  });
});
