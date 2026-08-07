import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useDiscoverNav, useDiscoverActions } from '@/features/discover/context/useDiscoverContext';
import { useDiscoverSearchState } from '@/features/discover/state/useDiscoverSearchState';
import { useDiscoverListings } from '@/hooks/useDiscoverListings';
import { PropertyFilters } from '@/hooks/usePropertyListings';
import { NavigationNodeResponse, ROOT_NODE_KEY } from '@/features/discover/navigation/types';
import { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import { type SelectedListingPreview } from '@/features/discover/navigation/selectedListingPreview';
import { toSelectedListingPreview } from '@/features/discover/navigation/selectedListingPreview';
import { AreaSelectedPanel } from '@/components/discover/panels/AreaSelectedPanel';
import { CITY_CONFIG } from '@/lib/localityUtils';

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
  
  // Issue #2087: Scope listing retrieval by canonical nodeKey at the server boundary.
  const areaListingsQuery = useDiscoverListings({
    city: nav.city,
    page,
    filters: effectiveFilters,
    nodeKey: node.nodeKey,
    q: debouncedSearch?.trim() || undefined,
    listingPurpose: intentListingPurpose,
    enabled: true,
  });

  const areaListingsForPanel = useMemo(() => {
    const listings = areaListingsQuery.data?.content ?? [];
    return isAuthenticated
      ? listings
      : listings.map((l) => ({ ...l, pricePaise: undefined, monthlyRentRupees: undefined }));
  }, [areaListingsQuery.data, isAuthenticated]);

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

  if (areaListingsQuery.isError) {
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
          <Button variant="outline" size="sm" onClick={() => areaListingsQuery.refetch()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }
  
  const totalPages = areaListingsQuery.data?.totalPages ?? 0;
  const totalElements = areaListingsQuery.data?.totalElements ?? 0;

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
        isLoadingListings={areaListingsQuery.isLoading}
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
      {isAuthenticated && totalPages > 1 ? (
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
