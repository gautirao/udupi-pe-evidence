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
  // Purpose-gated (listingPurpose drives visibility, not propertyType)
  | 'price'
  | 'monthlyRent'
  | 'securityDepositMonths'
  | 'lockInMonths';

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
// Config map — all 8 PropertyType values are covered exhaustively
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
    visibleFields: new Set<ListingFieldKey>(['builtArea', 'bedrooms']),
  },

  house: {
    visibleFields: new Set<ListingFieldKey>(['builtArea', 'bedrooms']),
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
 * All 8 types are covered; the Record type enforces exhaustiveness at compile time.
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
  switch (fieldKey) {
    case 'price':
      return listingPurpose === 'sale';
    case 'monthlyRent':
    case 'securityDepositMonths':
    case 'lockInMonths':
      return listingPurpose === 'rent';
    default:
      return CONFIG_MAP[propertyType].visibleFields.has(fieldKey);
  }
}
