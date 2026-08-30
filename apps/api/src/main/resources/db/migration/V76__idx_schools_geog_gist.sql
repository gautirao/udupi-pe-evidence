-- Transactional migration — no special Flyway directives required.
-- V76: GiST index on schools.geog for spatial proximity queries.
-- Companion to V75 (which added the geog generated column).
--
-- Plain CREATE INDEX (not CONCURRENTLY): Supabase's PgBouncer connection pooler
-- does not support CONCURRENTLY on Flyway startup connections. The schools table
-- is small so the brief ACCESS SHARE lock during the index build is acceptable.
-- Unqualified table name matches all prior schools migrations (V58, V66–V69).

CREATE INDEX IF NOT EXISTS idx_schools_geog
    ON schools USING GIST (geog)
    WHERE geog IS NOT NULL;
