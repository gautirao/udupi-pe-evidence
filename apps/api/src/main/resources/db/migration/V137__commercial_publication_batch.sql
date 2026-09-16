-- =============================================================================
-- V137: Commercial Publication Batch Audit Table (#2608)
-- =============================================================================
-- Durable audit log tracking controlled DRAFT -> LIVE publication and LIVE -> DRAFT
-- unpublish batch workflows for commercial inventory.

CREATE TABLE IF NOT EXISTS public.commercial_publication_batch (
    id                    SERIAL PRIMARY KEY,
    batch_name            TEXT        NOT NULL,
    batch_type            TEXT        NOT NULL CHECK (batch_type IN ('CANARY', 'BATCH', 'UNPUBLISH')),
    target_listing_count  INTEGER     NOT NULL,
    listing_ids           UUID[]      NOT NULL,
    published_by          UUID,
    previous_status       TEXT        NOT NULL DEFAULT 'DRAFT',
    new_status            TEXT        NOT NULL DEFAULT 'LIVE',
    published_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.commercial_publication_batch IS
    'Durable audit record of controlled #2608 publication runs (CANARY, BATCH, UNPUBLISH). '
    'Tracks target listing IDs, publish timestamps, actor, and status transitions.';

COMMENT ON COLUMN public.commercial_publication_batch.batch_name IS
    'Human-readable label for the publication run (e.g. CANARY_2608, BATCH_UDUPI_2608).';
COMMENT ON COLUMN public.commercial_publication_batch.listing_ids IS
    'Exact array of property_listings.id UUIDs affected by this publication batch.';
