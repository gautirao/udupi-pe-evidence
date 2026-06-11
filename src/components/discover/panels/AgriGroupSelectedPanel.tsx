import React from 'react';
import { X, Sprout, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { AgriMapListingItem } from '@/hooks/useAgriMapListings';
import type { CumulativeDistanceTier } from '@/hooks/useRegionalAreaGroups';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgriGroupSelectedPanelProps {
  groupLabel: string;
  listings: AgriMapListingItem[] | null;
  listingCount: number;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onClear: () => void;
  onSelectListing: (id: string) => void;
  /** Issue #1445 — selected cumulative distance tier for chip row. Null when none. */
  selectedMaxKm: number | null;
  /** Issue #1445 — available distance tiers for chip row. Undefined = no chip row. */
  availableMaxDistances: CumulativeDistanceTier[] | undefined;
  /** Issue #1445 — called when user selects a distance tier chip. */
  onSetMaxKm: (km: 10 | 25 | 50 | 100) => void;
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
}: AgriGroupSelectedPanelProps) {
  // Sort distance tiers ascending by maxKm for consistent display order.
  const sortedTiers = availableMaxDistances
    ? [...availableMaxDistances].sort((a, b) => a.maxKm - b.maxKm)
    : [];
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
        </div>
      )}

      {/* ── Aggregate count ──────────────────────────────────────────────────── */}
      {!isLoading && !isError && (
        <div className="px-4 py-2 border-b border-border bg-green-500/5 shrink-0">
          <span
            data-testid="agri-group-listing-count"
            className="text-sm text-muted-foreground"
          >
            {listingCount} agri propert{listingCount === 1 ? 'y' : 'ies'} in this region
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
            data-testid="agri-group-empty-state"
            className="flex flex-col items-center justify-center h-full p-6 gap-3 text-center"
          >
            <Sprout
              className="h-8 w-8 text-muted-foreground/40"
              aria-hidden="true"
            />
            <p className="text-sm text-muted-foreground">
              No listings in this region
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
            {listings.map((item) => (
              <div
                key={item.id}
                data-testid="agri-group-listing-row"
                className="px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                role="button"
                tabIndex={0}
                onClick={() => onSelectListing(item.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectListing(item.id);
                  }
                }}
              >
                <p className="text-sm font-medium text-foreground truncate">
                  {item.locality ?? item.areaKey ?? item.id}
                </p>
                {item.landArea != null && item.landAreaUnit && (
                  <p
                    className="text-xs text-green-700 dark:text-green-400 mt-0.5"
                    data-testid="agri-group-land-area"
                  >
                    {item.landArea} {item.landAreaUnit}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
