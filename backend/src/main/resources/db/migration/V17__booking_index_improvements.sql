DROP INDEX IF EXISTS idx_viewing_requests_dealer_id;
DROP INDEX IF EXISTS idx_viewing_requests_requester_id;
CREATE INDEX IF NOT EXISTS idx_viewing_requests_dealer_id ON viewing_requests (dealer_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_viewing_requests_requester_id ON viewing_requests (requester_id, created_at DESC);
