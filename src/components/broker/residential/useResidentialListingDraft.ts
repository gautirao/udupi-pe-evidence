import { useEffect, useRef, useState } from 'react';
import { useCreateListing, useUpdateListing, useSubmitListing, useGetListing, type ListingResponse } from '@/hooks/useBrokerListings';
import { useListingImages } from '@/hooks/useListingImages';
import { ApiError } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import type { ResidentialListingPayload } from './residentialListingPayload';

/**
 * Issue #2039 (revision 4, finding 1) — upper bound on how long the editor
 * may stay disabled while recovering a URL-seeded draft. See the
 * isRecoveringDraft timeout effect below for the escape-hatch this guards.
 */
const DRAFT_RECOVERY_TIMEOUT_MS = 15_000;

export interface UseResidentialListingDraftParams {
  /**
   * Issue #2039 — a draft id recovered from the route's ?draftId= query param
   * at mount (URL-seeded only). When present, the editor hydrates from the
   * persisted draft instead of starting a blank Step-1 create — see the
   * one-shot hydrate effect below. Never re-seeded after mount.
   */
  initialDraftId?: string | null;
  canSubmit: boolean;
  buildPayload: () => ResidentialListingPayload;
  /** Invoked at the start of every persistDraft() attempt, regardless of validity — lets the caller flip its own "attempted" UI flag. */
  onAttempt: () => void;
  /**
   * Issue #2039 — fired exactly once, right after THIS session's own first
   * successful draft create (never on later updates), so the route-owning
   * page can stash the new id into the URL via history REPLACE.
   */
  onDraftPersisted?: (id: string) => void;
  /** Invoked exactly once, when a URL-seeded draft settles with data — the typed form-state owner's one-shot hydration entry point. */
  onHydrate: (draftListing: ListingResponse) => void;
}

/**
 * #2387 — single owner of residential draft lifecycle: listing/draft id,
 * get/create/update/submit persistence orchestration, URL-seeded recovery
 * (loading/timeout/error), create/update in-flight guards, and edit<->review
 * mode. Does not hold the full form field state — see
 * useResidentialListingFormState for that owner; this hook only drives its
 * one-shot hydration via onHydrate. Mirrors useCommercialListingDraft
 * (#2388), plus the residential-only persistent draftSaveError banner state
 * (issue #2039, revision 4, finding 2) that Commercial's simpler
 * toast-only error path doesn't have.
 */
