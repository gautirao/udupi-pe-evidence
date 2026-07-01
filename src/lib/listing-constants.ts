export const PROPERTY_TYPES = [
  { value: 'land', label: 'Land' },
  { value: 'agricultural_land', label: 'Agricultural Land' },
  { value: 'apartment', label: 'Apartment' },
  { value: 'house', label: 'House' },
  // M38-13A (#1626) — residential subtypes added for full design parity.
  { value: 'villa', label: 'Villa' },
  { value: 'residential_plot', label: 'Residential Plot' },
  { value: 'commercial', label: 'Commercial Shop/Office' },
  { value: 'commercial_building', label: 'Commercial Building' },
  { value: 'warehouse', label: 'Warehouse / Godown' },
  { value: 'commercial_land', label: 'Commercial Land' },
] as const;

export type PropertyType = (typeof PROPERTY_TYPES)[number]['value'];

/**
 * Canonical property-type token for agricultural land. Single source for the
 * discover read-path exclusion/forcing logic so the literal cannot drift across
 * hook sites (#1542, follow-up to #1463).
 */
export const AGRICULTURAL_LAND_PROPERTY_TYPE: PropertyType = 'agricultural_land';

export const COMMERCIAL_TYPES = new Set<string>([
  'commercial',
  'commercial_building',
  'warehouse',
  'commercial_land',
]);

export const FURNISHING_OPTIONS = [
  { value: 'unfurnished', label: 'Unfurnished' },
  { value: 'semi_furnished', label: 'Semi Furnished' },
  { value: 'furnished', label: 'Furnished' },
] as const;

// ---------------------------------------------------------------------------
// M38-13A (#1626) — residential typed-listing option vocabularies.
// Machine values mirror backend/.../listing/api/ResidentialFieldOptions.java
// exactly (source of truth); labels match the design spec (§1 controls
// vocabulary). Kept in sync with listing-field-options.json's "residential"
// section — see the FE/BE parity note there.
// ---------------------------------------------------------------------------

export const FACING_OPTIONS = [
  { value: 'EAST', label: 'East' },
  { value: 'WEST', label: 'West' },
  { value: 'NORTH', label: 'North' },
  { value: 'SOUTH', label: 'South' },
  { value: 'NE', label: 'NE' },
  { value: 'NW', label: 'NW' },
  { value: 'SE', label: 'SE' },
  { value: 'SW', label: 'SW' },
] as const;

export const PROPERTY_STATUS_OPTIONS = [
  { value: 'READY_TO_MOVE', label: 'Ready to move' },
  { value: 'UNDER_CONSTRUCTION', label: 'Under construction' },
] as const;

export const RESIDENTIAL_OWNERSHIP_OPTIONS = [
  { value: 'FREEHOLD', label: 'Freehold' },
  { value: 'COOPERATIVE_SOCIETY', label: 'Cooperative society' },
  { value: 'LEASEHOLD', label: 'Leasehold' },
  { value: 'POWER_OF_ATTORNEY', label: 'Power of attorney' },
] as const;

export const MAINTENANCE_INCLUDED_OPTIONS = [
  { value: 'INCLUDED', label: 'Included' },
  { value: 'EXCLUDED', label: 'Excluded' },
] as const;

export const AVAILABILITY_OPTIONS = [
  { value: 'IMMEDIATE', label: 'Immediate' },
  { value: 'WITHIN_15_DAYS', label: 'Within 15 days' },
  { value: 'WITHIN_30_DAYS', label: 'Within 30 days' },
  { value: 'AFTER_30_DAYS', label: 'After 30 days' },
] as const;

export const PREFERRED_TENANT_OPTIONS = [
  { value: 'NO_PREFERENCE', label: 'No preference' },
  { value: 'FAMILY', label: 'Family' },
  { value: 'STUDENTS', label: 'Students' },
  { value: 'PROFESSIONALS', label: 'Professionals' },
  { value: 'COMPANY_LEASE', label: 'Company lease' },
] as const;

export const CONVERSION_STATUS_OPTIONS = [
  { value: 'NOT_CONVERTED', label: 'Not converted' },
  { value: 'DC_CONVERTED', label: 'DC converted' },
  { value: 'RESIDENTIAL_ZONE', label: 'Residential zone' },
  { value: 'NOT_SURE', label: 'Not sure' },
] as const;

export const RESIDENTIAL_AREA_UNIT_OPTIONS = [
  { value: 'SQ_FT', label: 'Sq.ft' },
  { value: 'SQ_M', label: 'Sq.m' },
  { value: 'SQ_YD', label: 'Sq.yd' },
  { value: 'CENTS', label: 'Cents' },
  { value: 'ACRE', label: 'Acre' },
] as const;

/** Property age — design vocab (New / 1-5 years / 5-10 years / 10+ years). Free-text column, no backend enum. */
export const PROPERTY_AGE_OPTIONS = [
  { value: 'NEW', label: 'New' },
  { value: 'ONE_TO_FIVE_YEARS', label: '1–5 years' },
  { value: 'FIVE_TO_TEN_YEARS', label: '5–10 years' },
  { value: 'TEN_PLUS_YEARS', label: '10+ years' },
] as const;

/** Residential water source — design vocab (Municipal / Borewell / Both). Distinct from agri waterSource. */
export const RESIDENTIAL_WATER_SOURCE_OPTIONS = [
  { value: 'MUNICIPAL', label: 'Municipal' },
  { value: 'BOREWELL', label: 'Borewell' },
  { value: 'BOTH', label: 'Both' },
] as const;

/** Special-location views — multi-select, shared across all residential subtypes. Free-text codes (no backend enum). */
export const SPECIAL_LOCATION_VIEW_OPTIONS = [
  { value: 'BEACH_FACING', label: 'Beach-facing' },
  { value: 'SEA_VIEW', label: 'Sea-view' },
  { value: 'RIVER_FACING', label: 'River-facing' },
  { value: 'LAKE_VIEW', label: 'Lake-view' },
  { value: 'PARK_FACING', label: 'Park-facing' },
] as const;

/** Amenities — apartment/society list. Free-text codes (no backend enum; listing_amenities.code is unconstrained). */
export const APARTMENT_AMENITY_OPTIONS = [
  { value: 'GYM', label: 'Gym' },
  { value: 'SWIMMING_POOL', label: 'Swimming pool' },
  { value: 'CLUBHOUSE', label: 'Clubhouse' },
  { value: 'CHILDREN_PLAY_AREA', label: "Children's play area" },
  { value: 'SECURITY', label: '24x7 security' },
  { value: 'INTERCOM', label: 'Intercom' },
  { value: 'RAINWATER_HARVESTING', label: 'Rainwater harvesting' },
  { value: 'VISITOR_PARKING', label: 'Visitor parking' },
] as const;

/** Amenities — house/villa/community list. Free-text codes (no backend enum). */
export const HOUSE_VILLA_AMENITY_OPTIONS = [
  { value: 'RAINWATER_HARVESTING', label: 'Rainwater harvesting' },
  { value: 'SOLAR_PANEL', label: 'Solar panel' },
  { value: 'BOREWELL', label: 'Borewell' },
  { value: 'SECURITY', label: '24x7 security' },
  { value: 'SERVANT_QUARTERS', label: 'Servant quarters' },
  { value: 'GARDEN_SPACE', label: 'Garden space' },
] as const;
