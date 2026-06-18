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

import React, { useEffect, useRef } from 'react';
import { ArrowLeft, Sprout, AlertCircle, Lock, Maximize2, Check, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatPrice } from '@/lib/formatters';
import {
  LAND_CATEGORY_LABELS,
  WATER_SOURCE_LABELS,
  ROAD_ACCESS_LABELS,
  SOIL_TYPE_LABELS,
  CULTIVATION_STATUS_LABELS,
  OWNERSHIP_TYPE_LABELS,
} from '@/lib/agriFieldLabels';
import type { AgriMapListingItem } from '@/hooks/useAgriMapListings';
import type { DiscoverIntent } from '@/hooks/useDiscoverUrlState';

// Build the agri spec chips for a listing — omit when the value is null OR false
// (null != false: a missing field is unknown, an explicit false is a known "no").
// Issue #1551: extended with new DTO fields (roadAccess, soilType, cultivationStatus,
// ownershipType). The 4-chip cap + "+N more details" overflow pill is applied at the
// call site, NOT here, so chip priority order is meaningful: category first,
// cultivation next (most decision-relevant), then road/soil/water/ownership/booleans.
function agriChips(item: AgriMapListingItem): string[] {
  const chips: string[] = [];
  if (item.landCategory) chips.push(LAND_CATEGORY_LABELS[item.landCategory] ?? item.landCategory);
  if (item.cultivationStatus) {
    chips.push(CULTIVATION_STATUS_LABELS[item.cultivationStatus] ?? item.cultivationStatus);
  }
  if (item.roadAccess) {
    chips.push(ROAD_ACCESS_LABELS[item.roadAccess] ?? item.roadAccess);
  }
  if (item.soilType) {
    chips.push(SOIL_TYPE_LABELS[item.soilType] ?? item.soilType);
  }
  if (item.waterSource && item.waterSource !== 'NOT_AVAILABLE') {
    chips.push(WATER_SOURCE_LABELS[item.waterSource] ?? item.waterSource);
  }
  if (item.ownershipType) {
    chips.push(OWNERSHIP_TYPE_LABELS[item.ownershipType] ?? item.ownershipType);
  }
  if (item.farmhouseAvailable === true) chips.push('Farmhouse');
  if (item.fencingDone === true) chips.push('Fenced');
  return chips;
}