export function useResidentialListingDraft({ initialDraftId, canSubmit, buildPayload, onAttempt, onDraftPersisted, onHydrate }: UseResidentialListingDraftParams) {
  const createListing = useCreateListing();
  const { toast } = useToast();

  // Issue #2039 — seeded from initialDraftId at mount (useState initializer
  // only runs once), so a session's own createListing.onSuccess is never
  // clobbered by a later prop change (the route replaces the URL, it does not
  // remount this component).
  const [listingId, setListingId] = useState<string | null>(initialDraftId ?? null);
  const [mode, setMode] = useState<'edit' | 'review'>('edit');
  const [submitted, setSubmitted] = useState(false);
  const draftInFlightRef = useRef(false);

  // Issue #2039 — captured once at mount: true only when this instance was
  // mounted WITH a draftId already in the URL (a fresh page load / real
  // browser refresh), never when listingId is later set by this session's
  // own create. Guards the one-shot hydrate effect below.
  const urlSeededRef = useRef(initialDraftId != null);
  const didHydrateRef = useRef(false);
  const [draftLoadError, setDraftLoadError] = useState<string | null>(null);
  // Issue #2039 (revision 4, finding 2) — persistent, actionable failure state
  // for a FAILED update (PUT) of an EXISTING draft. Reuses the draftLoadError
  // pattern (component state, not a toast — survives navigation/tab-switch and
  // the TOAST_LIMIT=1 eviction that a later toast would cause). Cleared on a
  // successful retry (or dismissed via "Continue editing").
  const [draftSaveError, setDraftSaveError] = useState<string | null>(null);

  const updateListing = useUpdateListing(listingId ?? '');
  const submitListing = useSubmitListing(listingId ?? undefined);
  const { images, imageCount } = useListingImages(listingId ?? undefined);
  const coverImageUrl = images[0]?.url ?? null;
  // Address confirmation/lat/lng are read back from the persisted listing (not local
  // state) so they survive the edit<->review mode switch, which unmounts AddressPicker —
  // matches EditListing.tsx's pattern (listing.addressConfirmed / .latitude / .longitude).
  const draftListingQuery = useGetListing(listingId ?? '');
  const draftListing = draftListingQuery.data;
  const addressConfirmed = draftListing?.addressConfirmed ?? false;

  // Issue #2039 (AC2/AC3/AC7) — one-shot hydrate of the editor from a
  // URL-seeded draft. Only runs for an instance mounted WITH a draftId
  // (urlSeededRef), only once (didHydrateRef), and only once the draft query
  // has actually settled with data — never overwrites state set by this
  // session's own createListing.onSuccess (that path never sets urlSeededRef).
  useEffect(() => {
    if (!urlSeededRef.current || didHydrateRef.current || !draftListing) return;
    didHydrateRef.current = true;
    // AC3 — a refreshed draft always lands back in edit mode, never review.
    setMode('edit');
    onHydrate(draftListing);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onHydrate is invoked exactly once via didHydrateRef, its identity shouldn't retrigger this
  }, [draftListing]);

  // Issue #2039 (AC4) — a stale/foreign/deleted draftId (403/404, or any
  // fetch failure) degrades to a usable blank create form instead of an
  // infinite spinner or a silent blank form: drop the bad listingId so the
  // form behaves like a fresh create, and surface a clear inline message.
  useEffect(() => {
    if (!urlSeededRef.current || didHydrateRef.current || !draftListingQuery.isError) return;
    didHydrateRef.current = true;
    setListingId(null);
    setDraftLoadError("We couldn't load your saved draft — it may have been removed. Starting a new listing instead.");
  }, [draftListingQuery.isError]);

  // Issue #2039 (AC4) — true only while a URL-seeded draft is still being
  // fetched for the very first time; never true for the session's own
  // in-flight create/update calls.
  const isRecoveringDraft = urlSeededRef.current && !didHydrateRef.current && draftListingQuery.isLoading;

  // Issue #2039 (revision 4, finding 1) — bounds isRecoveringDraft so the
  // editor it disables can never stay locked forever. useGetListing's
  // underlying fetch has no client-side timeout, so a hung request would
  // otherwise leave isLoading (and therefore isRecoveringDraft) true
  // indefinitely — neither the hydrate-success effect nor the AC4 isError
  // effect would ever fire to release it. If recovery is still unresolved
  // after DRAFT_RECOVERY_TIMEOUT_MS, treat it exactly like the AC4 error
  // path: drop the bad listingId and surface the same recoverable inline
  // error, which re-enables the form.
  useEffect(() => {
    if (!isRecoveringDraft) return;
    const timer = setTimeout(() => {
      if (didHydrateRef.current) return;
      didHydrateRef.current = true;
      setListingId(null);
      setDraftLoadError("Loading your saved draft is taking longer than expected. Starting a new listing instead.");
    }, DRAFT_RECOVERY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isRecoveringDraft]);

  /**
   * Issue #1718 — persists a DRAFT (or, once one exists, syncs core-field
   * edits into it via PUT) and stays on THIS page — no navigation. Idempotent:
   * draftInFlightRef guards against a duplicate create firing from a
   * double-click or re-render race while the mutation is in flight.
   */
  const persistDraft = (onDone?: (id: string) => void) => {
    onAttempt();
    if (!canSubmit) return;

    if (listingId) {
      updateListing.mutate(buildPayload(), {
        onSuccess: () => {
          // Issue #2039 (revision 4, finding 2) — a successful retry clears
          // the persistent failure banner below.
          setDraftSaveError(null);
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
        },
      });
      return;
    }

    if (draftInFlightRef.current || createListing.isPending) return;
    draftInFlightRef.current = true;

    createListing.mutate(buildPayload(), {
      onSuccess: (data) => {
        draftInFlightRef.current = false;
        setListingId(data.id);
        toast({ title: 'Draft saved', description: 'Continue adding photos, location, and a description below.' });
        // Issue #2039 (AC1) — fires exactly once per session, right after the
        // FIRST successful create; the route-owning page uses this to stash
        // the id into the URL (history REPLACE) so a refresh can recover it.
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
    draftLoadError,
    draftSaveError,
    setDraftSaveError,
    isRecoveringDraft,
    images,
    imageCount,
    coverImageUrl,
    createListing,
    updateListing,
    submitListing,
    persistDraft,
    handleBackToEdit,
    handleSubmitForReview,
    // Exposed only so useResidentialListingLocation's remount-key logic
    // can mirror the original inline read of these refs at render time —
    // NOT for general consumption.
    urlSeededRef,
    didHydrateRef,
  };
}

export type UseResidentialListingDraftResult = ReturnType<typeof useResidentialListingDraft>;
