import React, { useState } from 'react';
import {
  BedDouble, Bath, Ruler, Calendar, ShieldCheck, Shield, Building2, MapPin, Heart, Navigation, ChevronRight,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import { useSavedListingIds, useSaveListing, useUnsaveListing } from '@/hooks/useSavedListings';
import { useAuthModal } from '@/contexts/AuthModalContext';
import { formatPrice, formatArea, formatRelativeDate } from '@/lib/formatters';
import {
  getPropertyTypeVisual,
  getPropertyTypeLabel,
  resolveBuyerCommercialSubtype,
} from '@/lib/propertyTypeConfig';
import { buildCommercialSummary } from '@/lib/commercialSummary';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import {
  useDiscoverSource,
  useDiscoverActionsEnabled,
  discoverPath,
  discoverKey,
} from '@/features/discover/state/DiscoverDataSourceContext';

/**
 * Issue #1911 PR3 — shape of the admin city-launch preview's single
 * simulated-listing endpoint (E6, `DiscoverListingResponse` on the backend).
 * Only the fields the inline preview drawer renders are typed here; the
 * endpoint is preview-only (never fetched in live mode).
 */
interface PreviewListingDetail {
  id: string;
  title: string | null;
  propertyType: string | null;
  locality: string | null;
  pricePaise: number | null;
  bedrooms: number | null;
  builtArea: number | null;
  builtAreaUnit: string | null;
  landArea: number | null;
  landAreaUnit: string | null;
  heroImageUrl: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function capitalize(s: string | null | undefined): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function purposeLabel(p: string | null | undefined): string {
  if (p === 'sale') return 'For Sale';
  if (p === 'rent') return 'For Rent';
  // Issue #2051 (R15) — lease now renders a monthly price alongside rent; without
  // an explicit case it fell through to capitalize('lease') === 'Lease', a subtly
  // inconsistent label next to a rent-shaped price. Given its own label (distinct
  // from 'For Rent') to match the existing sale/lease/rent distinction established
  // at CommercialReviewPreview.tsx:155 ("Sale terms" / "Lease terms" / "Rent terms").
  if (p === 'lease') return 'For Lease';
  return capitalize(p ?? '');
}

/**
 * Trust badge display config, keyed on the backend's public-safe trust vocabulary
 * (Issue #1567 — the raw internal letter grade A/B/C/D never reaches the frontend;
 * the backend emits "verified" | "trusted" | "listed", or omits the field entirely).
 * Any value outside this vocabulary (or null/absent) yields no badge — never invent one.
 */
export const TRUST_BADGES: Record<'verified' | 'trusted' | 'listed', { label: string; className: string; icon: typeof ShieldCheck }> = {
  verified: { label: 'Verified', className: 'bg-[hsl(var(--evergreen-tint))] text-[hsl(var(--evergreen))]', icon: ShieldCheck },
  trusted: { label: 'Trusted', className: 'bg-secondary text-secondary-foreground', icon: Shield },
  listed: { label: 'Listed', className: 'bg-muted/60 text-muted-foreground', icon: Shield },
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
  // Render a trust badge only for the three public values (verified/trusted/listed).
  // null/absent/unknown values yield no badge — the backend is the single source of
  // truth here and never sends the raw internal letter grade.
  const trust = listing.trustBadge ? TRUST_BADGES[listing.trustBadge] : undefined;

  // Issue #1566 — server-backed save/unsave. Anonymous users are prompted to sign in
  // (no API call, no local persistence); authenticated users get an optimistic
  // save/unsave via useSaveListing/useUnsaveListing (rollback on error).
  const { idSet: savedIds } = useSavedListingIds();
  const isSaved = savedIds.has(listing.id);
  const saveListing = useSaveListing();
  const unsaveListing = useUnsaveListing();
  const isSaveMutating = saveListing.isPending || unsaveListing.isPending;
  const { openAuthModal } = useAuthModal();

  // Issue #1911 PR3 — the single mutation seam: listing actions are
  // disabled whenever the card is rendered inside an admin city-launch
  // preview (useDiscoverActionsEnabled() returns false only in that mode;
  // true — unchanged — everywhere else).
  const actionsEnabled = useDiscoverActionsEnabled();
  const source = useDiscoverSource();
  const { toast } = useToast();
  const [previewDrawerOpen, setPreviewDrawerOpen] = useState(false);

  const handleToggleSave = () => {
    if (!actionsEnabled) {
      toast({ title: 'Disabled in preview', description: 'Listing actions are disabled while previewing a sandbox revision.' });
      return;
    }
    if (!isAuthenticated) {
      openAuthModal();
      return;
    }
    if (isSaveMutating) return;
    if (isSaved) {
      unsaveListing.mutate(listing.id);
    } else {
      saveListing.mutate(listing.id);
    }
  };

  const handleActivate = () => {
    onSelect?.(listing.id);
    if (!actionsEnabled) {
      // Preview mode: open the simulated in-card drawer instead of firing
      // the caller's onNavigate (which would route to /listing/{preview:...}
      // — a real-listing route this synthetic id can never resolve).
      setPreviewDrawerOpen(true);
      return;
    }
    onNavigate();
  };

  // Issue #1911 PR3 — E6 simulated-listing fetch for the preview drawer.
  // listing.id is `preview:{revisionId}:{areaKey}` for every preview-mode
  // listing (the FE-derived discriminator — no new field on the shared DTO).
  // Only ever enabled while the drawer is open in preview mode.
  const previewAreaKey = listing.id.startsWith('preview:')
    ? listing.id.split(':').slice(2).join(':')
    : null;
  const previewDetailQuery = useQuery<PreviewListingDetail>({
    queryKey: discoverKey(source, 'property-card-preview-listing-detail', listing.id),
    queryFn: () =>
      api.get<PreviewListingDetail>(
        discoverPath(source, '', { kind: 'listingDetail', areaKey: previewAreaKey ?? '' }),
      ),
    enabled: previewDrawerOpen && source.mode === 'preview' && !!previewAreaKey,
    staleTime: 60_000,
  });

  // Issue #2430 — the type pill and the title fallback both resolve through the
  // shared label authority. They previously used capitalize(), which uppercases
  // ONE character of the raw enum and so rendered 'commercial_building' as
  // "Commercial_building" — a raw database token on a buyer-facing card.
  // getPropertyTypeLabel also normalises case and never returns 'Other' for a
  // Commercial type. `typeLabel` stays null (not '') for an absent property
  // type so the pill's existing truthiness gate is unchanged.
  const typeLabel = listing.propertyType ? getPropertyTypeLabel(listing.propertyType) : null;

  const fallbackTitle = typeLabel
    ? `${typeLabel} ${purposeLabel(listing.listingPurpose)}`
    : purposeLabel(listing.listingPurpose) || 'Property';

  const purpose = listing.listingPurpose ? purposeLabel(listing.listingPurpose) : null;
  const locationText = buildLocationText(listing.locality, areaLabel);

  // Issue #2433 — the Commercial result-card summary.
  //
  // Resolved at the call site from the two RAW axes the row already carries, via
  // #2458's shared resolver. No DTO field is consumed for this: `propertyType` and
  // `commercialSubtype` are both on the row, so the Discover DTO's
  // `buyerCommercialSubtype` projection is not needed here (same conclusion #2432
  // reached for the listing-detail surface).
  //
  // getPropertyTypeLabel (#2430) already owns the identity TEXT and already takes
  // these same two axes, so it is NOT re-derived from the resolved subtype — the two
  // are parallel resolvers over one pair of axes, not a label(identity(row))
  // composition. Minting an enum-keyed label here would duplicate ownership #2430
  // already holds.
  const buyerCommercialSubtype = resolveBuyerCommercialSubtype(
    listing.propertyType,
    listing.commercialSubtype,
  );

  // ⚠️ Deliberately suppressed when the subtype does not resolve, even though
  // buildCommercialSummary has a legacy-generic branch that would render area-only.
  //
  // That branch asserts something about the DATA — "this row's Shop-vs-Office was
  // never recorded". This shape is filled from three different backends, and they
  // do NOT carry the same fields:
  //
  //   /api/discover/listings                -> DiscoverListingResponse        identity + facts
  //   /api/discover/cities/{city}/listings  -> AreaListingCard                identity + facts
  //   /school-radius-listings               -> PublicSchoolRadiusListingCard  neither
  //
  // The AREA feed carries identity (`commercialSubtype`, #2433) AND the allowlisted
  // FACT columns (#2516). Both feeds project the same set through the same reader,
  // so one listing cannot render differently depending on which panel it is reached
  // from — which was the whole point of #2516.
  //
  // An earlier revision of these lines said the area feed carried "identity ONLY"
  // and "still lacks the allowlisted FACT columns, which are #2516's scope". #2516
  // has shipped, so both are now false and are corrected here rather than left to
  // misdirect the next reader.
  //
  // So AREA is not an "absent subtype" feed at all — do not group it with
  // the school feed, which remains the only one that cannot express a subtype and
  // therefore the only one where absence means "this endpoint cannot carry it"
  // rather than "the data does not have it". Rendering the legacy branch on absence
  // alone would state a falsehood about a listing whose subtype IS recorded.
  //
  // BUILDING / WAREHOUSE / LAND resolve from `propertyType` alone and so are safe
  // on every feed. Only `property_type='commercial'` is ambiguous, and that is
  // exactly the case being suppressed. The guard can relax to include the
  // legacy-generic branch honestly once the school feed carries the field.
  const commercialSummaryFacts = buyerCommercialSubtype
    ? buildCommercialSummary(buyerCommercialSubtype, listing.propertyType, {
        builtArea: listing.builtArea,
        builtAreaUnit: listing.builtAreaUnit,
        landArea: listing.landArea,
        landAreaUnit: listing.landAreaUnit,
        ...(listing.commercialFacts ?? {}),
      })
    : [];

  const hasCommercialSummary = commercialSummaryFacts.length > 0;

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
        {/* Save (heart) affordance — top-right. Anonymous click opens the sign-in modal
            (zero network, no local toggle); authenticated click fires an optimistic
            save/unsave mutation. aria-label/aria-pressed reflect the real saved state. */}
        <button
          type="button"
          data-testid="listing-save-button"
          aria-label={isSaved ? 'Remove saved property' : 'Save property'}
          aria-pressed={isSaved}
          disabled={isSaveMutating}
          onClick={(e) => {
            e.stopPropagation();
            handleToggleSave();
          }}
          className={cn(
            'absolute top-2.5 right-2.5 flex h-8 w-8 items-center justify-center rounded-full',
            'bg-white/90 shadow-sm backdrop-blur-sm transition-colors hover:bg-white',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-copper focus-visible:ring-offset-1',
            'disabled:opacity-60 disabled:cursor-not-allowed',
          )}
        >
          <Heart
            className={cn(
              'h-4 w-4 transition-colors',
              isSaved ? 'fill-copper text-copper' : 'text-muted-foreground',
            )}
            aria-hidden
          />
        </button>
        {trust && (
          <div className="absolute top-2.5 left-2.5">
            <span
              data-testid="trust-badge"
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
        {/* Price + property-type pill
            Issue #1616 — three-way price render, extended by Issue #2051 (AC4/AC6):
            1. pricePaise present (authed sale path): render exact formatted price.
            2. priceBand present (anon sale path): render the coarse band label.
            3. monthlyRentRupees present (authed rent/lease path): exact rupee amount
               via formatPrice — NO division by 100 (monthlyRentRupees is already in
               RUPEES, unlike pricePaise; see [critical_finding_units]) — suffixed '/mo'.
            4. monthlyRentBand present (anon rent/lease path): the coarse band, suffixed '/mo'.
            5. None present (null DB price/rent on either path): render "Price on request". */}
        <div className="flex items-start justify-between gap-2">
          {listing.pricePaise != null ? (
            <p className="text-xl font-mono font-semibold tracking-[-0.01em] text-foreground tabular-nums">
              {formatPrice(Math.round(listing.pricePaise / 100), 'INR')}
            </p>
          ) : listing.priceBand != null ? (
            <p className="text-base font-semibold text-foreground">{listing.priceBand}</p>
          ) : listing.monthlyRentRupees != null ? (
            <p className="text-xl font-mono font-semibold tracking-[-0.01em] text-foreground tabular-nums">
              {formatPrice(listing.monthlyRentRupees, 'INR')}/mo
            </p>
          ) : listing.monthlyRentBand != null ? (
            <p className="text-base font-semibold text-foreground">{listing.monthlyRentBand}/mo</p>
          ) : (
            <p className="text-xs text-muted-foreground">Price on request</p>
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

        {/* Issue #2433 — Commercial summary row. REPLACES the generic specs row for a
            Commercial listing rather than stacking with it: the two overlap (both would
            render built area, and both would render floors) and a card that says
            "1,200 sq ft · 3 floors" immediately above "1,200 sq ft  3 floors" reads as a
            rendering bug. Capped at MAX_SUMMARY_FACTS by buildCommercialSummary. */}
        {hasCommercialSummary && (
          <div
            className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums"
            data-testid="listing-commercial-summary"
          >
            {commercialSummaryFacts.map((fact) => (
              <span key={fact}>{fact}</span>
            ))}
          </div>
        )}

        {/* Specs row — render only non-null values */}
        {!hasCommercialSummary && hasMetadata && (
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

        {/* Purpose + listed/confirmed date. Issue #1794 Phase 1: prefer the honest
            "Confirmed {date}" signal when confirmedAt is present; never render both
            confirmed and created timestamps together, and never relabel createdAt as
            "Confirmed" when confirmedAt is null/absent. */}
        {(purpose || listing.createdAt || listing.confirmedAt) && (
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
            {listing.confirmedAt ? (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                Confirmed {formatRelativeDate(listing.confirmedAt)}
              </span>
            ) : listing.createdAt ? (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                {formatRelativeDate(listing.createdAt)}
              </span>
            ) : null}
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

      {/* Issue #1911 PR3 — simulated preview drawer. Only ever opened in
          preview mode (handleActivate never sets previewDrawerOpen when
          actionsEnabled); renders the E6 simulated-listing fetch inline
          instead of navigating to a real /listing/{id} route. */}
      <Sheet open={previewDrawerOpen} onOpenChange={setPreviewDrawerOpen}>
        <SheetContent
          data-testid="simulated-listing-drawer"
          onClick={(e) => e.stopPropagation()}
        >
          <SheetHeader>
            <SheetTitle>
              {previewDetailQuery.data?.title || fallbackTitle}
            </SheetTitle>
            <SheetDescription>Simulated preview — not a real listing.</SheetDescription>
          </SheetHeader>
          {previewDetailQuery.isLoading && (
            <p className="mt-4 text-sm text-muted-foreground">Loading simulated listing…</p>
          )}
          {previewDetailQuery.isError && (
            <p className="mt-4 text-sm text-destructive">Unable to load this simulated listing.</p>
          )}
          {previewDetailQuery.data && (
            <div className="mt-4 space-y-2 text-sm">
              {previewDetailQuery.data.pricePaise != null && (
                <p className="text-lg font-semibold">
                  {formatPrice(Math.round(previewDetailQuery.data.pricePaise / 100), 'INR')}
                </p>
              )}
              {previewDetailQuery.data.locality && (
                <p className="flex items-center gap-1 text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  {previewDetailQuery.data.locality}
                </p>
              )}
              {previewDetailQuery.data.bedrooms != null && (
                <p>{previewDetailQuery.data.bedrooms} BHK</p>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
