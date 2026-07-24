import { useState } from 'react';
import { searchNominatim, reverseGeocode, type NominatimResult } from '@/lib/geocode';
import { useUpdateListing } from '@/hooks/useBrokerListings';
import type { AddressPickerValue } from '@/components/broker/AddressPicker';
import { derivePublicLoc } from '@/components/broker/residential/deriveResolvedLocation';
import { useMountEffect } from '@/hooks/useMountEffect';

// ---------------------------------------------------------------------------
// Issue #1722 correction #4 — SINGLE SOURCE OF TRUTH for the residential
// create-listing location flow. Instantiated ONCE by ResidentialListingForm
// and passed to both the Section 2 <AddressSearch> and the Section 6
// <MapPin> views, so resolving via either surface enables the other.
//
// 3-STATE INVARIANT (preserved from InlineLocation, issue #1718/#1722):
//   1. typed    — free text, nothing confirmed.
//   2. resolved — a search result / browser-location was picked. LOCAL ONLY:
//                 never sets addressConfirmed, never loads POIs.
//   3. confirmed pin — the ONLY write of addressConfirmed:true, fired from
//                 the map-pin modal's explicit Confirm (via the EXISTING
//                 useUpdateListing PUT — unchanged endpoint/shape).
//
// PRIVACY: `resolved.formatted` (the full geocoded string) and the exact pin
// lat/lng live in this hook's state ONLY. `resolved.publicLoc` (coarse
// locality+city, derived by deriveResolvedLocation.ts) is the only location
// data ever pushed up to the form via onPublicLoc — that value is what gets
// persisted as `locality` and shown on BuyerPreviewCard.
// ---------------------------------------------------------------------------

export interface ResolvedLocation {
  /** Full geocoded/display string — PRIVATE, map/pin/POI use only. */
  formatted: string;
  /** Coarse buyer-facing locality — the ONLY value ever persisted as `locality`. */
  publicLoc: string;
  center: { lat: number; lng: number };
  source: 'search' | 'browser';
}

export type LocationStatus = 'empty' | 'typed' | 'searching' | 'results' | 'notfound' | 'resolved';
export type GeoPermission = 'idle' | 'prompt' | 'locating' | 'granted' | 'denied';

export interface LocationState {
  query: string;
  status: LocationStatus;
  results: readonly NominatimResult[];
  resolved: ResolvedLocation | null;
  geoPermission: GeoPermission;
  pin: { lat: number; lng: number } | null;
  pinConfirmed: boolean;
}

const GEO_ERROR_MESSAGES: Record<number, string> = {
  1: 'Location access denied. You can still search for your address above.',
  2: 'Location unavailable. Please try searching manually.',
  3: 'Location request timed out. Please try searching manually.',
};

const INITIAL_STATE: LocationState = {
  query: '',
  status: 'empty',
  results: [],
  resolved: null,
  geoPermission: 'idle',
  pin: null,
  pinConfirmed: false,
};

/** AC-4.4 — a query this short/numeric can never resolve; skip the API call. */
function isUnsearchable(cleaned: string): boolean {
  return cleaned.length < 3 || !/[a-zA-Z]/.test(cleaned);
}

export interface UseResidentialLocationParams {
  /** Null before the draft is persisted — pin-confirm actions are gated on this by the caller. */
  listingId: string | null;
  /** The SERVER addressConfirmed flag (from useGetListing) — never local state. */
  addressConfirmed: boolean;
  initialLatitude: number | null;
  initialLongitude: number | null;
  initialLocality: string;
  /** Pushes the coarse buyer-facing locality up to the form. NEVER receives `formatted`. */
  onPublicLoc: (publicLoc: string) => void;
}

