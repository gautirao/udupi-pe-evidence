import { useEffect, useState, type MutableRefObject } from 'react';
import type { ListingResponse } from '@/hooks/useBrokerListings';
import {
  useResidentialLocation,
  type UseResidentialLocationParams,
  type UseResidentialLocationResult,
} from './useResidentialLocation';

interface ResidentialLocationBridgeProps {
  params: UseResidentialLocationParams;
  onLocation: (location: UseResidentialLocationResult) => void;
}

/**
 * Issue #2039 (fix cycle 2) — owns the SINGLE useResidentialLocation
 * instance, defined at module scope (not nested inside the composition root)
 * so its component identity is stable across parent renders and only the
 * caller's `key` prop controls remounting.
 *
 * useResidentialLocation's own useMountEffect (useResidentialLocation.ts
 * L84-139, out of bounds for this fix) captures addressConfirmed/
 * initialLatitude/initialLongitude/initialLocality exactly once, at ITS
 * first post-mount effect flush — for a URL-seeded draft that flush always
 * loses the race against the draft's network fetch, permanently discarding
 * the real location. Remounting THIS bridge (via a key that flips exactly
 * once, see locationRemountKey below) forces a second, correctly-timed
 * capture without restructuring the composition root.
 *
 * Renders nothing. The hook's return value is handed back to the caller via
 * onLocation so the composition root's Section 2 <AddressSearch> / Section 6
 * <MapPin> JSX stays exactly where it already sits — only lifting the VALUE
 * (rather than also relocating those two consumers into this component)
 * keeps the #1718/#1626 DOM arrangement completely unchanged.
 */
function ResidentialLocationBridge({ params, onLocation }: ResidentialLocationBridgeProps) {
  const location = useResidentialLocation(params);
  // Deps are the hook's actual state slices — all referentially stable
  // across renders where nothing real changed — rather than `location`
  // itself, which is a brand-new object literal on every render (it always
  // has been; AddressSearch/MapPin already never relied on its identity).
  // Keying off the whole object here would re-fire this effect (and the
  // parent's setState) every render, looping.
  useEffect(() => {
    onLocation(location);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see note above; only these state slices should retrigger the lift
  }, [location.state, location.geoError, location.pickerOpen, location.saveError, location.isSaving, onLocation]);
  return null;
}

export interface UseResidentialListingLocationParams {
  listingId: string | null;
  addressConfirmed: boolean;
  draftListing: ListingResponse | undefined;
  /** Read directly (not derived state) to exactly mirror the original inline remount-key timing. */
  urlSeededRef: MutableRefObject<boolean>;
  didHydrateRef: MutableRefObject<boolean>;
  onPublicLoc: (locality: string) => void;
}

/**
 * #2387 — single owner of location orchestration for ResidentialListingForm:
 * keeps exactly one useResidentialLocation instance alive (via
 * ResidentialLocationBridge), and owns the remount-key sequencing that
 * forces a second, correctly-timed capture once a URL-seeded draft's
 * hydration settles. Mirrors useCommercialLocationOrchestration (#2388),
 * which wraps this same shared useResidentialLocation hook for the
 * commercial flow.
 */
export function useResidentialListingLocation({
  listingId,
  addressConfirmed,
  draftListing,
  urlSeededRef,
  didHydrateRef,
  onPublicLoc,
}: UseResidentialListingLocationParams) {
  // Issue #1722 correction #4 — SINGLE hook instance shared by Section 2's
  // <AddressSearch> and Section 6's <MapPin> (contract §A). onPublicLoc is
  // the ONLY way `locality` is ever set from the location flow — it only
  // ever receives the coarse, buyer-facing publicLoc, never the private
  // formatted/geocoded string.
  const residentialLocationParams: UseResidentialLocationParams = {
    listingId,
    addressConfirmed,
    initialLatitude: draftListing?.latitude ?? null,
    initialLongitude: draftListing?.longitude ?? null,
    initialLocality: draftListing?.locality ?? '',
    onPublicLoc,
  };

  // Stays 'fresh' (never remounts) for the entire lifetime of a NON-URL-
  // seeded instance — AC3 requires this session's own create to never be
  // re-seeded. For a URL-seeded instance it flips from 'pending' to
  // 'settled' exactly once, the render after the hydrate-success effect OR
  // the AC4 error-fallback effect (both in useResidentialListingDraft) sets
  // didHydrateRef.current — by which point draftListing?.latitude/
  // .longitude/.locality and addressConfirmed above already hold the
  // settled values.
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
