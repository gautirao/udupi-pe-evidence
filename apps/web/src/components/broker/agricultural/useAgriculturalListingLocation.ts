import type { ListingResponse } from '@/hooks/useBrokerListings';
import { useResidentialLocation, type UseResidentialLocationResult } from '@/components/broker/residential/useResidentialLocation';

export interface UseAgriculturalListingLocationParams {
  listingId: string | null;
  addressConfirmed: boolean;
  draftListing: ListingResponse | undefined;
  onPublicLoc: (locality: string) => void;
}

/**
 * #2398 — single named owner of location orchestration for
 * AgriculturalListingForm: the exactly-one useResidentialLocation instance
 * shared by Section 1's <AddressSearch> and Section 5's <MapPin>, and the
 * listing-id/addressConfirmed wiring into it. `onPublicLoc` is the ONLY way
 * `locality` is ever set from the location flow — it only ever receives the
 * coarse, buyer-facing publicLoc, never the private formatted/geocoded
 * string (same invariant as Residential/Commercial).
 *
 * Deliberately thinner than useResidentialListingLocation (#2387): that hook
 * additionally owns a remount-key bridge to re-capture a URL-seeded draft's
 * settled location after hydration. AgriculturalListingForm has no
 * URL-seeded draft recovery (see useAgriculturalListingDraft doc), so there
 * is no second capture to force and no bridge/remount-key machinery to own —
 * a direct call is the correct (and complete) single-owner boundary here,
 * not a shortcut.
 */
export function useAgriculturalListingLocation({ listingId, addressConfirmed, draftListing, onPublicLoc }: UseAgriculturalListingLocationParams): UseResidentialLocationResult {
  return useResidentialLocation({
    listingId,
    addressConfirmed,
    initialLatitude: draftListing?.latitude ?? null,
    initialLongitude: draftListing?.longitude ?? null,
    initialLocality: draftListing?.locality ?? '',
    onPublicLoc,
  });
}