export function useResidentialLocation({
  listingId,
  addressConfirmed,
  initialLatitude,
  initialLongitude,
  initialLocality,
  onPublicLoc,
}: UseResidentialLocationParams) {
  const updateListing = useUpdateListing(listingId ?? '');
  const [state, setState] = useState<LocationState>(INITIAL_STATE);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Reload hydration (contract §B) — if the draft ALREADY has a confirmed
  // pin at mount time, seed local state from it once so "Change"/"Adjust pin"
  // work without waiting for a fresh resolve.
  //
  // Code-review fix (issue #1722 correction #4): this must run exactly once,
  // on mount, REGARDLESS of whether the seed condition was met — not only
  // when the seeding branch is taken. If it re-ran later (e.g. a LATER
  // in-session confirmPin -> useUpdateListing's query invalidation ->
  // draftListing refetch -> addressConfirmed/lat/lng prop change), it would
  // clobber the just-set `resolved.formatted` (the live, detailed geocoded
  // string) with the coarser persisted `locality` — a one-time cosmetic
  // flicker of the confirmed banner/pin caption. useMountEffect guarantees
  // this can only ever seed a TRULY pre-existing confirmed draft (data
  // already present when the hook first mounts), and can never re-fire
  // afterward — the in-session resolve -> confirm flow is untouched (it
  // never goes through this effect at all).
  useMountEffect(() => {
    if (addressConfirmed && initialLatitude != null && initialLongitude != null) {
      const publicLoc = initialLocality ?? '';
      setState({
        query: publicLoc,
        status: 'resolved',
        results: [],
        resolved: {
          formatted: publicLoc,
          publicLoc,
          center: { lat: initialLatitude, lng: initialLongitude },
          source: 'search',
        },
        geoPermission: 'idle',
        pin: { lat: initialLatitude, lng: initialLongitude },
        pinConfirmed: true,
      });
      // Keep locality consistent for callers that reuse this hook in a
      // resume/edit flow (never fired on the create-flow's own mount, since
      // onPublicLoc there just re-sets the form's existing `locality` state).
      onPublicLoc(publicLoc);
    }
  });

  // Unconfirm the persisted pin — used by both "Change" and query-edit
  // invalidation. Does not touch local resolved/pin state; callers reset
  // that themselves so the UI can decide what (if anything) to preserve.
  const unconfirmPersisted = () => {
    if (updateListing.isPending) return;
    setSaveError(null);
    updateListing.mutate({ addressConfirmed: false });
  };

  const runSearch = async (value: string) => {
    const cleaned = value.trim();
    if (isUnsearchable(cleaned)) {
      setState((prev) => ({ ...prev, status: 'notfound', results: [] }));
      return;
    }
    setState((prev) => ({ ...prev, status: 'searching' }));
    try {
      const res = await searchNominatim(value);
      setState((prev) => ({ ...prev, status: res.length > 0 ? 'results' : 'notfound', results: res }));
    } catch {
      setState((prev) => ({ ...prev, status: 'notfound', results: [] }));
    }
  };

  // AC1/state-2 — a search-result pick is LOCAL ONLY: never persists
  // addressConfirmed, never loads POIs (InlineNearby gates on the SERVER
  // addressConfirmed flag, unaffected by this).
  const selectResult = (result: NominatimResult) => {
    const publicLoc = derivePublicLoc(result);
    setState((prev) => ({
      ...prev,
      query: result.display_name,
      status: 'resolved',
      results: [],
      resolved: {
        formatted: result.display_name,
        publicLoc,
        center: { lat: result.lat, lng: result.lon },
        source: 'search',
      },
      pin: null,
      pinConfirmed: false,
    }));
    onPublicLoc(publicLoc);
  };

  // AC-4.5 — rationale gate: navigator.geolocation is only ever called from
  // allowGeo(), never from requestGeo().
  const requestGeo = () => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser. Please search for your address above.');
      return;
    }
    setGeoError(null);
    setState((prev) => ({ ...prev, geoPermission: 'prompt' }));
  };

  const dismissGeo = () => {
    setState((prev) => ({ ...prev, geoPermission: 'idle' }));
  };

  const allowGeo = () => {
    setState((prev) => ({ ...prev, geoPermission: 'locating' }));
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        void (async () => {
          let rev: NominatimResult | null = null;
          try {
            rev = await reverseGeocode(latitude, longitude);
          } catch {
            rev = null;
          }
          const fallback = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
          const formatted = rev?.display_name ?? fallback;
          const publicLoc = rev ? derivePublicLoc(rev) : fallback;
          setState((prev) => ({
            ...prev,
            query: formatted,
            status: 'resolved',
            results: [],
            resolved: { formatted, publicLoc, center: { lat: latitude, lng: longitude }, source: 'browser' },
            geoPermission: 'granted',
            pin: null,
            pinConfirmed: false,
          }));
          onPublicLoc(publicLoc);
        })();
      },
      (error) => {
        setState((prev) => ({ ...prev, geoPermission: 'denied' }));
        setGeoError(GEO_ERROR_MESSAGES[error.code] ?? 'Could not get your location. Please try searching manually.');
      },
      { timeout: 10000 },
    );
  };

  // Query-edit invalidation (contract §E) — a keystroke that diverges from
  // the value backing the current `resolved` drops resolved/pin/pinConfirmed
  // AND clears the buyer-facing locality AND (if a pin was persisted)
  // unconfirms it server-side. This is the SAME reset "Change" performs.
  const editQuery = (value: string) => {
    const isRealEdit = (state.resolved != null || state.pinConfirmed) && value !== state.query;

    if (isRealEdit) {
      setState({
        query: value,
        status: value.trim() === '' ? 'empty' : 'typed',
        results: [],
        resolved: null,
        geoPermission: 'idle',
        pin: null,
        pinConfirmed: false,
      });
      onPublicLoc('');
      if (addressConfirmed) unconfirmPersisted();
      return;
    }

    setState((prev) => ({
      ...prev,
      query: value,
      status: value.trim() === '' ? 'empty' : prev.resolved ? prev.status : 'typed',
      results: value.trim() === '' ? [] : prev.results,
    }));
  };

  // "Change" — same reset as query-edit invalidation, triggered explicitly.
  const clear = () => {
    onPublicLoc('');
    if (addressConfirmed) unconfirmPersisted();
    setState(INITIAL_STATE);
    setGeoError(null);
  };

  const openPicker = () => setPickerOpen(true);
  const cancelPicker = () => setPickerOpen(false); // no PUT — reverts implicitly (pin/resolved untouched)
  const adjustPin = () => setPickerOpen(true);

  const confirmPin = (addr: AddressPickerValue) => {
    if (updateListing.isPending) return;
    setSaveError(null);
    updateListing.mutate(
      { latitude: addr.lat, longitude: addr.lng, addressConfirmed: true },
      {
        onSuccess: () => {
          setState((prev) => ({ ...prev, pin: { lat: addr.lat, lng: addr.lng }, pinConfirmed: true }));
          setPickerOpen(false);
        },
        onError: () => setSaveError('Could not save the pin location. Please try again.'),
      },
    );
  };

  const findDisabled = state.query.trim() === '' || state.status === 'searching';

  return {
    state,
    geoError,
    pickerOpen,
    saveError,
    isSaving: updateListing.isPending,
    findDisabled,
    runSearch,
    selectResult,
    requestGeo,
    allowGeo,
    dismissGeo,
    editQuery,
    clear,
    openPicker,
    cancelPicker,
    adjustPin,
    confirmPin,
  };
}

export type UseResidentialLocationResult = ReturnType<typeof useResidentialLocation>;
