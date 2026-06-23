import { BedDouble, Bath, Building2, Maximize2, Layers, Car, Ruler, Store, Users, CheckCircle } from 'lucide-react';
import { formatArea } from '@/lib/formatters';
import { cn } from '@/lib/utils';
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

function getOrdinalSuffix(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return 'th';
  switch (v % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

interface PrimarySpecCellProps {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
  testId: string;
}

function PrimarySpecCell({ icon, value, label, testId }: PrimarySpecCellProps) {
  return (
    <div
      data-testid={testId}
      className="flex flex-col gap-3 rounded-xl border border-border bg-muted/30 p-4"
    >
      <span className="text-foreground/60">{icon}</span>
      <div>
        <p className="text-2xl font-bold text-foreground leading-tight">{value}</p>
        <p className="mt-1 text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

interface SecondarySpec {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}

function SecondarySpecCard({ icon, label, value }: SecondarySpec) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border px-4 py-3 text-sm">
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="flex-1 min-w-0 border-b border-dashed border-border self-end mb-[3px] mx-1" />
      <span className="font-bold text-foreground shrink-0 capitalize">{value}</span>
    </div>
  );
}

export interface ListingSpecsGridProps {
  listing: PublicListingDetail;
}

export function ListingSpecsGrid({ listing }: ListingSpecsGridProps) {
  // ── Primary large specs ──────────────────────────────────────────────────────
  type PSpec = { icon: React.ReactNode; value: React.ReactNode; label: string; testId: string };
  const primarySpecs: PSpec[] = [];

  if (listing.bedrooms) {
    primarySpecs.push({
      icon: <BedDouble className="h-5 w-5" />,
      value: `${listing.bedrooms} BHK`,
      label: 'Bedrooms',
      testId: 'spec-bedrooms',
    });
  }
  if (listing.bathrooms) {
    primarySpecs.push({
      icon: <Bath className="h-5 w-5" />,
      value: listing.bathrooms,
      label: 'Bathrooms',
      testId: 'spec-bathrooms',
    });
  }
  const areaValue = listing.builtArea
    ? { v: formatArea(listing.builtArea, listing.builtAreaUnit), l: 'Built-up area', tid: 'spec-built-area' }
    : listing.carpetArea != null
    ? { v: formatArea(listing.carpetArea, listing.carpetAreaUnit), l: 'Carpet area', tid: 'spec-carpet-area' }
    : listing.landArea
    ? { v: formatArea(listing.landArea, listing.landAreaUnit), l: 'Land area', tid: 'spec-land-area' }
    : null;
  if (areaValue) {
    primarySpecs.push({
      icon: <Maximize2 className="h-5 w-5" />,
      value: areaValue.v,
      label: areaValue.l,
      testId: areaValue.tid,
    });
  }
  if (listing.floorNumber != null) {
    const n = listing.floorNumber;
    const suffix = getOrdinalSuffix(n);
    const floorValue = (
      <>
        {n}<sup className="text-sm ml-0.5">{suffix}</sup>
        {listing.totalFloors != null ? ` of ${listing.totalFloors}` : ''}
      </>
    );
    primarySpecs.push({
      icon: <Building2 className="h-5 w-5" />,
      value: floorValue,
      label: 'Floor',
      testId: 'spec-floor',
    });
  }

  // ── Secondary spec cards ─────────────────────────────────────────────────────
  const secondarySpecs: SecondarySpec[] = [];

  if (listing.furnishingStatus) {
    secondarySpecs.push({
      icon: <Layers className="h-4 w-4" />,
      label: 'Furnishing',
      value: listing.furnishingStatus.replace(/_/g, ' '),
    });
  }
  if (listing.parkingCount != null) {
    secondarySpecs.push({
      icon: <Car className="h-4 w-4" />,
      label: 'Parking',
      value: `${listing.parkingCount} covered`,
    });
  }
  if (listing.washrooms != null) {
    secondarySpecs.push({
      icon: <Bath className="h-4 w-4" />,
      label: 'Washrooms',
      value: listing.washrooms,
    });
  }
  if (listing.roadFrontageFt != null) {
    secondarySpecs.push({
      icon: <Ruler className="h-4 w-4" />,
      label: 'Road frontage',
      value: `${listing.roadFrontageFt} ft`,
    });
  }
  if (listing.commercialUsage) {
    secondarySpecs.push({
      icon: <Store className="h-4 w-4" />,
      label: 'Usage',
      value: listing.commercialUsage.replace(/_/g, ' '),
    });
  }
  if (listing.numberOfUnits != null) {
    secondarySpecs.push({
      icon: <Building2 className="h-4 w-4" />,
      label: 'Units',
      value: listing.numberOfUnits,
    });
  }
  if (listing.possessionStatus) {
    secondarySpecs.push({
      icon: <CheckCircle className="h-4 w-4" />,
      label: 'Availability',
      value: listing.possessionStatus.replace(/_/g, ' '),
    });
  }
  if (listing.sellerType) {
    secondarySpecs.push({
      icon: <Users className="h-4 w-4" />,
      label: 'Listed by',
      value: listing.sellerType.charAt(0).toUpperCase() + listing.sellerType.slice(1),
    });
  }
  if (listing.listingPurpose === 'rent') {
    if (listing.securityDepositMonths != null) {
      secondarySpecs.push({
        icon: <CheckCircle className="h-4 w-4" />,
        label: 'Security deposit',
        value: `${listing.securityDepositMonths} month${listing.securityDepositMonths !== 1 ? 's' : ''}`,
      });
    }
    if (listing.lockInMonths != null) {
      secondarySpecs.push({
        icon: <CheckCircle className="h-4 w-4" />,
        label: 'Lock-in period',
        value: `${listing.lockInMonths} month${listing.lockInMonths !== 1 ? 's' : ''}`,
      });
    }
  }

  if (!primarySpecs.length && !secondarySpecs.length) return null;

  const typeNoun = TYPE_NOUN[listing.propertyType] ?? 'this';

  return (
    <section
      className="rounded-2xl border border-border bg-card p-5 md:p-6"
      data-testid="listing-specs-grid"
    >
      <h2 className="font-serif text-xl font-semibold text-foreground">Property details</h2>
      <p className="mt-1 mb-5 text-sm text-muted-foreground">
        Shown for {typeNoun} listings — fields that don't apply to this property type are hidden.
      </p>

      {/* Primary large cells */}
      {primarySpecs.length > 0 && (
        <div
          className={cn(
            'grid gap-3',
            primarySpecs.length >= 4
              ? 'grid-cols-2 sm:grid-cols-4'
              : primarySpecs.length === 3
              ? 'grid-cols-2 sm:grid-cols-3'
              : `grid-cols-${primarySpecs.length}`,
          )}
        >
          {primarySpecs.map((s) => (
            <PrimarySpecCell key={s.testId} {...s} />
          ))}
        </div>
      )}

      {/* Secondary spec cards — individual bordered pills with icon + dotted separator + bold value */}
      {secondarySpecs.length > 0 && (
        <div className={cn('grid grid-cols-1 sm:grid-cols-2 gap-2', primarySpecs.length > 0 && 'mt-4')}>
          {secondarySpecs.map((s) => (
            <SecondarySpecCard key={s.label} {...s} />
          ))}
        </div>
      )}
    </section>
  );
}
