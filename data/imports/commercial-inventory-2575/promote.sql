-- =============================================================================
-- #2575 — EXPLICIT promotion: commercial_import_candidate -> property_listings
-- =============================================================================
-- This is the separately-invoked promotion step the issue requires. Staging alone
-- never reaches a buyer; this file is what moves a STAGED candidate into
-- property_listings, and even then NOT as LIVE.
--
-- Run it deliberately, never as part of an acquisition run:
--
--   BEGIN;
--   SET LOCAL app.import_owner = '<uuid of the owning profile>';
--   \i promote.sql
--   COMMIT;
--
-- ── WHY THE TRANSACTION BOUNDARY IS LOAD-BEARING, NOT STYLE ──────────────────
-- V135 installs a DEFERRED constraint trigger over the V102/V104 commercial_subtype
-- seam. It fires at COMMIT and asks whether the write model (property_listings.
-- commercial_subtype) and the read model (listing_commercial_space_details.
-- commercial_subtype) agree. This file writes BOTH, so inside one transaction it
-- commits cleanly. The IDENTICAL statements run statement-autocommitted do NOT:
-- the property_listings INSERT would commit alone and the guard would raise.
-- Do not split this file, and do not run it without a surrounding transaction.
--
-- ── WHY 'DRAFT' AND NOT 'LIVE' OR 'SCRAPED' ──────────────────────────────────
-- #2575: "scraping alone cannot make a listing LIVE". So not LIVE.
--
-- 'SCRAPED' looks like the natural choice — it is V7's ingestion default and
-- chk_listing_status permits it — but it is NOT invisible. V60's RLS SELECT policy
-- is `status = 'LIVE' OR (status = 'SCRAPED' AND is_valid = true)`, so a SCRAPED row
-- is readable by any authenticated user unless is_valid is false. Using is_valid to
-- buy invisibility would overload a data-quality flag to mean "unpublished", and a
-- later reader fixing the "invalid" rows would silently publish them.
--
-- 'DRAFT' appears in no SELECT policy and in no Discover predicate (Discover requires
-- status = 'LIVE'), so a promoted row is genuinely unpublished until an explicit,
-- separate publish step. That step is deliberately NOT in this file.
--
-- ── IDENTITY AND RERUNS ──────────────────────────────────────────────────────
-- The listing id is DERIVED, not generated: (md5(source_platform||':'||source_listing_id))::uuid,
-- matching import.sql's own derivation. That is what makes a rerun an UPDATE of the
-- same row rather than a second copy — #2575's "an updated source listing updates the
-- staged record rather than creating a duplicate".
--
-- ON CONFLICT DO UPDATE, deliberately NOT DO NOTHING. The existing #2304 import.sql
-- uses DO NOTHING throughout, which means a rerun after a source correction silently
-- no-ops while reporting success. That is the failure mode this issue names, so the
-- promotion path must actually carry a change through.
--
-- COLUMNS NOT WRITTEN HERE ARE LEFT ALONE. The UPDATE branch sets only columns this
-- pipeline owns, so a human edit to, say, a title is not clobbered by a re-promotion
-- of unchanged source data... with one deliberate exception: title IS owned here,
-- because it is sourced and a source correction must propagate.
--
-- ── SCOPE: THIS FILE IS ALL-OR-NOTHING ───────────────────────────────────────
-- ONE INVOCATION PROMOTES EVERY 'STAGED' ROW IN commercial_import_candidate —
-- across ALL batches and BOTH cities. There is no city, batch or date predicate
-- anywhere in this file, and adding one would be a behaviour change, not a tidy-up.
--
-- Stated explicitly because the alternative reading is plausible and costly. An
-- exact-head review read the owner's "promote the 11 coordinate-trusted Udupi rows
-- only" as a scope limit on this file and proposed a city predicate. It is not one:
-- the 71 coordinate-untrusted rows carry outcome='REJECTED', and every statement
-- here selects outcome='STAGED', so they are excluded STRUCTURALLY rather than by a
-- filter. Adding `AND city = 'Udupi'` would have silently dropped Bengaluru's 32
-- approved rows — and contradicted the same owner comment (5680529409), whose ruling 2
-- approves the actor for BOTH cities.
--
-- If a future caller genuinely needs partial promotion, the honest mechanism is to
-- narrow what is STAGED before invoking this file, not to add a predicate inside it.
--
-- One wording note for the next reader: that comment says keep the 71 "staged", while
-- in-schema they are outcome='REJECTED'. That is informal English, not the STAGED enum
-- value; the substance — do not promote them — is what this file implements.
--
-- ── WHY is_valid IS WRITTEN true, AND WHY IT DOES NOT PUBLISH ────────────────
-- is_valid = true is a claim about DATA QUALITY, and on these rows it is simply true:
-- only candidates that passed every normalisation and coordinate-trust gate reach
-- outcome='STAGED' at all. Writing false to buy invisibility is the overload this file
-- already rejects above — and it would be worse than cosmetic, because a later reader
-- "fixing the invalid rows" would then publish them without deciding to.
--
-- Invisibility comes from status='DRAFT', which appears in no RLS SELECT policy and no
-- Discover predicate. The two flags are independent, and only one of them is a
-- visibility control.
--
-- The residual risk is worth naming rather than leaving implicit: V60's RLS exposes
-- `status='SCRAPED' AND is_valid=true`, so a future step that moves these rows to
-- SCRAPED would publish all of them immediately, with no further decision. Any such
-- step must set visibility deliberately; it must not treat a pre-existing is_valid as
-- permission it inherited.
--
-- ── KNOWN GAP, RECORDED RATHER THAN SILENTLY CARRIED ─────────────────────────
-- Section 3 marks every STAGED row PROMOTED whether or not sections 2a–2d wrote a typed
-- detail projection for it, and V136 places no CHECK on property_type. With the committed
-- captures this is unreachable — all 43 rows map to the four routed types — so it is a
-- robustness gap, not a live defect. A future capture introducing a fifth property_type
-- would promote rows into property_listings with no typed projection and still record
-- them as PROMOTED. Raised as a design note by the exact-head review of f486ffa1; the fix
-- belongs with the capture that first needs it, where the correct routing is knowable.
-- =============================================================================

