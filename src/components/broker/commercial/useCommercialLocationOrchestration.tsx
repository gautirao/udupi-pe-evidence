import { useEffect, useState, type MutableRefObject } from 'react';
import type { ListingResponse } from '@/hooks/useBrokerListings';
import {
  useResidentialLocation,
  type UseResidentialLocationParams,
  type UseResidentialLocationResult,
} from '@/components/broker/residential/useResidentialLocation';

interface ResidentialLocationBridgeProps {
  params: UseResidentialLocationParams;
  onLocation: (location: UseResidentialLocationResult) => void;
}

/**
 * #2348 — owns the SINGLE useResidentialLocation instance, defined at module
 * scope so its component identity is stable across parent renders and only
 * the caller's `key` prop controls remounting. Mirrors
 * ResidentialListingForm.tsx's ResidentialLocationBridge (issue #2039, fix
 * cycle 2): useResidentialLocation's own useMountEffect captures
 * addressConfirmed/initialLatitude/initialLongitude/initialLocality exactly
 * once, at its first post-mount effect flush — for a URL-seeded draft that
 * flush always loses the race against the draft's network fetch. Remounting
 * this bridge (via a key that flips exactly once, see locationRemountKey
 * below) forces a second, correctly-timed capture.
 */
function ResidentialLocationBridge({ params, onLocation }: ResidentialLocationBridgeProps) {
  const location = useResidentialLocation(params);
  useEffect(() => {
    onLocation(location);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only these state slices should retrigger the lift
  }, [location.state, location.geoError, location.pickerOpen, location.saveError, location.isSaving, onLocation]);
  return null;
}

export interface UseCommercialLocationOrchestrationParams {
  listingId: string | null;
  addressConfirmed: boolean;
  draftListing: ListingResponse | undefined;
  /** #2388 — read directly (not derived state) to exactly mirror the original inline remount-key timing. */
  urlSeededRef: MutableRefObject<boolean>;
  didHydrateRef: MutableRefObject<boolean>;
  onPublicLoc: (locality: string) => void;
}

/**
 * #2388 — single owner of location orchestration: keeps exactly one
 * useResidentialLocation instance alive (via ResidentialLocationBridge),
 * and owns the remount-key sequencing that forces a second, correctly-timed
 * capture once a URL-seeded draft's hydration settles.
 */
export function useCommercialLocationOrchestration({
  listingId,
  addressConfirmed,
  draftListing,
  urlSeededRef,
  didHydrateRef,
  onPublicLoc,
}: UseCommercialLocationOrchestrationParams) {
  const residentialLocationParams: UseResidentialLocationParams = {
    listingId,
    addressConfirmed,
    initialLatitude: draftListing?.latitude ?? null,
    initialLongitude: draftListing?.longitude ?? null,
    initialLocality: draftListing?.locality ?? '',
    onPublicLoc,
  };

  // #2348 — stays 'fresh' (never remounts) for a non-URL-seeded instance.
  // For a URL-seeded instance it flips from 'pending' to 'settled' exactly
  // once, the render after the hydrate-success/error-fallback effect settles
  // didHydrateRef. See ResidentialLocationBridge doc above.
  const locationRemountKey = !urlSeededRef.current ? 'fresh' : didHydrateRef.current ? 'settled' : 'pending';
  const [residentialLocationValue, setResidentialLocationValue] = useState<UseResidentialLocationResult | null>(null);

  const locationBridge = (
    <ResidentialLocationBridge
      key={locationRemountKey}
      params={residentialLocationParams}
      onLocation={setResidentialLocationValue}
    />
  );

  return { locationBridge, residentialLocationValue, locationRemountKey };
}
