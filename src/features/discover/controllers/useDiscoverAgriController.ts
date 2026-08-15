import { useMemo } from 'react';
import { useRegionalAreaGroups, useAgriDestinations } from '@/hooks/useRegionalAreaGroups';
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
  // Issue #2151 PR C carry-over (C-F3) — forward intentListingPurpose so the Level-1
  // corridor-tier counts reflect the shopper's active Buy/Rent filter, same as the
  // Level-2 useAgriDestinations call below. Optional/additive param: omitting it (the
  // pre-#2151 behaviour) is unchanged, so this is not a query-key/response-shape change.
  const {
    groups: corridorGroups,
    isLoading: isLoadingRegionalAreaGroups,
    isError: isRegionalAreaGroupsError,
    isNotGeneratedForRevision: isRegionalAreaGroupsNotGeneratedForRevision,
    refetch: refetchRegionalAreaGroups,
  } = useRegionalAreaGroups(nav.city || DEFAULT_CITY, intentListingPurpose);

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

  // Issue #2151 PR C (C-F2) — the backend agri-map-listings endpoint no longer accepts the legacy
  // repeated `areaKeys` param; it now scopes to exactly ONE canonical `areaKey` (the corridor-wide
  // "all towns" fetch this used to power is replaced below by useAgriDestinations' server-computed
  // buckets). This hook is now only ever used for the Level-3 locality drill-down — the single
  // destination the user has selected via `nav.selectedLocality`, which C-F1
  // (state/url/agricultural.ts) makes the canonical areas.area_key, not free text.
  const selectedDestinationAreaKey = nav.selectedLocality ?? '';

  const {
    data: agriMapListingsData,
    isLoading: isLoadingAgriGroupListings,
    isError: isAgriGroupListingsError,
    refetch: refetchAgriGroupListings,
  } = useAgriMapListings(nav.city, selectedDestinationAreaKey, intentListingPurpose, isAuthenticated);

  // Issue #2151 PR C (C-F4/C-F7) — server-computed destination (town/locality) buckets for the
  // agri-group-selected (Level-2) panel. Replaces the client-side `item.locality ?? item.areaKey`
  // grouping that used to be computed from raw parcel listings in AgriGroupSelectedPanel.tsx.
  // useDiscoverAgriController stays the single Agri owner of this fetch (C-F7); however, the
  // panel-composition layer that wires controller output into DiscoverRightPanel props
  // (assembleDiscoverSurfaceProps.ts / buildPanelSurfaceModel.ts) is outside this PR's allowed
  // edit globs, so AgriGroupSelectedPanel additionally calls useAgriDestinations directly with the
  // same (city, direction, maxKm, listingPurpose) inputs — see that file's own comment. Both call
  // sites resolve to the identical TanStack Query cache key, so there is no divergence risk; this
  // controller-level wiring documents the intended ownership and gives it test coverage even
  // though today's composition layer doesn't yet forward it as a DiscoverRightPanel prop.
  const {
    destinations: agriDestinations,
    isLoading: isLoadingAgriDestinations,
    isError: isAgriDestinationsError,
    isNotYetPromoted: isAgriDestinationsNotYetPromoted,
    isNotGeneratedForRevision: isAgriDestinationsNotGeneratedForRevision,
    refetch: refetchAgriDestinations,
  } = useAgriDestinations(nav.city || DEFAULT_CITY, selectedRegion, selectedMaxKm, intentListingPurpose);

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
    isRegionalAreaGroupsNotGeneratedForRevision,
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
    agriDestinations,
    isLoadingAgriDestinations,
    isAgriDestinationsError,
    isAgriDestinationsNotYetPromoted,
    isAgriDestinationsNotGeneratedForRevision,
    refetchAgriDestinations,
    agriGroupLabel,
    selectedGroupListingItem,
    filteredAgriListings,
  };
}
