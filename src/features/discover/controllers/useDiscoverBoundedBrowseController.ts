import { useMemo } from 'react';
import { useDiscoverSearchState } from '@/features/discover/state/useDiscoverSearchState';
import { useDiscoverFilteredMarkers } from '@/hooks/useDiscoverFilteredMarkers';
import { useDiscoverCityListings } from '@/hooks/useDiscoverCityListings';
import { buildCityListingsQueryParams } from '@/features/discover/adapters/cityListingsQueryParams';
import { resolveNodeListingsAnonMarkers } from '@/features/discover/adapters/anonMarkerAdapter';
import { filteredMarkerToPropertyListing } from '@/lib/discoverMappers';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';

export interface UseDiscoverBoundedBrowseControllerParams {
  city: string;
  /** `!!nav.nodeListings` is derived here; this is the raw URL value. */
  nodeListings: boolean | null | undefined;
  /** URL keyword (`nav.q`) and its writer — the search box's URL contract. */
  urlQ: string;
  setUrlSearch: (q: string) => void;
  areasNavigationJourney: UseAreasNavigationJourneyResult;
  urlDiscoverFilters: PropertyFilters;
  intentListingPurpose: string;
  isAuthenticated: boolean;
}

/**
 * Issue #2142 (correction pass) — bounded Browse (`node=` + `nodeListings=1`)
 * node-scoped markers, moved verbatim off MapDiscovery.tsx.
 *
 * WHY THE KEYWORD-SEARCH STATE LIVES HERE and not in a controller of its own:
 * `useDiscoverSearchState` was already hoisted to precisely this position on
 * the page for precisely this reason — see the page comment it carries
 * ("Declared here (moved up from its original post-node-listings-marker-fetch
 * position) so debouncedSearch is available to the bounded-Browse marker-fetch
 * calls below", issue #2089 fix-cycle PR #2141 finding 1). `debouncedSearch`
 * is the scoping input BOTH bounded-Browse queries take, and Map and List must
 * share one debounced term or the two surfaces silently disagree. Wrapping it
 * in a separate one-line controller would be a pass-through with no owned
 * decision; keeping it here keeps the producer next to the constraint that
 * dictates its position. The term is re-exported for the badge/panel, which
 * consume it read-only.
 *
 * KNOWN, INTENTIONAL split-brain (do NOT unify): `debouncedSearch` drives the
 * badge + map markers; `nav.q` drives ActiveContextChips. See
 * useDiscoverSearchState's own header comment.
 */
export function useDiscoverBoundedBrowseController({
  city,
  nodeListings,
  urlQ,
  setUrlSearch,
  areasNavigationJourney,
  urlDiscoverFilters,
  intentListingPurpose,
  isAuthenticated,
}: UseDiscoverBoundedBrowseControllerParams) {
  // Issue #1824 Slice S4 — search-keyword state (searchQuery/debouncedSearch,
  // reverse URL-sync, 250ms debounce, handleSearchChange).
  const { searchQuery, debouncedSearch, handleSearchChange } =
    useDiscoverSearchState({ urlQ, setUrlSearch });

  const isNodeListingsState = !!nodeListings;
  const nodeListingsAreaKeys: string[] = useMemo(() => {
    if (!isNodeListingsState) return [];
    const node = areasNavigationJourney.node;
    if (!node) return [];
    if (node.descendantAreaKeys && node.descendantAreaKeys.length > 0) return node.descendantAreaKeys;
    return node.areaKey ? [node.areaKey] : [];
  }, [isNodeListingsState, areasNavigationJourney.node]);

  // Authenticated path: /api/discover/markers (full predicate, list+map consistent).
  // Issue #2087/#2089 code-review fix — scope via the canonical `nodeKey` param
  // (server-side hierarchy resolution), NOT client-derived `areaKeys`, so this
  // query shares the exact same scope-derivation mechanism as
  // NodeListingsSurface.tsx's authenticated List query (`useDiscoverListings`
  // called with `nodeKey: node.nodeKey`, no areaKeys). Two mechanisms deriving
  // "the same" scope independently risked Map silently under/over-scoping if
  // `descendantAreaKeys` ever drifted from the backend's own hierarchy
  // resolution. `enabled` additionally requires the node to have resolved
  // (mirrors the previous empty-areaKeys guard's loading-race handling) so an
  // unresolved node never fires an unscoped, city-wide-leaking request.
  const { data: nodeListingsMarkersData } = useDiscoverFilteredMarkers(
    city,
    urlDiscoverFilters,
    isNodeListingsState && isAuthenticated && !!areasNavigationJourney.node?.nodeKey,
    null,        // bbox — no viewport clipping for bounded Browse
    // Issue #2089 fix-cycle (PR #2141 finding 1) — thread the same debounced search
    // term the List surface (NodeListingsSurface.tsx) sends to its own bounded-Browse
    // fetch, so a typed search narrows the Map markers exactly like it narrows the List.
    debouncedSearch?.trim() || undefined,
    intentListingPurpose,
    undefined,   // excludePropertyType — not applicable
    undefined,   // areaKeys — intentionally omitted; nodeKey below is the canonical scope
    areasNavigationJourney.node?.nodeKey,
  );

  // Anonymous path: /api/discover/cities/{city}/listings (public, multi-areaKeys
  // teaser). This endpoint has no nodeKey-based scoping support, so it
  // structurally still needs client-derived areaKeys — the same divergence
  // NodeListingsSurface.tsx's own anon fallback (`nodeAreaKeys`) accepts for
  // its equivalent public-teaser query.
  const { data: nodeListingsAnonData } = useDiscoverCityListings(
    buildCityListingsQueryParams(
      city,
      isNodeListingsState && !isAuthenticated ? nodeListingsAreaKeys : [],
      urlDiscoverFilters,
      intentListingPurpose,
      // Issue #2089 fix-cycle (PR #2141 finding 1) — see the auth call above for rationale.
      debouncedSearch?.trim() || undefined,
    ),
  );

  // Unified node-listings marker surface (auth or anon). [] while resolving or
  // when the node genuinely has no listings — same empty-areaKeys-guard shape
  // as groupResultsMarkers (never an unscoped city-wide flash).
  //
  // Issue #2142 Commit 2 — the anon branch (issue #2089's lat/lon ->
  // latitude/longitude fallback fix) lives in
  // adapters/anonMarkerAdapter.ts's resolveNodeListingsAnonMarkers. See that
  // file's header comment for why it was NOT converged with
  // useDiscoverGroupResults.ts's sibling anon-marker derivation (R7
  // differential test proved they diverge).
  const nodeListingsMarkers = useMemo(() => {
    if (!isNodeListingsState) return [];
    if (isAuthenticated) {
      if (!nodeListingsMarkersData?.markers) return [];
      const now = new Date().toISOString();
      return nodeListingsMarkersData.markers.map((m) => filteredMarkerToPropertyListing(m, now));
    }
    return resolveNodeListingsAnonMarkers(nodeListingsAnonData, new Date().toISOString());
  }, [isNodeListingsState, isAuthenticated, nodeListingsMarkersData, nodeListingsAnonData]);

  return {
    searchQuery,
    debouncedSearch,
    handleSearchChange,
    isNodeListingsState,
    nodeListingsMarkers,
  };
}
