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

export type PropertyType = (typeof PROPERTY_TYPES)[number]['value'] | 'other';

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
// Machine values mirror apps/api/.../listing/api/ResidentialFieldOptions.java
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

// ---------------------------------------------------------------------------
// #1684 [M38-13B] — commercial typed-listing option vocabularies.
// Machine VALUES are keyed 1:1 off the #1730 hard-enforcing (400 on unknown
// code) validateCommercialFields vocabulary, exposed via
// src/lib/listing-field-options.json's "commercial" section (source of
// truth, verified server-side by ListingFieldOptionsContractTest). Labels are
// FE display strings only. Kept in parity by
// src/lib/__tests__/listing-field-options.parity.test.ts (asserts these
// constants' value-sets exactly equal the JSON contract, mirroring the
// residential.furnishingStatus pattern).
// ---------------------------------------------------------------------------

/** commercialSubtype — explicit choice for propertyType 'commercial' (SHOP/OFFICE); BUILDING/WAREHOUSE/LAND are server-derived from propertyType and never sent explicitly. */
export const COMMERCIAL_SUBTYPE_OPTIONS = [
  { value: 'SHOP', label: 'Shop' },
  { value: 'OFFICE', label: 'Office' },
  { value: 'BUILDING', label: 'Commercial building' },
  { value: 'WAREHOUSE', label: 'Warehouse' },
  { value: 'LAND', label: 'Commercial land' },
] as const;

/** floorChoice — SHOP/OFFICE only. */
export const COMMERCIAL_FLOOR_CHOICE_OPTIONS = [
  { value: 'GROUND_FLOOR', label: 'Ground floor' },
  { value: 'FIRST_FLOOR', label: 'First floor' },
  { value: 'UPPER_FLOOR', label: 'Upper floor' },
  { value: 'MULTIPLE_FLOORS', label: 'Multiple floors' },
] as const;

/** floorMode — BUILDING only. */
export const COMMERCIAL_FLOOR_MODE_OPTIONS = [
  { value: 'GF_ONLY', label: 'Ground floor only' },
  { value: 'GF_PLUS_1', label: 'Ground + 1' },
  { value: 'MULTIPLE_FLOORS', label: 'Multiple floors' },
  { value: 'WHOLE_BUILDING', label: 'Whole building' },
  { value: 'CUSTOM', label: 'Custom' },
] as const;

/** hubType — shop-subtype vocabulary (SHOP only). */
export const SHOP_HUB_TYPE_OPTIONS = [
  { value: 'MALL', label: 'Mall' },
  { value: 'HIGH_STREET', label: 'High street' },
  { value: 'RETAIL_COMPLEX', label: 'Retail complex' },
  { value: 'STANDALONE_BUILDING', label: 'Standalone building' },
] as const;

/** hubType — office-subtype vocabulary (OFFICE only). */
export const OFFICE_HUB_TYPE_OPTIONS = [
  { value: 'BUSINESS_PARK', label: 'Business park' },
  { value: 'IT_PARK', label: 'IT park' },
  { value: 'COMMERCIAL_COMPLEX', label: 'Commercial complex' },
  { value: 'STANDALONE_BUILDING', label: 'Standalone building' },
] as const;

/** suitableUses — SHOP vocabulary. */
export const SHOP_SUITABLE_USE_OPTIONS = [
  { value: 'RETAIL', label: 'Retail' },
  { value: 'SHOWROOM', label: 'Showroom' },
  { value: 'GROCERY', label: 'Grocery' },
  { value: 'PHARMACY', label: 'Pharmacy' },
  { value: 'CLINIC', label: 'Clinic' },
  { value: 'SALON', label: 'Salon' },
  { value: 'RESTAURANT_CAFE', label: 'Restaurant / cafe' },
  { value: 'FOOD_OUTLET', label: 'Food outlet' },
  { value: 'FOOTWEAR', label: 'Footwear' },
  { value: 'ELECTRONICS', label: 'Electronics' },
  { value: 'JEWELLERY', label: 'Jewellery' },
  { value: 'OTHER', label: 'Other' },
] as const;

/** suitableUses — OFFICE vocabulary. */
export const OFFICE_SUITABLE_USE_OPTIONS = [
  { value: 'OFFICE', label: 'Office' },
  { value: 'CO_WORKING', label: 'Co-working' },
  { value: 'COACHING_TRAINING', label: 'Coaching / training' },
  { value: 'STUDIO', label: 'Studio' },
  { value: 'CLINIC', label: 'Clinic' },
  { value: 'IT_TECH', label: 'IT / tech' },
  { value: 'BACK_OFFICE', label: 'Back office' },
  { value: 'OTHER', label: 'Other' },
] as const;

