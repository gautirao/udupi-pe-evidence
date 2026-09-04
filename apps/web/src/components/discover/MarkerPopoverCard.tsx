/**
 * a3 — Compact marker popover card for the area-first residential results state.
 *
 * Driven by selectedMarkerListing state in MapDiscovery. Renders over the map near
 * the clicked marker. Auto-positions so it stays on-screen and handles cluster-
 * expansion (spiderfy) overlap via offset + flip logic.
 *
 * Gating (regression guard, Issue #1798 PR-C): only rendered when
 *   journey !== 'agri-first' && areaKey != null && (schoolId == null || journey === 'area-first')
 * — this mirrors MapDiscovery's isMarkerPopoverEligible, which is itself kept identical
 * to the click-capture gate (handleMarkerClickWithPosition / handleSelectMarkerListing)
 * so render and capture eligibility cannot drift apart. Keeps school-first (3 desynced
 * marker tiers) and agri-first (own peek/panel) untouched.
 *
 * Dismiss: X button, Escape key, map-background click.
 * Both Escape and background-click handlers stop propagation on the card itself
 * so they do not cross-close a filter sheet.
 */

import { useEffect, useLayoutEffect, useRef, useCallback, useState } from 'react';
import { Building2, ChevronLeft, ChevronRight, List, MapPin, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatPrice } from '@/lib/formatters';
import { getPropertyTypeLabel } from '@/lib/propertyTypeConfig';
import type { PropertyListingWithImages } from '@/components/map/PropertyMap';

/**
 * MODEL A stepper wiring (Issue #1810 Stage 2A, user-ratified — see
 * approved-plan.toml [user_decision]). `index`/`total` describe the clicked
 * listing's position within the SAME ordered array that feeds the results
 * panel; `onPrev`/`onNext` page to the sibling at index±1. This component
 * never computes camera moves — MapDiscovery's step handler makes NO camera
 * call of any kind (MODEL B — on-map markers + panInside — was explicitly
 * rejected).
 */
export interface MarkerPopoverStepper {
  /** 0-based index of the current listing within the ratified panel array. */
  index: number;
  /** Total size of the ratified panel array (>=2 — callers omit the stepper otherwise). */
  total: number;
  onPrev: () => void;
  onNext: () => void;
}

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
  /**
   * '‹ n/N ›' stepper (AC8). null/undefined hides the stepper entirely — used
   * for a standalone listing (array length <=1 or the clicked id not found).
   */
  stepper?: MarkerPopoverStepper | null;
  /**
   * "Show in list" (AC9) — re-drives setSelectedListing(id) so the matching
   * panel card scrolls+highlights, then dismisses ONLY the popup overlay
   * (never clears the panel highlight, never navigates to /listing/:id).
   */
  onShowInList: (id: string) => void;
}

