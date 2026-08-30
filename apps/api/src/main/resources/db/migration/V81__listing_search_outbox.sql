-- V81__listing_search_outbox.sql
-- Transactional outbox table for the incremental OpenSearch indexing pipeline.
-- Issue #1312 — LOCAL/DEV prototype; table defined as the outbox CONTRACT so the
-- relay can run against real DDL. The Spring Boot backend does NOT yet write to this
-- table; a Python simulator (scripts/opensearch_outbox_simulator.py) populates it
-- for prototype/testing purposes.
--
-- Design notes:
--   * NO enforced FK to property_listings — LISTING_DELETED rows must survive
--     listing deletion so the relay can still publish the DELETE event.
--   * NO trigger, NO stored-procedure logic — business logic lives in the application
--     layer (ARCHITECTURE.md constraint).
--   * Additive migration: new table only. Rollback = DROP TABLE listing_search_outbox.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS listing_search_outbox (
    id               BIGSERIAL PRIMARY KEY,
    event_id         UUID         NOT NULL,
    aggregate_type   VARCHAR(64)  NOT NULL DEFAULT 'LISTING',
    listing_id       TEXT         NOT NULL,
    event_type       VARCHAR(64)  NOT NULL,
    event_version    INT          NOT NULL DEFAULT 1,
    operation        VARCHAR(16)  NOT NULL CHECK (operation IN ('INDEX', 'DELETE')),
    status           VARCHAR(32),
    occurred_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    source_updated_at TIMESTAMPTZ,
    payload          JSONB        NOT NULL,
    published_at     TIMESTAMPTZ
);

-- Uniqueness on event_id prevents duplicate outbox rows from double-inserts.
CREATE UNIQUE INDEX IF NOT EXISTS uq_listing_search_outbox_event_id
    ON listing_search_outbox (event_id);

-- Partial index used by the relay's poll query:
--   SELECT ... WHERE published_at IS NULL ORDER BY id ASC LIMIT :batch
-- Keeps the scan cheap even as the table grows (only unpublished rows are in the index).
CREATE INDEX IF NOT EXISTS idx_listing_search_outbox_unpublished
    ON listing_search_outbox (id)
    WHERE published_at IS NULL;

-- Secondary index for per-listing queries (debugging, replay):
--   SELECT ... WHERE listing_id = :id ORDER BY id ASC
CREATE INDEX IF NOT EXISTS idx_listing_search_outbox_listing_id
    ON listing_search_outbox (listing_id, id);
