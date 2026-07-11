/**
 * AreaGroupResultsPanel
 *
 * Issue #1597 — group-results state for the area-first Discover journey.
 *
 * Renders the server-filtered list of all listings across a selected group's
 * child areas. Entered via the "View all {count} properties across {groupName}"
 * CTA in AreaGroupSelectedPanel. URL: journey=area-first&groupId=X&groupResults=1.
 *
 * States handled:
 *   - Loading: skeletons
 *   - Error: AlertCircle + retry CTA
 *   - Empty (no area_keys in group): honest "No areas" empty state
 *   - Empty (area_keys present but 0 results): "No listings found" empty state
 *   - Success: listing cards (reuses DiscoverCityListingItem shape)
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ChevronLeft, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { DiscoverListingItem } from '@/hooks/useDiscoverListings';
import type { DiscoverIntent } from '@/hooks/useDiscoverUrlState';
import { formatPrice } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { StartOverButton } from '../StartOverButton';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AreaGroupResultsPanelProps {
  /** The selected area-group whose child areas are being shown. */
  group: AreaGroup;
  /** Human-readable city label (e.g. "Udupi"). */
  cityLabel: string;
  /** Listings from the server-filtered group query. */
  listings: DiscoverListingItem[];
  /** True while the listings fetch is in-flight. */
  isLoading: boolean;
  /** True when the listings fetch encountered an error. */
  isError: boolean;
  /** Total count from the paginated backend response (may exceed listings.length). */
  totalElements?: number;
  /** Retry callback for the error state. */
  onRetry?: () => void;
  /** Back → return to the group drill-down (area-groups-landing with groupId). */
  onBack?: () => void;
  /** Start over → return to guided entry. */
  onStartOver?: () => void;
  /** Buy/rent intent — for display context. */
  intent?: DiscoverIntent;
  /** Currently selected listing id (for card highlight sync). */
  selectedListingId?: string | null;
  /** Card click — surfaces listing id to parent for map marker sync. */
  onSelectListing?: (id: string) => void;
  /** Card hover/focus — surfaces listing id to parent for marker highlight. */
  onHoverListing?: (id: string | null) => void;
  /**
   * True when the viewer is authenticated. Controls whether the preview banner is shown.
   * Anonymous viewers see an honest "showing a preview" nudge when the teaser is smaller
   * than the full group count. Authenticated viewers never see the banner.
   */
  isAuthenticated?: boolean;
  /**
   * Full listing count for the group — sum of member-area listingCounts from the
   * discover-areas response. Used to determine whether the anon teaser is showing
   * fewer results than the real total. When undefined (areas not yet loaded), the
   * preview banner is suppressed (no count = no nudge).
   */
  totalGroupCount?: number;
}

// ─── Skeleton row ─────────────────────────────────────────────────────────────

function ListingSkeleton() {
  return (
    <div className="flex gap-3 px-4 py-3 border-b border-border/60" aria-hidden="true">
      <Skeleton className="h-16 w-20 shrink-0 rounded-lg" />
      <div className="flex-1 space-y-2 py-0.5">
        <Skeleton className="h-3.5 w-2/3 rounded" />
        <Skeleton className="h-3 w-1/2 rounded" />
        <Skeleton className="h-3 w-1/3 rounded" />
      </div>
    </div>
  );
}

// ─── Listing card ─────────────────────────────────────────────────────────────

