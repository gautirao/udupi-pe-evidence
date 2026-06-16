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
