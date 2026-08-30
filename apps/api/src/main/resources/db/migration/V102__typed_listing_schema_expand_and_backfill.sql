-- =============================================================================
-- V102: M38-FU1 Typed listing schema EXPAND + backfill
-- =============================================================================
-- Issue: #1688 (M38-10A)
-- ADR:   docs/architecture/listing-typed-detail-data-capture.md §4.3, §14
--
-- EXPAND ONLY — no column drops, no table drops. All new columns/tables
-- are nullable or have safe defaults. Safe to re-run (idempotent guards).
--
-- listing_pois (V25) REUSE DECISION: The existing listing_pois table
-- (V25__create_listing_pois.sql) already models nearby POIs with full
-- fidelity: listing_id FK + ON DELETE CASCADE, name, category, lat/long,
-- distance_meters, source overpass|manual, approved, pinned. It cleanly
-- satisfies ADR §4.3 #11 (listing_nearby_pois). Therefore we do NOT create
-- a new listing_nearby_pois table; listing_pois is the canonical POI table.
--
-- listing_media: media is already modelled by listing_images (V9) +
-- property_listings.video_url. No new listing_media table.
--
-- CHECK constraints: only the NULL-tolerant listing_family CHECK is added.
-- No enum CHECK on detail text columns — the enum authority is M38-FU7;
-- adding enum CHECKs now would reject legacy free-text values.
--
-- DML INVARIANTS (enforced by this migration):
--   - NO UPDATE of land_area / land_area_unit anywhere
--   - NO write of area_sqm / area_sqft / area_cent / price_per_cent_paise
--   - Declared areas stay in property_listings (canonical); detail tables
--     contain only type-specific fields
--   - No AreaNormalizer compute triggered
-- =============================================================================

-- =============================================================================
-- STEP 1: Add listing_family discriminator column to property_listings
-- =============================================================================

ALTER TABLE public.property_listings
    ADD COLUMN IF NOT EXISTS listing_family text;

-- Drop old CHECK if present, then re-add (mirrors V86 pattern).
-- The CHECK is NULL-tolerant so legacy rows and 'land'/'other'/NULL
-- property_types remain unconstrained.
ALTER TABLE public.property_listings
    DROP CONSTRAINT IF EXISTS chk_listing_listing_family;

ALTER TABLE public.property_listings
    ADD CONSTRAINT chk_listing_listing_family
    CHECK (listing_family IS NULL OR listing_family IN ('RESIDENTIAL', 'COMMERCIAL', 'AGRICULTURAL'));

-- =============================================================================
-- STEP 2: Detail tables (7) — 1:1 with property_listings, all payload cols NULLABLE
-- =============================================================================

-- 2a. RESIDENTIAL UNIT (apartment / house)
-- Backfilled from property_type IN ('house','apartment')
CREATE TABLE IF NOT EXISTS public.listing_residential_unit_details (
    listing_id       uuid          PRIMARY KEY
                                   REFERENCES public.property_listings(id) ON DELETE CASCADE,
    bedrooms         int,
    bathrooms        int,
    floor_number     int,
    total_floors     int,
    furnishing_status text,
    created_at       timestamptz   NOT NULL DEFAULT now()
);

-- 2b. RESIDENTIAL PLOT
-- Created EMPTY (no legacy 'plot' property_type exists; future FU3 captures new plots)
CREATE TABLE IF NOT EXISTS public.listing_residential_plot_details (
    listing_id       uuid          PRIMARY KEY
                                   REFERENCES public.property_listings(id) ON DELETE CASCADE,
    road_width_ft    numeric,
    facing           text,
    plot_dimensions  text,
    created_at       timestamptz   NOT NULL DEFAULT now()
);

-- 2c. COMMERCIAL SPACE (shop / office — shared shape, discriminated by commercial_subtype)
-- AMBIGUITY NOTE: legacy property_type='commercial' cannot be disambiguated into
-- shop vs office without user input. commercial_subtype is left NULL for all
-- backfilled rows. The enum authority for commercial_subtype is M38-FU7.
-- Backfilled from property_type = 'commercial'
CREATE TABLE IF NOT EXISTS public.listing_commercial_space_details (
    listing_id          uuid          PRIMARY KEY
                                      REFERENCES public.property_listings(id) ON DELETE CASCADE,
    commercial_subtype  text,          -- NULL = ambiguous legacy 'commercial'; never guess
    floor_number        int,
    total_floors        int,
    furnishing_status   text,
    washrooms           int,
    parking_count       int,
    road_frontage_ft    numeric,
    commercial_usage    text,
    created_at          timestamptz   NOT NULL DEFAULT now()
);

