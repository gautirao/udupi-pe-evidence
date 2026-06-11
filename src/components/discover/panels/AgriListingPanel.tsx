/**
 * AgriListingPanel — Issue #1374 (demoted to peek in #1405)
 *
 * Lightweight peek panel shown when an agri polygon is selected on the
 * Discover map (agri-first journey). Shows compact fields only:
 * title/locality, land area, price (if present).
 *
 * Full detail (AgriSpecRows, boundary disclaimer) lives at /listing/:id (#1406).
 * "View full details" CTA navigates there via the onNavigate callback.
 */

import React from 'react';
import { AlertCircle, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAgriListingDetail } from '@/hooks/useAgriListingDetail';
import { formatPrice } from '@/lib/formatters';

interface AgriListingPanelProps {
  listingId: string;
  onBack: () => void;
  onNavigate: () => void;
}

export function AgriListingPanel({ listingId, onBack, onNavigate }: AgriListingPanelProps) {
  const { data, isLoading, isError, refetch } = useAgriListingDetail(listingId);

  // ── Loading ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div
        data-testid="agri-detail-loading"
        className="flex flex-col h-full"
      >
        {/* Skeleton header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
          <Skeleton className="h-8 w-8 rounded" />
          <Skeleton className="h-5 w-40" />
        </div>
        {/* Skeleton rows */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-32" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────
  if (isError || !data) {
    return (
      <div
        data-testid="agri-detail-error"
        className="flex flex-col h-full"
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            aria-label="Back to area listings"
            className="h-8 w-8"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <span className="text-sm font-semibold text-foreground">Plot details</span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Could not load plot details.</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  // ── Populated (peek) ─────────────────────────────────────────────
  const { locality, landArea, landAreaUnit, price, pricePaise } = data;
  const title = data.title ?? locality ?? 'Agricultural plot';

  // Prefer pricePaise (canonical Long from BE) over deprecated price (BigDecimal rupees).
  // Backward-compatible: falls back to price when pricePaise is absent/null.
  const priceInRupees: number | null =
    pricePaise != null ? Math.round(pricePaise / 100) : (price ?? null);

  return (
    <div
      data-testid="agri-detail-panel"
      className="flex flex-col h-full"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          aria-label="Back to area listings"
          className="h-8 w-8"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <h2
          className="text-sm font-semibold text-foreground truncate"
          data-testid="agri-detail-title"
        >
          {title}
        </h2>
      </div>

      {/* Compact peek rows */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {locality && (
          <div className="flex justify-between items-start gap-2 py-2 border-b border-border">
            <span className="text-sm text-muted-foreground shrink-0">Locality</span>
            <span className="text-sm text-foreground text-right">{locality}</span>
          </div>
        )}
        {landArea != null && landAreaUnit && (
          <div className="flex justify-between items-start gap-2 py-2 border-b border-border">
            <span className="text-sm text-muted-foreground shrink-0">Land area</span>
            <span className="text-sm text-foreground text-right">
              {landArea} {landAreaUnit}
            </span>
          </div>
        )}
        {priceInRupees != null && priceInRupees > 0 && (
          <div className="flex justify-between items-start gap-2 py-2 border-b border-border">
            <span className="text-sm text-muted-foreground shrink-0">Price</span>
            <span className="text-sm text-foreground text-right" data-testid="agri-peek-price">
              {formatPrice(priceInRupees)}
            </span>
          </div>
        )}
      </div>

      {/* View full details CTA */}
      <div className="px-4 py-3 border-t border-border shrink-0">
        <Button
          className="w-full"
          onClick={onNavigate}
          data-testid="agri-view-full-details-cta"
        >
          View full details
        </Button>
      </div>
    </div>
  );
}