-- Fail loudly rather than promoting rows to a NULL owner. current_setting(...,true)
-- returns NULL rather than erroring when unset, so the check is explicit.
DO $$
BEGIN
    IF coalesce(current_setting('app.import_owner', true), '') = '' THEN
        RAISE EXCEPTION
            'app.import_owner is not set. Run: SET LOCAL app.import_owner = ''<owner uuid>''; '
            'before \i promote.sql — promoting to a NULL owner would orphan every row.';
    END IF;
END
$$;

-- ── 1. property_listings (write model, V104 flat columns) ────────────────────
INSERT INTO public.property_listings (
    id, created_by, property_type, listing_family, status,
    is_valid, is_duplicate,
    area_key, area_label, locality, title,
    latitude, longitude,
    price, price_paise, monthly_rent,
    built_area, built_area_unit, land_area, land_area_unit,
    listing_purpose,
    floor_number, total_floors, washrooms,
    commercial_subtype, commercial_furnishing_status,
    area_resolution_status, area_resolution_method,
    parsed_data
)
SELECT
    (md5(c.source_platform || ':' || c.source_listing_id))::uuid,
    current_setting('app.import_owner')::uuid,
    -- No cast. V61 converted property_listings.property_type from the V0 enum
    -- public.property_type to VARCHAR(30) and DROPPED the type, for the same reason V60
    -- converted status: Hibernate binds these as VARCHAR and Postgres silently rejects
    -- VARCHAR-vs-enum comparisons. An explicit ::public.property_type cast therefore fails
    -- with 'type "public.property_type" does not exist' — measured, not theorised: it is
    -- what the first run of CommercialImportPromotion2575IT reported, on 8 of 9 tests.
    c.property_type,
    c.property_family,
    'DRAFT',
    true,
    false,
    c.area_key, c.area_label, c.locality, c.title,
    c.latitude, c.longitude,
    c.price, c.price_paise, c.monthly_rent,
    c.built_area, c.built_area_unit, c.land_area, c.land_area_unit,
    c.listing_purpose,
    c.floor_number, c.total_floors, c.washrooms,
    c.commercial_subtype, c.commercial_furnishing_status,
    -- V117 resolution status, MEASURED rather than stamped.
    --
    -- An earlier revision wrote 'RESOLVED','CANONICAL_KEY' unconditionally. That was a quiet lie:
    -- CommercialPipelineEndToEnd2575IT proves three promoted rows carry an area_key matching NO
    -- row in `areas` — IN|KA|Udupi|Ambagilu and IN|KA|Udupi|Brahmagiri are seeded by #2304's
    -- area-seed.sql, not by any migration. Recording those as RESOLVED/CANONICAL_KEY made the
    -- prerequisite INVISIBLE in the data: the row claims a canonical match precisely where none
    -- exists, and V117's partial index on 'UNRESOLVED' would never surface it. The defect does not
    -- fail; it lies quietly, and it erases the finding.
    --
    -- V117 defines CANONICAL_KEY as an exact match on the ACTIVE areas.area_key, so the lifecycle
    -- filter is part of the claim being made — a key matching only a MERGED or INACTIVE area is
    -- not a canonical resolution. V117 also requires area_resolution_method to be NULL whenever
    -- status is UNRESOLVED, which the second CASE honours.
    CASE WHEN EXISTS (SELECT 1 FROM public.areas a
                      WHERE a.area_key = c.area_key AND a.lifecycle_status = 'ACTIVE')
         THEN 'RESOLVED' ELSE 'UNRESOLVED' END,
    CASE WHEN EXISTS (SELECT 1 FROM public.areas a
                      WHERE a.area_key = c.area_key AND a.lifecycle_status = 'ACTIVE')
         THEN 'CANONICAL_KEY' ELSE NULL END,
    jsonb_build_object(
        'source',        c.source_platform,
        'listingId',     c.source_listing_id,
        'sourceUrl',     c.source_url,
        'scrapedAt',     c.scraped_at,
        'importIssue',   2575,
        'batchId',       c.batch_id
    )
