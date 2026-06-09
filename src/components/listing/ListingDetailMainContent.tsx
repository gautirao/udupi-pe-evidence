import { MapPin, Calendar, ExternalLink, ShieldCheck } from 'lucide-react';
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

export function ListingDetailMainContent({
  listing,
  label,
  badgeClass,
  priceHistory,
  trustBadges,
}: ListingDetailMainContentProps) {
  const title = listing.title || `${label} in ${listing.locality || 'Unknown Location'}`;

  return (
    <div className="lg:col-span-2 space-y-6">
      {/* Title & Badges */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Badge className={badgeClass}>{label}</Badge>
          {listing.sellerType === 'owner' && (
            <Badge variant="outline" className="border-emerald-300 text-emerald-700 bg-emerald-50">Owner</Badge>
          )}
          {listing.sellerType === 'broker' && (
            <Badge variant="outline" className="border-sky-300 text-sky-700 bg-sky-50">Broker</Badge>
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
        <h1 className="text-2xl md:text-3xl font-bold mb-2">{title}</h1>
        {listing.listingNumber != null && (
          <p className="font-mono text-sm text-muted-foreground mb-2">
            {formatListingId(listing.listingNumber)}
          </p>
        )}
        {listing.listingPurpose === 'rent' ? (
          listing.monthlyRent != null && (
            <p className="text-2xl font-bold text-primary">
              ₹{listing.monthlyRent.toLocaleString('en-IN')}<span className="text-base font-normal text-muted-foreground"> / month</span>
            </p>
          )
        ) : listing.price ? (
          <p className="text-2xl font-bold text-primary">
            {formatPrice(listing.price, listing.price_unit ?? null)}
          </p>
        ) : null}
        {listing.listingPurpose === 'rent' && (
          <Badge variant="outline" className="mt-1 text-xs">For Rent</Badge>
        )}
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
        {listing.reraNumber && (
          <div className="mt-2">
            <Badge variant="outline" className="text-emerald-700 border-emerald-300 bg-emerald-50 gap-1">
              <ShieldCheck className="h-3.5 w-3.5" />
              RERA number provided: {listing.reraNumber}
            </Badge>
          </div>
        )}
      </div>

      {/* Location */}
      {listing.locality && (
        <div className="flex items-start gap-3">
          <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
          <div>
            <p className="font-medium">{listing.locality}</p>
            {listing.latitude && listing.longitude && (
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

      {/* Property specs grid */}
      <ListingSpecsGrid listing={listing} />

      {/* Agricultural land specs + boundary map (additive — non-agri types unaffected) */}
      {listing.propertyType === 'agricultural_land' && (
        <>
          <AgriSpecRows
            surveyNumber={listing.surveyNumber}
            landArea={listing.landArea}
            landAreaUnit={listing.landAreaUnit}
            computedAreaAcres={listing.computedAreaAcres}
            price={listing.price}
            waterSource={listing.waterSource}
            soilType={listing.soilType}
            roadAccess={listing.roadAccess}
            cultivationStatus={listing.cultivationStatus}
            ownershipType={listing.ownershipType}
            boundary={listing.boundary}
          />
          {listing.latitude != null && listing.longitude != null && (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                Plot Location &amp; Boundary
              </h3>
              <ListingDetailBoundaryMap
                boundary={listing.boundary}
                lat={listing.latitude}
                lng={listing.longitude}
              />
            </div>
          )}
        </>
      )}

      {/* Description */}
      {listing.description && (
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-3">Description</h3>
            <p className="text-muted-foreground whitespace-pre-wrap">{listing.description}</p>
          </CardContent>
        </Card>
      )}

      {/* Key Highlights — top-3 trust badges as a bullet list */}
      {trustBadges && trustBadges.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-3">Key Highlights</h3>
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

      {/* Listing Transparency Card (RE-94) */}
      <ListingTransparencyCard
        daysOnMarket={listing.daysOnMarket}
        backOnMarket={listing.backOnMarket}
        lastUpdatedAt={listing.lastUpdatedAt}
        isSuspectedDuplicate={listing.isSuspectedDuplicate}
        priceHistory={priceHistory}
      />

      {/* RERA & Legal Readiness Card (RE-99) */}
      <RERACard
        reraNumber={listing.reraNumber}
        reraValid={listing.reraValid}
        possessionStatus={listing.possessionStatus}
        expectedPossessionDate={listing.expectedPossessionDate}
        approvalsDeclared={listing.approvalsDeclared}
      />

      {/* Trust badges (RE-156) */}
      {trustBadges && trustBadges.length > 0 && (
        <TrustBadgeCard badges={trustBadges} />
      )}

      {/* Land listings show location panel above photos — skip here */}
      {listing.propertyType !== 'land' && (
        <>
          <NearbyPois listingId={listing.id} propertyType={listing.propertyType} />
          {listing.latitude != null && listing.longitude != null && (
            <PoiMiniMap
              listingId={listing.id}
              latitude={listing.latitude}
              longitude={listing.longitude}
              propertyType={listing.propertyType}
            />
          )}
        </>
      )}

      {/* Nearby Schools */}
      <NearbySchoolsCard listingId={listing.id} />

      {/* Posted Date — absent in anonymous teaser response */}
      {listing.createdAt && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="h-4 w-4" />
          <span>Posted {format(new Date(listing.createdAt), 'MMMM d, yyyy')}</span>
          <span className="text-muted-foreground/50">•</span>
          <span>{formatRelativeDate(listing.createdAt)}</span>
        </div>
      )}

      {/* Similar listings */}
      <SimilarListings
        listingId={listing.id}
        locality={listing.locality}
        propertyType={listing.propertyType}
      />
    </div>
  );
}
