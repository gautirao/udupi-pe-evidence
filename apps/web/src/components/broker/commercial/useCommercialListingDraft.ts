import { useEffect, useRef, useState } from 'react';
import { useCreateListing, useUpdateListing, useSubmitListing, useGetListing, type ListingResponse } from '@/hooks/useBrokerListings';
import { useListingImages } from '@/hooks/useListingImages';
import { ApiError } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import type { CommercialListingPayload } from './commercialListingPayload';

const DRAFT_RECOVERY_TIMEOUT_MS = 15_000;

export interface UseCommercialListingDraftParams {
  /**
   * #2348 — a draft id recovered from the route's ?draftId= query param at
   * mount (URL-seeded only). When present, the form hydrates from the
   * persisted draft instead of starting a blank Step-1 create. Never
   * re-seeded after mount.
   */
  initialDraftId?: string | null;
  canSubmit: boolean;
  buildPayload: () => CommercialListingPayload;
  /** Invoked at the start of every persistDraft() attempt, regardless of validity — lets the caller flip its own "attempted" UI flag. */
  onAttempt: () => void;
  /**
   * #2348 — fired exactly once, right after this session's own first
   * successful draft create (never on later updates), so the route-owning
   * page can stash the new id into the URL via history REPLACE.
   */
  onDraftPersisted?: (id: string) => void;
  /** Invoked exactly once, when a URL-seeded draft settles with data — the typed form-state owner's one-shot hydration entry point. */
  onHydrate: (draftListing: ListingResponse) => void;
}

/**
 * #2388 — single owner of commercial draft lifecycle: listing/draft id,
 * get/create/update/submit persistence orchestration, URL-seeded recovery
 * (loading/timeout/error), create/update in-flight guards, and edit<->review
 * mode. Does not hold the full form field state — see
 * useCommercialListingFormState for that owner; this hook only drives its
 * one-shot hydration via onHydrate.
 */
export function useCommercialListingDraft({ initialDraftId, canSubmit, buildPayload, onAttempt, onDraftPersisted, onHydrate }: UseCommercialListingDraftParams) {
  const createListing = useCreateListing();
  const { toast } = useToast();

  // #2348 — seeded from initialDraftId at mount (useState initializer only
  // runs once), mirrors ResidentialListingForm.tsx (issue #2039).
  const [listingId, setListingId] = useState<string | null>(initialDraftId ?? null);
  const [mode, setMode] = useState<'edit' | 'review'>('edit');
  const [submitted, setSubmitted] = useState(false);
  const draftInFlightRef = useRef(false);

  // #2348 — captured once at mount: true only when this instance was mounted
  // WITH a draftId already in the URL (a fresh page load / real browser
  // refresh), never when listingId is later set by this session's own
  // create. Guards the one-shot hydrate effect below.
  const urlSeededRef = useRef(initialDraftId != null);
  const didHydrateRef = useRef(false);
  const [draftLoadError, setDraftLoadError] = useState<string | null>(null);

  const updateListing = useUpdateListing(listingId ?? '');
  const submitListing = useSubmitListing(listingId ?? undefined);
  const { images, imageCount } = useListingImages(listingId ?? undefined);
  const coverImageUrl = images[0]?.url ?? null;
  const draftListingQuery = useGetListing(listingId ?? '');
  const draftListing = draftListingQuery.data;
  const addressConfirmed = draftListing?.addressConfirmed ?? false;

  useEffect(() => {
    if (!urlSeededRef.current || didHydrateRef.current || !draftListing) return;
    didHydrateRef.current = true;
    // A refreshed draft always lands back in edit mode, never review.
    setMode('edit');
    onHydrate(draftListing);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onHydrate is invoked exactly once via didHydrateRef, its identity shouldn't retrigger this
  }, [draftListing]);

  // #2348 — a stale/foreign/deleted draftId (403/404, or any fetch failure)
  // degrades to a usable blank create form instead of an infinite spinner or
  // a silent blank form: drop the bad listingId so the form behaves like a
  // fresh create, and surface a clear inline message. Mirrors
  // ResidentialListingForm.tsx (issue #2039, AC4).
  useEffect(() => {
    if (!urlSeededRef.current || didHydrateRef.current || !draftListingQuery.isError) return;
    didHydrateRef.current = true;
    setListingId(null);
    setDraftLoadError("We couldn't load your saved draft — it may have been removed. Starting a new listing instead.");
  }, [draftListingQuery.isError]);

  // #2348 — true only while a URL-seeded draft is still being fetched for
  // the very first time; never true for the session's own in-flight
  // create/update calls.
  const isRecoveringDraft = urlSeededRef.current && !didHydrateRef.current && draftListingQuery.isLoading;

  // #2348 — bounds isRecoveringDraft so it can never stay locked forever if
  // the fetch hangs with no client-side timeout. Mirrors
  // ResidentialListingForm.tsx (issue #2039, revision 4, finding 1).
  useEffect(() => {
    if (!isRecoveringDraft) return;
    const timer = setTimeout(() => {
      if (didHydrateRef.current) return;
      didHydrateRef.current = true;
      setListingId(null);
      setDraftLoadError('Loading your saved draft is taking longer than expected. Starting a new listing instead.');
    }, DRAFT_RECOVERY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isRecoveringDraft]);

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
        onDraftPersisted?.(data.id);
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
    submitted,
    draftListing,
    addressConfirmed,
    draftLoadError,
    isRecoveringDraft,
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
    // Exposed only so useCommercialLocationOrchestration's remount-key logic
    // can mirror the original inline read of these refs at render time —
    // NOT for general consumption.
    urlSeededRef,
    didHydrateRef,
  };
}
