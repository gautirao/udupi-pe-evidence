/**
 * AgriGroupLocalityPanel — Issue #1464
 *
 * Renders the listings for a single locality/town within an agri-group-selected
 * region. Activated when the user clicks a locality group row in AgriGroupSelectedPanel.
 *
 * Displays:
 *   - Header: "<localityName> — N agricultural properties"
 *   - Close button (calls onClose, which clears the locality URL param via REPLACE)
 *   - Loading skeleton / error+retry states
 *   - Sorted listing rows (id ascending — stable, deterministic)
 */

import React from 'react';
import { ArrowLeft, Sprout, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { AgriMapListingItem } from '@/hooks/useAgriMapListings';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgriGroupLocalityPanelProps {
  localityName: string;
  listings: AgriMapListingItem[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onSelectListing: (id: string) => void;
  onClose: () => void;
}

// ─── Skeleton row ─────────────────────────────────────────────────────────────

function ListingSkeleton() {
  return (
    <div
      data-testid="agri-locality-listing-skeleton"
      className="rounded-lg border border-border p-3 space-y-2 mx-4"
    >
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-3 w-1/3" />
    </div>
  );
}

// ─── Panel ─────────────────────────────────────────────────────────────────────

export function AgriGroupLocalityPanel({
  localityName,
  listings,
  isLoading,
  isError,
  onRetry,
  onSelectListing,
  onClose,
}: AgriGroupLocalityPanelProps) {
  // Sort by id ascending — stable, deterministic order across renders.
  // Spread first to avoid mutating the prop array.
  const sortedListings = [...listings].sort((a, b) => a.id.localeCompare(b.id));

  const count = sortedListings.length;

  return (
    <div
      data-testid="agri-group-locality-panel"
      className="flex flex-col h-full"
    >
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <button
          type="button"
          aria-label="Back to locality groups"
          data-testid="agri-locality-close-btn"
          onClick={onClose}
          className="rounded-full p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <div className="flex-1 min-w-0">
          <p
            data-testid="agri-locality-name"
            className="text-sm font-semibold text-foreground truncate"
          >
            {localityName}
          </p>
          {!isLoading && !isError && (
            <p
              data-testid="agri-locality-count"
              className="text-xs text-muted-foreground"
            >
              {count} agricultural {count === 1 ? 'property' : 'properties'}
            </p>
          )}
        </div>
        <Sprout
          className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0"
          aria-hidden="true"
        />
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex flex-col gap-3 py-4" aria-busy="true">
            <ListingSkeleton />
            <ListingSkeleton />
            <ListingSkeleton />
          </div>
        ) : isError ? (
          <div
            data-testid="agri-locality-error-state"
            className="flex flex-col items-center justify-center h-full p-6 gap-3 text-center"
          >
            <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              Could not load listings for this locality.
            </p>
            <Button
              variant="outline"
              size="sm"
              data-testid="agri-locality-retry-btn"
              onClick={onRetry}
            >
              Retry
            </Button>
            <button
              type="button"
              data-testid="agri-locality-back-btn"
              className="text-sm text-muted-foreground hover:text-foreground underline-offset-2 hover:underline transition-colors"
              onClick={onClose}
            >
              ← Back to all localities
            </button>
          </div>
        ) : sortedListings.length === 0 ? (
          <div
            data-testid="agri-locality-empty-state"
            className="flex flex-col items-center justify-center h-full p-6 gap-3 text-center"
          >
            <Sprout className="h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              No listings found for {localityName}
            </p>
            <button
              type="button"
              data-testid="agri-locality-back-btn"
              className="text-sm text-muted-foreground hover:text-foreground underline-offset-2 hover:underline transition-colors"
              onClick={onClose}
            >
              ← Back to all localities
            </button>
          </div>
        ) : (
          <div
            data-testid="agri-locality-listings-list"
            className="divide-y divide-border"
          >
            {sortedListings.map((item) => (
              <div
                key={item.id}
                data-testid="agri-locality-listing-row"
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
                  {item.title ?? item.locality ?? item.areaKey ?? item.id}
                </p>
                {item.landArea != null && item.landAreaUnit && (
                  <p
                    className="text-xs text-green-700 dark:text-green-400 mt-0.5"
                    data-testid="agri-locality-land-area"
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
