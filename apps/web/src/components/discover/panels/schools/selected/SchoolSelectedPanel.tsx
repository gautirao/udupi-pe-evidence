/**
 * SchoolSelectedPanel — school-first journey, schoolId present.
 * Moved from SchoolJourneyPanels.tsx (Issue #2661 commit 4) — flat props
 * unchanged, but the shared radius-listing body, filters sheet, and card-
 * scroll-into-view effect now delegate to schools/radius/SchoolRadiusListings,
 * schools/shared/SchoolFiltersSheet, and schools/shared/useSelectedCardScroll
 * respectively (no observable logic/JSX changes vs. the pre-extraction
 * source).
 *
 * Issue #2661 commit 5 — public props narrowed from 20 flat fields to a
 * `{view, commands}` contract (see SchoolSelectedPanelProps below). An
 * entirely-absent `commands.boundedSearch` group hides the CTA exactly as an
 * undefined `onBoundedSearch` did before (see the bounded-search render
 * below — it reads `commands.boundedSearch?.trigger`).
 */
import { useCallback, useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { PanelHeader } from '../../../PanelHeader';
import { useDiscoverNav } from '@/features/discover/context/useDiscoverContext';
import { usePropertyFilterGroups } from '@/features/discover/buyer-filters/controllers/usePropertyFilterGroups';
import { useSchoolFilterBarGroups } from '@/features/discover/right-panel/school/useSchoolFilterBarGroups';
import { CompactFilterBar } from '@/features/discover/buyer-filters/sections/CompactFilterBar';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import { snapRadiusKm } from '../radius/radiusOptions';
import { hasActiveSchoolPropertyFilters, clearSchoolPropertyFilters } from '../radius/schoolPropertyFilters';
import { sortListingsBySchoolDistance } from '../radius/sortListingsBySchoolDistance';
import { SchoolSummaryBand } from '../radius/SchoolSummaryBand';
import { isSchoolRadiusCountPending } from '../radius/isSchoolRadiusCountPending';
import { SchoolRadiusListings } from '../radius/SchoolRadiusListings';
import { SchoolContextHeader } from '../radius/SchoolContextHeader';
import { SchoolFiltersSheet } from '../shared/SchoolFiltersSheet';
import { useSelectedCardScroll } from '../shared/useSelectedCardScroll';
import type {
  SchoolChromeCommands,
  SchoolChromeViewWithFilters,
  SchoolRadiusListingsCommands,
  SchoolPropertyFiltersCommands,
  SchoolPropertyFiltersView,
  SchoolViewerView,
} from '../shared/schoolJourneyContracts';

export interface SchoolSelectedPanelView {
  chrome: SchoolChromeViewWithFilters;
  viewer: SchoolViewerView;
  /** The resolved school object. Null during cold-load while schoolById is fetching. */
  school: SchoolResult | null;
  radius: {
    /** Current radius in km — null before URL param resolves (uses default). */
    km: number | null;
  };
  listings: {
    /** Proximity-filtered listings from MapDiscovery (already server-filtered). */
    data: DiscoverCityListingItem[];
    loading: boolean;
    /**
     * Issue #1793 SR-024 — true when the school-radius request failed. With no listings to
     * show, the panel renders a request-failure block + Retry instead of the "no homes within
     * N km" empty state (a backend failure is not an empty market).
     */
    error?: boolean;
    /**
     * Issue #1170 — true while a school-radius/filter refetch is in flight (distinct
     * from the initial skeleton load). Drives the AreaSelectedPanel-style opacity dim.
     */
    fetching?: boolean;
    /**
     * Issue #1793 PR-C — the school-radius card source's OWN "settled" (loaded, not failed, not a
     * keepPreviousData placeholder), distinct from `fetching`. Gates the "Request a property" card;
     * absent reads as "not settled" (no card).
     */
    settled?: boolean;
    /** Issue #1793 PR-C — the anonymous school-radius page was capped; a filtered-empty page is then not a real zero. */
    hasMore?: boolean;
    /**
     * Issue #1547 — id of the currently selected listing (URL/parent-derived).
     * RISK-3 note: school markers come from 3 desynced tier sources so
     * card↔marker sync is visual-only (card side); marker copper highlighting is
     * intentionally NOT wired for school-first.
     */
    selectedId?: string | null;
  };
  propertyFilters: SchoolPropertyFiltersView;
  boundedSearch: {
    /**
     * Issue #1115 — true once the user has clicked the CTA; switches panel from
     * "Search" call-to-action to a results count helper line.
     */
    triggered?: boolean;
  };
}

export interface SchoolSelectedPanelCommands {
  chrome: SchoolChromeCommands;
  radius: {
    /** Called when the user picks a new radius button. Parent writes URL + filter. */
    change: (radiusKm: number) => void;
  };
  listings: SchoolRadiusListingsCommands;
  propertyFilters: SchoolPropertyFiltersCommands;
  /**
   * Issue #1115 — when the whole group is present, renders a CTA the user must
   * click before the backend /api/discover/markers fetch is allowed. An
   * entirely-absent group (undefined) hides the CTA — same as an undefined
   * `onBoundedSearch` did in the pre-commit-5 flat-prop shape.
   */
  boundedSearch?: {
    trigger: () => void;
  };
}

export interface SchoolSelectedPanelProps {
  view: SchoolSelectedPanelView;
  commands: SchoolSelectedPanelCommands;
  /**
   * Issue #2762 PR-B — the desktop-reskin signal for the shared compact FilterBar (per locked
   * OQ1, desktop only). Threaded as a PLAIN PROP, not read via `useDiscoverShell()` directly in
   * this component — that was tried first and reverted after it crashed
   * `SchoolJourneyPanels.testidInventory.test.tsx`, which partially mocks
   * `@/features/discover/context/useDiscoverContext` without a `useDiscoverShell` export. Default
   * `false` preserves every existing caller/test's behaviour (mobile-style single filter trigger)
   * unchanged.
   */
  isDesktop?: boolean;
}

export function SchoolSelectedPanel({ view, commands, isDesktop = false }: SchoolSelectedPanelProps) {
  const {
    chrome: { journey, activeContextChips, filtersContent },
    viewer: { intent = 'buy', isAuthenticated = false },
    school,
    radius: { km: radiusKm },
    listings: {
      data: listings,
      loading: isLoadingListings,
      error: isListingsError = false,
      fetching: isFetching = false,
      settled: isSettled,
      hasMore,
      selectedId: selectedListingId = null,
    },
    propertyFilters: { value: filters = {} },
    boundedSearch: { triggered: boundedSearchTriggered = false },
  } = view;
  const {
    chrome: { startOver: onStartOver, back: onBack },
    radius: { change: onRadiusChange },
    listings: { select: onSelectListing, hover: onHoverListing, retry: onRetryListings },
    propertyFilters: { replace: onFiltersChange },
    boundedSearch,
  } = commands;
  const onBoundedSearch = boundedSearch?.trigger;
  // Issue #1953 (build step 2) — consumes the DiscoverProvider facade instead
  // of calling useDiscoverUrlState() directly (state plumbing only). Only
  // nav fields are read in this panel; no actions are called here.
  const urlState = useDiscoverNav();

  // Issue #2762 PR-B — usePropertyFilterGroups called EXACTLY ONCE for this panel (see that
  // hook's own header comment: a second call creates a conflicting family-override state). Its
  // `onFiltersChange` is the SAME `commands.propertyFilters.replace` SchoolFiltersSheet's own
  // content (MapFilters, threaded via `filtersContent`) already writes through.
  const propertyFilterGroups = usePropertyFilterGroups({
    filters,
    onFiltersChange,
    intent,
    isReadyToMoveSupported: true,
    isCommercialSubtypeSupported: false,
  });
  const { groups: schoolFilterBarGroups, overflowOnly: schoolFilterBarOverflow } = useSchoolFilterBarGroups({
    groups: propertyFilterGroups,
    isCommercialSubtypeSupported: false,
    isReadyToMoveSupported: true,
  });

  // Issue #1547 — scroll selected card into view when selection changes.
  const cardRefs = useSelectedCardScroll(selectedListingId);

  // Issue #1210: clamp sub-minimum/non-finite radii (e.g. ?radiusKm=0) up to the
  // minimum so the radius control shows a selected button and the empty-state text
  // never reads "within 0 km". `??` alone misses 0 (not null/undefined).
  const effectiveRadius = snapRadiusKm(radiusKm);

  // Intentionally scoped to the four filters surfaced in the "Clear filters" chip
  // (price range, bedrooms, property types). Toggle filters (sellerTypes, backOnMarket,
  // newToMarket, reraRegistered, readyToMove) are not shown in this panel's chip row
  // and are excluded by design.
  const hasPropertyFilters = hasActiveSchoolPropertyFilters(filters);

  const handleClearPropertyFilters = useCallback(() => {
    if (!onFiltersChange) return;
    onFiltersChange(clearSchoolPropertyFilters(filters));
  }, [filters, onFiltersChange]);

  // "Change school" navigates back (clears schoolId) — onBack is the correct handler.
  const handleChangeSchool = useCallback(() => {
    onBack?.();
  }, [onBack]);

  // Derive area label from URL groupId/areaKey for breadcrumb if available.
  const groupId = urlState.groupId ?? null;
  // areaLabel is not directly on urlState — extract from selectedArea if passed via school.areaKey
  const areaLabelForBreadcrumb: string | null =
    school?.areaKey?.split('|').pop() ?? urlState.areaKey?.split('|').pop() ?? null;

  // Detect missing school coordinates — listing fetch is disabled without coords so list will be empty.
  // SchoolResult types latitude/longitude as number, but legacy rows may have null at runtime.
  const hasMissingCoords =
    school != null &&
    ((school.latitude as unknown) == null || (school.longitude as unknown) == null);

  // Issue #1974 — compute distance once per listing, then sort ascending so the
  // visible card order matches "nearest to school first" instead of server order
  // (created_at DESC). Listings without usable coordinates sort last.
  const sortedListingsWithDistance = useMemo(
    () => sortListingsBySchoolDistance(listings, school),
    [listings, school],
  );

  const boundedSearchSlot = (
    <>
      {/* Issue #1115 — bounded-search CTA.
          Auth users see a "Search within N km" button before markers are fetched.
          Hidden for anon (marker fetch is auth-gated; a no-op CTA is confusing).
          Switches to a results count helper line once the user has triggered the search. */}
      {isAuthenticated && onBoundedSearch && !boundedSearchTriggered && (
        <div className="px-4 py-3 border-b border-border">
          <Button
            variant="default"
            size="sm"
            className="w-full"
            onClick={onBoundedSearch}
            data-testid="school-bounded-search-cta"
          >
            Search within {effectiveRadius} km
          </Button>
        </div>
      )}
      {/* Issue #1115 DEFECT 3 — suppress the count during an in-flight refetch */}
      {isAuthenticated && boundedSearchTriggered && !isLoadingListings && !isFetching && (
        <p
          className="px-4 py-2 text-xs text-muted-foreground border-b border-border"
          data-testid="school-bounded-search-count"
          aria-live="polite"
        >
          {listings.length} {listings.length === 1 ? 'property' : 'properties'} for{' '}
          {intent === 'rent' ? 'rent' : 'sale'} found
          {school ? ` near ${school.name}` : ''}
        </p>
      )}
    </>
  );

  return (
    <>
      {/* onBack is forwarded to PanelHeader which renders the single canonical Back
          chevron before the title — do NOT add a second Back button in the actions
          slot here (Option B from Issue #1143 review: unified affordance position). */}
      <PanelHeader
        title="Find homes near a school"
        journey={journey}
        onStartOver={onStartOver}
        onBack={onBack}
        activeContextChips={activeContextChips}
        actions={<SchoolFiltersSheet filtersContent={filtersContent} testId="school-filters-trigger" />}
      />

      {/* Issue #2762 PR-B — desktop-reskin only (per locked OQ1). SchoolFiltersSheet above is
          UNCHANGED either way — it stays the trigger for seller type/listing status/date range
          (MapFilters' remaining sections), now read as "More filters" alongside this row rather
          than hidden. Mobile (isDesktopReskin=false): byte-identical to before this change. */}
      {isDesktop && (
        <CompactFilterBar
          accent="schools"
          groups={schoolFilterBarGroups}
          overflowOnly={schoolFilterBarOverflow}
          testIdPrefix="school-filter-toolbar"
        />
      )}

      {/* Single continuous scroll region (school-results-polish): only the PanelHeader
          stays pinned. The school summary band, radius chips, bounded-search controls,
          result heading and the listings all scroll together as one column — no nested
          scroll trap — while the left map stays stable. */}
      <div className="flex-1 overflow-y-auto" data-testid="school-selected-scroll">
      {/* School summary band — skeleton during cold load. Same tinted-card shell as the
          loaded SchoolSummaryBand (border + bg-card, not a solid fill) so loading/loaded
          read as one consistent surface (AC5). */}
      {school == null ? (
        // Visual-parity polish (cycle 2) — navy skeleton shell matches the loaded
        // SchoolJourneyHero surface (mock parity) so loading/loaded read as one
        // consistent dark hero, not a light-card flash before it.
        <div
          className="m-4 rounded-2xl border border-slate-800 bg-[#0F172A] p-5 shadow-lg"
          data-testid="school-summary-skeleton"
        >
          <Skeleton className="h-3 w-24 mb-3 bg-slate-700" />
          <Skeleton className="h-6 w-3/4 mb-2 bg-slate-700" />
          <Skeleton className="h-3 w-1/2 mb-3 bg-slate-700" />
          <Skeleton className="h-8 w-1/3 bg-slate-700" />
        </div>
      ) : isDesktop ? (
        // Issue #2770 — parity with AreaSchoolCombinedPanel: one compact desktop context block.
        <SchoolContextHeader
          school={school}
          listingCount={listings.length}
          intent={intent}
          effectiveRadius={effectiveRadius}
          onRadiusChange={onRadiusChange}
          onChangeSchool={handleChangeSchool}
          radiusTestIdPrefix="radius-btn"
          countPending={isSchoolRadiusCountPending({
            isAuthenticated,
            isLoading: isLoadingListings,
            isError: isListingsError,
            listingCount: listings.length,
          })}
        />
      ) : (
        <SchoolSummaryBand
          compact
          school={school}
          listings={listings}
          intent={intent}
          groupId={groupId}
          areaLabel={areaLabelForBreadcrumb}
          onChangeSchool={handleChangeSchool}
          countPending={isSchoolRadiusCountPending({
            isAuthenticated,
            isLoading: isLoadingListings,
            isError: isListingsError,
            listingCount: listings.length,
          })}
        />
      )}

      {/* Issue #1261 — the anonymous school-radius listing set is now sourced from the
          PUBLIC /school-radius-listings endpoint, which performs the same cross-area
          ST_DWithin proximity query the authenticated path uses. The radius circle and the
          listing set are therefore consistent for anon users, so the prior #1193
          "Showing homes in this area only" limitation note has been removed. */}

      <SchoolRadiusListings
        density={school != null && isDesktop ? 'desktop' : school != null ? 'compact' : 'default'}
        variant="selected"
        school={school}
        areaLabel={areaLabelForBreadcrumb}
        listings={listings}
        sortedListingsWithDistance={sortedListingsWithDistance}
        isLoadingListings={isLoadingListings}
        isError={isListingsError}
        onRetry={onRetryListings}
        isFetching={isFetching}
        hasMissingCoords={hasMissingCoords}
        hasPropertyFilters={hasPropertyFilters}
        effectiveRadius={effectiveRadius}
        onRadiusChange={onRadiusChange}
        onClearSchool={handleChangeSchool}
        onClearPropertyFilters={handleClearPropertyFilters}
        intent={intent}
        isAuthenticated={isAuthenticated}
        selectedListingId={selectedListingId}
        onSelectListing={onSelectListing}
        onHoverListing={onHoverListing}
        cardRefs={cardRefs}
        boundedSearchSlot={boundedSearchSlot}
        city={urlState.city}
        requestAreaKey={school?.areaKey ?? urlState.areaKey ?? null}
        settled={isSettled}
        hasMore={hasMore}
      />
      </div>
    </>
  );
}
