import type { useUpdateListing } from '@/hooks/useBrokerListings';
import type { AddressPickerValue } from '@/components/broker/AddressPicker';
import type { LocationStepCommands } from './steps/stepContracts';

// Issue #1838 PR F — step-3 ("Pin Location") commands, split out of the
// former useEditListingCommands.ts. VERBATIM logic move — the isPending
// guard on confirm/unconfirm, and no onError added to either mutate call
// (hook-level onError in useUpdateListing already toasts). Zero
// useCallback/useMemo — plain per-render closures.

export interface UseLocationStepCommandsParams {
  titleManuallyEdited: boolean;
  setTitle: (v: string) => void;
  setConfirmedLocality: (v: string) => void;
  setCameFromReview: (v: boolean) => void;
  setCurrentStep: (v: number) => void;
  isAgriListing: boolean;
  reviewStep: number;
  updateListing: ReturnType<typeof useUpdateListing>;
}

export function useLocationStepCommands({
  titleManuallyEdited, setTitle, setConfirmedLocality,
  setCameFromReview, setCurrentStep, isAgriListing, reviewStep, updateListing,
}: UseLocationStepCommandsParams): LocationStepCommands {
  /**
   * AC5 / D1 hybrid — called by AddressPicker after broker confirms a pin.
   * Auto-regenerates the title from the confirmed locality when the broker
   * has not yet manually edited the title field.
   */
  const handleLocalityConfirmed = (locality: string, _lat: number, _lng: number) => {
    setConfirmedLocality(locality);
    if (!titleManuallyEdited) {
      // Generate a sensible default title from the confirmed locality.
      // Extract the first meaningful segment (everything up to the first comma)
      // to keep the title concise.
      const shortLocality = locality.split(',')[0].trim();
      if (shortLocality) {
        setTitle(`Property in ${shortLocality}`);
      }
    }
  };

  const handleStep3Continue = () => {
    setCameFromReview(false);
    // For agri listings, step 4 = Draw Boundary; for others, step 4 = Review & Submit.
    // Using isAgriListing ? 4 : reviewStep makes this safe if BASE_STEPS ever changes.
    setCurrentStep(isAgriListing ? 4 : reviewStep);
  };

  return {
    confirmAddress: (addr: AddressPickerValue) => {
      if (!updateListing.isPending) {
        updateListing.mutate({ latitude: addr.lat, longitude: addr.lng, addressConfirmed: true });
      }
    },
    unconfirmAddress: () => {
      if (!updateListing.isPending) {
        updateListing.mutate({ addressConfirmed: false });
      }
    },
    confirmLocality: handleLocalityConfirmed,
    saveAndContinue: handleStep3Continue,
  };
}
