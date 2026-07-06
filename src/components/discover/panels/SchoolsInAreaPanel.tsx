import { useEffect, useMemo, useRef, useState } from 'react';
import { GraduationCap, AlertTriangle, Search, X, MapPin, ChevronRight, ChevronDown, ArrowRight, Home } from 'lucide-react';
import { DEFAULT_SCHOOL_RADIUS_KM } from '@/constants/discover';
import { useSchoolsByArea } from '@/hooks/useSchoolsByArea';
import { useDiscoverUrlState, type DiscoverIntent } from '@/hooks/useDiscoverUrlState';
import { useDiscoverAreas } from '@/hooks/useDiscoverAreas';
import { PanelHeader } from '../PanelHeader';
import { PanelColumn } from './_shared';
import { SchoolJourneyHero } from './SchoolJourneyHero';
import { prettifyZoneSlug } from '@/components/discover/SchoolRadiusMapOverlay';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { SchoolResult } from '@/hooks/useSchoolSearch';

/** Buy/Rent-aware noun for the homes count — never the vague "listings". */
function homesNoun(intent: DiscoverIntent, n: number): string {
  if (intent === 'rent') return n === 1 ? 'rental available' : 'rentals available';
  return n === 1 ? 'home for sale' : 'homes for sale';
}

/** Title-case a kebab slug for display (e.g. "university-belt" → "University Belt"). */
function prettifySlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Map a raw schoolCategory token (primary/secondary/higher_secondary) to a Level label. */
function levelLabel(category: unknown): string | null {
  if (typeof category !== 'string' || !category) return null;
  return category
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

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
  /**
   * Current buy/rent intent — drives the selected-area summary + section wording
   * ("homes for sale" vs "rentals available"). Default 'buy'. (Issue #1494 parity.)
   */
  intent?: DiscoverIntent;
  /**
   * Count of homes in the selected area for the current Buy/Rent mode, surfaced in the
   * selected-area summary. Sourced from the parent's area-listings query (the same data
   * that powers the homes grid below) so the number matches what the user can see.
   * Null/undefined while loading or unknown — the summary falls back to the area's own
   * listingCount and never fabricates a value.
   */
  homesCount?: number | null;
  /**
   * Content rendered at the bottom of the panel's single scroll surface (after the school
   * list). Used by the wrapper to place the "Homes in {area}" grid inside the SAME scroll
   * container, so the whole right panel scrolls as one page (no nested scrollbars).
   */
  footerSlot?: React.ReactNode;
}

const BOARD_OPTIONS = ['CBSE', 'ICSE', 'State', 'International'];
// Default-collapsed school count — keeps the panel short and the page hierarchy strong.
// A "Show all N schools" affordance reveals the rest (mirrors the design source).
const COLLAPSED_SCHOOLS = 4;
const CATEGORY_OPTIONS = [
  { value: 'primary', label: 'Primary' },
  { value: 'secondary', label: 'Secondary' },
  { value: 'higher_secondary', label: 'Higher Secondary' },
];

