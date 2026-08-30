-- =============================================================================
-- V104: M38-FU2 Commercial typed listing write path — EXPAND ONLY
-- =============================================================================
-- Issue: #1730
--
-- Adds the commercial design-spec field set (shop/showroom, office, commercial
-- building, warehouse/godown, commercial land) as NULLABLE, no-default columns
-- on property_listings, plus one additive child table for suitable-uses
-- multi-select. Column list frozen against CommercialFieldOptions.java (M38
-- design vocabulary authority — the #1684 commercial design mock was not
-- reachable in this worktree or the main repo checkout at execution time).
--
-- EXPAND ONLY — no column drops, no table drops, no DML, no backfill, no NOT
-- NULL, no type changes, no CHECK constraints on any new column. Value-set
-- enforcement for these columns lives entirely in Spring
-- (ListingController#validateCommercialFields), consistent with the V102/V103
-- precedent of never CHECK-constraining free-text detail columns.
--
-- utilities REUSE DECISION: the "amenities/utilities" multi-select shares the
-- SAME shape as the residential amenities multi-select (a set of toggle codes
-- attached to a listing), so it reuses the existing empty listing_amenities
-- child table (created by V102) rather than a new table — no schema change
-- needed for utilities.
--
-- suitableUses is NOT reused from any existing table (residential has no
-- equivalent concept) — this migration adds listing_suitable_uses, mirroring
-- the V103 listing_preferred_tenants shape exactly.
--
-- land_area / area_sqm / area_sqft / area_cent / price_per_cent_paise are
-- NOT touched by this migration.
-- =============================================================================

-- =============================================================================
-- STEP 1: New scalar columns on property_listings (nullable, no default)
-- =============================================================================

ALTER TABLE public.property_listings
    ADD COLUMN IF NOT EXISTS commercial_subtype            text,
    ADD COLUMN IF NOT EXISTS floor_choice                   text,
    ADD COLUMN IF NOT EXISTS floor_mode                     text,
    ADD COLUMN IF NOT EXISTS hub_type                       text,
    ADD COLUMN IF NOT EXISTS washrooms_public                integer,
    ADD COLUMN IF NOT EXISTS washrooms_private               integer,
    ADD COLUMN IF NOT EXISTS parking_public_count            integer,
    ADD COLUMN IF NOT EXISTS parking_private_count           integer,
    ADD COLUMN IF NOT EXISTS office_seats                    integer,
    ADD COLUMN IF NOT EXISTS office_cabins                   integer,
    ADD COLUMN IF NOT EXISTS office_meeting_rooms            integer,
    ADD COLUMN IF NOT EXISTS occupancy_status                text,
    ADD COLUMN IF NOT EXISTS power_load_kva                  numeric,
    ADD COLUMN IF NOT EXISTS warehouse_clear_height_ft        numeric,
    ADD COLUMN IF NOT EXISTS warehouse_loading_bays           integer,
    ADD COLUMN IF NOT EXISTS warehouse_flooring               text,
    ADD COLUMN IF NOT EXISTS commercial_zoning                text,
    ADD COLUMN IF NOT EXISTS commercial_ownership             text,
    ADD COLUMN IF NOT EXISTS commercial_approvals             text,
    ADD COLUMN IF NOT EXISTS expected_rental_yield_pct        numeric,
    ADD COLUMN IF NOT EXISTS current_monthly_income_paise     bigint,
    ADD COLUMN IF NOT EXISTS lease_term_months                integer,
    ADD COLUMN IF NOT EXISTS lease_escalation_pct             numeric,
    ADD COLUMN IF NOT EXISTS commercial_furnishing_status     text,
    ADD COLUMN IF NOT EXISTS commercial_availability          text,
    ADD COLUMN IF NOT EXISTS commercial_area_unit             text;

-- =============================================================================
-- STEP 2: New boolean columns (nullable, honest-null tri-state — mirrors the
-- V103 has_lift / has_power_backup pattern). NEVER default these to false:
-- null means "not declared", distinct from an explicit false.
-- =============================================================================

ALTER TABLE public.property_listings
    ADD COLUMN IF NOT EXISTS warehouse_truck_access           boolean;

-- =============================================================================
-- STEP 3: New child table — suitable uses (multi-select; additive, own PK)
-- Mirrors the V103 listing_preferred_tenants shape exactly.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.listing_suitable_uses (
    id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id  uuid          NOT NULL REFERENCES public.property_listings(id) ON DELETE CASCADE,
    code        text          NOT NULL,
    created_at  timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT listing_suitable_uses_listing_code_uniq UNIQUE (listing_id, code)
);

CREATE INDEX IF NOT EXISTS idx_listing_suitable_uses_listing
    ON public.listing_suitable_uses (listing_id);

-- =============================================================================
-- END V104
-- All new columns are nullable with no default — legacy rows (including the
-- V102 commercial backfill, which leaves commercial_subtype NULL) read NULL on
-- every new column and are unaffected. listing_suitable_uses is created EMPTY.
-- No DML in this migration. utilities reuse the existing listing_amenities
-- table — no schema change for that multi-select.
-- =============================================================================
