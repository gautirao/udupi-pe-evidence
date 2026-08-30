// Label maps for canonical agri field machine values → display strings
// Used by AgriSpecRows, AgriListingDetail, and EditListing

export const WATER_SOURCE_LABELS: Record<string, string> = {
  BOREWELL: 'Borewell',
  WELL: 'Open well',
  RIVER: 'River',
  RAIN_FED: 'Rain-fed',
  POND: 'Pond',
  STREAM: 'Stream',
  NOT_AVAILABLE: 'Not available',
  OTHER: 'Other',
};

export const SOIL_TYPE_LABELS: Record<string, string> = {
  RED_LATERITE: 'Red laterite',
  BLACK_COTTON: 'Black cotton',
  ALLUVIAL: 'Alluvial',
  SANDY_LOAM: 'Sandy loam',
  CLAY: 'Clay',
  OTHER: 'Other',
};

export const ROAD_ACCESS_LABELS: Record<string, string> = {
  TARRED_ROAD: 'Tarred road',
  KACHCHA_ROAD: 'Kachcha road',
  HIGHWAY_FRONTAGE: 'Highway frontage',
  NO_ROAD_ACCESS: 'No road access',
  OTHER: 'Other',
};

export const CULTIVATION_STATUS_LABELS: Record<string, string> = {
  CULTIVATED: 'Cultivated',
  FALLOW: 'Fallow',
  ARECA_PLANTATION: 'Areca plantation',
  COCONUT_PLANTATION: 'Coconut plantation',
  PARTIALLY_CULTIVATED: 'Partially cultivated',
  OTHER: 'Other',
};

export const OWNERSHIP_TYPE_LABELS: Record<string, string> = {
  FREEHOLD: 'Freehold',
  INHERITED: 'Inherited',
  PATTA: 'Patta',
  SURVEY_SETTLEMENT: 'Survey settlement',
  KATHA: 'Katha',
  REVENUE: 'Revenue',
  OTHER: 'Other',
};

// Keys match the #1458 canonical land_category values stored in the database.
// EditListing.tsx land category Select uses these same keys.
export const LAND_CATEGORY_LABELS: Record<string, string> = {
  FARMLAND: 'Farmland',
  PLANTATION: 'Plantation',
  FARM_PLOT: 'Farm plot',
  AGRICULTURAL_PLOT: 'Agricultural plot',
  OTHER: 'Other',
};

// Keys match AgriFieldOptions.VALID_CONVERSION_STATUSES / CONVERSION_STATUS_LABELS (#2043).
// Distinct from the residential CONVERSION_STATUS_LABELS in listing-constants.ts.
export const AGRI_CONVERSION_STATUS_LABELS: Record<string, string> = {
  NOT_CONVERTED: 'Not converted',
  CONVERSION_APPLIED: 'Conversion applied',
  APPROVED_FOR_CONVERSION: 'Approved for conversion',
  NOT_SURE: 'Not sure',
};

// Keys match AgriFieldOptions.VALID_CROPS / CROP_LABELS (#2044) — the canonical
// backend crop vocabulary persisted via listing_agri_crops. No 'OTHER' member
// (DP-1: the free-text escape hatch was deliberately removed). Note the
// ARECA_SUPARI mapping — the pre-#2044 FE-only chip was labelled "Areca nut";
// the backend's canonical label is "Areca / supari".
export const CROP_LABELS: Record<string, string> = {
  PADDY: 'Paddy',
  COCONUT: 'Coconut',
  ARECA_SUPARI: 'Areca / supari',
  CASHEW: 'Cashew',
  BANANA: 'Banana',
  SUGARCANE: 'Sugarcane',
  VEGETABLES: 'Vegetables',
  MANGO: 'Mango',
  RUBBER: 'Rubber',
  PEPPER: 'Pepper',
  MIXED_PLANTATION: 'Mixed plantation',
  FALLOW_OPEN: 'Fallow / open',
};