function agriPriceLabel(pricePaise: number | null | undefined): string | null {
  if (pricePaise == null || pricePaise <= 0) return null;
  return formatPrice(Math.round(pricePaise / 100), 'INR');
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgriGroupLocalityPanelProps {
  localityName: string;
  listings: AgriMapListingItem[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onSelectListing: (id: string) => void;
  onClose: () => void;
  /** Issue #1494 — current buy/rent intent for count label. Default 'buy'. */
  intent?: DiscoverIntent;
  /**
   * Issue #1547 — whether the viewer is authenticated. Drives the anon price gate on
   * the agri card rows (anon: "Sign in to view price" with a Lock; never a rupee value).
   * Defaults to false (safest: treats unknown viewers as anonymous).
   */
  isAuthenticated?: boolean;
  /**
   * Issue #1547 — id of the currently selected listing (URL/parent-derived, `listing`
   * URL param). Drives the copper selected card frame + scroll-into-view.
   */
  selectedListingId?: string | null;
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
  intent = 'buy',
  isAuthenticated = false,
  selectedListingId = null,
}: AgriGroupLocalityPanelProps) {
  // Sort by id ascending — stable, deterministic order across renders.
  // Spread first to avoid mutating the prop array.
  const sortedListings = [...listings].sort((a, b) => a.id.localeCompare(b.id));

  const count = sortedListings.length;

  // Issue #1547 — scroll the selected agri card into view when selection is driven from
  // the map (marker→peek path #1466). Guards the missing-ref case (selected id not in the
  // rendered list, e.g. filtered out) so a marker click never crashes or scrolls nowhere.
  const cardRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  useEffect(() => {
    if (!selectedListingId) return;
    const node = cardRefs.current.get(selectedListingId);
    // Guard: scrollIntoView is unavailable in some environments (jsdom) / older browsers.
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedListingId]);

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
              {count} agricultural {count === 1 ? 'property' : 'properties'} for {intent === 'rent' ? 'rent' : 'sale'}
            </p>
          )}
        </div>
        <Sprout
          className="h-4 w-4 text-evergreen shrink-0"
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
            className="grid grid-cols-1 2xl:grid-cols-2 gap-3 p-3"
          >
            {sortedListings.map((item) => {
              const isSelected = selectedListingId === item.id;
              const priceLabel = agriPriceLabel(item.pricePaise);
              const chips = agriChips(item);
              const landArea =
                item.landArea != null && item.landAreaUnit
                  ? `${item.landArea} ${item.landAreaUnit}`
                  : item.computedAreaAcres != null
                    ? `${item.computedAreaAcres.toFixed(2)} acres`
                    : null;
              // Issue #1547 ITEM 1 elevation — RTAgriCard mock:
              // - Cap chips at 4 visible; show copper-tint "+N more details" pill for overflow
              // - Land area as mono-font pill with copper Maximize2 icon on subtle bg (not plain text)
              // - Fact chips: bg-background + border-border (square-ish radius-xs), evergreen check
              // - Footer: border-top → larger mono price (font-mono text-xl) + purpose tag
              // - Card elevation: shadow-sm → shadow-lg + -translate-y-0.5 on hover (CSS group trick)
              const MAX_CHIPS = 4;
              const visibleChips = chips.slice(0, MAX_CHIPS);
              const extraChips = chips.length - visibleChips.length;

              return (
                <div
                  key={item.id}
                  ref={(node) => {
                    if (node) cardRefs.current.set(item.id, node);
                    else cardRefs.current.delete(item.id);
                  }}
                  data-testid="agri-locality-listing-row"
                  data-selected={isSelected ? 'true' : undefined}
                  className={cn(
                    'group block p-3 cursor-pointer scroll-mt-4 rounded-lg border',
                    'transition-[box-shadow,transform,border-color] duration-200',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-copper focus-visible:ring-offset-1',
                    isSelected
                      ? 'border-copper ring-2 ring-copper/[0.18] shadow-lg'
                      : 'border-border shadow-sm hover:shadow-lg hover:-translate-y-0.5',
                  )}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  onClick={() => onSelectListing(item.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectListing(item.id);
                    }
                  }}
                >
                  {/* Title */}
                  <p className="text-base font-bold leading-snug tracking-tight text-foreground truncate">
                    {item.title ?? item.locality ?? item.areaKey ?? item.id}
                  </p>

                  {/* Locality — shown when title exists so they don't duplicate */}
                  {item.locality && item.title && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground mt-1 truncate">
                      <MapPin className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
                      <span className="truncate">{item.locality}</span>
                    </p>
                  )}

                  {/* Land area — mono-font pill with copper Maximize icon on subtle bg (RTAgriCard mock) */}
                  {landArea && (
                    <div className="mt-2">
                      <span
                        className="inline-flex items-center gap-1.5 font-mono text-sm font-semibold text-foreground bg-muted px-2.5 py-1 rounded"
                        data-testid="agri-locality-land-area"
                      >
                        <Maximize2 className="h-3.5 w-3.5 text-copper shrink-0" aria-hidden="true" />
                        {landArea}
                      </span>
                    </div>
                  )}

                  {/* Fact chips — capped at 4; +N overflow pill in copper-tint */}
                  {chips.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {visibleChips.map((chip) => (
                        <span
                          key={chip}
                          className="inline-flex items-center gap-1 rounded bg-background border border-border px-2 py-0.5 text-[11px] font-medium text-foreground"
                        >
                          <Check className="h-3 w-3 text-evergreen shrink-0" aria-hidden="true" />
                          {chip}
                        </span>
                      ))}
                      {extraChips > 0 && (
                        <span className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold bg-copper-tint text-copper-hover dark:text-copper">
                          +{extraChips} more details
                        </span>
                      )}
                    </div>
                  )}

                  {/* Footer: border-top → price (mono, larger) + purpose/type tags */}
                  <div className="mt-3 pt-2.5 border-t border-border">
                    {/* Price row — anon-gated (Issue #1454/#1547): anon never sees a rupee value */}
                    {isAuthenticated ? (
                      priceLabel ? (
                        <p className="font-mono text-xl font-semibold tracking-tight text-foreground tabular-nums">
                          {priceLabel}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">Price on request</p>
                      )
                    ) : (
                      <span
                        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
                        data-testid="agri-locality-price-signin"
                      >
                        <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        Sign in to view price
                      </span>
                    )}
                    {/* Purpose/type tags row */}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold bg-muted text-muted-foreground">
                        Agricultural land
                      </span>
                      {item.listingPurpose != null && (
                        <span
                          className={cn(
                            'inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold',
                            item.listingPurpose === 'rent'
                              ? 'bg-copper-tint text-copper-hover dark:text-copper'
                              : 'bg-evergreen-tint text-evergreen',
                          )}
                        >
                          {item.listingPurpose === 'rent' ? 'For Rent' : 'For Sale'}
                        </span>
                      )}
                      {/* Issue #1551 — compact updated date; omitted when absent */}
                      {item.updatedAt && (
                        <span
                          className="text-[11px] text-muted-foreground"
                          data-testid="agri-locality-updated-at"
                        >
                          Updated{' '}
                          {new Date(item.updatedAt).toLocaleDateString('en-IN', {
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
