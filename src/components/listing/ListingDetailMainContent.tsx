import { MapPin, Calendar, ExternalLink, ShieldCheck, Map as MapIcon, FileText, Check, Flag } from 'lucide-react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { SimilarListings } from '@/components/listing/SimilarListings';
import type { PriceHistoryEntry } from '@/components/listing/ListingTransparencyCard';
import { RERACard } from '@/components/listing/RERACard';
import { NearbyPois } from '@/components/poi/NearbyPois';
import { PoiMiniMap } from '@/components/poi/PoiMiniMap';
import { NearbySchoolsCard } from '@/components/listing/NearbySchoolsCard';
import { TrustBadgeCard, DIMENSION_LABELS } from '@/components/listing/TrustBadgeCard';
import { ListingSpecsGrid } from '@/components/listing/ListingSpecsGrid';
import { AgriSpecRows } from '@/components/listing/AgriSpecRows';
import { ListingDetailBoundaryMap } from '@/components/listing/ListingDetailBoundaryMap';
import { formatPrice, formatRelativeDate, formatArea } from '@/lib/formatters';
import { formatListingId } from '@/lib/listing-id';
import { cn } from '@/lib/utils';
import type { PublicListingDetail } from '@/pages/ListingDetail';

interface TrustBadge {
  dimensionType: string;
  grantedAt: string;
}

export interface ListingDetailMainContentProps {
  listing: PublicListingDetail;
  label: string;
  badgeClass: string;
  priceHistory: PriceHistoryEntry[];
  trustBadges: TrustBadge[] | undefined;
}

