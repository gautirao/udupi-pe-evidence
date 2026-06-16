-- V91: Normalise free-text agri field values to canonical SCREAMING_SNAKE_CASE constants.
--
-- Affected columns: water_source, soil_type, road_access, cultivation_status, ownership_type
-- (all added in V84; all varchar(64), nullable).
--
-- All UPDATEs use WHERE col = '<old_value>' so only rows carrying the old free-text strings
-- are touched. Rows already holding canonical values (or NULL) are untouched.
-- No CHECK constraints are added — the application layer (AgriFieldOptions.java) enforces
-- the canonical set going forward.
--
-- soil_type consolidation rationale:
--   Both 'Red loam' and 'Laterite' are consolidated into 'RED_LATERITE'.
--   Karnataka state land records use "Red laterite" as the unified category encompassing both;
--   these terms describe the same Ultisol/Oxisol soil group found in coastal Karnataka.
--   Separating them would create two symbols for the same pedological reality.

-- ─────────────────────────────────────────────────────────────────────────────
-- water_source
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE property_listings SET water_source = 'BOREWELL'      WHERE water_source = 'Borewell';
UPDATE property_listings SET water_source = 'WELL'          WHERE water_source = 'Open well';
UPDATE property_listings SET water_source = 'RIVER'         WHERE water_source = 'River';
UPDATE property_listings SET water_source = 'RAIN_FED'      WHERE water_source = 'Rain-fed';

-- ─────────────────────────────────────────────────────────────────────────────
-- soil_type
-- 'Red loam' and 'Laterite' both map to RED_LATERITE (see rationale above).
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE property_listings SET soil_type = 'RED_LATERITE'  WHERE soil_type = 'Red loam';
UPDATE property_listings SET soil_type = 'RED_LATERITE'  WHERE soil_type = 'Laterite';
UPDATE property_listings SET soil_type = 'ALLUVIAL'      WHERE soil_type = 'Alluvial';
UPDATE property_listings SET soil_type = 'BLACK_COTTON'  WHERE soil_type = 'Black cotton';

-- ─────────────────────────────────────────────────────────────────────────────
-- road_access
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE property_listings SET road_access = 'TARRED_ROAD'      WHERE road_access = 'Tar road';
UPDATE property_listings SET road_access = 'KACHCHA_ROAD'     WHERE road_access = 'Mud road';
UPDATE property_listings SET road_access = 'HIGHWAY_FRONTAGE' WHERE road_access = 'Highway frontage';

-- ─────────────────────────────────────────────────────────────────────────────
-- cultivation_status
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE property_listings SET cultivation_status = 'ARECA_PLANTATION'   WHERE cultivation_status = 'Areca plantation';
UPDATE property_listings SET cultivation_status = 'COCONUT_PLANTATION' WHERE cultivation_status = 'Coconut plantation';
UPDATE property_listings SET cultivation_status = 'CULTIVATED'         WHERE cultivation_status = 'Cultivated';
UPDATE property_listings SET cultivation_status = 'FALLOW'             WHERE cultivation_status = 'Fallow';

-- ─────────────────────────────────────────────────────────────────────────────
-- ownership_type
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE property_listings SET ownership_type = 'FREEHOLD'  WHERE ownership_type = 'Freehold';
UPDATE property_listings SET ownership_type = 'INHERITED' WHERE ownership_type = 'Inherited';
