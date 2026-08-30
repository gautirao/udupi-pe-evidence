/**
 * listingFieldConfig.ts — M38-12A
 *
 * Per-property-type field-visibility config foundation.
 * Centralises which optional fields are rendered for each property type and
 * listing purpose, replacing scattered `propertyType === 'x' || ...` checks
 * in NewListing.tsx (and optionally EditListing.tsx).
 *
 * Invariants:
 * - Agri select option VALUES are NOT changed here; this module only governs
 *   render visibility. The divergent display-string values (soilType, roadAccess,
 *   cultivationStatus, ownershipType) are preserved in NewListing.tsx as-is.
 * - Validation, required flags, and min/max constraints stay inline in page
 *   components — this config has NO validation logic.
 * - AreaField prop construction and unit defaults are unchanged.
 * - PropertyType is re-exported from listing-constants.ts — no re-hardcoding.
 */
import type { PropertyType } from '@/lib/listing-constants';

export type { PropertyType };

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * All field keys whose render-visibility is managed by this config.
 * Always-visible fields (title, locality, description, propertyType,
 * listingPurpose) are omitted.
 */
export type ListingFieldKey =
  // Area fields
  | 'landArea'
  | 'builtArea'
  | 'carpetArea'
  // Layout
  | 'bedrooms'
  | 'floorNumber'
  | 'totalFloors'
  | 'numberOfUnits'
  // Commercial extras
  | 'furnishingStatus'
  | 'washrooms'
  | 'parkingCount'
  | 'roadFrontageFt'
  | 'commercialUsage'
  // Agricultural land block (shown only for agricultural_land)
  | 'waterSource'
  | 'soilType'
  | 'roadAccess'
  | 'cultivationStatus'
  | 'ownershipType'
  | 'surveyNumber'
  | 'landCategory'
  | 'agriConversionStatus'
  | 'farmhouseAvailable'
  | 'fencingDone'
  // M38-13A (#1626) — residential typed-listing fields (apartment/house/villa/residential_plot)
  | 'bathrooms'
  | 'balconies'
  | 'facing'
  | 'superBuiltArea'
  | 'propertyAge'
  | 'residentialWaterSource'
  | 'parking2wCount'
  | 'parking4wCount'
  | 'roadWidthFt'
  | 'plotDimensions'
  | 'conversionStatus'
  | 'khataNumber'
  | 'propertyTaxPid'
  | 'approvingAuthority'
  | 'projectName'
  | 'builderName'
  | 'hasLift'
  | 'hasPowerBackup'
  | 'isGated'
  | 'hasGarden'
  | 'hasTerrace'
  | 'hasCompound'
  | 'hasServantRoom'
  | 'isCornerPlot'
  | 'hasBoundaryWall'
  | 'isGatedLayout'
  | 'hasWaterConnection'
  | 'hasElectricityConnection'
  | 'hasDrainage'
  | 'amenities'
  | 'specialLocationViews'
  // Purpose-gated (listingPurpose drives visibility, not propertyType)
  | 'price'
  | 'monthlyRent'
  | 'securityDepositMonths'
  | 'lockInMonths'
  // M38-13A — purpose-gated + sale/residence-gated residential fields
  | 'maintenancePaise'
  | 'maintenanceIncluded'
  | 'priceNegotiable'
  | 'rentNegotiable'
  | 'petsAllowed'
  | 'availabilityTimeline'
  | 'preferredTenants'
  | 'possessionStatus'
  // #1684 [M38-13B] — commercial typed-listing fields. Visibility mirrors the
  // #1730 hard-enforcing validateCommercialFields gate EXACTLY (see
  // isListingFieldVisible's commercialSubtype switch below) — a field must
  // never render for a subtype/purpose the backend would 400 on.
  | 'commercialSubtype'
  | 'floorChoice'
  | 'hubType'
  | 'floorMode'
  | 'powerLoadKva'
  | 'occupancyStatus'
  | 'officeSeats'
  | 'officeCabins'
  | 'officeMeetingRooms'
  | 'warehouseClearHeightFt'
  | 'warehouseLoadingBays'
  | 'warehouseTruckAccess'
  | 'warehouseFlooring'
  | 'commercialZoning'
  | 'commercialOwnership'
  | 'commercialApprovals'
  | 'washroomsPublic'
  | 'washroomsPrivate'
  | 'parkingPublicCount'
  | 'parkingPrivateCount'
  | 'commercialFurnishingStatus'
  | 'utilities'
  | 'suitableUses'
  | 'commercialAvailability'
  | 'commercialAreaUnit'
  // Purpose-gated commercial financials
  | 'expectedRentalYieldPct'
  | 'currentMonthlyIncomePaise'
  | 'leaseTermMonths'
  | 'leaseEscalationPct';

