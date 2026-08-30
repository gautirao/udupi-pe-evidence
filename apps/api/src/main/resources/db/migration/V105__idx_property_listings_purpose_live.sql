-- flyway:no-transaction
-- V105 (#1760): Partial index for listing_purpose + area_key filtering, mirroring V90's
-- pattern for property_type. CREATE INDEX CONCURRENTLY cannot run inside a transaction block
-- (mirrors V90/V73 pattern).
--
-- EVIDENCE (docs/audit/evidence/issue-1760-summary-scale/, DiscoverSummaryScaleIT @ 100k rows,
-- 10 area_keys, ~10% status/archived/duplicate noise):
--   listingPurpose=sale scenario breached the ~100ms/query budget:
--     regions (area_group):  191.0ms  (budget 100ms) -- BREACH
--     total:                  82.7ms  (under budget, but close)
--     hotspots:               98.3ms  (borderline)
--   EXPLAIN showed a Bitmap Heap Scan on property_listings using
--   idx_property_listings_area_key (area_key only), with listing_purpose/status/archived_at/
--   is_duplicate all pushed into a post-fetch Filter/Recheck — i.e. no index encodes the
--   LIVE + listing_purpose predicate, so every candidate row must be fetched from the heap and
--   rechecked. This is the SAME shape DiscoverSummaryService.appendTypeFilter's propertyType path
--   avoids via V90's idx_property_listings_live_lower_type_area (which is why the
--   propertyType=house scenario ran in 21-63ms — comfortably under budget — in the same test run).
--
-- No plain (not LOWER()) function needed here: DiscoverListingPredicateBuilder's listing_purpose
-- predicate is a case-sensitive equality (`pl.listing_purpose = ?`), unlike propertyType's
-- LOWER(pl.property_type) = LOWER(?) — so this index is on the raw column, not a functional index.
--
-- Accelerates: DiscoverSummaryService's total/regions/hotspots queries when listingPurpose is
-- supplied (sale/rent) — the only #1745/#1760 caller of the listing_purpose predicate.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_property_listings_live_purpose_area
    ON property_listings (listing_purpose, area_key)
    WHERE status = 'LIVE'
      AND archived_at IS NULL
      AND is_duplicate = false;
