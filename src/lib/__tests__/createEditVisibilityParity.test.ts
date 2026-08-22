/**
 * createEditVisibilityParity.test.ts — #2281 AC6
 *
 * DURABLE GUARD against the original #2281 defect: Create (CommercialListingForm.tsx)
 * and Edit (EditListingForm.tsx / buildUpdatePayload.ts) must compute EQUIVALENT
 * visible-field-key sets for every (propertyType, explicitSubtype, listingPurpose)
 * combination. The bug this test exists to catch was never a wrong `isListingFieldVisible`
 * implementation — the function was always correct — it was that the EDIT call sites
 * (EditListingForm.tsx:267, buildUpdatePayload.ts's old makeUpdatePayloadCtx) omitted the
 * 4th `commercialSubtype` argument entirely, silently resolving every one of the 28
 * subtype-gated keys to `false`/omitted regardless of the real subtype.
 *
 * Methodology:
 *  - "Create" visible set: computed by calling `isListingFieldVisible` with all 4 args,
 *    mirroring CommercialListingForm.tsx:304-305 verbatim (`isListingFieldVisible(key,
 *    propertyType, listingPurpose, commercialSubtype)` — Create's fieldVisible has no other
 *    logic, so this IS the Create call site, not a re-implementation of it).
 *  - "Edit" visible set: computed via `makeUpdatePayloadCtx(...).fieldVisible`. As of the
 *    #2281 cycle-2 hardening pass, this IS the production closure — EditListingForm.tsx no
 *    longer declares its own separate `fieldVisible` for render; it calls
 *    `makeUpdatePayloadCtx(propertyType, listingPurpose, commercialSubtype)` once and uses
 *    the returned `fieldVisible` for BOTH rendering and the Step-1 payload build (see
 *    EditListingForm.tsx's `editCtx`). So this test exercises the exact same function
 *    reference the component runs in the browser — not a parallel implementation that merely
 *    mirrors it. If a future edit to `makeUpdatePayloadCtx` ever drops the 4th argument,
 *    `editCtx.fieldVisible` silently reverts to the pre-#2281 3-arg behaviour and THIS TEST
 *    FAILS for every resolved-subtype case below — and since there is now only one call
 *    site, there is no longer a second closure that could drift independently and go
 *    undetected.
 *
 * The final describe block reconstructs the pre-#2281 (3-arg) Edit behaviour INLINE
 * (never by editing shipped source) to prove this methodology is not vacuous — i.e. that
 * it would in fact have caught the original defect.
 */
import { describe, it, expect } from 'vitest';
import { isListingFieldVisible, deriveCommercialSubtype } from '@/lib/listingFieldConfig';
import type { ListingFieldKey, PropertyType, CommercialSubtype } from '@/lib/listingFieldConfig';
import { makeUpdatePayloadCtx } from '@/lib/editListing/buildUpdatePayload';

