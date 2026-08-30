import { useCallback, useMemo } from 'react';
import { ActiveContextChips } from '@/components/discover/ActiveContextChips';
import { MapFilters } from '@/components/map/MapFilters';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { DiscoverNavContextValue } from '@/features/discover/context/types';
import type { DiscoverUrlActions } from '@/hooks/useDiscoverUrlState';

export interface UseDiscoverFilterChromeControllerParams {
  nav: DiscoverNavContextValue;
  actions: DiscoverUrlActions;
  filters: PropertyFilters;
  setFilters: (next: PropertyFilters) => void;
  handleFiltersChange: (next: PropertyFilters) => void;
  selectedSchool: SchoolResult | null;
  onSchoolSelect: (school: SchoolResult) => void;
  schoolBoardFilter: string[];
  onSchoolBoardFilterChange: (boards: string[]) => void;
  city: string;
  effectiveSelectedArea: AreaPoint | null;
  trendsAreaKeys: string[] | undefined;
  isFetching: boolean;
}

/**
 * Issue #2142 (correction pass) — the Discover page's FILTER CHROME: the two
 * rendered filter surfaces (the active-context chip row and the MapFilters
 * panel) plus the one command that is not a plain `handleFiltersChange`
 * passthrough (`Clear all`).
 *
 * These are ReactNode-producing derivations, which is why this file is `.tsx`
 * and why they are NOT surface-builder output: `activeContextChips` is
 * memoised specifically so its identity only changes when a filter dimension
 * actually changes — a builder would re-create the element every render and
 * re-render DiscoverRightPanel's whole subtree.
 *
 * SOLE OWNER of issue #1854's atomic "Clear all": local `filters` state is
 * cleared directly (never via handleFiltersChange, which would re-arm the
 * 300 ms debounced URL write) and the URL is cleared in ONE atomic REPLACE.
 * Splitting those two lines apart is what caused the original revive-`q` bug.
 */
export function useDiscoverFilterChromeController({
  nav,
  actions,
  filters,
  setFilters,
  handleFiltersChange,
  selectedSchool,
  onSchoolSelect,
  schoolBoardFilter,
  onSchoolBoardFilterChange,
  city,
  effectiveSelectedArea,
  trendsAreaKeys,
  isFetching,
}: UseDiscoverFilterChromeControllerParams) {
  // Issue #1854 — "Clear all" previously composed handleFiltersChange({}) (which
  // schedules a 300 ms-debounced setFiltersLive URL write) with a separate immediate
  // setSearchQuery('') write. Both writes close over the SAME pre-click URL snapshot
  // (react-router's useSearchParams setter is not a functional-setState queue), so the
  // immediate `q` clear lands first, then the still-pending debounced filters write
  // fires ~300 ms later against its stale snapshot and silently revives the old `q`.
  // actions.clearAllFiltersAndSearch() does both in a single atomic REPLACE, and
  // cancels any in-flight setFiltersLive/setSearchQuery timers first so nothing can
  // race in afterward. Local `filters` state is cleared directly (not via
  // handleFiltersChange, which would re-arm the debounced URL write). Journey, scope,
  // areaKey/schoolId, and the map camera are untouched (design §9: "Clear all drops all
  // filter+q keys but keeps city, journey, and scope keys").
  const handleClearAllFiltersAndSearch = useCallback(() => {
    setFilters({});
    actions.clearAllFiltersAndSearch();
  }, [setFilters, actions]);

  // activeContextChips is memoised so its identity only changes when a relevant
  // dimension actually changes — prevents unnecessary re-renders of DiscoverRightPanel.
  const activeContextChips = useMemo(
    () => (
      <ActiveContextChips
        // Issue #1824 S4 — KNOWN, INTENTIONAL split-brain: chips read
        // nav.q (URL-side debounce), NOT debouncedSearch (which drives
        // the badge + map markers via useDiscoverSearchState). Do NOT unify.
        searchQuery={nav.q}
        onClearSearch={() => actions.setSearchQuery('')}
        filters={{
          ...filters,
          // Issue #1132 — board/category filters are written directly to URL by
          // onClearBoard/onClearCategory (via actions) without going through
          // setFilters, so local `filters` state can lag behind. Always pass the
          // URL-authoritative values here so ActiveContextChips renders the correct
          // chip set without a useEffect sync (which caused an infinite re-render
          // loop because nav.filters.boardFilters is a new array ref each render).
          boardFilters: nav.filters.boardFilters,
          categoryFilters: nav.filters.categoryFilters,
          dateFrom: filters.dateFrom
            ? typeof filters.dateFrom === 'string'
              ? filters.dateFrom
              : filters.dateFrom.toISOString().slice(0, 10)
            : undefined,
          dateTo: filters.dateTo
            ? typeof filters.dateTo === 'string'
              ? filters.dateTo
              : filters.dateTo.toISOString().slice(0, 10)
            : undefined,
        }}
        onClearPropertyType={() =>
          handleFiltersChange({ ...filters, propertyTypes: undefined })
        }
        onClearBhk={() =>
          handleFiltersChange({ ...filters, bedrooms: undefined })
        }
        onClearPrice={() =>
          handleFiltersChange({ ...filters, priceMin: undefined, priceMax: undefined })
        }
        onClearBoard={(board) => {
          const next = (nav.filters.boardFilters ?? []).filter(
            (b) => b.toLowerCase() !== board.toLowerCase(),
          );
          actions.setBoardFilters(next);
        }}
        onClearCategory={(category) => {
          const next = (nav.filters.categoryFilters ?? []).filter(
            (c) => c.toLowerCase() !== category.toLowerCase(),
          );
          actions.setCategoryFilters(next);
        }}
        onClearSeller={() =>
          handleFiltersChange({ ...filters, sellerTypes: undefined })
        }
        onClearDateRange={() =>
          handleFiltersChange({ ...filters, dateFrom: undefined, dateTo: undefined })
        }
        onClearBoolean={(key) =>
          handleFiltersChange({ ...filters, [key]: undefined })
        }
        onClearAll={handleClearAllFiltersAndSearch}
      />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nav.q, nav.filters.boardFilters, nav.filters.categoryFilters, filters, actions, handleClearAllFiltersAndSearch],
  );

  const filtersContent = (
    <MapFilters
      filters={filters} onFiltersChange={handleFiltersChange}
      selectedSchool={selectedSchool} onSchoolSelect={onSchoolSelect}
      schoolBoardFilter={schoolBoardFilter} onSchoolBoardFilterChange={onSchoolBoardFilterChange}
      city={city}
      trendsAreaKeys={effectiveSelectedArea ? [effectiveSelectedArea.areaKey] : trendsAreaKeys}
      isFetching={isFetching}
    />
  );

  return { handleClearAllFiltersAndSearch, activeContextChips, filtersContent };
}
