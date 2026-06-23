import { Ruler, Home, Bath, Building, Layers, ParkingCircle, Armchair, Store, IndianRupee, Calendar } from 'lucide-react';
import { formatArea } from '@/lib/formatters';
import type { PublicListingDetail } from '@/pages/ListingDetail';

const TYPE_NOUN: Record<string, string> = {
  apartment: 'apartment',
  house: 'house',
  land: 'plot',
  commercial: 'commercial',
  commercial_building: 'commercial',
  commercial_land: 'commercial',
  warehouse: 'warehouse',
  other: 'this',
};

interface SpecCellProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}

function SpecCell({ icon, label, value }: SpecCellProps) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-card text-muted-foreground shadow-sm">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[0.95rem] font-semibold text-foreground">{value}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export interface ListingSpecsGridProps {
  listing: PublicListingDetail;
}

export function ListingSpecsGrid({ listing }: ListingSpecsGridProps) {
  const hasSpec = !!(
    listing.landArea ||
    listing.builtArea ||
    listing.bedrooms ||
    listing.bathrooms ||
    listing.carpetArea != null ||
    listing.washrooms != null ||
    listing.floorNumber != null ||
    listing.furnishingStatus ||
    listing.parkingCount != null ||
    listing.roadFrontageFt != null ||
    listing.commercialUsage ||
    listing.numberOfUnits != null
  );
  const hasRentTerms =
    listing.listingPurpose === 'rent' &&
    (listing.securityDepositMonths != null || listing.lockInMonths != null);

  // Avoid rendering an empty "Property Details" card (e.g. anonymous teaser).
  if (!hasSpec && !hasRentTerms) return null;

  const typeNoun = TYPE_NOUN[listing.propertyType] ?? 'this';

  return (
    <section className="rounded-2xl border border-border bg-card p-5 md:p-6" data-testid="listing-specs-grid">
      <h2 className="font-serif text-xl font-semibold text-foreground">Property details</h2>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">
        Shown for {typeNoun} listings — fields that don't apply to this property type are hidden.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {listing.landArea && (
            <div data-testid="spec-land-area">
              <SpecCell
                icon={<Ruler className="h-4 w-4 text-muted-foreground" />}
                label="Land Area"
                value={formatArea(listing.landArea, listing.landAreaUnit)}
              />
            </div>
          )}

          {listing.builtArea && (
            <div data-testid="spec-built-area">
              <SpecCell
                icon={<Building className="h-4 w-4 text-muted-foreground" />}
                label="Built Area"
                value={formatArea(listing.builtArea, listing.builtAreaUnit)}
              />
            </div>
          )}

          {listing.bedrooms && (
            <div data-testid="spec-bedrooms">
              <SpecCell
                icon={<Home className="h-4 w-4 text-muted-foreground" />}
                label="Bedrooms"
                value={`${listing.bedrooms} BHK`}
              />
            </div>
          )}

          {listing.bathrooms && (
            <div data-testid="spec-bathrooms">
              <SpecCell
                icon={<Bath className="h-4 w-4 text-muted-foreground" />}
                label="Bathrooms"
                value={listing.bathrooms}
              />
            </div>
          )}

          {listing.carpetArea != null && (
            <div data-testid="spec-carpet-area">
              <SpecCell
                icon={<Layers className="h-4 w-4 text-muted-foreground" />}
                label="Carpet Area"
                value={formatArea(listing.carpetArea, listing.carpetAreaUnit)}
              />
            </div>
          )}

          {listing.washrooms != null && (
            <div data-testid="spec-washrooms">
              <SpecCell
                icon={<Bath className="h-4 w-4 text-muted-foreground" />}
                label="Washrooms"
                value={listing.washrooms}
              />
            </div>
          )}

          {listing.floorNumber != null && (
            <div data-testid="spec-floor">
              <SpecCell
                icon={<Building className="h-4 w-4 text-muted-foreground" />}
                label="Floor"
                value={`${listing.floorNumber}${listing.totalFloors != null ? ` / ${listing.totalFloors}` : ''}`}
              />
            </div>
          )}

          {listing.furnishingStatus && (
            <div data-testid="spec-furnishing">
              <SpecCell
                icon={<Armchair className="h-4 w-4 text-muted-foreground" />}
                label="Furnishing"
                value={<span className="capitalize">{listing.furnishingStatus.replace(/_/g, ' ')}</span>}
              />
            </div>
          )}

          {listing.parkingCount != null && (
            <div data-testid="spec-parking">
              <SpecCell
                icon={<ParkingCircle className="h-4 w-4 text-muted-foreground" />}
                label="Parking"
                value={listing.parkingCount}
              />
            </div>
          )}

          {listing.roadFrontageFt != null && (
            <div data-testid="spec-road-frontage">
              <SpecCell
                icon={<Ruler className="h-4 w-4 text-muted-foreground" />}
                label="Road Frontage"
                value={`${listing.roadFrontageFt} ft`}
              />
            </div>
          )}

          {listing.commercialUsage && (
            <div data-testid="spec-commercial-usage">
              <SpecCell
                icon={<Store className="h-4 w-4 text-muted-foreground" />}
                label="Usage"
                value={<span className="capitalize">{listing.commercialUsage}</span>}
              />
            </div>
          )}

          {listing.numberOfUnits != null && (
            <div data-testid="spec-units">
              <SpecCell
                icon={<Building className="h-4 w-4 text-muted-foreground" />}
                label="Units"
                value={listing.numberOfUnits}
              />
            </div>
          )}
        </div>

        {/* Rent details */}
        {listing.listingPurpose === 'rent' && (listing.securityDepositMonths != null || listing.lockInMonths != null) && (
          <div className="mt-4 pt-4 border-t">
            <h4 className="text-sm font-semibold mb-3">Rental Terms</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {listing.securityDepositMonths != null && (
                <SpecCell
                  icon={<IndianRupee className="h-4 w-4 text-muted-foreground" />}
                  label="Security Deposit"
                  value={`${listing.securityDepositMonths} month${listing.securityDepositMonths !== 1 ? 's' : ''}`}
                />
              )}
              {listing.lockInMonths != null && (
                <SpecCell
                  icon={<Calendar className="h-4 w-4 text-muted-foreground" />}
                  label="Lock-in Period"
                  value={`${listing.lockInMonths} month${listing.lockInMonths !== 1 ? 's' : ''}`}
                />
              )}
            </div>
          </div>
        )}
    </section>
  );
}
