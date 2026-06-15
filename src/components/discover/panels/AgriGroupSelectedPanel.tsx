import React from 'react';
import { X, Sprout, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { AgriMapListingItem } from '@/hooks/useAgriMapListings';
import type { CumulativeDistanceTier } from '@/hooks/useRegionalAreaGroups';
import { AgriFiltersPanel } from './AgriFiltersPanel';
import type { AgriFilterValues } from './AgriFiltersPanel';
import type { DiscoverIntent } from '@/hooks/useDiscoverUrlState';

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
}

// ─── Skeleton row ─────────────────────────────────────────────────────────────

function ListingSkeleton() {
  return (
    <div
      data-testid="agri-group-listing-skeleton"
      className="rounded-lg border border-border p-3 space-y-2"
    >
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-3 w-1/3" />
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
  return (
    <div
      data-testid="agri-group-selected-panel"
      className="flex flex-col h-full"
    >
      {/* ── Header chip ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <Sprout className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" aria-hidden="true" />
        <span
          data-testid="agri-group-selected-label"
          className="text-sm font-medium text-foreground flex-1 truncate"
        >
          {groupLabel}
        </span>
        <button
          type="button"
          aria-label="Clear selected region"
          data-testid="agri-group-selected-clear"
          onClick={onClear}
          className="rounded-full p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* ── Distance chips (Issue #1445) ─────────────────────────────────────── */}
      {sortedTiers.length > 0 && (
        <div className="px-4 py-2 border-b border-border shrink-0">
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
                  className={[
                    'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isSelected
                      ? 'border-green-500 bg-green-500 text-white'
                      : 'border-border bg-card text-foreground hover:bg-muted/50',
                  ].join(' ')}
                >
                  {tier.distanceLabel}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Includes properties at closer distances too.
          </p>
        </div>
      )}

      {/* ── Filters (Issue #1457) ──────────────────────────────────────────────── */}
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

      {/* ── Aggregate count ──────────────────────────────────────────────────── */}
      {!isLoading && !isError && (
        <div className="px-4 py-2 border-b border-border bg-green-500/5 shrink-0">
          <span
            data-testid="agri-group-listing-count"
            className="text-sm text-muted-foreground"
          >
            {listingCount} agri propert{listingCount === 1 ? 'y' : 'ies'} for {intent === 'rent' ? 'rent' : 'sale'} in this region
          </span>
        </div>
      )}

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex flex-col gap-3 p-4" aria-busy="true">
            <ListingSkeleton />
            <ListingSkeleton />
            <ListingSkeleton />
          </div>
        ) : isError ? (
          <div
            data-testid="agri-group-error-state"
            className="flex flex-col items-center justify-center h-full p-6 gap-3 text-center"
          >
            <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
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
            data-testid={
              (agriAcresMin != null || agriAcresMax != null || agriPriceMin != null || agriPriceMax != null
                || agriLandCategory != null || agriFarmhouseAvailable != null || agriFencingDone != null || agriWaterSource != null)
                ? 'agri-filtered-empty-state'
                : 'agri-group-empty-state'
            }
            className="flex flex-col items-center justify-center h-full p-6 gap-3 text-center"
          >
            <Sprout
              className="h-8 w-8 text-muted-foreground/40"
              aria-hidden="true"
            />
            <p className="text-sm text-muted-foreground">
              {(agriAcresMin != null || agriAcresMax != null || agriPriceMin != null || agriPriceMax != null
                || agriLandCategory != null || agriFarmhouseAvailable != null || agriFencingDone != null || agriWaterSource != null)
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
          <div
            data-testid="agri-group-listings-list"
            className="divide-y divide-border"
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
                  {/* Locality group header — clicking drills into that town's listings */}
                  <button
                    type="button"
                    data-testid="agri-group-locality-btn"
                    aria-label={`View ${localityKey} properties`}
                    onClick={() => onSelectLocality?.(localityKey)}
                    className="w-full flex flex-col px-4 py-2.5 bg-muted/30 hover:bg-muted/60 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-sm font-semibold text-foreground truncate">
                        {localityKey}
                      </span>
                      <span className="text-xs text-muted-foreground shrink-0 ml-2">
                        {groupListings.length}{' '}
                        agricultural{' '}
                        {groupListings.length === 1 ? 'property' : 'properties'}
                      </span>
                    </div>
                    {totalAcreage !== null && (
                      <span
                        data-testid="agri-group-locality-acreage"
                        className="text-xs text-muted-foreground mt-0.5"
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
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
