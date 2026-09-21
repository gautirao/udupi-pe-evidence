-- V139: Fix listing_pois_listing_osm_unique to stop blocking multiple manual POIs per listing.
--
-- V25's original constraint (UNIQUE NULLS NOT DISTINCT (listing_id, osm_id)) was intended to
-- dedupe Overpass-provided POIs while letting manual rows (osm_id always NULL) coexist freely
-- -- see V25's own comment "NULLs (manual rows) do not conflict." NULLS NOT DISTINCT does the
-- opposite of that: it treats all NULLs as equal, so the SECOND manual POI added to any listing
-- always collides with the first on (listing_id, NULL) and is rejected with a duplicate-key
-- violation. Confirmed via live repro: adding a second manual POI to a listing that already had
-- one failed with "duplicate key value violates unique constraint listing_pois_listing_osm_unique".
--
-- Replace it with a partial unique index that only applies when osm_id IS NOT NULL, preserving
-- the original intent (no duplicate Overpass POI per listing+osm_id) while allowing unlimited
-- manual POIs (osm_id NULL) per listing.

ALTER TABLE public.listing_pois
    DROP CONSTRAINT IF EXISTS listing_pois_listing_osm_unique;

CREATE UNIQUE INDEX IF NOT EXISTS listing_pois_listing_osm_unique
    ON public.listing_pois (listing_id, osm_id)
    WHERE osm_id IS NOT NULL;
