/**
 * a3 — Compact marker popover card for the area-first residential results state.
 *
 * Driven by selectedMarkerListing state in MapDiscovery. Renders over the map near
 * the clicked marker. Auto-positions so it stays on-screen and handles cluster-
 * expansion (spiderfy) overlap via offset + flip logic.
 *
 * Gating (regression guard): only rendered when
 *   areaKey != null && schoolId == null && journey !== 'agri-first'
 * to mirror the #1547 condition and keep school-first (3 desynced marker tiers)
 * and agri-first (own peek/panel) untouched.
 *
 * Dismiss: X button, Escape key, map-background click.
 * Both Escape and background-click handlers stop propagation on the card itself
 * so they do not cross-close a filter sheet.
 */

import { useEffect, useLayoutEffect, useRef, useCallback, useState } from 'react';
import { Building2, MapPin, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatPrice } from '@/lib/formatters';
import type { PropertyListingWithImages } from '@/components/map/PropertyMap';

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  land: 'Land',
  house: 'House',
  apartment: 'Apartment',
  commercial: 'Commercial',
  commercial_building: 'Comm. Building',
  warehouse: 'Warehouse',
  commercial_land: 'Comm. Land',
  agricultural_land: 'Agri Land',
  other: 'Other',
};

interface MarkerPopoverCardProps {
  listing: PropertyListingWithImages;
  /** Whether the current user is authenticated (drives price visibility). */
  isAuthenticated: boolean;
  /**
   * Pixel position of the clicked marker relative to the map container element.
   * Used to position the popover near the pin.
   */
  markerPixelPos: { x: number; y: number } | null;
  /** Map container DOM ref — used for clamp-to-bounds positioning. */
  mapContainerRef: React.RefObject<HTMLDivElement | null>;
  /** Called when the popover should be dismissed (X button, Escape, background click). */
  onDismiss: () => void;
  /** Called when "View details" is clicked — typically navigate('/listing/:id'). */
  onViewDetails: (id: string) => void;
}

// Popover dimensions (px) — used for clamp-to-bounds and flip calculations.
const POPOVER_W = 256;
const POPOVER_H = 220;
// Vertical offset above the marker pin tip (so it doesn't occlude the pin).
const PIN_OFFSET_ABOVE = 12;
// Horizontal margin from map container edge.
const EDGE_PAD = 8;
// Flip threshold from top: flip popover BELOW the pin when pin is within this many px of the top edge.
const TOP_FLIP_THRESHOLD = POPOVER_H + PIN_OFFSET_ABOVE + 20;

/**
 * Compute clamped popover position.
 * Default: popover centred horizontally over the pin, appearing above it.
 * Flip below: when the pin is near the top edge (to avoid going off-screen upward).
 * Horizontal clamp: keeps the card within the map container width.
 */
function computePopoverStyle(
  markerPos: { x: number; y: number },
  mapW: number,
  mapH: number,
): React.CSSProperties {
  const rawLeft = markerPos.x - POPOVER_W / 2;
  const clampedLeft = Math.max(EDGE_PAD, Math.min(rawLeft, mapW - POPOVER_W - EDGE_PAD));

  // Flip below when near the top edge
  const flipBelow = markerPos.y < TOP_FLIP_THRESHOLD;
  const top = flipBelow
    ? markerPos.y + PIN_OFFSET_ABOVE
    : markerPos.y - POPOVER_H - PIN_OFFSET_ABOVE;

  // Clamp top so it never goes below the map bottom edge
  const clampedTop = Math.min(Math.max(EDGE_PAD, top), mapH - POPOVER_H - EDGE_PAD);

  return {
    position: 'absolute',
    left: clampedLeft,
    top: clampedTop,
    width: POPOVER_W,
    zIndex: 1100,
  };
}

export function MarkerPopoverCard({
  listing,
  isAuthenticated,
  markerPixelPos,
  mapContainerRef,
  onDismiss,
  onViewDetails,
}: MarkerPopoverCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Escape key dismiss — isolate from filter sheet (stopPropagation on card stops
  // the event from bubbling up to sheet's own Escape handler).
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onDismiss();
      }
    },
    [onDismiss],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [handleKeyDown]);

  // Measure map container dimensions after the ref is set (or when markerPixelPos
  // changes, which always accompanies a new marker click). useLayoutEffect runs
  // synchronously after DOM mutations so clientWidth/clientHeight are real values.
  const [mapDims, setMapDims] = useState<{ w: number; h: number }>({ w: 600, h: 400 });
  useLayoutEffect(() => {
    const el = mapContainerRef.current;
    if (el) {
      setMapDims({ w: el.clientWidth, h: el.clientHeight });
    }
  }, [mapContainerRef, markerPixelPos]);

  const posStyle: React.CSSProperties =
    markerPixelPos != null
      ? computePopoverStyle(markerPixelPos, mapDims.w, mapDims.h)
      : { position: 'absolute', left: EDGE_PAD, top: EDGE_PAD, width: POPOVER_W, zIndex: 1100 };

  const imageUrl = listing.images?.[0]?.url ?? null;
  const typeLabel = PROPERTY_TYPE_LABELS[listing.property_type] ?? 'Property';
  const hasPrice = listing.price != null && listing.price > 0;
  const priceText = hasPrice && listing.price != null
    ? formatPrice(listing.price, listing.price_unit)
    : null;

  // Stop propagation so clicking inside the card does not trigger map background-click dismiss.
  const handleCardClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-label={listing.title ?? 'Property details'}
      aria-modal="false"
      style={posStyle}
      className="rounded-xl border border-border bg-card shadow-lg overflow-hidden"
      onClick={handleCardClick}
      data-testid="marker-popover-card"
    >
      {/* Image / placeholder */}
      <div className="relative h-28 w-full bg-muted flex items-center justify-center overflow-hidden">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={listing.title ?? typeLabel}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <Building2 className="h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
        )}
        {/* Close button overlaid top-right on the image */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-1 top-1 h-6 w-6 rounded-full bg-black/40 text-white hover:bg-black/60"
          onClick={onDismiss}
          aria-label="Close property preview"
          data-testid="marker-popover-close"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Content */}
      <div className="p-2.5 flex flex-col gap-1">
        {/* Price or auth-gated message */}
        <p className="text-sm font-semibold text-foreground leading-tight" data-testid="popover-price">
          {!isAuthenticated ? (
            <span className="text-muted-foreground text-xs italic">Sign in to view price</span>
          ) : !hasPrice ? (
            <span className="text-muted-foreground text-xs italic">Price not available</span>
          ) : (
            priceText
          )}
        </p>

        {/* Title */}
        {listing.title && (
          <p className="line-clamp-1 text-xs text-foreground/90 leading-snug">
            {listing.title}
          </p>
        )}

        {/* Property-type pill + locality */}
        <div className="flex items-center justify-between gap-1.5 mt-0.5">
          <span className="inline-flex shrink-0 items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.06em]">
            {typeLabel}
          </span>
          {listing.locality && (
            <span className="flex items-center gap-0.5 truncate text-[10px] text-muted-foreground">
              <MapPin className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{listing.locality}</span>
            </span>
          )}
        </div>

        {/* View details CTA */}
        <Button
          size="sm"
          className="mt-1 h-7 w-full text-xs"
          onClick={() => onViewDetails(listing.id)}
          data-testid="popover-view-details"
        >
          View details
        </Button>
      </div>
    </div>
  );
}
