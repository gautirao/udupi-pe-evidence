-- V28: Extend listing_pois.source CHECK constraint to allow 'overpass_settlement'.
--
-- Settlement POIs (TOWN_CENTER, VILLAGE_CENTER, HIGHWAY) are fetched from Overpass using
-- a separate query profile and cached independently from amenity POIs. Using a distinct
-- source value lets the 14-day cache guard check amenity vs settlement fetches independently
-- without the two types interfering with each other.

ALTER TABLE public.listing_pois
    DROP CONSTRAINT IF EXISTS listing_pois_source_check;

ALTER TABLE public.listing_pois
    ADD CONSTRAINT listing_pois_source_check
        CHECK (source IN ('overpass', 'manual', 'overpass_settlement'));
