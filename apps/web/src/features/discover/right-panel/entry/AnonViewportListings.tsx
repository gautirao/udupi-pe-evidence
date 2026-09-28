// Issue #2657 C2b — verbatim extraction of the anon "Search this area"
// viewport listings leaf (previously the inline closure
// `renderAnonViewportListings` in components/discover/DiscoverRightPanel.tsx,
// lines 1328-1420 as of C1). Byte-identical render output; only the
// surrounding module boundary (closure -> component with explicit props)
// changed. See DiscoverRightPanel.leafSnapshots2657.test.tsx (C2a) for the
// DOM proof.
import React from 'react';
import { AlertCircle, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PropertyCard } from '@/components/discover/PropertyCard';
import type { AnonViewportListingItem } from '@/lib/anonViewportListing';

export interface AnonViewportListingsProps {
  anonViewportListings: AnonViewportListingItem[];
  anonViewportListingsLoading: boolean;
  isErrorAnonViewport: boolean;
  onRetryAnonViewport?: () => void;
  selectedListingId?: string | null;
  hoveredListingId?: string | null;
  onSelectResultListing?: (id: string) => void;
  onHoverResultListing?: (id: string | null) => void;
  navigate: (to: string) => void;
}

// Issue #2015 — the anon "Search this area" (VIEWPORT scope) reconciled card
// renders PropertyCard directly (no new card component) against the
// band-only `anonViewportListings` set the map's anon-viewport markers
// already consume — same listing identities on both surfaces.
export function AnonViewportListings({
  anonViewportListings,
  anonViewportListingsLoading,
  isErrorAnonViewport,
  onRetryAnonViewport,
  selectedListingId,
  hoveredListingId,
  onSelectResultListing,
  onHoverResultListing,
  navigate,
}: AnonViewportListingsProps): React.ReactNode {
  if (anonViewportListingsLoading) {
    return (
      <div className="space-y-3 p-4" data-testid="anon-viewport-listing-skeleton">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-lg border border-border p-3">
            <div className="w-full h-40 rounded-lg mb-3 bg-muted animate-pulse" />
            <div className="h-4 w-2/3 mb-2 bg-muted animate-pulse rounded" />
            <div className="h-3 w-1/3 bg-muted animate-pulse rounded" />
          </div>
        ))}
      </div>
    );
  }

  // Issue #2015 review fix (5087672619) — a settled query error with nothing to show
  // (first-load failure, no prior "last good" set to retain) gets the same full-replace
  // error+Retry treatment as CorridorLandingPanel's fetch-error branch (Issue #1453).
  if (isErrorAnonViewport && anonViewportListings.length === 0) {
    return (
      <div
        data-testid="anon-viewport-error"
        className="flex flex-col items-center justify-center py-12 px-4 gap-3 text-center"
      >
        <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          Could not load listings for this area. Check your connection and try again.
        </p>
        <Button
          variant="outline"
          size="sm"
          data-testid="anon-viewport-retry-btn"
          onClick={onRetryAnonViewport}
        >
          Retry
        </Button>
      </div>
    );
  }

  if (anonViewportListings.length === 0) {
    return (
      <div
        data-testid="anon-viewport-empty-state"
        className="flex flex-col items-center justify-center h-full p-4"
      >
        <MapPin className="h-8 w-8 text-muted-foreground/40 mb-2" aria-hidden="true" />
        <p className="text-sm text-muted-foreground text-center">
          No listings found in this map area
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4" data-testid="anon-viewport-listing-grid">
      {isErrorAnonViewport && (
        // Issue #2015 review fix (5087672619) — a transient failure after a successful
        // load keeps showing the last "Search this area" result set (see
        // useDiscoverMapData's anonViewportLastGoodRef) instead of wiping it; this inline
        // banner surfaces the error + Retry without displacing the retained cards.
        <div
          data-testid="anon-viewport-retry-banner"
          className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3"
        >
          <p className="text-sm text-muted-foreground">
            Couldn&apos;t refresh this area. Showing the last results.
          </p>
          <Button
            variant="outline"
            size="sm"
            data-testid="anon-viewport-retry-btn"
            onClick={onRetryAnonViewport}
          >
            Retry
          </Button>
        </div>
      )}
      {anonViewportListings.map((listing) => (
        <PropertyCard
          key={listing.id}
          listing={listing}
          isAuthenticated={false}
          onNavigate={() => navigate(`/listing/${listing.id}`)}
          isSelected={selectedListingId === listing.id}
          isHovered={hoveredListingId === listing.id}
          onSelect={onSelectResultListing}
          onHover={onHoverResultListing}
        />
      ))}
    </div>
  );
}
