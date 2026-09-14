import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useDiscoverNav, useDiscoverActions, useDiscoverShell } from '@/features/discover/context/useDiscoverContext';
import { AreaSetDraftPanel } from '@/features/discover/components/AreaSetDraftPanel';
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
import { toCommittedUrlFilters } from '@/features/discover/selectors/effectiveDiscoverContext';

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
  // Issue #2017 (owner-directed desktop rework) — this is the REAL area-first
  // production render site for the AREA-leaf entry point (AreaSelectedPanel
  // below), not DiscoverRightPanel.tsx's legacy switch-case (which only
  // handles non-area-first journeys via LegacyRightPanelBridge). On desktop,
  // an open AREA_SET draft renders IN-PANEL (AreaSetDraftPanel) here too —
  // see DiscoverShellContextValue.isAreaSetDraftOpen's doc.
  const { isMobileShell, isAreaSetDraftOpen } = useDiscoverShell();
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
            // Issue #2553 — was missing from this projection, so a committed
            // Commercial subtype never reached AreaSelectedPanel's chip-display
            // `filters` prop. Without it the write-path fix alone is not enough:
            // the chip could be toggled but never render as selected, because the
            // panel derives `activeCommercialSubtypes` from exactly this prop.
            commercialSubtypes: committedFilters.commercialSubtypes,
            bedrooms: committedFilters.bedrooms,
            priceMin: committedFilters.priceMin,
            priceMax: committedFilters.priceMax,
            // Issue #2023 — was missing from this projection, so a readyToMove
            // toggle in AreaSelectedPanel never reached the chip-display
            // `filters` prop (nor this surface's own listings queries below).
            readyToMove: committedFilters.readyToMove,
            // Issue #2555 — the AREA (SQ FT) axis, missing for the same reason the two
            // above were and with a worse symptom than either. #2459's bound ALREADY
            // reached the map markers (`useDiscoverMapData` forwards `filters` wholesale
            // to `useDiscoverFilteredMarkers`, and `buildDiscoverSearchParams` emits it),
            // but this projection dropped it before it returned as the panel's `filters`
            // prop. So a signed-in buyer's MAP narrowed to the chosen size while the card
            // list ignored the bound and the AREA chip still read "Any size" — a
            // cards/markers DIVERGENCE rather than a dead control.
            areaMinSqft: committedFilters.areaMinSqft,
            areaMaxSqft: committedFilters.areaMaxSqft,
          }
        : {
            propertyTypes: nav.filters.propertyTypes as PropertyFilters['propertyTypes'],
            commercialSubtypes: nav.filters.commercialSubtypes as PropertyFilters['commercialSubtypes'],
            bedrooms: nav.filters.bedrooms,
            priceMin: nav.filters.priceMin,
            priceMax: nav.filters.priceMax,
            readyToMove: nav.filters.readyToMove,
            // Issue #2555 — BOTH branches need it. This one serves a cold-load or shared
            // link (`?areaMinSqft=1200`), the exact path that would otherwise render an
            // unfiltered card list beside an already-narrowed map.
            areaMinSqft: nav.filters.areaMinSqft,
            areaMaxSqft: nav.filters.areaMaxSqft,
          },
    [
      committedFilters,
      nav.filters.propertyTypes,
      nav.filters.commercialSubtypes,
      nav.filters.bedrooms,
      nav.filters.priceMin,
      nav.filters.priceMax,
      nav.filters.readyToMove,
      // Issue #2555 — the deps are a SEPARATE half of this fix, not bookkeeping. #2583
      // showed the failure mode on the subtype axis: a memo that reads a key it does not
      // depend on keeps serving the previous value, so the literal looks right and the
      // surface still shows stale filters. Omitting these two would let the projection
      // above pass a naive test and still diverge from the map on the SECOND change of
      // the bound.
      nav.filters.areaMinSqft,
      nav.filters.areaMaxSqft,
    ],
  );

  // Issue #2087: Reset to page 0 whenever the result set is narrowed/changed so
  // we never request an out-of-range page after a filter/intent/search update.
  const resetKey = [
    intentListingPurpose,
    effectiveFilters.propertyTypes?.join(',') ?? '',
    // Issue #2553 — a subtype change narrows the result set exactly like a
    // property-type change, so it must reset paging for the same reason.
    effectiveFilters.commercialSubtypes?.join(',') ?? '',
    effectiveFilters.bedrooms?.join(',') ?? '',
    effectiveFilters.priceMin ?? '',
    effectiveFilters.priceMax ?? '',
    effectiveFilters.readyToMove ?? '',
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
    // Issue #2533 — the FULL selection is forwarded (repeated params). This previously
    // sent only `?.[0]`, leaning on applyAnonPropertyFilters below to drop the rest
    // client-side; that under-included, because the server's 20-per-area teaser cap was
    // applied to the over-broad single-value result set BEFORE the client narrowed it.
    propertyType: effectiveFilters.propertyTypes?.length ? effectiveFilters.propertyTypes : undefined,
    // Issue #2531 — this surface calls the hook DIRECTLY (it does not go through
    // buildCityListingsQueryParams), so the adapter fix does not reach it. #2553 made the
    // subtype survive the commit boundary into `effectiveFilters` above; without this line
    // it arrived here and was then dropped on the way to the wire — the same
    // carried-but-not-forwarded shape one layer further down.
    commercialSubtypes: effectiveFilters.commercialSubtypes?.length
      ? effectiveFilters.commercialSubtypes
      : undefined,
    bedrooms: effectiveFilters.bedrooms?.length ? effectiveFilters.bedrooms : undefined,
    // priceMin/priceMax: convert from rupees (PropertyFilters unit) to paise (backend unit).
    minPrice: effectiveFilters.priceMin != null ? effectiveFilters.priceMin * 100 : undefined,
    maxPrice: effectiveFilters.priceMax != null ? effectiveFilters.priceMax * 100 : undefined,
    q: debouncedSearch?.trim() || undefined,
    listingPurpose: intentListingPurpose,
    // Issue #2023 — CityAreaListingsService now filters on possession_status = 'READY',
    // same predicate markers/navigation-counts/authenticated Browse-all already apply.
    readyToMove: effectiveFilters.readyToMove,
  });

  // Normalise anon city-listing items to the DiscoverListingItem shape so a single
  // downstream discoverListingToCityListing conversion (areaListingsForPanel below)
  // works uniformly regardless of auth source. Same field mapping as
  // useDiscoverGroupResults.ts's groupResultsAnonListings.
  const nodeListingsAnonListings: DiscoverListingItem[] = useMemo(() => {
    if (isAuthenticated) return [];
    const raw = (nodeListingsAnonData?.areas ?? []).flatMap((a) => a.listings);
    // Issue #2089 fix-cycle (PR #2141 finding 2) — priceMin/priceMax are already sent
    // to the public /api/discover/cities/{city}/listings endpoint above (minPrice/maxPrice)
    // and authoritatively filtered server-side. Do NOT re-run the price-range branches of
    // applyAnonPropertyFilters here: that helper's price checks require `pricePaise`, but the
    // anon (unauthenticated) response contract deliberately returns `priceBand` instead
    // (never `pricePaise` — see DiscoverCityListingItem's mutually-exclusive contract), so
    // re-applying it would wrongly discard every server-correct row a second time whenever a
    // min/max price filter is active. propertyTypes/bedrooms are still applied here, but as of
    // Issue #2533 they are no longer LOAD-BEARING: the server call above now forwards every
    // selected value, so this pass is an idempotent no-op over an already-narrowed set. It is
    // kept rather than deleted because it is the only guard if a future caller regresses to
    // forwarding a partial selection.
    //
    // Issue #2023 — readyToMove is ALSO excluded here (not just price), for the same
    // reason: it is already sent to and authoritatively filtered by the public
    // /api/discover/cities/{city}/listings endpoint above (readyToMove param,
    // CityAreaListingsService). The anon response contract (`DiscoverCityListingItem`)
    // has no `possessionStatus` field to re-check client-side, and re-applying
    // `applyAnonPropertyFilters`'s `l.possessionStatus === 'ready_to_move'` check here
    // would always be false and silently wipe every server-correct row.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { priceMin: _priceMin, priceMax: _priceMax, readyToMove: _readyToMove, ...nonPriceFilters } =
      effectiveFilters;
    const filtered = applyAnonPropertyFilters(
      raw as Parameters<typeof applyAnonPropertyFilters>[0],
      nonPriceFilters,
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
      {!isMobileShell && isAreaSetDraftOpen ? (
        <AreaSetDraftPanel />
      ) : (
      <>
      <AreaSelectedPanel
        selectedArea={syntheticAreaPoint}
        // Issue #2017 — the multi-area AREA_SET header's `useDiscoverAreas(city)`
        // call (inside AreaSetSelectedHeader) needs the raw city slug, not just
        // the display label below. Without this, `city` fell back to '' at the
        // panel's own `city={city ?? ''}` default, which is below
        // useDiscoverAreas's `enabled: city.length > 0` guard — the query never
        // fired, so the header always rendered its generic-count fallback
        // instead of resolved area names/counts, even once real listings had
        // loaded.
        city={nav.city}
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
          // Issue #2553 — forward what the panel actually emitted instead of
          // rebuilding the committed object from a key allowlist. The allowlist
          // shape silently dropped two separate axes over its life (readyToMove,
          // Issue #2023; commercialSubtypes, Issue #2553). The failure mode is
          // invisible at the point of loss and only shows up as a filter that
          // appears to do nothing, so it survives review every time. `next` is a
          // full PropertyFilters the panel derived from the `filters` prop this
          // surface gave it, so spreading it over the committed base carries every
          // axis — including ones added after this line was written — while the
          // base still supplies anything outside this surface's own projection.
          if (onCommittedFiltersChange) {
            onCommittedFiltersChange({ ...(committedFilters ?? {}), ...next });
            return;
          }
          actions.setFiltersCommitted(toCommittedUrlFilters(nav.filters, next));
        }}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        selectedListingId={nav.selectedListing}
        onSelectListing={(id) => actions.setSelectedListing(id)}
        intent={nav.intent}
        onAddSchool={onAddSchool}
        // Issue #2023 (BLOCKING review fix) — this "Browse all" surface now
        // genuinely applies readyToMove for BOTH authenticated users (via
        // `useDiscoverListings`'s `filters` arg above) and anonymous users
        // (via `useDiscoverCityListings`'s `readyToMove` param above, now
        // filtered server-side by `CityAreaListingsService`). No longer
        // gated on `isAuthenticated` — prop omitted, relying on
        // AreaSelectedPanel's own `= true` default.
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
      </>
      )}
    </div>
  );
}
