import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { PropertyType } from '@/lib/listing-constants';

// Issue #1838 slice-7 — pure state-ownership extraction of the wizard
// step-navigation concern from EditListingForm, mirroring the discipline of
// useAgriFields/useCommercialFields/useRentFields/useResidentialFields/
// useSharedFields (typed result object, Dispatch<SetStateAction<T>> setter
// types, useState defaults verbatim). Unlike those hooks there is no
// hydrate() member — nav state is seeded ONCE from the URL at mount, not
// from a ListingResponse.
//
// STAYS IN THE PARENT (not nav-pure, never moved here): handleStepClick
// (reads the `steps` completion-gate array), the `steps` completion array
// (mixes nav labels + business isComplete gate state), all
// updateListing.mutate/submitListing.mutate calls, navigate() for the
// submit-for-review redirect, and propertyType/listingPurpose state itself
// (base scalars — passed to this hook as args).

const BASE_STEPS = ['Describe', 'Add Photos', 'Pin Location', 'Review & Submit'] as const;
const AGRI_STEPS = ['Describe', 'Add Photos', 'Pin Location', 'Draw Boundary', 'Review & Submit'] as const;

export interface UseEditListingNavigationResult {
  currentStep: number;
  setCurrentStep: Dispatch<SetStateAction<number>>;
  cameFromReview: boolean;
  setCameFromReview: Dispatch<SetStateAction<boolean>>;
  wizardSteps: readonly string[];
  reviewStep: number;
  boundaryStep: number;
  isAgriListing: boolean;
  advanceAfterSave: (sequentialNext: number) => void;
}

export function useEditListingNavigation(
  propertyType: PropertyType | '',
): UseEditListingNavigationResult {
  // First tuple element ONLY — no setSearchParams. This hook must never
  // write to the URL (no setSearchParams / navigate / history mutation).
  const [searchParams] = useSearchParams();

  // Dynamic wizard steps: agri listings get an extra "Draw Boundary" step (step 4).
  const isAgriListing = propertyType === 'agricultural_land';
  const wizardSteps = isAgriListing ? AGRI_STEPS : BASE_STEPS;
  const reviewStep = wizardSteps.length; // step number of the final "Review & Submit" step
  const boundaryStep = isAgriListing ? AGRI_STEPS.indexOf('Draw Boundary') + 1 : 0;

  // Step routing: read initial step from ?step= query param (1-based, default 1).
  // Guard against non-numeric values (e.g. ?step=abc → NaN) and clamp to [1, wizardSteps.length].
  //
  // PRESERVE-not-fix: this MUST stay a one-shot LAZY useState initializer.
  // propertyType starts as '' (BASE_STEPS, length 4) and is populated by the
  // parent's hydrate effect after the listing loads, which may later flip
  // wizardSteps to AGRI_STEPS (length 5). Because a lazy initializer runs
  // exactly once at mount, a deep-link ?step=5 on an agri listing clamps to
  // min(5,4)=4 and is NEVER re-expanded once propertyType flips to agri.
  // This is a KNOWN latent quirk in the original component, preserved
  // verbatim here — do NOT "fix" it with a useMemo/useEffect that recomputes
  // the clamp against the current wizardSteps.length, and do NOT make this
  // useState eager.
  const [currentStep, setCurrentStep] = useState<number>(() => {
    const stepParam = searchParams.get('step');
    return stepParam ? Math.max(1, Math.min(wizardSteps.length, parseInt(stepParam, 10) || 1)) : 1;
  });
  // When true: after saving a step, return to the review step instead of advancing sequentially
  const [cameFromReview, setCameFromReview] = useState(false);

  // Collapses the cameFromReview branch duplicated inline at the step-1 and
  // step-2 save onSuccess handlers: when the broker jumped back from Review
  // to edit a field, saving returns them to Review instead of advancing
  // sequentially through the wizard.
  const advanceAfterSave = useCallback((sequentialNext: number) => {
    if (cameFromReview) {
      setCameFromReview(false);
      setCurrentStep(reviewStep);
    } else {
      setCurrentStep(sequentialNext);
    }
  }, [cameFromReview, reviewStep]);

  return {
    currentStep,
    setCurrentStep,
    cameFromReview,
    setCameFromReview,
    wizardSteps,
    reviewStep,
    boundaryStep,
    isAgriListing,
    advanceAfterSave,
  };
}
