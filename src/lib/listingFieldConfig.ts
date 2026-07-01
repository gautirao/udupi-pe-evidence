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
  | 'possessionStatus';

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

/** All nine agricultural-land-specific fields. */
const AGRI_FIELDS: readonly ListingFieldKey[] = [
  'waterSource',
  'soilType',
  'roadAccess',
  'cultivationStatus',
  'ownershipType',
  'surveyNumber',
  'landCategory',
  'farmhouseAvailable',
  'fencingDone',
];

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
    // landArea + all nine agri-specific fields
    // NOTE: EXACT equality on 'agricultural_land' — no substring/prefix match.
    visibleFields: new Set<ListingFieldKey>(['landArea', ...AGRI_FIELDS]),
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
 *                                                  → listingPurpose === 'rent'
 * - all other keys                                 → present in the type's visibleFields set
 *
 * NOTE: Visibility governs rendering only. Validation logic, AreaField prop
 * construction, area unit defaults, and payload shaping remain unchanged
 * in NewListing.tsx / EditListing.tsx.
 */
export function isListingFieldVisible(
  fieldKey: ListingFieldKey,
  propertyType: PropertyType,
  listingPurpose: 'sale' | 'rent',
): boolean {
  const isResidenceType = propertyType === 'apartment' || propertyType === 'house' || propertyType === 'villa';
  const isResidentialFamily = isResidenceType || propertyType === 'residential_plot';

  switch (fieldKey) {
    case 'price':
      return listingPurpose === 'sale';
    case 'monthlyRent':
    case 'securityDepositMonths':
    case 'lockInMonths':
      return listingPurpose === 'rent';

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
