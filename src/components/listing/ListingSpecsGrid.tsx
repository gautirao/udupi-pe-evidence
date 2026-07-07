import { BedDouble, Bath, Building2, Maximize2, Layers, Car, Ruler, Store, Users, CheckCircle, Compass } from 'lucide-react';
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
  // M38-13A (#1626)
  villa: 'villa',
  residential_plot: 'plot',
};

/** M38-13A (#1626) — facing labels for the public detail view (mirrors FACING_OPTIONS). */
const FACING_LABELS: Record<string, string> = {
  EAST: 'East',
  WEST: 'West',
  NORTH: 'North',
  SOUTH: 'South',
  NE: 'NE',
  NW: 'NW',
  SE: 'SE',
  SW: 'SW',
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
  // M38-13A (#1626) — apartment's primary area is Carpet area (design §3); all other
  // types keep the pre-existing built-up → carpet → land priority.
  const isApartment = listing.propertyType === 'apartment';
  const isHouseOrVilla = listing.propertyType === 'house' || listing.propertyType === 'villa';
  const isResidentialPlot = listing.propertyType === 'residential_plot';

  const areaValue = isApartment && listing.carpetArea != null
    ? { v: formatArea(listing.carpetArea, listing.carpetAreaUnit), l: 'Carpet area', tid: 'spec-carpet-area' }
    : listing.builtArea
    ? { v: formatArea(listing.builtArea, listing.builtAreaUnit), l: 'Built-up area', tid: 'spec-built-area' }
    : listing.carpetArea != null
    ? { v: formatArea(listing.carpetArea, listing.carpetAreaUnit), l: 'Carpet area', tid: 'spec-carpet-area' }
    : listing.landArea
    ? {
        v: formatArea(listing.landArea, listing.landAreaUnit),
        l: isResidentialPlot ? 'Plot area' : 'Land area',
        tid: 'spec-land-area',
      }
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
  } else if (listing.totalFloors != null) {
    // "Floors" tile (design §5 for house/villa) — kept type-agnostic so a type not
    // in TYPE_NOUN (unmapped-type fallback, #1797 AC6) still shows this field
    // rather than silently dropping it, reusing totalFloors (no separate
    // number-of-floors column exists on the backend).
    primarySpecs.push({
      icon: <Building2 className="h-5 w-5" />,
      value: listing.totalFloors,
      label: 'Floors',
      testId: 'spec-floors',
    });
  }

  // M38-13A (#1626) — residential_plot tiles: Plot area (above), Road width, Facing, Dimensions.
  if (isResidentialPlot) {
    if (listing.roadWidthFt != null) {
      primarySpecs.push({
        icon: <Ruler className="h-5 w-5" />,
        value: `${listing.roadWidthFt} ft`,
        label: 'Road width',
        testId: 'spec-road-width',
      });
    }
    if (listing.facing && FACING_LABELS[listing.facing]) {
      primarySpecs.push({
        icon: <Compass className="h-5 w-5" />,
        value: FACING_LABELS[listing.facing],
        label: 'Facing',
        testId: 'spec-facing',
      });
    }
    if (listing.plotDimensions) {
      primarySpecs.push({
        icon: <Maximize2 className="h-5 w-5" />,
        value: listing.plotDimensions,
        label: 'Dimensions',
        testId: 'spec-plot-dimensions',
      });
    }
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
  // M38-13A (#1626) — apartment "Super built-up" row (design §5 apartment rows:
  // "Built-up, Super built-up"). Code review fix: this was captured on create/edit
  // but never rendered on public detail. Null-gated, never fabricated.
  if (listing.superBuiltArea != null) {
    secondarySpecs.push({
      icon: <Maximize2 className="h-4 w-4" />,
      label: 'Super built-up',
      value: formatArea(listing.superBuiltArea, listing.superBuiltAreaUnit),
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

  // ── M38-13A (#1626) — residential typed-listing secondary rows ──────────────
  // Render only non-empty values; never fabricate a default for a null/absent field.
  if (!isResidentialPlot && listing.facing && FACING_LABELS[listing.facing]) {
    secondarySpecs.push({ icon: <Compass className="h-4 w-4" />, label: 'Facing', value: FACING_LABELS[listing.facing] });
  }
  if (listing.balconies != null) {
    secondarySpecs.push({ icon: <Building2 className="h-4 w-4" />, label: 'Balconies', value: listing.balconies });
  }
  if (listing.possessionStatus) {
    secondarySpecs.push({
      icon: <CheckCircle className="h-4 w-4" />,
      label: 'Property status',
      value: listing.possessionStatus.replace(/_/g, ' ').toLowerCase(),
    });
  }
  if (listing.parking2wCount != null) {
    secondarySpecs.push({ icon: <Car className="h-4 w-4" />, label: '2-wheeler parking', value: listing.parking2wCount });
  }
  if (listing.parking4wCount != null) {
    secondarySpecs.push({ icon: <Car className="h-4 w-4" />, label: '4-wheeler parking', value: listing.parking4wCount });
  }
  if (listing.hasLift != null) {
    secondarySpecs.push({ icon: <Building2 className="h-4 w-4" />, label: 'Lift', value: listing.hasLift ? 'Yes' : 'No' });
  }
  if (listing.hasPowerBackup != null) {
    secondarySpecs.push({ icon: <CheckCircle className="h-4 w-4" />, label: 'Power backup', value: listing.hasPowerBackup ? 'Yes' : 'No' });
  }
  if (listing.isGated != null) {
    secondarySpecs.push({ icon: <CheckCircle className="h-4 w-4" />, label: 'Gated community', value: listing.isGated ? 'Yes' : 'No' });
  }
  if (listing.propertyAge) {
    secondarySpecs.push({ icon: <CheckCircle className="h-4 w-4" />, label: 'Property age', value: listing.propertyAge.replace(/_/g, ' ').toLowerCase() });
  }
  if (listing.residentialWaterSource) {
    secondarySpecs.push({ icon: <CheckCircle className="h-4 w-4" />, label: 'Water source', value: listing.residentialWaterSource.replace(/_/g, ' ').toLowerCase() });
  }
  if (listing.hasGarden != null) {
    secondarySpecs.push({ icon: <CheckCircle className="h-4 w-4" />, label: 'Garden', value: listing.hasGarden ? 'Yes' : 'No' });
  }
  if (listing.hasTerrace != null) {
    secondarySpecs.push({ icon: <CheckCircle className="h-4 w-4" />, label: 'Terrace', value: listing.hasTerrace ? 'Yes' : 'No' });
  }
  if (listing.hasCompound != null) {
    secondarySpecs.push({ icon: <CheckCircle className="h-4 w-4" />, label: 'Compound wall', value: listing.hasCompound ? 'Yes' : 'No' });
  }
  if (listing.hasServantRoom != null) {
    secondarySpecs.push({ icon: <CheckCircle className="h-4 w-4" />, label: 'Servant room', value: listing.hasServantRoom ? 'Yes' : 'No' });
  }
  if (listing.projectName) {
    secondarySpecs.push({ icon: <Building2 className="h-4 w-4" />, label: 'Project/society', value: listing.projectName });
  }
  if (listing.builderName) {
    secondarySpecs.push({ icon: <Users className="h-4 w-4" />, label: 'Builder', value: listing.builderName });
  }
  if (listing.amenities && listing.amenities.length > 0) {
    secondarySpecs.push({
      icon: <CheckCircle className="h-4 w-4" />,
      label: 'Amenities',
      value: listing.amenities.map((a) => a.replace(/_/g, ' ').toLowerCase()).join(', '),
    });
  }
  if (listing.specialLocationViews && listing.specialLocationViews.length > 0) {
    secondarySpecs.push({
      icon: <CheckCircle className="h-4 w-4" />,
      label: 'Special location',
      value: listing.specialLocationViews.map((v) => v.replace(/_/g, ' ').toLowerCase()).join(', '),
    });
  }

  // Plot-only secondary rows (design §5 "Plot" rows).
  if (isResidentialPlot) {
    if (listing.isCornerPlot != null) {
      secondarySpecs.push({ icon: <CheckCircle className="h-4 w-4" />, label: 'Corner plot', value: listing.isCornerPlot ? 'Yes' : 'No' });
    }
    if (listing.hasBoundaryWall != null) {
      secondarySpecs.push({ icon: <CheckCircle className="h-4 w-4" />, label: 'Boundary wall', value: listing.hasBoundaryWall ? 'Yes' : 'No' });
    }
    if (listing.isGatedLayout != null) {
      secondarySpecs.push({ icon: <CheckCircle className="h-4 w-4" />, label: 'Gated layout', value: listing.isGatedLayout ? 'Yes' : 'No' });
    }
    if (listing.hasWaterConnection != null) {
      secondarySpecs.push({ icon: <CheckCircle className="h-4 w-4" />, label: 'Water connection', value: listing.hasWaterConnection ? 'Yes' : 'No' });
    }
    if (listing.hasElectricityConnection != null) {
      secondarySpecs.push({ icon: <CheckCircle className="h-4 w-4" />, label: 'Electricity connection', value: listing.hasElectricityConnection ? 'Yes' : 'No' });
    }
    if (listing.hasDrainage != null) {
      secondarySpecs.push({ icon: <CheckCircle className="h-4 w-4" />, label: 'Drainage', value: listing.hasDrainage ? 'Yes' : 'No' });
    }
    if (listing.conversionStatus) {
      secondarySpecs.push({ icon: <CheckCircle className="h-4 w-4" />, label: 'Conversion status', value: listing.conversionStatus.replace(/_/g, ' ').toLowerCase() });
    }
    if (listing.approvingAuthority) {
      secondarySpecs.push({ icon: <CheckCircle className="h-4 w-4" />, label: 'Approving authority', value: listing.approvingAuthority });
    }
    if (listing.khataNumber) {
      secondarySpecs.push({ icon: <CheckCircle className="h-4 w-4" />, label: 'Khata number', value: listing.khataNumber });
    }
    if (listing.propertyTaxPid) {
      secondarySpecs.push({ icon: <CheckCircle className="h-4 w-4" />, label: 'Tax PID', value: listing.propertyTaxPid });
    }
    if (listing.surveyNumber) {
      secondarySpecs.push({ icon: <CheckCircle className="h-4 w-4" />, label: 'Survey ref', value: listing.surveyNumber });
    }
  }
  // Type-agnostic (#1797 AC6 unmapped-type fallback): shown whenever present, not
  // gated to a known-type allowlist, so a future/unmapped property type still
  // surfaces this field instead of it being silently hidden.
  if (listing.ownershipType) {
    secondarySpecs.push({
      icon: <CheckCircle className="h-4 w-4" />,
      label: 'Ownership',
      value: listing.ownershipType.replace(/_/g, ' ').toLowerCase(),
    });
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