// ---------------------------------------------------------------------------
// Exhaustive ListingFieldKey enumeration — a Record<ListingFieldKey, true> forces
// a TypeScript compile error if the union in listingFieldConfig.ts ever gains a key
// that isn't added here, so this list cannot silently go stale.
// ---------------------------------------------------------------------------
const ALL_FIELD_KEYS_MAP: Record<ListingFieldKey, true> = {
  landArea: true,
  builtArea: true,
  carpetArea: true,
  bedrooms: true,
  floorNumber: true,
  totalFloors: true,
  numberOfUnits: true,
  furnishingStatus: true,
  washrooms: true,
  parkingCount: true,
  roadFrontageFt: true,
  commercialUsage: true,
  waterSource: true,
  soilType: true,
  roadAccess: true,
  cultivationStatus: true,
  ownershipType: true,
  surveyNumber: true,
  landCategory: true,
  agriConversionStatus: true,
  farmhouseAvailable: true,
  fencingDone: true,
  bathrooms: true,
  balconies: true,
  facing: true,
  superBuiltArea: true,
  propertyAge: true,
  residentialWaterSource: true,
  parking2wCount: true,
  parking4wCount: true,
  roadWidthFt: true,
  plotDimensions: true,
  conversionStatus: true,
  khataNumber: true,
  propertyTaxPid: true,
  approvingAuthority: true,
  projectName: true,
  builderName: true,
  hasLift: true,
  hasPowerBackup: true,
  isGated: true,
  hasGarden: true,
  hasTerrace: true,
  hasCompound: true,
  hasServantRoom: true,
  isCornerPlot: true,
  hasBoundaryWall: true,
  isGatedLayout: true,
  hasWaterConnection: true,
  hasElectricityConnection: true,
  hasDrainage: true,
  amenities: true,
  specialLocationViews: true,
  price: true,
  monthlyRent: true,
  securityDepositMonths: true,
  lockInMonths: true,
  maintenancePaise: true,
  maintenanceIncluded: true,
  priceNegotiable: true,
  rentNegotiable: true,
  petsAllowed: true,
  availabilityTimeline: true,
  preferredTenants: true,
  possessionStatus: true,
  commercialSubtype: true,
  floorChoice: true,
  hubType: true,
  floorMode: true,
  powerLoadKva: true,
  occupancyStatus: true,
  officeSeats: true,
  officeCabins: true,
  officeMeetingRooms: true,
  warehouseClearHeightFt: true,
  warehouseLoadingBays: true,
  warehouseTruckAccess: true,
  warehouseFlooring: true,
  commercialZoning: true,
  commercialOwnership: true,
  commercialApprovals: true,
  washroomsPublic: true,
  washroomsPrivate: true,
  parkingPublicCount: true,
  parkingPrivateCount: true,
  commercialFurnishingStatus: true,
  utilities: true,
  suitableUses: true,
  commercialAvailability: true,
  commercialAreaUnit: true,
  expectedRentalYieldPct: true,
  currentMonthlyIncomePaise: true,
  leaseTermMonths: true,
  leaseEscalationPct: true,
};
const ALL_FIELD_KEYS = Object.keys(ALL_FIELD_KEYS_MAP) as ListingFieldKey[];

// Selectable PropertyTypes (excludes 'other' — a type-only DB superset member, never
// user-selectable per listingFieldConfig.ts CONFIG_MAP comment).
const ALL_PROPERTY_TYPES: PropertyType[] = [
  'land',
  'agricultural_land',
  'apartment',
  'house',
  'villa',
  'residential_plot',
  'commercial',
  'commercial_building',
  'warehouse',
  'commercial_land',
];

const ALL_EXPLICIT_SUBTYPES: Array<'' | 'SHOP' | 'OFFICE'> = ['', 'SHOP', 'OFFICE'];
const ALL_PURPOSES: Array<'sale' | 'rent' | 'lease'> = ['sale', 'rent', 'lease'];

/** Create's fieldVisible — mirrors CommercialListingForm.tsx:304-305 verbatim. */
function createVisibleKeys(
  propertyType: PropertyType,
  listingPurpose: 'sale' | 'rent' | 'lease',
  commercialSubtype: CommercialSubtype | undefined,
): Set<ListingFieldKey> {
  return new Set(
    ALL_FIELD_KEYS.filter((k) => isListingFieldVisible(k, propertyType, listingPurpose, commercialSubtype)),
  );
}

/** Edit's fieldVisible — the actual production-shared helper (buildUpdatePayload.ts). */
function editVisibleKeys(
  propertyType: PropertyType,
  listingPurpose: 'sale' | 'rent' | 'lease',
  commercialSubtype: CommercialSubtype | undefined,
): Set<ListingFieldKey> {
  const ctx = makeUpdatePayloadCtx(propertyType, listingPurpose, commercialSubtype);
  return new Set(ALL_FIELD_KEYS.filter((k) => ctx.fieldVisible(k)));
}

interface Case {
  propertyType: PropertyType;
  explicitSubtype: '' | 'SHOP' | 'OFFICE';
  listingPurpose: 'sale' | 'rent' | 'lease';
}

const CASES: Case[] = [];
for (const propertyType of ALL_PROPERTY_TYPES) {
  for (const listingPurpose of ALL_PURPOSES) {
    if (propertyType === 'commercial') {
      // Only 'commercial' takes an explicit SHOP/OFFICE choice; exercise the
      // unresolved ('') case too (AC5's "not yet chosen" state).
      for (const explicitSubtype of ALL_EXPLICIT_SUBTYPES) {
        CASES.push({ propertyType, explicitSubtype, listingPurpose });
      }
    } else {
      CASES.push({ propertyType, explicitSubtype: '', listingPurpose });
    }
  }
}

