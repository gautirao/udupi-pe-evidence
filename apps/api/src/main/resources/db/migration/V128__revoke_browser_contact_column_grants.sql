-- V128: close the browser-readable/writable contact-PII column leak (#2280).
--
-- Context: public.property_listings RLS (effective SELECT policy at
-- V60__convert_status_enum_to_varchar.sql:84-90, "Authenticated users can view visible
-- listings") is a ROW-only filter — USING (status = 'LIVE' OR (status = 'SCRAPED' AND
-- is_valid = true)). PostgreSQL RLS can only ever restrict WHICH ROWS are visible, never
-- WHICH COLUMNS within a visible row. There is no GRANT/REVOKE statement anywhere in the
-- preceding 127 migrations, so `anon` and `authenticated` — the two PostgREST roles every
-- browser request executes as — hold whatever default table privileges the Supabase
-- platform granted, which includes SELECT (and INSERT/UPDATE) on contact_phone and
-- contact_info for every row any row policy admits. Confirmed live by the #2047 audit.
--
-- CORRECTED MECHANISM (reroute cycle 1 — the original V128 was empirically falsified by
-- V128ContactColumnGrantsIT): PostgreSQL privileges are ADDITIVE and there is no DENY.
-- A table-wide `GRANT SELECT ON property_listings TO authenticated` (the realistic
-- Supabase platform bootstrap: `GRANT ALL ON ALL TABLES IN SCHEMA public TO anon,
-- authenticated, service_role`) confers SELECT on EVERY column. A bare
-- `REVOKE SELECT (contact_phone, contact_info) ... FROM authenticated` does NOT subtract
-- from that broader table-level grant — it only removes a column-level ACL entry that, in
-- this scenario, was never separately granted, so it is a silent no-op. The IT proved this:
-- after simulating the platform's table-wide GRANT ALL, a column-only REVOKE left
-- has_column_privilege('authenticated', 'public.property_listings', 'contact_phone',
-- 'SELECT') = TRUE and a browser-role UPDATE of contact_phone still succeeded.
--
-- The only mechanism Postgres actually offers for a column-scoped restriction is:
--   1. REVOKE the TABLE-level SELECT/INSERT/UPDATE privilege outright (removing the
--      blanket grant that would otherwise cover every column, present and future), then
--   2. GRANT back, COLUMN BY COLUMN, an explicit allow-list covering every column except
--      contact_phone and contact_info.
-- This is enforced by the Postgres executor on every column reference (target list, `*`
-- expansion, WHERE, ORDER BY, RETURNING) — a boundary independent of any client code,
-- current or future.
--
-- ⚠ OPERATIONAL HAZARD (read before adding any future property_listings column):
-- because the permitted columns are now enumerated EXPLICITLY rather than granted via a
-- blanket table-level privilege, any column added to property_listings by a FUTURE Flyway
-- migration is DEFAULT-DENY to `anon`/`authenticated` until a LATER migration explicitly
-- adds it to the GRANT SELECT/INSERT/UPDATE column lists below. This is the correct
-- fail-safe direction (a forgotten grant hides data rather than leaking it), but it is a
-- real hazard: a column that Flyway adds successfully can still be silently invisible to
-- every browser request (PostgREST just omits it, no error) until someone remembers to
-- extend this migration's allow-list in a follow-up migration. The next engineer adding a
-- property_listings column MUST also ship a migration granting that column here.
--
-- The revoke targets `anon` and `authenticated` BY NAME only — never PUBLIC, never the
-- table owner, never the backend's JDBC login role (a plain Postgres login role, distinct
-- from the two PostgREST roles, configured via the Spring datasource username). The
-- backend must retain full column access (AC7); this is a stop-condition, not a
-- preference.
--
-- `anon` scope decision: `anon` is granted SELECT only — never INSERT or UPDATE. Every
-- INSERT/UPDATE row policy on property_listings (V42, V59, V60) is scoped `TO
-- authenticated`; there is no row policy admitting `anon` writes at all, so an anon
-- column-level INSERT/UPDATE grant would be privilege with no legitimate corresponding
-- row policy — pure attack surface with zero product need. `authenticated` gets
-- SELECT + INSERT + UPDATE (never DELETE — see below).
--
-- DELETE is intentionally untouched by this migration — no REVOKE, no re-GRANT. The
-- existing DELETE row policy (V60:105-116, "Dealers and owners can delete own draft or
-- rejected listings", TO authenticated) continues to gate DELETE exactly as it did before
-- this migration; DELETE has no column granularity in Postgres, so there is nothing to
-- scope contact_phone/contact_info out of for that operation, and disturbing it here would
-- be scope creep unrelated to the PII column leak this migration closes.
--
-- The one legitimate need for reading contact_phone from the browser — admin duplicate
-- matching (src/hooks/useDuplicateManagement.ts:54-55) — is preserved via an admin-gated
-- SECURITY DEFINER function, admin_find_contact_duplicate_candidates(p_duplicate_id UUID,
-- p_limit INTEGER), that performs the match server-side and returns candidate listing IDs
-- only. It never returns contact_phone/contact_info to the caller. It takes the DUPLICATE'S
-- OWN id and resolves that row's contact_phone internally — the original signature took the
-- phone number as a caller-supplied argument, which this very migration makes unsatisfiable
-- (the browser can no longer read contact_phone to pass it in), so it has been changed to
-- resolve the phone server-side under the SECURITY DEFINER boundary instead.
--
-- Reroute cycle 3 (#2280 GAP-1/GAP-2, Main-Agent-approved scope amendment): two RPC changes.
--
-- GAP-1: the duplicate-candidates function's signature changed from
-- (p_contact_phone TEXT, p_limit INTEGER) to (p_duplicate_id UUID, p_limit INTEGER) for the
-- reason above. The old two-argument overload is explicitly DROPped (not just replaced) so no
-- stale, now-unreachable overload survives — CREATE OR REPLACE does not replace a function
-- whose argument types differ; it creates a second overload alongside the first.
--
-- GAP-2: a NEW function, admin_get_listing_contacts(p_listing_ids UUID[]), is added. This is
-- a deliberate, Main-Agent-approved reversal of the stated "the RPC must not return the phone
-- to the browser" principle above — but only for this one, narrowly-scoped, admin-only
-- function, and only because it grants NO NEW capability. The admin UI already legitimately
-- displays broker contact details today, and the existing "Admins can manage all listings"
-- RLS policy (V0.1:104-106) already grants admins full row access to contact_phone and
-- contact_info at the database layer — an admin session can already SELECT these columns
-- through ordinary RLS-gated queries. What this function changes is HOW that access is
-- enforced: previously the admin-only gate lived in a client-side React `isAdmin` flag (an
-- insecure, spoofable boundary — a compromised or modified client could set it and read
-- contact PII the browser role now structurally cannot, since this migration revoked the
-- column-level grant). This function moves that gate onto a database-enforced,
-- SECURITY DEFINER boundary (`IF NOT public.is_admin(auth.uid()) THEN RAISE`) that cannot be
-- bypassed by client-side tampering. It is a security IMPROVEMENT over the pre-migration
-- status quo, not a regression, provided (and only provided) the is_admin check is the FIRST
-- statement in the function body and no row is fetched or returned before it runs — which is
-- how it is written below. A future reader must not mistake this function for an oversight
-- that reopens the hole the rest of this migration closes: it does not, because it re-derives
-- the same privilege boundary the admin RLS policy already grants, just enforced server-side
-- instead of trusted to the client.
--
-- Column list provenance (#2280 reroute cycle 2 — CATALOG-VERIFIED, superseding cycle 1):
-- reroute cycle 1's list was hand-derived by reading migration DDL and drifted 14 columns
-- short (area_sqm, area_sqft, area_cent, price_per_cent_paise from V3; status_changed_at,
-- status_changed_by_actor_type, status_changed_by_actor_id, status_reason_code,
-- status_reason_note, approved_at, rejected_at, submission_count, review_submitted_at from
-- V43; geog from V73 — all real, non-contact columns that had silently LOST their grants).
-- That drift was invisible from migration archaeology alone and was only caught by
-- V128ContactColumnGrantsIT#allowListCompleteness_everyCatalogColumnMatchesExpectedPrivilegeShape,
-- which reads information_schema.columns directly on a migrated Testcontainers database
-- rather than trusting a hand-written list. The list below has been reconciled against that
-- catalog: public.property_listings has 163 real columns; 163 − 2 (contact_phone,
-- contact_info) = 161 permitted columns, which is what SELECT/INSERT/UPDATE below grant to
-- `authenticated` and SELECT grants to `anon`. NOT derived from the generated frontend types
-- (src/integrations/supabase/types.ts is stale/incomplete against the real schema and was
-- never used as a source of truth here either). Maintainers: when adding a future column,
-- verify this list against the catalog (e.g. re-run the completeness IT, or query
-- information_schema.columns on a migrated database) — do NOT re-derive it by reading
-- migration DDL by hand, which is exactly how the 14-column drift happened.
--
-- Idempotency: REVOKE/GRANT are naturally idempotent (re-running restates the same final
-- privilege set); the function uses CREATE OR REPLACE; every role reference is guarded by a
-- pg_roles existence check (same idiom as
-- backend/src/test/resources/db/test-stubs/beforeMigrate.sql:32-38) so this migration is a
-- safe no-op on any Postgres instance lacking the Supabase platform roles, and safely
-- re-runnable if Supabase platform tooling ever re-grants privileges outside this pipeline
-- (see #2280 risk R6 — a re-assert of this migration is the documented mitigation).
--
-- Additive only: no DROP, no column removal, no data mutation.

-- 1. Revoke the table-wide SELECT/INSERT/UPDATE grants from the PostgREST browser roles.
--    This removes whatever blanket privilege the Supabase platform bootstrap conferred
--    (including on contact_phone/contact_info) so that nothing is implicitly visible.
--    DELETE is deliberately not touched — see header.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE SELECT, INSERT, UPDATE ON public.property_listings FROM anon;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE SELECT, INSERT, UPDATE ON public.property_listings FROM authenticated;
    END IF;
END
$$;

-- 2. Grant back, column-by-column, every column EXCEPT contact_phone and contact_info
--    (161 of the table's 163 catalog columns, catalog-verified — see provenance note above).
--    Explicit allow-list — see the operational-hazard note in the header before adding a
--    new property_listings column.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        GRANT SELECT (
            -- V0 base columns (excluding contact_info, contact_phone)
            id, raw_post_id, property_type, title, locality, price, price_unit,
            land_area, land_area_unit, built_area, built_area_unit, bedrooms, bathrooms,
            description, latitude, longitude, confidence_score, language_detected,
            is_valid, is_duplicate, parsed_data, updated_by, created_at, updated_at,
            -- V5, V6, V7
            repost_count, area_key, area_label, status,
            -- V8
            address_confirmed, rejection_reason, submitted_at, reviewed_at, reviewed_by,
            created_by,
            -- V11, V18, V26, V29, V30
            price_paise, dedupe_hash, search_vector, video_url, listing_number,
            rera_number,
            -- V32
            listing_purpose, carpet_area, carpet_area_unit, floor_number, total_floors,
            furnishing_status, washrooms, parking_count, road_frontage_ft,
            commercial_usage, number_of_units, monthly_rent, security_deposit_months,
            lock_in_months,
            -- V33, V35, V36
            seller_type, archived_at, is_suspected_duplicate,
            -- V38
            first_published_at, last_live_at, back_to_market_at, last_updated_at,
            -- V40, V44, V46
            possession_status, expected_possession_date, approvals_declared,
            last_approved_snapshot, trust_tier, ranking_score,
            -- V84, V85, V89 (agricultural)
            water_source, soil_type, road_access, cultivation_status, ownership_type,
            survey_number, boundary, land_category, farmhouse_available, fencing_done,
            -- V92 (quality)
            quality_score, quality_breakdown, quality_computed_at,
            -- V102 (typed listing discriminator)
            listing_family,
            -- V103 (residential typed fields)
            balconies, facing, availability_timeline, super_built_area,
            super_built_area_unit, property_age, residential_water_source,
            parking_2w_count, parking_4w_count, road_width_ft, plot_dimensions,
            conversion_status, khata_number, property_tax_pid, approving_authority,
            project_name, builder_name, maintenance_paise, has_lift, has_power_backup,
            is_gated, has_garden, has_terrace, has_compound, has_servant_room,
            is_corner_plot, has_boundary_wall, is_gated_layout, has_water_connection,
            has_electricity_connection, has_drainage, price_negotiable, rent_negotiable,
            pets_allowed, maintenance_included,
            -- V104 (commercial typed fields)
            commercial_subtype, floor_choice, floor_mode, hub_type, washrooms_public,
            washrooms_private, parking_public_count, parking_private_count,
            office_seats, office_cabins, office_meeting_rooms, occupancy_status,
            power_load_kva, warehouse_clear_height_ft, warehouse_loading_bays,
            warehouse_flooring, commercial_zoning, commercial_ownership,
            commercial_approvals, expected_rental_yield_pct,
            current_monthly_income_paise, lease_term_months, lease_escalation_pct,
            commercial_furnishing_status, commercial_availability, commercial_area_unit,
            warehouse_truck_access,
            -- V114, V117, V126
            last_confirmed_at, area_resolution_status, area_resolution_method,
            agri_conversion_status,
            -- V3 (normalized area fields, reroute cycle 2 — previously omitted)
            area_sqm, area_sqft, area_cent, price_per_cent_paise,
            -- V43 (listing lifecycle/status-history columns, reroute cycle 2 — previously omitted)
            status_changed_at, status_changed_by_actor_type, status_changed_by_actor_id,
            status_reason_code, status_reason_note, approved_at, rejected_at,
            submission_count, review_submitted_at,
            -- V73 (PostGIS generated geography column, reroute cycle 2 — previously omitted)
            geog
        ),
        INSERT (
            id, raw_post_id, property_type, title, locality, price, price_unit,
            land_area, land_area_unit, built_area, built_area_unit, bedrooms, bathrooms,
            description, latitude, longitude, confidence_score, language_detected,
            is_valid, is_duplicate, parsed_data, updated_by, created_at, updated_at,
            repost_count, area_key, area_label, status,
            address_confirmed, rejection_reason, submitted_at, reviewed_at, reviewed_by,
            created_by,
            price_paise, dedupe_hash, search_vector, video_url, listing_number,
            rera_number,
            listing_purpose, carpet_area, carpet_area_unit, floor_number, total_floors,
            furnishing_status, washrooms, parking_count, road_frontage_ft,
            commercial_usage, number_of_units, monthly_rent, security_deposit_months,
            lock_in_months,
            seller_type, archived_at, is_suspected_duplicate,
            first_published_at, last_live_at, back_to_market_at, last_updated_at,
            possession_status, expected_possession_date, approvals_declared,
            last_approved_snapshot, trust_tier, ranking_score,
            water_source, soil_type, road_access, cultivation_status, ownership_type,
            survey_number, boundary, land_category, farmhouse_available, fencing_done,
            quality_score, quality_breakdown, quality_computed_at,
            listing_family,
            balconies, facing, availability_timeline, super_built_area,
            super_built_area_unit, property_age, residential_water_source,
            parking_2w_count, parking_4w_count, road_width_ft, plot_dimensions,
            conversion_status, khata_number, property_tax_pid, approving_authority,
            project_name, builder_name, maintenance_paise, has_lift, has_power_backup,
            is_gated, has_garden, has_terrace, has_compound, has_servant_room,
            is_corner_plot, has_boundary_wall, is_gated_layout, has_water_connection,
            has_electricity_connection, has_drainage, price_negotiable, rent_negotiable,
            pets_allowed, maintenance_included,
            commercial_subtype, floor_choice, floor_mode, hub_type, washrooms_public,
            washrooms_private, parking_public_count, parking_private_count,
            office_seats, office_cabins, office_meeting_rooms, occupancy_status,
            power_load_kva, warehouse_clear_height_ft, warehouse_loading_bays,
            warehouse_flooring, commercial_zoning, commercial_ownership,
            commercial_approvals, expected_rental_yield_pct,
            current_monthly_income_paise, lease_term_months, lease_escalation_pct,
            commercial_furnishing_status, commercial_availability, commercial_area_unit,
            warehouse_truck_access,
            last_confirmed_at, area_resolution_status, area_resolution_method,
            agri_conversion_status,
            area_sqm, area_sqft, area_cent, price_per_cent_paise,
            status_changed_at, status_changed_by_actor_type, status_changed_by_actor_id,
            status_reason_code, status_reason_note, approved_at, rejected_at,
            submission_count, review_submitted_at,
            geog
        ),
        UPDATE (
            id, raw_post_id, property_type, title, locality, price, price_unit,
            land_area, land_area_unit, built_area, built_area_unit, bedrooms, bathrooms,
            description, latitude, longitude, confidence_score, language_detected,
            is_valid, is_duplicate, parsed_data, updated_by, created_at, updated_at,
            repost_count, area_key, area_label, status,
            address_confirmed, rejection_reason, submitted_at, reviewed_at, reviewed_by,
            created_by,
            price_paise, dedupe_hash, search_vector, video_url, listing_number,
            rera_number,
            listing_purpose, carpet_area, carpet_area_unit, floor_number, total_floors,
            furnishing_status, washrooms, parking_count, road_frontage_ft,
            commercial_usage, number_of_units, monthly_rent, security_deposit_months,
            lock_in_months,
            seller_type, archived_at, is_suspected_duplicate,
            first_published_at, last_live_at, back_to_market_at, last_updated_at,
            possession_status, expected_possession_date, approvals_declared,
            last_approved_snapshot, trust_tier, ranking_score,
            water_source, soil_type, road_access, cultivation_status, ownership_type,
            survey_number, boundary, land_category, farmhouse_available, fencing_done,
            quality_score, quality_breakdown, quality_computed_at,
            listing_family,
            balconies, facing, availability_timeline, super_built_area,
            super_built_area_unit, property_age, residential_water_source,
            parking_2w_count, parking_4w_count, road_width_ft, plot_dimensions,
            conversion_status, khata_number, property_tax_pid, approving_authority,
            project_name, builder_name, maintenance_paise, has_lift, has_power_backup,
            is_gated, has_garden, has_terrace, has_compound, has_servant_room,
            is_corner_plot, has_boundary_wall, is_gated_layout, has_water_connection,
            has_electricity_connection, has_drainage, price_negotiable, rent_negotiable,
            pets_allowed, maintenance_included,
            commercial_subtype, floor_choice, floor_mode, hub_type, washrooms_public,
            washrooms_private, parking_public_count, parking_private_count,
            office_seats, office_cabins, office_meeting_rooms, occupancy_status,
            power_load_kva, warehouse_clear_height_ft, warehouse_loading_bays,
            warehouse_flooring, commercial_zoning, commercial_ownership,
            commercial_approvals, expected_rental_yield_pct,
            current_monthly_income_paise, lease_term_months, lease_escalation_pct,
            commercial_furnishing_status, commercial_availability, commercial_area_unit,
            warehouse_truck_access,
            last_confirmed_at, area_resolution_status, area_resolution_method,
            agri_conversion_status,
            area_sqm, area_sqft, area_cent, price_per_cent_paise,
            status_changed_at, status_changed_by_actor_type, status_changed_by_actor_id,
            status_reason_code, status_reason_note, approved_at, rejected_at,
            submission_count, review_submitted_at,
            geog
        )
        ON public.property_listings TO authenticated;
    END IF;

    -- anon: SELECT only — no row policy on property_listings admits an anon-authored
    -- INSERT or UPDATE (every write policy is `TO authenticated`), so anon gets no
    -- column-level INSERT/UPDATE grant at all (see header rationale).
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        GRANT SELECT (
            id, raw_post_id, property_type, title, locality, price, price_unit,
            land_area, land_area_unit, built_area, built_area_unit, bedrooms, bathrooms,
            description, latitude, longitude, confidence_score, language_detected,
            is_valid, is_duplicate, parsed_data, updated_by, created_at, updated_at,
            repost_count, area_key, area_label, status,
            address_confirmed, rejection_reason, submitted_at, reviewed_at, reviewed_by,
            created_by,
            price_paise, dedupe_hash, search_vector, video_url, listing_number,
            rera_number,
            listing_purpose, carpet_area, carpet_area_unit, floor_number, total_floors,
            furnishing_status, washrooms, parking_count, road_frontage_ft,
            commercial_usage, number_of_units, monthly_rent, security_deposit_months,
            lock_in_months,
            seller_type, archived_at, is_suspected_duplicate,
            first_published_at, last_live_at, back_to_market_at, last_updated_at,
            possession_status, expected_possession_date, approvals_declared,
            last_approved_snapshot, trust_tier, ranking_score,
            water_source, soil_type, road_access, cultivation_status, ownership_type,
            survey_number, boundary, land_category, farmhouse_available, fencing_done,
            quality_score, quality_breakdown, quality_computed_at,
            listing_family,
            balconies, facing, availability_timeline, super_built_area,
            super_built_area_unit, property_age, residential_water_source,
            parking_2w_count, parking_4w_count, road_width_ft, plot_dimensions,
            conversion_status, khata_number, property_tax_pid, approving_authority,
            project_name, builder_name, maintenance_paise, has_lift, has_power_backup,
            is_gated, has_garden, has_terrace, has_compound, has_servant_room,
            is_corner_plot, has_boundary_wall, is_gated_layout, has_water_connection,
            has_electricity_connection, has_drainage, price_negotiable, rent_negotiable,
            pets_allowed, maintenance_included,
            commercial_subtype, floor_choice, floor_mode, hub_type, washrooms_public,
            washrooms_private, parking_public_count, parking_private_count,
            office_seats, office_cabins, office_meeting_rooms, occupancy_status,
            power_load_kva, warehouse_clear_height_ft, warehouse_loading_bays,
            warehouse_flooring, commercial_zoning, commercial_ownership,
            commercial_approvals, expected_rental_yield_pct,
            current_monthly_income_paise, lease_term_months, lease_escalation_pct,
            commercial_furnishing_status, commercial_availability, commercial_area_unit,
            warehouse_truck_access,
            last_confirmed_at, area_resolution_status, area_resolution_method,
            agri_conversion_status,
            -- V3, V43, V73 (reroute cycle 2 — previously omitted; anon gets SELECT only)
            area_sqm, area_sqft, area_cent, price_per_cent_paise,
            status_changed_at, status_changed_by_actor_type, status_changed_by_actor_id,
            status_reason_code, status_reason_note, approved_at, rejected_at,
            submission_count, review_submitted_at,
            geog
        )
        ON public.property_listings TO anon;
    END IF;
END
$$;

-- 3. Admin-scoped SECURITY DEFINER function preserving the one legitimate browser need:
--    duplicate matching by contact_phone (src/hooks/useDuplicateManagement.ts:54-55).
--    Returns candidate listing IDs only — NEVER contact_phone/contact_info — so it cannot
--    reopen the hole this migration closes. Reuses the existing public.is_admin(uuid)
--    helper (V0__initial_schema.sql:141-149) rather than reinventing an admin check.
--
--    Signature note (reroute cycle 3 / GAP-1): takes the DUPLICATE'S OWN id and resolves its
--    contact_phone internally, under the SECURITY DEFINER boundary — the caller (a browser
--    session with no column-level SELECT on contact_phone) cannot supply the phone number
--    itself. Drop the old two-argument overload explicitly first: CREATE OR REPLACE does not
--    replace a function whose argument types differ, so without the DROP the old
--    (TEXT, INTEGER) overload would remain callable and unreachable-but-present.
DROP FUNCTION IF EXISTS public.admin_find_contact_duplicate_candidates(TEXT, INTEGER);

CREATE OR REPLACE FUNCTION public.admin_find_contact_duplicate_candidates(
    p_duplicate_id UUID,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE(id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
    v_contact_phone TEXT;
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'permission denied: admin_find_contact_duplicate_candidates requires admin privileges';
    END IF;

    SELECT pl.contact_phone INTO v_contact_phone
    FROM public.property_listings pl
    WHERE pl.id = p_duplicate_id;

    -- A listing with no contact_phone (NULL) is an ordinary case, not an error condition —
    -- return zero candidates rather than raising.
    IF v_contact_phone IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT pl.id
    FROM public.property_listings pl
    WHERE pl.is_duplicate = false
      AND pl.contact_phone = v_contact_phone
      AND pl.id <> p_duplicate_id
    LIMIT GREATEST(p_limit, 0);
END;
$$;

-- Lock the function down: no PUBLIC execute, only the `authenticated` PostgREST role may
-- call it (the function itself re-checks admin status on every invocation).
DO $$
BEGIN
    REVOKE ALL ON FUNCTION public.admin_find_contact_duplicate_candidates(UUID, INTEGER) FROM PUBLIC;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        GRANT EXECUTE ON FUNCTION public.admin_find_contact_duplicate_candidates(UUID, INTEGER)
            TO authenticated;
    END IF;
END
$$;

-- 4. Admin contact-reveal RPC (reroute cycle 3 / GAP-2). Batch-resolves contact_phone and
--    contact_info for a page of listing ids in one call, for the admin UI's existing broker
--    contact display. SECURITY DEFINER so it can read the two revoked columns directly; the
--    is_admin(auth.uid()) check below is the ENTIRE trust boundary and MUST remain the first
--    statement in the body — no row may be fetched or returned before it runs. See the
--    header note above for why returning this PII to an admin browser session is a security
--    improvement (DB-enforced gate replacing a client-side flag) rather than a regression:
--    it grants no capability beyond what the existing "Admins can manage all listings" RLS
--    policy (V0.1:104-106) already permits an admin session to SELECT directly.
--
--    Array-length bound: capped at 200 ids per call. Chosen to comfortably cover one admin
--    UI page/table view (which paginates well under that) in a single round trip, while
--    raising the cost of bulk exfiltration — dumping the full property_listings table would
--    require hundreds of separate round trips rather than one request.
--    Be precise about what this cap does NOT do: there is currently no rate limiter covering
--    PostgREST RPC calls (the application's documented limiters sit in front of Spring Boot
--    endpoints only), and this function writes no audit record, so a compromised or malicious
--    admin session can still harvest contact data by looping calls. The cap bounds per-call
--    blast radius; it is not a control against a determined caller who already holds admin
--    credentials. An audit log of admin contact reveals is a tracked follow-up (#2280 Gate F).
CREATE OR REPLACE FUNCTION public.admin_get_listing_contacts(
    p_listing_ids UUID[]
)
RETURNS TABLE(id UUID, contact_phone TEXT, contact_info TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'permission denied: admin_get_listing_contacts requires admin privileges';
    END IF;

    IF p_listing_ids IS NULL OR array_length(p_listing_ids, 1) IS NULL THEN
        RETURN;
    END IF;

    IF array_length(p_listing_ids, 1) > 200 THEN
        RAISE EXCEPTION 'admin_get_listing_contacts: too many ids requested (max 200 per call)';
    END IF;

    RETURN QUERY
    SELECT pl.id, pl.contact_phone, pl.contact_info
    FROM public.property_listings pl
    WHERE pl.id = ANY(p_listing_ids);
END;
$$;

-- Lock the function down identically to the duplicate-candidates function above: no PUBLIC
-- execute, only `authenticated` may call it, and the function re-checks admin status itself
-- on every invocation regardless of caller.
DO $$
BEGIN
    REVOKE ALL ON FUNCTION public.admin_get_listing_contacts(UUID[]) FROM PUBLIC;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        GRANT EXECUTE ON FUNCTION public.admin_get_listing_contacts(UUID[])
            TO authenticated;
    END IF;
END
$$;
