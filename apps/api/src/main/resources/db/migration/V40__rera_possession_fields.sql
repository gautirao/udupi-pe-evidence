-- RE-99: RERA & docs readiness checklist per listing
-- rera_number already exists (V30); add possession / approvals columns only.

ALTER TABLE property_listings
    ADD COLUMN IF NOT EXISTS possession_status        VARCHAR(30),
    ADD COLUMN IF NOT EXISTS expected_possession_date DATE,
    ADD COLUMN IF NOT EXISTS approvals_declared       JSONB;
