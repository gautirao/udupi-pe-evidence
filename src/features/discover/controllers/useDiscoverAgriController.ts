import { useMemo } from 'react';
import { useRegionalAreaGroups } from '@/hooks/useRegionalAreaGroups';
import { useAgriMapListings } from '@/hooks/useAgriMapListings';
import { useFilteredAgriListings } from '@/features/discover/presentation/useFilteredAgriListings';
import { DEFAULT_CITY } from '@/lib/localityUtils';
import type { DiscoverNavContextValue } from '@/features/discover/context/types';

export interface UseDiscoverAgriControllerParams {
  nav: DiscoverNavContextValue;
  intentListingPurpose: string;
  isAuthenticated: boolean;
}

/**
 * Issue #2142 Commit 3 (C6, per approved plan) — moved verbatim out of
 * MapDiscovery.tsx. Wraps useRegionalAreaGroups (corridorGroups) +
 * selectedCorridorData/selectedTierData/selectedGroupAreaKeys derivation +
 * useAgriMapListings + agriGroupLabel + selectedGroupListingItem +
 * useFilteredAgriListings.
 *
 * Documented deviation from the architect's original sketch (approved by
 * team-lead as an in-scope implementation refinement): the original plan put
 * `useRegionalAreaGroups`/corridorGroups in useDiscoverGeographyController
 * (C1). Moved here instead — cohesion-by-consumer: corridorGroups is only
 * ever consumed by this agri-specific derivation chain
 * (selectedCorridorData/selectedTierData/useAgriMapListings/agriGroupLabel),
 * never by anything else Geography owns.
 *
 * Called EARLY (before useDiscoverPageState/`city` resolves) — same
 * position as its pre-refactor call sites. Self-contained given `nav`/
 * `intentListingPurpose`/`isAuthenticated`.
 */
export function useDiscoverAgriController({
  nav,
  intentListingPurpose,
  isAuthenticated,
}: UseDiscoverAgriControllerParams) {
  // Issue #1429 (B2) — precomputed corridor groups for the agri-first landing panel.
  // Issue #1745 Batch B — same DEFAULT_CITY fallback as useAreaGroups, for
  // agri-first city-landing consistency.
  const {
    groups: corridorGroups,
    isLoading: isLoadingRegionalAreaGroups,
    isError: isRegionalAreaGroupsError,
    refetch: refetchRegionalAreaGroups,
  } = useRegionalAreaGroups(nav.city || DEFAULT_CITY);

  // Issue #1429 — derive areaKeys from the selected corridor + distance tier to fetch
  // agri map listings. Hook is disabled when selectedRegion + selectedMaxKm are not both set.
  const selectedRegion = nav.selectedRegion ?? null;
  const selectedMaxKm = nav.selectedMaxKm ?? null;
  const selectedCorridorData = selectedRegion
    ? corridorGroups.find((g) => g.directionCode === selectedRegion) ?? null
    : null;
  const selectedTierData = selectedCorridorData && selectedMaxKm != null
    ? selectedCorridorData.availableMaxDistances.find((t) => t.maxKm === selectedMaxKm) ?? null
    : null;
  const selectedGroupAreaKeys = selectedTierData?.areaKeys ?? [];

  const {
    data: agriMapListingsData,
    isLoading: isLoadingAgriGroupListings,
    isError: isAgriGroupListingsError,
    refetch: refetchAgriGroupListings,
  } = useAgriMapListings(nav.city, selectedGroupAreaKeys, intentListingPurpose, isAuthenticated);

  // Issue #1429 — corridor + distance tier label for the agri-group-selected panel header chip.
  const agriGroupLabel = selectedCorridorData
    ? selectedTierData
      ? `${selectedCorridorData.groupName} · ${selectedTierData.distanceLabel}`
      : selectedCorridorData.groupName
    : null;

  // Issue #1430 — derive the AgriMapListingItem for the selected listing peek.
  const selectedGroupListingItem = useMemo(
    () =>
      nav.selectedListing && agriMapListingsData?.listings
        ? (agriMapListingsData.listings.find((l) => l.id === nav.selectedListing) ?? null)
        : null,
    [nav.selectedListing, agriMapListingsData?.listings],
  );

  // Issue #1824 Slice S11b (C4) — client-side filtered agri listings.
  const filteredAgriListings = useFilteredAgriListings({
    agriMapListingsData,
    filters: nav.filters,
    isAuthenticated,
  });

  return {
    corridorGroups,
    isLoadingRegionalAreaGroups,
    isRegionalAreaGroupsError,
    refetchRegionalAreaGroups,
    selectedRegion,
    selectedMaxKm,
    selectedCorridorData,
    selectedTierData,
    selectedGroupAreaKeys,
    agriMapListingsData,
    isLoadingAgriGroupListings,
    isAgriGroupListingsError,
    refetchAgriGroupListings,
    agriGroupLabel,
    selectedGroupListingItem,
    filteredAgriListings,
  };
}