export function SchoolsInAreaPanel({ journey, onStartOver, onBack, schools: schoolsProp, schoolsLoading: schoolsLoadingProp, schoolsError: schoolsErrorProp, onSchoolsRetry, schoolsFetching: schoolsFetchingProp, onSelectSchool, activeContextChips, intent = 'buy', homesCount, footerSlot }: SchoolsInAreaPanelProps) {
  const [urlState, urlActions] = useDiscoverUrlState();
  const { data: areasData } = useDiscoverAreas(urlState.city);
  const areas = areasData?.areas ?? [];

  // Get areaLabel from cached areas
  const selectedArea = useMemo(
    () => areas.find((a) => a.areaKey === urlState.areaKey),
    [areas, urlState.areaKey],
  );
  const areaLabel = selectedArea?.name || urlState.areaKey?.split('|').pop() || 'Area';

  // Only the school-first journey gets the redesigned selected-area summary + breadcrumb.
  // The area-first school-picking sub-step (#1157) reuses this panel and must NOT change.
  const isSchoolFirst = journey === 'school-first';

  // Breadcrumb context: City › Zone › Area. City + area are derived from the areaKey
  // (IN|KA|<District>|<Area>); the zone label is the groupId slug, title-cased
  // ("university-belt" → "University Belt"). Nothing here is fabricated.
  const areaKeyParts = (urlState.areaKey || '').split('|');
  const cityLabel = areaKeyParts[2] || prettifySlug(urlState.city || 'Udupi');
  const zoneLabel = urlState.groupId?.trim() ? prettifySlug(urlState.groupId.trim()) : null;

  // Local, client-side school-name search (composes with the server-side board/level
  // filters already applied to `schools`). Keeps filtering scoped to this area's list.
  const [nameQuery, setNameQuery] = useState('');

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

  // Apply the local name search on top of the (server-filtered) school list.
  const visibleSchools = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    if (!q) return schools;
    return schools.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.address || '').toLowerCase().includes(q),
    );
  }, [schools, nameQuery]);

  const boardActive = (urlState.filters.boardFilters || []).length > 0;
  const categoryActive = (urlState.filters.categoryFilters || []).length > 0;
  const filtersActive = boardActive || categoryActive || nameQuery.trim().length > 0;

  // Collapse the school list to the first few by default to keep the page hierarchy strong.
  // School-first only (area-first school-picking sub-step #1157 keeps its full list — no regression).
  // When a search/chip filter is active, show every match (the result set is already narrowed).
  const [showAllSchools, setShowAllSchools] = useState(false);
  const canCollapse = isSchoolFirst && !filtersActive && visibleSchools.length > COLLAPSED_SCHOOLS;
  const shownSchools = !isSchoolFirst || showAllSchools || filtersActive
    ? visibleSchools
    : visibleSchools.slice(0, COLLAPSED_SCHOOLS);

  // Summary metrics — real records only, never fabricated. School count prefers the area's
  // authoritative schoolCount (from useDiscoverAreas); homes count prefers the parent-supplied
  // homesCount (the same listings shown below), falling back to the area's listingCount.
  const summarySchoolCount = selectedArea?.schoolCount ?? schools.length;
  const summaryHomesCount =
    typeof homesCount === 'number' ? homesCount : (selectedArea?.listingCount ?? 0);

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

  // Handler to clear filters — resets board/level chips AND the local name search.
  const handleClearFilters = () => {
    setNameQuery('');
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
      {/* Journey header (sticky). Buy/Rent lives in the left rail; this header carries the
          school-first identity (journey pill), Start over and Back. */}
      <PanelHeader
        title={isSchoolFirst ? 'Find homes near a school' : `Schools in ${areaLabel}`}
        journey={journey}
        onStartOver={onStartOver}
        onBack={onBack}
        backLabel={isSchoolFirst && urlState.groupId ? prettifyZoneSlug(urlState.groupId) : areaLabel}
        activeContextChips={activeContextChips}
      />

      {/* Single scroll surface: selected-area summary → school filters → school list */}
      <div className="flex-1 overflow-y-auto">
        <PanelColumn>
        {/* Selected-area summary (school-first only) — breadcrumb + area title + metrics.
            The area-first school-picking sub-step (#1157) reuses this panel and skips this. */}
        {isSchoolFirst && (
          <div className="m-4">
            {/* Visual-parity polish (cycle 2) — dark-navy hero (mock parity), replacing
                the tinted-card SummaryBandCard. School-first-local component; does not
                touch the shared _shared/SummaryBandCard used by area-first/agri-first. */}
            <SchoolJourneyHero
              dataTestId="selected-area-summary"
              icon={MapPin}
              eyebrowLabel="Schools in area"
              badge={
                <span className="inline-flex items-center rounded-full bg-plum px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-plum-foreground">
                  Selected area
                </span>
              }
              breadcrumb={[
                { key: 'city', label: cityLabel },
                ...(zoneLabel ? [{ key: 'zone', label: zoneLabel }] : []),
                { key: 'area', label: areaLabel, current: true },
              ]}
              title={`Schools in ${areaLabel}`}
              titleTestId="selected-area-summary-title"
              description="Choose a school to see homes within 3, 5 or 10 km."
              stats={[
                {
                  key: 'schools',
                  value: summarySchoolCount,
                  label: summarySchoolCount === 1 ? 'school' : 'schools',
                  testId: 'summary-school-count',
                },
                {
                  key: 'homes',
                  value: summaryHomesCount,
                  label: homesNoun(intent, summaryHomesCount),
                  testId: 'summary-homes-count',
                },
              ]}
            />
          </div>
        )}

        {/* School selection: section title + result count + search + grouped Board/Level chips.
            ReTrends polish — the search + filter chips live inside one calm, smooth-edged
            contained card (mirrors the design source) instead of a bare ruled section. */}
        <div className="space-y-3 px-4 pb-4 pt-2">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              {isSchoolFirst ? `Schools in ${areaLabel}` : 'Filter schools'}
            </h3>
            {/* Mock parity: right-aligned count. Kept as "Showing {n} of {total} schools"
                (rather than the mock's plain "{n} schools") because it also carries the
                live search/filter-match count, which the plain form would drop. */}
            <span className="shrink-0 text-xs text-muted-foreground" data-testid="school-result-count">
              Showing{' '}
              <span className="font-mono font-semibold tabular-nums text-foreground">
                {visibleSchools.length}
              </span>{' '}
              of {schools.length} {schools.length === 1 ? 'school' : 'schools'}
            </span>
          </div>

          {isSchoolFirst && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              Narrow by board or level, then pick a school to filter homes within reach of it.
            </p>
          )}

          {/* Search by school name (client-side, scoped to this area). Rounded pill + soft
              shadow for the premium, contained look in the design source. */}
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              placeholder="Search school name…"
              value={nameQuery}
              onChange={(e) => setNameQuery(e.target.value)}
              className="h-11 rounded-full border-border bg-card pl-10 pr-10 text-sm shadow-xs focus-visible:ring-plum/40"
              data-testid="school-search-input"
              aria-label="Search school name"
            />
            {nameQuery && (
              <button
                type="button"
                onClick={() => setNameQuery('')}
                aria-label="Clear search"
                data-testid="school-search-clear"
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Board + Level filter group — one smooth-edged contained surface */}
          <div className="space-y-3 rounded-2xl border border-border bg-muted/40 p-4">
            {/* Board chips */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Board
              </span>
              <div className="flex flex-wrap gap-2">
                {BOARD_OPTIONS.map((board) => {
                  const isSelected = (urlState.filters.boardFilters || []).includes(board);
                  return (
                    <button
                      key={board}
                      type="button"
                      onClick={() => handleBoardToggle(board)}
                      data-testid={`board-chip-${board.toLowerCase()}`}
                      aria-pressed={isSelected}
                      className={cn(
                        'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                        isSelected
                          ? 'border border-plum bg-plum-tint text-plum shadow-sm'
                          : 'border border-border bg-card text-foreground hover:bg-muted/50',
                      )}
                    >
                      {board}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Level chips */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Level
              </span>
              <div className="flex flex-wrap gap-2">
                {CATEGORY_OPTIONS.map(({ value, label }) => {
                  const isSelected = (urlState.filters.categoryFilters || []).includes(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => handleCategoryToggle(value)}
                      data-testid={`category-chip-${value}`}
                      aria-pressed={isSelected}
                      className={cn(
                        'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                        isSelected
                          ? 'border border-plum bg-plum-tint text-plum shadow-sm'
                          : 'border border-border bg-card text-foreground hover:bg-muted/50',
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Clear filters — surfaced whenever a chip or the search is active */}
            {filtersActive && (
              <button
                type="button"
                onClick={handleClearFilters}
                data-testid="school-clear-filters"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                Clear filters <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
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

        {visibleSchools.length > 0 && (
          <div className="space-y-2.5 p-4">
            {shownSchools.map((school) => {
              const boardText = school.board || school.boardType;
              const level = levelLabel((school as { schoolCategory?: string }).schoolCategory);
              // Homes-nearby is only populated on some endpoints (null on /by-area) — never fake it.
              const nearby = school.nearbyListingCount;
              return (
                <div
                  key={school.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelectSchool(school)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSelectSchool(school);
                    }
                  }}
                  data-testid="school-card"
                  className="group cursor-pointer rounded-xl border border-border bg-card p-4 shadow-xs transition-all hover:-translate-y-0.5 hover:border-plum/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex gap-3">
                    <div className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-plum-tint">
                      <GraduationCap className="h-5 w-5 text-plum" aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="truncate font-semibold text-foreground">{school.name}</h3>
                        <div className="flex flex-none flex-col items-end gap-1">
                          {/* Board chip — dark/ink (mock parity, cycle 2); theme-aware via
                              bg-foreground/text-background instead of a hardcoded slate. */}
                          {boardText && (
                            <span className="whitespace-nowrap rounded-full bg-foreground px-2 py-0.5 text-[11px] font-semibold text-background">
                              {boardText}
                            </span>
                          )}
                          {level && (
                            <span className="whitespace-nowrap rounded-full bg-plum-tint px-2 py-0.5 text-[11px] font-medium text-plum">
                              {level}
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 flex-none text-muted-foreground/70" aria-hidden />
                        <span className="truncate">{school.address}</span>
                      </p>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          {typeof nearby === 'number' && nearby > 0 ? (
                            <>
                              <span className="font-mono font-semibold tabular-nums text-foreground">
                                {nearby}
                              </span>{' '}
                              homes within {DEFAULT_SCHOOL_RADIUS_KM} km
                            </>
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <Home className="h-3.5 w-3.5" aria-hidden />
                              View nearby homes
                            </span>
                          )}
                        </span>
                        <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary transition-colors group-hover:text-copper">
                          View homes <ArrowRight className="h-4 w-4" aria-hidden />
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Collapse / expand the default-shortened list (only when unfiltered) */}
            {canCollapse && (
              <button
                type="button"
                onClick={() => setShowAllSchools((v) => !v)}
                data-testid="schools-show-all-toggle"
                className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-copper"
              >
                {showAllSchools ? 'Show fewer' : `Show all ${visibleSchools.length} schools`}
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${showAllSchools ? 'rotate-180' : ''}`}
                  aria-hidden
                />
              </button>
            )}

            {(showAllSchools || filtersActive) && hasNextPage && !nameQuery && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="mt-4 w-full"
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

        {visibleSchools.length === 0 && !showSkeleton && !showErrorBlock && (
          <div
            data-testid="schools-empty-state"
            className="flex flex-col items-center justify-center px-6 py-12 text-center"
          >
            <GraduationCap className="mb-3 h-12 w-12 text-muted-foreground" aria-hidden />
            <h3 className="text-lg font-semibold text-foreground">
              {filtersActive ? 'No schools match these filters.' : 'No schools found'}
            </h3>
            <p className="mb-6 mt-1 text-sm text-muted-foreground">
              {filtersActive
                ? 'Try another board or level, or clear the filters to see every school in this area.'
                : 'Try a different area to find schools nearby.'}
            </p>
            <div className="flex w-full max-w-xs flex-col gap-2">
              <button
                onClick={handleClearFilters}
                data-testid="empty-state-no-schools-clear-filters"
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50"
              >
                Clear filters
              </button>
              <button
                onClick={handlePickDifferentArea}
                data-testid="empty-state-no-schools-pick-area"
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Pick a different area
              </button>
            </div>
          </div>
        )}
        </PanelColumn>

        {/* Homes section (school-first) renders inside this SAME scroll surface, so the
            whole right panel scrolls as one page — no nested scrollbars. It intentionally
            sits OUTSIDE PanelColumn (full panel width), matching the AreaSelectedPanel
            listing-grid precedent — the reading column applies to the school-browse
            content, not the final results grid. */}
        {footerSlot}
      </div>
    </div>
  );
}
