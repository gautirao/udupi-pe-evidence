import type { AdminListingRow } from '@/hooks/useAdminData';

/**
 * Issue #2662 — pure derivation of the ProcessPosts "Recent Listings" panel
 * inputs from the full admin listings array. Moved verbatim from
 * ProcessPosts.tsx's `recentListings = listings.slice(0, 10)` and the
 * `listings.filter((l) => l.is_valid).length` "Valid" stat; no behavior change.
 */
export interface ListingSummary {
  recentListings: AdminListingRow[];
  validListingCount: number;
}

export function summarizeListings(listings: AdminListingRow[]): ListingSummary {
  return {
    recentListings: listings.slice(0, 10),
    validListingCount: listings.filter((l) => l.is_valid).length,
  };
}
