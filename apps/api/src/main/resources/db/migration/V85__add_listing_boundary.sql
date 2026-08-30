-- V85: Add boundary polygon geometry for agricultural land listings.
-- No flyway:no-transaction needed — plain ALTER TABLE, no CREATE INDEX CONCURRENTLY.
-- GiST index deferred to V86+ per ADR 0001 (no buyer reads in MVP1).
ALTER TABLE property_listings
    ADD COLUMN IF NOT EXISTS boundary geography(Polygon, 4326);
