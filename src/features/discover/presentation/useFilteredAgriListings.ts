import { useMemo } from 'react';
import type { AgriMapListingItem, AgriMapListingsResponse } from '@/hooks/useAgriMapListings';
import type { DiscoverUrlState } from '@/hooks/useDiscoverUrlState';
import { rupeesToPaise } from '@/features/discover/presentation/anonPropertyFilters';

export interface UseFilteredAgriListingsParams {
  agriMapListingsData: AgriMapListingsResponse | undefined;
  filters: DiscoverUrlState['filters'];
  isAuthenticated: boolean;
}

/**
 * Issue #1824 Slice S11b (C4) — the client-side filtered agri listings
 * derivation, lifted verbatim out of MapDiscovery.tsx (original L463-515). See
 * docs/audit/evidence/issue-1824-map-discovery-decomposition/slice-s11b-design.md.
 *
 * Behaviour-preserving lift-and-shift — the body + the 10-entry dep array are
 * byte-for-byte from the original page.
 */
export function useFilteredAgriListings({
  agriMapListingsData,
  filters,
  isAuthenticated,
}: UseFilteredAgriListingsParams): AgriMapListingItem[] | null {
  // Issue #1457 — client-side filtered agri listings (acreage always, price only when authed).
  // Single source of truth passed to both PropertyMap (markers) and DiscoverRightPanel (list).
  const filteredAgriListings = useMemo(() => {
    if (!agriMapListingsData?.listings) return null;
    const acresMin = filters.agriAcresMin;
    const acresMax = filters.agriAcresMax;
    const priceMinPaise = isAuthenticated && filters.agriPriceMin != null
      ? rupeesToPaise(filters.agriPriceMin)
      : null;
    const priceMaxPaise = isAuthenticated && filters.agriPriceMax != null
      ? rupeesToPaise(filters.agriPriceMax)
      : null;
    return agriMapListingsData.listings.filter((l) => {
      // Acreage filter: null computedAreaAcres excluded when filter is active
      if (acresMin != null || acresMax != null) {
        if (l.computedAreaAcres == null) return false;
        if (acresMin != null && l.computedAreaAcres < acresMin) return false;
        if (acresMax != null && l.computedAreaAcres > acresMax) return false;
      }
      // Price filter: only for authenticated users
      if (priceMinPaise != null || priceMaxPaise != null) {
        if (l.pricePaise == null) return false;
        if (priceMinPaise != null && l.pricePaise < priceMinPaise) return false;
        if (priceMaxPaise != null && l.pricePaise > priceMaxPaise) return false;
      }
      // Issue #1458 — categorical field filters (exact match; null = no filter = include all)
      if (filters.agriLandCategory != null) {
        if (l.landCategory !== filters.agriLandCategory) return false;
      }
      // Boolean tri-state: null = no filter; true/false = exact match.
      // null listing field is NOT the same as false — we only exclude on exact inequality.
      if (filters.agriFarmhouseAvailable != null) {
        if (l.farmhouseAvailable !== filters.agriFarmhouseAvailable) return false;
      }
      if (filters.agriFencingDone != null) {
        if (l.fencingDone !== filters.agriFencingDone) return false;
      }
      // Water source: exact string match. 'NOT_AVAILABLE' matches only 'NOT_AVAILABLE' rows (not null).
      if (filters.agriWaterSource != null) {
        if (l.waterSource !== filters.agriWaterSource) return false;
      }
      return true;
    });
  }, [
    agriMapListingsData,
    filters.agriAcresMin,
    filters.agriAcresMax,
    isAuthenticated,
    filters.agriPriceMin,
    filters.agriPriceMax,
    filters.agriLandCategory,
    filters.agriFarmhouseAvailable,
    filters.agriFencingDone,
    filters.agriWaterSource,
  ]);

  return filteredAgriListings;
}
