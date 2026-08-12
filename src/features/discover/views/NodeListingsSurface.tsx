import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useDiscoverNav, useDiscoverActions } from '@/features/discover/context/useDiscoverContext';
import { useDiscoverSearchState } from '@/features/discover/state/useDiscoverSearchState';
import { useDiscoverListings, type DiscoverListingItem } from '@/hooks/useDiscoverListings';
import { useDiscoverCityListings } from '@/hooks/useDiscoverCityListings';
import { applyAnonPropertyFilters } from '@/features/discover/presentation/anonPropertyFilters';
import { PropertyFilters } from '@/hooks/usePropertyListings';
import { NavigationNodeResponse, ROOT_NODE_KEY } from '@/features/discover/navigation/types';
import { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import { type SelectedListingPreview } from '@/features/discover/navigation/selectedListingPreview';
import { toSelectedListingPreview } from '@/features/discover/navigation/selectedListingPreview';
import { AreaSelectedPanel } from '@/components/discover/panels/AreaSelectedPanel';
import { CITY_CONFIG } from '@/lib/localityUtils';
import { discoverListingToCityListing } from '@/lib/discoverMappers';

export interface NodeListingsSurfaceProps {
  node: NavigationNodeResponse;
  buildNodeHref: (nodeKey: string) => string | null;
  historyAdjacencyLog: UseAreasNavigationJourneyResult['historyAdjacencyLog'];
  committedFilters?: PropertyFilters;
  onCommittedFiltersChange?: (next: PropertyFilters) => void;
  onAddSchool?: () => void;
  selectNode: (nodeKey: string) => void;
  onSelectedListingPreviewChange?: (preview: SelectedListingPreview | null) => void;
  onClearNodeListings?: () => void;
}

export function NodeListingsSurface({
  node,
  buildNodeHref,
  historyAdjacencyLog,
  committedFilters,
  onCommittedFiltersChange,
  onAddSchool,
  selectNode,
  onSelectedListingPreviewChange,
  onClearNodeListings,
}: NodeListingsSurfaceProps) {
  const { user, isLoading: authLoading } = useAuth();
  const isAuthenticated = !authLoading && user !== null;
  const nav = useDiscoverNav();
  const actions = useDiscoverActions();
  const intentListingPurpose = nav.intent === 'rent' ? 'rent' : 'sale';
  const { searchQuery, debouncedSearch, handleSearchChange } = useDiscoverSearchState({
    urlQ: nav.q,
    setUrlSearch: actions.setSearchQuery,
  });
  
  const [page, setPage] = useState(0);

  const effectiveFilters: PropertyFilters = useMemo(
    () =>
      committedFilters
        ? {
            propertyTypes: committedFilters.propertyTypes,
            bedrooms: committedFilters.bedrooms,
            priceMin: committedFilters.priceMin,
            priceMax: committedFilters.priceMax,
          }
        : {
            propertyTypes: nav.filters.propertyTypes as PropertyFilters['propertyTypes'],
            bedrooms: nav.filters.bedrooms,
            priceMin: nav.filters.priceMin,
            priceMax: nav.filters.priceMax,
          },
    [
      committedFilters,
      nav.filters.propertyTypes,
      nav.filters.bedrooms,
      nav.filters.priceMin,
      nav.filters.priceMax,
    ],
  );

  // Issue #2087: Reset to page 0 whenever the result set is narrowed/changed so
  // we never request an out-of-range page after a filter/intent/search update.
  const resetKey = [
    intentListingPurpose,
    effectiveFilters.propertyTypes?.join(',') ?? '',
    effectiveFilters.bedrooms?.join(',') ?? '',
    effectiveFilters.priceMin ?? '',
    effectiveFilters.priceMax ?? '',
    debouncedSearch ?? '',
  ].join('|');
  useEffect(() => {
    setPage(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // Issue #2089 — /api/discover/listings (the query below) is an authenticated-only
  // backend endpoint (see JwtConfig.java's discover permitAll exclusion list, same
  // list that also covers /api/discover/markers). It always 401s for an anon
  // session, so this must only fire when authenticated — mirroring the
  // isAuthenticated gate useDiscoverGroupResults.ts already applies to its authed
  // query. Anon users are served by the public teaser query below instead.
  //
  // Issue #2087: Scope listing retrieval by canonical nodeKey at the server boundary.
  const areaListingsQuery = useDiscoverListings({
    city: nav.city,
    page,
    filters: effectiveFilters,
    nodeKey: node.nodeKey,
    q: debouncedSearch?.trim() || undefined,
    listingPurpose: intentListingPurpose,
    enabled: isAuthenticated,
  });

  // Issue #2089 — anon fallback, scoped by the node's own (descendant) area keys.
  // Mirrors useDiscoverGroupResults.ts's anon branch (same public per-area teaser
  // endpoint, same limitPerArea/propertyType/bedrooms forwarding recipe).
  const nodeAreaKeys = useMemo(() => {
    if (node.descendantAreaKeys && node.descendantAreaKeys.length > 0) return node.descendantAreaKeys;
    return node.areaKey ? [node.areaKey] : [];
  }, [node.descendantAreaKeys, node.areaKey]);

  const {
    data: nodeListingsAnonData,
    isLoading: isLoadingNodeListingsAnon,
    isError: isErrorNodeListingsAnon,
    refetch: refetchNodeListingsAnon,
  } = useDiscoverCityListings({
    city: nav.city,
    areaKeys: !isAuthenticated ? nodeAreaKeys : [],
    limitPerArea: 20, // server caps at 20 anyway (MAX_LIMIT in CityAreaListingsService)
    // Forward the first propertyType/bedrooms value; remaining are filtered
    // client-side below via applyAnonPropertyFilters (same recipe as group results).
    propertyType: effectiveFilters.propertyTypes?.[0],
    bedrooms: effectiveFilters.bedrooms?.[0],
    // priceMin/priceMax: convert from rupees (PropertyFilters unit) to paise (backend unit).
    minPrice: effectiveFilters.priceMin != null ? effectiveFilters.priceMin * 100 : undefined,
    maxPrice: effectiveFilters.priceMax != null ? effectiveFilters.priceMax * 100 : undefined,
    q: debouncedSearch?.trim() || undefined,
    listingPurpose: intentListingPurpose,
  });

  // Normalise anon city-listing items to the DiscoverListingItem shape so a single
  // downstream discoverListingToCityListing conversion (areaListingsForPanel below)
  // works uniformly regardless of auth source. Same field mapping as
  // useDiscoverGroupResults.ts's groupResultsAnonListings.
  const nodeListingsAnonListings: DiscoverListingItem[] = useMemo(() => {
    if (isAuthenticated) return [];
    const raw = (nodeListingsAnonData?.areas ?? []).flatMap((a) => a.listings);
    const filtered = applyAnonPropertyFilters(
      raw as Parameters<typeof applyAnonPropertyFilters>[0],
      effectiveFilters,
    );
    return filtered.map((l): DiscoverListingItem => ({
      id: l.id,
      listingNumber: null,
      propertyType: l.propertyType ?? '',
      title: l.title ?? null,
      locality: l.locality ?? null,
      areaKey: null,
      pricePaise: l.pricePaise ?? null,
      landArea: l.landArea ?? null,
      landAreaUnit: l.landAreaUnit ?? null,
      builtArea: l.builtArea ?? null,
      builtAreaUnit: l.builtAreaUnit ?? null,
      bedrooms: l.bedrooms ?? null,
      latitude: l.lat ?? l.latitude ?? null,
      longitude: l.lon ?? l.longitude ?? null,
      heroImageUrl: l.primaryImageUrl ?? null,
      createdAt: l.createdAt ?? new Date(0).toISOString(),
      updatedAt: null,
      firstPublishedAt: null,
      lastUpdatedAt: null,
      daysOnMarket: 0,
      backOnMarket: false,
      reraNumber: null,
      reraValid: false,
      trustBadge: l.trustBadge ?? null,
      possessionStatus: null,
      sellerType: null,
      listingPurpose: l.listingPurpose ?? null,
      status: 'active',
    }));
  }, [isAuthenticated, nodeListingsAnonData, effectiveFilters]);

  const isLoadingNodeListings = isAuthenticated ? areaListingsQuery.isLoading : isLoadingNodeListingsAnon;
  const isErrorNodeListings = isAuthenticated ? areaListingsQuery.isError : isErrorNodeListingsAnon;
  const refetchNodeListings = isAuthenticated ? areaListingsQuery.refetch : refetchNodeListingsAnon;

  const areaListingsForPanel = useMemo(() => {
    const listings = isAuthenticated
      ? (areaListingsQuery.data?.content ?? [])
      : nodeListingsAnonListings;
    const mapped = listings.map((l) => discoverListingToCityListing(l as any));
    return isAuthenticated
      ? mapped
      : mapped.map((l) => ({ ...l, pricePaise: undefined, monthlyRentRupees: undefined }));
  }, [isAuthenticated, areaListingsQuery.data, nodeListingsAnonListings]);

  const regionAncestor = node.ancestry[0] ?? null;
  const groupAncestor = node.ancestry[1] ?? null;
  const regionName = regionAncestor?.displayLabel ?? null;
  const groupName = groupAncestor?.displayLabel ?? null;

  const onCrumbHome = () => selectNode(ROOT_NODE_KEY);
  const onCrumbCity = () => selectNode(ROOT_NODE_KEY);
  const onCrumbRegion = regionAncestor ? () => selectNode(regionAncestor.nodeKey) : undefined;
  const onCrumbGroup = groupAncestor ? () => selectNode(groupAncestor.nodeKey) : undefined;

  const selectedListingPreview = useMemo<SelectedListingPreview | null>(() => {
    if (!nav.selectedListing) return null;
    const match = areaListingsForPanel.find((l) => l.id === nav.selectedListing);
    if (!match) return null;
    return toSelectedListingPreview(match, { isAuthenticated, areaLabel: node.displayLabel });
  }, [nav.selectedListing, areaListingsForPanel, isAuthenticated, node.displayLabel]);

  useEffect(() => {
    onSelectedListingPreviewChange?.(selectedListingPreview);
  }, [selectedListingPreview, onSelectedListingPreviewChange]);
  
  const syntheticAreaPoint = useMemo(() => {
    return {
      areaKey: node.nodeKey,
      areaLabel: node.displayLabel,
      geo_center_lat: node.bounds?.centreLat ?? 0,
      geo_center_lon: node.bounds?.centreLon ?? 0,
    };
  }, [node]);

  if (isErrorNodeListings) {
    return (
      <div className="p-4 flex flex-col h-full" data-testid="areas-journey-panel-node-listings">
        <button
          type="button"
          className="mb-3 flex items-center text-sm font-medium text-muted-foreground hover:text-foreground shrink-0"
          onClick={onClearNodeListings}
        >
          <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />
          Back to {node.displayLabel}
        </button>
        <div
          className="p-4 flex flex-col items-center text-center gap-2"
          data-testid="areas-journey-panel-node-listings-error"
        >
          <AlertCircle className="h-6 w-6 text-destructive" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            We couldn't load properties in {node.displayLabel}. Please try again.
          </p>
          <Button variant="outline" size="sm" onClick={() => refetchNodeListings()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // Anon per-area teaser has no server-side pagination (limitPerArea cap
  // only, same as the #1597 group-results anon path) — no Prev/Next controls.
  const totalPages = isAuthenticated ? (areaListingsQuery.data?.totalPages ?? 0) : 0;
  const totalElements = isAuthenticated
    ? (areaListingsQuery.data?.totalElements ?? 0)
    : nodeListingsAnonListings.length;

  return (
    <div
      className="flex h-full min-h-0 flex-1 flex-col overflow-hidden p-4"
      data-testid="areas-journey-panel-node-listings"
    >
      <button
        type="button"
        className="mb-3 flex items-center text-sm font-medium text-muted-foreground hover:text-foreground shrink-0"
        onClick={onClearNodeListings}
      >
        <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />
        Back to {node.displayLabel}
      </button>
      <AreaSelectedPanel
        selectedArea={syntheticAreaPoint}
        cityLabel={CITY_CONFIG[nav.city]?.label ?? nav.city}
        regionName={regionName}
        groupName={groupName}
        onCrumbHome={onCrumbHome}
        onCrumbCity={onCrumbCity}
        onCrumbRegion={onCrumbRegion}
        onCrumbGroup={onCrumbGroup}
        areaListings={areaListingsForPanel}
        isLoadingListings={isLoadingNodeListings}
        isAuthenticated={isAuthenticated}
        filters={effectiveFilters}
        onFiltersChange={(next) => {
          if (onCommittedFiltersChange) {
            onCommittedFiltersChange({
              ...(committedFilters ?? {}),
              propertyTypes: next.propertyTypes,
              bedrooms: next.bedrooms,
              priceMin: next.priceMin,
              priceMax: next.priceMax,
            });
            return;
          }
          actions.setFiltersCommitted({
            ...nav.filters,
            propertyTypes: next.propertyTypes,
            bedrooms: next.bedrooms,
            priceMin: next.priceMin,
            priceMax: next.priceMax,
          });
        }}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        selectedListingId={nav.selectedListing}
        onSelectListing={(id) => actions.setSelectedListing(id)}
        intent={nav.intent}
        onAddSchool={onAddSchool}
      />
      {totalPages > 1 ? (
        <div className="flex items-center justify-between gap-2 px-4 py-2 border-t border-border bg-card shrink-0">
          <Button
            variant="outline" size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />Prev
          </Button>
          <span className="text-xs text-muted-foreground">
            {page + 1} / {totalPages} · {totalElements.toLocaleString()} listings
          </span>
          <Button
            variant="outline" size="sm"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          >
            Next<ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
