-- #2019 Slice B: saved-search alert delivery history.
--
-- Two expand-only tables that make matcher evaluation idempotent and give support a
-- per-run audit trail:
--
--   saved_search_alert_batches    one row per (saved search, evaluation run that found >= 1
--                                 new match). Records the match count, the watermark the run
--                                 advanced to, and the email transport outcome.
--   saved_search_alert_deliveries one row per (saved search, listing) ever delivered. The
--                                 UNIQUE constraint is the structural duplicate-delivery
--                                 guard: a listing delivered once for a search can never be
--                                 delivered again for it, regardless of watermark state or
--                                 overlapping scheduler runs.
--
-- Both cascade on saved-search delete (a deleted alert has no history to keep).
-- Expand-only; never modify an existing migration.

CREATE TABLE IF NOT EXISTS public.saved_search_alert_batches (
    id                  UUID PRIMARY KEY,
    saved_search_id     UUID NOT NULL REFERENCES public.saved_searches (id) ON DELETE CASCADE,
    user_id             UUID NOT NULL,
    match_count         INTEGER NOT NULL,
    -- Eligibility timestamp of the newest listing in this batch; the saved search's
    -- alert_watermark is advanced to exactly this value in the same transaction.
    watermark_to        TIMESTAMPTZ NOT NULL,
    -- PENDING (bookkeeping committed, email not yet attempted) -> SENT / FAILED / SKIPPED
    -- (no email on file for the owner). In-app notification is written in the same
    -- transaction as this row, so a FAILED email never means an undelivered alert.
    email_status        VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    email_attempted_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_saved_search_alert_batches_search_created
    ON public.saved_search_alert_batches (saved_search_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.saved_search_alert_deliveries (
    saved_search_id     UUID NOT NULL REFERENCES public.saved_searches (id) ON DELETE CASCADE,
    listing_id          UUID NOT NULL,
    batch_id            UUID NOT NULL REFERENCES public.saved_search_alert_batches (id) ON DELETE CASCADE,
    delivered_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (saved_search_id, listing_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_search_alert_deliveries_batch
    ON public.saved_search_alert_deliveries (batch_id);

-- Matcher scan index: ACTIVE searches ordered by last_alerted_at so "due" rows are cheap.
CREATE INDEX IF NOT EXISTS idx_saved_searches_status_last_alerted
    ON public.saved_searches (status, last_alerted_at);
