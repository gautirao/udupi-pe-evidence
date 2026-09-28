import type { useUpdateListing } from '@/hooks/useBrokerListings';
import { toGeoJsonString } from '@/lib/geoJsonUtils';
import type { BoundaryStepCommands } from './steps/stepContracts';

// Issue #1838 PR F — step-4 ("Draw Boundary", agricultural_land only)
// commands, split out of the former useEditListingCommands.ts. VERBATIM
// logic move — setBoundaryCoords still runs BEFORE mutate. Zero
// useCallback/useMemo — plain per-render closures.

export interface UseBoundaryStepCommandsParams {
  setBoundaryCoords: (coords: [number, number][]) => void;
  setCurrentStep: (v: number) => void;
  reviewStep: number;
  updateListing: ReturnType<typeof useUpdateListing>;
}

export function useBoundaryStepCommands({
  setBoundaryCoords, setCurrentStep, reviewStep, updateListing,
}: UseBoundaryStepCommandsParams): BoundaryStepCommands {
  const handleStep4Continue = (coords: [number, number][]) => {
    setBoundaryCoords(coords);
    // Persist boundary to backend immediately (mirrors how step 3 saves location)
    updateListing.mutate(
      { boundary: toGeoJsonString(coords) },
      {
        onSuccess: () => {
          setCurrentStep(reviewStep);
        },
      },
    );
  };

  const handleStep4Skip = () => {
    // Boundary remains whatever it was (may be empty); advance to review
    setCurrentStep(reviewStep);
  };

  return {
    continue: handleStep4Continue,
    skip: handleStep4Skip,
  };
}