-- 2d. COMMERCIAL BUILDING
-- Backfilled from property_type = 'commercial_building'
CREATE TABLE IF NOT EXISTS public.listing_commercial_building_details (
    listing_id          uuid          PRIMARY KEY
                                      REFERENCES public.property_listings(id) ON DELETE CASCADE,
    number_of_units     int,
    total_floors        int,
    road_frontage_ft    numeric,
    commercial_usage    text,
    created_at          timestamptz   NOT NULL DEFAULT now()
);

-- 2e. WAREHOUSE
-- Backfilled from property_type = 'warehouse'
CREATE TABLE IF NOT EXISTS public.listing_warehouse_details (
    listing_id          uuid          PRIMARY KEY
                                      REFERENCES public.property_listings(id) ON DELETE CASCADE,
    total_floors        int,
    road_frontage_ft    numeric,
    commercial_usage    text,
    created_at          timestamptz   NOT NULL DEFAULT now()
);

-- 2f. COMMERCIAL LAND
-- Backfilled from property_type = 'commercial_land'
CREATE TABLE IF NOT EXISTS public.listing_commercial_land_details (
    listing_id          uuid          PRIMARY KEY
                                      REFERENCES public.property_listings(id) ON DELETE CASCADE,
    road_frontage_ft    numeric,
    created_at          timestamptz   NOT NULL DEFAULT now()
);

-- 2g. AGRICULTURAL LAND — PHYSICAL fields only
-- Backfilled from property_type = 'agricultural_land'
-- Ownership/document fields (ownership_type, survey_number) go to listing_ownership_details
-- per ADR §10(i).
-- fencing_done: stored as boolean matching the current property_listings column.
-- The ADR §10(e) notes a future rename to boundaryFencingStatus enum (M38-FU7 scope).
CREATE TABLE IF NOT EXISTS public.listing_agricultural_land_details (
    listing_id          uuid          PRIMARY KEY
                                      REFERENCES public.property_listings(id) ON DELETE CASCADE,
    water_source        text,
    soil_type           text,
    road_access         text,
    cultivation_status  text,
    land_category       text,
    farmhouse_available boolean,
    fencing_done        boolean,
    created_at          timestamptz   NOT NULL DEFAULT now()
);

-- =============================================================================
-- STEP 3: Shared tables (2) — 1:1 with property_listings
-- =============================================================================

-- 3a. RENTAL TERMS — populated when listing_purpose IN ('rent','lease')
-- and at least one rent field is present
CREATE TABLE IF NOT EXISTS public.listing_rental_terms (
    listing_id              uuid          PRIMARY KEY
                                          REFERENCES public.property_listings(id) ON DELETE CASCADE,
    monthly_rent            bigint,       -- paise
    security_deposit_months int,
    lock_in_months          int,
    created_at              timestamptz   NOT NULL DEFAULT now()
);

-- 3b. OWNERSHIP / DOCUMENT DETAILS
-- Populated when any ownership/document field is present.
-- Includes agri ownership_type + survey_number per ADR §10(i).
CREATE TABLE IF NOT EXISTS public.listing_ownership_details (
    listing_id                uuid          PRIMARY KEY
                                            REFERENCES public.property_listings(id) ON DELETE CASCADE,
    ownership_type            text,
    survey_number             text,
    rera_number               text,
    possession_status         text,
    expected_possession_date  date,
    created_at                timestamptz   NOT NULL DEFAULT now()
);

-- =============================================================================
-- STEP 4: Child / set tables (4) — own PK, created EMPTY
-- =============================================================================

-- 4a. AMENITIES
CREATE TABLE IF NOT EXISTS public.listing_amenities (
    id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id  uuid          NOT NULL REFERENCES public.property_listings(id) ON DELETE CASCADE,
    code        text          NOT NULL,
    created_at  timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT listing_amenities_listing_code_uniq UNIQUE (listing_id, code)
);