/** suitableUses — BUILDING vocabulary. */
export const BUILDING_SUITABLE_USE_OPTIONS = [
  { value: 'RETAIL', label: 'Retail' },
  { value: 'OFFICE', label: 'Office' },
  { value: 'SHOWROOM', label: 'Showroom' },
  { value: 'MIXED_USE', label: 'Mixed use' },
  { value: 'HOSPITALITY', label: 'Hospitality' },
  { value: 'INSTITUTIONAL', label: 'Institutional' },
  { value: 'CLINIC_HEALTHCARE', label: 'Clinic / healthcare' },
  { value: 'OTHER', label: 'Other' },
] as const;

/** suitableUses — WAREHOUSE vocabulary. */
export const WAREHOUSE_SUITABLE_USE_OPTIONS = [
  { value: 'STORAGE', label: 'Storage' },
  { value: 'LOGISTICS', label: 'Logistics' },
  { value: 'DISTRIBUTION', label: 'Distribution' },
  { value: 'LIGHT_INDUSTRIAL', label: 'Light industrial' },
  { value: 'COLD_STORAGE', label: 'Cold storage' },
  { value: 'ECOMMERCE_FULFILMENT', label: 'E-commerce fulfilment' },
  { value: 'OTHER', label: 'Other' },
] as const;

/** suitableUses — LAND vocabulary. */
export const LAND_SUITABLE_USE_OPTIONS = [
  { value: 'RETAIL', label: 'Retail' },
  { value: 'OFFICE', label: 'Office' },
  { value: 'SHOWROOM', label: 'Showroom' },
  { value: 'WAREHOUSE', label: 'Warehouse' },
  { value: 'MIXED_USE_COMMERCIAL', label: 'Mixed-use commercial' },
  { value: 'HOSPITALITY', label: 'Hospitality' },
  { value: 'OTHER', label: 'Other' },
] as const;

/** utilities — persisted to shared listing_amenities; commercial-only codes. Not shown for LAND. */
export const COMMERCIAL_UTILITY_OPTIONS = [
  { value: 'POWER', label: 'Power' },
  { value: 'DG', label: 'DG backup' },
  { value: 'WATER_STORAGE', label: 'Water storage' },
  { value: 'INTERNET', label: 'Internet' },
  { value: 'CCTV', label: 'CCTV' },
  { value: 'SECURITY', label: 'Security' },
  { value: 'CAFETERIA', label: 'Cafeteria' },
  { value: 'RECEPTION', label: 'Reception' },
  { value: 'FIRE', label: 'Fire safety' },
  { value: 'AC', label: 'Air conditioning' },
] as const;

/** occupancyStatus — BUILDING only. */
export const COMMERCIAL_OCCUPANCY_STATUS_OPTIONS = [
  { value: 'VACANT', label: 'Vacant' },
  { value: 'PARTLY_OCCUPIED', label: 'Partly occupied' },
  { value: 'FULLY_OCCUPIED', label: 'Fully occupied' },
] as const;

/** commercialFurnishingStatus — not shown for LAND. */
export const COMMERCIAL_FURNISHING_STATUS_OPTIONS = [
  { value: 'UNFURNISHED', label: 'Unfurnished' },
  { value: 'SEMI_FURNISHED', label: 'Semi furnished' },
  { value: 'FURNISHED', label: 'Furnished' },
  { value: 'PLUG_AND_PLAY', label: 'Plug and play' },
] as const;

/** commercialOwnership — LAND only. */
export const COMMERCIAL_OWNERSHIP_OPTIONS = [
  { value: 'FREEHOLD', label: 'Freehold' },
  { value: 'LEASEHOLD', label: 'Leasehold' },
  { value: 'POWER_OF_ATTORNEY', label: 'Power of attorney' },
  { value: 'OTHER', label: 'Other' },
] as const;

/** availability (commercialAvailability) — all commercial types. */
export const COMMERCIAL_AVAILABILITY_OPTIONS = [
  { value: 'IMMEDIATE', label: 'Immediate' },
  { value: 'WITHIN_15_DAYS', label: 'Within 15 days' },
  { value: 'WITHIN_30_DAYS', label: 'Within 30 days' },
  { value: 'AFTER_30_DAYS', label: 'After 30 days' },
] as const;

/** warehouseFlooring — WAREHOUSE only. */
export const WAREHOUSE_FLOORING_OPTIONS = [
  { value: 'CONCRETE_RCC', label: 'Concrete (RCC)' },
  { value: 'TRIMIX', label: 'Trimix' },
  { value: 'EPOXY_COATED', label: 'Epoxy coated' },
  { value: 'KOTA_TILED', label: 'Kota tiled' },
  { value: 'OTHER', label: 'Other' },
] as const;

/** commercialAreaUnit — all commercial types. */
export const COMMERCIAL_AREA_UNIT_OPTIONS = [
  { value: 'SQ_FT', label: 'Sq.ft' },
  { value: 'SQ_M', label: 'Sq.m' },
  { value: 'SQ_YD', label: 'Sq.yd' },
  { value: 'ACRE', label: 'Acre' },
] as const;
