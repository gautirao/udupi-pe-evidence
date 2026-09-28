import { AlertCircle, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PropertyCard } from '@/components/discover/PropertyCard';
import { AreaZeroResultRecovery } from '@/components/discover/panels/AreaZeroResultRecovery';
import { deriveDiscoverEmptyStateCopy } from '@/components/discover/emptyStateCopy';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import type { DiscoverIntent } from '@/hooks/useDiscoverUrlState';
import type { ResultScope } from '@/features/discover/state/resultScope';

export interface ListingsBodyProps {
  isFetching: boolean;
  isInitialLoading: boolean;
  isLoadingListings?: boolean;
  areaListings?: DiscoverCityListingItem[];
  isListingsError?: boolean;
  onRetryListings?: () => void;

  // Issue #1817 (AC7) / #2018 — empty-state (AreaZeroResultRecovery) inputs.
  hasPropertyFilters: boolean;
  searchQuery: string;
  listingCount: number | null | undefined;
  areaLabel: string;
  resolvedCityLabel: string;
  commercialFromFilters: boolean;
  intentNoun: 'sale' | 'rent';
  multiAreaKeys: string[] | null;
  fallbackAreaKey: string;
  resolvedAreasCity: string;
  filters: PropertyFilters;
  intent?: DiscoverIntent;
  activeScope: ResultScope;
  resultScopeKind: 'AREA' | 'POLYGON' | 'VIEWPORT';
  onRedrawPolygon?: () => void;
  onClearFilters?: () => void;
  onSearchChange?: (value: string) => void;
  /** Already wrapped by the caller with the #2552/#2555 family-override-clearing logic — this component forwards it, it does not re-derive it. */
  onApplyFilters?: (next: PropertyFilters) => void;

  // Issue #1494 / #1606 — intent-aware verified result summary (populated state).
  areaResultSummaryText?: string;
  count: number;
  isViewportScope: boolean;

  // Card grid.
  isAuthenticated?: boolean;
  onNavigateToListing: (listingId: string) => void;
  selectedListingId: string | null;
  hoveredListingId: string | null;
  onSelectListing?: (listingId: string) => void;
  onHoverListing?: (listingId: string | null) => void;
  registerCardRef: (listingId: string) => (node: HTMLDivElement | null) => void;
}

/**
 * Issue #2658 (C3) — extracted verbatim from AreaSelectedPanel.tsx: the
 * listings body's four states (loading skeleton, request-failure error,
 * zero-result recovery, populated grid), plus the populated state's inline
 * stale-results retry banner (Issue #2018 requirement A) and intent-aware
 * verified result summary (Issues #1494/#1606).
 *
 * The empty-state's `onApplyFilters` wrapper (Issues #2552/#2555's family-
 * override-clearing logic, with 4 cycles of review findings behind it) is
 * DELIBERATELY NOT re-derived here — the caller builds it and passes the
 * already-wrapped callback in, so this component's job stays purely
 * presentational/dispatching, matching every other C3 section's contract.
 */
