-- V84: Add agricultural land fields for AGRICULTURAL_LAND property type.
-- All columns are nullable so existing non-agri listings are unaffected.
ALTER TABLE property_listings
  ADD COLUMN water_source varchar(64),
  ADD COLUMN soil_type varchar(64),
  ADD COLUMN road_access varchar(64),
  ADD COLUMN cultivation_status varchar(64),
  ADD COLUMN ownership_type varchar(64),
  ADD COLUMN survey_number varchar(64);
