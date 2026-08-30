-- Add processing_started_at to track posts that are currently being processed.
-- This enables a three-state model:
--   pending:    is_processed = false, processing_started_at IS NULL
--   processing: is_processed = false, processing_started_at IS NOT NULL
--   processed:  is_processed = true
ALTER TABLE public.raw_posts
    ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_raw_posts_unprocessed
    ON public.raw_posts (created_at ASC)
    WHERE is_processed = false AND processing_started_at IS NULL;
