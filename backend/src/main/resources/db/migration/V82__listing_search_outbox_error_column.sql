ALTER TABLE listing_search_outbox
  ADD COLUMN error_message TEXT,
  ADD COLUMN failed_at TIMESTAMPTZ;

COMMENT ON COLUMN listing_search_outbox.error_message IS
  'Exception message when poller fails to process this event (truncated to 1000 chars)';
COMMENT ON COLUMN listing_search_outbox.failed_at IS
  'Timestamp when the poller marked this event FAILED';

-- Partial index for the poller query: pending entries that are not FAILED.
-- Matches the WHERE clause in ListingSearchOutboxRepository.findUnpublishedBatch
-- to avoid full-table scans as the outbox grows.
CREATE INDEX IF NOT EXISTS idx_listing_search_outbox_pending
  ON listing_search_outbox (id)
  WHERE published_at IS NULL
    AND (status IS NULL OR status <> 'FAILED');