CREATE INDEX IF NOT EXISTS idx_listing_amenities_listing
    ON public.listing_amenities (listing_id);

-- 4b. SUITABLE USES
CREATE TABLE IF NOT EXISTS public.listing_suitable_uses (
    id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id  uuid          NOT NULL REFERENCES public.property_listings(id) ON DELETE CASCADE,
    code        text          NOT NULL,
    created_at  timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT listing_suitable_uses_listing_code_uniq UNIQUE (listing_id, code)
);

CREATE INDEX IF NOT EXISTS idx_listing_suitable_uses_listing
    ON public.listing_suitable_uses (listing_id);

-- 4c. LOCATION FEATURES
CREATE TABLE IF NOT EXISTS public.listing_location_features (
    id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id  uuid          NOT NULL REFERENCES public.property_listings(id) ON DELETE CASCADE,
    code        text          NOT NULL,
    created_at  timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT listing_location_features_listing_code_uniq UNIQUE (listing_id, code)
);

CREATE INDEX IF NOT EXISTS idx_listing_location_features_listing
    ON public.listing_location_features (listing_id);

-- 4d. AGRI CROPS
CREATE TABLE IF NOT EXISTS public.listing_agri_crops (
    id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id  uuid          NOT NULL REFERENCES public.property_listings(id) ON DELETE CASCADE,
    code        text          NOT NULL,
    created_at  timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT listing_agri_crops_listing_code_uniq UNIQUE (listing_id, code)
);

CREATE INDEX IF NOT EXISTS idx_listing_agri_crops_listing
    ON public.listing_agri_crops (listing_id);

-- =============================================================================
-- STEP 5: DML backfill (idempotent — ON CONFLICT (listing_id) DO NOTHING)
-- =============================================================================

-- ── 5a. listing_family stamp ──────────────────────────────────────────────────
-- Only stamp where listing_family is still NULL to preserve any future dual-write.

-- RESIDENTIAL: house, apartment
UPDATE public.property_listings
SET listing_family = 'RESIDENTIAL'
WHERE property_type IN ('house', 'apartment')
  AND listing_family IS NULL;

-- COMMERCIAL: all commercial subtypes
-- 'land' property_type is AMBIGUOUS (generic legacy land) — NOT stamped here;
-- it remains listing_family NULL per approved design.
UPDATE public.property_listings
SET listing_family = 'COMMERCIAL'
WHERE property_type IN ('commercial', 'commercial_building', 'warehouse', 'commercial_land')
  AND listing_family IS NULL;

-- AGRICULTURAL
UPDATE public.property_listings
SET listing_family = 'AGRICULTURAL'
WHERE property_type = 'agricultural_land'
  AND listing_family IS NULL;

-- property_type IN ('land','other') and NULL/unknown → listing_family stays NULL
-- (no UPDATE needed; they are left as-is)

-- ── 5b. Residential unit details (house / apartment) ─────────────────────────
-- Copies bedrooms, bathrooms, floor_number, total_floors, furnishing_status.
-- These columns stay in property_listings (canonical); this is a non-destructive copy.
-- INVARIANT: land_area, area_sqm, area_sqft, area_cent NOT touched.
INSERT INTO public.listing_residential_unit_details
    (listing_id, bedrooms, bathrooms, floor_number, total_floors, furnishing_status)
SELECT id, bedrooms, bathrooms, floor_number, total_floors, furnishing_status
FROM public.property_listings
WHERE property_type IN ('house', 'apartment')
ON CONFLICT (listing_id) DO NOTHING;

-- ── 5c. Commercial space details (commercial) ─────────────────────────────────
-- commercial_subtype = NULL: cannot disambiguate shop vs office from legacy data.
-- Copies floor_number, total_floors, furnishing_status, washrooms, parking_count,
-- road_frontage_ft, commercial_usage.
INSERT INTO public.listing_commercial_space_details
    (listing_id, commercial_subtype, floor_number, total_floors, furnishing_status,
     washrooms, parking_count, road_frontage_ft, commercial_usage)
SELECT id, NULL, floor_number, total_floors, furnishing_status,
       washrooms, parking_count, road_frontage_ft, commercial_usage
