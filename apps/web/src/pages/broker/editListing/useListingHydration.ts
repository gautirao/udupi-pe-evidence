import { useEffect, useRef } from 'react';
import type { ListingResponse } from '@/hooks/useBrokerListings';

// Issue #1838 PR B — pure extraction of the pre-populate-on-load effect from
// EditListingForm. No behaviour change: same guard logic, same ref, same
// dependency shape (verbatim from the removed effect).
//
// Tracks the id of the listing this form has already hydrated from. Guards
// the pre-populate effect below (#2294): `listing` is a fresh object on
// every refetch (e.g. useUpdateListing's onSuccess invalidateQueries), so
// object identity alone is not a safe re-hydration trigger — a same-id
// background refetch would otherwise wipe the broker's unsaved edits.

export interface UseListingHydrationHydrators {
  base: (listing: ListingResponse) => void;
  shared: (listing: ListingResponse) => void;
  commercial: (listing: ListingResponse) => void;
  rent: (listing: ListingResponse) => void;
  agri: (listing: ListingResponse) => void;
  residential: (listing: ListingResponse) => void;
}

export function useListingHydration(
  listing: ListingResponse | null | undefined,
  hydrators: UseListingHydrationHydrators,
): void {
  const hydratedListingIdRef = useRef<string | null>(null);

  // Pre-populate form once listing loads
  useEffect(() => {
    if (!listing) return;
    if (listing.id === hydratedListingIdRef.current) return;
    hydratedListingIdRef.current = listing.id;
    hydrators.base(listing);
    hydrators.shared(listing);
    hydrators.commercial(listing);
    hydrators.rent(listing);
    hydrators.agri(listing);
    // M38-13A (#1626) — residential typed-listing field prefill. All new columns are
    // nullable (legacy pre-V103 rows and non-residential types read null); nulls stay
    // '' / [] (neutral), never fabricated as a default value.
    hydrators.residential(listing);
  }, [
    listing,
    hydrators.base,
    hydrators.shared,
    hydrators.commercial,
    hydrators.rent,
    hydrators.agri,
    hydrators.residential,
  ]);
}
