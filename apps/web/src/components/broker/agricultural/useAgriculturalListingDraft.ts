import { useRef, useState } from 'react';
import { useCreateListing, useUpdateListing, useSubmitListing, useGetListing } from '@/hooks/useBrokerListings';
import { useListingImages } from '@/hooks/useListingImages';
import { ApiError } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import type { AgriculturalListingPayload } from './agriculturalListingPayload';

export interface UseAgriculturalListingDraftParams {
  canSubmit: boolean;
  buildPayload: () => AgriculturalListingPayload;
  /** Invoked at the start of every persistDraft() attempt, regardless of validity — lets the caller flip its own "attempted" UI flag. */
  onAttempt: () => void;
}

/**
 * #2398 — single owner of agricultural draft lifecycle: listing id,
 * create/update/submit orchestration, in-flight/idempotency guard, and
 * edit<->review mode. Does not hold the full form field state — see
 * useAgriculturalListingFormState for that owner. Mirrors
 * useResidentialListingDraft (#2387) / useCommercialListingDraft (#2388),
 * but deliberately WITHOUT URL-seeded draft recovery (issue #2398
 * guardrail: "Do not add URL draft recovery unless current product
 * behaviour already supports it" — the pre-decomposition
 * AgriculturalListingForm has no `initialDraftId`/`onDraftPersisted`
 * wiring, no `draftLoadError`/`draftSaveError`/`isRecoveringDraft` state,
 * and no hydration effect; none of that behaviour is invented here).
 */
export function useAgriculturalListingDraft({ canSubmit, buildPayload, onAttempt }: UseAgriculturalListingDraftParams) {
  const createListing = useCreateListing();
  const { toast } = useToast();

  const [listingId, setListingId] = useState<string | null>(null);
  const [mode, setMode] = useState<'edit' | 'review'>('edit');
  const [submitted, setSubmitted] = useState(false);
  const draftInFlightRef = useRef(false);

  const updateListing = useUpdateListing(listingId ?? '');
  const submitListing = useSubmitListing(listingId ?? undefined);
  const { images, imageCount } = useListingImages(listingId ?? undefined);
  const coverImageUrl = images[0]?.url ?? null;
  const { data: draftListing } = useGetListing(listingId ?? '');
  const addressConfirmed = draftListing?.addressConfirmed ?? false;

  const persistDraft = (onDone?: (id: string) => void) => {
    onAttempt();
    if (!canSubmit) return;

    if (listingId) {
      updateListing.mutate(buildPayload(), { onSuccess: () => onDone?.(listingId) });
      return;
    }

    if (draftInFlightRef.current || createListing.isPending) return;
    draftInFlightRef.current = true;

    createListing.mutate(buildPayload(), {
      onSuccess: (data) => {
        draftInFlightRef.current = false;
        setListingId(data.id);
        toast({ title: 'Draft saved', description: 'Continue adding photos, location, and a description below.' });
        onDone?.(data.id);
      },
      onError: (error: Error) => {
        draftInFlightRef.current = false;
        const apiErr = error as ApiError;
        const body = apiErr.body as Record<string, unknown> | undefined;
        const message =
          (body?.message as string | undefined) ??
          (body?.error as string | undefined) ??
          error.message;
        toast({ title: 'Could not save draft', description: message, variant: 'destructive' });
      },
    });
  };

  const handleGoToReview = () => persistDraft(() => setMode('review'));
  const handleBackToEdit = () => setMode('edit');

  const handleSubmitForReview = () => {
    if (!listingId) return;
    submitListing.mutate(undefined, {
      onSuccess: () => {
        setSubmitted(true);
        toast({ title: 'Submitted for review', description: 'Pending admin approval.' });
      },
      onError: (error: Error) => {
        const apiErr = error as ApiError;
        const body = apiErr.body as Record<string, unknown> | undefined;
        const message =
          (body?.message as string | undefined) ??
          (body?.error as string | undefined) ??
          error.message;
        toast({ title: 'Submit failed', description: message, variant: 'destructive' });
      },
    });
  };

  return {
    listingId,
    mode,
    setMode,
    submitted,
    draftListing,
    addressConfirmed,
    images,
    imageCount,
    coverImageUrl,
    createListing,
    updateListing,
    submitListing,
    persistDraft,
    handleGoToReview,
    handleBackToEdit,
    handleSubmitForReview,
  };
}

export type UseAgriculturalListingDraftResult = ReturnType<typeof useAgriculturalListingDraft>;
