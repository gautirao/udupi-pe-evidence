/**
 * AreaSchoolCombinedPanel — both area and school selected (cross-journey
 * combined state). Moved from SchoolJourneyPanels.tsx (Issue #2661 commit 4)
 * — flat props unchanged, but the shared radius-listing body, filters sheet,
 * and card-scroll-into-view effect now delegate to
 * schools/radius/SchoolRadiusListings, schools/shared/SchoolFiltersSheet, and
 * schools/shared/useSelectedCardScroll respectively (no observable
 * logic/JSX changes vs. the pre-extraction source).
 *
 * CRITICAL (Rules of Hooks): this component has an early-return skeleton
 * branch when `selectedArea` or `selectedSchool` is null. The `useSelectedCardScroll`
 * hook call and the `sortedListingsWithDistance` useMemo MUST remain called
 * unconditionally, above that early return — exactly as in the
 * pre-extraction source. Do not move either below the `if (!selectedArea ||
 * !selectedSchool)` guard.
 *
 * Issue #2661 commit 5 — public props narrowed from 21 flat fields to a
 * `{view, commands}` contract (see AreaSchoolCombinedPanelProps below). The
 * dead `onClearArea` prop (never read in this component's body) is dropped
 * entirely.
 */
import { useCallback, useMemo } from 'react';
import { PanelHeader } from '../../../PanelHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { useDiscoverNav } from '@/features/discover/context/useDiscoverContext';
import { usePropertyFilterGroups } from '@/features/discover/buyer-filters/controllers/usePropertyFilterGroups';
import { useSchoolFilterBarGroups } from '@/features/discover/right-panel/school/useSchoolFilterBarGroups';
import { CompactFilterBar } from '@/features/discover/buyer-filters/sections/CompactFilterBar';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import { snapRadiusKm } from '../radius/radiusOptions';
import { hasActiveSchoolPropertyFilters, clearSchoolPropertyFilters } from '../radius/schoolPropertyFilters';
import { sortListingsBySchoolDistance } from '../radius/sortListingsBySchoolDistance';
import { SchoolSummaryBand } from '../radius/SchoolSummaryBand';
import { SchoolRadiusListings } from '../radius/SchoolRadiusListings';
import { SchoolFiltersSheet } from '../shared/SchoolFiltersSheet';
import { useSelectedCardScroll } from '../shared/useSelectedCardScroll';
import type {
  SchoolChromeCommands,
  SchoolChromeViewWithFilters,
  SchoolListingsCommands,
  SchoolPropertyFiltersCommands,
  SchoolPropertyFiltersView,
  SchoolViewerView,
} from '../shared/schoolJourneyContracts';

export interface AreaSchoolCombinedPanelView {
  chrome: SchoolChromeViewWithFilters;
  viewer: SchoolViewerView;
  /** Resolved area — null while cold-load hydration is in progress. */
  area: AreaPoint | null;
  /** Resolved school — null while schoolById is fetching on cold load. */
  school: SchoolResult | null;
  radius: {
    /** Current radius in km — null before URL param resolves. */
    km: number | null;
  };
  listings: {
    /** Proximity + area-scoped listings from MapDiscovery (server-filtered). */
    data: DiscoverCityListingItem[];
    loading: boolean;
    /**
     * Issue #1170 — true while a school-radius/filter refetch is in flight
     * (distinct from the initial skeleton load).
     */
    fetching?: boolean;
    /**
     * ReTrends redesign — id of the currently selected listing (from `listing`
     * URL param). Drives the copper selected card frame + scroll-into-view.
     */
    selectedId?: string | null;
  };
  propertyFilters: SchoolPropertyFiltersView;
}

export interface AreaSchoolCombinedPanelCommands {
  chrome: SchoolChromeCommands;
  radius: {
    /** Called when the user picks a new radius. */
    change: (radiusKm: number) => void;
  };
  listings: SchoolListingsCommands;
  propertyFilters: SchoolPropertyFiltersCommands;
  school: {
    /** Called when the user dismisses the school chip — removes schoolId/radiusKm, preserves areaKey + board/category. */
    clear: () => void;
  };
}

export interface AreaSchoolCombinedPanelProps {
  view: AreaSchoolCombinedPanelView;
  commands: AreaSchoolCombinedPanelCommands;
  /**
   * Issue #2762 PR-B — the desktop-reskin signal for the shared compact FilterBar (per locked
   * OQ1, desktop only). Threaded as a PLAIN PROP, not read via `useDiscoverShell()` directly in
   * this component — that was tried first and reverted after it crashed
   * `SchoolJourneyPanels.testidInventory.test.tsx`, which partially mocks
   * `@/features/discover/context/useDiscoverContext` without a `useDiscoverShell` export. Default
   * `false` preserves every existing caller/test's behaviour unchanged.
   */
  isDesktop?: boolean;
}

