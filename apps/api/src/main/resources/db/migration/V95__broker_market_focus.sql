-- V95: broker_market_focus — broker's declared market focus buckets.
--
-- DESIGN NOTES
-- ============
-- 1. Composite PRIMARY KEY across all 5 business columns (broker_id, city_slug,
--    area_key, property_type, listing_purpose). This is the idempotency anchor:
--    INSERT ... ON CONFLICT ON CONSTRAINT broker_market_focus_pkey DO NOTHING
--    handles both manual add and seed re-run without clobbering source='manual' rows.
--
-- 2. source CHECK constraint allows exactly two values: 'seeded' (derived from
--    LIVE listings) and 'manual' (broker-added via the UI). No other values are
--    valid. No CHECK constraint is added for property_type or listing_purpose —
--    these are free-form listing strings (see approved-plan R6; enumerating them
--    is out of scope).
--
-- 3. city_slug is resolved at seed-time via the authoritative areas→cities join:
--      JOIN areas a ON a.area_key = pl.area_key
--      JOIN cities c ON c.id = a.city_id
--    NOT by splitting area_key. This is essential for areas such as Kundapur where
--    the area_key district segment ('Udupi') differs from the city slug ('kundapur').
--
-- 4. LIVE-only seed: the seed query filters WHERE pl.status = 'LIVE'
--    AND pl.area_key IS NOT NULL. Archived listings are excluded by status='LIVE'.
--
-- 5. Ownership: broker_id is always the JWT-resolved userId. The application layer
--    enforces broker_id = :userId on every read and write path. No client-supplied
--    broker_id is ever accepted.
--
-- 6. Indexes: pk covers the equality lookup for DELETE + INSERT ON CONFLICT.
--    A single-column index on broker_id accelerates the GET (list-all-for-broker)
--    query which filters only on broker_id.
--
-- 7. updated_at is set to now() on insert only. A separate UPDATE path does not
--    exist for this table (rows are deleted and re-inserted, never mutated in place),
--    so no trigger is required.
--
-- 8. REVERSIBILITY (Flyway Community has no undo command):
--    To roll back V95 manually in production, execute:
--
--      DROP TABLE IF EXISTS broker_market_focus;
--
--    This is safe because no other table has a FK into broker_market_focus.
--    Roll back the application layer first so writes stop before dropping the table.
--
-- 9. gen_random_uuid() is PostgreSQL 13+ built-in (pgcrypto not required).
--    The postgis:15-3.4 Testcontainers image and all production Supabase instances
--    satisfy this. This migration does not use gen_random_uuid() (no surrogate PK),
--    but now() and the CHECK function are standard Postgres 13+ functions available
--    in the same environment.

CREATE TABLE broker_market_focus (
    broker_id        uuid        NOT NULL,
    city_slug        text        NOT NULL,
    area_key         text        NOT NULL,
    property_type    text        NOT NULL,
    listing_purpose  text        NOT NULL,
    source           text        NOT NULL CHECK (source IN ('seeded', 'manual')),
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY (broker_id, city_slug, area_key, property_type, listing_purpose)
);

-- Index on broker_id alone: accelerates GET /api/broker/market-focus which
-- returns all rows for the calling broker (no other column is in the WHERE clause).
CREATE INDEX idx_broker_market_focus_broker_id
    ON broker_market_focus (broker_id);
