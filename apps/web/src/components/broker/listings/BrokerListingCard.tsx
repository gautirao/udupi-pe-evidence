import { useState } from 'react';
import type { ListingResponse } from '@/hooks/useBrokerListings';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, ImageIcon } from 'lucide-react';
import { TrustProgressPanel } from '@/components/trust/TrustProgressPanel';
import { STATUS_LABELS, statusClassName } from './brokerListingStatus';
import { isDeletableListingStatus } from '@/hooks/useBrokerListingSelection';
import { BrokerListingActions } from './BrokerListingActions';

interface BrokerListingCardProps {
  listing: ListingResponse;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
}

/**
 * Single broker listing card: identity/status/media/metadata plus the
 * lifecycle action slot supplied by BrokerListingActions.
 *
 * Trust panel expand state is local to the card — panels are mounted only
 * when expanded to avoid N+1 API fan-out, and cards never affect each other.
 */
export function BrokerListingCard({ listing, isSelected, onToggleSelect }: BrokerListingCardProps) {
  const [isTrustExpanded, setIsTrustExpanded] = useState(false);
  const isDeletable = isDeletableListingStatus(listing.status);

  return (
    <Card
      className={`overflow-hidden relative transition-colors ${isSelected ? 'ring-2 ring-destructive/40' : ''}`}
    >
      {isDeletable && (
        <div className="absolute top-2 left-2 z-10">
          <label className="flex items-center justify-center h-6 w-6 rounded border bg-background/90 cursor-pointer hover:bg-accent">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect(listing.id)}
              className="h-4 w-4 accent-destructive cursor-pointer"
            />
          </label>
        </div>
      )}
      {listing.firstImageUrl ? (
        <div className="relative">
          <img
            src={listing.firstImageUrl}
            alt={listing.title ?? 'Property listing image'}
            className="w-full h-32 object-cover rounded-t-lg"
          />
          {listing.imageCount > 0 && (
            <span
              className={`absolute bottom-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                listing.status === 'DRAFT' && listing.imageCount < 3
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-black/60 text-white'
              }`}
            >
              <ImageIcon className="h-3 w-3" />
              {listing.status === 'DRAFT' && listing.imageCount < 3
                ? `${listing.imageCount} / 3`
                : listing.imageCount}
            </span>
          )}
        </div>
      ) : (
        <div className="w-full h-32 bg-secondary flex flex-col items-center justify-center rounded-t-lg gap-1">
          <Building2 className="h-8 w-8 text-muted-foreground/40" />
          {listing.imageCount === 0 && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
              <ImageIcon className="h-3 w-3" />
              No photos yet
            </span>
          )}
        </div>
      )}
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-lg">{listing.title ?? 'Untitled Listing'}</CardTitle>
            {listing.displayId && (
              <p className="text-xs text-muted-foreground mt-0.5">{listing.displayId}</p>
            )}
          </div>
          <Badge className={statusClassName(listing.status)}>
            {STATUS_LABELS[listing.status] ?? listing.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2 text-sm text-muted-foreground mb-4">
          <Badge variant="secondary" className="capitalize text-xs">
            {listing.propertyType?.replace(/_/g, ' ')}
          </Badge>
          {listing.listingPurpose === 'rent' && (
            <Badge variant="outline" className="text-xs">
              Rent
            </Badge>
          )}
          {listing.locality && <span>· {listing.locality}</span>}
          {listing.listingPurpose === 'rent' ? (
            listing.monthlyRent != null && (
              <span>· &#8377;{listing.monthlyRent.toLocaleString('en-IN')}/mo</span>
            )
          ) : (
            listing.price != null && <span>· &#8377;{listing.price.toLocaleString('en-IN')}</span>
          )}
        </div>
        {listing.rejectionReason && (
          <p className="text-sm text-destructive mb-3">
            Rejection reason: {listing.rejectionReason}
          </p>
        )}
        <BrokerListingActions listing={listing} />
        {(listing.status === 'LIVE' || listing.status === 'PENDING_REVIEW') && (
          <div className="mt-4 pt-4 border-t">
            <button
              className="text-xs text-muted-foreground hover:text-foreground mb-2 underline-offset-2 hover:underline"
              onClick={() => setIsTrustExpanded((prev) => !prev)}
              aria-expanded={isTrustExpanded}
              aria-controls={`trust-panel-${listing.id}`}
            >
              {isTrustExpanded ? 'Hide trust progress' : 'Show trust progress'}
            </button>
            {isTrustExpanded && (
              <div id={`trust-panel-${listing.id}`}>
                <TrustProgressPanel listingId={listing.id} variant="compact" />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