/**
 * #1684 [M38-13B] — the four commercial subtype tokens enforced server-side by
 * validateCommercialFields. SHOP/OFFICE are an explicit broker choice
 * (propertyType 'commercial'); BUILDING/WAREHOUSE/LAND are DERIVED from
 * propertyType and must never be sent as an explicit commercialSubtype.
 */
export type CommercialSubtype = 'SHOP' | 'OFFICE' | 'BUILDING' | 'WAREHOUSE' | 'LAND';

/**
 * Resolves the effective commercial subtype for field-visibility purposes.
 * Mirrors the server derivation: commercial_building -> BUILDING,
 * warehouse -> WAREHOUSE, commercial_land -> LAND. For propertyType
 * 'commercial' the subtype is whatever the broker explicitly picked
 * (SHOP/OFFICE), or undefined until they do.
 */
export function deriveCommercialSubtype(
  propertyType: PropertyType,
  explicitSubtype: CommercialSubtype | '',
): CommercialSubtype | undefined {
  if (propertyType === 'commercial_building') return 'BUILDING';
  if (propertyType === 'warehouse') return 'WAREHOUSE';
  if (propertyType === 'commercial_land') return 'LAND';
  if (propertyType === 'commercial') return explicitSubtype || undefined;
  return undefined;
}

/**
 * Field-visibility config for a single property type.
 *
 * `visibleFields` contains type-specific optional field keys.
 * Purpose-gated fields (price, monthlyRent, securityDepositMonths,
 * lockInMonths) are NOT in visibleFields — they are resolved from
 * listingPurpose inside isListingFieldVisible().
 */
export interface ListingFieldConfig {
  readonly visibleFields: ReadonlySet<ListingFieldKey>;
}

// ---------------------------------------------------------------------------
// Internal helpers — grouped to avoid repeating the same key lists
// ---------------------------------------------------------------------------

/** All ten agricultural-land-specific fields. */
const AGRI_FIELDS: readonly ListingFieldKey[] = [
  'waterSource',
  'soilType',
  'roadAccess',
  'cultivationStatus',
  'ownershipType',
  'surveyNumber',
  'landCategory',
  // #2043 — agricultural_land-only, unlike landCategory (which PLOT also accepts).
  'agriConversionStatus',
  'farmhouseAvailable',
  'fencingDone',
];

/**
 * Issue #1627 — 'facing' for agricultural_land. Confirmed against
 * ListingController's validateFamilyFields/validateResidentialFieldSet: the
 * AGRICULTURAL family does NOT reject 'facing' (unlike bedrooms/parkingCount/
 * furnishingStatus, which ARE rejected for this family), so it has a real,
 * non-throwing write path via the shared 'facing' column. Kept as its own
 * array (not folded into AGRI_FIELDS) since it is additive to the #1458
 * agri field set, not one of the original 9.
 */
const AGRI_FACING_FIELD: readonly ListingFieldKey[] = ['facing'];

/**
 * Fields shown for commercial, commercial_building, warehouse
 * (i.e. isCommercialType && propertyType !== 'commercial_land').
 */
const COMMERCIAL_NON_LAND_FIELDS: readonly ListingFieldKey[] = [
  'furnishingStatus',
  'washrooms',
  'parkingCount',
];

/**
 * Fields shown for all four commercial types
 * (commercial, commercial_building, warehouse, commercial_land).
 */
