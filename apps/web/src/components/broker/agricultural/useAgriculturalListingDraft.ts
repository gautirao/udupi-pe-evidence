import { useEffect, useRef, useState } from 'react';
import { useCreateListing, useUpdateListing, useSubmitListing, useGetListing, type ListingResponse } from '@/hooks/useBrokerListings';
import { useListingImages } from '@/hooks/useListingImages';
import { ApiError } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import type { AgriculturalListingPayload } from './agriculturalListingPayload';

/**
 * #2811 (mirrors #2053 / #2215) — upper bound on how long initial URL-seeded
 * draft recovery may hold the form in the disabled "Loading your saved draft…"
 * state before falling back to a fresh blank draft with a visible banner.
 */
const DRAFT_RECOVERY_TIMEOUT_MS = 10_000;

export interface UseAgriculturalListingDraftParams {
  initialDraftId?: string | null;
  onDraftPersisted?: (id: string) => void;
  canSubmit: boolean;
  buildPayload: () => AgriculturalListingPayload;
  /** Invoked at the start of every persistDraft() attempt, regardless of validity — lets the caller flip its own "attempted" UI flag. */
  onAttempt: () => void;
  /** One-shot callback invoked at most once when a URL-seeded draft finishes loading. */
  onHydrate: (listing: ListingResponse) => void;
}

/**
 * #2398 / #2811 — single owner of agricultural draft lifecycle: listing id,
 * URL-seeded recovery + timeout/error fallback, create/update/submit
 * orchestration, in-flight/idempotency guard, and edit<->review mode. Does
 * not hold the full form field state — see useAgriculturalListingFormState
 * for that owner. Mirrors useResidentialListingDraft (#2387) /
 * useCommercialListingDraft (#2388).
 */
export function useAgriculturalListingDraft({
  initialDraftId,
  onDraftPersisted,
  canSubmit,
  buildPayload,
  onAttempt,
  onHydrate,
}: UseAgriculturalListingDraftParams) {
  const createListing = useCreateListing();
  const { toast } = useToast();

  // #2811 — Seed `listingId` from `initialDraftId` (when present in the URL) so
  // a browser refresh re-attaches to the already-created draft instead of
  // minting a duplicate on the next Save draft / Review click.
  const [listingId, setListingId] = useState<string | null>(() => initialDraftId || null);
  const [mode, setMode] = useState<'edit' | 'review'>('edit');
  const [submitted, setSubmitted] = useState(false);
  const [draftLoadError, setDraftLoadError] = useState<string | null>(null);
  const [draftSaveError, setDraftSaveError] = useState<string | null>(null);
  const draftInFlightRef = useRef(false);
  // True only when `listingId` came from `initialDraftId` at mount — we only
  // hydrate form fields from `draftListing` in that recovery case, never after
  // an in-session `createListing` (where local state is already authoritative
  // and may contain unsaved edits made since the POST).
  const urlSeededRef = useRef(Boolean(initialDraftId));
  const didHydrateRef = useRef(false);

  const updateListing = useUpdateListing(listingId ?? '');
  const submitListing = useSubmitListing(listingId ?? undefined);
  const { images, imageCount } = useListingImages(listingId ?? undefined);
  const coverImageUrl = images[0]?.url ?? null;
  const {
    data: draftListing,
    isError: draftLoadFailed,
    isLoading: draftQueryLoading,
  } = useGetListing(listingId ?? '');
  const addressConfirmed = draftListing?.addressConfirmed ?? false;

  // True while a URL-seeded `draftId` is still being fetched for the first time.
  // Form inputs and Save/Review actions are disabled during this window so the
  // broker cannot type into blank fields that `hydrateFrom` is about to
  // overwrite, or click Save and overwrite the server draft with empty state.
  const isRecoveringDraft =
    urlSeededRef.current && !didHydrateRef.current && Boolean(listingId) && draftQueryLoading;

  // Bounded recovery wait: if `useGetListing` stays pending past
  // DRAFT_RECOVERY_TIMEOUT_MS, clear the stale `listingId` and unlock the form
  // as a fresh draft with a visible banner — same fallback as the `isError`
  // path below.
  useEffect(() => {
    if (!isRecoveringDraft) return;
    const timer = setTimeout(() => {
      if (didHydrateRef.current) return;
      didHydrateRef.current = true;
      setListingId(null);
      setDraftLoadError(
        'Loading your saved draft is taking longer than expected. Starting a new listing instead.',
      );
    }, DRAFT_RECOVERY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isRecoveringDraft]);

  // #2811 — One-shot hydration of form fields from the server draft when the
  // page mounted with `?draftId=<id>`. Also handles the stale/unowned/deleted
  // draftId case: if `useGetListing` errors (404/403), clear `listingId` so the
  // broker isn't trapped on a broken `PUT /api/listings/<dead-id>` and surface
  // a non-blocking notice.
  /* eslint-disable react-hooks/exhaustive-deps -- intentional one-shot hydration gated by didHydrateRef; only draftListing/draftLoadFailed transitions should trigger */
  useEffect(() => {
    if (!urlSeededRef.current || didHydrateRef.current) return;
    if (draftLoadFailed) {
      didHydrateRef.current = true;
      setListingId(null);
      setDraftLoadError(
        "We couldn't load your saved draft — it may have been removed. Starting a new listing instead.",
      );
      return;
    }
    if (!draftListing) return;
    didHydrateRef.current = true;
    setMode('edit');
    onHydrate(draftListing);
  }, [draftListing, draftLoadFailed]);
  /* eslint-enable react-hooks/exhaustive-deps */

  const persistDraft = (onDone?: (id: string) => void) => {
    onAttempt();
    if (!canSubmit || isRecoveringDraft) return;

    if (listingId) {
      setDraftSaveError(null);
      updateListing.mutate(buildPayload(), {
        onSuccess: () => {
          onDone?.(listingId);
        },
        onError: (error: Error) => {
          const apiErr = error as ApiError;
          const body = apiErr.body as Record<string, unknown> | undefined;
          const message =
            (body?.message as string | undefined) ??
            (body?.error as string | undefined) ??
            error.message;
          setDraftSaveError(message);
          toast({ title: 'Could not save draft', description: message, variant: 'destructive' });
        },
      });
      return;
    }

    if (draftInFlightRef.current || createListing.isPending) return;
    draftInFlightRef.current = true;
    setDraftSaveError(null);

    createListing.mutate(buildPayload(), {
      onSuccess: (data) => {
        draftInFlightRef.current = false;
        setListingId(data.id);
        setDraftLoadError(null);
        onDraftPersisted?.(data.id);
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
        setDraftSaveError(message);
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
    draftLoadError,
    draftSaveError,
    isRecoveringDraft,
    urlSeededRef,
    didHydrateRef,
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
