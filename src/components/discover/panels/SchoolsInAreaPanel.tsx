import { useEffect, useMemo, useRef, useState } from 'react';
import { GraduationCap, ChevronDown, AlertTriangle } from 'lucide-react';
import { DEFAULT_SCHOOL_RADIUS_KM } from '@/constants/discover';
import { useSchoolsByArea } from '@/hooks/useSchoolsByArea';
import { useDiscoverUrlState } from '@/hooks/useDiscoverUrlState';
import { useDiscoverAreas } from '@/hooks/useDiscoverAreas';
import { PanelHeader } from '../PanelHeader';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { SchoolResult } from '@/hooks/useSchoolSearch';

interface SchoolsInAreaPanelProps {
  journey: 'area-first' | 'school-first';
  onStartOver: () => void;
  /**
   * When provided, renders a Back chevron in the panel header.
   * Used by school-first Level 1 to step back to Level 0 (school-browse).
   * Issue #1143 AC3.
   */
  onBack?: () => void;
  /**
   * When provided by MapDiscovery (the single useSchoolsByArea owner), the panel
   * uses this array directly and skips its own hook call to avoid a duplicate request.
   * Omit when using the panel standalone (e.g. in tests or outside MapDiscovery).
   */
  schools?: SchoolResult[];
  /** Whether the parent-owned schools query is loading. Only used when `schools` prop is provided. */
  schoolsLoading?: boolean;
  /**
   * Whether the parent-owned schools query errored. Only used when `schools` prop is provided.
   * When true, the panel renders a named error state with a Retry button.
   * Mirrors the `schoolsLoading` prop channel — should be wired from MapDiscovery's
   * useSchoolsByArea result (Issue #1144).
   */
  schoolsError?: boolean;
  /**
   * Callback to retry the parent-owned query. Called when the Retry button is clicked
   * and `schoolsError` is true. When omitted, the Retry button is a no-op in prop mode.
   */
  onSchoolsRetry?: () => void;
  /**
   * Issue #1170 — forward-looking prop intended to give the Retry button loading
   * feedback (AC3) while a parent-owned schools refetch is in flight (prop mode).
   * Currently UNWIRED in production: no parent forwards it yet, mirroring the dormant
   * #1144 schoolsError/onSchoolsRetry channel. When #1144 wires schoolsError/onSchoolsRetry
   * (e.g. from MapDiscovery's useSchoolsByArea result), it should also thread schoolsFetching
   * so the Retry loading feedback is live in prop mode.
   */
  schoolsFetching?: boolean;
  /**
   * Issue #1157 Option (i) — area-first select handler. When provided (area-first
   * school-picking sub-step), clicking a school card calls this with the school id
   * instead of the internal setSchoolJourney path. The parent
   * (MapDiscovery.handleSelectSchoolById) calls setSchoolParams, which sets schoolId +
   * drops schoolPicking WITHOUT flipping journey → area-school-combined.
   * When omitted (school-first), the existing internal setSchoolJourney path runs
   * unchanged (journey flips to school-first). Exactly one path runs per click.
   */
  onSelectSchool?: (schoolId: string) => void;
  /** Active context chips rendered in the panel header (mirrors SchoolSelectedPanel). */
  activeContextChips?: React.ReactNode;
}

const BOARD_OPTIONS = ['CBSE', 'ICSE', 'State', 'International'];
const CATEGORY_OPTIONS = [
  { value: 'primary', label: 'Primary' },
  { value: 'secondary', label: 'Secondary' },
  { value: 'higher_secondary', label: 'Higher Secondary' },
];

