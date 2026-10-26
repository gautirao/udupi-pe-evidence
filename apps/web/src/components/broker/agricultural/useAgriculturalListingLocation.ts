import { createElement, useEffect, useState, type MutableRefObject, type ReactNode } from 'react';
import type { ListingResponse } from '@/hooks/useBrokerListings';
import {
  useResidentialLocation,
  type UseResidentialLocationParams,
  type UseResidentialLocationResult,
} from '@/components/broker/residential/useResidentialLocation';

interface AgriculturalLocationBridgeProps {
  params: UseResidentialLocationParams;
  onLocation: (location: UseResidentialLocationResult) => void;
}

/**
 * #2811 (mirrors #2039 / #2387 / #2388) — owns the SINGLE
 * `useResidentialLocation` instance, defined at module scope so its component
 * identity is stable across parent renders and only the caller's `key` prop
 * controls remounting.
 *
 * `useResidentialLocation`'s own `useMountEffect` captures
 * `addressConfirmed`/`initialLatitude`/`initialLongitude`/`initialLocality`
 * once at its first post-mount effect flush. For a URL-seeded draft
 * (`?draftId=<id>`), that flush runs before the network fetch resolves.
 * Remounting this bridge once when `locationRemountKey` transitions from
 * `'pending'` to `'settled'` forces a second capture with the hydrated
 * `draftListing` coordinates/locality without touching
 * `useResidentialLocation.ts`.
 *
 * `useEffect` deps are the hook's actual state slices so the parent's
 * `residentialLocationValue` state updates whenever `location.state`,
 * `geoError`, `pickerOpen`, `saveError`, or `isSaving` changes.
 */
function AgriculturalLocationBridge({ params, onLocation }: AgriculturalLocationBridgeProps) {
  const location = useResidentialLocation(params);
  useEffect(() => {
    onLocation(location);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only state slices should retrigger the lift
  }, [location.state, location.geoError, location.pickerOpen, location.saveError, location.isSaving, onLocation]);
  return null;
}

const FALLBACK_RESIDENTIAL_LOCATION: UseResidentialLocationResult = {
  state: {
    query: '',
    results: [],
    status: 'empty',
    resolved: null,
    localityResolved: false,
    pin: null,
    pinConfirmed: false,
    geoPermission: 'idle',
  },
  findDisabled: true,
  geoError: null,
  pickerOpen: false,
  saveError: null,
  isSaving: false,
  runSearch: async () => {},
  selectResult: () => {},
  requestGeo: () => {},
  allowGeo: () => {},
  dismissGeo: () => {},
  editQuery: () => {},
  clear: () => {},
  openPicker: () => {},
  cancelPicker: () => {},
  adjustPin: () => {},
  confirmPin: () => {},
};

export interface UseAgriculturalListingLocationParams {
  listingId: string | null;
  addressConfirmed: boolean;
  draftListing: ListingResponse | undefined;
  urlSeededRef: MutableRefObject<boolean>;
  didHydrateRef: MutableRefObject<boolean>;
  onPublicLoc: (locality: string) => void;
}

export interface UseAgriculturalListingLocationResult {
  locationBridge: ReactNode;
  residentialLocation: UseResidentialLocationResult;
  locationRemountKey: string;
}

/**
 * #2398 / #2811 — single named owner of location orchestration for
 * AgriculturalListingForm: keeps one `useResidentialLocation` instance alive
 * (via `AgriculturalLocationBridge`) and owns the remount-key sequencing that
 * forces a second capture once a URL-seeded draft's hydration settles.
 * Mirrors `useResidentialListingLocation` (#2387) and
 * `useCommercialLocationOrchestration` (#2388).
 */
export function useAgriculturalListingLocation({
  listingId,
  addressConfirmed,
  draftListing,
  urlSeededRef,
  didHydrateRef,
  onPublicLoc,
}: UseAgriculturalListingLocationParams): UseAgriculturalListingLocationResult {
  const residentialLocationParams: UseResidentialLocationParams = {
    listingId,
    addressConfirmed,
    initialLatitude: draftListing?.latitude ?? null,
    initialLongitude: draftListing?.longitude ?? null,
    initialLocality: draftListing?.locality ?? '',
    onPublicLoc,
  };

  const locationRemountKey = !urlSeededRef.current ? 'fresh' : didHydrateRef.current ? 'settled' : 'pending';
  const [residentialLocationValue, setResidentialLocationValue] = useState<UseResidentialLocationResult | null>(null);

  const locationBridge = createElement(AgriculturalLocationBridge, {
    key: locationRemountKey,
    params: residentialLocationParams,
    onLocation: setResidentialLocationValue,
  });

  return {
    locationBridge,
    residentialLocation: residentialLocationValue ?? FALLBACK_RESIDENTIAL_LOCATION,
    locationRemountKey,
  };
}
