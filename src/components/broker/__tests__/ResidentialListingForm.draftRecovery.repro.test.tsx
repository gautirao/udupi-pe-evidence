/**
 * TEMPORARY BUG-REPRO SPEC — Issue #2039 (Mode-3 BUG_REPRO gate, Phase B1).
 *
 * Reproduces the broker-UX-review #2037 finding P-01: after a FAILED
 * "Review" (draft-create) request on the residential single-page create
 * flow (/broker/listings/new/residential), does the broker's already-entered
 * field state survive (a) a same-session retry and (b) a remount/refresh?
 *
 * The backend HTTP-500 that originally triggered this (#2038) is already
 * fixed (PR #2055), so the failure here is INDUCED at the client boundary:
 * '@/lib/api' is mocked so api.post('/api/listings', ...) rejects on the
 * first call (simulating any failed save, not just a 500) and resolves on
 * the second. This isolates the client-side state-preservation defect from
 * the already-fixed backend defect.
 *
 * DO NOT promote this file as-is without review — it is scaffolding for the
 * BUG_REPRO gate evidence, not a permanent regression test. See
 * .claude/handoffs/issue-2039/bug-repro-report.toml for the analysis this
 * spec backs.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockApiPost = vi.hoisted(() => vi.fn());
const mockApiGet = vi.hoisted(() => vi.fn());
const mockApiPut = vi.hoisted(() => vi.fn());
const mockApiDelete = vi.hoisted(() => vi.fn());
const mockToast = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  api: { get: mockApiGet, post: mockApiPost, put: mockApiPut, delete: mockApiDelete },
  ApiError: class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(msg: string, status: number, body: unknown) {
      super(msg);
      this.status = status;
      this.body = body;
    }
  },
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// Not exercised before a draft exists (listingId is null -> `enabled: false`),
// but ResidentialListingForm imports it unconditionally.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) } },
}));

import { ResidentialListingForm } from '@/components/broker/ResidentialListingForm';
import { ApiError } from '@/lib/api';

function renderForm() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ResidentialListingForm
        initialPropertyType="apartment"
        onSwitchToGenericFlow={() => {}}
        navigate={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

async function fillMinimalStrongFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Listing title *'), '3 BHK Apartment in Manipal');
  await user.type(screen.getByLabelText('Price (INR) *'), '5000000');
}

describe('ResidentialListingForm — draft-save-failure state recovery (Issue #2039 repro)', () => {
  beforeEach(() => {
    mockApiPost.mockReset();
    mockApiGet.mockReset();
    mockApiPut.mockReset();
    mockApiDelete.mockReset();
    mockToast.mockReset();
  });

  it('(a) same-session retry after a failed Review click PRESERVES entered field values (title input is not cleared)', async () => {
    mockApiPost.mockRejectedValueOnce(new Error('Internal Server Error'));

    const user = userEvent.setup();
    renderForm();
    await fillMinimalStrongFields(user);

    await user.click(screen.getByRole('button', { name: 'Review' }));

    await waitFor(() => expect(mockApiPost).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Could not save draft' }),
    ));

    // Evidence: after the failed attempt, the title the broker typed is
    // STILL in the input — same-session retry does not blank the form.
    expect(screen.getByLabelText('Listing title *')).toHaveValue('3 BHK Apartment in Manipal');
  });

  it('(b) a remount (simulating browser refresh) DISCARDS all entered field state and reverts to a blank Step-1 form — no draft id survives to recover it', async () => {
    // First mount: broker fills the form. api.post never resolves in this
    // test (remount happens before any Review click is even needed to prove
    // the defect — state lives ONLY in this component instance's useState).
    const user = userEvent.setup();
    const { unmount } = renderForm();
    await fillMinimalStrongFields(user);
    expect(screen.getByLabelText('Listing title *')).toHaveValue('3 BHK Apartment in Manipal');

    // Simulate a refresh: the real app has no sessionStorage/localStorage
    // persistence and no draft id in the URL for this route
    // (/broker/listings/new/residential takes no :id param — see App.tsx),
    // so a refresh is equivalent to unmount + fresh mount with zero props
    // carrying prior state.
    unmount();
    renderForm();

    // Evidence: the "refreshed" editor is back to blank Step 1 — the
    // previously entered title is gone, and no request was ever made to
    // recover a persisted draft (there is no id to recover it BY).
    expect(screen.getByLabelText('Listing title *')).toHaveValue('');
    expect(mockApiGet).not.toHaveBeenCalled();
  });

  it('(d) a second draft-create click while the FIRST is still in flight is guarded (draftInFlightRef) — no duplicate POST', async () => {
    let resolveFirst: (v: { id: string }) => void = () => {};
    mockApiPost.mockImplementationOnce(
      () => new Promise((resolve) => { resolveFirst = resolve; }),
    );

    const user = userEvent.setup();
    renderForm();
    await fillMinimalStrongFields(user);

    const reviewButton = screen.getByRole('button', { name: 'Review' });
    await user.click(reviewButton);
    // Button is disabled while createListing.isPending — a second click is a no-op.
    await user.click(reviewButton);

    expect(mockApiPost).toHaveBeenCalledTimes(1);
    resolveFirst({ id: 'listing-123' });
  });

  // --- Follow-up (OpenAI PLAN_REVIEW REVISION_REQUIRED) — executed evidence for
  // the UPDATE-path guard verdict and a create-path regression baseline. ---

  it('CREATE-PATH BASELINE: happy-path draft create — exactly one POST, "Draft saved" toast, no error toast, mode transitions to review', async () => {
    mockApiPost.mockResolvedValueOnce({ id: 'listing-123' });
    // listingId becomes non-null right after create resolves -> useGetListing/useListingImages
    // become enabled({!!listingId}) and fire api.get; satisfy both so the review-mode render doesn't hang on undefined query data.
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/images')) return Promise.resolve([]);
      return Promise.resolve({ id: 'listing-123', addressConfirmed: false, latitude: null, longitude: null, locality: '' });
    });

    const user = userEvent.setup();
    renderForm();
    await fillMinimalStrongFields(user);

    await user.click(screen.getByRole('button', { name: 'Review' }));

    await waitFor(() => expect(mockApiPost).toHaveBeenCalledTimes(1));
    expect(mockApiPost).toHaveBeenCalledWith('/api/listings', expect.any(Object));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Draft saved' }),
    ));
    expect(mockToast).not.toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));

    // Mode transition: review-mode heading + "Back to editing" replace the Step-1 form.
    await waitFor(() => expect(screen.getByText('Review your listing')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Back to editing' })).toBeInTheDocument();
  });

  it('UPDATE-PATH GUARD (executed, not code-citation): two rapid clicks against an EXISTING draft issue exactly one PUT — guarded by the disabled={...||updateListing.isPending} button binding, NOT by a draftInFlightRef-style guard in persistDraft', async () => {
    // Step 1: get a draft created (listingId set) while STAYING in edit mode —
    // click "Save draft" (persistDraft() with no onDone), not "Review", so mode
    // stays 'edit' and the update-path footer buttons remain mounted.
    mockApiPost.mockResolvedValueOnce({ id: 'listing-123' });
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/images')) return Promise.resolve([]);
      return Promise.resolve({ id: 'listing-123', addressConfirmed: false, latitude: null, longitude: null, locality: '' });
    });

    const user = userEvent.setup();
    renderForm();
    await fillMinimalStrongFields(user);

    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(mockApiPost).toHaveBeenCalledTimes(1));
    // Confirm we are now on the UPDATE path (listingId set, still mode='edit'):
    // the Step-1 "Listing title *" field must still be present (review mode
    // would have replaced it with the ResidentialReviewPreview).
    expect(screen.getByLabelText('Listing title *')).toBeInTheDocument();

    // Step 2: make the PUT hang so isPending stays true across both clicks,
    // then fire two rapid clicks on "Review" (persistDraft -> updateListing.mutate).
    let resolveUpdate: (v: unknown) => void = () => {};
    mockApiPut.mockImplementationOnce(() => new Promise((resolve) => { resolveUpdate = resolve; }));

    const reviewButton = screen.getByRole('button', { name: 'Review' });
    await user.click(reviewButton);
    // Second click while the PUT is in flight: the button's disabled attribute
    // (`disabled={!canSubmit || createListing.isPending || updateListing.isPending}`,
    // ResidentialListingForm.tsx ~L1083) is now true, so this second click is a
    // real-DOM no-op (disabled buttons do not dispatch click in jsdom either) —
    // it exercises the SAME mechanism a real double-click would hit.
    await user.click(reviewButton);

    expect(mockApiPut).toHaveBeenCalledTimes(1);
    resolveUpdate({});

    // VERDICT: GUARDED_BY_OTHER_MECHANISM — persistDraft's update branch
    // (`if (listingId) { updateListing.mutate(...); return; }`) has NO
    // draftInFlightRef-equivalent of its own, but the footer button's
    // `disabled` prop already includes `updateListing.isPending`, so in the
    // real rendered UI a second click cannot reach updateListing.mutate while
    // the first PUT is outstanding. A caller that invoked persistDraft()
    // directly (bypassing the disabled button) would NOT be protected —
    // the guard lives in the JSX binding, not in persistDraft itself.
  });

  // --- Round 3 (gate 3, qa test-writing) --------------------------------
  // TASK 1 — executed verdict on the self-flagged AC2 location hole.
  //
  // useResidentialLocation seeds locality/lat/lng/addressConfirmed via
  // useMountEffect, which fires exactly once (guarded by a useRef) off
  // whatever props it saw at the FIRST post-commit effect flush. The
  // ResidentialListingForm's own hydrate effect (`useEffect(() => {...},
  // [draftListing])`) deliberately does NOT call setLocality — the comment
  // at ResidentialListingForm.tsx ~L292 says useResidentialLocation "already
  // owns that seeding ... via its own contract". This test proves whether
  // that contract actually delivers for a URL-seeded draft whose fetch
  // settles AFTER first mount (the only case that matters in practice,
  // since a network round trip can never beat the first effect flush).
  it('AC2 LOCATION RECOVERY — a URL-seeded draft whose fetch settles asynchronously: does the confirmed locality/pin survive a refresh?', async () => {
    let resolveGet: (v: unknown) => void = () => {};
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/images')) return Promise.resolve([]);
      return new Promise((resolve) => {
        resolveGet = resolve;
      });
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ResidentialListingForm
          initialPropertyType="apartment"
          initialDraftId="listing-123"
          onSwitchToGenericFlow={() => {}}
          navigate={vi.fn()}
        />
      </QueryClientProvider>,
    );

    // Pre-settle window: the AC4 loading banner is visible, proving the
    // draft query has NOT resolved yet at this point — the mount (and
    // therefore useResidentialLocation's useMountEffect) has already
    // happened with addressConfirmed=false / lat=null / lng=null / locality=''.
    expect(screen.getByTestId('draft-recovery-loading')).toBeInTheDocument();

    // Now let the draft fetch settle, carrying a confirmed location.
    resolveGet({
      id: 'listing-123',
      title: 'Recovered Draft',
      addressConfirmed: true,
      latitude: 13.3492,
      longitude: 74.7935,
      locality: 'Manipal, Udupi',
    });

    // General field hydration (title) DOES recover — sanity check that the
    // rest of AC2 is intact and this isn't a broken-mock false negative.
    await waitFor(() => expect(screen.getByLabelText('Listing title *')).toHaveValue('Recovered Draft'));
    await waitFor(() => expect(screen.queryByTestId('draft-recovery-loading')).not.toBeInTheDocument());

    // THE ANSWER: does AddressSearch now show the confirmed-location banner
    // ("Location confirmed — <formatted>") that useResidentialLocation's
    // mount-time seed would have produced if it had run AFTER settle?
    //
    // VERDICT (fix cycle 2, executed not inferred): LOCATION_RECOVERS.
    // ResidentialListingForm.tsx now owns the useResidentialLocation call
    // via a module-level <ResidentialLocationBridge>, keyed on a value that
    // flips exactly once — from 'pending' to 'settled' — the render after
    // this URL-seeded draft's hydrate effect commits. That remount gives
    // the hook a SECOND useMountEffect flush, this time seeing the already-
    // resolved addressConfirmed/latitude/longitude/locality, so its
    // mount-time seed now runs with the correct data. This assertion is
    // written as the DIRECT, non-branching expected outcome — not wrapped
    // in an if/confirmedBanner-else — precisely so that if a future
    // regression breaks recovery again, this test FAILS LOUDLY (forcing an
    // update) instead of silently taking the other branch of a conditional
    // and reporting a false PASS either way.
    const searchInput = screen.getByLabelText('Search for a location') as HTMLInputElement;
    expect(searchInput.value).toBe('Manipal, Udupi');
    // Multiple nodes legitimately contain "Manipal, Udupi" once confirmed (the
    // green banner AND the buyers-see-only privacy caption below it) — assert
    // on the specific confirmed-banner copy instead of a bare text match.
    expect(screen.getByText('Location confirmed — Manipal, Udupi')).toBeInTheDocument();
  });

  // --- Round 4 (revision 3) — corrected regression tests for the new
  // decoupled locality-only seed branch in useResidentialLocation.ts.
  //
  // FIXTURE SHAPE CONTRACT (mandatory — see qa-fast T6 Q4 trap analysis):
  //   (a) search-only:   { locality: <non-empty>, addressConfirmed: false, latitude: null, longitude: null }
  //   (b) pin-confirmed: { locality: <non-empty>, latitude: <num>, longitude: <num>, addressConfirmed: true }
  // Round-1's AC2 test used addressConfirmed:true with null coordinates — a
  // combination the product can never produce (trap #3) — which is why it
  // passed green while failing in a real browser. Every fixture below is one
  // of the two reachable shapes; the pin-confirmed shape is fixture (b) and is
  // NEVER mixed with a null lat/lng.

  it('AC2-R — search-only recovery (fixture a, NO pin confirmation): remounting at the draft URL restores the search input, the form-level locality, and the "Add the locality" strength gate', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/images')) return Promise.resolve([]);
      return Promise.resolve({
        id: 'listing-123',
        title: 'Recovered Draft',
        addressConfirmed: false,
        latitude: null,
        longitude: null,
        locality: 'Manipal, Udupi',
      });
    });

    renderWithDraftId('listing-123');

    // The search input's value is the persisted locality.
    await waitFor(() =>
      expect((screen.getByLabelText('Search for a location') as HTMLInputElement).value).toBe('Manipal, Udupi'),
    );

    // Form-level locality recovered too — proves onPublicLoc actually fired
    // (not just the hook's internal query string): BuyerPreviewCard reads the
    // form's `locality` state, a completely separate value from the hook's
    // local `state.query`.
    const previewCard = screen.getByTestId('buyer-preview-card');
    expect(within(previewCard).getByText('Manipal, Udupi')).toBeInTheDocument();

    // The real submit-gate "Add the locality" row (src/lib/listingStrength.ts
    // `localityOk = input.locality.trim() !== ''`) flips to met/done styling.
    // NOTE: this is deliberately NOT the "Location entered" gate — that gate
    // is `locationResolved || addressConfirmed`, and this fix intentionally
    // never sets `resolved` (see AC10 below) or `addressConfirmed`, so
    // "Location entered" correctly stays unmet here. See report doubt #1.
    expect(screen.getByText('Add the locality')).toHaveClass('text-foreground');
  });

  it('AC10 (mandatory negative — the invariant guard) — with the SAME fixture (a), seeding from locality alone does NOT write addressConfirmed or produce ANY pin-confirmed state', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/images')) return Promise.resolve([]);
      return Promise.resolve({
        id: 'listing-123',
        title: 'Recovered Draft',
        addressConfirmed: false,
        latitude: null,
        longitude: null,
        locality: 'Manipal, Udupi',
      });
    });

    renderWithDraftId('listing-123');

    await waitFor(() =>
      expect((screen.getByLabelText('Search for a location') as HTMLInputElement).value).toBe('Manipal, Udupi'),
    );

    // ---- AC10 LOAD-BEARING ASSERTIONS ----------------------------------
    // These four are the actual substance of AC10: if any of them fail, the
    // decoupled locality-only seed has leaked a confirmed/pinned STATE that
    // the backend never wrote — a data-correctness lie, strictly worse than
    // the bug being fixed. (Main Agent ruling, AC10 ambiguity resolution.)

    // 1. addressConfirmed is never written by this seed path — pinConfirmedOk
    //    in listingStrength.ts is `input.addressConfirmed` alone, so this also
    //    covers the submit-gate side of the invariant.
    expect(screen.getByText('Map pin confirmed')).toHaveClass('text-muted-foreground');

    // 2. MapPin's "Pin confirmed" banner must NOT render — pinConfirmed stays false.
    expect(screen.queryByText(/^Pin confirmed —/)).not.toBeInTheDocument();
    // Instead the un-pinned CTA renders, and it's disabled because `resolved`
    // is still null (MapPin gates the CTA on `!resolved`, not on locality).
    expect(screen.getByRole('button', { name: /pin location on map/i })).toBeDisabled();

    // 3. BuyerPreviewCard's "Pinned" badge must NOT render — locationConfirmed
    //    is wired straight to the SERVER addressConfirmed flag, which is false.
    expect(screen.queryByTestId('buyer-preview-location-confirmed')).not.toBeInTheDocument();
    expect(screen.queryByText('Pinned')).not.toBeInTheDocument();
    // ---- end AC10 load-bearing assertions ------------------------------

    // ---- INCIDENTAL, not AC10's substance -------------------------------
    // AddressSearch's "Location confirmed" banner keys off `status ===
    // 'resolved'` (AddressSearch.tsx `isResolved`), NOT off any actual
    // confirmation — it already renders today during a normal live
    // search-and-Use flow, well before any pin is ever confirmed. That
    // naming/copy looseness pre-dates this change and this PR neither
    // introduces nor worsens it; fixing it is a separate, out-of-scope UI
    // follow-up (Main Agent ruling). We still assert it's absent here
    // because the fix deliberately seeds `status: 'typed'` (not 'resolved')
    // on this path — so this assertion is a tripwire: it would fail loudly
    // if someone later changed the seed to set `status: 'resolved'`, which
    // is exactly the change that would reintroduce the ambiguity this
    // ruling just settled. Failing this assertion alone does NOT mean AC10
    // failed; it means the seed's status value regressed.
    expect(screen.queryByText(/^Location confirmed —/)).not.toBeInTheDocument();
    // The un-resolved placeholder copy renders instead.
    expect(screen.getByText(/Search above or use your current location/i)).toBeInTheDocument();
    // ---- end incidental assertion ---------------------------------------
  });

  it('AC11 (regression lock) — pin-confirmed recovery (fixture b) still recovers exactly as before: pin/confirmed state restored, "Pin confirmed" banner renders, and BOTH location strength gates are met', async () => {
    mockApiGet.mockImplementation((url: string) => {
      // addressConfirmed:true here also mounts InlineNearby -> PoiManager
      // (Section 7 gates it on addressConfirmed, not on a later fetch
      // settling), which fires its own GET /pois and /pois/suggestions
      // requests — both must resolve to arrays or PoiManager crashes on
      // `(pois ?? []).filter`, unmounting the tree the test is asserting on.
      if (url.includes('/images') || url.includes('/pois')) return Promise.resolve([]);
      return Promise.resolve({
        id: 'listing-123',
        title: 'Recovered Draft',
        addressConfirmed: true,
        latitude: 13.3492,
        longitude: 74.7935,
        locality: 'Manipal, Udupi',
      });
    });

    renderWithDraftId('listing-123');

    await waitFor(() => expect(screen.getByText('Pin confirmed — Manipal, Udupi')).toBeInTheDocument());
    expect(screen.getByText('Location confirmed — Manipal, Udupi')).toBeInTheDocument();

    // Both location-related submit gates are met: "Location entered" (met via
    // `|| addressConfirmed`, the reload-safe branch) and "Map pin confirmed".
    expect(screen.getByText('Location entered')).toHaveClass('text-foreground');
    expect(screen.getByText('Map pin confirmed')).toHaveClass('text-foreground');
    expect(screen.getByText('Add the locality')).toHaveClass('text-foreground');

    // BuyerPreviewCard's "Pinned" badge renders.
    expect(screen.getByTestId('buyer-preview-location-confirmed')).toBeInTheDocument();
  });

  it('AC12 — fresh-create path (no draftId, initialLocality empty): the hook seeds nothing, the query stays empty, and no extra request is made', () => {
    renderForm();

    // Query stays empty — the `if (initialLocality)` branch never runs
    // because initialLocality is '' (falsy) on a fresh, non-URL-seeded mount.
    expect((screen.getByLabelText('Search for a location') as HTMLInputElement).value).toBe('');

    // No listingId yet -> useGetListing/useListingImages are `enabled: false`
    // -> no request at all (mirrors test (b) above's assertion for the same reason).
    expect(mockApiGet).not.toHaveBeenCalled();

    // Pre-draft path renders the legacy ListingStrengthMeter, whose
    // "Locality & title" row is unmet (locality state was never seeded).
    expect(screen.getByText('Locality & title')).toHaveClass('text-muted-foreground');
  });

  function renderWithDraftId(draftId: string) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return render(
      <QueryClientProvider client={queryClient}>
        <ResidentialListingForm
          initialPropertyType="apartment"
          initialDraftId={draftId}
          onSwitchToGenericFlow={() => {}}
          navigate={vi.fn()}
        />
      </QueryClientProvider>,
    );
  }

  it('AC2 — mounting with ?draftId=<id> hydrates title from the persisted draft instead of a blank Step-1 state', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/images')) return Promise.resolve([]);
      return Promise.resolve({
        id: 'listing-123',
        title: 'Recovered Draft Title',
        price: 4200000,
        addressConfirmed: false,
        latitude: null,
        longitude: null,
        locality: '',
      });
    });

    renderWithDraftId('listing-123');

    await waitFor(() => expect(screen.getByLabelText('Listing title *')).toHaveValue('Recovered Draft Title'));
  });

  it('PRE-EXISTING GAP (not caused by #2039, not fixed by this PR — flagged for the record): PriceField never hydrates from a persisted draft because ResidentialListingForm.tsx L987 hardcodes `initialRupees={null}` regardless of the hydrated `priceRupees` state', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/images')) return Promise.resolve([]);
      return Promise.resolve({
        id: 'listing-123',
        title: 'Recovered Draft Title',
        price: 4200000,
        addressConfirmed: false,
        latitude: null,
        longitude: null,
        locality: '',
      });
    });

    renderWithDraftId('listing-123');

    await waitFor(() => expect(screen.getByLabelText('Listing title *')).toHaveValue('Recovered Draft Title'));
    // This assertion documents CURRENT (buggy) behaviour, not desired behaviour.
    // If PriceField is ever wired to priceRupees, this test should be updated to
    // expect '42 lakh' and this comment block removed.
    expect(screen.getByLabelText('Price (INR) *')).toHaveValue('');
  });

  it('AC3 — one-shot + URL-seeded only: a LATER query settle does not clobber edits made after THIS session\'s own create success', async () => {
    // This session creates its own draft (listingId comes from createListing.onSuccess,
    // NOT from initialDraftId) — urlSeededRef must be false, so the hydrate effect
    // must never fire even though draftListing eventually has data.
    mockApiPost.mockResolvedValueOnce({ id: 'listing-999' });
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/images')) return Promise.resolve([]);
      return Promise.resolve({
        id: 'listing-999',
        title: 'SERVER-SIDE STALE TITLE',
        addressConfirmed: false,
        latitude: null,
        longitude: null,
        locality: '',
      });
    });

    const user = userEvent.setup();
    renderForm();
    await fillMinimalStrongFields(user);
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(mockApiPost).toHaveBeenCalledTimes(1));

    // Let the draft query (now enabled because listingId is set) settle.
    await waitFor(() => expect(mockApiGet).toHaveBeenCalled());

    // The locally-typed title must NOT be overwritten by the fetched draft's title —
    // this session's own create success is authoritative, never URL-seeded.
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByLabelText('Listing title *')).toHaveValue('3 BHK Apartment in Manipal');
  });

  it('AC4 — a 404 on the draft fetch degrades to a usable blank form with a visible error (never an infinite spinner)', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/images')) return Promise.resolve([]);
      return Promise.reject(new Error('Not Found'));
    });

    renderWithDraftId('missing-draft');

    // Pre-settle: loading banner visible, no error yet.
    expect(screen.getByTestId('draft-recovery-loading')).toBeInTheDocument();

    await waitFor(() => expect(screen.getByTestId('draft-recovery-error')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't load your saved draft/i);

    // Never stuck spinning.
    expect(screen.queryByTestId('draft-recovery-loading')).not.toBeInTheDocument();

    // Degrades to a usable blank form — title field present and empty, not disabled.
    const titleInput = screen.getByLabelText('Listing title *');
    expect(titleInput).toBeEnabled();
    expect(titleInput).toHaveValue('');
  });

  it('AC6 — a failed save leaves entered fields intact (already covered by test (a) above); photo section remains present after the failure', async () => {
    mockApiPost.mockRejectedValueOnce(new Error('Internal Server Error'));

    const user = userEvent.setup();
    renderForm();
    await fillMinimalStrongFields(user);
    await user.click(screen.getByRole('button', { name: 'Review' }));

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Could not save draft' }),
    ));

    // Fields intact.
    expect(screen.getByLabelText('Listing title *')).toHaveValue('3 BHK Apartment in Manipal');
    expect(screen.getByLabelText('Price (INR) *')).toHaveValue('5000000');
    // Still editable, not locked out by the failure.
    expect(screen.getByRole('button', { name: 'Review' })).toBeEnabled();
  });

  it('AC7 — with draftId present, hydration wins over initialPropertyType/initialListingPurpose prefill', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/images')) return Promise.resolve([]);
      return Promise.resolve({
        id: 'listing-777',
        title: '',
        propertyType: 'villa',
        listingPurpose: 'rent',
        addressConfirmed: false,
        latitude: null,
        longitude: null,
        locality: '',
      });
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ResidentialListingForm
          initialPropertyType="apartment"
          initialListingPurpose="sale"
          initialDraftId="listing-777"
          onSwitchToGenericFlow={() => {}}
          navigate={vi.fn()}
        />
      </QueryClientProvider>,
    );

    // "For Rent" toggle should end up selected (draft's listingPurpose), not
    // the 'sale' prefill the component was mounted with.
    await waitFor(() => expect(screen.getByRole('button', { name: 'For Rent', pressed: true })).toBeInTheDocument());
  });

  // --- Code-review finding (issue #2039, code-reviewer T3) --------------
  // ResidentialLocationBridge's lift-to-parent effect (ResidentialListingForm.tsx
  // ~L267) is keyed on individual hook state slices instead of the whole
  // `location` object. useResidentialLocation's requestGeo() "no
  // navigator.geolocation" branch (useResidentialLocation.ts L186-193) calls
  // setGeoError(...) WITHOUT touching `state`/`pickerOpen`/`saveError`/
  // `isSaving` — so if geoError is missing from the effect's dependency
  // array, the lift never re-fires and the parent's residentialLocationValue
  // (consumed by AddressSearch's not-supported alert) stays stale.
  it('geolocation-not-supported: clicking "Use my current location" with no navigator.geolocation shows the not-supported alert', async () => {
    const originalGeolocation = navigator.geolocation;
    // Simulate a browser with no Geolocation API (requestGeo()'s early-return branch).
    Object.defineProperty(global.navigator, 'geolocation', { value: undefined, configurable: true });

    try {
      const user = userEvent.setup();
      renderForm();

      await user.click(screen.getByRole('button', { name: /use my current location/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        /geolocation is not supported by your browser/i,
      );
    } finally {
      Object.defineProperty(global.navigator, 'geolocation', { value: originalGeolocation, configurable: true });
    }
  });

  it('Retry sequence: first failure, repeated attempt after failure, then eventual successful retry all issue the expected single POST each', async () => {
    mockApiPost
      .mockRejectedValueOnce(new Error('Internal Server Error'))
      .mockRejectedValueOnce(new Error('Internal Server Error'))
      .mockResolvedValueOnce({ id: 'listing-retry-1' });
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/images')) return Promise.resolve([]);
      return Promise.resolve({ id: 'listing-retry-1', addressConfirmed: false, latitude: null, longitude: null, locality: '' });
    });

    const user = userEvent.setup();
    renderForm();
    await fillMinimalStrongFields(user);

    const reviewButton = screen.getByRole('button', { name: 'Review' });

    await user.click(reviewButton);
    await waitFor(() => expect(mockApiPost).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText('Listing title *')).toHaveValue('3 BHK Apartment in Manipal');

    await user.click(reviewButton);
    await waitFor(() => expect(mockApiPost).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText('Listing title *')).toHaveValue('3 BHK Apartment in Manipal');

    await user.click(reviewButton);
    await waitFor(() => expect(mockApiPost).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(screen.getByText('Review your listing')).toBeInTheDocument());
  });

  // --- Round 5 (revision 4) — regression tests for the two rework findings:
  // (1) the fieldset-disable + 15s timeout escape guarding a deferred GET,
  // and (2) the persistent draft-save-error banner on a failed UPDATE.

  describe('FINDING 1 — deferred-GET keystroke protection during draft recovery', () => {
    it('a GET that is still PENDING keeps the editor non-editable — an in-flight keystroke cannot be silently accepted and then overwritten by hydration', async () => {
      // THE TRAP (do not fall into it): resolving the GET immediately (or
      // mocking isLoading:false) would make isRecoveringDraft false on first
      // render, leaving no window in which to attempt a keystroke, and the
      // test would pass while proving nothing. This fixture keeps the query
      // GENUINELY pending — mockApiGet returns an unsettled Promise whose
      // resolver is captured and invoked only after the typing attempt below.
      let resolveGet: (v: unknown) => void = () => {};
      mockApiGet.mockImplementation((url: string) => {
        if (url.includes('/images')) return Promise.resolve([]);
        return new Promise((resolve) => {
          resolveGet = resolve;
        });
      });

      const user = userEvent.setup();
      renderWithDraftId('listing-pending-1');

      // Pre-settle: the loading banner is up and the title field is disabled
      // (cascaded from the <fieldset disabled={isRecoveringDraft}>).
      expect(screen.getByTestId('draft-recovery-loading')).toBeInTheDocument();
      const titleInput = screen.getByLabelText('Listing title *');
      expect(titleInput).toBeDisabled();

      // Issue #2039 (revision 4, finding 1 — reviewer-required) — "Save draft"
      // and "Review" live in the sticky footer, OUTSIDE the <fieldset>, so
      // they need their own explicit isRecoveringDraft guard. Without it, a
      // broker could fire persistDraft() (PUT/POST blank or stale values)
      // while the real draft is still loading, even though every input above
      // is disabled — the exact regression this assertion protects against.
      expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Review' })).toBeDisabled();

      // Attempt to type into the field WHILE the GET is still unresolved.
      // A disabled native control cannot accept keystrokes — this must be a
      // real no-op, not merely "the value happens to match" after hydration.
      await user.type(titleInput, 'Broker typed this before recovery settled');
      expect(titleInput).toHaveValue('');

      // Now resolve the GET with a draft carrying DIFFERENT values than
      // whatever the broker attempted to type.
      resolveGet({
        id: 'listing-pending-1',
        title: 'Server Draft Title',
        addressConfirmed: false,
        latitude: null,
        longitude: null,
        locality: '',
      });

      // Post-settle: hydration wins cleanly — the draft's own value shows,
      // with no trace of the blocked keystroke (no partial merge, no
      // "Broker typed this before recovery settledServer Draft Title").
      await waitFor(() => expect(titleInput).toHaveValue('Server Draft Title'));
      expect(screen.queryByTestId('draft-recovery-loading')).not.toBeInTheDocument();
      expect(titleInput).toBeEnabled();
    });

    it('15s recovery timeout: a GET that never settles releases the form with a visible, recoverable error instead of staying locked forever', async () => {
      // Uses fake timers (not a real 15s wait) — advanced synchronously
      // inside act() so the component's setTimeout callback and the
      // resulting state updates are flushed deterministically.
      vi.useFakeTimers();
      try {
        mockApiGet.mockImplementation((url: string) => {
          if (url.includes('/images')) return Promise.resolve([]);
          return new Promise(() => {
            /* never resolves — simulates a hung GET */
          });
        });

        renderWithDraftId('listing-hung-1');

        expect(screen.getByTestId('draft-recovery-loading')).toBeInTheDocument();
        expect(screen.getByLabelText('Listing title *')).toBeDisabled();

        await act(async () => {
          vi.advanceTimersByTime(15_000);
        });

        // The AC4-style escape hatch fires: bad listingId dropped, error shown.
        expect(screen.getByTestId('draft-recovery-error')).toBeInTheDocument();
        expect(screen.getByRole('alert')).toHaveTextContent(/taking longer than expected/i);
        expect(screen.queryByTestId('draft-recovery-loading')).not.toBeInTheDocument();

        // Form is usable again — never permanently locked by a hung request.
        const titleInput = screen.getByLabelText('Listing title *');
        expect(titleInput).toBeEnabled();
        expect(titleInput).toHaveValue('');
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('FINDING 2 — persistent update-failure recovery banner', () => {
    // Issue #2039 (revision 4, code-reviewer T10) — `images` defaults to []
    // (the shape every OTHER test in this describe block relies on) but the
    // PUT-500 test below passes a known fixture photo so it can assert that
    // SPECIFIC photo survives the failure, not just that the container div
    // is still mounted.
    async function renderWithResolvedDraft(draftId: string, images: Array<{ id: string; url: string }> = []) {
      mockApiGet.mockImplementation((url: string) => {
        if (url.includes('/images')) return Promise.resolve(images);
        return Promise.resolve({
          id: draftId,
          title: 'Existing Draft',
          addressConfirmed: false,
          latitude: null,
          longitude: null,
          locality: '',
        });
      });
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
      render(
        <QueryClientProvider client={queryClient}>
          <ResidentialListingForm
            initialPropertyType="apartment"
            initialDraftId={draftId}
            onSwitchToGenericFlow={() => {}}
            navigate={vi.fn()}
          />
        </QueryClientProvider>,
      );
      // Wait past recovery so the fieldset is enabled and editable for the
      // rest of the test — this finding is about an UPDATE failure on an
      // ALREADY-recovered draft, not about the recovery window itself.
      await waitFor(() => expect(screen.getByLabelText('Listing title *')).toHaveValue('Existing Draft'));
      await waitFor(() => expect(screen.queryByTestId('draft-recovery-loading')).not.toBeInTheDocument());
    }

    it('a PUT 500 on an existing draft shows the persistent draft-save-error banner (role=alert, states draft is still saved, carries the draft id), keeps entered values and a specific already-uploaded photo intact, and Retry re-issues a PUT — never a POST', async () => {
      // Issue #2039 (revision 4, code-reviewer T10) — a known fixture photo,
      // so the assertion below proves THIS photo survives the failed PUT
      // rather than merely proving the photo-tile-grid container is still
      // mounted (the gap the reviewer flagged: a mounted-but-empty grid would
      // have passed the old assertion too).
      const FIXTURE_PHOTO = { id: 'img-1', url: 'https://example.com/listing-500-photo-1.jpg' };
      await renderWithResolvedDraft('listing-500', [FIXTURE_PHOTO]);

      const user = userEvent.setup();
      const titleInput = screen.getByLabelText('Listing title *');
      await user.clear(titleInput);
      await user.type(titleInput, 'Updated By Broker');
      await user.type(screen.getByLabelText('Price (INR) *'), '6000000');

      // A realistically-shaped ApiError — 500 with an `error` body field, the
      // exact shape src/lib/api.ts's ApiError carries and persistDraft's
      // onError reads via `body?.message ?? body?.error ?? error.message`.
      mockApiPut.mockRejectedValueOnce(
        new ApiError('Internal Server Error', 500, { error: 'Internal server error' }),
      );

      await user.click(screen.getByRole('button', { name: 'Save draft' }));
      await waitFor(() => expect(mockApiPut).toHaveBeenCalledTimes(1));

      const banner = await screen.findByTestId('draft-save-error');
      expect(banner).toHaveAttribute('role', 'alert');
      expect(banner).toHaveTextContent(/still saved/i);
      expect(banner).toHaveTextContent('listing-500');
      expect(banner).toHaveTextContent(/internal server error/i);

      expect(within(banner).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
      expect(within(banner).getByRole('button', { name: 'Continue editing' })).toBeInTheDocument();

      // Entered field values are NOT cleared by the failed save.
      expect(titleInput).toHaveValue('Updated By Broker');
      expect(screen.getByLabelText('Price (INR) *')).toHaveValue('6000000');
      // The specific previously-uploaded photo is still rendered inside the
      // photo tile grid — proves the actual photo survives, not just that
      // the (potentially empty) grid container stays mounted. Scoped to
      // photo-tile-0 because BuyerPreviewCard also renders its own
      // "Cover photo" <img> from the same image elsewhere on the page.
      const coverTile = screen.getByTestId('photo-tile-0');
      const coverPhoto = within(coverTile).getByAltText('Cover photo') as HTMLImageElement;
      expect(coverPhoto.src).toBe(FIXTURE_PHOTO.url);

      // Retry re-issues an UPDATE (PUT), never a create (POST) — no
      // duplicate listing, no extra state transition.
      mockApiPut.mockResolvedValueOnce({ id: 'listing-500' });
      await user.click(within(banner).getByRole('button', { name: 'Retry' }));

      await waitFor(() => expect(mockApiPut).toHaveBeenCalledTimes(2));
      expect(mockApiPost).not.toHaveBeenCalled();

      // Banner clears on a successful retry.
      await waitFor(() => expect(screen.queryByTestId('draft-save-error')).not.toBeInTheDocument());
    });

    it('a network-timeout-shaped PUT failure (plain Error, no .body) also surfaces the persistent banner with the raw error message, and "Continue editing" dismisses it without discarding entered values', async () => {
      await renderWithResolvedDraft('listing-timeout');

      const user = userEvent.setup();
      const titleInput = screen.getByLabelText('Listing title *');
      await user.clear(titleInput);
      await user.type(titleInput, 'Still Typing While Offline');
      await user.type(screen.getByLabelText('Price (INR) *'), '4500000');

      // Network-timeout shape: a plain Error with no `.body` at all — proves
      // persistDraft's onError doesn't crash trying to read `.body` off an
      // error that never had one, and falls back to `error.message`.
      mockApiPut.mockRejectedValueOnce(new Error('Network request timed out'));

      await user.click(screen.getByRole('button', { name: 'Save draft' }));
      await waitFor(() => expect(mockApiPut).toHaveBeenCalledTimes(1));

      const banner = await screen.findByTestId('draft-save-error');
      expect(banner).toHaveAttribute('role', 'alert');
      expect(banner).toHaveTextContent(/still saved/i);
      expect(banner).toHaveTextContent('listing-timeout');
      expect(banner).toHaveTextContent('Network request timed out');

      // Values survive the failure.
      expect(titleInput).toHaveValue('Still Typing While Offline');
      expect(screen.getByLabelText('Price (INR) *')).toHaveValue('4500000');

      // "Continue editing" dismisses the banner without touching field state
      // or issuing any further request.
      await user.click(within(banner).getByRole('button', { name: 'Continue editing' }));
      expect(screen.queryByTestId('draft-save-error')).not.toBeInTheDocument();
      expect(titleInput).toHaveValue('Still Typing While Offline');
      expect(mockApiPut).toHaveBeenCalledTimes(1);
      expect(mockApiPost).not.toHaveBeenCalled();
    });
  });
});