export function SchoolsInAreaPanel({ journey, onStartOver, onBack, schools: schoolsProp, schoolsLoading: schoolsLoadingProp, schoolsError: schoolsErrorProp, onSchoolsRetry, schoolsFetching: schoolsFetchingProp, onSelectSchool, activeContextChips }: SchoolsInAreaPanelProps) {
  const [urlState, urlActions] = useDiscoverUrlState();
  const { data: areasData } = useDiscoverAreas(urlState.city);
  const areas = areasData?.areas ?? [];

  // Get areaLabel from cached areas
  const selectedArea = useMemo(
    () => areas.find((a) => a.areaKey === urlState.areaKey),
    [areas, urlState.areaKey],
  );
  const areaLabel = selectedArea?.name || urlState.areaKey?.split('|').pop() || 'Area';

  // When MapDiscovery passes schools as a prop, skip the internal hook call to avoid
  // a duplicate request. The hook is still called (Rules of Hooks require unconditional calls)
  // but is disabled via `enabled: false` when the prop is provided.
  const {
    data,
    isLoading: hookLoading,
    isError: hookIsError,
    refetch: hookRefetch,
    isFetching: hookFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useSchoolsByArea(
    // Disable internal fetch when parent owns the data
    schoolsProp !== undefined ? null : urlState.areaKey,
    urlState.filters.boardFilters || [],
    urlState.filters.categoryFilters || [],
  );

  const isLoading = schoolsProp !== undefined ? (schoolsLoadingProp ?? false) : hookLoading;
  // isError: when parent owns the query, use the schoolsError prop if provided;
  // otherwise fall back to the internal hook's error state (standalone / test mode).
  const isError = schoolsProp !== undefined ? (schoolsErrorProp ?? false) : hookIsError;
  // Issue #1204 — a user-initiated retry must keep the error block + Retry button mounted
  // (in its loading state) while the retry is in flight. In prop mode the parent-owned
  // useSchoolsByArea reverts status error→pending on a no-data refetch, so isError flips
  // FALSE and isLoading flips TRUE; without this latch the error block unmounts and the
  // bare skeleton wins, making the #1170 'Retrying…' affordance unreachable in production.
  //
  // The latch is a pure UI flag derived from existing state + the Retry click. It does NOT
  // initiate any fetch — handleRetry fires exactly one refetch per click; the settle effect
  // below only RESETS the flag. No timer, no polling, no auto-retry, no loop.
  const [retryInFlight, setRetryInFlight] = useState(false);
  // Tracks whether the latched retry has actually been observed in flight yet. The query
  // status flip (error→pending) is asynchronous relative to the click, so we must not clear
  // the latch before the fetch has even started — otherwise the latch evaporates in the
  // render between the click and the in-flight signal, and the skeleton wins.
  const retrySeenInFlightRef = useRef(false);

  // inFlightSignal — true while the (non-paginating) schools query is fetching. Same
  // exclusion as before: a "Load more" pagination fetch (isFetchingNextPage) is NOT a retry.
  const inFlightSignal =
    schoolsProp !== undefined
      ? (schoolsFetchingProp ?? false)
      : hookFetching && !isFetchingNextPage;

  // handleRetry: latch first (so the error block + loading affordance stay mounted across
  // the error→pending status flip), then fire exactly one refetch. In prop mode delegate to
  // the parent's retry callback (no-op if absent); standalone uses the internal hook refetch.
  const handleRetry = () => {
    retrySeenInFlightRef.current = false;
    setRetryInFlight(true);
    if (schoolsProp !== undefined) {
      // Parent owns the query — call parent's retry if wired; otherwise no-op.
      onSchoolsRetry?.();
    } else {
      hookRefetch();
    }
  };

  // Latch lifecycle (UI-flag only — never triggers a fetch, so no auto-retry, no loop):
  //   1. Once the fetch is observed in flight, mark it seen.
  //   2. Clear the latch only after it has been seen in flight AND fetching has settled
  //      (success OR fresh error). This survives the click→in-flight async gap.
  useEffect(() => {
    if (!retryInFlight) return;
    if (inFlightSignal) {
      retrySeenInFlightRef.current = true;
    } else if (retrySeenInFlightRef.current) {
      setRetryInFlight(false);
    }
  }, [retryInFlight, inFlightSignal]);

  // Issue #1170 (AC3) — retry-action loading feedback. True only while a user-initiated
  // retry is genuinely in flight (latched + the query is still fetching). Disabling the
  // button while in flight also prevents a double-fire on rapid clicks.
  const isRetrying = retryInFlight && inFlightSignal;

  // Issue #1204 — render-precedence: while a user-initiated retry is in flight, keep showing
  // the error block (so its loading affordance stays mounted) instead of dropping to the
  // skeleton, even though the underlying query has transiently reverted to error=false /
  // loading=true. Genuine initial load (latch false) is unaffected.
  const showErrorBlock = isRetrying || (isError && !isLoading);
  // Suppress the skeleton while the retry-loading error block is mounted.
  const showSkeleton = isLoading && !isRetrying;

  // Flatten pages into single school list — use prop when available
  const schools = useMemo(() => {
    if (schoolsProp !== undefined) return schoolsProp;
    return data?.pages.flatMap((page) => page.schools) || [];
  }, [schoolsProp, data]);

  // Handler to toggle board filter
  const handleBoardToggle = (board: string) => {
    const next = (urlState.filters.boardFilters || []).includes(board)
      ? (urlState.filters.boardFilters || []).filter((b) => b !== board)
      : [...(urlState.filters.boardFilters || []), board];

    urlActions.setFiltersLive({
      ...urlState.filters,
      boardFilters: next,
    });
  };

  // Handler to toggle category filter
  const handleCategoryToggle = (category: string) => {
    const next = (urlState.filters.categoryFilters || []).includes(category)
      ? (urlState.filters.categoryFilters || []).filter((c) => c !== category)
      : [...(urlState.filters.categoryFilters || []), category];

    urlActions.setFiltersLive({
      ...urlState.filters,
      categoryFilters: next,
    });
  };

  // Handler for selecting a school.
  // Issue #1160 cycle-2: must call setSchoolJourney (not setSchoolParams) so that
  // areaKey is resolved and written to the URL in the same atomic push.
  // setSchoolParams only writes schoolId + radiusKm; setSchoolJourney additionally
  // writes journey='school-first', lat/lon/zoom, and resolves areaKey via
  // (1) school.areaKey or (2) bbox containment fallback against the cached areas.
  const handleSelectSchool = (school: SchoolResult) => {
    // Issue #1157 Option (i): area-first sub-step delegates to the parent, which sets
    // schoolId + drops schoolPicking WITHOUT flipping journey → area-school-combined.
    // Branch cleanly — never run both this and the internal setSchoolJourney path.
    if (onSelectSchool) {
      onSelectSchool(school.id);
      return;
    }
    urlActions.setSchoolJourney({
      schoolId: school.id,
      radiusKm: DEFAULT_SCHOOL_RADIUS_KM,
      lat: school.latitude,
      lon: school.longitude,
      // Use the current viewport zoom if available; fall back to 14 (school-journey default).
      zoom: urlState.viewport?.zoom ?? 14,
      areaKey: school.areaKey,
    });
  };

  // Handler to clear filters
  const handleClearFilters = () => {
    urlActions.setFiltersLive({
      ...urlState.filters,
      boardFilters: [],
      categoryFilters: [],
    });
  };

  // Handler to pick different area
  const handlePickDifferentArea = () => {
    urlActions.clearAreaContext();
  };

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Header */}
      <PanelHeader
        title={`Schools in ${areaLabel}`}
        journey={journey}
        onStartOver={onStartOver}
        onBack={onBack}
        subtitle="Choose a school to view nearby homes"
        activeContextChips={activeContextChips}
      />

      {/* Board Filter Chips */}
      <div className="px-4 py-3 border-b flex flex-wrap gap-2">
        {BOARD_OPTIONS.map((board) => {
          const isSelected = (urlState.filters.boardFilters || []).includes(board);
          return (
            <button
              key={board}
              onClick={() => handleBoardToggle(board)}
              data-testid={`board-chip-${board.toLowerCase()}`}
              aria-pressed={isSelected}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                isSelected
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border text-foreground hover:bg-muted/50'
              }`}
            >
              {board}
            </button>
          );
        })}
      </div>

      {/* Category Filter Chips */}
      <div className="px-4 py-3 border-b flex flex-wrap gap-2">
        {CATEGORY_OPTIONS.map(({ value, label }) => {
          const isSelected = (urlState.filters.categoryFilters || []).includes(value);
          return (
            <button
              key={value}
              onClick={() => handleCategoryToggle(value)}
              data-testid={`category-chip-${value}`}
              aria-pressed={isSelected}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                isSelected
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border text-foreground hover:bg-muted/50'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* School List or Empty State */}
      <div className="flex-1 overflow-y-auto">
        {showSkeleton && (
          <div className="p-4 space-y-3">
            {Array(5).fill(0).map((_, i) => (
              <div key={i} className="p-3 rounded-lg space-y-2">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        )}

        {schools.length > 0 && (
          <div className="space-y-2 p-4">
            {schools.map((school) => (
              <div
                key={school.id}
                onClick={() => handleSelectSchool(school)}
                data-testid="school-card"
                className="p-3 bg-card border border-border rounded-lg cursor-pointer hover:bg-muted/50 hover:shadow-md transition-all"
              >
                <div className="flex gap-3">
                  <GraduationCap className="w-6 h-6 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground truncate">{school.name}</h3>
                    <p className="text-sm text-muted-foreground truncate">{school.address}</p>
                    <div className="text-xs text-muted-foreground mt-1 flex gap-2 flex-wrap">
                      {(school.board || school.boardType) && (
                        <span>{school.board || school.boardType}</span>
                      )}
                      {school.schoolCategory && (
                        <>
                          <span>·</span>
                          <span className="capitalize">
                            {school.schoolCategory.replace('_', ' ')}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {hasNextPage && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="w-full mt-4"
              >
                {isFetchingNextPage ? 'Loading...' : 'Load more schools'}
              </Button>
            )}
          </div>
        )}

        {showErrorBlock && (
          <div
            role="alert"
            data-testid="schools-error-state"
            className="flex flex-col items-center justify-center h-full px-6 py-12 text-center"
          >
            <AlertTriangle className="w-12 h-12 text-destructive mb-3" />
            <h3 className="text-lg font-semibold text-foreground">Could not load schools</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-6">
              Please check your connection and try again.
            </p>
            <button
              onClick={handleRetry}
              disabled={isRetrying}
              aria-busy={isRetrying}
              data-testid="schools-error-retry"
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium disabled:opacity-60 disabled:pointer-events-none"
            >
              {isRetrying ? 'Retrying…' : 'Retry'}
            </button>
          </div>
        )}

        {schools.length === 0 && !showSkeleton && !showErrorBlock && (
          <div className="flex flex-col items-center justify-center h-full px-6 py-12 text-center">
            <GraduationCap className="w-12 h-12 text-muted-foreground mb-3" />
            <h3 className="text-lg font-semibold text-foreground">No schools found</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-6">
              Try adjusting your filters or pick a different area
            </p>
            <div className="flex flex-col gap-2 w-full max-w-xs">
              <button
                onClick={handleClearFilters}
                data-testid="empty-state-no-schools-clear-filters"
                className="px-4 py-2 border border-border text-foreground rounded-lg hover:bg-muted/50 text-sm font-medium"
              >
                Clear filters
              </button>
              <button
                onClick={handlePickDifferentArea}
                data-testid="empty-state-no-schools-pick-area"
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium"
              >
                Pick a different area
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
