/**
 * AgriGroupListingPeek — Level-2 agri listing summary peek panel (Issue #1430)
 *
 * Opens when the user clicks a listing row in AgriGroupSelectedPanel.
 * First paint uses data from AgriMapListingItem (synchronous, no spinner).
 * Lazy-loads full detail (images, description) via useAgriListingDetail.
 *
 * VIDEO_INDICATOR_DEFERRED: PublicListingDetail.images uses PropertyImage
 * (url/alt/width/height only — no mediaType). PublicListingDetail has no
 * hasVideo or videoUrl field. Video indicator deferred to #1431 or future
 * backend update once a video field is added to the DTO.
 */

import React from 'react';
import { ChevronLeft, AlertCircle, ImageOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAgriListingDetail } from '@/hooks/useAgriListingDetail';
import { formatPrice } from '@/lib/formatters';
import type { AgriMapListingItem } from '@/hooks/useAgriMapListings';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgriGroupListingPeekProps {
  listingId: string;
  firstPaintData: AgriMapListingItem;
  onClose: () => void;
  onViewDetails: (id: string) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Derive a display price string from paise.
 * Returns null when pricePaise is absent or zero.
 */
function formatPaisePriceOrNull(pricePaise: number | null | undefined): string | null {
  if (!pricePaise || pricePaise <= 0) return null;
  // pricePaise → rupees. formatPrice expects full rupee value.
  const rupees = Math.round(pricePaise / 100);
  return formatPrice(rupees);
}

/**
 * Derive land area display string from AgriMapListingItem.
 * Prefers landArea+landAreaUnit when present; falls back to computedAreaAcres.
 * Returns null when neither is available.
 */
function deriveAcreageDisplay(item: AgriMapListingItem): string | null {
  if (item.landArea != null && item.landAreaUnit) {
    return `${item.landArea} ${item.landAreaUnit}`;
  }
  if (item.computedAreaAcres != null) {
    return `${item.computedAreaAcres.toFixed(2)} acres`;
  }
  return null;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AgriGroupListingPeek({
  listingId,
  firstPaintData,
  onClose,
  onViewDetails,
}: AgriGroupListingPeekProps) {
  const { data, isLoading, isError } = useAgriListingDetail(listingId);

  // First-paint values (available immediately from AgriMapListingItem)
  const title = data?.title ?? firstPaintData.locality ?? 'Agricultural plot';
  const locality = firstPaintData.locality;
  const acreage = deriveAcreageDisplay(firstPaintData);
  const priceStr = formatPaisePriceOrNull(firstPaintData.pricePaise);

  // Lazy-loaded values (from useAgriListingDetail)
  const images = data?.images ?? [];
  const description = data?.description ?? null;
  const hasMedia = images.length > 0;

  return (
    <div
      data-testid="agri-listing-peek"
      className="flex flex-col h-full"
    >
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close listing preview"
          data-testid="agri-listing-peek-close"
          className="h-8 w-8 shrink-0"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <h2
          data-testid="agri-listing-peek-title"
          className="text-sm font-semibold text-foreground truncate"
        >
          {title}
        </h2>
      </div>

      {/* ── Scrollable body ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* First-paint fields — always visible (synchronous) */}
        <div className="px-4 py-3 space-y-2 border-b border-border">
          {locality && (
            <div
              data-testid="agri-listing-peek-locality"
              className="flex justify-between items-start gap-2"
            >
              <span className="text-sm text-muted-foreground shrink-0">Locality</span>
              <span className="text-sm text-foreground text-right">{locality}</span>
            </div>
          )}
          {acreage && (
            <div
              data-testid="agri-listing-peek-acreage"
              className="flex justify-between items-start gap-2"
            >
              <span className="text-sm text-muted-foreground shrink-0">Land area</span>
              <span className="text-sm text-green-700 dark:text-green-400 text-right font-medium">
                {acreage}
              </span>
            </div>
          )}
          {priceStr && (
            <div
              data-testid="agri-listing-peek-price"
              className="flex justify-between items-start gap-2"
            >
              <span className="text-sm text-muted-foreground shrink-0">Price</span>
              <span className="text-sm text-foreground text-right font-medium">{priceStr}</span>
            </div>
          )}
        </div>

        {/* ── Media section (lazy) ────────────────────────────────────────── */}
        {isLoading ? (
          /* Loading: skeleton placeholder for the image area */
          <div className="p-4 space-y-3" aria-busy="true">
            <Skeleton className="w-full h-40 rounded-lg" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : isError ? (
          /* Error: show first-paint fields already rendered above, plus an error note.
             Close button remains visible so the user can dismiss the peek. */
          <div
            className="flex flex-col items-center justify-center gap-2 px-4 py-6 text-center"
          >
            <AlertCircle className="h-6 w-6 text-destructive" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              Could not load full details.
            </p>
          </div>
        ) : hasMedia ? (
          /* Media present */
          <div data-testid="agri-listing-peek-media" className="px-4 pt-4 pb-2">
            <img
              src={images[0].url}
              alt={images[0].alt ?? title}
              className="w-full h-48 object-cover rounded-lg"
              loading="lazy"
            />
            {images.length > 1 && (
              <p className="text-xs text-muted-foreground mt-1 text-right">
                +{images.length - 1} more photo{images.length - 1 > 1 ? 's' : ''}
              </p>
            )}
          </div>
        ) : (
          /* No media */
          <div
            data-testid="agri-listing-peek-no-media"
            className="flex flex-col items-center justify-center gap-2 px-4 py-6 text-muted-foreground/60"
          >
            <ImageOff className="h-8 w-8" aria-hidden="true" />
            <p className="text-xs">No photos available</p>
          </div>
        )}

        {/* ── Description (lazy) ──────────────────────────────────────────── */}
        {!isLoading && !isError && description && (
          <div
            data-testid="agri-listing-peek-description"
            className="px-4 py-3 border-t border-border"
          >
            <p className="text-sm text-muted-foreground line-clamp-4">{description}</p>
          </div>
        )}
      </div>

      {/* ── CTA ─────────────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-t border-border shrink-0">
        <Button
          className="w-full"
          onClick={() => onViewDetails(listingId)}
          data-testid="agri-listing-peek-view-details"
        >
          View full details
        </Button>
      </div>
    </div>
  );
}
