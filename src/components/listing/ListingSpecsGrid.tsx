import { Ruler, Home, Bath, Building, Layers, ParkingCircle, Armchair, Store, IndianRupee, Calendar } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { formatArea } from '@/lib/formatters';
import type { PublicListingDetail } from '@/pages/ListingDetail';

interface SpecCellProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}

function SpecCell({ icon, label, value }: SpecCellProps) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="font-medium">{value}</p>
      </div>
    </div>
  );
}

export interface ListingSpecsGridProps {
  listing: PublicListingDetail;
}

export function ListingSpecsGrid({ listing }: ListingSpecsGridProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="font-semibold mb-4">Property Details</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {listing.landArea && (
            <SpecCell
              icon={<Ruler className="h-4 w-4 text-muted-foreground" />}
              label="Land Area"
              value={formatArea(listing.landArea, listing.landAreaUnit)}
            />
          )}

          {listing.builtArea && (
            <SpecCell
              icon={<Building className="h-4 w-4 text-muted-foreground" />}
              label="Built Area"
              value={formatArea(listing.builtArea, listing.builtAreaUnit)}
            />
          )}

          {listing.bedrooms && (
            <SpecCell
              icon={<Home className="h-4 w-4 text-muted-foreground" />}
              label="Bedrooms"
              value={`${listing.bedrooms} BHK`}
            />
          )}

          {listing.bathrooms && (
            <SpecCell
              icon={<Bath className="h-4 w-4 text-muted-foreground" />}
              label="Bathrooms"
              value={listing.bathrooms}
            />
          )}

          {listing.carpetArea != null && (
            <SpecCell
              icon={<Layers className="h-4 w-4 text-muted-foreground" />}
              label="Carpet Area"
              value={formatArea(listing.carpetArea, listing.carpetAreaUnit)}
            />
          )}

          {listing.washrooms != null && (
            <SpecCell
              icon={<Bath className="h-4 w-4 text-muted-foreground" />}
              label="Washrooms"
              value={listing.washrooms}
            />
          )}

          {listing.floorNumber != null && (
            <SpecCell
              icon={<Building className="h-4 w-4 text-muted-foreground" />}
              label="Floor"
              value={`${listing.floorNumber}${listing.totalFloors != null ? ` / ${listing.totalFloors}` : ''}`}
            />
          )}

          {listing.furnishingStatus && (
            <SpecCell
              icon={<Armchair className="h-4 w-4 text-muted-foreground" />}
              label="Furnishing"
              value={<span className="capitalize">{listing.furnishingStatus.replace(/_/g, ' ')}</span>}
            />
          )}

          {listing.parkingCount != null && (
            <SpecCell
              icon={<ParkingCircle className="h-4 w-4 text-muted-foreground" />}
              label="Parking"
              value={listing.parkingCount}
            />
          )}

          {listing.roadFrontageFt != null && (
            <SpecCell
              icon={<Ruler className="h-4 w-4 text-muted-foreground" />}
              label="Road Frontage"
              value={`${listing.roadFrontageFt} ft`}
            />
          )}

          {listing.commercialUsage && (
            <SpecCell
              icon={<Store className="h-4 w-4 text-muted-foreground" />}
              label="Usage"
              value={<span className="capitalize">{listing.commercialUsage}</span>}
            />
          )}

          {listing.numberOfUnits != null && (
            <SpecCell
              icon={<Building className="h-4 w-4 text-muted-foreground" />}
              label="Units"
              value={listing.numberOfUnits}
            />
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
      </CardContent>
    </Card>
  );
}
