-- V93: discover_event — append-only anonymous telemetry table.
--
-- DESIGN NOTES
-- ============
-- 1. STRICTLY PII-FREE. No user_id, email, phone, name, IP address, user-agent,
--    device fingerprint, raw price, latitude, longitude, or exact address columns.
--    session_id is a client-generated UUID with NO FK to auth.users — it cannot be
--    used to identify individuals. It is retained only for deduplication / batch
--    correlation within a single session.
--
-- 2. APPEND-ONLY. No UPDATE path exists; consumers that need corrections ingest
--    fresh events. Retention purge (180-day) removes expired rows in bounded batches
--    via a scheduled job (see DiscoverEventRetentionJob).
--
-- 3. filters_jsonb stores only coarse, non-PII filter signals (area_key, property_type,
--    listing_purpose, price_band). Keys are validated against an allow-list in the
--    application layer before persisting. Raw prices are NEVER stored; price_band is
--    a coarse label (e.g. "20L-50L").
--
-- 4. INDEX on (ts) supports efficient range scans for the retention purge job
--    (DELETE WHERE ts < now() - INTERVAL '180 days').
--
-- 5. REVERSIBILITY (Flyway Community has no undo command):
--    To roll back V93 manually in production, execute:
--
--      DROP TABLE IF EXISTS discover_event;
--
--    This is safe because discover_event has no FK dependents. No other table
--    references it. The application layer must be rolled back first so writes stop.
--
-- 6. gen_random_uuid() requires PostgreSQL 13+ (no pgcrypto needed).
--    The postgis:15-3.4 Testcontainers image and all production Supabase instances
--    satisfy this.

CREATE TABLE discover_event (
    id              bigserial       PRIMARY KEY,
    session_id      uuid            NOT NULL,
    event_type      text            NOT NULL
                                        CHECK (event_type IN ('FILTER_APPLY', 'PANEL_OPEN', 'LEAD_INTENT')),
    area_key        text,
    property_type   text,
    listing_purpose text,
    price_band      text,
    filters_jsonb   jsonb           NOT NULL DEFAULT '{}'::jsonb,
    ts              timestamptz     NOT NULL DEFAULT now()
);

-- Index on ts for retention purge range scans (DELETE WHERE ts < cutoff).
-- PLAIN index (not CONCURRENTLY) because the table is brand-new and empty;
-- a plain index completes instantly inside the transaction.
CREATE INDEX idx_discover_event_ts ON discover_event (ts);
