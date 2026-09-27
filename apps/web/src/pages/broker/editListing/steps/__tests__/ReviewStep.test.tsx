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
 *
 * Issue #1838 PR C commit 3 — updated to the {view, commands} prop contract
 * (see ../stepContracts.ts). This suite asserts the row/button wiring calls
 * the right `commands` function with the right argument — WHAT
 * editStepFromReview/editBoundary/resetTitleToLocality/submitForReview
 * actually do lives at the hook level (useEditListingCommands.test.ts).
 * Two previously-missing assertions added here per PR C: (a) the disabled
 * state driven by isSubmitting/isSaving, (b) a "fix now" row click
 * triggering editStepFromReview(step).
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

function baseProps(overrides: {
  view?: Partial<ReviewStepProps['view']>;
  commands?: Partial<ReviewStepProps['commands']>;
} = {}): ReviewStepProps {
  return {
    view: {
      listing: makeListing(),
      listingImages: [] as ListingImage[],
      id: 'listing-1',
      isSubmittable: true,
      canSubmitImages: true,
      requiredFieldsComplete: true,
      allConditionsMet: true,
      isRent: false,
      isAgriListing: false,
      boundaryCoords: [] as [number, number][],
      showTitleLocalityWarning: false,
      confirmedLocality: '',
      isSubmitting: false,
      isSaving: false,
      ...overrides.view,
    },
    commands: {
      submitForReview: vi.fn(),
      editStepFromReview: vi.fn(),
      editBoundary: vi.fn(),
      resetTitleToLocality: vi.fn(),
      ...overrides.commands,
    },
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

  it('each summary row Edit button calls editStepFromReview with the right step', async () => {
    const user = userEvent.setup();
    const editStepFromReview = vi.fn();
    render(<ReviewStep {...baseProps({ commands: { editStepFromReview } })} />);

    const editButtons = screen.getAllByRole('button', { name: 'Edit' });
    expect(editButtons).toHaveLength(3);

    await user.click(editButtons[0]); // Property Details -> step 1
    expect(editStepFromReview).toHaveBeenNthCalledWith(1, 1);

    await user.click(editButtons[1]); // Photos -> step 2
    expect(editStepFromReview).toHaveBeenNthCalledWith(2, 2);

    await user.click(editButtons[2]); // Location -> step 3
    expect(editStepFromReview).toHaveBeenNthCalledWith(3, 3);
  });

  it('boundary review Edit button calls editBoundary (agri only)', async () => {
    const user = userEvent.setup();
    const editBoundary = vi.fn();
    render(
      <ReviewStep
        {...baseProps({
          view: { isAgriListing: true, boundaryCoords: [[13.35, 74.75]] },
          commands: { editBoundary },
        })}
      />,
    );
    await user.click(screen.getByTestId('boundary-review-edit-btn'));
    expect(editBoundary).toHaveBeenCalledOnce();
  });

  it('renders the PoiManager stub when address is confirmed, and the empty state otherwise', () => {
    const { rerender } = render(
      <ReviewStep {...baseProps({ view: { listing: makeListing({ addressConfirmed: true }) } })} />,
    );
    expect(screen.getByTestId('poi-manager-stub')).toBeInTheDocument();

    rerender(<ReviewStep {...baseProps({ view: { listing: makeListing({ addressConfirmed: false }) } })} />);
    expect(screen.queryByTestId('poi-manager-stub')).not.toBeInTheDocument();
    expect(screen.getByText('Location not yet confirmed')).toBeInTheDocument();
  });

  it('submit button is disabled unless allConditionsMet, and calls submitForReview when clicked', async () => {
    const user = userEvent.setup();
    const submitForReview = vi.fn();

    const { rerender } = render(
      <ReviewStep {...baseProps({ view: { allConditionsMet: false }, commands: { submitForReview } })} />,
    );
    expect(screen.getByRole('button', { name: /submit for review/i })).toBeDisabled();

    rerender(
      <ReviewStep {...baseProps({ view: { allConditionsMet: true }, commands: { submitForReview } })} />,
    );
    const submitBtn = screen.getByRole('button', { name: /submit for review/i });
    expect(submitBtn).toBeEnabled();
    await user.click(submitBtn);
    expect(submitForReview).toHaveBeenCalledOnce();
  });

  it('submit button is disabled while isSubmitting or isSaving, even when allConditionsMet', () => {
    const { rerender } = render(
      <ReviewStep {...baseProps({ view: { allConditionsMet: true, isSubmitting: true, isSaving: false } })} />,
    );
    expect(screen.getByRole('button', { name: /submitting/i })).toBeDisabled();

    rerender(
      <ReviewStep {...baseProps({ view: { allConditionsMet: true, isSubmitting: false, isSaving: true } })} />,
    );
    expect(screen.getByRole('button', { name: /submit for review/i })).toBeDisabled();
  });

  it('does not render the submit section when isSubmittable is false', () => {
    render(<ReviewStep {...baseProps({ view: { isSubmittable: false } })} />);
    expect(screen.queryByRole('button', { name: /submit for review/i })).not.toBeInTheDocument();
  });

  it('shows the title/locality banner and Update title calls resetTitleToLocality', async () => {
    const user = userEvent.setup();
    const resetTitleToLocality = vi.fn();
    render(
      <ReviewStep
        {...baseProps({
          view: { showTitleLocalityWarning: true, confirmedLocality: 'Kaup, Udupi' },
          commands: { resetTitleToLocality },
        })}
      />,
    );
    expect(screen.getByTestId('title-locality-warning')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /update title/i }));
    expect(resetTitleToLocality).toHaveBeenCalledOnce();
  });

  it('a "Fix now" row click calls editStepFromReview(step) for the unmet condition', async () => {
    const user = userEvent.setup();
    const editStepFromReview = vi.fn();
    render(
      <ReviewStep
        {...baseProps({
          view: { requiredFieldsComplete: false, allConditionsMet: false },
          commands: { editStepFromReview },
        })}
      />,
    );
    // "Required fields" row (unmet) -> step 1
    await user.click(screen.getByText(/required fields/i));
    expect(editStepFromReview).toHaveBeenCalledWith(1);
  });

  it('a "Fix now" row Enter keypress calls editStepFromReview(step) for the unmet condition', async () => {
    const user = userEvent.setup();
    const editStepFromReview = vi.fn();
    render(
      <ReviewStep
        {...baseProps({
          view: { requiredFieldsComplete: false, allConditionsMet: false },
          commands: { editStepFromReview },
        })}
      />,
    );
    const row = screen.getByText(/required fields/i).closest('[role="button"]');
    expect(row).toBeInstanceOf(HTMLElement);
    if (row instanceof HTMLElement) {
      row.focus();
    }
    await user.keyboard('{Enter}');
    expect(editStepFromReview).toHaveBeenCalledWith(1);
  });
});