const COMMERCIAL_ALL_FIELDS: readonly ListingFieldKey[] = [
  'roadFrontageFt',
  'commercialUsage',
];

// ---------------------------------------------------------------------------
// M38-13A (#1626) — residential typed-listing field groups.
// Derived 1:1 from design-spec.md §3 (type-adaptive field matrix) and verified
// against the backend's validateFamilyFields/validateResidentialFieldSet
// (ListingController.java) so FE visibility never renders a field the backend
// would reject with 400. See listingFieldConfig.test.ts for the parity test.
// ---------------------------------------------------------------------------

/** Fields shown for apartment/flat only (design §3 "Apartment" column). */
const APARTMENT_ONLY_FIELDS: readonly ListingFieldKey[] = [
  'balconies',
  'floorNumber',
  'totalFloors',
  'superBuiltArea',
  'hasLift',
  'hasPowerBackup',
];

/**
 * Fields shown for house/villa only (design §3 "House/Villa" column). Villa uses the
 * identical set to house — the design matrix has no house-vs-villa distinction.
 * `totalFloors` is reused here as "Number of floors" (design §3) — there is no
 * separate backend column; the label is rendered conditionally in EditListing.tsx.
 */
const HOUSE_VILLA_ONLY_FIELDS: readonly ListingFieldKey[] = [
  'totalFloors',
  'propertyAge',
  'residentialWaterSource',
  'hasGarden',
  'hasTerrace',
  'hasCompound',
  'hasServantRoom',
];

/** Fields shared by apartment AND house/villa (residence-unit fields), never shown for residential_plot. */
const RESIDENCE_SHARED_FIELDS: readonly ListingFieldKey[] = [
  'bedrooms',
  'bathrooms',
  'furnishingStatus',
  'facing',
  'parking2wCount',
  'parking4wCount',
  'isGated',
  'amenities',
  'specialLocationViews',
  'projectName',
  'builderName',
  'ownershipType',
];

/** Fields shown only for residential_plot (design §3 "Plot" column). */
const PLOT_ONLY_FIELDS: readonly ListingFieldKey[] = [
  'facing',
  'plotDimensions',
  'roadWidthFt',
  'isCornerPlot',
  'hasBoundaryWall',
  'isGatedLayout',
  'hasWaterConnection',
  'hasElectricityConnection',
  'hasDrainage',
  'ownershipType',
  'conversionStatus',
  'khataNumber',
  'propertyTaxPid',
  'approvingAuthority',
  'surveyNumber',
  'specialLocationViews',
];

// ---------------------------------------------------------------------------
// Config map — all 10 PropertyType values are covered exhaustively
// ---------------------------------------------------------------------------

