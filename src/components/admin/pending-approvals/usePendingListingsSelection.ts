import { useEffect, useMemo, useState } from 'react';
import type { ListingResponse } from '@/hooks/useBrokerListings';
import { isBulkApprovalEligible } from './pendingApprovalsHelpers';

export interface BulkApproveOutcome {
  id: string;
  title: string;
  status: 'fulfilled' | 'rejected';
  message?: string;
}

/**
 * Extracted from PendingListings.tsx (issue #2380) — row-selection state for
 * bulk actions, plus the bulk-approve partial-failure list. Behavior-
 * preserving: same pruning rule (drop any selected id no longer present once
 * the queue refetches) and the same derived selected/eligible lists.
 *
 * `setSelectedIds`/`setBulkFailures` are exposed directly so the mutations
 * hook (bulk-approve success/failure handling) can update selection without
 * this hook needing to know about mutations.
 */
export function usePendingListingsSelection(listings: ListingResponse[]) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkFailures, setBulkFailures] = useState<BulkApproveOutcome[]>([]);

  // Drop any selected id that no longer exists in the queue (approved,
  // rejected, returned, or actioned by another admin) whenever the queue
  // refetches, so selection never points at a listing that has left it.
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const validIds = new Set(listings.map((l) => l.id));
      const next = new Set<string>();
      let changed = false;
      prev.forEach((id) => {
        if (validIds.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [listings]);

  const selectedListings = useMemo(
    () => listings.filter((listing) => selectedIds.has(listing.id)),
    [listings, selectedIds],
  );
  const eligibleSelectedListings = useMemo(
    () => selectedListings.filter(isBulkApprovalEligible),
    [selectedListings],
  );

  const toggleRowSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePageSelection = (ids: string[], select: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => {
        if (select) next.add(id);
        else next.delete(id);
      });
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());
  const dismissBulkFailures = () => setBulkFailures([]);

  return {
    selectedIds,
    setSelectedIds,
    bulkFailures,
    setBulkFailures,
    dismissBulkFailures,
    selectedListings,
    eligibleSelectedListings,
    toggleRowSelection,
    togglePageSelection,
    clearSelection,
  };
}