function ListingCard({
  listing,
  isSelected,
  onSelect,
  onHover,
}: {
  listing: DiscoverListingItem;
  isSelected: boolean;
  onSelect?: (id: string) => void;
  onHover?: (id: string | null) => void;
}) {
  const priceLabel = listing.pricePaise != null
    ? formatPrice(listing.pricePaise / 100)
    : null;

  const areaLabel = [
    listing.locality,
    listing.propertyType,
  ].filter(Boolean).join(' · ');

  return (
    <button
      type="button"
      data-testid={`group-results-listing-${listing.id}`}
      onClick={() => onSelect?.(listing.id)}
      onMouseEnter={() => onHover?.(listing.id)}
      onMouseLeave={() => onHover?.(null)}
      onFocus={() => onHover?.(listing.id)}
      onBlur={() => onHover?.(null)}
      aria-pressed={isSelected}
      className={cn(
        'w-full flex gap-3 px-4 py-3 text-left border-b border-border/60 transition-colors',
        'hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
        isSelected && 'bg-copper-tint/40 border-l-2 border-l-copper',
      )}
    >
      {listing.heroImageUrl ? (
        <img
          src={listing.heroImageUrl}
          alt=""
          aria-hidden="true"
          className="h-16 w-20 shrink-0 rounded-lg object-cover bg-muted"
        />
      ) : (
        <div className="h-16 w-20 shrink-0 rounded-lg bg-muted flex items-center justify-center" aria-hidden="true">
          <Layers className="h-5 w-5 text-muted-foreground/40" />
        </div>
      )}
      <div className="min-w-0 flex-1 py-0.5">
        {listing.title && (
          <p className="text-sm font-semibold text-foreground line-clamp-1">{listing.title}</p>
        )}
        {areaLabel && (
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{areaLabel}</p>
        )}
        {priceLabel && (
          <p className="mt-1.5 text-sm font-bold text-copper tabular-nums">{priceLabel}</p>
        )}
      </div>
    </button>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export function AreaGroupResultsPanel({
  group,
  cityLabel,
  listings,
  isLoading,
  isError,
  totalElements,
  onRetry,
  onBack,
  onStartOver,
  intent = 'buy',
  selectedListingId = null,
  onSelectListing,
  onHoverListing,
  isAuthenticated = false,
  totalGroupCount,
}: AreaGroupResultsPanelProps) {
  const hasNoAreaKeys = group.area_keys.length === 0;

  // Issue #1597 — anon preview banner:
  // Show ONLY when (1) the viewer is not authenticated, (2) the full group count is known,
  // and (3) the anon teaser shows fewer listings than the full group count.
  // "Showing a preview of {shownCount} properties across {groupName}"
  // "Sign in to view all {totalCount}"
  const showAnonPreviewBanner =
    !isAuthenticated &&
    typeof totalGroupCount === 'number' &&
    totalGroupCount > listings.length;

  return (
    <>
      {/* ── Sticky header ── */}
      <div
        className="sticky top-0 z-20 flex-shrink-0 flex flex-col gap-2 bg-background border-b border-border/50 px-4 pt-3 pb-3"
        data-testid="area-group-results-header"
      >
        {onStartOver && (
          <div className="flex items-center justify-end">
            {/* Issue #1817 (AC8) — a group's results are being viewed, i.e. selection
                deeper than a region, so this site always confirms before resetting. */}
            <StartOverButton
              onStartOver={onStartOver}
              hasSubstantialState
              cityLabel={cityLabel}
              className="h-7 shrink-0 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
            />
          </div>
        )}

        <div className="flex items-start gap-2">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label={`Back to ${group.name}`}
              data-testid="area-group-results-back"
              className="mt-0.5 flex items-center gap-1 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{group.name}</span>
            </button>
          )}
        </div>

        <div>
          <h1 className="font-['Fraunces',_ui-serif,_Georgia,_serif] text-xl font-semibold leading-tight text-foreground">
            {intent === 'rent' ? 'Rentals' : 'Properties'} in {group.name}
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {cityLabel} · all areas in this group
          </p>
        </div>

        {/* Result count band */}
        {!isLoading && !isError && !hasNoAreaKeys && (
          <div
            className="rounded-lg bg-copper-tint/60 px-3 py-1.5"
            aria-live="polite"
            data-testid="area-group-results-count"
          >
            {listings.length === 0 ? (
              <span className="text-xs text-muted-foreground">No listings found in this group</span>
            ) : (
              <span className="text-xs font-semibold text-copper">
                {totalElements != null && totalElements > listings.length
                  ? `Showing ${listings.length} of ${totalElements} listings`
                  : `${listings.length} listing${listings.length === 1 ? '' : 's'}`}
              </span>
            )}
          </div>
        )}

        {/* Issue #1597 — Anon preview banner.
            Shown only when the viewer is not authenticated AND the teaser is smaller than
            the real group total. Copy is intentionally honest about what is being shown. */}
        {showAnonPreviewBanner && !isLoading && !isError && !hasNoAreaKeys && (
          <div
            className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2.5 text-center"
            data-testid="area-group-results-anon-banner"
            role="status"
            aria-live="polite"
          >
            <p className="text-xs text-foreground">
              Showing a preview of{' '}
              <span className="font-semibold">{listings.length}</span>{' '}
              {listings.length === 1 ? 'property' : 'properties'} across{' '}
              <span className="font-semibold">{group.name}</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              <Link
                to="/auth?returnTo=/discover"
                className="font-medium text-primary underline"
                data-testid="area-group-results-anon-signin"
              >
                Sign in to view all {totalGroupCount}
              </Link>
            </p>
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto" data-testid="area-group-results-body">
        {/* Empty areaKeys guard — group has no member areas */}
        {hasNoAreaKeys && (
          <div
            className="flex flex-col items-center justify-center h-full px-6 py-12 text-center"
            data-testid="area-group-results-no-areas"
            role="status"
          >
            <Layers className="mb-3 h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">No areas in this group</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {group.name} has no member areas configured yet.
            </p>
            {onBack && (
              <Button variant="outline" size="sm" className="mt-4" onClick={onBack}>
                Back to group
              </Button>
            )}
          </div>
        )}

        {/* Loading skeletons */}
        {!hasNoAreaKeys && isLoading && (
          <div aria-busy="true" aria-label="Loading listings">
            {[0, 1, 2, 3, 4].map((i) => (
              <ListingSkeleton key={i} />
            ))}
          </div>
        )}

        {/* Error state */}
        {!hasNoAreaKeys && !isLoading && isError && (
          <div
            className="flex flex-col items-center justify-center h-full px-6 py-12 text-center"
            data-testid="area-group-results-error"
            role="alert"
          >
            <AlertCircle className="mb-3 h-8 w-8 text-destructive" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">Could not load listings</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Something went wrong fetching listings for {group.name}.
            </p>
            {onRetry && (
              <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
                Try again
              </Button>
            )}
          </div>
        )}

        {/* Empty results */}
        {!hasNoAreaKeys && !isLoading && !isError && listings.length === 0 && (
          <div
            className="flex flex-col items-center justify-center h-full px-6 py-12 text-center"
            data-testid="area-group-results-empty"
            role="status"
          >
            <Layers className="mb-3 h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">No listings found</p>
            <p className="mt-1 text-xs text-muted-foreground">
              No {intent === 'rent' ? 'rental' : ''} listings currently available across {group.name}.
            </p>
            {onBack && (
              <Button variant="outline" size="sm" className="mt-4" onClick={onBack}>
                Back to areas
              </Button>
            )}
          </div>
        )}

        {/* Listing cards */}
        {!hasNoAreaKeys && !isLoading && !isError && listings.length > 0 && (
          <div role="list" aria-label={`Listings in ${group.name}`}>
            {listings.map((listing) => (
              <div key={listing.id} role="listitem">
                <ListingCard
                  listing={listing}
                  isSelected={listing.id === selectedListingId}
                  onSelect={onSelectListing}
                  onHover={onHoverListing}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
