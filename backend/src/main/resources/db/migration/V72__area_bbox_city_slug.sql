-- V72: extend area_overview_stats with bbox, geo_center, and city_slug columns.
-- These are analytics-cache copies of the source-of-truth values in the `areas` table.
-- They are populated by AreaOverviewRollupJob (B-3) and used by AreaSummaryController (B-4).
--
-- geo_center_lat/lon on this table = geometric center (copied from areas.geo_center_*).
--   → use for map marker placement.
--   → NOT the same as centroid_lat/lon (= AVG of listing coords, analytics only).
-- min/max lat/lon = bbox, used for fitBounds on area-card click.
-- city_slug = app city (e.g. 'kundapur'), used by /api/discover/areas?city= filter.

ALTER TABLE public.area_overview_stats
    ADD COLUMN IF NOT EXISTS min_lat       DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS min_lon       DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS max_lat       DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS max_lon       DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS geo_center_lat DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS geo_center_lon DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS city_slug     TEXT;

COMMENT ON COLUMN public.area_overview_stats.min_lat        IS 'South edge of area bbox — use for fitBounds on area-card click';
COMMENT ON COLUMN public.area_overview_stats.max_lat        IS 'North edge of area bbox — use for fitBounds on area-card click';
COMMENT ON COLUMN public.area_overview_stats.min_lon        IS 'West edge of area bbox — use for fitBounds on area-card click';
COMMENT ON COLUMN public.area_overview_stats.max_lon        IS 'East edge of area bbox — use for fitBounds on area-card click';
COMMENT ON COLUMN public.area_overview_stats.geo_center_lat IS 'Geometric center lat (copied from areas.geo_center_lat) — use for map marker placement, NOT centroid_lat';
COMMENT ON COLUMN public.area_overview_stats.geo_center_lon IS 'Geometric center lon (copied from areas.geo_center_lon) — use for map marker placement, NOT centroid_lon';
COMMENT ON COLUMN public.area_overview_stats.city_slug      IS 'App city slug (e.g. kundapur) — may differ from district segment of area_key for cross-boundary areas';
