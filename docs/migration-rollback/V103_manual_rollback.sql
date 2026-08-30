-- =============================================================================
-- V103 MANUAL ROLLBACK (NOT a Flyway migration — never place this in
-- apps/api/src/main/resources/db/migration/). Forward-only Flyway repo.
-- =============================================================================
-- Issue: #1626 (M38-13A)
--
-- Use ONLY if the unmerged feat/m38-residential-typed-listing-flow-1626 branch
-- needs to be physically reverted on a database that already applied V103 and
-- no other migration depends on it. Safe because V103 is purely additive:
-- nothing else in the unmerged branch relies on these columns/tables existing,
-- and no shared/production data is expected to have been written to them.
--
-- Run manually via psql / your migration console. Idempotent (IF EXISTS guards).
-- =============================================================================

-- ── Step 1: drop the new child table ────────────────────────────────────────

DROP TABLE IF EXISTS public.listing_preferred_tenants;

-- ── Step 2: restore chk_listing_property_type to its pre-V103 (V86) value set ─

ALTER TABLE public.property_listings
    DROP CONSTRAINT IF EXISTS chk_listing_property_type;

ALTER TABLE public.property_listings
    ADD CONSTRAINT chk_listing_property_type
    CHECK (property_type IN (
        'house', 'apartment', 'land', 'commercial',
        'commercial_building', 'warehouse', 'commercial_land', 'other',
        'agricultural_land'
    ));

-- ── Step 3: drop the new boolean columns ────────────────────────────────────

ALTER TABLE public.property_listings
    DROP COLUMN IF EXISTS has_lift,
    DROP COLUMN IF EXISTS has_power_backup,
    DROP COLUMN IF EXISTS is_gated,
    DROP COLUMN IF EXISTS has_garden,
    DROP COLUMN IF EXISTS has_terrace,
    DROP COLUMN IF EXISTS has_compound,
    DROP COLUMN IF EXISTS has_servant_room,
    DROP COLUMN IF EXISTS is_corner_plot,
    DROP COLUMN IF EXISTS has_boundary_wall,
    DROP COLUMN IF EXISTS is_gated_layout,
    DROP COLUMN IF EXISTS has_water_connection,
    DROP COLUMN IF EXISTS has_electricity_connection,
    DROP COLUMN IF EXISTS has_drainage,
    DROP COLUMN IF EXISTS price_negotiable,
    DROP COLUMN IF EXISTS rent_negotiable,
    DROP COLUMN IF EXISTS pets_allowed,
    DROP COLUMN IF EXISTS maintenance_included;

-- ── Step 4: drop the new scalar columns ─────────────────────────────────────

ALTER TABLE public.property_listings
    DROP COLUMN IF EXISTS balconies,
    DROP COLUMN IF EXISTS facing,
    DROP COLUMN IF EXISTS availability_timeline,
    DROP COLUMN IF EXISTS super_built_area,
    DROP COLUMN IF EXISTS super_built_area_unit,
    DROP COLUMN IF EXISTS property_age,
    DROP COLUMN IF EXISTS residential_water_source,
    DROP COLUMN IF EXISTS parking_2w_count,
    DROP COLUMN IF EXISTS parking_4w_count,
    DROP COLUMN IF EXISTS road_width_ft,
    DROP COLUMN IF EXISTS plot_dimensions,
    DROP COLUMN IF EXISTS conversion_status,
    DROP COLUMN IF EXISTS khata_number,
    DROP COLUMN IF EXISTS property_tax_pid,
    DROP COLUMN IF EXISTS approving_authority,
    DROP COLUMN IF EXISTS project_name,
    DROP COLUMN IF EXISTS builder_name,
    DROP COLUMN IF EXISTS maintenance_paise;

-- =============================================================================
-- END V103 manual rollback
-- =============================================================================