export function ListingsBody({
  isFetching,
  isInitialLoading,
  isLoadingListings,
  areaListings,
  isListingsError,
  onRetryListings,
  hasPropertyFilters,
  searchQuery,
  listingCount,
  areaLabel,
  resolvedCityLabel,
  commercialFromFilters,
  intentNoun,
  multiAreaKeys,
  fallbackAreaKey,
  resolvedAreasCity,
  filters,
  intent,
  activeScope,
  resultScopeKind,
  onRedrawPolygon,
  onClearFilters,
  onSearchChange,
  onApplyFilters,
  areaResultSummaryText,
  count,
  isViewportScope,
  isAuthenticated,
  onNavigateToListing,
  selectedListingId,
  hoveredListingId,
  onSelectListing,
  onHoverListing,
  registerCardRef,
}: ListingsBodyProps) {
  // #2450 copy truth — "homes" is a Residential word. A Commercial selection
  // must not have its zero-result state described as homes, whatever the
  // intent. Computed once here; the source computed it twice (once for the
  // empty-state copy, once for AreaZeroResultRecovery's `noun`) and both
  // call sites below still read it independently, matching that shape.
  const zeroResultNoun = commercialFromFilters ? 'properties' : intentNoun === 'rent' ? 'rentals' : 'homes';

  return (
      <div
        className={cn(
          'transition-opacity duration-150',
          isFetching && !isInitialLoading ? 'pointer-events-none opacity-50' : 'opacity-100',
        )}
      >
        {isLoadingListings ? (
          <div className="space-y-3 p-4">
            {/* a4 — rounded-xl skeleton cards for consistency with PropertyCard corners. */}
            {[0, 1, 2].map((i) => (
              <div key={i} data-testid="listing-skeleton" className="rounded-xl border border-border p-3">
                <Skeleton className="mb-3 h-40 w-full rounded-lg" />
                <Skeleton className="mb-2 h-4 w-2/3" />
                <Skeleton className="mb-2 h-3 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : isListingsError && (!areaListings || areaListings.length === 0) ? (
          // Issue #2018 requirement A — "error is not empty". A settled request
          // failure with nothing to fall back on gets the explicit
          // request-failure state, NEVER the zero-result recovery below.
          <div
            className="m-4 flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-12 text-center"
            data-testid="area-listings-error"
          >
            <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
            <h2 className="text-base font-semibold text-foreground">We could not load these results</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              This is a request failure, not an empty market. Your scope and filters are unchanged.
            </p>
            {onRetryListings && (
              <Button variant="outline" size="sm" onClick={onRetryListings} data-testid="area-listings-error-retry">
                Retry
              </Button>
            )}
          </div>
        ) : !areaListings || areaListings.length === 0 ? (
          (() => {
            // Issue #1817 (AC7) — cause-routed empty state, sourced from the SAME
            // hasPropertyFilters/hasSearch signal the badge's zero-filters/zero-search/
            // zero-empty states use, so the panel and badge never disagree about why
            // the list is empty (design §7).
            const copy = deriveDiscoverEmptyStateCopy({
              hasPropertyFilters,
              hasSearch: !!searchQuery,
              searchQuery,
              n: listingCount ?? null,
              scopeLabel: areaLabel,
              cityLabel: resolvedCityLabel || areaLabel,
              isCityScope: false, // an area is always narrower than its city
              noun: zeroResultNoun,
            });
            const onClearSearch = searchQuery && onSearchChange ? () => onSearchChange('') : undefined;

            // Issue #2018 (slice 1/3) — every scope kind reaches the mock's
            // `EPZero` recovery stack, which says only what is true of the
            // ACTIVE scope (see AreaZeroResultRecovery's `scopeKind` doc).
            return (
              <AreaZeroResultRecovery
                scopeAreaKeys={multiAreaKeys ?? [fallbackAreaKey]}
                fallbackScopeName={areaLabel}
                city={resolvedAreasCity}
                filters={filters}
                intent={intent}
                searchQuery={searchQuery}
                noun={zeroResultNoun}
                cause={copy.cause}
                scopeKind={resultScopeKind}
                resultScope={activeScope}
                onAdjustBoundary={onRedrawPolygon}
                onApplyFilters={onApplyFilters}
                onClearFilters={onClearFilters}
                onClearSearch={onClearSearch}
              />
            );
          })()
        ) : (
          <>
            {isListingsError && (
              // Issue #2018 requirement A — a transient failure AFTER a
              // successful load keeps the last good result set on screen and
              // surfaces the error as an inline banner instead of wiping the
              // cards.
              <div
                className="mx-4 mt-4 flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3"
                data-testid="area-listings-retry-banner"
                aria-live="polite"
              >
                <p className="text-sm text-muted-foreground">
                  Couldn&apos;t refresh these results. Showing the last ones we loaded.
                </p>
                {onRetryListings && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onRetryListings}
                    data-testid="area-listings-retry-banner-btn"
                  >
                    Retry
                  </Button>
                )}
              </div>
            )}
            {/* Intent-aware verified result summary (Issue #1494 / #1606) */}
            {/* a4 — warm evergreen-tint/60 strip instead of near-invisible bg-muted/20 */}
            <div
              className="flex items-center gap-1.5 border-b border-border bg-evergreen-tint/60 px-4 py-2"
              data-testid="area-result-summary"
            >
              <ShieldCheck className="h-4 w-4 shrink-0 text-evergreen" aria-hidden="true" />
              <p className="text-xs font-medium text-foreground" data-testid="area-result-summary-text">
                {areaResultSummaryText ??
                  `${count} verified ${count === 1 ? 'property' : 'properties'} for ${intentNoun}${
                    isViewportScope
                      ? ' in this area'
                      : resultScopeKind === 'POLYGON'
                        ? ' in your drawn area'
                        : ` in ${areaLabel}`
                  }`}
              </p>
            </div>
            {/* Issue #2159 reskin — the desktop 2-column grid target needs the PANEL's own
                width, not the viewport's; see `.area-panel-container` / `.area-listings-grid`
                in src/index.css. Issue #2596 — closes the dead band between controls and
                results (the grid keeps its full side/bottom padding, only loses the
                redundant top inset). */}
            <div className="area-listings-grid grid grid-cols-1 gap-3 px-4 pb-4 pt-2">
              {areaListings.map((listing) => (
                <div key={listing.id} ref={registerCardRef(listing.id)}>
                  <PropertyCard
                    listing={listing}
                    isAuthenticated={isAuthenticated}
                    onNavigate={() => onNavigateToListing(listing.id)}
                    isSelected={selectedListingId === listing.id}
                    isHovered={hoveredListingId === listing.id}
                    onSelect={onSelectListing}
                    onHover={onHoverListing}
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
  );
}