const CONFIG_MAP: Record<PropertyType, ListingFieldConfig> = {
  land: {
    visibleFields: new Set<ListingFieldKey>(['landArea']),
  },

  agricultural_land: {
    // landArea + all nine agri-specific fields + facing (#1627)
    // NOTE: EXACT equality on 'agricultural_land' — no substring/prefix match.
    visibleFields: new Set<ListingFieldKey>(['landArea', ...AGRI_FIELDS, ...AGRI_FACING_FIELD]),
  },

  apartment: {
    // Primary area = carpetArea (design §3); builtArea/superBuiltArea are optional extras.
    visibleFields: new Set<ListingFieldKey>([
      'carpetArea',
      'builtArea',
      ...RESIDENCE_SHARED_FIELDS,
      ...APARTMENT_ONLY_FIELDS,
    ]),
  },

  house: {
    // Primary area = builtArea (design §3); landArea (plot area) is an optional extra.
    visibleFields: new Set<ListingFieldKey>([
      'builtArea',
      'landArea',
      ...RESIDENCE_SHARED_FIELDS,
      ...HOUSE_VILLA_ONLY_FIELDS,
    ]),
  },

  // M38-13A (#1626) — villa uses the identical visibility set to house (design §3 has no
  // house-vs-villa distinction; both are the "House/Villa" column).
  villa: {
    visibleFields: new Set<ListingFieldKey>([
      'builtArea',
      'landArea',
      ...RESIDENCE_SHARED_FIELDS,
      ...HOUSE_VILLA_ONLY_FIELDS,
    ]),
  },

  // M38-13A (#1626) — residential_plot validates as the PLOT family (rejects every
  // residence-unit field); primary area = landArea (reused as "plot area").
  residential_plot: {
    visibleFields: new Set<ListingFieldKey>([
      'landArea',
      ...PLOT_ONLY_FIELDS,
    ]),
  },

  commercial: {
    // carpetArea + floorNumber + furnishing/washrooms/parking + road frontage/usage
    visibleFields: new Set<ListingFieldKey>([
      'carpetArea',
      'floorNumber',
      ...COMMERCIAL_NON_LAND_FIELDS,
      ...COMMERCIAL_ALL_FIELDS,
    ]),
  },

  commercial_building: {
    visibleFields: new Set<ListingFieldKey>([
      'landArea',
      'builtArea',
      'totalFloors',
      'numberOfUnits',
      ...COMMERCIAL_NON_LAND_FIELDS,
      ...COMMERCIAL_ALL_FIELDS,
    ]),
  },

  warehouse: {
    visibleFields: new Set<ListingFieldKey>([
      'landArea',
      'builtArea',
      'numberOfUnits',
      ...COMMERCIAL_NON_LAND_FIELDS,
      ...COMMERCIAL_ALL_FIELDS,
    ]),
  },

  commercial_land: {
    // land area + road frontage/usage; no furnishing/washrooms/parking
    visibleFields: new Set<ListingFieldKey>([
      'landArea',
      ...COMMERCIAL_ALL_FIELDS,
    ]),
  },

  // Type-only superset member (DB CHECK allows it); not in PROPERTY_TYPES, so
  // it is never user-selectable. Minimal fallback mirroring 'land'.
  other: {
    visibleFields: new Set<ListingFieldKey>(['landArea']),
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the resolved field-visibility config for the given property type.
 * All 10 types are covered; the Record type enforces exhaustiveness at compile time.
 */
export function getListingFieldConfig(propertyType: PropertyType): ListingFieldConfig {
  return CONFIG_MAP[propertyType];
}

/**
 * Returns true if `fieldKey` should be rendered for the given property type
 * and listing purpose.
 *
 * Visibility rules:
 * - 'price'                                        → listingPurpose === 'sale'
 * - 'monthlyRent' | 'securityDepositMonths' | 'lockInMonths'
 *                                                  → listingPurpose === 'rent' | 'lease'
 * - all other keys                                 → present in the type's visibleFields set
 *
 * `commercialSubtype` is required (4th param) to resolve any of the #1684
 * commercial-only field keys — it is ignored for residential/agri/land keys.
 *
 * NOTE: Visibility governs rendering only. Validation logic, AreaField prop
 * construction, area unit defaults, and payload shaping remain unchanged
 * in NewListing.tsx / EditListing.tsx / CommercialListingForm.tsx.
 */
export function isListingFieldVisible(
  fieldKey: ListingFieldKey,
  propertyType: PropertyType,
  listingPurpose: 'sale' | 'rent' | 'lease',
  commercialSubtype?: CommercialSubtype,
): boolean {
  const isResidenceType = propertyType === 'apartment' || propertyType === 'house' || propertyType === 'villa';
  const isResidentialFamily = isResidenceType || propertyType === 'residential_plot';
  const isCommercialFamily = propertyType === 'commercial' || propertyType === 'commercial_building'
    || propertyType === 'warehouse' || propertyType === 'commercial_land';

  switch (fieldKey) {
    case 'price':
      return listingPurpose === 'sale';
    case 'monthlyRent':
    case 'securityDepositMonths':
    case 'lockInMonths':
      // #1684 — commercial RENT and LEASE purposes both use the recurring-rent fields.
      return listingPurpose === 'rent' || listingPurpose === 'lease';

    // ── #1684 [M38-13B] — commercial typed-listing fields. Gating mirrors
    // ListingController.validateCommercialFields EXACTLY (see class doc above).
    case 'commercialSubtype':
      // Only 'commercial' takes an explicit subtype choice (SHOP/OFFICE);
      // BUILDING/WAREHOUSE/LAND are derived from propertyType and never shown.
      return propertyType === 'commercial';
    case 'floorChoice':
    case 'hubType':
      return commercialSubtype === 'SHOP' || commercialSubtype === 'OFFICE';
    case 'floorMode':
    case 'powerLoadKva':
      return commercialSubtype === 'BUILDING';
    case 'occupancyStatus':
      // Backend CommercialFieldOptions.VALID_OCCUPANCY_STATUSES / ListingController's
      // isShopOrBuilding gate permit occupancyStatus for SHOP and BUILDING (not office/
      // warehouse/land) — wider than floorMode/powerLoadKva, which stay BUILDING-only.
      return commercialSubtype === 'SHOP' || commercialSubtype === 'BUILDING';
    case 'officeSeats':
    case 'officeCabins':
    case 'officeMeetingRooms':
      return commercialSubtype === 'OFFICE';
    case 'warehouseClearHeightFt':
    case 'warehouseLoadingBays':
    case 'warehouseTruckAccess':
    case 'warehouseFlooring':
      return commercialSubtype === 'WAREHOUSE';
    case 'commercialZoning':
    case 'commercialOwnership':
    case 'commercialApprovals':
      return commercialSubtype === 'LAND';
    // Built-space fields — every commercial subtype EXCEPT LAND (the backend
    // rejects these for LAND).
    case 'washroomsPublic':
    case 'washroomsPrivate':
    case 'parkingPublicCount':
    case 'parkingPrivateCount':
    case 'commercialFurnishingStatus':
    case 'utilities':
      return isCommercialFamily && commercialSubtype !== 'LAND' && commercialSubtype !== undefined;
    // Shown for every commercial subtype once resolved (no LAND exclusion).
    case 'suitableUses':
    case 'commercialAvailability':
    case 'commercialAreaUnit':
      return isCommercialFamily && commercialSubtype !== undefined;
    // Purpose-gated commercial financials (design mirrors #1730's
    // validateCommercialFields purpose gate: SALE -> yield/income only;
    // RENT/LEASE -> lease term/escalation only).
    case 'expectedRentalYieldPct':
    case 'currentMonthlyIncomePaise':
      return isCommercialFamily && commercialSubtype !== undefined && listingPurpose === 'sale';
    case 'leaseTermMonths':
    case 'leaseEscalationPct':
      return isCommercialFamily && commercialSubtype !== undefined
        && (listingPurpose === 'rent' || listingPurpose === 'lease');

    // M38-13A (#1626) — sale vs rent conditional (design §4). All four gated on the
    // residential family (apartment/house/villa/residential_plot) — none of these
    // fields exist for commercial/agricultural (backend rejects them there).
    case 'maintenancePaise':
    case 'priceNegotiable':
      return isResidentialFamily && listingPurpose === 'sale';
    case 'maintenanceIncluded':
    case 'rentNegotiable':
    case 'petsAllowed':
    case 'availabilityTimeline':
    case 'preferredTenants':
      return isResidentialFamily && listingPurpose === 'rent';

    // Property status (reuses possession_status) — sale AND residence only
    // (never rent, never residential_plot). design §4.
    case 'possessionStatus':
      return isResidenceType && listingPurpose === 'sale';

    // Ownership type — sale-only for apartment/house/villa (design §3: "(sale)");
    // unconditional (any purpose) for residential_plot and legacy agri types
    // (design §3: plot column shows "✓" with no purpose qualifier). Must still be
    // present in the type's visibleFields set.
    case 'ownershipType': {
      if (!CONFIG_MAP[propertyType].visibleFields.has('ownershipType')) return false;
      if (isResidenceType) return listingPurpose === 'sale';
      return true;
    }

    default:
      return CONFIG_MAP[propertyType].visibleFields.has(fieldKey);
  }
}
