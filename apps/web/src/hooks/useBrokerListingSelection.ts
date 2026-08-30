import { useMemo, useState } from 'react';
import type { ListingResponse } from '@/hooks/useBrokerListings';

/** Only DRAFT and REJECTED listings can be bulk-deleted. */
export function isDeletableListingStatus(status: string): boolean {
  return status === 'DRAFT' || status === 'REJECTED';
}

/**
 * Owns bulk-selection state and deletable-listing eligibility for the broker
 * "My Listings" page. Exposes data only — bulk-delete orchestration (mutation
 * + toast) stays with the page that owns the delete action.
 */
export function useBrokerListingSelection(listings: ListingResponse[]) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const deletableListings = useMemo(
    () => listings.filter((l) => isDeletableListingStatus(l.status)),
    [listings],
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(deletableListings.map((l) => l.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  return {
    selectedIds,
    deletableListings,
    toggleSelect,
    selectAll,
    deselectAll,
  };
}
