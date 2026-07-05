import React from 'react';
import { X, Sprout, AlertCircle, SlidersHorizontal, ChevronLeft, ChevronRight } from 'lucide-react';
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
import type { CumulativeDistanceTier } from '@/hooks/useRegionalAreaGroups';
import { AgriFiltersPanel } from './AgriFiltersPanel';
import type { AgriFilterValues } from './AgriFiltersPanel';
import { landCategoryLabel, waterSourceLabel } from './agriFilterOptions';
import type { DiscoverIntent } from '@/hooks/useDiscoverUrlState';
import { formatPrice } from '@/lib/formatters';
import { PanelColumn, SummaryBandCard } from './_shared';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgriGroupSelectedPanelProps {
  groupLabel: string;
  listings: AgriMapListingItem[] | null;
  listingCount: number;
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
  /** Issue #1464 — called when user clicks a locality group to drill in. */
  onSelectLocality?: (localityKey: string) => void;
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
}: AgriGroupSelectedPanelProps) {
  // Sort distance tiers ascending by maxKm for consistent display order.
  const sortedTiers = availableMaxDistances
    ? [...availableMaxDistances].sort((a, b) => a.maxKm - b.maxKm)
    : [];

  // Issue #1464 — group listings by locality (fallback to areaKey when locality is null).
  // Issue #1486 — SORT 1: count descending; SORT 2: alpha tie-break (locale-aware, case-insensitive).
  const sortedGroups: [string, AgriMapListingItem[]][] = React.useMemo(() => {
    if (!listings || listings.length === 0) return [];
    const groupMap = new Map<string, AgriMapListingItem[]>();
    for (const item of listings) {
      const key = item.locality ?? item.areaKey;
      const existing = groupMap.get(key);
      if (existing) {
        existing.push(item);
      } else {
        groupMap.set(key, [item]);
      }
    }
    return [...groupMap.entries()].sort(([aKey, aListings], [bKey, bListings]) => {
      const countDiff = bListings.length - aListings.length;
      if (countDiff !== 0) return countDiff;
      return aKey.localeCompare(bKey, 'en', { sensitivity: 'base' });
    });
  }, [listings]);

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

  return (
    <div
      data-testid="agri-group-selected-panel"
      className="flex flex-col h-full bg-muted/20"
    >
      {/* ── Selected-corridor summary band (ReTrends evergreen — tinted-card model) ── */}
      <div className="m-4 mb-3 shrink-0">
        <SummaryBandCard
          accent="evergreen"
          icon={Sprout}
          dataTestId="agri-group-summary-band"
          onChange={onClear}
          changeLabel="Change corridor"
          changeAriaLabel="Clear selected region"
          changeTestId="agri-group-selected-clear"
          eyebrow="Agricultural land"
          badge={
            <span className="inline-flex items-center rounded-full border border-evergreen/20 bg-evergreen-tint px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-evergreen">
              {intent === 'rent' ? 'Rent' : 'Buy'}
            </span>
          }
          title={groupLabel}
          titleTestId="agri-group-selected-label"
          stats={
            !isLoading && !isError
              ? [
                  {
                    key: 'listings',
                    value: listingCount,
                    label: `agri propert${listingCount === 1 ? 'y' : 'ies'} for ${intent === 'rent' ? 'rent' : 'sale'} in this region`,
                    testId: 'agri-group-listing-count',
                  },
                ]
              : []
          }
        />
      </div>

      {/* ── Distance + filters controls ──────────────────────────────────────── */}
      <div className="px-4 pb-3 shrink-0 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Search distance
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

        {/* ── Distance chips (Issue #1445) ───────────────────────────────────── */}
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
                      'rounded-full border px-3 py-1.5 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      isSelected
                        ? 'border-evergreen bg-evergreen text-evergreen-foreground shadow-sm'
                        : 'border-border bg-card text-muted-foreground hover:border-evergreen/50 hover:text-foreground',
                    )}
                  >
                    {tier.distanceLabel}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Includes properties at closer distances too.
            </p>
          </div>
        )}

        {/* ── Active advanced-filter chips ─────────────────────────────────────── */}
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

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <PanelColumn>
        {isLoading ? (
          <div className="flex flex-col gap-2 p-4 pt-1" aria-busy="true">
            <ListingSkeleton />
            <ListingSkeleton />
            <ListingSkeleton />
          </div>
        ) : isError ? (
          <div
            data-testid="agri-group-error-state"
            className="flex flex-col items-center justify-center h-full p-6 gap-3 text-center"
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
              onClick={onRetry}
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
        ) : !listings || listings.length === 0 ? (
          <div
            data-testid={hasActiveFilters ? 'agri-filtered-empty-state' : 'agri-group-empty-state'}
            className="flex flex-col items-center justify-center h-full p-6 gap-3 text-center"
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
                : `No agricultural land for ${intent === 'rent' ? 'rent' : 'sale'} in this region`}
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
          <div className="px-4 pb-4 pt-1">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
              Towns in this corridor
            </p>
            <div
              data-testid="agri-group-listings-list"
              className="flex flex-col gap-2"
            >
              {sortedGroups.map(([localityKey, groupListings]) => {
                // Issue #1486 — sum computedAreaAcres; omit line when no listing has a non-null value.
                const acreageValues = groupListings
                  .map((l) => l.computedAreaAcres)
                  .filter((v): v is number => v != null);
                const totalAcreage =
                  acreageValues.length > 0
                    ? acreageValues.reduce((sum, v) => sum + v, 0)
                    : null;

                return (
                  <div key={localityKey} data-testid="agri-group-locality-group">
                    {/* Locality card — clicking drills into that town's listings */}
                    <button
                      type="button"
                      data-testid="agri-group-locality-btn"
                      aria-label={`View ${localityKey} properties`}
                      onClick={() => onSelectLocality?.(localityKey)}
                      className="group w-full flex items-center gap-3 rounded-xl border border-border bg-card p-3.5 text-left transition-all hover:border-evergreen hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between w-full gap-2">
                          <span className="text-sm font-semibold text-foreground truncate">
                            {localityKey}
                          </span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {groupListings.length}{' '}
                            agricultural{' '}
                            {groupListings.length === 1 ? 'property' : 'properties'}
                          </span>
                        </div>
                        {totalAcreage !== null && (
                          <span
                            data-testid="agri-group-locality-acreage"
                            className="mt-1 inline-flex items-center rounded-full bg-evergreen-tint px-2 py-0.5 text-xs font-medium text-evergreen"
                          >
                            {/* Round to 2dp first to absorb float accumulation (e.g. 2.0000000000000004),
                                then check if the rounded value is a whole number. */}
                            {(function () {
                              const rounded = Math.round(totalAcreage * 100) / 100;
                              return rounded % 1 === 0
                                ? `${rounded} acres total`
                                : `${rounded.toFixed(2)} acres total`;
                            })()}
                          </span>
                        )}
                      </div>
                      <ChevronRight
                        className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-evergreen"
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        </PanelColumn>
      </div>

      {/* Issue #1460 — non-blocking truncation notice, rendered only when backend capped results. */}
      {truncated && (
        <p className="text-xs text-muted-foreground py-2 px-4 border-t border-border shrink-0">
          Showing first {limit} plots. Zoom in or choose a smaller region to narrow results.
        </p>
      )}
    </div>
  );
}