// Popover dimensions (px) — used for clamp-to-bounds and flip calculations.
const POPOVER_W = 256;
const POPOVER_H = 220;
// Extra height reserved when the '‹ n/N ›' stepper row is shown (AC8).
const STEPPER_ROW_H = 30;
// Vertical offset above the marker pin tip (so it doesn't occlude the pin).
const PIN_OFFSET_ABOVE = 12;
// Horizontal margin from map container edge.
const EDGE_PAD = 8;

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
  popoverH: number,
): React.CSSProperties {
  const rawLeft = markerPos.x - POPOVER_W / 2;
  const clampedLeft = Math.max(EDGE_PAD, Math.min(rawLeft, mapW - POPOVER_W - EDGE_PAD));

  // Flip threshold from top: flip popover BELOW the pin when pin is within this many px of the top edge.
  const topFlipThreshold = popoverH + PIN_OFFSET_ABOVE + 20;
  // Flip below when near the top edge
  const flipBelow = markerPos.y < topFlipThreshold;
  const top = flipBelow
    ? markerPos.y + PIN_OFFSET_ABOVE
    : markerPos.y - popoverH - PIN_OFFSET_ABOVE;

  // Clamp top so it never goes below the map bottom edge
  const clampedTop = Math.min(Math.max(EDGE_PAD, top), mapH - popoverH - EDGE_PAD);

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
  stepper = null,
  onShowInList,
}: MarkerPopoverCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  // AC8 — hide gracefully (no NaN/undefined) for a standalone-listing context.
  const showStepper = stepper != null && stepper.total > 1 && stepper.index >= 0;
  const popoverH = showStepper ? POPOVER_H + STEPPER_ROW_H : POPOVER_H;

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
      ? computePopoverStyle(markerPixelPos, mapDims.w, mapDims.h, popoverH)
      : { position: 'absolute', left: EDGE_PAD, top: EDGE_PAD, width: POPOVER_W, zIndex: 1100 };

  const imageUrl = listing.images?.[0]?.url ?? null;
  // Issue #2430 — this component used to keep its OWN label map, which said
  // 'Comm. Building'/'Comm. Land' while the result card behind it said
  // 'Commercial_building'. Both now resolve through the one shared authority,
  // so the popover and the card can never disagree about the same listing.
  // The neutral 'Property' fallback for an unrecognised type is preserved —
  // it is the label the shared owner's fallback entry carries.
  const typeLabel = getPropertyTypeLabel(listing.property_type);
  const hasPrice = listing.price != null && listing.price > 0;
  const priceText = hasPrice && listing.price != null
    ? formatPrice(listing.price, listing.price_unit)
    : null;
  // Issue #2051 (AC6b/AC7) — rent/lease counterpart to price/priceBand above.
  // `monthly_rent` is already RUPEES (see [critical_finding_units]) — NO division
  // by 100, and formatPrice is called with the explicit 'INR' unit (not
  // `listing.price_unit`, which is a sale-price concept). A rent/lease listing's
  // `price`/`priceBand` are always null (purpose-gated by the backend), so these
  // arms only ever apply once the sale checks above have already missed.
  const hasRent = listing.monthly_rent != null && listing.monthly_rent > 0;
  const rentText = hasRent ? `${formatPrice(listing.monthly_rent as number, 'INR')}/mo` : null;
  const trimmedRentBand = listing.monthlyRentBand != null ? listing.monthlyRentBand.trim() : '';
  const rentBandText = trimmedRentBand !== '' ? `${trimmedRentBand}/mo` : null;

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

      {/* '‹ n/N ›' stepper (AC8, MODEL A) — pages the ratified panel-scope array.
          Hidden entirely for a standalone listing (showStepper false). Stepping
          never moves the camera — MapDiscovery's handler makes no camera call. */}
      {showStepper && stepper && (
        <div
          className="flex items-center justify-center gap-2 border-b border-border bg-muted/30 py-1"
          data-testid="marker-popover-stepper"
        >
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={stepper.onPrev}
            disabled={stepper.index <= 0}
            aria-label="Previous listing"
            data-testid="popover-stepper-prev"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="text-[11px] font-medium text-muted-foreground" data-testid="popover-stepper-label">
            {stepper.index + 1}/{stepper.total}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={stepper.onNext}
            disabled={stepper.index >= stepper.total - 1}
            aria-label="Next listing"
            data-testid="popover-stepper-next"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Content */}
      <div className="p-2.5 flex flex-col gap-1">
        {/* Price or auth-gated message */}
        <p className="text-sm font-semibold text-foreground leading-tight" data-testid="popover-price">
          {!isAuthenticated ? (
            listing.priceBand ? (
              <span data-testid="popover-price-band">{listing.priceBand}</span>
            ) : rentBandText ? (
              <span data-testid="popover-price-band">{rentBandText}</span>
            ) : (
              <span className="text-muted-foreground text-xs italic">Sign in to view price</span>
            )
          ) : hasPrice ? (
            priceText
          ) : hasRent ? (
            rentText
          ) : (
            <span className="text-muted-foreground text-xs italic">Price not available</span>
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

        {/* AC9 — "Show in list" scrolls+highlights the matching panel card via the
            existing setSelectedListing sync and closes ONLY this overlay; it never
            navigates and never clears the panel highlight. "View details" remains
            a separate, independently-working action. */}
        <div className="mt-1 flex gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-7 flex-1 text-xs"
            onClick={() => onShowInList(listing.id)}
            data-testid="popover-show-in-list"
          >
            <List className="mr-1 h-3 w-3" aria-hidden="true" />
            Show in list
          </Button>
          <Button
            size="sm"
            className="h-7 flex-1 text-xs"
            onClick={() => onViewDetails(listing.id)}
            data-testid="popover-view-details"
          >
            View details
          </Button>
        </div>
      </div>
    </div>
  );
}
