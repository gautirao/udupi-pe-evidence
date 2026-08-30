-- flyway:no-transaction
-- V90: Functional partial index for LOWER(property_type) + area_key filtering.
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction block (mirrors V73 pattern).
--
-- WHY LOWER(property_type) NOT plain property_type:
--   RegionalAreaGroupsService.REGIONAL_GROUPS_SQL uses LOWER(pl.property_type) = LOWER(?)
--   A plain B-tree index on property_type is NOT used by LOWER(property_type) predicates.
--   A functional index on LOWER(property_type) matches both:
--     - REGIONAL_GROUPS_SQL: LOWER(pl.property_type) = LOWER(?) (bound param)
--     - BASE_SQL: LOWER(pl.property_type) = 'agricultural_land' (literal)
--
-- Accelerates:
--   (1) RegionalAreaGroupsService REGIONAL_GROUPS_SQL GROUP BY subquery
--   (2) DiscoverAgriMapListingsService BASE_SQL agri map IN-clause filter
--   (3) RegionalAreaGroupsService AGRI_AREA_LAND_SQL same-predicate scan
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_property_listings_live_lower_type_area
    ON property_listings (LOWER(property_type), area_key)
    WHERE status = 'LIVE'
      AND archived_at IS NULL
      AND is_duplicate = false;
