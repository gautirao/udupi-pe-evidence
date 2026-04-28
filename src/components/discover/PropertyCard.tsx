import React from 'react';
import {
  BedDouble, Bath, Ruler, Calendar, ShieldCheck, Lock, Building2, MapPin,
} from 'lucide-react';
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

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PropertyCardProps {
  listing: DiscoverCityListingItem;
  isAuthenticated: boolean;
  onNavigate: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PropertyCard({ listing, isAuthenticated, onNavigate }: PropertyCardProps) {
  const isTrusted = listing.trustTier === 'A' || listing.trustTier === 'B';

  const fallbackTitle = listing.propertyType
    ? `${capitalize(listing.propertyType)} ${purposeLabel(listing.listingPurpose)}`
    : purposeLabel(listing.listingPurpose) || 'Property';

  const hasMetadata =
    listing.bedrooms != null ||
    listing.bathrooms != null ||
    listing.builtArea != null ||
    listing.landArea != null ||
    listing.totalFloors != null ||
    listing.parkingCount != null ||
    listing.furnishingStatus;

  const chips: string[] = [];
  if (listing.propertyType) chips.push(capitalize(listing.propertyType));
  if (listing.listingPurpose) chips.push(purposeLabel(listing.listingPurpose));
  const visibleChips = chips.slice(0, 3);

  return (
    <div
      data-testid="listing-card"
      className="p-4 hover:bg-accent/50 transition-colors cursor-pointer"
      onClick={onNavigate}
    >
      {/* Image with Trusted badge overlay */}
      <div className="relative w-full h-44 bg-muted rounded-lg mb-3 overflow-hidden">
        {listing.primaryImageUrl ? (
          <img
            src={listing.primaryImageUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted/60">
            <Building2 className="h-10 w-10 text-muted-foreground/30" />
          </div>
        )}
        {isTrusted && (
          <div className="absolute top-2 right-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-medium text-white">
              <ShieldCheck className="h-3 w-3" />
              Trusted
            </span>
          </div>
        )}
      </div>

      {/* Title */}
      <h3 className="text-sm font-semibold text-primary line-clamp-2 mb-1">
        {listing.title || fallbackTitle}
      </h3>

      {/* Location */}
      {listing.locality && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
          <MapPin className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{listing.locality}</span>
        </p>
      )}

      {/* Metadata row — render only non-null values */}
      {hasMetadata && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mb-2">
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
          {listing.totalFloors != null && (
            <span>{listing.totalFloors} floors</span>
          )}
          {listing.parkingCount != null && (
            <span>{listing.parkingCount} parking</span>
          )}
          {listing.furnishingStatus && (
            <span>{capitalize(listing.furnishingStatus)}</span>
          )}
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-border my-2" />

      {/* Price + listed date row */}
      <div className="flex items-center justify-between gap-2">
        {/* Price — masked for anonymous users */}
        {isAuthenticated ? (
          listing.pricePaise != null ? (
            <p className="text-sm font-semibold text-foreground">
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

        {/* Listed date */}
        {listing.createdAt && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
            <Calendar className="h-3 w-3" />
            {formatRelativeDate(listing.createdAt)}
          </p>
        )}
      </div>

      {/* Tag chips */}
      {visibleChips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {visibleChips.map((chip) => (
            <span
              key={chip}
              className="text-xs px-2 py-0.5 bg-muted rounded-full text-muted-foreground"
            >
              {chip}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
