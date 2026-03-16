-- RE-94: Listing transparency fields
-- New columns on property_listings
ALTER TABLE property_listings
    ADD COLUMN IF NOT EXISTS first_published_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_live_at        TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS back_to_market_at   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_updated_at     TIMESTAMPTZ;

-- Price change history table
CREATE TABLE IF NOT EXISTS price_change_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id  UUID NOT NULL REFERENCES property_listings(id) ON DELETE RESTRICT,
    old_price   NUMERIC(15,2),
    new_price   NUMERIC(15,2),
    changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_change_log_listing_id
    ON price_change_log (listing_id, changed_at DESC);
