-- RE-86: Add seller_type column to distinguish owner, dealer, builder listings.
-- Default 'dealer' backfills all existing rows (scraped + dealer-created).
ALTER TABLE public.property_listings
    ADD COLUMN IF NOT EXISTS seller_type VARCHAR(10) NOT NULL DEFAULT 'dealer';

ALTER TABLE public.property_listings
    ADD CONSTRAINT chk_seller_type CHECK (seller_type IN ('owner', 'dealer', 'builder'));

CREATE INDEX IF NOT EXISTS idx_property_listings_seller_type
    ON public.property_listings(seller_type);