export function AreaSchoolCombinedPanel({ view, commands, isDesktop = false }: AreaSchoolCombinedPanelProps) {
  const {
    chrome: { journey, activeContextChips, filtersContent },
    viewer: { intent = 'buy', isAuthenticated = false },
    area: selectedArea,
    school: selectedSchool,
    radius: { km: radiusKm },
    listings: { data: listings, loading: isLoadingListings, fetching: isFetching = false, selectedId: selectedListingId = null },
    propertyFilters: { value: filters = {} },
  } = view;
  const {
    chrome: { startOver: onStartOver, back: onBack },
    radius: { change: onRadiusChange },
    listings: { select: onSelectListing, hover: onHoverListing },
    propertyFilters: { replace: onFiltersChange },
    school: { clear: onClearSchool },
  } = commands;
  // Issue #1953 (build step 2) — consumes the DiscoverProvider facade instead
  // of calling useDiscoverUrlState() directly (state plumbing only; read-only).
  const urlState = useDiscoverNav();

  // Issue #2762 PR-B — Rules of Hooks: called unconditionally, above the early-return below,
  // same as useSelectedCardScroll/sortedListingsWithDistance already are in this file.
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
  // Rules of Hooks: called unconditionally, above the early-return below.
  const cardRefs = useSelectedCardScroll(selectedListingId);

  // Issue #1210: clamp sub-minimum/non-finite radii up to minimum.
  const effectiveRadius = snapRadiusKm(radiusKm);

  const hasPropertyFilters = hasActiveSchoolPropertyFilters(filters);

  const handleClearPropertyFilters = useCallback(() => {
    if (!onFiltersChange) return;
    onFiltersChange(clearSchoolPropertyFilters(filters));
  }, [filters, onFiltersChange]);

  // Derive display values.
  const areaLabel = selectedArea?.areaLabel ?? null;
  const groupId = urlState.groupId ?? null;

  // Detect missing school coordinates — legacy rows may have null at runtime despite number type.
  const hasMissingCoords =
    selectedSchool != null &&
    ((selectedSchool.latitude as unknown) == null || (selectedSchool.longitude as unknown) == null);

  // Issue #1974 — compute distance once per listing, then sort ascending so the
  // visible card order matches "nearest to school first" instead of server order
  // (created_at DESC). Listings without usable coordinates sort last. Declared
  // before the early loading-skeleton return to preserve hook-call order.
  const sortedListingsWithDistance = useMemo(
    () => sortListingsBySchoolDistance(listings, selectedSchool),
    [listings, selectedSchool],
  );

  // Loading skeleton — shown when either dimension is still resolving on cold load.
  if (!selectedArea || !selectedSchool) {
    return (
      <>
        <PanelHeader
          title="Find homes near a school"
          journey={journey}
          onStartOver={onStartOver}
          onBack={onBack}
          backLabel={selectedArea?.areaLabel ?? undefined}
          activeContextChips={activeContextChips}
        />
        <div className="space-y-3 p-4" data-testid="combined-loading-skeleton">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-lg border border-border p-3">
              <Skeleton className="w-full h-40 rounded-lg mb-3" />
              <Skeleton className="h-4 w-2/3 mb-2" />
              <Skeleton className="h-3 w-1/3 mb-2" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <PanelHeader
        title="Find homes near a school"
        journey={journey}
        onStartOver={onStartOver}
        onBack={onBack}
        backLabel={selectedArea?.areaLabel ?? undefined}
        activeContextChips={activeContextChips}
        actions={<SchoolFiltersSheet filtersContent={filtersContent} testId="combined-filters-trigger" />}
      />

      {/* Issue #2762 PR-B — desktop-reskin only (per locked OQ1). SchoolFiltersSheet above is
          UNCHANGED either way. Mobile (isDesktopReskin=false): byte-identical to before. */}
      {isDesktop && (
        <CompactFilterBar
          accent="schools"
          groups={schoolFilterBarGroups}
          overflowOnly={schoolFilterBarOverflow}
          testIdPrefix="combined-filter-toolbar"
        />
      )}

      {/* Single continuous scroll region (school-results-polish): only the PanelHeader
          stays pinned. Summary band, radius chips, result heading and listings scroll
          together as one column — no nested scroll trap — while the left map stays
          stable. Mirrors SchoolSelectedPanel; this combined panel is what the canonical
          school-first URL (areaKey + schoolId both set) actually renders. */}
      <div className="flex-1 overflow-y-auto" data-testid="combined-selected-scroll">
      {/* Ink-navy school summary band */}
      <SchoolSummaryBand
        school={selectedSchool}
        listings={listings}
        intent={intent}
        groupId={groupId}
        areaLabel={areaLabel}
        onChangeSchool={onClearSchool}
      />

      {/* Issue #1261 — anonymous school-radius listing set is from the PUBLIC endpoint. */}

      <SchoolRadiusListings
        variant="combined"
        school={selectedSchool}
        areaLabel={areaLabel}
        listings={listings}
        sortedListingsWithDistance={sortedListingsWithDistance}
        isLoadingListings={isLoadingListings}
        isFetching={isFetching}
        hasMissingCoords={hasMissingCoords}
        hasPropertyFilters={hasPropertyFilters}
        effectiveRadius={effectiveRadius}
        onRadiusChange={onRadiusChange}
        onClearSchool={onClearSchool}
        onClearPropertyFilters={handleClearPropertyFilters}
        intent={intent}
        isAuthenticated={isAuthenticated}
        selectedListingId={selectedListingId}
        onSelectListing={onSelectListing}
        onHoverListing={onHoverListing}
        cardRefs={cardRefs}
      />
      </div>
    </>
  );
}
