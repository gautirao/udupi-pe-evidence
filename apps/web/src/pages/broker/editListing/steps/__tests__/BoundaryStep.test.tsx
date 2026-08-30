/**
 * BoundaryStep — Issue #1838 slice 6a characterisation tests.
 *
 * BoundaryStep is a STATELESS presentational component extracted from
 * EditListingForm.tsx's step-4 ("Draw Boundary", agricultural_land only)
 * render block.
 *
 * BoundaryDrawStep (and any react-leaflet map internals it pulls in) is
 * mocked to a lightweight stub per the #1837 OOM lesson.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BoundaryStep } from '../BoundaryStep';
import type { ListingResponse } from '@/hooks/useBrokerListings';

vi.mock('@/components/dealer/BoundaryDrawStep', () => ({
  BoundaryDrawStep: (props: {
    initialCoords: [number, number][];
    center: [number, number];
    onSave: (coords: [number, number][]) => void;
    onSkip: () => void;
    declaredArea: number | null;
    declaredUnit: string | null;
  }) => (
    <div data-testid="boundary-draw-stub">
      <span data-testid="boundary-coord-count">{props.initialCoords.length}</span>
      <button type="button" onClick={() => props.onSave([[13.35, 74.75], [13.36, 74.76]])}>
        save-boundary
      </button>
      <button type="button" onClick={() => props.onSkip()}>
        skip-boundary
      </button>
    </div>
  ),
}));

function makeListing(overrides: Partial<ListingResponse> = {}): ListingResponse {
  return {
    id: 'listing-1',
    status: 'DRAFT',
    propertyType: 'agricultural_land',
    title: 'Test Agri Land',
    locality: null,
    price: 2000000,
    description: null,
    landArea: 2,
    landAreaUnit: 'acre',
    bedrooms: null,
    builtArea: null,
    builtAreaUnit: null,
    latitude: 13.34,
    longitude: 74.74,
    addressConfirmed: true,
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
    computedAreaAcres: null,
    ...overrides,
  };
}

function baseProps(overrides: Partial<React.ComponentProps<typeof BoundaryStep>> = {}) {
  return {
    boundaryCoords: [] as [number, number][],
    listing: makeListing(),
    handleStep4Continue: vi.fn(),
    handleStep4Skip: vi.fn(),
    ...overrides,
  };
}

describe('BoundaryStep', () => {
  it('renders BoundaryDrawStep with the current boundary coords and declared area', () => {
    render(
      <BoundaryStep
        {...baseProps({ boundaryCoords: [[13.35, 74.75], [13.36, 74.76], [13.37, 74.77]] })}
      />,
    );
    expect(screen.getByTestId('boundary-draw-stub')).toBeInTheDocument();
    expect(screen.getByTestId('boundary-coord-count')).toHaveTextContent('3');
  });

  it('calls handleStep4Continue with the saved coords when BoundaryDrawStep saves', async () => {
    const user = userEvent.setup();
    const handleStep4Continue = vi.fn();
    render(<BoundaryStep {...baseProps({ handleStep4Continue })} />);
    await user.click(screen.getByText('save-boundary'));
    expect(handleStep4Continue).toHaveBeenCalledWith([[13.35, 74.75], [13.36, 74.76]]);
  });

  it('calls handleStep4Skip when BoundaryDrawStep is skipped', async () => {
    const user = userEvent.setup();
    const handleStep4Skip = vi.fn();
    render(<BoundaryStep {...baseProps({ handleStep4Skip })} />);
    await user.click(screen.getByText('skip-boundary'));
    expect(handleStep4Skip).toHaveBeenCalledOnce();
  });
});
