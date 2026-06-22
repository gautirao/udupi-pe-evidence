/**
 * CaptureDemandSection — shows captureDemandListings[] with improve-listing CTA.
 *
 * AC5: NO related-searches count (field does not exist in contract).
 *      null pricePaise / null qualityScore render honest states, never 0.
 * AC6: honest empty state.
 * AC8: improve_listing CTA → /broker/listings/:id/edit.
 */

import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Building2, Edit } from 'lucide-react';
import { formatPrice } from '@/lib/formatters';
import type { CaptureDemandListing } from '@/hooks/useBrokerDemandGaps';

interface CaptureDemandCardProps {
  listing: CaptureDemandListing;
}

function CaptureDemandCard({ listing }: CaptureDemandCardProps) {
  // pricePaise is integer paise; divide by 100 to get rupees for formatPrice
  const priceDisplay =
    listing.pricePaise !== null
      ? formatPrice(listing.pricePaise / 100)
      : null;

  const qualityDisplay =
    listing.qualityScore !== null
      ? `${listing.qualityScore}%`
      : null;

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <p className="text-sm font-semibold text-foreground mb-1 truncate">{listing.title}</p>
        <p className="text-xs text-muted-foreground mb-2">
          {listing.areaKey} · {listing.propertyType} · {listing.listingPurpose}
        </p>

        <div className="flex items-center gap-3 mb-3">
          {/* Price — honest null state */}
          {priceDisplay !== null ? (
            <span className="text-xs font-medium text-foreground">{priceDisplay}</span>
          ) : (
            <span className="text-xs text-muted-foreground italic">Price not set</span>
          )}

          {/* Quality score — honest null state */}
          {qualityDisplay !== null ? (
            <span className="text-xs text-muted-foreground">
              Quality: <span className="font-medium text-foreground">{qualityDisplay}</span>
            </span>
          ) : (
            <span className="text-xs text-muted-foreground italic">Not yet scored</span>
          )}
        </div>

        {/* Improve listing CTA */}
        <Button asChild size="sm" variant="outline" className="w-full">
          <Link to={`/broker/listings/${listing.listingId}/edit`}>
            <Edit className="h-3.5 w-3.5 mr-1.5" />
            Improve Listing
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

interface CaptureDemandSectionProps {
  listings: CaptureDemandListing[];
}

export function CaptureDemandSection({ listings }: CaptureDemandSectionProps) {
  if (listings.length === 0) {
    return (
      <EmptyState
        icon={<Building2 className="h-7 w-7 text-muted-foreground" />}
        heading="No capture-demand listings"
        description="Listings matching active buyer demand signals will appear here."
        size="sm"
      />
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {listings.map((l) => (
        <CaptureDemandCard key={l.listingId} listing={l} />
      ))}
    </div>
  );
}