/** White rounded-2xl section card matching the Figma residential layout. */
function DetailSection({
  title,
  icon,
  children,
  className = '',
}: {
  title?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-border bg-card p-5 md:p-6 ${className}`}>
      {title && (
        // Issue #2159 (phase 2) — mock's Section title (ui_kits/discover/listing.html
        // ListingDetail.jsx) is sans-serif 18px/700, not serif. Reserving the
        // Fraunces serif for the ONE listing-title headline below (and price)
        // mirrors the same restraint already established for the Discover area
        // reskin (VISUAL_RULES.md: "--font-serif: panel headings only").
        <div className="mb-4 flex items-center gap-2">
          {icon}
          <h2 className="text-lg font-bold text-foreground">{title}</h2>
        </div>
      )}
      {children}
    </section>
  );
}

export function ListingDetailMainContent({
  listing,
  label,
  badgeClass,
  priceHistory,
  trustBadges,
}: ListingDetailMainContentProps) {
  const title = listing.title || `${label} in ${listing.locality || 'Unknown Location'}`;
  const purpose = (listing.listingPurpose ?? '').toLowerCase();
  const isRent = purpose === 'rent';
  const hasCoords = listing.latitude != null && listing.longitude != null;

  // Inline at-a-glance spec summary (e.g. "3 BHK · 3 bath · 1,200 sq ft · Semi-furnished").
  // Honest: only present fields are joined — no placeholders for missing data.
  const summaryBits: string[] = [];
  if (listing.bedrooms) summaryBits.push(`${listing.bedrooms} BHK`);
  if (listing.bathrooms) summaryBits.push(`${listing.bathrooms} bath`);
  if (listing.builtArea) summaryBits.push(formatArea(listing.builtArea, listing.builtAreaUnit));
  else if (listing.landArea) summaryBits.push(formatArea(listing.landArea, listing.landAreaUnit));
  if (listing.furnishingStatus) {
    const f = listing.furnishingStatus.replace(/_/g, ' ');
    summaryBits.push(f.charAt(0).toUpperCase() + f.slice(1));
  }

  const sellerNoun =
    listing.sellerType === 'owner' ? 'owner' : listing.sellerType === 'broker' ? 'broker' : null;

  return (
    <div className="space-y-6">
      {/* ── Summary: badges · title · price · id · location ───────────────── */}
      <DetailSection>
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              <Badge className={badgeClass}>{label}</Badge>
              {purpose && (
                <Badge className="bg-secondary text-secondary-foreground border-0 font-medium">
                  {isRent ? 'For rent' : 'For sale'}
                </Badge>
              )}
              {sellerNoun && (
                <span className="text-muted-foreground">Listed by {sellerNoun}</span>
              )}
              {listing.confidence_score && listing.confidence_score < 70 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="text-warning border-warning cursor-help">
                        Low confidence
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>This listing was extracted automatically from a social media post. Some details may need verification with the seller.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>

            <h1 className="font-serif text-2xl md:text-3xl font-bold leading-tight text-foreground">
              {title}
            </h1>
            {listing.listingNumber != null && (
              <p className="mt-1 font-mono text-xs uppercase tracking-wide text-muted-foreground">
                {formatListingId(listing.listingNumber)}
              </p>
            )}

            {summaryBits.length > 0 && (
              <p className="mt-3 text-sm text-[hsl(var(--text-body))]">{summaryBits.join(' · ')}</p>
            )}
          </div>

          {/* Issue #2159 (phase 2) — price is font-mono, not serif: matches the mock
              (ListingDetail.jsx Summary: `fontFamily: var(--font-mono)` for the
              price) AND this app's own already-established convention that prices/
              counts/metrics render in mono (PropertyCard.tsx's price, the Discover
              area-panel's hero result count). Serif stays reserved for the listing
              title only ("Price on request" — no numeric value — is the one
              exception the mock itself keeps serif for, left unchanged below). */}
          <div className="shrink-0 text-right">
            {isRent ? (
              listing.monthlyRent != null && (
                <p className="font-mono text-2xl md:text-3xl font-bold text-foreground">
                  ₹{listing.monthlyRent.toLocaleString('en-IN')}
                  <span className="font-sans text-base font-normal text-muted-foreground"> / month</span>
                </p>
              )
            ) : listing.price ? (
              <p className="font-mono text-2xl md:text-3xl font-bold text-foreground">
                {formatPrice(listing.price, listing.price_unit ?? null)}
              </p>
            ) : listing.priceBand ? (
              <p className="font-mono text-2xl md:text-3xl font-bold text-foreground">
                {listing.priceBand}
              </p>
            ) : null}
            {listing.propertyType === 'land' && listing.price_per_cent_paise ? (
              <p className="text-sm text-muted-foreground mt-0.5">
                ₹{(listing.price_per_cent_paise / 100).toLocaleString('en-IN')} / cent
              </p>
            ) : (['apartment', 'house'].includes(listing.propertyType) &&
                listing.builtArea && listing.builtArea > 0 &&
                listing.builtAreaUnit === 'sqft' && listing.price) ? (
              <p className="text-sm text-muted-foreground mt-0.5">
                ₹{Math.round(listing.price / listing.builtArea!).toLocaleString('en-IN')} / sq ft
              </p>
            ) : null}
          </div>
        </div>

        {listing.reraNumber && (
          <div className="mt-4">
            <Badge variant="outline" className="text-evergreen border-evergreen/40 bg-evergreen-tint gap-1">
              <ShieldCheck className="h-3.5 w-3.5" />
              RERA number provided: {listing.reraNumber}
            </Badge>
          </div>
        )}

        {listing.locality && (
          <div className="mt-4 flex items-center gap-2 border-t border-border pt-4 text-sm">
            <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="font-medium text-foreground">{listing.locality}</span>
            {hasCoords && (
              <>
                <span className="text-muted-foreground/50">·</span>
                <a
                  href={`https://www.google.com/maps/search/${listing.latitude},${listing.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  View on Google Maps
                  <ExternalLink className="h-3 w-3" />
                </a>
              </>
            )}
          </div>
        )}
      </DetailSection>

      {/* ── Property details ──────────────────────────────────────────────── */}
      <ListingSpecsGrid listing={listing} />

      {/* Agricultural land specs + boundary map (defensive — non-agri page never
          reaches here, but kept for type completeness). */}
      {listing.propertyType === 'agricultural_land' && (
        <DetailSection title="Land Details">
          <AgriSpecRows
            surveyNumber={listing.surveyNumber}
            landArea={listing.landArea}
            landAreaUnit={listing.landAreaUnit}
            computedAreaAcres={listing.computedAreaAcres}
            price={
              listing.pricePaise != null
                ? Math.round(listing.pricePaise / 100)
                : (listing.price ?? null)
            }
            waterSource={listing.waterSource}
            soilType={listing.soilType}
            roadAccess={listing.roadAccess}
            cultivationStatus={listing.cultivationStatus}
            ownershipType={listing.ownershipType}
            agriConversionStatus={listing.agriConversionStatus}
            boundary={listing.boundary}
          />
          {hasCoords && (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                Plot Location &amp; Boundary
              </h3>
              <ListingDetailBoundaryMap
                boundary={listing.boundary}
                lat={listing.latitude!}
                lng={listing.longitude!}
              />
            </div>
          )}
        </DetailSection>
      )}

      {/* ── About this property ───────────────────────────────────────────── */}
      {listing.description && (
        <DetailSection title="About this property" icon={<FileText className="h-5 w-5 text-primary" />}>
          <p className="whitespace-pre-wrap leading-relaxed text-[hsl(var(--text-body))]">{listing.description}</p>
        </DetailSection>
      )}

      {/* ── Location & nearby essentials ──────────────────────────────────── */}
      <DetailSection>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            <div>
              <h2 className="font-serif text-xl font-semibold text-foreground">Location &amp; essentials</h2>
              {listing.locality && (
                <p className="text-sm text-muted-foreground">{listing.locality}</p>
              )}
            </div>
          </div>
          {hasCoords && (
            <a
              href={`https://www.google.com/maps/search/${listing.latitude},${listing.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <MapIcon className="h-4 w-4" />
              Open in Maps
            </a>
          )}
        </div>

        {/* PoiMiniMap owns its own null-guard: renders an honest fallback (no map, no
            fabricated POIs/distances) when coords are withheld (e.g. anon residential
            under #1726 coarsening) instead of relying on the caller to gate it. */}
        <PoiMiniMap
          listingId={listing.id}
          latitude={listing.latitude}
          longitude={listing.longitude}
          propertyType={listing.propertyType}
          localityLabel={listing.locality ?? undefined}
        />

        <div className="mt-5 border-t border-border pt-5">
          <NearbySchoolsCard listingId={listing.id} embedded />
        </div>

        <div className="mt-5 border-t border-border pt-5">
          <NearbyPois listingId={listing.id} propertyType={listing.propertyType} embedded />
        </div>
      </DetailSection>

      {/* ── Why trust this listing? — consolidated (#1797 AC5): groups the RERA/legal
          card, the public trust badges, and the buyer checklist into ONE section
          instead of three scattered cards. ──────────────────────────────────── */}
      {(() => {
        const checks = [
          listing.sellerType === 'broker' && 'Listed by a verified broker',
          trustBadges && trustBadges.length > 0 && 'Key details cross-checked',
          (listing.imageCount ?? listing.images?.length ?? 0) > 0 && 'Photos confirmed for this property',
          listing.reraNumber && 'RERA number provided',
        ].filter(Boolean) as string[];

        const safeTrustBadges = trustBadges ?? [];
        const hasTrustBadges = safeTrustBadges.length > 0;
        const hasReraContent =
          (listing.reraNumber != null && listing.reraNumber !== '') ||
          listing.possessionStatus != null ||
          listing.approvalsDeclared != null;

        if (checks.length === 0 && !hasTrustBadges && !hasReraContent) return null;

        const lastUpdated = listing.lastUpdatedAt || listing.createdAt;
        const updatedToday = lastUpdated
          ? new Date(lastUpdated).toDateString() === new Date().toDateString()
          : false;
        // Issue #1794 Phase 1 — prefer the honest "Confirmed {date}" signal when the
        // backend supplied confirmedAt. Null/absent confirmedAt falls back unchanged
        // to the existing lastUpdatedAt/createdAt "Last updated" display — never
        // relabel lastUpdatedAt/createdAt as a confirmation.
        const confirmedLabel = listing.confirmedAt
          ? `Confirmed ${formatRelativeDate(listing.confirmedAt)}`
          : null;

        return (
          <DetailSection title="Why trust this listing?" icon={<ShieldCheck className="h-5 w-5 text-primary" />}>
            <p className="-mt-2 mb-4 text-sm text-muted-foreground">
              What we've checked, and what's still in progress — so you know what you're looking at.
            </p>

            {checks.length > 0 && (
              <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {checks.map((c) => (
                  <li key={c} className="flex items-center gap-2 text-sm text-foreground">
                    <Check className="h-4 w-4 shrink-0 text-evergreen" aria-hidden="true" />
                    {c}
                  </li>
                ))}
              </ul>
            )}

            {hasTrustBadges && (
              <div className={cn(checks.length > 0 && 'mt-5 border-t border-border pt-5')}>
                <TrustBadgeCard badges={safeTrustBadges} embedded />
              </div>
            )}

            {hasReraContent && (
              <div className={cn((checks.length > 0 || hasTrustBadges) && 'mt-5 border-t border-border pt-5')}>
                <RERACard
                  reraNumber={listing.reraNumber}
                  reraValid={listing.reraValid}
                  possessionStatus={listing.possessionStatus}
                  expectedPossessionDate={listing.expectedPossessionDate}
                  approvalsDeclared={listing.approvalsDeclared}
                  embedded
                />
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border pt-4 text-xs text-muted-foreground">
              {confirmedLabel ? (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {confirmedLabel}
                </span>
              ) : lastUpdated ? (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Last updated {updatedToday ? 'today' : formatRelativeDate(lastUpdated)}
                </span>
              ) : null}
              {listing.sellerType && (
                <span className="inline-flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Listed by {listing.sellerType === 'broker' ? 'verified broker' : listing.sellerType}
                </span>
              )}
              {listing.createdAt && (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Posted {format(new Date(listing.createdAt), 'MMMM d, yyyy')}
                </span>
              )}
              <button
                type="button"
                className="ml-auto inline-flex items-center gap-1 text-muted-foreground/70 hover:text-destructive transition-colors"
              >
                <Flag className="h-3.5 w-3.5" />
                Report this listing
              </button>
            </div>
          </DetailSection>
        );
      })()}

      {/* ── Similar listings (preserved) ─────────────────────────────────── */}
      <SimilarListings
        listingId={listing.id}
        locality={listing.locality}
        propertyType={listing.propertyType}
      />
    </div>
  );
}
