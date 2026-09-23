-- =============================================================================
-- V143: Retrofit default-deny RLS onto the V136 Commercial staging tables (#2680).
-- =============================================================================
-- RLS-ONLY HARDENING. This migration adds row security and two admin policies.
-- It alters no column, adds/drops/changes no CHECK constraint, touches no index,
-- and modifies no row. chk_cic_subtype and every other V136 constraint are left
-- exactly as #2575 merged them — #2680 puts that explicitly out of scope, and the
-- Commercial taxonomy is unchanged by this PR.
--
-- WHY. commercial_import_batch and commercial_import_candidate (V136, #2575) were
-- created without RLS. Neither table is queried by any Discover/API code path —
-- but that is an application-layer fact, not an authorization boundary, and it is
-- exactly the kind of fact a later feature silently invalidates.
--
-- The concrete exposure is V128's own finding, restated verbatim by #2680:
-- apps/api/src/main/resources/db/migration/V128__revoke_browser_contact_column_grants.sql
-- records that the Supabase platform bootstraps
--     GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role
-- for every table created in this schema, OUTSIDE of and INVISIBLE to this
-- migration history. Nothing in V136 asked for that grant and nothing in V136
-- could see it. With it in place and RLS off, `anon` and `authenticated` — the two
-- PostgREST roles every browser request executes as — can already read and write
-- these staging rows by name, raw_payload and source provenance included.
--
-- PRECEDENT. V141 (#2607) added precisely this hardening to its own sibling
-- Agricultural staging tables, and its header (lines 282-285) named the V136 gap
-- as a deliberately-deferred follow-up rather than folding a change to
-- already-merged #2575 schema into that PR. #2680 is that follow-up. The shape
-- below mirrors V141 statement-for-statement, which in turn mirrors the
-- "admin + no client policy" shape of V47 listing_verification_dimension, minus
-- V47's public/owner read policies — staging has no buyer-facing reason to be
-- read at all.
--
-- THE POLICY SHAPE, AND WHAT MAKES anon DENY.
--   - The Spring Boot backend writes via the service_role key / the migration
--     owner role, which bypasses RLS entirely (service_role is created BYPASSRLS
--     on real Supabase and in scripts/db/restore-test-fixture.sh's Testcontainers
--     fixture). No client-role policy is needed for the backend's own staging
--     writes, and none is added.
--   - Admin: full access, so admin tooling can still inspect staging if needed.
--   - anon / non-admin authenticated / any other role: ZERO applicable policies
--     means ZERO rows returned and every write rejected. That is Postgres's own
--     row-security default-deny, and it holds REGARDLESS of the platform's
--     table-level GRANT ALL.
--
-- WHY NO REVOKE, deliberately. V128 revoked grants because its subject was
-- COLUMN-level exposure on a table that must stay readable. Here the whole row is
-- the thing to deny, and RLS denies it with the grant still held — so a REVOKE
-- would be belt-on-belt, and would also reach beyond #2680's stated scope. That
-- this is true rather than merely hoped is the specific thing
-- CommercialStagingRls2680IT proves: it GRANTs the Supabase baseline table-wide
-- privileges to anon/authenticated FIRST and only then asserts the denial, so a
-- passing test cannot be passing because a grant happened to be absent.

ALTER TABLE public.commercial_import_batch ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_import_candidate ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all commercial_import_batch rows"
    ON public.commercial_import_batch FOR ALL
    TO authenticated
    USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can manage all commercial_import_candidate rows"
    ON public.commercial_import_candidate FOR ALL
    TO authenticated
    USING (public.is_admin(auth.uid()));
