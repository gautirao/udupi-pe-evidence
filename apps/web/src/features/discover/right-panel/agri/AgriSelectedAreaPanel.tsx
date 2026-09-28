// Issue #2657 C2b — verbatim extraction of the agri-selected leaf
// (previously inline in the `case 'agri-selected'` branch of
// components/discover/DiscoverRightPanel.tsx, lines 1460-1610 as of C1).
// Byte-identical render output; only the surrounding module boundary
// (switch-case closure -> component with explicit props) changed. See
// DiscoverRightPanel.leafSnapshots2657.test.tsx (C2a) for the DOM proof.
import React from 'react';
import { Sprout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PanelHeader } from '@/components/discover/PanelHeader';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { DiscoverArea } from '@/hooks/useDiscoverAreas';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';

export interface AgriSelectedAreaPanelProps {
  selectedArea?: AreaPoint | null;
  agriAreasData?: DiscoverArea[];
  isLoadingListings?: boolean;
  isLoadingAgriAreas?: boolean;
  areaListings: DiscoverCityListingItem[];
  onStartOver: () => void;
  navigate: (to: string) => void;
}

export function AgriSelectedAreaPanel({
  selectedArea,
  agriAreasData,
  isLoadingListings,
  isLoadingAgriAreas,
  areaListings,
  onStartOver,
  navigate,
}: AgriSelectedAreaPanelProps): React.ReactElement {
  // Issue #1371 — agri-first journey with an area selected.
  // agriAreaSummary is the authoritative backend row for this area from the
  // separate ?propertyType=agricultural_land call. Its listingCount is the real
  // agri total (not capped by limitPerArea). It is available once isLoadingAgriAreas
  // resolves; while loading we show a loading indicator rather than a stale count.
  // areaListings (the area-click fetch result) is agri-only (AC6) and drives the
  // card list, but its .length must NOT be used as the resolved count source —
  // it is capped at limitPerArea=50 and can differ from the backend total.
  const agriAreaSummary = agriAreasData?.find(
    (a) => a.areaKey === selectedArea?.areaKey,
  );
  // Authoritative post-resolve count: only read from agriAreaSummary.listingCount.
  // Falls back to 0 when the summary is absent (agriAreasData not yet loaded or
  // area not found) — the loading branch above hides the count element in that case.
  const agriCount = agriAreaSummary?.listingCount ?? 0;
  const agriAcreage = agriAreaSummary?.agriAcreage;

  return (
    <>
      <PanelHeader
        title={selectedArea?.areaLabel ?? 'Agricultural land'}
        journey="agri-first"
        onStartOver={onStartOver}
      />

      {/* Agri summary strip: count + optional acreage */}
      <div
        data-testid="agri-selected-summary"
        className="flex items-center gap-4 px-4 py-2 border-b border-border bg-green-500/5 shrink-0"
      >
        <div className="flex items-center gap-1.5">
          <Sprout
            className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0"
            aria-hidden="true"
          />
          {isLoadingListings || isLoadingAgriAreas ? (
            <span
              className="text-sm text-muted-foreground"
              data-testid="agri-count-loading"
            >
              Loading…
            </span>
          ) : (
            <span
              className="text-sm font-medium text-foreground"
              data-testid="agri-count"
            >
              {agriCount} agricultural{' '}
              {agriCount === 1 ? 'listing' : 'listings'}
            </span>
          )}
        </div>
        {agriAcreage != null && (
          <span
            className="text-sm text-muted-foreground"
            data-testid="agri-acreage"
          >
            ~{agriAcreage.toFixed(1)} acres available
          </span>
        )}
      </div>

      {/* Listings body */}
      <div className="flex-1 overflow-y-auto">
        {isLoadingListings || isLoadingAgriAreas ? (
          // Show skeletons while either the listings or the authoritative
          // agri-count query is still in-flight.
          <div className="space-y-3 p-4">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                data-testid="agri-listing-skeleton"
                className="rounded-lg border border-border p-3"
              >
                <div className="w-full h-40 rounded-lg mb-3 bg-muted animate-pulse" />
                <div className="h-4 w-2/3 mb-2 bg-muted animate-pulse rounded" />
                <div className="h-3 w-1/3 bg-muted animate-pulse rounded" />
              </div>
            ))}
          </div>
        ) : agriCount === 0 ? (
          // AC8 — empty state keyed on the AUTHORITATIVE agriCount (from the
          // agri-scoped /areas summary), NOT on areaListings.length. This prevents
          // the count>0 + empty-state contradiction that occurred when
          // areaListings.length was used as the guard (Phase 7A browser bug).
          <div
            data-testid="agri-empty-state"
            className="flex flex-col items-center justify-center h-full p-4"
          >
            <Sprout
              className="h-8 w-8 text-muted-foreground/40 mb-2"
              aria-hidden="true"
            />
            <p className="text-sm text-muted-foreground text-center">
              No agricultural listings in this area yet
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={onStartOver}
              data-testid="agri-empty-start-over"
            >
              Choose a different area
            </Button>
          </div>
        ) : (
          <div
            data-testid="agri-listings-list"
            className="divide-y divide-border"
          >
            {areaListings.map((listing) => (
              <div
                key={listing.id}
                data-testid="agri-listing-card"
                className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => navigate(`/listing/${listing.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(`/listing/${listing.id}`);
                  }
                }}
              >
                <p className="text-sm font-medium text-foreground truncate">
                  {listing.title ?? listing.locality ?? listing.id}
                </p>
                {listing.locality && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {listing.locality}
                  </p>
                )}
                {listing.landArea != null && listing.landAreaUnit && (
                  <p
                    className="text-xs text-green-700 dark:text-green-400 mt-0.5"
                    data-testid="agri-land-area"
                  >
                    {listing.landArea} {listing.landAreaUnit}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
