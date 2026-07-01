-- =============================================================================
-- V103: M38-13A Residential typed listing flow — EXPAND ONLY
-- =============================================================================
-- Issue: #1626
--
-- Adds the residential design-spec field set (apartment/flat, independent house,
-- villa, residential plot/land) as NULLABLE, no-default columns on
-- property_listings, plus one additive child table for preferred tenants.
--
-- EXPAND ONLY — no column drops, no table drops, no DML, no backfill, no NOT
-- NULL, no type changes. All guards are idempotent (safe to re-run).
--
-- possession_status REUSE DECISION (architect d7 / backend verification):
-- The existing `possession_status` column (free TEXT, no CHECK) already stores
-- the design's "Property status" concept (Ready to move / Under construction).
-- Confirmed stored/consumed values in this codebase: `READY` (DiscoverQueryDsl,
-- DiscoverListingPredicateBuilder, OpenSearchHitMapper — all uppercase literal
-- "READY"). No CHECK constraint exists on this column today, so it already
-- tolerates the design's two-state vocabulary without a migration. Therefore
-- this migration does NOT add a new construction_status column — possession_status
-- is reused as-is (Spring-side free text, consistent with the V102 "no enum CHECK
-- on detail text columns" precedent).
--
-- chk_listing_property_type: DROP + re-ADD as a strict SUPERSET of the V86 value
-- list, adding 'villa' and 'residential_plot'. All 9 existing values preserved.
--
-- No CHECK constraint is added on any new TEXT column (mirrors V102 precedent —
-- value-set enforcement, where it exists at all, lives in Spring, and free text
-- must not reject legacy/loosely-validated broker input).
-- =============================================================================

-- =============================================================================
-- STEP 1: New scalar columns on property_listings (nullable, no default)
-- =============================================================================

ALTER TABLE public.property_listings
    ADD COLUMN IF NOT EXISTS balconies                integer,
    ADD COLUMN IF NOT EXISTS facing                    text,
    ADD COLUMN IF NOT EXISTS availability_timeline      text,
    ADD COLUMN IF NOT EXISTS super_built_area           numeric,
    ADD COLUMN IF NOT EXISTS super_built_area_unit      text,
    ADD COLUMN IF NOT EXISTS property_age               text,
    ADD COLUMN IF NOT EXISTS residential_water_source   text,
    ADD COLUMN IF NOT EXISTS parking_2w_count           integer,
    ADD COLUMN IF NOT EXISTS parking_4w_count           integer,
    ADD COLUMN IF NOT EXISTS road_width_ft              numeric,
    ADD COLUMN IF NOT EXISTS plot_dimensions            text,
    ADD COLUMN IF NOT EXISTS conversion_status          text,
    ADD COLUMN IF NOT EXISTS khata_number               text,
    ADD COLUMN IF NOT EXISTS property_tax_pid           text,
    ADD COLUMN IF NOT EXISTS approving_authority        text,
    ADD COLUMN IF NOT EXISTS project_name               text,
    ADD COLUMN IF NOT EXISTS builder_name               text,
    ADD COLUMN IF NOT EXISTS maintenance_paise          bigint;

-- =============================================================================
-- STEP 2: New boolean columns (nullable, honest-null tri-state — mirrors the
-- existing farmhouse_available / fencing_done pattern from V84). NEVER default
-- these to false: null means "not declared", distinct from an explicit false.
-- =============================================================================

ALTER TABLE public.property_listings
    ADD COLUMN IF NOT EXISTS has_lift                   boolean,
    ADD COLUMN IF NOT EXISTS has_power_backup           boolean,
    ADD COLUMN IF NOT EXISTS is_gated                    boolean,
    ADD COLUMN IF NOT EXISTS has_garden                  boolean,
    ADD COLUMN IF NOT EXISTS has_terrace                 boolean,
    ADD COLUMN IF NOT EXISTS has_compound                boolean,
    ADD COLUMN IF NOT EXISTS has_servant_room             boolean,
    ADD COLUMN IF NOT EXISTS is_corner_plot               boolean,
    ADD COLUMN IF NOT EXISTS has_boundary_wall            boolean,
    ADD COLUMN IF NOT EXISTS is_gated_layout              boolean,
    ADD COLUMN IF NOT EXISTS has_water_connection         boolean,
    ADD COLUMN IF NOT EXISTS has_electricity_connection   boolean,
    ADD COLUMN IF NOT EXISTS has_drainage                 boolean,
    ADD COLUMN IF NOT EXISTS price_negotiable             boolean,
    ADD COLUMN IF NOT EXISTS rent_negotiable               boolean,
    ADD COLUMN IF NOT EXISTS pets_allowed                  boolean,
    ADD COLUMN IF NOT EXISTS maintenance_included          boolean;

-- =============================================================================
-- STEP 3: chk_listing_property_type — expand as a strict superset (V86 pattern)
-- =============================================================================

ALTER TABLE public.property_listings
    DROP CONSTRAINT IF EXISTS chk_listing_property_type;

ALTER TABLE public.property_listings
    ADD CONSTRAINT chk_listing_property_type
    CHECK (property_type IN (
        'house', 'apartment', 'land', 'commercial',
        'commercial_building', 'warehouse', 'commercial_land', 'other',
        'agricultural_land',
        'villa', 'residential_plot'
    ));

-- =============================================================================
-- STEP 4: New child table — preferred tenants (multi-select; additive, own PK)
-- Mirrors the V102 listing_amenities / listing_location_features shape exactly.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.listing_preferred_tenants (
    id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id  uuid          NOT NULL REFERENCES public.property_listings(id) ON DELETE CASCADE,
    code        text          NOT NULL,
    created_at  timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT listing_preferred_tenants_listing_code_uniq UNIQUE (listing_id, code)
);

CREATE INDEX IF NOT EXISTS idx_listing_preferred_tenants_listing
    ON public.listing_preferred_tenants (listing_id);

-- =============================================================================
-- END V103
-- All new columns are nullable with no default — legacy rows read NULL on every
-- new column and are unaffected. listing_preferred_tenants is created EMPTY.
-- No DML in this migration.
-- =============================================================================
