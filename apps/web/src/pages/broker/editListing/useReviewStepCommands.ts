import { useNavigate } from 'react-router-dom';
import type { useToast } from '@/hooks/use-toast';
import type { useSubmitListing } from '@/hooks/useBrokerListings';
import { ApiError } from '@/lib/api';
import type { ReviewStepCommands } from './steps/stepContracts';

// Issue #1838 PR F — review/submit commands, split out of the former
// useEditListingCommands.ts. VERBATIM logic move — handleSubmitForReview's
// onError 3-way message precedence (body.message -> body.error ->
// error.message) is preserved exactly. Zero useCallback/useMemo — plain
// per-render closures.

export interface UseReviewStepCommandsParams {
  confirmedLocality: string;
  setTitle: (v: string) => void;
  setTitleManuallyEdited: (v: boolean) => void;
  setCameFromReview: (v: boolean) => void;
  setCurrentStep: (v: number) => void;
  boundaryStep: number;
  submitListing: ReturnType<typeof useSubmitListing>;
  toast: ReturnType<typeof useToast>['toast'];
}

export function useReviewStepCommands({
  confirmedLocality, setTitle, setTitleManuallyEdited,
  setCameFromReview, setCurrentStep, boundaryStep, submitListing, toast,
}: UseReviewStepCommandsParams): ReviewStepCommands {
  const navigate = useNavigate();

  const handleSubmitForReview = () => {
    submitListing.mutate(undefined, {
      onSuccess: () => {
        toast({ title: 'Listing submitted for review' });
        navigate('/broker/listings');
      },
      onError: (error: Error) => {
        const apiErr = error as ApiError;
        const body = apiErr.body as Record<string, unknown> | undefined;
        const message =
          (body?.message as string | undefined) ??
          (body?.error as string | undefined) ??
          error.message;
        toast({
          title: 'Submit failed',
          description: message,
          variant: 'destructive',
        });
      },
    });
  };

  return {
    submitForReview: handleSubmitForReview,
    editStepFromReview: (step: number) => {
      setCameFromReview(true);
      setCurrentStep(step);
    },
    editBoundary: () => {
      setCameFromReview(false);
      setCurrentStep(boundaryStep);
    },
    resetTitleToLocality: () => {
      const shortLocality = confirmedLocality.split(',')[0].trim();
      if (shortLocality) {
        setTitle(`Property in ${shortLocality}`);
        setTitleManuallyEdited(false);
      }
    },
  };
}
