/**
 * LocationStep — Issue #1838 slice 6a characterisation tests.
 *
 * LocationStep is a STATELESS presentational component extracted from
 * EditListingForm.tsx's step-3 ("Pin Location") render block.
 *
 * AddressPicker (and any react-leaflet map internals it pulls in) is mocked
 * to a lightweight stub per the #1837 OOM lesson — no real Leaflet map is
 * ever mounted in this suite.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocationStep } from '../LocationStep';
import type { ListingResponse } from '@/hooks/useBrokerListings';

vi.mock('@/components/broker/AddressPicker', () => ({
  AddressPicker: (props: {
    initialLatitude: number | null;
    initialLongitude: number | null;
    onConfirm: (addr: { lat: number; lng: number }) => void;
    onUnconfirm: () => void;
    onLocalityConfirmed: (locality: string, lat: number, lng: number) => void;
  }) => (
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
  ),
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

function baseProps(overrides: Partial<React.ComponentProps<typeof LocationStep>> = {}) {
  return {
    isSubmittable: true,
    listing: makeListing(),
    updateListing: { mutate: vi.fn(), isPending: false } as unknown as React.ComponentProps<typeof LocationStep>['updateListing'],
    handleLocalityConfirmed: vi.fn(),
    handleStep3Continue: vi.fn(),
    ...overrides,
  };
}

describe('LocationStep', () => {
  it('renders AddressPicker wired to the listing coordinates', () => {
    render(<LocationStep {...baseProps()} />);
    expect(screen.getByTestId('address-picker-stub')).toBeInTheDocument();
    expect(screen.getByTestId('address-picker-lat')).toHaveTextContent('13.34');
  });

  it('disables continue while addressConfirmed is false', () => {
    render(<LocationStep {...baseProps({ listing: makeListing({ addressConfirmed: false }) })} />);
    expect(screen.getByRole('button', { name: /save & continue/i })).toBeDisabled();
    expect(screen.getByText(/confirm your pin location/i)).toBeInTheDocument();
  });

  it('enables continue and calls handleStep3Continue when addressConfirmed is true', async () => {
    const user = userEvent.setup();
    const handleStep3Continue = vi.fn();
    render(
      <LocationStep
        {...baseProps({ listing: makeListing({ addressConfirmed: true }), handleStep3Continue })}
      />,
    );
    const continueBtn = screen.getByRole('button', { name: /save & continue/i });
    expect(continueBtn).toBeEnabled();
    await user.click(continueBtn);
    expect(handleStep3Continue).toHaveBeenCalledOnce();
  });

  it('calls updateListing.mutate on pin confirm and passes locality confirmation through to handleLocalityConfirmed', async () => {
    const user = userEvent.setup();
    const mutate = vi.fn();
    const handleLocalityConfirmed = vi.fn();
    render(
      <LocationStep
        {...baseProps({
          updateListing: { mutate, isPending: false } as unknown as React.ComponentProps<typeof LocationStep>['updateListing'],
          handleLocalityConfirmed,
        })}
      />,
    );

    await user.click(screen.getByText('confirm-pin'));
    expect(mutate).toHaveBeenCalledWith({ latitude: 13.35, longitude: 74.75, addressConfirmed: true });

    await user.click(screen.getByText('confirm-locality'));
    expect(handleLocalityConfirmed).toHaveBeenCalledWith('Manipal, Udupi', 13.35, 74.75);
  });

  it('renders nothing when isSubmittable is false', () => {
    render(<LocationStep {...baseProps({ isSubmittable: false })} />);
    expect(screen.queryByTestId('address-picker-stub')).not.toBeInTheDocument();
  });
});
