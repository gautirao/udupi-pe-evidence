import type { ListingResponse } from '@/hooks/useBrokerListings';
import type { ListingImage } from '@/hooks/useListingImages';
import type { AddressPickerValue } from '@/components/broker/AddressPicker';

// Issue #1838 PR C commit 3 — {view, commands} prop-shape contracts for the
// converted step components (LocationStep, ReviewStep). Each step's own
// props interface is derived from these two halves: `view` is read-only
// display data, `commands` is the set of callbacks the step invokes. Kept
// separate from useEditListingCommands.ts's own local Describe-step types —
// this file is intentionally NOT the home for a DescribeStep contract (that
// is PR E's job).

export interface LocationStepView {
  isSubmittable: boolean;
  listing: ListingResponse;
  currentStep: number;
}

export interface LocationStepCommands {
  confirmAddress: (addr: AddressPickerValue) => void;
  unconfirmAddress: () => void;
  confirmLocality: (locality: string, lat: number, lng: number) => void;
  saveAndContinue: () => void;
}

export interface LocationStepProps {
  view: LocationStepView;
  commands: LocationStepCommands;
}

export interface ReviewStepView {
  listing: ListingResponse;
  listingImages: ListingImage[];
  id: string | undefined;
  isSubmittable: boolean;
  canSubmitImages: boolean;
  requiredFieldsComplete: boolean;
  allConditionsMet: boolean;
  isRent: boolean;
  isAgriListing: boolean;
  boundaryCoords: [number, number][];
  showTitleLocalityWarning: boolean;
  confirmedLocality: string;
  isSubmitting: boolean;
  isSaving: boolean;
}

export interface ReviewStepCommands {
  submitForReview: () => void;
  editStepFromReview: (step: number) => void;
  editBoundary: () => void;
  resetTitleToLocality: () => void;
}

export interface ReviewStepProps {
  view: ReviewStepView;
  commands: ReviewStepCommands;
}
