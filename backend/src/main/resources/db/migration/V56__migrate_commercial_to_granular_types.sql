-- V56: Migrate legacy 'commercial' property_type rows to 'commercial_building'.
--
-- The frontend and ListingWorkflowService already support granular commercial types
-- (commercial_building, warehouse, commercial_land) added in V31. The AI prompt (v2)
-- now classifies into these specific types instead of the generic 'commercial'.
--
-- We default existing 'commercial' rows to 'commercial_building' because it is the
-- most common commercial sub-type and the safest default when the original sub-type
-- is unknown. Brokers can reclassify via the edit listing flow if needed.
--
-- Idempotent: if no rows have property_type = 'commercial', this is a no-op.

UPDATE property_listings
SET property_type = 'commercial_building'
WHERE property_type = 'commercial';