FROM public.property_listings
WHERE property_type = 'commercial'
ON CONFLICT (listing_id) DO NOTHING;

-- ── 5d. Commercial building details ──────────────────────────────────────────
INSERT INTO public.listing_commercial_building_details
    (listing_id, number_of_units, total_floors, road_frontage_ft, commercial_usage)
SELECT id, number_of_units, total_floors, road_frontage_ft, commercial_usage
FROM public.property_listings
WHERE property_type = 'commercial_building'
ON CONFLICT (listing_id) DO NOTHING;

-- ── 5e. Warehouse details ─────────────────────────────────────────────────────
INSERT INTO public.listing_warehouse_details
    (listing_id, total_floors, road_frontage_ft, commercial_usage)
SELECT id, total_floors, road_frontage_ft, commercial_usage
FROM public.property_listings
WHERE property_type = 'warehouse'
ON CONFLICT (listing_id) DO NOTHING;

-- ── 5f. Commercial land details ───────────────────────────────────────────────
INSERT INTO public.listing_commercial_land_details
    (listing_id, road_frontage_ft)
SELECT id, road_frontage_ft
FROM public.property_listings
WHERE property_type = 'commercial_land'
ON CONFLICT (listing_id) DO NOTHING;

-- ── 5g. Agricultural land details (PHYSICAL fields only) ─────────────────────
-- Ownership fields (ownership_type, survey_number) go to listing_ownership_details (5i).
-- INVARIANT: land_area NOT touched; fencing_done is a boolean physical field (ADR §10e
-- notes a future rename to enum in M38-FU7, but we backfill the boolean as-is).
INSERT INTO public.listing_agricultural_land_details
    (listing_id, water_source, soil_type, road_access, cultivation_status,
     land_category, farmhouse_available, fencing_done)
SELECT id, water_source, soil_type, road_access, cultivation_status,
       land_category, farmhouse_available, fencing_done
FROM public.property_listings
WHERE property_type = 'agricultural_land'
ON CONFLICT (listing_id) DO NOTHING;

-- ── 5h. Rental terms ─────────────────────────────────────────────────────────
-- Gate: listing_purpose IN ('rent','lease') AND at least one rent field is present.
-- DESIGN DECISION: a sale listing that has a stale monthly_rent value (data quality
-- artefact) does NOT get a rental_terms row — purpose gate is authoritative.
-- The legacy monthly_rent column is preserved in property_listings (not dropped here).
INSERT INTO public.listing_rental_terms
    (listing_id, monthly_rent, security_deposit_months, lock_in_months)
SELECT id, monthly_rent, security_deposit_months, lock_in_months
FROM public.property_listings
WHERE listing_purpose IN ('rent', 'lease')
  AND (monthly_rent IS NOT NULL
       OR security_deposit_months IS NOT NULL
       OR lock_in_months IS NOT NULL)
ON CONFLICT (listing_id) DO NOTHING;

-- ── 5i. Ownership / document details ─────────────────────────────────────────
-- Gate: at least one ownership/document field is present.
-- Covers agri ownership_type + survey_number (ADR §10i) plus dealer/commercial fields.
-- rera_number from property_listings (dealer workflow column, line 314).
INSERT INTO public.listing_ownership_details
    (listing_id, ownership_type, survey_number, rera_number,
     possession_status, expected_possession_date)
SELECT id, ownership_type, survey_number, rera_number,
       possession_status, expected_possession_date
FROM public.property_listings
WHERE ownership_type IS NOT NULL
   OR survey_number IS NOT NULL
   OR rera_number IS NOT NULL
   OR possession_status IS NOT NULL
   OR expected_possession_date IS NOT NULL
ON CONFLICT (listing_id) DO NOTHING;

-- =============================================================================
-- END V102
-- All new tables and the listing_family column are now in place.
-- Child set tables (listing_amenities, listing_suitable_uses,
-- listing_location_features, listing_agri_crops) are created EMPTY —
-- they will be populated by M38-FU3 (frontend capture).
-- listing_residential_plot_details is created EMPTY — no legacy 'plot'
-- property_type exists; new plots are captured by M38-FU3.
-- =============================================================================
