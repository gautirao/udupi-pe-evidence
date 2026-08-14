import React from 'react';
import {
  X,
  Sprout,
  AlertCircle,
  SlidersHorizontal,
  ArrowLeft,
  ArrowRight,
  Check,
  Layers,
  MapPin,
  Route,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import type { AgriMapListingItem } from '@/hooks/useAgriMapListings';
import { useAgriDestinations } from '@/hooks/useRegionalAreaGroups';
import type { CumulativeDistanceTier } from '@/hooks/useRegionalAreaGroups';
import { AgriFiltersPanel } from './AgriFiltersPanel';
import type { AgriFilterValues } from './AgriFiltersPanel';
import { landCategoryLabel, waterSourceLabel } from './agriFilterOptions';
import type { DiscoverIntent } from '@/hooks/useDiscoverUrlState';
import { formatPrice } from '@/lib/formatters';
import { PanelColumn } from './_shared';

// ─── Types ────────────────────────────────────────────────────────────────────

const BEARING_LABELS: Record<string, string> = {
  N: 'North',
  E: 'East',
  S: 'South',
  W: 'West',
  NE: 'North-east',
  NW: 'North-west',
  SE: 'South-east',
  SW: 'South-west',
};

const FRAUNCES = "font-['Fraunces',_ui-serif,_Georgia,_serif]";

interface AgriGroupSelectedPanelProps {
  groupLabel: string;
  /**
   * Issue #2151 PR C (C-F4) — retained for caller compatibility (DiscoverRightPanel still passes
   * it through) but no longer drives the Level-2 towns list or hero stats, which now come from
   * server-supplied destination buckets (see useAgriDestinations). Still meaningful once a
   * specific locality is selected — see AgriGroupLocalityPanel.
   */
  listings: AgriMapListingItem[] | null;
  /** Issue #2151 PR C (C-F4) — vestigial; see `listings` doc above. */
  listingCount: number;
  /** Issue #2151 PR C (C-F4) — folded into the combined loading/error state alongside the new destinations fetch; no longer the sole source of truth for this panel's body state. */
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onClear: () => void;
  /**
   * Issue #1480 — retained in interface for caller compatibility (DiscoverRightPanel still passes
   * it through); not called at Level-2 (towns-only view). Level-3 (AgriGroupLocalityPanel)
   * uses it after locality drill-down.
   */
  onSelectListing: (id: string) => void;
  /** Issue #1445 — selected cumulative distance tier for chip row. Null when none. */
  selectedMaxKm: number | null;
  /** Issue #1445 — available distance tiers for chip row. Undefined = no chip row. */
  availableMaxDistances: CumulativeDistanceTier[] | undefined;
  /** Issue #1445 — called when user selects a distance tier chip. */
  onSetMaxKm: (km: 10 | 25 | 50 | 100) => void;
  /**
   * Issue #1464 — called when user clicks a locality group to drill in.
   * Issue #2151 PR C (C-F1/C-F4) — called with the destination's stable areas.area_key (from the
   * server-supplied destination bucket), NOT display text. Consumers write this value straight
   * into the URL via the agricultural URL domain's `setLocality`, which now treats it as canonical.
   */
  onSelectLocality?: (areaKey: string) => void;
  /** Issue #1457 — whether the current user is authenticated (unlocks price filter). Default false. */
  isAuthenticated?: boolean;
  /** Issue #1457 — currently active acreage min filter (from URL). */
  agriAcresMin?: number;
  /** Issue #1457 — currently active acreage max filter (from URL). */
  agriAcresMax?: number;
  /** Issue #1457 — currently active price min filter in rupees (from URL). */
  agriPriceMin?: number;
  /** Issue #1457 — currently active price max filter in rupees (from URL). */
  agriPriceMax?: number;
  /** Issue #1457 — called when user clicks Apply Filters. */
  onApplyFilters?: (filters: AgriFilterValues) => void;
  /** Issue #1457 — called when user clicks Clear Filters. */
  onClearFilters?: () => void;
  /** Issue #1458 — active land category filter from URL. */
  agriLandCategory?: string | null;
  /** Issue #1458 — active farmhouse available tri-state filter from URL. */
  agriFarmhouseAvailable?: boolean | null;
  /** Issue #1458 — active fencing done tri-state filter from URL. */
  agriFencingDone?: boolean | null;
  /** Issue #1458 — active water source filter from URL. */
  agriWaterSource?: string | null;
  /** Issue #1494 — current buy/rent intent for copy and badge display. Default 'buy'. */
  intent?: DiscoverIntent;
  /** Issue #1460 — true when backend capped the result set. */
  truncated?: boolean;
  /** Issue #1460 — the cap limit applied by the backend (e.g. 250). */
  limit?: number;
  /** Issue #1771 — human-readable city label for the hero breadcrumb (e.g. "Udupi"). */
  cityLabel?: string;
  /**
   * Issue #2151 PR C (code-reviewer finding) — canonical city slug (e.g. "udupi") used to fetch
   * server-supplied destination buckets via useAgriDestinations. Distinct from `cityLabel`, which
   * is a display-only label and must never be used to derive the fetch key (a multi-word label
   * like "Sri Ganganagar" would lowercase to "sri ganganagar", which never matches the backend's
   * slug lookup and silently yields an empty destinations: [] instead of a real result).
   */
  citySlug?: string;
  /** Issue #1771 — corridor group name for the hero title (e.g. "N towards Brahmavar"). */
  corridorName?: string | null;
  /** Issue #1771 — corridor direction code (e.g. "N") for the breadcrumb + summary band. */
  directionCode?: string | null;
}

// ─── Skeleton row ─────────────────────────────────────────────────────────────

function ListingSkeleton() {
  return (
    <div
      data-testid="agri-group-listing-skeleton"
      className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5"
    >
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      <Skeleton className="h-4 w-4 rounded-full shrink-0" />
    </div>
  );
}

// ─── Panel ─────────────────────────────────────────────────────────────────────

export function AgriGroupSelectedPanel({
  groupLabel,
  listings,
  listingCount,
  isLoading,
  isError,
  onRetry,
  onClear,
  onSelectListing,
  selectedMaxKm,
  availableMaxDistances,
  onSetMaxKm,
  onSelectLocality,
  isAuthenticated = false,
  agriAcresMin,
  agriAcresMax,
  agriPriceMin,
  agriPriceMax,
  onApplyFilters = () => {},
  onClearFilters = () => {},
  agriLandCategory = null,
  agriFarmhouseAvailable = null,
  agriFencingDone = null,
  agriWaterSource = null,
  intent = 'buy',
  truncated,
  limit,
  cityLabel,
  citySlug,
  corridorName = null,
  directionCode = null,
}: AgriGroupSelectedPanelProps) {
  // Sort distance tiers ascending by maxKm for consistent display order.
  const sortedTiers = availableMaxDistances
    ? [...availableMaxDistances].sort((a, b) => a.maxKm - b.maxKm)
    : [];

  // ── Issue #2151 PR C (C-F4) — server-supplied destination buckets ──────────────────────────
  // Replaces the old client-side `item.locality ?? item.areaKey` grouping over fetched parcels
  // (deleted here — see #1464/#1486 history in git blame for the removed logic). Towns/localities,
  // their parcel counts, and their acreage totals are now precomputed server-side aggregates from
  // GET /api/discover/agri-destinations, not derived from the `listings` prop.
  //
  // City input: `citySlug` is the canonical slug threaded down from DiscoverRightPanel (which owns
  // it via the `city` prop). Deliberately NOT using useDiscoverNav() here even though it's the
  // repo's normal city-access pattern for panels (SchoolsInAreaPanel/SchoolBrowsePanel/
  // GuidedEntryPanel) — it throws outside a DiscoverProvider, which would crash existing
  // out-of-scope tests that render this panel standalone.
  const citySlugForDestinations = (citySlug ?? '').trim().toLowerCase();
  const listingPurposeForDestinations = intent === 'rent' ? 'rent' : 'sale';
  const {
    destinations,
    isLoading: isLoadingDestinations,
    isError: isDestinationsError,
    isNotYetPromoted,
    refetch: refetchDestinations,
  } = useAgriDestinations(citySlugForDestinations, directionCode, selectedMaxKm, listingPurposeForDestinations);

  // C-F6: five distinct body states. `isNotYetPromoted` (503 AGRI_DESTINATIONS_NOT_YET_PROMOTED)
  // is carved out first — it must never collapse into the generic retryable-error state, and it
  // takes priority over a stale `isLoading`/`isError` prop from the (now Level-3-only) listings
  // fetch. `isLoading`/`isError` props are folded in so this panel still reacts to the listings
  // fetch's own transient states (e.g. a race on first mount) without introducing a second,
  // independent source of truth for what "loading"/"error" means.
  const showLoading = isLoading || isLoadingDestinations;
  const showNotYetPromoted = !showLoading && isNotYetPromoted;
  const showGenericError = !showLoading && !showNotYetPromoted && (isError || isDestinationsError);

  // Total acreage across all destination buckets (2dp, trailing zeros dropped for whole numbers).
  const totalAcres = React.useMemo(() => {
    const values = destinations
      .map((d) => d.parcelAcreage)
      .filter((v): v is number => v != null);
    if (values.length === 0) return null;
    return Math.round(values.reduce((sum, v) => sum + v, 0) * 100) / 100;
  }, [destinations]);

  // Total parcel count across all destination buckets — replaces the `listingCount` prop (which
  // reflected the old whole-tier listings fetch) as the hero/summary-band figure.
  const totalParcels = React.useMemo(
    () => destinations.reduce((sum, d) => sum + d.parcelCount, 0),
    [destinations],
  );

  const formatAcres = (acres: number): string =>
    acres % 1 === 0 ? `${acres}` : acres.toFixed(2);

  // ── Active advanced-filter summary (count + chips) ─────────────────────────────
  // "Advanced" = the hidden drawer filters only. Distance/maxKm, region, direction
  // and Buy/Rent intent are explicitly EXCLUDED — distance stays visible on the main
  // panel via the chip row above, so it must not be counted as a hidden filter.
  // Each chip clears just its own filter by re-applying the current values with that
  // field reset (onApplyFilters merges over existing URL state in MapDiscovery).
  const activeFilterChips = React.useMemo(() => {
    // Current advanced-filter values reconstructed from props, so a per-chip clear
    // re-applies everything else untouched.
    const current: AgriFilterValues = {
      agriAcresMin,
      agriAcresMax,
      agriPriceMin,
      agriPriceMax,
      agriLandCategory,
      agriFarmhouseAvailable,
      agriFencingDone,
      agriWaterSource,
    };
    const chips: { key: string; label: string; clear: () => void }[] = [];

    // Acreage range — 1 chip if either bound is set.
    if (agriAcresMin != null || agriAcresMax != null) {
      const label =
        agriAcresMin != null && agriAcresMax != null
          ? `${agriAcresMin}–${agriAcresMax} acres`
          : agriAcresMin != null
            ? `${agriAcresMin}+ acres`
            : `Up to ${agriAcresMax} acres`;
      chips.push({
        key: 'acreage',
        label,
        clear: () => onApplyFilters({ ...current, agriAcresMin: undefined, agriAcresMax: undefined }),
      });
    }

    // Price range — 1 chip if either bound is set (only reachable when authenticated).
    if (agriPriceMin != null || agriPriceMax != null) {
      const label =
        agriPriceMin != null && agriPriceMax != null
          ? `${formatPrice(agriPriceMin)} – ${formatPrice(agriPriceMax)}`
          : agriPriceMin != null
            ? `${formatPrice(agriPriceMin)}+`
            : `Up to ${formatPrice(agriPriceMax!)}`;
      chips.push({
        key: 'price',
        label,
        clear: () => onApplyFilters({ ...current, agriPriceMin: undefined, agriPriceMax: undefined }),
      });
    }

    // Land category — 1 chip when set (null = "All" default, not counted).
    if (agriLandCategory != null) {
      chips.push({
        key: 'landCategory',
        label: `Land category: ${landCategoryLabel(agriLandCategory)}`,
        clear: () => onApplyFilters({ ...current, agriLandCategory: null }),
      });
    }

    // Farmhouse available — 1 chip when set (null = "Any" default, not counted).
    if (agriFarmhouseAvailable != null) {
      chips.push({
        key: 'farmhouse',
        label: agriFarmhouseAvailable ? 'Farmhouse available' : 'No farmhouse',
        clear: () => onApplyFilters({ ...current, agriFarmhouseAvailable: null }),
      });
    }

    // Fencing done — 1 chip when set (null = "Any" default, not counted).
    if (agriFencingDone != null) {
      chips.push({
        key: 'fencing',
        label: agriFencingDone ? 'Fencing done' : 'No fencing',
        clear: () => onApplyFilters({ ...current, agriFencingDone: null }),
      });
    }

    // Water source — 1 chip when set (null = "Any" default, not counted).
    if (agriWaterSource != null) {
      chips.push({
        key: 'waterSource',
        label: waterSourceLabel(agriWaterSource),
        clear: () => onApplyFilters({ ...current, agriWaterSource: null }),
      });
    }

    return chips;
  }, [
    agriAcresMin,
    agriAcresMax,
    agriPriceMin,
    agriPriceMax,
    agriLandCategory,
    agriFarmhouseAvailable,
    agriFencingDone,
    agriWaterSource,
    onApplyFilters,
  ]);

  const activeFilterCount = activeFilterChips.length;

  const hasActiveFilters =
    agriAcresMin != null || agriAcresMax != null || agriPriceMin != null || agriPriceMax != null
    || agriLandCategory != null || agriFarmhouseAvailable != null || agriFencingDone != null || agriWaterSource != null;

  const displayCity = cityLabel && cityLabel.length > 0 ? cityLabel : 'this city';
  const bearing = directionCode ? (BEARING_LABELS[directionCode] ?? directionCode) : null;
  const heroTitle = corridorName ?? groupLabel;
  const maxTierKm = sortedTiers.length > 0 ? sortedTiers[sortedTiers.length - 1].maxKm : null;
  const townCount = destinations.length;
  const saleWord = listingPurposeForDestinations;

  return (
    <div
      data-testid="agri-group-selected-panel"
      className="flex flex-col h-full bg-muted/20 overflow-y-auto"
    >
      <PanelColumn className="w-full px-4 pb-6 pt-4 space-y-4">
        {/* ── Back to directions ─────────────────────────────────────────────── */}
        <button
          type="button"
          onClick={onClear}
          data-testid="agri-group-selected-clear"
          aria-label="Clear selected region"
          className="flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Back to directions
        </button>

        {/* ── Dark navy corridor hero (mock parity, Issue #1771) ─────────────── */}
        <div
          data-testid="agri-group-summary-band"
          data-variant="navy-hero"
          className="rounded-xl border border-slate-800 bg-[#0F172A] p-5 shadow-lg text-white"
        >
          <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-400">
            <span>Discover {displayCity}</span>
            <span className="text-slate-600">›</span>
            <span>Agricultural land</span>
            {bearing && (
              <>
                <span className="text-slate-600">›</span>
                <span className="text-white">{bearing}</span>
              </>
            )}
          </div>

          <div className="flex items-start gap-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-evergreen text-white">
              <Layers className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Direction / Corridor
              </span>
              <h2
                data-testid="agri-group-selected-label"
                className={cn(FRAUNCES, 'mt-0.5 text-xl sm:text-2xl font-semibold leading-tight tracking-tight text-white')}
              >
                {heroTitle}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-300">
                {maxTierKm != null
                  ? `Agricultural land up to ${maxTierKm} km ${bearing ? `${bearing.toLowerCase()} of` : 'from'} ${displayCity} — parcels grouped by town and distance.`
                  : `Agricultural land ${bearing ? `${bearing.toLowerCase()} of` : 'near'} ${displayCity} — parcels grouped by town and distance.`}
              </p>
            </div>
          </div>

          {!showLoading && !showGenericError && !showNotYetPromoted && (
            <div className="mt-5 grid grid-cols-3 border-t border-slate-800 pt-4">
              <div className="flex min-w-0 flex-col" data-testid="agri-group-listing-count">
                <span className="font-mono text-xl font-bold leading-none tracking-tight tabular-nums text-white">
                  {totalParcels}
                </span>
                <span className="mt-1.5 text-xs text-slate-400">
                  {totalParcels === 1 ? 'parcel' : 'parcels'}
                </span>
              </div>
              <div className="flex min-w-0 flex-col border-l border-slate-800 pl-4">
                <span className="font-mono text-xl font-bold leading-none tracking-tight tabular-nums text-white">
                  {townCount}
                </span>
                <span className="mt-1.5 text-xs text-slate-400">
                  {townCount === 1 ? 'town' : 'towns'}
                </span>
              </div>
              <div className="flex min-w-0 flex-col border-l border-slate-800 pl-4">
                <span className="font-mono text-xl font-bold leading-none tracking-tight tabular-nums text-evergreen">
                  {totalAcres != null ? formatAcres(totalAcres) : '—'}
                </span>
                <span className="mt-1.5 text-xs text-slate-400">acres</span>
              </div>
            </div>
          )}
        </div>

        {/* ── Distance from city + filters trigger ───────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <Route className="h-3.5 w-3.5 text-evergreen" aria-hidden="true" />
              Distance from city
            </p>

            {/* Filters drawer trigger — icon + label + active-filter count so the
                button itself signals that hidden advanced filters are applied. */}
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs h-7 px-2 shrink-0"
                  data-testid="agri-filters-trigger"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span
                      data-testid="agri-filters-count"
                      aria-label={`${activeFilterCount} active filters`}
                      className="rounded-full bg-evergreen text-evergreen-foreground text-[10px] font-semibold px-1.5 py-0.5 leading-none"
                    >
                      {activeFilterCount}
                    </span>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-80 p-0 overflow-y-auto">
                <SheetHeader className="sr-only">
                  <SheetTitle>Agricultural land filters</SheetTitle>
                </SheetHeader>
                <AgriFiltersPanel
                  acresMin={agriAcresMin}
                  acresMax={agriAcresMax}
                  priceMinRupees={agriPriceMin}
                  priceMaxRupees={agriPriceMax}
                  isAuthenticated={isAuthenticated}
                  onApply={onApplyFilters}
                  onClear={onClearFilters}
                  agriLandCategory={agriLandCategory}
                  agriFarmhouseAvailable={agriFarmhouseAvailable}
                  agriFencingDone={agriFencingDone}
                  agriWaterSource={agriWaterSource}
                />
              </SheetContent>
            </Sheet>
          </div>

          {/* ── Distance chips (Issue #1445) — counts + check on selected ─────── */}
          {sortedTiers.length > 0 && (
            <div>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Distance tiers">
                {sortedTiers.map((tier) => {
                  const isSelected = selectedMaxKm === tier.maxKm;
                  return (
                    <button
                      key={tier.maxKm}
                      type="button"
                      data-testid={`distance-chip-${tier.maxKm}`}
                      onClick={() => onSetMaxKm(tier.maxKm)}
                      aria-pressed={isSelected}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        isSelected
                          ? 'border-evergreen bg-evergreen text-evergreen-foreground shadow-sm'
                          : 'border-border bg-card text-muted-foreground hover:border-evergreen/50 hover:text-foreground',
                      )}
                    >
                      {isSelected && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                      {tier.distanceLabel}
                      <span
                        className={cn(
                          'font-mono text-xs font-bold tabular-nums',
                          isSelected ? 'text-evergreen-foreground/80' : 'text-muted-foreground/70',
                        )}
                      >
                        {tier.listingCount}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Includes parcels at closer distances too.
              </p>
            </div>
          )}

          {/* ── Active advanced-filter chips ─────────────────────────────────── */}
          {/* Shown below the distance row so the user can see (and individually
              clear) which hidden drawer filters are on. */}
          {activeFilterCount > 0 && (
            <div
              data-testid="agri-active-filters"
              className="flex flex-wrap items-center gap-1.5"
            >
              {activeFilterChips.map((chip) => (
                <span
                  key={chip.key}
                  data-testid="agri-active-filter-chip"
                  className="inline-flex items-center gap-1 rounded-full bg-evergreen-tint text-evergreen px-2 py-0.5 text-xs font-medium"
                >
                  {chip.label}
                  <button
                    type="button"
                    onClick={chip.clear}
                    data-testid={`agri-active-filter-remove-${chip.key}`}
                    aria-label={`Remove ${chip.label} filter`}
                    className="rounded-full hover:bg-evergreen/20 flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="h-2.5 w-2.5" aria-hidden="true" />
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={onClearFilters}
                data-testid="agri-active-filters-clear-all"
                className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline transition-colors ml-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        {/* ── Body — C-F6: five distinct states ───────────────────────────────── */}
        {showLoading ? (
          // State 1: loading
          <div className="flex flex-col gap-2" aria-busy="true">
            <ListingSkeleton />
            <ListingSkeleton />
            <ListingSkeleton />
          </div>
        ) : showNotYetPromoted ? (
          // State 5: reference model unavailable (503 AGRI_DESTINATIONS_NOT_YET_PROMOTED).
          // Deliberately distinct from the generic error state below: this is NOT
          // shopper-retryable (a Retry button would be misleading — retrying hits the same
          // 503 until an operator re-promotes the city), and it must NOT read as an empty
          // result (there's a real reason no data can be shown, not "zero matches").
          <div
            data-testid="agri-group-not-promoted-state"
            className="flex flex-col items-center justify-center p-6 gap-3 text-center"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <AlertCircle className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
            </div>
            <p className="text-sm text-muted-foreground">
              Agricultural listings for this area aren&apos;t set up yet. Please check back soon.
            </p>
            <button
              type="button"
              data-testid="agri-group-back-btn"
              className="text-sm text-muted-foreground hover:text-foreground underline-offset-2 hover:underline transition-colors"
              onClick={onClear}
            >
              ← Back to group list
            </button>
          </div>
        ) : showGenericError ? (
          // State 4: retryable error (generic/network).
          <div
            data-testid="agri-group-error-state"
            className="flex flex-col items-center justify-center p-6 gap-3 text-center"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-7 w-7 text-destructive" aria-hidden="true" />
            </div>
            <p className="text-sm text-muted-foreground">
              Could not load listings for this region.
            </p>
            <Button
              variant="outline"
              size="sm"
              data-testid="agri-group-retry-btn"
              onClick={() => {
                onRetry();
                refetchDestinations();
              }}
            >
              Retry
            </Button>
            <button
              type="button"
              data-testid="agri-group-back-btn"
              className="text-sm text-muted-foreground hover:text-foreground underline-offset-2 hover:underline transition-colors"
              onClick={onClear}
            >
              ← Back to group list
            </button>
          </div>
        ) : destinations.length === 0 ? (
          // States 2/3: no destinations in scope vs. destination empty under active filters.
          <div
            data-testid={hasActiveFilters ? 'agri-filtered-empty-state' : 'agri-group-empty-state'}
            className="flex flex-col items-center justify-center p-6 gap-3 text-center"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-evergreen-tint">
              <Sprout
                className="h-7 w-7 text-evergreen/60"
                aria-hidden="true"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {hasActiveFilters
                ? 'No agricultural listings match the selected filters.'
                : `No agricultural land for ${saleWord} in this region`}
            </p>
            <button
              type="button"
              data-testid="agri-group-back-btn"
              className="text-sm text-muted-foreground hover:text-foreground underline-offset-2 hover:underline transition-colors"
              onClick={onClear}
            >
              ← Back to group list
            </button>
          </div>
        ) : (
          // Success: destination buckets available.
          <>
            {/* ── Pale green summary band (mock parity, Issue #1771) ──────────── */}
            <div
              data-testid="agri-group-count-band"
              className="flex items-start gap-3 rounded-xl border border-evergreen/20 bg-evergreen-tint px-4 py-3.5"
            >
              <span className="font-mono text-2xl font-bold leading-none tracking-tight tabular-nums text-evergreen mt-0.5">
                {totalParcels}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  Agri {totalParcels === 1 ? 'parcel' : 'parcels'} for {saleWord} · grouped into{' '}
                  {townCount} {townCount === 1 ? 'town' : 'towns'}
                </p>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground tabular-nums">
                  {totalAcres != null ? `${totalAcres.toFixed(2)} acres total · ` : ''}
                  {selectedMaxKm != null ? `within ${selectedMaxKm} km` : 'all distances'}
                  {directionCode ? ` ${directionCode}` : ''}
                </p>
              </div>
            </div>

            {/* ── Towns section ──────────────────────────────────────────────── */}
            <div>
              <div className="mb-2.5 flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 text-evergreen" aria-hidden="true" />
                  Towns{bearing ? ` in ${bearing}` : ' in this corridor'}
                </p>
                <span className="text-xs font-medium text-muted-foreground">
                  {townCount} {townCount === 1 ? 'town' : 'towns'}
                </span>
              </div>
              <div
                data-testid="agri-group-listings-list"
                className="flex flex-col gap-3"
              >
                {/* Display order: server-returned order is preserved as-is (no client resort).
                    AgriDestinationPort already returns buckets ordered by distance/bearing from
                    the city origin, which is the correct navigational order for this list — no
                    client-side re-sort is needed or attempted. */}
                {destinations.map((bucket) => {
                  const roundedAcreage =
                    bucket.parcelAcreage != null ? Math.round(bucket.parcelAcreage * 100) / 100 : null;

                  return (
                    <div key={bucket.areaKey} data-testid="agri-group-locality-group">
                      {/* Town card — clicking drills into that town's parcels (mock parity) */}
                      <button
                        type="button"
                        data-testid="agri-group-locality-btn"
                        aria-label={`View ${bucket.displayName} parcels`}
                        onClick={() => onSelectLocality?.(bucket.areaKey)}
                        className="group w-full flex items-center gap-3.5 rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-evergreen/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {/* Location icon block */}
                        <span
                          aria-hidden="true"
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-evergreen/20 bg-evergreen-tint text-evergreen"
                        >
                          <MapPin className="h-5 w-5" />
                        </span>
                        <div className="flex-1 min-w-0">
                          <span className="block truncate text-[15px] font-semibold text-foreground">
                            {bucket.displayName}
                          </span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            <span className="font-semibold text-foreground">
                              {bucket.parcelCount}{' '}
                              {bucket.parcelCount === 1 ? 'parcel' : 'parcels'}
                            </span>
                            {roundedAcreage !== null && (
                              <span data-testid="agri-group-locality-acreage">
                                {' '}·{' '}
                                {roundedAcreage % 1 === 0
                                  ? `${roundedAcreage} acres total`
                                  : `${roundedAcreage.toFixed(2)} acres total`}
                              </span>
                            )}
                          </span>
                        </div>
                        <span
                          aria-hidden="true"
                          className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-evergreen transition-colors group-hover:text-evergreen/80"
                        >
                          View parcels
                          <ArrowRight className="h-3.5 w-3.5" />
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* Issue #1460 — non-blocking truncation notice, rendered only when backend capped results. */}
        {truncated && (
          <p className="text-xs text-muted-foreground pt-2 border-t border-border">
            Showing first {limit} plots. Zoom in or choose a smaller region to narrow results.
          </p>
        )}
      </PanelColumn>
    </div>
  );
}