describe('Create/Edit visibility parity (#2281 AC6)', () => {
  it.each(CASES)(
    '$propertyType / explicitSubtype=$explicitSubtype / $listingPurpose: Create and Edit compute IDENTICAL visible-key sets',
    ({ propertyType, explicitSubtype, listingPurpose }) => {
      const commercialSubtype = deriveCommercialSubtype(propertyType, explicitSubtype);
      const create = createVisibleKeys(propertyType, listingPurpose, commercialSubtype);
      const edit = editVisibleKeys(propertyType, listingPurpose, commercialSubtype);

      expect([...edit].sort()).toEqual([...create].sort());
    },
  );

  // -------------------------------------------------------------------------
  // Methodology validity canary — proves the parity check above is not vacuous.
  // Reconstructs the PRE-#2281 buggy Edit behaviour (3-arg isListingFieldVisible
  // call, commercialSubtype never threaded) INLINE — never by editing shipped
  // source — and shows it would have diverged from Create, i.e. this exact
  // parity methodology would have caught the original argument-list drift.
  // -------------------------------------------------------------------------
  describe('regression canary — the pre-#2281 3-arg Edit call site would have failed this test', () => {
    it('OFFICE subtype: buggy 3-arg Edit omits officeSeats/floorChoice/hubType that Create shows', () => {
      const propertyType: PropertyType = 'commercial';
      const listingPurpose = 'sale' as const;
      const commercialSubtype: CommercialSubtype = 'OFFICE';

      const create = createVisibleKeys(propertyType, listingPurpose, commercialSubtype);
      // Pre-#2281 buggy Edit closure — EXACTLY EditListingForm.tsx:267 / the old
      // makeUpdatePayloadCtx before #2281 (approved-plan.toml evidence.call_sites):
      // `isListingFieldVisible(key, propertyType, listingPurpose)` — no 4th arg.
      const buggyEdit = new Set(
        ALL_FIELD_KEYS.filter((k) => isListingFieldVisible(k, propertyType, listingPurpose)),
      );

      expect([...buggyEdit].sort()).not.toEqual([...create].sort());
      expect(create.has('officeSeats')).toBe(true);
      expect(buggyEdit.has('officeSeats')).toBe(false);
      expect(create.has('floorChoice')).toBe(true);
      expect(buggyEdit.has('floorChoice')).toBe(false);
      expect(create.has('hubType')).toBe(true);
      expect(buggyEdit.has('hubType')).toBe(false);
    });

    it('LAND subtype: buggy 3-arg Edit omits commercialZoning/commercialOwnership/commercialApprovals that Create shows', () => {
      const propertyType: PropertyType = 'commercial_land';
      const listingPurpose = 'sale' as const;
      const commercialSubtype: CommercialSubtype = 'LAND';

      const create = createVisibleKeys(propertyType, listingPurpose, commercialSubtype);
      const buggyEdit = new Set(
        ALL_FIELD_KEYS.filter((k) => isListingFieldVisible(k, propertyType, listingPurpose)),
      );

      expect([...buggyEdit].sort()).not.toEqual([...create].sort());
      expect(create.has('commercialZoning')).toBe(true);
      expect(buggyEdit.has('commercialZoning')).toBe(false);
    });

    it('non-commercial types are UNAFFECTED by the arg drift (residential/agri regression scope check)', () => {
      // deriveCommercialSubtype always returns undefined for non-commercial types, so
      // the 3-arg vs 4-arg call sites are identical here — confirms the historical bug
      // (and this parity test) is scoped to the commercial family only.
      const create = createVisibleKeys('apartment', 'sale', undefined);
      const buggyEdit = new Set(
        ALL_FIELD_KEYS.filter((k) => isListingFieldVisible(k, 'apartment', 'sale')),
      );
      expect([...buggyEdit].sort()).toEqual([...create].sort());
    });
  });
});
