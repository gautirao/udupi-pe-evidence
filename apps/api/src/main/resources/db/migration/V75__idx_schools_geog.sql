-- Transactional migration — no special Flyway directives required.
-- V75: Add stored geography generated column to schools table.
-- The companion GiST index is in V76.
--
-- Lock note: ALTER TABLE ... ADD COLUMN ... GENERATED ALWAYS AS ... STORED takes an
-- ACCESS EXCLUSIVE lock and performs a full table rewrite. For the schools table
-- (hundreds of rows) this is instantaneous. Acceptable at migration time.
--
-- No null-guard in the expression: latitude and longitude are both NOT NULL in the
-- schools table (declared in V58), so the CASE is unnecessary.
-- Unqualified table name matches all prior schools migrations (V58, V66–V69).

ALTER TABLE schools
    ADD COLUMN IF NOT EXISTS geog geography(Point, 4326)
        GENERATED ALWAYS AS (ST_MakePoint(longitude, latitude)::geography) STORED;
