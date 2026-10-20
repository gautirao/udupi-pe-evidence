/**
 * #2859 B4 (csv205, e2e/poi-locality-teaser.spec.ts LG1b-d, LG3e-f) — the review checklist's
 * "Required fields" row names locality and gates Submit.
 *
 * RENDER level: ReviewStep is stateless; `requiredFieldsComplete` / `allConditionsMet` arrive as
 * props. That a blank locality makes requiredFieldsComplete false is proved separately in
 * editListingSelectors.test.ts (#2859 LG.derive); that it survives a reload is RETAIN (R_reload).
 * PoiManager is stubbed exactly as ReviewStep.test.tsx does.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReviewStep } from '../ReviewStep';
import type { ListingResponse } from '@/hooks/useBrokerListings';
import type { ListingImage } from '@/hooks/useListingImages';
import type { ReviewStepProps } from '../stepContracts';

vi.mock('@/components/poi/PoiManager', () => ({
  PoiManager: ({ listingId }: { listingId: string }) => (
    <div data-testid="poi-manager-stub">{listingId}</div>
  ),
}));

function makeListing(overrides: Partial<ListingResponse> = {}): ListingResponse {
  return {
    id: 'listing-2859-lg', status: 'DRAFT', propertyType: 'house', title: 'Synthetic House', locality: '',
    price: 5000000, description: null, landArea: null, landAreaUnit: null, bedrooms: 3, builtArea: null,
    builtAreaUnit: null, latitude: 13.34, longitude: 74.74, addressConfirmed: true, imageCount: 3,
    firstImageUrl: null, rejectionReason: null, videoUrl: null, reraNumber: null,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', listingPurpose: 'sale',
    carpetArea: null, carpetAreaUnit: null, floorNumber: null, totalFloors: null, furnishingStatus: null,
    washrooms: null, parkingCount: null, roadFrontageFt: null, commercialUsage: null, numberOfUnits: null,
    monthlyRent: null, securityDepositMonths: null, lockInMonths: null, sellerType: null,
    earnedBadgeCount: 0, areaKey: null, waterSource: null, soilType: null, roadAccess: null,
    cultivationStatus: null, ownershipType: null, surveyNumber: null,
    ...overrides,
  };
}

function props(view: Partial<ReviewStepProps['view']>): ReviewStepProps {
  return {
    view: {
      listing: makeListing(), listingImages: [] as ListingImage[], id: 'listing-2859-lg',
      isSubmittable: true, canSubmitImages: true, requiredFieldsComplete: true, allConditionsMet: true,
      isRent: false, isAgriListing: false, boundaryCoords: [] as [number, number][],
      showTitleLocalityWarning: false, confirmedLocality: '', isSubmitting: false, isSaving: false,
      ...view,
    },
    commands: { submitForReview: vi.fn(), editStepFromReview: vi.fn(), editBoundary: vi.fn(), resetTitleToLocality: vi.fn() },
  };
}

describe('ReviewStep locality gate #2859 B4 (render level)', () => {
  it('LG1b-d -> LG3e-f: incomplete shows "Price, property type, and locality required" with Submit disabled; complete shows "All required fields filled in" with Submit enabled', () => {
    const { rerender } = render(
      <ReviewStep {...props({ requiredFieldsComplete: false, allConditionsMet: false })} />,
    );

    // Before (blank locality upstream): the row, its exact copy, and a disabled Submit.
    expect(screen.getByText('Required fields')).toBeInTheDocument();
    expect(screen.getByText('Price, property type, and locality required')).toBeInTheDocument();
    expect(screen.queryByText('All required fields filled in')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit for Review' })).toBeDisabled();

    // After (locality filled upstream): the same row turns complete and Submit is enabled.
    rerender(<ReviewStep {...props({ requiredFieldsComplete: true, allConditionsMet: true })} />);
    expect(screen.getByText('Required fields')).toBeInTheDocument();
    expect(screen.getByText('All required fields filled in')).toBeInTheDocument();
    expect(screen.queryByText(/locality required/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit for Review' })).toBeEnabled();
  });

  it('LG1c rent variant: an incomplete rent listing names monthly rent and locality', () => {
    render(<ReviewStep {...props({ isRent: true, requiredFieldsComplete: false, allConditionsMet: false })} />);
    expect(screen.getByText('Monthly rent, property type, and locality required')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit for Review' })).toBeDisabled();
  });
});
