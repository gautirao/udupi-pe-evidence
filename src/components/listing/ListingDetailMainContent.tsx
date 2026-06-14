import { MapPin, Calendar, ExternalLink, ShieldCheck, Map as MapIcon } from 'lucide-react';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { SimilarListings } from '@/components/listing/SimilarListings';
import { ListingTransparencyCard, PriceHistoryEntry } from '@/components/listing/ListingTransparencyCard';
import { RERACard } from '@/components/listing/RERACard';
import { NearbyPois } from '@/components/poi/NearbyPois';
import { PoiMiniMap } from '@/components/poi/PoiMiniMap';
import { NearbySchoolsCard } from '@/components/listing/NearbySchoolsCard';
import { TrustBadgeCard, DIMENSION_LABELS } from '@/components/listing/TrustBadgeCard';
import { ListingSpecsGrid } from '@/components/listing/ListingSpecsGrid';
import { AgriSpecRows } from '@/components/listing/AgriSpecRows';
import { ListingDetailBoundaryMap } from '@/components/listing/ListingDetailBoundaryMap';
import { formatPrice, formatRelativeDate } from '@/lib/formatters';
import { formatListingId } from '@/lib/listing-id';
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
        <div className="mb-4 flex items-center gap-2">
          {icon}
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
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

  return (
    <div className="space-y-6">
      {/* ── Summary: badges · title · price · id · location ───────────────── */}
      <DetailSection>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge className={badgeClass}>{label}</Badge>
          {listing.sellerType === 'owner' && (
            <Badge variant="outline" className="border-emerald-300 text-emerald-700 bg-emerald-50">Owner</Badge>
          )}
          {listing.sellerType === 'broker' && (
            <Badge variant="outline" className="border-sky-300 text-sky-700 bg-sky-50">Broker</Badge>
          )}
          {purpose && (
            <Badge variant="outline">{isRent ? 'For Rent' : 'For Sale'}</Badge>
          )}
          {listing.confidence_score && listing.confidence_score < 70 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-yellow-600 border-yellow-400 cursor-help">
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

        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold">{title}</h1>
            {listing.listingNumber != null && (
              <p className="mt-1 font-mono text-sm text-muted-foreground">
                {formatListingId(listing.listingNumber)}
              </p>
            )}
          </div>
          <div className="shrink-0 text-right">
            {isRent ? (
              listing.monthlyRent != null && (
                <p className="text-2xl font-bold text-primary">
                  ₹{listing.monthlyRent.toLocaleString('en-IN')}
                  <span className="text-base font-normal text-muted-foreground"> / month</span>
                </p>
              )
            ) : listing.price ? (
              <p className="text-2xl font-bold text-primary">
                {formatPrice(listing.price, listing.price_unit ?? null)}
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
                ₹{Math.round(listing.price / listing.builtArea!).toLocaleString('en-IN')} / sqft
              </p>
            ) : null}
          </div>
        </div>

        {listing.reraNumber && (
          <div className="mt-3">
            <Badge variant="outline" className="text-emerald-700 border-emerald-300 bg-emerald-50 gap-1">
              <ShieldCheck className="h-3.5 w-3.5" />
              RERA number provided: {listing.reraNumber}
            </Badge>
          </div>
        )}

        {listing.locality && (
          <div className="mt-4 flex items-start gap-3">
            <MapPin className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">{listing.locality}</p>
              {hasCoords && (
                <a
                  href={`https://www.google.com/maps/search/${listing.latitude},${listing.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                >
                  View on Google Maps
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
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

      {/* ── Description (preserved — not in Figma mock) ───────────────────── */}
      {listing.description && (
        <Card>
          <CardContent className="p-5 md:p-6">
            <h2 className="text-lg font-semibold mb-3">Description</h2>
            <p className="text-muted-foreground whitespace-pre-wrap">{listing.description}</p>
          </CardContent>
        </Card>
      )}

      {/* ── Listing transparency ──────────────────────────────────────────── */}
      <ListingTransparencyCard
        daysOnMarket={listing.daysOnMarket}
        backOnMarket={listing.backOnMarket}
        lastUpdatedAt={listing.lastUpdatedAt}
        isSuspectedDuplicate={listing.isSuspectedDuplicate}
        priceHistory={priceHistory}
      />

      {/* ── RERA & legal readiness (preserved) ───────────────────────────── */}
      <RERACard
        reraNumber={listing.reraNumber}
        reraValid={listing.reraValid}
        possessionStatus={listing.possessionStatus}
        expectedPossessionDate={listing.expectedPossessionDate}
        approvalsDeclared={listing.approvalsDeclared}
      />

      {/* ── Key highlights / trust badges (preserved) ────────────────────── */}
      {trustBadges && trustBadges.length > 0 && (
        <Card>
          <CardContent className="p-5 md:p-6">
            <h2 className="text-lg font-semibold mb-3">Key Highlights</h2>
            <ul className="space-y-1.5 text-sm text-muted-foreground list-disc list-inside">
              {trustBadges.slice(0, 3).map((badge) => (
                <li key={badge.dimensionType}>
                  {DIMENSION_LABELS[badge.dimensionType] ?? badge.dimensionType}
                </li>
              ))}
            </ul>
            {trustBadges.length > 3 && (
              <p className="text-xs text-muted-foreground mt-2">
                + {trustBadges.length - 3} more
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {trustBadges && trustBadges.length > 0 && <TrustBadgeCard badges={trustBadges} />}

      {/* ── Location & essentials ─────────────────────────────────────────── */}
      <DetailSection title="Location & Essentials" icon={<MapPin className="h-5 w-5 text-primary" />}>
        {hasCoords ? (
          <PoiMiniMap
            listingId={listing.id}
            latitude={listing.latitude!}
            longitude={listing.longitude!}
            propertyType={listing.propertyType}
          />
        ) : (
          <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/40">
            <div className="text-center text-muted-foreground">
              <MapIcon className="mx-auto mb-2 h-6 w-6 opacity-60" aria-hidden="true" />
              <p className="text-sm">Map view{listing.locality ? ` — ${listing.locality}` : ''}</p>
            </div>
          </div>
        )}

        <div className="mt-5 border-t border-border pt-5">
          <NearbySchoolsCard listingId={listing.id} embedded />
        </div>

        {listing.createdAt && (
          <div className="mt-5 flex items-center gap-2 border-t border-border pt-4 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>Posted {format(new Date(listing.createdAt), 'MMMM d, yyyy')}</span>
            <span className="text-muted-foreground/50">•</span>
            <span>{formatRelativeDate(listing.createdAt)}</span>
          </div>
        )}
      </DetailSection>

      {/* ── Nearby amenities (preserved — renders null when no POI data) ──── */}
      <NearbyPois listingId={listing.id} propertyType={listing.propertyType} />

      {/* ── Similar listings (preserved) ─────────────────────────────────── */}
      <SimilarListings
        listingId={listing.id}
        locality={listing.locality}
        propertyType={listing.propertyType}
      />
    </div>
  );
}
