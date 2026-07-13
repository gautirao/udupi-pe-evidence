/**
 * ReviewStep — Issue #1838 slice 6a characterisation tests.
 *
 * ReviewStep is a STATELESS presentational component extracted from
 * EditListingForm.tsx's final "Review & Submit" render block.
 *
 * PoiManager is mocked to a lightweight stub per the #1837 OOM lesson.
 * PoiManager does not itself import react-leaflet, so no separate leaflet
 * mock is required here (verified against its source before writing this
 * suite).
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReviewStep } from '../ReviewStep';
import type { ListingResponse } from '@/hooks/useBrokerListings';
import type { ListingImage } from '@/hooks/useListingImages';

vi.mock('@/components/poi/PoiManager', () => ({
  PoiManager: ({ listingId }: { listingId: string }) => (
    <div data-testid="poi-manager-stub">{listingId}</div>
  ),
}));

function makeListing(overrides: Partial<ListingResponse> = {}): ListingResponse {
  return {
    id: 'listing-1',
    status: 'DRAFT',
    propertyType: 'house',
    title: 'Test House',
    locality: 'Manipal',
    price: 5000000,
    description: null,
    landArea: null,
    landAreaUnit: null,
    bedrooms: 3,
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
    ...overrides,
  };
}

type ReviewStepProps = React.ComponentProps<typeof ReviewStep>;

function baseProps(overrides: Partial<ReviewStepProps> = {}): ReviewStepProps {
  return {
    showTitleLocalityWarning: false,
    confirmedLocality: '',
    setTitle: vi.fn(),
    setTitleManuallyEdited: vi.fn(),
    listing: makeListing(),
    listingImages: [] as ListingImage[],
    canSubmitImages: true,
    setCameFromReview: vi.fn(),
    setCurrentStep: vi.fn(),
    isAgriListing: false,
    boundaryCoords: [] as [number, number][],
    boundaryStep: 0,
    id: 'listing-1',
    isSubmittable: true,
    requiredFieldsComplete: true,
    isRent: false,
    submitListing: { mutate: vi.fn(), isPending: false } as unknown as ReviewStepProps['submitListing'],
    updateListing: { mutate: vi.fn(), isPending: false } as unknown as ReviewStepProps['updateListing'],
    allConditionsMet: true,
    handleSubmitForReview: vi.fn(),
    ...overrides,
  };
}

describe('ReviewStep', () => {
  it('renders the review summary rows (property, photos, location)', () => {
    render(<ReviewStep {...baseProps()} />);
    expect(screen.getByText('Property Details')).toBeInTheDocument();
    expect(screen.getByText('Photos')).toBeInTheDocument();
    expect(screen.getByText('Location')).toBeInTheDocument();
    expect(screen.getByText(/confirmed · manipal/i)).toBeInTheDocument();
  });

  it('each summary row Edit button sets cameFromReview(true) and navigates to the right step', async () => {
    const user = userEvent.setup();
    const setCameFromReview = vi.fn();
    const setCurrentStep = vi.fn();
    render(<ReviewStep {...baseProps({ setCameFromReview, setCurrentStep })} />);

    const editButtons = screen.getAllByRole('button', { name: 'Edit' });
    expect(editButtons).toHaveLength(3);

    await user.click(editButtons[0]); // Property Details -> step 1
    expect(setCameFromReview).toHaveBeenNthCalledWith(1, true);
    expect(setCurrentStep).toHaveBeenNthCalledWith(1, 1);

    await user.click(editButtons[1]); // Photos -> step 2
    expect(setCameFromReview).toHaveBeenNthCalledWith(2, true);
    expect(setCurrentStep).toHaveBeenNthCalledWith(2, 2);

    await user.click(editButtons[2]); // Location -> step 3
    expect(setCameFromReview).toHaveBeenNthCalledWith(3, true);
    expect(setCurrentStep).toHaveBeenNthCalledWith(3, 3);
  });

  it('boundary review Edit button sets cameFromReview(false) and navigates to boundaryStep (agri only)', async () => {
    const user = userEvent.setup();
    const setCameFromReview = vi.fn();
    const setCurrentStep = vi.fn();
    render(
      <ReviewStep
        {...baseProps({
          isAgriListing: true,
          boundaryStep: 4,
          boundaryCoords: [[13.35, 74.75]],
          setCameFromReview,
          setCurrentStep,
        })}
      />,
    );
    await user.click(screen.getByTestId('boundary-review-edit-btn'));
    expect(setCameFromReview).toHaveBeenCalledWith(false);
    expect(setCurrentStep).toHaveBeenCalledWith(4);
  });

  it('renders the PoiManager stub when address is confirmed, and the empty state otherwise', () => {
    const { rerender } = render(
      <ReviewStep {...baseProps({ listing: makeListing({ addressConfirmed: true }) })} />,
    );
    expect(screen.getByTestId('poi-manager-stub')).toBeInTheDocument();

    rerender(<ReviewStep {...baseProps({ listing: makeListing({ addressConfirmed: false }) })} />);
    expect(screen.queryByTestId('poi-manager-stub')).not.toBeInTheDocument();
    expect(screen.getByText('Location not yet confirmed')).toBeInTheDocument();
  });

  it('submit button is disabled unless allConditionsMet, and calls handleSubmitForReview when clicked', async () => {
    const user = userEvent.setup();
    const handleSubmitForReview = vi.fn();

    const { rerender } = render(
      <ReviewStep {...baseProps({ allConditionsMet: false, handleSubmitForReview })} />,
    );
    expect(screen.getByRole('button', { name: /submit for review/i })).toBeDisabled();

    rerender(<ReviewStep {...baseProps({ allConditionsMet: true, handleSubmitForReview })} />);
    const submitBtn = screen.getByRole('button', { name: /submit for review/i });
    expect(submitBtn).toBeEnabled();
    await user.click(submitBtn);
    expect(handleSubmitForReview).toHaveBeenCalledOnce();
  });

  it('does not render the submit section when isSubmittable is false', () => {
    render(<ReviewStep {...baseProps({ isSubmittable: false })} />);
    expect(screen.queryByRole('button', { name: /submit for review/i })).not.toBeInTheDocument();
  });

  it('shows the title/locality banner and Update title resets the title', async () => {
    const user = userEvent.setup();
    const setTitle = vi.fn();
    const setTitleManuallyEdited = vi.fn();
    render(
      <ReviewStep
        {...baseProps({
          showTitleLocalityWarning: true,
          confirmedLocality: 'Kaup, Udupi',
          setTitle,
          setTitleManuallyEdited,
        })}
      />,
    );
    expect(screen.getByTestId('title-locality-warning')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /update title/i }));
    expect(setTitle).toHaveBeenCalledWith('Property in Kaup');
    expect(setTitleManuallyEdited).toHaveBeenCalledWith(false);
  });
});