FROM public.commercial_import_candidate c
WHERE c.outcome = 'STAGED'
ON CONFLICT (id) DO UPDATE SET
    property_type                = EXCLUDED.property_type,
    listing_family               = EXCLUDED.listing_family,
    area_key                     = EXCLUDED.area_key,
    area_label                   = EXCLUDED.area_label,
    locality                     = EXCLUDED.locality,
    title                        = EXCLUDED.title,
    latitude                     = EXCLUDED.latitude,
    longitude                    = EXCLUDED.longitude,
    price                        = EXCLUDED.price,
    price_paise                  = EXCLUDED.price_paise,
    monthly_rent                 = EXCLUDED.monthly_rent,
    built_area                   = EXCLUDED.built_area,
    built_area_unit              = EXCLUDED.built_area_unit,
    land_area                    = EXCLUDED.land_area,
    land_area_unit               = EXCLUDED.land_area_unit,
    listing_purpose              = EXCLUDED.listing_purpose,
    floor_number                 = EXCLUDED.floor_number,
    total_floors                 = EXCLUDED.total_floors,
    washrooms                    = EXCLUDED.washrooms,
    commercial_subtype           = EXCLUDED.commercial_subtype,
    commercial_furnishing_status = EXCLUDED.commercial_furnishing_status,
    -- Both resolution columns MUST be in this update set. Omitting them was the second half of
    -- the same defect as the unconditional stamp above: a row promoted while its area was
    -- unseeded would keep area_resolution_status='UNRESOLVED' forever, even after the area was
    -- seeded and a re-promote re-measured it as RESOLVED — and vice versa. A value that can go
    -- stale and never be corrected is worse than one that is merely wrong once, because the
    -- re-run that should fix it silently does not.
    area_resolution_status       = EXCLUDED.area_resolution_status,
    area_resolution_method       = EXCLUDED.area_resolution_method,
    parsed_data                  = EXCLUDED.parsed_data,
    updated_at                   = now();
    -- status is NOT updated: a row already published by an explicit publish step
    -- must not be silently demoted to DRAFT by a routine re-promotion.

