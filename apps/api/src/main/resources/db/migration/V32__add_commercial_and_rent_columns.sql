-- listing_purpose (VARCHAR with CHECK, not enum)
ALTER TABLE property_listings
  ADD COLUMN IF NOT EXISTS listing_purpose VARCHAR(10) NOT NULL DEFAULT 'sale';
ALTER TABLE property_listings
  ADD CONSTRAINT chk_listing_purpose CHECK (listing_purpose IN ('sale', 'rent'));

-- Commercial-specific columns (all nullable)
ALTER TABLE property_listings ADD COLUMN IF NOT EXISTS carpet_area NUMERIC;
ALTER TABLE property_listings ADD COLUMN IF NOT EXISTS carpet_area_unit VARCHAR(20);
ALTER TABLE property_listings ADD COLUMN IF NOT EXISTS floor_number INTEGER;
ALTER TABLE property_listings ADD COLUMN IF NOT EXISTS total_floors INTEGER;
ALTER TABLE property_listings ADD COLUMN IF NOT EXISTS furnishing_status VARCHAR(30);
ALTER TABLE property_listings ADD COLUMN IF NOT EXISTS washrooms INTEGER;
ALTER TABLE property_listings ADD COLUMN IF NOT EXISTS parking_count INTEGER;
ALTER TABLE property_listings ADD COLUMN IF NOT EXISTS road_frontage_ft NUMERIC;
ALTER TABLE property_listings ADD COLUMN IF NOT EXISTS commercial_usage VARCHAR(50);
ALTER TABLE property_listings ADD COLUMN IF NOT EXISTS number_of_units INTEGER;

-- Rent-specific columns (all nullable, paise for monetary)
ALTER TABLE property_listings ADD COLUMN IF NOT EXISTS monthly_rent BIGINT;
ALTER TABLE property_listings ADD COLUMN IF NOT EXISTS security_deposit_months INTEGER;
ALTER TABLE property_listings ADD COLUMN IF NOT EXISTS lock_in_months INTEGER;
