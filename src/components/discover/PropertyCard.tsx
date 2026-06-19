import React from 'react';
import {
  BedDouble, Bath, Ruler, Calendar, ShieldCheck, Shield, Lock, Building2, MapPin,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import { formatPrice, formatArea, formatRelativeDate } from '@/lib/formatters';

// ── Helpers ──────────────────────────────────────────────────────────────────

export function capitalize(s: string | null | undefined): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function purposeLabel(p: string | null | undefined): string {
  if (p === 'sale') return 'For Sale';
  if (p === 'rent') return 'For Rent';
  return capitalize(p ?? '');
}

/**
 * Trust-tier badge mapping. The backend exposes an opaque letter grade on `trustTier`
 * (A/B/C). This maps it conservatively to the ReTrends trust vocabulary — A → Verified
 * (top, evergreen), B → Trusted (calm navy), C → Listed (neutral). Any other / null
 * value yields no badge (never invent a tier). Documented mapping per request.
 */
const TRUST_TIERS: Record<string, { label: string; className: string; icon: typeof ShieldCheck }> = {
  A: { label: 'Verified', className: 'bg-evergreen text-evergreen-foreground', icon: ShieldCheck },
  B: { label: 'Trusted', className: 'bg-primary text-primary-foreground', icon: ShieldCheck },
  C: { label: 'Listed', className: 'bg-muted text-muted-foreground', icon: Shield },
};

/** Build a deduplicated "Sublocality, Area" location string from real fields only. */
export function buildLocationText(
  locality: string | null | undefined,
  areaLabel: string | null | undefined,
): string {
  const seen = new Set<string>();
  return [locality, areaLabel]
    .map((p) => (p ?? '').trim())
    .filter((p) => {
      if (!p) return false;
      const k = p.toLowerCase();
      if (seen.has(k)) return false; // avoid "Manipal, Manipal"
      seen.add(k);
      return true;
    })
    .join(', ');
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface PropertyCardProps {
  listing: DiscoverCityListingItem;
  isAuthenticated: boolean;
  onNavigate: () => void;
  /**
   * Issue #1547 — card↔marker shared selected state. When true, the card renders the
   * copper selected frame (border + ring). Selection is URL/parent-derived (the `listing`
   * URL param), never card-local. Default false so existing consumers render unselected.
   */
  isSelected?: boolean;
  /**
   * Issue #1547 — optional selection callback (does NOT replace onNavigate; the card
   * click still navigates). Currently selection is driven from the map marker side, so
   * this is reserved for symmetric card→marker wiring and defaults to a no-op.
   */
  onSelect?: (id: string) => void;
  /**
   * Issue #1547 — ephemeral hover/focus signal for card→marker highlight.
   * Called with the listing id on mouseenter/focus, null on mouseleave/blur.
   * Does NOT affect navigation or URL state. Optional — when absent the card
   * renders identically (safe for all existing consumers).
   */
  onHover?: (id: string | null) => void;
  /**
   * Optional area/locality context (e.g. the selected area "Manipal") appended after the
   * listing's own `locality` to form a richer "Eshwar Nagar, Manipal" line. Deduplicated,
   * so an identical locality+area never renders as "Manipal, Manipal". When absent, only
   * the listing's own locality is shown. Never fabricated.
   */
  areaLabel?: string;
  /**
   * ReTrends redesign — real haversine distance from the selected school to this listing.
   * When a finite number, renders a plum proximity badge (e.g. "2.2 km from school")
   * overlaid on the image bottom-left. When null/undefined/non-finite, renders nothing —
   * never fabricated. Computed by the parent panel from real school + listing coordinates.
   */
  distanceKm?: number | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PropertyCard({
  listing,
  isAuthenticated,
  onNavigate,
  isSelected = false,
  onSelect,
  onHover,
  areaLabel,
  distanceKm,
}: PropertyCardProps) {
  const trust = listing.trustTier ? TRUST_TIERS[listing.trustTier] : undefined;

  const handleActivate = () => {
    onSelect?.(listing.id);
    onNavigate();
  };

  const fallbackTitle = listing.propertyType
    ? `${capitalize(listing.propertyType)} ${purposeLabel(listing.listingPurpose)}`
    : purposeLabel(listing.listingPurpose) || 'Property';

  const typeLabel = listing.propertyType ? capitalize(listing.propertyType) : null;
  const purpose = listing.listingPurpose ? purposeLabel(listing.listingPurpose) : null;
  const locationText = buildLocationText(listing.locality, areaLabel);

  const hasMetadata =
    listing.bedrooms != null ||
    listing.bathrooms != null ||
    listing.builtArea != null ||
    listing.landArea != null ||
    listing.totalFloors != null ||
    listing.parkingCount != null ||
    listing.furnishingStatus;

  // Only render distance badge when a real finite value is provided — never fabricate.
  const showDistanceBadge = distanceKm != null && Number.isFinite(distanceKm);

  return (
    <div
      data-testid="listing-card"
      data-selected={isSelected ? 'true' : undefined}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      onClick={handleActivate}
      onKeyDown={(e) => {
        // Only the card itself activates on Enter/Space — keystrokes from the inner
        // "View details" button bubble up but must not double-fire navigation.
        if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
          e.preventDefault();
          handleActivate();
        }
      }}
      onMouseEnter={() => onHover?.(listing.id)}
      onMouseLeave={() => onHover?.(null)}
      onFocus={() => onHover?.(listing.id)}
      onBlur={() => onHover?.(null)}
      className={cn(
        // Premium ReTrends card: white surface, hairline border, soft warm shadow,
        // full-bleed image header, hover lift. No teal/green hover wash.
        'group block cursor-pointer scroll-mt-4 overflow-hidden rounded-xl border bg-card shadow-sm',
        'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-copper focus-visible:ring-offset-1',
        isSelected ? 'border-copper ring-2 ring-copper/40' : 'border-border',
      )}
    >
      {/* Image header (full-bleed) with trust badge + distance badge overlays */}
      <div className="relative h-44 w-full overflow-hidden bg-muted">
        {listing.primaryImageUrl ? (
          <img
            src={listing.primaryImageUrl}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted/60">
            <Building2 className="h-10 w-10 text-muted-foreground/30" />
          </div>
        )}
        {trust && (
          <div className="absolute top-2.5 left-2.5">
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium shadow-sm',
                trust.className,
              )}
            >
              <trust.icon className="h-3 w-3" />
              {trust.label}
            </span>
          </div>
        )}
        {/* Plum proximity badge — bottom-left, only when real finite distance provided */}
        {showDistanceBadge && (
          <div className="absolute bottom-2.5 left-2.5" data-testid="distance-badge">
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium shadow-sm tabular-nums bg-[hsl(var(--plum))] text-white">
              <MapPin className="h-3 w-3 shrink-0" aria-hidden />
              {distanceKm!.toFixed(1)} km from school
            </span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-4">
        {/* Price + property-type pill */}
        <div className="flex items-start justify-between gap-2">
          {isAuthenticated ? (
            listing.pricePaise != null ? (
              <p className="text-lg font-bold tracking-tight text-foreground tabular-nums">
                {formatPrice(Math.round(listing.pricePaise / 100), 'INR')}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Price on request</p>
            )
          ) : (
            <div className="flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-xs text-muted-foreground">Sign in to view price</span>
            </div>
          )}

          {typeLabel && (
            <span className="flex-shrink-0 rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-foreground">
              {typeLabel}
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="mt-1.5 line-clamp-2 text-base font-bold tracking-tight text-primary">
          {listing.title || fallbackTitle}
        </h3>

        {/* Location — richer "Sublocality, Area" when available, deduplicated */}
        {locationText && (
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{locationText}</span>
          </p>
        )}

        {/* Specs row — render only non-null values */}
        {hasMetadata && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
            {listing.bedrooms != null && (
              <span className="flex items-center gap-1">
                <BedDouble className="h-3.5 w-3.5" />
                {listing.bedrooms} BHK
              </span>
            )}
            {listing.bathrooms != null && (
              <span className="flex items-center gap-1">
                <Bath className="h-3.5 w-3.5" />
                {listing.bathrooms}
              </span>
            )}
            {listing.builtArea != null && (
              <span className="flex items-center gap-1">
                <Ruler className="h-3.5 w-3.5" />
                {formatArea(listing.builtArea, listing.builtAreaUnit)}
              </span>
            )}
            {listing.landArea != null && (
              <span className="flex items-center gap-1">
                <Ruler className="h-3.5 w-3.5" />
                {formatArea(listing.landArea, listing.landAreaUnit)}
              </span>
            )}
            {listing.totalFloors != null && <span>{listing.totalFloors} floors</span>}
            {listing.parkingCount != null && <span>{listing.parkingCount} parking</span>}
            {listing.furnishingStatus && <span>{capitalize(listing.furnishingStatus)}</span>}
          </div>
        )}

        {/* Purpose + listed date */}
        {(purpose || listing.createdAt) && (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            {purpose && (
              <span className="rounded-full border border-border bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground">
                {purpose}
              </span>
            )}
            {listing.createdAt && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                {formatRelativeDate(listing.createdAt)}
              </span>
            )}
          </div>
        )}

        {/* View details CTA — navigates like the card; keyboard accessible. stopPropagation
            so it doesn't double-fire navigation via the card's own click handler. */}
        <Button
          variant="outline"
          size="sm"
          className="mt-3 w-full"
          data-testid="listing-view-details"
          onClick={(e) => {
            e.stopPropagation();
            handleActivate();
          }}
        >
          View details
        </Button>
      </div>
    </div>
  );
}
