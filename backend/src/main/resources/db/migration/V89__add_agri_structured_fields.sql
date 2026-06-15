-- V89: Add structured agri attributes for issue #1458 (land category, farmhouse, fencing).
-- water_source already exists from V84; reused with controlled values at application layer.
-- All columns nullable — additive, backward-compatible, no data backfill required.
ALTER TABLE property_listings
  ADD COLUMN land_category varchar(32),
  ADD COLUMN farmhouse_available boolean,
  ADD COLUMN fencing_done boolean;
