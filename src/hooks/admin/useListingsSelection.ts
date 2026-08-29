import { useEffect, useState } from 'react';
import type { AdminListingRow } from '@/hooks/useAdminData';

/**
 * Owns the admin Listings inventory page's row-selection state (individual
 * toggle, page-wide select-all, and reset when the active tab changes),
 * independent of the URL/query/filter/pagination concerns in
 * useAdminListingsInventory. See #2377.
 */
export function useListingsSelection(pageItems: AdminListingRow[], tab: string) {
  const [selectedListings, setSelectedListings] = useState<Map<string, AdminListingRow>>(new Map());

  useEffect(() => {
    setSelectedListings(new Map());
  }, [tab]);

  const allOnPageSelected = pageItems.length > 0 && pageItems.every((l) => selectedListings.has(l.id));

  function toggleSelectAll() {
    setSelectedListings((prev) => {
      const next = new Map(prev);
      if (allOnPageSelected) {
        pageItems.forEach((l) => next.delete(l.id));
      } else {
        pageItems.forEach((l) => next.set(l.id, l));
      }
      return next;
    });
  }

  function toggleSelect(listing: AdminListingRow) {
    setSelectedListings((prev) => {
      const next = new Map(prev);
      if (next.has(listing.id)) next.delete(listing.id);
      else next.set(listing.id, listing);
      return next;
    });
  }

  return {
    selectedListings,
    setSelectedListings,
    allOnPageSelected,
    toggleSelect,
    toggleSelectAll,
  };
}