-- ── 2. typed detail projections (V102 read model) ────────────────────────────
-- Routed by property_type, mirroring the contract V135 and
-- scripts/db/fixtures/commercial-listings-seed.sql both state:
--   commercial          -> SHOP | OFFICE | NULL -> listing_commercial_space_details
--   commercial_building -> BUILDING             -> listing_commercial_building_details
--   warehouse           -> WAREHOUSE            -> listing_warehouse_details
--   commercial_land     -> LAND                 -> listing_commercial_land_details
-- Only listing_commercial_space_details carries a commercial_subtype column; for the
-- self-describing types the subtype lives ONLY in the V104 flat column and every read
-- surface resolves it from property_type.

-- 2a. commercial -> listing_commercial_space_details.
-- THIS is the one V135's trigger checks. commercial_subtype must equal the flat column.
INSERT INTO public.listing_commercial_space_details (
    listing_id, commercial_subtype, floor_number, total_floors, furnishing_status, washrooms
)
SELECT
    (md5(c.source_platform || ':' || c.source_listing_id))::uuid,
    c.commercial_subtype, c.floor_number, c.total_floors,
    c.commercial_furnishing_status, c.washrooms
FROM public.commercial_import_candidate c
WHERE c.outcome = 'STAGED' AND c.property_type = 'commercial'
ON CONFLICT (listing_id) DO UPDATE SET
    commercial_subtype = EXCLUDED.commercial_subtype,
    floor_number       = EXCLUDED.floor_number,
    total_floors       = EXCLUDED.total_floors,
    furnishing_status  = EXCLUDED.furnishing_status,
    washrooms          = EXCLUDED.washrooms;

-- 2b. commercial_building -> listing_commercial_building_details (no subtype column).
INSERT INTO public.listing_commercial_building_details (listing_id, total_floors)
SELECT (md5(c.source_platform || ':' || c.source_listing_id))::uuid, c.total_floors
FROM public.commercial_import_candidate c
WHERE c.outcome = 'STAGED' AND c.property_type = 'commercial_building'
ON CONFLICT (listing_id) DO UPDATE SET total_floors = EXCLUDED.total_floors;

-- 2c. warehouse -> listing_warehouse_details.
INSERT INTO public.listing_warehouse_details (listing_id, total_floors)
SELECT (md5(c.source_platform || ':' || c.source_listing_id))::uuid, c.total_floors
FROM public.commercial_import_candidate c
WHERE c.outcome = 'STAGED' AND c.property_type = 'warehouse'
ON CONFLICT (listing_id) DO UPDATE SET total_floors = EXCLUDED.total_floors;

-- 2d. commercial_land -> listing_commercial_land_details.
-- road_frontage_ft has no source field in this capture and is left NULL, never guessed.
INSERT INTO public.listing_commercial_land_details (listing_id)
SELECT (md5(c.source_platform || ':' || c.source_listing_id))::uuid
FROM public.commercial_import_candidate c
WHERE c.outcome = 'STAGED' AND c.property_type = 'commercial_land'
ON CONFLICT (listing_id) DO NOTHING;

-- ── 3. close the loop on the staging rows ────────────────────────────────────
-- A candidate that has been promoted records WHICH listing it became. Without this
-- the staging table cannot answer "was this promoted?", and a rerun could not tell a
-- new row from one already carried across.
UPDATE public.commercial_import_candidate c
SET outcome             = 'PROMOTED',
    promoted_listing_id = (md5(c.source_platform || ':' || c.source_listing_id))::uuid,
    promoted_at         = now(),
    updated_at          = now()
WHERE c.outcome = 'STAGED';
