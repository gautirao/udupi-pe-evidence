-- V126: agri_conversion_status column on property_listings (#2043).
--
-- ADDITIVE ONLY. Adds a nullable agri_conversion_status column mirroring the existing
-- land_category column's shape (M38-10b / #1693) — no default, no backfill. Existing rows
-- (including agricultural_land listings) simply carry NULL until the broker declares a value.
--
-- Canonical machine values live in AgriFieldOptions.VALID_CONVERSION_STATUSES (NOT_CONVERTED,
-- CONVERSION_APPLIED, APPROVED_FOR_CONVERSION, NOT_SURE) — already defined and unwired prior to
-- this change; #2043 wires them onto this new column. Distinct from the unrelated RESIDENTIAL
-- conversion_status column (DC_CONVERTED / RESIDENTIAL_ZONE), which this migration does not touch.
--
-- Also mirrors the column onto listing_agricultural_land_details (V102 backfill-only projection
-- table used by the search indexer read path) so the projection shape stays in sync. This table is
-- populated only by the one-time V102 backfill DML and is never written to by application code
-- afterward, so no ongoing sync mechanism is added here — the column starts NULL for all rows and
-- population is out of scope for #2043 (deferred, same as OpenSearch/quality-scoring wiring).

ALTER TABLE public.property_listings
    ADD COLUMN IF NOT EXISTS agri_conversion_status VARCHAR(32) NULL;

ALTER TABLE public.listing_agricultural_land_details
    ADD COLUMN IF NOT EXISTS agri_conversion_status TEXT NULL;

COMMENT ON COLUMN public.property_listings.agri_conversion_status IS
    'Broker-declared agricultural land-conversion status (#2043). Canonical values in '
    'AgriFieldOptions.VALID_CONVERSION_STATUSES: NOT_CONVERTED, CONVERSION_APPLIED, '
    'APPROVED_FOR_CONVERSION, NOT_SURE. Accepted only for property_type = agricultural_land; '
    'NULL means not declared, never inferred or defaulted. Distinct from the unrelated '
    'RESIDENTIAL conversion_status column (DC_CONVERTED / RESIDENTIAL_ZONE).';
