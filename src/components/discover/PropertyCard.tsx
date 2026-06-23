import React from 'react';
import {
  BedDouble, Bath, Ruler, Calendar, ShieldCheck, Shield, Lock, Building2, MapPin, Heart, Navigation, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import { formatPrice, formatArea, formatRelativeDate } from '@/lib/formatters';
import { getPropertyTypeVisual } from '@/lib/propertyTypeConfig';

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
  A: { label: 'Verified', className: 'bg-[hsl(var(--evergreen-tint))] text-[hsl(var(--evergreen))]', icon: ShieldCheck },
  B: { label: 'Trusted', className: 'bg-secondary text-secondary-foreground', icon: Shield },
  C: { label: 'Listed', className: 'bg-muted/60 text-muted-foreground', icon: Shield },
};

/**
 * DEMO/NON-CONTRACTUAL trust-tier fallback. The discovery listing response DOES expose a
 * `trustTier` field, but it currently comes back null/empty for discovery-card listings
 * (the backend does not populate the scoring signal here yet — it is also flagged as an
 * incidental leak pending a deliberate, centrally-defined contract). To visually validate
 * the trust-badge affordance against the design mock, callers may opt into this fallback
 * via `demoTrustFallback`. It derives a STABLE tier from the listing id (deterministic,
 * never random) so the UI is consistent across renders. This is demo-only UI — it makes
 * NO verification claim and MUST be removed once the backend populates a real trust tier.
 * Tracked by the follow-up "expose listing trust tier for discovery listing cards" issue.
 */
function demoTrustTierFor(id: string): 'A' | 'B' | 'C' {
  let sum = 0;
  for (let i = 0; i < id.length; i += 1) sum += id.charCodeAt(i);
  return (['A', 'B', 'C'] as const)[sum % 3];
}

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
  /**
   * Opt-in DEMO trust badge. When true AND the real `listing.trustTier` is absent, the card
   * renders a clearly-marked, deterministic demo trust badge (see `demoTrustTierFor`) so the
   * affordance is visible for design validation. Never overrides a real tier. Default false —
   * existing consumers (and real backend data) are unaffected. Demo-only, non-contractual.
   */
  demoTrustFallback?: boolean;
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
  demoTrustFallback = false,
}: PropertyCardProps) {
  // Prefer the REAL backend trustTier when it maps to a displayable tier (A/B/C). The live
  // discovery response currently returns tiers outside this vocabulary (e.g. 'D' on seed
  // data) or null, which yield no badge. Only when there is no displayable real tier AND the
  // caller opted in do we synthesize a clearly-marked, deterministic demo tier (see above).
  const realTrust = listing.trustTier ? TRUST_TIERS[listing.trustTier] : undefined;
  const isDemoTrust = !realTrust && demoTrustFallback;
  const trust = realTrust ?? (isDemoTrust ? TRUST_TIERS[demoTrustTierFor(listing.id)] : undefined);

  // Visual-only "save" affordance (heart). Session-local toggle for the affordance feel —
  // it does NOT persist, hit any API, or touch the user profile. Real save/unsave +
  // profile persistence is tracked as a separate follow-up issue.
  const [saved, setSaved] = React.useState(false);

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
        {/* Save (heart) affordance — top-right. Visual-only: toggles session-local state for
            feel, but never persists or calls any API. aria-label reflects the toggle state. */}
        <button
          type="button"
          data-testid="listing-save-button"
          aria-label={saved ? 'Remove saved property' : 'Save property'}
          aria-pressed={saved}
          onClick={(e) => {
            e.stopPropagation();
            setSaved((v) => !v);
          }}
          className={cn(
            'absolute top-2.5 right-2.5 flex h-8 w-8 items-center justify-center rounded-full',
            'bg-white/90 shadow-sm backdrop-blur-sm transition-colors hover:bg-white',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-copper focus-visible:ring-offset-1',
          )}
        >
          <Heart
            className={cn(
              'h-4 w-4 transition-colors',
              saved ? 'fill-copper text-copper' : 'text-muted-foreground',
            )}
            aria-hidden
          />
        </button>
        {trust && (
          <div className="absolute top-2.5 left-2.5">
            <span
              data-testid="trust-badge"
              data-demo-trust={isDemoTrust ? 'true' : undefined}
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
        {/* Proximity badge — bottom-left, only when a real finite distance is provided.
            Dark ink pill + navigation glyph to match the selected-school mock; the
            meaning is unchanged (real haversine distance from the selected school). */}
        {showDistanceBadge && (
          <div className="absolute bottom-2.5 left-2.5" data-testid="distance-badge">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--primary)/0.92)] px-2.5 py-1 text-[11px] font-semibold shadow-md ring-1 ring-white/15 backdrop-blur-sm tabular-nums text-primary-foreground">
              <Navigation className="h-3 w-3 shrink-0" aria-hidden />
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
              <p className="text-xl font-mono font-semibold tracking-[-0.01em] text-foreground tabular-nums">
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

          {typeLabel && (() => {
            const typeVisual = getPropertyTypeVisual(listing.propertyType ?? '');
            return (
              <span
                className="flex flex-shrink-0 items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium"
                style={{ background: typeVisual.tintBg, color: typeVisual.tintFg }}
              >
                <span
                  className="inline-block h-[7px] w-[7px] flex-shrink-0 rounded-full"
                  style={{ background: typeVisual.colour }}
                  aria-hidden="true"
                />
                {typeLabel}
              </span>
            );
          })()}
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
              listing.listingPurpose === 'sale' ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--evergreen-tint))] px-2 py-0.5 text-xs font-medium text-[hsl(var(--evergreen))]">
                  <span className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[hsl(var(--evergreen))]" aria-hidden="true" />
                  {purpose}
                </span>
              ) : (
                <span className="rounded-full border border-border bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground">
                  {purpose}
                </span>
              )
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
            so it doesn't double-fire navigation via the card's own click handler.
            R-C: outline by default; navy (bg-primary) on card hover or when selected. */}
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'mt-3 w-full gap-1.5',
            isSelected
              ? 'border-primary bg-primary text-primary-foreground hover:bg-primary/90'
              : 'group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground',
          )}
          data-testid="listing-view-details"
          onClick={(e) => {
            e.stopPropagation();
            handleActivate();
          }}
        >
          View details
          <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
